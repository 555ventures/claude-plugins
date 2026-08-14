'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, extractFn, evalFns } = require('../helpers')

// specs/20260813/09-model-placement-mechanics.md D1/D7 (2026-08-14). Today `dispatch()`'s
// agentType-not-found retry calls `agent(...)` directly (fragments/dispatch.js.frag), so a
// fable+unknown-agentType seat's worst-case chain (general-purpose retry, THEN model fallback)
// can never compose — the second failure just propagates past it. D1 makes the retry recurse
// through `dispatch()` itself and adds a single-retry `MODEL_FALLBACK = { fable: 'opus' }`
// branch. D7 fixes a prerequisite bug in tests/helpers.js's extractFn: it silently drops the
// `async` keyword when extracting `async function dispatch(...)`, so every await-bearing
// extraction (dispatch is this repo's only top-level async extraction target) throws a
// SyntaxError under evalFns until D7 lands — every test below that calls dispatch() depends on it.

test('AC-20260813-09-9: extractFn keeps the `async` keyword when extracting an async function, so evalFns can evaluate await-bearing source without a SyntaxError', () => {
  const src = 'async function f(){await g()}'
  assert.doesNotThrow(() => evalFns(src, ['f']),
    'evalFns must not throw a SyntaxError extracting an async function — dropping `async` makes ' +
    'the sanctioned workflow-shape test mode unusable for `dispatch`, this repo\'s only top-level ' +
    'async extraction target')
  assert.match(extractFn(src, 'f'), /^async function f/,
    'extractFn must preserve the `async` keyword at the front of the extracted source — without ' +
    'it, the extracted text becomes invalid JS the moment an `await` appears inside')
})

// Loads dispatch() fresh from the fragment via the sanctioned evalFns mode, and swaps the
// sandbox's `agent`/`log` globals (free variables inside the extracted function, exactly like
// the real workflow sandbox supplies them) for fakes for the duration of `run`.
async function withFakeHarness(fakeAgent, run) {
  const savedAgent = global.agent
  const savedLog = global.log
  const logs = []
  global.agent = fakeAgent
  global.log = (msg) => logs.push(msg)
  try {
    return await run(logs)
  } finally {
    global.agent = savedAgent
    global.log = savedLog
  }
}

function loadDispatch() {
  const src = read('spec/workflows/fragments/dispatch.js.frag')
  return evalFns(src, ['dispatch']).dispatch
}

test("AC-20260813-09-1: dispatch retries a fable seat once as opus after the harness throws on model:'fable', returning the retry's success and logging the fallback", async () => {
  const dispatch = loadDispatch()
  const calls = []
  await withFakeHarness(async (prompt, opts) => {
    calls.push(opts.model)
    if (opts.model === 'fable') throw new Error('model unavailable')
    return { model: opts.model }
  }, async (logs) => {
    const result = await dispatch('prompt', { model: 'fable', agentType: 'general-purpose' })
    assert.strictEqual(result.model, 'opus',
      'a fable seat whose first call throws must retry once as opus and return THAT result — ' +
      'without the fallback, every fable-pinned workflow seat is unusable the moment the harness ' +
      'rejects the model')
    assert.ok(logs.some(l => l.includes("falling back to 'opus'")),
      'the fallback must be logged (a line containing "falling back to \'opus\'") — a silent ' +
      'retry hides the degradation from the run\'s progress narration')
    assert.deepStrictEqual(calls, ['fable', 'opus'],
      'the retry must be observed as exactly one opus call after the fable call — extra or ' +
      'missing calls mean the single-retry guard is not wired correctly')
  })
})

test("AC-20260813-09-2: dispatch propagates the second error when a fable seat's harness throws on both the original call and the opus retry, having made exactly 2 calls", async () => {
  const dispatch = loadDispatch()
  let callCount = 0
  await withFakeHarness(async () => {
    callCount++
    throw new Error('always unavailable')
  }, async () => {
    await assert.rejects(
      () => dispatch('prompt', { model: 'fable', agentType: 'general-purpose' }),
      /always unavailable/,
      'when BOTH the fable call and its opus retry fail, the SECOND error must propagate to the ' +
      'caller — a swallowed failure here would make a dead model silently look like an empty result'
    )
    assert.strictEqual(callCount, 2,
      'the single-retry guard (`__fellBack`) must stop after exactly one retry — an unguarded ' +
      'retry loop would hammer a genuinely unavailable model indefinitely')
  })
})

test('AC-20260813-09-3: dispatch continues to retry an unknown agentType on general-purpose for a non-fable seat (existing behavior, unchanged by the model fallback)', async () => {
  const dispatch = loadDispatch()
  const calls = []
  await withFakeHarness(async (prompt, opts) => {
    calls.push(opts.agentType)
    if (opts.agentType !== 'general-purpose') throw new Error('agentType not found')
    return { agentType: opts.agentType }
  }, async () => {
    const result = await dispatch('prompt', { model: 'sonnet', agentType: 'spec:custom' })
    assert.deepStrictEqual(calls, ['spec:custom', 'general-purpose'],
      'a non-fable seat with an unregistered agentType must still retry exactly once on ' +
      'general-purpose — the D1 model-fallback addition must not disturb this pre-existing path')
    assert.strictEqual(result.agentType, 'general-purpose',
      'the retried general-purpose call\'s result must be what dispatch returns')
  })
})

test('AC-20260813-09-10: dispatch composes both retries — an unknown agentType on a fable seat succeeds via a general-purpose retry THEN the opus fallback, final call observed as agentType=general-purpose + model=opus', async () => {
  const dispatch = loadDispatch()
  const calls = []
  await withFakeHarness(async (prompt, opts) => {
    calls.push({ agentType: opts.agentType, model: opts.model })
    if (opts.agentType !== 'general-purpose') throw new Error('agentType not found')
    if (opts.model === 'fable') throw new Error('model unavailable')
    return { agentType: opts.agentType, model: opts.model }
  }, async () => {
    const result = await dispatch('prompt', { model: 'fable', agentType: 'spec:custom' })
    assert.strictEqual(calls.length, 3,
      'the worst-case chain is 3 calls: fable+custom-type, then general-purpose+fable, then ' +
      'general-purpose+opus — the pre-D1 code retried the agentType branch via a bare `agent()` ' +
      '(not `dispatch()`), so this composed chain was unreachable and the second failure just ' +
      'propagated instead of falling further back to opus')
    assert.deepStrictEqual(calls[2], { agentType: 'general-purpose', model: 'opus' },
      'the final observed call must be general-purpose + opus — both retries must compose, not ' +
      'just the first one')
    assert.deepStrictEqual(result, { agentType: 'general-purpose', model: 'opus' },
      'dispatch must return the successful composed retry\'s result')
  })
})
