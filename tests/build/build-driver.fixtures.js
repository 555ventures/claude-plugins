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

function specBody({ status = 'hardened', tier = 'standard', design = null, diffBase = null, acId = 'AC-20260901-01-1', brief = null, lane = null, prototype = null }) {
  return `---
status: ${status}
tier: ${tier}
${design !== null ? `design: ${design}\n` : ''}${diffBase ? `diff_base: ${diffBase}\n` : ''}${brief !== null ? `brief: ${brief}\n` : ''}${lane !== null ? `lane: ${lane}\n` : ''}${prototype !== null ? `prototype: ${prototype}\n` : ''}---
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
//
// specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md File Plan row:
// `{ prototype: <stem>, brief }` options, additive — every existing caller (no prototype) is
// byte-for-byte unaffected. `prototype: <stem>` writes design/prototypes/<stem>/{contract.json,
// captures/*.png, tests/<file>} (the four routes x states of the spec's Contracts example, two
// behaviour pins p1/p3 and one look pin p2), a `prototype` host config block (`url` carrying
// {port}, `e2eFile` carrying {stem}, `e2eRun` = a stub whose exit is scripted by env E2E_RED and
// which records its {file} argument and PROTO_URL into e2e-env.txt in the host root),
// `runtime.bootCommand`, and stamps `prototype: <stem>` on the spec. `e2eRun: false` omits the
// declaration. `host.contractPath` lets a test rewrite the contract (e.g. `tests: null`).
const E2E_STUB_SRC = `'use strict'
const fs = require('fs')
fs.writeFileSync('e2e-env.txt', 'file=' + process.argv[2] + '\\nPROTO_URL=' + process.env.PROTO_URL + '\\n')
process.stdout.write('e2e stub ran ' + process.argv[2] + '\\n')
process.exit(process.env.E2E_RED === '1' ? 1 : 0)
`
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
function protoContract(stem, brief) {
  const st = (url, capture) => ({ url, capture })
  return {
    schemaVersion: 2, stem, brief: String(brief), idea: null, approvedAt: '2026-10-07T10:00:00.000Z', base: 'main',
    viewport: { width: 1280, height: 800 },
    routes: {
      '/women': { default: st('/women', 'captures/women--default.png'), empty: st('/women?proto=empty', 'captures/women--empty.png') },
      '/women/new': { default: st('/women/new', 'captures/women_new--default.png'), error: st('/women/new?proto=error', 'captures/women_new--error.png') },
    },
    pins: [
      { id: 'p1', kind: 'behaviour', screen: '/women', state: 'default', anchor: 'WomanRow[w_01]<WomenList<WomenScreen#0', note: 'row turns green on save', round: 1 },
      { id: 'p2', kind: 'look', screen: '/women', state: 'empty', anchor: null, note: 'empty shows guidance only', round: 1 },
      { id: 'p3', kind: 'behaviour', screen: '/women/new', state: 'error', anchor: null, note: 'blank save shows a red notice', round: 2 },
    ],
    tests: { file: 'tests/proto-' + stem + '.spec.ts', source: 'e2e/proto-' + stem + '.spec.ts', run: 'node .e2e-stub.js {file}', pins: ['p1', 'p3'] },
  }
}
function makeHost({ fooValue = 42, brief = null, prototype = null, e2eRun = true } = {}) {
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

  let contractPath = null
  if (prototype !== null) {
    cfg.prototype = { url: 'http://127.0.0.1:{port}', e2eFile: 'e2e/proto-{stem}.spec.ts' }
    if (e2eRun) cfg.prototype.e2eRun = 'node .e2e-stub.js {file}'
    cfg.runtime.bootCommand = 'node scripts/dev-server.js'
  }

  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), `module.exports = () => ${fooValue}\n`)
  fs.writeFileSync(path.join(root, 'other.txt'), 'pre-image other\n')

  if (prototype !== null) {
    const designDir = path.join(root, 'design/prototypes', prototype)
    fs.mkdirSync(path.join(designDir, 'captures'), { recursive: true })
    fs.mkdirSync(path.join(designDir, 'tests'), { recursive: true })
    const doc = protoContract(prototype, brief === null ? 'n/a' : brief)
    contractPath = path.join(designDir, 'contract.json')
    fs.writeFileSync(contractPath, JSON.stringify(doc, null, 2) + '\n')
    for (const states of Object.values(doc.routes)) {
      for (const s of Object.values(states)) fs.writeFileSync(path.join(designDir, s.capture), PNG)
    }
    fs.writeFileSync(path.join(designDir, doc.tests.file),
      "import { test } from '@playwright/test'\ntest('pin p1: row turns green on save', async () => {})\ntest('pin p3: blank save shows a red notice', async () => {})\n")
    fs.writeFileSync(path.join(root, '.e2e-stub.js'), E2E_STUB_SRC)
  }

  g('add', '-A'); g('commit', '-q', '-m', 'base')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/99-bd-test.md')
  fs.writeFileSync(spec, specBody({ brief, prototype }))
  return { root, spec, sidecar: spec.replace(/\.md$/, '.build'), g, stem: prototype, contractPath }
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

// A gate-green host WITHOUT asserting the COMMIT state — a prototype: spec derives REPLAY there.
function toGreenGate(host) {
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 0,
    'setup precondition: a passing gate at INTEGRATION must be accepted before the replay or commit state: ' + r.stdout + r.stderr)
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
  implementScriptsWave, toRedAttribution, toFirstWave, toIntegration, toGreenGate, toCommit, toEscalateCap,
}
