'use strict'
// lib/walkthrough-client.js — the calls to the hosted review service and the files they write.
//
// Usage: const c = require('./walkthrough-client'); const ctx = c.openContext(root, env, contract)
//        (null = the project declares no `walkthrough` block); then c.push / c.pullNotes /
//        c.pullApprovals / c.reply / c.mark / c.hello against ctx. Every failure is a thrown
//        `Refusal` carrying code, sentence, remedy and the exit code scripts/walkthrough.js returns.
//
// Owner: specs/20260929/01-the-walkthrough-contract-and-the-client.md D1 (config, token), D7
// (request and answer rules), D8 (the hello gate), D9-D12 (calls and files). The contract file
// (spec-paths walkthrough-contract) supplies paths, shapes, limits and revision; the config block
// is read through lib/host-config.js.
//
// Rules held here: no request without a complete config, a loopback-or-https baseUrl and a token
// read from the named environment variable at call time; redirects are refused; every answer is
// parsed and checked against its call's response shape before any file is written; one retry
// rule (429 with Retry-After of 60 s or less, twice at most). The token is placed in one request
// header and nowhere else: it is never in a URL, a written file, a message, or output (a last
// scrub replaces any literal occurrence in a refusal line).
//
// Deliberately NOT here: reading argv, printing, choosing exit codes for success, retrying network
// errors, following redirects, computing approval staleness, or any cache of the token.
//
// Exit codes (carried by Refusal.exit): 1 refused by the service, the contract or local findings;
// 2 usage, config or precondition; 3 the service did not answer.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { readConfig, CONFIG_RELPATH } = require('./host-config')
const { validate } = require('./json-shape')
const { beatHash } = require('./surfaces')
const { checkRound } = require('./walkthrough-catalog')

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NAME_FALLBACK = /^(?!.*--)[A-Za-z0-9_.-]{1,80}$/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/')

let secret = ''
const scrub = (s) => (secret ? String(s).split(secret).join('<token>') : String(s))

class Refusal extends Error {
  constructor(code, sentence, remedy, exit = 1, extra = null) {
    super(code)
    this.code = code
    this.sentence = sentence
    this.remedy = remedy
    this.exit = exit
    this.service = extra
  }
  line() { return scrub(`walkthrough: ${this.code} — ${this.sentence}` + (this.remedy ? ` — remedy: ${this.remedy}` : '')) }
}

// ---- config (D1, D12) ---------------------------------------------------------------------

function nameOk(shapes, value) {
  if (shapes && has(shapes, 'name')) return validate(shapes, 'name', value).length === 0
  return typeof value === 'string' && NAME_FALLBACK.test(value)
}

// Every defect of a block, in a fixed order: [{ code, at, sentence, remedy }].
function configFindings(block, env, shapes) {
  const out = []
  const fix = (k) => `set walkthrough.${k} in ${CONFIG_RELPATH}`
  if (!isObj(block)) return [{ code: 'bad-config', at: 'walkthrough', sentence: 'walkthrough must be an object with baseUrl, project and tokenEnv', remedy: fix('baseUrl') }]
  const bad = (k) => out.push({ code: 'bad-config', at: 'walkthrough.' + k, sentence: `walkthrough.${k} is missing or empty`, remedy: fix(k) })
  for (const k of ['baseUrl', 'project', 'tokenEnv']) if (typeof block[k] !== 'string' || !block[k].trim()) bad(k)
  if (typeof block.project === 'string' && block.project.trim() && !nameOk(shapes, block.project)) {
    out.push({ code: 'bad-config', at: 'walkthrough.project', sentence: `walkthrough.project "${block.project}" is not a valid project id (letters, digits, . _ -, no "--", at most 80)`, remedy: fix('project') })
  }
  if (typeof block.baseUrl === 'string' && block.baseUrl.trim()) {
    let u = null
    try { u = new URL(block.baseUrl) } catch { u = null }
    if (!u) out.push({ code: 'bad-config', at: 'walkthrough.baseUrl', sentence: `walkthrough.baseUrl "${block.baseUrl}" is not a URL`, remedy: fix('baseUrl') })
    else if (!(u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname)))) {
      out.push({ code: 'insecure-base-url', at: 'walkthrough.baseUrl', sentence: `walkthrough.baseUrl ${block.baseUrl} would send the token in clear`, remedy: 'use an https: address (plain http is allowed only for localhost, 127.0.0.1 and [::1])' })
    }
  }
  if (typeof block.tokenEnv === 'string' && block.tokenEnv.trim() && !(env[block.tokenEnv] || '')) {
    out.push({ code: 'no-token', at: block.tokenEnv, sentence: `environment variable ${block.tokenEnv} is unset or empty`, remedy: `export ${block.tokenEnv}=<the project's token>` })
  }
  return out
}

