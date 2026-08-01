'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

// spec: specs/20260801/02-session-runner.md — pins AC-20260801-02-1..10 for the SDK session
// runner (autopilot/daemon/session.js). Every test drives runStage() against a fake
// queryImpl (D2) — zero real SDK calls, no autopilot/node_modules dependency. The fake
// queryImpl mirrors the real SDK's query() shape (called with the options object either
// directly or wrapped as {prompt, options} — extractOptions() below tolerates either so the
// tests pin behavior, not the exact call convention) and returns a Query-like async
// iterable carrying an interrupt() method (D8). The module does not exist yet, so every
// test here fails at require() time until autopilot/daemon/session.js lands.
const SESSION_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'session.js')
const { runStage } = require(SESSION_PATH)

const REPO_ROOT = '/fake/repo'
const PLUGIN_PATHS = ['/fake/repo/.claude-plugin']

// Real SDK's query() is called with an object carrying at least `canUseTool`/`cwd` on it —
// either directly, or nested under `.options` if the runner forwards {prompt, options}
// verbatim. Tolerating both shapes keeps these tests pinned to the AC's observable options
// content, not to an unlocked call-signature fork.
function extractOptions(calledWith) {
  if (calledWith && typeof calledWith === 'object') {
    if ('canUseTool' in calledWith || 'cwd' in calledWith) return calledWith
    if (calledWith.options && typeof calledWith.options === 'object') return calledWith.options
  }
  return calledWith
}

// Builds a fake queryImpl that: records every call's options, yields `messages` in order on
// iteration, and exposes an `interrupt()` on the returned Query-like object. `onCall` lets a
// test throw/branch per invocation (for the retry and abort ACs).
function makeFakeQueryImpl(messages, { onCall, interruptImpl } = {}) {
  const calls = []
  function queryImpl(calledWith) {
    const options = extractOptions(calledWith)
    calls.push(options)
    if (onCall) onCall(calls.length, options)
    let i = 0
    const iter = {
      [Symbol.asyncIterator]() { return this },
      async next() {
        if (i < messages.length) return { value: messages[i++], done: false }
        return { value: undefined, done: true }
      },
    }
    iter.interrupt = interruptImpl || (async () => {})
    return iter
  }
  return { queryImpl, calls }
}

test('AC-20260801-02-1: a fake queryImpl yielding a success result message maps to outcome done with resultText/sessionId/costUsd', async () => {
  const { queryImpl } = makeFakeQueryImpl([
    { type: 'result', subtype: 'success', result: '✅ done', session_id: 's1', total_cost_usd: 0.42 },
  ])
  const r = await runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl,
  })
  assert.strictEqual(r.outcome, 'done', 'a success-subtype result message must classify as done or the lane engine can never advance past a completed stage')
  assert.strictEqual(r.resultText, '✅ done', 'resultText must come from the result message\'s result field or callers lose the stage summary')
  assert.strictEqual(r.sessionId, 's1', 'sessionId must be threaded through or transcript archaeology (resume) is impossible')
  assert.strictEqual(r.costUsd, 0.42, 'costUsd must come from total_cost_usd or cost reporting silently drops to zero')
})

test('AC-20260801-02-2: canUseTool for AskUserQuestion relays to onQuestion and returns {behavior:"allow", updatedInput:{questions, answers}} verbatim', async () => {
  const { queryImpl, calls } = makeFakeQueryImpl([
    { type: 'result', subtype: 'success', result: '', session_id: 's1', total_cost_usd: 0 },
  ])
  const questions = [{
    question: 'Merge strategy?', header: 'Merge',
    options: [{ label: 'squash', description: 'one commit' }, { label: 'merge-commit', description: 'keep history' }],
    multiSelect: false,
  }]
  const runPromise = runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async (qs) => {
      assert.deepStrictEqual(qs, questions, 'onQuestion must receive the exact AskUserQuestionInput.questions array or the adapter renders the wrong prompt')
      return { 'Merge strategy?': 'squash' }
    },
    onPermission: async () => ({ allow: true }), queryImpl,
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.strictEqual(calls.length, 1, 'runStage must have invoked queryImpl before canUseTool can be exercised')
  const canUseTool = extractOptions(calls[0]).canUseTool
  assert.strictEqual(typeof canUseTool, 'function', 'options passed to query() must carry a canUseTool callback or no question/permission can ever be relayed')
  const result = await canUseTool('AskUserQuestion', { questions }, { toolUseID: 't1', requestId: 'r1', suggestions: undefined })
  assert.deepStrictEqual(result, {
    behavior: 'allow',
    updatedInput: { questions, answers: { 'Merge strategy?': 'squash' } },
  }, 'AskUserQuestion must return {behavior:"allow", updatedInput:{questions, answers}} verbatim (D3) or the SDK cannot inject the chosen answer back into the session')
  await runPromise
})

