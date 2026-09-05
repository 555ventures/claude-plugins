'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// build-driver family shared fixtures — split from tests/build/build-driver.test.js by
// specs/20260903/07-test-file-budget-guard.md D7 (the guard's first review run reddened that
// file at 28 tests / ~31-44s serial). No `test(` calls here. Constants and helpers moved
// verbatim from the pre-image; consumed by the three shards (build-driver.test.js,
// build-driver-repair.test.js, build-driver-commit.test.js) via module.exports.

const DRIVER = 'scripts/spec-build-driver.js'

function specBody({ status = 'hardened', tier = 'standard', design = null, diffBase = null, acId = 'AC-20260901-01-1' }) {
  return `---
status: ${status}
tier: ${tier}
${design !== null ? `design: ${design}\n` : ''}${diffBase ? `diff_base: ${diffBase}\n` : ''}---
# Build Driver Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() computes the correct value (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | MODIFY | scripts |
| src/bar.js | CREATE | scripts |
| other.txt | MODIFY | other |
| tests/foo.test.js | CREATE | tests |

## Acceptance Criteria

- **${acId}**: foo() returns the correct computed value.
`
}

function testFileContent(expected) {
  return `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260901-01-1: foo() returns ${expected}', () => { assert.strictEqual(foo(), ${expected}) })
`
}

// fooValue=42: the pre-image already computes the "future correct" answer — the
// unsanctioned-green shape AC-4 needs. src/bar.js (a non-tests CREATE row) never exists at base,
// which is what drives RED_ATTRIBUTION once the test itself is made red (AC-3/4/5).
function makeHost({ fooValue = 42 } = {}) {
  const root = fs.realpathSync(tmpdir('blddrv'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { tests: 'plugin-tests', scripts: 'gate-scripts', other: 'general-purpose', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), `module.exports = () => ${fooValue}\n`)
  fs.writeFileSync(path.join(root, 'other.txt'), 'pre-image other\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/99-bd-test.md')
  fs.writeFileSync(spec, specBody({}))
  return { root, spec, sidecar: spec.replace(/\.md$/, '.build'), g }
}

// A File Plan with no tests-layer rows at all (AC-12) and a flag-controlled gate.sh
// (AC-7 fail branch / AC-8) — decoupled from red-check entirely so the repair-loop cap can be
// exercised without also driving the TESTS/RED_CHECK machinery.
function makeNoTestsHost() {
  const root = fs.realpathSync(tmpdir('blddrv-notests'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const cfg = {
    gateCommand: 'bash gate.sh',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
    layerGroups: [['doctrine', 'scripts']],
    agentMap: { scripts: 'gate-scripts', default: 'general-purpose' },
    pipelineRules: '.claude/rules/spec-pipeline.md',
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/only.js'), 'module.exports = 1\n')
  fs.writeFileSync(path.join(root, 'gate.sh'),
    '#!/usr/bin/env bash\nif [ -f FAIL_FLAG ]; then echo GATE_FAILED_MARKER; exit 1; else exit 0; fi\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/98-bd-notests.md')
  fs.writeFileSync(spec, `---
status: hardened
tier: standard
---
# Build Driver No-Tests Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | src/only.js is the sole change (AC-20260901-01-12) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/only.js | MODIFY | scripts |

## Acceptance Criteria

- **AC-20260901-01-12**: src/only.js exists.
`)
  return { root, spec, sidecar: spec.replace(/\.md$/, '.build'), g }
}

function run(root, spec, ...args) {
  return runNode(DRIVER, [spec, ...args], { cwd: root })
}
const stateOf = (root, spec) => run(root, spec, '--state').stdout.trim()

function implementScriptsWave(host) {
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 999\n')
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 7\n')
}

// Drives a fresh host from hardened through the unsanctioned-green -> made-red -> RED_ATTRIBUTION
// sequence (AC-3/AC-4's own mechanism), asserting only the setup preconditions later tests build
// on — the AC-specific assertions for each leg live in that AC's own test.
function toRedAttribution(host) {
  const r0 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS',
    'setup precondition: a fresh hardened host must start at TESTS before RED_ATTRIBUTION can be reached: ' + r0.stdout + r0.stderr)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const r1 = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'setup precondition: an unsanctioned-green pre-image must land RED_FINDINGS: ' + r1.stdout + r1.stderr)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  const r2 = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_ATTRIBUTION',
    'setup precondition: a red-expected file matching a File Plan with a non-tests CREATE row must land RED_ATTRIBUTION: ' + r2.stdout + r2.stderr)
}

function toFirstWave(host) {
  toRedAttribution(host)
  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'setup precondition: a red-attributed mark with no stub residue must advance to the first wave: ' + r.stdout + r.stderr)
}

function toIntegration(host) {
  toFirstWave(host)
  implementScriptsWave(host)
  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'setup precondition: the scripts wave must advance to the other wave: ' + r1.stdout + r1.stderr)
  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the other wave must advance to INTEGRATION: ' + r2.stdout + r2.stderr)
}

function toCommit(host) {
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT',
    'setup precondition: a passing gate at INTEGRATION must land COMMIT: ' + r.stdout + r.stderr)
}

// Drives a fresh makeNoTestsHost() through the same wave -> integrated -> 3x repair-applied ->
// refused-fourth sequence as the AC-7(fail)/AC-8 test above, leaving FAIL_FLAG present so the
// gate stays red the whole way, and asserts only the ESCALATE + gate-cap setup precondition the
// re-arm legs below build on.
function toEscalateCap(host) {
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  run(host.root, host.spec, '--mark', 'integrated')
  for (let i = 1; i <= 3; i++) {
    run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  }
  const fourth = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'setup precondition: a refused fourth repair-applied must park the run at ESCALATE before either re-arm leg runs: ' +
    fourth.stdout + fourth.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'setup precondition: gate-cap must exist before a deletion can exercise the re-arm: ' + host.sidecar)
}

module.exports = {
  DRIVER, specBody, testFileContent, makeHost, makeNoTestsHost, run, stateOf,
  implementScriptsWave, toRedAttribution, toFirstWave, toIntegration, toCommit, toEscalateCap,
}
