'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, readState, readStateRaw, lastLedgerRow, run, stateOf, toReviewer, returnFileWith, writeStamp, CLEAN_RETURN, ONE_SURVIVOR_RETURN, makeTwoSurvivorPoolHost, validDispositions, disposerReturn } = require('./disposer-gate.fixtures')

// Shard I of the disposer-gate family (disposer-gate.test.js, split from disposer-gate.test.js
// by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns
// specs/20260901/09-disposer-gate.md AC-20260901-09-1/-2/-3/-6/-9/-13 (via, DISPOSITIONS routing,
// the disposer clause, the review-state.json checkpoint shape, gate-fail ledger rows). Shared
// helpers live in disposer-gate.fixtures.js (D2).

// ---- AC-20260901-09-1 ---------------------------------------------------------------------

test('AC-20260901-09-1: WHEN a review driver created with --via loop (and, separately, one created without --via) reaches --mark reviewer-returned with a stamp present and unchanged THE SYSTEM lands DISPOSITIONS directly (never CHECKPOINT) on the next bare invocation, --state prints DISPOSITIONS, and review-state.json carries no checkpoint key', () => {
  const loopHost = makeHost('disposer-ac1-loop')
  run(loopHost.root, loopHost.spec, '--via', 'loop')
  writeStamp(loopHost.root, 's1')
  run(loopHost.root, loopHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac1-loop-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'DISPOSITIONS',
    'AC-20260901-09-1/D4: a --via loop run whose stamp is present and unchanged must land DISPOSITIONS directly — CHECKPOINT no longer exists as a state deriveState() can return')
  const stepR = run(loopHost.root, loopHost.spec)
  assert.doesNotMatch(stepR.stdout, /CHECKPOINT/,
    'AC-20260901-09-1: the printed step for a --via loop run must never mention CHECKPOINT — the retired mechanism must not leak into the driver\'s own output: ' + stepR.stdout)
  const loopState = readState(loopHost.sidecar)
  assert.strictEqual('checkpoint' in loopState, false,
    'AC-20260901-09-1: review-state.json must carry no checkpoint key for a --via loop run — D4 removes the marks.checkpoint write entirely: ' + JSON.stringify(loopState))

  const noFlagHost = makeHost('disposer-ac1-noflag')
  run(noFlagHost.root, noFlagHost.spec)
  writeStamp(noFlagHost.root, 's1')
  run(noFlagHost.root, noFlagHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac1-noflag-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(noFlagHost.root, noFlagHost.spec), 'DISPOSITIONS',
    'AC-20260901-09-1/D4: a run created with no --via flag must also land DISPOSITIONS directly with a stamp present and unchanged')
  const noFlagState = readState(noFlagHost.sidecar)
  assert.strictEqual('checkpoint' in noFlagState, false,
    'AC-20260901-09-1: a run created without --via must also carry no checkpoint key in review-state.json: ' + JSON.stringify(noFlagState))
})

// ---- AC-20260901-09-2 ---------------------------------------------------------------------

test('AC-20260901-09-2: WHEN the reviewer return holds one survivor and --mark dispositions --waived 0 --rejected 0 --fix-dispatched 1 is passed without --file THE SYSTEM exits 2 with stderr naming --file and spec:disposer, leaves --state at DISPOSITIONS, and leaves review-state.json byte-identical', () => {
  const host = makeHost('disposer-ac2')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac2-return', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')
  const before = readStateRaw(host.sidecar)

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(r.status, 2,
    'AC-20260901-09-2/D2: a non-empty pool must refuse --mark dispositions with no --file — the disposer\'s artifact is the mechanical, unskippable gate this spec installs in place of CHECKPOINT: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /--file/,
    'AC-20260901-09-2: the refusal must name --file specifically: ' + r.stderr)
  assert.match(r.stderr, /spec:disposer/,
    'AC-20260901-09-2: the refusal must name spec:disposer — the session must know WHICH agent to dispatch, not just that something is missing: ' + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave the state at DISPOSITIONS unchanged')
  assert.strictEqual(readStateRaw(host.sidecar), before,
    'a refused dispositions mark must leave review-state.json byte-identical — no partial write may survive a refusal')
})

// ---- AC-20260901-09-3 / AC-20260901-09-6 (disposer clause) --------------------------------

test('AC-20260901-09-3: WHEN the reviewer return holds two survivors, the manifest holds one failing non-blocking leg row leg:drift, and --file names a return covering every ref with counts --waived 0 --rejected 1 --fix-dispatched 2 THE SYSTEM exits 0, copies the file to <sidecar>/disposer-return-1.json, and records disposer:{iteration:1,overrides:1} in review-state.json', () => {
  const host = makeTwoSurvivorPoolHost('disposer-ac3')
  const returnFile = returnFileWith('disposer-ac3-file', disposerReturn(validDispositions()))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', returnFile, '--waived', '0', '--rejected', '1', '--fix-dispatched', '2')
  assert.strictEqual(r.status, 0,
    'AC-20260901-09-3: a return covering every survivor and leg finding exactly once, with matching counts, must be accepted: ' + r.stdout + r.stderr)

  const copied = path.join(host.sidecar, 'disposer-return-1.json')
  assert.ok(fs.existsSync(copied),
    'AC-20260901-09-3/Contracts: the accepted return must be copied to <sidecar>/disposer-return-1.json — an unretained return leaves no evidence the disposer actually ran: ' + host.sidecar)
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(copied, 'utf8')), disposerReturn(validDispositions()),
    'the copied disposer-return-1.json must hold the exact return the session wrote, not a re-derived or summarized copy')

  const state = readState(host.sidecar)
  assert.ok(state.disposer, 'review-state.json must gain a disposer key on acceptance: ' + JSON.stringify(state))
  assert.strictEqual(state.disposer.iteration, 1,
    'AC-20260901-09-3/D2: disposer.iteration must equal the reviewer-return iteration this dispositions mark accepted: ' + JSON.stringify(state))
  assert.strictEqual(state.disposer.overrides, 1,
    'AC-20260901-09-3/D2: disposer.overrides must count exactly the one entry (s1) whose final differs from recommended: ' + JSON.stringify(state))
})