// The `check` verb: absent block -> []; never opens a connection.
function checkConfig(root, env, shapes) {
  const cfg = readConfig(root)
  if (cfg.walkthrough === undefined || cfg.walkthrough === null) return []
  return configFindings(cfg.walkthrough, env, shapes)
}

// null = not configured. Otherwise the context every call uses; throws Refusal (exit 2) on a bad block.
function openContext(root, env, contract) {
  const cfg = readConfig(root)
  if (cfg.walkthrough === undefined || cfg.walkthrough === null) return null
  const found = configFindings(cfg.walkthrough, env, contract.shapes)
  if (found.length) throw new Refusal(found[0].code, found[0].sentence, found[0].remedy, 2)
  const b = cfg.walkthrough
  const token = env[b.tokenEnv]
  secret = token
  return { root, contract, env, baseUrl: b.baseUrl.trim().replace(/\/+$/, ''), project: b.project, tokenEnv: b.tokenEnv, token }
}

// ---- requests (D7) ------------------------------------------------------------------------

const REMEDY = {
  'bad-token': (c) => `issue a new token for ${c.project} in the service and export ${c.tokenEnv}`,
  'wrong-project': (c) => `set walkthrough.project to the project this token was issued for, or export the right token in ${c.tokenEnv}`,
  'unknown-project': () => 'create the project on the service, or fix walkthrough.project',
  'unknown-round': () => 'push the round first, or name a round the service holds',
  'unknown-note': () => 'run walkthrough pull-notes and use an id from design/rounds/<n>/notes.json',
  internal: () => 'repeat the command; if it persists, report it to the service owner',
}

