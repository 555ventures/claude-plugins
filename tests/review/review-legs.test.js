'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// review-legs.js replaces /spec:review's hand-performed Phase 0 — it runs every deterministic
// review leg (reconcile, gate w/ resolved {testDirs}, smoke, ci, at-risk, ac-matrix +
// skip-reconcile), appends one JSONL row per leg to the evidence manifest verdict.js derives
// from, and exits 1 only when a blocking leg (gate/smoke/ci) is red. These tests drive it
// end-to-end against a synthetic git host — the same manifest then feeds verdict.js, pinning the
// two scripts' row-shape contract in one place.
//
// specs/20260817/07-promise-sweep-leg.md D4 (AC-20260817-07-9, AC-20260817-07-10): review-legs.js
// gains an eighth leg, promise-sweep, run in every scope including --fix-delta. The synthetic
// host spec below gains a `## Decisions` section with one row carrying the spec's own AC-ID
// (per the spec's own Fragile Spots note) so the green-host test's exit-0 assertions keep
// meaning "every leg genuinely passed" rather than "promise-sweep honestly reported an orphan".
//
// specs/20260820/03-review-observation-truth.md D1 (AC-20260820-03-1, AC-20260820-03-2):
// env-preflight.js is authored and wired into build/design/doctor and now also the review path
// (closing the authored-not-activated class) — review-legs.js runs `env-preflight.js --root
// <root>` (default mode) as a precondition before wave 1; a preflight exit 1 (an unset declared
// `testEnv` var) becomes review-legs.js exit 2, stderr naming the unset var(s) and their
// provision command(s), with NO manifest row appended for any leg. `makeHost` below grows an
// optional `testEnv` param so the one new test can declare an unset gating var without
// disturbing every other fixture in this file, which omit it and so see zero behavior change
// (AC-2 — the existing green-host test, tagged below).
//
// specs/20260820/06-typed-evidence-manifest.md D1/D2/D5: every leg row's `observed` field is a
// typed JSON object. This host declares no `testCountPattern`, so the gate row's
// `testsExecuted` typed sub-field is {"unavailable":"no-format-declared"} throughout (D5:
// pattern absent -> typed unavailability, never assumed zero) — the testCountPattern-driven
// branches (AC-20260820-06-5/6/7) are pinned separately in
// tests/review/legs-verdict-pair.test.js, the grammar authority (D10). Every
// `byLeg.get(...).observed` assertion below is retyped in place; none is retagged.
//
// specs/20260830/03-ci-leg-honest-absence.md D4: the ci leg must not map ci-query.js's
// `{available:false,transient:false}` for an unpushed HEAD identically to "no CI at all"
// (`{"unavailable":"no-adapter"}`) — that reading is indistinguishable from a host with zero CI
// tooling, so unpushed commits against a red origin branch would read green. ci-query.js emits a
// `shaUnseen` shape (specs/20260830/03-ci-leg-honest-absence.md D1/D2/D3, pinned in
// tests/review/ci-query.test.js) carrying the current branch's own latest origin conclusion;
// this leg maps THAT shape to `{"unavailable":"sha-unseen","branch":...,"branchConclusion":...}`
// at exit 0 — a red branchConclusion must never redden the leg (the never-block ruling).
// `makeHostForCiLeg` mirrors `makeHost` but omits `capabilities.forge` (legacy dynamic-probe mode,
// the same pattern release-legs.test.js's AC-20260823-01-7 already uses) and has no remote at all,
// so its HEAD is unpushed by construction — a fake `gh` on PATH branching on argv (the
// ci-query.test.js A5 pattern) answers `--commit` empty and `--branch main` with a real red run.
//
// specs/20260903/02-whole-suite-review-leg.md D1-D3 (AC-20260903-02-1..5, -12): review-legs.js
// gains a ninth leg, `suite`, its own wave 1b — it runs the host's bare `testCommand` (no file
// args) once per legs iteration, typed like the gate row, and is BLOCKING (RED_BLOCKING: suite,
// exit 1). D2's two fail-closed alternatives (no testCommand at all; a declared
// testCountPattern observing exactly 0 executed tests on an exit-0 run) are pinned directly.
// AC-2's host is A2's own executed construction: the scanner lives in tests/consistency/ (a
// SIBLING of the File Plan's tests/inplan/ row, never beside it — a scanner beside the planned
// test reddens the gate GLOB itself, a different failure) and its own source text never
// mentions the changed file's path stem, so scope-reconcile's at-risk derivation cannot select
// it either — the bare `testCommand` is the only leg that ever executes it. The required-leg
// loop below gains `suite`, retagged AC-20260903-02-12.

const SCRIPT = 'scripts/review-legs.js'

