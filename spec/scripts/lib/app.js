'use strict'
// lib/app.js — the one owner of the host's app (ADR-0049). The host declares it once in config `runtime` ({bootCommand,
// readyCheck, url, publicUrl?, envCommand?, readySeconds?, stopCommand?}); prototype.js and run.js drive it here.
//   start(rt, {cwd, port, log, root}) → rec {pid, port, url, startedAt, log, wt, envAt?}: reaps what a dead session
//     left in root, refuses a url something else answers, runs runtime.envCommand once per worktree (a changed command
//     runs again), spawns bootCommand detached in its own process group (SPEC_APP=<wt> and PORT in env), then waits for
//     the ready check. A boot command that exits 0 keeps the wait (`docker compose up -d`); once ready with nothing
//     SPEC_APP-tagged alive the server is a daemon's: the rec carries runtime.stopCommand, or start refuses.
//   ready(rt, port, cwd) · up(rt, rec) = alive and ready · alive(rec) = its leader or a tagged process lives, or
//     stopCommand is set, it is the newest record at its url and the url answers ·
//     stop(rec) (idempotent: its group, every tagged process's group, then
//     stopCommand) · stopIfAt(rec, url) · recOf(root, protoStatus) · ensure(rt, rec, {…, restart}) → rec: kept when up,
//     else restarted · portOf/stopIn/upIn/gatePins: the same for a state {app, appPort} (run.js) · tryEnsure →
//       {rec, down}
// A failure is an Error with .exit and .kind: 'foreign', 'handoff' (exit 2), 'env' (1), 'ready' (1, the app is killed).

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const host = require('./host')
const reap = require('./reap')
const state = require('./state')

const { sleepMs, real } = reap
const fail = (message, exit, kind) => Object.assign(new Error(message), { exit, kind })
const lastLines = (file, n = 20) => {
  try { return fs.readFileSync(file, 'utf8').replace(/\s+$/, '').split('\n').slice(-n).join('\n') } catch { return '' }
}

// A file in the worktree's git dir (never committed): spec-env.json, the record that runtime.envCommand ran
// ({at, command}); spec-app.json, the running app's rec (what `contracted` keeps off trunk).
const UTF8 = { encoding: 'utf8' }
const gitFile = (wt, name) => { const d = require('./git').gitDir(wt); return d && path.join(d, name) }
const envFile = (wt) => gitFile(wt, 'spec-env.json')
const recFile = (wt) => gitFile(wt, 'spec-app.json')
const envRan = (file, command) => { const r = state.readJson(file); return r && r.command === command ? r.at : null }

const BOOT_MISSING = 'no runtime.bootCommand in .claude/spec.config.json — set it to the command that starts this ' +
  'app (it serves on $PORT when runtime.url holds {port}), then re-run'
// The boot command, trimmed; null when unset or blank — never defaulted, the plugin names no language.
const bootOf = (rt) => { const c = rt && rt.bootCommand; return typeof c === 'string' && c.trim() ? c.trim() : null }

// Every ready url answers any HTTP status, or the readyCheck command (PORT in env) exits 0. Absent: [url].
function ready(rt, port, cwd) {
  const chk = rt.readyCheck
  if (typeof chk === 'string' && chk.trim()) {
    const env = port == null ? {} : { PORT: String(port) }
    return host.run(chk, { cwd, env, timeoutMs: 30000 }).status === 0
  }
  return (Array.isArray(chk) && chk.length ? chk : [rt.url]).every((u) => host.listening(host.resolveUrl(u, port)))
}

// The recorded leader still runs, is no zombie, and is ours: it carries the worktree's SPEC_APP tag, or, when the OS
// shows no environment for it (a SIP-protected binary), it began when we recorded.
function leaderAlive(rec) {
  if (!rec || !rec.pid) return false
  const i = reap.info(rec.pid)
  if (!i || i.stat.startsWith('Z')) return false
  const tag = reap.tagOf(rec.pid)
  return tag ? tag === rec.wt : Math.abs(i.started - Date.parse(rec.startedAt)) < 5000
}

