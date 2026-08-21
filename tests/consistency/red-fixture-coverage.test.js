'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, tmpdir, runNode, runBash, gitRepo } = require('../helpers')

// spec/doctrine/core.md § Incident Policy — same-session incident fix, third recurrence of the
// class "a verification check runs, matches nothing, and reports success" (2026-08-20):
//   1. review-legs.js's at-risk leg passed {file, refs} objects through `.map(q)`, producing
//      `node --test '[object Object]'` — Node 26 exits 0 on an unmatched pattern, so the leg
//      reported at-risk exit=0 files=N across ~10 reviews while executing ZERO tests.
//   2. tests/consistency/entrypoints.test.js's D10 hooks reverse-check regex matched nothing
//      against the live hooks.json and shipped inert — the anti-dead-code guard itself held a
//      dead check.
// This file is the closer: a meta-test that derives the full enumeration of gate/hook checks
// from the two live sources that define them (verdict.js's REVIEW_LEGS, spec/hooks/hooks.json),
// and for each one plants a real violation, executes the real check, and requires BOTH a red
// verdict AND evidence the check actually engaged the planted violation — never a generic
// precondition failure. A newly added leg or hook with no registered handler here fails this
// file closed (never a silent skip) until someone teaches it a fixture.

const VERDICT_PATH = path.join(SPEC, 'scripts/verdict.js')
const HOOKS_PATH = path.join(SPEC, 'hooks/hooks.json')

// ---- enumeration source 1: verdict.js's REVIEW_LEGS const array literal -----------------------
function parseReviewLegs() {
  if (!fs.existsSync(VERDICT_PATH)) return { ok: false, error: `verdict.js not found at ${VERDICT_PATH}` }
  const src = fs.readFileSync(VERDICT_PATH, 'utf8')
  const m = src.match(/const REVIEW_LEGS = \[([^\]]*)\]/)
  if (!m) return { ok: false, error: 'REVIEW_LEGS const array literal not found in verdict.js — its declaration shape changed and this meta-test\'s enumeration source broke' }
  const legs = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  return { ok: true, legs }
}

// ---- enumeration source 2: spec/hooks/hooks.json's wired command scripts ----------------------
// Same JSON.parse + walk-for-"command"-keys approach as entrypoints.test.js's D10 oracle
// (parseHookScriptPaths) — a generic extraction over already-JSON-unescaped strings, quoting-
// agnostic, never a raw-bytes regex over the file.
function collectHookCommandStrings(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectHookCommandStrings(item, out)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'command' && typeof v === 'string') out.push(v)
      else collectHookCommandStrings(v, out)
    }
  }
  return out
}

function parseHookScriptPaths() {
  if (!fs.existsSync(HOOKS_PATH)) return { ok: false, error: `spec/hooks/hooks.json not found at ${HOOKS_PATH}` }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'))
  } catch (e) {
    return { ok: false, error: `spec/hooks/hooks.json is not valid JSON (${e.message})` }
  }
  const paths = new Set()
  for (const cmd of collectHookCommandStrings(parsed, [])) {
    const re = /\/(scripts|workflows)\/([^\s"'`]+)/g
    let m
    while ((m = re.exec(cmd)) !== null) paths.add('spec/' + m[1] + '/' + m[2])
  }
  return { ok: true, paths: [...paths].sort() }
}

const legsResult = parseReviewLegs()
test('the REVIEW_LEGS enumeration source parses cleanly from verdict.js — a parse failure here must fail this meta-test closed, never silently skip the leg enumeration', () => {
  assert.ok(legsResult.ok, legsResult.error)
  assert.ok(legsResult.legs.length > 0, 'REVIEW_LEGS parsed as an empty array — the enumeration source likely broke silently: ' + JSON.stringify(legsResult))
})

const hooksResult = parseHookScriptPaths()
test('the hooks enumeration source parses cleanly from spec/hooks/hooks.json — a parse failure here must fail this meta-test closed, never silently skip the hooks enumeration', () => {
  assert.ok(hooksResult.ok, hooksResult.error)
  assert.ok(hooksResult.paths.length > 0, 'hooks.json parsed with zero wired command script paths — the enumeration source likely broke silently: ' + JSON.stringify(hooksResult))
})

const LEGS = legsResult.ok ? legsResult.legs : []
const HOOK_PATHS = hooksResult.ok ? hooksResult.paths : []

function baseHostConfig(extra) {
  return JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'fixture host — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
    ...extra,
  })
}

