'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, withHandler, parseFlatDom, read, ROOT, SPEC } = require('../helpers')
const { SCRIPT, writeNotesFile, readNotesFile } = require('./mocks-driver-fixtures')
const notesLib = require('../../spec/scripts/lib/mocks-notes')
const { buildReviewPage } = require('../../spec/scripts/lib/review-page')

// specs/20260913/05-a-note-is-a-conversation.md D1-D4, D7 —
// AC-20260913-05-1, -2, -4, -5, -6, -9, -11, -12, -15.

function nowIso() { return new Date().toISOString() }

// withHandler's own `post` resolves { status, headers, body } with `body` as the raw response
// TEXT (unlike helpers.js's separate postJson, which parses it) — this file's own AC-2/-5 read
// `.body.status`/`.body.error`, so wrap it here rather than widen the shared helper's contract.
function jsonPost(post) {
  return async (p, obj) => {
    const r = await post(p, obj)
    return { ...r, body: JSON.parse(r.body) }
  }
}

test('AC-20260913-05-1: turnOf derives session/you/done/dropped from status/resolution/addressed/reply alone', () => {
  assert.strictEqual(typeof notesLib.turnOf, 'function',
    'lib/mocks-notes.js must export turnOf — D1\'s one derivation of whose turn it is: got ' + typeof notesLib.turnOf)
  assert.strictEqual(notesLib.turnOf({ status: 'open' }), 'session',
    'a plain open note with no addressed/reply must derive turn "session" (waiting on the session)')
  assert.strictEqual(notesLib.turnOf({ status: 'open', reply: 'x' }), 'you',
    'an open note carrying a legacy reply must derive turn "you" (waiting on the owner)')
  assert.strictEqual(notesLib.turnOf({ status: 'addressed', addressed: { change: 'x' } }), 'you',
    'an addressed note must derive turn "you"')
  assert.strictEqual(notesLib.turnOf({ status: 'resolved' }), 'done',
    'a resolved note with no resolution field must derive turn "done" — a missing resolution is not a special case')
  assert.strictEqual(notesLib.turnOf({ status: 'resolved', resolution: 'waived' }), 'done',
    'a resolved+waived note must derive turn "done" — a waived client note is simply finished, nothing new')
  assert.strictEqual(notesLib.turnOf({ status: 'resolved', resolution: 'withdrawn' }), 'dropped',
    'a resolved+withdrawn note must derive turn "dropped" — Reject is final and hidden')
})

test('AC-20260913-05-2: the session mount\'s POST /__notes/reopen accepts a reply on an open note as often as asked and refuses only a resolved note, folding a legacy reply into the thread', async () => {
  const dir = tmpdir('ac2-reopen')
  writeNotesFile(dir, [
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'n1 text', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'n2 text', by: 'jj', kind: 'note',
      at: nowIso(), status: 'resolved', addressed: null, reply: null, resolvedBy: 'session', resolvedAt: nowIso() },
    { id: 'N3', scope: 'mock', screen: 'a', state: null, text: 'n3 text', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: 'we changed it', resolvedBy: null, resolvedAt: null },
  ])
  await withHandler(dir, async ({ post: rawPost }) => {
    const post = jsonPost(rawPost)
    const first = await post('/__notes/reopen', { id: 'N1', by: 'jj', text: 'still wrong' })
    assert.strictEqual(first.status, 200,
      'the first reply to an open note must be accepted with 200 — a person may reply to any note that is not resolved: got ' + first.status + ' ' + first.body)
    assert.strictEqual(first.body.status, 'open', 'a reopened note must end status "open": got ' + JSON.stringify(first.body))
    assert.strictEqual(Array.isArray(first.body.thread) && first.body.thread.length, 1,
      'the first reply must append exactly one thread entry: got ' + JSON.stringify(first.body.thread))

    const second = await post('/__notes/reopen', { id: 'N1', by: 'jj', text: 'still wrong' })
    assert.strictEqual(second.status, 200,
      'a second reply to the SAME note (now open again) must also be accepted with 200 — the owner may reply as often as they like: got ' + second.status)
    assert.strictEqual(second.body.thread.length, 2,
      'the second reply must append a second thread entry, ending with a two-entry thread: got ' + JSON.stringify(second.body.thread))

    const third = await post('/__notes/reopen', { id: 'N2', by: 'jj', text: 'still wrong' })
    assert.strictEqual(third.status, 400,
      'a reply to a resolved note must be refused 400 — a resolved note takes no reply: got ' + third.status)
    assert.strictEqual(third.body.error, 'a resolved note takes no reply',
      'the refusal must name the exact remedy sentence: got ' + JSON.stringify(third.body))

    const fold = await post('/__notes/reopen', { id: 'N3', by: 'jj', text: 'still wrong' })
    assert.strictEqual(fold.status, 200, 'a reply to an open note carrying a legacy reply must be accepted: got ' + fold.status)
    assert.strictEqual(fold.body.reply, null,
      'reopenNote must null the legacy reply field once it is folded into the thread: got ' + JSON.stringify(fold.body.reply))
    assert.deepStrictEqual(fold.body.thread[0].addressed, { change: 'we changed it' },
      'the folded legacy reply must land as the new entry\'s addressed.change: got ' + JSON.stringify(fold.body.thread))
  })
})

