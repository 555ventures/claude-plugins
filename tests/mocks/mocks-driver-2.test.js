'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf,
  writeFile, statusJson,
  writeCanon, writeWireframe, writeKitCanon,
  decideLook,
  advanceToSeedDone, advanceToShapePicked, advanceToKitSigned, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToDirectionComposed, advanceToThemePicked, advanceToApproved,
  ledgerCmd,
  writeFixtureCapture, writeCaptureConfig,
  stubNpx, freePort, startServe, stopServe,
} = require('./mocks-driver-fixtures')

// specs/20260902/07-mocks-command-driver.md (TDD red): spec/scripts/mocks-driver.js does not
// exist yet — every test below is red until the driver lands. AC-20260902-07-13, and
// specs/20260905/06-plugin-owned-capture-at-approval.md's D5 render-gate-at-approval AC-7..9.
// Fixtures build the SEED->APPROVED chain through the real binary (advanceTo* helpers), the way
// tests/genesis/genesis-driver.test.js drives genesis-driver.js, so each later-stage test's
// setup is itself an executed proof that every earlier mark's contract holds.
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split this file: shared
// fixtures live in mocks-driver-fixtures.js, and the D6/D7/D8 look-stop tests (AC-20260905-02-9..15)
// moved to the sibling mocks-driver-look-stops.test.js. A second split (the guard tripped again under
// full-suite load) moved the AC-20260902-07-13 look-probe, AC-20260905-06-7/-8 capture-gate, and
// AC-20260907-04-9/-10/-12 kit tests to mocks-driver-4.test.js; test logic unchanged.
//
// Split from tests/mocks/mocks-driver.test.js under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md); test logic unchanged.
//
// specs/20260906/02-mocks-ends-at-wireframes.md: SKIN and REVIEW retire — AC-20260906-02-5
// (rewrite of the former AC-20260902-07-10 approved test + retag of AC-20260905-06-9's pin) and
// AC-20260906-02-7 (rewrite of the former AC-20260902-07-11 reopen test) replace them below; the
// former AC-20260902-07-9 journey-reviewed test is deleted outright — journey-reviewed is not
// among the driver's live marks.

// ---------------------------------------------------------------------------
// AC-20260906-02-5
// ---------------------------------------------------------------------------
test('AC-20260906-02-5: approved refuses before theme-picked; once theme-picked, refuses on an unresolved mock note and refuses with no decided approved stop; once the stop is decided approve it stamps a sketch mock to approved byte-diff-only, records the decider, and derives APPROVED', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)

  const beforeTheme = mark(dir, 'approved')
  assert.strictEqual(beforeTheme.status, 2, 'approved must refuse before theme-picked has been recorded: ' + beforeTheme.stdout + beforeTheme.stderr)
  assert.match(beforeTheme.stderr + beforeTheme.stdout, /theme-picked first/, 'D5: the refusal must carry the exact "theme-picked first" remedy: ' + beforeTheme.stdout + beforeTheme.stderr)

  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[1]], 'P16')
  const themeRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeRow.status, 0, 'test setup requires the theme row to be accepted: ' + themeRow.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  const picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 0, 'test setup requires theme-picked to be accepted: ' + picked.stdout + picked.stderr)

  const openNote = { id: 'N001', scope: 'mock', screen: 'consent', state: null, text: 'wording is off', by: 'Ren', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  writeFile(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([openNote]))
  const noteBlocked = mark(dir, 'approved')
  assert.strictEqual(noteBlocked.status, 2, 'approved must refuse while a mock note on "consent" is unresolved: ' + noteBlocked.stdout + noteBlocked.stderr)
  assert.match(noteBlocked.stderr + noteBlocked.stdout, /N001/, 'the refusal must name the offending note id "N001": ' + noteBlocked.stdout + noteBlocked.stderr)
  fs.rmSync(path.join(dir, 'design/mocks/notes.json'))

  const noStop = mark(dir, 'approved')
  assert.strictEqual(noStop.status, 2, 'approved must refuse with no decided approved stop, even once notes are resolved: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /no look stop for approved/, 'the refusal must name the exact "no look stop for approved" message: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open signoff/, 'the refusal must name the remedy "stop open signoff": ' + noStop.stdout + noStop.stderr)

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const beforeStamp = fs.readFileSync(signinPath, 'utf8')
  assert.match(beforeStamp, /data-status="sketch"/, 'test setup requires design/mocks/' + LABELS[0] + '.html to still carry data-status="sketch" before the mark, or the byte-diff assertion below is vacuous')

  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'approved must be accepted once theme is picked, notes are resolved, and the stop is decided approve: ' + r.stdout + r.stderr)

  const afterStamp = fs.readFileSync(signinPath, 'utf8')
  assert.strictEqual(afterStamp, beforeStamp.replace('data-status="sketch"', 'data-status="approved"'),
    'AC-5: accepting approved must rewrite ' + LABELS[0] + '.html so the ONLY byte difference is data-status="sketch" -> data-status="approved": ' + JSON.stringify({ beforeStamp, afterStamp }))

  const status = statusJson(dir)
  assert.strictEqual(status.decider, 'Ren', 'accepting approved must record status.decider from the stop\'s "by"')
  assert.ok(status.marks.approved, 'accepting approved must record marks.approved')
  assert.strictEqual(status.state, 'APPROVED', 'accepting approved must derive state APPROVED')
})

