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

test('AC-20260911-06-2: POST /client/__notes/reopen turns an addressed client-origin note back open with the prior addressed object threaded, and refuses every other shape by the Contracts\' own literals', async () => {
  const dir = tmpdir('client-notes-reopen')
  advanceToSeedDone(dir)
  const addressedAt = nowIso()
  writeNotesFile(dir, [
    baseNote({ id: 'N003', status: 'addressed', addressed: { at: addressedAt, change: 'Button now says Send', ledgerRow: null } }),
    baseNote({ id: 'N002', status: 'open' }),
    baseNote({ id: 'N004', status: 'addressed', origin: 'session', addressed: { at: addressedAt, change: 'session fix', ledgerRow: null } }),
    baseNote({ id: 'N005', status: 'addressed', addressed: { at: addressedAt, change: 'fixed', ledgerRow: null } }),
  ])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const ok = await postJson('http://127.0.0.1:' + port + '/client/__notes/reopen',
      { id: 'N003', text: 'Still says Submit on mobile', by: 'client' })
    assert.strictEqual(ok.status, 200,
      'AC-2: reopening an addressed client-origin note must answer 200 — the client\'s own return leg is unbuilt: got ' + ok.status + ' ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.status, 'open',
      'AC-2: a reopened note must carry status "open": got ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.addressed, null,
      'AC-2: a reopened note must null its addressed field: got ' + JSON.stringify(ok.body))
    assert.ok(Array.isArray(ok.body && ok.body.thread) && ok.body.thread.length === 1,
      'AC-2: a reopened note must carry exactly one thread entry: got ' + JSON.stringify(ok.body && ok.body.thread))
    const entry = ok.body.thread[0]
    assert.strictEqual(entry.text, 'Still says Submit on mobile',
      'AC-2: the thread entry must carry the client\'s reopen text: got ' + JSON.stringify(entry))
    assert.strictEqual(entry.by, 'client',
      'AC-2: the thread entry must be stamped by:"client": got ' + JSON.stringify(entry))
    assert.deepStrictEqual(entry.addressed, { at: addressedAt, change: 'Button now says Send', ledgerRow: null },
      'AC-2: the thread entry must carry the prior addressed object verbatim, so the client\'s history is never lost: got ' + JSON.stringify(entry))

    const openRefused = await postJson('http://127.0.0.1:' + port + '/client/__notes/reopen',
      { id: 'N002', text: 'still wrong', by: 'client' })
    assert.strictEqual(openRefused.status, 400,
      'AC-2: reopening an already-open note must 400 — it names an open note as its own precondition: got ' + openRefused.status + ' ' + JSON.stringify(openRefused.body))
    assert.match(openRefused.body && openRefused.body.error || '', /open/,
      'AC-2: the open-note refusal must name "open": got ' + JSON.stringify(openRefused.body))

    const sessionRefused = await postJson('http://127.0.0.1:' + port + '/client/__notes/reopen',
      { id: 'N004', text: 'still wrong', by: 'client' })
    assert.strictEqual(sessionRefused.status, 400,
      'AC-2: reopening a session-origin note must 400 — the client route reopens only client-origin notes: got ' + sessionRefused.status + ' ' + JSON.stringify(sessionRefused.body))
    assert.match(sessionRefused.body && sessionRefused.body.error || '', /session-origin/,
      'AC-2: the session-origin refusal must name "session-origin": got ' + JSON.stringify(sessionRefused.body))

    const emptyText = await postJson('http://127.0.0.1:' + port + '/client/__notes/reopen',
      { id: 'N005', text: '', by: 'client' })
    assert.strictEqual(emptyText.status, 400,
      'AC-2: reopening with empty text must 400 — a reopen with nothing said is not a request: got ' + emptyText.status + ' ' + JSON.stringify(emptyText.body))

    const unknown = await postJson('http://127.0.0.1:' + port + '/client/__notes/reopen',
      { id: 'N99', text: 'x', by: 'client' })
    assert.strictEqual(unknown.status, 404,
      'AC-2: reopening an unknown id must 404: got ' + unknown.status + ' ' + JSON.stringify(unknown.body))

    const nonClient = await postJson('http://127.0.0.1:' + port + '/__notes/reopen',
      { id: 'N005', text: 'x', by: 'client' })
    assert.strictEqual(nonClient.status, 404,
      'AC-2: POST /__notes/reopen off the client mount must 404 — reopen is a client-only control: got ' + nonClient.status + ' ' + JSON.stringify(nonClient.body))
  } finally {
    await stop()
  }
})

