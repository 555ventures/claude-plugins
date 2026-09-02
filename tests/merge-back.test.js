'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runBash, gitRepo } = require('./helpers')

const SCRIPT = 'scripts/merge-back.sh'

// specs/20260814/02-doctor-mergeback-fidelity-mechanics.md D2: the `spec/<stem>`
// build-branch derivation had three prose copies (enter-worktree.md step 1, doctor.md check 11,
// git/commands/commit.md's reverse parse) all restating the same rule by hand. `branch-for` gives
// the rule one owner: a print-only subcommand needing no git repo, special-cased before the
// generic flag loop (a bare positional there currently dies with "unknown arg", exit 2 — the
// refuter-executed defect D2 fixes). enter-worktree.md and doctor.md check 11 must call it
// instead of restating `spec/<stem>` freehand.

test('AC-20260814-02-4: branch-for prints spec/<stem> for a spec path, and exits 2 naming the usage when no path is given', () => {
  const r = runBash(SCRIPT, ['branch-for', 'specs/20260810/07-per-sha-ci-legs.md'])
  assert.strictEqual(r.status, 0,
    'branch-for must exit 0 on a valid spec path — it is pure string derivation with no git ' +
    'ops and no repo precondition (D2): ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'spec/07-per-sha-ci-legs',
    'branch-for must print exactly "spec/<stem>" (filename sans directory and extension) — a ' +
    'wrong derivation here breaks both call sites that will depend on it (doctor check 11, ' +
    'enter-worktree step 1): got ' + JSON.stringify(r.stdout))

  const r2 = runBash(SCRIPT, ['branch-for'])
  assert.strictEqual(r2.status, 2,
    'branch-for with no spec path must exit 2 (usage/precondition failure per the script\'s own ' +
    'exit-code alphabet), never hang or crash uninformatively: ' + r2.stderr)
  assert.match(r2.stderr, /branch-for/,
    'the usage error must name the subcommand so the remedy is discoverable: ' + r2.stderr)
})

test('AC-20260814-02-5: enter-worktree.md and doctor.md check 11 derive the build branch by invoking branch-for, not by restating the spec/<stem> rule freehand', () => {
  const enterWorktree = read('git/commands/enter-worktree.md')
  const doctorMd = read('spec/commands/doctor.md')

  assert.match(enterWorktree, /branch-for/,
    'enter-worktree.md step 1 must derive {source} via `{mergeBack} branch-for {spec path}` ' +
    '(D2) — a free-standing restatement of "spec/<slug>" duplicates the rule this script now owns')

  const check11 = doctorMd.match(/11\.\s+\*\*[^*]*\*\*[\s\S]*?(?=\n12\.\s+\*\*)/)
  assert.ok(check11, 'doctor.md must still have a numbered check 11 — without it the stale-branch sub-check is gone')
  assert.match(check11[0], /branch-for/,
    'doctor.md check 11 must derive the build branch via `branch-for` (D2) — a free-standing ' +
    '"derived as spec/<stem>" restatement duplicates the rule the script now owns: ' + check11[0])
})

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

// specs/20260823/02-room-mechanics.md: `cleanup` must not rely on `git branch -d`'s ANCESTRY
// containment check alone — a squash merge deliberately creates none (it copies the tree into
// one new commit and links nothing), so an ancestry-only check fails on 100% of squash merges,
// the exact strategy `inspect` RECOMMENDs for a many-commit spec. A cleanup failure there lands
// before spec-review-driver can record the merge as concluded, so a caller following the
// protocol's own "re-run the driver" instruction re-runs the legs and demands a fresh reviewer
// for an already-closed review — appending a duplicate row to the ledger the replay schedule
// and the catch-rate denominator are both read from. `cleanup` falls back to containment by
// CONTENT (target tree === source tree), which is what a squash actually guarantees and is
// strictly stronger than the merge-base walk `-d` performs.

test('cleanup deletes a squash-merged branch, whose content is on the target but whose ancestry is not', () => {
  const dir = tmpdir('mbsqc')
  const g = gitRepo(dir)
  g('checkout', '-q', '-b', 'spec/sq')
  fs.writeFileSync(path.join(dir, 'one.txt'), '1\n')
  g('add', '-A'); g('commit', '-q', '-m', 'first')
  fs.writeFileSync(path.join(dir, 'two.txt'), '2\n')
  g('add', '-A'); g('commit', '-q', '-m', 'second')
  g('checkout', '-q', 'main')

  const merge = runBash(SCRIPT, ['merge', '--root', dir, '--target', 'main', '--source', 'spec/sq',
    '--strategy', 'squash'])
  assert.strictEqual(merge.status, 0, merge.stderr)
  assert.ok(fs.existsSync(path.join(dir, 'two.txt')), 'the squash landed the branch content on main')

  // The precondition that made this fail: git itself still considers the branch unmerged.
  const unmerged = require('child_process').execFileSync('git',
    ['-C', dir, 'branch', '--no-merged', 'main'], { encoding: 'utf8' })
  assert.match(unmerged, /spec\/sq/,
    'precondition — after a squash git reports the source as NOT merged, which is exactly what ' +
    '`branch -d` refuses on; if this stops holding the regression this test pins is gone')

  const cleanup = runBash(SCRIPT, ['cleanup', '--root', dir, '--source', 'spec/sq'], { cwd: dir })
  assert.strictEqual(cleanup.status, 0,
    'cleanup must succeed after a squash merge — the recommended strategy for a many-commit ' +
    'spec must not leave the caller to finish the merge by hand: ' + cleanup.stderr)
  assert.match(cleanup.stdout, /squash-merged/,
    'the success line must say WHY the safe delete was bypassed, so a reader of the log can tell ' +
    'a sanctioned squash cleanup from a blind force-delete: ' + cleanup.stdout)
  const branches = require('child_process').execFileSync('git',
    ['-C', dir, 'branch', '--list', 'spec/sq'], { encoding: 'utf8' })
  assert.strictEqual(branches.trim(), '', 'the branch is actually gone')
})

test('cleanup still refuses a branch carrying content the target does not have', () => {
  const dir = tmpdir('mbunm')
  const g = gitRepo(dir)
  g('checkout', '-q', '-b', 'spec/unmerged')
  fs.writeFileSync(path.join(dir, 'only-here.txt'), 'x\n')
  g('add', '-A'); g('commit', '-q', '-m', 'never merged')
  g('checkout', '-q', 'main')

  const cleanup = runBash(SCRIPT, ['cleanup', '--root', dir, '--source', 'spec/unmerged'], { cwd: dir })
  assert.strictEqual(cleanup.status, 2,
    'the content-containment fallback must NOT become a blanket force-delete — a branch with ' +
    'unmerged work still has to refuse, or the fix trades a papercut for data loss: ' + cleanup.stdout)
  assert.match(cleanup.stderr, /NOT identical/,
    'the refusal must name the real reason (content differs), not the ancestry wording that ' +
    'sent the caller down the wrong path: ' + cleanup.stderr)
  const branches = require('child_process').execFileSync('git',
    ['-C', dir, 'branch', '--list', 'spec/unmerged'], { encoding: 'utf8' })
  assert.match(branches, /spec\/unmerged/, 'the unmerged branch survives')
})
