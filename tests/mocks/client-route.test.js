'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const http = require('node:http')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { tmpdir } = require('../helpers')

// specs/20260907/10-client-review.md D4 (the /client/ route dispatch on
// spec/scripts/design-atlas.js's createRequestHandler) and D5 (spec/scripts/lib/client-capture.js,
// a CREATE the File Plan names but does not yet exist) are both unbuilt — every test below is red
// until D4/D5/D6 land. Gotcha (tests/helpers.js's runNode is spawnSync, which cannot service a
// request against a server living in this same suite's process tree — spec/20260825/03): the
// serve child below is driven by a file-local async child_process.spawn runner, the real script
// with real argv, never spawnSync. AC-20260907-10-4, -5, -6, -7, -8, -9, -21.
//
// Orchestrator duty (spec File Plan row): tests/mocks/mocks-driver-fixtures.js is NOT widened for
// this file's needs — the serve runner and the PATH-stubbed `npx` below are both file-local.

let clientCaptureLib
try {
  // eslint-disable-next-line global-require
  clientCaptureLib = require('../../spec/scripts/lib/client-capture')
} catch (e) {
  clientCaptureLib = null
  // Recorded rather than thrown at require-time: a require() throw here would abort the whole
  // file before node:test can report per-test failures, which is worse for a build worker's
  // first read of "what's still red" than one obviously-failing AC-8 test naming the cause.
  clientCaptureLib = { captureScreen: () => Promise.reject(new Error('spec/scripts/lib/client-capture.js does not exist yet (D5): ' + e.message)) }
}

const DESIGN_ATLAS_BIN = path.join(__dirname, '../../spec/scripts/design-atlas.js')

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }
function writeNotesFile(dir, notes) { writeJSON(notesPath(dir), notes) }
function readNotesFile(dir) { return JSON.parse(fs.readFileSync(notesPath(dir), 'utf8')) }
function nowIso() { return new Date().toISOString() }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
    srv.on('error', reject)
  })
}

