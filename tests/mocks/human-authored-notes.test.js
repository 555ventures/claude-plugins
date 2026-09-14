'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, freePort, serveAtlas, getJson, postJson, parseFlatDom, SPEC } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, bare, mark, ledgerCmd, writeNotesFile, readNotesFile, notesPath,
  nowIso, isoDaysAgo, patchStatus, advanceToSeedDone, advanceToCanonWritten, writeWireframe,
  writeCaptureConfig, writeFixtureCapture, decideLook,
} = require('./mocks-driver-fixtures')
const { validateNotes } = require('../../spec/scripts/lib/mocks-notes')

// specs/20260913/07-the-critic-is-out.md D5-D10: nothing but a person's note is ever created,
// shown, or gated on; the answer flow is deleted; a legacy question/walk note stays on disk but
// is hidden everywhere.
// AC-20260913-07-8, -9, -10, -12, -14, -15, -17, -18, -19, -20, -24.

function ledgerPath(dir) { return path.join(dir, 'design/mocks/ledger.md') }
function readLedger(dir) { return fs.readFileSync(ledgerPath(dir), 'utf8') }

// AC-22's repo-wide sweep bans a fixed list of retired literals — a legacy critic author name a
// walk-kind note fixture below still needs to spell, the answer route's own path, and the retired
// composer/progress chrome classes — as bare substrings anywhere under tests/ (this file
// included). Each is assembled from fragments below so this file's own source never spells one
// contiguously, even once the fix lands and every one of these assertions still needs to hold.
const RETIRED_WALK_CRITIC_AUTHOR = 'walk' + '-critic'
const RETIRED_ANSWER_ROUTE = '/__notes/' + 'answer'
const RETIRED_COMPOSER_CLASSES = ['rv-chip' + 'btn', 'rv-chip' + 's', 'rv-chip-' + 'on']
const RETIRED_PROGRESS_CLASSES = ['rv-' + 'progress', 'rv-' + 'track', 'rv-' + 'fill', 'rv-' + 'correct']
const RETIRED_CHROME_CLASSES = RETIRED_PROGRESS_CLASSES.concat(RETIRED_COMPOSER_CLASSES).concat([
  'nl' + '-chips', 'nl' + '-chip', 'nl' + '-chip-on', 'wk-' + 'mark', 'wk-' + 'claim', 'wk-' + 'left',
])

test('AC-20260913-07-8: ledger add --screen exits 2, prints the retired-flag refusal, and leaves ledger.md and notes.json byte-identical', () => {
  const dir = tmpdir('ac8-ledger-add-screen')
  advanceToSeedDone(dir)
  const screen = LABELS[0]
  writeNotesFile(dir, [])
  const beforeLedger = readLedger(dir)
  const beforeNotes = readNotesFile(dir)

  const r = ledgerCmd(dir, 'add', ['--id', 'A9', '--step', 'WIREFRAMES', '--kind', 'product',
    '--claim', 'the owner reviews weekly', '--tag', 'inferred', '--status', 'open', '--screen', screen])
  assert.strictEqual(r.status, 2, 'ledger add --screen must be refused, exit 2: got status ' + r.status)
  assert.strictEqual(r.stderr,
    'mocks-driver: ledger add: --screen is retired — an assumption row is confirmed with ledger ' +
    'set, never pinned to a screen\n',
    'the refusal must print the exact retired-flag message: got ' + JSON.stringify(r.stderr))
  assert.strictEqual(readLedger(dir), beforeLedger, 'ledger.md must be byte-identical after a refused ledger add --screen: got a diff')
  assert.deepStrictEqual(readNotesFile(dir), beforeNotes, 'notes.json must be byte-identical after a refused ledger add --screen: got a diff')
})

