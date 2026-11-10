'use strict'
// Pins spec/scripts/prototype.js: OPEN → ROUND → APPROVED → CONTRACTED → CLOSED on tmp hosts with a stub app
// the driver boots itself from config `runtime` (lib/app.js). Spec 20261105/14 (the loop) and spec 20261108/01 (the runtime).
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { tmpdir, gitRepo, runNode, freePort, killStrays, SPEC } = require('./helpers')
const reap = require(path.join(SPEC, 'scripts/lib/reap.js'))

const SCRIPT = path.join(SPEC, 'scripts/prototype.js')
const STEM = 'invoice-list-page'
// The stub app: an http server bound to $PORT.
const APP = "require('http').createServer((q, s) => s.end('app')).listen(process.env.PORT, '127.0.0.1')\n"

// A host with no src/, no index.html: only the runtime block, the pin-test pair and a stub app. `rt` overrides runtime keys,
// `proto` the prototype block (a key set to undefined is left out).
function host(extra = {}, proto = {}, rt = {}, files = {}) {
  const root = tmpdir('proto')
  fs.mkdirSync(path.join(root, '.claude'))
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ runtime: { bootCommand: 'node app.js', url: 'http://127.0.0.1:{port}', readySeconds: 20, ...rt }, prototype: { e2eFile: 'e2e/{stem}.spec.js', e2eCommand: 'node e2e.js {file}', ...proto }, ...extra }))
  fs.writeFileSync(path.join(root, 'app.js'), APP)
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text) }
  const g = gitRepo(root) // a non-empty dir is seeded and committed as it stands
  return { root, g }
}

const drive = (root, args) => runNode(SCRIPT, [...args, '--root', root])
const mark = (root, stem, verb, ...more) => drive(root, [stem, '--mark', verb, ...more])
const pin = (root, stem, ...a) => drive(root, [stem, 'pin', ...a])
const read = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
const statusOf = (root, stem = STEM) => read(root, `design/prototypes/${stem}/status.json`)
const ok = (r) => { assert.strictEqual(r.status, 0, r.stderr + r.stdout); return r.stdout }

// Every process the driver tagged for a host's worktrees; a test's apps are killed when it ends, whatever it asserted.
const tagged = (root) => { const r = fs.realpathSync(root); return reap.procs().filter((p) => p.SPEC_APP && (p.SPEC_APP === r || p.SPEC_APP.startsWith(r + path.sep))) }
const guard = (t, h) => { t.after(() => { for (const p of tagged(h.root)) { try { process.kill(p.pid, 'SIGKILL') } catch { /* gone */ } } killStrays(h.root) }); return h }
const groupGone = (pid) => { try { process.kill(-pid, 0); return false } catch (e) { return e.code === 'ESRCH' } }
const answers = (url) => fetch(url, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)

