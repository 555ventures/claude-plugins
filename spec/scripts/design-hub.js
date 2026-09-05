#!/usr/bin/env node
// design-hub.js serve                          foreground server on `127.0.0.1:<port>`
// design-hub.js ensure                         print the base URL, spawning a detached serve if none is up
// design-hub.js register --root <r> [--name <n>]
// design-hub.js config [--base <url>]
// design-hub.js status
// design-hub.js stop open  --root <r> --kind pick|approve --key <k> --title <t>
//                          --candidates <[group/]label=path>[,…] [--question <q>]
// design-hub.js stop decide --root <r> --id <P…> --verdict pick|approve|change [--pick <g>] [--note <n>] --by <who>
// design-hub.js stop list  --root <r>
//
// WHY: specs/20260905/02-design-review-hub-and-look-stops.md D1-D5 — one long-lived, per-machine
// process mounts every registered project's atlas/mocks under /p/<name>/ (spec 01's
// createRequestHandler(root, {prefix}), reused verbatim — this file never re-implements a route),
// so the user reaches every project's look stops from one bookmark instead of a per-project
// `serve` command a session would otherwise have to hand them.
//
// State dir ($SPEC_DESIGN_HUB_HOME, default ~/.claude/design-hub/): registry.json
// {schemaVersion, port, base, projects:[{name, root, registeredAt}]}, hub.pid, hub.log.
// registry.json is always written temp-file + rename (D1). Effective port at any moment is
// $SPEC_DESIGN_HUB_PORT > registry.port > 4600; effective base is registry.base UNLESS it still
// equals the default formula for registry.port, in which case it is recomputed off the effective
// port (so an env-only port override in tests is honored without ever touching the on-disk file).
//
// What this deliberately does NOT do: write design/mocks/status.json or ledger.md (mocks-driver.js
// owns those), touch picks.json through anything but lib/mocks-picks.js, run any git command, or
// re-implement a served route design-atlas.js's createRequestHandler already owns.
//
// Exit codes:
//   0  serve ran until SIGINT/SIGTERM; ensure/register/config/status/stop printed their line;
//      stop open wrote and confirmed the stop; stop decide recorded a decision.
//   2  a usage error (missing/bad flag), a register name collision, or a stop decide refused by
//      lib/mocks-picks.js (already consumed/superseded, bad verdict, …), or ensure finding the
//      port held by something that is not this hub.
//   3  ensure/stop open could not bring up or reach a healthy hub within the window (hub.log named).

'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const { spawn } = require('child_process')
const { writeOut } = require('./lib/driver-io')
const picksLib = require('./lib/mocks-picks.js')
const { createRequestHandler } = require('./design-atlas.js')

function die(msg, code = 2) {
  writeOut(2, 'design-hub: ' + msg + '\n')
  process.exit(code)
}
function out(text) { writeOut(1, text) }

function flagArg(argv, name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : null }

// ---------------------------------------------------------------------------
// State dir + registry (D1).
// ---------------------------------------------------------------------------
function homeDir() {
  return process.env.SPEC_DESIGN_HUB_HOME || path.join(os.homedir(), '.claude', 'design-hub')
}
function registryPath(home) { return path.join(home, 'registry.json') }
function pidPath(home) { return path.join(home, 'hub.pid') }
function logPath(home) { return path.join(home, 'hub.log') }

function freshRegistry() {
  return { schemaVersion: 1, port: 4600, base: 'http://localhost:4600', projects: [] }
}

function loadRegistry(home) {
  let raw
  try {
    raw = fs.readFileSync(registryPath(home), 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return freshRegistry()
    die('registry.json is not valid JSON (' + e.message + ') — delete ' + registryPath(home) + ' (a fresh state dir is a valid starting point) and re-run')
    return null // unreachable
  }
  let parsed
  try { parsed = JSON.parse(raw) } catch (e) {
    die(registryPath(home) + ' is not valid JSON (' + e.message + ') — delete it (a fresh state dir is a valid starting point) and re-run')
    return null // unreachable
  }
  return Object.assign(freshRegistry(), parsed, { projects: Array.isArray(parsed.projects) ? parsed.projects : [] })
}

// D1: temp-file + rename, never a partial write visible to a concurrent reader.
function writeRegistry(home, registry) {
  fs.mkdirSync(home, { recursive: true })
  const p = registryPath(home)
  const tmp = p + '.tmp-' + process.pid + '-' + Date.now()
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2) + '\n')
  fs.renameSync(tmp, p)
}