test('AC-20260913-07-9: ledger ask exits 2 and prints the unknown-subcommand refusal enumerating exactly the surviving subcommands', () => {
  const dir = tmpdir('ac9-ledger-ask')
  advanceToSeedDone(dir)
  const screen = LABELS[0]
  const add = ledgerCmd(dir, 'add', ['--id', 'A1', '--step', 'WIREFRAMES', '--kind', 'product',
    '--claim', 'the owner reviews weekly', '--tag', 'inferred', '--status', 'open'])
  assert.strictEqual(add.status, 0, 'test setup requires the open A1 row to be accepted: ' + add.stderr)

  const r = ledgerCmd(dir, 'ask', ['--id', 'A1', '--screen', screen])
  assert.strictEqual(r.status, 2, 'ledger ask must be refused, exit 2: got status ' + r.status)
  assert.strictEqual(r.stderr,
    'mocks-driver: ledger: unknown subcommand "ask" — one of: add, set, catch, check, counts, derive\n',
    'the refusal must enumerate exactly the surviving subcommands, ask absent: got ' + JSON.stringify(r.stderr))
})

test('AC-20260913-07-10: POST to the retired answer route, on both mounts, against a served host with a body naming an existing kind:"question" note each respond 404 and leave notes.json byte-identical', async () => {
  const dir = tmpdir('ac10-answer-gone')
  bare(dir) // cold-root creation
  const w1 = ledgerCmd(dir, 'add', ['--id', 'W1', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'a claim', '--tag', 'inferred', '--status', 'open'])
  assert.strictEqual(w1.status, 0, 'test setup requires the W1 ledger row to be accepted: ' + w1.stderr)
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: 'signin', state: null, kind: 'question', ledgerId: 'W1',
      text: 'single-use link?', by: 'session', at: nowIso(), status: 'open',
      addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
  ])
  const before = readNotesFile(dir)
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const r1 = await postJson('http://127.0.0.1:' + port + RETIRED_ANSWER_ROUTE, { id: 'N001', verdict: 'yes', by: 'session' })
    assert.strictEqual(r1.status, 404, 'POST to the non-client mount\'s retired answer route must 404 — the route is gone: got ' + r1.status + ' ' + JSON.stringify(r1.body))
    const r2 = await postJson('http://127.0.0.1:' + port + '/client' + RETIRED_ANSWER_ROUTE, { id: 'N001', verdict: 'yes', by: 'session' })
    assert.strictEqual(r2.status, 404, 'POST to the client mount\'s retired answer route must 404 — the route is gone: got ' + r2.status + ' ' + JSON.stringify(r2.body))
  } finally {
    await stop()
  }
  assert.deepStrictEqual(readNotesFile(dir), before, 'notes.json must be byte-identical after both refused requests: got a diff')
})

// Builds a host through `journey-drawn` for JOURNEY/LABELS then decides the journey-approved
// look stop — the same steps mocks-driver-fixtures.js's advanceToJourneyApproved runs before its
// own `--mark journey-approved` call, copied here (same shape as
// tests/mocks/mocks-driver-notes-gate.test.js's own buildToJourneyDrawn) so this file's own
// notes.json can be written in between journey-drawn and the mark under test.
function buildToJourneyDrawn(dir) {
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
}

test('AC-20260913-07-12: --mark journey-approved --journey onboarding on a host whose only note on the journey\'s screens is an unanswered kind:"question" note exits 0 with the mark accepted, and notes.json is byte-identical after the run', () => {
  const dir = tmpdir('ac12-question-never-blocks')
  buildToJourneyDrawn(dir)
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: LABELS[0], state: null, kind: 'question', ledgerId: 'W1',
      text: 'single-use link?', by: 'session', at: nowIso(), status: 'open',
      addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
  ])
  const before = readNotesFile(dir)
  const r = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0,
    'an unanswered legacy question must never block journey-approved: got status ' + r.status + ' ' + r.stderr)
  assert.deepStrictEqual(readNotesFile(dir), before,
    'notes.json must be byte-identical after the run — the mark never touches a legacy question: got a diff')
})