// A server some other tree runs, on a port of the test's choosing: a child process (the driver is run synchronously).
async function foreign(t, port) {
  const child = spawn(process.execPath, ['-e', `require('http').createServer((q, s) => s.end('other')).listen(${port}, '127.0.0.1', () => console.log('up'))`], { stdio: ['ignore', 'pipe', 'inherit'] })
  t.after(() => child.kill('SIGKILL'))
  await new Promise((resolve) => child.stdout.on('data', resolve))
  return { stop: () => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGKILL') }) }
}

// Idea words → OPEN (the driver boots the app) → opened. Returns the url and the port.
async function opened(t, h) {
  guard(t, h)
  ok(drive(h.root, ['invoice', 'list', 'page']))
  const st = statusOf(h.root)
  ok(mark(h.root, STEM, 'opened'))
  return { port: st.appPort, url: st.url, pid: st.app.pid }
}

// Two pins on /invoices and one on /invoices/new, then approved at round 2.
async function approved(t, h) {
  const o = await opened(t, h)
  ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices', '--given', 'an unpaid invoice', '--note', 'Delete asks for confirmation'))
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/invoices', '--note', 'Bigger title'))
  ok(mark(h.root, STEM, 'round-done'))
  ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices/new', '--note', 'Totals update live'))
  ok(mark(h.root, STEM, 'approved'))
  return o
}

test('AC-20261108-01-1 OPEN provisions the worktree (.worktreeinclude match, setup marker), boots the app itself and prints no boot line; opened starts nothing', async (t) => {
  const h = guard(t, host({ setupCommand: 'echo ready > marker.txt' }, {}, {}, { '.worktreeinclude': '.env.local\n', '.gitignore': '.claude/worktrees/\n.env.local\n' }))
  fs.writeFileSync(path.join(h.root, '.env.local'), 'SECRET=1\n')
  assert.ok(!fs.existsSync(path.join(h.root, 'src')) && !fs.existsSync(path.join(h.root, 'index.html')))
  const out = ok(drive(h.root, ['invoice', 'list', 'page']))
  assert.match(out, /^▶ OPEN/)
  assert.match(out, new RegExp(`📌 Auto-picked stem ${STEM} `))
  assert.doesNotMatch(out, /overlay|entry/i, 'no line about an entry file or overlay')
  const st = statusOf(h.root)
  assert.ok(Number.isInteger(st.appPort) && st.appPort > 0)
  assert.strictEqual(st.url, `http://127.0.0.1:${st.appPort}`)
  assert.ok(out.includes(`app up at http://127.0.0.1:${st.appPort}`), out)
  assert.doesNotMatch(out, /cd |export PORT|start the app|bootCommand/i, 'the session is never handed a boot line')
  assert.match(out, /Build a throwaway prototype of invoice list page/)
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  assert.match(h.g('branch', '--list', 'proto/' + STEM), /proto\//)
  assert.strictEqual(fs.readFileSync(path.join(wt, 'marker.txt'), 'utf8'), 'ready\n', 'setupCommand ran in the worktree')
  assert.strictEqual(fs.readFileSync(path.join(wt, '.env.local'), 'utf8'), 'SECRET=1\n', 'the .worktreeinclude match was copied')
  assert.strictEqual('pinsPort' in st, false)
  assert.ok(st.app.pid > 0 && st.app.url === st.url && st.app.port === st.appPort, JSON.stringify(st.app))
  assert.doesNotThrow(() => process.kill(st.app.pid, 0), 'app.pid is alive')
  assert.ok(await answers(st.url), 'the app answers at the url')
  assert.ok(tagged(h.root).length >= 1, 'the app carries the SPEC_APP tag')

  const before = tagged(h.root).map((p) => p.pid)
  assert.match(ok(mark(h.root, STEM, 'opened')), /OPEN → ROUND/)
  assert.deepStrictEqual(tagged(h.root).map((p) => p.pid), before, 'opened started nothing')
  assert.strictEqual(statusOf(h.root).app.pid, st.app.pid)
})

test('AC-20261108-01-1 a failing setupCommand refuses with the tail and removes the worktree it made', async (t) => {
  const h = guard(t, host({ setupCommand: 'echo boom >&2; exit 3' }))
  const r = drive(h.root, ['some', 'idea'])
  assert.strictEqual(r.status, 1)
  assert.match(r.stderr, /setupCommand failed[\s\S]*boom/)
  assert.ok(!fs.existsSync(path.join(h.root, '.claude/worktrees/proto-some-idea')), 'the re-run provisions afresh')
  assert.strictEqual(h.g('branch', '--list', 'proto/some-idea').trim(), '')
  assert.deepStrictEqual(tagged(h.root), [], 'no app was started')
})

test('AC-20261108-02-2 no runtime.bootCommand: OPEN asks for it once, makes no worktree and prints no boot line', () => {
  const h = host({}, {}, { bootCommand: undefined })
  const r = drive(h.root, ['invoice', 'list', 'page'])
  assert.strictEqual(r.status, 0, r.stdout + r.stderr)
  assert.ok(r.stdout.includes('runtime.bootCommand') && r.stdout.includes('.claude/spec.config.json'), r.stdout)
  assert.ok(!r.stdout.includes('prototype.e2eFile'), 'only what is missing is asked')
  assert.doesNotMatch(r.stdout + r.stderr, /undefined|cd \.claude/)
  assert.ok(!fs.existsSync(path.join(h.root, '.claude/worktrees')), 'no worktree is made before the command is known')
})

test('AC-20261108-01-2 two fixed-port apps from one command: OPEN prints only after both answer, appPort is null; a foreign server on the url is refused', async (t) => {
  const [a, b] = [await freePort(), await freePort()]
  const two = `const http = require('http'); const up = (p, ms) => setTimeout(() => http.createServer((q, s) => s.end('app')).listen(p, '127.0.0.1'), ms)\nup(${a}, 0); up(${b}, 1200)\n`
  const h = guard(t, host({}, {}, { url: `http://127.0.0.1:${a}`, readyCheck: [`http://127.0.0.1:${a}`, `http://127.0.0.1:${b}`], bootCommand: 'node two.js' }, { 'two.js': two }))
  const out = ok(drive(h.root, ['two', 'apps']))
  assert.match(out, /^▶ OPEN/)
  assert.ok(await answers(`http://127.0.0.1:${a}`) && await answers(`http://127.0.0.1:${b}`), 'both answered by the time OPEN printed')
  assert.ok(out.includes(`app up at http://127.0.0.1:${a}`), out)
  const st = statusOf(h.root, 'two-apps')
  assert.strictEqual(st.appPort, null)
  assert.strictEqual(st.url, `http://127.0.0.1:${a}`)

  // the apps now answer on the fixed url, and a second prototype's driver did not start them
  const second = await foreignHost(t, h)
  assert.strictEqual(second.status, 2, second.stderr)
  assert.ok(second.stderr.includes('this driver did not start it'), second.stderr)
})

// A second prototype on the same fixed url while the first one's app is up: something already answers there.
async function foreignHost(t, h) {
  const cfg = read(h.root, '.claude/spec.config.json')
  const other = host({}, {}, { url: cfg.runtime.url, readyCheck: cfg.runtime.readyCheck, bootCommand: 'node app.js' })
  guard(t, other)
  return drive(other.root, ['some', 'idea'])
}

test('AC-20261108-01-2 a ready check command is waited for; one that never passes exits 1 naming the log, leaves no process and no opened mark', async (t) => {
  let h = guard(t, host({}, {}, { readyCheck: 'test -f ready.flag', bootCommand: '(sleep 1.5; touch ready.flag) & exec node app.js' }))
  const t0 = Date.now()
  ok(drive(h.root, ['flag', 'idea']))
  assert.ok(Date.now() - t0 >= 1000, 'OPEN waited for the flag')
  assert.ok(fs.existsSync(path.join(h.root, '.claude/worktrees/proto-flag-idea/ready.flag')))

  h = guard(t, host({}, {}, { readyCheck: 'exit 1', readySeconds: 2 }))
  const r = drive(h.root, ['never', 'ready'])
  assert.strictEqual(r.status, 1, r.stderr)
  assert.match(r.stderr, /did not get ready in 2s — see \S*spec-app\S*\.log/)
  assert.deepStrictEqual(tagged(h.root), [], 'no process of the app is left')
  assert.ok(!fs.existsSync(path.join(h.root, 'design/prototypes/never-ready/status.json')), 'no marks.opened, no status')
})

test('AC-20261108-01-2 a foreign server already answering at a fixed url is refused: exit 2, nothing started', async (t) => {
  const port = await freePort()
  const other = await foreign(t, port)
  const h = guard(t, host({}, {}, { url: `http://127.0.0.1:${port}`, bootCommand: `PORT=${port} node app.js` })) // a fixed url: the app binds its own port
  const r = drive(h.root, ['some', 'idea'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(`something already answers at http://127.0.0.1:${port} and this driver did not start it`), r.stderr)
  assert.deepStrictEqual(tagged(h.root), [])
  await other.stop()
  const out = ok(drive(h.root, ['some', 'idea']))
  assert.ok(out.includes(`app up at http://127.0.0.1:${port}`), out)
  assert.strictEqual(statusOf(h.root, 'some-idea').appPort, null)
})

test('AC-20261108-01-3 runtime.envCommand runs once per worktree, before the first boot, with PORT set; a failing one refuses and removes the worktree', async (t) => {
  const h = guard(t, host({}, {}, { envCommand: 'echo "$PORT" >> env-runs.txt', bootCommand: 'cp env-runs.txt boot-saw.txt && exec node app.js' }))
  const out = ok(drive(h.root, ['env', 'idea']))
  const wt = path.join(h.root, '.claude/worktrees/proto-env-idea')
  const st = statusOf(h.root, 'env-idea')
  assert.ok(out.includes('app up at'), out)
  assert.strictEqual(fs.readFileSync(path.join(wt, 'env-runs.txt'), 'utf8'), `${st.appPort}\n`, 'PORT = appPort')
  assert.strictEqual(fs.readFileSync(path.join(wt, 'boot-saw.txt'), 'utf8'), `${st.appPort}\n`, 'the env command ran before the boot')
  assert.ok(st.app.envAt, 'the run is recorded')
  ok(mark(h.root, 'env-idea', 'opened'))
  for (let i = 0; i < 3; i++) ok(drive(h.root, ['env-idea']))
  process.kill(-statusOf(h.root, 'env-idea').app.pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.match(ok(drive(h.root, ['env-idea'])), /ready for pins/) // a restart: the env command is not run again
  assert.strictEqual(fs.readFileSync(path.join(wt, 'env-runs.txt'), 'utf8'), `${st.appPort}\n`, 'exactly once across OPEN and the ROUND re-derives')

  const bad = guard(t, host({}, {}, { envCommand: 'echo no db >&2; exit 1' }))
  const r = drive(bad.root, ['env', 'broken'])
  assert.strictEqual(r.status, 1)
  assert.ok(r.stderr.includes('runtime.envCommand') && r.stderr.includes('no db'), r.stderr)
  assert.deepStrictEqual(tagged(bad.root), [], 'no app was started')
  assert.ok(!fs.existsSync(path.join(bad.root, '.claude/worktrees/proto-env-broken')), 'the worktree it made is removed')
  assert.strictEqual(bad.g('branch', '--list', 'proto/env-broken').trim(), '')

  // a proto/<stem> branch that was there before is not this run's to delete when its OPEN fails
  const kept = guard(t, host({}, {}, { envCommand: 'exit 1' }))
  kept.g('branch', 'proto/env-kept')
  assert.strictEqual(drive(kept.root, ['env', 'kept', '--stem', 'env-kept']).status, 1)
  assert.ok(!fs.existsSync(path.join(kept.root, '.claude/worktrees/proto-env-kept')), 'the worktree it made is removed')
  assert.match(kept.g('branch', '--list', 'proto/env-kept'), /proto\/env-kept/, 'the branch that was already there stays')
})

test('AC-20261108-01-4 a dead app is restarted at the next ROUND (new pid, ready line); a restart that fails prints the warning and no ready line', async (t) => {
  const h = guard(t, host())
  const { url, pid } = await opened(t, h)
  let out = ok(drive(h.root, [STEM]))
  assert.ok(out.split('\n').some((l) => l.includes(`🎨 ready for pins — ${url}`)))
  assert.strictEqual(statusOf(h.root).app.pid, pid, 'a live app is never restarted')
  process.kill(-pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  out = ok(drive(h.root, [STEM]))
  assert.match(out, /Round 1\./)
  assert.match(out, /none yet/)
  assert.ok(out.split('\n').some((l) => l.includes(`🎨 ready for pins — ${url}`)), out)
  const next = statusOf(h.root).app.pid
  assert.notStrictEqual(next, pid, 'a new app.pid')
  assert.ok(out.includes('--kind') && out.includes('--route') && out.includes('--given') && out.includes('--note'))
  assert.match(out, /END YOUR TURN/)

  process.kill(-next, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  const cfgFile = path.join(h.root, '.claude/spec.config.json')
  const cfg = read(h.root, '.claude/spec.config.json')
  fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, runtime: { ...cfg.runtime, bootCommand: 'echo cannot start >&2; exit 1' } }))
  out = ok(drive(h.root, [STEM]))
  assert.ok(out.includes('⚠️ the app did not come up'), out)
  assert.ok(!out.includes('🎨 ready for pins'))
  assert.strictEqual(mark(h.root, STEM, 'round-done').status, 2, 'a round is not done over a dead app')
  assert.strictEqual(mark(h.root, STEM, 'approved').status, 2, 'nor approved over one')
})

test('AC-20261108-01-4 --mark closed --force over a dead app stops what is left and never boots it first', async (t) => {
  const boots = path.join(tmpdir('boots'), 'boots.txt')
  const h = host({}, {}, { bootCommand: `echo boot >> ${boots}; exec node app.js` })
  const { pid } = await opened(t, h)
  process.kill(-pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  ok(mark(h.root, STEM, 'closed', '--force'))
  assert.strictEqual(fs.readFileSync(boots, 'utf8'), 'boot\n', 'the app was booted once, at OPEN, and not again to be closed')
  assert.ok(!tagged(h.root).length)
})

test('AC-20261108-01-4 an OPEN re-derive after setup goes through the same revive: a dead app is restarted before the opened mark', async (t) => {
  const h = guard(t, host())
  ok(drive(h.root, ['invoice', 'list', 'page']))
  const { app, url } = statusOf(h.root)
  process.kill(-app.pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  const out = ok(drive(h.root, [STEM]))
  assert.ok(out.includes(`app up at ${url}`), out)
  const next = statusOf(h.root).app
  assert.notStrictEqual(next.pid, app.pid, 'a new app.pid')
  assert.ok(await answers(url), 'the restarted app answers')
  ok(mark(h.root, STEM, 'opened'))
})

test('AC-20261108-01-4 an app whose process lives but whose url nothing answers is restarted at the next ROUND: no ready line until it answers', async (t) => {
  const h = guard(t, host({}, {}, { bootCommand: 'node app.js & exec sleep 300' })) // the runner outlives its server
  const { url, pid } = await opened(t, h)
  for (const p of tagged(h.root)) if (p.pid !== pid) process.kill(p.pid, 'SIGKILL') // the server dies, the pid lives
  for (let i = 0; i < 50 && await answers(url); i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.doesNotThrow(() => process.kill(pid, 0), 'the recorded pid still lives')
  assert.ok(!(await answers(url)), 'and nothing answers')
  const out = ok(drive(h.root, [STEM]))
  assert.ok(out.split('\n').some((l) => l.includes(`🎨 ready for pins — ${url}`)), out)
  assert.ok(await answers(url), 'the restarted app answers')
  assert.notStrictEqual(statusOf(h.root).app.pid, pid, 'a new app.pid')
})

test('AC-20261108-01-4 a boot command whose leader exits while its server serves (`node app.js & exit 0`) is up: opened, ROUND and re-derives never restart it', async (t) => {
  const h = guard(t, host({}, {}, { bootCommand: 'node app.js & exit 0' }))
  const { url, pid } = await opened(t, h)
  const t0 = Date.now()
  for (let i = 0; i < 2; i++) assert.ok(ok(drive(h.root, [STEM])).split('\n').some((l) => l.includes(`🎨 ready for pins — ${url}`)))
  assert.ok(Date.now() - t0 < 15000, 'no restart loop')
  assert.strictEqual(statusOf(h.root).app.pid, pid, 'the app is never restarted')
  assert.ok(await answers(url))
})

// The daemon stub (`docker compose up -d`): the boot runs launch.js and exits 0; the server it leaves is its own session
// under a tmp dir outside the repo, with no SPEC_APP and no CLAUDE_PID, and serves after 1 s; it writes its pid to DPID.
const DAEMON = "require('fs').writeFileSync(process.env.DPID, String(process.pid))\nsetTimeout(() => { " + APP.trim() + " }, 1000)\n"
const LAUNCH = "const { spawn } = require('child_process')\nconst env = { ...process.env }\ndelete env.SPEC_APP\ndelete env.CLAUDE_PID\n" +
  "spawn(process.execPath, [require('path').join(__dirname, 'daemon.js')], { detached: true, stdio: 'ignore', cwd: require('os').tmpdir(), env }).unref()\n"
function daemonHost(t, stopCommand) {
  const dpid = path.join(tmpdir('dpid'), 'pid')
  const rt = { bootCommand: `DPID=${dpid} node launch.js` }
  if (stopCommand) rt.stopCommand = `kill $(cat ${dpid})`
  const h = guard(t, host({}, {}, rt, { 'daemon.js': DAEMON, 'launch.js': LAUNCH }))
  t.after(() => { try { process.kill(Number(fs.readFileSync(dpid, 'utf8')), 'SIGKILL') } catch { /* gone */ } })
  return { ...h, dpid }
}

test('AC-20261108-01-2 AC-20261110-01-1 a daemon boot (`docker compose up -d`) with no runtime.stopCommand is waited for, then refused at OPEN (exit 2, runtime.stopCommand named): nothing is opened or adopted; the worktree is kept and the remedy run there lets the re-run open', async (t) => {
  const h = daemonHost(t, false)
  const r = drive(h.root, ['invoice', 'list', 'page'])
  assert.strictEqual(r.status, 2, r.stderr + r.stdout)
  assert.ok(r.stderr.includes('left the app at') && r.stderr.includes('no process this driver can stop') && r.stderr.includes('runtime.stopCommand') &&
    !r.stderr.includes('did not start it'), r.stderr)
  assert.ok(!fs.existsSync(path.join(h.root, 'design/prototypes', STEM, 'status.json')), 'no status is written')
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  assert.ok(fs.existsSync(wt), 'the worktree is kept: the remedy runs there')
  assert.ok(r.stderr.includes(wt) && r.stderr.includes('with PORT=') && r.stderr.includes('then re-run (the worktree is kept for that)'), r.stderr)

  // the remedy as written: the stop command is set and run in that worktree (PORT as named), then the re-run opens
  const port = /with PORT=(\d+)/.exec(r.stderr)[1]
  const cfgFile = path.join(h.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'))
  cfg.runtime.stopCommand = `kill $(cat ${h.dpid})`
  fs.writeFileSync(cfgFile, JSON.stringify(cfg))
  const stopped = spawnSync('sh', ['-c', cfg.runtime.stopCommand], { cwd: wt, env: { ...process.env, PORT: port }, encoding: 'utf8' })
  assert.strictEqual(stopped.status, 0, stopped.stderr)
  for (let i = 0; i < 50 && await answers(`http://127.0.0.1:${port}`); i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(!(await answers(`http://127.0.0.1:${port}`)), 'the stopped daemon is gone')
  const again = drive(h.root, ['invoice', 'list', 'page'])
  assert.strictEqual(again.status, 0, again.stderr + again.stdout)
  const st = statusOf(h.root)
  assert.ok(again.stdout.includes(`app up at ${st.url}`), again.stdout)
  assert.ok(await answers(st.url), 'the re-run booted the app in the kept worktree')
})

test('AC-20261109-01-5 a prototype on a daemon host reaches ROUND; --mark closed --force runs runtime.stopCommand before the worktree goes: nothing answers at the url, the worktree is gone', async (t) => {
  const h = daemonHost(t, true)
  const { url } = await opened(t, h)
  assert.ok(await answers(url), 'the daemon runs at ROUND')
  assert.ok(ok(drive(h.root, [STEM])).includes(`🎨 ready for pins — ${url}`), 'a re-derive keeps the same daemon')
  ok(mark(h.root, STEM, 'closed', '--force'))
  for (let i = 0; i < 50 && await answers(url); i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(!(await answers(url)), 'nothing answers at the url')
  assert.ok(!fs.existsSync(path.join(h.root, '.claude/worktrees/proto-' + STEM)), 'the worktree is gone')
})

test('AC-3: pin writes the array, refuses bad input, round-done records handled', async (t) => {
  const h = host()
  await opened(t, h)
  const r = ok(pin(h.root, STEM, '--kind', 'behaviour', '--route', '/invoices', '--given', 'an unpaid invoice', '--note', 'Delete asks for confirmation'))
  assert.strictEqual(r, '📌 p1 (behaviour) On /invoices, given an unpaid invoice: Delete asks for confirmation\n')
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/invoices', '--note', 'Bigger title'))
  const pins = read(h.root, `design/prototypes/${STEM}/pins.json`)
  assert.ok(Array.isArray(pins))
  const { at: at1, ...p1 } = pins[0]
  const { at: at2, ...p2 } = pins[1]
  assert.ok(!Number.isNaN(Date.parse(at1)) && !Number.isNaN(Date.parse(at2)))
  assert.deepStrictEqual(p1, { id: 'p1', kind: 'behaviour', route: '/invoices', given: 'an unpaid invoice', note: 'Delete asks for confirmation', round: 1, status: 'active' })
  assert.deepStrictEqual(p2, { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', round: 1, status: 'active' })
  const body = ok(drive(h.root, [STEM]))
  assert.ok(body.includes('- p1 (behaviour): On /invoices, given an unpaid invoice: Delete asks for confirmation') && body.includes('- p2 (look): On /invoices: Bigger title'))

  for (const bad of [['--kind', 'nope', '--route', '/x', '--note', 'n'], ['--kind', 'look', '--route', 'invoices', '--note', 'n'],
    ['--kind', 'look', '--route', '/x?proto=empty', '--note', 'n'], ['--kind', 'look', '--route', '/x', '--note', ''],
    ['--kind', 'look', '--route', '/x', '--given', '', '--note', 'n']]) {
    const f = pin(h.root, STEM, ...bad)
    assert.strictEqual(f.status, 2, bad.join(' '))
  }
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/pins.json`).length, 2, 'refusals write nothing')

  ok(mark(h.root, STEM, 'round-done'))
  const st = statusOf(h.root)
  assert.strictEqual(st.rounds, 1)
  assert.deepStrictEqual(st.handled, ['p1', 'p2'])
  assert.match(ok(drive(h.root, [STEM])), /Round 2\.\n[^\n]*\nnone yet/)
})

test('AC-4: APPROVED prints the sentences by route; contracted needs the yes; the contract is sentences', async (t) => {
  const h = host()
  await approved(t, h)
  const out = ok(drive(h.root, [STEM]))
  assert.match(out, /▶ APPROVED/)
  assert.match(out, /\n\/invoices\n- p1 \(behaviour\): On \/invoices, given an unpaid invoice: Delete asks for confirmation\n- p2 \(look\): On \/invoices: Bigger title\n\n\/invoices\/new\n- p3 \(behaviour\): On \/invoices\/new: Totals update live\n/)
  assert.match(out, /Show the user these sentences\. On a yes: .*--mark contracted --confirmed/)
  assert.ok(!out.includes('Pictures need the app at'), 'no picture command, no picture line')
  const no = mark(h.root, STEM, 'contracted')
  assert.strictEqual(no.status, 2)
  assert.match(no.stderr, /user confirms the sentences first/)
  ok(drive(h.root, [STEM, 'drop', 'p2', '--why', 'duplicate']))
  assert.strictEqual(drive(h.root, [STEM, 'drop', 'p2', '--why', 'again']).status, 2, 'already dropped')
  const done = ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.match(done, /committed on trunk/)

  const c = read(h.root, `design/prototypes/${STEM}/contract.json`)
  assert.deepStrictEqual(Object.keys(c), ['stem', 'rounds', 'pins'])
  assert.strictEqual(c.rounds, 2)
  assert.deepStrictEqual(c.pins, [
    { id: 'p1', kind: 'behaviour', route: '/invoices', given: 'an unpaid invoice', note: 'Delete asks for confirmation', sentence: 'On /invoices, given an unpaid invoice: Delete asks for confirmation', round: 1, status: 'active' },
    { id: 'p2', kind: 'look', route: '/invoices', note: 'Bigger title', sentence: 'On /invoices: Bigger title', round: 1, status: 'dropped', why: 'duplicate' },
    { id: 'p3', kind: 'behaviour', route: '/invoices/new', note: 'Totals update live', sentence: 'On /invoices/new: Totals update live', round: 2, status: 'active' },
  ])
  assert.doesNotMatch(JSON.stringify(c), /selector|"screen"|"state"|anchor|"who"|schemaVersion|proto=/)
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `chore(proto): contract ${STEM}`)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '', 'nothing of the stem is left uncommitted')
  assert.strictEqual(h.g('show', `HEAD:design/prototypes/${STEM}/status.json`).includes('"contracted"'), true, 'the committed status carries the mark')
  const q = JSON.parse(fs.readFileSync(path.join(h.root, '.git/spec-queue.json'), 'utf8'))
  assert.deepStrictEqual(q.items.map((i) => [i.kind, i.type, i.payload]), [['prompt', 'plan', `design/prototypes/${STEM}/contract.json`]])
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'CONTRACTED')
  assert.strictEqual(mark(h.root, STEM, 'contracted', '--confirmed').status, 2, 'a second contracted is out of step')

  // drop at CONTRACTED rewrites the contract and commits it on trunk
  ok(drive(h.root, [STEM, 'drop', 'p3', '--why', 'not wanted after all']))
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/contract.json`).pins[2].status, 'dropped')
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), 'chore(proto): drop p3 — not wanted after all')
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-4: contracting with no active pin is refused; pin is refused after CONTRACTED', async (t) => {
  const h = host()
  await opened(t, h)
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'Wider'))
  ok(mark(h.root, STEM, 'approved'))
  ok(drive(h.root, [STEM, 'drop', 'p1', '--why', 'changed my mind']))
  const r = mark(h.root, STEM, 'contracted', '--confirmed')
  assert.strictEqual(r.status, 2)
  assert.match(r.stderr, /nothing to contract — drop was the last word/)
  ok(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'Narrower')) // pin is accepted at APPROVED, in the approving round
  assert.strictEqual(read(h.root, `design/prototypes/${STEM}/pins.json`)[1].round, 1)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.strictEqual(pin(h.root, STEM, '--kind', 'look', '--route', '/', '--note', 'late').status, 2)
})

test('AC-5: a rejecting pre-commit hook leaves APPROVED and prints no committed line; the re-run succeeds', async (t) => {
  const h = host()
  await approved(t, h)
  const hook = path.join(h.root, '.git/hooks/pre-commit')
  fs.writeFileSync(hook, '#!/bin/sh\necho "hook says no" >&2\nexit 1\n', { mode: 0o755 })
  const r = mark(h.root, STEM, 'contracted', '--confirmed')
  assert.notStrictEqual(r.status, 0)
  assert.match(r.stderr, /hook says no/)
  assert.ok(!r.stdout.includes('committed on trunk'))
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'APPROVED')
  assert.strictEqual(statusOf(h.root).marks.contracted, undefined)
  assert.strictEqual(h.g('status', '--porcelain', '--untracked-files=all', '--', 'design').includes('status.json'), true, 'the stem is still uncommitted')
  assert.strictEqual(h.g('diff', '--cached', '--name-only').trim(), '', 'nothing left staged')
  fs.rmSync(hook)
  assert.match(ok(mark(h.root, STEM, 'contracted', '--confirmed')), /committed on trunk/)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-5: prototype.picture writes one picture per pinned route and commits them; one failure is a warn, not a gate', async (t) => {
  const pic = path.join(tmpdir('pic'), 'pic.js')
  fs.writeFileSync(pic, "const [url, out] = process.argv.slice(2)\nif (url.endsWith('/invoices/new')) { console.error('screenshot failed'); process.exit(1) }\nrequire('fs').writeFileSync(out, 'PNG ' + url)\n")
  let h = host({}, { picture: `node ${pic} {url} {out}` })
  await approved(t, h)
  const out = ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.match(out, /⚠️ no picture for \/invoices\/new/)
  assert.match(out, /committed on trunk/)
  assert.strictEqual(fs.readFileSync(path.join(h.root, `design/prototypes/${STEM}/pictures/invoices.png`), 'utf8').startsWith('PNG http://127.0.0.1:'), true)
  assert.ok(!fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/pictures/invoices_new.png`)))
  assert.ok(h.g('ls-files', '--', `design/prototypes/${STEM}/pictures`).includes('invoices.png'))
  assert.ok(fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/contract.json`)))

  // both routes succeed: both pictures are committed
  fs.writeFileSync(pic, "require('fs').writeFileSync(process.argv[3], 'PNG')\n")
  h = host({}, { picture: `node ${pic} {url} {out}` })
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const tracked = h.g('ls-files', '--', `design/prototypes/${STEM}/pictures`)
  assert.ok(tracked.includes('pictures/invoices.png') && tracked.includes('pictures/invoices_new.png'), tracked)
})

test('AC-6: closed refuses unmerged work without --force; --force discards it and frees the stem', async (t) => {
  const h = host()
  const { pid } = await opened(t, h)
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  const tip = h.g('rev-parse', '--short', 'proto/' + STEM).trim()
  const r = mark(h.root, STEM, 'closed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('--force') && r.stderr.includes(tip), r.stderr)
  assert.ok(fs.existsSync(wt) && fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/status.json`)), 'nothing changed')
  assert.deepStrictEqual(tagged(h.root).length > 0, true, 'the refused close left the app up')
  assert.match(ok(mark(h.root, STEM, 'closed', '--force')), /prototype closed/)
  assert.ok(groupGone(pid) && !tagged(h.root).length, 'closed stopped the app')
  assert.ok(!fs.existsSync(wt))
  assert.strictEqual(h.g('branch', '--list', 'proto/' + STEM).trim(), '')
  assert.ok(!fs.existsSync(path.join(h.root, `design/prototypes/${STEM}`)))
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
  ok(drive(h.root, ['invoice', 'list', 'page'])) // the stem is free again, and boots a new app
})

test('AC-6: closed names a spec that is mid-run from this prototype', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const spec = 'specs/20261105/01-invoices.md'
  fs.mkdirSync(path.join(h.root, 'specs/20261105/01-invoices.run'), { recursive: true })
  fs.writeFileSync(path.join(h.root, spec), `---\nstatus: hardened\nprototype: ${STEM}\n---\n\n# x\n`)
  fs.writeFileSync(path.join(h.root, 'specs/20261105/01-invoices.run/state.json'), JSON.stringify({ step: 'BUILD' }))
  const r = mark(h.root, STEM, 'closed')
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes(spec), r.stderr)
  fs.rmSync(path.join(h.root, 'specs/20261105/01-invoices.run'), { recursive: true })
  assert.match(ok(mark(h.root, STEM, 'closed')), /worktree and branch removed/)
})

test('AC-6: a contracted close commits its status; a locked worktree is kept and said so', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  const wt = path.join(h.root, '.claude/worktrees/proto-' + STEM)
  h.g('worktree', 'lock', wt)
  const out = ok(mark(h.root, STEM, 'closed'))
  assert.ok(out.includes(`⚠️ worktree kept at .claude/worktrees/proto-${STEM}`) && out.includes(`git worktree remove --force .claude/worktrees/proto-${STEM}`), out)
  assert.ok(!out.includes('worktree and branch removed'))
  assert.match(out, /still pending in the queue/)
  assert.ok(h.g('branch', '--list', 'proto/' + STEM).includes('proto/'), 'the branch is kept')
  assert.strictEqual(h.g('log', '-1', '--format=%s').trim(), `chore(proto): close ${STEM}`)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
  assert.strictEqual(drive(h.root, [STEM, '--state']).stdout.trim(), 'CLOSED')
})

test('AC-6: a clean contracted close reports the removal and that the contract carries on', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  fs.writeFileSync(path.join(h.root, '.git/spec-queue.json'), JSON.stringify({ version: 3, seq: 0, items: [] }))
  const out = ok(mark(h.root, STEM, 'closed'))
  assert.match(out, /- worktree and branch removed/)
  assert.match(out, /Next: nothing needs you — the contract carries on/)
  assert.strictEqual(h.g('status', '--porcelain').trim(), '')
})

