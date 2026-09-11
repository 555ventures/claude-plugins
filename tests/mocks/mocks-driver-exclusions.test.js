'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  advanceToSeedDone, advanceToThemePicked, confirmEveryJourney, decideLook,
  ledgerCmd, mark, writeFile, writeJSON,
} = require('./mocks-driver-fixtures')

// specs/20260910/05-what-the-journey-does-not-do.md D4 (`ledger derive` and the `approved`
// exclusion-confirmation gate) and D7 (`design/mocks/exclusions.md`, written at `approved`) do
// not exist yet — every test below is red until they land. AC-20260910-05-4, -8.

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
test('AC-20260910-05-4: `ledger derive` appends new exclusion rows once, prints the total/new counts, is idempotent byte-for-byte on a second run, and `--mark approved` refuses an open exclusion row by claim naming the remedy', () => {
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

  advanceToJustBeforeApproved(dir)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 2,
    'AC-4: `--mark approved` must refuse while exclusion E2 is still open: got ' + approved.status + ' stdout=' + approved.stdout + ' stderr=' + approved.stderr)
  assert.match(approved.stderr, /exclusion E2 \("not: a second insurer field"\) is not confirmed/,
    'AC-4: the refusal must name the row by id and claim: got ' + approved.stderr)
  assert.match(approved.stderr, /ledger set --id E2 --status confirmed/,
    'AC-4: the refusal must name the session\'s own override remedy verbatim: got ' + approved.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-8
// ---------------------------------------------------------------------------
test('AC-20260910-05-8: `--mark approved` writes design/mocks/exclusions.md from the confirmed exclusion rows, titled and dated, one bullet per row, and prints the exclusion count', () => {
  const dir = tmpdir('excl-approved-file')
  advanceToSeedDone(dir)
  writeFile(briefPath(dir), '## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won\'t-this-time\n')

  const derive = ledgerCmd(dir, 'derive')
  assert.strictEqual(derive.status, 0, 'test setup requires `ledger derive` to accept the two non-goal lines: ' + derive.stderr)
  for (const id of ['E1', 'E2']) {
    const set = ledgerCmd(dir, 'set', ['--id', id, '--status', 'confirmed 2026-09-11'])
    assert.strictEqual(set.status, 0, 'test setup requires `ledger set --id ' + id + '` to be accepted: ' + set.stderr)
  }

  advanceToJustBeforeApproved(dir)
  const approved = mark(dir, 'approved')
  assert.strictEqual(approved.status, 0,
    'AC-8: `--mark approved` must accept once every exclusion row is confirmed: ' + approved.stdout + approved.stderr)
  const today = new Date().toISOString().slice(0, 10)
  assert.match(approved.stdout, new RegExp('\\ud83d\\udce6 design/mocks/exclusions\\.md \\u2014 2 exclusions'),
    'AC-8: the approval tail must print "📦 design/mocks/exclusions.md — 2 exclusions": got ' + approved.stdout)

  const exclusionsPath = path.join(dir, 'design/mocks/exclusions.md')
  assert.ok(fs.existsSync(exclusionsPath), 'AC-8: design/mocks/exclusions.md must exist after approved accepts: nothing was written')
  const text = fs.readFileSync(exclusionsPath, 'utf8')
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  assert.strictEqual(lines[0], '# Exclusions — Test Product — approved ' + today,
    'AC-8: the title line must name the product and the approval date: got "' + lines[0] + '"')
  assert.match(text, /^- SMS reminders \(project, non-goal: SMS reminders\)$/m,
    'AC-8: a project-wide exclusion\'s bullet must read "- <claim> (project, <source>)", with source carrying the brief line per D2/AC-12: got\n' + text)
  assert.match(text, /^- Multi-currency \(project, non-goal: Multi-currency\)$/m,
    'AC-8: the second confirmed exclusion must render its own bullet, with source carrying the brief line: got\n' + text)
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
    'AC-13: a retired (overridden) exclusion row must NOT block `--mark approved` — only an `open` row blocks: ' + approved.stdout + approved.stderr)

  const exclusionsPath = path.join(dir, 'design/mocks/exclusions.md')
  const text = fs.existsSync(exclusionsPath) ? fs.readFileSync(exclusionsPath, 'utf8') : ''
  assert.ok(!/SMS reminders/.test(text),
    'AC-13: a retired exclusion row must NOT appear in design/mocks/exclusions.md, which is written from confirmed rows only: got\n' + text)
})
