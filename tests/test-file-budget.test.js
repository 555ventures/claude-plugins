'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ROOT, tmpdir } = require('./helpers')

// Pins specs/20260903/07-test-file-budget-guard.md AC-20260903-07-2, -3, -4, -5 (the reporter
// mechanism itself) plus specs/20260909/07-hang-bound-and-port-check.md D1/D2 (AC-20260903-07-6
// retagged to AC-20260909-07-1/-2/-3): the wiring now also carries --test-timeout=45000
// --test-force-exit, and the budget reporter's own destination moves to stderr. Plus
// specs/20260910/01-contention-proof-budget-and-uncapped-suite.md D1/D2/D3: the
// --test-concurrency=3 cap is dropped from both commands (AC-20260910-01-1/-2, retagging
// AC-20260909-07-1/-2), the reporter confirms a suspect serially before reddening it
// (AC-20260910-01-3/-4/-5), and the mocks-driver-client split's test-block accounting
// (AC-20260910-01-7). AC-20260903-07-3/-4 (the OK line and BUDGET_MS/resolveBudget) retag to
// AC-20260910-01-8 (SHALL CONTINUE TO). D7 bounds the confirm child itself against a
// never-resolving test (AC-20260910-01-9) and keeps its measurement truthful rather than
// clamped to the budget (AC-20260910-01-10, a 20-run boundary/flake pin).

const REPORTER_PATH = path.join(ROOT, 'scripts/test-file-budget-reporter.js')

const SLOW_SRC = [
  "const test = require('node:test')",
  "test('slow one', async () => { await new Promise(r => setTimeout(r, 250)) })",
  "test('slow two', async () => { await new Promise(r => setTimeout(r, 250)) })",
  ''
].join('\n')

const FAST_SRC = [
  "const test = require('node:test')",
  "test('fast one', async () => { await new Promise(r => setTimeout(r, 10)) })",
  ''
].join('\n')

const BROKEN_SRC = [
  "const test = require('node:test')",
  "const assert = require('node:assert')",
  "test('broken', () => { assert.strictEqual(1, 2) })",
  ''
].join('\n')

// AC-20260909-07-3's own literal example: a single ~30ms test under a 5ms budget.
const THIRTY_MS_SRC = [
  "const test = require('node:test')",
  "test('thirty ms', async () => { await new Promise(r => setTimeout(r, 30)) })",
  ''
].join('\n')

// AC-20260910-01-3's own literal example: a single ~300ms test, over budget the same whether
// measured under load or alone (SPEC_TEST_BUDGET_CONFIRMING is never consulted) — a genuine,
// unconditional offender.
const CONFIRMED_OFFENDER_SRC = [
  "const test = require('node:test')",
  "test('confirmed offender', async () => { await new Promise(r => setTimeout(r, 300)) })",
  ''
].join('\n')

// AC-20260910-01-4's own literal example: sleeps ~300ms in a normal (parallel) run, ~10ms when
// SPEC_TEST_BUDGET_CONFIRMING=1 — over budget only under load, per A6's measured env-inheritance
// finding.
const CONTENDED_SRC = [
  "const test = require('node:test')",
  "test('contended', async () => {",
  "  const ms = process.env.SPEC_TEST_BUDGET_CONFIRMING === '1' ? 10 : 300",
  "  await new Promise(r => setTimeout(r, ms))",
  "})",
  ''
].join('\n')

// Runs the reporter alone, exactly as D2's Contracts spawnSync recipe does for the serial
// confirm child: --test-concurrency=1, the budget reporter only (no spec reporter, so stdout
// carries only measurement/sentinel lines), SPEC_TEST_BUDGET_CONFIRMING=1, NODE_TEST_CONTEXT
// deleted.
function runConfirmingReporter(root, files, envOverrides) {
  const env = Object.assign({}, process.env, { SPEC_TEST_BUDGET_CONFIRMING: '1' }, envOverrides)
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [
    '--test',
    '--test-concurrency=1',
    '--test-timeout=45000',
    '--test-force-exit',
    '--test-reporter=' + REPORTER_PATH,
    '--test-reporter-destination=stdout',
    ...files
  ], { encoding: 'utf8', cwd: root, env })
}

