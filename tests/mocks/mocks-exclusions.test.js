'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { tmpdir, freePort, serveAtlas, postJson } = require('../helpers')
const { parseLedger, gateVerdict, countsLine } = require('../../spec/scripts/lib/mocks-ledger')
const { validateNotes } = require('../../spec/scripts/lib/mocks-notes')
const { advanceToSeedDone, ledgerCmd, writeNotesFile, nowIso } = require('./mocks-driver-fixtures')

// specs/20260910/05-what-the-journey-does-not-do.md D1 (the `exclusion` kind), D2
// (`lib/mocks-exclusions.js`'s deriveExclusions), D3 (the withdraw `reason` enum). Every test
// below is red until those land. AC-20260910-05-1, -2, -3.

let deriveExclusions
try {
  // eslint-disable-next-line global-require
  ;({ deriveExclusions } = require('../../spec/scripts/lib/mocks-exclusions'))
} catch (e) {
  const reason = 'spec/scripts/lib/mocks-exclusions.js does not exist yet (D2): ' + e.message
  deriveExclusions = () => { throw new Error(reason) }
}

// ---------------------------------------------------------------------------
// AC-20260910-05-1
// ---------------------------------------------------------------------------
test('AC-20260910-05-1: parseLedger accepts an exclusion/said-by-user/open row, gateVerdict never blocks on it, countsLine appends its own count, and `ledger add --kind exclusion` is refused naming `ledger derive`', () => {
  const text = [
    '# Provenance ledger — test', '', '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |',
    '| E1 | CLIENT | exclusion | SMS reminders | said-by-user | open | - | - | non-goal: SMS reminders |',
    '', '## Misunderstandings', '',
    '| id | what | step | cost | note |', '| - | - | - | - | - |', '',
  ].join('\n')
  const parsed = parseLedger(text)
  assert.deepStrictEqual(parsed.errors, [],
    'AC-1: an exclusion/said-by-user/open row must parse with no grammar errors once "exclusion" is a valid kind — a non-empty errors array means the ledger reader still rejects the row: got ' + JSON.stringify(parsed.errors))
  assert.strictEqual(parsed.assumptions.length, 1,
    'AC-1: the one exclusion row must be present in parsed.assumptions — its absence means the row silently vanished instead of parsing: got ' + JSON.stringify(parsed.assumptions))
  assert.strictEqual(parsed.assumptions[0].kind, 'exclusion',
    'AC-1: the parsed row must keep kind "exclusion" verbatim: got ' + JSON.stringify(parsed.assumptions[0]))

  const verdict = gateVerdict(parsed)
  assert.strictEqual(verdict.open, true,
    'AC-1: an exclusion row must never block gateVerdict — a false "open" means the derived kind is wrongly treated as a blocking product row: got ' + JSON.stringify(verdict))

  const line = countsLine(parsed)
  assert.ok(line.endsWith(' · 1 exclusions'),
    'AC-1: countsLine must end in " · 1 exclusions" once one exclusion row is present — a missing suffix means the counts line never learned about the new kind: got "' + line + '"')

  const dir = tmpdir('excl-ledger-add-refused')
  advanceToSeedDone(dir)
  const r = ledgerCmd(dir, 'add', [
    '--id', 'E9', '--step', 'CLIENT', '--kind', 'exclusion', '--claim', 'x',
    '--tag', 'said-by-user', '--status', 'open',
  ])
  assert.strictEqual(r.status, 2,
    'AC-1: `ledger add --kind exclusion` must exit 2 — a 0 here means a session could hand-author an exclusion row, defeating D1\'s "derived, never hand-authored" rule: got ' + r.status + ' stdout=' + r.stdout + ' stderr=' + r.stderr)
  assert.match(r.stderr, /ledger derive/,
    'AC-1: the refusal must name `ledger derive` as the one remedy command — its absence leaves a session with no path forward: got ' + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-2
// ---------------------------------------------------------------------------
test('AC-20260910-05-2: deriveExclusions returns one entry per non-goal Later/Won\'t-this-time line, one per no-answered invented-row question, one per not-needed withdrawal, excludes an inferred-row no and a mistake withdrawal, and omits an entry the ledger already carries by source', () => {
  const NOW = '2026-09-10T00:00:00.000Z'
  const brief = '## Non-goals\n- SMS reminders — Later\n- Multi-currency — Won\'t-this-time\n- Bookings — In\n'
  const notes = [
    { id: 'N014', kind: 'question', scope: 'mock', screen: 'intake', ledgerId: 'W9', status: 'resolved', answer: { verdict: 'no', text: 'not needed', by: 'client', at: NOW } },
    { id: 'N015', kind: 'question', scope: 'mock', screen: 'signin', ledgerId: 'W10', status: 'resolved', answer: { verdict: 'no', text: 'also not needed', by: 'client', at: NOW } },
    { id: 'N020', kind: 'note', scope: 'mock', screen: 'roster', origin: 'client', status: 'resolved', resolution: 'withdrawn', withdrawReason: 'not-needed', text: 'export bookings to CSV' },
    { id: 'N021', kind: 'note', scope: 'mock', screen: 'roster', origin: 'client', status: 'resolved', resolution: 'withdrawn', withdrawReason: 'mistake', text: 'a mistaken withdrawal' },
  ]
  const ledger = [
    { id: 'W9', step: 'WIREFRAMES', kind: 'product', claim: 'a second insurer field', tag: 'invented', status: 'overridden', rejected: null, dependents: null, note: null },
    { id: 'W10', step: 'WIREFRAMES', kind: 'product', claim: 'something else', tag: 'inferred', status: 'overridden', rejected: null, dependents: null, note: null },
  ]
  const seedJourneys = new Map([
    ['onboarding', { persona: '', labels: ['intake', 'signin'], edges: [] }],
    ['billing', { persona: '', labels: ['roster'], edges: [] }],
  ])

  const { add: result, retire } = deriveExclusions({ brief, notes, ledger, seedJourneys })
  assert.strictEqual(result.length, 4,
    'AC-2: exactly four `add` entries are owed (2 non-goals + 1 invented-row no + 1 not-needed withdrawal) — the inferred-row no and the mistake withdrawal must never become entries: got ' + JSON.stringify(result))
  assert.deepStrictEqual(retire, [],
    'AC-2: with no existing exclusion rows in the ledger, `retire` must be empty — nothing has been undone yet: got ' + JSON.stringify(retire))

  const find = (claim) => result.find((r) => r.claim === claim)
  const smsEntry = find('SMS reminders')
  assert.deepStrictEqual(smsEntry && { claim: smsEntry.claim, source: smsEntry.source, screen: smsEntry.screen },
    { claim: 'SMS reminders', source: 'non-goal: SMS reminders', screen: null },
    'AC-2: the "Later" non-goal must derive claim/source/screen exactly, with source carrying the BRIEF LINE (not the tag) per D2/AC-12: got ' + JSON.stringify(smsEntry))
  const curEntry = find('Multi-currency')
  assert.deepStrictEqual(curEntry && { claim: curEntry.claim, source: curEntry.source, screen: curEntry.screen },
    { claim: 'Multi-currency', source: 'non-goal: Multi-currency', screen: null },
    'AC-2: the "Won\'t-this-time" non-goal must derive claim/source/screen exactly, with source carrying the BRIEF LINE (not the tag) per D2/AC-12: got ' + JSON.stringify(curEntry))
  const answerEntry = find('not: a second insurer field')
  assert.ok(answerEntry, 'AC-2: the invented row W9\'s "no" answer must derive a "not: <claim>" entry: got ' + JSON.stringify(result))
  assert.strictEqual(answerEntry.source, 'answer: N014',
    'AC-2: the answer entry\'s source must name the answering note id: got ' + JSON.stringify(answerEntry))
  assert.strictEqual(answerEntry.screen, 'intake', 'AC-2: the answer entry\'s screen must be the note\'s own screen: got ' + JSON.stringify(answerEntry))
  assert.strictEqual(answerEntry.journey, 'onboarding', 'AC-2: the answer entry\'s journey must be the seed journey declaring "intake": got ' + JSON.stringify(answerEntry))
  const withdrawnEntry = find('export bookings to CSV')
  assert.ok(withdrawnEntry, 'AC-2: the not-needed withdrawal must derive an entry carrying the note\'s own text: got ' + JSON.stringify(result))
  assert.strictEqual(withdrawnEntry.source, 'withdrawn: N020', 'AC-2: the withdrawal entry\'s source must name the withdrawing note id: got ' + JSON.stringify(withdrawnEntry))
  assert.strictEqual(withdrawnEntry.journey, 'billing', 'AC-2: the withdrawal entry\'s journey must be the seed journey declaring "roster": got ' + JSON.stringify(withdrawnEntry))

  // Idempotence: a ledger that already carries an exclusion row sourced "answer: N014" must not
  // produce a second one.
  const ledgerWithExisting = ledger.concat([
    { id: 'E5', step: 'CLIENT', kind: 'exclusion', claim: 'not: a second insurer field', tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: 'answer: N014' },
  ])
  const second = deriveExclusions({ brief, notes, ledger: ledgerWithExisting, seedJourneys }).add
  assert.strictEqual(second.length, 3,
    'AC-2: with the ledger already carrying "answer: N014" as an exclusion row\'s note, re-deriving must omit that one and return the other three: got ' + JSON.stringify(second))
  assert.ok(!second.some((r) => r.source === 'answer: N014'),
    'AC-2: no returned entry may carry source "answer: N014" once the ledger already has a row with that note — a duplicate defeats the idempotence the note grammar exists for: got ' + JSON.stringify(second))
})

// ---------------------------------------------------------------------------
// AC-20260910-05-12
// ---------------------------------------------------------------------------
test('AC-20260910-05-12: three Later non-goals derive three distinct sources, and a fourth non-goal added later derives exactly one new add with no retires', () => {
  const seedJourneys = new Map()
  const brief3 = '## Non-goals\n- SMS reminders — Later\n- Multi-currency — Later\n- Offline mode — Later\n'
  const first = deriveExclusions({ brief: brief3, notes: [], ledger: [], seedJourneys })
  assert.strictEqual(first.add.length, 3,
    'AC-12: three distinct Later non-goals must derive three `add` entries — fewer means a shared source key is silently collapsing them: got ' + JSON.stringify(first.add))
  const sources = first.add.map((e) => e.source)
  assert.deepStrictEqual(new Set(sources).size, 3,
    'AC-12: the three entries\' `source` values must all be DISTINCT (non-goal: SMS reminders / Multi-currency / Offline mode) — a shared `non-goal: Later` key makes every non-goal after the first invisible forever: got ' + JSON.stringify(sources))
  assert.deepStrictEqual(new Set(sources), new Set(['non-goal: SMS reminders', 'non-goal: Multi-currency', 'non-goal: Offline mode']),
    'AC-12: each source must carry its own brief line verbatim: got ' + JSON.stringify(sources))

  const existingLedger = first.add.map((e, i) => ({
    id: 'E' + (i + 1), step: 'CLIENT', kind: 'exclusion', claim: e.claim, tag: 'said-by-user',
    status: 'open', rejected: null, dependents: null, note: e.source,
  }))
  const brief4 = brief3 + '- Patient portal — Later\n'
  const second = deriveExclusions({ brief: brief4, notes: [], ledger: existingLedger, seedJourneys })
  assert.strictEqual(second.add.length, 1,
    'AC-12: re-deriving against a ledger already carrying the three prior rows plus a brief that gained a fourth non-goal must return exactly one new `add` entry: got ' + JSON.stringify(second.add))
  assert.strictEqual(second.add[0].source, 'non-goal: Patient portal',
    'AC-12: the one new entry must be the newly added non-goal, "non-goal: Patient portal": got ' + JSON.stringify(second.add[0]))
  assert.deepStrictEqual(second.retire, [],
    'AC-12: adding a fourth non-goal retires nothing — every prior non-goal is still present in the brief: got ' + JSON.stringify(second.retire))
})

// ---------------------------------------------------------------------------
// AC-20260910-05-13
// ---------------------------------------------------------------------------
test('AC-20260910-05-13: an existing exclusion row whose source non-goal line is gone from the brief is returned in retire', () => {
  const seedJourneys = new Map()
  const existingRow = { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: 'SMS reminders', tag: 'said-by-user', status: 'confirmed 2026-09-10', rejected: null, dependents: null, note: 'non-goal: SMS reminders' }
  const briefWithoutIt = '## Non-goals\n- Multi-currency — Later\n'
  const { add, retire } = deriveExclusions({ brief: briefWithoutIt, notes: [], ledger: [existingRow], seedJourneys })
  assert.strictEqual(retire.length, 1,
    'AC-13: a row whose source non-goal line no longer appears in the brief must come back in `retire` — its source decision was undone: got ' + JSON.stringify(retire))
  assert.strictEqual(retire[0].id, 'E1',
    'AC-13: the retired entry must be the existing exclusion row E1 itself (not a derived entry) — the caller needs its id to call setStatus: got ' + JSON.stringify(retire[0]))
  assert.strictEqual(add.some((e) => e.source === 'non-goal: SMS reminders'), false,
    'AC-13: a gone non-goal must not simultaneously appear as a new `add` entry: got ' + JSON.stringify(add))
})

test('AC-20260910-05-13: a retired exclusion row can be revived — its source coming back derives a `reopen` of the SAME row (never a duplicate `add`), flips it back to open with no further flapping, and it reaches the client again', () => {
  const { buildWalkPage } = require('../../spec/scripts/lib/walk-page')
  const seedJourneys = new Map()
  const briefWithLine = '## Non-goals\n- SMS reminders — Later\n'
  const briefWithoutLine = '## Non-goals\n'

  // 1. First derive: the row is born open.
  const first = deriveExclusions({ brief: briefWithLine, notes: [], ledger: [], seedJourneys })
  assert.strictEqual(first.add.length, 1,
    'AC-13 setup: the non-goal line must derive one `add` entry the first time: got ' + JSON.stringify(first))
  const row = { id: 'E1', step: 'CLIENT', kind: 'exclusion', claim: first.add[0].claim, tag: 'said-by-user', status: 'open', rejected: null, dependents: null, note: first.add[0].source }

  // 2. The brief drops the line: `ledger derive` retires the row (mirrors `deriveAndAppendExclusions`'s own retire loop).
  const dropped = deriveExclusions({ brief: briefWithoutLine, notes: [], ledger: [row], seedJourneys })
  assert.strictEqual(dropped.retire.length, 1, 'AC-13 setup: removing the non-goal line must retire row E1: got ' + JSON.stringify(dropped))
  // The DATED form is what mocks-driver.js's retire loop actually writes (`'overridden ' +
  // todayIso()`). Simulating the bare word here passed while the real path stayed broken —
  // never simulate a status the driver does not write.
  row.status = 'overridden 2026-09-11'

  // 3. The identical line comes BACK. This must NOT look like a brand-new source (a second row
  // sharing E1's `note` would violate "a row's identity is its note" and show the same claim
  // twice on the player's last screen) — it must come back as `reopen: [E1]`.
  const revived = deriveExclusions({ brief: briefWithLine, notes: [], ledger: [row], seedJourneys })
  assert.strictEqual(revived.add.length, 0,
    'AC-13: a reinstated source must NEVER produce a fresh `add` entry — that would duplicate row E1\'s note and the claim would render twice on the client: got ' + JSON.stringify(revived))
  assert.strictEqual(revived.retire.length, 0,
    'AC-13: a reinstated source is not simultaneously being retired: got ' + JSON.stringify(revived))
  assert.strictEqual(revived.reopen.length, 1,
    'AC-13: a reinstated source whose row is `overridden` must come back in `reopen` exactly once: got ' + JSON.stringify(revived))
  assert.strictEqual(revived.reopen[0].id, 'E1',
    'AC-13: the reopened entry must be the SAME existing row E1 (by id), so the caller flips its status in place rather than appending a new row: got ' + JSON.stringify(revived.reopen[0]))

  // 4. Apply the reopen the way `deriveAndAppendExclusions` does (setStatus back to open on E1),
  // then re-derive: nothing should move again — a revived row is exactly as stable as one that
  // was never retired.
  row.status = 'open'
  const settled = deriveExclusions({ brief: briefWithLine, notes: [], ledger: [row], seedJourneys })
  assert.deepStrictEqual(settled, { add: [], retire: [], reopen: [] },
    'AC-13: once reopened, re-deriving over the same inputs must move nothing (no flapping) — an unstable reopen would re-toggle the row on every `ledger derive`: got ' + JSON.stringify(settled))

  // 5. It reaches the client: an open, reopened row renders exactly like any other open
  // exclusion on the last screen of the journey — visible with its confirm button, not stuck
  // invisible behind its old `overridden` history.
  const seed = { product: 'Hearwell', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'intake', states: [] }] }] }
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [row], walk: { journeys: {} }, prefix: '' })
  assert.match(html, /data-wk="exclusion" data-id="E1"/,
    'AC-13: the reopened row must render as an exclusion article on the journey\'s last screen: got\n' + html)
  assert.match(html, /data-id="E1"[\s\S]*?data-wk="agree"/,
    'AC-13: a reopened (open) row must render its agree button, exactly like any other open exclusion — the client must be able to confirm it again: got\n' + html)
})

