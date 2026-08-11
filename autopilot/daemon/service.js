#!/usr/bin/env node
'use strict'
// service.js — systemd --user unit generation + install/uninstall/status/logs so autopilotd
// survives a reboot (specs/20260810/05-service-bootstrap.md D1-D4). systemd --user only: the
// mini-PC fleet is Linux, and building launchd now for JJ's one darwin box (which runs
// interactive sessions anyway) is real surface for zero fleet value (D1, recorded deferral).
//
// renderUnit({nodePath, daemonPath, pathEnv}): pure, byte-pinned unit-file text (D2).
// installService({execImpl, fsImpl, platform, env}): write unit atomically → `systemctl --user
//   daemon-reload` → `systemctl --user enable --now autopilot` → `loginctl enable-linger <user>`
//   (D3). uninstallService({execImpl, fsImpl, platform}): `disable --now` + remove unit +
//   daemon-reload (linger left on — it's a one-time, harmless-if-orphaned grant). serviceStatus
//   ({execImpl, fsImpl, platform}): unit-file presence + is-active + linger + baked-node-path
//   existence, each its own line so one run shows the whole picture (D3). serviceLogs
//   ({platform, spawnImpl}): `journalctl --user -u autopilot -f` passthrough — stdio inherit,
//   forwards the child's exit code; never parses journal output (drift risk against journalctl's
//   format, adversarial note honored from planning).
//
// All systemd/loginctl calls go through an injected execImpl (execFileSync-shaped, D4) — no
// real systemd exists in CI or on JJ's darwin dev box, so unit generation is pinned byte-exactly
// and orchestration is pinned via recorded calls instead.
//
// Deliberately does NOT: support launchd or any non-systemd backend (D1 — every verb refuses on
// non-linux with the tmux/deferral remedy), retry a failed systemctl/loginctl call, parse
// journalctl's stream (serviceLogs is a pure passthrough), or hand-edit an already-installed
// unit (regenerate + reinstall is the only sanctioned path, A6).
//
// Exit codes: n/a — library module; ServiceError.exitCode carries the intended exit (1 = exec
// failure mid-sequence, 2 = non-linux platform); autopilot/bin/autopilot owns rendering.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const UNIT_PATH = path.join(os.homedir(), '.config', 'systemd', 'user', 'autopilot.service')
const SERVICE_UNIT = 'autopilot'

class ServiceError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.exitCode = exitCode
  }
}

// D1: every `service` verb refuses on non-linux, naming tmux + the launchd deferral.
function assertLinux(platform, verb) {
  if (platform !== 'linux') {
    throw new ServiceError(
      `autopilot service ${verb}: systemd --user is Linux-only — run \`autopilotd\` in tmux ` +
      `(launchd support is a recorded deferral, brief 03)`,
      2
    )
  }
}

// D2: byte-pinned unit content. StartLimitIntervalSec=0 lives in [Unit] (moved from [Service]
// in systemd 230) — a crash-looping unit without it flips permanently `failed`, another flavor
// of the silence this brief exists to kill.
function renderUnit({ nodePath, daemonPath, pathEnv }) {
  return (
    `[Unit]\n` +
    `Description=autopilot spoke daemon\n` +
    `StartLimitIntervalSec=0\n` +
    `\n` +
    `[Service]\n` +
    `ExecStart=${nodePath} ${daemonPath}\n` +
    `Restart=always\n` +
    `RestartSec=30\n` +
    `Environment=PATH=${pathEnv}\n` +
    `\n` +
    `[Install]\n` +
    `WantedBy=default.target\n`
  )
}

// Same-dir temp file then rename — no partial unit file ever visible to systemd (enroll.js's
// writeConfigAtomic precedent).
function writeUnitAtomic(fsImpl, unitPath, content) {
  const dir = path.dirname(unitPath)
  fsImpl.mkdirSync(dir, { recursive: true })
  const tempPath = path.join(dir, `.autopilot.service.${process.pid}.${Date.now()}.tmp`)
  fsImpl.writeFileSync(tempPath, content)
  fsImpl.renameSync(tempPath, unitPath)
}

function runCmd(execImpl, verb, cmd, args) {
  try {
    return execImpl(cmd, args)
  } catch (err) {
    const stderr = err && err.stderr ? err.stderr.toString() : err.message
    throw new ServiceError(
      `autopilot service ${verb}: \`${cmd} ${args.join(' ')}\` failed — ${stderr}`,
      1
    )
  }
}