function manifestRows(manifestPath) {
  if (!fs.existsSync(manifestPath)) return []
  return fs.readFileSync(manifestPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

// ---- REVIEW_LEGS handlers -----------------------------------------------------------------

// gate: the leg IS the host's testCommand, wired through review-legs.js's {testDirs} resolution
// — fixtured with a tiny host whose planned test genuinely asserts a value the implementation
// does not return, so the leg's red is a real red, not a stub.
function legGate() {
  const dir = tmpdir('rfc-gate')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), baseHostConfig())
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/98-fixture.md'),
    '---\nstatus: implementing\n---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `src/foo.js` | MODIFY | scripts | x |\n| `tests/foo.test.js` | CREATE | tests | x |\n')
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "const foo = require('../src/foo.js')\n" +
    "test('planted violation', () => { assert.strictEqual(foo(), 'RED_FIXTURE_PLANTED_VIOLATION') })\n")
  g('add', '-A'); g('commit', '-q', '-m', 'work')
  const outDir = tmpdir('rfc-gate-out')
  const manifest = path.join(tmpdir('rfc-gate-manifest'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/98-fixture.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const byLeg = new Map(manifestRows(manifest).map((x) => [x.leg, x]))
  const row = byLeg.get('gate')
  assert.ok(row, 'review-legs.js must append a "gate" manifest row: ' + r.stdout + r.stderr)
  assert.notStrictEqual(row.exit, 0,
    'a planted test asserting a value the implementation deliberately does not return must redden the gate leg: ' +
    JSON.stringify(row) + ' / ' + r.stdout + r.stderr)
  const gateOutput = fs.readFileSync(path.join(outDir, 'gate-output.txt'), 'utf8')
  assert.match(gateOutput, /RED_FIXTURE_PLANTED_VIOLATION/,
    'evidence the check engaged: gate-output.txt must contain the planted test\'s own assertion text, proving ' +
    'the runner actually executed our fixture test rather than reddening on an unrelated precondition: ' + gateOutput)
}

// at-risk: the historical-death leg. atRisk entries are {file, refs} objects; the fix (staged
// uncommitted elsewhere) extracts `.file` before shelling out. The planted violation is a test
// file OUTSIDE the File Plan's tests rows whose content references the changed file's path stem
// AND whose assertion is deliberately false — so red here can only come from real execution, and
// the historical "[object Object]" shape is directly checkable in the captured runner output.
function legAtRisk() {
  const dir = tmpdir('rfc-atrisk')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/inplan'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), baseHostConfig())
  fs.writeFileSync(path.join(dir, 'src/riskyfoo.js'), 'module.exports = () => 1\n')
  fs.writeFileSync(path.join(dir, 'tests/inplan/covers.test.js'), "require('node:test')\n")
  // The at-risk test file must already exist, UNCHANGED, in the base commit — scope-
  // reconcile.js's at-risk derivation only considers test files outside the current diff that
  // reference a changed file's stem; a test file that is itself part of the diff is just an
  // ordinary changed file (and, being outside the File Plan's tests rows, an out-of-plan finding
  // instead), never an at-risk candidate.
  fs.mkdirSync(path.join(dir, 'tests/outofplan'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/outofplan/atrisk.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    // The require path's substring "src/riskyfoo" is the changed file's stem — scope-
    // reconcile.js's at-risk derivation content-scans for exactly this.
    "const foo = require('../../src/riskyfoo.js')\n" +
    "test('planted at-risk violation', () => { assert.strictEqual(foo(), 'RED_FIXTURE_ATRISK_PLANTED_VIOLATION') })\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/97-fixture.md'),
    '---\nstatus: implementing\n---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `src/riskyfoo.js` | MODIFY | scripts | x |\n| `tests/inplan/covers.test.js` | CREATE | tests | x |\n')
  // The changed file itself: only src/riskyfoo.js moves in the reviewed diff.
  fs.writeFileSync(path.join(dir, 'src/riskyfoo.js'), 'module.exports = () => 2\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')
  const outDir = tmpdir('rfc-atrisk-out')
  const manifest = path.join(tmpdir('rfc-atrisk-manifest'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/97-fixture.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const byLeg = new Map(manifestRows(manifest).map((x) => [x.leg, x]))
  const row = byLeg.get('at-risk')
  assert.ok(row, 'review-legs.js must append an "at-risk" manifest row when scope-reconcile.js finds an at-risk file: ' + r.stdout + r.stderr)
  assert.notStrictEqual(row.exit, 0,
    'the planted out-of-plan test asserts a deliberate falsehood — the at-risk leg must redden: ' +
    JSON.stringify(row) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(row.observed, 'files=1',
    'exactly one at-risk file was planted — observed must report files=1: ' + JSON.stringify(row))
  const atRiskOutput = fs.readFileSync(path.join(outDir, 'at-risk.txt'), 'utf8')
  assert.doesNotMatch(atRiskOutput, /\[object Object\]/,
    'THE historical death this guard exists to catch: a bare `atRisk.map(q)` over {file, refs} objects ' +
    'stringifies each to "[object Object]", which every runner rejects while Node 26 still exits 0 — the leg ' +
    'reported at-risk exit=0 files=N for ~10 reviews while executing ZERO tests. "[object Object]" appearing ' +
    'here means that exact bug is back: ' + atRiskOutput)
  assert.match(atRiskOutput, /RED_FIXTURE_ATRISK_PLANTED_VIOLATION/,
    'evidence the check engaged: at-risk.txt must contain the planted test\'s own assertion text, proving at ' +
    'least one real test actually executed — exactly the assertion the historical [object Object] bug fails: ' +
    atRiskOutput)
}

// ci: the leg's red mapping (conclusion -> exit) lives inside review-legs.js's wrapping of
// ci-query.js, so the real check is exercised end-to-end with a fake `gh` on PATH answering a
// completed run with conclusion:failure for the reviewed commit.
function legCi() {
  const dir = tmpdir('rfc-ci')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/inplan'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), baseHostConfig({ capabilities: { forge: 'github', skipReportPattern: 'ℹ skipped (\\d+)' } }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  fs.writeFileSync(path.join(dir, 'tests/inplan/foo.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "const foo = require('../../src/foo.js')\ntest('foo', () => { assert.strictEqual(foo(), 41) })\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/96-fixture.md'),
    '---\nstatus: implementing\n---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `README.md` | CREATE | docs | x |\n| `tests/inplan/foo.test.js` | CREATE | tests | x |\n')
  fs.writeFileSync(path.join(dir, 'README.md'), 'noop\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')

  const fakeGhDir = tmpdir('rfc-fake-gh')
  fs.writeFileSync(path.join(fakeGhDir, 'gh'),
    "#!/usr/bin/env bash\necho '[{\"status\":\"completed\",\"conclusion\":\"failure\",\"headSha\":\"deadbeef\"," +
    "\"url\":\"http://x\",\"updatedAt\":\"2026-01-01T00:00:00Z\"}]'\n")
  fs.chmodSync(path.join(fakeGhDir, 'gh'), 0o755)

  const outDir = tmpdir('rfc-ci-out')
  const manifest = path.join(tmpdir('rfc-ci-manifest'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', ['--root', dir, '--spec', 'specs/20260820/96-fixture.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir],
    { env: { ...process.env, PATH: fakeGhDir + path.delimiter + process.env.PATH } })
  const byLeg = new Map(manifestRows(manifest).map((x) => [x.leg, x]))
  const row = byLeg.get('ci')
  assert.ok(row, 'review-legs.js must append a "ci" manifest row: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 1,
    'a completed CI run with conclusion:failure for the exact reviewed commit must redden the ci leg: ' +
    JSON.stringify(row) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(row.observed, 'conclusion=failure',
    'evidence the check engaged: observed must echo the PLANTED conclusion value verbatim, proving the leg ' +
    'parsed the fake gh\'s real JSON rather than falling back to a generic unavailable: ' + JSON.stringify(row))
}

// reconcile: scope-reconcile.js directly — a changed file with no File Plan row at all.
function legReconcile() {
  const dir = tmpdir('rfc-reconcile')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/95-fixture.md'),
    '---\nstatus: implementing\n---\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `src/planned.js` | CREATE | scripts | planned |\n')
  fs.writeFileSync(path.join(dir, 'src/planned.js'), 'planned\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.writeFileSync(path.join(dir, 'src/RED_FIXTURE_OUT_OF_PLAN.js'), 'x\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')
  const r = runNode('scripts/scope-reconcile.js', ['--root', dir, '--base', base, '--spec', 'specs/20260820/95-fixture.md', '--json'])
  assert.strictEqual(r.status, 3, 'an out-of-plan changed file must redden scope-reconcile.js (exit 3): ' + r.stderr)
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, '--json output must parse: ' + r.stdout + r.stderr)
  assert.ok(out.outOfPlan.includes('src/RED_FIXTURE_OUT_OF_PLAN.js'),
    'evidence the check engaged: outOfPlan must name the exact planted file, not a generic failure: ' +
    JSON.stringify(out.outOfPlan))
}

// ac-matrix: a well-formed AC-ID with zero covering references anywhere in a File Plan tests row.
function legAcMatrix() {
  const dir = tmpdir('rfc-acmatrix')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// deliberately no AC reference\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec,
    '# Fixture\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260820-95-1**: RED_FIXTURE_UNCOVERED_AC — no test anywhere references this AC-ID.\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `tests/foo.test.js` | CREATE | tests | x |\n')
  const manifest = path.join(dir, 'manifest.jsonl')
  const r = runNode('scripts/ac-matrix.js', ['--spec', spec, '--root', dir, '--manifest', manifest, '--json'])
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, 'ac-matrix.js --json output must parse: ' + r.stdout + r.stderr)
  const row = manifestRows(manifest).find((x) => x.leg === 'ac-matrix')
  assert.ok(row, 'ac-matrix.js must append an "ac-matrix" manifest row: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 1,
    'a well-formed AC-ID with zero covering references must redden ac-matrix: ' + JSON.stringify(row))
  assert.ok(out.findings.some((f) => f.class === 'uncovered-ac' && f.ac === 'AC-20260820-95-1'),
    'evidence the check engaged: the finding must name the exact planted AC-ID as uncovered-ac: ' +
    JSON.stringify(out.findings))
}

// skip-reconcile: ac-matrix.js's sibling leg — a reported skip mapping to an AC bullet with no
// [env:] sanction. The AC is otherwise covered so this isolates the violation to skip-reconcile.
function legSkipReconcile() {
  const dir = tmpdir('rfc-skiprec')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260820-94-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec,
    '# Fixture\n\n## Acceptance Criteria\n\n' +
    '- **AC-20260820-94-1**: covered, no [env:] tag on this bullet.\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `tests/foo.test.js` | CREATE | tests | x |\n')
  const skipsFile = path.join(dir, 'skips.txt')
  fs.writeFileSync(skipsFile, 'RED_FIXTURE skipped test for AC-20260820-94-1\n')
  const manifest = path.join(dir, 'manifest.jsonl')
  const r = runNode('scripts/ac-matrix.js', ['--spec', spec, '--root', dir, '--manifest', manifest, '--skips', skipsFile, '--json'])
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, 'ac-matrix.js --json output must parse: ' + r.stdout + r.stderr)
  const row = manifestRows(manifest).find((x) => x.leg === 'skip-reconcile')
  assert.ok(row, 'ac-matrix.js must append a "skip-reconcile" manifest row: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 1,
    'a reported skip on an AC bullet with no [env:] sanction must redden skip-reconcile: ' + JSON.stringify(row))
  assert.strictEqual(row.observed, 'skipped=1 sanctioned=0', JSON.stringify(row))
  assert.ok(out.findings.some((f) => f.class === 'unsanctioned-skip' && f.detail.includes('AC-20260820-94-1')),
    'evidence the check engaged: the finding must name the exact planted AC-ID, proving the check mapped and ' +
    'evaluated OUR skip line: ' + JSON.stringify(out.findings))
}

