'use strict'
const { test, mock } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir } = require('../helpers')

// spec: specs/20260801/03-lane-engine.md — pins AC-20260801-03-1..7, -10, -12, -13 for the
// lane state machine (autopilot/daemon/lane.js) and the daemon entry's recursion guard
// (autopilot/bin/autopilotd, AC-10). Every lane test injects a fake adapter, fake runStage,
// and fake oracle (Rationale: "the engine is deliberately a thin consumer of three contracts
// it does not own") — zero real SDK/Telegram calls. Backoff/poll timing uses node:test's
// mock.timers per the repo's sanctioned mode-4 DI pattern. Per the repo's injected-transport
// Gotcha, flush() yields real setImmediate ticks between assertions so a synchronously
// resolving fake doesn't starve the lane's own promise chain. The module does not exist yet,
// so every test here fails at require() time until autopilot/daemon/lane.js lands.
const LANE_PATH = path.join(__dirname, '..', '..', 'autopilot', 'daemon', 'lane.js')
const AUTOPILOTD_PATH = path.join(__dirname, '..', '..', 'autopilot', 'bin', 'autopilotd')
const { createLane } = require(LANE_PATH)

async function flush(times = 20) {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve))
}

// setImmediate ticks cannot advance real OS work. A brief checkpoint awaits startSurfaces(),
// which spawns real child processes (~40ms to first stdout, measured) before the ask can carry
// the tunnel URL — 20 ticks is ~1ms. Wait on the condition in real time instead, the same
// pattern checkpoint.test.js's AC-9 uses for its own real processes.
async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return predicate()
}

function makeCfg(overrides = {}) {
  return Object.assign({ project: 'prax', root: '/fake/prax', topicId: 7 }, overrides)
}

function writeState(stateDir, project, brief) {
  fs.writeFileSync(path.join(stateDir, project + '.json'),
    JSON.stringify({ state: 'idle', spec: null, stage: null, brief, updatedAt: new Date().toISOString() }))
}

function makeFakeRunStage(impl) {
  const calls = []
  async function runStage(opts) {
    calls.push(opts)
    return impl(opts, calls.length)
  }
  return { runStage, calls }
}

function makeFakeAdapter() {
  const calls = { send: [], askButtons: [], cancelAsk: [], sendPhoto: [] }
  return {
    calls,
    send: async (project, text) => { calls.send.push({ project, text }) },
    askButtons: (project, ask) => new Promise((resolve, reject) => {
      calls.askButtons.push({ project, ask, resolve, reject })
    }),
    cancelAsk: async (project) => { calls.cancelAsk.push({ project }) },
    sendPhoto: async (project, photo) => { calls.sendPhoto.push({ project, photo }) },
  }
}

const PICK_A = { action: '/spec:build', path: 'specs/20260801/05-x.md', status: 'implementing', brief: '03', blockers: [], parallel: false, parallel_reason: '', note: '' }

test('AC-20260801-03-1: a pick whose brief matches the lane\'s lastBrief calls runStage with the exact stage prompt and skips the checkpoint', async () => {
  const stateDir = tmpdir('lane-ac1')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [PICK_A] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(runCalls.length, 1, 'runStage must be called for an admissible pick or the lane never advances the spec')
  assert.strictEqual(runCalls[0].prompt, '/spec:build specs/20260801/05-x.md',
    'the prompt must be exactly "<action> <path>" (Behavior) or the wrong stage command runs against the repo')
  assert.strictEqual(adapter.calls.askButtons.length, 0,
    'a pick whose brief matches lastBrief must skip the checkpoint (D4) or every same-brief stage would redundantly pause for a phone tap')
  await lane.stop()
})