test('AC-20260913-05-4: notes reply is deleted — the CLI refuses it as an unknown subcommand and no tracked file under spec/ mentions replyNote or notes reply', () => {
  const dir = tmpdir('ac4-notes-reply-gone')
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'x', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
  ])
  const before = readNotesFile(dir)
  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'reply', '--id', 'N001', '--text', 'x'])
  assert.strictEqual(r.status, 2,
    'notes reply must exit 2 as an unknown subcommand — D3 deletes the verb entirely: got status ' + r.status + ' ' + r.stderr)
  assert.match(r.stderr, /one of: open, add, address, waive/,
    'the refusal must enumerate exactly the surviving subcommands (reply absent): got ' + JSON.stringify(r.stderr))
  assert.deepStrictEqual(readNotesFile(dir), before,
    'notes.json must be byte-identical after a refused notes reply: got a diff')

  const literal1 = 'reply' + 'Note'
  const literal2 = 'notes ' + 'reply'
  function grepTrackedSpec(literal) {
    try {
      const out = execFileSync('git', ['grep', '-n', '-F', literal, '--', 'spec/'], { cwd: ROOT, encoding: 'utf8' })
      return out.split('\n').filter(Boolean)
    } catch (e) {
      if (e.status === 1) return []
      throw e
    }
  }
  const hits1 = grepTrackedSpec(literal1)
  const hits2 = grepTrackedSpec(literal2)
  assert.deepStrictEqual(hits1, [],
    'no tracked file under spec/ may mention "' + literal1 + '" any more (D3 deletes the export): got ' + JSON.stringify(hits1))
  assert.deepStrictEqual(hits2, [],
    'no tracked file under spec/ may mention "' + literal2 + '" any more (D3 deletes the subcommand): got ' + JSON.stringify(hits2))
})