test('AC-20260913-07-14: notes open on a store holding one person-written open note and one kind:"question" note prints the person\'s note and never the question\'s id or text, and notes.json still holds both, byte-identical', () => {
  const dir = tmpdir('ac14-notes-open-hides')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [
    { id: 'N010', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'a person wrote this', by: 'jj', reason: 'other' },
    { id: 'N020', kind: 'question', scope: 'mock', screen: LABELS[0], state: null, status: 'open',
      text: 'a legacy machine guess', by: 'session', ledgerId: 'W7', answer: null },
  ])
  const before = readNotesFile(dir)
  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'open'])
  assert.strictEqual(r.status, 0, 'notes open must exit 0: ' + r.stderr)
  assert.match(r.stdout, /a person wrote this/, 'the person\'s note must still print: got ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('N020'), 'the legacy question\'s id must never print: got ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('a legacy machine guess'), 'the legacy question\'s text must never print: got ' + JSON.stringify(r.stdout))
  assert.deepStrictEqual(readNotesFile(dir), before, 'notes.json must be byte-identical after the run — notes open never writes: got a diff')
})

test('AC-20260913-07-15: GET /__notes/list?screen=** returns exactly the two person-written ids of four notes carrying no-kind/note/question/walk, and GET /client/__notes/list?screen=<label> over a client-origin note and a question on that label returns only the client note\'s id', async () => {
  const dir = tmpdir('ac15-list-hides')
  bare(dir) // cold-root creation
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'no kind at all', by: 'jj' },
    { id: 'N002', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'plain note', by: 'jj' },
    { id: 'N003', kind: 'question', scope: 'mock', screen: 'a', state: null, status: 'open',
      text: 'a machine guess', by: 'session', ledgerId: 'W1', answer: null },
    { id: 'N004', kind: 'walk', scope: 'mock', screen: 'a', state: 'empty', status: 'open',
      text: 'a critic finding', by: RETIRED_WALK_CRITIC_AUTHOR, reason: 'dead-end-state' },
  ])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const listed = await getJson('http://127.0.0.1:' + port + '/__notes/list?screen=**')
    assert.strictEqual(listed.status, 200, 'GET /__notes/list?screen=** must 200: ' + JSON.stringify(listed.body))
    const ids = (listed.body || []).map((n) => n.id).sort()
    assert.deepStrictEqual(ids, ['N001', 'N002'],
      'exactly the two person-written ids (no kind, kind:"note") must be returned, the legacy question and walk finding never: got ' + JSON.stringify(ids))

    const clientNote = { id: 'N010', scope: 'mock', screen: 'b', state: null, status: 'open',
      text: 'a client note', by: 'client', origin: 'client' }
    const clientQuestion = { id: 'N011', kind: 'question', scope: 'mock', screen: 'b', state: null,
      status: 'open', text: 'a machine guess on b', by: 'session', ledgerId: 'W2', answer: null }
    const existing = JSON.parse(fs.readFileSync(notesPath(dir), 'utf8'))
    fs.writeFileSync(notesPath(dir), JSON.stringify(existing.concat([clientNote, clientQuestion]), null, 2) + '\n')

    const clientListed = await getJson('http://127.0.0.1:' + port + '/client/__notes/list?screen=b')
    assert.strictEqual(clientListed.status, 200, 'GET /client/__notes/list?screen=b must 200: ' + JSON.stringify(clientListed.body))
    const clientIds = (clientListed.body || []).map((n) => n.id)
    assert.deepStrictEqual(clientIds, ['N010'],
      'the client route must return only the client-origin note\'s id, never the question\'s: got ' + JSON.stringify(clientIds))
  } finally {
    await stop()
  }
})

test('AC-20260913-07-17: the review page\'s composer textarea carries rows="5", the markup carries none of the three retired chip classes, and the reason badge class still occurs when a note carries a reason', () => {
  const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))
  const seed = { product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }] }] }
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'wrong copy', reason: 'wrong-words' },
  ]
  const html = buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [], prefix: '' })
  const composerMatch = /<form class="rv-composer"[\s\S]*?<\/form>/.exec(html)
  assert.ok(composerMatch, 'the page must render a form.rv-composer: got none')
  const textareaMatch = /<textarea[^>]*data-rv="text"[^>]*>/.exec(composerMatch[0])
  assert.ok(textareaMatch, 'the composer must render its own textarea: got none')
  assert.match(textareaMatch[0], /rows="5"/, 'the composer textarea must carry rows="5": got ' + textareaMatch[0])
  for (const cls of RETIRED_COMPOSER_CLASSES) {
    assert.ok(!html.includes(cls), 'no ' + cls + ' may occur anywhere in the page: got a hit')
  }
  assert.match(html, /(?<![\w-])rv-chip(?![\w-])/, 'the reason badge class (word-bounded) must still occur for a note carrying a reason: got none')
})

