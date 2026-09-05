// init-gen.js ignore-check — the doctor's drift sweep over the pipeline's own .gitignore entries.
//
// Class: a host initialised before D6 of specs/20260901/02 added the `.claude/spec-session.json`
// ignore line keeps stamping its per-session scratch file un-ignored, so scope-reconcile reports
// it out-of-plan on every in-place review (doctor.md check 12 names the remedy). The wrong fix was proposed (exclude it from reconcile — that would let the
// next close commit sweep the stamp into history); the right one is what this pins: init's
// IGNORE_ENTRIES are auditable after the fact, exit 3 names each missing line, --fix appends.
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('../helpers')

const INIT_GEN = path.join(SPEC, 'scripts', 'init-gen.js')
const run = (dir, ...extra) => spawnSync('node', [INIT_GEN, 'ignore-check', '--root', dir, ...extra], { encoding: 'utf8' })

test('ignore-check exits 3 and names the missing spec-session.json line on a pre-D6 host, --fix appends exactly it, and the re-run is green', () => {
  const dir = tmpdir('ignore-check')
  const g = gitRepo(dir) // seeds .gitignore with only .claude/worktrees/
  fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nspecs/**/*.review/\nspecs/**/*.build/\n')
  g('add', '-A'); g('commit', '-q', '-m', 'pre-D6 host')

  const red = run(dir)
  assert.strictEqual(red.status, 3, 'a host missing an init ignore entry must exit 3: ' + red.stdout + red.stderr)
  assert.deepStrictEqual(red.stdout.trim().split('\n'), ['.claude/spec-session.json'],
    'stdout is exactly the missing lines, one per line — the doctor prints these as evidence')

  // The stamp file itself would otherwise reach git status — the reconcile symptom.
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec-session.json'), '{}\n')
  assert.match(g('status', '--porcelain', '--untracked-files=all'), /spec-session\.json/, 'pre-fix: the stamp is visible to git status (the reconcile leg reads this)')

  const fixed = run(dir, '--fix')
  assert.strictEqual(fixed.status, 0, '--fix must exit 0: ' + fixed.stdout + fixed.stderr)
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  assert.strictEqual(gitignore.split('\n').filter(l => l.trim() === '.claude/spec-session.json').length, 1, 'exactly one appended line: ' + gitignore)
  assert.ok(gitignore.startsWith('.claude/worktrees/\nspecs/**/*.review/\nspecs/**/*.build/\n'), 'existing lines untouched')
  assert.doesNotMatch(g('status', '--porcelain', '--untracked-files=all'), /spec-session\.json/, 'post-fix: the stamp no longer reaches git status')

  const green = run(dir)
  assert.strictEqual(green.status, 0, 'all entries present must exit 0: ' + green.stdout)
  assert.match(green.stdout, /all \d+ pipeline ignore entries present/)
})

test('ignore-check without --fix is read-only', () => {
  const dir = tmpdir('ignore-check-ro')
  gitRepo(dir)
  const before = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  const r = run(dir)
  assert.strictEqual(r.status, 3)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), before, 'no --fix, no write')
})
