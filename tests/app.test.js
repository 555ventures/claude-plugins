'use strict'
// Pins lib/app.js (ADR-0049): the one owner of the host's app. By execution on tmp hosts with a stub app (a node http
// server on $PORT or on fixed ports, one variant that detaches a grandchild into its own session), a stub env command that
// writes a marker, and a foreign server a dead session left. Spec 20261108/01 D3, D5.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tmpdir, gitRepo, freePort, killStrays, SPEC } = require('./helpers')
const app = require(path.join(SPEC, 'scripts/lib/app.js'))
const reap = require(path.join(SPEC, 'scripts/lib/reap.js'))

const SERVER = "require('http').createServer((q, s) => s.end('app')).listen(process.env.PORT, '127.0.0.1')\n"
const alive = (pid) => reap.running(pid)
const answers = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)

// A git host with the stub app, a log path and every process it tags killed when the test ends.
function host(t, files = {}) {
  const root = tmpdir('app')
  fs.writeFileSync(path.join(root, 'app.js'), SERVER)
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(root, f), text)
  gitRepo(root)
  const wt = fs.realpathSync(root)
  t.after(() => { for (const pid of reap.tagged(wt)) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } } killStrays(root) })
  return { root, wt, log: path.join(tmpdir('applog'), 'app.log') }
}
const RT = { url: 'http://127.0.0.1:{port}', bootCommand: 'node app.js', readySeconds: 20 }

test('AC-20261108-01-8 start boots the app detached with SPEC_APP and PORT, wait for the ready check, and stop leaves no process carrying the tag even when the app detaches a grandchild into its own session', async (t) => {
  const h = host(t)
  const [a, b] = [await freePort(), await freePort()]
  // the app detaches a grandchild (its own session: a group kill cannot reach it) that serves the second port
  fs.writeFileSync(path.join(h.root, 'two.js'),
    `const { spawn } = require('child_process')\nspawn(process.execPath, ['-e', "require('http').createServer((q, s) => s.end('gc')).listen(${b}, '127.0.0.1')"], { detached: true, stdio: 'ignore' }).unref()\n` +
    `require('http').createServer((q, s) => s.end('app')).listen(${a}, '127.0.0.1')\n`)
  const rt = { url: `http://127.0.0.1:${a}`, readyCheck: [`http://127.0.0.1:${a}`, `http://127.0.0.1:${b}`], bootCommand: 'node two.js', readySeconds: 20 }
  const rec = app.start(rt, { cwd: h.root, port: null, log: h.log })
  assert.deepStrictEqual([rec.port, rec.url, rec.log, rec.wt], [null, `http://127.0.0.1:${a}`, h.log, h.wt])
  assert.ok(rec.pid > 0 && !Number.isNaN(Date.parse(rec.startedAt)))
  assert.ok(await answers(`http://127.0.0.1:${a}`) && await answers(`http://127.0.0.1:${b}`))
  assert.ok(app.alive(rec))
  assert.ok(reap.tagged(h.wt).length >= 2, 'the app and its detached grandchild carry the tag')
  app.stop(rec)
  assert.deepStrictEqual(reap.tagged(h.wt), [], 'no process carrying SPEC_APP is left')
  assert.ok(!app.alive(rec) && !(await answers(`http://127.0.0.1:${b}`)) && !(await answers(`http://127.0.0.1:${a}`)))
  app.stop(rec) // idempotent
  app.stop(null)
})

