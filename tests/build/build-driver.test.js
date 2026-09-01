'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260901/01-build-driver.md (2026-09-01, brief 18): /spec:build's ~14 hand-performed
// choreography steps (admission, wave derivation, gate resolution, env preflight, the status
// flip, red-check, the final gate, scope-reconcile, diff counts, the ledger row) move into
// spec-build-driver.js on the spec-review-driver.js contract (specs/20260820/07 D1) — a session
// that only follows printed steps can no longer skip or hand-compose any of them. These tests
// drive the real binary end-to-end against synthetic git hosts (tmpdir() + gitRepo(), runNode
// with cwd), never poke at internals except the sidecar's own documented build-state.json shape
// (Contracts block), and are written BEFORE the driver exists — every test here fails on a
// missing spec-build-driver.js and must go green only once the state machine genuinely does
// what its AC names. AC-20260901-01-1 … -12, -14 below (AC-13/-16/-17 live in
// tests/init-gen/generate.test.js, tests/spec-paths.test.js, tests/review/review-driver.test.js
// respectively; AC-15 is the read-load oracle in tests/consistency/read-load.test.js).

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

test('AC-20260901-01-1: WHEN the driver is invoked on a status:hardened spec with no sidecar in a host whose env preflight passes THE SYSTEM creates <spec>.build/build-state.json, stamps diff_base absent-only with the pre-invocation HEAD, and prints the TESTS step', () => {
  const host = makeHost()
  const beforeHead = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a fresh hardened host with a passing preflight must exit 0 (a step was printed), not a precondition failure: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'build-state.json')),
    'the driver must create <spec>.build/build-state.json on its first invocation — without it no run state survives to the session\'s next call: ' + host.sidecar)
  const specText = fs.readFileSync(host.spec, 'utf8')
  assert.match(specText, /status:\s*implementing/, 'the frontmatter status must flip hardened -> implementing on the first invocation: ' + specText)
  const m = /^diff_base:\s*([0-9a-f]{40})$/m.exec(specText)
  assert.ok(m, 'the frontmatter must gain a 40-hex diff_base stamped absent-only: ' + specText)
  assert.strictEqual(m[1], beforeHead,
    'the stamped diff_base must equal the repo HEAD at invocation time — a mismatch means review would diff the wrong pre-image later: ' + JSON.stringify({ stamped: m[1], beforeHead }))
  assert.match(r.stdout, /## Step: author the tests/,
    'the printed step must carry the header "## Step: author the tests" for a File Plan with a tests-layer row — a session cannot reliably tell what to do next otherwise: ' + r.stdout)
  assert.match(r.stdout, /state: TESTS/, 'the trailer must name state TESTS: ' + r.stdout)
})

test('AC-20260901-01-2: WHEN invoked on a draft, done, or superseded spec THE SYSTEM exits 2 naming the owning command, leaves the spec byte-identical, and creates no sidecar', () => {
  for (const [status, owningPattern] of [['draft', /\/spec:plan/], ['done', /\/spec:status/], ['superseded', /\/spec:status/]]) {
    const host = makeHost()
    fs.writeFileSync(host.spec, specBody({ status }))
    const before = fs.readFileSync(host.spec, 'utf8')
    const r = run(host.root, host.spec)
    assert.strictEqual(r.status, 2, `a status:${status} spec must exit 2, never proceed as if it were buildable: ` + r.stdout + r.stderr)
    assert.match(r.stdout + r.stderr, owningPattern, `the refusal must name the owning command for status:${status}: ` + r.stdout + r.stderr)
    assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), before, `a refused admission must leave the spec file byte-identical for status:${status}`)
    assert.ok(!fs.existsSync(host.sidecar), `a refused admission must create no sidecar for status:${status}: ` + host.sidecar)
  }
})

test('AC-20260901-01-2 (design gate): WHEN a hardened spec declares design:true with no designed: in a host whose config declares a design block THE SYSTEM exits 2 naming /spec:design <spec>, leaves the spec byte-identical, and creates no sidecar', () => {
  const host = makeHost()
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.design = { enabled: true }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  fs.writeFileSync(host.spec, specBody({ design: true }))
  const before = fs.readFileSync(host.spec, 'utf8')
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2, 'a design:true spec with no designed: in a design-capable host must exit 2 rather than silently skip design: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /\/spec:design/, 'the refusal must name /spec:design <spec>: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), before, 'a refused design-gate admission must leave the spec file byte-identical')
  assert.ok(!fs.existsSync(host.sidecar), 'a refused design-gate admission must create no sidecar')
})

