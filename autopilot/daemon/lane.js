#!/usr/bin/env node
'use strict'
// lane.js — createLane(opts): the autopilot daemon's per-project state machine
// (specs/20260801/03-lane-engine.md D1-D12). One lane drives one repo through the spec
// pipeline forever: poll the oracle (spec-status.js --next --json, injected — D2, the lane
// never re-derives routing), checkpoint a new brief's dev-server + tunnel before the first
// stage runs (D4), run one stage via the injected session runner, relay AskUserQuestion and
// permission prompts through the injected Telegram-shaped adapter (D9, D11), and apply the
// halt ladder (one Fable repair, then park-and-ask, D5) and exponential backoff (D6) on
// failure. Every external contract — adapter, runStage, oracle — is injected so this module
// is the only thing under test (Rationale: "the engine is deliberately a thin consumer of
// three contracts it does not own").
//
// Deliberately does NOT: re-derive what to run next (the oracle's first admissible entry is
// authoritative, D2), persist the halt skip set (memory-only, cleared by a restart, D5), auto
// -advance past a halted lane (D5), or push any git ref (the session itself, per D10, owns
// review's local merge-back).
//
// Poll cadence: a stage completion (done, or done-after-repair) and a stable idle result are
// each followed by one `pollSeconds` sleep before the oracle is re-polled. That gate is also
// what keeps a fake oracle/session that resolves synchronously from tight-looping (the repo's
// injected-transport Gotcha). ONE path bypasses it: answering "➡ Next spec" on a halt ask
// (D5) means the operator explicitly asked the lane to move on, so the lane then chains
// completions back-to-back until it settles into idle, without waiting out a stale interval
// (AC-12). A brief checkpoint's "▶ Start" deliberately does NOT arm that chain — Start
// releases the stage it is gating, and the ordinary cadence resumes when that stage finishes
// (AC-2: exactly one runStage call per Start).
//
// Exit codes: n/a — library module, not a CLI entry point.

const fs = require('fs')
const path = require('path')
const { startSurfaces, screenshotIfConfigured } = require('./checkpoint')

const BACKOFF_BASE_MS = 30000
const BACKOFF_CAP_MS = 900000
const DEFAULT_POLL_SECONDS = 300

function backoffMs(attempt) {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS)
}

// The "Next spec" wake chain (above) still has to yield to the macrotask queue once per cycle,
// or a fake oracle/session that resolves synchronously turns the chain into pure microtask
// recursion that never lets anything else run (OOMs the process instead of failing cleanly).
function yieldTick() {
  return new Promise((resolve) => setImmediate(resolve))
}

function stateFilePath(stateDir, project) {
  return path.join(stateDir, `${project}.json`)
}

// Advisory restore (D7): only lastBrief is trusted across a restart — everything else
// (skip set, in-flight anything) re-derives from scratch, by design.
function readLastBrief(stateDir, project) {
  try {
    const raw = fs.readFileSync(stateFilePath(stateDir, project), 'utf8')
    const data = JSON.parse(raw)
    return data.brief || null
  } catch {
    return null
  }
}

function persistState(stateDir, project, state, pick, lastBrief) {
  fs.writeFileSync(stateFilePath(stateDir, project), JSON.stringify({
    state,
    spec: pick ? pick.path : null,
    stage: pick ? pick.action : null,
    brief: lastBrief,
    updatedAt: new Date().toISOString(),
  }))
}

