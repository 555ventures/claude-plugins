'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')
const picksLib = require('../../spec/scripts/lib/mocks-picks')
const { writeWireframe, writeKitCanon, advanceToJourneyApproved, confirmEveryJourney } = require('./mocks-driver-fixtures')

// specs/20260902/10-page-notes-review-loop.md D1/D4/D5, AC-20260902-10-1/-5/-6/-10.
// spec/scripts/lib/mocks-notes.js and the driver's `notes` subcommands + mark gates do not
// exist yet — the top-level require below fails the whole file (the same red-phase pattern
// tests/mocks/mocks-ledger.test.js used for spec 06's not-yet-existing lib) until D1 lands;
// the CLI-level tests stay red independently (mocks-driver.js ignores an unknown "notes" verb
// and falls through to its ordinary bare-step/mark output) once the lib exists but D4/D5 don't.
const { validateNotes, answerQuestion, resolveNote, unresolvedFor, originOf, waiveNote, writeNotes: writeNotesLib } = require('../../spec/scripts/lib/mocks-notes')

// specs/20260907/10-client-review.md D3/D8/D11: `ORIGINS`/`originOf`/origin stamping,
// `waiveNote`, and the atomic (tmp-file rename) `writeNotes` do not exist yet on
// spec/scripts/lib/mocks-notes.js — every test below tagged AC-20260907-10-3/-12/-18 is red
// until D3/D8/D11 land. `writeNotesLib` is imported under that name to avoid colliding with this
// file's own local `writeNotes(dir, notes)` helper (a thin JSON.stringify fixture writer).

// specs/20260907/08-walk-critic.md D3's six flow-break reasons — the enum
// `KINDS`/`WALK_REASONS` do not exist yet on spec/scripts/lib/mocks-notes.js, so every
// AC-20260907-08-4..7 test below is red until D3/D4/D5 land.
const WALK_REASONS = ['no-path-back', 'no-path-forward', 'dead-end-state', 'missing-data', 'ambiguous-control', 'unrecoverable-error']

const SCRIPT = 'scripts/mocks-driver.js'
const FIXTURE = path.join(ROOT, 'tests/fixtures/mocks-notes/notes.sample.json')

const FACT_KEYS = [
  'primary-surface', 'platforms-horizon', 'tenancy', 'offline', 'realtime', 'ai-in-loop',
  'residency', 'payer', 'day-one-integrations', 'scale-outage', 'vendor-limits', 'retention',
  'legal-floor',
]
const JOURNEY = 'staff-interview'
const LABELS = ['signin', 'invite', 'session-live']
const DENSE = 'session-live'

function bare(dir, extra = []) { return runNode(SCRIPT, ['--root', dir, ...extra]) }
function mark(dir, name, extra = []) { return runNode(SCRIPT, ['--root', dir, '--mark', name, ...extra]) }
function ledgerCmd(dir, sub, extra = []) { return runNode(SCRIPT, ['--root', dir, 'ledger', sub, ...extra]) }

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }
function writeNotes(dir, notes) { writeJSON(notesPath(dir), notes) }
function readNotesOnDisk(dir) { return JSON.parse(fs.readFileSync(notesPath(dir), 'utf8')) }

function writeTargets(dir) {
  writeJSON(path.join(dir, 'design/targets.json'), {
    schemaVersion: 1, themes: ['light'],
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
  })
}
function writeResearchBrief(dir) {
  writeFile(path.join(dir, 'docs/design/research-brief.md'),
    '# Research brief\n\n## Findings\nSynthetic test brief for mocks-notes.test.js.\n')
}
function confirmFacts(dir) {
  FACT_KEYS.forEach((key, i) => {
    const r = ledgerCmd(dir, 'add', [
      '--id', 'P' + (i + 1), '--step', 'SEED', '--kind', 'product',
      '--claim', key, '--tag', 'said-by-user', '--status', 'confirmed',
    ])
    assert.strictEqual(r.status, 0,
      'test setup requires `ledger add` to accept a said-by-user/confirmed row for fact "' + key + '": ' + r.stderr)
  })
}
// specs/20260910/06-real-records-and-two-dense-screens.md D5/D2: this
// file's own local writeSeed (distinct from mocks-driver-fixtures.js's) gains a "## Records"
// section naming the same three-record customer.json the shared fixture writes, so `seed-done`
// keeps being accepted once D2 lands.
function writeSeed(dir) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeJSON(path.join(dir, 'design/mocks/records/customer.json'), [
    { name: 'Aoi Tanaka', phone: '090-1234-5678', visits: 14 },
    { name: 'Ren', phone: '', visits: 1 },
    { name: 'Sato Hana', phone: '080-0000-1111', visits: 3 },
  ])
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for tests.
Built for QA engineers exercising the notes layer.
It must let a user complete a short staff interview.

## Facts
${factLines}

## References
- none

## Records
- customer: records/customer.json

## Journeys
### ${JOURNEY}
Mika (dispatch lead) signs in, sends an invite, and reaches the live session.
\`\`\`surfaces
${LABELS[0]} -> ${LABELS[1]}
${LABELS[1]} -> ${LABELS[2]}
\`\`\`

## Dense screen
- ${DENSE}
`)
}
function writeCanon(dir) {
  writeFile(path.join(dir, 'design/mocks/canon.md'), `## Shells
none

## Primitives
- **Button** — primary action

## Rules
- One screen at a time.

## Grounding
This canon is binding: see docs/design/research-brief.md for the research basis.
`)
}
// specs/20260905/06-plugin-owned-capture-at-approval.md (D5, Rationale "Executes leg"): once
// journey-approved/approved run render-gate --mocks internally, a fixture host with no declared
// capture command falls through to render-gate's real-Chrome --which fallback — a fixture
// capture command sidesteps that, mirroring tests/mocks/mocks-driver-fixtures.js's own
// writeFixtureCapture/writeCaptureConfig helpers (this file keeps its own private fixture set,
// so it carries a file-local copy rather than importing across test files).
const FIXTURE_CAPTURE_SRC = `#!/usr/bin/env node
'use strict'
const fs = require('fs')
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : undefined }
const out = flag('out')
const w = parseInt(flag('width'), 10) || 0
fs.writeFileSync(out, JSON.stringify({
  schemaVersion: 1, theme: flag('theme') || null, state: flag('state') === '-' ? null : flag('state'),
  root: 'body', page: { scrollWidth: w, clientWidth: w }, entries: [],
}))
`
function writeFixtureCapture(dir) {
  const p = path.join(dir, 'fixture-capture.js')
  fs.writeFileSync(p, FIXTURE_CAPTURE_SRC)
  return p
}
function writeCaptureConfig(dir, capturePath) {
  const configPath = path.join(dir, '.claude/spec.config.json')
  let existing = {}
  try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { /* cold root */ }
  existing.design = Object.assign({}, existing.design, { render: { capture: 'node ' + capturePath } })
  writeJSON(configPath, existing)
}

// D11 fixture repair: once D7 lands, journey-approved/theme-picked refuse without a decided look
// stop for the mark's key — decideLook writes that stop through lib/mocks-picks.js (spec 01's
// lib, never by hand), the same helper tests/mocks/mocks-driver.test.js carries.
function decideLook(dir, key, verdict, extra = {}) {
  let stops = picksLib.readPicks(dir)
  const kind = verdict === 'pick' ? 'pick' : 'approve'
  let candidates = extra.candidates
  if (!candidates) {
    if (kind === 'pick') {
      const groups = [extra.pick || 'a', ...(extra.others || ['b'])]
      candidates = groups.map((g) => ({ group: g, label: extra.label || g, path: extra.path || (g + '.html') }))
    } else {
      candidates = [{ group: null, label: 'a', path: 'mocks/a.html' }]
    }
  }
  const opened = picksLib.openStop(stops, { kind, key, title: extra.title || key, candidates })
  const decided = picksLib.decideStop(opened.stops, opened.stop.id, {
    verdict,
    pick: verdict === 'pick' ? (extra.pick || candidates[0].group) : null,
    note: extra.note || (verdict === 'change' ? 'change requested' : null),
    by: extra.by || 'jj',
  })
  picksLib.writePicks(dir, decided.stops)
  return decided.stop
}

