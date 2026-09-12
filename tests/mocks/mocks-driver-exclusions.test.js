'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, SPEC } = require('../helpers')
const {
  advanceToSeedDone, advanceToThemePicked, confirmEveryJourney, decideLook,
  ledgerCmd, mark, writeFile, writeJSON, nowIso,
} = require('./mocks-driver-fixtures')

// specs/20260911/05-approval-is-bookkeeping.md D1/D4: `--mark approved` no longer refuses on an
// open exclusion row — it derives once more, prints how many were agreed vs not contested, and
// writes design/mocks/exclusions.md under two headings. AC-20260910-05-4's refusal-and-remedy
// half is retired (D8) and rewritten under AC-20260911-05-6, which also folds in
// AC-20260910-05-8's file-format coverage (superseded by D4's two-heading shape — the old
// one-heading/"N exclusions" tail would otherwise go red the moment D4 lands, unpinned by any
// named AC). AC-20260911-05-6, -7, -10.

function ledgerPath(dir) { return path.join(dir, 'design/mocks/ledger.md') }
function readLedger(dir) { return fs.readFileSync(ledgerPath(dir), 'utf8') }
function briefPath(dir) { return path.join(dir, '.claude/genesis/brief.md') }
function notesPath(dir) { return path.join(dir, 'design/mocks/notes.json') }

// Everything advanceToApproved (mocks-driver-fixtures.js) does, minus its own final `--mark
// approved` call — so this test's own `mark(dir, 'approved')` is the first and only thing left
// to satisfy, and any refusal it hits is genuinely about the exclusion gate, not an unrelated
// precondition this shared fixture already proves clears.
function advanceToJustBeforeApproved(dir) {
  advanceToThemePicked(dir)
  confirmEveryJourney(dir)
  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
}

// ---------------------------------------------------------------------------
// AC-20260910-05-4
// ---------------------------------------------------------------------------
test('AC-20260910-05-4: `ledger derive` appends new exclusion rows once and prints the total/new counts, and is idempotent byte-for-byte on a second run', () => {
  const dir = tmpdir('excl-derive')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), '## Non-goals\n- SMS reminders — Later\n')
  const invented = ledgerCmd(dir, 'add', [
    '--id', 'W9', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'a second insurer field',
    '--tag', 'invented', '--status', 'overridden',
  ])
  assert.strictEqual(invented.status, 0, 'test setup requires the invented row W9 to be accepted: ' + invented.stderr)
  writeJSON(notesPath(dir), [{
    id: 'N014', scope: 'mock', screen: 'signin', state: null, text: 'a second insurer field', by: 'session',
    at: '2026-09-10T00:00:00.000Z', status: 'resolved', addressed: null, reply: null,
    resolvedBy: 'client', resolvedAt: '2026-09-10T00:00:01.000Z', kind: 'question', ledgerId: 'W9',
    answer: { verdict: 'no', text: 'not needed', by: 'client', at: '2026-09-10T00:00:01.000Z' },
  }])

  const first = ledgerCmd(dir, 'derive')
  assert.strictEqual(first.status, 0, 'AC-4: `ledger derive` must exit 0 on a valid host: ' + first.stderr)
  assert.match(first.stdout, /📒 exclusions: 2 total · 2 new · 0 retired/,
    'AC-4: the first derive must print "📒 exclusions: 2 total · 2 new · 0 retired" — one non-goal, one invented-row "no", nothing to retire: got ' + first.stdout)
  const afterFirst = readLedger(dir)
  assert.match(afterFirst, /\| E1 \| CLIENT \| exclusion \| SMS reminders \|/,
    'AC-4: the non-goal must land as row E1 with claim "SMS reminders": got\n' + afterFirst)
  assert.match(afterFirst, /\| E2 \| CLIENT \| exclusion \| not: a second insurer field \|/,
    'AC-4: the answered invented row must land as row E2 with claim "not: a second insurer field": got\n' + afterFirst)

  const second = ledgerCmd(dir, 'derive')
  assert.strictEqual(second.status, 0, 'AC-4: a second derive must also exit 0: ' + second.stderr)
  assert.match(second.stdout, /📒 exclusions: 2 total · 0 new · 0 retired/,
    'AC-4: a second derive over the same inputs must print "2 total · 0 new · 0 retired" — a nonzero "new" means the note-matched idempotence key failed: got ' + second.stdout)
  const afterSecond = readLedger(dir)
  assert.strictEqual(afterSecond, afterFirst,
    'AC-4: ledger.md must be byte-identical after the idempotent second derive — any diff means the second run rewrote or duplicated a row: got a diff of ' + afterSecond.length + ' vs ' + afterFirst.length + ' bytes')
})