test('AC-20260911-06-3: POST /client/__notes/add on a mock-scope screen takes back a currently-confirmed journey\'s OK into one history entry, and a second such note appends no second entry', async () => {
  const dir = tmpdir('client-notes-add-unconfirms')
  advanceToSeedDone(dir)
  const confirmedAt = nowIso()
  const walk = walkLib.confirmJourney({ journeys: {} }, { journey: JOURNEY, sentence: 'Looks right', at: confirmedAt })
  walkLib.writeWalk(dir, walk)
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const first = await postJson('http://127.0.0.1:' + port + '/client/__notes/add',
      { scope: 'mock', screen: LABELS[1], text: 'The invite button should say Send, not Submit', by: 'client' })
    assert.strictEqual(first.status, 201,
      'AC-3: a client mock-scope note must still be accepted: got ' + first.status + ' ' + JSON.stringify(first.body))
    const walkAfterFirst = readWalkJson(dir)
    const recAfterFirst = walkAfterFirst && walkAfterFirst.journeys && walkAfterFirst.journeys[JOURNEY]
    assert.strictEqual(recAfterFirst && recAfterFirst.confirmedAt, null,
      'AC-3: a client request on a confirmed journey must take the OK back (null confirmedAt) — the request/OK contradiction rule is unbuilt: got ' + JSON.stringify(recAfterFirst))
    assert.ok(Array.isArray(recAfterFirst && recAfterFirst.history) && recAfterFirst.history.length === 1,
      'AC-3: the take-back must append exactly one history entry: got ' + JSON.stringify(recAfterFirst && recAfterFirst.history))
    assert.strictEqual(recAfterFirst.history[0].cause, first.body.id,
      'AC-3: the history entry\'s cause must name the new note\'s id: got ' + JSON.stringify(recAfterFirst.history[0]) + ' vs note id ' + first.body.id)

    const second = await postJson('http://127.0.0.1:' + port + '/client/__notes/add',
      { scope: 'mock', screen: LABELS[1], text: 'Also the color is wrong', by: 'client' })
    assert.strictEqual(second.status, 201,
      'AC-3: a second client note must still be accepted: got ' + second.status + ' ' + JSON.stringify(second.body))
    const walkAfterSecond = readWalkJson(dir)
    const recAfterSecond = walkAfterSecond && walkAfterSecond.journeys && walkAfterSecond.journeys[JOURNEY]
    assert.strictEqual((recAfterSecond && recAfterSecond.history || []).length, 1,
      'AC-3: a second client note on an already-unconfirmed journey must append no second history entry (unconfirmJourney is a no-op on an unconfirmed journey): got ' + JSON.stringify(recAfterSecond && recAfterSecond.history))
  } finally {
    await stop()
  }
})

