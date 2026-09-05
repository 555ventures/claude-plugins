'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ROOT, tmpdir } = require('./helpers')

// Pins specs/20260903/07-test-file-budget-guard.md
// AC-20260903-07-2, -3, -4, -5, -6 — the per-file test-runtime budget reporter and its wiring.

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

// Builds the scratch tree AC-2/AC-3/AC-5 share: tests/slow.test.js (two 250ms tests),
// tests/fast.test.js (one 10ms test), under a fresh tmpdir() root.
function seedSlowFastTree() {
  const root = tmpdir('test-file-budget')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/slow.test.js'), SLOW_SRC)
  fs.writeFileSync(path.join(root, 'tests/fast.test.js'), FAST_SRC)
  return root
}

// Runs the two-reporter invocation the Contracts section pins: spec reporter first, the
// budget reporter (given as an absolute path per A5) second, both destined to stdout, over
// the given repo-relative file paths, cwd = the scratch root, with NODE_TEST_CONTEXT deleted
// from the child env (the nested-runner scrub every exec-a-runner test in this repo applies).
function runBudgetedSuite(root, files, envOverrides) {
  const env = Object.assign({}, process.env, envOverrides)
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [
    '--test',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=' + REPORTER_PATH,
    '--test-reporter-destination=stdout',
    ...files
  ], { encoding: 'utf8', cwd: root, env })
}

test('AC-20260903-07-2: a file over the tightened SPEC_TEST_FILE_BUDGET_MS budget prints one __FILE_BUDGET_RED__ line naming it and fails the run even though every test passed', () => {
  const root = seedSlowFastTree()
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '300' })
  assert.strictEqual(r.status, 1,
    'an over-budget file must exit the run 1 even with all tests passing; stderr: ' + r.stderr)
  const out = r.stdout || ''
  const redLines = out.split('\n').filter(l => l.startsWith('__FILE_BUDGET_RED__'))
  assert.strictEqual(redLines.length, 1,
    'exactly one __FILE_BUDGET_RED__ line is expected for the single offending file, got: ' + JSON.stringify(redLines))
  const line = redLines[0]
  assert.ok(line.startsWith('__FILE_BUDGET_RED__ tests/slow.test.js '),
    'the red line must name the offending file path right after the sentinel: ' + line)
  const rest = line.slice('__FILE_BUDGET_RED__ tests/slow.test.js '.length)
  const m = rest.match(/^(\d+)ms > 300ms/)
  assert.ok(m, 'the next token after the file path must be an integer duration followed by "ms > 300ms": ' + line)
  assert.ok(line.includes('split this file'),
    'the red line must name the remedy ("split this file") so the reader does not need the spec: ' + line)
  assert.ok(!out.includes('__FILE_BUDGET_OK__'),
    'an over-budget run must not also print an OK line — the reporter is not undecided: ' + out)
  assert.match(out, /ℹ tests 3/,
    'the budget reporter must not suppress the spec reporter\'s own test count summary: ' + out)
  assert.match(out, /ℹ fail 0/,
    'all three tests passed, so the underlying run must still report zero failures: ' + out)
})

test('AC-20260903-07-3: the same tree under a loose budget exits 0 and prints exactly one __FILE_BUDGET_OK__ line naming the slowest file', () => {
  const root = seedSlowFastTree()
  const r = runBudgetedSuite(root, ['tests/slow.test.js', 'tests/fast.test.js'], { SPEC_TEST_FILE_BUDGET_MS: '5000' })
  assert.strictEqual(r.status, 0,
    'every file is under a 5000ms budget, so the run must exit 0; stderr: ' + r.stderr)
  const out = r.stdout || ''
  assert.match(out, /ℹ tests 3/,
    'the spec reporter\'s test-count summary must survive alongside the budget reporter: ' + out)
  const okLines = out.split('\n').filter(l => l.startsWith('__FILE_BUDGET_OK__'))
  assert.strictEqual(okLines.length, 1,
    'exactly one __FILE_BUDGET_OK__ line is expected on an under-budget run, got: ' + JSON.stringify(okLines))
  const m = okLines[0].match(/^__FILE_BUDGET_OK__ slowest tests\/slow\.test\.js (\d+)ms of 5000ms$/)
  assert.ok(m,
    'the OK line must read "slowest <file> <ms>ms of 5000ms" naming the slowest file: ' + okLines[0])
  assert.ok(!out.includes('__FILE_BUDGET_RED__'),
    'an under-budget run must never also print a red line: ' + out)
})

test('AC-20260903-07-4: resolveBudget tightens only from a fixed 45000ms BUDGET_MS and BUDGET_MS itself equals 45000', () => {
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
  assert.match(out, /ℹ fail 1/,
    'node:test\'s own failure count must reach the summary unmodified: ' + out)
  const okLines = out.split('\n').filter(l => l.startsWith('__FILE_BUDGET_OK__'))
  assert.strictEqual(okLines.length, 1,
    'the budget reporter must still print exactly one OK line — it never masks a runner failure by omitting its own output: ' + JSON.stringify(okLines))
})

test('AC-20260903-07-6: package.json scripts.test and .claude/spec.config.json testCommand carry the identical budget-reporter wiring, and gateCommand is unchanged', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  assert.strictEqual(pkg.scripts.test, config.testCommand + " 'tests/**/*.test.js'",
    'npm test and the host testCommand must be pinned identical modulo the trailing glob so they cannot drift apart')
  assert.ok(config.testCommand.startsWith('node --test '),
    'testCommand must still invoke the bare node test runner: ' + config.testCommand)
  const wiring = '--test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stdout'
  assert.ok(config.testCommand.includes(wiring),
    'testCommand must wire both reporters (spec then budget), each destined to stdout, in this exact order: ' + config.testCommand)
  assert.strictEqual(config.gateCommand, 'node --test {testDirs}',
    'gateCommand SHALL CONTINUE TO be the scoped-run form — scoped gate runs need no whole-suite budget')
})
