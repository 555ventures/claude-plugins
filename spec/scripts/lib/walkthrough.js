'use strict'
// lib/walkthrough.js — calls to the hosted review service (apiVersion 1, revision >= 2) and the
// round files they write under design/rounds/<n>/. No CLI.
//
//   const c = openContext(root, process.env)      // null when config.walkthrough.baseUrl is unset
//   await probe(c) | push(c, round) | pullNotes(c) | pullApprovals(c) | reply(c, note, text) | mark(c, n, status)
//
// Rules: no request without baseUrl + project + a token (stored in .claude/settings.local.json env
// first, else process env); baseUrl must be https or loopback http; redirects are refused; the token
// rides one header and is scrubbed from every message; 429 with Retry-After <= 60 s is retried
// twice. Failures throw Refusal {code, sentence, remedy, exit}: 1 service refused · 2 config or
// usage · 3 service did not answer.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { readConfig, readJson, writeJson } = require('./state')

const API_VERSION = 1
const REVISION = 2
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const NAME_RE = /^(?!.*--)[A-Za-z0-9_.-]{1,80}$/
const CALLS = {
  hello: ['GET', '/v1', false],
  pushRound: ['POST', '/v1/projects/{project}/rounds'],
  pullNotes: ['GET', '/v1/projects/{project}/notes'],
  replyNote: ['POST', '/v1/projects/{project}/notes/{note}/reply'],
  pullApprovals: ['GET', '/v1/projects/{project}/approvals'],
  markRound: ['POST', '/v1/projects/{project}/rounds/{round}/mark'],
}
const REMEDY = {
  'bad-token': (c) => `issue a new token for ${c.project} (run /spec:connect)`,
  'wrong-project': () => 'set walkthrough.project to the project this token was issued for',
  'unknown-project': () => 'create the project on the service (run /spec:connect), or fix walkthrough.project',
  'unknown-round': () => 'push the round first',
  'unknown-note': () => 'use an id from design/rounds/<n>/notes.json',
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let secret = ''
const scrub = (s) => (secret ? String(s).split(secret).join('<token>') : String(s))

class Refusal extends Error {
  constructor(code, sentence, remedy, exit = 1, service = null) {
    super(code)
    Object.assign(this, { code, sentence, remedy, exit, service })
  }
  line() { return scrub(`walkthrough: ${this.code} — ${this.sentence}` + (this.remedy ? ` — remedy: ${this.remedy}` : '')) }
}

// ---- config and token ---------------------------------------------------------------------

// env.<name> in <root>/.claude/settings.local.json, '' when absent or unreadable.
function storedToken(root, name) {
  const j = readJson(path.join(root, '.claude', 'settings.local.json'), null)
  const v = isObj(j) && isObj(j.env) ? j.env[name] : ''
  return typeof v === 'string' ? v : ''
}

const resolveToken = (root, env, name) => storedToken(root, name) || env[name] || ''
const nameOk = (v) => typeof v === 'string' && NAME_RE.test(v)

// First defect of a walkthrough block as a Refusal, or null. `needToken` false skips the token check.
function configProblem(root, env, block, needToken = true) {
  const bad = (code, sentence, remedy) => new Refusal(code, sentence, remedy, 2)
  if (!isObj(block)) return bad('bad-config', 'config.walkthrough must be an object', 'run /spec:connect')
  for (const k of ['baseUrl', 'project', 'tokenEnv']) {
    if (typeof block[k] !== 'string' || !block[k].trim()) return bad('bad-config', `walkthrough.${k} is missing`, 'run /spec:connect')
  }
  if (!nameOk(block.project)) return bad('bad-config', `walkthrough.project "${block.project}" is not a valid project id`, 'letters, digits, . _ - only; fix walkthrough.project')
  let u = null
  try { u = new URL(block.baseUrl) } catch { /* reported below */ }
  if (!u) return bad('bad-config', `walkthrough.baseUrl "${block.baseUrl}" is not a URL`, 'fix walkthrough.baseUrl')
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)))) {
    return bad('insecure-base-url', `walkthrough.baseUrl ${block.baseUrl} would send the token in clear`, 'use https (plain http only for localhost)')
  }
  if (needToken && !resolveToken(root, env, block.tokenEnv)) {
    return bad('no-token', `${block.tokenEnv} is unset or empty`, `run /spec:connect, or export ${block.tokenEnv}=<the project's token>`)
  }
  return null
}