test('AC-20261108-01-8 a url with {port} gets PORT in the app env; ensure keeps a live app, restarts a dead one and a restart:true one', async (t) => {
  const h = host(t)
  const port = await freePort()
  const opts = { cwd: h.root, port, log: h.log }
  const rec = app.ensure(RT, null, opts)
  assert.strictEqual(rec.url, `http://127.0.0.1:${port}`)
  assert.ok(await answers(rec.url))
  assert.strictEqual(app.ensure(RT, rec, opts), rec, 'a live app is returned as it is')
  process.kill(-rec.pid, 'SIGKILL')
  for (let i = 0; i < 50 && app.alive(rec); i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(!app.alive(rec), 'killed')
  const next = app.ensure(RT, rec, opts)
  assert.notStrictEqual(next.pid, rec.pid)
  assert.ok(await answers(next.url))
  const forced = app.ensure(RT, next, { ...opts, restart: true })
  assert.notStrictEqual(forced.pid, next.pid, 'restart:true replaces a live app')
  assert.ok(!alive(next.pid) && await answers(forced.url))
  app.stop(forced)
})

test('AC-20261108-01-8 ready: every url must answer; a command with PORT in env exits 0', async (t) => {
  const h = host(t)
  const [up, down] = [await freePort(), await freePort()]
  const srv = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => { s.statusCode = 404; s.end() }).listen(${up}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => srv.kill('SIGKILL'))
  await new Promise((r) => srv.stdout.once('data', r))
  const u = (p) => `http://127.0.0.1:${p}`
  assert.strictEqual(app.ready({ url: u(up) }, null), true, 'any HTTP status answers')
  assert.strictEqual(app.ready({ url: u(down) }, null), false)
  assert.strictEqual(app.ready({ url: u(down), readyCheck: [u(up), u(down)] }, null), false, 'every url must answer')
  assert.strictEqual(app.ready({ url: 'http://127.0.0.1:{port}' }, up), true, '{port} is substituted')
  assert.strictEqual(app.ready({ url: u(down), readyCheck: 'test "$PORT" = 7' }, 7, h.root), true)
  assert.strictEqual(app.ready({ url: u(down), readyCheck: 'test "$PORT" = 7' }, 8, h.root), false)
})

test('AC-20261108-01-8 a ready check that never passes kills the app, throws exit 1 naming the log with its tail; no boot command is a refusal', async (t) => {
  const h = host(t)
  const port = await freePort()
  const never = () => app.start({ ...RT, bootCommand: 'echo hello-from-app; exec node app.js', readyCheck: 'exit 1', readySeconds: 2 }, { cwd: h.root, port, log: h.log })
  assert.throws(never, (e) => e.exit === 1 && e.message.includes('did not get ready in 2s') && e.message.includes(h.log) && e.message.includes('hello-from-app'))
  assert.deepStrictEqual(reap.tagged(h.wt), [], 'no process of the app is left')
  assert.throws(() => app.start({ url: 'http://127.0.0.1:{port}' }, { cwd: h.root, port, log: h.log }), (e) => e.exit === 2 && /runtime\.bootCommand/.test(e.message))
})

test('AC-20261108-01-2 a boot command that exits 0 leaving nothing tagged (a daemon: `docker compose up -d`) keeps the wait; once the daemon answers, start refuses (exit 2) naming runtime.stopCommand and adopts nothing', async (t) => {
  // the daemon drops SPEC_APP and serves after 2 s; it records its pid under pids/ the moment it starts so the test kills it
  const h = host(t, { 'daemon.js': "require('fs').writeFileSync('pids/' + process.pid, '')\nsetTimeout(() => require('http').createServer((q, s) => s.end('d')).listen(process.env.PORT, '127.0.0.1'), 2000)\n" })
  fs.mkdirSync(path.join(h.root, 'pids'))
  t.after(() => { for (const p of fs.readdirSync(path.join(h.root, 'pids'))) { try { process.kill(Number(p), 'SIGKILL') } catch { /* gone */ } } })
  const port = await freePort()
  const rt = { ...RT, bootCommand: 'env -u SPEC_APP node daemon.js >/dev/null 2>&1 & exit 0', readySeconds: 15 }
  assert.throws(() => app.start(rt, { cwd: h.root, port, log: h.log }),
    (e) => e.exit === 2 && e.message.includes('the boot handed its server to a daemon this driver cannot stop — add runtime.stopCommand (spec 20261109/01)'))
  assert.ok(await answers(`http://127.0.0.1:${port}`), 'start kept waiting until the daemon answered')
  assert.deepStrictEqual(reap.tagged(h.wt), [], 'nothing of it carries the tag, so nothing is adopted')
  // adopted nowhere: the next start refuses the url as one this driver did not start
  assert.throws(() => app.start(rt, { cwd: h.root, port, log: h.log }), (e) => e.exit === 2 && e.message.includes('this driver did not start it'))
})