test('AC-20260905-06-9 / AC-20260906-02-5: --mark approved on a host declaring no design block with CHROME_BIN=/nonexistent/chrome exits 2 with "render-gate --mocks could not run:" naming CHROME_BIN, marks.approved stays null, and the mock file is byte-unchanged (render-gate runs before any file is stamped approved)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const before = fs.readFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'), 'utf8')
  // The chain up to here (via advanceToJourneyApproved) declared a fixture capture command so
  // every earlier journey-approved mark could pass predictably — this AC needs a host declaring
  // NO design block at all when the final `approved` mark itself runs.
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({}))

  const r = runNode(SCRIPT, ['--root', dir, '--mark', 'approved'],
    { env: { ...process.env, CHROME_BIN: '/nonexistent/chrome' } })

  assert.strictEqual(r.status, 2,
    'D5: no design block declared and no browser resolved must refuse the approved mark, exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /render-gate --mocks could not run:/,
    'D5: a gate exit 2/3 (capture-family) must be refused with this exact prefix, distinct from an ordinary findings refusal: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /CHROME_BIN/,
    'the underlying render-gate remedy naming CHROME_BIN must still be visible through the driver\'s own prefix: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved, null,
    'a refused approved mark must leave marks.approved null, never recorded: ' + JSON.stringify(statusJson(dir).marks))
  const after = fs.readFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'), 'utf8')
  assert.strictEqual(after, before,
    'AC-20260906-02-5: a refused approved mark must never rewrite a mock file — the data-status stamp is the mark\'s own write and must only happen on acceptance: ' + JSON.stringify({ before, after }))
})

test('AC-20260906-02-5: approved refuses while a declared journey is not approved, even once theme is picked and the approved stop is decided approve — reopening the journey below journey-approved must re-block the mark it does not stamp', () => {
  const dir = tmpdir('mocks-driver')
  advanceToThemePicked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })

  const reopened = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(reopened.status, 0, 'test setup requires --reopen journey:<j> to be accepted on a theme-picked root, or the refusal below is not exercising an unapproved journey: ' + reopened.stdout + reopened.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved, null, 'test setup requires journeys.<j>.approved to be cleared by the reopen, or the precondition under test is not actually violated: ' + JSON.stringify(statusJson(dir).journeys))

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const before = fs.readFileSync(signinPath, 'utf8')

  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'D5: approved must refuse while any declared journey is not approved, even with theme picked and the approved stop already decided approve: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(JOURNEY),
    'D5: the refusal must name the unapproved journey "' + JOURNEY + '", not a generic message: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /journey-approved/,
    'D5: the refusal must name the remedy mark "journey-approved" so the session knows how to clear it: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved, null,
    'a refused approved mark must leave marks.approved null, never recorded: ' + JSON.stringify(statusJson(dir).marks))

  const after = fs.readFileSync(signinPath, 'utf8')
  assert.strictEqual(after, before,
    'a refused approved mark must never rewrite a mock file — the data-status stamp is the mark\'s own write and must only happen on acceptance: ' + JSON.stringify({ before, after }))
})