function contextFromBlock(root, env, block, needToken = true) {
  const problem = configProblem(root, env, block, needToken)
  if (problem) throw problem
  const token = resolveToken(root, env, block.tokenEnv)
  secret = token
  return { root, env, baseUrl: block.baseUrl.trim().replace(/\/+$/, ''), project: block.project, tokenEnv: block.tokenEnv, token }
}

// null = the project has no review service configured.
function openContext(root, env) {
  const b = readConfig(root).walkthrough
  return b && b.baseUrl ? contextFromBlock(root, env, b) : null
}

// ---- requests -----------------------------------------------------------------------------

async function once(c, method, url, headers, body) {
  const ms = Number(c.env.WALKTHROUGH_TIMEOUT_MS) > 0 ? Number(c.env.WALKTHROUGH_TIMEOUT_MS) : 10000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(url, { method, headers, body, redirect: 'error', signal: ac.signal })
    return { status: res.status, retryAfter: res.headers.get('retry-after'), text: await res.text() }
  } catch (e) {
    const cause = e && e.cause
    if (e.name === 'AbortError') throw new Refusal('timeout', `${method} ${new URL(url).pathname} did not answer within ${ms} ms`, 'check the service is up and repeat the command', 3)
    if (cause && /redirect/.test(String(cause.message))) throw new Refusal('redirected', 'the service answered with a redirect, which is never followed', "point walkthrough.baseUrl at the service's final address")
    throw new Refusal('unreachable', `${c.baseUrl} did not answer (${(cause && (cause.code || cause.message)) || e.message})`, 'start the service, or fix walkthrough.baseUrl', 3)
  } finally { clearTimeout(timer) }
}

// One call; returns the parsed JSON body of a 2xx. opts: {params, query, body}.
async function send(c, name, opts = {}) {
  const [method, tpl, auth = true] = CALLS[name]
  const params = { project: c.project, ...(opts.params || {}) }
  const pth = tpl.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(params[k]))
  const qs = opts.query ? '?' + Object.entries(opts.query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''
  const headers = {}
  if (auth) headers.authorization = 'Bearer ' + c.token
  let body
  if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['content-type'] = 'application/json' }
  const where = `${method} ${pth}`
  for (let attempt = 0; ; attempt++) {
    const res = await once(c, method, c.baseUrl + pth + qs, headers, body)
    if (res.status === 429) {
      const secs = /^\d+$/.test(String(res.retryAfter || '').trim()) ? Number(res.retryAfter) : null
      if (secs !== null && secs <= 60 && attempt < 2) { await sleep(secs * 1000); continue }
      throw new Refusal('rate-limited', `${where} was rate limited`, 'wait a minute and repeat the command')
    }
    let json
    try { json = JSON.parse(res.text) } catch { throw new Refusal('not-json', `${where} answered ${res.status} with a body that is not JSON`, 'check walkthrough.baseUrl points at the service, not a proxy') }
    if (res.status >= 200 && res.status < 300) return json
    if (isObj(json) && typeof json.error === 'string') {
      const fix = (REMEDY[json.error] || (() => 'fix what the sentence names and repeat the command'))(c)
      throw new Refusal(json.error, `${where} was refused${typeof json.detail === 'string' ? ` (${json.detail.slice(0, 120)})` : ''}`, fix, 1, { code: json.error, detail: json.detail })
    }
    throw new Refusal(`http-${res.status}`, `${where} answered ${res.status} outside the error shape`, 'check walkthrough.baseUrl points at the service')
  }
}

// hello, then version checks.
async function gate(c) {
  const h = await send(c, 'hello')
  if (!isObj(h) || h.apiVersion !== API_VERSION) throw new Refusal('unknown-api-version', `the service speaks apiVersion ${h && h.apiVersion}; this plugin speaks ${API_VERSION}`, 'update the plugin, or point walkthrough.baseUrl at a service that speaks it')
  if (!(h.revision >= REVISION)) throw new Refusal('service-behind', `the service is at revision ${h.revision}; this plugin needs ${REVISION}`, 'ask the service owner to deploy the newer revision')
  return h
}

// The link proof: the hello gate, then one call that needs the token.
async function probe(c) {
  const h = await gate(c)
  await send(c, 'pullApprovals')
  return { apiVersion: h.apiVersion, revision: h.revision }
}