const SPEC_BODY = `---
status: implementing
tier: standard
---
# Test Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260817-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260817-99-1**: foo() returns 42.
`

function makeHost({ testBody, testEnv }) {
  const dir = tmpdir('review-legs')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const config = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }
  // AC-20260820-03-1: only set when a test explicitly opts in — every other fixture in this file
  // omits `testEnv` and must see byte-identical config JSON to before this param existed (AC-2).
  if (testEnv) config.testEnv = testEnv
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), testBody)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

function run(dir, base, extra = []) {
  // The manifest lives OUTSIDE the fixture repo — an untracked file inside it would honestly
  // (and correctly) reconcile as out-of-plan.
  const manifest = path.join(tmpdir('review-legs-out'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260817/99-test.md',
    '--base', base, '--manifest', manifest, ...extra])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest }
}

test('AC-20260820-03-1: an unset declared testEnv var makes review-legs.js exit 2 before any leg runs, naming the var and its provision command on stderr, with no manifest row appended', () => {
  const { dir, base } = makeHost({
    testBody: GREEN_TEST,
    testEnv: [{ var: 'SPEC_FAKE_GATE_VAR', provision: 'echo provision-me' }],
  })
  const { r, manifest } = run(dir, base)
  assert.strictEqual(r.status, 2,
    'D1: review-legs.js must run env-preflight.js --root <root> as a precondition before wave 1 — an unset ' +
    'declared testEnv var must stop the run at exit 2 (the same usage/precondition-failure code an unreadable ' +
    'config produces), never proceed to spawn any leg against an unprovisioned environment: ' +
    r.stdout + r.stderr)
  assert.ok(!fs.existsSync(manifest) || fs.readFileSync(manifest, 'utf8').trim() === '',
    'a precondition failure must append NO manifest rows — any row here means a leg ran before the preflight ' +
    'check stopped it, the exact "review refuses to start on an unprovisioned environment" guarantee this AC ' +
    'exists to pin: ' + (fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : '(absent)'))
  assert.match(r.stderr, /SPEC_FAKE_GATE_VAR/,
    'stderr must name the unset variable SPEC_FAKE_GATE_VAR so the session knows which var to provision — a ' +
    'generic failure message here leaves the remedy undiscoverable: ' + r.stderr)
  assert.match(r.stderr, /echo provision-me/,
    'stderr must name the provision command "echo provision-me" verbatim so the session can run it directly ' +
    'without reading .claude/spec.config.json itself: ' + r.stderr)
})

// specs/20260830/02-close-gate-rerun.md D3: resolveGate() moves out of this script into
// spec/scripts/lib/gate-resolve.js (resolveGate(specText, config)), imported here byte-
// identically — one derivation of {testDirs}/{scopeDirs} substitution shared with the driver's
// close-time gate re-run. This test drives the real review-legs.js binary end-to-end and already
// asserts the gate leg executes the resolved glob form and exits 0 (the bare-directory class),
// so it is the extraction's own regression pin — tagged in place below, never duplicated, never
// weakened.
test('AC-20260820-03-2 (also AC-20260830-02-3, AC-20260903-02-12, SHALL CONTINUE TO): a green synthetic host produces every required leg row (now nine, suite included), resolves {testDirs} to the glob form via lib/gate-resolve.js\'s resolveGate(), and exits 0', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base)
  for (const leg of ['gate', 'suite', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']) {
    assert.ok(byLeg.has(leg),
      `the manifest must carry a "${leg}" row — verdict.js's REVIEW_LEGS presence rule derives UNVERIFIED ` +
      `without it, so a review over this manifest could never close: rows=${JSON.stringify([...byLeg.keys()])} ` +
      `stderr=${r.stderr}`)
  }
  assert.strictEqual(byLeg.get('promise-sweep').exit, 0,
    `AC-20260817-07-9: the synthetic host spec's one Decisions row cites the spec's own declared AC-ID, so ` +
    `promise-sweep must report it carried and exit 0 — a non-zero exit here means the fixture's carrier row ` +
    `regressed to an orphan: ${JSON.stringify(byLeg.get('promise-sweep'))}`)
  assert.deepStrictEqual(byLeg.get('promise-sweep').observed, { rows: 1, carried: 1, sanctioned: 0, orphans: 0 },
    `promise-sweep's observed must match the pinned typed grammar for one carried row — got ` +
    `${JSON.stringify(byLeg.get('promise-sweep'))}`)
  assert.strictEqual(byLeg.get('gate').exit, 0,
    'the gate must run the resolved glob form and pass — a non-zero exit here means {testDirs} resolution ' +
    'handed the runner something it could not execute (the JJ-20260815-04 bare-directory class): ' + r.stdout)
  assert.deepStrictEqual(byLeg.get('gate').observed, { skips: 0, todos: 0, testsExecuted: { unavailable: 'no-format-declared' } },
    'skip counts must be captured via capabilities.skipReportPattern from the gate output, zero-skip runs ' +
    'included — an unavailable skips observation here means the pattern was not applied; this host declares ' +
    'no testCountPattern, so testsExecuted must be typed {"unavailable":"no-format-declared"}, never assumed ' +
    'zero (D5): ' + JSON.stringify(byLeg.get('gate')))
  assert.deepStrictEqual(byLeg.get('smoke').observed, { result: 'inert' },
    'a host declaring runtime.inert must record the sanctioned inert observation (smoke exit 4): ' +
    JSON.stringify(byLeg.get('smoke')))
  assert.deepStrictEqual(byLeg.get('ci').observed, { unavailable: 'no-adapter' },
    'capabilities.forge "none" must short-circuit the ci leg to an honest typed unavailable, never a probe: ' +
    JSON.stringify(byLeg.get('ci')))
  assert.deepStrictEqual(byLeg.get('reconcile').observed, { outOfPlan: 0, files: [] },
    'AC-20260824-06-8 (retag of this pin\'s reconcile-shape half): both changed files are File Plan rows, so ' +
    'reconcile must report {"outOfPlan":0,"files":[]} — files stays present (empty array), never omitted, even ' +
    'when nothing is out of plan (D5): ' + JSON.stringify(byLeg.get('reconcile')))
  assert.strictEqual(byLeg.get('ac-matrix').exit, 0,
    'the one AC is cited by the test file, so ac-matrix must report full coverage: ' + JSON.stringify(byLeg.get('ac-matrix')))
  assert.strictEqual(r.status, 0,
    'every blocking leg is green — review-legs must exit 0 so the review proceeds to the reviewer: ' + r.stdout + r.stderr)
})

