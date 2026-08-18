#!/usr/bin/env node
'use strict'
// doctor.js — the mechanized answer sheet for "why is this box silent" (specs/20260810/
// 05-service-bootstrap.md D6). Every historical cause of a silent fleet box (2026-08-10
// incident: missing reposRoot, an unregistered plugin, a stale node path, no linger, no NTP)
// becomes a named, offline, one-line check here.
//
// runDoctor({fsImpl, execImpl, fetchImpl, platform, homedir}) → {ok, lines: [{name, ok, detail,
//   remedy?}]}. Checks, each independent so one run always shows the whole picture: hub.json
//   present+parseable; reposRoot exists; discovery yields >=0 repos without error (a basename
//   collision fails this line); an overrides file, if present, parses and names only discovered
//   projects — retired direct-Telegram keys and genuinely unknown keys get distinct ok:false
//   lines (specs/20260817/06-overrides-legacy-keys.md D3, mirroring config.js's loadHubConfig
//   walk so doctor and boot never tell different stories); the plugin enabled in
//   ~/.claude/settings.json (enabledPlugins +
//   extraKnownMarketplaces); Node >= the SDK's ESM floor; lock/daemon liveness; on linux,
//   additionally every serviceStatus() line (D3). Plus one network-tolerant check: GET
//   <hubUrl>/health with a 5s timeout, reporting reachability and clock skew against the
//   response's Date header — unreachable or >60s skew is a WARN, never counted toward `ok`
//   (enrollment-code TTL confusion is worth a line, but a box with no NTP yet must still pass
//   provisioning).
//
// Deliberately does NOT: mutate anything (fully offline except the one tolerant network probe),
// retry a failing check, treat the hub-reachability line's content as a pass/fail signal (it is
// always `ok: true` — warn text lives in `detail`), take or release the daemon lock (read-only
// liveness peek via `process.kill(pid, 0)`, never acquireLock/releaseLock).
//
// Exit codes: n/a — library module; autopilot/bin/autopilot renders `ok` as exit 0/1.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { discoverRepos } = require('./discover')
const { serviceStatus } = require('./service')
const { HOST_OVERRIDE_FIELDS, LEGACY_HOST_FIELDS } = require('./config')

// spec 02 D11: the Claude Agent SDK is ESM-only, needing Node >=20.19.0 for require(ESM) to
// work (session.js's lazy require('./sdk')) — same floor autopilotd itself asserts at boot.
const NODE_FLOOR = { major: 20, minor: 19 }
const NETWORK_TIMEOUT_MS = 5000
const SKEW_WARN_MS = 60000

