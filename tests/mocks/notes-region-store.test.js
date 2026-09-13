'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, withHandler } = require('../helpers')

// spec/scripts/lib/mocks-notes.js (MODIFY) + spec/scripts/design-atlas.js (MODIFY) —
// specs/20260912/11-a-note-can-mark-an-area.md D2/D3, AC-20260912-11-4/-5/-6/-7/-8/-9. The
// `region` object below is lifted verbatim from the spec's own Contracts block. Does NOT touch
// NotesAnchor.capture/resolve themselves (tests/mocks/notes-anchor.test.js), the overlay/card/
// composer DOM (Chrome-gated, tests/mocks/notes-layer-region.test.js), or doctrine prose
// (tests/mocks/notes-region-doctrine.test.js).

const NOTES_LIB = path.join(SPEC, 'scripts/lib/mocks-notes.js')
const ANCHOR_LIB = path.join(SPEC, 'scripts/lib/notes-anchor.browser.js')

const VALID_REGION = {
  drawnAt: { w: 1180 },
  anchor: { path: [4], tag: 'section', snippet: 'Riverside clinic Next slot today, 3:40 pm Northg' },
  frac: { x: 0.34, y: 0.01, w: 0.66, h: 0.97 },
  layout: { arrangement: 'row', aspect: 3.42 },
  touched: [
    { i: 1, snippet: 'Northgate clinic Next slot tomorrow, 9:10 am' },
    { i: 2, snippet: 'Home visit Available Thursdays' },
  ],
}

function addBody(overrides) {
  return Object.assign({ scope: 'mock', screen: 'booking', state: 'default', text: 'note text', by: 'JJ' }, overrides)
}

function baseStoredNote(id, overrides) {
  return Object.assign({
    id, scope: 'mock', screen: 'booking', state: 'default', text: 't', by: 'JJ',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null,
    resolvedBy: null, resolvedAt: null,
  }, overrides)
}

function writeMock(dir, label) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/' + label + '.html'),
    '<!doctype html><html><body><main data-screen-label="' + label + '">hi</main></body></html>')
}

function writeNotesOf(dir, notes) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/notes.json'), JSON.stringify(notes, null, 2) + '\n')
}

function readNotesOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/notes.json'), 'utf8'))
}

test('AC-20260912-11-4: addNote stores a mock-scope region verbatim, refuses a region on a project-scope body, and refuses a malformed region field', () => {
  const { addNote } = require(NOTES_LIB)

  const { note } = addNote([], addBody({ region: VALID_REGION }))
  assert.deepStrictEqual(note.region, VALID_REGION,
    'a mock-scope note\'s region must be stored verbatim — a coerced or silently dropped field breaks every reader that trusts the Contracts shape')

  assert.throws(() => addNote([], addBody({ scope: 'project', screen: null, state: null, region: VALID_REGION })),
    /region is allowed only on scope "mock"/,
    'a project-scope body carrying a region must be refused by name — the field must never be silently accepted or silently dropped on the wrong scope')

  const badFrac = Object.assign({}, VALID_REGION, { frac: Object.assign({}, VALID_REGION.frac, { w: 0 }) })
  assert.throws(() => addNote([], addBody({ region: badFrac })),
    /region\.frac/,
    'a region whose frac.w is 0 must be refused naming region.frac — a stored zero-width box can never be drawn, and addNote must never store a malformed region')
})

test('AC-20260912-11-5: validateNotes reports exactly one error naming region.anchor.path for a malformed path, and no error at all for a note carrying no region', () => {
  const { validateNotes } = require(NOTES_LIB)

  const badPathRegion = Object.assign({}, VALID_REGION, { anchor: Object.assign({}, VALID_REGION.anchor, { path: '4' }) })
  const withBadPath = baseStoredNote('N001', { region: badPathRegion })
  const { errors } = validateNotes([withBadPath])
  assert.strictEqual(errors.length, 1,
    'a note whose region.anchor.path is a string, not an array, must report exactly one error, not zero and not several: got ' + JSON.stringify(errors))
  assert.match(errors[0], /field "region\.anchor\.path"/,
    'the error must name field "region.anchor.path" — naming the wrong field sends the fix to the wrong place: got ' + JSON.stringify(errors))

  const noRegion = baseStoredNote('N002')
  assert.deepStrictEqual(validateNotes([noRegion]).errors, [],
    'a note carrying no region field at all must report no error — region stays optional per D2, and its absence must never be treated as a shape violation')
})