test('AC-6: a close takes its Next from the derivation: a hardened spec the queue file never held is named', async (t) => {
  const h = host()
  await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  fs.writeFileSync(path.join(h.root, '.git/spec-queue.json'), JSON.stringify({ version: 3, seq: 0, items: [] }))
  const spec = 'specs/20261108/01-unqueued.md'
  fs.mkdirSync(path.join(h.root, 'specs/20261108'), { recursive: true })
  fs.writeFileSync(path.join(h.root, spec), '---\nstatus: hardened\n---\n\n# x\n')
  h.g('add', '-A'); h.g('commit', '-q', '-m', 'lock')
  const out = ok(mark(h.root, STEM, 'closed'))
  assert.match(out, /Next: \/spec:run @specs\/20261108\/01-unqueued\.md/, out)
  assert.ok(!out.includes('nothing needs you'), out)
})

test('AC-7: idea words that auto-derive another idea\'s stem are refused', (t) => {
  const h = guard(t, host())
  ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'alpha']))
  const r = drive(h.root, ['invoice', 'list', 'page', 'redesign', 'beta'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('belongs to "invoice list page redesign alpha"') && r.stderr.includes('--stem'), r.stderr)
  assert.match(ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'alpha'])), /▶ OPEN/, 'the same words resume')
  assert.match(ok(drive(h.root, ['invoice-list-page-redesign'])), /▶ OPEN/, 'the stem resumes')
  assert.match(ok(drive(h.root, ['invoice', 'list', 'page', 'redesign', 'beta', '--stem', 'beta'])), /▶ OPEN/, '--stem is the way out')
})

