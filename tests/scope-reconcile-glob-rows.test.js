'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// PRAX-20260813-05 (row for scope-reconcile.js, corroborating specs/20260805/01-review-scope-
// reconciliation.md): scope-reconcile.js does not expand File Plan glob rows before comparing
// against the changed-file set (parseFilePlan/lib/file-plan.js keeps a glob cell like
// `dir/*.ext` as a literal string; scope-reconcile.js's `filePlanPaths.has(p)` check is an exact
// string match, never a glob match, against the CONCRETE changed file). A codegen output File
// Plan row written as a glob therefore double-reports: the concrete changed file lands in
// outOfPlan (its literal path was never in filePlanPaths) AND the glob row itself lands in
// unrealized (the literal glob string was never among the changed files). Confirmed by direct
// execution against a synthetic fixture below, before this test existed. First incident: prax
// spec 20260810/05 deviation; second: spec 20260812/01, contracts codegen ripple.
//
// specs/20260813/03-gate-script-mechanics.md D2 pins the fix: AC-20260813-03-4 (glob-covered
// file excluded from outOfPlan) and AC-20260813-03-5 (glob row excluded from unrealized once a
// non-excluded changed file matches it), both against this same fixture.
//
// specs/20260815/02-at-risk-pins.md AC-20260815-02-11 (D2 byte-compatibility): the additive
// `atRisk` field must not disturb outOfPlan/unrealized/excluded/renamed or the exit-code
// alphabet these three tests already pin — retagged in place, assertions unweakened.
//
// specs/20260823/04-review-close-hardening.md D6/D9 (2026-08-23): `.claude/agent-memory/**` is
// structurally out-of-plan on every worker-dispatching build (no File Plan can enumerate the
// memories a worker will write) — D6 adds it to lib/glob-match.js's BASELINE_GLOBS, so a changed
// agent-memory file must land in `excluded`, never `outOfPlan` (AC-20260823-04-7, new test below,
// red at HEAD: BASELINE_GLOBS is `['specs/**', '.claude/spec-runs.jsonl']` today and does not
// match `.claude/agent-memory/**`). Per D9, AC-20260823-04-9 (a plainly unplanned file still
// lands in outOfPlan) has no existing positive assertion in THIS file to retag — the three tests
// above only assert the negative (`!outOfPlan.includes(...)`), and the positive can't be folded
// into any of them without changing their own pinned `exit 0` (a genuinely unplanned file flips
// scope-reconcile.js's exit code to 3) — so AC-9 lands as one new, minimal, standalone test
// instead of duplicating a fourth near-identical fixture block; `[pre-green: predicate-in-test]`
// since the outOfPlan predicate itself is unchanged by D6.

const SCRIPT = 'scripts/scope-reconcile.js'
const GLOB_ROW = 'packages/contracts/schemas/*.json'
const CONCRETE_FILE = 'packages/contracts/schemas/run_event.json'

function specWithGlobPlan(dir, relPath) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full,
    '---\nstatus: implementing\n---\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    `| \`${GLOB_ROW}\` | CREATE | contracts | codegen output |\n`)
  return relPath
}

test('AC-20260813-03-4 / PRAX-20260813-05 / AC-20260815-02-11 (CONTINUE TO): a File Plan glob row does not double-report — the concrete changed file it covers must not land in outOfPlan, and the run exits 0', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithGlobPlan(dir, 'specs/20260813/05-x.md')
  fs.mkdirSync(path.join(dir, 'packages/contracts/schemas'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONCRETE_FILE), '{}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'codegen output')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(!out.outOfPlan.includes(CONCRETE_FILE),
    `the File Plan row \`${GLOB_ROW}\` covers ${CONCRETE_FILE} by glob, but scope-reconcile.js ` +
    'only does an exact string match against the literal glob text, never a glob match against ' +
    'the concrete changed file — so a legitimate codegen output the plan explicitly covers is ' +
    'reported as an out-of-plan violation: ' + JSON.stringify(out))
  assert.strictEqual(r.status, 0,
    'AC-20260813-03-4 requires exit 0 once the glob-covered file is excluded from outOfPlan — a ' +
    'nonzero exit here means the glob row is still not recognized as covering the changed file: ' + r.stderr)
})

test('AC-20260813-03-5 / PRAX-20260813-05 / AC-20260815-02-11 (CONTINUE TO): a File Plan glob row realized by a concrete changed file must not also land in unrealized', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithGlobPlan(dir, 'specs/20260813/05-x.md')
  fs.mkdirSync(path.join(dir, 'packages/contracts/schemas'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONCRETE_FILE), '{}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'codegen output')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(!out.unrealized.includes(GLOB_ROW),
    `the literal glob string \`${GLOB_ROW}\` never appears among the changed files (only its ` +
    `concrete match ${CONCRETE_FILE} does), so scope-reconcile.js reports the row itself as ` +
    'planned-but-untouched even though a real file realized it — the same File Plan row is ' +
    'double-counted as BOTH an out-of-plan violation and an unrealized promise: ' + JSON.stringify(out))
})

