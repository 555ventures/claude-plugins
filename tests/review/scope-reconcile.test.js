'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260805/01-review-scope-reconciliation.md (D1/D3/D4): /spec:review diffed only the
// File Plan's directories, so the confirmed 2026-08 host escape (an out-of-plan `waitForExit`
// edit) rode a CLEAN verdict into production. scope-reconcile.js inverts the File Plan from
// scope-definer to prediction-under-test: it reconciles the WHOLE changed-file set (committed
// diff UNION untracked) against the plan, so an out-of-plan file always surfaces (exit 3) and a
// planned-but-untouched file surfaces too (`unrealized`), enforced by a script, never reviewer
// diligence. This file pins the reconciliation contract itself; wf-review/review.md wiring is
// pinned in review-scope-doctrine.test.js.

const SCRIPT = 'scripts/scope-reconcile.js'

function specWithPlan(dir, relPath, planPaths) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  const rows = planPaths.map(p => `| \`${p}\` | CREATE | scripts | — |`).join('\n')
  fs.writeFileSync(full,
    '---\nstatus: implementing\n---\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' + rows + '\n')
  return relPath
}

test('AC-20260805-01-1: an out-of-plan changed file exits 3 and lands in outOfPlan', () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js'])
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a\n')
  fs.writeFileSync(path.join(dir, 'src/b.js'), 'b\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 3,
    'a diff containing a file absent from the File Plan and not pipeline-owned must exit 3: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.outOfPlan, ['src/b.js'],
    'src/b.js was never in the File Plan and is not pipeline-owned — it must be the sole out-of-plan entry')
})

test('AC-20260805-01-2: every changed file planned or pipeline-owned exits 0, with pipeline-owned matches in excluded', () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js'])
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 0,
    'src/a.js is planned and the spec doc itself lives under the pipeline-owned specs/** default — nothing should be out-of-plan: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.outOfPlan, [], 'nothing here is out-of-plan')
  assert.ok(out.excluded.includes(specRel),
    'the spec doc changed under specs/** (a default pipeline-owned exclusion) must be visible in excluded, never silently dropped: ' + JSON.stringify(out))
})

test('AC-20260805-01-3: a planned file with no corresponding change lands in unrealized and still exits 0', () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js', 'src/never.js'])
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a\n')
  g('add', '-A'); g('commit', '-q', '-m', 'work')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 0,
    'outOfPlan is empty here — a plan overshoot alone must never fail the exit code: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.unrealized.includes('src/never.js'),
    'src/never.js was planned but never touched by any changed file — it must surface in unrealized: ' + JSON.stringify(out))
})

test('AC-20260805-01-4: an untracked out-of-plan file with an empty committed diff still exits 3', () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js'])
  g('add', '-A'); g('commit', '-q', '-m', 'plan doc only')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/new.js'), 'new\n')
  // deliberately never `git add` — src/new.js stays untracked; `git diff --name-status base`
  // alone is empty against this new commit, so only `git status --porcelain`'s `??` line can see it.

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 3,
    'an untracked file outside the File Plan must still exit 3 — a reviewer relying on `git diff` alone would miss it entirely: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.outOfPlan.includes('src/new.js'),
    'the untracked file must appear in outOfPlan even though it never appears in `git diff --name-status`: ' + JSON.stringify(out))
})

test('AC-20260805-01-8: a planned file renamed in the diff reports the pair in renamed, not as findings', () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js'])
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a'.repeat(200) + '\n')
  g('add', '-A'); g('commit', '-q', '-m', 'add planned file')
  const base = g('rev-parse', 'HEAD').trim()

  g('mv', 'src/a.js', 'src/b.js')
  g('add', '-A'); g('commit', '-q', '-m', 'rename planned file')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 0,
    'a rename of a planned file realizes that plan row — it must never fail the exit code: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.outOfPlan, [],
    'the renamed file\'s new path must not appear as an out-of-plan finding: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.unrealized, [],
    'the renamed file\'s old planned path must not appear as unrealized: ' + JSON.stringify(out))
  assert.ok((out.renamed || []).some(r2 => r2.from === 'src/a.js' && r2.to === 'src/b.js'),
    'the rename must be reported as one informational pair in renamed, per D3 — a routine planned-file ' +
    'rename must never produce a spurious out-of-plan + unrealized finding pair: ' + JSON.stringify(out))
})

// specs/20260805/01-review-scope-reconciliation.md review (2026-08-06): scope-reconcile.js:125-127
// exempts BOTH sides of every rename pair from outOfPlan (`!renamedFrom.has(p) && !renamedTo.has(p)`)
// without checking whether the rename's OLD path was ever in the File Plan. `git mv` of a file the
// File Plan never mentioned then exits 0 with `outOfPlan: []` — invisible to review. Contracts: "a
// rename's new path counts as in-plan when its old path was planned"; Behavior: "a rename whose old
// path was NOT planned is just an ordinary out-of-plan new path." This test pins that an unplanned
// rename must still surface, while remaining visible in `renamed` too.
test("AC-20260805-01-9: an unplanned file's rename must not become invisible to review", () => {
  const dir = tmpdir('scope-reconcile')
  const g = gitRepo(dir)
  const specRel = specWithPlan(dir, 'specs/20260805/01-x.md', ['src/a.js'])
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/a.js'), 'a'.repeat(200) + '\n')
  fs.writeFileSync(path.join(dir, 'src/unplanned.js'), 'u'.repeat(200) + '\n')
  g('add', '-A'); g('commit', '-q', '-m', 'add planned and unplanned files')
  const base = g('rev-parse', 'HEAD').trim()

  g('mv', 'src/unplanned.js', 'src/renamed-unplanned.js')
  g('add', '-A'); g('commit', '-q', '-m', 'rename the unplanned file')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  assert.strictEqual(r.status, 3,
    'src/unplanned.js was never in the File Plan — renaming it must still exit 3, not ride the ' +
    'rename exemption to a silent pass: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.outOfPlan.includes('src/renamed-unplanned.js'),
    'the renamed path must land in outOfPlan since its old path was never planned — a reviewer ' +
    'scanning outOfPlan alone must not miss this file: ' + JSON.stringify(out))
  assert.ok((out.renamed || []).some(r2 => r2.from === 'src/unplanned.js' && r2.to === 'src/renamed-unplanned.js'),
    'the pair must still appear in renamed for context even though it is also an out-of-plan finding — ' +
    'visibility as a rename and visibility as a scope violation are not mutually exclusive: ' + JSON.stringify(out))
})
