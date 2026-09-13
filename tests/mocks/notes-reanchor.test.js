'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { findChrome, serve } = require('./chrome-harness')

// specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D1 — AC-20260912-12-1, -2, -8.
// mocks-driver.js's `notes address` carries no region-note branch at all in the pre-image: a
// region note falls straight through to the plain addressNote() call with no --port requirement
// and no Chrome ever launched, so AC-1's refusal and AC-2's re-anchor are both genuinely red;
// AC-8 (a non-region note) is untouched by this spec and pins that continuity, sanctioned green.

const SCRIPT = 'scripts/mocks-driver.js'

function writeFileDeep(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }
function writeNotes(dir, notes) { writeFileDeep(notesPath(dir), JSON.stringify(notes, null, 2) + '\n') }
function readNotes(dir) { return JSON.parse(fs.readFileSync(notesPath(dir), 'utf8')) }

// A region that always resolves 'exact' regardless of the mock's real dimensions: an empty
// anchor.path (the screen root itself), an empty snippet (resolve()'s snippet check is skipped
// when falsy) and an empty `touched` (resolve()'s signature check is bypassed whenever touched
// is empty) — see notes-anchor.browser.js's `resolve()`. Used wherever a test only needs "the
// region resolves", never the arrangement-mismatch path.
function trivialRegion() {
  return {
    anchor: { path: [], tag: 'main', snippet: '' },
    frac: { x: 0, y: 0, w: 1, h: 1 },
    layout: { arrangement: 'single', aspect: 1 },
    touched: [],
    drawnAt: { w: 100 },
  }
}

function regionNote(overrides) {
  return Object.assign({
    id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'marked area', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    region: trivialRegion(),
  }, overrides)
}

test('AC-20260912-12-1: notes address on a region note with no --port and no status.client.port exits non-zero naming "requires --port" and leaves notes.json untouched', () => {
  const dir = tmpdir('reanchor-noport')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a" data-status="sketch">content</main>\n')
  writeNotes(dir, [regionNote()])
  const beforeBytes = fs.readFileSync(notesPath(dir), 'utf8')

  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'moved it'])
  assert.notStrictEqual(r.status, 0,
    'a region note addressed with no --port and no recorded client port must exit non-zero — D1 requires --port before any re-anchor attempt: got status ' +
    r.status + ' stdout ' + JSON.stringify(r.stdout))
  assert.match(r.stderr, /requires --port/,
    'the refusal must name "requires --port" so the owner knows the exact remedy: got stderr ' + JSON.stringify(r.stderr))
  assert.strictEqual(fs.readFileSync(notesPath(dir), 'utf8'), beforeBytes,
    'a refused address must leave notes.json byte-identical — no partial write may land on refusal')
})

test('AC-20260912-12-8: notes address on a non-region session note CONTINUES TO address it with no --port required and no "reanchored" field on the addressed object', () => {
  const dir = tmpdir('reanchor-nonregion')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">content</main>\n')
  const note = {
    id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'plain note', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }
  writeNotes(dir, [note])

  const r = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'fixed the label'])
  assert.strictEqual(r.status, 0,
    'addressing a plain, non-region note must CONTINUE TO exit 0 with no --port/Chrome requirement: ' + r.stderr)
  const found = readNotes(dir).find((n) => n.id === 'N001')
  assert.ok(found && found.addressed,
    'the note must CONTINUE TO carry an addressed object once addressed: got ' + JSON.stringify(found))
  assert.strictEqual(found.addressed.change, 'fixed the label',
    'the addressed object must CONTINUE TO record the --change text verbatim: got ' + JSON.stringify(found.addressed))
  assert.ok(!Object.prototype.hasOwnProperty.call(found.addressed, 'reanchored'),
    'a non-region note\'s addressed object must carry no "reanchored" field at all — that field is D1\'s region-only addition: got ' +
    JSON.stringify(found.addressed))
})

// ---------------------------------------------------------------------------
// AC-20260912-12-2 [env: CHROME_BIN] — the driver's own resolveRegion boot, exercised through a
// real served fixture. Both scenarios share one fixture shape: a note captured against a row
// layout (region.layout.arrangement:'row', touched:[span0,span1]) that the served markup has
// since reflowed to a column — the arrangement mismatch, with touched non-empty, is exactly
// resolve()'s `children` branch (notes-anchor.browser.js) — versus a fixture where the anchored
// element is removed outright, which is resolve()'s `null` branch.
// ---------------------------------------------------------------------------

