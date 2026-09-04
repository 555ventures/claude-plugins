'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { makeHost, readState, readStateRaw, run, stateOf, toReviewer, returnFileWith, writeStamp, CLEAN_RETURN, ONE_SURVIVOR_RETURN, makeTwoSurvivorPoolHost, validDispositions, disposerReturn } = require('./disposer-gate.fixtures')

// Shard J of the disposer-gate family (disposer-gate-refusals.test.js, split from
// disposer-gate.test.js by specs/20260903/06-test-suite-critical-path.md D1/D3). Owns
// specs/20260901/09-disposer-gate.md AC-20260901-09-4/-7/-8 (dispositions refusals, the fix-cycle
// disposer file, --same-survivors) plus the disposition-pool unit tests for a five-file reconcile
// row. Shared helpers live in disposer-gate.fixtures.js (D2).

// ---- AC-20260901-09-4 -----------------------------------------------------------------------

test('AC-20260901-09-4: against AC-20260901-09-3\'s pools, --mark dispositions is refused (exit 2, no disposer-return-1.json written, review-state.json byte-identical) for a missing --file, unreadable/non-JSON content, a DISPOSER_FAILED verdict, an uncovered ref, a duplicate ref, an unknown ref, an out-of-enum recommended, a blank reason, an out-of-enum final, a final without overriddenBy, and a fully valid return with the wrong --fix-dispatched count', () => {
  const host = makeTwoSurvivorPoolHost('disposer-ac4')
  const before = readStateRaw(host.sidecar)
  const copiedPath = path.join(host.sidecar, 'disposer-return-1.json')
  const commonCounts = ['--waived', '0', '--rejected', '1', '--fix-dispatched', '2']

  function expectRefused(name, fileArg, extraArgs, stderrRe) {
    const args = ['--mark', 'dispositions', ...fileArg, ...extraArgs]
    const r = run(host.root, host.spec, ...args)
    assert.strictEqual(r.status, 2,
      `AC-20260901-09-4 (${name}): must exit 2 — an admitted refusal case here would let a malformed or non-covering disposer return land on the ledger: ` + r.stdout + r.stderr)
    if (stderrRe) {
      assert.match(r.stderr, stderrRe,
        `AC-20260901-09-4 (${name}): the refusal must name the failing check: ` + r.stderr)
    }
    assert.ok(!fs.existsSync(copiedPath),
      `AC-20260901-09-4 (${name}): a refused mark must never write disposer-return-1.json: ` + copiedPath)
    assert.strictEqual(readStateRaw(host.sidecar), before,
      `AC-20260901-09-4 (${name}): a refused mark must leave review-state.json byte-identical`)
    assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
      `AC-20260901-09-4 (${name}): a refused mark must leave --state at DISPOSITIONS`)
  }

  const missing = path.join(fs.realpathSync(tmpdir('disposer-ac4-missing')), 'nope.json')
  expectRefused('missing --file', ['--file', missing], commonCounts, /--file/)

  const badJsonFile = returnFileWith('disposer-ac4-badjson', {})
  fs.writeFileSync(badJsonFile, 'not json')
  expectRefused('unreadable/non-JSON content', ['--file', badJsonFile], commonCounts, null)

  const failedFile = returnFileWith('disposer-ac4-failed', { verdict: 'DISPOSER_FAILED', dispositions: [], tokens: 1 })
  expectRefused('DISPOSER_FAILED verdict', ['--file', failedFile], commonCounts, /DISPOSER_FAILED/)

  const uncoveredFile = returnFileWith('disposer-ac4-uncovered', disposerReturn(validDispositions().slice(0, 2)))
  expectRefused('uncovered ref leg:drift', ['--file', uncoveredFile], commonCounts, /leg:drift/)

  const dupDispositions = [validDispositions()[0], validDispositions()[0], validDispositions()[1], validDispositions()[2]]
  const dupFile = returnFileWith('disposer-ac4-dup', disposerReturn(dupDispositions))
  expectRefused('duplicate ref s0', ['--file', dupFile], commonCounts, /s0/)

  const unknownDispositions = [...validDispositions(), { ref: 's9', recommended: 'fix', reason: 'x' }]
  const unknownFile = returnFileWith('disposer-ac4-unknown', disposerReturn(unknownDispositions))
  expectRefused('unknown ref s9', ['--file', unknownFile], commonCounts, /s9/)

  const badRecommended = validDispositions()
  badRecommended[0] = { ...badRecommended[0], recommended: 'skip' }
  const badRecommendedFile = returnFileWith('disposer-ac4-recommended', disposerReturn(badRecommended))
  expectRefused('out-of-enum recommended', ['--file', badRecommendedFile], commonCounts, null)

  const blankReason = validDispositions()
  blankReason[0] = { ...blankReason[0], reason: '   ' }
  const blankReasonFile = returnFileWith('disposer-ac4-blank', disposerReturn(blankReason))
  expectRefused('blank reason', ['--file', blankReasonFile], commonCounts, null)

  const badFinal = validDispositions()
  badFinal[1] = { ...badFinal[1], final: 'later' }
  const badFinalFile = returnFileWith('disposer-ac4-final', disposerReturn(badFinal))
  expectRefused('out-of-enum final', ['--file', badFinalFile], commonCounts, null)

  const finalNoOverride = validDispositions()
  finalNoOverride[0] = { ref: 's0', recommended: 'fix', reason: 'D1 quoted', final: 'waive' }
  const finalNoOverrideFile = returnFileWith('disposer-ac4-nooverride', disposerReturn(finalNoOverride))
  expectRefused('final differs with no overriddenBy', ['--file', finalNoOverrideFile], commonCounts, null)

  const validFile = returnFileWith('disposer-ac4-wrongcount', disposerReturn(validDispositions()))
  expectRefused('fully valid return with wrong --fix-dispatched', ['--file', validFile], ['--waived', '0', '--rejected', '1', '--fix-dispatched', '3'], /--fix-dispatched/)
})