test('AC-20260901-01-3: WHEN --mark tests-authored is received and a non-DELETE tests-layer File Plan path is absent THE SYSTEM exits 2 naming the path and leaves build-state.json unchanged; WHEN every such path exists THE SYSTEM records the mark and runs red-check itself', () => {
  const host = makeHost()
  run(host.root, host.spec)
  const before = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')
  const rMissing = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(rMissing.status, 2, 'a missing tests-layer File Plan path must refuse the mark: ' + rMissing.stdout + rMissing.stderr)
  assert.match(rMissing.stderr, /tests\/foo\.test\.js/, 'the refusal must name the missing path so the session knows exactly what to author: ' + rMissing.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS', '--state must still print TESTS after a refused mark: ' + rMissing.stdout + rMissing.stderr)
  assert.strictEqual(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), before,
    'a refused tests-authored mark must leave build-state.json byte-unchanged — recording it would let a never-authored test ride through')

  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const r = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(r.status, 0, 'once the tests-layer path exists the mark must be accepted: ' + r.stdout + r.stderr)
  const stateAfter = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')
  assert.match(stateAfter, /"testsAuthored":\s*true/, 'the accepted mark must be recorded on the sidecar: ' + stateAfter)
  assert.notStrictEqual(stateOf(host.root, host.spec), 'TESTS',
    'the driver must have run red-check itself and advanced the state past TESTS on the same invocation: ' + r.stdout + r.stderr)
})

test('AC-20260901-01-4: WHEN red-check exits 1 THE SYSTEM prints its findings under state: RED_FINDINGS and re-runs red-check on the next bare invocation with no mark; WHEN it exits 0 THE SYSTEM records redCheck:"green" and prints RED_ATTRIBUTION for a File Plan carrying a non-tests CREATE row', () => {
  const host = makeHost()
  run(host.root, host.spec)
  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(42))
  const r1 = run(host.root, host.spec, '--mark', 'tests-authored')
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'a red-expected file that passes against the pre-image (unsanctioned green) must land RED_FINDINGS: ' + r1.stdout + r1.stderr)
  assert.match(r1.stdout, /HARD\s+unsanctioned-green/,
    'RED_FINDINGS must print red-check\'s own findings verbatim, including the literal HARD unsanctioned-green line: ' + r1.stdout)

  const rBare = run(host.root, host.spec)
  assert.strictEqual(rBare.status, 0, 'a bare invocation at RED_FINDINGS must re-run red-check with no mark, never demand one: ' + rBare.stdout + rBare.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_FINDINGS',
    'red-check must still report the pre-image as unsanctioned-green until the test file itself is corrected: ' + rBare.stdout)

  fs.writeFileSync(path.join(host.root, 'tests/foo.test.js'), testFileContent(999))
  const r2 = run(host.root, host.spec)
  assert.strictEqual(r2.status, 0, 'a bare invocation once the pre-image is genuinely red must succeed: ' + r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_ATTRIBUTION',
    'a red-expected file now matching its pre-image, in a File Plan carrying a non-tests CREATE row (src/bar.js), must print RED_ATTRIBUTION: ' + r2.stdout + r2.stderr)
  const stateJson = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(stateJson.redCheck, 'green',
    'the sidecar must record redCheck:"green" once red-check\'s own expectations are satisfied: ' + JSON.stringify(stateJson))
})

