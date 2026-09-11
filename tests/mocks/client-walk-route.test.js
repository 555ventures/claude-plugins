'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { tmpdir, freePort, serveAtlas, SPEC } = require('../helpers')
const { advanceToSeedDone, JOURNEY, writeNotesFile, ledgerCmd, nowIso } = require('./mocks-driver-fixtures')

// specs/20260910/03-client-journey-player.md D5 (design-atlas.js's client-mount walk routes and
// /__walk/player.js) and D6 (the client-route answer promotion) are both unbuilt — every test
// below is red until they land. AC-20260910-03-5, -6, -10.
//
// Orchestrator duty (spec File Plan row): reuses tests/mocks/mocks-driver-fixtures.js's
// advanceToSeedDone (the seed alone is enough for the client mount to resolve "onboarding" as a
// declared journey — no drawn wireframe is required by any assertion here) rather than widening
// that shared file for this test's own routes.

function walkJsonPath(dir) { return path.join(dir, 'design/mocks/walk.json') }
function readWalkJson(dir) {
  try { return JSON.parse(fs.readFileSync(walkJsonPath(dir), 'utf8')) } catch { return null }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let body = null
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { body = null }
        resolve({ status: res.statusCode, headers: res.headers, body, text: Buffer.concat(chunks).toString('utf8') })
      })
    }).on('error', reject)
  })
}
function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload))
    const u = new URL(url)
    const req = http.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, (res) => {
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

// ---------------------------------------------------------------------------
// AC-20260910-03-5
// ---------------------------------------------------------------------------
test('AC-20260910-03-5: the served client mount answers the index and the player, 404s an unknown journey naming the declared ones, derives {reached,misses,confirmedAt,sentence,waived} for a journey with no walk.json record, records a miss event and a confirm on disk (400 empty / 200 real / 409 repeat), 404s a non-client /__walk/event write, and serves /__walk/player.js byte-verbatim with no-store', async () => {
  const dir = tmpdir('client-walk-route')
  advanceToSeedDone(dir)
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const base = 'http://127.0.0.1:' + port

    const index = await getJson(base + '/client/index.html')
    assert.strictEqual(index.status, 200, 'AC-5: GET /client/index.html must answer 200: got ' + index.status + ' ' + index.text)
    assert.match(index.text, /data-cl="journey"/, 'AC-5: the served client index must carry the D1 journey anchors: got ' + index.text)

    const player = await getJson(base + '/client/walk/' + JOURNEY + '.html')
    assert.strictEqual(player.status, 200, 'AC-5: GET /client/walk/' + JOURNEY + '.html must answer 200: got ' + player.status + ' ' + player.text)
    assert.match(player.text, /data-wk="frame"/, 'AC-5: the served player page must carry the D1 [data-wk="frame"]: got ' + player.text)

    const unknown = await getJson(base + '/client/walk/nope.html')
    assert.strictEqual(unknown.status, 404, 'AC-5: GET /client/walk/nope.html must 404: got ' + unknown.status)
    assert.match(unknown.text, new RegExp(JOURNEY), 'AC-5: the 404 must name the declared journey "' + JOURNEY + '": got ' + unknown.text)

    const state = await getJson(base + '/client/__walk/state?journey=' + JOURNEY)
    assert.strictEqual(state.status, 200, 'AC-5: GET /client/__walk/state?journey=' + JOURNEY + ' must answer 200: got ' + state.status)
    assert.deepStrictEqual(state.body, { reached: [], misses: [], confirmedAt: null, sentence: null, waived: null },
      'AC-5/D5: with no walk.json record yet, the state must derive the D5 empty default {reached:[],misses:[],confirmedAt:null,sentence:null,waived:null}: got ' + JSON.stringify(state.body))

    const missEvent = await postJson(base + '/client/__walk/event', { journey: JOURNEY, walk: 'miss', from: 'signin', target: 'button#help' })
    assert.strictEqual(missEvent.status, 200, 'AC-5: POST /client/__walk/event with a valid miss must answer 200: got ' + missEvent.status + ' ' + JSON.stringify(missEvent.body))
    const walkOnDisk = readWalkJson(dir)
    assert.ok(walkOnDisk && walkOnDisk.journeys && walkOnDisk.journeys[JOURNEY] &&
      walkOnDisk.journeys[JOURNEY].misses.some((m) => m.from === 'signin' && m.target === 'button#help'),
      'AC-5: the miss event must be recorded on disk in design/mocks/walk.json: got ' + JSON.stringify(walkOnDisk))

    const emptyConfirm = await postJson(base + '/client/__walk/confirm', { journey: JOURNEY, sentence: '' })
    assert.strictEqual(emptyConfirm.status, 400, 'AC-5: POST /client/__walk/confirm with an empty sentence must answer 400: got ' + emptyConfirm.status + ' ' + JSON.stringify(emptyConfirm.body))

    const realConfirm = await postJson(base + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'done and done' })
    assert.strictEqual(realConfirm.status, 200, 'AC-5: POST /client/__walk/confirm with a real sentence must answer 200: got ' + realConfirm.status + ' ' + JSON.stringify(realConfirm.body))
    const confirmedOnDisk = readWalkJson(dir)
    assert.ok(confirmedOnDisk && confirmedOnDisk.journeys[JOURNEY] && confirmedOnDisk.journeys[JOURNEY].confirmedAt,
      'AC-5: a successful confirm must record confirmedAt in design/mocks/walk.json: got ' + JSON.stringify(confirmedOnDisk))

    const repeatConfirm = await postJson(base + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'again' })
    assert.strictEqual(repeatConfirm.status, 409, 'AC-5: confirming an already-confirmed journey again must answer 409: got ' + repeatConfirm.status + ' ' + JSON.stringify(repeatConfirm.body))

    const nonClientWrite = await postJson(base + '/__walk/event', { journey: JOURNEY, walk: 'miss', from: 'signin', target: 'x' })
    assert.strictEqual(nonClientWrite.status, 404, 'AC-5/D5: a non-client POST /__walk/event must 404 — the walk record is written only from the client route: got ' + nonClientWrite.status)

    const badToFrom = await postJson(base + '/client/__walk/event', { journey: JOURNEY, walk: 'to', from: 'nope-screen', to: 'invite' })
    assert.strictEqual(badToFrom.status, 400, 'AC-5/D5: a "to" event whose `from` is not a label declared on the journey must 400 — the D5 malformed-body/unknown-label rule binds `from` too: got ' + badToFrom.status + ' ' + JSON.stringify(badToFrom.body))
    const walkAfterBadTo = readWalkJson(dir)
    assert.ok(!(walkAfterBadTo && walkAfterBadTo.journeys[JOURNEY] && walkAfterBadTo.journeys[JOURNEY].reached.includes('nope-screen')),
      'AC-5/D5: a rejected "to" event must never reach recordEvent — the bogus `from` "nope-screen" must not appear in reached on disk: got ' + JSON.stringify(walkAfterBadTo))

    const badMissFrom = await postJson(base + '/client/__walk/event', { journey: JOURNEY, walk: 'miss', from: 'nope-screen', target: 'x' })
    assert.strictEqual(badMissFrom.status, 400, 'AC-5/D5: a "miss" event whose `from` is not a label declared on the journey must 400: got ' + badMissFrom.status + ' ' + JSON.stringify(badMissFrom.body))
    const walkAfterBadMiss = readWalkJson(dir)
    assert.ok(!(walkAfterBadMiss && walkAfterBadMiss.journeys[JOURNEY] &&
      walkAfterBadMiss.journeys[JOURNEY].misses.some((m) => m.from === 'nope-screen')),
      'AC-5/D5: a rejected "miss" event must never reach recordEvent — the bogus `from` "nope-screen" must not appear in misses on disk: got ' + JSON.stringify(walkAfterBadMiss))

    const playerJs = await getJson(base + '/__walk/player.js')
    assert.strictEqual(playerJs.status, 200, 'AC-5: GET /__walk/player.js must answer 200: got ' + playerJs.status)
    assert.strictEqual(playerJs.headers['cache-control'], 'no-store', 'AC-5: /__walk/player.js must be served with cache-control: no-store: got ' + JSON.stringify(playerJs.headers))
    const libSrc = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
    assert.strictEqual(playerJs.text, libSrc, 'AC-5: /__walk/player.js must serve lib/walk.browser.js byte-verbatim: bytes differ')
  } finally {
    await stop()
  }
})