test('AC-20260903-02-12 (also, SHALL CONTINUE TO): the green manifest feeds verdict.js to CLEAN — the two scripts agree on row shapes, including the new suite row', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { manifest } = run(dir, base)
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(v.stdout.split('\n')[0], 'CLEAN',
    'review-legs.js rows must satisfy verdict.js\'s required-leg and greenness derivation end-to-end — ' +
    'UNVERIFIED here means a leg name or row shape drifted between the two scripts: ' + v.stdout + ' / ' + v.stderr)
})

test('a red gate exits 1 and names RED_BLOCKING — the review hard-stops before any reviewer spend', () => {
  const { dir, base } = makeHost({
    testBody: GREEN_TEST.replace('assert.strictEqual(foo(), 42)', 'assert.strictEqual(foo(), 43)'),
  })
  const { r, byLeg } = run(dir, base)
  assert.notStrictEqual(byLeg.get('gate').exit, 0, 'the failing test must redden the gate leg: ' + r.stdout)
  assert.strictEqual(r.status, 1,
    'a red blocking leg must exit 1 — exit 0 would let the review proceed to reviewer spend on a red substrate: ' + r.stdout)
  assert.match(r.stdout, /RED_BLOCKING: .*gate/,
    'the summary must name the red blocking leg so the session can report the remedy without parsing the manifest: ' + r.stdout)
})

test('--fix-delta skips reconcile/at-risk and still records the re-executed legs (CROSS-20260727-01: a fix pass re-asserts state, never inherits it)', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base, ['--fix-delta'])
  assert.ok(!byLeg.has('reconcile') && !byLeg.has('at-risk'),
    'fix-delta scope must not run reconcile/at-risk (the fix diff is by definition a response to findings): ' +
    JSON.stringify([...byLeg.keys()]))
  for (const leg of ['gate', 'smoke', 'ci', 'ac-matrix', 'skip-reconcile', 'promise-sweep']) {
    assert.ok(byLeg.has(leg),
      `fix-delta must RE-RUN "${leg}" in full — inheriting the prior iteration's row is the exact ` +
      `fail-open CROSS-20260727-01 closed: ${JSON.stringify([...byLeg.keys()])}`)
  }
  assert.strictEqual(byLeg.get('promise-sweep').exit, 0,
    `AC-20260817-07-10: promise-sweep is excluded from no scope (D4: "the leg is milliseconds") — a ` +
    `--fix-delta run must still emit a green promise-sweep row, not skip it alongside reconcile/at-risk: ` +
    `${JSON.stringify(byLeg.get('promise-sweep'))}`)
  assert.strictEqual(r.status, 0, 'green fix-delta legs must exit 0: ' + r.stdout + r.stderr)
})

