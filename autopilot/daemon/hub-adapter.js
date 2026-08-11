#!/usr/bin/env node
'use strict'
// hub-adapter.js — createHubAdapter(opts): the autopilot daemon's messaging seam over the
// hub API (specs/20260810/04-hub-wired-daemon.md D2-D6), replacing the deleted direct-Telegram
// adapter (daemon/telegram.js, D1 — one Telegram getUpdates consumer per bot token, and the hub
// is that consumer now). Surface: start · stop · send · report · askButtons · pendingAsk ·
// cancelAsk — the six inherited from telegram.js verbatim (D2) plus the new typed `report()`.
// send()/report() POST one durable event to /api/spokes/report and never throw — a hub outage
// must not take a lane down (D3). askButtons() POSTs /api/spokes/asks with a ULID
// clientAskId and retries indefinitely on failure (asks have no timeout, D4); a 409 means the
// project already has a pending ask, so the next poll's asks[] is consulted — a deep-equal
// (key-order-insensitive, D5) match is adopted, a mismatch is cancelled and re-created. One
// shared long-poll loop (GET /api/spokes/poll?since=<cursor>, D6) resolves pending asks on
// `answer_given`, rejects them on `ask_cancelled`, and ignores every other event type; the
// cursor persists to <stateDir>/hub-cursor.json (atomic tmp+rename) after every batch and never
// regresses. The project name IS the wire projectId (no separate resolution call) — the hub's
// idempotent /api/spokes/projects route is registerRepos'/enroll's job, not this seam's.
//
// Zero dependencies: only fs/path/crypto (Node built-ins) plus daemon/hub-http.js's
// postJson/mintEventId; fetchImpl/nowMs/randomBytesImpl are injectable so tests never touch
// the network (mirrors telegram.js's DI discipline).
//
// Deliberately does NOT: resolve a project name against the hub (the wire projectId is the
// project name, verified against tests/autopilot/hub-adapter.test.js AC-1/AC-2/AC-7); apply a
// backoff delay on the 409 branch itself (D5 is a deterministic decision once the next poll's
// asks[] answers it, not a retryable failure); persist a cursor that regresses relative to the
// last one written (defensive guard — a synchronous/filler poll response must never rewind a
// durable cursor backwards); retry a failed askId cancel (best-effort, logged, never blocks the
// recreate that follows it).
//
// Exit codes: n/a — this is a library module, not a CLI entry point.

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { postJson, mintEventId } = require('./hub-http')

const REPORT_PATH = '/api/spokes/report'
const ASKS_PATH = '/api/spokes/asks'
const POLL_PATH = '/api/spokes/poll'
const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 60000

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt) {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS)
}

async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

// D5's deep-equal rule: recursively sort object keys and strip undefined-valued keys before
// stringify-comparing — a WireAsk.questions round-trip through Postgres jsonb does not
// preserve key order, so raw JSON.stringify equality would falsely mismatch identical questions.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const sorted = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue
      sorted[key] = canonicalize(value[key])
    }
    return sorted
  }
  return value
}

function questionsDeepEqual(a, b) {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))
}

