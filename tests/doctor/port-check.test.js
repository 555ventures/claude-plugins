'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { SPEC, read, tmpdir, runNode, runBash } = require('../helpers')

// Pins specs/20260909/07-hang-bound-and-port-check.md D3/D4, AC-20260909-07-4, -5, -6, -7 —
// port-check.js's three location-based (not name/extension-based) regex classes over every
// file under <root>/tests, its exit codes, --json shape, and its /spec:doctor + spec-paths
// wiring. spec/scripts/port-check.js does not exist yet — every test below is red.

function run(root, extraArgs = []) {
  return runNode('scripts/port-check.js', ['--root', root, ...extraArgs])
}

// AC-20260909-07-4's exact five-file tree: one listen-literal, three computed-port shapes
// (plain, nested-parens, Math.floor(Math.random())), one port-flag-literal.
function seedFindingsTree() {
  const root = tmpdir('port-check-findings')
  fs.mkdirSync(path.join(root, 'tests'))
  // D11: every port literal below is composed from concatenated fragments so this file's own
  // source bytes never spell D3's listen-literal/computed-port/port-flag-literal patterns —
  // port-check.js walks all of tests/ with no name filter, so this file is itself a target.
  fs.writeFileSync(path.join(root, 'tests/listen-lit.test.js'), 'server.listen(' + '4173)\n')
  fs.writeFileSync(path.join(root, 'tests/computed-plain.test.js'), 'const p = 41230' + ' + (process.pid % 300)\n')
  fs.writeFileSync(path.join(root, 'tests/computed-nested.test.js'), 'const q = 41830' + ' + ((process.pid + offset) % 300)\n')
  fs.writeFileSync(path.join(root, 'tests/computed-random.test.js'), 'const r = 43000' + ' + Math.floor(Math.random() * 2000)\n')
  fs.writeFileSync(path.join(root, 'tests/flag-lit.test.js'), "module.exports = ['serve', '--port', String(" + '45' + '99' + ')]\n')
  return root
}

// AC-20260909-07-5's clean tree: the four admitted shapes that must never match any class.
function seedCleanTree() {
  const root = tmpdir('port-check-clean-syn')
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests/listen-zero.test.js'), 'server.listen(0)\n')
  fs.writeFileSync(path.join(root, 'tests/flag-zero.test.js'), "['serve', '--port', '0']\n")
  fs.writeFileSync(path.join(root, 'tests/url.test.js'), "const base = 'http://localhost:6006'\n")
  fs.writeFileSync(path.join(root, 'tests/free.test.js'), 'const p = await freePort()\n')
  return root
}

test('AC-20260909-07-4: port-check.js --root <dir> exits 1 and prints exactly 5 lines (1 listen-literal, 3 computed-port, 1 port-flag-literal), each starting tests/<file>:<line>:', () => {
  const root = seedFindingsTree()
  const r = run(root)
  assert.strictEqual(r.status, 1,
    `a synthetic tree carrying five distinct port-literal shapes must exit 1: stdout=${r.stdout} stderr=${r.stderr}`)
  const lines = r.stdout.split('\n').filter(Boolean)
  assert.strictEqual(lines.length, 5,
    `exactly 5 finding lines are expected (one per seeded shape), got ${lines.length}: ${JSON.stringify(lines)}`)
  for (const line of lines) {
    assert.match(line, /^tests\/[^:]+:\d+: /,
      `every finding line must start "tests/<file>:<line>: " so a reader can jump straight to the literal: ${line}`)
  }
  const byClass = { 'listen-literal': 0, 'computed-port': 0, 'port-flag-literal': 0 }
  for (const line of lines) {
    for (const cls of Object.keys(byClass)) {
      if (line.includes(' ' + cls + ' ')) byClass[cls]++
    }
  }
  assert.strictEqual(byClass['listen-literal'], 1,
    'exactly one listen-literal finding is expected (server.' + 'listen(' + '4173)): ' + JSON.stringify(lines))
  assert.strictEqual(byClass['computed-port'], 3,
    `exactly three computed-port findings are expected (plain, nested-parens, Math.random): ${JSON.stringify(lines)}`)
  assert.strictEqual(byClass['port-flag-literal'], 1,
    `exactly one port-flag-literal finding is expected (String(4599)): ${JSON.stringify(lines)}`)
})