// specs/20260824/06-review-range-identity.md D5: the reconcile leg's out-of-plan finding must
// never survive only because the reviewer quotes the filename in prose while the manifest row
// reduces it to a bare integer at emission. The reconcile row carries `files` (scope-reconcile's
// outOfPlan array verbatim and in order, always present, capped at 40 with a `filesOmitted`
// count above the cap). `makeHostWithOutOfPlan`
// mirrors `makeHost` but adds N stray committed files outside the File Plan, isolating the
// reconcile row's own out-of-plan shape from the green-host fixture above.
function makeHostWithOutOfPlan(strayFiles) {
  const dir = tmpdir('review-legs-oop')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  for (const f of strayFiles) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    fs.writeFileSync(path.join(dir, f), '// out of plan\n')
  }
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

test('AC-20260824-06-8: WHEN review-legs.js runs full scope against a host where one changed file src/stray.js is outside the File Plan THE SYSTEM appends {"leg":"reconcile","exit":3,"observed":{"outOfPlan":1,"files":["src/stray.js"]}}', () => {
  const { dir, base } = makeHostWithOutOfPlan(['src/stray.js'])
  const { r, byLeg } = run(dir, base)
  assert.strictEqual(byLeg.get('reconcile').exit, 3,
    'a lone out-of-plan changed file must redden the reconcile row (exit 3): ' + r.stdout + r.stderr)
  assert.deepStrictEqual(byLeg.get('reconcile').observed, { outOfPlan: 1, files: ['src/stray.js'] },
    'D5: the reconcile row must carry both the count AND the path array — a reviewer reading only ' +
    '{"outOfPlan":1} cannot name the file without re-running scope-reconcile.js by hand: ' +
    JSON.stringify(byLeg.get('reconcile')))
})

test('AC-20260824-06-9: WHEN 41 changed files are outside the File Plan THE SYSTEM emits files of length 40 holding the first 40 of scope-reconcile\'s outOfPlan array in its order, outOfPlan:41, and filesOmitted:1', () => {
  const strays = Array.from({ length: 41 }, (_, i) => `src/stray${String(i).padStart(2, '0')}.js`)
  const { dir, base } = makeHostWithOutOfPlan(strays)
  const { r, byLeg } = run(dir, base)
  const observed = byLeg.get('reconcile').observed
  assert.strictEqual(observed.outOfPlan, 41,
    'the true out-of-plan count must stay 41 even though files is capped: ' + r.stdout + r.stderr + JSON.stringify(observed))
  assert.strictEqual(observed.files.length, 40,
    'D5: files must be capped at exactly 40 entries when outOfPlan exceeds the cap: ' + JSON.stringify(observed))
  assert.deepStrictEqual(observed.files, [...strays].sort().slice(0, 40),
    'D5: files must hold the FIRST 40 of scope-reconcile\'s outOfPlan array IN ITS ORDER (scope-reconcile sorts ' +
    'outOfPlan lexically) — a differently-ordered or differently-sliced set here misleads a reviewer scanning ' +
    'for a specific stray file: ' + JSON.stringify(observed.files))
  assert.strictEqual(observed.filesOmitted, 1,
    'D5: with 41 out-of-plan files and a 40-entry cap, filesOmitted must be exactly 1 (41-40): ' + JSON.stringify(observed))
})

test('AC-20260824-06-9 (exactly 40): WHEN exactly 40 changed files are outside the File Plan THE SYSTEM emits all 40 and no filesOmitted key', () => {
  const strays = Array.from({ length: 40 }, (_, i) => `src/stray${String(i).padStart(2, '0')}.js`)
  const { dir, base } = makeHostWithOutOfPlan(strays)
  const { r, byLeg } = run(dir, base)
  const observed = byLeg.get('reconcile').observed
  assert.strictEqual(observed.outOfPlan, 40,
    'the true out-of-plan count must be 40: ' + r.stdout + r.stderr + JSON.stringify(observed))
  assert.deepStrictEqual(observed.files, [...strays].sort(),
    'D5: at exactly the cap, files must hold all 40 entries in scope-reconcile\'s order: ' + JSON.stringify(observed))
  assert.ok(!('filesOmitted' in observed),
    'D5: filesOmitted must be present ONLY when outOfPlan exceeds 40 — at exactly 40, no entries were omitted ' +
    'and the key must not appear at all: ' + JSON.stringify(observed))
})

test('a missing spec or config is a precondition failure: exit 2, no manifest rows', () => {
  const dir = tmpdir('review-legs-bare')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/nope.md', '--base', 'HEAD',
    '--manifest', path.join(dir, 'm.jsonl')])
  assert.strictEqual(r.status, 2,
    'no config under --root must exit 2 naming /spec:init — running legs against an ungrounded repo would ' +
    'produce a manifest whose greenness means nothing: ' + r.stdout + r.stderr)
})