test('AC-20260912-11-6: a served mock injects the anchor script before the notes script, GET /__notes/anchor.js answers with the anchor file\'s own bytes, and POST /__notes/add with a region is stored and answered 201', async () => {
  const dir = tmpdir('notes-region-serve')
  writeMock(dir, 'booking')

  await withHandler(dir, async ({ get, post }) => {
    const page = await get('/mocks/booking.html')
    assert.strictEqual(page.status, 200, 'GET /mocks/booking.html must serve the mock: ' + page.body)
    const anchorIdx = page.body.indexOf('/__notes/anchor.js')
    const notesIdx = page.body.indexOf('/__notes/notes.js')
    assert.ok(anchorIdx !== -1,
      'the served page must carry a <script src=".../__notes/anchor.js"> tag: ' + page.body)
    assert.ok(notesIdx !== -1,
      'the served page must still carry its existing <script src=".../__notes/notes.js"> tag: ' + page.body)
    assert.ok(anchorIdx < notesIdx,
      'the anchor script tag must be injected BEFORE the notes script tag — the layer calls into the NotesAnchor global, which must already be defined: ' + page.body)

    const anchorFile = await get('/__notes/anchor.js')
    assert.strictEqual(anchorFile.status, 200,
      'GET /__notes/anchor.js must answer 200 — without this route the served layer has no NotesAnchor to mount: ' + anchorFile.body)
    const expectedBytes = fs.readFileSync(ANCHOR_LIB, 'utf8')
    assert.strictEqual(anchorFile.body, expectedBytes,
      'GET /__notes/anchor.js must answer with the anchor file\'s own bytes verbatim, exactly like /__notes/notes.js already does for the layer')

    const added = await post('/__notes/add', addBody({ text: 'two cards', region: VALID_REGION }))
    assert.strictEqual(added.status, 201, 'POST /__notes/add with a region must answer 201: ' + added.body)
    const addedNote = JSON.parse(added.body)
    assert.deepStrictEqual(addedNote.region, VALID_REGION,
      'the created note returned in the response must carry the posted region verbatim: ' + added.body)
    const onDisk = readNotesOf(dir).find((n) => n.id === addedNote.id)
    assert.ok(onDisk, 'the added note must actually be written to notes.json, not just echoed in the HTTP response')
    assert.deepStrictEqual(onDisk.region, VALID_REGION,
      'the region written to notes.json must match the posted region verbatim')
  })
})

test('AC-20260912-11-7: POST /__notes/region re-places an open note\'s box and threads "re-placed the box", refuses a resolved note by name, and 404s an unknown id', async () => {
  const dir = tmpdir('notes-region-replace')
  const openNote = baseStoredNote('N001', { region: VALID_REGION })
  const resolvedNote = baseStoredNote('N002', { region: VALID_REGION, status: 'resolved', resolvedBy: 'JJ', resolvedAt: new Date().toISOString() })
  writeNotesOf(dir, [openNote, resolvedNote])
  const NEW_REGION = Object.assign({}, VALID_REGION, { drawnAt: { w: 900 } })

  await withHandler(dir, async ({ post }) => {
    const ok = await post('/__notes/region', { id: 'N001', region: NEW_REGION, by: 'JJ' })
    assert.strictEqual(ok.status, 200, 'POST /__notes/region on an open note must answer 200: ' + ok.body)
    const okNote = JSON.parse(ok.body)
    assert.deepStrictEqual(okNote.region, NEW_REGION, 'the note\'s region must be replaced with the posted one: ' + ok.body)
    assert.ok(Array.isArray(okNote.thread) && okNote.thread.some((e) => e.text === 're-placed the box' && e.by === 'JJ'),
      're-placing must append a thread entry {text:"re-placed the box", by} — the card\'s history is the only record that the box moved: got ' + JSON.stringify(okNote.thread))

    const refused = await post('/__notes/region', { id: 'N002', region: NEW_REGION, by: 'JJ' })
    assert.strictEqual(refused.status, 400,
      'POST /__notes/region on a resolved note must answer 400 — a closed note\'s box must never move silently: ' + refused.body)
    assert.match(JSON.parse(refused.body).error, /re-placed only on an open or addressed note/,
      'the 400 must name the precondition it failed: ' + refused.body)

    const missing = await post('/__notes/region', { id: 'N999', region: NEW_REGION, by: 'JJ' })
    assert.strictEqual(missing.status, 404, 'POST /__notes/region on an unknown id must answer 404: ' + missing.body)
  })
})

