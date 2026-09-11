'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { tmpdir, freePort, serveAtlas, SPEC, getJson, postJson } = require('../helpers')
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