// ---- AC-20260901-09-7 -----------------------------------------------------------------------

test('AC-20260901-09-7: WHEN a fix cycle brings a second reviewer-returned with one survivor THE SYSTEM refuses --mark dispositions --fix-dispatched 1 without --file (exit 2) even though iteration 1\'s disposer-return-1.json exists, and accepts a valid --file recording disposer.iteration:2', () => {
  const host = makeHost('disposer-ac7')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac7-return1', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a one-survivor return must land DISPOSITIONS')

  const fixFile1 = returnFileWith('disposer-ac7-file1', disposerReturn([
    { ref: 's0', recommended: 'fix', reason: 'D1 quoted' },
  ]))
  const disp1 = run(host.root, host.spec, '--mark', 'dispositions', '--file', fixFile1, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(disp1.status, 0, 'setup precondition: a one-entry fix return must be accepted: ' + disp1.stdout + disp1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup precondition: --fix-dispatched 1 must land FIX')
  assert.ok(fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')),
    'setup precondition: iteration 1\'s disposer-return-1.json must exist before this AC exercises the reset')

  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup precondition: fix-applied within the iteration cap must succeed: ' + fixR.stdout + fixR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: fix-applied must return to REVIEWER for the fix-delta pass')

  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac7-return2', ONE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: the fix-delta reviewer pass must also land DISPOSITIONS directly (D4, both via values, every iteration)')

  const noFileR = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(noFileR.status, 2,
    'AC-20260901-09-7/D2: iteration 2 needs its own disposer return — a stale iteration-1 disposer-return-1.json on disk must never satisfy this mark: ' + noFileR.stdout + noFileR.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'a refused dispositions mark must leave state at DISPOSITIONS')

  const fixFile2 = returnFileWith('disposer-ac7-file2', disposerReturn([
    { ref: 's0', recommended: 'fix', reason: 'D1 quoted again' },
  ]))
  const disp2 = run(host.root, host.spec, '--mark', 'dispositions', '--file', fixFile2, '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(disp2.status, 0, 'a fresh, valid iteration-2 return must be accepted: ' + disp2.stdout + disp2.stderr)
  const state = readState(host.sidecar)
  assert.strictEqual(state.disposer.iteration, 2,
    'AC-20260901-09-7/D2: every iteration needs its own return — disposer.iteration must be reset to 2 for the fix-delta pass: ' + JSON.stringify(state))
  assert.ok(fs.existsSync(path.join(host.sidecar, 'disposer-return-2.json')),
    'AC-20260901-09-7: the iteration-2 return must be retained as disposer-return-2.json, distinct from iteration 1\'s file')
})

// ---- AC-20260901-09-8 -----------------------------------------------------------------------