// ---------------------------------------------------------------------------
// AC-20260906-02-7
// ---------------------------------------------------------------------------
test('AC-20260906-02-7: --reopen theme on an APPROVED root clears theme/marks.themePicked/marks.approved/decider, leaves every journeys[j].approved unchanged, and derives THEME; --reopen journey:<j> on an APPROVED root clears that journey\'s approved + marks.approved and derives WIREFRAMES', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)
  const journeyApprovedBefore = statusJson(dir).journeys[JOURNEY].approved
  assert.ok(journeyApprovedBefore, 'test setup requires journeys.<j>.approved to be recorded before reopening theme, or the "leave journeys unchanged" assertion below is vacuous')

  const themeReopen = runNode(SCRIPT, ['--root', dir, '--reopen', 'theme'])
  assert.strictEqual(themeReopen.status, 0, '--reopen theme must exit 0 on an APPROVED root: ' + themeReopen.stdout + themeReopen.stderr)
  assert.match(themeReopen.stdout, /invalidated: theme, approved\(all\)/, 'the reopen output must print the exact D7 invalidated list for a theme reopen: ' + themeReopen.stdout)
  const status = statusJson(dir)
  assert.strictEqual(status.theme, null, '--reopen theme must clear status.theme')
  assert.strictEqual(status.marks.themePicked, null, '--reopen theme must clear marks.themePicked')
  assert.strictEqual(status.marks.approved, null, '--reopen theme must clear marks.approved')
  assert.strictEqual(status.decider, null, '--reopen theme must clear decider')
  assert.strictEqual(status.journeys[JOURNEY].approved, journeyApprovedBefore, '--reopen theme must never touch journeys[j].approved — a theme re-pick must not un-approve a journey\'s wireframes (D7 rationale)')
  const derived = stateOf(dir)
  assert.strictEqual(derived.stdout.trim(), 'THEME', 'the next derivation after --reopen theme must land on THEME')

  const dir2 = tmpdir('mocks-driver')
  advanceToApproved(dir2)
  const journeyReopen = runNode(SCRIPT, ['--root', dir2, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(journeyReopen.status, 0, '--reopen journey:<j> must exit 0 on an APPROVED root: ' + journeyReopen.stdout + journeyReopen.stderr)
  assert.match(journeyReopen.stdout, /invalidated:/, 'the reopen output must print the invalidated: prefix: ' + journeyReopen.stdout)
  assert.match(journeyReopen.stdout, /approved/, 'reopening an approved journey must list "approved" among the invalidated marks: ' + journeyReopen.stdout)
  assert.match(journeyReopen.stdout, /approved\(all\)/, 'reopening a journey on an APPROVED root must also invalidate approved(all): ' + journeyReopen.stdout)
  const status2 = statusJson(dir2)
  assert.strictEqual(status2.journeys[JOURNEY].approved, null, '--reopen journey:<j> must clear that journey\'s approved mark')
  assert.strictEqual(status2.marks.approved, null, '--reopen journey:<j> must clear marks.approved')
  const derived2 = stateOf(dir2)
  assert.strictEqual(derived2.stdout.trim(), 'WIREFRAMES', 'the next derivation after --reopen journey:<j> on the only journey must land on WIREFRAMES')
})