test('AC-20260913-05-5: the session mount\'s POST /__notes/resolve requires verdict accepted or withdrawn, writes resolution accordingly, and 400s (leaving the file byte-identical) on a missing or unknown verdict', async () => {
  const dir = tmpdir('ac5-resolve-verdict')
  const notes = [
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'n1', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'n2', by: 'jj', kind: 'note',
      at: nowIso(), status: 'addressed', addressed: { at: nowIso(), change: 'x', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N3', scope: 'mock', screen: 'a', state: null, text: 'n3', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
  ]
  writeNotesFile(dir, notes)
  await withHandler(dir, async ({ post: rawPost }) => {
    const post = jsonPost(rawPost)
    const accepted = await post('/__notes/resolve', { id: 'N1', by: 'jj', verdict: 'accepted' })
    assert.strictEqual(accepted.status, 200, 'verdict "accepted" must be accepted: got ' + accepted.status)
    assert.strictEqual(readNotesFile(dir).find((n) => n.id === 'N1').resolution, 'accepted',
      'N1 must be written with resolution:"accepted": got ' + JSON.stringify(readNotesFile(dir).find((n) => n.id === 'N1')))

    const withdrawn = await post('/__notes/resolve', { id: 'N2', by: 'jj', verdict: 'withdrawn' })
    assert.strictEqual(withdrawn.status, 200, 'verdict "withdrawn" must be accepted: got ' + withdrawn.status)
    assert.strictEqual(readNotesFile(dir).find((n) => n.id === 'N2').resolution, 'withdrawn',
      'N2 must be written with resolution:"withdrawn": got ' + JSON.stringify(readNotesFile(dir).find((n) => n.id === 'N2')))

    const beforeMissing = readNotesFile(dir)
    const missing = await post('/__notes/resolve', { id: 'N3', by: 'jj' })
    assert.strictEqual(missing.status, 400, 'no verdict at all must be refused 400: got ' + missing.status)
    assert.strictEqual(missing.body.error, 'verdict must be one of accepted, withdrawn',
      'the refusal must name the exact remedy sentence: got ' + JSON.stringify(missing.body))
    assert.deepStrictEqual(readNotesFile(dir), beforeMissing, 'notes.json must be byte-identical after a refused resolve with no verdict: got a diff')

    const beforeMaybe = readNotesFile(dir)
    const maybe = await post('/__notes/resolve', { id: 'N3', by: 'jj', verdict: 'maybe' })
    assert.strictEqual(maybe.status, 400, 'an unknown verdict must be refused 400: got ' + maybe.status)
    assert.strictEqual(maybe.body.error, 'verdict must be one of accepted, withdrawn',
      'the refusal must name the exact remedy sentence for an unknown verdict too: got ' + JSON.stringify(maybe.body))
    assert.deepStrictEqual(readNotesFile(dir), beforeMaybe, 'notes.json must be byte-identical after a refused resolve with verdict "maybe": got a diff')
  })
})

test('AC-20260913-05-6: a dropped (resolved+withdrawn) note is omitted from the session mount\'s GET /__notes/list and from the review page\'s rows', async () => {
  const dir = tmpdir('ac6-dropped-hidden')
  const dropped = { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'dropped', by: 'jj', kind: 'note',
    at: nowIso(), status: 'resolved', resolution: 'withdrawn', addressed: null, reply: null, resolvedBy: 'jj', resolvedAt: nowIso() }
  const open = { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'open one', by: 'jj', kind: 'note',
    at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  writeNotesFile(dir, [dropped, open])
  await withHandler(dir, async ({ get }) => {
    const r = await get('/__notes/list?screen=a')
    const body = JSON.parse(r.body)
    assert.strictEqual(body.length, 1,
      'GET /__notes/list must return only the non-dropped note — a dropped note stays on disk but is never listed: got ' + JSON.stringify(body))
    assert.strictEqual(body[0].id, 'N2', 'the one returned note must be the open one, not the dropped one: got ' + JSON.stringify(body))
  })

  const seed = { product: 'P', viewportWidth: 1280, viewportHeight: 800, journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }] }] }
  const html = buildReviewPage({ journey: 'j1', seed, notes: [dropped, open], ledger: [], stops: [], prefix: '' })
  const { document } = parseFlatDom(html)
  const rows = document.querySelectorAll('[data-rv="row"]')
  assert.strictEqual(rows.length, 1,
    'the review page must render exactly one [data-rv="row"] — a dropped note gets no row at all, not merely a hidden one: got ' + rows.length)
  assert.strictEqual(rows[0].getAttribute('data-id'), 'N2', 'the one rendered row must be the open note: got ' + rows[0].getAttribute('data-id'))
})

test('AC-20260913-05-9: the review page shows the newest message on each row — Addressed:, Session:, and You: … waiting for the session', () => {
  const seed = { product: 'P', viewportWidth: 1280, viewportHeight: 800, journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }, { label: 'b', states: [] }, { label: 'c', states: [] }] }] }
  const notes = [
    { id: 'n1', scope: 'mock', screen: 'a', state: null, status: 'addressed', addressed: { change: 'moved the button' }, text: 'the button', reason: 'other' },
    { id: 'n2', scope: 'mock', screen: 'b', state: null, status: 'open', reply: 'which button?', text: 'the button question', reason: 'other' },
    { id: 'n3', scope: 'mock', screen: 'c', state: null, status: 'open', thread: [{ text: 'bigger', by: 'jj' }], text: 'make it bigger', reason: 'other' },
  ]
  const html = buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [], prefix: '' })

  function rowSlice(id) {
    const startRe = new RegExp('<article[^>]*data-id="' + id + '"[^>]*>')
    const m = startRe.exec(html)
    assert.ok(m, 'setup: a row for ' + id + ' must render — got no match')
    const end = html.indexOf('</article>', m.index) + '</article>'.length
    return html.slice(m.index, end)
  }

  assert.match(rowSlice('n1'), /Addressed: moved the button/,
    'an addressed note\'s row must show "Addressed: moved the button": got ' + JSON.stringify(rowSlice('n1')))
  assert.match(rowSlice('n2'), /Session: which button\?/,
    'an open note carrying a legacy reply must show "Session: which button?": got ' + JSON.stringify(rowSlice('n2')))
  assert.match(rowSlice('n3'), /You: bigger.*waiting for the session/,
    'an open note whose thread is non-empty must show "You: bigger · waiting for the session": got ' + JSON.stringify(rowSlice('n3')))
})