// AC-20260830-03-2's own fixture: `capabilities.forge` is omitted (legacy dynamic-probe mode) so
// the ci leg actually shells to `gh`, and the fixture repo carries no remote at all — HEAD is
// unpushed by construction, matching an unpushed-HEAD host shape.
function makeHostForCiLeg() {
  const dir = tmpdir('review-legs-ci-shaunseen')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

// A5's branching shim, local to this file (the ci-query.test.js pattern this AC's fallback
// itself is pinned by): one `gh` answering `--commit` empty and `--branch <name>` with a run.
function fakeGhBranchingDir(commitBody, branchBody) {
  const dir = tmpdir('fake-gh-branching')
  const bin = path.join(dir, 'gh')
  fs.writeFileSync(bin, '#!/usr/bin/env bash\n' +
    'if [[ "$*" == *"--commit"* ]]; then\n' + commitBody + '\n' +
    'elif [[ "$*" == *"--branch"* ]]; then\n' + branchBody + '\n' +
    'fi\n')
  fs.chmodSync(bin, 0o755)
  return dir
}

test('AC-20260830-03-2 (also AC-20260902-05-1): the review ci leg maps ci-query.js\'s shaUnseen shape to {"unavailable":"sha-unseen",branch,branchConclusion,scope:"full"} at exit 0, even though the branch conclusion is failure', () => {
  const { dir, base } = makeHostForCiLeg()
  const ghDir = fakeGhBranchingDir(
    "echo '[]'",
    "echo '[{\"status\":\"completed\",\"conclusion\":\"failure\",\"headSha\":\"abc\",\"url\":\"u\",\"updatedAt\":\"t\"}]'")
  const manifest = path.join(tmpdir('review-legs-out'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260817/99-test.md',
    '--base', base, '--manifest', manifest],
    { env: { ...process.env, PATH: ghDir + path.delimiter + process.env.PATH } })
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  const byLeg = new Map(rows.map(x => [x.leg, x]))
  assert.deepStrictEqual(byLeg.get('ci'),
    { leg: 'ci', exit: 0, observed: { unavailable: 'sha-unseen', branch: 'main', branchConclusion: 'failure' }, scope: 'full' },
    'D4: an unpushed HEAD whose current branch has a real red origin run must map to the honest sha-unseen ' +
    'row at exit 0 — mapping it to {"unavailable":"no-adapter"} (today\'s code) hides the exact salon-os ' +
    'condition this AC exists to surface, and reddening the leg over a red branchConclusion would violate ' +
    'the 2026-08-30 never-block ruling; D1: a full-scope run must stamp "scope":"full" as this row\'s last key: ' +
    JSON.stringify(byLeg.get('ci')) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(r.status, 0,
    'every other blocking leg on this otherwise-green host must pass, so a nonzero exit here can only mean ' +
    'the red branchConclusion leaked into the leg\'s own exit code, which the never-block ruling forbids: ' +
    r.stdout + r.stderr)
})

// D1 (AC-20260902-05-1): review-legs.js's own writer stamps `scope` as the LAST key on every
// row it appends (gate, smoke, reconcile, ci, at-risk); ac-matrix, skip-reconcile and
// promise-sweep write their own rows directly and carry no `scope` key in either mode.
test('AC-20260902-05-1: a full-scope run stamps "scope":"full" as the last key on every row review-legs.js writes through its own writer, while ac-matrix/skip-reconcile/promise-sweep rows carry no scope key', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base)
  for (const leg of ['gate', 'smoke', 'reconcile', 'ci', 'at-risk']) {
    const row = byLeg.get(leg)
    assert.ok(row, `the manifest must carry a "${leg}" row on a full-scope run: ${r.stdout} ${r.stderr}`)
    assert.strictEqual(row.scope, 'full',
      `D1: review-legs.js's own writer must stamp "${leg}"'s row with scope:"full" on a run with no --fix-delta ` +
      `— a missing or wrong scope here means the derivation in verdict.js has nothing to key required legs off ` +
      `of: ${JSON.stringify(row)}`)
    assert.strictEqual(Object.keys(row).at(-1), 'scope',
      `D1: scope must be the LAST key review-legs.js writes on the "${leg}" row — a mid-object key here means ` +
      `some later writer step appended after the stamp: ${JSON.stringify(row)}`)
  }
  for (const leg of ['ac-matrix', 'skip-reconcile', 'promise-sweep']) {
    const row = byLeg.get(leg)
    assert.ok(row, `the manifest must still carry a "${leg}" row: ${r.stdout} ${r.stderr}`)
    assert.ok(!('scope' in row),
      `D1: "${leg}" rows are written by their own script, not review-legs.js's writer, and must carry NO scope ` +
      `key in either mode — a scope key here means the additive field leaked into a sibling writer's rows: ` +
      `${JSON.stringify(row)}`)
  }
})