test('AC-20260911-06-4: POST /client/__walk/confirm refuses 409 while the journey\'s derived state is changes-requested or fixed, and succeeds once the blocking note is resolved', async () => {
  const dir = tmpdir('client-confirm-derived-state')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [baseNote({ id: 'N003', screen: LABELS[1], status: 'open' })])
  // A prior take-back is already on record — journeyState reads confirmedAt, not history.
  walkLib.writeWalk(dir, {
    journeys: {
      [JOURNEY]: {
        reached: [], misses: [], confirmedAt: null, sentence: null, waived: null, lastEventAt: null,
        history: [{ confirmedAt: nowIso(), sentence: 'ok', clearedAt: nowIso(), cause: 'N003' }],
      },
    },
  })
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const openBlocked = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right now' })
    assert.strictEqual(openBlocked.status, 409,
      'AC-4: confirm must 409 while a client note is open — the derived-state gate is unbuilt: got ' + openBlocked.status + ' ' + JSON.stringify(openBlocked.body))
    assert.match(openBlocked.body && openBlocked.body.error || '', /1 request\(s\) still open or waiting for your check/,
      'AC-4: the 409 must name the exact count-and-reason sentence the Contracts block gives: got ' + JSON.stringify(openBlocked.body))

    const notes1 = readNotesFile(dir)
    notes1.find((n) => n.id === 'N003').status = 'addressed'
    notes1.find((n) => n.id === 'N003').addressed = { at: nowIso(), change: 'Button now says Send', ledgerRow: null }
    writeNotesFile(dir, notes1)
    const addressedBlocked = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right now' })
    assert.strictEqual(addressedBlocked.status, 409,
      'AC-4: confirm must ALSO 409 while the client note is only addressed, not yet accepted by the client: got ' + addressedBlocked.status + ' ' + JSON.stringify(addressedBlocked.body))
    assert.match(addressedBlocked.body && addressedBlocked.body.error || '', /1 request\(s\) still open or waiting for your check/,
      'AC-4: the addressed-state 409 must carry the same sentence: got ' + JSON.stringify(addressedBlocked.body))

    const notes2 = readNotesFile(dir)
    notes2.find((n) => n.id === 'N003').status = 'resolved'
    writeNotesFile(dir, notes2)
    const fresh = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right now' })
    assert.strictEqual(fresh.status, 200,
      'AC-4: once resolved and the confirmation was previously taken back, confirm must succeed (the "already confirmed" 409 no longer applies once confirmedAt is null): got ' + fresh.status + ' ' + JSON.stringify(fresh.body))
    assert.ok(fresh.body && fresh.body.confirmedAt,
      'AC-4: a successful confirm after a take-back must record a fresh confirmedAt: got ' + JSON.stringify(fresh.body))
  } finally {
    await stop()
  }
})

