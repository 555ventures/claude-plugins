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

function run(argv, opts) {
  return runNode(SCRIPT, argv, opts)
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

// specs/20260816/01-gate-baseline-reconcile.md: a fourth mode, --gate, wraps an arbitrary
// resolved gate command and subtracts sanctioned baseline pins from its observed failing set
// by derivation — the reconciliation a session used to perform by hand (2026-08-15 review of
// specs/20260815/01, 21 sanctioned reds hand-verified and the gate re-scoped around them).

test('AC-20260816-01-1: --gate on a command that exits 0 exits 0, passes the child output through unchanged, and prints no __SUITE_BASELINE__ sentinel', () => {
  const dir = tmpdir('sb-gate-ac1')
  const r = run(['--gate', 'echo ok; true', '--root', dir])
  assert.strictEqual(r.status, 0,
    'a green child command must make --gate exit 0 — the wrapper must be invisible on a green gate: ' + out(r))
  assert.match(out(r), /ok/,
    'the child\'s own stdout must pass through unchanged so a green gate reads exactly as an unwrapped gate: ' + out(r))
  assert.doesNotMatch(out(r), /__SUITE_BASELINE__/,
    'a green child run must print no sentinel at all — a sentinel here would falsely imply subtraction happened: ' + out(r))
})

test('AC-20260816-01-2: --gate on a non-zero command whose every parsed failure matches a baseline row (flaky rows counting as matched) reports residual=0 and exits 0', () => {
  const dir = tmpdir('sb-gate-ac2')
  writeTests(dir, 't.test.js', [{ name: 'it fails', fails: true }])
  writeBaseline(dir, [{ file: 't.test.js', name: 'it fails' }])

  const r = run(['--gate', 'node --test t.test.js', '--root', dir])
  assert.strictEqual(r.status, 0,
    'a red child run whose only failure is a sanctioned baseline pin must make --gate exit 0 — this is the whole point of the reconciliation: ' + out(r))
  assert.match(out(r), /__SUITE_BASELINE__ failing=1 sanctioned=1 residual=0/,
    'the sentinel must report the exact failing/sanctioned/residual counts so review/build gate legs can record sanctionedReds: ' + out(r))
})

test('AC-20260816-01-3: --gate on a non-zero command with one sanctioned and one unsanctioned failure prints exactly one NEW-FAILING line, a residual=1 sentinel, and exits 1', () => {
  const dir = tmpdir('sb-gate-ac3')
  writeTests(dir, 't.test.js', [
    { name: 'sanctioned fail', fails: true },
    { name: 'unsanctioned fail', fails: true },
  ])
  writeBaseline(dir, [{ file: 't.test.js', name: 'sanctioned fail' }])

  const r = run(['--gate', 'node --test t.test.js', '--root', dir])
  assert.strictEqual(r.status, 1,
    'a genuinely new (non-baseline) failure must make --gate exit 1 — subtraction must never mask real breakage: ' + out(r))
  const newFailingLines = (out(r).match(/^NEW-FAILING /gm) || [])
  assert.strictEqual(newFailingLines.length, 1,
    'exactly one NEW-FAILING line must be printed, naming only the residual (non-sanctioned) failure, never the sanctioned one too: ' + out(r))
  assert.match(out(r), /NEW-FAILING\s+\S*t\.test\.js\s*::\s*unsanctioned fail/,
    'the single NEW-FAILING line must name the unsanctioned failure specifically: ' + out(r))
  assert.doesNotMatch(out(r), /NEW-FAILING\s+\S*t\.test\.js\s*::\s*sanctioned fail/,
    'the sanctioned failure must never appear as a NEW-FAILING line — it is subtracted, not merely counted: ' + out(r))
  assert.match(out(r), /__SUITE_BASELINE__ failing=2 sanctioned=1 residual=1/,
    'the sentinel must report failing=2 sanctioned=1 residual=1, matching one real new failure against two total: ' + out(r))
})

test('AC-20260816-01-4: --gate on a non-zero command with no parseable "✖ failing tests:" trailer prints the passthrough note and exits with the child\'s own exit code', () => {
  const dir = tmpdir('sb-gate-ac4')
  const r = run(['--gate', 'exit 7', '--root', dir])
  assert.strictEqual(r.status, 7,
    'a non-zero child with no parseable trailer must pass the child\'s own exit code through — the wrapper must never guess or normalize it: ' + out(r))
  assert.match(out(r), /suite-baseline: no failing-test trailer — exit 7 passed through/,
    'the documented passthrough note line must name the child\'s exact exit code — without it a non-test failure (e.g. build-workflows --check) looks unexplained: ' + out(r))
})

test('AC-20260816-01-5: --gate with no .claude/suite-baseline.json file treats the sanctioned set as empty, so a single failure is fully residual and exits 1', () => {
  const dir = tmpdir('sb-gate-ac5')
  writeTests(dir, 't.test.js', [{ name: 'it fails', fails: true }])
  // deliberately no writeBaseline() call — pin-free host

  const r = run(['--gate', 'node --test t.test.js', '--root', dir])
  assert.strictEqual(r.status, 1,
    'an absent baseline must behave exactly as an unwrapped gate — every failure is residual: ' + out(r))
  assert.match(out(r), /__SUITE_BASELINE__ failing=1 sanctioned=0 residual=1/,
    'the sentinel must report sanctioned=0 when no baseline file exists at all: ' + out(r))
  assert.match(out(r), /NEW-FAILING\s+\S*t\.test\.js\s*::\s*it fails/,
    'the lone failure must still be named as NEW-FAILING on a pin-free host: ' + out(r))
})

test('AC-20260816-01-6: --gate strips NODE_TEST_CONTEXT before spawning the child, so a `node --test` child actually executes its files instead of silently skipping them', () => {
  const dir = tmpdir('sb-gate-ac6')
  writeTests(dir, 't.test.js', [{ name: 'it fails', fails: true }])

  // Simulate the wrapper itself running from inside a `node --test` parent (as this very test
  // file does): NODE_TEST_CONTEXT is set in this process's env and inherited by spawnSync
  // unless the wrapper explicitly strips it before invoking the child.
  const r = runNode(SCRIPT, ['--gate', 'node --test t.test.js', '--root', dir],
    { env: { ...process.env, NODE_TEST_CONTEXT: '1' } })

  assert.strictEqual(r.status, 1,
    'with NODE_TEST_CONTEXT stripped the child must actually execute t.test.js and observe its one real failure, exiting 1 — a leaked NODE_TEST_CONTEXT makes the nested `node --test` silently skip execution and exit 0 instead: ' + out(r))
  assert.match(out(r), /__SUITE_BASELINE__ failing=1 sanctioned=0 residual=1/,
    'the sentinel must report the actually-observed failure count, proving the child ran the file rather than silently no-op-ing under an inherited NODE_TEST_CONTEXT: ' + out(r))
})

// Review finding (2026-08-17, review of specs/20260816/01-gate-baseline-reconcile.md), hard
// severity: doGate()'s passthrough branch ended in `process.exit(r.status)`, and spawnSync sets
// status:null on a signal-killed, un-spawnable, or maxBuffer-overflowed child — process.exit(null)
// exits 0. A gate interrupted mid-run (or one whose combined output overruns the default 1MB
// buffer) therefore reported GREEN with no evidence at all, contradicting D2's rationale ("the
// wrapper can only ever turn a red green by name-level proof, never by absence of evidence") and
// INTAKE JJ-20260816-03's bolded "fails closed on any red whose output has no parseable
// trailer." observedFailing() (the --check/--update/--snapshot sibling) already fails closed on
// this exact shape; doGate() dropped that arm. Fix: a status===null branch that exits 1 naming
// the cause, plus a 64MB maxBuffer on runSuite()'s spawnSync options.

test('AC-20260816-01-13: --gate on a child killed by a signal fails closed with exit 1 and names the signal, instead of process.exit(null) silently reporting exit 0', () => {
  const dir = tmpdir('sb-gate-ac13')
  const r = run(['--gate', 'echo running tests; kill -INT $$', '--root', dir])
  assert.strictEqual(r.status, 1,
    'a gate child killed by a signal must fail closed with exit 1 — spawnSync sets status:null on a signal kill, and process.exit(null) exits 0, so a gate interrupted mid-run currently reports green to review and build, and verdict.js derives CLEAN from exit codes alone: ' + out(r))
  assert.match(out(r), /terminated by SIG/,
    'the fail-closed note must name the signal that killed the child, or an interrupted run looks unexplained: ' + out(r))
})

test('AC-20260816-01-14: --gate still reports a genuinely failing gate when the child\'s combined output exceeds spawnSync\'s default 1MB buffer', () => {
  const dir = tmpdir('sb-gate-ac14')
  const cmd = 'head -c 2000000 /dev/zero | tr "\\0" "x"; echo; echo "✖ failing tests:"; ' +
    'echo "test at tests/a.test.js:1:1"; echo "✖ some real failure (1ms)"; exit 1'
  // The 2MB+ gate output round-trips twice: once inside suite-baseline.js's own spawnSync of the
  // gate command (raised to 64MB there), and again here, where THIS test's spawnSync captures
  // suite-baseline.js's own stdout. Without this override the OUTER capture hits Node's 1MB
  // default and this process — not the script under test — gets SIGTERM/ENOBUFS, failing the
  // assertion for a reason unrelated to doGate()'s logic. Do not remove this as a "simplification".
  const r = run(['--gate', cmd, '--root', dir], { maxBuffer: 64 * 1024 * 1024 })
  assert.strictEqual(r.status, 1,
    'a genuinely failing gate must still exit 1 even when its combined output exceeds 1MB — the default maxBuffer truncates and kills the child (ENOBUFS, status:null) before runSuite\'s 64MB maxBuffer raises the ceiling, and without it a failing gate that merely prints more than 1MB is waved through as an unparseable passthrough: ' + out(r))
  assert.match(out(r), /NEW-FAILING\s+\S*tests\/a\.test\.js\s*::\s*some real failure/,
    'the >1MB-output failure must still be parsed and named, proving the buffer was actually raised rather than the failure being silently swallowed: ' + out(r))
})

test('AC-20260816-01-15 (SHALL CONTINUE TO, regression pin for AC-20260816-01-4): --gate on a child that exits non-zero with no parseable trailer still passes the child\'s own numeric exit code through unchanged', () => {
  const dir = tmpdir('sb-gate-ac15')
  const r = run(['--gate', 'exit 7', '--root', dir])
  assert.strictEqual(r.status, 7,
    'a real numeric non-zero exit code with no parseable trailer is informative and distinguishable from a null/signal-killed status, and must still pass through unchanged — collapsing it into the new fail-closed branch would erase this signal for e.g. a bare `exit 7` or a build-workflows --check failure: ' + out(r))
  assert.match(out(r), /suite-baseline: no failing-test trailer — exit 7 passed through/,
    'the existing passthrough note text must still be printed verbatim for a genuine non-zero exit code, unchanged by the new signal/null-status guard: ' + out(r))
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
