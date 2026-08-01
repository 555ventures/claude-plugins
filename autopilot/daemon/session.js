#!/usr/bin/env node
'use strict'
// session.js — runStage(opts): the daemon's stage executor (specs/20260801/02-session-runner.md).
// Spawns one fresh Claude Agent SDK session per pipeline stage in streaming-input mode (D8),
// relays AskUserQuestion/permission prompts through canUseTool to caller-supplied handlers
// (D3, D4), applies the acceptEdits + full settingSources contract so the host's own hooks and
// allowlists stay live (D5), and classifies the outcome into exactly the three branches the
// lane engine needs plus "aborted" (D7). `queryImpl` defaults to a lazy require of ./sdk.js
// (D2) so this module never touches the real SDK — or `autopilot/node_modules` — until a real
// session actually runs; every test injects a fake.
//
// Deliberately does NOT: parse the session transcript for stage-level truth (the caller
// re-derives that via spec-status.js, v6.20.0 rule), retry non-model-unavailable/non-retryable
// failures (that policy lives one layer up, in the lane engine), or ever resolve canUseTool to
// null on any path (D4 — a null result blocks the SDK's tool forever).
//
// Exit codes: n/a — library module, not a CLI entry point.

// Joins a multiSelect answer array into the single comma-joined string the SDK's
// AskUserQuestionOutput.answers type requires (D3); `[]` joins to `""`. Non-array answers pass
// through as strings verbatim.
function joinAnswer(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  return String(value)
}

// Rebuilds the answers map keyed by question text (D3) — never trusts the handler to have
// used the exact same key shape the SDK expects, only that it answered by question text.
function buildAnswers(questions, rawAnswers) {
  const answers = {}
  for (const q of questions) {
    answers[q.question] = joinAnswer(rawAnswers ? rawAnswers[q.question] : undefined)
  }
  return answers
}

// The canUseTool relay (D3, D4): AskUserQuestion goes to onQuestion and returns the answers
// verbatim under updatedInput; every other tool goes to onPermission and allows/denies. A
// throwing handler denies with the error text (fail closed) — canUseTool never returns null.
function makeCanUseTool({ onQuestion, onPermission }) {
  return async function canUseTool(toolName, input, extra) {
    try {
      if (toolName === 'AskUserQuestion') {
        const rawAnswers = await onQuestion(input.questions)
        const answers = buildAnswers(input.questions, rawAnswers)
        return { behavior: 'allow', updatedInput: { questions: input.questions, answers } }
      }
      const decision = await onPermission({
        toolName,
        input,
        title: extra && extra.title,
        description: extra && extra.description,
      })
      if (decision && decision.allow) {
        const result = { behavior: 'allow' }
        // Not exercised by any AC as of 2026-08-01 — Contracts types onPermission's return as
        // {allow, message?} only; this additive "always" field is a conservative extension so
        // a caller-side "always allow" handler has somewhere to land updatedPermissions.
        if (decision.always && extra && extra.suggestions) {
          result.updatedPermissions = extra.suggestions
        }
        return result
      }
      return { behavior: 'deny', message: decision && decision.message }
    } catch (err) {
      return { behavior: 'deny', message: err && err.message ? err.message : String(err) }
    }
  }
}

// D7's three thrown-error/result branches. A thrown 429/overload/rate-limit means the SDK's
// own internal retry layer (api_retry) is already exhausted — daemon backoff is the second
// layer, never a duplicate of the first.
function isRetryableError(message) {
  return /529|overloaded|rate limit/i.test(String(message || ''))
}

// Model-unavailable detection (D9) — the exact SDK error shape isn't locked by the Contracts
// section (see specs/20260801/02-session-runner.deviations.md); this heuristic matches the
// fixture-shaped "model ... not available/unavailable/not found/unsupported" family.
function isModelUnavailableError(message) {
  const text = String(message || '')
  return /model/i.test(text) && /(not available|unavailable|not found|unsupported)/i.test(text)
}

// Classifies a `result`-type message (D7): subtype "success" → done; any other subtype
// (including future ones) → failed, with the subtype as detail.
function classifyResult(msg) {
  if (!msg) {
    return {
      outcome: 'failed', resultText: '', sessionId: undefined, costUsd: undefined,
      usage: undefined, detail: 'no result message received',
    }
  }
  const base = {
    resultText: msg.result || '',
    sessionId: msg.session_id,
    costUsd: msg.total_cost_usd,
    usage: msg.usage,
  }
  if (msg.subtype === 'success') return { outcome: 'done', ...base }
  return { outcome: 'failed', ...base, detail: msg.subtype }
}

// Streaming-input mode (D8): a single-message async generator. canUseTool answering
// mid-session requires the long-lived streaming prompt form even though v1 sends one message.
async function* streamPrompt(text) {
  yield {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
  }
}

// Lazy require of the sole SDK seam (D2) — only reached when a caller doesn't inject
// queryImpl, so requiring this module never needs autopilot/node_modules (AC-20260801-02-8).
function defaultQueryImpl(args) {
  const { query } = require('./sdk')
  return query(args)
}

async function runStage(opts) {
  const {
    repoRoot,
    prompt,
    model,
    pluginPaths = [],
    onQuestion,
    onPermission,
    queryImpl = defaultQueryImpl,
    env = {},
    signal,
  } = opts

  const canUseTool = makeCanUseTool({ onQuestion, onPermission })
  // Runner-owned AbortController (D8's Contracts note) — distinct from the caller's `signal`,
  // which triggers this one plus query.interrupt() on the live streaming session.
  const abortController = new AbortController()
  let aborted = false
  let currentQuery = null

  function onExternalAbort() {
    aborted = true
    abortController.abort()
    if (currentQuery && typeof currentQuery.interrupt === 'function') {
      currentQuery.interrupt().catch(() => {})
    }
  }
  if (signal) {
    if (signal.aborted) onExternalAbort()
    else signal.addEventListener('abort', onExternalAbort)
  }

  try {
    let attemptModel = model
    let usedFallback = false

    for (;;) {
      const options = {
        cwd: repoRoot,
        permissionMode: 'acceptEdits',
        settingSources: ['project', 'user', 'local'],
        plugins: pluginPaths.map((p) => ({ type: 'local', path: p })),
        canUseTool,
        abortController,
        env: { ...process.env, ...env, AUTOPILOT_SESSION: '1' },
      }
      if (attemptModel) options.model = attemptModel

      let resultMsg = null
      let thrown = null
      try {
        currentQuery = queryImpl({ prompt: streamPrompt(prompt), options })
        for await (const message of currentQuery) {
          if (aborted) break
          if (message && message.type === 'result') resultMsg = message
        }
      } catch (err) {
        thrown = err
      }

      if (aborted) {
        return {
          outcome: 'aborted', resultText: '', sessionId: undefined, costUsd: undefined,
          usage: undefined, detail: undefined,
        }
      }

      if (thrown) {
        const message = thrown && thrown.message ? thrown.message : String(thrown)
        if (!usedFallback && attemptModel === 'fable' && isModelUnavailableError(message)) {
          usedFallback = true
          attemptModel = 'opus'
          continue
        }
        const base = {
          resultText: '', sessionId: undefined, costUsd: undefined, usage: undefined, detail: message,
        }
        if (isRetryableError(message)) return { outcome: 'retryable', ...base }
        return { outcome: 'failed', ...base }
      }

      return classifyResult(resultMsg)
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

module.exports = { runStage }
