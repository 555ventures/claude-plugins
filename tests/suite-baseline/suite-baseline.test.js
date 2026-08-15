'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260814/03-suite-baseline.md (2026-08-14): the repo's expected-failing-test set was
// folklore — prose plus a stale count — so a full-suite run was unjudgeable and a Decision that
// broke five out-of-scope pins shipped through a green scoped gate (the 2026-08-14 escape on
// specs/20260813/10-host-capabilities.md). `spec/scripts/suite-baseline.js` declares the set as
// `.claude/suite-baseline.json` and derives NEW-FAILING / FIXED-NOT-REMOVED drift, plus a
// pre-image mode (`--snapshot` / `--check --pre`) that attributes drift to the build that caused
// it. Every test below spins up a synthetic host in a tmpdir with its own `.claude/spec.config.json`
// `testCommand` and real `node --test` fixture files, so the trailer-parsing path is exercised
// exactly as it runs against a real host, never mocked.

const SCRIPT = 'scripts/suite-baseline.js'

function run(argv) {
  return runNode(SCRIPT, argv)
}

function writeConfig(dir, testCommand) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const cfg = testCommand === undefined ? {} : { testCommand }
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify(cfg) + '\n')
}

function writeBaseline(dir, rows) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'suite-baseline.json'), JSON.stringify({ failing: rows }) + '\n')
}

function writeFile(dir, rel, content) {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

// A node:test fixture file with one test per {name, fails} pair.
function writeTests(dir, rel, specs) {
  const body = specs.map(({ name, fails }) =>
    `test(${JSON.stringify(name)}, () => { ${fails ? "assert.fail('fixture failure')" : 'assert.ok(true)'} })`
  ).join('\n')
  writeFile(dir, rel,
    `'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n${body}\n`)
}

function out(r) {
  return (r.stdout || '') + (r.stderr || '')
}

test('AC-20260814-03-1: --check reports a suite failure absent from the (absent) baseline as NEW-FAILING, exits 1, and names the --update remedy', () => {
  const dir = tmpdir('sb-ac1')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [{ name: 'it fails', fails: true }])

  const r = run(['--check', '--root', dir])
  assert.strictEqual(r.status, 1,
    'a suite failure with no baseline row for it is undeclared drift — --check must exit 1: ' + out(r))
  assert.match(out(r), /NEW-FAILING\s+\S*t\.test\.js\s*::\s*it fails/,
    'the drift report must name the failing (file, test name) pair so a human can find it: ' + out(r))
  assert.match(out(r), /newFailing=1 fixedNotRemoved=0/,
    'the summary line must count exactly one new failure and zero fixed-not-removed: ' + out(r))
  assert.match(out(r), /--update/,
    'the remedy line must name --update as the fix, or the drift is unresolvable from the output alone: ' + out(r))
})

test('AC-20260814-03-2: --check reports a passing test still named in a non-flaky baseline row as FIXED-NOT-REMOVED, exits 1', () => {
  const dir = tmpdir('sb-ac2')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [{ name: 'it passes', fails: false }])
  writeBaseline(dir, [{ file: 't.test.js', name: 'it passes' }])

  const r = run(['--check', '--root', dir])
  assert.strictEqual(r.status, 1,
    'a baseline row whose test now passes is baseline rot — --check must exit 1: ' + out(r))
  assert.match(out(r), /FIXED-NOT-REMOVED\s+\S*t\.test\.js\s*::\s*it passes/,
    'the drift report must name the now-passing (file, test name) pair: ' + out(r))
  assert.match(out(r), /newFailing=0 fixedNotRemoved=1/,
    'the summary must count zero new failures and exactly one fixed-not-removed: ' + out(r))
})

test('AC-20260814-03-3: --check exits 0 with newFailing=0 fixedNotRemoved=0 when the observed failing set exactly equals the baseline', () => {
  const dir = tmpdir('sb-ac3')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [{ name: 'it fails', fails: true }])
  writeBaseline(dir, [{ file: 't.test.js', name: 'it fails' }])

  const r = run(['--check', '--root', dir])
  assert.strictEqual(r.status, 0,
    'the observed failing set exactly matches the declared baseline — this must be a silent pass, not a finding: ' + out(r))
  assert.match(out(r), /newFailing=0 fixedNotRemoved=0/,
    'the summary must report zero drift in both directions on an exact match: ' + out(r))
})