test('AC-20260902-05-1: a --fix-delta run stamps "scope":"fix-delta" as the last key on gate/smoke/ci rows, while ac-matrix/skip-reconcile/promise-sweep rows still carry no scope key', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base, ['--fix-delta'])
  for (const leg of ['gate', 'smoke', 'ci']) {
    const row = byLeg.get(leg)
    assert.ok(row, `the manifest must carry a "${leg}" row on a --fix-delta run: ${r.stdout} ${r.stderr}`)
    assert.strictEqual(row.scope, 'fix-delta',
      `D1: review-legs.js's own writer must stamp "${leg}"'s row with scope:"fix-delta" when invoked with ` +
      `--fix-delta — a wrong stamp here means the derivation in verdict.js would require the wrong leg set: ` +
      `${JSON.stringify(row)}`)
    assert.strictEqual(Object.keys(row).at(-1), 'scope',
      `D1: scope must be the LAST key on the "${leg}" row under --fix-delta too: ${JSON.stringify(row)}`)
  }
  for (const leg of ['ac-matrix', 'skip-reconcile', 'promise-sweep']) {
    const row = byLeg.get(leg)
    assert.ok(row, `the manifest must still carry a "${leg}" row under --fix-delta: ${r.stdout} ${r.stderr}`)
    assert.ok(!('scope' in row),
      `D1: "${leg}" rows carry no scope key under --fix-delta either — these two writers are unchanged by this ` +
      `spec: ${JSON.stringify(row)}`)
  }
})

// ---- specs/20260903/02-whole-suite-review-leg.md: the "suite" leg ---------------------------

test('AC-20260903-02-1: WHEN review-legs.js runs full scope against a green synthetic host declaring testCommand "node --test" and skipReportPattern with no testCountPattern THE SYSTEM SHALL append exactly one suite row {"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":{"unavailable":"no-format-declared"}},"scope":"full"}, write <out-dir>/suite-output.txt whose first line is "$ node --test", and list suite-output.txt in the outputs line', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const manifest = path.join(tmpdir('review-legs-suite-out'), 'manifest.jsonl')
  const outDir = tmpdir('review-legs-suite-outdir')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260817/99-test.md',
    '--base', base, '--manifest', manifest, '--out-dir', outDir])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  const suiteRows = rows.filter(x => x.leg === 'suite')
  assert.strictEqual(suiteRows.length, 1,
    'D1: exactly one "suite" row must be appended per legs iteration — more than one means the leg ran twice, ' +
    'fewer means it never ran: ' + JSON.stringify(rows))
  assert.deepStrictEqual(suiteRows[0],
    { leg: 'suite', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: { unavailable: 'no-format-declared' } }, scope: 'full' },
    'AC-20260903-02-1 (literal): the suite row must run the bare testCommand (no file args) and type its ' +
    'observed exactly like the gate row\'s grammar, with scope "full" as the last key — a mismatch means the ' +
    'leg observed something other than the whole bare suite: ' + JSON.stringify(suiteRows[0]) + ' / ' + r.stdout + r.stderr)
  const suiteOutputPath = path.join(outDir, 'suite-output.txt')
  assert.ok(fs.existsSync(suiteOutputPath),
    'D1: <out-dir>/suite-output.txt must be written — a red suite row with no retained output is undiagnosable: ' +
    r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(suiteOutputPath, 'utf8').split('\n')[0], '$ node --test',
    'D1: suite-output.txt\'s first line must be "$ <testCommand>" verbatim, mirroring at-risk.txt\'s layout: ' +
    fs.readFileSync(suiteOutputPath, 'utf8').split('\n')[0])
  assert.match(r.stdout, /outputs:.*suite-output\.txt/,
    'D1: the summary\'s outputs: line must name suite-output.txt so a session can find the retained evidence ' +
    'without guessing the filename: ' + r.stdout)
})

// A2 (executed, this spec's own Assumptions): the scanner must live in a SIBLING directory of
// the File Plan's tests row (tests/inplan/), never beside it — a scanner beside the planned
// test reddens the gate GLOB itself (a different failure), and the scanner's own source text
// must never mention the changed file's path stem or scope-reconcile's at-risk derivation would
// select it as an ordinary at-risk finding instead of the invisible blind spot this AC pins.
const SUITE_BLIND_SPEC_BODY = `---
status: implementing
tier: standard
---
# Suite-blind-spot fixture

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260903-98-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/inplan/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260903-98-1**: foo() returns 42.
`