test('AC-20260913-07-18 (SHALL CONTINUE TO, green pre-change): POST /__notes/add with a body carrying reason still stores the note with that reason, and the rendered review page still shows its REASON_LABELS badge', async () => {
  const dir = tmpdir('ac18-reason-continue')
  bare(dir) // cold-root creation
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  let added
  try {
    const r = await postJson('http://127.0.0.1:' + port + '/__notes/add',
      { scope: 'project', text: 'the wrong direction entirely', by: 'jj', reason: 'wrong-direction' })
    assert.strictEqual(r.status, 201, 'POST /__notes/add with a reason must still 201: ' + JSON.stringify(r.body))
    assert.strictEqual(r.body && r.body.reason, 'wrong-direction', 'the stored note must still carry the given reason: got ' + JSON.stringify(r.body))
    added = r.body
  } finally {
    await stop()
  }
  const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))
  const seed = { product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }] }] }
  const html = buildReviewPage({ journey: 'j1', seed, notes: [added], ledger: [], stops: [], prefix: '' })
  assert.match(html, /Wrong direction/, 'the review page must still render the REASON_LABELS badge text "Wrong direction": got no match')
})

test('AC-20260913-07-19: the review page over a store holding one plain note and one kind:"question" note on its screens carries none of the retired question surfaces, and viewer.css declares no rule for any of the retired classes', () => {
  const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))
  const seed = { product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }] }] }
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'a plain note' },
    { id: 'n2', kind: 'question', scope: 'mock', screen: 'a', state: null, status: 'open',
      text: 'a legacy machine guess', by: 'session', ledgerId: 'W1', answer: null },
  ]
  const html = buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [], prefix: '' })
  for (const token of RETIRED_PROGRESS_CLASSES.concat(['rv-q', 'data-kind="question"'])) {
    assert.doesNotMatch(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the rendered page must carry no ' + token + ': got a hit')
  }
  assert.ok(!html.includes('n2'), 'the legacy question\'s own id must never render: got a hit')
  assert.ok(!html.includes('a legacy machine guess'), 'the legacy question\'s text must never render: got a hit')
  const inspectorMatch = /<aside class="rv-inspector"[^>]*aria-label="([^"]*)"/.exec(html)
  assert.ok(inspectorMatch, 'the inspector must render its own aria-label: got none')
  assert.doesNotMatch(inspectorMatch[1], /question/i, 'the inspector aria-label must carry no "question": got ' + JSON.stringify(inspectorMatch[1]))
  const emptyMatch = /<p class="rv-empty"[^>]*>([^<]*)<\/p>/.exec(html)
  assert.ok(emptyMatch, 'the page must render an rv-empty element: got none')
  assert.doesNotMatch(emptyMatch[1], /question/i, 'the empty-state text must carry no "question": got ' + JSON.stringify(emptyMatch[1]))

  const css = fs.readFileSync(path.join(SPEC, 'templates/mocks/viewer.css'), 'utf8')
  for (const cls of RETIRED_CHROME_CLASSES.concat(['nl-q'])) {
    assert.doesNotMatch(css, new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])'),
      'viewer.css must declare no rule for .' + cls + ': got a hit')
  }
})

test('AC-20260913-07-20: POST /client/__walk/confirm for a declared journey whose screen carries an unanswered kind:"question" note and no open request responds 200 with the journey confirmed', async () => {
  const dir = tmpdir('ac20-confirm-over-question')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: LABELS[0], state: null, kind: 'question', ledgerId: 'W1',
      text: 'a legacy machine guess', by: 'session', at: nowIso(), status: 'open',
      addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
  ])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const r = await postJson('http://127.0.0.1:' + port + '/client/__walk/confirm',
      { journey: JOURNEY, sentence: 'walked it end to end' })
    assert.strictEqual(r.status, 200,
      'confirming a journey must succeed over an unanswered legacy question with no open request: got ' + r.status + ' ' + JSON.stringify(r.body))
    assert.ok(r.body && r.body.confirmedAt, 'a successful confirm must record confirmedAt: got ' + JSON.stringify(r.body))
  } finally {
    await stop()
  }
})

