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

// specs/20260904/02-worktree-include-shared-owner.md D3: `create` now replaces its inline
// .worktreeinclude copy block with one call to the shared owner (spec/scripts/worktree-include.sh)
// — the two tests below retag the pre-existing pins as AC-20260904-02-6/-8 (CONTINUE TO: the
// observable behavior of a host with or without a manifest is unchanged, D3), and a third pin
// (AC-20260904-02-7) asserts the stderr line now carries the owner's `worktree-include:` prefix
// instead of `merge-back:`, with no `merge-back: copied` line surviving anywhere.

test('AC-20260904-02-6: create CONTINUES TO honor .worktreeinclude: copies gitignored matches, skips unmatched ignored files', () => {
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
  assert.strictEqual(created.status, 0,
    'D3: create must still exit 0 once the copy step is delegated to the shared owner: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.strictEqual(fs.readFileSync(path.join(wt, '.env'), 'utf8'), 'KEY=1\n',
    'AC-6: .env must still land in the new worktree with its exact content')
  assert.strictEqual(fs.readFileSync(path.join(wt, 'config', 'local.json'), 'utf8'), '{}\n',
    'AC-6: a nested manifest match must still preserve its relative path')
  assert.ok(!fs.existsSync(path.join(wt, 'secret.txt')),
    'AC-6: unmatched gitignored file must still not be copied — extraction to the shared owner must not ' +
    'widen the selection rule')
  assert.match(created.stderr, /copied 2 \.worktreeinclude-matched file/,
    'D2/A7: the copy-line substring survives D3\'s extraction — this fixture asserts by substring, not by ' +
    'the (now-changed) prefix, exactly as A7 requires')
})

test('AC-20260904-02-7: create emits the copy-line from the shared owner — the line opens with worktree-include:, and no merge-back: copied line appears anywhere', () => {
  const dir = tmpdir('mbwipfx')
  const g = gitRepo(dir)
  fs.appendFileSync(path.join(dir, '.gitignore'), '.env\nconfig/local.json\nsecret.txt\n')
  fs.writeFileSync(path.join(dir, '.worktreeinclude'), '.env\nconfig/local.json\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest')
  fs.writeFileSync(path.join(dir, '.env'), 'KEY=1\n')
  fs.mkdirSync(path.join(dir, 'config'))
  fs.writeFileSync(path.join(dir, 'config', 'local.json'), '{}\n')
  fs.writeFileSync(path.join(dir, 'secret.txt'), 's\n')

  const created = runBash(SCRIPT, ['create', '--source', 'spec/wipfx', '--root', dir])
  assert.strictEqual(created.status, 0, created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.match(created.stderr, /^worktree-include: copied 2 \.worktreeinclude-matched file\(s\) into /m,
    'D2/D3: the copy line must now come from the shared owner with its own `worktree-include:` prefix — a ' +
    'surviving `merge-back:` prefix here means create never switched to calling the extracted script: ' +
    JSON.stringify(created.stderr))
  assert.ok(created.stderr.includes('worktree-include: copied 2 .worktreeinclude-matched file(s) into ' + wt),
    'AC-7: the printed dest in the owner\'s line must be the new worktree path create just created: ' +
    JSON.stringify(created.stderr))
  assert.ok(!created.stderr.includes('merge-back: copied'),
    'D3: no `merge-back: copied` line may appear anywhere — the inline copy block this Decision retires ' +
    'must leave no trace of its own prefix behind: ' + JSON.stringify(created.stderr))
})

test('AC-20260904-02-8: create CONTINUES TO copy nothing and stay quiet when the manifest matches nothing (or tracked files only)', () => {
  const dir = tmpdir('mbwi0')
  const g = gitRepo(dir)
  // a.txt is TRACKED; listing it in the manifest must not trigger a copy (checkout owns it)
  fs.writeFileSync(path.join(dir, '.worktreeinclude'), 'a.txt\n.env\n')
  g('add', '-A'); g('commit', '-q', '-m', 'manifest only')

  const created = runBash(SCRIPT, ['create', '--source', 'spec/wi0', '--root', dir])
  assert.strictEqual(created.status, 0,
    'D3: create must still exit 0 once the copy step is delegated to the shared owner: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')), 'AC-8: tracked file must still arrive via checkout')
  assert.ok(!created.stderr.includes('copied'),
    'AC-8: no copy message may appear when nothing qualifies — this must hold regardless of which script ' +
    'owns the copy step')
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

// `cleanup` must not rely on `git branch -d`'s ANCESTRY
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