// ---------------------------------------------------------------------------
// AC-20260911-05-6
// ---------------------------------------------------------------------------
test('AC-20260911-05-6: `--mark approved` accepts with an open exclusion row, prints the agreed/not-contested tail, and writes exclusions.md under two headings', () => {
  const dir = tmpdir('excl-approved-bookkeeping')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), "## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won't-this-time\n")

  const derive = ledgerCmd(dir, 'derive')
  assert.strictEqual(derive.status, 0, 'test setup requires `ledger derive` to accept the two non-goal lines: ' + derive.stderr)
  const setE1 = ledgerCmd(dir, 'set', ['--id', 'E1', '--status', 'confirmed 2026-09-11'])
  assert.strictEqual(setE1.status, 0, 'test setup requires `ledger set --id E1` to be accepted: ' + setE1.stderr)
  // E2 is deliberately left `open` — this is the whole point of the AC: approval must neither
  // refuse nor require the session to touch it.

  advanceToJustBeforeApproved(dir)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0,
    'AC-6: `--mark approved` must exit 0 with exclusion E2 still `open` — spec 20260910/05\'s refusal on any open exclusion row is retired: got ' + approved.status + ' stdout=' + approved.stdout + ' stderr=' + approved.stderr)
  assert.match(approved.stdout, /📦 design\/mocks\/exclusions\.md — 1 agreed · 1 not contested/,
    'AC-6: the approval tail must print "📦 design/mocks/exclusions.md — 1 agreed · 1 not contested" — one confirmed row, one still-open row: got ' + approved.stdout)

  const text = fs.readFileSync(path.join(dir, 'design/mocks/exclusions.md'), 'utf8')
  const today = new Date().toISOString().slice(0, 10)
  const nonEmpty = text.split('\n').filter((l) => l.trim() !== '')
  assert.deepStrictEqual(nonEmpty, [
    '# Exclusions — Test Product — approved ' + today,
    '## Agreed by the client',
    '- SMS reminders (project, non-goal: SMS reminders)',
    '## Not contested',
    '- Multi-currency (project, non-goal: Multi-currency)',
  ], 'AC-6: exclusions.md\'s non-blank lines must be exactly the title, "## Agreed by the client", its one bullet, "## Not contested", and its one bullet, in that order: got\n' + text)
})

