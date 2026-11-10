'use strict'
// Pins lib/reap.js (ADR-0049, D10): the one process reader. Stand-in owners are `sleep` processes (one named claude);
// the owner is SIGKILLed and sweep reaps what it left. Spec 20261108/01 AC-8.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, SPEC } = require('./helpers')
const reap = require(path.join(SPEC, 'scripts/lib/reap.js'))

const IDLE = 'setInterval(() => {}, 1000)'
const gone = (pid) => new Promise((resolve) => { const t0 = Date.now(); const poll = () => (!reap.running(pid) || Date.now() - t0 > 8000 ? resolve(!reap.running(pid)) : setTimeout(poll, 50)); poll() })

// A node process idling with `env` and cwd; killed when the test ends.
function idle(t, env, cwd) {
  const child = spawn(process.execPath, ['-e', IDLE], { cwd, env: { ...process.env, CLAUDE_PID: undefined, SPEC_APP: undefined, ...env }, stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))
  return child
}
// A stand-in session: a process whose argv[0] is `claude`.
function session(t) {
  const child = spawn('bash', ['-c', 'exec -a claude sleep 300'], { stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))
  return child
}
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms))
// Polls until every child shows its environment in the process table (a fresh process lists its parent's until it execs).
async function listed(children, want = (p) => p.CLAUDE_PID !== null || p.SPEC_APP !== null) {
  for (let i = 0; i < 200; i++) {
    const by = new Map(reap.procs().map((p) => [p.pid, p]))
    if (children.every((c) => by.has(c.pid) && want(by.get(c.pid), c))) return
    await settle(50)
  }
}

test('AC-20261108-01-8 procs reads CLAUDE_PID and SPEC_APP from a process environment (Claude Code still exports CLAUDE_PID)', async (t) => {
  const tag = path.join(tmpdir('reap tag'), 'a worktree')
  const a = idle(t, { CLAUDE_PID: '4242', SPEC_APP: tag })
  const b = idle(t, {})
  await listed([a, b], (p, c) => (c === a ? p.SPEC_APP === tag : p.CLAUDE_PID === null && p.SPEC_APP === null))
  const by = new Map(reap.procs().map((p) => [p.pid, p]))
  assert.deepStrictEqual([by.get(a.pid).CLAUDE_PID, by.get(a.pid).SPEC_APP], [4242, tag], 'both read, a path with a space whole')
  assert.deepStrictEqual([by.get(b.pid).CLAUDE_PID, by.get(b.pid).SPEC_APP], [null, null])
  assert.deepStrictEqual(reap.tagged(tag), [a.pid])
})

test('AC-20261108-01-8 procs reads this process\'s own CLAUDE_PID when Claude Code exported one (a rename upstream turns this red)', (t) => {
  if (!process.env.CLAUDE_PID) return t.skip('CLAUDE_PID is not exported here')
  const me = reap.procs().find((p) => p.pid === process.pid)
  assert.strictEqual(me && me.CLAUDE_PID, Number(process.env.CLAUDE_PID))
})

