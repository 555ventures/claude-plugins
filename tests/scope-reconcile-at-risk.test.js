'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// specs/20260815/02-at-risk-pins.md (D1, escape wf_e1da0ea6-94c): a
// Decision that changes what a shared script returns reddens suites the scoped gate never runs
// because those suites live outside the spec's own File Plan tests rows. scope-reconcile.js
// gains a path-stem-based `atRisk` derivation (additive --json field) so review can mechanically
// find and RUN those suites instead of relying on a reviewer to notice by hand. These tests pin
// AC-20260815-02-1 through AC-20260815-02-5 — every one of them fails on current code because
// scope-reconcile.js does not emit an `atRisk` field at all yet.
//
// specs/20260822/02-init-generation-script.md D9/D10 (AC-20260822-02-12): D9 adds an additive
// `--probe-at-risk` mode to this same script, reusing this file's existing `--json` derivation
// in place — never a second implementation. D10 requires the existing `--json`/`--dirs` modes to
// emit byte-identical output on these exact fixtures after that addition lands, so every test
// below is retagged (name only, no assertion changed or weakened) as the regression pin D10 and
// AC-20260822-02-12 call for.
//
// specs/20260903/07-test-file-budget-guard.md D8 (AC-20260903-07-7): walkTestFiles skips
// directories named `fixtures`/`__fixtures__` exactly as it already skips node_modules/.git, so
// prose/data fixtures under a test tree are never handed to the host testCommand as tests.
//
// specs/20260907/03-ignored-paths-and-unobserved-count.md D1/D2 (AC-20260907-03-1,
// AC-20260907-03-2, AC-20260907-03-9): walkTestFiles additionally prunes every git-ignored path
// (derived once via `git ls-files -o -i --exclude-standard --directory -z`), on top of — never
// instead of — the four existing name skips. AC-1 and AC-2 fail on current code, which has no
// git-ignore-based pruning at all; AC-9 (the four name skips surviving unchanged) is a
// CONTINUE-TO pin already green pre-image.

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

test('AC-20260815-02-1 [AC-20260822-02-12 regression pin]: a changed source file whose stem appears in a test file outside the File Plan tests rows is listed in atRisk with its refs', () => {
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

test('AC-20260815-02-2 [AC-20260822-02-12 regression pin]: a referencing test file resolved by a File Plan tests row (glob) is excluded from atRisk', () => {
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

test('AC-20260815-02-3 [AC-20260822-02-12 regression pin]: when no candidate test file contains any changed file\'s stem, atRisk is empty and existing fields/exit codes are unchanged', () => {
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

test('AC-20260815-02-4 [AC-20260822-02-12 regression pin]: a changed file that is itself test-classified per testGlobs contributes no stems and is never listed in atRisk', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'tests/helpers.js', action: 'MODIFY', layer: 'tests' },
  ])
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/helpers.js'), 'module.exports = { v: 1 }\n')
  // The literal "tests/helpers" (a stem the changed file WOULD seed if the isTestClassified
  // guard were removed) is embedded deliberately — a relative `./helpers` require alone
  // matches neither of tests/helpers.js's stems ("tests/helpers.js", "tests/helpers") and
  // makes this fixture pass with the guard stripped out, which is the vacuous-pin defect this
  // fixture was rewritten to close (mutation-proved, specs/20260815/02-at-risk-pins.md
  // review).
  fs.writeFileSync(path.join(dir, 'tests/other.test.js'),
    "// depends on tests/helpers for shared assertions\nrequire('./helpers')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'tests/helpers.js'), 'module.exports = { v: 2 }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change helpers.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'tests/helpers.js matches the default testGlobs, so it must not seed stems even though ' +
    'tests/other.test.js contains the literal stem "tests/helpers" — atRisk must stay empty, or ' +
    'every host\'s shared test helper edit would flag its entire suite as at-risk of itself: ' +
    JSON.stringify(out))
})

// specs/20260815/02-at-risk-pins.md review: two degenerate-stem defects in stemsFor(),
// both reproduced against today's code. (a) EMPTY STEM: '.gitignore'.replace(/\.[^./]+$/, '')
// returns '' because the whole basename is consumed as "the extension" — the empty string
// survives stemsFor's dedupe and `content.includes('')` is true for every candidate file, so a
// diff touching ANY root-level dotfile lists the entire test universe as at-risk. (b) BARE
// SINGLE-SEGMENT STEM: D1 states the intent "form (c) only when the path has >=2 segments, so a
// bare basename like `index` never becomes a stem" — but that guard is written on form (c) only;
// form (b) (path minus last extension) has no such guard, so a root-level `index.js` yields the
// bare stem "index" and a root-level `package.json` yields "package", reproducing the exact
// degeneracy the D1 guard was meant to prevent, just via a different form. Both must FAIL against
// current stemsFor() and PASS once it stops emitting empty stems and bare single-segment stems.

test('AC-20260815-02-15 [AC-20260822-02-12 regression pin]: a changed root-level dotfile whose noExt form is empty does not flag every candidate test file as at-risk', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir) // gitRepo's init commit already seeds and commits a root .gitignore

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: '.gitignore', action: 'MODIFY', layer: 'other' },
  ])
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/unrelated-a.test.js'),
    "const assert = require('node:assert')\nassert.ok(true, 'placeholder')\n")
  fs.writeFileSync(path.join(dir, 'tests/unrelated-b.test.js'),
    "const assert = require('node:assert')\nassert.ok(true, 'placeholder')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.appendFileSync(path.join(dir, '.gitignore'), 'dist/\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change .gitignore')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    '".gitignore".replace(/\\.[^./]+$/, "") strips to the empty string, and content.includes("") ' +
    'is true for every file — a non-empty atRisk here (listing tests/unrelated-a.test.js and/or ' +
    'tests/unrelated-b.test.js, which reference nothing about .gitignore) means the empty-stem ' +
    'bug is flagging the entire test universe as at-risk on any root dotfile edit: ' +
    JSON.stringify(out))
})

