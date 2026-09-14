'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { tmpdir } = require('../helpers')
const {
  JOURNEY, LABELS, mark, writeNotesFile, advanceToCanonWritten, advanceToThemePicked,
  confirmEveryJourney, decideLook, writeWireframe, writeCaptureConfig, writeFixtureCapture,
} = require('./mocks-driver-fixtures')

// specs/20260912/07-a-whole-product-note-blocks-the-sign-off.md D4 — AC-20260912-07-3, -4, -6.
// requireProjectNotesResolved is carved out of requireNotesResolved and called from
// handleApproved() only; handleJourneyApproved keeps requireNotesResolved alone, so a journey
// with clean screens can now be marked approved while a project note is still open.
//
// specs/20260913/07-the-critic-is-out.md D7 — AC-20260913-07-13, -26: both pins below already use
// a `kind: "note"` fixture, so the assertions are unchanged by the retirement; retagged in place.

// Builds a host through `journey-drawn` for JOURNEY/LABELS (advanceToCanonWritten plus the
// journey's own wireframes and a decided journey-approved:<journey> stop), the same steps
// mocks-driver-fixtures.js's advanceToJourneyApproved runs before its own `--mark journey-approved`
// call — copied here rather than reused so this file's own notes.json can be written in between
// journey-drawn and the mark under test.
function buildToJourneyDrawn(dir) {
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
}


test('AC-20260912-07-6: (reused by AC-20260913-07-13) --mark journey-approved --journey onboarding CONTINUES TO exit 2 naming an unresolved note on one of the journey\'s own screens', () => {
  const dir = tmpdir('notes-gate-ac6')
  buildToJourneyDrawn(dir)
  writeNotesFile(dir, [
    { id: 'N001', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'open', text: 'wrong here', reason: 'other' },
  ])
  const r = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2,
    'an unresolved note on one of this journey\'s own screens must still block journey-approved: got status ' + r.status)
  assert.match(r.stderr, /unresolved note\(s\) on onboarding: N001/,
    'the refusal must still name the unresolved screen-scoped note by id, unchanged by the project-note carve-out: got ' + r.stderr)
})

test('AC-20260912-07-4: (reused by AC-20260913-07-26) --mark approved CONTINUES TO exit 2 with the project-note-open message, printed before any unresolved screen-scoped note it would also find', () => {
  const dir = tmpdir('notes-gate-ac4')
  advanceToThemePicked(dir)
  confirmEveryJourney(dir)
  decideLook(dir, 'approved', 'approve', { by: 'jj' })
  writeNotesFile(dir, [
    { id: 'N005', kind: 'note', scope: 'project', screen: null, state: null, status: 'open', text: 'the nav is wrong everywhere', reason: 'other' },
    { id: 'N010', kind: 'note', scope: 'mock', screen: LABELS[0], state: null, status: 'open', text: 'also wrong here', reason: 'other' },
  ])
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'the final sign-off must still refuse while a project note is open: got status ' + r.status)
  assert.strictEqual(r.stderr, 'mocks-driver: project note(s) open: N005 — answer the project note first\n',
    'the sign-off refusal must still print exactly this message, unchanged byte-for-byte by the D4 carve-out: got ' + JSON.stringify(r.stderr))
  assert.doesNotMatch(r.stderr, /unresolved note/,
    'the project-note refusal must still preempt the unresolved-screen-note check (N010) — the carve-out must run requireProjectNotesResolved before requireNotesResolved, exactly as today\'s ordering does: got ' + r.stderr)
})
