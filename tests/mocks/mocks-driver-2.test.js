'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf,
  writeFile, statusJson, statusPath,
  writeCanon, writeWireframe, writeKitCanon,
  decideLook,
  advanceToSeedDone, advanceToShapePicked, advanceToKitSigned, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToJourneyWalked, advanceToApproved,
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
test('AC-20260907-07-5 / AC-20260907-07-12 / AC-20260907-08-12 (retag of AC-20260906-02-5): approved refuses on an unresolved mock note and refuses with no decided approved stop, with no theme-picked precondition left to check first; once the journey is walked and the stop is decided approve it stamps a sketch mock to approved byte-diff-only, records the decider, and derives APPROVED, all with no design/tokens.css and no status.theme anywhere', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  // AC-20260907-08-1/D1 fixture repair: WALK now sits between WIREFRAMES and SIGNOFF, so the
  // final "derives APPROVED" assertion below is vacuous unless the journey is actually walked
  // before `--mark approved` is accepted — deriveState checks allJourneysWalked() before it
  // ever checks marks.approved.
  advanceToJourneyWalked(dir)

  // AC-20260907-07-5's own precondition: no theme was ever picked, anywhere on disk or in
  // status.json — a vacuous test would prove nothing if either were secretly present.
  assert.strictEqual(fs.existsSync(path.join(dir, 'design/tokens.css')), false,
    'test setup requires no design/tokens.css to exist, or the "approved with no theme" assertion below is vacuous')
  assert.strictEqual('theme' in statusJson(dir), false,
    'test setup requires status.json to carry no top-level "theme" key at all, or the "approved with no theme" assertion below is vacuous: ' + JSON.stringify(statusJson(dir)))

  const openNote = { id: 'N001', scope: 'mock', screen: 'consent', state: null, text: 'wording is off', by: 'Ren', at: new Date().toISOString(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null }
  writeFile(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([openNote]))
  const noteBlocked = mark(dir, 'approved')
  assert.strictEqual(noteBlocked.status, 2, 'AC-20260907-07-12: approved must CONTINUE TO refuse while a mock note on "consent" is unresolved, with no theme-picked check ahead of it: ' + noteBlocked.stdout + noteBlocked.stderr)
  assert.match(noteBlocked.stderr + noteBlocked.stdout, /N001/, 'the refusal must name the offending note id "N001": ' + noteBlocked.stdout + noteBlocked.stderr)
  fs.rmSync(path.join(dir, 'design/mocks/notes.json'))

  const noStop = mark(dir, 'approved')
  assert.strictEqual(noStop.status, 2, 'AC-20260907-07-12: approved must CONTINUE TO refuse with no decided approved stop, even once notes are resolved: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /no look stop for approved/, 'the refusal must name the exact "no look stop for approved" message: ' + noStop.stdout + noStop.stderr)
  assert.match(noStop.stderr + noStop.stdout, /stop open signoff/, 'the refusal must name the remedy "stop open signoff": ' + noStop.stdout + noStop.stderr)

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const beforeStamp = fs.readFileSync(signinPath, 'utf8')
  assert.match(beforeStamp, /data-status="sketch"/, 'test setup requires design/mocks/' + LABELS[0] + '.html to still carry data-status="sketch" before the mark, or the byte-diff assertion below is vacuous')

  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'AC-20260907-07-5: approved must be accepted with no design/tokens.css and no status.theme anywhere, once notes are resolved and the stop is decided approve: ' + r.stdout + r.stderr)

  const afterStamp = fs.readFileSync(signinPath, 'utf8')
  assert.strictEqual(afterStamp, beforeStamp.replace('data-status="sketch"', 'data-status="approved"'),
    'AC-5: accepting approved must rewrite ' + LABELS[0] + '.html so the ONLY byte difference is data-status="sketch" -> data-status="approved": ' + JSON.stringify({ beforeStamp, afterStamp }))

  const status = statusJson(dir)
  assert.strictEqual(status.decider, 'Ren', 'accepting approved must record status.decider from the stop\'s "by"')
  assert.ok(status.marks.approved, 'accepting approved must record marks.approved')
  assert.strictEqual(status.state, 'APPROVED', 'accepting approved must derive state APPROVED')
})

// ---------------------------------------------------------------------------
// AC-20260907-08-12
// ---------------------------------------------------------------------------
test('AC-20260907-08-12: approved CONTINUES TO refuse on a walk-kind note whose status is "addressed", the same unresolved-note gate that blocks a plain note', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  advanceToJourneyWalked(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })

  const addressedWalkNote = {
    id: 'N001', scope: 'mock', screen: LABELS[0], state: 'default',
    text: 'the wrong-code state offers no way back', by: 'walk-critic',
    at: new Date().toISOString(), status: 'addressed',
    addressed: { at: new Date().toISOString(), change: 'added a back link', ledgerRow: null },
    reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'walk', reason: 'no-path-back',
  }
  writeFile(path.join(dir, 'design/mocks/notes.json'), JSON.stringify([addressedWalkNote]))

  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'D3/A2: a walk-kind note in "addressed" status must CONTINUE TO count as unresolved for the terminal approved mark — the same unresolvedFor primitive already gates a plain note, and a walk finding is a mock-scope note, not a new gate: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /N001/,
    'the refusal must name the offending walk-finding note id "N001": ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved, null,
    'a refused approved mark must leave marks.approved null, never recorded, even though the note carries kind "walk" rather than a plain note: ' + JSON.stringify(statusJson(dir).marks))
})