test('AC-20260815-02-15 [AC-20260822-02-12 regression pin]: a changed root-level file whose bare noExt basename is a common word does not flag unrelated test files as at-risk', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260815/02-x.md', [
    { path: 'index.js', action: 'MODIFY', layer: 'scripts' },
    { path: 'package.json', action: 'MODIFY', layer: 'other' },
  ])
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = { v: 1 }\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "host", "version": "1.0.0" }\n')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  // Neither file references index.js or package.json — "index" and "package" appear only as an
  // ordinary loop-variable name and an ordinary English word, the two shapes form (b)'s bare
  // single-segment stem turns into false positives.
  fs.writeFileSync(path.join(dir, 'tests/loop-var.test.js'),
    'for (let index = 0; index < 3; index++) { /* noop */ }\n')
  fs.writeFileSync(path.join(dir, 'tests/word-package.test.js'),
    '// this test lives in a package directory of its own\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = { v: 2 }\n')
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "name": "host", "version": "1.0.1" }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change index.js and package.json')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [],
    'stemsFor("index.js") and stemsFor("package.json") emit the bare single-segment stems ' +
    '"index" and "package" via form (b), which have no >=2-segment guard the way form (c) does ' +
    '— a non-empty atRisk here means an ordinary loop-variable name or English word is being ' +
    'misread as a reference to a changed root-level file, exactly the degeneracy D1\'s form-(c) ' +
    'guard was meant to prevent: ' + JSON.stringify(out))
})