// Builds the scratch tree AC-20260903-07-2/-3/-5 and AC-20260910-01-5 share: tests/slow.test.js
// (two 250ms tests, ~500ms total per AC-20260910-01-5's own literal example), tests/fast.test.js
// (one 10ms test), under a fresh tmpdir() root.
function seedSlowFastTree() {
  const root = tmpdir('test-file-budget')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/slow.test.js'), SLOW_SRC)
  fs.writeFileSync(path.join(root, 'tests/fast.test.js'), FAST_SRC)
  return root
}

// Runs the two-reporter invocation specs/20260909/07's D1/D2 pin: --test-timeout=45000
// --test-force-exit, the spec reporter destined to stdout, the budget reporter (given as an
// absolute path per A5) destined to **stderr** — over the given repo-relative file paths,
// cwd = the scratch root, with NODE_TEST_CONTEXT deleted from the child env (the nested-runner
// scrub every exec-a-runner test in this repo applies).
function runBudgetedSuite(root, files, envOverrides) {
  const env = Object.assign({}, process.env, envOverrides)
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [
    '--test',
    '--test-timeout=45000',
    '--test-force-exit',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=' + REPORTER_PATH,
    '--test-reporter-destination=stderr',
    ...files
  ], { encoding: 'utf8', cwd: root, env })
}

test('AC-20260903-07-2: a file over the tightened SPEC_TEST_FILE_BUDGET_MS budget prints one __FILE_BUDGET_RED__ line naming it on stderr and fails the run even though every test passed', () => {
  const root = seedSlowFastTree()
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '300' })
  assert.strictEqual(r.status, 1,
    'an over-budget file must exit the run 1 even with all tests passing; stderr: ' + r.stderr)
  const out = r.stdout || ''
  const err = r.stderr || ''
  const redLines = err.split('\n').filter(l => l.startsWith('__FILE_BUDGET_RED__'))
  assert.strictEqual(redLines.length, 1,
    'exactly one __FILE_BUDGET_RED__ line is expected on stderr for the single offending file, got: ' + JSON.stringify(redLines) + ' (stdout: ' + out + ')')
  const line = redLines[0]
  assert.ok(line.startsWith('__FILE_BUDGET_RED__ tests/slow.test.js '),
    'the red line must name the offending file path right after the sentinel: ' + line)
  const rest = line.slice('__FILE_BUDGET_RED__ tests/slow.test.js '.length)
  const m = rest.match(/^(\d+)ms > 300ms/)
  assert.ok(m, 'the next token after the file path must be an integer duration followed by "ms > 300ms": ' + line)
  assert.ok(line.includes('split this file'),
    'the red line must name the remedy ("split this file") so the reader does not need the spec: ' + line)
  assert.ok(!err.includes('__FILE_BUDGET_OK__'),
    'an over-budget run must not also print an OK line — the reporter is not undecided: ' + err)
  assert.ok(!out.includes('__FILE_BUDGET_RED__') && !out.includes('__FILE_BUDGET_OK__'),
    'AC-20260909-07-3: the budget reporter is wired to stderr — neither sentinel may leak onto stdout: ' + out)
  assert.match(out, /ℹ tests 3/,
    'the budget reporter must not suppress the spec reporter\'s own test count summary: ' + out)
  assert.match(out, /ℹ fail 0/,
    'all three tests passed, so the underlying run must still report zero failures: ' + out)
})