// ---- rounds -------------------------------------------------------------------------------

const roundsDir = (root) => path.join(root, 'design', 'rounds')
const roundFile = (root, n, name) => path.join(roundsDir(root), String(n), name)

function highestRound(root) {
  try {
    return Math.max(0, ...fs.readdirSync(roundsDir(root), { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d+$/.test(e.name)).map((e) => Number(e.name)))
  } catch { return 0 }
}

// round = {journeys: [{id, title, persona?, beats, steps: [{beat, screen, state?}]}], screens: [{name, state?, spec}]}.
// Numbers it as the next round (or opts.round), pushes it, records design/rounds/<n>/round.json.
// An identical round already on the service is accepted; a different one under the same number refuses.
async function push(c, round, opts = {}) {
  const n = opts.round || highestRound(c.root) + 1
  const body = { round: n, kind: 'wireframe', journeys: round.journeys, screens: round.screens }
  body.contentHash = sha256(JSON.stringify(body))
  await gate(c)
  let status
  let already = false
  try {
    status = (await send(c, 'pushRound', { body })).status
  } catch (e) {
    const d = e instanceof Refusal && e.service && e.service.code === 'round-exists' ? e.service.detail : null
    if (!isObj(d)) throw e
    if (d.contentHash !== body.contentHash) throw new Refusal('round-exists', `round ${n} already holds different content on the service`, `push under the next free number (--round ${n + 1})`)
    status = d.status
    already = true
  }
  writeJson(roundFile(c.root, n, 'round.json'), {
    apiVersion: API_VERSION, round: n, status, contentHash: body.contentHash,
    journeys: body.journeys.map((j) => ({ id: j.id, beats: j.beats })),
  })
  return { round: n, status, already }
}

function localRound(c, arg) {
  const n = arg === undefined ? highestRound(c.root) : Number(arg)
  if (!Number.isInteger(n) || n < 1 || !fs.existsSync(roundFile(c.root, n, 'round.json'))) throw new Refusal('no-round', 'no pushed round to pull for', 'push a round first', 2)
  return n
}

const byAt = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)

// Merges new notes into design/rounds/<n>/notes.json using the stored cursor.
async function pullNotes(c, opts = {}) {
  const n = localRound(c, opts.round)
  await gate(c)
  const file = roundFile(c.root, n, 'notes.json')
  const stored = readJson(file, null)
  const cursor = isObj(stored) && stored.cursor ? stored.cursor : null
  const got = await send(c, 'pullNotes', cursor ? { query: { since: cursor } } : {})
  const merge = (old, fresh, key) => [...new Map([...(old || []), ...(fresh || [])].map((x) => [x[key], x])).values()]
  const notes = merge(isObj(stored) ? stored.notes : [], got.notes, 'id').sort(byAt)
  const journeys = merge(isObj(stored) ? stored.journeys : [], got.journeys, 'id')
  writeJson(file, { apiVersion: API_VERSION, round: n, cursor: got.cursor, notes, journeys })
  return { round: n, notes: notes.length, journeys: journeys.length }
}

// Writes design/rounds/<n>/approvals.json; returns the approvals.
async function pullApprovals(c, opts = {}) {
  const n = localRound(c, opts.round)
  await gate(c)
  const got = await send(c, 'pullApprovals')
  const approvals = (got.approvals || []).slice().sort((a, b) => (a.journey + a.by < b.journey + b.by ? -1 : 1))
  writeJson(roundFile(c.root, n, 'approvals.json'), { apiVersion: API_VERSION, round: n, approvals })
  return { round: n, approvals }
}

async function reply(c, note, text) {
  const t = String(text || '').trim()
  if (!t || t.length > 4000) throw new Refusal('bad-request', 'a reply is 1 to 4000 characters', 'fix the reply text', 1)
  await gate(c)
  await send(c, 'replyNote', { params: { note }, body: { text: t } })
  return { note }
}

async function mark(c, round, status) {
  await gate(c)
  await send(c, 'markRound', { params: { round }, body: { status } })
  return { round, status }
}

module.exports = {
  Refusal, storedToken, resolveToken, nameOk, configProblem, contextFromBlock, openContext,
  gate, probe, push, pullNotes, pullApprovals, reply, mark, highestRound, roundsDir,
}