function effectivePort(registry) {
  const envPort = parseInt(process.env.SPEC_DESIGN_HUB_PORT, 10)
  if (Number.isInteger(envPort) && envPort > 0) return envPort
  if (Number.isInteger(registry.port) && registry.port > 0) return registry.port
  return 4600
}

// D4: base defaults to http://localhost:<effective port> unless config --base has stored an
// origin that diverges from the DEFAULT formula for the stored port — that divergence is what
// marks base as explicitly configured (an env-only port override in a test never counts).
function effectiveBase(registry) {
  const defaultForStoredPort = 'http://localhost:' + (registry.port || 4600)
  if (registry.base && registry.base !== defaultForStoredPort) return registry.base
  return 'http://localhost:' + effectivePort(registry)
}

// Registers `realRoot` into `registry` in place (mutates registry.projects); caller persists.
// Returns {name, alreadyRegistered}. Dies (exit 2) on a basename collision with a different root.
function ensureRegistered(registry, realRoot, nameArg) {
  const existing = registry.projects.find((p) => p.root === realRoot)
  if (existing) return { name: existing.name, alreadyRegistered: true }
  const name = nameArg || path.basename(realRoot)
  const collision = registry.projects.find((p) => p.name === name)
  if (collision) {
    die('register: name "' + name + '" is already registered to ' + collision.root +
      ' — "' + realRoot + '" collides on the same basename; pass --name <n> to register it under a different name')
  }
  registry.projects.push({ name, root: realRoot, registeredAt: new Date().toISOString() })
  return { name, alreadyRegistered: false }
}

// ---------------------------------------------------------------------------
// Health probe / spawn (D2, spike A1/A2).
// ---------------------------------------------------------------------------
function getUrl(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(body) } catch { /* not json */ }
        resolve({ ok: true, status: res.statusCode, body, json })
      })
    })
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }) })
    req.on('error', () => resolve({ ok: false }))
  })
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
function probeHealth(port) { return getUrl('http://127.0.0.1:' + port + '/__hub/health') }

