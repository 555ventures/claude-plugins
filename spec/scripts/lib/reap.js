'use strict'
// lib/reap.js — the one process reader (ADR-0049). The Claude session owns an app's life: Claude Code exports
// CLAUDE_PID to every Bash-tool child, so the driver's app inherits it (and so does a server the model starts by
// hand); lib/app.js adds SPEC_APP=<worktree realpath>. No supervisor, TTL or registry: the process table is the
// record, read on entry.
//   procs() → [{pid, CLAUDE_PID, SPEC_APP}] this uid's processes (env: macOS `ps -E`, Linux /proc/*/environ)
//   info(pid) → {stat, pgid, started} | null      running(pid)      alive and not a zombie
//   members(pgids) → the live pids in those process groups (a member ps shows no environment for is found here)
//   tagOf(pid) → the SPEC_APP one process carries      tagged(wt)   pids carrying SPEC_APP=wt
//   ownerAlive(pid)   the process is alive and is named `claude`
//   cwdUnder(pids, dir) → pids whose cwd is dir or below              kill(pids)   TERM, 5 s, KILL
//   sweep(root) → n   kills what a dead session left under root: every SPEC_APP process and every untagged one

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const LINUX = process.platform === 'linux'
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const real = (p) => { try { return fs.realpathSync.native(p) } catch { return path.resolve(p) } }
const under = (p, dir) => p === dir || p.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)
const ps = (args) => spawnSync('ps', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })

const parseEnv = (pid, text) => {
  const owner = /(?:^|[ \0])CLAUDE_PID=(\d+)(?=[ \0]|$)/.exec(text)
  const tag = /(?:^|[ \0])SPEC_APP=(.*?)(?=[ \0][A-Za-z_][A-Za-z0-9_]*=|\0|$)/.exec(text)
  return { pid, CLAUDE_PID: owner ? Number(owner[1]) : null, SPEC_APP: tag ? tag[1] : null }
}

function procs() {
  if (LINUX) {
    const out = []
    let names = []
    try { names = fs.readdirSync('/proc') } catch { return out }
    for (const n of names) {
      if (!/^\d+$/.test(n)) continue
      try { out.push(parseEnv(Number(n), fs.readFileSync(`/proc/${n}/environ`, 'utf8'))) } catch { /* not ours */ }
    }
    return out
  }
  const r = ps(['-E', '-A', '-ww', '-o', 'pid=,command='])
  if (r.status !== 0) return []
  const out = []
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s(.*)$/.exec(line)
    if (m) out.push(parseEnv(Number(m[1]), m[2]))
  }
  return out
}

// The SPEC_APP tag one process carries, or null (a process that is gone carries none).
function tagOf(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  if (LINUX) {
    try { return parseEnv(pid, fs.readFileSync(`/proc/${pid}/environ`, 'utf8')).SPEC_APP } catch { return null }
  }
  const r = ps(['-E', '-ww', '-o', 'command=', '-p', String(pid)])
  return r.status === 0 && r.stdout.trim() ? parseEnv(pid, r.stdout.trim()).SPEC_APP : null
}

// stat, process group and start time (ms) of one pid; null when it is gone.
function info(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const r = ps(['-o', 'stat=,pgid=,lstart=', '-p', String(pid)])
  const m = r.status === 0 && /^\s*(\S+)\s+(\d+)\s+(.+?)\s*$/.exec(r.stdout)
  return m ? { stat: m[1], pgid: Number(m[2]), started: Date.parse(m[3]) } : null
}

const running = (pid) => { const i = info(pid); return !!i && !i.stat.startsWith('Z') }

