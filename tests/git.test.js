'use strict'
// Pins lib/git.js: worktrees, commits, merge-back strategies, working-tree diffs.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const G = require(path.join(SPEC, 'scripts/lib/git.js'))

function laneRepo() {
  const root = tmpdir('git')
  const g = gitRepo(root)
  const base = G.headSha(root)
  const wt = G.worktreeAdd(root, '.claude/worktrees/spec-01-x', 'spec/01-x', 'main')
  return { root, g, base, wt }
}

test('worktreeAdd creates the branch once and is idempotent; remove cleans branch and dir', () => {
  const { root, wt } = laneRepo()
  assert.strictEqual(G.currentBranch(wt), 'spec/01-x', 'the lane must sit on its own branch')
  assert.strictEqual(G.worktreeAdd(root, '.claude/worktrees/spec-01-x', 'spec/01-x', 'main'), wt, 'a re-run of OPEN must not fail')
  G.worktreeRemove(root, wt, { deleteBranch: 'spec/01-x' })
  assert.ok(!fs.existsSync(wt), 'DONE must remove the worktree')
  assert.ok(!G.branchExists(root, 'spec/01-x'), 'deleteBranch must remove the lane branch')
  assert.strictEqual(G.trunk({}), 'main', 'trunk defaults to main')
  assert.strictEqual(G.trunk({ trunk: 'dev' }), 'dev', 'trunk honours config')
})

test('diff and changedFiles see uncommitted and untracked work against base', () => {
  const { base, wt } = laneRepo()
  fs.writeFileSync(path.join(wt, 'a.txt'), 'changed\n')
  fs.writeFileSync(path.join(wt, 'new.js'), 'x\n')
  assert.deepStrictEqual(G.changedFiles(base, wt).sort(), ['a.txt', 'new.js'], 'the reviewer must see untracked builder files')
  assert.match(G.diff(base, wt), /\+changed/, 'the diff must carry the edit')
  assert.strictEqual(G.sh(['diff', '--cached', '--name-only'], wt), '', 'diffing must not stage anything in the real index')
})

test('commitAll commits everything and returns null when clean', () => {
  const { wt } = laneRepo()
  assert.strictEqual(G.commitAll(wt, 'nothing'), null, 'an empty commit is noise')
  fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n')
  const sha = G.commitAll(wt, 'feat: b')
  assert.strictEqual(sha, G.headSha(wt), 'COMMIT records the new sha')
  assert.strictEqual(G.sh(['log', '-1', '--format=%s'], wt), 'feat: b', 'the message is the spec title')
})

for (const strategy of ['merge-commit', 'ff-only', 'squash']) {
  test(`mergeBack ${strategy} lands the lane on trunk`, () => {
    const { root, wt } = laneRepo()
    fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n')
    G.commitAll(wt, 'feat: b')
    const r = G.mergeBack(root, 'spec/01-x', strategy)
    assert.ok(r.merged, `${strategy} must merge a clean lane`)
    assert.ok(fs.existsSync(path.join(root, 'b.txt')), 'the lane file must reach trunk')
    const parents = G.sh(['rev-list', '--parents', '-n', '1', 'HEAD'], root).split(' ').length - 1
    assert.strictEqual(parents, strategy === 'merge-commit' ? 2 : 1, `${strategy} must produce its own history shape`)
  })
}

test('mergeBack reports conflicts, refuses ff on divergence, and refuses a dirty root', () => {
  const { root, g, wt } = laneRepo()
  fs.writeFileSync(path.join(wt, 'a.txt'), 'lane\n')
  G.commitAll(wt, 'lane edit')
  fs.writeFileSync(path.join(root, 'a.txt'), 'trunk\n')
  G.commitAll(root, 'trunk edit')
  const ff = G.mergeBack(root, 'spec/01-x', 'ff-only')
  assert.ok(!ff.merged && /diverged[\s\S]*fast-forward/i.test(ff.reason), 'ff-only must explain a divergence with git\'s own words')
  const r = G.mergeBack(root, 'spec/01-x', 'merge-commit')
  assert.deepStrictEqual(r, { merged: false, conflicts: ['a.txt'] }, 'MERGE asks the user about exactly these files')
  g('merge', '--abort')
  fs.writeFileSync(path.join(root, 'a.txt'), 'dirty\n')
  assert.throws(() => G.mergeBack(root, 'spec/01-x'), (e) => e.exit === 2, 'merging onto uncommitted work could lose it')
  assert.throws(() => G.mergeBack(root, 'spec/01-x', 'rebase'), /strategy|uncommitted/, 'unknown strategies must be refused')
})