const SUITE_BLIND_GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../../src/foo.js')
test('AC-20260903-98-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// The scanner walks the whole tree for a planted literal — never mentioning "foo" (the changed
// file's stem) anywhere in its own source, so scope-reconcile's content-scan at-risk derivation
// cannot select it.
const SUITE_BLIND_SCANNER = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
test('no tracked file names the forbidden literal', () => {
  const root = path.join(__dirname, '..', '..')
  const hit = walk(root, []).some((p) => fs.readFileSync(p, 'utf8').includes('AC2_SUITE_BLIND_SPOT_LITERAL'))
  assert.strictEqual(hit, false)
})
`

function makeSuiteBlindSpotHost() {
  const dir = tmpdir('review-legs-suite-blind')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/inplan'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests/consistency'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  // Predates the diff and names no changed file by path stem — a repo-wide narration scanner,
  // never an at-risk candidate.
  fs.writeFileSync(path.join(dir, 'tests/consistency/scanner.test.js'), SUITE_BLIND_SCANNER)
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260903'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260903/98-suite-blind.md'), SUITE_BLIND_SPEC_BODY)
  // The diff introduces the forbidden literal into a File Plan file — the scanner above catches
  // it, but the gate glob (tests/inplan/*.test.js) and the at-risk stem match never see it.
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42 // AC2_SUITE_BLIND_SPOT_LITERAL\n')
  fs.writeFileSync(path.join(dir, 'tests/inplan/foo.test.js'), SUITE_BLIND_GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

test('AC-20260903-02-2: WHEN the host\'s File Plan names tests/inplan/foo.test.js and a predating tests/consistency/scanner.test.js (naming no changed file) fails because of a literal the diff introduces THE SYSTEM SHALL append gate exit:0, at-risk observed.files 0, suite exit:1, print RED_BLOCKING: suite, and exit 1', () => {
  const { dir, base } = makeSuiteBlindSpotHost()
  const manifest = path.join(tmpdir('review-legs-suite-blind-out'), 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/20260903/98-suite-blind.md',
    '--base', base, '--manifest', manifest])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  const byLeg = new Map(rows.map(x => [x.leg, x]))
  assert.ok(byLeg.get('gate'), 'the manifest must carry a "gate" row: ' + JSON.stringify(rows) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(byLeg.get('gate').exit, 0,
    'A2 (executed): the gate glob resolves only to tests/inplan/*.test.js — a sibling scanner outside that ' +
    'directory must never redden it: ' + JSON.stringify(byLeg.get('gate')) + ' / ' + r.stdout + r.stderr)
  assert.ok(byLeg.get('at-risk'), 'the manifest must carry an "at-risk" row: ' + JSON.stringify(rows))
  assert.strictEqual(byLeg.get('at-risk').observed.files, 0,
    'A2 (executed): the scanner names no changed file by path stem, so scope-reconcile\'s at-risk derivation ' +
    'must never select it — observed.files must be 0: ' + JSON.stringify(byLeg.get('at-risk')))
  assert.ok(byLeg.get('suite'), 'the manifest must carry a "suite" row: ' + JSON.stringify(rows) + ' / ' + r.stdout + r.stderr)
  assert.strictEqual(byLeg.get('suite').exit, 1,
    'D1: the bare testCommand (node --test, whole repo) must also run the scanner test — this is the one ' +
    'observation invisible to both gate and at-risk, so it alone must redden: ' + JSON.stringify(byLeg.get('suite')))
  assert.match(r.stdout, /RED_BLOCKING: .*suite/,
    'D3: suite is a blocking leg — a red suite row must name itself in the RED_BLOCKING summary line: ' + r.stdout)
  assert.strictEqual(r.status, 1,
    'a red blocking suite leg must hard-stop review-legs.js at exit 1, before any reviewer spend: ' + r.stdout + r.stderr)
})

test('AC-20260903-02-3: WHEN review-legs.js runs with --fix-delta THE SYSTEM SHALL still append the suite row with scope:"fix-delta" as its last key, while reconcile/at-risk stay absent', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base, ['--fix-delta'])
  const row = byLeg.get('suite')
  assert.ok(row, 'the manifest must carry a "suite" row under --fix-delta — the leg runs in EVERY scope, ' +
    'unlike reconcile/at-risk: ' + r.stdout + r.stderr)
  assert.strictEqual(row.exit, 0, 'a green host must keep the suite leg green under --fix-delta: ' + JSON.stringify(row))
  assert.strictEqual(row.scope, 'fix-delta',
    'D1: the suite row must stamp scope:"fix-delta" under --fix-delta: ' + JSON.stringify(row))
  assert.strictEqual(Object.keys(row).at(-1), 'scope',
    'D1: scope must be the LAST key on the suite row too: ' + JSON.stringify(row))
  assert.ok(!byLeg.has('reconcile') && !byLeg.has('at-risk'),
    'fix-delta must still skip reconcile/at-risk while running suite: ' + JSON.stringify([...byLeg.keys()]))
})

function makeHostNoTestCommand() {
  const dir = tmpdir('review-legs-no-testcmd')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

test('AC-20260903-02-4: WHEN the host config declares gateCommand but no testCommand THE SYSTEM SHALL append {"leg":"suite","exit":1,"observed":{"unavailable":"no-test-command"},"scope":"full"}, print RED_BLOCKING: suite, and exit 1', () => {
  const { dir, base } = makeHostNoTestCommand()
  const { r, byLeg } = run(dir, base)
  assert.deepStrictEqual(byLeg.get('suite'),
    { leg: 'suite', exit: 1, observed: { unavailable: 'no-test-command' }, scope: 'full' },
    'D2: a host declaring no testCommand at all must fail closed with the typed whole-row alternative, never a ' +
    'silent skip — testCommand is a contract-required config key: ' + JSON.stringify(byLeg.get('suite')) + ' / ' + r.stdout + r.stderr)
  assert.match(r.stdout, /RED_BLOCKING: .*suite/,
    'D3: suite is blocking — a missing testCommand must hard-stop the review, not degrade to a finding: ' + r.stdout)
  assert.strictEqual(r.status, 1, 'a red blocking suite leg must exit 1: ' + r.stdout + r.stderr)
})

function makeSuiteCountHost(printLine) {
  const dir = tmpdir('review-legs-suite-count')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: `bash -c "echo '${printLine}'"`,
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none', testCountPattern: 'ℹ tests (\\d+)' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20260817'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs/20260817/99-test.md'), SPEC_BODY)
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), GREEN_TEST)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

test('AC-20260903-02-5: WHEN the host declares testCountPattern and its bare testCommand exits 0 printing "ℹ tests 0" THE SYSTEM SHALL append the suite row with exit:1 and observed.testsExecuted 0; WHEN the same shape prints "ℹ tests 3" THE SYSTEM SHALL keep exit:0 with testsExecuted 3', () => {
  const zero = makeSuiteCountHost('ℹ tests 0')
  const zeroRun = run(zero.dir, zero.base)
  assert.deepStrictEqual(zeroRun.byLeg.get('suite'),
    { leg: 'suite', exit: 1, observed: { skips: { unavailable: 'no-format-declared' }, testsExecuted: 0 }, scope: 'full' },
    'D2: a declared testCountPattern observing exactly 0 executed tests on the bare suite invocation must force ' +
    'exit to 1, never a vacuous green: ' + JSON.stringify(zeroRun.byLeg.get('suite')) + ' / ' + zeroRun.r.stdout + zeroRun.r.stderr)

  const three = makeSuiteCountHost('ℹ tests 3')
  const threeRun = run(three.dir, three.base)
  assert.deepStrictEqual(threeRun.byLeg.get('suite'),
    { leg: 'suite', exit: 0, observed: { skips: { unavailable: 'no-format-declared' }, testsExecuted: 3 }, scope: 'full' },
    'D2: the same declared pattern observing a nonzero executed count must keep the child\'s real exit code (0) ' +
    'with the observed count carried through, never forced: ' + JSON.stringify(threeRun.byLeg.get('suite')) + ' / ' + threeRun.r.stdout + threeRun.r.stderr)
})

// specs/20260903/02-whole-suite-review-leg.md close record: the executed-count and skip patterns
// read the runner's SUMMARY line, which every reporter prints last — a test whose NAME quotes the
// summary phrase (this file's own AC-20260903-02-5 above prints `"ℹ tests 0"` inside its name)
// precedes it in the same output, so a first-match read takes the quoted decoy as the count.
test('the suite row reads the LAST testCountPattern match, so a per-test line that quotes "ℹ tests 0" ahead of the real summary line "ℹ tests 3" observes 3 and keeps exit 0 — never the quoted decoy and never a forced false red', () => {
  // The stand-in prints a decoy per-test line first (a test name quoting the pattern with a zero
  // count), then the genuine summary line — the exact ordering the runner produces on this host.
  const host = makeSuiteCountHost('✔ AC pin: a bare testCommand printing ℹ tests 0 forces exit 1 (1ms)\'; echo \'ℹ tests 3')
  const out = run(host.dir, host.base)
  assert.deepStrictEqual(out.byLeg.get('suite'),
    { leg: 'suite', exit: 0, observed: { skips: { unavailable: 'no-format-declared' }, testsExecuted: 3 }, scope: 'full' },
    'a first-match read of the testCountPattern takes the quoted "ℹ tests 0" from a test NAME as the executed count ' +
    'and forces the suite row red on a green run — a nondeterministic false GATE_RED whenever that test file reports ' +
    'before the summary line: ' + JSON.stringify(out.byLeg.get('suite')) + ' / ' + out.r.stdout + out.r.stderr)
})