test('AC-20260901-09-6 (disposer clause): WHEN a run accepts AC-20260901-09-3\'s return (one override, zero fix-dispatched so the run closes directly) THE SYSTEM appends a ledger row carrying checkpoint deep-equal to {"outcome":"disposer","overrides":1} immediately after verdict', () => {
  // Deviation from a literal re-use of AC-3's own fixture: AC-3's return dispatches 2 fixes,
  // which routes the run through FIX (never straight to a close/escalate row within this single
  // mark). This host isolates the SAME disposer-override mechanism (one waive overridden to
  // reject by the user) with zero fix-dispatched entries, so the mark itself lands CLOSE and
  // appends the row this AC's second clause pins — logged in the spec's deviations sidecar.
  const host = makeHost('disposer-ac6-disposer')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac6-return', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')

  const returnFile = returnFileWith('disposer-ac6-file', disposerReturn([
    { ref: 's0', recommended: 'waive', reason: 'D2 sanctions', final: 'reject', overriddenBy: 'user', overrideReason: 'actually reject it' },
  ]))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', returnFile, '--waived', '0', '--rejected', '1', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0, 'a fully covered, count-matching return with zero fix-dispatched must be accepted and close the run: ' + r.stdout + r.stderr)

  const row = lastLedgerRow(host.root)
  const keys = Object.keys(row)
  assert.strictEqual(keys[keys.indexOf('verdict') + 1], 'checkpoint',
    'D5: the checkpoint key must sit immediately after verdict on the close row: ' + JSON.stringify(row))
  assert.deepStrictEqual(row.checkpoint, { outcome: 'disposer', overrides: 1 },
    'AC-20260901-09-6/D6: a run whose disposer mark recorded one override, with no fix cycle in between, must carry checkpoint:{"outcome":"disposer","overrides":1} on its close row: ' + JSON.stringify(row))
})

// ---- AC-20260901-09-9 -----------------------------------------------------------------------

test('AC-20260901-09-9: WHEN review-state.json (as 7.53.0 wrote it) carries "checkpoint":{"sessionId":"s1"} with no checkpointCleared, the stamp still reads s1, and the reviewer return is recorded for the current iteration THE SYSTEM prints state DISPOSITIONS', () => {
  const host = makeHost('disposer-ac9')
  run(host.root, host.spec, '--via', 'loop')
  writeStamp(host.root, 's1')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac9-return', CLEAN_RETURN))

  // Hand-write the legacy pre-D4 sidecar shape onto the sidecar the current run already created — the
  // driver must never consult these keys once D4 lands.
  const statePath = path.join(host.sidecar, 'review-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.checkpoint = { sessionId: 's1' }
  delete state.checkpointCleared
  fs.writeFileSync(statePath, JSON.stringify(state))

  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'AC-20260901-09-9/D4: a review-state.json carrying a 7.53.0-shaped checkpoint key with no checkpointCleared, stamp unchanged, must still land DISPOSITIONS — unknown keys are never consulted by the retired-mechanism-free driver: ' + JSON.stringify(state))
})

// ---- AC-20260901-09-13 ----------------------------------------------------------------------

test('AC-20260901-09-13: WHEN a run\'s synthetic gate fails at iteration 1 THE SYSTEM appends a GATE_RED row carrying checkpoint deep-equal to {"outcome":"not-reached"}, for --via loop and for a run created without --via alike', () => {
  const loopHost = makeHost('disposer-ac13-loop', { gateFails: true })
  const rLoop = run(loopHost.root, loopHost.spec, '--via', 'loop')
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED on the first invocation: ' + rLoop.stdout + rLoop.stderr)
  const loopRow = lastLedgerRow(loopHost.root)
  assert.strictEqual(loopRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(loopRow))
  assert.deepStrictEqual(loopRow.checkpoint, { outcome: 'not-reached' },
    'AC-20260901-09-13/D6: a --via loop hard-stop row written before any disposer mark exists must carry checkpoint:{"outcome":"not-reached"}: ' + JSON.stringify(loopRow))

  const directHost = makeHost('disposer-ac13-direct', { gateFails: true })
  const rDirect = run(directHost.root, directHost.spec)
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'STOPPED',
    'setup precondition: a red synthetic gate must land the driver at STOPPED for the --via-absent comparison too: ' + rDirect.stdout + rDirect.stderr)
  const directRow = lastLedgerRow(directHost.root)
  assert.strictEqual(directRow.verdict, 'GATE_RED', 'a red-gate run must append a GATE_RED row: ' + JSON.stringify(directRow))
  assert.deepStrictEqual(directRow.checkpoint, { outcome: 'not-reached' },
    'AC-20260901-09-13/D6: D6 threads the derived outcome onto EVERY review verdict pass, both via values — unlike the retired mechanism, a --via-absent GATE_RED row must also carry checkpoint:{"outcome":"not-reached"}, not omit the key: ' + JSON.stringify(directRow))
})