// AC-20260910-01-8 (SHALL CONTINUE TO, retagged from AC-20260903-07-3 / carried via
// AC-20260909-07-3): a healthy suite still prints exactly one __FILE_BUDGET_OK__ line on
// stderr and none on stdout once the confirm step exists — a suite with zero suspects never
// reaches the serial child, so this invariant is untouched by D2.
test('AC-20260910-01-8 (SHALL CONTINUE TO): the same tree under a loose budget exits 0 and prints exactly one __FILE_BUDGET_OK__ line on stderr naming the slowest file, and none on stdout', () => {
  const root = seedSlowFastTree()
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '5000' })
  assert.strictEqual(r.status, 0,
    'every file is under a 5000ms budget, so the run must exit 0; stderr: ' + r.stderr)
  const out = r.stdout || ''
  const err = r.stderr || ''
  assert.match(out, /ℹ tests 3/,
    'the spec reporter\'s test-count summary must survive alongside the budget reporter: ' + out)
  const okLines = err.split('\n').filter(l => l.startsWith('__FILE_BUDGET_OK__'))
  assert.strictEqual(okLines.length, 1,
    'exactly one __FILE_BUDGET_OK__ line is expected on stderr for an under-budget run, got: ' + JSON.stringify(okLines) + ' (stdout: ' + out + ')')
  const m = okLines[0].match(/^__FILE_BUDGET_OK__ slowest tests\/slow\.test\.js (\d+)ms of 5000ms$/)
  assert.ok(m,
    'the OK line must read "slowest <file> <ms>ms of 5000ms" naming the slowest file: ' + okLines[0])
  assert.ok(!err.includes('__FILE_BUDGET_RED__'),
    'an under-budget run must never also print a red line: ' + err)
  assert.ok(!out.includes('__FILE_BUDGET_OK__') && !out.includes('__FILE_BUDGET_RED__'),
    'neither sentinel may leak onto stdout now that the budget reporter is destined to stderr: ' + out)
})

test('AC-20260909-07-3: SPEC_TEST_FILE_BUDGET_MS=5 over a 30ms fixture prints __FILE_BUDGET_RED__ on stderr and exits 1', () => {
  const root = tmpdir('test-file-budget-30ms')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/thirty.test.js'), THIRTY_MS_SRC)
  const r = runBudgetedSuite(root, ['tests/thirty.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '5' })
  assert.strictEqual(r.status, 1,
    'a ~30ms file over a 5ms budget must fail the run even though the underlying test passed: stdout=' + r.stdout + ' stderr=' + r.stderr)
  const err = r.stderr || ''
  const out = r.stdout || ''
  assert.ok(err.includes('__FILE_BUDGET_RED__'),
    'the red sentinel must appear on stderr for this exact AC-20260909-07-3 example (5ms budget, 30ms fixture): ' + err)
  assert.ok(!out.includes('__FILE_BUDGET_RED__') && !out.includes('__FILE_BUDGET_OK__'),
    'neither sentinel may leak onto stdout: ' + out)
})

test('AC-20260910-01-8 (SHALL CONTINUE TO, retagged from AC-20260903-07-4): resolveBudget tightens only from a fixed 45000ms BUDGET_MS and BUDGET_MS itself equals 45000', () => {
  // Required in-process per the dispatch instructions: a missing reporter module fails this
  // assertion (and the test), never crashes the file.
  const reporterModule = require(REPORTER_PATH)
  assert.strictEqual(reporterModule.BUDGET_MS, 45000,
    'BUDGET_MS must be the fixed 45-second constant the whole spec is calibrated against')
  assert.strictEqual(reporterModule.resolveBudget({}), 45000,
    'with no env override resolveBudget must return the default BUDGET_MS')
  assert.strictEqual(reporterModule.resolveBudget({ SPEC_TEST_FILE_BUDGET_MS: '300' }), 300,
    'a smaller positive integer must tighten the budget down to that value')
  assert.strictEqual(reporterModule.resolveBudget({ SPEC_TEST_FILE_BUDGET_MS: '999999999' }), 45000,
    'a value larger than BUDGET_MS must never loosen the budget past 45000')
  for (const bad of ['0', '-5', 'abc', '1.5', '']) {
    assert.strictEqual(reporterModule.resolveBudget({ SPEC_TEST_FILE_BUDGET_MS: bad }), 45000,
      'a non-positive-integer override (' + JSON.stringify(bad) + ') must fall back to the default 45000, never loosen or crash')
  }
})

test('AC-20260903-07-5: a failing test under budget still exits 1 while the reporter still prints exactly one OK line', () => {
  const root = seedSlowFastTree()
  fs.writeFileSync(path.join(root, 'tests/broken.test.js'), BROKEN_SRC)
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js', 'tests/broken.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '5000' })
  assert.strictEqual(r.status, 1,
    'a genuine test failure must still exit the run 1 regardless of the budget reporter; stderr: ' + r.stderr)
  const out = r.stdout || ''
  const err = r.stderr || ''
  assert.match(out, /ℹ fail 1/,
    'node:test\'s own failure count must reach the summary unmodified: ' + out)
  const okLines = err.split('\n').filter(l => l.startsWith('__FILE_BUDGET_OK__'))
  assert.strictEqual(okLines.length, 1,
    'the budget reporter must still print exactly one OK line on stderr — it never masks a runner failure by omitting its own output: ' + JSON.stringify(okLines) + ' (stdout: ' + out + ')')
})