function timeoutMs(c, call) {
  const v = c.env.WALKTHROUGH_TIMEOUT_MS
  if (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0) return Number(v)
  return call.body === 'image/png' ? 60000 : 10000
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function netRefusal(c, e, where, ms) {
  const cause = e && e.cause
  if ((e && e.name === 'AbortError') || (cause && cause.name === 'AbortError')) {
    return new Refusal('timeout', `${where} did not answer within ${ms} ms`, `check the service is up and repeat the command (a slow service: fix walkthrough.baseUrl or wait)`, 3)
  }
  if (cause && /unexpected redirect/.test(String(cause.message))) {
    return new Refusal('redirected', `${where} answered with a redirect, which is never followed`, 'point walkthrough.baseUrl at the service\'s final address', 1)
  }
  const why = (cause && (cause.code || cause.message)) || (e && e.message) || 'no connection'
  return new Refusal('unreachable', `${c.baseUrl} did not answer (${why})`, 'start the service, or fix walkthrough.baseUrl', 3)
}

async function once(c, call, method, url, headers, body) {
  const ms = timeoutMs(c, call)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  const where = `${method} ${new URL(url).pathname}`
  try {
    const res = await fetch(url, { method, headers, body, redirect: 'error', signal: ac.signal })
    const text = await res.text()
    return { status: res.status, retryAfter: res.headers.get('retry-after'), text }
  } catch (e) {
    throw netRefusal(c, e, where, ms)
  } finally {
    clearTimeout(timer)
  }
}

function firstPath(findings) {
  const f = findings[0]
  return `${f.at ? f.at.replace(/^\./, '') : 'the answer'} (${f.code}: ${f.detail})`
}

// One call: returns the parsed, shape-checked success body. opts: { params, query, body, buf, headers, auth, notFound }.
async function send(c, name, opts = {}) {
  const call = c.contract.calls[name]
  const params = { project: c.project, ...(opts.params || {}) }
  const pth = call.path.replace(/\{(\w+)\}/g, (_m, k) => encodeURIComponent(params[k]))
  const qs = opts.query ? '?' + Object.entries(opts.query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : ''
  const url = c.baseUrl + pth + qs
  const headers = { ...(opts.headers || {}) }
  if (opts.auth !== false) headers.authorization = 'Bearer ' + c.token
  let body
  if (opts.buf) body = opts.buf
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['content-type'] = 'application/json' }
  const where = `${call.method} ${pth}`

  for (let attempt = 0; ; attempt++) {
    const res = await once(c, call, call.method, url, headers, body)
    if (res.status === 429) {
      const secs = /^\d+$/.test(String(res.retryAfter || '').trim()) ? Number(res.retryAfter) : null
      if (secs !== null && secs <= 60 && attempt < 2) { await sleep(secs * 1000); continue }
      const why = secs === null ? 'without a usable Retry-After'
        : secs > 60 ? `asking for a wait of ${secs} s, over the 60 s this client waits`
          : `still asking for a wait of ${secs} s after 2 retries`
      throw new Refusal('rate-limited', `${where} was rate limited, ${why}`, 'wait a minute and repeat the command', 1)
    }
    return interpret(c, call, where, res, opts)
  }
}

function interpret(c, call, where, res, opts) {
  let json
  let parsed = true
  try { json = JSON.parse(res.text) } catch { parsed = false }
  if (res.status >= 200 && res.status < 300) {
    if (!parsed) throw new Refusal('not-json', `${where} answered ${res.status} with a body that is not JSON`, 'check walkthrough.baseUrl points at the service, not a proxy or a login page', 1)
    const found = validate(c.contract.shapes, call.response, json)
    if (found.length) throw new Refusal('contract-mismatch', `${where} answered outside the contract at ${firstPath(found)}`, 'update the plugin, or ask the service owner to conform to the contract; nothing was written', 1)
    return json
  }
  if (res.status === 404 && opts.notFound) {
    throw new Refusal(opts.notFound, `${where} answered 404: the service does not speak ${c.contract.prefix}`, 'update the plugin, or point walkthrough.baseUrl at a service that does', 1)
  }
  if (!parsed) throw new Refusal('not-json', `${where} answered ${res.status} with a body that is not JSON`, 'check walkthrough.baseUrl points at the service, not a proxy or a login page', 1)
  if (validate(c.contract.shapes, 'error', json).length === 0) {
    const detail = typeof json.detail === 'string' && json.detail.length <= 120 ? ` (${json.detail})` : ''
    const remedy = (REMEDY[json.error] || (() => 'fix what the sentence names and repeat the command'))(c)
    throw new Refusal(json.error, `${where} was refused${detail}`, remedy, 1, { code: json.error, detail: json.detail, status: res.status })
  }
  throw new Refusal(`http-${res.status}`, `${where} answered ${res.status} with a body outside the error shape`, 'check walkthrough.baseUrl points at the service; repeat the command', 1)
}

// ---- hello and the gate (D8) --------------------------------------------------------------

async function hello(c) {
  return send(c, 'hello', { auth: false, notFound: 'unknown-api-version' })
}

async function gate(c, warn) {
  const h = await hello(c)
  if (h.apiVersion !== c.contract.apiVersion) {
    throw new Refusal('unknown-api-version', `the service speaks apiVersion ${h.apiVersion}; this plugin speaks ${c.contract.apiVersion}`, 'update the plugin, or point walkthrough.baseUrl at a service that speaks it', 1)
  }
  if (h.revision < c.contract.revision) {
    throw new Refusal('service-behind', `the service is at revision ${h.revision}; this plugin needs revision ${c.contract.revision}`, 'ask the service owner to deploy the newer revision, or use the plugin version that matches the service', 1)
  }
  if (h.sunset) warn(`walkthrough: ${c.contract.prefix} stops on ${h.sunset} — update the plugin`)
  return h
}

// ---- local files --------------------------------------------------------------------------

function roundsDir(root) { return path.join(root, 'design', 'rounds') }
function roundDir(root, n) { return path.join(roundsDir(root), String(n)) }

function highestRound(root) {
  let top = 0
  let entries = []
  try { entries = fs.readdirSync(roundsDir(root), { withFileTypes: true }) } catch { entries = [] }
  for (const e of entries) if (e.isDirectory() && /^\d+$/.test(e.name)) top = Math.max(top, Number(e.name))
  return top
}

function writeJsonAtomic(file, value) {
  const text = JSON.stringify(value, null, 2) + '\n'
  try { if (fs.readFileSync(file, 'utf8') === text) return false } catch { /* absent: write it */ }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* nothing to remove */ }
    throw e
  }
  return true
}