// specs/20260911/06-the-client-loop.md D15 (amended, JJ's ruling 2026-09-11): a journey is
// listed only when its page exists on disk — every declared screen has a
// design/mocks/<label>.html — never when status.json's `walked` flag says so. The `Coming soon`
// string, the `data-ready` attribute, and the `<span data-cl="journey">` not-ready branch are
// retired outright: an unready journey renders NO row of any kind, linked or not.
test('AC-20260911-06-5: GET /client/index.html lists a journey only when its declared screens exist on disk as design/mocks/<label>.html, never by status.json\'s walked flag, and a --reopen-cleared walked flag leaves an on-disk journey still linked', async () => {
  const dir = tmpdir('client-index-ready')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Ready Test

## Journeys
### onboarding
Mika signs in.
\`\`\`surfaces
signin
\`\`\`

### billing
Mika checks a plan.
\`\`\`surfaces
plan
\`\`\`
`)
  writeFile(path.join(dir, 'design/mocks/signin.html'), '<main data-screen-label="signin">signin</main>\n')
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const res = await getJson('http://127.0.0.1:' + port + '/client/index.html')
    assert.strictEqual(res.status, 200, 'AC-5: GET /client/index.html must answer 200: got ' + res.status)
    // D23 (amended AC-5): the journey card is a container, not a link — `[data-cl="journey"]` is
    // now an `<li>` that CONTAINS a link to the walk page, never an `<a>` itself.
    const rows = res.text.match(/<li[^>]*data-cl="journey"[^>]*>/g) || []
    assert.strictEqual(rows.length, 1,
      'AC-5: exactly one journey (onboarding, whose screen exists on disk) must render as a <li data-cl="journey"> row — the disk-derived ready set is unbuilt: got\n' + res.text)
    assert.match(res.text, /href="\/client\/walk\/onboarding\.html"/,
      'AC-5: the onboarding card must contain a link to /client/walk/onboarding.html (D23: the card is a container, not a link): got\n' + res.text)
    assert.doesNotMatch(res.text, /billing/i,
      'AC-5: billing has no drawn screen and must be absent from the page entirely — D15 retires the not-ready row, not just its link: got\n' + res.text)
    assert.doesNotMatch(res.text, /Coming soon/,
      'AC-5: "Coming soon" is retired in the same build: got\n' + res.text)
    assert.doesNotMatch(res.text, /data-ready/,
      'AC-5: the data-ready attribute is retired in the same build: got\n' + res.text)
    assert.doesNotMatch(res.text, /<span[^>]*data-cl="journey"/,
      'AC-5: the <span data-cl="journey"> not-ready branch is retired in the same build: got\n' + res.text)

    // D15's own executed proof: --reopen walk:<j> clears status.json's per-journey walked flag
    // while the drawn mocks stay on disk — the client must still see onboarding as a linked row.
    writeJSON(path.join(dir, 'design/mocks/status.json'), { journeys: { onboarding: { walked: false } } })
    const res2 = await getJson('http://127.0.0.1:' + port + '/client/index.html')
    const rows2 = res2.text.match(/<li[^>]*data-cl="journey"[^>]*>/g) || []
    assert.strictEqual(rows2.length, 1,
      'AC-5: a --reopen-cleared walked flag must not remove onboarding from the list — the page still exists on disk, so `walked` is not consulted: got\n' + res2.text)
  } finally {
    await stop()
  }
})

// specs/20260911/06-the-client-loop.md D16 (new): the route half — resolveNote's existing
// `withdrawn` resolution and the WITHDRAW_REASONS enum, exercised here through the served
// route the client's own "Never mind" control posts to. Green pre-change on the mechanism
// (specs/20260910/05's D3 shipped it); red on the consequence D16 adds — a withdrawn note must
// stop blocking confirm the same way a resolved one already does.
test('AC-20260911-06-16: POST /client/__notes/resolve withdraws an open client-origin note (200, resolution:"withdrawn"), and a subsequent POST /client/__walk/confirm on that journey succeeds instead of 409', async () => {
  const dir = tmpdir('client-notes-withdraw-confirm')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [baseNote({ id: 'N010', screen: LABELS[1], status: 'open' })])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const blocked = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right' })
    assert.strictEqual(blocked.status, 409,
      'AC-16 setup: confirm must 409 while the note this test withdraws is still open — otherwise the withdraw never has anything to unblock: got ' + blocked.status + ' ' + JSON.stringify(blocked.body))

    const withdrawn = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve',
      { id: 'N010', by: 'client', reason: 'not-needed' })
    assert.strictEqual(withdrawn.status, 200,
      'AC-16: withdrawing an open client-origin note through the served client route must answer 200: got ' + withdrawn.status + ' ' + JSON.stringify(withdrawn.body))
    assert.strictEqual(withdrawn.body && withdrawn.body.resolution, 'withdrawn',
      'AC-16: withdrawing an open note must record resolution:"withdrawn": got ' + JSON.stringify(withdrawn.body))

    const confirmed = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm', { journey: JOURNEY, sentence: 'Looks right' })
    assert.strictEqual(confirmed.status, 200,
      'AC-16: once the blocking note is withdrawn, confirm must succeed rather than 409 — a note left "open" would still report changes-requested and re-block it: got ' + confirmed.status + ' ' + JSON.stringify(confirmed.body))
    assert.ok(confirmed.body && confirmed.body.confirmedAt,
      'AC-16: a successful confirm after a withdraw must record a fresh confirmedAt: got ' + JSON.stringify(confirmed.body))
  } finally {
    await stop()
  }
})