function createLane({ cfg, adapter, runStage, oracle, stateDir, log }) {
  const logFn = log || (() => {})
  const pollMs = (cfg.pollSeconds || DEFAULT_POLL_SECONDS) * 1000

  let currentState = 'idle'
  let lastBrief = readLastBrief(stateDir, cfg.project)
  let lastPick = null
  const skipSet = new Set()
  let stopped = false
  let loopPromise = null
  let currentAbortController = null
  let askPending = false
  let cancelPendingAsk = null
  let lastIdleHash = null
  let activeSurfaces = null
  let oracleBackoffAttempt = 0
  let stageBackoffAttempt = 0
  // Armed only by a resolved "➡ Next spec" halt ask (D5): completions chain without the
  // pollSeconds gate until the lane settles back into idle.
  let fastPoll = false
  // A single-slot cancellable sleep (mirrors telegram.js's currentAbort pattern) so stop()
  // never has to wait out a real pollSeconds/backoff timer.
  let pendingSleepResolve = null

  function setState(next) {
    currentState = next
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingSleepResolve = null
        resolve()
      }, ms)
      pendingSleepResolve = () => {
        clearTimeout(timer)
        pendingSleepResolve = null
        resolve()
      }
    })
  }

  async function narrate(text) {
    await adapter.send(cfg.project, text)
  }

  // A pending ask (checkpoint/halt/question/permission) has nothing to unblock it if the
  // operator never answers — cancelPendingAsk lets stop() reject it directly instead of
  // hanging forever on a promise only a human tap would otherwise resolve.
  async function askButtonsTracked(ask) {
    askPending = true
    return new Promise((resolve, reject) => {
      cancelPendingAsk = (err) => reject(err)
      adapter.askButtons(cfg.project, ask).then(
        (value) => { askPending = false; cancelPendingAsk = null; resolve(value) },
        (err) => { askPending = false; cancelPendingAsk = null; reject(err) }
      )
    })
  }

  async function askSingle(questionText, labels, header) {
    const question = { question: questionText, options: labels.map((label) => ({ label })) }
    if (header) question.header = header
    const result = await askButtonsTracked({ questions: [question] })
    return result.answers[questionText]
  }

  // D4: dev-server + tunnel up, one ask with Start/Hold; Hold re-posts the same ask (the
  // buttons "stay live") rather than starting the stage.
  async function runCheckpoint(pick) {
    setState('checkpoint')
    if (activeSurfaces) {
      await activeSurfaces.stopAll()
      activeSurfaces = null
    }
    const surfaces = await startSurfaces({
      devServerCommand: cfg.devServerCommand,
      tunnelCommand: cfg.tunnelCommand,
      cwd: cfg.root,
      log: logFn,
    })
    activeSurfaces = surfaces
    if (cfg.screenshotCommand && surfaces.tunnelUrl) {
      await screenshotIfConfigured({
        screenshotCommand: cfg.screenshotCommand,
        url: surfaces.tunnelUrl,
        project: cfg.project,
        adapter,
        cwd: cfg.root,
        log: logFn,
      })
    }
    const urlText = surfaces.tunnelUrl ? ` ${surfaces.tunnelUrl}` : ' (no tunnel URL captured)'
    const questionText = `🟡 Brief ${pick.brief} next — start?${urlText}`
    for (;;) {
      const answer = await askSingle(questionText, ['▶ Start', '⏸ Hold'])
      if (/Start/.test(answer)) return
    }
  }

  // D5: one repair pass already ran before this is called. Stay parked re-posts the same ask
  // (the lane never auto-advances); Next spec adds the pick to the memory-only skip set.
  async function runHalt(pick, detail) {
    setState('halted')
    const questionText = `🚫 ${cfg.project} halted on ${pick.path}: ${detail}`
    for (;;) {
      const answer = await askSingle(questionText, ['➡ Next spec', '⏸ Stay parked'])
      if (/Next spec/.test(answer)) {
        skipSet.add(pick.path)
        return
      }
    }
  }

  // D3/D4's canUseTool relay, seen from this side: AskUserQuestion becomes an askButtons call
  // narrated with the ⚠️ asking marker; the resolved answers map is returned verbatim so
  // session.js's canUseTool can rebuild the SDK's expected shape untouched.
  async function onQuestion(questions) {
    const previousState = currentState
    setState('asking')
    await narrate(`⚠️ ${cfg.project} needs you — 30-sec decision`)
    const result = await askButtonsTracked({ questions })
    setState(previousState === 'asking' ? 'running' : previousState)
    return result.answers
  }

  // D11: every other tool goes through the same relay, 2 options, header "Permission" — the
  // daemon special-cases nothing between a question fork and a permission prompt.
  async function onPermission(req) {
    const previousState = currentState
    setState('asking')
    const questionText = req.title || req.toolName
    const answer = await askSingle(questionText, ['Allow', 'Deny'], 'Permission')
    setState(previousState === 'asking' ? 'running' : previousState)
    return { allow: answer === 'Allow' }
  }

  async function runStageFor(pick, { model, promptSuffix } = {}) {
    // D9: one topic message per stage transition, including a repair pass (also a
    // transition) — start, done, halt/idle. Same text regardless of promptSuffix/model.
    await narrate(`▶ ${pick.action} ${pick.path}`)
    setState('running')
    currentAbortController = new AbortController()
    const prompt = promptSuffix ? `${pick.action} ${pick.path} ${promptSuffix}` : `${pick.action} ${pick.path}`
    const opts = {
      repoRoot: cfg.root,
      prompt,
      pluginPaths: cfg.pluginPaths || [],
      onQuestion,
      onPermission,
      signal: currentAbortController.signal,
    }
    if (model) opts.model = model
    const result = await runStage(opts)
    currentAbortController = null
    return result
  }

  function pickFrom(list) {
    return list.find((entry) => entry.blockers.length === 0 && !skipSet.has(entry.path))
  }

  // D4 / Behavior § "Checkpoint detail": fires when the pick's brief differs from the lane's
  // last-completed brief, OR (brief is "n/a"/absent — not comparable on its own) the pick's
  // path prefix differs from the previous pick's, OR the pick's path is a roadmap brief
  // (`/spec:plan @docs/roadmap/…`, optional leading "@" tolerated).
  function pathPrefix(p) {
    return p ? path.dirname(p) : p
  }
  function isRoadmapBriefPath(p) {
    return /^@?docs\/roadmap\//.test(p || '')
  }
  function needsCheckpoint(pick, previousPick) {
    if (isRoadmapBriefPath(pick.path)) return true
    if (pick.brief && pick.brief !== 'n/a') return pick.brief !== lastBrief
    return !previousPick || pathPrefix(previousPick.path) !== pathPrefix(pick.path)
  }

  async function mainLoop() {
    while (!stopped) {
      let nextResult
      try {
        nextResult = await oracle()
        oracleBackoffAttempt = 0
      } catch (err) {
        const firstFailure = oracleBackoffAttempt === 0
        oracleBackoffAttempt++
        setState('backoff')
        if (firstFailure) {
          await narrate(`🚫 oracle failed: ${err && err.message ? err.message : String(err)}`)
        }
        await sleep(backoffMs(oracleBackoffAttempt))
        continue
      }
      if (stopped) break

      const list = nextResult.next || []
      const pick = pickFrom(list)

      if (!pick) {
        setState('idle')
        fastPoll = false
        const hash = JSON.stringify(list) + '|' + (nextResult.note || '')
        if (hash !== lastIdleHash) {
          lastIdleHash = hash
          const noticeText = nextResult.note ? `💤 ${nextResult.note}` : '💤 idle — all admissible specs parked'
          await narrate(noticeText)
        }
        await sleep(pollMs)
        continue
      }

      lastIdleHash = null
      const previousPick = lastPick
      lastPick = pick

      if (needsCheckpoint(pick, previousPick)) {
        await runCheckpoint(pick)
      }
      if (stopped) break

      const result = await runStageFor(pick, { model: pick.action === '/spec:plan' ? 'fable' : undefined })

      if (result.outcome === 'aborted') return

      if (result.outcome === 'retryable') {
        stageBackoffAttempt++
        setState('backoff')
        await sleep(backoffMs(stageBackoffAttempt))
        continue
      }

      stageBackoffAttempt = 0

      if (result.outcome === 'done') {
        lastBrief = pick.brief
        await narrate(`✅ ${(result.resultText || '').split('\n')[0]} 💰 $${(result.costUsd || 0).toFixed(2)}`)
        if (fastPoll) await yieldTick()
        else await sleep(pollMs)
        continue
      }

      // failed: one Fable repair pass, then park-and-ask (D5) — never call runStage again
      // unanswered.
      const repair = await runStageFor(pick, { model: 'fable', promptSuffix: `— repair: ${result.detail}` })
      if (repair.outcome === 'aborted') return
      if (repair.outcome === 'done') {
        lastBrief = pick.brief
        await narrate(`✅ ${(repair.resultText || '').split('\n')[0]} 💰 $${(repair.costUsd || 0).toFixed(2)}`)
        if (fastPoll) await yieldTick()
        else await sleep(pollMs)
        continue
      }
      // runHalt returns only when the operator chose "➡ Next spec" ("⏸ Stay parked" re-posts
      // the ask forever), so reaching here always means "move on" — arm the wake chain.
      await runHalt(pick, repair.detail || result.detail)
      fastPoll = true
    }
  }

  function start() {
    if (loopPromise) return
    loopPromise = mainLoop()
  }

  async function stop() {
    stopped = true
    if (pendingSleepResolve) pendingSleepResolve()
    if (currentAbortController) currentAbortController.abort()
    if (askPending) {
      await adapter.cancelAsk(cfg.project)
      if (cancelPendingAsk) cancelPendingAsk(new Error(`lane stopped for project "${cfg.project}"`))
    }
    if (loopPromise) await loopPromise.catch(() => {})
    if (activeSurfaces) {
      await activeSurfaces.stopAll()
      activeSurfaces = null
    }
    persistState(stateDir, cfg.project, currentState, lastPick, lastBrief)
  }

  function state() {
    return currentState
  }

  return { start, stop, state }
}

module.exports = { createLane }