test('AC-20261108-01-2 a boot command that exits non-zero, or an exec of a server that dies, with nothing tagged left fails at once with the log tail', async (t) => {
  const h = host(t)
  const port = await freePort()
  for (const boot of ['echo it died; exit 3', 'echo it exec-died; exec node -e "process.exit(1)"']) {
    const t0 = Date.now()
    assert.throws(() => app.start({ ...RT, bootCommand: boot, readySeconds: 40 }, { cwd: h.root, port, log: h.log }),
      (e) => e.exit === 1 && e.message.includes(h.log) && /it (exec-)?died/.test(e.message), boot)
    assert.ok(Date.now() - t0 < 15000, `${boot}: did not wait out readySeconds`)
  }
  assert.deepStrictEqual(reap.tagged(h.wt), [])
})

test('AC-20261108-01-4 a boot command whose leader exits 0 while its tagged server keeps serving is alive and up; ensure keeps it, stop ends it', async (t) => {
  const h = host(t)
  const port = await freePort()
  const rt = { ...RT, bootCommand: 'node app.js & exit 0' }
  const opts = { cwd: h.root, port, log: h.log }
  const rec = app.start(rt, opts)
  for (let i = 0; i < 50 && reap.running(rec.pid); i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(!reap.running(rec.pid), 'the leader exited')
  assert.ok(app.alive(rec) && app.up(rt, rec), 'its tagged server keeps the app alive')
  assert.strictEqual(app.ensure(rt, rec, opts), rec, 'an up app is kept')
  app.stop(rec)
  assert.deepStrictEqual(reap.tagged(h.wt), [])
  assert.ok(!app.alive(rec) && !(await answers(rec.url)))
})

test('AC-20261108-01-3 the env command runs once per worktree before the first boot, with PORT; a later ensure skips it; a failing one throws exit 1 and starts nothing', async (t) => {
  const h = host(t)
  const port = await freePort()
  const rt = { ...RT, envCommand: 'echo "$PORT" >> env.txt', bootCommand: 'cp env.txt saw.txt && exec node app.js' }
  const opts = { cwd: h.root, port, log: h.log }
  const rec = app.start(rt, opts)
  assert.ok(rec.envAt)
  assert.strictEqual(fs.readFileSync(path.join(h.root, 'saw.txt'), 'utf8'), `${port}\n`, 'the env command finished before the app booted')
  const again = app.ensure(rt, rec, { ...opts, restart: true })
  assert.strictEqual(again.envAt, rec.envAt)
  assert.strictEqual(fs.readFileSync(path.join(h.root, 'env.txt'), 'utf8'), `${port}\n`, 'once')
  const changed = app.ensure({ ...rt, envCommand: 'echo "$PORT changed" >> env.txt' }, again, { ...opts, restart: true })
  assert.strictEqual(fs.readFileSync(path.join(h.root, 'env.txt'), 'utf8'), `${port}\n${port} changed\n`, 'a changed envCommand runs again')
  app.stop(changed)

  const bad = host(t)
  assert.throws(() => app.start({ ...RT, envCommand: 'echo nodb >&2; exit 1' }, { cwd: bad.root, port, log: bad.log }),
    (e) => e.exit === 1 && e.message.startsWith(`envCommand failed in ${bad.wt}:`) && e.message.includes('nodb') && e.message.includes('fix runtime.envCommand in .claude/spec.config.json, then re-run'))
  assert.deepStrictEqual(reap.tagged(bad.wt), [])
})

test('AC-20261108-01-8 a foreign server on the fixed url is refused (exit 2); one a dead session left is reaped and the app boots', async (t) => {
  const h = host(t)
  const port = await freePort()
  const rt = { ...RT, url: `http://127.0.0.1:${port}`, bootCommand: `PORT=${port} node app.js` }
  const serve = (env) => {
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('other')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { cwd: h.root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] })
    t.after(() => child.kill('SIGKILL'))
    return new Promise((r) => child.stdout.once('data', () => r(child)))
  }
  // a live owner (this very session when it runs under Claude Code, or none): not ours to touch
  const live = await serve({})
  assert.throws(() => app.start(rt, { cwd: h.root, port: null, log: h.log }), (e) => e.exit === 2 && e.message.includes(`something already answers at http://127.0.0.1:${port} and this driver did not start it`))
  assert.ok(alive(live.pid), 'the foreign server was left alone')
  live.kill('SIGKILL')
  await new Promise((r) => live.once('exit', r))

  // a dead owner: the stand-in session is SIGKILLed, the server it started keeps its CLAUDE_PID
  const owner = spawn('sleep', ['300'], { stdio: 'ignore' })
  const orphan = await serve({ CLAUDE_PID: String(owner.pid) })
  owner.kill('SIGKILL')
  await new Promise((r) => owner.once('exit', r))
  const rec = app.start(rt, { cwd: h.root, port: null, log: h.log, root: h.root })
  assert.ok(!alive(orphan.pid), 'the dead session\'s server was reaped')
  assert.ok(await answers(`http://127.0.0.1:${port}`) && app.alive(rec), 'the app booted instead of refusing')
  app.stop(rec)
})