test('AC-20260901-09-8: WHEN --mark dispositions --waived 0 --rejected 0 --fix-dispatched 0 --skip-independence-check-because "jq missing" is passed on any run THE SYSTEM exits 2 with stderr naming --skip-independence-check-because and ADR-0005, leaving the state unchanged', () => {
  const directHost = makeHost('disposer-ac8-direct')
  toReviewer(directHost)
  run(directHost.root, directHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac8-direct-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS', 'setup precondition: a zero-pool return must land DISPOSITIONS')
  const before = readStateRaw(directHost.sidecar)
  const rDirect = run(directHost.root, directHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because', 'jq missing')
  assert.strictEqual(rDirect.status, 2,
    'AC-20260901-09-8/D4: --skip-independence-check-because must be refused unconditionally now — there is no CHECKPOINT left for it to bypass: ' + rDirect.stdout + rDirect.stderr)
  assert.match(rDirect.stderr, /--skip-independence-check-because/,
    'AC-20260901-09-8: the refusal must name the flag specifically: ' + rDirect.stderr)
  assert.match(rDirect.stderr, /ADR-0005/,
    'AC-20260901-09-8: the refusal must name ADR-0005 — the message must say WHY the flag is gone, not just that it is unknown: ' + rDirect.stderr)
  assert.strictEqual(readStateRaw(directHost.sidecar), before, 'a refused mark must leave review-state.json byte-identical')
  assert.strictEqual(stateOf(directHost.root, directHost.spec), 'DISPOSITIONS', 'a refused mark must leave state at DISPOSITIONS')

  const loopHost = makeHost('disposer-ac8-loop')
  run(loopHost.root, loopHost.spec, '--via', 'loop')
  writeStamp(loopHost.root, 's1')
  run(loopHost.root, loopHost.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('disposer-ac8-loop-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(loopHost.root, loopHost.spec), 'DISPOSITIONS', 'setup precondition: a --via loop zero-pool return must also land DISPOSITIONS directly')
  const rLoop = run(loopHost.root, loopHost.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0',
    '--fix-dispatched', '0', '--skip-independence-check-because')
  assert.strictEqual(rLoop.status, 2,
    'AC-20260901-09-8/D4: a bare (no-value) --skip-independence-check-because must also be refused on a --via loop run — "with or without a value" per the Decision: ' + rLoop.stdout + rLoop.stderr)
  assert.match(rLoop.stderr, /--skip-independence-check-because/, 'the bare-flag refusal must also name the flag: ' + rLoop.stderr)
})

// ---- disposition-pool unit (direct fix, core § Incident Policy) --------------------------------
// Fixture shape: a red reconcile row with outOfPlan:5
// and ONE `leg:reconcile` waive entry. Before the fix the driver's tally counted entries (waive:1)
// while verdict.js counted findings (5), so `--waived 1` was accepted and derived HARD_FINDINGS
// forever, and `--waived 5` — the only count verdict.js would have cleared — was refused by the
// driver's own tally check. The ruling (lib/leg-findings.js): a leg ref covers that leg's whole
// count, from the same module both scripts require.

function makeFiveFileReconcileHost(prefix) {
  const host = makeHost(prefix)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: the fixture must reach REVIEWER (manifest-1.jsonl written) before the reconcile row can be appended')
  fs.appendFileSync(path.join(host.sidecar, 'manifest-1.jsonl'),
    JSON.stringify({ leg: 'reconcile', exit: 3, observed: { outOfPlan: 5, files: ['a', 'b', 'c', 'd', 'e'] } }) + '\n')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith(prefix + '-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a red reconcile row must land DISPOSITIONS: ' + JSON.stringify(readState(host.sidecar)))
  return host
}

const ONE_LEG_WAIVE = () => disposerReturn([
  { ref: 'leg:reconcile', recommended: 'waive', reason: 'D1 sanctions every out-of-plan file' },
])

test('disposition-pool unit: WHEN the manifest holds a red reconcile row with outOfPlan:5 and --file holds ONE leg:reconcile waive entry THE SYSTEM refuses --waived 1 (exit 2, stderr names the leg weight, state byte-identical) and accepts --waived 5, recording dispositions.word CLEAN — the count verdict.js derives, never a per-entry tally', () => {
  const host = makeFiveFileReconcileHost('disposer-unit-five')
  const before = readStateRaw(host.sidecar)

  const step = run(host.root, host.spec)
  assert.match(step.stdout, /leg:reconcile exit=3 count=5/,
    'the DISPOSITIONS step body must print each leg\'s finding count so the disposer sees what one leg ref covers: ' + step.stdout)

  const perEntry = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-five-w1', ONE_LEG_WAIVE()), '--waived', '1', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(perEntry.status, 2,
    'a per-entry tally (--waived 1) must be refused — verdict.js would subtract 1 from 5 and derive HARD_FINDINGS forever: ' + perEntry.stdout + perEntry.stderr)
  assert.match(perEntry.stderr, /leg:reconcile=5/,
    'the refusal must name the leg weight so the recount is mechanical: ' + perEntry.stderr)
  assert.strictEqual(readStateRaw(host.sidecar), before, 'a refused mark must leave review-state.json byte-identical')
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')), 'a refused mark must write no disposer-return-1.json')

  const weighted = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-five-w5', ONE_LEG_WAIVE()), '--waived', '5', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(weighted.status, 0,
    'one leg:reconcile waive must cover the leg\'s whole count (--waived 5): ' + weighted.stdout + weighted.stderr)
  const state = readState(host.sidecar)
  assert.deepStrictEqual(state.dispositions, { waived: 5, rejected: 0, fixDispatched: 0, word: 'CLEAN' },
    'the verdict pass must derive CLEAN from the weighted count: ' + JSON.stringify(state.dispositions))
  assert.strictEqual(state.disposer.iteration, 1, JSON.stringify(state.disposer))
})

test('disposition-pool unit: WHEN the same five-file reconcile row is waived with --waived 6 THE SYSTEM refuses (exit 2) — the weighted tally check stays meaningful in both directions', () => {
  const host = makeFiveFileReconcileHost('disposer-unit-over')
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file',
    returnFileWith('disposer-unit-over-w6', ONE_LEG_WAIVE()), '--waived', '6', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 2, 'an over-count must still die: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /do not match the return's final-or-recommended tallies/, r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')))
})