// D2's excluded-set rule (Contracts: "unrealized: a glob row is unrealized only if no
// NON-EXCLUDED changed file globMatch-es it — match set = changed minus excludedSet —
// pipeline-owned noise never realizes a row"). Fixture: the File Plan glob row is matched ONLY
// by a changed file that is itself pipeline-owned (via an additive `pipelineOwnedPaths` glob in
// `.claude/spec.config.json` matching the exact same pattern as the File Plan row) — no
// non-excluded changed file matches the row at all. Refuter finding folded into D2: without the
// excludedSet subtraction, this excluded file would fake the row's realization and hide a
// codegen output File Plan row that no real reviewer-visible file ever touched.
test('AC-20260813-03-5 (excluded-overlap facet) / AC-20260815-02-11 (CONTINUE TO) / AC-20260825-05-4 (CONTINUE TO): a File Plan glob row matched ONLY by a pipeline-owned (excluded) changed file stays unrealized, and the excluded file stays out of outOfPlan', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'),
    JSON.stringify({ pipelineOwnedPaths: [GLOB_ROW] }))
  g('add', '-A'); g('commit', '-q', '-m', 'config')
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithGlobPlan(dir, 'specs/20260813/05-x.md')
  fs.mkdirSync(path.join(dir, 'packages/contracts/schemas'), { recursive: true })
  fs.writeFileSync(path.join(dir, CONCRETE_FILE), '{}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'codegen output, but pipeline-owned by config')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(out.excluded.includes(CONCRETE_FILE),
    `${CONCRETE_FILE} matches the host's additive pipelineOwnedPaths glob (\`${GLOB_ROW}\`) and ` +
    'must be visible in excluded, or the fixture is not actually exercising the excluded-set ' +
    'facet this test pins: ' + JSON.stringify(out))
  assert.ok(!out.outOfPlan.includes(CONCRETE_FILE),
    `${CONCRETE_FILE} is pipeline-owned (excluded) — the excluded-set filter that already keeps ` +
    'ordinary excluded files out of outOfPlan must still apply once glob-row matching is added: ' +
    JSON.stringify(out))
  assert.ok(out.unrealized.includes(GLOB_ROW),
    `the File Plan row \`${GLOB_ROW}\` is matched only by ${CONCRETE_FILE}, which is pipeline-` +
    'owned/excluded — D2 requires realization to count only NON-EXCLUDED changed files, so an ' +
    'excluded match must not fake this row as realized; if the row is missing from unrealized, ' +
    'the excludedSet subtraction was skipped and a codegen output row no reviewer-visible file ' +
    'ever touched would silently pass as done: ' + JSON.stringify(out))
})

function specWithEmptyPlan(dir, relPath) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full,
    '---\nstatus: implementing\n---\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `src/planned.js` | CREATE | src | unrelated planned row |\n')
  return relPath
}

test('AC-20260823-04-7: a changed .claude/agent-memory/ file absent from the File Plan lands in excluded (never outOfPlan), and outOfPlan is empty', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithEmptyPlan(dir, 'specs/20260823/04-x.md')
  fs.mkdirSync(path.join(dir, '.claude/agent-memory/gate-scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/agent-memory/gate-scripts/x.md'), '# worker memory\n')
  g('add', '-A'); g('commit', '-q', '-m', 'worker memory write')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(out.excluded.includes('.claude/agent-memory/gate-scripts/x.md'),
    'no File Plan can enumerate the memories a worker will write (D6\'s own rationale) — ' +
    '.claude/agent-memory/** must be a BASELINE_GLOBS exclusion like specs/** already is, so a ' +
    'changed worker-memory file is visible in excluded rather than silently invisible: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.outOfPlan, [],
    'BASELINE_GLOBS does not include .claude/agent-memory/** at HEAD, so this changed file is ' +
    'neither excluded nor in the File Plan — a worker-dispatching build would raise a spurious ' +
    'out-of-plan finding on its own memory write every single time: ' + JSON.stringify(out))
})

test('retained review evidence under .claude/spec-runs/ absent from the File Plan lands in excluded (never outOfPlan) — the driver writes it via its own --retain', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithEmptyPlan(dir, 'specs/20260824/07-z.md')
  fs.mkdirSync(path.join(dir, '.claude/spec-runs/render/07-z'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs/rev-abc123.json'), '{"runId":"rev-abc123"}\n')
  fs.writeFileSync(path.join(dir, '.claude/spec-runs/render/07-z/report.json'), '{}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'retained evidence write')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(out.excluded.includes('.claude/spec-runs/rev-abc123.json'),
    'spec-review-driver.js retains every hard-stop/escalation/close artifact under .claude/spec-runs/ ' +
    'via its mandatory --retain — no File Plan can enumerate them, so .claude/spec-runs/** must be a ' +
    'BASELINE_GLOBS exclusion exactly like .claude/spec-runs.jsonl already is: ' + JSON.stringify(out))
  assert.ok(out.excluded.includes('.claude/spec-runs/render/07-z/report.json'),
    'render-gate.js\'s default --out fallback writes under .claude/spec-runs/render/ — the same glob ' +
    'must cover nested paths: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.outOfPlan, [],
    'without the glob every host review flags its own retained evidence as out-of-plan after any ' +
    'hard-stop or escalation (UpWell 2026-08-24: four such files forced a waive): ' + JSON.stringify(out))
})

test('AC-20260823-04-9 (CONTINUE TO) [pre-green: predicate-in-test]: a changed file outside every exclusion and every File Plan row still lands in outOfPlan', () => {
  const dir = tmpdir('scope-reconcile-glob')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithEmptyPlan(dir, 'specs/20260823/04-y.md')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/stray.js'), '// unplanned, unrelated to src/planned.js\n')
  g('add', '-A'); g('commit', '-q', '-m', 'unplanned change')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.ok(out.outOfPlan.includes('src/stray.js'),
    'a changed file matching no File Plan row (literal or glob) and no pipeline-owned/baseline ' +
    'exclusion must still land in outOfPlan — D6\'s agent-memory addition must narrow this ' +
    'predicate\'s BLIND SPOT (agent-memory only) without ever widening the exclusion itself to ' +
    'swallow an ordinary unplanned file: ' + JSON.stringify(out))
})