test('AC-7: a v7 record stops every invocation, naming /spec:migrate', () => {
  const h = host()
  const dir = path.join(h.root, 'design/prototypes/old')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ schemaVersion: 1, stem: 'old', rounds: [], marks: { closed: 'x' } }))
  for (const args of [['old', '--state'], ['old'], ['old', '--mark', 'closed'], ['old', 'pin', '--kind', 'look', '--route', '/', '--note', 'n'], ['old', 'drop', 'p1', '--why', 'x']]) {
    const r = drive(h.root, args)
    assert.strictEqual(r.status, 2, args.join(' '))
    assert.ok(r.stderr.includes('design/prototypes/old/status.json is a v7 file — run /spec:migrate'), r.stderr)
  }
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ stem: 'old', rounds: 1, marks: {} }))
  fs.writeFileSync(path.join(dir, 'pins.json'), JSON.stringify({ schemaVersion: 1, pins: [] }))
  const r = drive(h.root, ['old', '--state'])
  assert.strictEqual(r.status, 2)
  assert.ok(r.stderr.includes('pins.json is a v7 file — run /spec:migrate'), r.stderr)
  fs.writeFileSync(path.join(dir, 'pins.json'), '[]')
  fs.writeFileSync(path.join(dir, 'contract.json'), JSON.stringify({ schemaVersion: 1, stem: 'old', pins: [] }))
  assert.ok(drive(h.root, ['old', '--state']).stderr.includes('contract.json is a v7 file'))
})