// File-local async serve runner (the Gotcha above) — spawns the real design-atlas.js serve
// command with real argv and resolves once its first stdout line lands (readiness).
function startServe(root, port, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DESIGN_ATLAS_BIN, 'serve', '--root', root, '--port', String(port)],
      { env: opts.env || process.env })
    let stderrBuf = ''
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })
    const timer = setTimeout(() => reject(new Error('design-atlas.js serve --port ' + port + ' did not print its first stdout line within 5s: ' + stderrBuf)), 5000)
    child.stdout.once('data', () => { clearTimeout(timer); resolve(child) })
    child.once('error', (err) => { clearTimeout(timer); reject(err) })
  })
}
function stopServe(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) { resolve(); return }
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      resolve()
    }, 5000)
  })
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let body = null
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { body = null }
        resolve({ status: res.statusCode, body })
      })
    }).on('error', reject)
  })
}
function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload))
    const u = new URL(url)
    const req = http.request(u, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let body = null
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { body = null }
        resolve({ status: res.statusCode, body })
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// PATH-stub `npx` — logs its argv to `argvLogFile` and copies a fixed PNG-fixture buffer to its
// invocation's last argv item (the <out> path client-capture.js's captureScreen passes); the
// exit-1 variant never writes a file. Used both directly against the lib (AC-8) and via the
// serve child's own PATH (AC-9, D6 — the capture runs INSIDE the serving process).
const PNG_FIXTURE_BYTES = Buffer.from('client-capture-fixture-png-bytes-v1')
function stubNpxCapture(dir, { exitCode = 0, argvLogFile = null } = {}) {
  const binDir = path.join(dir, 'npx-capture-bin')
  fs.mkdirSync(binDir, { recursive: true })
  const npxPath = path.join(binDir, 'npx')
  const logLine = argvLogFile ? 'echo "$@" >> "' + argvLogFile + '"\n' : ''
  let script
  if (exitCode !== 0) {
    script = '#!/usr/bin/env bash\n' + logLine + 'exit ' + exitCode + '\n'
  } else {
    const src = path.join(dir, 'client-capture-fixture.png')
    fs.writeFileSync(src, PNG_FIXTURE_BYTES)
    script = '#!/usr/bin/env bash\n' + logLine + 'last="${@: -1}"\ncp "' + src + '" "$last"\nexit 0\n'
  }
  fs.writeFileSync(npxPath, script)
  fs.chmodSync(npxPath, 0o755)
  return binDir + path.delimiter + process.env.PATH
}

function baseNote(id, extra) {
  return Object.assign({
    id, scope: 'mock', screen: 'signin', state: 'error', text: 'x', by: 'someone', at: nowIso(),
    status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }, extra)
}

// ---------------------------------------------------------------------------
// AC-20260907-10-4
// ---------------------------------------------------------------------------
test('AC-20260907-10-4: POST /client/__notes/add carrying origin, kind or ledgerId answers 400; a valid project-scope body answers 201 with origin "client", capture null, lastClientAt set; POST /__notes/add (non-client route) carrying origin answers 400, and a valid body lands with origin "session"', async () => {
  const dir = tmpdir('client-route-add')
  writeNotesFile(dir, [])
  const port = await freePort()
  const child = await startServe(dir, port)
  try {
    for (const bad of [{ origin: 'client', scope: 'project', text: 'x', by: 'c' }, { kind: 'question', scope: 'project', text: 'x', by: 'c' }, { ledgerId: 'W1', scope: 'project', text: 'x', by: 'c' }]) {
      const r = await postJson('http://127.0.0.1:' + port + '/client/__notes/add', bad)
      assert.strictEqual(r.status, 400, 'AC-4: POST /client/__notes/add carrying ' + JSON.stringify(Object.keys(bad)) + ' must answer 400: got ' + r.status + ' ' + JSON.stringify(r.body))
    }

    const ok = await postJson('http://127.0.0.1:' + port + '/client/__notes/add', { scope: 'project', text: 'the direction is wrong', by: 'Ren' })
    assert.strictEqual(ok.status, 201, 'AC-4: a valid project-scope client-route body must answer 201: got ' + ok.status + ' ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.origin, 'client', 'AC-4: the client-route POST /__notes/add response must stamp origin "client": got ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.capture, null, 'AC-4: a project-scope client note must carry capture: null: got ' + JSON.stringify(ok.body))
    assert.ok(ok.body && ok.body.lastClientAt, 'AC-4: a client-route write must set lastClientAt: got ' + JSON.stringify(ok.body))

    const nonClientBad = await postJson('http://127.0.0.1:' + port + '/__notes/add', { origin: 'client', scope: 'project', text: 'x', by: 'session' })
    assert.strictEqual(nonClientBad.status, 400, 'AC-4: POST /__notes/add (non-client route) carrying origin must answer 400: got ' + nonClientBad.status + ' ' + JSON.stringify(nonClientBad.body))

    const nonClientOk = await postJson('http://127.0.0.1:' + port + '/__notes/add', { scope: 'project', text: 'y', by: 'session' })
    assert.strictEqual(nonClientOk.status, 201, 'AC-4: a valid non-client-route body must answer 201: got ' + nonClientOk.status + ' ' + JSON.stringify(nonClientOk.body))
    assert.strictEqual(nonClientOk.body && nonClientOk.body.origin, 'session', 'AC-4: the non-client route must stamp origin "session": got ' + JSON.stringify(nonClientOk.body))
  } finally {
    await stopServe(child)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-5
// ---------------------------------------------------------------------------
test('AC-20260907-10-5: POST /client/__notes/resolve on an open client-origin note answers 200 with status resolved and resolution withdrawn; on an addressed client-origin note resolution accepted; on a session-origin or walk note it answers 400 naming that origin; on a question it answers 400 naming /__notes/answer', async () => {
  const dir = tmpdir('client-route-resolve')
  const port = await freePort()
  const child = await startServe(dir, port)
  try {
    writeNotesFile(dir, [baseNote('N001', { origin: 'client', status: 'open' })])
    const withdrawn = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N001', by: 'Ren' })
    assert.strictEqual(withdrawn.status, 200, 'AC-5: resolving an open client-origin note must answer 200: got ' + withdrawn.status + ' ' + JSON.stringify(withdrawn.body))
    assert.deepStrictEqual({ status: withdrawn.body && withdrawn.body.status, resolution: withdrawn.body && withdrawn.body.resolution }, { status: 'resolved', resolution: 'withdrawn' },
      'AC-5: an open client-origin note resolved via the client route must record resolution "withdrawn": got ' + JSON.stringify(withdrawn.body))

    writeNotesFile(dir, [baseNote('N002', { origin: 'client', status: 'addressed', addressed: { at: nowIso(), change: 'x', ledgerRow: null } })])
    const accepted = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N002', by: 'Ren' })
    assert.strictEqual(accepted.status, 200, 'AC-5: resolving an addressed client-origin note must answer 200: got ' + accepted.status + ' ' + JSON.stringify(accepted.body))
    assert.strictEqual(accepted.body && accepted.body.resolution, 'accepted', 'AC-5: an addressed client-origin note resolved via the client route must record resolution "accepted": got ' + JSON.stringify(accepted.body))

    writeNotesFile(dir, [baseNote('N003', { origin: 'session' })])
    const sessionRefused = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N003', by: 'Ren' })
    assert.strictEqual(sessionRefused.status, 400, 'AC-5: resolving a session-origin note via the client route must answer 400: got ' + sessionRefused.status + ' ' + JSON.stringify(sessionRefused.body))
    assert.match(JSON.stringify(sessionRefused.body), /session/, 'AC-5: the refusal must name the offending origin "session": got ' + JSON.stringify(sessionRefused.body))

    writeNotesFile(dir, [baseNote('N004', { kind: 'walk', reason: 'no-path-back' })])
    const walkRefused = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N004', by: 'Ren' })
    assert.strictEqual(walkRefused.status, 400, 'AC-5: resolving a walk note via the client route must answer 400: got ' + walkRefused.status + ' ' + JSON.stringify(walkRefused.body))
    assert.match(JSON.stringify(walkRefused.body), /walk/, 'AC-5: the refusal must name the offending origin "walk": got ' + JSON.stringify(walkRefused.body))

    writeNotesFile(dir, [{ id: 'N005', scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'session', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'question', ledgerId: 'W1', answer: null }])
    const questionRefused = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N005', by: 'Ren' })
    assert.strictEqual(questionRefused.status, 400, 'AC-5: resolving a question via the client route must answer 400: got ' + questionRefused.status + ' ' + JSON.stringify(questionRefused.body))
    assert.match(JSON.stringify(questionRefused.body), /\/__notes\/answer/, 'AC-5: the question refusal must name "/__notes/answer": got ' + JSON.stringify(questionRefused.body))
  } finally {
    await stopServe(child)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-6
// ---------------------------------------------------------------------------
test('AC-20260907-10-6: POST /__notes/resolve (non-client route) targeting a client-origin note answers 403 naming the client route and notes waive, leaving the note unchanged on disk', async () => {
  const dir = tmpdir('client-route-resolve-403')
  const port = await freePort()
  const child = await startServe(dir, port)
  try {
    const note = baseNote('N001', { origin: 'client', status: 'open' })
    writeNotesFile(dir, [note])
    const before = fs.readFileSync(notesPath(dir), 'utf8')
    const r = await postJson('http://127.0.0.1:' + port + '/__notes/resolve', { id: 'N001', by: 'session' })
    assert.strictEqual(r.status, 403, 'AC-6: resolving a client-origin note on the non-client route must answer 403: got ' + r.status + ' ' + JSON.stringify(r.body))
    assert.match(JSON.stringify(r.body), /client/i, 'AC-6: the 403 must name the client route as the remedy: got ' + JSON.stringify(r.body))
    assert.match(JSON.stringify(r.body), /notes waive/, 'AC-6: the 403 must name `notes waive` as the alternate remedy: got ' + JSON.stringify(r.body))
    const after = fs.readFileSync(notesPath(dir), 'utf8')
    assert.strictEqual(after, before, 'AC-6: a 403-refused resolve must leave notes.json byte-identical on disk')
  } finally {
    await stopServe(child)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-7 / AC-20260907-10-21
// ---------------------------------------------------------------------------
test('AC-20260907-10-7 / AC-20260907-10-21: GET /client/__notes/list?screen=** over one question, one client-origin note, one session-origin note and one walk note returns exactly the question and the client-origin note; GET /__notes/list?screen=** (non-client) CONTINUES TO return all four', async () => {
  const dir = tmpdir('client-route-list')
  const question = { id: 'N001', scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'session', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'question', ledgerId: 'W1', answer: null }
  const clientNote = baseNote('N002', { origin: 'client' })
  const sessionNote = baseNote('N003', { origin: 'session' })
  const walkNote = baseNote('N004', { kind: 'walk', reason: 'no-path-back' })
  writeNotesFile(dir, [question, clientNote, sessionNote, walkNote])
  const port = await freePort()
  const child = await startServe(dir, port)
  try {
    const clientList = await getJson('http://127.0.0.1:' + port + '/client/__notes/list?screen=**')
    assert.strictEqual(clientList.status, 200, 'AC-7: GET /client/__notes/list?screen=** must answer 200: got ' + clientList.status)
    const clientIds = (clientList.body || []).map((n) => n.id).sort()
    assert.deepStrictEqual(clientIds, ['N001', 'N002'],
      'AC-7: the client route\'s /__notes/list?screen=** must return exactly the question (N001) and the client-origin note (N002), never the session-origin or walk notes: got ' + JSON.stringify(clientIds))

    const plainList = await getJson('http://127.0.0.1:' + port + '/__notes/list?screen=**')
    assert.strictEqual(plainList.status, 200, 'AC-21: GET /__notes/list?screen=** (non-client) must answer 200: got ' + plainList.status)
    const plainIds = (plainList.body || []).map((n) => n.id).sort()
    assert.deepStrictEqual(plainIds, ['N001', 'N002', 'N003', 'N004'],
      'AC-21: the non-client route\'s /__notes/list?screen=** must CONTINUE TO return all four notes regardless of origin: got ' + JSON.stringify(plainIds))
  } finally {
    await stopServe(child)
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-8
// ---------------------------------------------------------------------------
test('AC-20260907-10-8: captureScreen resolves {hash} equal to the fixture\'s sha256 hex under a PATH whose npx copies a fixture PNG to its last argument, and has invoked npx with the exact D5 argv; with an npx that exits 1 it rejects naming npx playwright install chromium', async () => {
  const dir = tmpdir('client-capture-lib')
  const argvLog = path.join(dir, 'argv.log')
  const goodPath = stubNpxCapture(dir, { exitCode: 0, argvLogFile: argvLog })
  const outPath = path.join(dir, 'shot.png')
  const originalPath = process.env.PATH
  process.env.PATH = goodPath
  let result
  try {
    result = await clientCaptureLib.captureScreen({ port: 4173, label: 'signin', state: 'error', viewport: { width: 1280, height: 800 }, out: outPath })
  } finally {
    process.env.PATH = originalPath
  }
  assert.strictEqual(result && result.hash, sha256(PNG_FIXTURE_BYTES),
    'AC-8: captureScreen must resolve { hash } equal to the fixture PNG\'s sha256 hex: got ' + JSON.stringify(result))
  const argvLine = fs.existsSync(argvLog) ? fs.readFileSync(argvLog, 'utf8').trim() : ''
  assert.strictEqual(argvLine,
    '--no-install playwright screenshot --viewport-size=1280,800 http://127.0.0.1:4173/mocks/signin.html?clean&state=error ' + outPath,
    'AC-8: captureScreen must invoke npx with the exact D5 argv: got ' + JSON.stringify(argvLine))

  const failPath = stubNpxCapture(dir, { exitCode: 1 })
  process.env.PATH = failPath
  try {
    await assert.rejects(
      () => clientCaptureLib.captureScreen({ port: 4173, label: 'signin', state: null, viewport: { width: 1280, height: 800 }, out: path.join(dir, 'shot2.png') }),
      /npx playwright install chromium/,
      'AC-8: with a failing npx, captureScreen must reject naming "npx playwright install chromium"')
  } finally {
    process.env.PATH = originalPath
  }
})

// ---------------------------------------------------------------------------
// AC-20260907-10-9
// ---------------------------------------------------------------------------
test('AC-20260907-10-9: POST /client/__notes/add with scope "mock" under the PNG-copying npx stub answers 201 with capture.before.hash equal to the fixture sha256 and capture.before.file "captures/<id>.before.png", that file exists beside notes.json with no .pending-* file left; under an npx that exits 1 it answers 503 and notes.json stays byte-identical', async () => {
  const dir = tmpdir('client-route-capture-add')
  writeNotesFile(dir, [])
  const goodPath = stubNpxCapture(dir, { exitCode: 0 })
  const port = await freePort()
  const child = await startServe(dir, port, { env: { ...process.env, PATH: goodPath } })
  try {
    const r = await postJson('http://127.0.0.1:' + port + '/client/__notes/add', { scope: 'mock', screen: 'signin', state: 'error', text: 'the button is the wrong color', by: 'Ren' })
    assert.strictEqual(r.status, 201, 'AC-9: a mock-scope client-route add under a working capture stub must answer 201: got ' + r.status + ' ' + JSON.stringify(r.body))
    const id = r.body && r.body.id
    assert.ok(id, 'AC-9: the created note must carry an id: got ' + JSON.stringify(r.body))
    assert.strictEqual(r.body.capture && r.body.capture.before && r.body.capture.before.hash, sha256(PNG_FIXTURE_BYTES),
      'AC-9: capture.before.hash must equal the fixture PNG\'s sha256: got ' + JSON.stringify(r.body.capture))
    assert.strictEqual(r.body.capture && r.body.capture.before && r.body.capture.before.file, 'captures/' + id + '.before.png',
      'AC-9: capture.before.file must read "captures/' + id + '.before.png": got ' + JSON.stringify(r.body.capture))
    const capturesDir = path.join(dir, 'design/mocks/captures')
    assert.ok(fs.existsSync(path.join(capturesDir, id + '.before.png')),
      'AC-9: captures/' + id + '.before.png must exist beside notes.json')
    const entries = fs.existsSync(capturesDir) ? fs.readdirSync(capturesDir) : []
    assert.ok(!entries.some((f) => f.startsWith('.pending-')),
      'AC-9: no .pending-* file may remain in design/mocks/captures/ once the add completes: got ' + JSON.stringify(entries))
  } finally {
    await stopServe(child)
  }

  const failPath = stubNpxCapture(dir, { exitCode: 1 })
  const port2 = await freePort()
  const child2 = await startServe(dir, port2, { env: { ...process.env, PATH: failPath } })
  try {
    const before = fs.readFileSync(notesPath(dir), 'utf8')
    const r2 = await postJson('http://127.0.0.1:' + port2 + '/client/__notes/add', { scope: 'mock', screen: 'invite', state: 'error', text: 'x', by: 'Ren' })
    assert.strictEqual(r2.status, 503, 'AC-9: a mock-scope client-route add under a failing capture must answer 503: got ' + r2.status + ' ' + JSON.stringify(r2.body))
    const after = fs.readFileSync(notesPath(dir), 'utf8')
    assert.strictEqual(after, before, 'AC-9: a 503 capture failure must write no note — notes.json must stay byte-identical')
  } finally {
    await stopServe(child2)
  }
})