// A daemon record speaks for its url only while it is the newest kept there: its own spec-app.json holds its startedAt
// and no other (the main worktree's, each linked one's) at the same url holds a later one.
function newest(rec) {
  const g = spawnSync('git', ['-C', rec.wt, 'rev-parse', '--absolute-git-dir', '--git-common-dir'], UTF8)
  if (g.status !== 0) return false
  const [dir, common] = g.stdout.split('\n').map((d) => path.resolve(rec.wt, d))
  const read = (d) => state.readJson(path.join(d, 'spec-app.json'))
  const mine = read(dir)
  const linked = path.join(common, 'worktrees')
  let dirs = []
  try { dirs = fs.readdirSync(linked).map((d) => path.join(linked, d)) } catch { /* none linked */ }
  return !!mine && mine.startedAt === rec.startedAt && ![common, ...dirs].some((d) => {
    const r = read(d)
    return r && r.url === rec.url && Date.parse(r.startedAt) > Date.parse(rec.startedAt)
  })
}

// Something of the record's runs: its leader, or a SPEC_APP-tagged process (`node app.js & exit 0` leaves only those).
const running = (rec) => leaderAlive(rec) || !!(rec && rec.wt && reap.tagged(rec.wt).length)

// Alive: it runs or, for a daemon (a rec with stopCommand), its url answers and it is the newest at it.
const alive = (rec) => running(rec) ||
  !!(rec && rec.stopCommand && rec.url && newest(rec) && host.listening(rec.url))

// The boot runs in a subshell of a wrapper that logs how it ended (`--- boot exited <n>`), so start tells a boot that
// exited non-zero from one that exited 0.
const WRAP = '(eval "$1"); echo "--- boot exited $?"'
const bootStatus = (log, from) => {
  try {
    const m = /^--- boot exited (\d+)$/m.exec(fs.readFileSync(log, 'utf8').slice(from))
    return m ? Number(m[1]) : null
  } catch { return null }
}

const up = (rt, rec) => alive(rec) && ready(rt, rec.port, rec.wt)

// TERM, 5 s, KILL: our leader's process group, every SPEC_APP-tagged process and the group of each (a group member
// macOS shows no environment for, the bash of a `while true; do node app.js; done` loop, is reached through its tagged
// child). The driver's own group is never signalled. Then the record's stopCommand in the worktree (PORT when the rec
// has one): its failure, a timeout or a url still answering is a warning on stderr, never a throw.
function stop(rec) {
  if (!rec || !(rec.pid || rec.wt)) return
  const self = (reap.info(process.pid) || {}).pgid
  const i = rec.pid && reap.info(rec.pid)
  const groups = new Set(i && !i.stat.startsWith('Z') && i.pgid === rec.pid && leaderAlive(rec) ? [rec.pid] : [])
  const find = () => {
    const tagged = rec.wt ? reap.tagged(rec.wt) : []
    for (const pid of tagged) { const g = (reap.info(pid) || {}).pgid; if (g > 1 && g !== self) groups.add(g) }
    return [...new Set([...tagged, ...reap.members([...groups])])].filter((p) => p !== process.pid)
  }
  const send = (sig, list) => {
    for (const g of groups) { try { process.kill(-g, sig) } catch { /* gone */ } }
    for (const pid of list) { try { process.kill(pid, sig) } catch { /* gone */ } }
  }
  const list = find()
  send('SIGTERM', list)
  for (const t0 = Date.now(); list.some(reap.running) && Date.now() - t0 < 5000; sleepMs(100));
  const left = [...new Set([...list, ...find()])].filter(reap.running)
  if (left.length) send('SIGKILL', left)
  if (rec.stopCommand) runStop(rec)
  const file = rec.wt && recFile(rec.wt)
  if (file) fs.rmSync(file, { force: true })
}