function readJsonIf(file) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return null }
  try { return JSON.parse(text) } catch { return undefined }
}

function positiveInt(v, flag) {
  if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v)) throw new Refusal('usage', `${flag} needs a positive whole number, got ${JSON.stringify(v)}`, `pass ${flag} <n> with n of 1 or more`, 2)
  return Number(v)
}

// A round that exists locally: `--round` or the highest folder; round.json must be there.
function localRound(c, arg) {
  let n
  if (arg !== undefined) n = positiveInt(arg, '--round')
  else {
    n = highestRound(c.root)
    if (!n) throw new Refusal('no-round', 'design/rounds/ holds no round', 'push a round first: walkthrough push --round-file <file>', 2)
  }
  const file = path.join(roundDir(c.root, n), 'round.json')
  if (!fs.existsSync(file)) {
    throw new Refusal('no-round', `${rel(c.root, file)} does not exist`, 'push the round (walkthrough push --round-file <file>), or name another round with --round', 2)
  }
  return n
}

// ---- the round file (D5, D9, D10) ---------------------------------------------------------

function bad(sentence, file) {
  return new Refusal('bad-round-file', sentence, `fix the round file${file ? ' ' + file : ''} and run walkthrough validate --round-file <file>`, 2)
}

// Reads the envelope; returns { round, dir }. Throws Refusal exit 2 for a file that is not a round.
function readRoundFile(file) {
  let round
  try { round = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw bad(`${file} cannot be read as JSON (${e.code || e.message})`, file) }
  if (!isObj(round) || (round.kind !== 'wireframe' && round.kind !== 'screenshots')) throw bad('the round file needs "kind": "wireframe" or "screenshots"', file)
  if (!Array.isArray(round.screens) || !round.screens.length) throw bad('the round file needs a non-empty "screens" list', file)
  if (round.journeys === undefined) round.journeys = []
  if (!Array.isArray(round.journeys)) throw bad('"journeys" must be a list', file)
  for (const j of round.journeys) if (!isObj(j) || !Array.isArray(j.steps) || j.steps.some((s) => !isObj(s))) throw bad('every journey needs a "steps" list of objects', file)
  for (const s of round.screens) {
    if (!isObj(s)) throw bad('every screen must be an object', file)
    if (round.kind === 'screenshots' && (typeof s.file !== 'string' || !Number.isInteger(s.width))) throw bad(`picture screen ${JSON.stringify(s.name)} needs "file" (a path) and "width" (an integer)`, file)
  }
  return { round, dir: path.dirname(path.resolve(file)) }
}

