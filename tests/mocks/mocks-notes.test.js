'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260902/10-page-notes-review-loop.md D1/D4/D5, AC-20260902-10-1/-5/-6/-10.
// spec/scripts/lib/mocks-notes.js and the driver's `notes` subcommands + mark gates do not
// exist yet — the top-level require below fails the whole file (the same red-phase pattern
// tests/mocks/mocks-ledger.test.js used for spec 06's not-yet-existing lib) until D1 lands;
// the CLI-level tests stay red independently (mocks-driver.js ignores an unknown "notes" verb
// and falls through to its ordinary bare-step/mark output) once the lib exists but D4/D5 don't.
const { validateNotes } = require('../../spec/scripts/lib/mocks-notes')

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
function writeSeed(dir) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for tests.
Built for QA engineers exercising the notes layer.
It must let a user complete a short staff interview.

## Facts
${factLines}

## References
- none

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
function writeWireframe(dir, label) {
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
}
function writeThemeDirection(dir, kebab, labels) {
  writeFile(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--text-body:#111}\n')
  for (const label of labels) {
    writeFile(path.join(dir, 'design/theme', kebab, label + '.html'),
      '<link rel="stylesheet" href="tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
}
function writeSkinned(dir, labels, status = 'sketch') {
  for (const label of labels) {
    writeFile(path.join(dir, 'design/mocks', label + '.html'),
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<link rel="stylesheet" href="../tokens.css">\n' +
      '<style>* { box-sizing: border-box; }</style>\n' +
      '<main data-screen-label="' + label + '" data-status="' + status + '">' + label + '</main>\n')
  }
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
  const shapePicked = mark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapePicked.status, 0, 'test setup requires shape-picked to be accepted: ' + shapePicked.stderr)

  writeCanon(dir)
  const canonWritten = mark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)

  for (const label of LABELS) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)
}

function advanceToThemePicked(dir) {
  const composeDirection = (kebab, ledgerId, other) => {
    const ledgerR = ledgerCmd(dir, 'add', [
      '--id', ledgerId, '--step', 'THEME', '--kind', 'product',
      '--claim', 'theme-directions: ' + kebab, '--tag', 'said-by-user', '--status', 'confirmed',
    ])
    assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR.stderr)
    writeThemeDirection(dir, kebab, LABELS)
    const r = mark(dir, 'direction-composed', ['--direction', kebab])
    assert.strictEqual(r.status, 0, 'test setup requires direction-composed to be accepted for "' + kebab + '": ' + r.stderr)
  }
  composeDirection('quiet', 'P15')
  composeDirection('warm', 'P16')
  const themeLedger = ledgerCmd(dir, 'add', [
    '--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet',
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm',
  ])
  assert.strictEqual(themeLedger.status, 0, 'test setup requires the theme-pick ledger row to be accepted: ' + themeLedger.stderr)
  const themePicked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(themePicked.status, 0, 'test setup requires theme-picked to be accepted: ' + themePicked.stderr)
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
// AC-20260902-10-6
// ---------------------------------------------------------------------------
test('AC-20260902-10-6: journey-approved, journey-skinned, journey-reviewed, and approved all refuse on an open project note or an unresolved journey note, naming the note ids', () => {
  const dir = tmpdir('mocks-notes-gate')
  advanceToJourneyDrawn(dir)

  // journey-approved: open project note blocks it first.
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

  advanceToThemePicked(dir)
  writeSkinned(dir, LABELS)

  // journey-skinned: same rule.
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N002', 'open')])
  const blockedSkin = mark(dir, 'journey-skinned', ['--journey', JOURNEY])
  assert.strictEqual(blockedSkin.status, 2, 'journey-skinned must apply the same unresolved-note rule as journey-approved: ' + blockedSkin.stdout + blockedSkin.stderr)
  assert.match(blockedSkin.stdout + blockedSkin.stderr, new RegExp('unresolved note\\(s\\) on ' + JOURNEY + ': N002'),
    'journey-skinned\'s refusal must name the journey and the unresolved note id, the same D5 prefix journey-approved uses: ' + blockedSkin.stdout + blockedSkin.stderr)

  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N002', 'resolved')])
  const skinnedNow = mark(dir, 'journey-skinned', ['--journey', JOURNEY])
  assert.strictEqual(skinnedNow.status, 0, 'journey-skinned must be accepted once every note is resolved: ' + skinnedNow.stdout + skinnedNow.stderr)

  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted: ' + opened.stderr)

  // journey-reviewed: same rule.
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N003', 'open')])
  const blockedReview = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(blockedReview.status, 2, 'journey-reviewed must apply the same unresolved-note rule: ' + blockedReview.stdout + blockedReview.stderr)
  assert.match(blockedReview.stdout + blockedReview.stderr, new RegExp('unresolved note\\(s\\) on ' + JOURNEY + ': N003'),
    'journey-reviewed\'s refusal must name the journey and the unresolved note id: ' + blockedReview.stdout + blockedReview.stderr)

  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N003', 'resolved')])
  const reviewedNow = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(reviewedNow.status, 0, 'journey-reviewed must be accepted once every note is resolved: ' + reviewedNow.stdout + reviewedNow.stderr)

  // approved: any unresolved note anywhere blocks it (project scope again, this time).
  writeSkinned(dir, LABELS, 'approved')
  writeNotes(dir, [projectNote('N006', 'open')])
  const blockedApproved = mark(dir, 'approved')
  assert.strictEqual(blockedApproved.status, 2, '`--mark approved` must refuse while any note anywhere is unresolved, per D5\'s "approved: any unresolved note anywhere": ' + blockedApproved.stdout + blockedApproved.stderr)
  assert.match(blockedApproved.stdout + blockedApproved.stderr, /unresolved note|N006/,
    'the approved refusal must name the unresolved note: ' + blockedApproved.stdout + blockedApproved.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260902-10-10
// ---------------------------------------------------------------------------
test('AC-20260902-10-10: `--mark journey-approved --journey <j>` continues to accept once every note is resolved', () => {
  const dir = tmpdir('mocks-notes-allresolved')
  advanceToJourneyDrawn(dir)
  writeNotes(dir, [projectNote('N005', 'resolved'), mockNote('N001', 'resolved')])
  const r = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-approved must accept once every project and journey note is resolved — a gate that still refuses here is stricter than D5 requires: ' + r.stdout + r.stderr)
})