// Chained setup through the real binary, mirroring tests/mocks/mocks-driver.test.js's own
// advanceTo* helpers (file-local here — each test file builds its own fixture chain).
function advanceToJourneyDrawn(dir) {
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  const seedDone = mark(dir, 'seed-done')
  assert.strictEqual(seedDone.status, 0, 'test setup requires seed-done to be accepted: ' + seedDone.stderr)

  writeFile(path.join(dir, 'design/shapes/calm.html'), '<main data-screen-label="' + DENSE + '" data-shape="calm">calm</main>\n')
  writeFile(path.join(dir, 'design/shapes/bold.html'), '<main data-screen-label="' + DENSE + '" data-shape="bold">bold</main>\n')
  const shapeLedger = ledgerCmd(dir, 'add', [
    '--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: calm',
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'bold',
  ])
  assert.strictEqual(shapeLedger.status, 0, 'test setup requires the shape ledger row to be accepted: ' + shapeLedger.stderr)
  decideLook(dir, 'shape-picked', 'pick', { pick: 'calm', others: ['bold'], by: 'jj' })
  const shapePicked = mark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapePicked.status, 0, 'test setup requires shape-picked to be accepted: ' + shapePicked.stderr)

  // specs/20260907/04-kit-canon-family.md D1 fixture repair: KIT now sits between SHAPES and
  // WIREFRAMES — this file's own duplicate of the shared advance chain gains the same
  // `--mark kit-signed` step tests/mocks/mocks-driver-fixtures.js's advanceToKitSigned adds.
  writeKitCanon(dir)
  decideLook(dir, 'kit-signed', 'approve', { by: 'jj' })
  const kitSigned = mark(dir, 'kit-signed')
  assert.strictEqual(kitSigned.status, 0, 'test setup requires kit-signed to be accepted: ' + kitSigned.stderr)

  writeCanon(dir)
  const canonWritten = mark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)

  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
}