// D5 findings for a round read by readRoundFile.
function checkRoundFile(contract, catalog, round) {
  return checkRound(catalog, round, { shapes: contract.shapes, limits: contract.limits })
}

// D10: every picture checked before any request. Returns [{ screen, abs, sha256, bytes }].
function preparePictures(contract, round, dir) {
  const limit = contract.limits.imageBytes
  return round.screens.map((s) => {
    const abs = path.resolve(dir, s.file)
    let size
    let head = Buffer.alloc(8)
    try {
      size = fs.statSync(abs).size
      const fd = fs.openSync(abs, 'r')
      try { fs.readSync(fd, head, 0, 8, 0) } finally { fs.closeSync(fd) }
    } catch (e) {
      throw bad(`picture ${s.file} cannot be read (${e.code || e.message})`)
    }
    if (size > limit) throw new Refusal('too-large', `${s.file} is ${size} bytes, over the limit of ${limit}`, 'export the picture smaller (lower width or a tighter crop) and push again', 1)
    if (!head.equals(PNG_SIGNATURE)) throw new Refusal('not-png', `${s.file} is not a PNG (its first bytes are not the PNG signature)`, 'export the picture as PNG and push again', 1)
    return { screen: s, abs, sha256: sha256(fs.readFileSync(abs)), bytes: size }
  })
}

const imageKey = (s) => (s.state ? `${s.name}--${s.state}--${s.width}` : `${s.name}--${s.width}`)

// The wire body (contentHash last) for round number n.
function buildBody(round, n, pics) {
  const journeys = round.journeys.map((j) => {
    const steps = j.steps.map((st) => {
      const o = { beat: st.beat, screen: st.screen }
      if (st.state) o.state = st.state
      return o
    })
    const o = { id: j.id, title: j.title }
    if (j.persona !== undefined) o.persona = j.persona
    o.beats = beatHash(steps.map((s) => ({ beat: s.beat, screen: s.screen, state: s.state || null })))
    o.steps = steps
    if (j.actor !== undefined) o.actor = j.actor
    if (j.variantOf !== undefined && j.variantOf !== null) o.variantOf = j.variantOf
    return o
  })
  const screens = round.screens.map((s, i) => {
    const o = { name: s.name }
    if (s.state) o.state = s.state
    if (round.kind === 'wireframe') o.spec = s.spec
    else { o.width = s.width; o.sha256 = pics[i].sha256; o.bytes = pics[i].bytes }
    return o
  })
  const body = { round: n, kind: round.kind, journeys, screens }
  body.contentHash = sha256(Buffer.from(JSON.stringify(body), 'utf8'))
  return body
}

function checkBody(contract, body, file) {
  const call = contract.calls.pushRound
  let found = validate(contract.shapes, call.request, body)
  if (found.length) {
    const specific = body.kind === 'wireframe' ? 'wireframePush' : 'picturePush'
    const narrow = has(contract.shapes, specific) ? validate(contract.shapes, specific, body) : []
    found = narrow.length ? narrow : found
    throw bad(`the round breaks the push contract at ${firstPath(found)}`, file)
  }
  if (Buffer.byteLength(JSON.stringify(body)) > contract.limits.pushBytes) {
    throw new Refusal('too-large', `the push body is over the limit of ${contract.limits.pushBytes} bytes`, 'split the round: fewer screens per push', 1)
  }
}

function roundRecord(c, body, status, pics) {
  const rec = {
    apiVersion: c.contract.apiVersion, round: body.round, kind: body.kind, status,
    contentHash: body.contentHash, journeys: body.journeys.map((j) => ({ id: j.id, beats: j.beats })),
  }
  rec.screens = body.screens.map((s, i) => (body.kind === 'wireframe'
    ? { name: s.name, state: s.state || null }
    : { name: s.name, state: s.state || null, width: s.width, image: imageKey(s), sha256: s.sha256, bytes: s.bytes, uploaded: pics ? pics[i] : false }))
  return rec
}