test('--stem overrides the derived stem, a bad stem is refused, the auto stem takes four significant words', (t) => {
  const { root } = guard(t, host())
  assert.match(ok(drive(root, ['some', 'idea', '--stem', 'mine'])), /▶ OPEN/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/mine/status.json')))
  assert.strictEqual(drive(root, ['x', '--stem', 'Bad Stem']).status, 2)
  assert.match(ok(drive(root, ['a', 'page', 'for', 'the', 'invoices', 'with', 'a', 'delete', 'button', 'and', 'totals'])), /Auto-picked stem page-invoices-delete-button /)
})

test('a roadmap brief path gives the stem', (t) => {
  const { root } = guard(t, host())
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/03-invoices.md'), '# 03\n')
  const out = ok(drive(root, ['docs/roadmap/03-invoices.md']))
  assert.match(out, /Build a throwaway prototype of docs\/roadmap\/03-invoices\.md/)
  assert.ok(fs.existsSync(path.join(root, 'design/prototypes/03-invoices/status.json')))
})

test('AC-16: the docs carry the new shape and none of the old', () => {
  const { ROOT } = require('./helpers')
  const files = ['docs/v8/interface-contract.md', 'docs/v8/architecture.md', 'spec/doctrine.md', 'spec/commands/prototype.md', 'spec/commands/plan.md', 'spec/commands/run.md',
    'spec/commands/migrate.md', 'README.md', fs.readdirSync(path.join(ROOT, 'docs/adr')).filter((f) => f.startsWith('0035-')).map((f) => 'docs/adr/' + f)[0]]
  assert.ok(files.every((f) => f && !f.startsWith('specs/')))
  const text = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  for (const need of ['LOOK', 'looked', 'look-failed', 'contracted --confirmed', 'closed [--force]', 'prototype:', 'e2eCommand', 'publicUrl', 'runtime', 'Amended by: ADR-0043']) {
    assert.ok(text.includes(need), need)
  }
  for (const gone of ['overlay', 'ser' + 've', 'e2eList', 'states.json', 'tests-derived', 'export PORT=<port>']) assert.ok(!text.toLowerCase().includes(gone.toLowerCase()), gone)
})

test('AC-20261108-01-4 closed stops the app before the worktree goes, with and without --force; CONTRACTED too', async (t) => {
  const out = path.join(tmpdir('order'), 'order.txt')
  // bash is the group leader and traps TERM: it records whether the worktree was still there when the stop came
  const boot = `trap 'test -d "$PWD" && echo present >> ${out}' TERM; node app.js & wait`
  let h = host({}, {}, { bootCommand: boot })
  const { pid } = await opened(t, h)
  ok(mark(h.root, STEM, 'closed', '--force'))
  assert.ok(groupGone(pid) && !tagged(h.root).length, 'no process of the app is left')
  assert.match(fs.readFileSync(out, 'utf8'), /^present\n/, 'the app was stopped while its worktree still existed')

  // a restart loop: its bash outlives each server and shows ps no environment, so only its group or its pid reach it
  h = host({}, {}, { bootCommand: 'while true; do node app.js; sleep 0.3; done' })
  const { pid: live, url } = await approved(t, h)
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.strictEqual(statusOf(h.root).app, null, 'the committed status holds no pid')
  assert.strictEqual(JSON.parse(h.g('show', `HEAD:design/prototypes/${STEM}/status.json`)).app, null)
  assert.ok(tagged(h.root).length > 0 && await answers(url), 'the app runs into CONTRACTED')
  ok(mark(h.root, STEM, 'closed'))
  await new Promise((r) => setTimeout(r, 1000)) // past the loop's 0.3 s respawn
  assert.ok(groupGone(live) && !tagged(h.root).length && !(await answers(url)), 'closed at CONTRACTED stops it too')
  assert.strictEqual(statusOf(h.root).app, null, 'status.app is cleared')
})

test('AC-20261108-01-6 a config still holding prototype.bootCommand stops --state with the migration named', () => {
  const h = host()
  const file = path.join(h.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...cfg, prototype: { bootCommand: 'node app.js' } }))
  const r = drive(h.root, ['invoice', 'list', 'page', '--state'])
  assert.strictEqual(r.status, 2, r.stdout + r.stderr)
  assert.ok(r.stderr.includes('still has prototype.bootCommand — run /spec:migrate'), r.stderr)
  assert.ok(!fs.existsSync(path.join(h.root, '.claude/worktrees')))
})