test('AC-20260801-02-3: canUseTool for a non-question tool relays to onPermission and denies with the handler message, never returning null', async () => {
  const { queryImpl, calls } = makeFakeQueryImpl([
    { type: 'result', subtype: 'success', result: '', session_id: 's1', total_cost_usd: 0 },
  ])
  const runPromise = runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}),
    onPermission: async ({ toolName }) => (toolName === 'Bash' ? { allow: false, message: 'not on autopilot' } : { allow: true }),
    queryImpl,
  })
  await new Promise((resolve) => setImmediate(resolve))
  const canUseTool = extractOptions(calls[0]).canUseTool
  const denyResult = await canUseTool('Bash', { command: 'rm -rf /' }, { toolUseID: 't2', requestId: 'r2', suggestions: undefined })
  assert.deepStrictEqual(denyResult, { behavior: 'deny', message: 'not on autopilot' }, 'a false onPermission decision must produce {behavior:"deny", message} (D4) or a denied action executes anyway')
  assert.notStrictEqual(denyResult, null, 'canUseTool must never return null on the deny path (D4) — the SDK fail-closed warning blocks the tool forever on a null result')
  const allowResult = await canUseTool('Read', { file_path: '/x' }, { toolUseID: 't3', requestId: 'r3', suggestions: undefined })
  assert.notStrictEqual(allowResult, null, 'canUseTool must never return null on the allow path either (D4) — every path must resolve to an object')
  await runPromise
})

test('AC-20260801-02-9: a multiSelect answer array is comma-joined into a single string before reaching the SDK, and an empty selection joins to ""', async () => {
  const { queryImpl, calls } = makeFakeQueryImpl([
    { type: 'result', subtype: 'success', result: '', session_id: 's1', total_cost_usd: 0 },
  ])
  const questions = [{
    question: 'Which features?', header: 'Features',
    options: [{ label: 'auth' }, { label: 'billing' }], multiSelect: true,
  }]
  const runPromise = runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({ 'Which features?': ['auth', 'billing'] }),
    onPermission: async () => ({ allow: true }), queryImpl,
  })
  await new Promise((resolve) => setImmediate(resolve))
  const canUseTool = extractOptions(calls[0]).canUseTool
  const result = await canUseTool('AskUserQuestion', { questions }, { toolUseID: 't4', requestId: 'r4', suggestions: undefined })
  assert.deepStrictEqual(result.updatedInput.answers, { 'Which features?': 'auth, billing' }, 'a multiSelect array answer must be comma-joined into a string (D3) — the SDK types answers as {[k]: string} and never accepts arrays')
  await runPromise
})

test('AC-20260801-02-4: a thrown error whose message contains an overload/rate-limit signal classifies as outcome retryable with the message in detail', async () => {
  function queryImpl() { throw new Error('API overloaded_error') }
  const r = await runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl,
  })
  assert.strictEqual(r.outcome, 'retryable', 'a 529/overloaded/rate-limit thrown error must classify as retryable (D7) or the daemon treats an exhausted-SDK-retry condition as a hard failure and stops the lane instead of backing off')
  assert.match(r.detail, /overloaded_error/, 'detail must carry the original error text or the daemon\'s backoff logging loses the cause')
})

test('AC-20260801-02-10: a result message with subtype error_max_structured_output_retries classifies as outcome failed with the subtype in detail', async () => {
  const { queryImpl } = makeFakeQueryImpl([
    { type: 'result', subtype: 'error_max_structured_output_retries', session_id: 's1', total_cost_usd: 0 },
  ])
  const r = await runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl,
  })
  assert.strictEqual(r.outcome, 'failed', 'any non-success result subtype must classify as failed (D7) — the lane engine only has three branches and a missed subtype silently stalls it')
  assert.match(r.detail, /error_max_structured_output_retries/, 'detail must carry the failing subtype or the operator sees a failure with no cause')
})