test('AC-20260901-01-5: WHEN --mark red-attributed is received while a non-tests CREATE-row path exists on disk THE SYSTEM exits 2 naming it as stub residue; WHEN none exists THE SYSTEM advances to the first WAVE', () => {
  const host = makeHost()
  toRedAttribution(host)
  fs.writeFileSync(path.join(host.root, 'src/bar.js'), 'module.exports = () => 0 // stub residue\n')
  const rStub = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(rStub.status, 2,
    'a CREATE-row implementation file already present at RED_ATTRIBUTION is stub residue — accepting the mark would let untested implementation ride through: ' + rStub.stdout + rStub.stderr)
  assert.match(rStub.stderr, /src\/bar\.js/, 'the refusal must name the residue path: ' + rStub.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'RED_ATTRIBUTION', 'a refused red-attributed mark must leave the state unchanged')

  fs.rmSync(path.join(host.root, 'src/bar.js'))
  const r = run(host.root, host.spec, '--mark', 'red-attributed')
  assert.strictEqual(r.status, 0, 'once no CREATE-row path exists on disk the mark must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'a clean red-attributed mark must advance straight to the first wave: ' + r.stdout + r.stderr)
})

test('AC-20260901-01-6: WHEN --mark wave-done names the current wave and every row of it verifies THE SYSTEM prints the next wave in layerGroups order then other, or INTEGRATION when none remain — a wrong wave name or an unverified row is refused', () => {
  const host = makeHost()
  toFirstWave(host)
  const rWrong = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(rWrong.status, 2,
    'marking a wave that is not the current one must be refused — accepting it would let a wave whose files were never verified ride through: ' + rWrong.stdout + rWrong.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts', 'a wrong-wave mark must leave the current wave unchanged')

  const rMissing = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(rMissing.status, 2,
    'wave-done must refuse when the wave\'s CREATE row (src/bar.js) does not yet exist on disk — a missing implementation file must never be marked done: ' + rMissing.stdout + rMissing.stderr)

  implementScriptsWave(host)
  const r1 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  assert.strictEqual(r1.status, 0, 'once every row of the wave verifies the mark must be accepted: ' + r1.stdout + r1.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:other',
    'the first layerGroups entry must be followed by the other wave — the exact worked example of AC-20260901-01-6 (layerGroups doctrine+scripts, rows in scripts and other): ' + r1.stdout)

  const r2 = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  assert.strictEqual(r2.status, 0, 'the other wave\'s row (other.txt, a MODIFY row that already exists) must verify: ' + r2.stdout + r2.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION', 'no wave remains after other, so the state must be INTEGRATION: ' + r2.stdout)
})

test('AC-20260901-01-7: WHEN --mark integrated is received THE SYSTEM runs the resolved gate command itself, writes gate-1.log, and prints COMMIT on a pass', () => {
  const host = makeHost()
  toIntegration(host)
  const r = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(r.status, 0, 'a passing gate at INTEGRATION must be accepted: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-1.log')),
    'the driver must write gate-1.log for its own gate run — without it the session has no evidence to point to: ' + host.sidecar)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT', 'a passing gate must land COMMIT: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /COMMIT/, 'the printed step must name COMMIT: ' + r.stdout)
})

test('AC-20260901-01-7 (fail branch) / AC-20260901-01-8: a red gate at INTEGRATION prints REPAIR naming round "1 of 3" and the log path; three repair-applied cycles that stay red are each accepted, and a fourth is refused with exit 2, touching gate-cap and parking the run at the terminal state ESCALATE', () => {
  const host = makeNoTestsHost()
  fs.writeFileSync(path.join(host.root, 'FAIL_FLAG'), '')
  host.g('add', '-A'); host.g('commit', '-q', '-m', 'fail flag')

  run(host.root, host.spec)
  const rWave = run(host.root, host.spec, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '3')
  assert.strictEqual(stateOf(host.root, host.spec), 'INTEGRATION',
    'setup precondition: the only wave (scripts, no other/tests rows) must land INTEGRATION: ' + rWave.stdout + rWave.stderr)

  const rInt = run(host.root, host.spec, '--mark', 'integrated')
  assert.strictEqual(rInt.status, 0, 'a red gate at INTEGRATION is a normal step-printing outcome, not a refusal of the mark: ' + rInt.stdout + rInt.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR', 'a failing gate must land the REPAIR state: ' + rInt.stdout + rInt.stderr)
  assert.match(rInt.stdout, /round 1 of 3/, 'the first REPAIR round must be literally named "round 1 of 3" per the Contracts\' own worked example: ' + rInt.stdout)
  assert.match(rInt.stdout, /gate-1\.log/, 'the REPAIR step must name the current gate log path so the session can read the failure: ' + rInt.stdout)

  for (let i = 1; i <= 3; i++) {
    const r = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
    assert.strictEqual(r.status, 0, `repair-applied call #${i} (within the 3-call cap) must be accepted: ` + r.stdout + r.stderr)
    assert.strictEqual(stateOf(host.root, host.spec), 'REPAIR',
      `repair-applied call #${i} against a gate that is still red must return to REPAIR: ` + r.stdout + r.stderr)
  }

  const fourth = run(host.root, host.spec, '--mark', 'repair-applied', '--continued', '1', '--spawned', '0')
  assert.strictEqual(fourth.status, 2,
    'a fourth repair-applied call must be refused — accepting it would let the repair loop run unbounded: ' + fourth.stdout + fourth.stderr)
  assert.match(fourth.stdout + fourth.stderr, /cap/i, 'the refusal must name the cap: ' + fourth.stdout + fourth.stderr)
  assert.ok(fs.existsSync(path.join(host.sidecar, 'gate-cap')),
    'a refused fourth repair-applied must touch <spec>.build/gate-cap: ' + host.sidecar)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'a refused fourth repair-applied must park the run at the terminal state ESCALATE: ' + fourth.stdout + fourth.stderr)

  const rEsc = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'ESCALATE',
    'every later bare invocation must keep printing ESCALATE until <spec>.build/gate-cap is deleted — a session that just re-runs the driver must never silently re-enter the repair loop: ' + rEsc.stdout + rEsc.stderr)
})