test('AC-20260814-03-4: a "flaky": true baseline row exits 0 whether its test passes or fails', () => {
  const failingDir = tmpdir('sb-ac4-fail')
  writeConfig(failingDir, 'node --test t.test.js')
  writeTests(failingDir, 't.test.js', [{ name: 'flaky one', fails: true }])
  writeBaseline(failingDir, [{ file: 't.test.js', name: 'flaky one', flaky: true }])
  const rFail = run(['--check', '--root', failingDir])
  assert.strictEqual(rFail.status, 0,
    'a flaky row must be exempt from drift when its test is currently failing: ' + out(rFail))

  const passingDir = tmpdir('sb-ac4-pass')
  writeConfig(passingDir, 'node --test t.test.js')
  writeTests(passingDir, 't.test.js', [{ name: 'flaky one', fails: false }])
  writeBaseline(passingDir, [{ file: 't.test.js', name: 'flaky one', flaky: true }])
  const rPass = run(['--check', '--root', passingDir])
  assert.strictEqual(rPass.status, 0,
    'the same flaky row must also be exempt from drift when its test is currently passing: ' + out(rPass))
})

test('AC-20260814-03-5: an absent baseline treats the expected set as empty — a clean suite exits 0, a failing suite exits 1 with NEW-FAILING lines', () => {
  const cleanDir = tmpdir('sb-ac5-clean')
  writeConfig(cleanDir, 'node --test t.test.js')
  writeTests(cleanDir, 't.test.js', [{ name: 'it passes', fails: false }])
  const rClean = run(['--check', '--root', cleanDir])
  assert.strictEqual(rClean.status, 0,
    'no baseline file plus a clean suite must be a silent pass — a host with no failing tests needs no artifact: ' + out(rClean))

  const dirtyDir = tmpdir('sb-ac5-dirty')
  writeConfig(dirtyDir, 'node --test t.test.js')
  writeTests(dirtyDir, 't.test.js', [{ name: 'it fails', fails: true }])
  const rDirty = run(['--check', '--root', dirtyDir])
  assert.strictEqual(rDirty.status, 1,
    'no baseline file plus a failing suite must still be reported as drift, not silently swallowed: ' + out(rDirty))
  assert.match(out(rDirty), /NEW-FAILING\s+\S*t\.test\.js\s*::\s*it fails/,
    'the absent-baseline case must still name the failing test: ' + out(rDirty))
})

test('AC-20260814-03-6: a suite exit 0 derives the empty failing set without parsing output, and a non-zero exit with no parseable trailer exits 4 as unavailable', () => {
  const zeroDir = tmpdir('sb-ac6-zero')
  writeConfig(zeroDir, 'node ok.js')
  writeFile(zeroDir, 'ok.js', "console.log('hello world, not a node:test trailer')\nprocess.exit(0)\n")
  writeBaseline(zeroDir, [{ file: 'ghost.test.js', name: 'ghost test' }])
  const rZero = run(['--check', '--root', zeroDir])
  assert.strictEqual(rZero.status, 1,
    'exit 0 must derive an empty failing set by definition (no output parsing) — with a stale baseline row this is FIXED-NOT-REMOVED drift: ' + out(rZero))
  assert.match(out(rZero), /FIXED-NOT-REMOVED\s+\S*ghost\.test\.js\s*::\s*ghost test/,
    'the zero-parse exit-0 path must still diff against the baseline: ' + out(rZero))
  assert.match(out(rZero), /newFailing=0 fixedNotRemoved=1/,
    'the summary must reflect the zero-parse derivation: ' + out(rZero))

  const badDir = tmpdir('sb-ac6-bad')
  writeConfig(badDir, 'node bad.js')
  writeFile(badDir, 'bad.js', "console.error('boom, not a trailer')\nprocess.exit(1)\n")
  const rBad = run(['--check', '--root', badDir])
  assert.strictEqual(rBad.status, 4,
    'a non-zero exit with no parseable "✖ failing tests:" trailer must be honestly unavailable, never a guess: ' + out(rBad))
  assert.match(out(rBad), /unavailable — cannot extract failing test names from runner output/,
    'the unavailable case must print the exact documented reason: ' + out(rBad))
})