test('AC-20261108-01-7 spec/ and the v8 docs name none of the retired boot machinery; ADR-0043 is amended by ADR-0049', () => {
  const { ROOT } = require('./helpers')
  const v8 = path.join('docs', 'v8')
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) { if (rel !== path.join(v8, 'comparison')) walk(rel) } else files.push(rel) // comparison/: another project's diffs
    }
  }
  walk('spec'); walk(v8)
  const retired = ['withApp', 'allocApp', 'bootCommandOf', 'bootLine', 'export PORT=', 'appUrl', 'prototype.bootCommand']
  const hits = []
  for (const f of files) {
    if (['migrate.js', 'migrate.md'].includes(path.basename(f))) continue // the migration's own text names what it moves
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8')
    for (const w of retired) if (text.includes(w)) hits.push(`${f}: ${w}`)
  }
  assert.deepStrictEqual(hits, [])
  const adr = fs.readdirSync(path.join(ROOT, 'docs/adr')).find((f) => f.startsWith('0043-'))
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs/adr', adr), 'utf8').includes('Amended by: ADR-0049'))
})

// ---- spec 20261108/02: every mark proves its claim -----------------------------------------

const wtOf = (root, stem = STEM) => path.join(root, '.claude/worktrees/proto-' + stem)
const gitIn = (dir, ...a) => require('node:child_process').execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
const PIN = ['--kind', 'behaviour', '--route', '/invoices', '--note', 'Delete asks for confirmation']

