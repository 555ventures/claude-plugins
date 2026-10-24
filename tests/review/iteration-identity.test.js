'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeCountHost, run, stateOf, returnFileWith, fixRound, sidecarState, writeSkipsFile, CLEAN_RETURN } = require('./review-driver.fixtures')

// specs/20261024/01-review-driver-reads-recorded-facts.md D1/D2/D4/D7 — a manifest's number is a
// storage key; its kind, the fix-round count and the live iteration are read from recorded facts.

const readRows = (host, n) => fs.readFileSync(path.join(host.sidecar, `manifest-${n}.jsonl`), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))

// A gate reporting skips, driven to REVIEWER through a skips re-run (manifest-1 full, manifest-2 full).
function toReviewerViaSkips(tag, count = 1) {
  const host = makeCountHost(count)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'setup precondition: a gate reporting skips must land SKIPS before the extraction can be exercised')
  const file = writeSkipsFile(tag + '.txt', ['AC-20260820-99-2: foo() returns 42'])
  const r = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  assert.strictEqual(r.status, 0, 'setup precondition: a valid skips-extracted mark must be accepted: ' + r.stdout + r.stderr)
  return { host, file, r }
}

test('AC-20261024-01-1: WHEN skips-extracted has written manifest-2 THE SYSTEM prints the plain reviewer dispatch step and never the string fix-delta pass, because manifest-2 rows are scope full', () => {
  const { host, r } = toReviewerViaSkips('id1')
  assert.ok(readRows(host, 2).every((x) => x.scope === undefined || x.scope === 'full'),
    'setup precondition: the skips re-run manifest must be a full-scope manifest')
  assert.match(r.stdout, /## Step: dispatch the reviewer\n/,
    'the REVIEWER step after a skips re-run must be the plain dispatch — the fix-delta variant names a delta file and prior returns that do not exist: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /fix-delta pass/,
    'a skips re-run is not a fix round — printing the fix-delta variant sends the reviewer to a missing fix-delta-2.txt: ' + r.stdout)
})

test('AC-20261024-01-2: WHEN a skips re-run produced manifest-2 and one fix-applied round produced manifest-3 THE SYSTEM accepts a second fix-applied (manifest-4) and refuses the third with the iteration cap 2 reached message', () => {
  const { host } = toReviewerViaSkips('id2')
  const first = fixRound(host, 'id2a')
  assert.strictEqual(first.status, 0, 'the first fix-applied after a skips re-run must be accepted: ' + first.stdout + first.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: the first fix round must return to REVIEWER: ' + first.stdout)

  const second = fixRound(host, 'id2b')
  assert.strictEqual(second.status, 0,
    'the second fix-applied must be accepted — counting the skips manifest as a fix round halves the fix budget to one round: ' + second.stdout + second.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-4.jsonl')),
    'an accepted second fix-applied must write manifest-4.jsonl: ' + second.stdout + second.stderr)

  const third = fixRound(host, 'id2c')
  assert.strictEqual(third.status, 2, 'a third fix-applied must be refused at the cap: ' + third.stdout + third.stderr)
  assert.match(third.stdout + third.stderr, /iteration cap 2 reached/,
    'the cap refusal must keep naming iteration cap 2 reached: ' + third.stdout + third.stderr)
})

test('AC-20261024-01-4: WHEN manifest-2.jsonl is deleted while the recorded iteration is 2 and manifest-1.jsonl exists THE SYSTEM re-runs legs writing manifest-2.jsonl again and never judges manifest-1 live', () => {
  const { host } = toReviewerViaSkips('id4')
  assert.strictEqual(sidecarState(host).iteration, 2, 'setup precondition: the skips re-run must record iteration 2')
  fs.unlinkSync(path.join(host.sidecar, 'manifest-2.jsonl'))

  const r = run(host.root, host.spec)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'manifest-2.jsonl')),
    'the recorded iteration says 2 and its evidence is gone — the driver must regenerate manifest-2 instead of judging stale manifest-1: ' + r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /manifest-1\.jsonl/,
    'the printed step must not name manifest-1 as the live manifest — the reviewer would judge pre-attribution evidence: ' + r.stdout)
})