test('AC-20260815-02-5 [AC-20260822-02-12 regression pin]: a stem match that exists only under node_modules/ is never listed in atRisk (the walk never enters node_modules)', () => {
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

test('AC-20260903-07-7: a stem match under a fixtures/ or __fixtures__/ directory is never listed in atRisk, while a real test file with the same stem still is', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260903/07-x.md', [
    { path: 'lib/util.js', action: 'MODIFY', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib/util.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'tests/fixtures/sample'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/fixtures/sample/notes.md'),
    'this fixture mentions lib/util.js in a sentence\n')
  fs.mkdirSync(path.join(dir, 'tests/__fixtures__'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/__fixtures__/data.md'),
    'this fixture also mentions lib/util.js in a sentence\n')
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'),
    "require('../lib/util') // lib/util.js\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'lib/util.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change lib/util.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  const atRiskFiles = out.atRisk.map((entry) => entry.file)
  assert.ok(atRiskFiles.includes('tests/util.test.js'),
    'tests/util.test.js is a real test file containing the changed file\'s stem "lib/util.js" and ' +
    'is not resolved by any File Plan tests row — if atRisk omits it, a suite pinning lib/util.js\'s ' +
    'old return value can go red without review ever running it: ' + JSON.stringify(out))
  assert.ok(!atRiskFiles.includes('tests/fixtures/sample/notes.md'),
    'tests/fixtures/sample/notes.md lives under a fixtures/ directory and is prose, not a test — if ' +
    'it appears in atRisk, review is being told to RUN a non-test file as a suite: ' + JSON.stringify(out))
  assert.ok(!atRiskFiles.includes('tests/__fixtures__/data.md'),
    'tests/__fixtures__/data.md lives under a __fixtures__/ directory and is prose, not a test — if ' +
    'it appears in atRisk, review is being told to RUN a non-test file as a suite: ' + JSON.stringify(out))
})

test('AC-20260907-03-1: a test file under a git-ignored directory (.claude/worktrees/) is pruned from atRisk while an identical tracked test file elsewhere is still listed', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir) // gitRepo's init commit already seeds and commits a root .gitignore containing .claude/worktrees/

  const specRel = specWithFilePlan(dir, 'specs/20260907/03-x.md', [
    { path: 'spec/scripts/verdict.js', action: 'MODIFY', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const refBody = "require('../../spec/scripts/verdict') // spec/scripts/verdict.js\n"
  fs.writeFileSync(path.join(dir, 'tests/thing.test.js'), refBody)
  fs.mkdirSync(path.join(dir, '.claude/worktrees/wt/tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/worktrees/wt/tests/thing.test.js'), refBody)
  g('add', '-A'); g('commit', '-q', '-m', 'base') // git add -A silently skips the ignored copy — it stays untracked and ignored on disk
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change verdict.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [{ file: 'tests/thing.test.js', refs: ['spec/scripts/verdict.js'] }],
    'both tests/thing.test.js and the git-ignored .claude/worktrees/wt/tests/thing.test.js contain the ' +
    'changed stem "spec/scripts/verdict.js", but the ignored copy must never enter atRisk — a second ' +
    'entry, or any entry whose file starts with ".claude/worktrees/", means the pipeline\'s own ignored ' +
    'worktree checkouts are still being handed to the host testCommand as if they were real test files, ' +
    'the exact prax escape this AC exists to close: ' + JSON.stringify(out))
})

test('AC-20260907-03-2: a test file matched by a single-file .gitignore line (not a directory pattern) is pruned from atRisk — the prune is path-ignored shaped, never directory-name shaped', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)
  fs.appendFileSync(path.join(dir, '.gitignore'), 'tests/legacy.test.js\n')

  const specRel = specWithFilePlan(dir, 'specs/20260907/03-x.md', [
    { path: 'spec/scripts/verdict.js', action: 'MODIFY', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'spec/scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v1\nmodule.exports = {}\n')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  const refBody = "require('../../spec/scripts/verdict') // spec/scripts/verdict.js\n"
  fs.writeFileSync(path.join(dir, 'tests/thing.test.js'), refBody)
  fs.writeFileSync(path.join(dir, 'tests/legacy.test.js'), refBody)
  g('add', '-A'); g('commit', '-q', '-m', 'base') // tests/legacy.test.js matches the appended .gitignore line and stays untracked and ignored
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'spec/scripts/verdict.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change verdict.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.atRisk, [{ file: 'tests/thing.test.js', refs: ['spec/scripts/verdict.js'] }],
    'tests/legacy.test.js is git-ignored by a single plain-file .gitignore LINE, not a directory-shaped ' +
    'pattern — if it still appears in atRisk, the prune only recognizes the trailing-slash directory ' +
    'form `git ls-files -o -i --directory` emits and silently misses plain ignored files: ' +
    JSON.stringify(out))
})

test('AC-20260907-03-9: tracked (not git-ignored) directories named fixtures, __fixtures__ or node_modules are still excluded from atRisk — the pre-existing name skips survive the new git-ignore prune unchanged', () => {
  const dir = tmpdir('scope-reconcile-at-risk')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260907/03-x.md', [
    { path: 'lib/util.js', action: 'MODIFY', layer: 'scripts' },
  ])
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib/util.js'), '// v1\nmodule.exports = {}\n')
  const refBody = 'this fixture mentions lib/util.js in a sentence\n'
  fs.mkdirSync(path.join(dir, 'tests/fixtures'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/fixtures/sample.test.js'), refBody)
  fs.mkdirSync(path.join(dir, 'tests/__fixtures__'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/__fixtures__/sample.test.js'), refBody)
  fs.mkdirSync(path.join(dir, 'node_modules/somepkg'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules/somepkg/sample.test.js'), refBody)
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../lib/util') // lib/util.js\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base') // every fixture file here is TRACKED — none is git-ignored, isolating this AC from AC-1/AC-2's mechanism
  const base = g('rev-parse', 'HEAD').trim()

  fs.writeFileSync(path.join(dir, 'lib/util.js'), '// v2\nmodule.exports = { changed: true }\n')
  g('add', '-A'); g('commit', '-q', '-m', 'change lib/util.js')

  const r = runNode(SCRIPT, ['--root', dir, '--base', base, '--spec', specRel, '--json'])
  const out = JSON.parse(r.stdout)
  const atRiskFiles = out.atRisk.map((entry) => entry.file)
  assert.ok(atRiskFiles.includes('tests/util.test.js'),
    'tests/util.test.js is a real, non-fixture test file referencing the changed stem lib/util.js and is ' +
    'not resolved by any File Plan tests row — it must still be listed: ' + JSON.stringify(out))
  assert.ok(!atRiskFiles.includes('tests/fixtures/sample.test.js') &&
    !atRiskFiles.includes('tests/__fixtures__/sample.test.js') &&
    !atRiskFiles.includes('node_modules/somepkg/sample.test.js'),
    'tests/fixtures/, tests/__fixtures__/ and node_modules/ are all TRACKED here (none is git-ignored) — ' +
    'if any of their files appear in atRisk, the new git-ignore-based prune has replaced rather than ' +
    'stayed additive to the four pre-existing name skips: ' + JSON.stringify(out))
  // A fourth name skip, `.git`, has no tracked-fixture equivalent to test here: git structurally
  // refuses to track any path under a directory literally named `.git` anywhere in the tree
  // (`git add -A` silently drops it, confirmed empirically) — so no tracked-but-not-ignored `.git`
  // fixture can exist to exercise this AC's fourth name against.
})
