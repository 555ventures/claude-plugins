'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('./helpers')

// specs/20260915/01-one-derivation-of-ignored-paths.md D1: collision-closure.js's literals leg
// becomes the third consumer of spec/scripts/lib/ignored-paths.js — a git-ignored working copy
// (`.claude/worktrees/**`, a scratch build dir) holds a second copy of files this repo already
// owns, so a literals hit naming one is never a real collateral-damage site the planner can act
// on. The prune is path-ignored shaped (the shared derivation's contract), never directory-name
// shaped, and it is additive to the leg's existing .git/node_modules/pipeline-owned exclusions.

const SCRIPT = 'scripts/collision-closure.js'

// A spec whose File Plan carries one tests-layer row, so the paths leg's precondition is met and
// the literals leg is the only thing under test.
function specWithFilePlan(dir, relPath) {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full,
    '---\nstatus: hardened\n---\n\n## File Plan\n\n' +
    '| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
    '| `lib/util.js` | MODIFY | scripts | x |\n' +
    '| `tests/util.test.js` | MODIFY | tests | x |\n')
  // --spec resolves against the process cwd, not --root, so the fixture hands over an absolute path.
  return full
}

function hitsFor(r, stem) {
  assert.ok(r.status === 0 || r.status === 1,
    'collision-closure.js exited ' + r.status + ' — the literals leg never ran, so this fixture ' +
    'pins nothing: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  return out.literals.find((l) => l.stem === stem).hits
}

test('a literals hit inside a git-ignored directory is pruned while the identical tracked file is still reported', () => {
  const dir = tmpdir('collision-closure-ignored')
  const g = gitRepo(dir) // seeds and commits a root .gitignore containing .claude/worktrees/

  const specRel = specWithFilePlan(dir, 'specs/20260915/01-x.md')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  const prose = 'the retiring wording FROZEN_STEM appears here\n'
  fs.writeFileSync(path.join(dir, 'docs/guide.md'), prose)
  fs.mkdirSync(path.join(dir, '.claude/worktrees/wt/docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/worktrees/wt/docs/guide.md'), prose)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../lib/util')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base') // git add -A skips the ignored copy: it stays untracked and ignored on disk

  const r = runNode(SCRIPT, ['--root', dir, '--spec', specRel, '--literal', 'FROZEN_STEM', '--json'])
  assert.deepStrictEqual(hitsFor(r, 'FROZEN_STEM'), ['docs/guide.md'],
    'both docs/guide.md and the git-ignored .claude/worktrees/wt/docs/guide.md contain the stem, but ' +
    'the ignored copy is a duplicate of a file the repo already owns — any hit starting with ' +
    '".claude/worktrees/" means the planner is being told to add a File Plan row for a path that ' +
    'cannot be edited, or to waive a hit that names nothing real: ' + r.stdout)
})

test('a literals hit in a file matched by a single-file .gitignore line is pruned — the prune is path-ignored shaped, never directory-name shaped', () => {
  const dir = tmpdir('collision-closure-ignored')
  const g = gitRepo(dir)
  fs.appendFileSync(path.join(dir, '.gitignore'), 'docs/legacy.md\n')

  const specRel = specWithFilePlan(dir, 'specs/20260915/01-x.md')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  const prose = 'the retiring wording FROZEN_STEM appears here\n'
  fs.writeFileSync(path.join(dir, 'docs/guide.md'), prose)
  fs.writeFileSync(path.join(dir, 'docs/legacy.md'), prose)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../lib/util')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base') // docs/legacy.md matches the appended line and stays untracked and ignored

  const r = runNode(SCRIPT, ['--root', dir, '--spec', specRel, '--literal', 'FROZEN_STEM', '--json'])
  assert.deepStrictEqual(hitsFor(r, 'FROZEN_STEM'), ['docs/guide.md'],
    'docs/legacy.md is git-ignored by a plain single-file .gitignore LINE, not a trailing-slash ' +
    'directory pattern — if it still appears, the leg only recognizes the directory form and ' +
    'silently reports individually-ignored files as collateral-damage sites: ' + r.stdout)
})

test('a literals hit in a tracked file is reported even when its directory name matches an ignored one elsewhere — the prune stays additive to the existing exclusions', () => {
  const dir = tmpdir('collision-closure-ignored')
  const g = gitRepo(dir)

  const specRel = specWithFilePlan(dir, 'specs/20260915/01-x.md')
  const prose = 'the retiring wording FROZEN_STEM appears here\n'
  // A TRACKED directory literally named `worktrees` outside the ignored `.claude/` path: nothing
  // about its name makes it ignored, so its file is a real hit the planner must see.
  fs.mkdirSync(path.join(dir, 'docs/worktrees'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/worktrees/notes.md'), prose)
  fs.mkdirSync(path.join(dir, 'node_modules/somepkg'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'node_modules/somepkg/notes.md'), prose)
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/util.test.js'), "require('../lib/util')\n")
  g('add', '-A'); g('commit', '-q', '-m', 'base')

  const r = runNode(SCRIPT, ['--root', dir, '--spec', specRel, '--literal', 'FROZEN_STEM', '--json'])
  const hits = hitsFor(r, 'FROZEN_STEM')
  assert.ok(hits.includes('docs/worktrees/notes.md'),
    'docs/worktrees/notes.md is tracked and not git-ignored — dropping it means the prune is ' +
    'matching directory NAMES rather than the ignored path set, and real collateral damage goes ' +
    'unreported: ' + r.stdout)
  assert.ok(!hits.includes('node_modules/somepkg/notes.md'),
    'node_modules/ is excluded by the leg\'s own pre-existing name skip — if it appears, the ' +
    'git-ignore prune has replaced rather than stayed additive to that skip: ' + r.stdout)
})