test('AC-20261024-01-8: WHEN skips-extracted follows a fix-delta iteration THE SYSTEM writes the next manifest as a fix-delta pass, copies fix-delta-N.txt byte-identical, records fixDeltaFrom, and the REVIEWER step names the recorded reviewer-return', () => {
  const host = makeCountHost(0)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: a zero-skip gate must reach REVIEWER')
  host.setCount(3)
  const fix = fixRound(host, 'id8')
  assert.strictEqual(fix.status, 0, 'setup precondition: the fix round must be accepted: ' + fix.stdout + fix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS', 'setup precondition: a fix round whose gate reports 3 skips must land SKIPS')

  const file = writeSkipsFile('id8.txt', ['a', 'b', 'c'])
  const r = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  assert.strictEqual(r.status, 0, 'setup precondition: skips-extracted must be accepted: ' + r.stdout + r.stderr)

  const scoped = readRows(host, 3).filter((x) => x.scope)
  assert.ok(scoped.length > 0 && scoped.every((x) => x.scope === 'fix-delta'),
    'a skip re-run inside a fix round must be a fix-delta pass — a full-scope manifest sends the reviewer over the whole diff again: ' + JSON.stringify(scoped))
  const d2 = path.join(host.sidecar, 'fix-delta-2.txt')
  const d3 = path.join(host.sidecar, 'fix-delta-3.txt')
  assert.ok(fs.existsSync(d3) && fs.readFileSync(d3, 'utf8') === fs.readFileSync(d2, 'utf8'),
    'fix-delta-3.txt must be a byte-identical copy of fix-delta-2.txt — the reviewer would otherwise get no changed-file list: ' + r.stdout)
  const from = sidecarState(host).fixDeltaFrom || {}
  assert.strictEqual(from['3'], from['2'],
    'fixDeltaFrom[3] must inherit fixDeltaFrom[2] — otherwise the prior-return files are derived by n - 1 arithmetic: ' + JSON.stringify(from))
  assert.strictEqual(from['2'], 1, 'fix-applied must record fixDeltaFrom[2] = 1 (the iteration whose return it fixes): ' + JSON.stringify(from))
  assert.match(r.stdout, /reviewer-return-1\.json/,
    'the REVIEWER step must name reviewer-return-1.json from the recorded fixDeltaFrom, not reviewer-return-2.json: ' + r.stdout)
  assert.doesNotMatch(r.stdout, /reviewer-return-2\.json/,
    'naming reviewer-return-2.json points the reviewer at a return that was never written for this pass: ' + r.stdout)
})

test('AC-20261024-01-14: WHEN a review with one skips re-run and one fix round reaches its close verdict THE SYSTEM writes iteration 1 on the review ledger row', () => {
  const { host } = toReviewerViaSkips('id14')
  const fix = fixRound(host, 'id14')
  assert.strictEqual(fix.status, 0, 'setup precondition: the fix round must be accepted: ' + fix.stdout + fix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup precondition: the fix round must return to REVIEWER')
  const clean = Object.assign({}, CLEAN_RETURN, { scope: 'fix-delta' })
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('id14-clean', clean))
  assert.strictEqual(r.status, 0, 'setup precondition: a clean fix-delta return must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup precondition: a clean return must land CLOSE: ' + r.stdout + r.stderr)

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const rows = fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.stage === 'review')
  assert.strictEqual(rows[rows.length - 1].iteration, 1,
    'the ledger row must record one fix round (three manifests) as iteration 1 — the manifest number overstates the fix iteration after a skips round: ' + JSON.stringify(rows[rows.length - 1]))
})