test('AC-20261108-02-2 a host missing the pin-test pair is asked for it once at OPEN; all three missing are asked together; nothing is made and only closed is accepted', () => {
  let h = host({}, { e2eFile: undefined, e2eCommand: undefined })
  let r = drive(h.root, ['invoice', 'list', 'page'])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.match(r.stdout, /^▶ OPEN/)
  assert.ok(r.stdout.includes('prototype.e2eFile') && r.stdout.includes('prototype.e2eCommand'), r.stdout)
  assert.ok(!r.stdout.includes('runtime.bootCommand'), 'bootCommand is set: it is not asked')
  assert.ok(r.stdout.includes('The host\'s runtime is not declared yet.') && r.stdout.includes('AskUserQuestion'), r.stdout)
  assert.doesNotMatch(r.stdout, /▶ when done/, 'no mark is offered')
  assert.ok(!fs.existsSync(path.join(h.root, '.claude/worktrees')) && h.g('branch', '--list', 'proto/*').trim() === '', 'no worktree, no branch')
  assert.strictEqual(mark(h.root, STEM, 'opened').status, 2, 'only closed is accepted')
  assert.strictEqual(drive(h.root, ['invoice', 'list', 'page', '--state']).stdout.trim(), 'OPEN')
  // closed, the one mark it accepts, closes it without --force: nothing was made, so nothing is claimed removed
  const closed = mark(h.root, STEM, 'closed')
  assert.strictEqual(closed.status, 0, closed.stdout + closed.stderr)
  assert.match(closed.stdout, /prototype closed/)
  assert.doesNotMatch(closed.stdout, /removed/, 'no worktree or branch to report removed')
  assert.ok(!fs.existsSync(path.join(h.root, 'design/prototypes', STEM)) && h.g('branch', '--list', 'proto/*').trim() === '')

  h = host({}, { e2eFile: undefined }) // one of the pair set: the pair is missing
  assert.ok(drive(h.root, ['invoice', 'list', 'page']).stdout.includes('prototype.e2eFile'))

  h = host({}, { e2eFile: undefined, e2eCommand: undefined }, { bootCommand: undefined })
  r = drive(h.root, ['invoice', 'list', 'page'])
  for (const k of ['runtime.bootCommand', 'prototype.e2eFile', 'prototype.e2eCommand']) assert.ok(r.stdout.includes(k), k)
  assert.strictEqual(r.stdout.match(/Ask the user once/g).length, 1, 'one question')
})