test('AC-20261108-01-8 ownerAlive counts a running pid as alive when ps fails or prints nothing: the sweep never kills on a guess', (t) => {
  const other = spawn('sleep', ['300'], { stdio: 'ignore' })
  t.after(() => other.kill('SIGKILL'))
  const was = process.env.PATH
  t.after(() => { process.env.PATH = was })
  for (const body of ['exit 1', 'exit 0']) {
    const bin = tmpdir('reap ps')
    fs.writeFileSync(path.join(bin, 'ps'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    process.env.PATH = `${bin}${path.delimiter}${was}`
    assert.strictEqual(reap.ownerAlive(other.pid), true, body)
  }
  process.env.PATH = was
  assert.strictEqual(reap.ownerAlive(other.pid), false, 'with ps back, a live process not named claude is no owner')
})

test('AC-20261108-01-8 ownerAlive: a live process named claude is an owner, a dead one or any other name is not', async (t) => {
  const live = session(t)
  const other = spawn('sleep', ['300'], { stdio: 'ignore' })
  t.after(() => other.kill('SIGKILL'))
  const dying = session(t)
  await settle()
  assert.strictEqual(reap.ownerAlive(live.pid), true)
  assert.strictEqual(reap.ownerAlive(other.pid), false, 'alive but not named claude')
  dying.kill('SIGKILL')
  await new Promise((r) => dying.once('exit', r))
  assert.strictEqual(reap.ownerAlive(dying.pid), false)
  assert.strictEqual(reap.ownerAlive(0), false)
})

test('AC-20261108-01-8 cwdUnder lists the processes whose cwd is the directory or below', async (t) => {
  const root = fs.realpathSync(tmpdir('reap-cwd'))
  fs.mkdirSync(path.join(root, 'sub'))
  const here = idle(t, {}, root); const below = idle(t, {}, path.join(root, 'sub')); const away = idle(t, {}, tmpdir('reap-elsewhere'))
  await settle()
  assert.deepStrictEqual(reap.cwdUnder([here.pid, below.pid, away.pid], root).sort(), [here.pid, below.pid].sort())
  assert.deepStrictEqual(reap.cwdUnder([], root), [])
})

test('AC-20261108-01-8 sweep kills the SPEC_APP process and the untagged one under root whose owner is dead, and leaves one outside root and one whose owner is alive', async (t) => {
  const root = fs.realpathSync(tmpdir('reap-root'))
  const away = fs.realpathSync(tmpdir('reap-away'))
  const alive = session(t)
  const owner = session(t)
  await settle()
  const env = { CLAUDE_PID: String(owner.pid) }
  const tagged = idle(t, { ...env, SPEC_APP: path.join(root, 'wt') }, away)
  const taggedAway = idle(t, { ...env, SPEC_APP: path.join(away, 'wt') }, away)
  const under = idle(t, env, root)
  const outside = idle(t, env, away)
  const kept = idle(t, { CLAUDE_PID: String(alive.pid) }, root)
  const keptTagged = idle(t, { CLAUDE_PID: String(alive.pid), SPEC_APP: path.join(root, 'wt') }, root)
  const ownerless = idle(t, {}, root)
  await listed([tagged, taggedAway, under, outside, kept, keptTagged, ownerless],
    (p, c) => (c === ownerless ? p.CLAUDE_PID === null : p.CLAUDE_PID !== null))
  await settle(300)
  reap.sweep(root)
  assert.ok([tagged, taggedAway, under, outside, kept, keptTagged, ownerless].every((p) => reap.running(p.pid)), 'nothing is orphaned while the owner lives')
  owner.kill('SIGKILL')
  await new Promise((r) => owner.once('exit', r))
  assert.ok(reap.sweep(root) >= 2)
  assert.ok(await gone(tagged.pid), 'the process tagged with a worktree under root, of a dead owner, is killed')
  assert.ok(await gone(under.pid), 'the untagged one whose cwd is under root is killed')
  for (const [name, p] of [['cwd outside root', outside], ['tagged with a worktree outside root', taggedAway], ['owner alive', kept], ['owner alive, tagged', keptTagged], ['no owner recorded', ownerless]]) assert.ok(reap.running(p.pid), name + ' is left alone')
})

test('AC-20261108-01-8 sweep never touches the sweeping process\'s ancestors or a process carrying its own CLAUDE_PID, even when that owner reads dead', async (t) => {
  const root = fs.realpathSync(tmpdir('reap-self'))
  const [o1, o2, o3] = [session(t), session(t), session(t)]
  await settle()
  const pids = [o1, o2, o3].map((o) => String(o.pid))
  for (const o of [o1, o2, o3]) { o.kill('SIGKILL'); await new Promise((r) => o.once('exit', r)) }
  // parent = ancestor (dead owner 1, cwd root) -> sweeper (dead owner 2); beside them: its own-owner sibling and a stranger of dead owner 3
  const own = idle(t, { CLAUDE_PID: pids[1] }, root)
  const stranger = idle(t, { CLAUDE_PID: pids[2] }, root)
  await listed([own, stranger])
  await settle(300)
  // the ancestor must be the sweeper's real parent: run the sweeper from a node that stays alive as its parent
  const script = "const { spawnSync } = require('child_process'); const r = spawnSync(process.execPath, ['-e', 'console.log(require(process.argv[1]).sweep(process.argv[2]))', " +
    JSON.stringify(path.join(SPEC, 'scripts/lib/reap.js')) + ", " + JSON.stringify(root) + "], { env: { ...process.env, CLAUDE_PID: " + JSON.stringify(pids[1]) + " }, encoding: 'utf8' }); console.log('swept', r.stdout.trim()); setTimeout(() => {}, 4000)"
  const parent = spawn(process.execPath, ['-e', script], { cwd: root, env: { ...process.env, CLAUDE_PID: pids[0] }, stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => parent.kill('SIGKILL'))
  const out = await new Promise((r) => { let b = ''; parent.stdout.on('data', (d) => { b += d; if (/swept/.test(b)) r(b) }); parent.once('exit', () => r(b)); setTimeout(() => r(b), 20000) })
  assert.ok(await gone(stranger.pid), 'a stranger of a dead owner under root is killed')
  assert.ok(reap.running(own.pid), 'a process carrying the sweeper\'s own CLAUDE_PID is left alone')
  assert.ok(reap.running(parent.pid), 'the sweeper\'s ancestor is left alone, though its owner reads dead and its cwd is under root')
  assert.match(out, /swept \d+/)
})

test('AC-20261108-01-8 kill terminates then kills a process that ignores TERM', async (t) => {
  const stubborn = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => stubborn.kill('SIGKILL'))
  await new Promise((r) => stubborn.stdout.once('data', r))
  assert.strictEqual(reap.kill([stubborn.pid]), 1)
  assert.ok(await gone(stubborn.pid))
})

test('AC-20261108-01-8 kill still escalates to SIGKILL when ps is not on PATH', async (t) => {
  const stubborn = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => stubborn.kill('SIGKILL'))
  await new Promise((r) => stubborn.stdout.once('data', r))
  const was = process.env.PATH
  t.after(() => { process.env.PATH = was })
  process.env.PATH = tmpdir('reap no ps')
  assert.strictEqual(reap.running(stubborn.pid), true, 'signal 0 answers when ps cannot')
  reap.kill([stubborn.pid], 300)
  process.env.PATH = was
  assert.ok(await gone(stubborn.pid))
})