test('AC-20260905-06-9 / AC-20260906-02-5: --mark approved on a host declaring no design block with CHROME_BIN=/nonexistent/chrome exits 2 with "render-gate --mocks could not run:" naming CHROME_BIN, marks.approved stays null, and the mock file is byte-unchanged (render-gate runs before any file is stamped approved)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
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

test('AC-20260907-07-12 (retag of AC-20260906-02-5): approved refuses while a declared journey is not approved, even with no theme anywhere and the approved stop already decided approve — reopening the journey below journey-approved must re-block the mark it does not stamp', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })

  const reopened = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(reopened.status, 0, 'test setup requires --reopen journey:<j> to be accepted once the journey is approved, or the refusal below is not exercising an unapproved journey: ' + reopened.stdout + reopened.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved, null, 'test setup requires journeys.<j>.approved to be cleared by the reopen, or the precondition under test is not actually violated: ' + JSON.stringify(statusJson(dir).journeys))

  const signinPath = path.join(dir, 'design/mocks', LABELS[0] + '.html')
  const before = fs.readFileSync(signinPath, 'utf8')

  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2,
    'D5: approved must refuse while any declared journey is not approved, even with no theme anywhere and the approved stop already decided approve: ' + r.stdout + r.stderr)
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
// AC-20260906-02-7's own `--reopen theme` half is DELETED (specs/20260907/07 retires the
// target outright — there is no mark left for it to clear); its `--reopen journey:<j>` half is
// unrelated to theme and is kept below, unretagged.
// ---------------------------------------------------------------------------
test('AC-20260906-02-7: --reopen journey:<j> on an APPROVED root clears that journey\'s approved + marks.approved and derives WIREFRAMES', () => {
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

// ---------------------------------------------------------------------------
// AC-20260907-07-4
// ---------------------------------------------------------------------------
// Repair round (specs/20260907/08-walk-critic.md D6/AC-20260907-08-8): the retired-literal pin
// below is updated in place — `--reopen` now widens to journey:<j>, walk:<j>, shapes, or kit.
test('AC-20260907-07-4: --reopen theme exits 2 with the exact literal "--reopen must be journey:<j>, walk:<j>, shapes, or kit", writes nothing to status.json, and appends no row to status.reopens', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)
  const before = fs.readFileSync(statusPath(dir), 'utf8')

  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'theme'])
  assert.strictEqual(r.status, 2, 'D6: --reopen theme must exit 2 — the target is retired outright, there is no mark left to clear: ' + r.stdout + r.stderr)
  assert.strictEqual((r.stderr + r.stdout).trim(), 'mocks-driver: --reopen must be journey:<j>, walk:<j>, shapes, or kit',
    'D6: the refusal must be the exact narrowed literal, with "theme" dropped from the target list — specs/20260907/08-walk-critic.md D6 widens it to include "walk:<j>": ' + JSON.stringify({ stdout: r.stdout, stderr: r.stderr }))

  const after = fs.readFileSync(statusPath(dir), 'utf8')
  assert.strictEqual(after, before, 'D6: a refused --reopen theme must write nothing to status.json at all: ' + JSON.stringify({ before, after }))
  assert.deepStrictEqual(statusJson(dir).reopens, [], 'D6: a refused --reopen theme must append no row to status.reopens: ' + JSON.stringify(statusJson(dir).reopens))
})

// ---------------------------------------------------------------------------
// AC-20260907-07-6
// ---------------------------------------------------------------------------
// Repair round (specs/20260907/08-walk-critic.md D6/AC-20260907-08-8): --reopen shapes now
// additionally invalidates walk(all) — every journey's walked is cleared alongside the rest.
test('AC-20260907-07-6: --reopen shapes on an approved root prints the exact D6 invalidated line with no theme token, and appends that same invalidated array to status.reopens', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)

  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'shapes'])
  assert.strictEqual(r.status, 0, '--reopen shapes must CONTINUE TO exit 0 on an approved root: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout, '↩ reopened shapes — invalidated: shape, canon, kit, journeys(all), walk(all), approved(all)\n',
    'D6: the reopen output must be the exact invalidated line, canon before kit, walk(all) before approved(all) per specs/20260907/08-walk-critic.md D6, and no "theme" token anywhere: ' + JSON.stringify(r.stdout))
  assert.ok(!r.stdout.includes('theme'), 'D6: --reopen shapes must never mention "theme" — the retired field leaves nothing to invalidate: ' + r.stdout)

  const reopenRow = statusJson(dir).reopens.find((row) => row.target === 'shapes')
  assert.ok(reopenRow, 'a --reopen shapes call must append a row to status.reopens: ' + JSON.stringify(statusJson(dir).reopens))
  assert.deepStrictEqual(reopenRow.invalidated, ['shape', 'canon', 'kit', 'journeys(all)', 'walk(all)', 'approved(all)'],
    'D6: the appended reopens row must carry the exact same invalidated array printed to stdout, including walk(all): ' + JSON.stringify(reopenRow))
})

// ---------------------------------------------------------------------------
// AC-20260907-07-9
// ---------------------------------------------------------------------------
test('AC-20260907-07-9: the bare driver on an APPROVED root prints a step heading matching "## Step: done — every journey approved, signed off by <decider>" with no "theme" substring, followed by "next: /spec:genesis"', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare re-run on an APPROVED root must exit 0: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /## Step: done — every journey approved, signed off by Ren/,
    'D5: the terminal heading must name the exact D5 literal with the theme clause dropped — "done — every journey approved, signed off by <decider>": ' + r.stdout)
  assert.ok(!r.stdout.includes('theme'), 'D5: the terminal heading must carry no "theme" substring at all: ' + r.stdout)
  assert.match(r.stdout, /next: \/spec:genesis/, 'the terminal step must be followed by "next: /spec:genesis": ' + r.stdout)
})