// ---------------------------------------------------------------------------
// AC-20260910-05-3
// ---------------------------------------------------------------------------
test('AC-20260910-05-3: POST /client/__notes/resolve stores withdrawReason from an accepted reason, 400s an unrecognized one naming all three values, and validateNotes rejects an unrecognized withdrawReason on a note', async () => {
  const dir = tmpdir('excl-withdraw-reason')
  advanceToSeedDone(dir)
  writeNotesFile(dir, [{
    id: 'N001', scope: 'project', screen: null, state: null, text: 'drop CSV export', by: 'client',
    at: nowIso(), status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'client',
  }])
  const port = await freePort()
  const { stop } = await serveAtlas(dir, { port })
  try {
    const bad = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N001', reason: 'later' })
    assert.strictEqual(bad.status, 400,
      'AC-3: a withdraw reason outside the enum must 400 — a 200 here means an arbitrary reason string is silently accepted: got ' + bad.status + ' ' + JSON.stringify(bad.body))
    const errText = (bad.body && bad.body.error) || ''
    for (const token of ['not-needed', 'fixed-elsewhere', 'mistake']) {
      assert.match(errText, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'AC-3: the 400\'s error must name all three accepted values, including "' + token + '": got "' + errText + '"')
    }

    const ok = await postJson('http://127.0.0.1:' + port + '/client/__notes/resolve', { id: 'N001', reason: 'not-needed' })
    assert.strictEqual(ok.status, 200,
      'AC-3: an accepted reason must resolve the note 200: got ' + ok.status + ' ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.resolution, 'withdrawn',
      'AC-3: a client withdraw must CONTINUE TO stamp resolution "withdrawn": got ' + JSON.stringify(ok.body))
    assert.strictEqual(ok.body && ok.body.withdrawReason, 'not-needed',
      'AC-3: the note must store the given reason as withdrawReason — its absence means the one new fact this spec adds never reaches disk: got ' + JSON.stringify(ok.body))
  } finally {
    await stop()
  }

  const { errors } = validateNotes([{
    id: 'N002', scope: 'project', screen: null, status: 'resolved', withdrawReason: 'later',
  }])
  assert.ok(errors.some((e) => /withdrawReason/.test(e)),
    'AC-3: validateNotes must reject a withdrawReason outside the enum, naming the field — its absence means a bad value written straight to notes.json (bypassing the HTTP route) would go unnoticed: got ' + JSON.stringify(errors))
})