test('AC-20260911-05-6: exclusions.md renders "- none" under a heading that carries zero rows', () => {
  const dir = tmpdir('excl-approved-none')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), '## Non-goals\n- SMS reminders — Later\n')

  const derive = ledgerCmd(dir, 'derive')
  assert.strictEqual(derive.status, 0, 'test setup requires `ledger derive` to accept: ' + derive.stderr)
  const setE1 = ledgerCmd(dir, 'set', ['--id', 'E1', '--status', 'confirmed 2026-09-11'])
  assert.strictEqual(setE1.status, 0, 'test setup requires `ledger set --id E1` to be accepted: ' + setE1.stderr)

  advanceToJustBeforeApproved(dir)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0,
    'AC-6: `--mark approved` must accept with one confirmed row and zero open ones: ' + approved.stdout + approved.stderr)
  assert.match(approved.stdout, /📦 design\/mocks\/exclusions\.md — 1 agreed · 0 not contested/,
    'AC-6: with nothing open, the tail must print "1 agreed · 0 not contested": got ' + approved.stdout)

  const text = fs.readFileSync(path.join(dir, 'design/mocks/exclusions.md'), 'utf8')
  const nonEmpty = text.split('\n').filter((l) => l.trim() !== '')
  const idx = nonEmpty.indexOf('## Not contested')
  assert.ok(idx !== -1, 'AC-6: "## Not contested" heading must be present even when nothing is open: got\n' + text)
  assert.strictEqual(nonEmpty[idx + 1], '- none',
    'AC-6: an empty section must render exactly "- none" — its absence contradicts "each heading present even when empty, with - none": got\n' + text)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-13
// ---------------------------------------------------------------------------
test('AC-20260910-05-13: a row whose brief line is gone is retired to overridden <today> with claim/note untouched, prints its own retired count, does not block approved, and is absent from exclusions.md', () => {
  const dir = tmpdir('excl-retire')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), '## Non-goals\n- SMS reminders — Later\n')

  const derive1 = ledgerCmd(dir, 'derive')
  assert.strictEqual(derive1.status, 0, 'test setup requires the first `ledger derive` to accept: ' + derive1.stderr)
  assert.match(derive1.stdout, /📒 exclusions: 1 total · 1 new · 0 retired/,
    'test setup: the first derive must land exactly one exclusion row: got ' + derive1.stdout)

  // The brief no longer lists the non-goal — its source decision was undone.
  writeFile(briefPath(dir), '## Non-goals\n')
  const derive2 = ledgerCmd(dir, 'derive')
  assert.strictEqual(derive2.status, 0, 'AC-13: a derive that only retires rows must still exit 0: ' + derive2.stderr)
  assert.match(derive2.stdout, /📒 exclusions: 1 total · 0 new · 1 retired/,
    'AC-13: the retiring derive must print "1 total · 0 new · 1 retired": got ' + derive2.stdout)

  const ledgerText = readLedger(dir)
  const today = new Date().toISOString().slice(0, 10)
  assert.match(ledgerText, new RegExp('\\| E1 \\| CLIENT \\| exclusion \\| SMS reminders \\| said-by-user \\| overridden ' + today + ' \\| - \\| - \\| non-goal: SMS reminders \\|'),
    'AC-13: E1 must be set to "overridden <today>" with its claim and note cells left untouched (never deleted — the note cell is the audit trail): got\n' + ledgerText)

  advanceToJustBeforeApproved(dir)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0,
    'AC-13: a retired (overridden) exclusion row must NOT block `--mark approved` — only an `open` row ever mattered, and D4 retires that refusal too: ' + approved.stdout + approved.stderr)

  const exclusionsPath = path.join(dir, 'design/mocks/exclusions.md')
  const text = fs.existsSync(exclusionsPath) ? fs.readFileSync(exclusionsPath, 'utf8') : ''
  assert.ok(!/SMS reminders/.test(text),
    'AC-13: a retired exclusion row must NOT appear in design/mocks/exclusions.md — it is neither confirmed (agreed) nor open (not contested): got\n' + text)
})