function runStop(rec) {
  const env = rec.port == null ? {} : { PORT: String(rec.port) }
  const r = host.run(rec.stopCommand, { cwd: rec.wt, env, timeoutMs: 60000 })
  const note = `--- runtime.stopCommand ${rec.stopCommand} exited ${r.status}\n${r.stdout}${r.stderr}`
  try { fs.appendFileSync(rec.log, note) } catch { /* no log */ }
  let up = false
  if (r.status === 0) {
    for (const t0 = Date.now(); (up = host.listening(rec.url)) && Date.now() - t0 < 5000; sleepMs(250));
  }
  if (r.status !== 0 || up) {
    process.stderr.write(`⚠️ runtime.stopCommand exited ${r.status} in ${rec.wt} — the app at ${rec.url} ` +
      `may still run; see ${rec.log}\n`)
  }
}

// The app a prototype's status names: its record; or, when `contracted` committed the status without one, the record
// kept in the worktree's git dir; else what its tag finds.
function recOf(root, status) {
  if (!status) return null
  if (status.app || !status.worktree) return status.app || null
  const wt = real(path.resolve(root, status.worktree))
  const file = recFile(wt)
  const r = file && state.readJson(file); if (r && r.wt === wt) return r
  return { wt, url: status.url }
}

// Stop rec when it is alive at url (one app per fixed url); true when it did.
function stopIfAt(rec, url) {
  if (!rec || rec.url !== url || !alive(rec)) return false
  stop(rec)
  return true
}

function start(rt, { cwd, port, log, root }) {
  const boot = bootOf(rt)
  if (!boot) throw fail(BOOT_MISSING, 2, 'config')
  const wt = real(cwd)
  reap.sweep(root || host.mainRoot(cwd))
  const url = host.resolveUrl(rt.url, port)
  const stopCmd = typeof rt.stopCommand === 'string' && rt.stopCommand.trim() ? rt.stopCommand.trim() : null
  // with stopCommand the url adopts the record: one answering before the boot is refused whatever readyCheck probes
  if (ready(rt, port, wt) || (stopCmd && host.listening(url))) {
    const remedy = stopCmd
      ? '; if an earlier boot left it running, run runtime.stopCommand where it was booted'
      : '; a boot that leaves its app running after it exits needs runtime.stopCommand'
    const msg = `something already answers at ${url} and this driver did not start it — stop it, then re-run`
    throw fail(msg + remedy, 2, 'foreign')
  }
  const env = port == null ? {} : { PORT: String(port) }
  const envCmd = typeof rt.envCommand === 'string' && rt.envCommand.trim() ? rt.envCommand.trim() : null
  const record = envCmd && envFile(wt)
  let at = record ? envRan(record, envCmd) : null
  if (envCmd && !at) {
    const r = host.run(envCmd, { cwd: wt, env })
    if (r.status !== 0) {
      const msg = `envCommand failed in ${wt}:\n${r.tail}\nfix runtime.envCommand in .claude/spec.config.json`
      throw fail(msg + ', then re-run', 1, 'env')
    }
    at = new Date().toISOString()
    if (record) fs.writeFileSync(record, JSON.stringify({ at, command: envCmd }) + '\n')
  }
  fs.mkdirSync(path.dirname(log), { recursive: true })
  fs.appendFileSync(log, `--- ${new Date().toISOString()} ${boot}\n`)
  const from = fs.statSync(log).size
  const fd = fs.openSync(log, 'a')
  let child
  try {
    const appEnv = { ...process.env, ...env, SPEC_APP: wt }
    const opts = { cwd: wt, detached: true, stdio: ['ignore', fd, fd], env: appEnv }
    child = spawn('/bin/bash', ['-c', WRAP, 'spec-app', boot], opts)
    child.on('error', () => {})
    child.unref()
  } finally { fs.closeSync(fd) }
  if (!child.pid) throw fail(`could not start the app in ${wt} — see ${log}`, 1, 'ready')
  const rec = { pid: child.pid, port: port == null ? null : port, url, startedAt: new Date().toISOString(), log, wt }
  if (at) rec.envAt = at
  if (stopCmd) rec.stopCommand = stopCmd
  const own = () => running(rec) || !!(rec.stopCommand && host.listening(url))
  const secs = Number(rt.readySeconds) > 0 ? Number(rt.readySeconds) : 60
  for (const t0 = Date.now(); ; sleepMs(500)) {
    if (ready(rt, port, wt)) {
      if (own()) { // adopted; alive needs the file written here
        const file = recFile(wt)
        if (file) fs.writeFileSync(file, JSON.stringify(rec) + '\n')
        return rec
      }
      // a stopCommand record keeps the wait (its url may answer later): the timeout stops it through the command
      if (!rec.stopCommand && bootStatus(log, from) === 0) {
        const withPort = rec.port == null ? '' : ` with PORT=${rec.port}`
        throw fail(`the boot command exited and left the app at ${url} running with no process this driver can ` +
          'stop — set runtime.stopCommand in .claude/spec.config.json to the command that stops it, run it once ' +
          `in ${wt}${withPort}, then re-run (the worktree is kept for that)`, 2, 'handoff')
      }
    }
    // the boot exited non-zero (or was killed) and left nothing behind: fail at once; one that exits 0 keeps the wait
    const gone = !own() && bootStatus(log, from) !== 0
    if (gone || Date.now() - t0 > secs * 1000) {
      stop(rec)
      const why = gone ? 'exited before it got ready' : `did not get ready in ${secs}s`
      throw fail(`the app ${why} — see ${log}\n${lastLines(log)}`, 1, 'ready')
    }
  }
}