// promise-sweep: a Decisions row carrying no AC-ID token and no [no-ac:] sanction.
function legPromiseSweep() {
  const dir = tmpdir('rfc-promise')
  const spec = path.join(dir, 'spec.md')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(spec,
    '# Fixture\n\n## Decisions\n\n| ID | Decision | One-line rationale |\n|----|----------|--------------------|\n' +
    '| D1 | RED_FIXTURE_ORPHAN_DECISION — carries no AC-ID and no [no-ac:] sanction | why |\n\n' +
    '## Acceptance Criteria\n\n- **AC-20260820-93-1**: unrelated bullet, not cited by D1.\n')
  const manifest = path.join(dir, 'manifest.jsonl')
  const r = runNode('scripts/promise-sweep.js', ['--spec', spec, '--manifest', manifest, '--json'])
  let out
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout) }, 'promise-sweep.js --json output must parse: ' + r.stdout + r.stderr)
  assert.strictEqual(r.status, 1,
    'a Decisions row with no AC-ID and no [no-ac:] sanction must redden promise-sweep: ' + r.stdout + r.stderr)
  const row = manifestRows(manifest).find((x) => x.leg === 'promise-sweep')
  assert.ok(row, 'promise-sweep.js must append a "promise-sweep" manifest row: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 1, JSON.stringify(row))
  const f = out.findings.find((x) => x.class === 'orphan-decision')
  assert.ok(f, 'evidence the check engaged: an orphan-decision finding must exist: ' + JSON.stringify(out.findings))
  assert.ok(f.detail.includes('D1'),
    'evidence the check engaged: the finding detail must name the exact planted row (D1): ' + JSON.stringify(f))
}

