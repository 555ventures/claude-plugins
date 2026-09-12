'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { tmpdir, freePort, serveAtlas, SPEC, getJson, postJson } = require('../helpers')
const {
  advanceToSeedDone, JOURNEY, LABELS, writeNotesFile, readNotesFile, writeFile, writeJSON,
  ledgerCmd, nowIso, stubNpxScreenshot,
} = require('./mocks-driver-fixtures')
const walkLib = require('../../spec/scripts/lib/mocks-walk')
const { appendAssumption, parseLedger } = require('../../spec/scripts/lib/mocks-ledger')

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

// ---------------------------------------------------------------------------
// AC-20260911-01-9
// ---------------------------------------------------------------------------
// D5 adds a refusal in front of confirmJourney; it must add no NEW refusal reason and change
// none of the 400/200/409 shapes for a journey that already carries zero unanswered questions
// (advanceToSeedDone alone writes no notes.json, so JOURNEY starts with none). CONTINUE-TO pin:
// true against both the pre-image (no gate at all) and the D5 build (gate open, count zero).
test('AC-20260911-01-9: POST /client/__walk/confirm on a declared journey with no unanswered question CONTINUES TO 400 an empty sentence, 200 a real one (a Japanese sentence included, client content unaffected by D1), and 409 an already-confirmed journey', async () => {
  const dir = tmpdir('client-confirm-no-guess')
  advanceToSeedDone(dir)
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const empty = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: '' })
    assert.strictEqual(empty.status, 400,
      'AC-9: confirm must CONTINUE TO 400 an empty sentence when no guess is open: got ' + empty.status + ' ' + JSON.stringify(empty.body))

    const sentence = '設定完了'
    const real = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence })
    assert.strictEqual(real.status, 200,
      'AC-9: confirm must CONTINUE TO 200 a real sentence — including a Japanese one, which is client content D1 never touches — when no guess is open: got ' + real.status + ' ' + JSON.stringify(real.body))
    assert.ok(real.body && real.body.confirmedAt,
      'AC-9: a successful confirm must CONTINUE TO record confirmedAt: got ' + JSON.stringify(real.body))
    assert.strictEqual(real.body && real.body.sentence, sentence,
      'AC-9: a successful confirm must CONTINUE TO record the sentence verbatim, Japanese included: got ' + JSON.stringify(real.body))

    const repeat = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'again' })
    assert.strictEqual(repeat.status, 409,
      'AC-9: confirm must CONTINUE TO 409 an already-confirmed journey: got ' + repeat.status + ' ' + JSON.stringify(repeat.body))
  } finally {
    await stop()
  }
})

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D2 — a wholly new client route
// (POST /client/__notes/reopen) and a wholly new refusal state on an existing one
// (POST /client/__walk/confirm's D1-derived-state 409). Both are unbuilt against the pre-image:
// every assertion below is red until D1 (lib/mocks-walk.js journeyState/unconfirmJourney) and D2
// land. AC-20260911-06-2, AC-20260911-06-3, AC-20260911-06-4, AC-20260911-06-5.
// ---------------------------------------------------------------------------

function baseNote(overrides) {
  return Object.assign({
    id: 'N000', scope: 'mock', screen: 'invite', state: null, text: 'a client note', by: 'client',
    at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'client',
  }, overrides)
}

