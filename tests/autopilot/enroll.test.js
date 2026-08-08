'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260808/01-autopilot-enroll.md — pins AC-20260808-01-1..11 and -13 for the
// spoke-side `autopilot enroll` CLI (autopilot/bin/autopilot, autopilot/daemon/enroll.js).
// Neither file exists yet, nor does autopilot/contract/constants.ts (D2) — all three are
// CREATE rows in the File Plan — so every test here fails on current code: the top-level
// require of the contract copy for CONTRACT_VERSION (AC-1's "never a literal" requirement)
// crashes the whole file at load time, exactly mirroring tests/autopilot/config.test.js's
// established top-level-require red phase. Each test spins up a real node:http stub standing
// in for the hub (no fetchImpl DI — the ACs exercise the CLI end-to-end) and points HOME at a
// throwaway tmpdir so no run can ever touch a developer's real ~/.config/autopilot.
//
// runAutopilot uses async `spawn`, never `spawnSync`: the stub hub server above lives in this
// SAME process, so a synchronous spawnSync would block this process's event loop for the
// entire child lifetime — starving the very http.Server the child is trying to reach and
// deadlocking every test until the 5s kill-timer fires (repair round 1, 2026-08-08: every
// AC that reaches a live stub hung with status=null/SIGTERM). `spawn` lets both event loops
// run concurrently, exactly like the AC-11 closed-port case already required awaiting.

const AUTOPILOT_BIN = path.join(ROOT, 'autopilot', 'bin', 'autopilot')
const CONTRACT_PATH = path.join(ROOT, 'autopilot', 'contract', 'constants.ts')
const { CONTRACT_VERSION } = require(CONTRACT_PATH)

function runAutopilot(args, opts = {}) {
  const { env, home = tmpdir('autopilot-home'), ...rest } = opts
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AUTOPILOT_BIN, ...args], {
      ...rest,
      env: { ...process.env, HOME: home, USERPROFILE: home, ...(env || {}) },
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 5000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ status: null, signal: null, stdout, stderr, home, error })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ status: timedOut ? null : code, signal, stdout, stderr, home })
    })
  })
}

function hubJsonPath(home) {
  return path.join(home, '.config', 'autopilot', 'hub.json')
}

// Starts a stub hub server; resolves once listening with {server, port, requests}. `handler`
// receives (req, res, body) and owns the response.
function startStub(handler) {
  return new Promise((resolve) => {
    const requests = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, headers: req.headers, body })
        handler(req, res, body)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests }))
  })
}

function stopStub(server) {
  return new Promise((resolve) => server.close(resolve))
}

function jsonResponder(status, obj) {
  return (req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(obj))
  }
}

