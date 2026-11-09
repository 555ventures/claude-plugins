'use strict'
// Pins the hooks: state-gate.sh (UserPromptSubmit), block-worker-git.sh and block-cross-worktree-writes.sh
// (PreToolUse) by exit code (0 = allow, 2 = block; parse errors fail open), and reap.js (SessionStart, SessionEnd) by
// the processes it stops (it always exits 0).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync, spawn, spawnSync } = require('child_process')
const { tmpdir, gitRepo, runBash, runNode, SPEC } = require('./helpers')
const S = require(path.join(SPEC, 'scripts/lib/state'))

const hook = (script, payload) => runBash('scripts/' + script, [], { input: typeof payload === 'string' ? payload : JSON.stringify(payload) })

test('state-gate refuses /spec:run on a draft or a spec with open markers, passes the rest', () => {
  const dir = tmpdir('gate')
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  put('specs/d.md', '---\nstatus: draft\n---\n# D\n')
  put('specs/m.md', '---\nstatus: hardened\n---\n# M\n[NEEDS CLARIFICATION: which?]\n')
  put('specs/h.md', '---\nstatus: hardened\n---\n# H\n')
  const p = (prompt) => hook('state-gate.sh', { prompt, cwd: dir })
  const draft = p('/spec:run specs/d.md')
  assert.strictEqual(draft.status, 2, 'a draft spec is refused')
  assert.match(draft.stderr, /\/spec:plan specs\/d\.md/, 'the refusal names the remedy')
  assert.strictEqual(p('/spec:run specs/m.md --in-place').status, 2, 'open markers are refused')
  assert.strictEqual(p('/spec:run @specs/h.md').status, 0, 'a hardened spec passes')
  assert.strictEqual(p('/spec:plan specs/d.md').status, 0, 'other commands pass')
  assert.strictEqual(p('/spec:run specs/missing.md').status, 0, 'an unreadable spec fails open')
  assert.strictEqual(hook('state-gate.sh', 'not json').status, 0, 'a parse error fails open')
})

