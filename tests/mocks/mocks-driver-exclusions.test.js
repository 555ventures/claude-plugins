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