// AC-20260909-07-1/-2 retag to AC-20260910-01-1/-2: D1 (specs/20260910/01) drops
// --test-concurrency=3 from both commands with no replacement flag, so node --test uses its
// own default fan-out (os.availableParallelism() - 1).
test('AC-20260910-01-1: package.json scripts.test and .claude/spec.config.json testCommand carry D1\'s uncapped wiring (no --test-concurrency, timeout, force-exit, budget reporter on stderr) byte-for-byte', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  const expectedTestCommand = 'node --test --test-timeout=45000 --test-force-exit ' +
    '--test-reporter=spec --test-reporter-destination=stdout ' +
    '--test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stderr'
  assert.strictEqual(config.testCommand, expectedTestCommand,
    'testCommand must equal D1\'s string byte-for-byte with --test-concurrency=3 removed and no replacement flag — the runner\'s own default fan-out must be free to apply: got ' + JSON.stringify(config.testCommand))
  assert.strictEqual(pkg.scripts.test, config.testCommand + " 'tests/**/*.test.js'",
    'npm test and the host testCommand must be pinned identical modulo the trailing glob so they cannot drift apart: got ' + JSON.stringify(pkg.scripts.test))
})

test('AC-20260910-01-2: .claude/spec.config.json gateCommand carries D1\'s uncapped wiring (no --test-concurrency, timeout, force-exit) byte-for-byte on the scoped-run form', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  assert.strictEqual(config.gateCommand, 'node --test --test-timeout=45000 --test-force-exit {testDirs}',
    'gateCommand must equal D1\'s string byte-for-byte with --test-concurrency=3 removed and no replacement flag — a capped gate run defeats the point of dropping the suite-wide cap: got ' + JSON.stringify(config.gateCommand))
})

// AC-20260910-01-3's own literal example is a confirmed offender: over budget both under load
// and alone, so a serial confirm changes nothing observable about the outcome (D2's Contracts:
// the confirmed-red output "keeps its existing text and meaning"). This assertion set is
// therefore satisfied by both the pre-D2 reporter (which reds any suspect immediately, with no
// confirm step at all) and the post-D2 reporter — it is a continuity pin for the confirmed-red
// path, not a red-until-D2-lands pin; see the deviations sidecar.
test('AC-20260910-01-3: a two-file fixture where one file is over budget both under load and alone prints exactly one __FILE_BUDGET_RED__ line naming it, no contention line, and exits 1 — a confirmed offender', () => {
  const root = tmpdir('contention-confirmed-offender')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/slow.test.js'), CONFIRMED_OFFENDER_SRC)
  fs.writeFileSync(path.join(root, 'tests/fast.test.js'), FAST_SRC)
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '50' })
  assert.strictEqual(r.status, 1,
    'a confirmed offender must exit the run 1 even though every test passed: stdout=' + r.stdout + ' stderr=' + r.stderr)
  const err = r.stderr || ''
  const redLines = err.split('\n').filter((l) => l.startsWith('__FILE_BUDGET_RED__'))
  assert.strictEqual(redLines.length, 1,
    'exactly one __FILE_BUDGET_RED__ line is expected for the confirmed offender: ' + JSON.stringify(redLines) + ' stderr=' + err)
  assert.ok(redLines[0].startsWith('__FILE_BUDGET_RED__ tests/slow.test.js '),
    'the red line must name the offending file right after the sentinel: ' + redLines[0])
  const m = redLines[0].match(/^__FILE_BUDGET_RED__ tests\/slow\.test\.js (\d+)ms > 50ms/)
  assert.ok(m, 'the red line must carry an integer duration followed by "ms > 50ms": ' + redLines[0])
  assert.ok(!err.includes('__FILE_BUDGET_CONTENTION__'),
    'a confirmed offender must never also print a contention line — the confirm step resolved it one way, not both: ' + err)
})

