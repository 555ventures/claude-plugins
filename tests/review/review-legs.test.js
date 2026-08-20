'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// v7.0.0 (2026-08-17): review-legs.js replaces /spec:review's hand-performed Phase 0 — it runs
// every deterministic review leg (reconcile, gate w/ resolved {testDirs}, smoke, ci, at-risk,
// ac-matrix + skip-reconcile), appends one JSONL row per leg to the evidence manifest verdict.js
// derives from, and exits 1 only when a blocking leg (gate/smoke/ci) is red. These tests drive
// it end-to-end against a synthetic git host — the same manifest then feeds verdict.js, pinning
// the two scripts' row-shape contract in one place.
//
// specs/20260817/07-promise-sweep-leg.md D4 (AC-20260817-07-9, AC-20260817-07-10): review-legs.js
// gains an eighth leg, promise-sweep, run in every scope including --fix-delta. The synthetic
// host spec below gains a `## Decisions` section with one row carrying the spec's own AC-ID
// (per the spec's own Fragile Spots note) so the green-host test's exit-0 assertions keep
// meaning "every leg genuinely passed" rather than "promise-sweep honestly reported an orphan".
//
// specs/20260820/03-review-observation-truth.md D1 (AC-20260820-03-1, AC-20260820-03-2,
// 2026-08-20, Salon OS field report): env-preflight.js was authored and wired into
// build/design/doctor but absent from the review path (the 3rd recurrence of the
// authored-not-activated class) — review-legs.js now runs `env-preflight.js --root <root>`
// (default mode) as a precondition before wave 1; a preflight exit 1 (an unset declared
// `testEnv` var) becomes review-legs.js exit 2, stderr naming the unset var(s) and their
// provision command(s), with NO manifest row appended for any leg. `makeHost` below grows an
// optional `testEnv` param so the one new test can declare an unset gating var without
// disturbing every other fixture in this file, which omit it and so see zero behavior change
// (AC-2 — the existing green-host test, tagged below).

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

test('AC-20260820-03-2: a green synthetic host produces every required leg row, resolves {testDirs} to the glob form, and exits 0', () => {
  const { dir, base } = makeHost({ testBody: GREEN_TEST })
  const { r, byLeg } = run(dir, base)
  for (const leg of ['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']) {
    assert.ok(byLeg.has(leg),
      `the manifest must carry a "${leg}" row — verdict.js's REVIEW_LEGS presence rule derives UNVERIFIED ` +
      `without it, so a review over this manifest could never close: rows=${JSON.stringify([...byLeg.keys()])} ` +
      `stderr=${r.stderr}`)
  }
  assert.strictEqual(byLeg.get('promise-sweep').exit, 0,
    `AC-20260817-07-9: the synthetic host spec's one Decisions row cites the spec's own declared AC-ID, so ` +
    `promise-sweep must report it carried and exit 0 — a non-zero exit here means the fixture's carrier row ` +
    `regressed to an orphan: ${JSON.stringify(byLeg.get('promise-sweep'))}`)
  assert.strictEqual(byLeg.get('promise-sweep').observed, 'rows=1 carried=1 sanctioned=0 orphans=0',
    `promise-sweep's observed must match the pinned grammar for one carried row — got ` +
    `${JSON.stringify(byLeg.get('promise-sweep'))}`)
  assert.strictEqual(byLeg.get('gate').exit, 0,
    'the gate must run the resolved glob form and pass — a non-zero exit here means {testDirs} resolution ' +
    'handed the runner something it could not execute (the JJ-20260815-04 bare-directory class): ' + r.stdout)
  assert.strictEqual(byLeg.get('gate').observed, 'skips=0 todos=0',
    'skip counts must be captured via capabilities.skipReportPattern from the gate output, zero-skip runs ' +
    'included — an unavailable observation here means the pattern was not applied: ' + JSON.stringify(byLeg.get('gate')))
  assert.strictEqual(byLeg.get('smoke').observed, 'inert',
    'a host declaring runtime.inert must record the sanctioned inert observation (smoke exit 4): ' +
    JSON.stringify(byLeg.get('smoke')))
  assert.strictEqual(byLeg.get('ci').observed, 'unavailable',
    'capabilities.forge "none" must short-circuit the ci leg to an honest unavailable, never a probe: ' +
    JSON.stringify(byLeg.get('ci')))
  assert.strictEqual(byLeg.get('reconcile').observed, 'outOfPlan=0',
    'both changed files are File Plan rows, so reconcile must report outOfPlan=0: ' + JSON.stringify(byLeg.get('reconcile')))
  assert.strictEqual(byLeg.get('ac-matrix').exit, 0,
    'the one AC is cited by the test file, so ac-matrix must report full coverage: ' + JSON.stringify(byLeg.get('ac-matrix')))
  assert.strictEqual(r.status, 0,
    'every blocking leg is green — review-legs must exit 0 so the review proceeds to the reviewer: ' + r.stdout + r.stderr)
})

test('the green manifest feeds verdict.js to CLEAN — the two scripts agree on row shapes', () => {
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

test('a missing spec or config is a precondition failure: exit 2, no manifest rows', () => {
  const dir = tmpdir('review-legs-bare')
  gitRepo(dir)
  const r = runNode(SCRIPT, ['--root', dir, '--spec', 'specs/nope.md', '--base', 'HEAD',
    '--manifest', path.join(dir, 'm.jsonl')])
  assert.strictEqual(r.status, 2,
    'no config under --root must exit 2 naming /spec:init — running legs against an ungrounded repo would ' +
    'produce a manifest whose greenness means nothing: ' + r.stdout + r.stderr)
})