test('AC-20260801-03-2: a pick whose brief differs from lastBrief posts a checkpoint with the tunnel URL and Start/Hold options, and withholds runStage until Start is answered', async () => {
  const stateDir = tmpdir('lane-ac2')
  writeState(stateDir, 'prax', '03')
  const pick04 = Object.assign({}, PICK_A, { path: 'specs/20260801/09-y.md', brief: '04' })
  const oracle = async () => ({ next: [pick04] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const cfg = makeCfg({
    devServerCommand: 'true',
    tunnelCommand: 'node -e "console.log(\'https://abc.trycloudflare.com\')"',
  })
  const lane = createLane({ cfg, adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await waitFor(() => adapter.calls.askButtons.length > 0)
  assert.strictEqual(runCalls.length, 0,
    'runStage must not run before the checkpoint is answered (D4) or an unattended brief boundary silently starts work')
  assert.strictEqual(adapter.calls.askButtons.length, 1,
    'a brief boundary must post exactly one checkpoint ask or the phone gets no decision point')
  const ask = adapter.calls.askButtons[0].ask
  const labels = ask.questions[0].options.map((o) => o.label).join(' ')
  assert.match(labels, /Start/, 'the checkpoint must offer a Start option (▶) or the lane can never resume')
  assert.match(labels, /Hold/, 'the checkpoint must offer a Hold option (⏸) or the operator cannot pause')
  const allText = [ask.questions[0].question, ...adapter.calls.send.map((c) => c.text)].join(' ')
  assert.match(allText, /https:\/\/abc\.trycloudflare\.com/,
    'the checkpoint must surface the tunnel URL somewhere in its message (D4) or the phone has no link to sanity-check the dev server')
  const startOption = ask.questions[0].options.find((o) => /Start/.test(o.label))
  assert.ok(startOption, 'test fixture bug: the checkpoint must carry a Start-labeled option')
  adapter.calls.askButtons[0].resolve({ answers: { [ask.questions[0].question]: startOption.label } })
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'answering Start must release exactly one runStage call or the checkpoint never actually starts the stage')
  await lane.stop()
})

test('Behavior line 93: the INITIAL runStage call for a /spec:plan pick carries model:"fable", distinct from the D5 repair-pass model:"fable" call', async () => {
  const stateDir = tmpdir('lane-plan-model')
  writeState(stateDir, 'prax', '03')
  const planPick = Object.assign({}, PICK_A, { action: '/spec:plan', path: '@docs/roadmap/prax.md', brief: '03' })
  const oracle = async () => ({ next: [planPick] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const cfg = makeCfg({
    devServerCommand: 'true',
    tunnelCommand: 'node -e "console.log(\'https://abc.trycloudflare.com\')"',
  })
  const lane = createLane({ cfg, adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await waitFor(() => adapter.calls.askButtons.length > 0)
  const ask = adapter.calls.askButtons[0].ask
  const startOption = ask.questions[0].options.find((o) => /Start/.test(o.label))
  assert.ok(startOption, 'test fixture bug: a roadmap-brief pick must still offer a Start option through the ordinary checkpoint path (D4)')
  adapter.calls.askButtons[0].resolve({ answers: { [ask.questions[0].question]: startOption.label } })
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'the initial stage attempt for a /spec:plan pick must actually run past the checkpoint or the model contract can never be observed')
  assert.strictEqual(runCalls[0].model, 'fable',
    'Behavior line 93: an INITIAL /spec:plan runStage call must carry model:"fable" (`model: action==="/spec:plan" ? "fable" : undefined`) or roadmap planning silently runs on the default model')
  await lane.stop()
})

test('Behavior line 93: the INITIAL runStage call for a non-/spec:plan pick carries no model, so a future "always fable" regression cannot pass this pin', async () => {
  const stateDir = tmpdir('lane-nonplan-model')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [PICK_A] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'the initial stage attempt for a /spec:build pick must actually run or the model contract can never be observed')
  assert.strictEqual(runCalls[0].model, undefined,
    'Behavior line 93: a non-/spec:plan pick\'s initial runStage call must carry no model (`: undefined` branch) or a future "always fable" regression silently ships')
  await lane.stop()
})

test('D9: the lane posts a "▶ <action> <path>" start narration before runStage resolves, not retroactively after the stage finishes', async () => {
  const stateDir = tmpdir('lane-start-narration')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [PICK_A] })
  const adapter = makeFakeAdapter()
  let sawStartBeforeResolve = false
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => {
    sawStartBeforeResolve = adapter.calls.send.some((c) => /▶/.test(c.text))
    return { outcome: 'done', resultText: 'ok', costUsd: 0 }
  })
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'test fixture bug: the stage must actually run before the start-narration ordering can be checked')
  assert.strictEqual(sawStartBeforeResolve, true,
    'D9: the "▶" start narration must be posted before runStage resolves — a start, not a retroactive done-time message — or the phone learns about a stage transition only after the fact')
  const startMsg = adapter.calls.send.find((c) => /▶/.test(c.text))
  assert.ok(startMsg, 'D9: a "▶ <action> <path>" start narration must be posted for a stage transition or the phone has no visibility into what began')
  assert.match(startMsg.text, /▶\s*\/spec:build\s+specs\/20260801\/05-x\.md/,
    'D9: the start narration must follow the "▶ <action> <path>" shape (e.g. "▶ /spec:build specs/…") or the message does not identify which stage began')
  await lane.stop()
})

test('D4: a roadmap-brief pick triggers the checkpoint even when its brief equals the lane\'s lastBrief, because the roadmap-path clause is an unconditional OR', async () => {
  const stateDir = tmpdir('lane-d4-roadmap')
  writeState(stateDir, 'prax', '03')
  const roadmapPick = Object.assign({}, PICK_A, { action: '/spec:plan', path: '@docs/roadmap/prax.md', brief: '03' })
  const oracle = async () => ({ next: [roadmapPick] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const cfg = makeCfg({
    devServerCommand: 'true',
    tunnelCommand: 'node -e "console.log(\'https://abc.trycloudflare.com\')"',
  })
  const lane = createLane({ cfg, adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await waitFor(() => adapter.calls.askButtons.length > 0)
  assert.strictEqual(runCalls.length, 0,
    'D4: runStage must not run before the checkpoint is answered even though the pick\'s brief equals lastBrief, because the roadmap-path clause fires regardless of brief equality')
  assert.strictEqual(adapter.calls.askButtons.length, 1,
    'D4: a roadmap-brief pick must post exactly one checkpoint ask even with brief === lastBrief or the unconditional-OR clause is not honored')
  const ask = adapter.calls.askButtons[0].ask
  const startOption = ask.questions[0].options.find((o) => /Start/.test(o.label))
  assert.ok(startOption, 'test fixture bug: the checkpoint must carry a Start-labeled option')
  adapter.calls.askButtons[0].resolve({ answers: { [ask.questions[0].question]: startOption.label } })
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'D4: answering Start must release exactly one runStage call for the roadmap-brief pick or the checkpoint never actually starts the stage')
  await lane.stop()
})

test('AC-20260801-03-3: a failed stage triggers exactly one fable repair runStage, and a second failure halts the lane and offers Next spec / Stay parked without further unanswered runStage calls', async () => {
  const stateDir = tmpdir('lane-ac3')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [PICK_A] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'failed', detail: 'gate red' }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush(30)
  assert.strictEqual(runCalls.length, 2,
    `a failed stage must trigger exactly one repair attempt (D5) — got ${runCalls.length} total runStage calls`)
  assert.strictEqual(runCalls[1].model, 'fable',
    'the repair attempt must use model:"fable" (D5) or the halt ladder never actually tries Fable before parking')
  assert.match(runCalls[1].prompt, /specs\/20260801\/05-x\.md/,
    'the repair prompt must still reference the failing stage (D5 "stage command + failure detail") or Fable repairs the wrong thing')
  assert.match(runCalls[1].prompt, /gate red/,
    'the repair prompt must include the failure detail (D5) or Fable repairs blind')
  assert.strictEqual(lane.state(), 'halted',
    'a second consecutive failure must set lane state halted (D5) or the lane silently keeps retrying a doomed stage')
  assert.strictEqual(adapter.calls.askButtons.length, 1,
    'halting must post exactly one options ask or the operator never learns the lane is stuck')
  const labels = adapter.calls.askButtons[0].ask.questions[0].options.map((o) => o.label).join(' ')
  assert.match(labels, /Next spec/, 'the halt ask must offer "Next spec" (D5) or the operator cannot advance past a stuck spec')
  assert.match(labels, /Stay parked/, 'the halt ask must offer "Stay parked" (D5) or the operator cannot choose to leave the lane halted')
  await flush(30)
  assert.strictEqual(runCalls.length, 2,
    'runStage must not be called again while the halt ask is unanswered (D5) or a stuck lane silently keeps burning sessions')
  await lane.stop()
})

test('AC-20260801-03-4: repeated retryable outcomes back off at ~30s/60s/120s/240s/480s/900s(cap)/900s..., and the lane stays alive', async () => {
  const stateDir = tmpdir('lane-ac4')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [PICK_A] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'retryable', detail: 'busy' }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    lane.start()
    await flush()
    assert.strictEqual(runCalls.length, 1, 'the first attempt must run immediately without waiting on a backoff timer')
    const schedule = [30000, 60000, 120000, 240000, 480000, 900000, 900000]
    for (let i = 0; i < schedule.length; i++) {
      mock.timers.tick(schedule[i])
      await flush()
      assert.strictEqual(runCalls.length, i + 2,
        `after the ${i + 1}th backoff of ~${schedule[i] / 1000}s the lane must retry (attempt ${i + 2}, D6) or a retryable outcome silently stalls the lane forever`)
    }
  } finally {
    mock.timers.reset()
    await lane.stop()
  }
})

test('AC-20260801-03-5: an onQuestion firing during a stage relays through adapter.askButtons and passes back exactly the resolved answers object, narrating the asking state', async () => {
  const stateDir = tmpdir('lane-ac5')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [Object.assign({}, PICK_A, { action: '/spec:review' })] })
  const questions = [{ question: 'Merge strategy?', header: 'Merge', options: [{ label: 'squash' }, { label: 'merge-commit' }], multiSelect: false }]
  let capturedAnswers
  const { runStage } = makeFakeRunStage(async (opts) => {
    capturedAnswers = await opts.onQuestion(questions)
    return { outcome: 'done', resultText: 'ok' }
  })
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(adapter.calls.askButtons.length, 1,
    'a question from the session must relay through adapter.askButtons or the phone never sees the fork')
  assert.deepStrictEqual(adapter.calls.askButtons[0].ask.questions, questions,
    'the exact questions array must be forwarded or the rendered buttons do not match the real fork')
  assert.strictEqual(lane.state(), 'asking',
    'the lane must flip to asking while a question is pending (Behavior) or the operator has no signal a decision is needed')
  const narrated = adapter.calls.send.some((c) => /⚠️/.test(c.text))
  assert.ok(narrated, 'the lane must narrate the asking state with the ⚠️ marker (D9) or a pending fork is invisible in the topic')
  adapter.calls.askButtons[0].resolve({ answers: { 'Merge strategy?': 'squash' } })
  await flush()
  assert.deepStrictEqual(capturedAnswers, { 'Merge strategy?': 'squash' },
    'onQuestion must resolve with exactly the adapter\'s answers object, unwrapped, or the session receives the wrong shape (AC-5)')
  await lane.stop()
})