test('AC-20260808-01-1: enroll issues exactly one POST to /api/spokes/enroll with a JSON body deep-equal to {code,contractVersion,machineName,projects} using the imported CONTRACT_VERSION', async () => {
  const { server, port, requests } = await startStub(jsonResponder(201, {
    spokeId: 'sp_1', token: 'tok_abc', projects: [], contractVersion: CONTRACT_VERSION,
  }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(requests.length, 1,
      `enroll must issue exactly one POST to the hub or a retry/duplicate call could double-mint a spoke identity; got ${requests.length} requests`)
    const r = requests[0]
    assert.strictEqual(r.method, 'POST', 'the enroll exchange must be a POST or the hub route will 404/405')
    assert.strictEqual(r.url, '/api/spokes/enroll',
      `the request must hit the exact contracted path or the hub never sees the exchange; got ${r.url}`)
    assert.match(r.headers['content-type'] || '', /application\/json/,
      'the request must declare content-type application/json or the hub cannot parse the body')
    assert.deepStrictEqual(JSON.parse(r.body), {
      code: 'C',
      contractVersion: CONTRACT_VERSION,
      machineName: os.hostname(),
      projects: [],
    }, `the request body must deep-equal the contracted shape using the imported CONTRACT_VERSION (never a literal 1), or a future hub contract bump silently sends a stale version; got ${r.body}`)
    assert.strictEqual(res.status, 0, `a 201 stub reply must exit 0; got status=${res.status} stderr=${res.stderr}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-2: a 201 reply exits 0 and writes hub.json at mode 0600 with hubUrl/spokeId/token/projects/contractVersion/enrolledAt matching the Contracts shape', async () => {
  const { server, port } = await startStub(jsonResponder(201, {
    spokeId: 'sp_1', token: 'tok_abc', projects: [{ projectId: 'p1', name: 'alpha' }], contractVersion: 1,
  }))
  try {
    const hubUrl = `http://127.0.0.1:${port}`
    const res = await runAutopilot(['enroll', '--hub', hubUrl, '--code', 'C'])
    assert.strictEqual(res.status, 0, `expected exit 0 on a successful 201 exchange; got status=${res.status} stderr=${res.stderr}`)
    const cfgPath = hubJsonPath(res.home)
    const stat = fs.statSync(cfgPath)
    assert.strictEqual(stat.mode & 0o777, 0o600,
      `hub.json must be written mode 0600 (the token is an unrecoverable bearer secret) or an unrelated local user can read it; got mode=${(stat.mode & 0o777).toString(8)}`)
    const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    assert.strictEqual(saved.hubUrl, hubUrl, 'hubUrl must be stored byte-identical to --hub or a future spoke loop targets the wrong host')
    assert.strictEqual(saved.spokeId, 'sp_1', 'spokeId must round-trip from the hub reply into the stored credentials')
    assert.strictEqual(saved.token, 'tok_abc', 'token must round-trip from the hub reply or later spoke calls cannot authenticate')
    assert.deepStrictEqual(saved.projects, [{ projectId: 'p1', name: 'alpha' }], 'projects must round-trip from the hub reply verbatim')
    assert.strictEqual(saved.contractVersion, 1, 'contractVersion must be stored alongside the credentials')
    assert.match(saved.enrolledAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
      `enrolledAt must be an ISO-8601 UTC Z timestamp or downstream consumers cannot parse it; got ${saved.enrolledAt}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-3: a successful enroll prints spokeId and machineName on stdout and never leaks the bearer token to combined stdout+stderr', async () => {
  const { server, port } = await startStub(jsonResponder(201, {
    spokeId: 'sp_1', token: 'tok_abc', projects: [], contractVersion: 1,
  }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(res.status, 0, `expected exit 0; got stderr=${res.stderr}`)
    assert.match(res.stdout, /sp_1/,
      `the success line must contain the spokeId or an operator cannot confirm which identity was minted; got stdout=${res.stdout}`)
    assert.match(res.stdout, new RegExp(os.hostname().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `the success line must contain the machineName; got stdout=${res.stdout}`)
    const combined = res.stdout + res.stderr
    assert.ok(!combined.includes('tok_abc'),
      'the bearer token must NEVER appear on stdout or stderr — it is shown once and never expires, so leaking it to scrollback is unrecoverable')
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-4: a 401 unauthorized reply exits 1 with the fixed "get a fresh one" Telegram remedy and never creates the config file', async () => {
  const { server, port } = await startStub(jsonResponder(401, { code: 'unauthorized', message: 'nope' }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(res.status, 1, `a 401 must exit 1; got status=${res.status} stderr=${res.stderr}`)
    assert.match(res.stderr, /code invalid, already used, or expired — get a fresh one with \/enroll in Telegram/,
      `stderr must carry the exact pinned 401 remedy or an operator does not know to run /enroll again; got ${res.stderr}`)
    assert.ok(!fs.existsSync(hubJsonPath(res.home)),
      'a 401 must never create the config file — no credentials were actually issued')
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-5: a 400 contract_version_unsupported reply exits 1 naming a stale contract copy and the update-the-plugin remedy, with no config file', async () => {
  const { server, port } = await startStub(jsonResponder(400, { code: 'contract_version_unsupported', message: 'stale' }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(res.status, 1, `expected exit 1; got status=${res.status} stderr=${res.stderr}`)
    assert.match(res.stderr, /update the autopilot plugin/,
      `stderr must name the "update the autopilot plugin" remedy or an operator cannot fix a stale contract copy; got ${res.stderr}`)
    assert.ok(!fs.existsSync(hubJsonPath(res.home)), 'a rejected exchange must never create the config file')
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-6: a 400 validation_failed reply exits 1 with the hub message verbatim on stderr, with no config file', async () => {
  const { server, port } = await startStub(jsonResponder(400, { code: 'validation_failed', message: 'duplicate project names' }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(res.status, 1, `expected exit 1; got status=${res.status} stderr=${res.stderr}`)
    assert.match(res.stderr, /duplicate project names/,
      `stderr must surface the hub's validation message verbatim or an operator cannot tell which field failed; got ${res.stderr}`)
    assert.ok(!fs.existsSync(hubJsonPath(res.home)), 'a rejected exchange must never create the config file')
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-7: an existing hub.json without --force refuses with exit 2 before any network call, naming the path and --force, and leaves the file byte-identical', async () => {
  const { server, port, requests } = await startStub(jsonResponder(201, { spokeId: 'sp_x', token: 'tok_x', projects: [], contractVersion: 1 }))
  try {
    const home = tmpdir('autopilot-home')
    const cfgDir = path.join(home, '.config', 'autopilot')
    fs.mkdirSync(cfgDir, { recursive: true, mode: 0o700 })
    const cfgPath = path.join(cfgDir, 'hub.json')
    const existing = JSON.stringify({
      hubUrl: 'http://old', spokeId: 'sp_old', token: 'tok_old', machineName: 'old',
      projects: [], contractVersion: 1, enrolledAt: '2020-01-01T00:00:00Z',
    })
    fs.writeFileSync(cfgPath, existing, { mode: 0o600 })
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'], { home })
    assert.strictEqual(res.status, 2, `an existing config without --force must exit 2; got status=${res.status} stderr=${res.stderr}`)
    assert.ok(res.stderr.includes(cfgPath),
      `stderr must name the existing config path or the operator cannot find what to inspect/force; got ${res.stderr}`)
    assert.match(res.stderr, /--force/, `stderr must name --force as the remedy for re-enrolling; got ${res.stderr}`)
    assert.strictEqual(fs.readFileSync(cfgPath, 'utf8'), existing,
      'the refusal must leave the existing file byte-identical — a partial overwrite would corrupt live credentials')
    assert.strictEqual(requests.length, 0,
      `the refusal must happen BEFORE any network call, or a refused enroll still burns the hub's one-time code; got ${requests.length} requests`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-8: --force against an existing hub.json overwrites it with the new enrollment and keeps mode 0600', async () => {
  const { server, port } = await startStub(jsonResponder(201, { spokeId: 'sp_2', token: 'tok_new', projects: [], contractVersion: 1 }))
  try {
    const home = tmpdir('autopilot-home')
    const cfgDir = path.join(home, '.config', 'autopilot')
    fs.mkdirSync(cfgDir, { recursive: true, mode: 0o700 })
    const cfgPath = path.join(cfgDir, 'hub.json')
    fs.writeFileSync(cfgPath, JSON.stringify({
      hubUrl: 'http://old', spokeId: 'sp_old', token: 'tok_old', machineName: 'old',
      projects: [], contractVersion: 1, enrolledAt: '2020-01-01T00:00:00Z',
    }), { mode: 0o600 })
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C', '--force'], { home })
    assert.strictEqual(res.status, 0, `--force with a successful 201 must exit 0; got status=${res.status} stderr=${res.stderr}`)
    const stat = fs.statSync(cfgPath)
    assert.strictEqual(stat.mode & 0o777, 0o600, `the rewritten file must keep mode 0600; got ${(stat.mode & 0o777).toString(8)}`)
    const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    assert.strictEqual(saved.spokeId, 'sp_2',
      `--force must overwrite with the new enrollment's spokeId, or a re-enroll silently keeps the stale identity; got ${JSON.stringify(saved)}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-9: enroll missing --hub or --code, and an unknown subcommand, all exit 2 printing the Contracts usage line on stderr', async () => {
  const usage = /usage: autopilot enroll --hub <url> --code <code> \[--machine-name <name>\] \[--project <name>\]\.\.\. \[--force\]/

  const missingHub = await runAutopilot(['enroll', '--code', 'C'])
  assert.strictEqual(missingHub.status, 2, `missing --hub must exit 2; got status=${missingHub.status} stderr=${missingHub.stderr}`)
  assert.match(missingHub.stderr, usage,
    `missing --hub must print the usage line or an operator cannot see the required flags; got ${missingHub.stderr}`)

  const missingCode = await runAutopilot(['enroll', '--hub', 'http://127.0.0.1:9'])
  assert.strictEqual(missingCode.status, 2, `missing --code must exit 2; got status=${missingCode.status} stderr=${missingCode.stderr}`)
  assert.match(missingCode.stderr, usage,
    `missing --code must print the usage line; got ${missingCode.stderr}`)

  const unknown = await runAutopilot(['frobnicate'])
  assert.strictEqual(unknown.status, 2, `an unknown subcommand must exit 2; got status=${unknown.status} stderr=${unknown.stderr}`)
  assert.match(unknown.stderr, usage,
    `an unknown subcommand must print the usage line; got ${unknown.stderr}`)
})

test('AC-20260808-01-10: --machine-name overrides os.hostname() and repeated --project flags are sent in argv order', async () => {
  const { server, port, requests } = await startStub(jsonResponder(201, { spokeId: 'sp_1', token: 'tok_abc', projects: [], contractVersion: 1 }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C',
      '--machine-name', 'box-7', '--project', 'alpha', '--project', 'beta'])
    assert.strictEqual(res.status, 0, `expected exit 0; got stderr=${res.stderr}`)
    const body = JSON.parse(requests[0].body)
    assert.strictEqual(body.machineName, 'box-7',
      `--machine-name must override os.hostname() in the request body; got ${JSON.stringify(body)}`)
    assert.deepStrictEqual(body.projects, ['alpha', 'beta'],
      `repeated --project flags must be sent in argv order, unvalidated client-side; got ${JSON.stringify(body.projects)}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260808-01-11: a closed hub port fails the exchange with exit 1 naming the --hub URL and ECONNREFUSED, with no config file', async () => {
  const probe = http.createServer()
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => resolve(probe.address().port)))
  await new Promise((resolve) => probe.close(resolve))
  const hubUrl = `http://127.0.0.1:${port}`
  const res = await runAutopilot(['enroll', '--hub', hubUrl, '--code', 'C'])
  assert.strictEqual(res.status, 1,
    `a closed port must fail the exchange with exit 1, not hang or crash; got status=${res.status} signal=${res.signal} stderr=${res.stderr}`)
  assert.ok(res.stderr.includes(hubUrl),
    `stderr must name the --hub URL that failed or an operator cannot tell which hub was unreachable; got ${res.stderr}`)
  assert.match(res.stderr, /ECONNREFUSED/,
    `stderr must name the underlying failure (ECONNREFUSED on a closed port) or an operator sees a generic, undiagnosable error; got ${res.stderr}`)
  assert.ok(!fs.existsSync(hubJsonPath(res.home)), 'a network failure must never create the config file')
})

test('AC-20260808-01-13: a 409 conflict reply exits 1 with the fixed machine-name-retry remedy noting the code is still valid, with no config file', async () => {
  const { server, port } = await startStub(jsonResponder(409, { code: 'conflict', message: 'Machine name already registered' }))
  try {
    const res = await runAutopilot(['enroll', '--hub', `http://127.0.0.1:${port}`, '--code', 'C'])
    assert.strictEqual(res.status, 1, `expected exit 1; got status=${res.status} stderr=${res.stderr}`)
    assert.match(res.stderr, /retry with --machine-name/,
      `stderr must name the --machine-name retry remedy or an operator does not know the fix for a name collision; got ${res.stderr}`)
    assert.match(res.stderr, /same code is still valid/,
      `stderr must note the code is NOT burned by this failure (hub rolls back the transaction) or an operator wastes a valid code fetching a new one; got ${res.stderr}`)
    assert.ok(!fs.existsSync(hubJsonPath(res.home)), 'a 409 must never create the config file')
  } finally {
    await stopStub(server)
  }
})
