'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20260912/11-a-note-can-mark-an-area.md D10/D11, AC-20260912-11-15 — the doctrine reversal,
// the amendment ADR and its backlink, the design-canon reference, and the binding prototype file.
// Guards every path with fs.existsSync so a missing file fails once, by name, rather than an
// opaque ENOENT. Does NOT touch the anchor module, the region store, or any served route — those
// are tests/mocks/notes-anchor.test.js and tests/mocks/notes-region-store.test.js.

const MOCKS_DOCTRINE = path.join(ROOT, 'spec/doctrine/mocks.md')
const DESIGN_DOCTRINE = path.join(ROOT, 'spec/doctrine/design.md')
const ADR = path.join(ROOT, 'docs/adr/0020-a-note-can-mark-an-area.md')
const AMENDED_SPEC = path.join(ROOT, 'specs/20260902/10-page-notes-review-loop.md')
const PROTOTYPE = path.join(ROOT, 'design/chrome-mocks/notes.html')

test('AC-20260912-11-15: spec/doctrine/mocks.md drops "never an element" for "and a note may mark an area"', () => {
  assert.ok(fs.existsSync(MOCKS_DOCTRINE), 'no spec/doctrine/mocks.md — the Mocks: Page Notes section this AC pins does not exist')
  const src = read('spec/doctrine/mocks.md')
  assert.match(src, /and a note may mark an area/,
    'the reversed paragraph must state a note may mark an area — the old "never an element" rule must be replaced, not merely qualified')
  assert.doesNotMatch(src, /never an element/,
    'the old "never an element" wording must be fully removed — leaving it alongside the new sentence contradicts the doctrine it is supposed to replace')
})

test('AC-20260912-11-15: spec/doctrine/design.md names design/chrome-mocks/notes.html as the notes layer\'s binding reference', () => {
  assert.ok(fs.existsSync(DESIGN_DOCTRINE), 'no spec/doctrine/design.md — the Design Canon section this AC pins does not exist')
  const src = read('spec/doctrine/design.md')
  assert.match(src, /design\/chrome-mocks\/notes\.html/,
    'Design Canon must name design/chrome-mocks/notes.html, the same mechanism that already binds the atlas and the review page to their own artifacts — a notes layer with no named artifact is how drift starts')
})

test('AC-20260912-11-15: docs/adr/0020-a-note-can-mark-an-area.md exists and records specs/20260902/10-page-notes-review-loop.md as the decision it amends', () => {
  assert.ok(fs.existsSync(ADR), 'no docs/adr/0020-a-note-can-mark-an-area.md — the reversal of "never an element" has no recorded ADR')
  const src = fs.readFileSync(ADR, 'utf8')
  assert.match(src, /Applies to:[^\n]*specs\/20260902\/10-page-notes-review-loop\.md/,
    'the ADR must name specs/20260902/10-page-notes-review-loop.md in its Applies to line — reversing a recorded decision needs a record that points back at the decision it reverses')
})

test('AC-20260912-11-15: specs/20260902/10-page-notes-review-loop.md carries the Amended-by backlink to the new ADR', () => {
  assert.ok(fs.existsSync(AMENDED_SPEC), 'no specs/20260902/10-page-notes-review-loop.md — the spec this AC\'s backlink targets does not exist')
  const src = read('specs/20260902/10-page-notes-review-loop.md')
  assert.match(src, /Amended by: docs\/adr\/0020-a-note-can-mark-an-area\.md/,
    'the amended spec must carry the literal backlink "Amended by: docs/adr/0020-a-note-can-mark-an-area.md" — a reversal recorded only in the ADR, with no backlink from the decision it reverses, is exactly the "quiet edit" the roadmap amendment rule forbids')
})

test('AC-20260912-11-15: design/chrome-mocks/notes.html exists and carries the .nl-region class the binding prototype must show', () => {
  assert.ok(fs.existsSync(PROTOTYPE), 'no design/chrome-mocks/notes.html — the binding reference for how the notes layer looks does not exist')
  const src = fs.readFileSync(PROTOTYPE, 'utf8')
  assert.match(src, /nl-region/,
    'the prototype must show the .nl-region box (or its badge/glyph classes) — a binding reference that never shows the feature it is supposed to bind cannot be authored from')
})