function nowIso() { return new Date().toISOString() }
function projectNote(id, status) {
  const base = { id, scope: 'project', screen: null, state: null, text: 'The direction is wrong — too much chrome.', by: 'Ren', at: nowIso(), status, addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  if (status === 'resolved') { base.resolvedBy = 'Ren'; base.resolvedAt = nowIso() }
  return base
}
function mockNote(id, status, extra = {}) {
  const base = { id, scope: 'mock', screen: DENSE, state: 'busy', text: 'note text', by: 'JJ', at: nowIso(), status, addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  Object.assign(base, extra)
  if (status === 'addressed' && !base.addressed) base.addressed = { at: nowIso(), change: 'two buttons', ledgerRow: null }
  if (status === 'resolved') { base.resolvedBy = 'JJ'; base.resolvedAt = nowIso() }
  return base
}

// ---------------------------------------------------------------------------
// AC-20260902-10-1
// ---------------------------------------------------------------------------
test('AC-20260902-10-1: WHEN validateNotes reads the D9 fixture THE SYSTEM returns four notes with zero errors, and screen:null on a mock note, a duplicate id, or status:"done" each produce one error naming the id and field', () => {
  const notes = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  assert.strictEqual(notes.length, 4, 'the D9 fixture must re-key the spike\'s four real notes — a length other than 4 means the fixture was not built from the spike as D9 requires')

  const clean = validateNotes(notes)
  assert.deepStrictEqual(clean.errors, [],
    'validateNotes must return zero errors for the D9 fixture — it is the spike\'s own real notes re-keyed to D1, so any error here means validateNotes rejects a shape the fixture legitimately contains: ' + JSON.stringify(clean.errors))

  const n004 = notes.find((n) => n.id === 'N004')
  assert.deepStrictEqual(
    { scope: n004.scope, screen: n004.screen, state: n004.state, status: n004.status },
    { scope: 'mock', screen: 'session-live', state: 'read-back pending', status: 'open' },
    'AC-1 pins N004\'s exact re-keyed shape — a mismatch means D9\'s re-keying (page->screen, frame->state) drifted from the AC\'s literal object')

  const badScreen = notes.map((n) => ({ ...n }))
  badScreen[0].screen = null
  const r1 = validateNotes(badScreen)
  assert.strictEqual(r1.errors.length, 1, 'a scope:"mock" note with screen:null must produce exactly one error, naming the offending note and field, not zero (silently accepted) or more than one: ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /N001/, 'the screen:null error must name the offending note id "N001" so a caller can find which row is invalid: ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /screen/, 'the screen:null error must name the field "screen": ' + JSON.stringify(r1.errors))

  const dup = notes.map((n) => ({ ...n }))
  dup[1].id = dup[0].id
  const r2 = validateNotes(dup)
  assert.strictEqual(r2.errors.length, 1, 'a duplicate id must produce exactly one error naming the id: ' + JSON.stringify(r2.errors))
  assert.match(r2.errors.join(' '), /N001/, 'the duplicate-id error must name the colliding id "N001": ' + JSON.stringify(r2.errors))

  const badStatus = notes.map((n) => ({ ...n }))
  badStatus[2].status = 'done'
  const r3 = validateNotes(badStatus)
  assert.strictEqual(r3.errors.length, 1, 'status:"done" is not one of D1\'s enum (open|addressed|resolved) and must produce exactly one error: ' + JSON.stringify(r3.errors))
  assert.match(r3.errors.join(' '), /N003/, 'the status error must name the offending note id "N003": ' + JSON.stringify(r3.errors))
  assert.match(r3.errors.join(' '), /status/, 'the status error must name the field "status": ' + JSON.stringify(r3.errors))
})

// ---------------------------------------------------------------------------
// AC-20260902-10-5
// ---------------------------------------------------------------------------
test('AC-20260902-10-5: `notes open` prints the project note first, groups N004 under the journey declaring session-live, and ends with the project-note warning; `notes address`/`notes reply` write addressed/reply without a `notes resolve` subcommand ever existing', () => {
  const dir = tmpdir('mocks-notes-open')
  bare(dir) // cold-root scaffold
  writeSeed(dir) // declares "staff-interview" -> signin -> invite -> session-live

  const fixtureNotes = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const project = projectNote('N005', 'open')
  writeNotes(dir, [...fixtureNotes, project])

  const open = bare(dir, ['notes', 'open'])
  assert.strictEqual(open.status, 0, 'a plain `notes open` invocation over a valid seed.md + notes.json must exit 0: ' + open.stderr)
  const out = open.stdout
  const projectIdx = out.indexOf('N005')
  const n004Idx = out.indexOf('N004')
  assert.ok(projectIdx !== -1 && n004Idx !== -1 && projectIdx < n004Idx,
    'the project note N005 must print before the mock note N004 — "any open project note blocks mock-note work" is signalled by ordering it first: got ' + JSON.stringify(out))
  assert.ok(out.indexOf(JOURNEY) !== -1 && out.indexOf(JOURNEY) < n004Idx,
    'N004 (screen "session-live") must be grouped under its declaring journey "' + JOURNEY + '" — journeys are derived from seed.md per D4: got ' + JSON.stringify(out))
  const trimmed = out.replace(/\s+$/, '')
  assert.ok(trimmed.endsWith('⚠️ a project note is open — answer it (canon change or new directions) before any mock note'),
    'the output must end with the exact D4 project-note warning line while N005 is open: got ' + JSON.stringify(out))

  const address = bare(dir, ['notes', 'address', '--id', 'N004', '--change', 'two buttons', '--ledger', 'W12'])
  assert.strictEqual(address.status, 0, '`notes address --id N004 --change "..." --ledger W12` must be accepted: ' + address.stderr)
  const afterAddress = readNotesOnDisk(dir).find((n) => n.id === 'N004')
  assert.strictEqual(afterAddress.status, 'addressed', '`notes address` must set N004\'s status to "addressed": got ' + JSON.stringify(afterAddress))
  assert.deepStrictEqual(
    { change: afterAddress.addressed && afterAddress.addressed.change, ledgerRow: afterAddress.addressed && afterAddress.addressed.ledgerRow },
    { change: 'two buttons', ledgerRow: 'W12' },
    '`notes address` must record addressed.change and addressed.ledgerRow verbatim: got ' + JSON.stringify(afterAddress.addressed))

  const reply = bare(dir, ['notes', 'reply', '--id', 'N004', '--text', 'what happens on double-tap?'])
  assert.strictEqual(reply.status, 0, '`notes reply --id N004 --text "..."` must be accepted: ' + reply.stderr)
  const afterReply = readNotesOnDisk(dir).find((n) => n.id === 'N004')
  assert.strictEqual(afterReply.reply, 'what happens on double-tap?', '`notes reply` must record the reply text verbatim: got ' + JSON.stringify(afterReply))
  assert.strictEqual(afterReply.status, 'addressed', '`notes reply` must leave status unchanged ("addressed") — reply never changes status per the Contracts status-transition line: got "' + afterReply.status + '"')

  const resolve = bare(dir, ['notes', 'resolve', '--id', 'N004', '--by', 'JJ'])
  assert.strictEqual(resolve.status, 2, 'no `notes resolve` subcommand may ever exist (D4) — the driver must refuse with exit 2, not silently resolve the note: ' + resolve.stdout + resolve.stderr)
  assert.match(resolve.stdout + resolve.stderr, /page/i, 'the refusal must name the page (the Resolve button) as the only resolve path: ' + resolve.stdout + resolve.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260902-10-6 / AC-20260907-07-12
// ---------------------------------------------------------------------------
// specs/20260907/07-mocks-retires-theme.md AC-20260907-07-12 (retag): the approved-scope
// assertions below are this AC's own "unresolved project or journey note" clause of the CONTINUE
// TO pin that `--mark approved` still refuses on an unresolved note, a missing decided `approved`
// stop, or an unapproved declared journey — the theme precondition's removal narrows nothing else.
test('AC-20260902-10-6 / AC-20260907-07-12: journey-approved and approved both refuse on an open project note or an unresolved journey note, naming the note ids', () => {
  const dir = tmpdir('mocks-notes-gate')
  advanceToJourneyDrawn(dir)
  writeCaptureConfig(dir, writeFixtureCapture(dir))

  // journey-approved: open project note blocks it first.
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  writeNotes(dir, [projectNote('N005', 'open')])
  const blockedByProject = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(blockedByProject.status, 2, 'journey-approved must refuse (exit 2) while a project note is open: ' + blockedByProject.stdout + blockedByProject.stderr)
  assert.match(blockedByProject.stdout + blockedByProject.stderr, /project note\(s\) open: N005/,
    'the refusal must carry the exact D5 project-note prefix naming N005: ' + blockedByProject.stdout + blockedByProject.stderr)

  // journey-approved: project note resolved, but an addressed (not resolved) mock note on a
  // screen of this journey still blocks it.
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N001', 'addressed')])
  const blockedByMock = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(blockedByMock.status, 2, 'journey-approved must refuse while a note on one of the journey\'s screens is addressed but not resolved: ' + blockedByMock.stdout + blockedByMock.stderr)
  assert.match(blockedByMock.stdout + blockedByMock.stderr, new RegExp('unresolved note\\(s\\) on ' + JOURNEY + ': N001'),
    'the refusal must carry the exact D5 unresolved-note prefix naming the journey and N001: ' + blockedByMock.stdout + blockedByMock.stderr)

  // Every note resolved: journey-approved now succeeds.
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N001', 'resolved')])
  const approvedNow = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(approvedNow.status, 0, 'journey-approved must be accepted once every project and journey note is resolved: ' + approvedNow.stdout + approvedNow.stderr)

  // specs/20260907/07-mocks-retires-theme.md orchestrator duty: THEME is retired from the mocks
  // state machine — journey-approved having already been recorded above, this is a no-op
  // (advanceToJourneyApproved's own early-return guard sees journeys[JOURNEY].approved already
  // set and returns immediately); no explicit action item advances a theme-less root any further
  // toward SIGNOFF, so nothing replaces the deleted advanceToThemePicked() call's real work.
  advanceToJourneyApproved(dir, JOURNEY, LABELS)
  // specs/20260910/03-client-journey-player.md D7 fixture repair: `--mark approved` now
  // refuses while a seed journey is unconfirmed by the client, so this setup records the
  // confirmation to keep the precondition it actually pins isolated.
  confirmEveryJourney(dir)
  decideLook(dir, 'approved', 'approve', { by: 'jj' })

  // approved: any unresolved note anywhere blocks it (project scope again, this time — SKIN and
  // REVIEW are retired, so approved is the only remaining note gate past journey-approved).
  writeNotes(dir, [projectNote('N006', 'open')])
  const blockedApproved = mark(dir, 'approved')
  assert.strictEqual(blockedApproved.status, 2, '`--mark approved` must refuse while any note anywhere is unresolved, per D5\'s "approved: any unresolved note anywhere": ' + blockedApproved.stdout + blockedApproved.stderr)
  assert.match(blockedApproved.stdout + blockedApproved.stderr, /unresolved note|N006/,
    'the approved refusal must name the unresolved note: ' + blockedApproved.stdout + blockedApproved.stderr)

  writeNotes(dir, [projectNote('N006', 'resolved')])
  const approvedFinal = mark(dir, 'approved')
  assert.strictEqual(approvedFinal.status, 0, '`--mark approved` must be accepted once every note is resolved: ' + approvedFinal.stdout + approvedFinal.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260902-10-10
// ---------------------------------------------------------------------------
test('AC-20260902-10-10: `--mark journey-approved --journey <j>` continues to accept once every note is resolved', () => {
  const dir = tmpdir('mocks-notes-allresolved')
  advanceToJourneyDrawn(dir)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N001', 'resolved')])
  const r = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-approved must accept once every project and journey note is resolved — a gate that still refuses here is stricter than D5 requires: ' + r.stdout + r.stderr)
})

// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md — TDD red: D1's kind/reason/ledgerId/answer
// fields, answerQuestion, and resolveNote's question refusal do not exist yet on
// spec/scripts/lib/mocks-notes.js; D2's `ledger add --screen`/`ledger ask` and D4's
// question-aware gate wording do not exist yet on mocks-driver.js; D6's `notes open` questions
// block and `ledger counts` catch-provenance line do not exist yet either.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260906-03-1
// ---------------------------------------------------------------------------
test('AC-20260906-03-1: validateNotes accepts a well-formed question note, rejects a question missing ledgerId, a question carrying reason, an unknown reason, and a "no" answer with empty text (one error each naming the field); answerQuestion sets answer and status "resolved"; resolveNote on a question throws "answered, never resolved"', () => {
  const base = {
    id: 'N001', scope: 'mock', screen: 'signin', state: null, text: 'single-use link', by: 'session',
    at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }

  const goodQuestion = Object.assign({}, base, { kind: 'question', ledgerId: 'W7' })
  const clean = validateNotes([goodQuestion])
  assert.deepStrictEqual(clean.errors, [],
    'D1: a well-formed question note ({kind:"question", ledgerId:"W7", scope:"mock", screen:"signin"}) must validate with zero errors — kind/ledgerId are an additive shape, never a stricter one: ' + JSON.stringify(clean.errors))

  const noLedgerId = Object.assign({}, base, { id: 'N002', kind: 'question' })
  const r1 = validateNotes([noLedgerId])
  assert.strictEqual(r1.errors.length, 1, 'D1: a question note with no ledgerId must produce exactly one error, not zero (silently accepted) or more than one: ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /ledgerId/, 'D1: the missing-ledgerId error must name the field "ledgerId": ' + JSON.stringify(r1.errors))

  const questionWithReason = Object.assign({}, base, { id: 'N003', kind: 'question', ledgerId: 'W8', reason: 'other' })
  const r2 = validateNotes([questionWithReason])
  assert.strictEqual(r2.errors.length, 1, 'D1: a question note carrying a "reason" must produce exactly one error — reason is notes-only: ' + JSON.stringify(r2.errors))
  assert.match(r2.errors.join(' '), /reason/, 'D1: the reason-on-a-question error must name the field "reason": ' + JSON.stringify(r2.errors))

  const badReason = Object.assign({}, base, { id: 'N004', reason: 'typo' })
  const r3 = validateNotes([badReason])
  assert.strictEqual(r3.errors.length, 1, 'D1: a note with an unknown reason "typo" (outside missing-screen|wrong-direction|wrong-words|other) must produce exactly one error: ' + JSON.stringify(r3.errors))
  assert.match(r3.errors.join(' '), /reason/, 'D1: the unknown-reason error must name the field "reason": ' + JSON.stringify(r3.errors))

  const badAnswer = Object.assign({}, base, { id: 'N005', kind: 'question', ledgerId: 'W9', answer: { verdict: 'no', text: '', by: 'Ren', at: new Date().toISOString() } })
  const r4 = validateNotes([badAnswer])
  assert.strictEqual(r4.errors.length, 1, 'D1: a "no" answer with empty text must produce exactly one error: ' + JSON.stringify(r4.errors))
  assert.match(r4.errors.join(' '), /answer|text/, 'D1: the empty-text-on-no error must name the offending field: ' + JSON.stringify(r4.errors))

  const answerable = [Object.assign({}, base, { id: 'N012', kind: 'question', ledgerId: 'W7' })]
  const answered = answerQuestion(answerable, 'N012', { verdict: 'no', text: 'Owner sets modality', by: 'Ren' })
  assert.strictEqual(answered.note.status, 'resolved', 'D1: answerQuestion must set status to "resolved": got ' + JSON.stringify(answered.note))
  assert.deepStrictEqual(
    { verdict: answered.note.answer && answered.note.answer.verdict, text: answered.note.answer && answered.note.answer.text, by: answered.note.answer && answered.note.answer.by },
    { verdict: 'no', text: 'Owner sets modality', by: 'Ren' },
    'D1: answerQuestion must set answer.verdict/text/by verbatim from its input: got ' + JSON.stringify(answered.note))

  assert.throws(() => resolveNote(answerable, 'N012', 'JJ'), /answered, never resolved/,
    'D1: resolveNote on a question note must throw a message containing "answered, never resolved" — the HTTP resolve path is forbidden for questions')
})

// ---------------------------------------------------------------------------
// AC-20260906-03-5
// ---------------------------------------------------------------------------
test('AC-20260906-03-5: journey-approved refuses on an unanswered question naming the ledger id and screen (not the note id), accepts once the question is answered "yes" and its ledger row is confirmed, and CONTINUES TO refuse first on an open project note even alongside an unanswered question', () => {
  const dir = tmpdir('mocks-notes-question-gate')
  advanceToJourneyDrawn(dir)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const ledgerRow = ledgerCmd(dir, 'add', [
    '--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'single-use link',
    '--tag', 'inferred', '--status', 'open',
  ])
  assert.strictEqual(ledgerRow.status, 0, 'test setup requires the W7 ledger row to be accepted: ' + ledgerRow.stderr)

  const question = {
    id: 'N010', scope: 'mock', screen: LABELS[0], state: null, kind: 'question', ledgerId: 'W7',
    text: 'single-use link', by: 'session', at: nowIso(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
  writeNotes(dir, [question])

  const blocked = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(blocked.status, 2, 'D4: journey-approved must refuse (exit 2) while W7 is an unanswered question: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stderr + blocked.stdout, new RegExp('unanswered question\\(s\\) on ' + JOURNEY + ': W7 \\(' + LABELS[0] + '\\)'),
    'D4: the refusal must carry the exact "unanswered question(s) on ' + JOURNEY + ': W7 (' + LABELS[0] + ')" line — it names the ledger id and screen, never the note id N010: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stderr + blocked.stdout, /answer them on the page/,
    'D4: the refusal must carry the "answer them on the page" remedy: ' + blocked.stdout + blocked.stderr)

  const confirmRow = ledgerCmd(dir, 'set', ['--id', 'W7', '--status', 'confirmed 2026-09-06', '--tag', 'inferred'])
  assert.strictEqual(confirmRow.status, 0, 'test setup requires `ledger set` to confirm W7 (mirroring what an answer:"yes" writes): ' + confirmRow.stderr)
  const answered = Object.assign({}, question, { status: 'resolved', resolvedBy: 'Ren', resolvedAt: nowIso(), answer: { verdict: 'yes', text: '', by: 'Ren', at: nowIso() } })
  writeNotes(dir, [answered])
  const accepted = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(accepted.status, 0, 'D4: journey-approved must be accepted once the question is answered "yes" and its ledger row is confirmed: ' + accepted.stdout + accepted.stderr)

  writeNotes(dir, [projectNote('N005', 'open'), question])
  const blockedByProject = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(blockedByProject.status, 2, 'D4: journey-approved must CONTINUE TO refuse (exit 2) while a project note is open, even alongside an unanswered question: ' + blockedByProject.stdout + blockedByProject.stderr)
  assert.match(blockedByProject.stdout + blockedByProject.stderr, /project note\(s\) open: N005/,
    'D4: the project-note refusal must CONTINUE TO carry the exact prefix naming N005, and must fire before the question refusal: ' + blockedByProject.stdout + blockedByProject.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260906-03-7
// ---------------------------------------------------------------------------
test('AC-20260906-03-7: `notes open` prints "❓ questions: N open" first, then each open question under its journey/screen, then answered questions under "answered:" ("no → \\"<text>\\"" for a "no" verdict); `ledger counts` prints the exact "📎 catches: <n> — question <q> · note <m> · unlinked <u>" line after 📒 ledger, derived from addressed.ledgerRow', () => {
  const dir = tmpdir('mocks-notes-questions-open')
  bare(dir)
  writeSeed(dir) // declares JOURNEY -> signin -> invite -> session-live

  const open = {
    id: 'N001', scope: 'mock', screen: LABELS[0], state: null, kind: 'question', ledgerId: 'W7',
    text: 'single-use link', by: 'session', at: nowIso(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
  const answered = {
    id: 'N002', scope: 'mock', screen: LABELS[1], state: null, kind: 'question', ledgerId: 'W8',
    text: 'invite expires in 1h', by: 'session', at: nowIso(), status: 'resolved',
    addressed: null, reply: null, resolvedBy: 'Ren', resolvedAt: nowIso(),
    answer: { verdict: 'no', text: 'Owner sets modality', by: 'Ren', at: nowIso() },
  }
  writeNotes(dir, [open, answered])

  const opened = bare(dir, ['notes', 'open'])
  assert.strictEqual(opened.status, 0, '`notes open` must exit 0 over a valid seed.md + notes.json carrying questions: ' + opened.stderr)
  const out = opened.stdout
  assert.ok(out.startsWith('❓ questions: 1 open'),
    'D6: `notes open` must print "❓ questions: 1 open" as its first line for one open question out of two total — a different count means the questions block or its counting drifted: got ' + JSON.stringify(out))
  const qIdx = out.indexOf('❓')
  const journeyIdx = out.indexOf(JOURNEY, qIdx)
  const w7Idx = out.indexOf('W7', journeyIdx === -1 ? qIdx : journeyIdx)
  const answeredIdx = out.indexOf('answered:')
  assert.ok(journeyIdx > -1 && journeyIdx < w7Idx, 'D6: the open question W7 must be grouped under its declaring journey "' + JOURNEY + '": got ' + JSON.stringify(out))
  assert.ok(answeredIdx > -1 && w7Idx < answeredIdx, 'D6: the open question W7 must print before the "answered:" block: got ' + JSON.stringify(out))
  assert.match(out.slice(answeredIdx), /W8/, 'D6: the answered question W8 must print inside the "answered:" block: got ' + JSON.stringify(out))
  assert.match(out.slice(answeredIdx), /no → "Owner sets modality"/,
    'D6: an answered "no" question must print exactly `no → "<text>"` under answered: got ' + JSON.stringify(out))

  const c1 = ledgerCmd(dir, 'catch', ['--id', 'M1', '--what', 'wrong link lifetime', '--step', 'WIREFRAMES', '--cost', '5 minutes'])
  assert.strictEqual(c1.status, 0, 'test setup requires `ledger catch --id M1` to be accepted: ' + c1.stderr)
  const c2 = ledgerCmd(dir, 'catch', ['--id', 'M2', '--what', 'wrong copy', '--step', 'WIREFRAMES', '--cost', '5 minutes'])
  assert.strictEqual(c2.status, 0, 'test setup requires `ledger catch --id M2` to be accepted: ' + c2.stderr)
  const c3 = ledgerCmd(dir, 'catch', ['--id', 'M3', '--what', 'unrelated typo', '--step', 'WIREFRAMES', '--cost', '5 minutes'])
  assert.strictEqual(c3.status, 0, 'test setup requires `ledger catch --id M3` to be accepted: ' + c3.stderr)

  writeNotes(dir, [
    Object.assign({}, open, { status: 'addressed', addressed: { at: nowIso(), change: 'redrawn with expiry', ledgerRow: 'M1' } }),
    answered,
    mockNote('N003', 'addressed', { addressed: { at: nowIso(), change: 'copy fixed', ledgerRow: 'M2' } }),
  ])

  const counts = ledgerCmd(dir, 'counts')
  assert.strictEqual(counts.status, 0, '`ledger counts` must exit 0: ' + counts.stderr)
  const lines = counts.stdout.split('\n').filter((l) => l.trim() !== '')
  const ledgerIdx = lines.findIndex((l) => l.startsWith('📒 ledger:'))
  assert.ok(ledgerIdx > -1, '`ledger counts` must still print the existing 📒 ledger: line: got ' + JSON.stringify(counts.stdout))
  assert.strictEqual(lines[ledgerIdx + 1], '📎 catches: 3 — question 1 · note 1 · unlinked 1',
    'D6: `ledger counts` must print the exact catch-provenance line immediately after 📒 ledger, deriving question 1 (M1, addressed by a question note) / note 1 (M2, addressed by a plain note) / unlinked 1 (M3, addressed by neither) from addressed.ledgerRow: got ' + JSON.stringify(counts.stdout))
})

// ---------------------------------------------------------------------------
// s0 pin (review of specs/20260906/03-questions-on-the-wireframe.md build): the spec's own
// follow-up flow — answer a question "no" via answerQuestion, then the session's own
// `notes address --id <qid> --change … --ledger M15` (Behavior: "notes open shows it under
// answered:, so the session records the catch … then notes address … and redraws") — flips
// addressNote's status back to "addressed", and "unanswered" was keyed on `status !== "resolved"`
// instead of `answer == null`: a question the session has already answered and addressed reads
// back as unresolved again, re-blocking gates that should stay open and re-appearing as an open
// question in `notes open`.
// ---------------------------------------------------------------------------
test('AC-20260906-03-5 / AC-20260906-03-7 (s0 pin): a question answered "no" and then addressed via `notes address` must stay non-blocking (unresolvedFor empty, journey-approved still accepts) and must still print under "answered:" with 0 open — answered-ness keys on answer!=null, never on status', () => {
  const dir = tmpdir('mocks-notes-answered-then-addressed')
  advanceToJourneyDrawn(dir)
  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  const ledgerRow = ledgerCmd(dir, 'add', [
    '--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'single-use link',
    '--tag', 'inferred', '--status', 'open',
  ])
  assert.strictEqual(ledgerRow.status, 0, 'test setup requires the W7 ledger row to be accepted: ' + ledgerRow.stderr)

  const question = {
    id: 'N010', scope: 'mock', screen: LABELS[0], state: null, kind: 'question', ledgerId: 'W7',
    text: 'single-use link', by: 'session', at: nowIso(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }

  // Answer "no" via the lib (mirrors what /__notes/answer does server-side).
  const answeredResult = answerQuestion([question], 'N010', { verdict: 'no', text: 'Owner sets modality', by: 'Ren' })
  assert.strictEqual(answeredResult.note.status, 'resolved', 'test setup requires answerQuestion to set status "resolved": got ' + JSON.stringify(answeredResult.note))
  writeNotes(dir, answeredResult.notes)

  // Mirror what a "no" answer writes to the ledger (D4/A2), so the generic ledger gate does not
  // independently block journey-approved below for an unrelated reason.
  const overridden = ledgerCmd(dir, 'set', ['--id', 'W7', '--status', 'overridden', '--tag', 'inferred'])
  assert.strictEqual(overridden.status, 0, 'test setup requires `ledger set` to override W7 (mirroring what the "no" answer writes): ' + overridden.stderr)

  // The session's own follow-up: record the catch, then link the question note to it via
  // `notes address` — the real driver, not a hand-written fixture.
  const addressed = bare(dir, ['notes', 'address', '--id', 'N010', '--change', 'redrawn with expiry', '--ledger', 'M15'])
  assert.strictEqual(addressed.status, 0, '`notes address --id N010 --change … --ledger M15` must be accepted on an already-answered question: ' + addressed.stdout + addressed.stderr)
  const notesAfterAddress = readNotesOnDisk(dir)
  const afterAddress = notesAfterAddress.find((n) => n.id === 'N010')
  assert.ok(afterAddress.answer && afterAddress.answer.verdict === 'no',
    'test setup requires `notes address` to leave the prior answer in place — an answer wiped by address means the fixture no longer represents "answered then addressed": got ' + JSON.stringify(afterAddress))

  // (a) unresolvedFor must treat an answered-then-addressed question as resolved for gate
  // purposes — keyed on answer!=null, never on status!=="resolved".
  const stillUnresolved = unresolvedFor(notesAfterAddress, [LABELS[0]])
  assert.deepStrictEqual(stillUnresolved, [],
    's0: unresolvedFor must return no rows for a question that has been answered (answer.verdict:"no") even though `notes address` moved its status to "addressed" — a non-empty result means answered-ness is still keyed on status instead of answer, re-blocking every gate that reads it: got ' + JSON.stringify(stillUnresolved))

  // (a, exec-level) journey-approved must still accept.
  const approved = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(approved.status, 0,
    's0: journey-approved must still accept once an answered question has been addressed via `notes address` — a refusal here means the "unanswered" check re-triggered on the addressed status instead of the recorded answer: ' + approved.stdout + approved.stderr)

  // (b) `notes open` must report 0 open questions and print this one under "answered:".
  const opened = bare(dir, ['notes', 'open'])
  assert.strictEqual(opened.status, 0, '`notes open` must exit 0: ' + opened.stderr)
  assert.ok(opened.stdout.startsWith('❓ questions: 0 open'),
    's0: `notes open` must report "❓ questions: 0 open" once the only question has been answered and addressed — a non-zero count means it re-reads as an open/unanswered question: got ' + JSON.stringify(opened.stdout))
  const answeredIdx = opened.stdout.indexOf('answered:')
  assert.ok(answeredIdx > -1 && opened.stdout.slice(answeredIdx).includes('N010'),
    's0: the answered-then-addressed question N010 must still print under "answered:", not reappear as an open question: got ' + JSON.stringify(opened.stdout))
})

// ---------------------------------------------------------------------------
// specs/20260906/06-sketch-high-fidelity-and-critique.md D3/D4, AC-20260906-06-3: `notes add`
// does not exist as a driver subcommand yet — cmdNotes only knows open/address/reply and dies
// naming them for any other sub, so every add-path assertion below is red; REASONS on
// lib/mocks-notes.js is still the four-item enum, so validateNotes rejects reason:"efficiency";
// and `notes open`'s noteTag() has no `[critic: <blindspot>]` rendering for a critic note.
// ---------------------------------------------------------------------------
test('AC-20260906-06-3: `notes add` appends a well-formed critic note and exits 0, refuses an unknown reason naming all eight, refuses --kind question/--ledger-id pointing at ledger add --screen, refuses --scope mock with no --screen, `notes open` renders the critic tag, and validateNotes accepts reason "efficiency"', () => {
  const dir = tmpdir('mocks-notes-add')
  bare(dir) // cold-root scaffold
  writeSeed(dir) // declares JOURNEY -> signin -> invite -> session-live

  const added = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', 'signin', '--state', 'error',
    '--by', 'critic', '--reason', 'error-recovery', '--text', 'no way back to the invite',
  ])
  assert.strictEqual(added.status, 0,
    '`notes add --scope mock --screen signin --state error --by critic --reason error-recovery --text "..."` must be accepted: ' + added.stdout + added.stderr)
  const onDisk = readNotesOnDisk(dir)
  assert.strictEqual(onDisk.length, 1,
    '`notes add` must append exactly one note to notes.json: got ' + JSON.stringify(onDisk))
  assert.deepStrictEqual(
    { scope: onDisk[0].scope, screen: onDisk[0].screen, state: onDisk[0].state, by: onDisk[0].by, reason: onDisk[0].reason, status: onDisk[0].status },
    { scope: 'mock', screen: 'signin', state: 'error', by: 'critic', reason: 'error-recovery', status: 'open' },
    'AC-3 pins the exact appended shape — a mismatch means `notes add` is not writing the CLI args straight through addNote: got ' + JSON.stringify(onDisk[0]))

  const badReason = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', 'signin', '--by', 'critic', '--reason', 'typo', '--text', 'x',
  ])
  assert.strictEqual(badReason.status, 2,
    '`notes add --reason typo` must exit 2 — an unknown reason is a usage error: ' + badReason.stdout + badReason.stderr)
  for (const reason of ['missing-screen', 'wrong-direction', 'wrong-words', 'other', 'error-prevention', 'error-recovery', 'help', 'efficiency']) {
    assert.match(badReason.stdout + badReason.stderr, new RegExp(reason),
      'D4: the unknown-reason refusal must name all eight reasons, including "' + reason + '", so an author can read the whole enum off the error: ' + badReason.stdout + badReason.stderr)
  }

  const withKind = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', 'signin', '--by', 'critic', '--kind', 'question', '--text', 'x',
  ])
  assert.strictEqual(withKind.status, 2,
    '`notes add --kind question` must exit 2 — questions come from `ledger add --screen`, never `notes add`: ' + withKind.stdout + withKind.stderr)
  assert.match(withKind.stdout + withKind.stderr, /ledger add --screen/,
    'D4: the --kind question refusal must name "ledger add --screen" as the remedy: ' + withKind.stdout + withKind.stderr)

  const withLedgerId = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', 'signin', '--by', 'critic', '--ledger-id', 'W7', '--text', 'x',
  ])
  assert.strictEqual(withLedgerId.status, 2,
    '`notes add --ledger-id W7` must exit 2 for the same reason as --kind question — a question-only field on the plain-note verb: ' + withLedgerId.stdout + withLedgerId.stderr)
  assert.match(withLedgerId.stdout + withLedgerId.stderr, /ledger add --screen/,
    'D4: the --ledger-id refusal must also name "ledger add --screen" as the remedy: ' + withLedgerId.stdout + withLedgerId.stderr)

  const scopeMockNoScreen = bare(dir, ['notes', 'add', '--scope', 'mock', '--by', 'critic', '--text', 'x'])
  assert.strictEqual(scopeMockNoScreen.status, 2,
    '`notes add --scope mock` with no --screen must exit 2 per the Contracts exit-2 row: ' + scopeMockNoScreen.stdout + scopeMockNoScreen.stderr)

  const opened = bare(dir, ['notes', 'open'])
  assert.strictEqual(opened.status, 0, '`notes open` must exit 0: ' + opened.stderr)
  assert.match(opened.stdout, /\[critic: error-recovery\]/,
    'D4: `notes open` must render a critic note\'s reason as "[critic: error-recovery]": got ' + JSON.stringify(opened.stdout))

  const withEfficiency = validateNotes([Object.assign({}, onDisk[0], { reason: 'efficiency' })])
  assert.deepStrictEqual(withEfficiency.errors, [],
    'D4: validateNotes must accept reason "efficiency" with zero errors — the reason enum must gain all four blind-spot values: got ' + JSON.stringify(withEfficiency.errors))
})

// ---------------------------------------------------------------------------
// specs/20260907/08-walk-critic.md D3/D4/D5, AC-20260907-08-4/-5/-6/-7. spec/scripts/lib/mocks-notes.js
// carries no "walk" kind yet (KINDS is still ['note', 'question'], REASONS the eight-item plain
// enum with no WALK_REASONS appended), and mocks-driver.js's `notes add` accepts no --kind flag
// at all yet — every test below is red until D3/D4/D5 land.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260907-08-4
// ---------------------------------------------------------------------------
test('AC-20260907-08-4: validateNotes accepts a well-formed walk note (scope mock, a screen, a state, a reason from the six flow breaks) with zero errors, reports one error per missing piece on an incomplete one (a wrong-words reason naming the exact six-item enum), and rejects a plain note carrying a walk reason', () => {
  const base = {
    id: 'N001', scope: 'mock', screen: 'invite-code', state: 'error', text: 'no way back to the invite step',
    by: 'walk-critic', at: new Date().toISOString(), status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }

  const goodWalk = Object.assign({}, base, { kind: 'walk', reason: 'no-path-back' })
  const clean = validateNotes([goodWalk])
  assert.deepStrictEqual(clean.errors, [],
    'D3: a well-formed walk note ({kind:"walk", scope:"mock", screen, state, reason:"no-path-back"}) must validate with zero errors: got ' + JSON.stringify(clean.errors))

  const wrongReason = Object.assign({}, base, { id: 'N002', kind: 'walk', reason: 'wrong-words' })
  const r1 = validateNotes([wrongReason])
  assert.strictEqual(r1.errors.length, 1,
    'D3: a walk note with an unknown reason "wrong-words" must produce exactly one error: ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /reason must be one of no-path-back\|no-path-forward\|dead-end-state\|missing-data\|ambiguous-control\|unrecoverable-error/,
    'the AC\'s own worked example ({kind:"walk", reason:"wrong-words"}) must produce this exact "reason must be one of …" enum text: ' + JSON.stringify(r1.errors))

  const noState = Object.assign({}, base, { id: 'N003', kind: 'walk', reason: 'no-path-back', state: null })
  const r2 = validateNotes([noState])
  assert.strictEqual(r2.errors.length, 1, 'D3: a walk note with no state must produce exactly one error naming the missing piece: ' + JSON.stringify(r2.errors))
  assert.match(r2.errors.join(' '), /state/, 'the missing-state error must name the field "state": ' + JSON.stringify(r2.errors))

  const noScreen = Object.assign({}, base, { id: 'N004', kind: 'walk', reason: 'no-path-back', screen: null })
  const r3 = validateNotes([noScreen])
  assert.ok(r3.errors.length >= 1, 'D3: a walk note with no screen must produce at least one error naming the missing piece: ' + JSON.stringify(r3.errors))
  assert.match(r3.errors.join(' '), /screen/, 'the missing-screen error must name the field "screen": ' + JSON.stringify(r3.errors))

  const plainWithWalkReason = Object.assign({}, base, { id: 'N005', reason: 'no-path-back' })
  const r4 = validateNotes([plainWithWalkReason])
  assert.strictEqual(r4.errors.length, 1,
    'D3: a plain note (no kind) carrying a walk-only reason "no-path-back" must be an error — the reason belongs to the walk kind, not a plain note: ' + JSON.stringify(r4.errors))
})

// ---------------------------------------------------------------------------
// AC-20260907-08-5 / AC-20260907-08-6
// ---------------------------------------------------------------------------
test('AC-20260907-08-5 / AC-20260907-08-6: `notes add --kind walk` against a screen whose mock declares the given state appends a note with kind "walk" and status "open" and exits 0; `--kind question`/`--ledger-id` exit 2 naming `ledger add --screen`; an undeclared screen, an undeclared state, and a missing --state/--reason each exit 2, the undeclared-state case naming the states the screen does declare', () => {
  const dir = tmpdir('mocks-notes-walk-add')
  bare(dir) // cold-root scaffold
  writeSeed(dir) // declares JOURNEY -> signin -> invite -> session-live
  writeWireframe(dir, LABELS[0]) // design/mocks/signin.html, default states: empty, loading, error

  const added = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0], '--state', 'error',
    '--kind', 'walk', '--reason', 'no-path-back', '--by', 'walk-critic', '--text', 'the wrong-code state offers no way back',
  ])
  assert.strictEqual(added.status, 0,
    'AC-5: `notes add --kind walk` against a screen that declares the given state must exit 0: ' + added.stdout + added.stderr)
  const onDisk = readNotesOnDisk(dir)
  assert.strictEqual(onDisk.length, 1, '`notes add --kind walk` must append exactly one note: got ' + JSON.stringify(onDisk))
  assert.deepStrictEqual(
    { kind: onDisk[0].kind, status: onDisk[0].status, scope: onDisk[0].scope, screen: onDisk[0].screen, state: onDisk[0].state, reason: onDisk[0].reason, by: onDisk[0].by },
    { kind: 'walk', status: 'open', scope: 'mock', screen: LABELS[0], state: 'error', reason: 'no-path-back', by: 'walk-critic' },
    'AC-5: the appended note must carry kind:"walk" and status:"open" plus the CLI args verbatim: got ' + JSON.stringify(onDisk[0]))

  const withQuestion = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0], '--state', 'error',
    '--kind', 'question', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(withQuestion.status, 2,
    'AC-5: `notes add --kind question` must exit 2 — the only accepted --kind value is "walk": ' + withQuestion.stdout + withQuestion.stderr)
  assert.match(withQuestion.stdout + withQuestion.stderr, /ledger add --screen/,
    'D4: the --kind question refusal must name "ledger add --screen" as the remedy: ' + withQuestion.stdout + withQuestion.stderr)

  const withLedgerId = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0], '--kind', 'walk', '--reason', 'no-path-back',
    '--state', 'error', '--ledger-id', 'W7', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(withLedgerId.status, 2, 'AC-5: `--ledger-id` stays refused outright even alongside --kind walk: ' + withLedgerId.stdout + withLedgerId.stderr)
  assert.match(withLedgerId.stdout + withLedgerId.stderr, /ledger add --screen/,
    'D4: the --ledger-id refusal must also name "ledger add --screen": ' + withLedgerId.stdout + withLedgerId.stderr)

  const undeclaredScreen = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', 'nowhere', '--state', 'error',
    '--kind', 'walk', '--reason', 'no-path-back', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(undeclaredScreen.status, 2,
    'AC-6: a walk add naming a screen with no design/mocks/<label>.html on disk must exit 2: ' + undeclaredScreen.stdout + undeclaredScreen.stderr)

  const undeclaredState = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0], '--state', 'hover',
    '--kind', 'walk', '--reason', 'no-path-back', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(undeclaredState.status, 2,
    'AC-6: `--state hover` on a screen declaring empty/loading/error must exit 2: ' + undeclaredState.stdout + undeclaredState.stderr)
  for (const declared of ['default', 'empty', 'loading', 'error']) {
    assert.match(undeclaredState.stdout + undeclaredState.stderr, new RegExp(declared),
      'AC-6: the undeclared-state refusal must list the states the screen does declare, including "' + declared + '": ' + undeclaredState.stdout + undeclaredState.stderr)
  }

  const noState = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0],
    '--kind', 'walk', '--reason', 'no-path-back', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(noState.status, 2, 'AC-6: a walk add with no --state must exit 2: ' + noState.stdout + noState.stderr)

  const noReason = bare(dir, [
    'notes', 'add', '--scope', 'mock', '--screen', LABELS[0], '--state', 'error',
    '--kind', 'walk', '--by', 'walk-critic', '--text', 'x',
  ])
  assert.strictEqual(noReason.status, 2, 'AC-6: a walk add with no --reason must exit 2: ' + noReason.stdout + noReason.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-08-7
// ---------------------------------------------------------------------------
test('AC-20260907-08-7: `notes open` renders a walk finding as "<id> [<status>] [walk: <reason>] <by> · <text>", keeping the status tag beside the walk tag, never instead of it', () => {
  const dir = tmpdir('mocks-notes-walk-render')
  bare(dir)
  writeSeed(dir)

  const walkNote = {
    id: 'N001', scope: 'mock', screen: LABELS[0], state: 'error', text: 'the wrong-code state offers no way back',
    by: 'walk-critic', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'walk', reason: 'no-path-back',
  }
  writeNotes(dir, [walkNote])

  const opened = bare(dir, ['notes', 'open'])
  assert.strictEqual(opened.status, 0, '`notes open` must exit 0 over a valid seed.md + a walk-kind note: ' + opened.stderr)
  assert.match(opened.stdout, /N001 \[open\] \[walk: no-path-back\] walk-critic · the wrong-code state offers no way back/,
    'D5: `notes open` must render the walk finding as exactly "N001 [open] [walk: no-path-back] walk-critic · the wrong-code state offers no way back", the walk tag riding beside the status tag: got ' + JSON.stringify(opened.stdout))
})

// ---------------------------------------------------------------------------
// specs/20260907/10-client-review.md D3, AC-20260907-10-3: `ORIGINS`/`originOf` and origin
// validation do not exist yet on spec/scripts/lib/mocks-notes.js — this test is red until D3
// lands.
// ---------------------------------------------------------------------------
test('AC-20260907-10-3: validateNotes rejects origin "customer" naming the id and field "origin"; a note with no origin validates; originOf returns "walk" for {kind:"walk"} with no origin, "session" for a plain note with no origin, and the stored value otherwise', () => {
  const base = {
    id: 'N001', scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'y',
    at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
  }

  const badOrigin = Object.assign({}, base, { origin: 'customer' })
  const r1 = validateNotes([badOrigin])
  assert.strictEqual(r1.errors.length, 1,
    'D3: a note with origin "customer" (outside walk|client|session) must produce exactly one error, not zero (silently accepted) or more than one: ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /N001/, 'the bad-origin error must name the offending note id "N001": ' + JSON.stringify(r1.errors))
  assert.match(r1.errors.join(' '), /origin/, 'the bad-origin error must name the field "origin": ' + JSON.stringify(r1.errors))

  const noOrigin = Object.assign({}, base, { id: 'N002' })
  const clean = validateNotes([noOrigin])
  assert.deepStrictEqual(clean.errors, [],
    'D3: a note carrying no "origin" field at all (the legacy shape) must validate with zero errors — origin is additive, and its absence is originOf()\'s own job to resolve: ' + JSON.stringify(clean.errors))

  assert.strictEqual(originOf({ kind: 'walk' }), 'walk',
    'D3: originOf must return "walk" for a note with kind:"walk" and no stored origin — a walk finding is a walk finding by construction')
  assert.strictEqual(originOf({}), 'session',
    'D3: originOf must return "session" for a plain note (no kind, no origin) — notes written before this spec default to "session" per ADR-0012')
  assert.strictEqual(originOf({ origin: 'client' }), 'client',
    'D3: originOf must return the stored value verbatim when one is present, even alongside a kind that would otherwise imply a different default')
})

// ---------------------------------------------------------------------------
// specs/20260907/10-client-review.md D8, AC-20260907-10-12: `waiveNote` does not exist yet on
// spec/scripts/lib/mocks-notes.js — this test is red until D8 lands.
// ---------------------------------------------------------------------------
test('AC-20260907-10-12: waiveNote(notes, id, {reason, by, now}) throws naming the days elapsed (6) and the first accepted date on a client note whose lastClientAt is 6 days before now; at 7 days it returns the note resolved with resolvedBy "waiver" and waived {at, reason, by}; on a question it additionally sets answer.verdict "waived" with text = the reason, and validateNotes accepts verdict "waived" with text and rejects it without', () => {
  const now = new Date('2026-09-09T00:00:00.000Z')
  const DAY = 86400000
  const sixDaysAgo = new Date(now.getTime() - 6 * DAY).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY).toISOString()

  const clientNoteBase = {
    id: 'N001', scope: 'mock', screen: 'signin', state: 'error', text: 'the color is wrong',
    by: 'client', at: sixDaysAgo, status: 'open', addressed: null, reply: null, resolvedBy: null,
    resolvedAt: null, origin: 'client', capture: null, resolution: null, waived: null, answer: null,
  }

  const tooSoon = Object.assign({}, clientNoteBase, { lastClientAt: sixDaysAgo })
  assert.throws(() => waiveNote([tooSoon], 'N001', { reason: 'silent client', by: 'session', now }),
    /6/, 'AC-12: waiveNote on a client note 6 days silent must throw naming the days elapsed (6) — a note that has not gone silent for the full seven days must never be releasable')

  const ready = Object.assign({}, clientNoteBase, { lastClientAt: sevenDaysAgo })
  const waived = waiveNote([ready], 'N001', { reason: 'silent client', by: 'session', now })
  assert.strictEqual(waived.note.status, 'resolved',
    'AC-12: waiveNote at exactly seven days silent must set status "resolved": got ' + JSON.stringify(waived.note))
  assert.strictEqual(waived.note.resolvedBy, 'waiver',
    'AC-12: waiveNote must set resolvedBy "waiver" so a waived note is distinguishable from a session/client resolve: got ' + JSON.stringify(waived.note))
  assert.deepStrictEqual(
    { reason: waived.note.waived && waived.note.waived.reason, by: waived.note.waived && waived.note.waived.by },
    { reason: 'silent client', by: 'session' },
    'AC-12: waiveNote must record waived.reason/waived.by verbatim from its input: got ' + JSON.stringify(waived.note.waived))
  assert.ok(waived.note.waived && waived.note.waived.at, 'AC-12: waiveNote must record a waived.at timestamp: got ' + JSON.stringify(waived.note.waived))

  const question = {
    id: 'N002', scope: 'mock', screen: 'signin', state: null, kind: 'question', ledgerId: 'W7',
    text: 'single-use link', by: 'session', at: sevenDaysAgo, status: 'open',
    addressed: null, reply: null, resolvedBy: null, resolvedAt: null, answer: null,
  }
  const waivedQuestion = waiveNote([question], 'N002', { reason: 'no client available', by: 'session', now, lastClientAt: sevenDaysAgo })
  assert.strictEqual(waivedQuestion.note.answer && waivedQuestion.note.answer.verdict, 'waived',
    'AC-12: waiveNote on a question must additionally set answer.verdict "waived": got ' + JSON.stringify(waivedQuestion.note))
  assert.strictEqual(waivedQuestion.note.answer && waivedQuestion.note.answer.text, 'no client available',
    'AC-12: waiveNote on a question must set answer.text to the waiver reason verbatim: got ' + JSON.stringify(waivedQuestion.note))

  const withWaivedVerdict = validateNotes([Object.assign({}, question, {
    answer: { verdict: 'waived', text: 'no client available', by: 'session', at: now.toISOString() },
  })])
  assert.deepStrictEqual(withWaivedVerdict.errors, [],
    'AC-12: validateNotes must accept answer.verdict "waived" with non-empty text — the verdict enum gains "waived": ' + JSON.stringify(withWaivedVerdict.errors))

  const withoutText = validateNotes([Object.assign({}, question, {
    answer: { verdict: 'waived', text: '', by: 'session', at: now.toISOString() },
  })])
  assert.ok(withoutText.errors.length >= 1,
    'AC-12: validateNotes must reject answer.verdict "waived" with empty text — a waiver reason is required: got zero errors')
})

// ---------------------------------------------------------------------------
// specs/20260907/10-client-review.md D11, AC-20260907-10-18: writeNotes still writes
// notes.json directly today (no tmp file, no renameSync) — this test is red until D11 lands.
// ---------------------------------------------------------------------------
test('AC-20260907-10-18: WHEN writeNotes runs in-process with fs.renameSync patched to throw THE SYSTEM leaves an existing notes.json byte-identical; unpatched it leaves no notes.json.tmp-* file beside notes.json and the file parses to the given array', () => {
  const dir = tmpdir('mocks-notes-atomic-write')
  const fsReal = require('node:fs')
  const notesFile = path.join(dir, 'design/mocks/notes.json')

  const initial = [Object.assign(projectNote('N001', 'open'))]
  writeNotesLib(dir, initial)
  const before = fsReal.readFileSync(notesFile, 'utf8')

  const originalRename = fsReal.renameSync
  fsReal.renameSync = () => { throw new Error('boom — simulated rename failure') }
  try {
    assert.throws(() => writeNotesLib(dir, [...initial, projectNote('N002', 'open')]),
      'AC-18: writeNotes must propagate a renameSync failure rather than swallow it')
  } finally {
    fsReal.renameSync = originalRename
  }
  const after = fsReal.readFileSync(notesFile, 'utf8')
  assert.strictEqual(after, before,
    'AC-18: a renameSync failure must leave the existing notes.json byte-identical — the write never touches the final path directly, only the tmp file it renames from')

  writeNotesLib(dir, initial)
  const entries = fsReal.readdirSync(path.join(dir, 'design/mocks'))
  assert.ok(!entries.some((f) => /^notes\.json\.tmp-/.test(f)),
    'AC-18: an unpatched writeNotes call must leave no notes.json.tmp-* file beside notes.json once the rename completes: got ' + JSON.stringify(entries))
  assert.deepStrictEqual(JSON.parse(fsReal.readFileSync(notesFile, 'utf8')), initial,
    'AC-18: the final notes.json must parse to exactly the given array')
})