function members(pgids) {
  const want = new Set(pgids.filter((g) => Number.isInteger(g) && g > 1))
  if (!want.size) return []
  const out = []
  for (const l of String(ps(['-A', '-o', 'pid=,pgid=,stat=']).stdout || '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)/.exec(l)
    if (m && want.has(Number(m[2])) && !m[3].startsWith('Z')) out.push(Number(m[1]))
  }
  return out
}

const baseName = (w) => path.basename(String(w || ''))
// A process that signal 0 reaches is an owner when it is named claude. When ps cannot say (it fails, or prints
// nothing for a running pid) the owner counts as alive: the sweep never kills on a guess.
function ownerAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false
  try { process.kill(pid, 0) } catch (e) { if (e.code !== 'EPERM') return false }
  const q = (o) => { const r = ps(['-o', o + '=', '-p', String(pid)]); return r.status === 0 ? r.stdout.trim() : '' }
  const [stat, name, cmd] = [q('stat'), q('comm'), q('command')]
  if (!name && !cmd) return true
  if (stat.startsWith('Z')) return false
  return [name, ...cmd.split(/\s+/).slice(0, 2)].some((w) => /^claude(\.exe)?$/.test(baseName(w)))
}

const tagged = (wt) => { const dir = real(wt); return procs().filter((p) => p.SPEC_APP === dir).map((p) => p.pid) }

function cwdUnder(pids, dir) {
  if (!pids.length) return []
  const root = real(dir)
  const cwds = new Map()
  if (LINUX) {
    for (const pid of pids) { try { cwds.set(pid, fs.readlinkSync(`/proc/${pid}/cwd`)) } catch { /* gone */ } }
  } else {
    const args = ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]
    const r = spawnSync('lsof', args, { encoding: 'utf8', maxBuffer: 1 << 26 })
    let cur = null
    for (const l of String(r.stdout || '').split('\n')) {
      if (l[0] === 'p') cur = Number(l.slice(1)); else if (l[0] === 'n' && cur != null) cwds.set(cur, l.slice(1))
    }
  }
  return pids.filter((pid) => cwds.has(pid) && under(real(cwds.get(pid)), root))
}

const signal = (pids, sig) => { for (const pid of pids) { try { process.kill(pid, sig) } catch { /* gone */ } } }

function kill(pids) {
  const list = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 1 && p !== process.pid)
  if (!list.length) return 0
  signal(list, 'SIGTERM')
  for (const t0 = Date.now(); Date.now() - t0 < 5000 && list.some(running); sleepMs(100));
  signal(list.filter(running), 'SIGKILL')
  return list.length
}

// This process and every ancestor of it, from one process-table read.
function lineage() {
  const parent = new Map()
  for (const l of String(ps(['-A', '-o', 'pid=,ppid=']).stdout || '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(l)
    if (m) parent.set(Number(m[1]), Number(m[2]))
  }
  const out = new Set([process.pid])
  for (let p = parent.get(process.pid); p > 1 && !out.has(p); p = parent.get(p)) out.add(p)
  return out
}

// Among processes whose CLAUDE_PID owner is dead: every one tagged SPEC_APP with a path under root, and every untagged
// one whose cwd is under root. Never touched: this process and its ancestors, anything carrying this driver's own
// CLAUDE_PID, a live owner's process, a process with no owner recorded, and anything tagged or running outside root.
function sweep(root) {
  const dir = real(root)
  const self = lineage()
  const mine = Number(process.env.CLAUDE_PID) || null
  const owners = new Map()
  const dead = (pid) => { if (!owners.has(pid)) owners.set(pid, !ownerAlive(pid)); return owners.get(pid) }
  const orphans = procs().filter((p) => !self.has(p.pid) && p.CLAUDE_PID != null && p.CLAUDE_PID !== mine &&
    dead(p.CLAUDE_PID))
  const tags = orphans.filter((p) => p.SPEC_APP && under(real(p.SPEC_APP), dir)).map((p) => p.pid)
  const here = cwdUnder(orphans.filter((p) => !p.SPEC_APP).map((p) => p.pid), dir)
  return kill([...tags, ...here])
}

module.exports = { procs, tagOf, info, running, members, ownerAlive, tagged, cwdUnder, kill, sweep }
