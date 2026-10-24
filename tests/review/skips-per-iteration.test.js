'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeCountHost, run, stateOf, fixRound, sidecarState, writeSkipsFile } = require('./review-driver.fixtures')

// specs/20261024/01-review-driver-reads-recorded-facts.md D3/D5 — SKIPS is decided per iteration
// from the gate's current count against the count recorded at extraction.

test('AC-20261024-01-6: WHEN a fix-applied round gate reports 3 skips and the live iteration recorded a skipsGateCount of 1 THE SYSTEM lands SKIPS and prints the extraction step', () => {
  const host = makeCountHost(1)
  run(host.root, host.spec)
  const file = writeSkipsFile('s6.txt', ['AC-20260820-99-2: foo() returns 42'])
  const m = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  assert.strictEqual(m.status, 0, 'setup precondition: skips-extracted must be accepted: ' + m.stdout + m.stderr)
  host.setCount(3)
  const fix = fixRound(host, 's6')
  assert.strictEqual(fix.status, 0, 'setup precondition: the fix round must be accepted: ' + fix.stdout + fix.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS',
    'new skipped tests introduced by a fix round must re-enter SKIPS — a sticky boolean lets skip-reconcile run against an empty list while the gate shows 3: ' + fix.stdout)
  assert.match(fix.stdout, /extract skipped-test names/,
    'the fix-applied output must print the skip extraction step: ' + fix.stdout)
})

test('AC-20261024-01-7: WHEN fix-applied re-runs legs after a skips re-run THE SYSTEM passes the prior iteration skips file so legsMode[3].skipsFile equals the earlier file', () => {
  const host = makeCountHost(1)
  run(host.root, host.spec)
  const file = writeSkipsFile('s7.txt', ['AC-20260820-99-2: foo() returns 42'])
  run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  const fix = fixRound(host, 's7')
  assert.strictEqual(fix.status, 0, 'setup precondition: the fix round must be accepted: ' + fix.stdout + fix.stderr)
  const mode = (sidecarState(host).legsMode || {})['3']
  assert.ok(mode, 'setup precondition: the fix round must record legsMode for iteration 3')
  assert.strictEqual(mode.skipsFile, fs.realpathSync(file),
    'the fix-delta legs run must carry the earlier skips file — without it skip attribution is lost for every skip already extracted: ' + JSON.stringify(mode))
})

test('AC-20261024-01-9: WHEN skips-extracted is given a file with zero non-blank lines while the gate reports skips THE SYSTEM exits 2 naming the gate count, writes no manifest and leaves review-state.json byte-identical', () => {
  const host = makeCountHost(26)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'SKIPS', 'setup precondition: a gate reporting 26 skips must land SKIPS')
  const statePath = path.join(host.sidecar, 'review-state.json')
  const before = fs.readFileSync(statePath, 'utf8')
  const manifestsBefore = fs.readdirSync(host.sidecar).filter((f) => /^manifest-/.test(f)).sort()
  const file = writeSkipsFile('s9.txt', [])
  fs.writeFileSync(file, '\n   \n\t\n')

  const r = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  assert.strictEqual(r.status, 2,
    'an empty skip file against a gate reporting 26 skips must be refused — accepting it lets a review reach CLEAN with every skip unreconciled: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /\b26\b/, 'the refusal must name the gate skip count: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(statePath, 'utf8'), before,
    'a refused mark must leave review-state.json byte-identical: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(fs.readdirSync(host.sidecar).filter((f) => /^manifest-/.test(f)).sort(), manifestsBefore,
    'a refused mark must write no manifest: ' + r.stdout + r.stderr)
})

test('AC-20261024-01-10: WHEN the skips file holds 2 non-blank lines and the gate reports 3 skips THE SYSTEM exits 0, prints exactly one mismatch warning line and runs legs with that file', () => {
  const host = makeCountHost(3)
  run(host.root, host.spec)
  const file = writeSkipsFile('s10.txt', ['AC-20260820-99-2: foo() returns 42', 'tests/foo.test.js::foo'])
  const r = run(host.root, host.spec, '--mark', 'skips-extracted', '--file', file)
  assert.strictEqual(r.status, 0, 'a count mismatch is a warning, not a refusal — runners group identical skips into one line: ' + r.stdout + r.stderr)
  const hits = (r.stdout + r.stderr).split('\n').filter((l) => /⚠ skip file lists 2 names, gate reported 3 skips/.test(l))
  assert.strictEqual(hits.length, 1,
    'exactly one mismatch warning line must print so the session sees the discrepancy once: ' + r.stdout + r.stderr)
  const mode = (sidecarState(host).legsMode || {})['2']
  assert.strictEqual(mode && mode.skipsFile, fs.realpathSync(file),
    'legs must still run with the supplied skips file despite the mismatch: ' + JSON.stringify(mode))
})
