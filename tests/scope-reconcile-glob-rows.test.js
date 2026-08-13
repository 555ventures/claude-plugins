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

test('AC-20260813-03-4 / PRAX-20260813-05: a File Plan glob row does not double-report — the concrete changed file it covers must not land in outOfPlan, and the run exits 0', () => {
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

test('AC-20260813-03-5 / PRAX-20260813-05: a File Plan glob row realized by a concrete changed file must not also land in unrealized', () => {
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