test('AC-20260814-03-7: --update rewrites the baseline to the observed failing set, sorted by file then name, preserving flaky marks on surviving rows and never adding new ones', () => {
  const dir = tmpdir('sb-ac7')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [
    { name: 'still failing', fails: true },
    { name: 'new failure', fails: true },
  ])
  writeBaseline(dir, [
    { file: 't.test.js', name: 'still failing', flaky: true },
    { file: 't.test.js', name: 'old fixed', flaky: false },
  ])

  const r = run(['--update', '--root', dir])
  assert.strictEqual(r.status, 0, '--update must exit 0 on a successful rewrite: ' + out(r))

  const written = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'suite-baseline.json'), 'utf8'))
  assert.strictEqual(written.failing.length, 2,
    'the rewritten baseline must contain exactly the two currently-failing tests, dropping the no-longer-failing "old fixed" row entirely: ' + JSON.stringify(written))
  const names = written.failing.map(row => row.name)
  assert.deepStrictEqual(names, ['new failure', 'still failing'],
    'rows must be sorted by file then name ("new failure" < "still failing" lexically): ' + JSON.stringify(written))
  const stillFailing = written.failing.find(row => row.name === 'still failing')
  assert.strictEqual(stillFailing.flaky, true,
    'a pre-existing flaky mark on a surviving (file,name) row must be preserved across --update: ' + JSON.stringify(written))
  const newFailure = written.failing.find(row => row.name === 'new failure')
  assert.ok(!newFailure.flaky,
    '--update must never set a flaky mark itself — declaring instability is a human judgment: ' + JSON.stringify(written))
})

test('AC-20260814-03-8: an unknown flag, a corrupt baseline, or a config without testCommand all exit 2 naming the remedy', () => {
  const usageDir = tmpdir('sb-ac8-usage')
  writeConfig(usageDir, 'node --test t.test.js')
  const rUsage = run(['--bogus-flag', '--root', usageDir])
  assert.strictEqual(rUsage.status, 2,
    'an unrecognized flag must exit 2 (usage), never silently ignore the flag or crash uninformatively: ' + out(rUsage))
  assert.ok(rUsage.stderr && rUsage.stderr.trim().length > 0,
    'a usage failure must print something actionable to stderr: ' + out(rUsage))

  const corruptDir = tmpdir('sb-ac8-corrupt')
  writeConfig(corruptDir, 'node --test t.test.js')
  writeTests(corruptDir, 't.test.js', [{ name: 'it passes', fails: false }])
  fs.mkdirSync(path.join(corruptDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(corruptDir, '.claude', 'suite-baseline.json'), '{not valid json')
  const rCorrupt = run(['--check', '--root', corruptDir])
  assert.strictEqual(rCorrupt.status, 2,
    'an unreadable baseline JSON must exit 2, never crash with a raw parse exception or silently treat it as empty: ' + out(rCorrupt))

  const noCmdDir = tmpdir('sb-ac8-nocmd')
  writeConfig(noCmdDir, undefined)
  const rNoCmd = run(['--check', '--root', noCmdDir])
  assert.strictEqual(rNoCmd.status, 2,
    'a config lacking testCommand must exit 2 rather than crash or silently no-op: ' + out(rNoCmd))
})

test('AC-20260814-03-8: `spec-paths suite-baseline` prints the registered script\'s path', () => {
  const r = require('../helpers').runBash('bin/spec-paths', ['suite-baseline'])
  assert.strictEqual(r.status, 0,
    'suite-baseline must be a registered spec-paths key — an unregistered key exits with usage and breaks every command that resolves scripts through it: ' + out(r))
  assert.match(r.stdout.trim(), /suite-baseline\.js$/,
    'spec-paths suite-baseline must print the path to spec/scripts/suite-baseline.js: ' + out(r))
})

test('AC-20260814-03-14: --snapshot writes the observed failing set in baseline row shape, or {"failing":[]} on a clean suite, and writes NO file when the trailer is unparseable', () => {
  const failDir = tmpdir('sb-ac14-fail')
  writeConfig(failDir, 'node --test t.test.js')
  writeTests(failDir, 't.test.js', [{ name: 'it fails', fails: true }])
  const failOut = path.join(failDir, 'snap.json')
  const rFail = run(['--snapshot', '--root', failDir, '--out', failOut])
  assert.strictEqual(rFail.status, 0,
    'a snapshot against a parseable failing trailer must succeed: ' + out(rFail))
  const failSnap = JSON.parse(fs.readFileSync(failOut, 'utf8'))
  assert.ok(failSnap.failing.some(row => row.name === 'it fails' && /t\.test\.js$/.test(row.file)),
    'the snapshot must record the observed failing (file, name) pair in baseline row shape: ' + JSON.stringify(failSnap))

  const cleanDir = tmpdir('sb-ac14-clean')
  writeConfig(cleanDir, 'node --test t.test.js')
  writeTests(cleanDir, 't.test.js', [{ name: 'it passes', fails: false }])
  const cleanOut = path.join(cleanDir, 'snap.json')
  const rClean = run(['--snapshot', '--root', cleanDir, '--out', cleanOut])
  assert.strictEqual(rClean.status, 0, 'a snapshot against a clean suite must succeed: ' + out(rClean))
  const cleanSnap = JSON.parse(fs.readFileSync(cleanOut, 'utf8'))
  assert.deepStrictEqual(cleanSnap.failing, [],
    'a clean (exit-0) suite must snapshot to an empty failing array: ' + JSON.stringify(cleanSnap))

  const badDir = tmpdir('sb-ac14-bad')
  writeConfig(badDir, 'node bad.js')
  writeFile(badDir, 'bad.js', "console.error('boom, not a trailer')\nprocess.exit(1)\n")
  const badOut = path.join(badDir, 'snap.json')
  const rBad = run(['--snapshot', '--root', badDir, '--out', badOut])
  assert.strictEqual(rBad.status, 4,
    'an unparseable trailer must exit 4, never a guessed snapshot: ' + out(rBad))
  assert.ok(!fs.existsSync(badOut),
    'an unparseable trailer must write NO file at all — a partial file would silently redefine "this build\'s fault": ' + out(rBad))
})

test('AC-20260814-03-15: --check --pre attributes a failing test absent from the pre-image as PRE-NEW-FAILING, excluding a test present in the pre-image even though it still counts toward newFailing', () => {
  const dir = tmpdir('sb-ac15')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [
    { name: 'x fails', fails: true },
    { name: 'y fails', fails: true },
  ])
  const preFile = path.join(dir, 'pre.json')
  fs.writeFileSync(preFile, JSON.stringify({ failing: [{ file: 't.test.js', name: 'x fails' }] }))

  const r = run(['--check', '--root', dir, '--pre', preFile])
  assert.strictEqual(r.status, 1,
    'two undeclared failures against an empty baseline is drift — --check must exit 1: ' + out(r))
  assert.match(out(r), /newFailing=2 fixedNotRemoved=0/,
    'both failures are new against the empty baseline: ' + out(r))
  assert.match(out(r), /PRE-NEW-FAILING\s+\S*t\.test\.js\s*::\s*y fails/,
    'the test absent from the pre-image ("y fails") must be attributed as this build\'s own new failure: ' + out(r))
  assert.doesNotMatch(out(r), /PRE-NEW-FAILING\s+\S*t\.test\.js\s*::\s*x fails/,
    'the test already failing in the pre-image ("x fails") must be excluded from PRE-NEW-FAILING — it arrived broken: ' + out(r))
  assert.match(out(r), /preNewFailing=1 preFixed=0/,
    'the pre-image summary must count exactly one build-attributable new failure: ' + out(r))
})

