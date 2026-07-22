'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runBash, gitRepo } = require('./helpers')

const SCRIPT = 'scripts/merge-back.sh'

test('flag with missing value dies instead of hanging', () => {
  const res = runBash(SCRIPT, ['cleanup', '--source'], { timeout: 5000 })
  assert.strictEqual(res.error, undefined, 'script timed out — the arg loop is spinning')
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /--source/)
})

test('root: prints the main worktree path even when it contains spaces', () => {
  const dir = path.join(tmpdir('mb root'), 'repo with spaces')
  fs.mkdirSync(dir, { recursive: true })
  gitRepo(dir)
  const res = runBash(SCRIPT, ['root', '--worktree', dir])
  assert.strictEqual(res.status, 0, res.stderr)
  assert.strictEqual(res.stdout.trim().split('\n').pop(), fs.realpathSync(dir))
})

test('create + inspect + merge(ff-only) + cleanup + verify round-trip', () => {
  const dir = tmpdir('mbrt')
  gitRepo(dir)
  const created = runBash(SCRIPT, ['create', '--source', 'spec/x', '--root', dir])
  assert.strictEqual(created.status, 0, created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.ok(fs.existsSync(wt), 'worktree path printed and exists')

  fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n')
  const gw = (...a) => require('child_process').execFileSync('git', ['-C', wt, ...a])
  gw('add', '-A'); gw('commit', '-q', '-m', 'work')

  const inspect = runBash(SCRIPT, ['inspect', '--root', dir, '--target', 'main', '--source', 'spec/x'])
  assert.strictEqual(inspect.status, 0, inspect.stderr)
  assert.match(inspect.stdout, /RECOMMEND: ff-only/)

  const merge = runBash(SCRIPT, ['merge', '--root', dir, '--target', 'main', '--source', 'spec/x', '--strategy', 'ff-only'])
  assert.strictEqual(merge.status, 0, merge.stderr)
  assert.ok(fs.existsSync(path.join(dir, 'b.txt')))

  const cleanup = runBash(SCRIPT, ['cleanup', '--root', dir, '--source', 'spec/x', '--worktree', wt], { cwd: dir })
  assert.strictEqual(cleanup.status, 0, cleanup.stderr)
  assert.ok(!fs.existsSync(wt))

  const verify = runBash(SCRIPT, ['verify', '--root', dir])
  assert.strictEqual(verify.status, 0, verify.stderr)
})

test('cleanup refuses (exit 4) while CWD is inside the worktree', () => {
  const dir = tmpdir('mbcwd')
  gitRepo(dir)
  const created = runBash(SCRIPT, ['create', '--source', 'spec/y', '--root', dir])
  assert.strictEqual(created.status, 0, created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  const res = runBash(SCRIPT, ['cleanup', '--root', dir, '--source', 'spec/y', '--worktree', wt], { cwd: wt })
  assert.strictEqual(res.status, 4)
  assert.match(res.stderr, /REFUSING/)
})

test('squash of an already-merged source reports nothing-to-squash, not a generic failure', () => {
  const dir = tmpdir('mbsq')
  const g = gitRepo(dir)
  g('checkout', '-q', '-b', 'spec/z')
  g('checkout', '-q', 'main')
  const res = runBash(SCRIPT, ['merge', '--root', dir, '--target', 'main', '--source', 'spec/z', '--strategy', 'squash'])
  assert.strictEqual(res.status, 0, res.stderr + res.stdout)
  assert.match(res.stdout, /nothing to squash/i)
})

test('create honors .worktreeinclude: copies gitignored matches, skips unmatched ignored files', () => {
  const dir = tmpdir('mbwi')
  const g = gitRepo(dir)
  fs.appendFileSync(path.join(dir, '.gitignore'), '.env\nconfig/local.json\nsecret.txt\n')
  fs.writeFileSync(path.join(dir, '.worktreeinclude'), '.env\nconfig/local.json\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest')
  fs.writeFileSync(path.join(dir, '.env'), 'KEY=1\n')                    // ignored + matched -> copied
  fs.mkdirSync(path.join(dir, 'config'))
  fs.writeFileSync(path.join(dir, 'config', 'local.json'), '{}\n')      // nested ignored + matched -> copied
  fs.writeFileSync(path.join(dir, 'secret.txt'), 's\n')                 // ignored, NOT in manifest -> stays behind

  const created = runBash(SCRIPT, ['create', '--source', 'spec/wi', '--root', dir])
  assert.strictEqual(created.status, 0, created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.strictEqual(fs.readFileSync(path.join(wt, '.env'), 'utf8'), 'KEY=1\n')
  assert.strictEqual(fs.readFileSync(path.join(wt, 'config', 'local.json'), 'utf8'), '{}\n')
  assert.ok(!fs.existsSync(path.join(wt, 'secret.txt')), 'unmatched gitignored file must not be copied')
  assert.match(created.stderr, /copied 2 \.worktreeinclude-matched file/)
})

test('create with a manifest matching nothing (or tracked files only) copies nothing and stays quiet', () => {
  const dir = tmpdir('mbwi0')
  const g = gitRepo(dir)
  // a.txt is TRACKED; listing it in the manifest must not trigger a copy (checkout owns it)
  fs.writeFileSync(path.join(dir, '.worktreeinclude'), 'a.txt\n.env\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest only')

  const created = runBash(SCRIPT, ['create', '--source', 'spec/wi0', '--root', dir])
  assert.strictEqual(created.status, 0, created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')), 'tracked file arrives via checkout')
  assert.ok(!created.stderr.includes('copied'), 'no copy message when nothing qualifies')
})

test('create refuses on an un-gitignored worktree dir and an unborn HEAD', () => {
  const dirty = tmpdir('mbng')
  const g = gitRepo(dirty)
  fs.writeFileSync(path.join(dirty, '.gitignore'), '')
  g('add', '-A'); g('commit', '-q', '-m', 'drop ignore')
  const r1 = runBash(SCRIPT, ['create', '--source', 'spec/a', '--root', dirty])
  assert.strictEqual(r1.status, 2)
  assert.match(r1.stderr, /gitignored/)

  const unborn = tmpdir('mbub')
  gitRepo(unborn, { empty: true })
  const r2 = runBash(SCRIPT, ['create', '--source', 'spec/a', '--root', unborn])
  assert.strictEqual(r2.status, 2)
  assert.match(r2.stderr, /no commits yet/)
})