// smoke: smoke.sh directly — a bootCommand that genuinely runs (proven by a marker file it
// writes) paired with a readyCheck that can never pass, so red comes from a real timeout, not a
// precondition (no-runtime / boot-crashed / usage error).
function legSmoke() {
  const dir = tmpdir('rfc-smoke')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  const marker = path.join(dir, 'booted')
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    runtime: {
      bootCommand: `touch ${marker} && sleep 30`,
      readyCheck: `test -f ${marker}.never-appears`,
      readyTimeout: 3,
    },
  }))
  const r = runBash('scripts/smoke.sh', [], { cwd: dir, timeout: 30000 })
  assert.notStrictEqual(r.status, 0,
    'a readyCheck that can never pass must redden smoke.sh: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /__SMOKE_FAIL__ not-ready/,
    'the not-ready sentinel must be the reported verdict — a different failure mode here means the fixture ' +
    'did not exercise the readiness-timeout path this test plants: ' + r.stdout)
  assert.ok(fs.existsSync(marker),
    'evidence the check engaged: the boot command must have genuinely executed (proven by the marker file it ' +
    'writes) even though the leg still reddens on the readyCheck timeout — distinguishing a real boot-and-fail ' +
    'from a stub that reports not-ready without ever spawning bootCommand')
}