test('AC-20261108-01-2 an app the driver stopped is gone: a foreign server that then takes its fixed url is refused (exit 2) by the next start and by a restart under the same log', async (t) => {
  // graceful.js exits 0 on SIGTERM
  const h = host(t, { 'graceful.js': "process.on('SIGTERM', () => process.exit(0))\n" + SERVER })
  for (const boot of ['node app.js', 'node graceful.js', 'f() { node graceful.js; }; f', 'node app.js & exit 0']) {
    const port = await freePort()
    const rt = { ...RT, url: `http://127.0.0.1:${port}`, bootCommand: `PORT=${port}; export PORT; ${boot}` }
    const opts = { cwd: h.root, port: null, log: path.join(tmpdir('applog'), 'app.log') }
    const rec = app.start(rt, opts)
    assert.ok(await answers(rec.url), boot)
    app.stop(rec)
    assert.deepStrictEqual(reap.tagged(h.wt), [], boot)
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('other')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
    t.after(() => child.kill('SIGKILL'))
    await new Promise((r) => child.stdout.once('data', r))
    const foreign = (e) => e.exit === 2 && e.message.includes(`something already answers at http://127.0.0.1:${port} and this driver did not start it`)
    assert.throws(() => app.start(rt, opts), foreign, `${boot}: the next start`)
    assert.throws(() => app.ensure(rt, rec, { ...opts, restart: true }), foreign, `${boot}: GATE's restart`)
    assert.ok(alive(child.pid), `${boot}: the foreign server was left alone`)
    child.kill('SIGKILL')
    await new Promise((r) => child.once('exit', r))
  }
})

test('AC-20261108-01-4 a boot whose bash outlives its server (a restart loop) is stopped whole with no pid in hand: from the record a contracted prototype keeps, and from its worktree alone', async (t) => {
  const h = host(t)
  const rt = { ...RT, bootCommand: 'while true; do node app.js; sleep 0.3; done' }
  const gone = async (url) => { for (let i = 0; i < 12; i++) { if (await answers(url)) return false; await new Promise((r) => setTimeout(r, 100)) } return true }
  for (const recOf of [
    (rec) => app.recOf(h.root, { worktree: rec.wt, url: rec.url, app: null }), // status.json as `contracted` commits it
    (rec) => ({ wt: rec.wt, url: rec.url }), // nothing but the worktree's tag
  ]) {
    const port = await freePort()
    const rec = app.start(rt, { cwd: h.root, port, log: h.log, root: h.root })
    assert.ok(await answers(rec.url))
    app.stop(recOf(rec))
    assert.ok(await gone(rec.url), 'nothing answers after the stop, and the loop did not bring the server back')
    assert.ok(!reap.running(rec.pid), 'the loop shell is gone')
  }
})

test('AC-20261108-01-4 ensure treats a live pid over a url nothing answers as not up: it is stopped and started again, and up says so', async (t) => {
  const h = host(t)
  const rt = { ...RT, bootCommand: 'node app.js & exec sleep 300' } // a runner (the leader) that outlives its server
  const port = await freePort()
  const opts = { cwd: h.root, port, log: h.log }
  const rec = app.ensure(rt, null, opts)
  assert.ok(app.up(rt, rec) && app.alive(rec))
  assert.strictEqual(app.ensure(rt, rec, opts), rec, 'alive and answering: kept')
  for (const pid of reap.tagged(h.wt)) if (pid !== rec.pid) process.kill(pid, 'SIGKILL') // the server dies, the runner lives
  for (let i = 0; i < 50 && await answers(rec.url); i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(app.alive(rec) && !app.up(rt, rec), 'the pid lives, nothing answers')
  const next = app.ensure(rt, rec, opts)
  assert.notStrictEqual(next.pid, rec.pid)
  assert.ok(!alive(rec.pid), 'the unanswering runner was stopped')
  assert.ok(app.up(rt, next) && await answers(next.url))
  app.stop(next)
})
