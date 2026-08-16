'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// specs/20260815/02-at-risk-pins.md (D1, escape wf_e1da0ea6-94c / INTAKE JJ-20260815-03): a
// Decision that changes what a shared script returns reddens suites the scoped gate never runs
// because those suites live outside the spec's own File Plan tests rows. scope-reconcile.js
// gains a path-stem-based `atRisk` derivation (additive --json field) so review can mechanically
// find and RUN those suites instead of relying on a reviewer to notice by hand. These tests pin
// AC-20260815-02-1 through AC-20260815-02-5 — every one of them fails on current code because
// scope-reconcile.js does not emit an `atRisk` field at all yet.

const SCRIPT = 'scripts/scope-reconcile.js'

// Builds a spec file with a `## File Plan` table carrying Action/Layer columns (parseFilePlanRows
// shape) so the at-risk exclusion (Layer == "tests" rows) can be exercised precisely.
function specWithFilePlan(dir, relPath, rows) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  let body = '---\nstatus: implementing\n---\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n'
  for (const r of rows) {
    body += `| \`${r.path}\` | ${r.action} | ${r.layer} | ${r.summary || 'x'} |\n`
  }
  fs.writeFileSync(full, body)
  return relPath
}

test('AC-20260815-02-1: a changed source file whose stem appears in a test file outside the File Plan tests rows is listed in atRisk with its refs', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'spec/scripts/verdict.js', action: 'MODIFY', layer: 'scripts' },
    { path: 'tests/capabilities/*.test.js', action: 'MODIFY', layer: 'tests' },
  ])
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'tests/review'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/review/verdict.test.js'),
    "require('../../spec/scripts/verdict')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  // The changed edit: verdict.js's behavior moves — the fixture for the founding escape.
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change verdict.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [{ file: 'tests/review/verdict.test.js', refs: ['spec/scripts/verdict.js'] }],
    'tests/review/verdict.test.js contains the stem "spec/scripts/verdict" of the changed file ' +
    'spec/scripts/verdict.js and is not resolved by any File Plan tests row (only ' +
    'tests/capabilities/*.test.js is planned) — if atRisk omits it, a suite pinning verdict.js\'s ' +
    'old return value can go red without review ever running it: ' + JSON.stringify(out))
})

test('AC-20260815-02-2: a referencing test file resolved by a File Plan tests row (glob) is excluded from atRisk', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'spec/scripts/verdict.js', action: 'MODIFY', layer: 'scripts' },
    { path: 'tests/review/*', action: 'MODIFY', layer: 'tests' },
  ])
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'tests/review'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/review/verdict.test.js'),
    "require('../../spec/scripts/verdict')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change verdict.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'tests/review/verdict.test.js is resolved by the File Plan tests row `tests/review/*` — the ' +
    'spec already claims this suite\'s coverage, so listing it as atRisk would be a false positive ' +
    'review would have to waive every run: ' + JSON.stringify(out))
})

test('AC-20260815-02-3: when no candidate test file contains any changed file\'s stem, atRisk is empty and existing fields/exit codes are unchanged', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'spec/scripts/lonely.js', action: 'CREATE', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'tests/review'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/review/unrelated.test.js'), "require('node:assert')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/lonely.js'), 'module.exports = {}\n')
  g('add', '-A'); g('commit', '-q', '-m', 'add lonely.js, in-plan')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'no candidate test file references any stem of the newly-created spec/scripts/lonely.js — a ' +
    'non-empty atRisk here means the derivation is producing false positives: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.outOfPlan, [],
    'spec/scripts/lonely.js is planned as a CREATE row — the atRisk addition must not disturb the ' +
    'existing outOfPlan derivation: ' + JSON.stringify(out))
  assert.strictEqual(r.status, 0,
    'the atRisk field is additive and must not change the existing exit-code alphabet — a nonzero ' +
    'exit here with an empty outOfPlan means atRisk broke exit-code byte-compatibility: ' + r.stderr)
})

test('AC-20260815-02-4: a changed file that is itself test-classified per testGlobs contributes no stems and is never listed in atRisk', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'tests/helpers.js', action: 'MODIFY', layer: 'tests' },
  ])
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/helpers.js'), 'module.exports = { v: 1 }\n')
  fs.writeFileSync(path.join(dir, 'tests/other.test.js'), "require('./helpers')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'tests/helpers.js'), 'module.exports = { v: 2 }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change helpers.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'tests/helpers.js matches the default testGlobs, so it must not seed stems even though ' +
    'tests/other.test.js references it by path — atRisk must stay empty, or every host\'s shared ' +
    'test helper edit would flag its entire suite as at-risk of itself: ' + JSON.stringify(out))
})

test('AC-20260815-02-5: a stem match that exists only under node_modules/ is never listed in atRisk (the walk never enters node_modules)', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'spec/scripts/verdict.js', action: 'MODIFY', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'node_modules/somepkg'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules/somepkg/verdict.test.js'),
    "require('../../spec/scripts/verdict')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change verdict.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'the only file referencing the changed spec/scripts/verdict.js stem lives under node_modules/, ' +
    'which the repo walk must always skip — a non-empty atRisk here means vendored/installed code ' +
    'is being scanned as a candidate: ' + JSON.stringify(out))
})
