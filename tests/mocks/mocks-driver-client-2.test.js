'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY,
  bare, mark, stateOf, statusPath, statusJson, ledgerCmd,
  decideLook, freePort, startServe, stopServe,
  advanceToJourneyWalked, advanceToApproved, confirmEveryJourney, advanceToSeedDone,
  stubNpx,
  notesPath, writeNotesFile, readNotesFile, nowIso, isoDaysAgo, patchStatus, sha256, stubNpxScreenshot,
} = require('./mocks-driver-fixtures')

// specs/20260910/01-contention-proof-budget-and-uncapped-suite.md D3: this sibling exists
// because tests/mocks/mocks-driver-client.test.js alone exceeded the 45s per-file budget even
// under a settled machine (43,185-54,707ms across four serial runs) — node:test serialises within one
// file, so the fix is another file, not a faster one. These five tests moved here verbatim.
// AC-20260907-10-11, -22, -14, -15, -16.

// ---------------------------------------------------------------------------
// AC-20260907-10-11
// ---------------------------------------------------------------------------
test('AC-20260907-10-11: notes address targeting a client-origin project-scope note exits 2 naming acceptance or waiver', () => {
  const dir = tmpdir('notes-address-client-project')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [{
    id: 'N001', scope: 'project', screen: null, state: null, text: 'the direction is wrong',
    by: 'client', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'client', lastClientAt: nowIso(), resolution: null, waived: null, answer: null, capture: null,
  }])
  const r = bare(dir, ['notes', 'address', '--id', 'N001', '--change', 'x'])
  assert.strictEqual(r.status, 2, 'AC-11: `notes address` on a client-origin project-scope note must exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /accept|waive/i,
    'AC-11: the refusal must name acceptance or waiver as the only closures for a client-origin project note: ' + r.stdout + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-10-22
// ---------------------------------------------------------------------------
test('AC-20260907-10-22 (SHALL CONTINUE TO): notes address targeting a session-origin or walk note without --port exits 0 and sets addressed with no capture field', () => {
  const dir = tmpdir('notes-address-session-walk')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [
    { id: 'N001', scope: 'mock', screen: 'signin', state: 'error', text: 'x', by: 'session', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, origin: 'session' },
    { id: 'N002', scope: 'mock', screen: 'signin', state: 'error', text: 'x', by: 'walk-critic', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null, kind: 'walk', reason: 'no-path-back' },
  ])
  const r1 = bare(dir, ['notes', 'address', '--id', 'N001', '--change', 'fixed'])
  assert.strictEqual(r1.status, 0, 'AC-22: `notes address` on a session-origin note without --port must CONTINUE TO exit 0: ' + r1.stdout + r1.stderr)
  const n1 = readNotesFile(dir).find((n) => n.id === 'N001')
  assert.strictEqual(n1.status, 'addressed', 'AC-22: a session-origin note must CONTINUE TO move to "addressed": got ' + JSON.stringify(n1))
  assert.strictEqual(n1.capture, undefined, 'AC-22: a session-origin note must carry no "capture" field at all: got ' + JSON.stringify(n1))

  const r2 = bare(dir, ['notes', 'address', '--id', 'N002', '--change', 'fixed'])
  assert.strictEqual(r2.status, 0, 'AC-22: `notes address` on a walk note without --port must CONTINUE TO exit 0: ' + r2.stdout + r2.stderr)
  const n2 = readNotesFile(dir).find((n) => n.id === 'N002')
  assert.strictEqual(n2.status, 'addressed', 'AC-22: a walk note must CONTINUE TO move to "addressed": got ' + JSON.stringify(n2))
  assert.strictEqual(n2.capture, undefined, 'AC-22: a walk note must carry no "capture" field at all: got ' + JSON.stringify(n2))
})

// ---------------------------------------------------------------------------
// AC-20260907-10-14
// ---------------------------------------------------------------------------
test('AC-20260907-10-14: notes waive on a question whose at and status.client.openedAt are both 8 days old exits 0, sets the ledger row status "waived <today>", and ledger check exits 0; on a question with no status.client it exits 2 naming client open --address; on a session-origin plain note it exits 2 naming client-origin notes and questions as the only waivable kinds', () => {
  const dir = tmpdir('notes-waive-cli')
  advanceToSeedDone(dir)
  const row = ledgerCmd(dir, 'add', [
    '--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'single-use link',
    '--tag', 'inferred', '--status', 'open',
  ])
  assert.strictEqual(row.status, 0, 'test setup requires the W7 ledger row to be accepted: ' + row.stderr)
  patchStatus(dir, { client: { address: 'https://hearwell.example', openedAt: isoDaysAgo(8) } })
  writeNotesFile(dir, [{
    id: 'N001', scope: 'mock', screen: 'signin', state: null, text: 'single-use link', by: 'session',
    at: isoDaysAgo(8), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'question', ledgerId: 'W7', answer: null,
  }])
  const todayIso = new Date().toISOString().slice(0, 10)
  const waived = bare(dir, ['notes', 'waive', '--id', 'N001', '--reason', 'no client available'])
  assert.strictEqual(waived.status, 0, 'AC-14: `notes waive` on a question silent 8 days (>= 7) must exit 0: ' + waived.stdout + waived.stderr)
  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, new RegExp('\\| W7 \\|.*waived ' + todayIso.replace(/[-]/g, '\\-')),
    'AC-14: the W7 ledger row\'s status cell must read "waived ' + todayIso + '": got\n' + ledgerText)
  const check = bare(dir, ['ledger', 'check'])
  assert.strictEqual(check.status, 0, 'AC-14: `ledger check` must exit 0 once the row is waived — a waived product row never blocks: ' + check.stdout + check.stderr)

  const noClientDir = tmpdir('notes-waive-noclient')
  advanceToSeedDone(noClientDir)
  const row2 = ledgerCmd(noClientDir, 'add', [
    '--id', 'W8', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'x',
    '--tag', 'inferred', '--status', 'open',
  ])
  assert.strictEqual(row2.status, 0, 'test setup requires the W8 ledger row to be accepted: ' + row2.stderr)
  writeNotesFile(noClientDir, [{
    id: 'N001', scope: 'mock', screen: 'signin', state: null, text: 'x', by: 'session',
    at: isoDaysAgo(8), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'question', ledgerId: 'W8', answer: null,
  }])
  const noClient = bare(noClientDir, ['notes', 'waive', '--id', 'N001', '--reason', 'x'])
  assert.strictEqual(noClient.status, 2, 'AC-14: `notes waive` on a question with no status.client must exit 2: ' + noClient.stdout + noClient.stderr)
  assert.match(noClient.stderr + noClient.stdout, /client open --address/,
    'AC-14: the no-status.client refusal must name "client open --address": ' + noClient.stdout + noClient.stderr)

  const sessionNoteDir = tmpdir('notes-waive-session')
  advanceToSeedDone(sessionNoteDir)
  writeNotesFile(sessionNoteDir, [{
    id: 'N001', scope: 'mock', screen: 'signin', state: 'error', text: 'x', by: 'session',
    at: isoDaysAgo(8), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'session',
  }])
  const sessionRefused = bare(sessionNoteDir, ['notes', 'waive', '--id', 'N001', '--reason', 'x'])
  assert.strictEqual(sessionRefused.status, 2, 'AC-14: `notes waive` on a session-origin plain note must exit 2 — only client-origin notes and questions are waivable: ' + sessionRefused.stdout + sessionRefused.stderr)
  assert.match(sessionRefused.stderr + sessionRefused.stdout, /client-origin|question/i,
    'AC-14: the refusal must name client-origin notes and questions as the only waivable kinds: ' + sessionRefused.stdout + sessionRefused.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260907-10-15
// ---------------------------------------------------------------------------
test('AC-20260907-10-15: --mark approved on a root holding two waived notes prints "waived: 2" followed by one "  <id> — <reason>" line per waived note before the checkpoint line; with none it prints "waived: 0"; and it exits 0 with no status.client present', () => {
  const withWaived = tmpdir('approved-with-waived')
  advanceToJourneyWalked(withWaived)
  decideLook(withWaived, 'approved', 'approve', { by: 'Ren' })
  writeNotesFile(withWaived, [
    { id: 'N001', scope: 'project', screen: null, state: null, text: 'x', by: 'client', at: nowIso(), status: 'resolved', addressed: null, reply: null, resolvedBy: 'waiver', resolvedAt: nowIso(), origin: 'client', lastClientAt: nowIso(), resolution: null, capture: null, waived: { at: nowIso(), reason: 'client gone quiet', by: 'session' }, answer: null },
    { id: 'N002', scope: 'project', screen: null, state: null, text: 'y', by: 'client', at: nowIso(), status: 'resolved', addressed: null, reply: null, resolvedBy: 'waiver', resolvedAt: nowIso(), origin: 'client', lastClientAt: nowIso(), resolution: null, capture: null, waived: { at: nowIso(), reason: 'no reply after outreach', by: 'session' }, answer: null },
  ])
  // specs/20260910/03-client-journey-player.md D7 fixture repair: `--mark approved` now
  // refuses while a seed journey is unconfirmed by the client, so this setup records the
  // confirmation to keep the precondition it actually pins isolated.
  confirmEveryJourney(withWaived)
  const accepted = mark(withWaived, 'approved')
  assert.strictEqual(accepted.status, 0, 'AC-15: `--mark approved` must accept once every note is resolved (waived counts as resolved): ' + accepted.stdout + accepted.stderr)
  assert.match(accepted.stdout, /waived: 2/, 'AC-15: the accepted output must print "waived: 2": ' + accepted.stdout)
  assert.match(accepted.stdout, /waived: 2[\s\S]*N001 — client gone quiet[\s\S]*N002 — no reply after outreach[\s\S]*checkpoint/,
    'AC-15: the accepted output must print one "  <id> — <reason>" line per waived note, in order, before the checkpoint line: ' + accepted.stdout)
  const written = statusJson(withWaived)
  assert.strictEqual('client' in written, false, 'AC-15: `--mark approved` must not require or write status.client: got ' + JSON.stringify(written.client))

  const noWaived = tmpdir('approved-no-waived')
  advanceToJourneyWalked(noWaived)
  decideLook(noWaived, 'approved', 'approve', { by: 'Ren' })
  confirmEveryJourney(noWaived)
  const accepted2 = mark(noWaived, 'approved')
  assert.strictEqual(accepted2.status, 0, 'AC-15: `--mark approved` with no waived notes must accept: ' + accepted2.stdout + accepted2.stderr)
  assert.match(accepted2.stdout, /waived: 0/, 'AC-15: with no waived notes the accepted output must print "waived: 0": ' + accepted2.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260907-10-16
// ---------------------------------------------------------------------------
test('AC-20260907-10-16 (SHALL CONTINUE TO): --mark approved refuses with no decided approved stop (naming stop open signoff), on an unresolved mock note anchored to any declared label, and on any journey whose approved is unset', () => {
  const noStop = tmpdir('approved-nostop')
  advanceToJourneyWalked(noStop)
  // specs/20260910/03-client-journey-player.md D7 fixture repair: `--mark approved` now
  // refuses while a seed journey is unconfirmed by the client, so this setup records the
  // confirmation to keep the precondition it actually pins isolated.
  confirmEveryJourney(noStop)
  const r1 = mark(noStop, 'approved')
  assert.strictEqual(r1.status, 2, 'AC-16: `--mark approved` with no decided approved stop must CONTINUE TO exit 2: ' + r1.stdout + r1.stderr)
  assert.match(r1.stderr + r1.stdout, /stop open signoff/, 'AC-16: the refusal must CONTINUE TO name `stop open signoff`: ' + r1.stdout + r1.stderr)

  const unresolvedNote = tmpdir('approved-unresolved-note')
  advanceToJourneyWalked(unresolvedNote)
  decideLook(unresolvedNote, 'approved', 'approve', { by: 'Ren' })
  writeNotesFile(unresolvedNote, [
    { id: 'N001', scope: 'mock', screen: 'signin', state: 'error', text: 'x', by: 'session', at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null },
  ])
  // specs/20260910/03-client-journey-player.md D7 fixture repair: `--mark approved` now
  // refuses while a seed journey is unconfirmed by the client, so this setup records the
  // confirmation to keep the precondition it actually pins isolated.
  confirmEveryJourney(unresolvedNote)
  const r2 = mark(unresolvedNote, 'approved')
  assert.strictEqual(r2.status, 2, 'AC-16: `--mark approved` on an unresolved mock note must CONTINUE TO exit 2: ' + r2.stdout + r2.stderr)

  const unapprovedJourney = tmpdir('approved-unapproved-journey')
  advanceToSeedDone(unapprovedJourney)
  decideLook(unapprovedJourney, 'approved', 'approve', { by: 'Ren' })
  const r3 = mark(unapprovedJourney, 'approved')
  assert.strictEqual(r3.status, 2, 'AC-16: `--mark approved` on a root whose declared journey is not approved must CONTINUE TO exit 2: ' + r3.stdout + r3.stderr)
})