test('AC-20260901-01-9: WHEN --mark committed is received with every File Plan path clean in git status and HEAD past the base sha THE SYSTEM appends exactly one D6-shaped ledger line and deletes the sidecar; a dirty File Plan path refuses the mark', () => {
  const host = makeHost()
  toCommit(host)

  const rEarly = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(rEarly.status, 2,
    'the wave edits are still uncommitted working-tree changes at this point — a committed mark before the session\'s own checkpoint commit must refuse: ' + rEarly.stdout + rEarly.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'COMMIT', 'a refused committed mark must leave the state at COMMIT')

  fs.writeFileSync(host.spec.replace(/\.md$/, '.deviations.md'),
    '# Deviations — 99-bd-test\n\n- first departure\n- second departure\n- third departure\n')

  execFileSync('git', ['-C', host.root, 'add', 'src/foo.js', 'src/bar.js', 'other.txt', 'tests/foo.test.js', path.relative(host.root, host.spec)], { encoding: 'utf8' })
  execFileSync('git', ['-C', host.root, 'commit', '-q', '-m', 'checkpoint'], { encoding: 'utf8' })

  const specTextAfter = fs.readFileSync(host.spec, 'utf8')
  const diffBase = /^diff_base:\s*(\S+)/m.exec(specTextAfter)[1]
  const shortstat = execFileSync('git', ['-C', host.root, 'diff', '--shortstat', diffBase, 'HEAD'], { encoding: 'utf8' }).trim()
  const sm = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(shortstat) || []
  const expectedFiles = sm[1] ? parseInt(sm[1], 10) : 0
  const expectedLoc = (sm[2] ? parseInt(sm[2], 10) : 0) + (sm[3] ? parseInt(sm[3], 10) : 0)

  const ledger = path.join(host.root, '.claude/spec-runs.jsonl')
  const before = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean) : []

  const r = run(host.root, host.spec, '--mark', 'committed')
  assert.strictEqual(r.status, 0, 'a clean, advanced File Plan must be accepted at COMMIT: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /## DONE/, 'the accepted committed mark must print the ## DONE step: ' + r.stdout)

  const after = fs.readFileSync(ledger, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(after.length, before.length + 1, 'exactly one ledger line must be appended at DONE: ' + JSON.stringify({ before, after }))
  const row = JSON.parse(after[after.length - 1])
  assert.strictEqual(row.stage, 'build', 'the appended row must carry stage:"build": ' + JSON.stringify(row))
  assert.match(row.runId, /^bd_[0-9a-f]{12}$/, 'the row\'s runId must match bd_<12 hex>, the D6 shape: ' + JSON.stringify(row))
  assert.strictEqual(row.gate.finalRounds, 1, 'a single gate run with no repair rounds must record gate.finalRounds:1: ' + JSON.stringify(row))
  assert.strictEqual(row.deviations, 3, 'the deviations count must equal the number of "^- " lines in the deviations sidecar: ' + JSON.stringify(row))
  assert.strictEqual(row.redCheck, 'green', 'a run that genuinely reconciled red-check must carry redCheck:"green": ' + JSON.stringify(row))
  assert.deepStrictEqual(row.workers, { spawned: 3, continued: 0 },
    'the workers sums must equal the wave --workers sums (2 + 1) with zero repairs: ' + JSON.stringify(row))
  assert.strictEqual(row.diff.files, expectedFiles, 'diff.files must equal git diff --shortstat <base>..HEAD\'s file count: ' + JSON.stringify({ row, expectedFiles }))
  assert.strictEqual(row.diff.loc, expectedLoc, 'diff.loc must equal insertions+deletions from the same shortstat: ' + JSON.stringify({ row, expectedLoc }))

  assert.ok(!fs.existsSync(host.sidecar),
    'the sidecar must be deleted at DONE — leaving it behind risks a future invocation re-deriving a finished run\'s stale state: ' + host.sidecar)
})

test('AC-20260901-01-10: WHEN --state is passed THE SYSTEM prints exactly the bare state token and a newline, runs no mutating child process, and leaves build-state.json and the spec file byte-identical', () => {
  const host = makeHost()
  toCommit(host)
  const specBefore = fs.readFileSync(host.spec, 'utf8')
  const sidecarBefore = fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8')
  const r = run(host.root, host.spec, '--state')
  assert.strictEqual(r.status, 0, '--state must exit 0: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, 'COMMIT\n', 'at COMMIT, --state must print exactly "COMMIT\\n" and nothing else — any extra text breaks a scripting consumer: ' + JSON.stringify(r.stdout))
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), specBefore, '--state must never mutate the spec file')
  assert.strictEqual(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'), sidecarBefore, '--state must never mutate build-state.json')
})

test('AC-20260901-01-11: WHEN env preflight exits 1 at PREFLIGHT THE SYSTEM prints its output verbatim, exits 2, leaves status:hardened, and creates no sidecar', () => {
  const host = makeHost()
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.testEnv = [{ var: 'NEVER_SET_XYZ_BD', provision: 'export NEVER_SET_XYZ_BD=1' }]
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  delete process.env.NEVER_SET_XYZ_BD

  const before = fs.readFileSync(host.spec, 'utf8')
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 2, 'an unprovisioned gating variable must exit 2 before any other build step runs: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /NEVER_SET_XYZ_BD/, 'env-preflight\'s own output must be printed verbatim, naming the unset variable: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), before, 'a preflight failure must leave the spec file byte-identical')
  assert.match(before, /status:\s*hardened/, 'a preflight failure must never flip status past hardened')
  assert.ok(!fs.existsSync(host.sidecar), 'a preflight failure must create no sidecar: ' + host.sidecar)
})

test('AC-20260901-01-12: WHEN the File Plan has no tests-layer rows THE SYSTEM skips TESTS/RED_CHECK/RED_FINDINGS/RED_ATTRIBUTION with one printed line, records redCheck:"none", and prints the first WAVE as the very first step', () => {
  const host = makeNoTestsHost()
  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a File Plan with no tests rows must still succeed on first invocation: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'WAVE:doctrine+scripts',
    'the very first printed step must be the first WAVE, skipping every tests-stage state entirely: ' + r.stdout)
  assert.match(r.stdout, /skip|no tests/i,
    'a printed line must announce the skip of the tests-stage states — a silent skip leaves the session unable to tell whether TESTS was forgotten or intentionally bypassed: ' + r.stdout)
  const stateJson = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(stateJson.redCheck, 'none',
    'a File Plan with no tests rows must record redCheck:"none" — the run genuinely never had a red-check pass to observe, unlike "green" or "skipped-resume": ' + JSON.stringify(stateJson))
})