test('block-worker-git blocks git writes only in a marked lane worktree', () => {
  const dir = tmpdir('wgit')
  gitRepo(dir)
  const p = (command) => hook('block-worker-git.sh', { cwd: dir, tool_input: { command } })
  assert.strictEqual(p('git commit -m x').status, 0, 'no marker → allowed')
  fs.writeFileSync(path.join(dir, '.git', 'spec-lane-open'), '')
  for (const c of ['git commit -m x', 'cd a && git -C . push', 'git checkout main', 'git reset --hard', 'git rebase main', 'git rebase --abort', 'git merge x', 'git add . && git commit -m x']) {
    const r = p(c)
    assert.strictEqual(r.status, 2, `${c} must be blocked in a lane`)
    assert.match(r.stderr, /^BLOCKED:/)
    assert.match(r.stderr, /stale marker \(no run in flight\)\? \/spec:doctor names it; remove it with rm '\S*\/\.git\/spec-lane-open'/, 'the lane block names the marker to remove')
  }
  for (const c of ['git status', 'git diff HEAD', 'git log -1', 'echo commit', 'node run.js x --mark built',
    'git add src/a.js', 'git rebase --continue', 'git add -A && GIT_EDITOR=true git rebase --continue']) {
    assert.strictEqual(p(c).status, 0, `${c} is allowed in a lane`)
  }
  const wt = path.join(dir, '.claude/worktrees/spec-l')
  execFileSync('git', ['-C', dir, 'worktree', 'add', '-q', '-b', 'l', wt])
  const gd = execFileSync('git', ['-C', wt, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  fs.rmSync(path.join(dir, '.git', 'spec-lane-open'))
  fs.writeFileSync(path.join(gd, 'spec-lane-open'), '')
  for (const c of [`cd ${wt} && git commit -m x`, `git -C ${wt} commit -m x`]) assert.strictEqual(p(c).status, 2, `${c} targets a marked worktree from the main checkout`)
  assert.strictEqual(p('git commit -m x').status, 0, 'the main checkout itself is not a lane')
  assert.strictEqual(hook('block-worker-git.sh', '{bad').status, 0, 'a parse error fails open')
})

test('block-cross-worktree-writes keeps writes inside the current worktree', () => {
  const dir = tmpdir('xwt')
  const g = gitRepo(dir)
  const other = path.join(dir, '.claude/worktrees/spec-o')
  const sib = path.join(dir, '.claude/worktrees/spec-p')
  g('worktree', 'add', '-q', '-b', 'o', other)
  g('worktree', 'add', '-q', '-b', 'p', sib)
  const outside = tmpdir('outside')
  const w = (cwd, file_path) => hook('block-cross-worktree-writes.sh', { cwd, tool_input: { file_path } })
  assert.strictEqual(w(other, path.join(other, 'src/new.js')).status, 0, 'a write inside the cwd worktree is allowed')
  assert.strictEqual(w(other, 'rel/file.txt').status, 0, 'a relative path resolves inside the cwd')
  const esc = w(other, path.join(dir, 'a.txt'))
  assert.strictEqual(esc.status, 2, 'a write into the main checkout from a lane is blocked')
  assert.match(esc.stderr, /^BLOCKED:/)
  assert.strictEqual(w(dir, path.join(other, 'a.txt')).status, 0, 'an agent at the main checkout writes into a plugin worktree')
  assert.strictEqual(w(other, path.join(sib, 'a.txt')).status, 2, 'a write from one worktree into a sibling is blocked')
  assert.strictEqual(w(dir, path.join(S.fixRunDir(other, 'x-abcdef'), 'evidence.md')).status, 0, 'a spec-less fix lane\'s run dir takes its builder\'s evidence.md from an agent at the main checkout')
  assert.strictEqual(w(dir, path.join(dir, '.git/worktrees/spec-o/spec-lane-open')).status, 2, 'planting a marker in another tree\'s git dir is blocked')
  assert.strictEqual(w(dir, path.join(outside, 'x.txt')).status, 0, 'a write outside any repo is allowed')
  assert.strictEqual(hook('block-cross-worktree-writes.sh', '[]').status, 0, 'a parse error fails open')
})

test('block-worker-git parses quotes, spaces, chains and nested shells', () => {
  const base = tmpdir('wgit sp')
  const dir = path.join(base, 'main repo')
  gitRepo(dir)
  const wt = path.join(dir, '.claude/worktrees/spec-a b')
  execFileSync('git', ['-C', dir, 'worktree', 'add', '-q', '-b', 'ab', wt])
  const gd = execFileSync('git', ['-C', wt, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(path.join(gd, 'spec-lane-open'), 'fanout')
  const p = (command) => hook('block-worker-git.sh', { cwd: dir, tool_input: { command } }).status
  for (const c of [`cd "${wt}" && git commit -m "it's done"`, `git -C '${wt}' commit -m x`, `cd "${wt}"\ngit push`,
    `bash -c "cd '${wt}' && git reset --hard"`, `cd ${wt.replace(/ /g, '\\ ')}; git --no-pager checkout -b x`, `(cd "${wt}" && git merge x)`]) {
    assert.strictEqual(p(c), 2, `${JSON.stringify(c)} must be blocked`)
  }
  for (const c of [`cd "${wt}" && git status`, `cd "${wt}" && echo "git commit"`, `git -C "${wt}" log -1`, 'git commit -m x']) {
    assert.strictEqual(p(c), 0, `${JSON.stringify(c)} is allowed`)
  }
  const noNode = spawnSync('/bin/bash', [path.join(SPEC, 'scripts/block-worker-git.sh')], { input: JSON.stringify({ cwd: wt, tool_input: { command: 'git commit' } }), env: { PATH: '/nonexistent' }, encoding: 'utf8' })
  assert.strictEqual(noNode.status, 0, 'no node on PATH fails open')
})

test('AC-20261105-15-10 inside a marked lane only v7\'s read-only allowlist, git add and git rebase --continue pass; in the main checkout only the destructive verbs stay blocked', () => {
  const dir = tmpdir('wgit-allow')
  gitRepo(dir)
  const wt = path.join(dir, '.claude/worktrees/spec-l')
  execFileSync('git', ['-C', dir, 'worktree', 'add', '-q', '-b', 'l', wt])
  const gd = execFileSync('git', ['-C', wt, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(path.join(gd, 'spec-lane-open'), 'fanout')
  const inLane = (command) => hook('block-worker-git.sh', { cwd: wt, tool_input: { command } }).status
  const inMain = (command) => hook('block-worker-git.sh', { cwd: dir, tool_input: { command } }).status
  for (const v of ['cherry-pick', 'revert', 'am', 'apply', 'pull', 'fetch', 'tag', 'rm', 'mv', 'update-ref', 'symbolic-ref', 'update-index', 'config', 'remote', 'submodule', 'gc', 'bisect']) {
    assert.strictEqual(inLane(`git ${v} x`), 2, `git ${v} is blocked in a lane`)
    assert.strictEqual(inLane(`git -C ${wt} ${v}`), 2, `git -C <lane> ${v} is blocked`)
  }
  for (const v of 'status diff log show rev-parse ls-files ls-tree blame grep describe cat-file name-rev shortlog rev-list merge-base show-ref diff-tree version help'.split(' ')) {
    assert.strictEqual(inLane(`git ${v}`), 0, `git ${v} is allowed in a lane`)
  }
  assert.strictEqual(inLane('git add -A'), 0)
  assert.strictEqual(inLane('git rebase --continue'), 0)
  assert.strictEqual(inLane('git rebase --abort'), 2)
  assert.strictEqual(inMain('git fetch'), 0, 'a fetch in the main checkout is not blocked while a lane is open')
  assert.strictEqual(inMain('git cherry-pick x'), 0, 'nor are the other non-destructive verbs')
  assert.strictEqual(inMain('git reset --hard'), 2, 'a reset there still is')
  for (const c of ['git checkout .', 'git restore .', 'git clean -fd', 'git stash', 'git switch x', 'git branch -D x', 'git worktree remove x']) assert.strictEqual(inMain(c), 2, `${c} is blocked in the main checkout while a lane is open`)
  assert.strictEqual(inMain('git branch --list'), 0, 'a harmless form is not')
})

// ---- reap.js: SessionStart sweeps this repo, SessionEnd stops what the session started (spec 20261108/04) ----
// Every process killed here is a stand-in this test spawned: node idlers carrying CLAUDE_PID / SPEC_APP, `sleep` owners.
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
const gone = async (pid, ms = 3000) => { for (let t0 = Date.now(); alive(pid) && Date.now() - t0 < ms;) await new Promise((r) => setTimeout(r, 50)); return !alive(pid) }
const settle = (ms = 800) => new Promise((r) => setTimeout(r, ms)) // a fresh process shows its parent's env until it execs
const STUBBORN = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)" // ignores TERM: only KILL stops it
function idle(t, env, cwd, code = 'setInterval(() => {}, 1000)') {
  const child = spawn(process.execPath, ['-e', code], { cwd, env: { ...process.env, CLAUDE_PID: undefined, SPEC_APP: undefined, ...env }, stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))
  return child
}
const owner = (t, name = 'sleep') => {
  const child = spawn('bash', ['-c', `exec -a ${name} sleep 300`], { stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))
  return child
}
const reap = (arg, payload, env = {}) => runNode('scripts/reap.js', [arg], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), env: { CLAUDE_PID: undefined, ...env } })

test('AC-20261108-04-3 session-start stops what a SIGKILLed session left under this repo, prints one line, and spares a live owner\'s and an outside process', async (t) => {
  const repo = fs.realpathSync(tmpdir('reap-start'))
  gitRepo(repo)
  const outside = fs.realpathSync(tmpdir('reap-outside'))
  const dying = owner(t)
  const live = owner(t, 'claude')
  await settle(300)
  const deadPid = dying.pid
  dying.kill('SIGKILL')
  await new Promise((r) => dying.once('exit', r))
  const tagged = idle(t, { CLAUDE_PID: String(deadPid), SPEC_APP: path.join(repo, '.claude/worktrees/spec-x') }, outside)
  const here = idle(t, { CLAUDE_PID: String(deadPid) }, repo)
  const away = idle(t, { CLAUDE_PID: String(deadPid) }, outside)
  const theirs = idle(t, { CLAUDE_PID: String(live.pid) }, repo)
  await settle()
  const r = reap('session-start', { cwd: repo, hook_event_name: 'SessionStart' })
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^🧹 stopped 2 process\(es\) a closed session left in this repo\n$/)
  assert.ok(await gone(tagged.pid) && await gone(here.pid), 'the SPEC_APP process and the untagged one under the repo are stopped')
  assert.ok(alive(away.pid), 'a process with its cwd outside the repo stays')
  assert.ok(alive(theirs.pid), 'a live session\'s process stays')
  const again = reap('session-start', { cwd: repo })
  assert.deepStrictEqual([again.status, again.stdout], [0, ''], 'nothing left to reap prints nothing')
  assert.deepStrictEqual([reap('session-start', { cwd: outside }).status, reap('session-start', { cwd: outside }).stdout], [0, ''], 'no repo: exit 0, silent')
  assert.strictEqual(reap('session-start', 'not json').status, 0, 'a parse error never blocks a session')
  assert.strictEqual(reap('session-start', {}).status, 0)
})

test('AC-20261108-04-3 session-start stops a SIGTERM-ignoring orphan and returns inside the hook\'s 5 s timeout', async (t) => {
  const repo = fs.realpathSync(tmpdir('reap-stubborn'))
  gitRepo(repo)
  const dying = owner(t)
  await settle(300)
  const deadPid = dying.pid
  dying.kill('SIGKILL')
  await new Promise((r) => dying.once('exit', r))
  const stubborn = idle(t, { CLAUDE_PID: String(deadPid) }, repo, STUBBORN)
  await settle()
  const t0 = Date.now()
  const r = reap('session-start', { cwd: repo })
  const ms = Date.now() - t0
  assert.strictEqual(r.status, 0)
  assert.match(r.stdout, /^🧹 stopped 1 process\(es\)/)
  assert.ok(ms < 5000, `session-start took ${ms} ms; the hook is killed at 5 s, before its SIGKILL is sent`)
  assert.ok(await gone(stubborn.pid, 1000), 'the TERM-ignoring orphan is killed')
})

test('AC-20261108-04-4 session-end stops every process carrying the session\'s CLAUDE_PID within 2 s and no other; clear and resume stop nothing', async (t) => {
  const me = owner(t)
  const other = owner(t)
  const mine = [idle(t, { CLAUDE_PID: String(me.pid) }, tmpdir('a')), idle(t, { CLAUDE_PID: String(me.pid), SPEC_APP: tmpdir('b') }, tmpdir('c'))]
  mine.push(idle(t, { CLAUDE_PID: String(me.pid) }, tmpdir('e'), STUBBORN))
  const theirs = idle(t, { CLAUDE_PID: String(other.pid) }, tmpdir('d'))
  await settle()
  for (const reason of ['clear', 'resume']) {
    const r = reap('session-end', { reason }, { CLAUDE_PID: String(me.pid) })
    assert.deepStrictEqual([r.status, r.stdout], [0, ''])
    assert.ok(mine.every((c) => alive(c.pid)), `${reason} keeps the process alive, so its servers stay`)
  }
  const t0 = Date.now()
  const r = reap('session-end', { reason: 'prompt_input_exit' }, { CLAUDE_PID: String(me.pid) })
  assert.strictEqual(r.status, 0)
  for (const c of mine) assert.ok(await gone(c.pid, 2000), 'every process carrying the session\'s CLAUDE_PID is stopped')
  const ms = Date.now() - t0
  assert.ok(ms < 2000, `the last one, which ignores SIGTERM, is gone ${ms} ms after session-end started; the bound is 2 s`)
  assert.ok(alive(theirs.pid) && alive(me.pid) && alive(other.pid), 'another session\'s process and the owners themselves stay')
  assert.strictEqual(reap('session-end', 'not json', { CLAUDE_PID: String(me.pid) }).status, 0)
})

test('AC-20261108-04-4 session-end without CLAUDE_PID takes the nearest ancestor named claude as the owner', async (t) => {
  const reapJs = path.join(SPEC, 'scripts/reap.js')
  const session = spawn('bash', ['-c', `exec -a claude bash -c 'node "$0" session-end; true' "${reapJs}"`], { env: { ...process.env, CLAUDE_PID: undefined }, stdio: ['pipe', 'ignore', 'ignore'] })
  t.after(() => session.kill('SIGKILL'))
  const child = idle(t, { CLAUDE_PID: String(session.pid) }, tmpdir('walk'))
  const bystander = idle(t, { CLAUDE_PID: String(owner(t).pid) }, tmpdir('walk2'))
  await settle()
  session.stdin.end(JSON.stringify({ reason: 'other' }))
  assert.ok(await gone(child.pid, 3000), 'the process carrying the claude ancestor\'s pid is stopped')
  assert.ok(alive(bystander.pid))
})

test('AC-20261108-04-5 hooks.json carries one SessionStart and one SessionEnd arm calling reap.js with timeout 5, and the three existing arms stay', () => {
  const h = JSON.parse(fs.readFileSync(path.join(SPEC, 'hooks/hooks.json'), 'utf8')).hooks
  for (const [ev, arg] of [['SessionStart', 'session-start'], ['SessionEnd', 'session-end']]) {
    assert.strictEqual(h[ev].length, 1, ev)
    assert.deepStrictEqual(h[ev][0].hooks, [{ type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/scripts/reap.js" ${arg}`, timeout: 5 }])
  }
  assert.deepStrictEqual(Object.keys(h).sort(), ['PreToolUse', 'SessionEnd', 'SessionStart', 'UserPromptSubmit'])
  assert.deepStrictEqual(h.UserPromptSubmit[0].hooks.map((x) => x.command), ['"${CLAUDE_PLUGIN_ROOT}/scripts/state-gate.sh"'])
  assert.deepStrictEqual(h.PreToolUse.map((a) => [a.matcher, a.hooks.map((x) => x.command)]),
    [['Bash', ['"${CLAUDE_PLUGIN_ROOT}/scripts/block-worker-git.sh"']], ['Write|Edit', ['"${CLAUDE_PLUGIN_ROOT}/scripts/block-cross-worktree-writes.sh"']]])
})