function spawnHubServer(home) {
  fs.mkdirSync(home, { recursive: true })
  const logFd = fs.openSync(logPath(home), 'a')
  const child = spawn(process.execPath, [__filename, 'serve'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  fs.writeFileSync(pidPath(home), String(child.pid) + '\n')
  child.unref()
  fs.closeSync(logFd)
}

async function pollHealthUntil(port, timeoutMs) {
  const start = Date.now()
  for (;;) {
    const r = await probeHealth(port)
    if (r.ok && r.status === 200 && r.json && r.json.hub === true) return true
    if (Date.now() - start >= timeoutMs) return false
    await sleep(150)
  }
}

// Resolves {port, base} once a healthy hub answers — spawning one if the port was simply down
// (A2: ECONNREFUSED, generalized here to "any connection error" per A2's fallback). Throws an
// Error tagged .hubCode 'foreign' (port answers but is not this hub) or 'timeout' (spawned but
// never became healthy) — callers translate those into their own documented exit code.
async function ensureHubUp(home, registry) {
  const port = effectivePort(registry)
  const base = effectiveBase(registry)
  const health = await probeHealth(port)
  if (health.ok && health.status === 200 && health.json && health.json.hub === true) {
    return { port, base }
  }
  if (health.ok) {
    const e = new Error('port ' + port + ' is occupied by something that is not the design hub — ' +
      'set SPEC_DESIGN_HUB_PORT to a free port, or stop whatever else is bound there')
    e.hubCode = 'foreign'
    throw e
  }
  spawnHubServer(home)
  const up = await pollHealthUntil(port, 5000)
  if (!up) {
    const e = new Error('spawned the hub but it did not answer /__hub/health within 5s — see ' + logPath(home))
    e.hubCode = 'timeout'
    throw e
  }
  return { port, base }
}

// ---------------------------------------------------------------------------
// serve — the hub's own HTTP server (D3/D4).
// ---------------------------------------------------------------------------
function inboxHtml(registry, base) {
  const openRows = []
  const decidedRows = []
  const idleRows = []
  for (const proj of registry.projects) {
    let reachable = true
    let stops = []
    try {
      fs.statSync(proj.root)
      stops = picksLib.readPicks(proj.root)
    } catch {
      reachable = false
    }
    if (!reachable) {
      idleRows.push('<li>' + esc(proj.name) + ' — <b>unreachable</b> (' + esc(proj.root) + ')</li>')
      continue
    }
    const { open, decided } = picksLib.pending(stops)
    for (const s of open) {
      openRows.push({ at: s.openedAt, html: '<li>' + esc(proj.name) + ' · <a href="' + esc(base + '/p/' + proj.name + '/atlas/index.html#stop-' + s.id) + '">' +
        esc(s.title) + '</a> · ' + esc(s.kind) + ' · opened ' + esc(s.openedAt) + '</li>' })
    }
    for (const s of decided) {
      decidedRows.push({ at: s.openedAt, html: '<li>' + esc(proj.name) + ' · <a href="' + esc(base + '/p/' + proj.name + '/atlas/index.html#stop-' + s.id) + '">' +
        esc(s.title) + '</a> · ' + esc(s.id) + '</li>' })
    }
    if (!open.length && !decided.length) {
      idleRows.push('<li>' + esc(proj.name) + ' — <a href="' + esc(base + '/p/' + proj.name + '/atlas/index.html') + '">atlas</a></li>')
    }
  }
  const byRecency = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)
  openRows.sort(byRecency)
  decidedRows.sort(byRecency)
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="refresh" content="30">' +
    '<title>design hub</title></head><body>' +
    '<h1>design hub</h1>' +
    '<h2>Waiting for your look</h2><ul>' + (openRows.map((r) => r.html).join('') || '<li>none</li>') + '</ul>' +
    '<h2>Decided — waiting for the session</h2><ul>' + (decidedRows.map((r) => r.html).join('') || '<li>none</li>') + '</ul>' +
    '<h2>Everything else</h2><ul>' + (idleRows.join('') || '<li>no registered projects</li>') + '</ul>' +
    '</body></html>\n'
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function noStore(res) { res.setHeader('cache-control', 'no-store') }

function cmdServe() {
  const home = homeDir()
  const registry = loadRegistry(home)
  const port = effectivePort(registry)
  const base = effectiveBase(registry)
  const handlersByProject = new Map()
  function handlerFor(name, root) {
    const key = name + '\x00' + root
    if (!handlersByProject.has(key)) handlersByProject.set(key, createRequestHandler(root, { prefix: '/p/' + name }))
    return handlersByProject.get(key)
  }

  const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url || '/', 'http://localhost')
    noStore(res)
    if (urlObj.pathname === '/__hub/health') {
      const freshRegistryNow = loadRegistry(home)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ hub: true, projects: freshRegistryNow.projects.length, port }))
      return
    }
    if (urlObj.pathname === '/') {
      const freshRegistryNow = loadRegistry(home)
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(inboxHtml(freshRegistryNow, base))
      return
    }
    const m = /^\/p\/([^/]+)(\/.*)?$/.exec(urlObj.pathname)
    if (m) {
      const name = m[1]
      const freshRegistryNow = loadRegistry(home)
      const proj = freshRegistryNow.projects.find((p) => p.name === name)
      if (!proj) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found: no project registered as "' + name + '"')
        return
      }
      if (!fs.existsSync(proj.root)) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found: project "' + name + '" root has vanished (' + proj.root + ')')
        return
      }
      handlerFor(name, proj.root)(req, res)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })

  server.on('error', (err) => die('serve: ' + (err && err.message || err), 3))
  server.listen(port, '127.0.0.1', () => { out('hub serving ' + base + '\n') })
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ---------------------------------------------------------------------------
// ensure / register / config / status (D1/D2).
// ---------------------------------------------------------------------------
async function cmdEnsure() {
  const home = homeDir()
  const registry = loadRegistry(home)
  writeRegistry(home, registry)
  try {
    const { base } = await ensureHubUp(home, registry)
    out(base + '\n')
    process.exit(0)
  } catch (e) {
    die(e.message, e.hubCode === 'foreign' ? 2 : 3)
  }
}