const LEG_HANDLERS = {
  gate: legGate,
  smoke: legSmoke,
  reconcile: legReconcile,
  'ac-matrix': legAcMatrix,
  'skip-reconcile': legSkipReconcile,
  ci: legCi,
  'at-risk': legAtRisk,
  'promise-sweep': legPromiseSweep,
}

for (const leg of LEGS) {
  test(`red-fixture coverage: the "${leg}" review leg (verdict.js REVIEW_LEGS) can actually go red on a planted violation`, () => {
    const handler = LEG_HANDLERS[leg]
    assert.ok(handler,
      `no red-fixture handler is registered in this meta-test for review leg "${leg}" — either verdict.js's ` +
      `REVIEW_LEGS grew a new leg this guard hasn't been taught to fixture (add a handler to LEG_HANDLERS in ` +
      `tests/consistency/red-fixture-coverage.test.js) or this leg name is stale. Failing closed on an ` +
      `unfixtured check — never silently passing it — is the entire point of this file.`)
    handler()
  })
}

// ---- hooks.json handlers -------------------------------------------------------------------

// spec-state-gate.sh: a spec declaring a nonzero open_markers counter must block /spec:build.
function hookSpecState() {
  const dir = tmpdir('rfc-hook-specstate')
  fs.mkdirSync(path.join(dir, 'specs/20260820'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260820/92-fixture.md'),
    '---\nstatus: hardened\nopen_markers: 2\n---\n# Fixture\nRED_FIXTURE_OPEN_MARKER body\n')
  const r = runBash('scripts/spec-state-gate.sh', [], {
    input: JSON.stringify({ prompt: '/spec:build specs/20260820/92-fixture.md' }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
  assert.strictEqual(r.status, 2,
    'a spec declaring open_markers: 2 must block /spec:build at the prompt boundary: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /open_markers: 2/,
    'evidence the check engaged: stderr must echo the exact planted counter value (2) — a generic block ' +
    'message here would mean the gate never actually read the frontmatter: ' + r.stderr)
}

// genesis-state-gate.sh: architect: pending must block /spec:genesis-explore.
function hookGenesisState() {
  const dir = tmpdir('rfc-hook-genesis')
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/status.json'), JSON.stringify({ architect: 'pending' }))
  const r = runBash('scripts/genesis-state-gate.sh', [], {
    input: JSON.stringify({ prompt: '/spec:genesis-explore' }),
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
  })
  assert.strictEqual(r.status, 2,
    'status.json declaring architect: pending must block /spec:genesis-explore: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /architect: pending/,
    'evidence the check engaged: stderr must echo the exact planted architect value ("pending") — a generic ' +
    'block message here would mean the gate never actually read status.json: ' + r.stderr)
}

// question-style-gate.js: an option description under the deterministic tier-1 floor must block
// before the tier-2 judge is ever consulted (SPEC_QUESTION_JUDGE=off proves it never was).
function hookQuestionStyle() {
  const payload = {
    tool_name: 'AskUserQuestion',
    tool_input: {
      questions: [{
        header: 'q',
        question: 'Pick one',
        options: [{ label: 'RED_FIXTURE_VAGUE_OPTION', description: 'short' }],
      }],
    },
  }
  const r = runNode('scripts/question-style-gate.js', [], {
    input: JSON.stringify(payload),
    env: { ...process.env, SPEC_QUESTION_JUDGE: 'off' },
  })
  assert.strictEqual(r.status, 2,
    'an option description under the MIN_DESC floor must block: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /RED_FIXTURE_VAGUE_OPTION/,
    'evidence the check engaged: stderr must name the exact planted option label — a generic BLOCKED message ' +
    'here would mean the tier-1 check never actually evaluated this option: ' + r.stderr)
}

// block-cross-worktree-writes.sh: a write whose target crosses into a different working tree of
// the same repo must block; paired with a same-tree control that must pass, so a stub that
// always exits 2 cannot pass this fixture.
function hookCrossWorktree() {
  const root = fs.realpathSync(tmpdir('rfc-hook-xwt'))
  gitRepo(root)
  const wt = path.join(root, '.claude/worktrees/w1')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'rfc-w1', wt, 'HEAD'])
  const run = (payload) => runBash('scripts/block-cross-worktree-writes.sh', [], { input: JSON.stringify(payload) })

  const sameTree = run({ cwd: wt, tool_input: { file_path: path.join(wt, 'ok.txt') } })
  assert.strictEqual(sameTree.status, 0,
    'evidence the check engaged: a write staying inside cwd\'s own worktree must be allowed — if this control ' +
    'case also blocked, a stub that always exits 2 would pass the planted case below too: ' + sameTree.stderr)

  const crossTree = run({ cwd: wt, tool_input: { file_path: path.join(root, 'RED_FIXTURE_CROSS_WORKTREE.txt') } })
  assert.strictEqual(crossTree.status, 2,
    'a write whose target resolves to a DIFFERENT working tree of the same repo must be blocked: ' + crossTree.stderr)
  assert.match(crossTree.stderr, /BLOCKED:/,
    'the blocked case must print the BLOCKED: diagnostic on stderr: ' + crossTree.stderr)
}

const HOOK_HANDLERS = {
  'spec-state-gate.sh': hookSpecState,
  'genesis-state-gate.sh': hookGenesisState,
  'question-style-gate.js': hookQuestionStyle,
  'block-cross-worktree-writes.sh': hookCrossWorktree,
}

for (const hookPath of HOOK_PATHS) {
  const base = path.basename(hookPath)
  test(`red-fixture coverage: the hook script "${hookPath}" (spec/hooks/hooks.json) can actually block on a planted violation`, () => {
    const handler = HOOK_HANDLERS[base]
    assert.ok(handler,
      `no red-fixture handler is registered in this meta-test for hook script "${hookPath}" — either ` +
      `hooks.json wired a new script this guard hasn't been taught to fixture (add a handler to HOOK_HANDLERS ` +
      `in tests/consistency/red-fixture-coverage.test.js) or this path is stale. Failing closed on an ` +
      `unfixtured check — never silently passing it — is the entire point of this file.`)
    handler()
  })
}