// ---------------------------------------------------------------------------
// AC-20260910-03-6 / AC-20260910-03-10
// ---------------------------------------------------------------------------
test('AC-20260910-03-6: POST /client/__notes/answer with verdict "no" and non-empty text over an inferred/open ledger row promotes it — 200 with promoted naming a new row, W7 flips to overridden <today>, and a new CLIENT/product/said-by-user row reads confirmed <today> naming "corrects W7"; AC-20260910-03-10: the SAME body on the non-client /__notes/answer route CONTINUES TO write only W7\'s overridden status, appending no row', async () => {
  const claimText = '配送先は3つまで'

  const dir = tmpdir('client-answer-promote')
  advanceToSeedDone(dir)
  const rowResult = ledgerCmd(dir, 'add', ['--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', claimText, '--tag', 'inferred', '--status', 'open'])
  assert.strictEqual(rowResult.status, 0, 'test setup requires the W7 ledger row to be accepted: ' + rowResult.stderr)
  writeNotesFile(dir, [{
    id: 'N003', scope: 'mock', screen: 'signin', state: null, text: claimText, by: 'session', at: nowIso(),
    status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'question', ledgerId: 'W7', answer: null,
  }])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  const today = new Date().toISOString().slice(0, 10)
  try {
    const r = await postJson('http://127.0.0.1:' + port + '/client/__notes/answer', { id: 'N003', verdict: 'no', text: claimText, by: 'client' })
    assert.strictEqual(r.status, 200, 'AC-6: the client-route answer must accept: got ' + r.status + ' ' + JSON.stringify(r.body))
    assert.ok(r.body && typeof r.body.promoted === 'string' && r.body.promoted,
      'AC-6: the 200 response must carry "promoted" naming the new row id: got ' + JSON.stringify(r.body))
    const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
    assert.match(ledgerText, new RegExp('\\| W7 \\|.*overridden ' + today.replace(/-/g, '\\-')),
      'AC-6: W7\'s row must flip to "overridden ' + today + '": got\n' + ledgerText)
    const newRowRe = new RegExp('\\| ' + r.body.promoted + ' \\| CLIENT \\| product \\| ' + claimText + ' \\| said-by-user \\| confirmed ' +
      today.replace(/-/g, '\\-') + ' \\| - \\| - \\| corrects W7 \\|')
    assert.match(ledgerText, newRowRe,
      'AC-6: a new CLIENT/product/said-by-user row must read "confirmed ' + today + '" and note "corrects W7": got\n' + ledgerText)
  } finally {
    await stop()
  }

  const dir2 = tmpdir('nonclient-answer-no-promote')
  advanceToSeedDone(dir2)
  const rowResult2 = ledgerCmd(dir2, 'add', ['--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', claimText, '--tag', 'inferred', '--status', 'open'])
  assert.strictEqual(rowResult2.status, 0, 'test setup requires the second host\'s W7 ledger row to be accepted: ' + rowResult2.stderr)
  writeNotesFile(dir2, [{
    id: 'N003', scope: 'mock', screen: 'signin', state: null, text: claimText, by: 'session', at: nowIso(),
    status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'question', ledgerId: 'W7', answer: null,
  }])
  const port2 = await freePort()
  const { stop: stop2 } = await serveAtlas(dir2, { port: port2 })
  try {
    const r2 = await postJson('http://127.0.0.1:' + port2 + '/__notes/answer', { id: 'N003', verdict: 'no', text: claimText, by: 'session' })
    assert.strictEqual(r2.status, 200, 'AC-10: the non-client answer must CONTINUE TO accept: got ' + r2.status + ' ' + JSON.stringify(r2.body))
    assert.strictEqual(r2.body && r2.body.promoted, undefined,
      'AC-10: the non-client route must CONTINUE TO carry no "promoted" field: got ' + JSON.stringify(r2.body))
    const ledgerText2 = fs.readFileSync(path.join(dir2, 'design/mocks/ledger.md'), 'utf8')
    assert.match(ledgerText2, new RegExp('\\| W7 \\|.*overridden ' + today.replace(/-/g, '\\-')),
      'AC-10: W7\'s row must CONTINUE TO flip to "overridden ' + today + '": got\n' + ledgerText2)
    assert.ok(!/\| CLIENT \|/.test(ledgerText2),
      'AC-10: the non-client route must CONTINUE TO append no new row (no "| CLIENT |" row) — promotion is client-route-only: got\n' + ledgerText2)
  } finally {
    await stop2()
  }
})