test('AC-20260801-03-6: an idle notice is posted once for repeated identical empty next[] and again when the oracle content changes', async () => {
  const stateDir = tmpdir('lane-ac6')
  writeState(stateDir, 'prax', null)
  let call = 0
  const oracle = async () => {
    call++
    if (call <= 2) return { next: [] }
    return { next: [], note: 'all admissible specs parked' }
  }
  const { runStage } = makeFakeRunStage(async () => ({ outcome: 'done' }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg({ pollSeconds: 1 }), adapter, runStage, oracle, stateDir, log: () => {} })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    lane.start()
    await flush()
    assert.strictEqual(adapter.calls.send.length, 1, 'the first idle result must post exactly one idle notice')
    mock.timers.tick(1000)
    await flush()
    assert.strictEqual(adapter.calls.send.length, 1,
      'an identical repeated idle result must be deduped, not posted again (Behavior: "dedupe by hash — no spam")')
    mock.timers.tick(1000)
    await flush()
    assert.strictEqual(adapter.calls.send.length, 2,
      'a changed idle result must post again — dedupe must not suppress genuinely new content')
  } finally {
    mock.timers.reset()
    await lane.stop()
  }
})

test('AC-20260801-03-7: stop() during an in-flight asking session aborts the stage, cancels the pending ask, and persists lane state with lastBrief', async () => {
  const stateDir = tmpdir('lane-ac7')
  writeState(stateDir, 'prax', '03')
  const oracle = async () => ({ next: [Object.assign({}, PICK_A, { action: '/spec:review' })] })
  const questions = [{ question: 'Merge strategy?', options: [{ label: 'squash' }, { label: 'merge-commit' }], multiSelect: false }]
  let sawAbort = false
  const { runStage } = makeFakeRunStage(async (opts) => {
    opts.onQuestion(questions).catch(() => {})
    await new Promise((resolve) => {
      if (opts.signal) opts.signal.addEventListener('abort', () => { sawAbort = true; resolve() })
    })
    return { outcome: 'aborted' }
  })
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(lane.state(), 'asking', 'test fixture bug: the lane must be asking before stop() can be exercised against a pending ask')
  await lane.stop()
  assert.strictEqual(sawAbort, true,
    'stop() must abort the in-flight stage signal (spec 02 abort contract) or a stopped lane leaves a session running behind its back')
  assert.strictEqual(adapter.calls.cancelAsk.length, 1,
    'stop() while asking must call adapter.cancelAsk(project) or the topic is left with a permanently pending ask (spec 01 cancelAsk)')
  const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'prax.json'), 'utf8'))
  assert.strictEqual(persisted.brief, '03',
    'stop() must persist the lane state file with the current lastBrief (D7) or a restart forgets which brief the lane was on')
})