test('AC-20260901-01-14: WHEN invoked on a status:implementing spec with no sidecar whose non-tests File Plan paths already differ from the base THE SYSTEM warns naming those paths, starts at TESTS, and records redCheck:"skipped-resume"', () => {
  const host = makeHost()
  const baseHead = execFileSync('git', ['-C', host.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(host.spec, specBody({ status: 'implementing', diffBase: baseHead }))
  // Simulate a resumed cold session whose landed (uncommitted) work never made it back to a
  // driver-tracked sidecar: src/foo.js already differs from build_base, and no <spec>.build/
  // directory exists on disk at all.
  fs.writeFileSync(path.join(host.root, 'src/foo.js'), 'module.exports = () => 999 // resumed, landed\n')

  const r = run(host.root, host.spec)
  assert.strictEqual(r.status, 0, 'a resume with dirty non-tests paths must still print a step, never refuse outright — the code is already landed: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /src\/foo\.js/, 'the warning must name the dirty non-tests path: ' + r.stdout + r.stderr)
  assert.strictEqual(stateOf(host.root, host.spec), 'TESTS',
    'a sidecar-less resume on a dirty pre-image must start at TESTS — red-check cannot run on a post-image tree: ' + r.stdout)
  const stateJson = JSON.parse(fs.readFileSync(path.join(host.sidecar, 'build-state.json'), 'utf8'))
  assert.strictEqual(stateJson.redCheck, 'skipped-resume',
    'the sidecar must record redCheck:"skipped-resume" — a post-image run of red-check would prove nothing about vacuity and must never be silently attempted: ' + JSON.stringify(stateJson))
})