// ---- push (D9, D10) -----------------------------------------------------------------------

async function uploadPictures(c, body, prepared, uploaded) {
  const file = path.join(roundDir(c.root, body.round), 'round.json')
  const save = (st) => writeJsonAtomic(file, roundRecord(c, body, st, uploaded))
  save(uploaded.every(Boolean) ? 'open' : 'uploading')
  for (let i = 0; i < prepared.length; i++) {
    if (uploaded[i]) continue
    const p = prepared[i]
    const buf = fs.readFileSync(p.abs)
    if (sha256(buf) !== p.sha256) throw bad(`picture ${p.screen.file} changed since it was checked`)
    await send(c, 'putImage', {
      params: { round: body.round, image: imageKey(p.screen) }, buf,
      headers: { 'content-type': 'image/png', 'x-content-sha256': p.sha256 },
    })
    uploaded[i] = true
    save(uploaded.every(Boolean) ? 'open' : 'uploading')
  }
  return uploaded.every(Boolean) ? 'open' : 'uploading'
}

// opts: { roundFile, round, resume, catalog, warn }. Returns { findings } when D5 refuses (nothing sent),
// else { round, kind, status, pictures? }.
async function push(c, opts) {
  const { round, dir } = readRoundFile(opts.roundFile)
  if (round.kind === 'wireframe') {
    const findings = checkRoundFile(c.contract, opts.catalog, round)
    if (findings.length) return { findings }
  }
  const prepared = round.kind === 'screenshots' ? preparePictures(c.contract, round, dir) : null

  const resume = opts.resume !== undefined ? positiveInt(opts.resume, '--resume') : null
  const n = resume || (opts.round !== undefined ? positiveInt(opts.round, '--round') : highestRound(c.root) + 1)
  const body = buildBody(round, n, prepared)
  checkBody(c.contract, body, opts.roundFile)

  if (resume) {
    if (round.kind !== 'screenshots') throw new Refusal('bad-resume', '--resume applies to picture rounds only', 'run walkthrough push without --resume', 2)
    const file = path.join(roundDir(c.root, n), 'round.json')
    const saved = readJsonIf(file)
    if (!saved) throw new Refusal('no-round', `${rel(c.root, file)} is missing or unreadable`, 'push the round first (without --resume)', 2)
    if (saved.contentHash !== body.contentHash) {
      throw new Refusal('resume-mismatch', `the round file's contentHash differs from ${rel(c.root, file)}'s`, 'resume with the same round file and pictures that started the push, or push a new round with --round <n>', 2)
    }
    const uploaded = body.screens.map((_s, i) => Boolean(saved.screens && saved.screens[i] && saved.screens[i].uploaded))
    await gate(c, opts.warn)
    const status = await uploadPictures(c, body, prepared, uploaded)
    return { round: n, kind: body.kind, status, pictures: { total: uploaded.length, uploaded: uploaded.filter(Boolean).length } }
  }

  await gate(c, opts.warn)
  let answer
  let already = false
  try {
    answer = await send(c, 'pushRound', { body })
  } catch (e) {
    const s = e instanceof Refusal ? e.service : null
    if (s && s.code === 'round-exists') {
      if (validate(c.contract.shapes, 'roundExists', s.detail).length === 0 && s.detail.contentHash === body.contentHash) {
        answer = { status: s.detail.status }
        already = true
      } else {
        throw new Refusal('round-exists', `round ${n} already holds different content on the service`, `push under the next free number: walkthrough push --round-file ${opts.roundFile} --round ${n + 1}`, 1)
      }
    } else throw e
  }

  if (body.kind === 'wireframe') {
    writeJsonAtomic(path.join(roundDir(c.root, n), 'round.json'), roundRecord(c, body, answer.status, null))
    return { round: n, kind: body.kind, status: answer.status, already }
  }
  const done = already && answer.status === 'open'
  const uploaded = body.screens.map(() => done)
  const status = done ? (writeJsonAtomic(path.join(roundDir(c.root, n), 'round.json'), roundRecord(c, body, 'open', uploaded)), 'open')
    : await uploadPictures(c, body, prepared, uploaded)
  return { round: n, kind: body.kind, status, already, pictures: { total: uploaded.length, uploaded: uploaded.filter(Boolean).length } }
}