test('AC-20260801-03-10: autopilotd exits 2 with a recursion-guard message when AUTOPILOT_SESSION=1 is set, before reading config', () => {
  const result = spawnSync(process.execPath, [AUTOPILOTD_PATH, '--config', '/nonexistent/config.json'], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { AUTOPILOT_SESSION: '1' }),
  })
  assert.strictEqual(result.status, 2,
    `autopilotd must exit 2 when AUTOPILOT_SESSION=1 (D8 recursion guard) or a session spawning a session recurses unbounded; stderr: ${result.stderr}`)
  assert.match(result.stderr, /recursion/i,
    'the exit message must name the recursion guard (not a generic config error) or an operator seeing exit 2 cannot diagnose why, and cannot tell the guard fired before config was even read')
})

test('AC-20260801-03-12: answering "Next spec" while halted on a.md picks b.md next, and after a restart the memory-only skip set is empty so a.md is picked again', async () => {
  const stateDir = tmpdir('lane-ac12')
  writeState(stateDir, 'prax', '03')
  const pickA = Object.assign({}, PICK_A, { path: 'specs/a.md' })
  const pickB = Object.assign({}, PICK_A, { path: 'specs/b.md' })
  let phase = 'onlyA'
  const oracle = async () => {
    if (phase === 'onlyA') return { next: [pickA] }
    if (phase === 'aAndB') return { next: [pickA, pickB] }
    return { next: [pickA] } // b.md done; only the skipped a.md remains admissible
  }
  const { runStage, calls: runCalls } = makeFakeRunStage(async (opts) => {
    if (opts.prompt.includes('a.md')) return { outcome: 'failed', detail: 'gate red' }
    return { outcome: 'done', resultText: 'ok' }
  })
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush(30)
  assert.strictEqual(lane.state(), 'halted', 'test fixture bug: the lane must be halted on a.md before Next spec can be exercised')
  phase = 'aAndB'
  const halt = adapter.calls.askButtons[adapter.calls.askButtons.length - 1]
  const nextOption = halt.ask.questions[0].options.find((o) => /Next spec/.test(o.label))
  assert.ok(nextOption, 'test fixture bug: the halt ask must carry a Next spec option')
  halt.resolve({ answers: { [halt.ask.questions[0].question]: nextOption.label } })
  await flush(30)
  assert.ok(runCalls.some((c) => c.prompt === '/spec:build specs/b.md'),
    'choosing Next spec must skip a.md (D2/D5 memory-only skip set) and pick b.md, the next admissible entry, or the lane re-runs the same stuck spec')
  phase = 'onlyASkipped'
  await flush(30)
  const idleMsgs = adapter.calls.send.filter((c) => /parked/i.test(c.text))
  assert.ok(idleMsgs.length >= 1,
    'when next[] contains only skipped/blocked entries the lane must idle with an "all admissible specs parked" notice (AC-12) or the operator sees silence instead of a clear signal')
  await lane.stop()

  const stateDir2 = tmpdir('lane-ac12-restart')
  writeState(stateDir2, 'prax', '03')
  const oracle2 = async () => ({ next: [pickA] })
  const { runStage: runStage2, calls: runCalls2 } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'ok' }))
  const adapter2 = makeFakeAdapter()
  const lane2 = createLane({ cfg: makeCfg(), adapter: adapter2, runStage: runStage2, oracle: oracle2, stateDir: stateDir2, log: () => {} })
  lane2.start()
  await flush()
  assert.ok(runCalls2.some((c) => c.prompt === '/spec:build specs/a.md'),
    'after a daemon restart the skip set must be empty (D7: memory-only, never persisted) — a.md must be admissible again, not permanently skipped')
  await lane2.stop()
})