// The recorded app when up and not `restart`; else stopped and started again (the env command only once).
function ensure(rt, rec, opts) {
  if (rec && !opts.restart && up(rt, rec)) return rec
  if (rec) stop(rec)
  return start(rt, opts)
}

// A refusal (a foreign url, the env command, no boot command) still throws.
function tryEnsure(rt, rec, opts) {
  try { return { rec: ensure(rt, rec, opts), down: null } } catch (e) {
    if (e.kind !== 'ready') throw e
    return { rec: null, down: e.message }
  }
}

// What a spec citing a prototype needs before its run opens: pin-test config, boot command, contract.
function needProto(cfg, stem, contract) {
  if (!cfg.prototype.e2eFile || !cfg.prototype.e2eCommand) {
    throw fail('a prototype spec needs prototype.e2eFile and prototype.e2eCommand in .claude/spec.config.json', 2)
  }
  if (!bootOf(cfg.runtime)) throw fail(BOOT_MISSING, 2)
  if (!contract) {
    throw fail(`no contract at design/prototypes/${stem}/contract.json — run /spec:prototype ${stem} to contract it`, 2)
  }
}

// One port per state, allocated once when the url holds {port}.
function portOf(rt, s) {
  if (s.appPort === undefined) s.appPort = /\{port\}/.test(rt.url) ? host.freePort() : null
  return s.appPort
}
function stopIn(s) { if (s.app) { stop(s.app); s.app = null } }
// The state's app up (restarted when `restart`); → why it is not, null when it is.
function upIn(rt, s, o, restart) {
  const r = tryEnsure(rt, s.app, { ...o, port: portOf(rt, s), restart })
  s.app = r.rec
  return r.down
}

// GATE's pin tests on the gated tree's app, left up for LOOK: o = {cwd, root, log, say}. The cited prototype's app is
// stopped first when it holds this app's url (say tells). → null when green, else the red tail.
function gatePins(cfg, s, o) {
  const rt = cfg.runtime
  const url = host.resolveUrl(rt.url, portOf(rt, s))
  const theirs = recOf(o.root, state.readProto(o.root, s.prototype).status)
  if (stopIfAt(theirs, url)) o.say(`stopped the prototype app at ${url}`)
  const down = upIn(rt, s, o, true)
  if (down) return `the app did not start:\n${down}`
  const file = String(cfg.prototype.e2eFile).replace(/\{stem\}/g, s.prototype)
  const cmd = String(cfg.prototype.e2eCommand).replace(/\{file\}/g, file)
  const r = host.run(cmd, { cwd: o.cwd, env: { APP_URL: s.app.url }, timeoutMs: 600000 })
  return r.status === 0 ? null : 'pin tests red:\n' + r.tail
}

module.exports = {
  start, ready, alive, up, stop, stopIfAt, ensure, recOf, bootOf,
  stopIn, upIn, gatePins, needProto,
}