// ---------------------------------------------------------------------------
// AC-20260911-05-7
// ---------------------------------------------------------------------------
test('AC-20260911-05-7: `ledger derive` CONTINUES TO append one row per non-goal, one per invented-row "no", and one per not-needed withdrawal, excluding an inferred-row no and a mistake withdrawal, and stays byte-idempotent on a second run', () => {
  const dir = tmpdir('excl-derive-continue-2')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), "## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won't-this-time\n- Bookings — In\n")
  const w9 = ledgerCmd(dir, 'add', [
    '--id', 'W9', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'a second insurer field',
    '--tag', 'invented', '--status', 'overridden',
  ])
  assert.strictEqual(w9.status, 0, 'test setup requires the invented row W9 to be accepted: ' + w9.stderr)
  const w10 = ledgerCmd(dir, 'add', [
    '--id', 'W10', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'something else',
    '--tag', 'inferred', '--status', 'overridden',
  ])
  assert.strictEqual(w10.status, 0, 'test setup requires the inferred row W10 to be accepted: ' + w10.stderr)
  writeJSON(notesPath(dir), [
    { id: 'N014', kind: 'question', scope: 'mock', screen: 'signin', ledgerId: 'W9', status: 'resolved', answer: { verdict: 'no', text: 'not needed', by: 'client', at: nowIso() } },
    { id: 'N015', kind: 'question', scope: 'mock', screen: 'invite', ledgerId: 'W10', status: 'resolved', answer: { verdict: 'no', text: 'also not needed', by: 'client', at: nowIso() } },
    { id: 'N020', kind: 'note', scope: 'mock', screen: 'consent', origin: 'client', status: 'resolved', resolution: 'withdrawn', withdrawReason: 'not-needed', text: 'export bookings to CSV' },
    { id: 'N021', kind: 'note', scope: 'mock', screen: 'consent', origin: 'client', status: 'resolved', resolution: 'withdrawn', withdrawReason: 'mistake', text: 'a mistaken withdrawal' },
  ])

  const first = ledgerCmd(dir, 'derive')
  assert.strictEqual(first.status, 0, 'AC-7: `ledger derive` must exit 0: ' + first.stderr)
  assert.match(first.stdout, /📒 exclusions: 4 total · 4 new · 0 retired/,
    'AC-7: the four legitimate sources (2 non-goals, 1 invented-row no, 1 not-needed withdrawal) must derive "4 total · 4 new · 0 retired" — the inferred-row no and the mistake withdrawal must never count, and this must CONTINUE TO hold once D1 moves the transform into the lib: got ' + first.stdout)
  const afterFirst = readLedger(dir)

  const second = ledgerCmd(dir, 'derive')
  assert.strictEqual(second.status, 0, 'AC-7: a second derive must also exit 0: ' + second.stderr)
  assert.match(second.stdout, /📒 exclusions: 4 total · 0 new · 0 retired/,
    'AC-7: a second derive over the same inputs must CONTINUE TO add nothing new: got ' + second.stdout)
  assert.strictEqual(readLedger(dir), afterFirst,
    'AC-7: ledger.md must CONTINUE TO be byte-identical after the idempotent second derive: got a diff')
})

// ---------------------------------------------------------------------------
// AC-20260911-05-10
// ---------------------------------------------------------------------------
test('AC-20260911-05-10: mocks-driver.js carries neither the retired approve-refusal sentence nor its ledger-set remedy, and walk.browser.js no longer gates confirm on the open-exclusion count — D8 deletes them, never leaves them dead', () => {
  const r1 = spawnSync('grep', ['-n',
    "is not confirmed — the client confirms it\\|ledger set --id ' + row.id + ' --status confirmed",
    path.join(SPEC, 'scripts/mocks-driver.js')])
  assert.strictEqual(r1.status, 1,
    'AC-10: grep must find zero hits (exit 1) for the retired refusal sentence / its ledger-set remedy in mocks-driver.js — their presence means D8\'s deletion is unbuilt: got status ' +
    r1.status + ' stdout=\n' + (r1.stdout || '').toString())

  const r2 = spawnSync('grep', ['-n', 'exclOpen > 0', path.join(SPEC, 'scripts/lib/walk.browser.js')])
  assert.strictEqual(r2.status, 1,
    'AC-10: grep must find zero hits (exit 1) for "exclOpen > 0" in walk.browser.js — the confirm gate must be deleted, not merely bypassed elsewhere: got status ' +
    r2.status + ' stdout=\n' + (r2.stdout || '').toString())
})