test('AC-20260913-05-11: notes open lists only the notes whose turn is the session\'s, appends the newest thread reply, and never prints "↳ changed:"', () => {
  const dir = tmpdir('ac11-notes-open')
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'plain open', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N002', scope: 'mock', screen: 'a', state: null, text: 'addressed one', by: 'jj', kind: 'note',
      at: nowIso(), status: 'addressed', addressed: { at: nowIso(), change: 'fixed it', ledgerRow: null }, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N003', scope: 'mock', screen: 'a', state: null, text: 'has a reply', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: 'a reply', resolvedBy: null, resolvedAt: null },
    { id: 'N004', scope: 'mock', screen: 'a', state: null, text: 'threaded open', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
      thread: [{ at: nowIso(), text: 'bigger', by: 'jj', addressed: null }] },
  ])
  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'open'])
  assert.strictEqual(r.status, 0, 'notes open must exit 0: ' + r.stderr)
  const openLines = (r.stdout.match(/^\s*N\d+ \[open\]/gm) || [])
  assert.strictEqual(openLines.length, 2,
    'exactly two note lines must list — the plain open note and the threaded one (addressed and replied-to notes are the owner\'s turn, not the session\'s): got ' +
    openLines.length + ' in ' + JSON.stringify(r.stdout))
  assert.match(r.stdout, /N004 \[open\].*bigger/s,
    'the threaded note\'s line must appear (matched loosely against its text)')
  assert.match(r.stdout, /   ↳ jj: bigger/,
    'the threaded note\'s line must end with the newest thread entry — "   ↳ jj: bigger": got ' + JSON.stringify(r.stdout))
  assert.doesNotMatch(r.stdout, /↳ changed:/,
    'the retired "↳ changed:" continuation must never print any more: got ' + JSON.stringify(r.stdout))
})

test('AC-20260913-05-12: the atlas index card\'s nl-card-count counts turn "session" as open and turn "you" as needs', () => {
  const dir = tmpdir('ac12-card-count')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch">a screen</main>\n')
  writeNotesFile(dir, [
    { id: 'N1', scope: 'mock', screen: 'a', state: null, text: 'plain open', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
    { id: 'N2', scope: 'mock', screen: 'a', state: null, text: 'has a reply', by: 'jj', kind: 'note',
      at: nowIso(), status: 'open', addressed: null, reply: 'x', resolvedBy: null, resolvedAt: null },
  ])
  const outPath = path.join(dir, 'design/atlas/index.html')
  const { buildAtlas } = require(path.join(SPEC, 'scripts/design-atlas.js'))
  buildAtlas(dir, outPath)
  const html = fs.readFileSync(outPath, 'utf8')
  const m = /<span class="nl-card-count" data-open="(\d+)" data-needs="(\d+)">/.exec(html)
  assert.ok(m, 'the atlas index must render an nl-card-count span for screen a: got no match in ' + outPath)
  assert.strictEqual(m[1], '1',
    'data-open must count turn "session" notes (the plain open note): got ' + JSON.stringify(m))
  assert.strictEqual(m[2], '1',
    'data-needs must count turn "you" notes (the note carrying a reply): got ' + JSON.stringify(m))
})

test('AC-20260913-05-15: docs/adr/0026-a-note-is-a-conversation.md exists, is accepted, and names all three amended specs', () => {
  const adrPath = path.join(ROOT, 'docs/adr/0026-a-note-is-a-conversation.md')
  assert.ok(fs.existsSync(adrPath), 'docs/adr/0026-a-note-is-a-conversation.md must exist (D10\'s amendment ADR): got no such file')
  const text = fs.readFileSync(adrPath, 'utf8')
  assert.match(text, /Status: accepted/, 'the ADR must carry "Status: accepted": got no match')
  assert.match(text, /## Dissents/, 'the ADR must carry a "## Dissents" section: got no match')
  assert.match(text, /## Applies to/, 'the ADR must carry an "## Applies to" section: got no match')
  for (const spec of [
    'specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md',
    'specs/20260902/10-page-notes-review-loop.md',
    'specs/20260912/06-the-review-page-answers-to-a-design.md',
  ]) {
    assert.ok(text.includes(spec), 'the ADR must name ' + spec + ' as amended: got no such mention')
  }
})