// ---- pulls (D11) --------------------------------------------------------------------------

const byAtThenId = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

async function pullNotes(c, opts) {
  const n = localRound(c, opts.round)
  await gate(c, opts.warn)
  const file = path.join(roundDir(c.root, n), 'notes.json')
  const existing = readJsonIf(file)
  const stored = isObj(existing) ? existing : null
  const cursor = stored && typeof stored.cursor === 'string' && stored.cursor ? stored.cursor : null
  const got = await send(c, 'pullNotes', cursor ? { query: { since: cursor } } : {})
  const notes = new Map(((stored && Array.isArray(stored.notes)) ? stored.notes : []).map((x) => [x.id, x]))
  for (const x of got.notes) notes.set(x.id, x)
  const journeys = new Map(((stored && Array.isArray(stored.journeys)) ? stored.journeys : []).map((x) => [x.id, x]))
  for (const x of got.journeys) journeys.set(x.id, x)
  const out = {
    apiVersion: c.contract.apiVersion, round: n, cursor: got.cursor,
    notes: [...notes.values()].sort(byAtThenId),
    journeys: [...journeys.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  }
  const changed = writeJsonAtomic(file, out)
  return { round: n, notes: out.notes.length, journeys: out.journeys.length, cursor: out.cursor, changed }
}

async function pullApprovals(c, opts) {
  const n = localRound(c, opts.round)
  await gate(c, opts.warn)
  const got = await send(c, 'pullApprovals', {})
  const approvals = [...got.approvals].sort((a, b) => (a.journey < b.journey ? -1 : a.journey > b.journey ? 1 : a.by < b.by ? -1 : a.by > b.by ? 1 : 0))
  const changed = writeJsonAtomic(path.join(roundDir(c.root, n), 'approvals.json'), { apiVersion: c.contract.apiVersion, round: n, approvals })
  return { round: n, approvals: approvals.length, changed }
}

// ---- reply and mark (D12) -----------------------------------------------------------------

async function reply(c, opts) {
  let raw
  try { raw = fs.readFileSync(opts.textFile, 'utf8') } catch (e) {
    throw new Refusal('bad-text-file', `${opts.textFile} cannot be read (${e.code || e.message})`, 'pass --text-file <a readable file holding the reply>', 2)
  }
  const text = raw.trim()
  const max = c.contract.limits.replyChars
  if (!text) throw new Refusal('bad-request', 'the reply text is empty', 'write the reply into the --text-file and repeat the command', 1)
  if (Array.from(text).length > max) throw new Refusal('bad-request', `the reply is longer than ${max} characters`, `shorten the reply to ${max} characters or fewer`, 1)
  await gate(c, opts.warn)
  await send(c, 'replyNote', { params: { note: opts.note }, body: { text } })
  return { note: opts.note }
}

async function mark(c, opts) {
  const n = positiveInt(opts.round, '--round')
  await gate(c, opts.warn)
  await send(c, 'markRound', { params: { round: n }, body: { status: opts.status } })
  return { round: n, status: opts.status }
}

module.exports = {
  Refusal, configFindings, checkConfig, openContext, hello, gate, readRoundFile, checkRoundFile,
  push, pullNotes, pullApprovals, reply, mark,
}