// D3 install sequence. nodePath bakes process.execPath (the service PATH is not the shell
// PATH); pathEnv snapshots the installing shell's $PATH so spawned git/npm/gates/cloudflared
// resolve the same way they do interactively.
function installService({ execImpl, fsImpl = fs, platform = process.platform, env = process.env }) {
  assertLinux(platform, 'install')

  const nodePath = process.execPath
  const daemonPath = path.resolve(__dirname, '..', 'bin', 'autopilotd')
  const unitContent = renderUnit({ nodePath, daemonPath, pathEnv: env.PATH || '' })
  writeUnitAtomic(fsImpl, UNIT_PATH, unitContent)

  runCmd(execImpl, 'install', 'systemctl', ['--user', 'daemon-reload'])
  runCmd(execImpl, 'install', 'systemctl', ['--user', 'enable', '--now', SERVICE_UNIT])
  const username = os.userInfo().username
  runCmd(execImpl, 'install', 'loginctl', ['enable-linger', username])

  return { unitPath: UNIT_PATH }
}

// D3 uninstall sequence — linger is left on (a one-time, harmless-if-orphaned per-user grant).
function uninstallService({ execImpl, fsImpl = fs, platform = process.platform }) {
  assertLinux(platform, 'uninstall')

  runCmd(execImpl, 'uninstall', 'systemctl', ['--user', 'disable', '--now', SERVICE_UNIT])
  fsImpl.unlinkSync(UNIT_PATH)
  runCmd(execImpl, 'uninstall', 'systemctl', ['--user', 'daemon-reload'])
}

// D3 status: each check runs even when an earlier one fails (Behavior — one run must show the
// whole picture, e.g. missing linger AND a moved node in the same pass).
function serviceStatus({ execImpl, fsImpl = fs, platform = process.platform }) {
  assertLinux(platform, 'status')

  const lines = []

  const unitExists = fsImpl.existsSync(UNIT_PATH)
  lines.push({
    name: 'unit file',
    ok: unitExists,
    detail: unitExists ? UNIT_PATH : `${UNIT_PATH} not found`,
    ...(unitExists ? {} : { remedy: 'autopilot service install' }),
  })

  let activeState
  try {
    activeState = execImpl('systemctl', ['--user', 'is-active', SERVICE_UNIT]).toString().trim()
  } catch (err) {
    activeState = err && err.stdout ? err.stdout.toString().trim() : 'inactive'
  }
  const isActive = activeState === 'active'
  lines.push({
    name: 'service active',
    ok: isActive,
    detail: activeState,
    ...(isActive ? {} : { remedy: 'autopilot service install' }),
  })

  const username = os.userInfo().username
  let lingerState
  try {
    lingerState = execImpl('loginctl', ['show-user', username, '-p', 'Linger']).toString().trim()
  } catch (err) {
    lingerState = err && err.stdout ? err.stdout.toString().trim() : ''
  }
  const lingerOn = /Linger=yes/i.test(lingerState)
  lines.push({
    name: 'linger',
    ok: lingerOn,
    detail: lingerState || 'unknown',
    ...(lingerOn ? {} : { remedy: `loginctl enable-linger ${username}` }),
  })

  // A moved node (nvm/brew upgrade) is detected here by re-reading the baked ExecStart line
  // rather than re-deriving process.execPath — a live daemon's unit may bake a now-stale path.
  let nodePath = null
  if (unitExists) {
    try {
      const content = fsImpl.readFileSync(UNIT_PATH, 'utf8')
      const match = content.match(/^ExecStart=(\S+)\s+/m)
      nodePath = match ? match[1] : null
    } catch {
      nodePath = null
    }
  }
  const nodePathOk = Boolean(nodePath) && fsImpl.existsSync(nodePath)
  lines.push({
    name: 'baked node path',
    ok: nodePathOk,
    detail: nodePath || 'unavailable (no unit file)',
    ...(nodePathOk ? {} : { remedy: 're-run autopilot service install' }),
  })

  return { ok: lines.every((line) => line.ok), lines }
}

// Passthrough, not a re-implementation (Behavior) — spawn with stdio inherit, forward the
// child's exit code as this process's exit code. Never parses journalctl's stream.
function serviceLogs({ platform = process.platform, spawnImpl = spawn }) {
  assertLinux(platform, 'logs')
  const child = spawnImpl('journalctl', ['--user', '-u', SERVICE_UNIT, '-f'], { stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code === null ? 1 : code))
}

module.exports = {
  renderUnit,
  installService,
  uninstallService,
  serviceStatus,
  serviceLogs,
  ServiceError,
  UNIT_PATH,
}
