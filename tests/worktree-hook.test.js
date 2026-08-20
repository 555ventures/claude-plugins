'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, SPEC, gitRepo } = require('./helpers')
const { spawnSync, execFileSync } = require('node:child_process')

// specs/20260820/02-replay-scratch-write-access.md (2026-08-20): the first live /spec:replay
// run's mutation worker was correctly dispatched from a main-anchored session to Edit the
// scratch worktree replay.js stood up — and this hook blocked it, since the pre-fix decision
// table had no exception for a same-repo cross-worktree write whose TARGET is a disposable
// replay scratch tree. The worker tunneled the same write through Bash instead, tripping an
// Auto-Mode Bypass warning. D1/D2 add a target-marker allow (never a source-side one — a
// scratch-anchored session writing OUT to the main checkout must stay blocked, D2) scoped to
// trees carrying the `replay-worktree` marker replay.js's --setup already plants in the
// target's PRIVATE git dir. AC-20260820-02-1/-2 below are the new cases; AC-20260820-02-3/-4/-5
// tag the pre-existing regression pins that prove how little else moved.

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

// Builds a second worktree of the same repo and plants the `replay-worktree` marker in its
// PRIVATE git dir the same way replay.js --setup does (Contracts: `git -C "$probe" rev-parse
// --git-dir`, absolutized against the worktree dir — never written into the working tree).
function markedFixture() {
  const root = fs.realpathSync(tmpdir('xwt-marked'))
  gitRepo(root)
  const rt = path.join(root, '.claude/worktrees/rt')
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'rt', rt, 'HEAD'])
  const gitDirRaw = execFileSync('git', ['-C', rt, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
  const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(rt, gitDirRaw)
  fs.writeFileSync(path.join(gitDir, 'replay-worktree'), '')
  return { root, rt }
}

test('AC-20260820-02-1: a write whose TARGET is a same-repo sibling worktree carrying the replay-worktree marker in its private git dir is allowed with exit 0 and empty stderr', () => {
  const { root, rt } = markedFixture()
  const res = run({ cwd: root, tool_input: { file_path: path.join(rt, 'README.md') } })
  assert.strictEqual(res.status, 0,
    'D1: the marker-carrying target must be allowed — a block here reproduces the 2026-08-20 incident where ' +
    'the mutation worker\'s sanctioned Edit into a replay scratch tree was rejected and tunneled through ' +
    'Bash instead: ' + res.stderr)
  assert.strictEqual(res.stderr, '',
    'D1: an allowed write must print nothing on stderr — leftover BLOCKED text here would mislead a caller ' +
    'that inspects stderr regardless of exit code: ' + JSON.stringify(res.stderr))
})

test('AC-20260820-02-2: a write anchored INSIDE the marker-carrying scratch tree that targets the main checkout stays blocked, since the allow keys on the target only', () => {
  const { root, rt } = markedFixture()
  const res = run({ cwd: rt, tool_input: { file_path: path.join(root, 'README.md') } })
  assert.strictEqual(res.status, 2,
    'D2: the marker allow is scoped to the TARGET tree carrying the marker, not to any write touched by a ' +
    'session anchored inside one — allowing this direction would let a scratch-anchored agent pollute the ' +
    'main checkout, exactly the failure this hook exists to stop: ' + res.stderr)
  assert.match(res.stderr, /BLOCKED:/,
    'D2: the still-blocked case must keep printing the BLOCKED: diagnostic — a silent block here would leave ' +
    'a scratch-anchored escape with no remedy text: ' + res.stderr)
})

test('AC-20260820-02-4/AC-20260820-02-3: same-worktree write allows; cross-worktree write WITHOUT the replay-worktree marker still blocks', () => {
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

test('AC-20260820-02-5: fail-open: outside a repo, different repo, empty payload', () => {
  const outside = tmpdir('nowt')
  assert.strictEqual(run({ cwd: outside, tool_input: { file_path: path.join(outside, 'x.txt') } }).status, 0)
  const { wt } = fixture()
  const other = fs.realpathSync(tmpdir('otherrepo'))
  gitRepo(other)
  assert.strictEqual(run({ cwd: wt, tool_input: { file_path: path.join(other, 'x.txt') } }).status, 0)
  assert.strictEqual(run({ cwd: wt, tool_input: {} }).status, 0)
})