test('AC-20260910-01-4: a file over budget under load but under budget alone prints __FILE_BUDGET_CONTENTION__ naming it, prints no __FILE_BUDGET_RED__ line for it, and leaves the run\'s exit code at the underlying (passing) test result', () => {
  const root = tmpdir('contention-not-confirmed')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/contended.test.js'), CONTENDED_SRC)
  const r = runBudgetedSuite(root, ['tests/contended.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '50' })
  assert.strictEqual(r.status, 0,
    'a file that is only slow under load, and measures under budget alone in the serial confirm, must not fail the run: stdout=' + r.stdout + ' stderr=' + r.stderr)
  const err = r.stderr || ''
  assert.ok(!err.includes('__FILE_BUDGET_RED__'),
    'a suspect the confirm clears must never print a red line for it: ' + err)
  const contentionLines = err.split('\n').filter((l) => l.startsWith('__FILE_BUDGET_CONTENTION__'))
  assert.strictEqual(contentionLines.length, 1,
    'exactly one contention line is expected on stderr: ' + JSON.stringify(contentionLines) + ' stderr=' + err)
  const m = contentionLines[0].match(/^__FILE_BUDGET_CONTENTION__ tests\/contended\.test\.js (\d+)ms under load but (\d+)ms alone — under the 50ms budget, not a red$/)
  assert.ok(m,
    'the contention line must match the Contracts format exactly: ' + contentionLines[0])
  assert.ok(Number(m[1]) > 50,
    'the load measurement named in the contention line must itself have exceeded the budget (that is why it was a suspect at all): got ' + m[1])
  assert.ok(Number(m[2]) < 50,
    'the alone measurement named in the contention line must be under the budget (that is why the confirm cleared it): got ' + m[2])
  const out = r.stdout || ''
  assert.ok(!out.includes('__FILE_BUDGET_RED__') && !out.includes('__FILE_BUDGET_CONTENTION__'),
    'neither sentinel may leak onto stdout: ' + out)
})

test('AC-20260910-01-5: running the reporter with SPEC_TEST_BUDGET_CONFIRMING=1 over an over-budget fixture prints exactly one __FILE_BUDGET_MEASURED__ line per file, no RED/OK/CONTENTION line, and exits 0 when every test passed', () => {
  const root = seedSlowFastTree()
  const r = runConfirmingReporter(root, ['tests/slow.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '50' })
  assert.strictEqual(r.status, 0,
    'a passing file run in confirming mode must exit 0 regardless of the budget — the child mode measures, it never judges: stdout=' + r.stdout + ' stderr=' + r.stderr)
  const out = r.stdout || ''
  const measuredLines = out.split('\n').filter((l) => l.startsWith('__FILE_BUDGET_MEASURED__'))
  assert.strictEqual(measuredLines.length, 1,
    'exactly one __FILE_BUDGET_MEASURED__ line is expected for the one file given — a second would mean the confirming child spawned and recursed: ' + JSON.stringify(measuredLines) + ' stdout=' + out)
  assert.match(measuredLines[0], /^__FILE_BUDGET_MEASURED__ tests\/slow\.test\.js \d+(\.\d+)?ms$/,
    'the MEASURED line must match the Contracts format exactly ("__FILE_BUDGET_MEASURED__ <relpath> <ms>ms", <ms> raw and possibly fractional — the reporter no longer rounds before the parent compares it against the budget): ' + measuredLines[0])
  assert.ok(!out.includes('__FILE_BUDGET_RED__') && !out.includes('__FILE_BUDGET_OK__') && !out.includes('__FILE_BUDGET_CONTENTION__'),
    'confirming mode must never print a judging sentinel — a RED or OK or CONTENTION line here would mean the child mode judged instead of just measuring: ' + out)
})

// AC-20260910-01-9's own literal fixture: a single test whose Promise never settles.
const HANG_SRC = [
  "const test = require('node:test')",
  "test('hangs', () => new Promise(() => {}))",
  ''
].join('\n')

test('AC-20260910-01-9: a file holding a test that never resolves is confirmed __FILE_BUDGET_RED__ within roughly the budget window, exits non-zero, and leaves no surviving child process — never an unbounded hang', () => {
  const reporterModule = require(REPORTER_PATH)
  assert.strictEqual(reporterModule.CHILD_STARTUP_SLACK_MS, 30000,
    'D7: CHILD_STARTUP_SLACK_MS must be the fixed 30000ms process-startup allowance the confirm child\'s spawnSync timeout is built from — a drift here silently changes how long a hung file is allowed to block the run: got ' + reporterModule.CHILD_STARTUP_SLACK_MS)

  const root = tmpdir('test-file-budget-hang')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/hang.test.js'), HANG_SRC)

  const env = Object.assign({}, process.env, { SPEC_TEST_FILE_BUDGET_MS: '500' })
  delete env.NODE_TEST_CONTEXT

  // This test's own hard wall-clock ceiling: generous against the AC's own "~2s" expectation,
  // but a hard stop so that a D7 regression (an unbounded confirm child) fails THIS assertion
  // via a killed, non-null `signal` rather than hanging the whole suite the way the reviewed
  // incident did. spawnSync only returns once the child's inherited stdio pipes close, which
  // (absent detached grandchildren) only happens once every descendant process has exited —
  // so a clean, un-killed return here is itself the proof that nothing survived the run.
  const HARD_CEILING_MS = 8000
  const startedAt = Date.now()
  const r = spawnSync(process.execPath, [
    '--test',
    '--test-timeout=500',
    '--test-force-exit',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=' + REPORTER_PATH,
    '--test-reporter-destination=stderr',
    'tests/hang.test.js'
  ], { encoding: 'utf8', cwd: root, env, timeout: HARD_CEILING_MS, killSignal: 'SIGKILL' })
  const elapsedMs = Date.now() - startedAt

  assert.strictEqual(r.signal, null,
    'the run must exit on its own well inside this test\'s ' + HARD_CEILING_MS + 'ms hard ceiling, never be killed by it — a non-null signal (' + r.signal + ') means D7\'s bound regressed to unbounded and the confirm child (or the run itself) hung: status=' + r.status + ' elapsedMs=' + elapsedMs + ' stdout=' + r.stdout + ' stderr=' + r.stderr)
  assert.ok(elapsedMs < HARD_CEILING_MS,
    'D7 bounds the confirm child to roughly the budget window (500ms * 2 suspects + startup slack for the child itself, ~1-2s total here), not an unbounded hang — the run took ' + elapsedMs + 'ms against an ' + HARD_CEILING_MS + 'ms hard ceiling')
  assert.notStrictEqual(r.status, 0,
    'a file holding a test that never resolves must fail the run, never exit 0: stdout=' + r.stdout + ' stderr=' + r.stderr)
  const err = r.stderr || ''
  assert.ok(err.includes('__FILE_BUDGET_RED__ tests/hang.test.js'),
    'the reporter must print __FILE_BUDGET_RED__ naming tests/hang.test.js — an unmeasurable (hung) suspect fails closed as a confirmed offender, per D7\'s Behavior: stderr=' + err)
})

// AC-20260910-01-10: a boundary/flake pin. D7's first attempt set the confirm child's per-test
// timeout to the budget itself, which clamps the very measurement it judges — a 30ms test
// against a 5ms budget measured ~5-6ms (never the true 30ms), and roughly one run in forty
// rounded to exactly the budget, printing __FILE_BUDGET_CONTENTION__ with exit 0 for a
// six-fold offender. A single run of this fixture would have passed against that broken code
// 39 times out of 40, so this test runs the same cheap fixture 20 consecutive times and demands
// __FILE_BUDGET_RED__/exit 1 on every one — the repeat count is the whole point of the pin. The
// AC does not promise the reported duration equals the file's true serial duration (an offender
// more than CHILD_TIMEOUT_FACTOR times over budget is cut off at the child's own timeout and
// reports a lower bound instead) — only that it is strictly greater than the budget, which this
// 30ms-vs-5ms fixture is nowhere near the ceiling for, so every run's RED line must report a
// duration above 5.
test('AC-20260910-01-10: a file that genuinely exceeds the budget alone is confirmed __FILE_BUDGET_RED__ with a reported duration above the budget on every run, never __FILE_BUDGET_CONTENTION__, and the reporter exports CHILD_TIMEOUT_FACTOR === 2', () => {
  const reporterModule = require(REPORTER_PATH)
  assert.strictEqual(reporterModule.CHILD_TIMEOUT_FACTOR, 2,
    'D7: CHILD_TIMEOUT_FACTOR must be the fixed multiplier that keeps the confirm child\'s per-test timeout strictly above the budget it is measuring against — at factor 1 the threshold clamps the very number it judges: got ' + reporterModule.CHILD_TIMEOUT_FACTOR)

  const root = tmpdir('test-file-budget-boundary')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/thirty.test.js'), THIRTY_MS_SRC)

  const BUDGET_MS_FOR_TEST = 5
  const RUNS = 20
  for (let i = 0; i < RUNS; i++) {
    const r = runBudgetedSuite(root, ['tests/thirty.test.js'], { SPEC_TEST_FILE_BUDGET_MS: String(BUDGET_MS_FOR_TEST) })
    const err = r.stderr || ''
    assert.strictEqual(r.status, 1,
      'run ' + (i + 1) + '/' + RUNS + ': a genuinely over-budget file (a ~30ms test alone against a 5ms budget) must exit 1 on every single run, never intermittently pass: stdout=' + r.stdout + ' stderr=' + err)
    const redMatch = err.match(/^__FILE_BUDGET_RED__ tests\/thirty\.test\.js (\d+(?:\.\d+)?)ms > 5ms/m)
    assert.ok(redMatch,
      'run ' + (i + 1) + '/' + RUNS + ': must print __FILE_BUDGET_RED__ naming tests/thirty.test.js with a "<ms>ms > 5ms" duration: stderr=' + err)
    assert.ok(Number(redMatch[1]) > BUDGET_MS_FOR_TEST,
      'run ' + (i + 1) + '/' + RUNS + ': AC-20260910-01-10 promises a reported duration strictly greater than the budget (the file\'s true serial duration here, since 30ms is nowhere near the child\'s timeout ceiling) — a clamped measurement would report at or under the 5ms budget: got ' + redMatch[1] + 'ms, stderr=' + err)
    assert.ok(!err.includes('__FILE_BUDGET_CONTENTION__'),
      'run ' + (i + 1) + '/' + RUNS + ': must never print __FILE_BUDGET_CONTENTION__ for a genuine offender — a clamped child timeout measures near the budget instead of the file\'s real ~30ms duration and misclassifies this as contention: stderr=' + err)
  }
})

// AC-20260910-01-7: the two mocks-driver-client sibling files together hold all nine of the
// AC-20260907-10 family's test( blocks, each exactly once, with the exact test name text D3
// requires — pinned as literals here so a rewrite of any one name (not just a dropped or
// duplicated tag) reddens this test.
const KEPT_TEST_NAMES = [
  'AC-20260907-10-1 (D12 minimal): the literal "SIGNOFF" does not occur anywhere in spec/scripts/mocks-driver.js — the state was renamed CLIENT in place, not merely aliased',
  'AC-20260907-10-2: client open --address refuses (exit 2) naming the cause in a state other than CLIENT, with no --address, and against an address that does not answer /client/__notes/list with 200 JSON; against a live serve it exits 0, writes status.client (trailing slash stripped) and prints the exact open line',
  'AC-20260907-10-17: the bare driver in CLIENT prints a client: line reading "client: not opened — expose the served atlas yourself, then: <driver> client open --address <url>" when status.client is absent, or the exact "client: open since <date> — <address>/client/index.html · client notes: A open · B addressed · C waived · questions: Q unanswered" line when present; with a failing look probe it exits 2 naming the install remedy',
  'AC-20260907-10-10: notes address on a client-origin mock-scope note exits 2 naming the serve command without --port; with --port and an npx stub writing the same bytes as the before capture it exits 2 containing "the screen has not changed", leaving the note open with no after file; with a stub writing different bytes it exits 0, sets status addressed and stores capture.after',
]
const MOVED_TEST_NAMES = [
  'AC-20260907-10-11: notes address targeting a client-origin project-scope note exits 2 naming acceptance or waiver',
  'AC-20260907-10-22 (SHALL CONTINUE TO): notes address targeting a session-origin or walk note without --port exits 0 and sets addressed with no capture field',
  'AC-20260907-10-14: notes waive on a question whose at and status.client.openedAt are both 8 days old exits 0, sets the ledger row status "waived <today>", and ledger check exits 0; on a question with no status.client it exits 2 naming client open --address; on a session-origin plain note it exits 2 naming client-origin notes and questions as the only waivable kinds',
  'AC-20260907-10-15: --mark approved on a root holding two waived notes prints "waived: 2" followed by one "  <id> — <reason>" line per waived note before the checkpoint line; with none it prints "waived: 0"; and it exits 0 with no status.client present',
  'AC-20260907-10-16 (SHALL CONTINUE TO): --mark approved refuses with no decided approved stop (naming stop open signoff), on an unresolved mock note anchored to any declared label, and on any journey whose approved is unset',
]

test('AC-20260910-01-7: the mocks-driver-client split holds all nine test( blocks exactly once across the pair, with the exact name text D3 requires in each file', () => {
  const kept = fs.readFileSync(path.join(ROOT, 'tests/mocks/mocks-driver-client.test.js'), 'utf8')
  const moved = fs.readFileSync(path.join(ROOT, 'tests/mocks/mocks-driver-client-2.test.js'), 'utf8')

  function extractNames(src) {
    const re = /test\('((?:[^'\\]|\\.)*)'/g
    const names = []
    let m
    while ((m = re.exec(src))) names.push(m[1])
    return names
  }

  const keptNames = extractNames(kept)
  const movedNames = extractNames(moved)

  assert.deepStrictEqual(keptNames, KEPT_TEST_NAMES,
    'D3: the retained file must hold exactly these four test names, in order, with no text altered — got ' + JSON.stringify(keptNames))
  assert.deepStrictEqual(movedNames, MOVED_TEST_NAMES,
    'D3: the sibling must hold exactly these five test names, in order, with no text altered — got ' + JSON.stringify(movedNames))

  const allNames = keptNames.concat(movedNames)
  assert.strictEqual(new Set(allNames).size, 9,
    'D3: all nine test names must be distinct across the pair — a duplicate would mean a test was copied instead of moved: got ' + allNames.length + ' names, ' + new Set(allNames).size + ' distinct')
})