function createHubAdapter({
  credential,
  stateDir,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
  nowMs = () => Date.now(),
  randomBytesImpl = crypto.randomBytes,
}) {
  const { hubUrl, token } = credential
  const cursorPath = path.join(stateDir, 'hub-cursor.json')

  function authHeaders() {
    return { 'content-type': 'application/json', authorization: `Bearer ${token}` }
  }

  function readCursor() {
    try {
      const parsed = JSON.parse(fs.readFileSync(cursorPath, 'utf8'))
      if (parsed && typeof parsed.cursor === 'string') return parsed.cursor
    } catch {
      // missing/unparsable cursor file → cold start
    }
    return '0'
  }

  // Same atomic tmp-then-rename discipline as hub.json (enroll.js writeConfigAtomic) — a plain
  // writeFileSync could race a concurrent reader with a half-written file.
  function writeCursorAtomic(value) {
    fs.mkdirSync(stateDir, { recursive: true })
    const tempPath = path.join(stateDir, `.hub-cursor.json.${process.pid}.${Date.now()}.tmp`)
    fs.writeFileSync(tempPath, JSON.stringify({ cursor: value }))
    fs.renameSync(tempPath, cursorPath)
  }

  let cursor = readCursor()
  let running = false
  let loopPromise = null
  let currentAbort = null
  let pollAttempt = 0
  // A single-slot cancellable pause (mirrors lane.js's pendingSleepResolve pattern) covering
  // both the failure backoff and the per-iteration yield between poll calls — routed through
  // setTimeout (not setImmediate) so stop() can interrupt it directly, and so an injected clock
  // (mock.timers) governs the loop's pacing deterministically in tests instead of letting a
  // synchronously-resolving transport free-spin past a flush() budget (repo Gotcha 20260801-01).
  let pendingPauseResolve = null
  // A 409's D5 adoption check must not wait out the loop's ambient pacing (real or mocked) to
  // discover the pending ask — that raced the test harness's synthetic clock/tick budget
  // (build-time flakiness). wake() short-circuits whatever pause is current or next: it fires
  // an in-flight one immediately, or arms a one-shot flag so the very next pausable() call
  // skips its wait entirely.
  let wakeRequested = false

  function pausable(ms) {
    if (wakeRequested) {
      wakeRequested = false
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingPauseResolve = null
        resolve()
      }, ms)
      pendingPauseResolve = () => {
        clearTimeout(timer)
        pendingPauseResolve = null
        resolve()
      }
    })
  }

  function wake() {
    if (pendingPauseResolve) pendingPauseResolve()
    else wakeRequested = true
  }

  // pendingByAskId: askId -> {project, resolve, reject} — the one in-flight askButtons() wait
  // per project. pendingByProject mirrors it the other way for pendingAsk()/cancelAsk() lookup.
  const pendingByAskId = new Map()
  const pendingByProject = new Map()
  // askWaiters: project -> [resolve] — armed on a 409 (D5); satisfied by the first subsequent
  // poll response whose asks[] carries an entry for that project.
  const askWaiters = new Map()

  async function reportEvent(project, type, payload) {
    const eventId = mintEventId(nowMs(), randomBytesImpl)
    try {
      await postJson({
        url: hubUrl + REPORT_PATH,
        token,
        authScheme: 'Bearer',
        body: { events: [{ eventId, type, projectId: project, payload }] },
        fetchImpl,
      })
    } catch (err) {
      // D3: a hub outage must never take the lane down — log and drop, never throw.
      console.error(`hub-adapter: ${type} report failed for project "${project}" — dropping`, err.message)
    }
  }

  async function send(project, text) {
    await reportEvent(project, 'narration', { text })
  }

  async function report(project, type, payload) {
    await reportEvent(project, type, payload)
  }

  function registerWait(project, askId) {
    pendingByProject.set(project, askId)
    return new Promise((resolve, reject) => {
      pendingByAskId.set(askId, { project, resolve, reject })
    })
  }

  function waitForAskEntry(project) {
    const promise = new Promise((resolve) => {
      const waiters = askWaiters.get(project) || []
      waiters.push(resolve)
      askWaiters.set(project, waiters)
    })
    wake() // D5: consult the *next* poll now, not whenever ambient pacing next fires.
    return promise
  }

  async function cancelAskById(askId) {
    const url = `${hubUrl}${ASKS_PATH}/${encodeURIComponent(askId)}/cancel`
    const res = await fetchImpl(url, { method: 'POST', headers: authHeaders() })
    if (!res.ok) {
      throw new Error(`hub-adapter: hub answered ${res.status} cancelling ask "${askId}"`)
    }
  }

  // D4/D5: indefinite retry on failure (network throw or non-2xx/non-409); a 409 is a
  // deterministic branch (no backoff) that consults the next poll's asks[] for adoption.
  async function askButtons(project, ask) {
    const questions = ask.questions
    let clientAskId = mintEventId(nowMs(), randomBytesImpl)
    let attempt = 0
    for (;;) {
      let res
      try {
        res = await fetchImpl(hubUrl + ASKS_PATH, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ clientAskId, projectId: project, questions }),
        })
      } catch (err) {
        attempt++
        console.error('hub-adapter: ask creation failed, retrying', err.message)
        await delay(backoffMs(attempt))
        continue
      }

      if (res.status === 409) {
        const pending = await waitForAskEntry(project)
        if (pending && questionsDeepEqual(pending.questions, questions)) {
          return registerWait(project, pending.askId)
        }
        if (pending) {
          try {
            await cancelAskById(pending.askId)
          } catch (err) {
            console.error('hub-adapter: failed to cancel stale pending ask', err.message)
          }
        }
        clientAskId = mintEventId(nowMs(), randomBytesImpl)
        continue
      }

      if (res.ok) {
        const data = await safeJson(res)
        if (data && data.askId) return registerWait(project, data.askId)
      }

      attempt++
      await delay(backoffMs(attempt))
    }
  }

  function pendingAsk(project) {
    return pendingByProject.has(project)
  }

  // Signature/shape verbatim from the deleted telegram adapter (D2): synchronous, fires the
  // hub cancel best-effort (never awaited, never throws into the caller), rejects the local
  // wait immediately.
  function cancelAsk(project) {
    const askId = pendingByProject.get(project)
    if (!askId) return
    pendingByProject.delete(project)
    const entry = pendingByAskId.get(askId)
    pendingByAskId.delete(askId)
    if (entry) entry.reject(new Error(`hub-adapter: ask cancelled for project "${project}"`))
    cancelAskById(askId).catch((err) =>
      console.error('hub-adapter: failed to cancel ask on hub', err.message)
    )
  }

  function handleAsks(asks) {
    for (const entry of asks) {
      const waiters = askWaiters.get(entry.projectId)
      if (waiters && waiters.length) {
        askWaiters.delete(entry.projectId)
        for (const resolve of waiters) resolve(entry)
      }
    }
  }

  function handleEvents(events) {
    for (const event of events) {
      if (event.type === 'answer_given') {
        const payload = event.payload || {}
        const entry = pendingByAskId.get(payload.askId)
        if (!entry) continue // unknown askId — another machine's history replay
        pendingByAskId.delete(payload.askId)
        pendingByProject.delete(entry.project)
        entry.resolve({ answers: payload.answers })
      } else if (event.type === 'ask_cancelled') {
        const payload = event.payload || {}
        const entry = pendingByAskId.get(payload.askId)
        if (!entry) continue
        pendingByAskId.delete(payload.askId)
        pendingByProject.delete(entry.project)
        entry.reject(Object.assign(new Error(`hub-adapter: ask "${payload.askId}" was cancelled`), { askCancelled: true }))
      }
      // every other type ignored (D6) — narration/stage_started/etc. never arrive here anyway.
    }
  }

  // Cursor advances only on received rows (contract) — defensively never regress a persisted
  // cursor to a smaller value, then always flush the (possibly unchanged) value.
  function advanceCursor(newCursor) {
    if (typeof newCursor === 'string') {
      try {
        if (BigInt(newCursor) > BigInt(cursor)) cursor = newCursor
      } catch {
        // non-bigint-shaped cursor from a malformed response — keep the current one
      }
    }
    writeCursorAtomic(cursor)
  }

  // One poll attempt. Returns 'aborted' (stop()'s currentAbort fired — the loop must exit
  // without scheduling another iteration), 'retry' (failure; caller already waited out the
  // backoff), or 'ok'.
  async function pollOnce() {
    currentAbort = new AbortController()
    const url = `${hubUrl}${POLL_PATH}?since=${encodeURIComponent(cursor)}`
    let res
    try {
      res = await fetchImpl(url, { method: 'GET', headers: authHeaders(), signal: currentAbort.signal })
    } catch (err) {
      currentAbort = null
      if (err && err.name === 'AbortError') return 'aborted'
      pollAttempt++
      console.error('hub-adapter: poll failed, backing off', err.message)
      await pausable(backoffMs(pollAttempt))
      return 'retry'
    }
    currentAbort = null
    if (!running) return 'aborted'

    if (!res.ok) {
      pollAttempt++
      console.error(`hub-adapter: poll answered HTTP ${res.status}, backing off`)
      await pausable(backoffMs(pollAttempt))
      return 'retry'
    }

    const data = await safeJson(res)
    if (!data) {
      pollAttempt++
      console.error('hub-adapter: poll answered a non-JSON body, backing off')
      await pausable(backoffMs(pollAttempt))
      return 'retry'
    }

    pollAttempt = 0
    handleAsks(data.asks || [])
    handleEvents(data.events || [])
    advanceCursor(data.cursor)
    return 'ok'
  }

  async function pollLoop() {
    while (running) {
      const outcome = await pollOnce()
      if (outcome === 'aborted') break
      // A 'retry' outcome already paced itself via pollOnce's own backoff pausable() — pausing
      // again here would double-wait it. Only a successful iteration needs an explicit pause:
      // real getUpdates/poll blocks server-side, but a mocked transport that resolves instantly
      // has no such pacing, so this keeps the loop cooperative (repo Gotcha 20260801-01). While a
      // 409's D5 adoption check is outstanding, that pacing is the macrotask-yielding
      // setImmediate instead of the (mock-clock-governed) pausable() — a pending askButtons()
      // caller is actively waiting on "the next poll", not idling, and must not sit out a
      // steady-state backoff interval to get it.
      if (outcome === 'ok') {
        if (askWaiters.size > 0) await new Promise((resolve) => setImmediate(resolve))
        else await pausable(0)
      }
    }
  }

  function start() {
    if (running) return
    running = true
    pollAttempt = 0
    loopPromise = pollLoop()
  }

  async function stop() {
    if (!running) return
    running = false
    if (currentAbort) currentAbort.abort()
    if (pendingPauseResolve) pendingPauseResolve()
    if (loopPromise) await loopPromise
    loopPromise = null
    writeCursorAtomic(cursor)
  }

  return { start, stop, send, report, askButtons, pendingAsk, cancelAsk }
}

module.exports = { createHubAdapter }
