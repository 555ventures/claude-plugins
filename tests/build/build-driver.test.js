'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { makeHost, makeNoTestsHost, run, stateOf, toRedAttribution, specBody, testFileContent } = require('./build-driver.fixtures')

// specs/20260901/01-build-driver.md (brief 18): shard of build-driver.test.js, split by
// specs/20260903/07-test-file-budget-guard.md D7. Owns the admission/TESTS/RED_CHECK/
// RED_ATTRIBUTION lifecycle: AC-20260901-01-1, -2, -3, -4, -5, -11, -12, -14 (repair/wave/
// escalate live in build-driver-repair.test.js; commit/ledger/provenance/glob live in
// build-driver-commit.test.js). Shared helpers live in tests/build/build-driver.fixtures.js.

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
