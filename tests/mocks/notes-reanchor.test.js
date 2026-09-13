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

