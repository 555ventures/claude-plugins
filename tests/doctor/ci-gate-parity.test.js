'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Pins: specs/20260906/01-ac-drift-doctor-check.md D7/A4, AC-20260906-01-15. ci-gate-parity.js
// (doctor check 14's script) had zero test coverage under npm run test:coverage; these six
// SHALL CONTINUE TO pins are the spiked A4 observations against scratch hosts, never a
// re-derivation of the script's own algorithm — every assertion here is expected to already
// pass on the untouched pre-image.

function writeConfig(root, gateCommand) {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'), JSON.stringify({ gateCommand }))
}

function writeWorkflow(root, name, yaml) {
  fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(root, '.github', 'workflows', name), yaml)
}

function run(root, extraArgs = []) {
  return runNode('scripts/ci-gate-parity.js', ['--root', root, ...extraArgs])
}

test('AC-20260906-01-15 (a): SHALL CONTINUE TO exit 2 with a stderr line naming "cannot read/parse" and "check --root" when .claude/spec.config.json is absent', () => {
  const dir = tmpdir('cgp-a')
  const res = run(dir)
  assert.strictEqual(res.status, 2,
    `an absent host config must be a usage-tier refusal (exit 2), never treated as an empty gateCommand ` +
    `(stdout: ${res.stdout} stderr: ${res.stderr})`)
  assert.ok(res.stderr.includes('cannot read/parse'),
    `the refusal must name "cannot read/parse" so a host can tell a missing config from a malformed one at a ` +
    `glance — got ${JSON.stringify(res.stderr)}`)
  assert.ok(res.stderr.includes('check --root'),
    `the refusal must name "check --root" as the remedy — got ${JSON.stringify(res.stderr)}`)
})

test('AC-20260906-01-15 (b): SHALL CONTINUE TO print "inapplicable — no gateCommand" and exit 0 when gateCommand is ""', () => {
  const dir = tmpdir('cgp-b')
  writeConfig(dir, '')
  const res = run(dir)
  assert.strictEqual(res.status, 0,
    `an explicitly empty gateCommand is a sentinel, never an error — must exit 0 (stderr: ${res.stderr})`)
  assert.strictEqual(res.stdout.trim(), 'inapplicable — no gateCommand',
    `the sentinel line must be exactly "inapplicable — no gateCommand" — got ${JSON.stringify(res.stdout)}`)
})

test('AC-20260906-01-15 (c): SHALL CONTINUE TO print "inapplicable — no .github/workflows" and exit 0 when no workflow file exists', () => {
  const dir = tmpdir('cgp-c')
  writeConfig(dir, 'node --test {testDirs}')
  const res = run(dir)
  assert.strictEqual(res.status, 0,
    `an absent .github/workflows directory is a sentinel, never an error — must exit 0 (stderr: ${res.stderr})`)
  assert.strictEqual(res.stdout.trim(), 'inapplicable — no .github/workflows',
    `the sentinel line must be exactly "inapplicable — no .github/workflows" — got ${JSON.stringify(res.stdout)}`)
})

test('AC-20260906-01-15 (d): SHALL CONTINUE TO exit 1 naming the missing segment when gateCommand is "node --test {testDirs}" and the only workflow runs "npm test"', () => {
  const dir = tmpdir('cgp-d')
  writeConfig(dir, 'node --test {testDirs}')
  writeWorkflow(dir, 'ci.yml', 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n')
  const res = run(dir)
  assert.strictEqual(res.status, 1,
    `a gateCommand segment absent from every workflow must be a parity failure (exit 1) — got ${res.status}, stdout: ${res.stdout}`)
  assert.ok(res.stderr.includes(
    'segment not found in any .github/workflows/*.yml|*.yaml: "node --test" — remedy: make one CI step run the gateCommand verbatim'),
    `the parity-failure line is pinned byte-for-byte — got ${JSON.stringify(res.stderr)}`)
})

test('AC-20260906-01-15 (e): SHALL CONTINUE TO print "ci-gate-parity: parity — 1 segment(s) found in ci.yml" and exit 0 when the workflow runs "node --test tests/"', () => {
  const dir = tmpdir('cgp-e')
  writeConfig(dir, 'node --test {testDirs}')
  writeWorkflow(dir, 'ci.yml', 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node --test tests/\n')
  const res = run(dir)
  assert.strictEqual(res.status, 0,
    `a workflow that runs the kept gateCommand segment verbatim must report parity and exit 0 (stderr: ${res.stderr})`)
  assert.strictEqual(res.stdout.trim(), 'ci-gate-parity: parity — 1 segment(s) found in ci.yml',
    `the parity line is pinned byte-for-byte — got ${JSON.stringify(res.stdout)}`)
})

test('AC-20260906-01-15 (f): SHALL CONTINUE TO exit 2 printing "usage: ci-gate-parity.js --root <dir>" when run with no --root', () => {
  const res = runNode('scripts/ci-gate-parity.js', [])
  assert.strictEqual(res.status, 2,
    `an invocation with no --root must be a usage error (exit 2) — got ${res.status}, stdout: ${res.stdout}`)
  assert.ok(res.stderr.includes('usage: ci-gate-parity.js --root <dir>'),
    `the usage line is pinned byte-for-byte — got ${JSON.stringify(res.stderr)}`)
})