async function runDoctor({
  fsImpl = fs,
  execImpl,
  fetchImpl = fetch,
  platform = process.platform,
  homedir = os.homedir(),
} = {}) {
  const lines = []

  const hubConfigPath = path.join(homedir, '.config', 'autopilot', 'hub.json')
  let hubJson = null
  try {
    hubJson = JSON.parse(fsImpl.readFileSync(hubConfigPath, 'utf8'))
    lines.push({ name: 'hub.json', ok: true, detail: hubConfigPath })
  } catch (err) {
    lines.push({
      name: 'hub.json',
      ok: false,
      detail: `${hubConfigPath} — ${err.code === 'ENOENT' ? 'not found' : err.message}`,
      remedy: 'autopilot enroll',
    })
  }

  const reposRoot = hubJson && hubJson.reposRoot
  let reposRootOk = false
  if (!hubJson) {
    lines.push({
      name: 'reposRoot',
      ok: false,
      detail: 'no hub.json to read reposRoot from',
      remedy: 'autopilot enroll',
    })
  } else if (!reposRoot) {
    lines.push({
      name: 'reposRoot',
      ok: false,
      detail: 'hub.json has no reposRoot',
      remedy: 'autopilot discover --repos-root <dir>',
    })
  } else if (!fsImpl.existsSync(reposRoot)) {
    lines.push({
      name: 'reposRoot',
      ok: false,
      detail: `${reposRoot} does not exist`,
      remedy: 'autopilot discover --repos-root <dir>',
    })
  } else {
    reposRootOk = true
    lines.push({ name: 'reposRoot', ok: true, detail: reposRoot })
  }

  let discovered = []
  if (reposRootOk) {
    try {
      discovered = discoverRepos({ reposRoot, fsImpl })
      lines.push({
        name: 'discovery',
        ok: true,
        detail: `${discovered.length} repo${discovered.length === 1 ? '' : 's'} under ${reposRoot}`,
      })
    } catch (err) {
      lines.push({ name: 'discovery', ok: false, detail: err.message, remedy: 'rename the colliding directory' })
    }
  } else {
    lines.push({
      name: 'discovery',
      ok: false,
      detail: 'skipped — no usable reposRoot',
      remedy: 'autopilot discover --repos-root <dir>',
    })
  }

  const overridesPath = path.join(homedir, '.config', 'autopilot', 'config.json')
  let overridesRaw = null
  try {
    overridesRaw = fsImpl.readFileSync(overridesPath, 'utf8')
  } catch {
    lines.push({ name: 'overrides file', ok: true, detail: 'not present (optional)' })
  }
  if (overridesRaw !== null) {
    let overrides = null
    try {
      overrides = JSON.parse(overridesRaw)
    } catch (err) {
      lines.push({
        name: 'overrides file',
        ok: false,
        detail: `${overridesPath} is not valid JSON — ${err.message}`,
        remedy: `fix or remove ${overridesPath}`,
      })
    }
    if (overrides) {
      const discoveredNames = new Set(discovered.map((repo) => repo.name))
      // specs/20260817/06-overrides-legacy-keys.md D3: mirror loadHubConfig's key walk —
      // `_`-prefixed keys never count toward either finding; retired direct-Telegram keys
      // get their own ok:false line (delete-them remedy), distinct from and never folded
      // into the unknown-project-key(s) line below.
      const candidateKeys = Object.keys(overrides).filter((key) => !key.startsWith('_'))
      const legacy = candidateKeys.filter((key) => LEGACY_HOST_FIELDS.includes(key))
      const unknown = candidateKeys.filter(
        (key) =>
          !HOST_OVERRIDE_FIELDS.includes(key) &&
          !LEGACY_HOST_FIELDS.includes(key) &&
          !discoveredNames.has(key)
      )
      if (legacy.length) {
        lines.push({
          name: 'overrides file',
          ok: false,
          detail: `retired direct-Telegram key(s): ${legacy.join(', ')}`,
          remedy: `delete them from ${overridesPath} — the hub-era daemon ignores them`,
        })
      } else if (unknown.length) {
        lines.push({
          name: 'overrides file',
          ok: false,
          detail: `unknown project key(s): ${unknown.join(', ')}`,
          remedy: 'autopilot discover (or fix the typo in config.json)',
        })
      } else {
        lines.push({ name: 'overrides file', ok: true, detail: overridesPath })
      }
    }
  }

  const settingsPath = path.join(homedir, '.claude', 'settings.json')
  let settings = null
  try {
    settings = JSON.parse(fsImpl.readFileSync(settingsPath, 'utf8'))
  } catch (err) {
    lines.push({
      name: 'plugin enabled',
      ok: false,
      detail: `${settingsPath} — ${err.code === 'ENOENT' ? 'not found' : 'not valid JSON'}`,
      remedy: 'autopilot bootstrap (plugin-enable step)',
    })
  }
  if (settings) {
    const marketEntry = settings.extraKnownMarketplaces && settings.extraKnownMarketplaces['555-tools']
    const marketOk = Boolean(marketEntry && marketEntry.source && marketEntry.source.source === 'directory')
    const pluginOk = Boolean(settings.enabledPlugins && settings.enabledPlugins['autopilot@555-tools'] === true)
    const ok = marketOk && pluginOk
    lines.push({
      name: 'plugin enabled',
      ok,
      detail: ok ? 'autopilot@555-tools enabled' : 'enabledPlugins/marketplace entry missing',
      ...(ok ? {} : { remedy: 'autopilot bootstrap (plugin-enable step)' }),
    })
  }

  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
  const nodeOk = nodeMajor > NODE_FLOOR.major || (nodeMajor === NODE_FLOOR.major && nodeMinor >= NODE_FLOOR.minor)
  lines.push({
    name: 'node version',
    ok: nodeOk,
    detail: process.versions.node,
    ...(nodeOk ? {} : { remedy: `upgrade Node to >=${NODE_FLOOR.major}.${NODE_FLOOR.minor}.0` }),
  })

  const stateDir = path.join(homedir, '.config', 'autopilot', 'state')
  const lockPath = path.join(stateDir, 'autopilotd.lock')
  let daemonRunning = false
  let daemonPid = null
  try {
    daemonPid = Number(fsImpl.readFileSync(lockPath, 'utf8'))
    try {
      process.kill(daemonPid, 0)
      daemonRunning = true
    } catch (err) {
      daemonRunning = err.code === 'EPERM'
    }
  } catch {
    daemonRunning = false
  }
  // Informational, never a failure on its own (D6 names it purely as "-> 'daemon running (pid
  // N)'" — a box mid-provisioning legitimately has no daemon yet; `service`/`doctor`'s linux
  // checks are what actually assert the service is installed and active).
  lines.push({
    name: 'daemon running',
    ok: true,
    detail: daemonRunning ? `daemon running (pid ${daemonPid})` : 'no live daemon holds the lock',
  })

  if (platform === 'linux') {
    try {
      const status = serviceStatus({ execImpl, fsImpl, platform })
      lines.push(...status.lines)
    } catch (err) {
      lines.push({ name: 'service', ok: false, detail: err.message, remedy: 'autopilot service install' })
    }
  }

  const hubUrl = hubJson && hubJson.hubUrl
  if (!hubUrl) {
    lines.push({ name: 'hub reachability', ok: true, detail: 'skipped — no hubUrl (no hub.json)' })
  } else {
    try {
      const response = await fetchImpl(`${hubUrl}/health`, { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) })
      let detail = `${hubUrl}/health reachable (${response.status})`
      const dateHeader = response.headers && response.headers.get && response.headers.get('date')
      if (dateHeader) {
        const skewMs = Math.abs(Date.now() - new Date(dateHeader).getTime())
        if (skewMs > SKEW_WARN_MS) {
          detail += ` — WARN clock skew ${Math.round(skewMs / 1000)}s vs hub`
        }
      }
      lines.push({ name: 'hub reachability', ok: true, detail })
    } catch (err) {
      lines.push({ name: 'hub reachability', ok: true, detail: `WARN unreachable — ${err.message}` })
    }
  }

  return { ok: lines.every((line) => line.ok), lines }
}

module.exports = { runDoctor }
