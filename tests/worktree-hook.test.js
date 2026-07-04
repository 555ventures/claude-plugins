'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC, gitRepo } = require('./helpers')
const { spawnSync, execFileSync } = require('node:child_process')

const HOOK = path.join(SPEC, 'scripts/block-cross-worktree-writes.sh')

function run(payload) {
  return spawnSync('bash', [HOOK], { encoding: 'utf8', input: JSON.stringify(payload) })
}

// One repo with a worktree; cwd = worktree, target crosses into the main checkout.
function fixture() {
  const root = fs.realpathSync(tmpdir('xwt'))
  gitRepo(root)
  const wt = path.join(root, '.claude/worktrees/w1')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'w1', wt, 'HEAD'])
  return { root, wt }
}

test('same-worktree write allows; cross-worktree write blocks', () => {
  const { root, wt } = fixture()
  assert.strictEqual(run({ cwd: wt, tool_input: { file_path: path.join(wt, 'ok.txt') } }).status, 0)
  const res = run({ cwd: wt, tool_input: { file_path: path.join(root, 'escape.txt') } })
  assert.strictEqual(res.status, 2)
  assert.match(res.stderr, /BLOCKED/)
})

test('NotebookEdit payloads (notebook_path) are guarded too', () => {
  const { root, wt } = fixture()
  const res = run({ cwd: wt, tool_input: { notebook_path: path.join(root, 'escape.ipynb') } })
  assert.strictEqual(res.status, 2, 'notebook_path must be read from the payload, not just file_path')
  assert.strictEqual(run({ cwd: wt, tool_input: { notebook_path: path.join(wt, 'ok.ipynb') } }).status, 0)
})

test('fail-open: outside a repo, different repo, empty payload', () => {
  const outside = tmpdir('nowt')
  assert.strictEqual(run({ cwd: outside, tool_input: { file_path: path.join(outside, 'x.txt') } }).status, 0)
  const { wt } = fixture()
  const other = fs.realpathSync(tmpdir('otherrepo'))
  gitRepo(other)
  assert.strictEqual(run({ cwd: wt, tool_input: { file_path: path.join(other, 'x.txt') } }).status, 0)
  assert.strictEqual(run({ cwd: wt, tool_input: {} }).status, 0)
})