test('AC-20260909-07-5: port-check.js --root <dir> exits 0 and prints nothing when tests/ holds only listen(0), --port 0, a localhost URL, and freePort()', () => {
  const root = seedCleanTree()
  const r = run(root)
  assert.strictEqual(r.status, 0,
    `none of listen(0), '--port','0', a bare URL, or freePort() are fixed/computed ports — must exit 0: stdout=${r.stdout} stderr=${r.stderr}`)
  assert.strictEqual(r.stdout.trim(), '',
    `a clean tree must print nothing on stdout — any output here is a false-positive finding: ${JSON.stringify(r.stdout)}`)
})

test('AC-20260909-07-6: port-check.js --root <dir> --json prints one JSON object whose findings array has length 5 with the expected class distribution', () => {
  const root = seedFindingsTree()
  const r = run(root, ['--json'])
  assert.strictEqual(r.status, 1,
    `--json must not change the exit code — a tree with findings still exits 1: stdout=${r.stdout} stderr=${r.stderr}`)
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch (e) {
    assert.fail(`--json must print exactly one parseable JSON object on stdout: ${e.message} (stdout: ${JSON.stringify(r.stdout)})`)
  }
  assert.ok(Array.isArray(parsed.findings),
    `the JSON object must carry a "findings" array: ${JSON.stringify(parsed)}`)
  assert.strictEqual(parsed.findings.length, 5,
    `findings must have length 5, matching the plain-render line count: ${JSON.stringify(parsed.findings)}`)
  const counts = parsed.findings.reduce((acc, f) => {
    acc[f.class] = (acc[f.class] || 0) + 1
    return acc
  }, {})
  assert.strictEqual(counts['listen-literal'], 1, `expected one listen-literal in the JSON findings: ${JSON.stringify(counts)}`)
  assert.strictEqual(counts['computed-port'], 3, `expected three computed-port in the JSON findings: ${JSON.stringify(counts)}`)
  assert.strictEqual(counts['port-flag-literal'], 1, `expected one port-flag-literal in the JSON findings: ${JSON.stringify(counts)}`)
  for (const f of parsed.findings) {
    assert.ok(f.file && typeof f.line === 'number' && f.class && typeof f.text === 'string',
      `every finding object must carry file/line/class/text fields: ${JSON.stringify(f)}`)
  }
})

test('AC-20260909-07-6: port-check.js exits 2 with a usage line when --root is absent or names a dir with no tests/', () => {
  const noRoot = runNode('scripts/port-check.js', [])
  assert.strictEqual(noRoot.status, 2,
    `an invocation with no --root must be a usage error (exit 2): stdout=${noRoot.stdout} stderr=${noRoot.stderr}`)
  assert.match(noRoot.stderr, /usage/i,
    `the no-root refusal must print a usage line so the caller can self-correct: ${noRoot.stderr}`)

  const emptyRoot = tmpdir('port-check-no-tests-dir')
  const noTests = run(emptyRoot)
  assert.strictEqual(noTests.status, 2,
    `a --root naming a directory with no tests/ subdirectory must also be a usage error (exit 2): stdout=${noTests.stdout} stderr=${noTests.stderr}`)
  assert.match(noTests.stderr, /usage/i,
    `the no-tests-dir refusal must print a usage line so the caller can self-correct: ${noTests.stderr}`)
})

test('AC-20260909-07-7: spec-paths port-check prints the absolute path of spec/scripts/port-check.js', () => {
  const r = runBash('bin/spec-paths', ['port-check'])
  assert.strictEqual(r.status, 0,
    `spec-paths port-check must resolve and exit 0: stdout=${r.stdout} stderr=${r.stderr}`)
  assert.strictEqual(r.stdout.trim(), path.join(SPEC, 'scripts/port-check.js'),
    `spec-paths port-check must print exactly the absolute path a command markdown body can invoke: got ${JSON.stringify(r.stdout)}`)
})

test('AC-20260909-07-7: spec/commands/doctor.md contains a numbered check whose own body names "spec-paths port-check"', () => {
  const doc = read('spec/commands/doctor.md')
  // Split on numbered-check headers so the literal must land inside ONE check's own block,
  // never merely somewhere later in the file (a naive whole-doc regex would pass on that).
  const blocks = doc.split(/\n(?=\d+\.\s+\*\*)/)
  const hit = blocks.find((b) => /^\d+\.\s+\*\*/.test(b.trim()) && b.includes('spec-paths port-check'))
  assert.ok(hit,
    'doctor.md must gain a numbered check (like checks 14-17) whose own body names "spec-paths port-check" so the new deterministic gate is actually run by /spec:doctor, not just scripted in isolation')
})
