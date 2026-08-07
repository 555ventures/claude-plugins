#!/usr/bin/env node
'use strict'
// checkpoint.js — startSurfaces(opts): spawns the brief-checkpoint dev-server + tunnel
// process pair (specs/20260801/03-lane-engine.md D4, Contracts) and captures the tunnel's
// public URL off its stdout/stderr so the daemon can post it in the checkpoint message.
// Both commands run detached (new POSIX process group per command) so a multi-process
// tunnel client (e.g. cloudflared spawning helpers) is torn down as a unit, mirroring
// spec/scripts/smoke.sh's boot-leg teardown pattern.
//
// Deliberately does NOT: keep the surfaces alive past `stopAll()` (no daemon-wide process
// registry — one lane owns exactly the processes it started), retry a tunnel command that
// never prints a URL (A3 — 60s timeout resolves `tunnelUrl: null` and the checkpoint message
// says so, never blocks), or parse/validate the URL beyond "first https:// token" (cloudflared
// and tailscale funnel both print exactly one).
//
// Exit codes: n/a — library module, not a CLI entry point.

const { spawn } = require('node:child_process')
const fs = require('node:fs')

const URL_TIMEOUT_MS = 60000
const STOP_POLL_MS = 1000
const STOP_POLL_ATTEMPTS = 10

// First https:// URL on a line of output (D12/AC-9: cloudflared prints to stderr, tailscale
// funnel to stdout — this module watches both so provider choice never matters).
const URL_RE = /https:\/\/[^\s"'<>]+/

// Spawns `command` via the shell in a new detached process group (group id === child.pid on
// POSIX) so stopGroup() below can signal every descendant with one `kill(-pid, signal)`.
// A lane's `cfg.root` isn't guaranteed to exist at spawn time (e.g. mid-restructure); `spawn`
// with `shell:true` against a missing cwd fails at the /bin/sh level with no data ever hitting
// the pipes, which used to strand captureTunnelUrl() for the full 60s timeout instead of
// running the command. Falling back to the daemon's own cwd keeps the checkpoint responsive.
function spawnGroup(command, cwd, log) {
  const options = {
    shell: true,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
  if (cwd && fs.existsSync(cwd)) options.cwd = cwd
  const child = spawn(command, options)
  child.on('error', (err) => log(`checkpoint: ${command} failed to start — ${err.message}`))
  return child
}

// Checks liveness without side effects: kill(pid, 0) throws ESRCH once the process (and thus
// its group leader) is gone.
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// SIGTERM the group, poll up to STOP_POLL_ATTEMPTS * STOP_POLL_MS for exit, SIGKILL the group
// if it's still alive — the same two-phase teardown as smoke.sh's cleanup trap.
async function stopGroup(child, log) {
  if (!child || child.pid === undefined || !isAlive(child.pid)) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    log(`checkpoint: SIGTERM of group ${child.pid} failed — ${err.message}`)
  }
  for (let i = 0; i < STOP_POLL_ATTEMPTS && isAlive(child.pid); i++) {
    await sleep(STOP_POLL_MS)
  }
  if (isAlive(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (err) {
      log(`checkpoint: SIGKILL of group ${child.pid} failed — ${err.message}`)
    }
  }
}

// Races the tunnel process's combined stdout+stderr against URL_TIMEOUT_MS; resolves the
// first https:// URL seen, or null on timeout (A3) — never rejects, the checkpoint always
// has a message to post.
function captureTunnelUrl(child) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdout.removeListener('data', onData)
      child.stderr.removeListener('data', onData)
      resolve(value)
    }
    const onData = (chunk) => {
      const match = URL_RE.exec(chunk.toString('utf8'))
      if (match) finish(match[0])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => finish(null), URL_TIMEOUT_MS)
  })
}

// startSurfaces(opts) — Contracts: `{devServerCommand, tunnelCommand, cwd, log}` in,
// `{tunnelUrl, async stopAll()}` out. Either command may be omitted (a lane with no dev
// server, or no tunnel, simply gets tunnelUrl: null and nothing spawned for the missing leg).
async function startSurfaces({ devServerCommand, tunnelCommand, cwd, log }) {
  const logFn = log || (() => {})
  const children = []

  if (devServerCommand) {
    children.push(spawnGroup(devServerCommand, cwd, logFn))
  }

  let tunnelUrl = null
  if (tunnelCommand) {
    const tunnelChild = spawnGroup(tunnelCommand, cwd, logFn)
    children.push(tunnelChild)
    tunnelUrl = await captureTunnelUrl(tunnelChild)
  }

  return {
    tunnelUrl,
    async stopAll() {
      for (const child of children) {
        await stopGroup(child, logFn)
      }
    },
  }
}

module.exports = { startSurfaces }