// AC-20260805-03-11 (sanctioned pin exception, green pre-change): specs/20260805/03-done-
// unobserved-observation.md D5/A5 — the oracle now emits a full `/spec:escape` entry
// (`{action,path,status,brief,blockers:[],parallel:false,parallel_reason:null,note}`) as the
// --next top pick on a red observation. The lane treats EVERY non-/spec:plan action generically
// (pickFrom, needsCheckpoint, runStageFor — none of them switch on `action` beyond the
// /spec:plan check), so an escape entry must flow through the exact same path as any other pick
// with no special case and no crash — pinning that here is what keeps a future action-specific
// branch from silently breaking escape dispatch.
test('AC-20260805-03-11: an oracle-returned /spec:escape entry is picked and dispatched through the ordinary generic path, no special case, no crash', async () => {
  const stateDir = tmpdir('lane-ac11-escape')
  writeState(stateDir, 'prax', '03')
  const escapePick = {
    // brief matches the lane's lastBrief (writeState above) so the checkpoint (D4, exercised
    // separately by AC-2) doesn't gate this test — it isolates the generic-dispatch claim.
    action: '/spec:escape', path: 'specs/20260701/01-auth-core.md', status: 'done',
    brief: '03', blockers: [], parallel: false, parallel_reason: null,
    note: 'CI red on main @deadbee — https://github.com/x/y/actions/runs/9',
  }
  const oracle = async () => ({ next: [escapePick] })
  const { runStage, calls: runCalls } = makeFakeRunStage(async () => ({ outcome: 'done', resultText: 'escaped', costUsd: 0 }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  lane.start()
  await flush()
  assert.strictEqual(runCalls.length, 1,
    'the escape entry must be picked and dispatched — a crash or a silent skip here means the lane cannot act on the highest-priority oracle pick')
  assert.strictEqual(runCalls[0].prompt, '/spec:escape specs/20260701/01-auth-core.md',
    'the prompt must be the generic "<action> <path>" shape (Behavior) — no action-specific prompt formatting for escape entries')
  assert.strictEqual(runCalls[0].model, undefined,
    'only /spec:plan carries model:"fable" (Behavior line 93) — an escape entry must not silently pick up that branch')
  await lane.stop()
})

test('AC-20260801-03-13: an oracle that throws (non-zero exit / unparseable JSON) narrates 🚫 once, enters backoff, and retries on the D6 schedule without crashing the lane', async () => {
  const stateDir = tmpdir('lane-ac13')
  writeState(stateDir, 'prax', null)
  let oracleCalls = 0
  const oracle = async () => {
    oracleCalls++
    if (oracleCalls <= 3) throw new Error('spec-status.js exited 1: unparseable JSON')
    return { next: [] }
  }
  const { runStage } = makeFakeRunStage(async () => ({ outcome: 'done' }))
  const adapter = makeFakeAdapter()
  const lane = createLane({ cfg: makeCfg(), adapter, runStage, oracle, stateDir, log: () => {} })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    lane.start()
    await flush()
    assert.strictEqual(oracleCalls, 1, 'the first oracle call must happen immediately on start')
    const narrations = adapter.calls.send.filter((c) => /🚫/.test(c.text))
    assert.strictEqual(narrations.length, 1,
      'an oracle failure must narrate 🚫 exactly once at this point (D2) — a broken oracle must not spam the topic on every internal retry')
    assert.strictEqual(lane.state(), 'backoff',
      'an oracle failure must enter the backoff state (D2/D6) or a broken oracle is indistinguishable from a hung lane')
    mock.timers.tick(30000)
    await flush()
    assert.strictEqual(oracleCalls, 2, 'the oracle must retry on the D6 backoff schedule (30s) or a broken oracle strands the lane forever')
    mock.timers.tick(60000)
    await flush()
    assert.strictEqual(oracleCalls, 3, 'the oracle must retry again at the next D6 step (60s)')
    mock.timers.tick(120000)
    await flush()
    assert.strictEqual(oracleCalls, 4,
      'once the oracle recovers the lane must resume normal operation, proving a broken oracle never crashes the lane (D2)')
  } finally {
    mock.timers.reset()
    await lane.stop()
  }
})