function cmdRegister(args) {
  const rootArg = flagArg(args, '--root')
  const nameArg = flagArg(args, '--name')
  if (!rootArg) die('register: --root <r> is required')
  if (!fs.existsSync(rootArg)) die('register: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  const home = homeDir()
  const registry = loadRegistry(home)
  const { name, alreadyRegistered } = ensureRegistered(registry, realRoot, nameArg)
  writeRegistry(home, registry)
  out((alreadyRegistered ? 'already registered ' : 'registered ') + name + ' → ' + realRoot + '\n')
  process.exit(0)
}

function cmdConfig(args) {
  const home = homeDir()
  const registry = loadRegistry(home)
  const baseArg = flagArg(args, '--base')
  if (args.length && baseArg == null) die('config: unknown flags — only --base <url> is supported')
  if (baseArg != null) {
    let url
    try { url = new URL(baseArg) } catch { die('config: --base "' + baseArg + '" is not a well-formed absolute URL') ; return }
    if (!/^https?:$/.test(url.protocol)) die('config: --base must be an http(s) URL')
    registry.base = url.origin
    writeRegistry(home, registry)
  }
  const port = effectivePort(registry)
  const base = effectiveBase(registry)
  out('port ' + port + ' · base ' + base + ' · ' + registry.projects.length + ' project(s)\n')
  process.exit(0)
}

async function cmdStatus() {
  const home = homeDir()
  const registry = loadRegistry(home)
  const port = effectivePort(registry)
  const base = effectiveBase(registry)
  const health = await probeHealth(port)
  const up = !!(health.ok && health.status === 200 && health.json && health.json.hub === true)
  let openCount = 0
  for (const p of registry.projects) {
    try { openCount += picksLib.pending(picksLib.readPicks(p.root)).open.length } catch { /* vanished/unreadable */ }
  }
  out('hub ' + base + ' — ' + (up ? 'up' : 'down') + ' · ' + registry.projects.length + ' project(s) · ' + openCount + ' open stop(s)\n')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// stop open / decide / list (D5).
// ---------------------------------------------------------------------------
// `[group/]label=path` per candidate, comma-separated. A pick stop requires a group on every
// candidate; an approve stop forbids one on any.
function parseCandidates(spec, kind) {
  const out2 = []
  for (const raw of spec.split(',')) {
    const eq = raw.indexOf('=')
    if (eq === -1) die('stop open: malformed --candidates entry "' + raw + '" — expected label=path or group/label=path')
    const left = raw.slice(0, eq)
    const p = raw.slice(eq + 1)
    if (!left || !p) die('stop open: malformed --candidates entry "' + raw + '" — expected label=path or group/label=path')
    const slash = left.indexOf('/')
    const group = slash === -1 ? null : left.slice(0, slash)
    const label = slash === -1 ? left : left.slice(slash + 1)
    out2.push({ group, label, path: p })
  }
  if (kind === 'pick') {
    const missing = out2.filter((c) => c.group == null)
    if (missing.length) die('stop open: every candidate needs a group on a "pick" stop (missing on ' +
      missing.map((c) => '"' + c.label + '"').join(', ') + ') — pass group/label=path')
  } else {
    const withGroup = out2.filter((c) => c.group != null)
    if (withGroup.length) die('stop open: an "approve" stop\'s candidates must carry no group (found on ' +
      withGroup.map((c) => '"' + c.label + '"').join(', ') + ')')
  }
  return out2
}

async function cmdStopOpen(args) {
  const rootArg = flagArg(args, '--root')
  const kind = flagArg(args, '--kind')
  const key = flagArg(args, '--key')
  const title = flagArg(args, '--title')
  const candidatesArg = flagArg(args, '--candidates')
  const question = flagArg(args, '--question')
  if (!rootArg) die('stop open: --root <r> is required')
  if (!kind || !['pick', 'approve'].includes(kind)) die('stop open: --kind must be "pick" or "approve"')
  if (!key) die('stop open: --key <k> is required')
  if (!title) die('stop open: --title <t> is required')
  if (!candidatesArg) die('stop open: --candidates <[group/]label=path>[,…] is required')
  const candidates = parseCandidates(candidatesArg, kind)

  if (!fs.existsSync(rootArg)) die('stop open: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  const home = homeDir()
  const registry = loadRegistry(home)
  const { name } = ensureRegistered(registry, realRoot, null)
  writeRegistry(home, registry)

  let hub
  try {
    hub = await ensureHubUp(home, registry)
  } catch (e) {
    die('stop open: ' + e.message, 3)
  }
  const { port, base } = hub

  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop open: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  let opened
  try {
    opened = picksLib.openStop(stops, { kind, key, title, question: question != null ? question : null, candidates, url: null })
  } catch (e) { die('stop open: ' + e.message) }

  const url = base + '/p/' + name + '/atlas/index.html#stop-' + opened.stop.id
  const finalStops = opened.stops.map((s) => (s.id === opened.stop.id ? Object.assign({}, s, { url }) : s))
  picksLib.writePicks(realRoot, finalStops)

  const probeUrl = 'http://127.0.0.1:' + port + '/p/' + name + '/atlas/index.html'
  const probe = await getUrl(probeUrl)
  if (!probe.ok || probe.status !== 200 || !probe.body || !probe.body.includes('id="stop-' + opened.stop.id + '"')) {
    die('stop open: probe of ' + probeUrl + ' did not confirm the new stop\'s block — see ' + logPath(home), 3)
  }
  out(url + '\n')
  process.exit(0)
}

function cmdStopDecide(args) {
  const rootArg = flagArg(args, '--root')
  const id = flagArg(args, '--id')
  const verdict = flagArg(args, '--verdict')
  const pick = flagArg(args, '--pick')
  const note = flagArg(args, '--note')
  const by = flagArg(args, '--by')
  if (!rootArg) die('stop decide: --root <r> is required')
  if (!id) die('stop decide: --id <P…> is required')
  if (!verdict) die('stop decide: --verdict pick|approve|change is required')
  if (!by) die('stop decide: --by <who> is required')
  if (!fs.existsSync(rootArg)) die('stop decide: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop decide: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  let result
  try {
    result = picksLib.decideStop(stops, id, { verdict, pick, note, by })
  } catch (e) { die('stop decide: ' + e.message) }
  picksLib.writePicks(realRoot, result.stops)
  out('decided ' + id + ' ' + verdict + '\n')
  process.exit(0)
}

function cmdStopList(args) {
  const rootArg = flagArg(args, '--root')
  if (!rootArg) die('stop list: --root <r> is required')
  if (!fs.existsSync(rootArg)) die('stop list: --root ' + rootArg + ' does not exist')
  const realRoot = fs.realpathSync(rootArg)
  let stops
  try { stops = picksLib.readPicks(realRoot) } catch (e) { die('stop list: cannot read design/mocks/picks.json under ' + realRoot + ': ' + e.message) }
  const lines = stops.filter((s) => s.status !== 'superseded')
    .map((s) => s.id + ' ' + s.status + ' ' + s.kind + ' ' + s.key + ' — ' + s.title)
  out(lines.length ? lines.join('\n') + '\n' : '')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------
async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'serve') return cmdServe()
  if (cmd === 'ensure') return cmdEnsure()
  if (cmd === 'register') return cmdRegister(rest)
  if (cmd === 'config') return cmdConfig(rest)
  if (cmd === 'status') return cmdStatus()
  if (cmd === 'stop' && rest[0] === 'open') return cmdStopOpen(rest.slice(1))
  if (cmd === 'stop' && rest[0] === 'decide') return cmdStopDecide(rest.slice(1))
  if (cmd === 'stop' && rest[0] === 'list') return cmdStopList(rest.slice(1))
  if (cmd === 'stop') die('stop: unknown subcommand "' + rest[0] + '" — one of: open, decide, list')
  die('usage: design-hub.js <serve|ensure|register|config|status|stop> …')
}

main().catch((e) => die('unexpected error: ' + (e && e.message || e)))