test('AC-20261108-02-2 contracted refuses naming both keys while the pin-test pair is missing, and writes no contract', async (t) => {
  const h = host()
  await approved(t, h)
  const file = path.join(h.root, '.claude/spec.config.json')
  const cfg = read(h.root, '.claude/spec.config.json')
  fs.writeFileSync(file, JSON.stringify({ ...cfg, prototype: {} }))
  const r = mark(h.root, STEM, 'contracted', '--confirmed')
  assert.strictEqual(r.status, 2, r.stdout + r.stderr)
  assert.ok(r.stderr.includes('prototype.e2eFile') && r.stderr.includes('prototype.e2eCommand'), r.stderr)
  assert.ok(!fs.existsSync(path.join(h.root, `design/prototypes/${STEM}/contract.json`)))
  fs.writeFileSync(file, JSON.stringify(cfg))
  ok(mark(h.root, STEM, 'contracted', '--confirmed'))
})

test('AC-20261108-02-3 round-done needs a pin made this round and a committed worktree', async (t) => {
  const h = host()
  await opened(t, h)
  const none = mark(h.root, STEM, 'round-done')
  assert.strictEqual(none.status, 2)
  assert.ok(none.stderr.includes('no pin this round'), none.stderr)
  assert.deepStrictEqual([statusOf(h.root).rounds, statusOf(h.root).handled], [0, []], 'nothing moved')

  ok(pin(h.root, STEM, ...PIN))
  fs.writeFileSync(path.join(wtOf(h.root), 'wip.txt'), 'not committed\n')
  const dirty = mark(h.root, STEM, 'round-done')
  assert.strictEqual(dirty.status, 2)
  assert.ok(dirty.stderr.includes(`.claude/worktrees/proto-${STEM}`) && dirty.stderr.includes(`proto/${STEM}`), dirty.stderr)
  assert.deepStrictEqual([statusOf(h.root).rounds, statusOf(h.root).handled], [0, []], 'nothing moved')

  gitIn(wtOf(h.root), 'add', '-A'); gitIn(wtOf(h.root), 'commit', '-q', '-m', 'the ruling')
  ok(mark(h.root, STEM, 'round-done'))
  assert.deepStrictEqual([statusOf(h.root).rounds, statusOf(h.root).handled], [1, ['p1']])
  assert.strictEqual(mark(h.root, STEM, 'round-done').status, 2, 'round 2 has no pin yet')
})

test('AC-20261108-02-4 approved needs a live app, an active pin and a committed worktree', async (t) => {
  const h = host()
  const { pid } = await opened(t, h)
  const none = mark(h.root, STEM, 'approved')
  assert.strictEqual(none.status, 2)
  assert.ok(none.stderr.includes('nothing to approve'), none.stderr)

  ok(pin(h.root, STEM, ...PIN))
  process.kill(-pid, 'SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 300))
  const down = mark(h.root, STEM, 'approved')
  assert.strictEqual(down.status, 2)
  assert.ok(down.stderr.includes('the app is down'), down.stderr)
  assert.strictEqual(statusOf(h.root).marks.approved, undefined)
  assert.match(ok(drive(h.root, [STEM])), /ready for pins/, 're-running restarts it')

  fs.writeFileSync(path.join(wtOf(h.root), 'wip.txt'), 'not committed\n')
  const dirty = mark(h.root, STEM, 'approved')
  assert.strictEqual(dirty.status, 2)
  assert.ok(dirty.stderr.includes('uncommitted changes') && dirty.stderr.includes(`proto/${STEM}`) && dirty.stderr.includes('mark approved'), dirty.stderr)
  fs.rmSync(path.join(wtOf(h.root), 'wip.txt'))
  ok(mark(h.root, STEM, 'approved'))
  assert.ok(statusOf(h.root).marks.approved)
})

test('AC-20261108-02-5 CONTRACTED prints the closed mark line inside its bullet, no when-done line, and closed is still accepted', async (t) => {
  const h = host()
  await approved(t, h)
  const out = ok(mark(h.root, STEM, 'contracted', '--confirmed'))
  assert.doesNotMatch(out, /^▶ when done:/m)
  assert.match(out, /^- Worktree and branch stay until the specs built from this contract are done; then: node \S+prototype\.js \S+ --root \S+ --mark closed$/m, out)
  assert.strictEqual(out.match(/contract written/g).length, 1, 'the body is printed once')
  const again = ok(drive(h.root, [STEM]))
  assert.doesNotMatch(again, /^▶ when done:/m)
  assert.match(again, /^▶ CONTRACTED · spec /)
  assert.match(ok(mark(h.root, STEM, 'closed')), /prototype closed/)
})

test('AC-20261108-02-6 a brief path with no file is refused and creates nothing; idea words whose second word is pin open a prototype', (t) => {
  const h = guard(t, host())
  const r = drive(h.root, ['docs/roadmap/99-missing.md'])
  assert.strictEqual(r.status, 2, r.stdout)
  assert.ok(r.stderr.includes('no brief at docs/roadmap/99-missing.md'), r.stderr)
  assert.ok(!fs.existsSync(path.join(h.root, 'design')) && !fs.existsSync(path.join(h.root, '.claude/worktrees')), 'nothing was created')
  assert.match(ok(drive(h.root, ['login', 'pin'])), /Auto-picked stem login-pin /)
  assert.ok(fs.existsSync(path.join(h.root, 'design/prototypes/login-pin/status.json')))
  assert.match(ok(drive(h.root, ['login', 'drop', 'p1'])), /Auto-picked stem login-drop-p1 /)
})

test('AC-20261108-02-6 a line carrying pin or drop flags that is not a pin or drop line is refused, listing the known stems, and opens nothing', (t) => {
  const h = guard(t, host())
  const typo = drive(h.root, ['logn', 'pin', '--kind', 'look', '--route', '/', '--note', 'n'])
  assert.strictEqual(typo.status, 2, typo.stdout)
  assert.ok(typo.stderr.includes("'logn pin' is neither") && typo.stderr.includes('known prototypes: none'), typo.stderr)
  assert.ok(!fs.existsSync(path.join(h.root, 'design')) && !fs.existsSync(path.join(h.root, '.claude/worktrees')), 'nothing was created')
  ok(drive(h.root, ['login', 'pin']))
  const prototypes = () => fs.readdirSync(path.join(h.root, 'design/prototypes')).sort()
  const drop = drive(h.root, ['logn', 'drop', 'p1', '--why', 'x'])
  assert.strictEqual(drop.status, 2, drop.stdout)
  assert.ok(drop.stderr.includes("'logn drop p1' is neither") && drop.stderr.includes('known prototypes: login-pin'), drop.stderr)
  // a known stem with a mistyped pin id: still not a drop line, so it opens nothing either
  const known = drive(h.root, ['login-pin', 'drop', '1', '--why', 'x'])
  assert.strictEqual(known.status, 2, known.stdout)
  assert.ok(known.stderr.includes("'login-pin drop 1' is neither") && known.stderr.includes('known prototypes: login-pin'), known.stderr)
  assert.deepStrictEqual(prototypes(), ['login-pin'], 'no prototype was opened')
})