test('AC-20260912-11-8: POST /__notes/delete removes an open plain note with an empty thread, and refuses (with the withdraw remedy) an addressed note, a note carrying a kind, or one with a non-empty thread', async () => {
  const dir = tmpdir('notes-region-delete')
  const plain = baseStoredNote('N001')
  const addressed = baseStoredNote('N002', { status: 'addressed', addressed: { at: new Date().toISOString(), change: 'c', ledgerRow: null } })
  const withKind = baseStoredNote('N003', { kind: 'question', ledgerId: 'A1', answer: null })
  const withThread = baseStoredNote('N004', { thread: [{ at: new Date().toISOString(), text: 'hi', by: 'JJ' }] })
  writeNotesOf(dir, [plain, addressed, withKind, withThread])

  await withHandler(dir, async ({ post }) => {
    const ok = await post('/__notes/delete', { id: 'N001', by: 'JJ' })
    assert.strictEqual(ok.status, 200, 'POST /__notes/delete on an open plain note with an empty thread must answer 200: ' + ok.body)
    assert.deepStrictEqual(JSON.parse(ok.body), { deleted: 'N001' }, 'the response must be {deleted:id}: ' + ok.body)
    assert.ok(!readNotesOf(dir).some((n) => n.id === 'N001'), 'the deleted note must actually be gone from notes.json')

    for (const [id, why] of [['N002', 'addressed'], ['N003', 'carries a kind'], ['N004', 'has a non-empty thread']]) {
      const refused = await post('/__notes/delete', { id, by: 'JJ' })
      assert.strictEqual(refused.status, 400,
        'POST /__notes/delete on a note that is ' + why + ' must answer 400, never remove it: ' + refused.body)
      assert.match(JSON.parse(refused.body).error, /withdraw it instead/,
        'the 400 must point at the remedy (withdraw) for a note that is ' + why + ': ' + refused.body)
      assert.ok(readNotesOf(dir).some((n) => n.id === id),
        'a note that is ' + why + ' must still be present on disk after a refused delete')
    }
  })
})

test('AC-20260912-11-9: on the session mount, POST /__notes/reopen threads the reason and reopens an addressed note, refuses empty text, and refuses an already-open note', async () => {
  const dir = tmpdir('notes-region-reopen')
  const priorAddressed = { at: new Date().toISOString(), change: 'redrew the header', ledgerRow: null }
  const addressedOk = baseStoredNote('N001', { status: 'addressed', addressed: priorAddressed })
  const addressedForEmpty = baseStoredNote('N002', { status: 'addressed', addressed: priorAddressed })
  const alreadyOpen = baseStoredNote('N003')
  writeNotesOf(dir, [addressedOk, addressedForEmpty, alreadyOpen])

  await withHandler(dir, async ({ post }) => {
    const ok = await post('/__notes/reopen', { id: 'N001', text: 'still wrong', by: 'JJ' })
    assert.strictEqual(ok.status, 200,
      'POST /__notes/reopen on the SESSION mount (no /client prefix) targeting an addressed note must answer 200 — D3 exposes this verb on the session mount too: ' + ok.body)
    const okNote = JSON.parse(ok.body)
    assert.strictEqual(okNote.status, 'open', 'a rejected note must read status "open" after reopen: ' + ok.body)
    assert.ok(Array.isArray(okNote.thread) && okNote.thread.some((e) => e.text === 'still wrong' && e.addressed && e.addressed.change === priorAddressed.change),
      'the thread must carry the reject text plus the prior addressed object, exactly as reopenNote already does for the client: got ' + JSON.stringify(okNote.thread))

    const emptyText = await post('/__notes/reopen', { id: 'N002', text: '', by: 'JJ' })
    assert.strictEqual(emptyText.status, 400,
      'POST /__notes/reopen with an empty text must answer 400, never reopen with no stated reason: ' + emptyText.body)
    assert.match(JSON.parse(emptyText.body).error, /say what is still wrong — text must be non-empty/,
      'the 400 must name the exact remedy text: ' + emptyText.body)

    const notAddressed = await post('/__notes/reopen', { id: 'N003', text: 'still wrong', by: 'JJ' })
    assert.strictEqual(notAddressed.status, 400,
      'POST /__notes/reopen on a note that is already "open" (never addressed) must answer 400: ' + notAddressed.body)
    assert.match(JSON.parse(notAddressed.body).error, /a note is rejected only while addressed/,
      'the 400 must name the exact precondition it failed: ' + notAddressed.body)
  })
})