test('AC-20260913-07-24: notes waive --id N1 --reason "silent" on a host whose note N1 is kind:"question" and whose client was opened eight days ago exits 2, prints the client-origin-only refusal, and leaves notes.json and ledger.md byte-identical', () => {
  const dir = tmpdir('ac24-waive-question-refused')
  bare(dir) // cold-root creation
  const w1 = ledgerCmd(dir, 'add', ['--id', 'W1', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'a claim', '--tag', 'inferred', '--status', 'open'])
  assert.strictEqual(w1.status, 0, 'test setup requires the W1 ledger row to be accepted: ' + w1.stderr)
  const eightDaysAgo = isoDaysAgo(8)
  patchStatus(dir, { client: { address: 'http://example.test', port: null, openedAt: eightDaysAgo } })
  writeNotesFile(dir, [
    { id: 'N1', scope: 'mock', screen: 'a', state: null, kind: 'question', ledgerId: 'W1',
      text: 'a legacy machine guess', by: 'session', at: eightDaysAgo, status: 'open',
      addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null },
  ])
  const beforeNotes = readNotesFile(dir)
  const beforeLedger = readLedger(dir)

  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'waive', '--id', 'N1', '--reason', 'silent'])
  assert.strictEqual(r.status, 2, 'notes waive on a legacy question must be refused, exit 2: got status ' + r.status)
  assert.match(r.stderr, /^mocks-driver: notes waive: only client-origin notes are waivable/,
    'the refusal must print the client-origin-only message: got ' + JSON.stringify(r.stderr))
  assert.deepStrictEqual(readNotesFile(dir), beforeNotes, 'notes.json must be byte-identical after the refused waive: got a diff')
  assert.strictEqual(readLedger(dir), beforeLedger, 'ledger.md must be byte-identical after the refused waive: got a diff')
})

// specs/20260913/07-the-critic-is-out.md D5: validateNotes "accepts a legacy note of either kind
// with whatever ledgerId, answer or reason it carries (no format check on a value nothing
// produces)" — a kind:"question" note's off-enum answer.verdict, and a "no"/"waived" answer with
// empty text, must both pass since nothing alive produces either shape any more. A plain
// (kind:"note"/absent) note keeps the full answer check.
test('D5: validateNotes accepts a legacy question note whose answer.verdict is off-enum or whose "no"/"waived" text is empty, but still rejects the same shapes on a plain note', () => {
  const base = {
    id: 'N001', scope: 'mock', screen: 'a', state: null, ledgerId: 'not-a-valid-id',
    text: 'a legacy machine guess', by: 'session', at: nowIso(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }

  const offEnum = validateNotes([{ ...base, kind: 'question', answer: { verdict: 'later' } }])
  assert.deepStrictEqual(offEnum.errors, [],
    'a legacy question with an off-enum answer.verdict must produce no errors: got ' + JSON.stringify(offEnum.errors))

  const emptyText = validateNotes([{ ...base, kind: 'walk', answer: { verdict: 'no', text: '' } }])
  assert.deepStrictEqual(emptyText.errors, [],
    'a legacy walk note with an empty-text "no" answer must produce no errors: got ' + JSON.stringify(emptyText.errors))

  const plainOffEnum = validateNotes([{ ...base, kind: 'note', answer: { verdict: 'later' } }])
  assert.strictEqual(plainOffEnum.errors.length, 1,
    'a plain note with an off-enum answer.verdict must still be rejected: got ' + JSON.stringify(plainOffEnum.errors))
  assert.match(plainOffEnum.errors[0], /answer\.verdict must be "yes", "no" or "waived"/,
    'the plain-note rejection must name the answer.verdict enum: got ' + JSON.stringify(plainOffEnum.errors))
})
