#!/usr/bin/env node
'use strict'
// telegram.js — createTelegramAdapter(opts): the autopilot daemon's messaging seam.
// Long-polls one bot token's getUpdates, posts into one supergroup's forum topics (one topic
// per project), renders AskUserQuestion-shaped questions as inline keyboards, and routes
// button taps back to pending asks. Built per specs/20260801/01-telegram-adapter.md (D1-D9)
// because the daemon must never speak Telegram directly (BRIEF #10: thin adapter so a Slack
// adapter can share the same platform-neutral interface later).
//
// Zero dependencies: global fetch/AbortController/FormData/Blob (Node built-ins) only;
// fetchImpl is injectable so tests never touch the network (D1). All wire calls funnel
// through one api() helper (Assumption A1) so a Telegram surface drift has one fix point.
//
// Deliberately does NOT: persist the getUpdates offset (D5 — in-memory only, Telegram
// re-serves missed updates within 24h after a restart); support concurrent asks per topic
// (A2 — one pending ask per topic, lane blocks while asking); retry 429s with a bounded
// attempt cap (D6 — 429 honors retry_after and keeps retrying; only other 5xx/network
// failures are capped at 5 tries).
//
// Exit codes: n/a — this is a library module, not a CLI entry point.

const TELEGRAM_API = 'https://api.telegram.org'
const MAX_RETRIES = 5
const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 60000

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

// Splits text into <=limit-char chunks on line boundaries (D8): each cut lands right after
// the last '\n' at or before the limit so no chunk (but possibly the final one) ends mid-line.
function splitMessage(text, limit = 4096) {
  const chunks = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut <= 0) cut = limit // no line boundary within reach — last-resort hard cut
    else cut += 1 // keep the newline in the chunk it terminates
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length) chunks.push(rest)
  return chunks
}

function buildQuestionText(q) {
  const headerLine = q.header ? `${q.header}\n` : ''
  const descLines = q.options
    .filter(o => o.description)
    .map(o => `— ${o.label}: ${o.description}`)
    .join('\n')
  return `${headerLine}${q.question}${descLines ? '\n' + descLines : ''}`
}

// callback_data wire format (D3, closed alphabet): a:<promptKey>:<qIdx>:<optIdx> (answer) ·
// d:<promptKey>:<qIdx> (multiSelect Done) · o:<promptKey>:<qIdx> (Other… free-text flow).
// Single-choice questions get an Other… row; multiSelect questions get toggle rows + Done —
// multiSelect omits Other (the spec's Contracts method list has no editMessageText to render
// a "reply in this topic" prompt against a live toggle keyboard; see deviations log).
function buildKeyboard(promptKey, qIdx, q, selections) {
  const rows = q.options.map((opt, optIdx) => {
    const checked = q.multiSelect && selections && selections.has(optIdx)
    return [{ text: `${checked ? '✅ ' : ''}${opt.label}`, callback_data: `a:${promptKey}:${qIdx}:${optIdx}` }]
  })
  if (q.multiSelect) rows.push([{ text: '✔ Done', callback_data: `d:${promptKey}:${qIdx}` }])
  else rows.push([{ text: 'Other…', callback_data: `o:${promptKey}:${qIdx}` }])
  return rows
}

function parseCallbackData(data) {
  if (typeof data !== 'string') return null
  const parts = data.split(':')
  if (parts[0] === 'a' && parts.length === 4) {
    return { kind: 'a', promptKey: Number(parts[1]), qIdx: Number(parts[2]), optIdx: Number(parts[3]) }
  }
  if (parts[0] === 'd' && parts.length === 3) {
    return { kind: 'd', promptKey: Number(parts[1]), qIdx: Number(parts[2]) }
  }
  if (parts[0] === 'o' && parts.length === 3) {
    return { kind: 'o', promptKey: Number(parts[1]), qIdx: Number(parts[2]) }
  }
  return null
}