test('AC-20260814-03-16: a "flaky": true baseline row is exempt from both pre-image directions, not only both baseline directions', () => {
  const dir = tmpdir('sb-ac16')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [{ name: 'flaky one', fails: true }])
  writeBaseline(dir, [{ file: 't.test.js', name: 'flaky one', flaky: true }])
  const preFile = path.join(dir, 'pre.json')
  fs.writeFileSync(preFile, JSON.stringify({ failing: [] })) // absent from the pre-image

  const r = run(['--check', '--root', dir, '--pre', preFile])
  assert.strictEqual(r.status, 0,
    'a flaky row must exempt the test from a pre-image false-block even though it is absent from the pre-image and failing now: ' + out(r))
  assert.match(out(r), /preNewFailing=0/,
    'the flaky exemption must apply to the pre-image comparison, not just the baseline comparison: ' + out(r))
})

test('AC-20260814-03-17: --check --pre with a missing or unparseable pre-image file exits 2 naming the remedy, never silently degrading to a baseline-only comparison', () => {
  const dir = tmpdir('sb-ac17')
  writeConfig(dir, 'node --test t.test.js')
  writeTests(dir, 't.test.js', [{ name: 'it passes', fails: false }])

  const rMissing = run(['--check', '--root', dir, '--pre', path.join(dir, 'does-not-exist.json')])
  assert.strictEqual(rMissing.status, 2,
    'a missing --pre file must exit 2 — a silent degrade would report preNewFailing=0 and let this build\'s own breakage warn through as pre-existing: ' + out(rMissing))

  const corruptPre = path.join(dir, 'corrupt-pre.json')
  fs.writeFileSync(corruptPre, '{not valid json')
  const rCorrupt = run(['--check', '--root', dir, '--pre', corruptPre])
  assert.strictEqual(rCorrupt.status, 2,
    'an unparseable --pre file must also exit 2, never fall back to baseline-only comparison: ' + out(rCorrupt))
})