test('AC-20260801-02-5: runStage passes queryImpl an options object with cwd, permissionMode, settingSources, plugins, and env.AUTOPILOT_SESSION="1"', async () => {
  const { queryImpl, calls } = makeFakeQueryImpl([
    { type: 'result', subtype: 'success', result: '', session_id: 's1', total_cost_usd: 0 },
  ])
  await runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl,
  })
  const options = extractOptions(calls[0])
  assert.strictEqual(options.cwd, REPO_ROOT, 'cwd must equal repoRoot or the session runs commands against the wrong repo')
  assert.strictEqual(options.permissionMode, 'acceptEdits', 'permissionMode must be acceptEdits (D5) or the session either bypasses guardrails or blocks on every edit')
  assert.deepStrictEqual(options.settingSources, ['project', 'user', 'local'], 'settingSources must be the full alphabet (D5) or settings.local.json allowlists are silently dropped')
  assert.deepStrictEqual(options.plugins, PLUGIN_PATHS.map((p) => ({ type: 'local', path: p })), 'plugins must map pluginPaths to {type:"local", path} entries or /spec:* commands and hooks never load headless')
  assert.strictEqual(options.env.AUTOPILOT_SESSION, '1', 'env.AUTOPILOT_SESSION must be "1" (D6) or the daemon\'s own recursion guard cannot detect a nested session')
})

test('AC-20260801-02-6: model "fable" retries once as "opus" when the first call throws a model-unavailable error, and the second call succeeds', async () => {
  const { queryImpl, calls } = makeFakeQueryImpl(
    [{ type: 'result', subtype: 'success', result: 'ok', session_id: 's2', total_cost_usd: 0.1 }],
    { onCall: (n) => { if (n === 1) throw new Error("model 'fable' not available") } },
  )
  const r = await runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', model: 'fable', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl,
  })
  assert.strictEqual(calls.length, 2, 'a model-unavailable error on the first call must trigger exactly one retry (D9) or fable outages permanently fail every plan stage')
  assert.strictEqual(extractOptions(calls[0]).model, 'fable', 'the first call must use the literal caller-supplied model string or the fallback bookkeeping is wrong')
  assert.strictEqual(extractOptions(calls[1]).model, 'opus', 'the retried call must use "opus" (shared § Model Placement availability contract) or the fallback never actually happens')
  assert.strictEqual(r.outcome, 'done', 'once the retry succeeds the stage must report done or a working fallback still looks like a failure to the lane engine')
})

test('AC-20260801-02-7: a signal abort mid-stream calls the query\'s interrupt and returns outcome aborted', async () => {
  const ac = new AbortController()
  let interruptCalled = false
  let resolveBlock
  const blocked = new Promise((resolve) => { resolveBlock = resolve })
  function queryImpl() {
    const iter = {
      [Symbol.asyncIterator]() { return this },
      async next() {
        await blocked
        return { value: undefined, done: true }
      },
    }
    iter.interrupt = async () => { interruptCalled = true; resolveBlock() }
    return iter
  }
  const runPromise = runStage({
    repoRoot: REPO_ROOT, prompt: '/spec:build specs/x.md', pluginPaths: PLUGIN_PATHS,
    onQuestion: async () => ({}), onPermission: async () => ({ allow: true }), queryImpl, signal: ac.signal,
  })
  await new Promise((resolve) => setImmediate(resolve))
  ac.abort()
  const r = await runPromise
  assert.strictEqual(interruptCalled, true, 'aborting the caller\'s signal must call the streaming query\'s interrupt() (D8) or a mid-stream session keeps running after the caller gave up on it')
  assert.strictEqual(r.outcome, 'aborted', 'an aborted signal must classify the outcome as aborted or the lane engine cannot distinguish a deliberate cancel from a failure')
})

test('AC-20260801-02-8: requiring autopilot/daemon/session.js in a subprocess with no autopilot/node_modules present does not throw', () => {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SESSION_PATH)})`], { encoding: 'utf8' })
  assert.strictEqual(result.status, 0, `requiring session.js must not throw when autopilot/node_modules is absent (D2) — the SDK require must be lazy, scoped to sdk.js's default queryImpl path only; stderr: ${result.stderr}`)
})
