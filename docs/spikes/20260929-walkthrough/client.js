'use strict'
// client.js — throwaway draft of the plugin's walkthrough client
// (docs/roadmap/29-walkthrough-integration.md scope 1): four calls over the built-in fetch,
// API version pinned here, base URL and project from the host config's `walkthrough` block,
// the token from the env var that block names. Every pull lands as a file under
// design/rounds/<n>/ so git stays the ledger.
// What this deliberately does NOT do: retry, cache, or talk to the service when the host
// declares no `walkthrough` block — an undeclared host gets { skipped: true } and no request.
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')

const API_VERSION = 1
const TIMEOUT_MS = 10000

class WalkthroughError extends Error {
  constructor(code, message, remedy) {
    super(message)
    this.code = code
    this.remedy = remedy
  }
}

// null = this host does not use the service.
function loadConfig(root) {
  const file = path.join(root, '.claude/spec.config.json')
  if (!fs.existsSync(file)) return null
  const block = JSON.parse(fs.readFileSync(file, 'utf8')).walkthrough
  if (!block) return null
  for (const key of ['baseUrl', 'project', 'tokenEnv']) {
    if (typeof block[key] !== 'string' || !block[key]) {
      throw new WalkthroughError('bad-config', 'walkthrough.' + key + ' is missing in .claude/spec.config.json',
        'declare walkthrough.{baseUrl,project,tokenEnv}, or delete the block to run without the service')
    }
  }
  const token = process.env[block.tokenEnv]
  if (!token) {
    throw new WalkthroughError('no-token', 'the env var ' + block.tokenEnv + ' is empty',
      'export ' + block.tokenEnv + '=<token from the service>')
  }
  return { baseUrl: block.baseUrl.replace(/\/$/, ''), project: block.project, token }
}

async function call(cfg, method, route, body, contentType) {
  const url = cfg.baseUrl + '/v' + API_VERSION + '/projects/' + encodeURIComponent(cfg.project) + route
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, {
      method,
      headers: { authorization: 'Bearer ' + cfg.token, ...(body ? { 'content-type': contentType || 'application/json' } : {}) },
      body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
      signal: ctl.signal,
    })
  } catch (e) {
    throw new WalkthroughError('unreachable', 'the service at ' + cfg.baseUrl + ' did not answer (' + (e.cause && e.cause.code || e.name) + ')',
      'start the service, or check walkthrough.baseUrl')
  } finally {
    clearTimeout(timer)
  }
  let parsed = null
  try { parsed = await res.json() } catch (e) { /* non-JSON body handled below */ }
  if (!res.ok) {
    const error = parsed && parsed.error || 'http-' + res.status
    const remedy = error === 'unknown-api-version'
      ? 'the service does not speak v' + API_VERSION + ' — update the plugin or the service so both pin one version'
      : error === 'bad-token' ? 'the token was refused — re-issue it in the service'
        : 'read the detail and fix the round before pushing again'
    throw new WalkthroughError(error, method + ' ' + route + ' refused: ' + error + (parsed && parsed.detail ? ' (' + (typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)) + ')' : ''), remedy)
  }
  if (!parsed) throw new WalkthroughError('not-json', method + ' ' + route + ' answered without JSON', 'check walkthrough.baseUrl points at the service')
  return parsed
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}
function roundDir(root, n) {
  return path.join(root, 'design/rounds', String(n))
}
function nextRound(root) {
  let names = []
  try { names = fs.readdirSync(path.join(root, 'design/rounds')) } catch (e) { names = [] }
  const taken = names.filter((n) => /^\d+$/.test(n)).map(Number)
  return taken.length ? Math.max(...taken) + 1 : 1
}

// round = { kind: 'wireframe', journeys, screens: [{name, state?, spec}] }
//       | { kind: 'screenshots', journeys?, screens: [{name, state?, width, file}] }
async function pushRound(root, round) {
  const cfg = loadConfig(root)
  if (!cfg) return { skipped: true }
  const screens = round.screens.map((s) => round.kind === 'wireframe'
    ? { name: s.name, state: s.state || 'default', spec: s.spec }
    : { name: s.name, state: s.state || 'default', width: s.width })
  // The plugin owns the round number: one past the highest folder git already holds, so a
  // service whose data was reset can never make a pull overwrite an earlier round.
  const made = await call(cfg, 'POST', '/rounds', {
    round: nextRound(root), kind: round.kind, journeys: round.journeys || [], screens,
  })
  if (round.kind === 'screenshots') {
    for (const s of round.screens) {
      const key = s.name + '--' + (s.state || 'default') + (s.width ? '--' + s.width : '')
      await call(cfg, 'PUT', '/rounds/' + made.round + '/images/' + encodeURIComponent(key), fs.readFileSync(s.file), 'image/png')
    }
  }
  writeJson(path.join(roundDir(root, made.round), 'round.json'), {
    apiVersion: API_VERSION, round: made.round, kind: round.kind, pushedAt: new Date().toISOString(),
    journeys: (round.journeys || []).map((j) => ({ id: j.id, beats: j.beats })),
    screens: screens.map((s) => ({ name: s.name, state: s.state, width: s.width || null })),
  })
  return { skipped: false, round: made.round }
}

async function pullNotes(root, n) {
  const cfg = loadConfig(root)
  if (!cfg) return { skipped: true }
  const got = await call(cfg, 'GET', '/notes?round=' + n)
  writeJson(path.join(roundDir(root, n), 'notes.json'), { apiVersion: API_VERSION, round: n, notes: got.notes })
  return { skipped: false, notes: got.notes }
}

async function pullApprovals(root, n) {
  const cfg = loadConfig(root)
  if (!cfg) return { skipped: true }
  const got = await call(cfg, 'GET', '/approvals')
  writeJson(path.join(roundDir(root, n), 'approvals.json'), { apiVersion: API_VERSION, round: n, approvals: got.approvals })
  return { skipped: false, approvals: got.approvals }
}

// The fifth call the spike found missing: without it the client never sees an answer.
async function replyNote(root, id, text) {
  const cfg = loadConfig(root)
  if (!cfg) return { skipped: true }
  const got = await call(cfg, 'POST', '/notes/' + encodeURIComponent(id) + '/reply', { text })
  return { skipped: false, status: got.status }
}

async function markRound(root, n, status) {
  const cfg = loadConfig(root)
  if (!cfg) return { skipped: true }
  const got = await call(cfg, 'POST', '/rounds/' + n + '/mark', { status })
  return { skipped: false, status: got.status }
}

module.exports = { API_VERSION, WalkthroughError, loadConfig, pushRound, pullNotes, pullApprovals, replyNote, markRound }