function rowToColumnNote() {
  return {
    id: 'N001', scope: 'mock', screen: 'a', state: null, text: 'the buttons moved', by: 'jj', kind: 'note',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    region: {
      anchor: { path: [0], tag: 'div', snippet: 'Item OneItem Two' },
      frac: { x: 0, y: 0, w: 1, h: 1 },
      layout: { arrangement: 'row', aspect: 3 },
      touched: [{ i: 0, snippet: 'Item One' }, { i: 1, snippet: 'Item Two' }],
      drawnAt: { w: 200 },
    },
  }
}

test('AC-20260912-12-2 (children): notes address --port re-anchors a region whose anchor reflowed from a row to a column, writing reanchored:"children" and a region whose layout.arrangement is "col"', async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-2 only runs against a real resolveRegion boot'); return }
  const dir = tmpdir('reanchor-children')
  writeFileDeep(path.join(dir, 'design/mocks/a.html'),
    '<main data-screen-label="a" data-status="sketch">' +
    '<div id="row" style="padding:24px"><span style="display:block">Item One</span><span style="display:block">Item Two</span></div>' +
    '</main>\n')
  writeNotes(dir, [rowToColumnNote()])

  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const r = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'reflowed to a column', '--port', String(port)],
      { env: Object.assign({}, process.env, { CHROME_BIN: chrome }) })
    assert.strictEqual(r.status, 0,
      'a re-anchor that resolves (even in children mode) must exit 0: ' + r.stderr)
    const found = readNotes(dir).find((n) => n.id === 'N001')
    assert.ok(found && found.addressed, 'the note must carry an addressed object: got ' + JSON.stringify(found))
    assert.strictEqual(found.addressed.reanchored, 'children',
      'D1: an arrangement mismatch with touched children present must write addressed.reanchored:"children": got ' + JSON.stringify(found.addressed))
    assert.strictEqual(found.region && found.region.layout && found.region.layout.arrangement, 'col',
      'D1: the fresh capture over the resolved box must record the CURRENT (column) arrangement: got ' + JSON.stringify(found.region))
  } finally {
    await stop()
  }
})

test('AC-20260912-12-2 (lost): notes address --port on a region whose anchor element was removed writes reanchored:"lost", leaves region byte-identical, prints "box lost", and exits 0', async (t) => {
  const chrome = findChrome()
  if (!chrome) { t.skip('no Chrome binary (set CHROME_BIN) — AC-2 only runs against a real resolveRegion boot'); return }
  const dir = tmpdir('reanchor-lost')
  // The anchor's path [0] points at a first child that no longer exists on this markup.
  writeFileDeep(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a" data-status="sketch">no more row here</main>\n')
  const note = rowToColumnNote()
  writeNotes(dir, [note])
  const regionBefore = JSON.parse(JSON.stringify(note.region))

  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    const r = runNode(SCRIPT, ['--root', dir, 'notes', 'address', '--id', 'N001', '--change', 'removed the row', '--port', String(port)],
      { env: Object.assign({}, process.env, { CHROME_BIN: chrome }) })
    assert.strictEqual(r.status, 0,
      'a lost box must still exit 0 — D1: it is reported, never a hard refusal: ' + r.stderr)
    assert.match(r.stdout, /box lost/,
      'D1\'s exact stdout line must print "box lost" so the owner knows they will be asked to re-place it: got ' + JSON.stringify(r.stdout))
    const found = readNotes(dir).find((n) => n.id === 'N001')
    assert.ok(found && found.addressed, 'the note must still carry an addressed object: got ' + JSON.stringify(found))
    assert.strictEqual(found.addressed.reanchored, 'lost',
      'D1: a null resolve outcome must write addressed.reanchored:"lost": got ' + JSON.stringify(found.addressed))
    assert.deepStrictEqual(found.region, regionBefore,
      'D1: a lost box must leave the note\'s region byte-identical — never moved, never guessed: got ' + JSON.stringify(found.region))
  } finally {
    await stop()
  }
})