function createTelegramAdapter(opts) {
  const {
    botToken,
    supergroupId,
    topicMap,
    allowedUserIds,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
    pollTimeoutSec = 50,
  } = opts

  let offset
  let running = false
  let loopPromise = null
  let currentAbort = null
  let nextPromptKey = 1
  const pendingByProject = new Map()
  let textCb = null

  // Every Telegram wire call funnels through here (Assumption A1): 429 honors
  // parameters.retry_after and retries the identical call uncapped; other 5xx and network
  // failures use exponential backoff (base 1s, cap 60s) capped at MAX_RETRIES (D6).
  async function api(method, body, callOpts = {}) {
    const url = `${TELEGRAM_API}/bot${botToken}/${method}`
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    const init = isForm
      ? { method: 'POST', body, signal: callOpts.signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: callOpts.signal }
    let attempt = 0
    for (;;) {
      let res
      try {
        res = await fetchImpl(url, init)
      } catch (err) {
        if (err && err.name === 'AbortError') throw err
        attempt++
        if (attempt > MAX_RETRIES) {
          throw new Error(`telegram: ${method} failed after ${MAX_RETRIES} retries (network error: ${err.message}) — check bot token and network reachability`)
        }
        await delay(backoffMs(attempt))
        continue
      }
      if (res.status === 429) {
        const data = await safeJson(res)
        // ?? not || — Telegram's retry_after is a real number and 0 is a valid "retry now";
        // a || fallback would silently reshape it into a 1s wait.
        const retryAfter = data?.parameters?.retry_after ?? 1
        await delay(retryAfter * 1000)
        continue
      }
      if (res.status >= 500) {
        attempt++
        if (attempt > MAX_RETRIES) {
          throw new Error(`telegram: ${method} failed after ${MAX_RETRIES} retries (HTTP ${res.status}) — check https://core.telegram.org/ for an API outage`)
        }
        await delay(backoffMs(attempt))
        continue
      }
      const data = await safeJson(res)
      if (!res.ok || !data || data.ok === false) {
        const desc = data && data.description ? data.description : `HTTP ${res.status}`
        throw new Error(`telegram: ${method} failed (${desc}) — check botToken/supergroupId/topicMap config`)
      }
      return data
    }
  }

  function requireProject(project) {
    if (!(project in topicMap)) {
      throw new Error(`telegram: unknown project "${project}" — add it to topicMap config`)
    }
    return topicMap[project]
  }

  function projectForThread(threadId) {
    for (const [project, id] of Object.entries(topicMap)) {
      if (id === threadId) return project
    }
    return null
  }

  async function send(project, text) {
    const threadId = requireProject(project)
    const chunks = splitMessage(text)
    const messageIds = []
    for (const chunk of chunks) {
      const data = await api('sendMessage', { chat_id: supergroupId, message_thread_id: threadId, text: chunk })
      messageIds.push(data.result && data.result.message_id)
    }
    return { messageIds }
  }

  async function sendPhoto(project, { buffer, filename, caption }) {
    const threadId = requireProject(project)
    const form = new FormData()
    form.append('chat_id', String(supergroupId))
    form.append('message_thread_id', String(threadId))
    if (caption) form.append('caption', caption)
    form.append('photo', new Blob([buffer]), filename)
    const data = await api('sendPhoto', form)
    return { messageId: data.result && data.result.message_id }
  }

  async function askButtons(project, ask) {
    const threadId = requireProject(project)
    const promptKey = nextPromptKey++
    const state = {
      promptKey,
      questions: ask.questions,
      answers: {},
      answeredQIdx: new Set(),
      selections: {},
      messageIds: {},
      otherAwaitQIdx: null,
      resolve: null,
      reject: null,
    }
    const promise = new Promise((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
    pendingByProject.set(project, state)
    for (let qIdx = 0; qIdx < ask.questions.length; qIdx++) {
      const q = ask.questions[qIdx]
      const data = await api('sendMessage', {
        chat_id: supergroupId,
        message_thread_id: threadId,
        text: buildQuestionText(q),
        reply_markup: { inline_keyboard: buildKeyboard(promptKey, qIdx, q) },
      })
      state.messageIds[qIdx] = data.result && data.result.message_id
    }
    return promise
  }

  // Resolves one question of a pending ask; idempotent (a replayed update after a crash is a
  // no-op) and resolves the whole ask's promise once every question has an answer.
  function completeQuestion(project, state, qIdx, value) {
    if (state.answeredQIdx.has(qIdx)) return
    const q = state.questions[qIdx]
    state.answers[q.question] = value
    state.answeredQIdx.add(qIdx)
    if (state.answeredQIdx.size === state.questions.length) {
      pendingByProject.delete(project)
      state.resolve({ answers: state.answers })
    }
  }

  function pendingAsk(project) {
    return pendingByProject.has(project)
  }

  function cancelAsk(project) {
    const state = pendingByProject.get(project)
    if (!state) return
    pendingByProject.delete(project)
    state.reject(new Error(`telegram: ask cancelled for project "${project}"`))
    for (const qIdx of Object.keys(state.messageIds)) {
      const messageId = state.messageIds[qIdx]
      if (!messageId) continue
      api('editMessageReplyMarkup', { chat_id: supergroupId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
        .catch(err => console.error('telegram: failed to clear keyboard on cancelAsk', err.message))
    }
  }

  function onText(cb) {
    textCb = cb
  }

  async function handleCallbackQuery(cq) {
    const userId = cq.from && cq.from.id
    if (!allowedUserIds.includes(userId)) {
      console.error('telegram: ignoring callback_query from disallowed user', userId) // D4
      return
    }
    await api('answerCallbackQuery', { callback_query_id: cq.id })
    const parsed = parseCallbackData(cq.data)
    if (!parsed) return
    const threadId = cq.message && cq.message.message_thread_id
    const project = projectForThread(threadId)
    if (!project) return
    const state = pendingByProject.get(project)
    if (!state || state.promptKey !== parsed.promptKey) return // cancelled/unknown/stale — already answered above
    const q = state.questions[parsed.qIdx]
    if (!q) return

    if (parsed.kind === 'a') {
      if (q.multiSelect) {
        const sel = state.selections[parsed.qIdx] || (state.selections[parsed.qIdx] = new Set())
        if (sel.has(parsed.optIdx)) sel.delete(parsed.optIdx)
        else sel.add(parsed.optIdx)
        const messageId = state.messageIds[parsed.qIdx]
        await api('editMessageReplyMarkup', {
          chat_id: supergroupId,
          message_id: messageId,
          reply_markup: { inline_keyboard: buildKeyboard(parsed.promptKey, parsed.qIdx, q, sel) },
        })
      } else {
        const opt = q.options[parsed.optIdx]
        completeQuestion(project, state, parsed.qIdx, opt && opt.label)
      }
    } else if (parsed.kind === 'd') {
      const sel = state.selections[parsed.qIdx] || new Set()
      const labels = q.options.filter((_, i) => sel.has(i)).map(o => o.label)
      completeQuestion(project, state, parsed.qIdx, labels)
    } else if (parsed.kind === 'o') {
      state.otherAwaitQIdx = parsed.qIdx
      const messageId = state.messageIds[parsed.qIdx]
      await api('editMessageReplyMarkup', { chat_id: supergroupId, message_id: messageId, reply_markup: { inline_keyboard: [] } })
    }
  }

  async function handleMessage(msg) {
    const userId = msg.from && msg.from.id
    if (!allowedUserIds.includes(userId)) {
      console.error('telegram: ignoring message from disallowed user', userId) // D4
      return
    }
    const project = projectForThread(msg.message_thread_id)
    if (!project) return
    const state = pendingByProject.get(project)
    if (state && state.otherAwaitQIdx !== null) {
      const qIdx = state.otherAwaitQIdx
      state.otherAwaitQIdx = null
      completeQuestion(project, state, qIdx, msg.text)
      return
    }
    if (textCb) {
      try {
        textCb({ project, text: msg.text, userId })
      } catch (err) {
        console.error('telegram: onText callback threw, continuing poll loop', err.message)
      }
    }
  }

  // Serial getUpdates long-poll (D5): each batch advances offset to max update_id+1 before
  // processing, so a crash mid-batch re-serves rather than reprocesses. Network/5xx failures
  // are swallowed here (api() already applied D6's backoff) so the loop never exits except
  // via stop() — a throwing handler is caught per-update so one bad callback can't stall it.
  async function pollLoop() {
    while (running) {
      currentAbort = new AbortController()
      let data
      try {
        data = await api(
          'getUpdates',
          { offset, timeout: pollTimeoutSec, allowed_updates: ['message', 'callback_query'] },
          { signal: currentAbort.signal }
        )
      } catch (err) {
        currentAbort = null
        if (err && err.name === 'AbortError') break
        console.error('telegram: getUpdates failed, continuing poll loop', err.message)
        continue
      }
      currentAbort = null
      if (!running) break
      const updates = (data && data.result) || []
      if (updates.length) {
        offset = Math.max(...updates.map(u => u.update_id)) + 1
      }
      for (const u of updates) {
        if (!running) break
        try {
          if (u.callback_query) await handleCallbackQuery(u.callback_query)
          else if (u.message) await handleMessage(u.message)
        } catch (err) {
          console.error('telegram: update handler threw, continuing poll loop', err.message)
        }
      }
      // Real getUpdates blocks server-side up to pollTimeoutSec; a mocked transport that
      // resolves instantly has no such pacing and would otherwise starve the event loop's
      // macrotask queue (microtask-only recursion never yields to timers/IO) — this explicit
      // yield keeps the loop cooperative regardless of how fast the transport answers.
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  function start() {
    if (running) return
    running = true
    loopPromise = pollLoop()
  }

  async function stop() {
    running = false
    if (currentAbort) currentAbort.abort()
    if (loopPromise) await loopPromise
    loopPromise = null
  }

  return { start, stop, send, sendPhoto, askButtons, onText, pendingAsk, cancelAsk }
}

module.exports = { createTelegramAdapter }