// specs/20260911/06-the-client-loop.md AC-20260911-06-15 — a SHALL-CONTINUE-TO pin: this
// behavior is specs/20260907/10-client-review.md D5/D6 (before-frame capture) and D4 (resolve's
// resolution:'accepted') and predates this spec entirely. Sanctioned GREEN today, unlike every
// other test in this file — this spec touches neither the capture path nor the accepted-
// resolution write, and the pin exists so a future build can never silently regress either.
test('AC-20260911-06-15: POST /client/__notes/add on a mock-scope client note CONTINUES TO capture the before-frame first and answer 201 with capture.before, and POST /client/__notes/resolve on an addressed client note CONTINUES TO record resolution:\'accepted\'', async () => {
  const dir = tmpdir('client-continue-capture')
  advanceToSeedDone(dir)
  const stubPath = stubNpxScreenshot(dir, { bytes: Buffer.from('before-bytes') })
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port, env: Object.assign({}, process.env, { PATH: stubPath }) })
  try {
    const address = 'http://127.0.0.1:' + port
    const added = await postJson(address + '/client/__notes/add', { scope: 'mock', screen: LABELS[1], text: 'Says Submit', by: 'client' })
    assert.strictEqual(added.status, 201,
      'AC-15: a client mock-scope note must CONTINUE TO answer 201: got ' + added.status + ' ' + JSON.stringify(added.body))
    assert.ok(added.body && added.body.capture && added.body.capture.before && added.body.capture.before.hash,
      'AC-15: a client mock-scope note must CONTINUE TO carry capture.before (the before-frame captured first): got ' + JSON.stringify(added.body && added.body.capture))

    const noteId = added.body.id
    const notesOnDisk = readNotesFile(dir)
    const target = notesOnDisk.find((n) => n.id === noteId)
    target.status = 'addressed'
    target.addressed = { at: nowIso(), change: 'Button now says Send', ledgerRow: null }
    writeNotesFile(dir, notesOnDisk)

    const resolved = await postJson(address + '/client/__notes/resolve', { id: noteId, by: 'client' })
    assert.strictEqual(resolved.status, 200,
      'AC-15: resolving an addressed client note must CONTINUE TO answer 200: got ' + resolved.status + ' ' + JSON.stringify(resolved.body))
    assert.strictEqual(resolved.body && resolved.body.resolution, 'accepted',
      'AC-15: resolving an addressed client note must CONTINUE TO record resolution:"accepted": got ' + JSON.stringify(resolved.body))
  } finally {
    await stop()
  }
})


// ---------------------------------------------------------------------------
// specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D5 — the route's two pre-existing
// refusals must survive the new arm untouched. AC-20260912-02-10.
// ---------------------------------------------------------------------------
test('AC-20260912-02-10: POST /client/__notes/reopen CONTINUES TO 400 an open client-origin note naming "only an addressed note is reopened", and CONTINUES TO 400 an addressed note given empty text naming "reopen text must be non-empty"', async () => {
  const dir = tmpdir('client-reopen-continue')
  advanceToSeedDone(dir)
  const openNote = baseNote({ id: 'N030', status: 'open', origin: 'client' })
  const addressedNote = baseNote({
    id: 'N031', status: 'addressed', origin: 'client',
    addressed: { at: nowIso(), change: 'fixed it', ledgerRow: null },
  })
  writeNotesFile(dir, [openNote, addressedNote])

  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const address = 'http://127.0.0.1:' + port
    const openRes = await postJson(address + '/client/__notes/reopen', { id: 'N030', text: 'still wrong', by: 'client' })
    assert.strictEqual(openRes.status, 400,
      'AC-10: reopening an open note must CONTINUE TO 400 — D5 adds one arm for a resolved/' +
      'withdrawn note only, never widens the open-note refusal: got ' + openRes.status + ' ' + JSON.stringify(openRes.body))
    assert.match((openRes.body && openRes.body.error) || '', /only an addressed note is reopened/,
      'AC-10: the open-note refusal must CONTINUE TO name "only an addressed note is reopened": got ' + JSON.stringify(openRes.body))

    const emptyRes = await postJson(address + '/client/__notes/reopen', { id: 'N031', text: '', by: 'client' })
    assert.strictEqual(emptyRes.status, 400,
      'AC-10: reopening an addressed note with empty text must CONTINUE TO 400: got ' + emptyRes.status + ' ' + JSON.stringify(emptyRes.body))
    assert.match((emptyRes.body && emptyRes.body.error) || '', /reopen text must be non-empty/,
      'AC-10: the empty-text refusal must CONTINUE TO name "reopen text must be non-empty": got ' + JSON.stringify(emptyRes.body))
  } finally {
    await stop()
  }
})

