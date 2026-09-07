'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf, ledgerCmd,
  statusJson, statusPath,
  decideLook, writeThemeDirection,
  advanceToCanonWritten, advanceToJourneyApproved, advanceToDirectionComposed, advanceToThemePicked,
} = require('./mocks-driver-fixtures')

// specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget guard,
// specs/20260903/07-test-file-budget-guard.md): the second half of mocks-driver.test.js's tests
// move here verbatim, test logic and AC tags unchanged. Named mocks-driver-3.test.js rather than
// the Decision's literal mocks-driver-2.test.js because that name is already an unrelated shard
// from specs/20260906/01-ac-drift-doctor-check.md D11's earlier split (deviation recorded).
//
// specs/20260906/02-mocks-ends-at-wireframes.md: SKIN and REVIEW retire — AC-20260906-02-1,
// -2, -3, and -4 (retag of the theme-picked test) replace AC-20260902-07-1's stale "SKIN"-shaped
// assumptions where they collide; the journey-skinned test (former AC-20260902-07-8) is deleted
// outright — journey-skinned is not among the driver's live marks.

// ---------------------------------------------------------------------------
// AC-20260906-02-4 (retag of the former AC-20260902-07-7 theme-picked test — the too-few-
// screens/too-many-screens clauses move to AC-20260906-02-3 below; this test keeps the
// under-2-directions and incomplete-rejection refusals, and the byte-copy-on-accept pin)
// ---------------------------------------------------------------------------
// Deviation (recorded in specs/20260902/07-mocks-command-driver.deviations.md): the spec names
// a "theme-directions"/"theme" product ledger ROW without pinning how the driver identifies it
// (ledger ids are ^[A-Z]+\d+[a-z]?$, so the row cannot literally be id "theme-directions"). This
// fixture writes said-by-user/confirmed rows whose `claim` cell carries the literal
// "theme-directions: <kebab>" / "theme: <kebab>" text as the most literal reading of D8 — an
// implementation reading a different cell/shape for this row is a legitimate in-bounds choice
// the spec leaves open, not a locked Decision this test overrides.
test('AC-20260906-02-4 / AC-20260902-07-7: theme-picked refuses under 2 composed directions or an incomplete rejection even with a decided stop present, and copies tokens on acceptance', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0]], 'P15')

  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  let picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 2, 'theme-picked must refuse while only one direction is composed, even with a decided pick stop present: ' + picked.stdout + picked.stderr)

  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[1]], 'P16')
  const badRejectRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(badRejectRow.status, 0, 'test setup requires the theme row (missing rejected cell) to be accepted: ' + badRejectRow.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 2, 'theme-picked must refuse when the theme row\'s rejected cell omits a composed direction ("warm"), even with a decided pick stop present: ' + picked.stdout + picked.stderr)
  assert.match(picked.stderr + picked.stdout, /warm/, 'the refusal must name the omitted composed direction "warm"')

  // D14's `ledger set` only rewrites status/tag, never `rejected` — so the fix for a
  // theme row missing its rejected cell is authoring it correctly the first time, exercised for
  // real via advanceToThemePicked's own helper below.
  const dir2 = tmpdir('mocks-driver')
  advanceToThemePicked(dir2, 'quiet', 'warm')
  assert.strictEqual(fs.readFileSync(path.join(dir2, 'design/tokens.css'), 'utf8'),
    fs.readFileSync(path.join(dir2, 'design/theme/quiet/tokens.css'), 'utf8'),
    'theme-picked must copy design/theme/<k>/tokens.css to design/tokens.css byte-for-byte')
  assert.strictEqual(statusJson(dir2).state, 'SIGNOFF', 'D1: an accepted theme-picked must advance the derived state to SIGNOFF, not the retired SKIN')
})

// ---------------------------------------------------------------------------
// AC-20260906-02-3
// ---------------------------------------------------------------------------
test('AC-20260906-02-3: direction-composed accepts a direction composing only the seed\'s dense screen; refuses composing 3 screens naming the cap and /spec:sketch; continues to refuse 2 screens neither of which is the dense screen', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  writeThemeDirection(dir, 'quiet', [DENSE])
  const ledgerR = ledgerCmd(dir, 'add', ['--id', 'P15', '--step', 'THEME', '--kind', 'product', '--claim', 'theme-directions: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR.stderr)
  const onlyDense = mark(dir, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(onlyDense.status, 0, 'D3: direction-composed must accept a direction composing only the seed\'s dense screen: ' + onlyDense.stdout + onlyDense.stderr)
  assert.strictEqual(statusJson(dir).directions.quiet.composed !== null, true, 'an accepted direction-composed must record directions.quiet.composed')

  const dir2 = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir2)
  writeThemeDirection(dir2, 'quiet', [DENSE, LABELS[0], LABELS[1]])
  const ledgerR2 = ledgerCmd(dir2, 'add', ['--id', 'P15', '--step', 'THEME', '--kind', 'product', '--claim', 'theme-directions: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(ledgerR2.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR2.stderr)
  const threeScreens = mark(dir2, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(threeScreens.status, 2, 'D3: direction-composed must refuse a direction composing 3 screens — the cap is 2: ' + threeScreens.stdout + threeScreens.stderr)
  assert.match(threeScreens.stderr + threeScreens.stdout, /composes 3 screens — at most 2/, 'the refusal must carry the exact D3 cap message: ' + threeScreens.stdout + threeScreens.stderr)
  assert.match(threeScreens.stderr + threeScreens.stdout, /\/spec:sketch/, 'the refusal must name /spec:sketch as the fidelity-work remedy: ' + threeScreens.stdout + threeScreens.stderr)

  const dir3 = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir3)
  writeThemeDirection(dir3, 'quiet', [LABELS[0], LABELS[1]])
  const ledgerR3 = ledgerCmd(dir3, 'add', ['--id', 'P15', '--step', 'THEME', '--kind', 'product', '--claim', 'theme-directions: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(ledgerR3.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR3.stderr)
  const noDense = mark(dir3, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(noDense.status, 2, 'direction-composed must CONTINUE TO refuse when neither composed screen is the dense screen: ' + noDense.stdout + noDense.stderr)
  assert.match(noDense.stderr + noDense.stdout, new RegExp(DENSE), 'the refusal must name the missing dense screen "' + DENSE + '": ' + noDense.stdout + noDense.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260906-02-2
// ---------------------------------------------------------------------------
test('AC-20260906-02-2: --mark journey-skinned/review-opened/journey-reviewed exit 2 naming "unknown mark" and the eight live mark names; --decider on a bare or --mark invocation exits 2 with the retirement message', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)

  for (const [markName, extra] of [
    ['journey-skinned', ['--journey', JOURNEY]],
    ['review-opened', []],
    ['journey-reviewed', ['--journey', JOURNEY]],
  ]) {
    const r = mark(dir, markName, extra)
    assert.strictEqual(r.status, 2, '--mark ' + markName + ' must exit 2 — it is a retired mark, never a silent no-op: ' + r.stdout + r.stderr)
    assert.match(r.stderr + r.stdout, /unknown mark/, '--mark ' + markName + '\'s refusal must say "unknown mark": ' + r.stdout + r.stderr)
    for (const live of ['seed-done', 'shape-picked', 'canon-written', 'journey-drawn', 'journey-approved', 'direction-composed', 'theme-picked', 'approved']) {
      assert.match(r.stderr + r.stdout, new RegExp(live), '--mark ' + markName + '\'s refusal must list the live mark name "' + live + '": ' + r.stdout + r.stderr)
    }
  }

  const deciderBare = runNode(SCRIPT, ['--root', dir, '--decider', 'Ren'])
  assert.strictEqual(deciderBare.status, 2, '--decider on a bare invocation must exit 2 — the flag is retired outright: ' + deciderBare.stdout + deciderBare.stderr)
  assert.match(deciderBare.stderr + deciderBare.stdout, /--decider is retired/, 'the refusal must carry the exact D2 retirement message: ' + deciderBare.stdout + deciderBare.stderr)

  const deciderOnMark = runNode(SCRIPT, ['--root', dir, '--mark', 'journey-approved', '--journey', JOURNEY, '--decider', 'Ren'])
  assert.strictEqual(deciderOnMark.status, 2, '--decider on a --mark invocation must also exit 2: ' + deciderOnMark.stdout + deciderOnMark.stderr)
  assert.match(deciderOnMark.stderr + deciderOnMark.stdout, /--decider is retired/, 'the refusal must carry the exact D2 retirement message on a --mark invocation too: ' + deciderOnMark.stdout + deciderOnMark.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260906-02-1
// ---------------------------------------------------------------------------
test('AC-20260906-02-1: state derives THEME once canonWritten + every journey approved with theme:null, SIGNOFF once theme is set with marks.approved false, and APPROVED once marks.approved is true; a legacy status.json additionally carrying marks.reviewOpened/decider/journeys[j].skinned/.reviewed derives the identical state, and the next accepted mark writes a status.json with none of reviewOpened/skinned/reviewed present', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir) // canonWritten + every declared journey approved, theme still null
  assert.strictEqual(stateOf(dir).stdout.trim(), 'THEME', 'canonWritten + every journey approved with theme:null must derive THEME')

  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0]], 'P15')
  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[1]], 'P16')
  const themeRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeRow.status, 0, 'test setup requires the theme row to be accepted: ' + themeRow.stderr)
  decideLook(dir, 'theme-picked', 'pick', { pick: 'quiet', others: ['warm'], by: 'jj' })
  const picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 0, 'test setup requires theme-picked to be accepted: ' + picked.stdout + picked.stderr)
  assert.strictEqual(stateOf(dir).stdout.trim(), 'SIGNOFF', 'theme set with marks.approved false must derive SIGNOFF')

  // Hand-write a legacy status.json in the AC's own example shape (state:"SKIN", theme set,
  // marks.approved false) plus every other retired field, and confirm the derivation is
  // unaffected by the fields it carries alongside.
  const legacy = statusJson(dir)
  legacy.state = 'SKIN'
  legacy.marks.reviewOpened = '2026-09-01T00:00:00Z'
  legacy.decider = 'Ren'
  legacy.journeys[JOURNEY].skinned = '2026-09-01T00:00:00Z'
  legacy.journeys[JOURNEY].reviewed = '2026-09-01T00:00:00Z'
  fs.writeFileSync(statusPath(dir), JSON.stringify(legacy, null, 2))
  assert.strictEqual(stateOf(dir).stdout.trim(), 'SIGNOFF', 'a legacy status.json written state:"SKIN" with theme set and marks.approved false, plus reviewOpened/decider/skinned/reviewed, must still derive SIGNOFF — the legacy fields are ignored on read')

  decideLook(dir, 'approved', 'approve', { by: 'Ren' })
  const accepted = mark(dir, 'approved')
  assert.strictEqual(accepted.status, 0, 'test setup requires the next accepted mark (approved) to succeed once theme is picked and the stop is decided: ' + accepted.stdout + accepted.stderr)
  assert.strictEqual(stateOf(dir).stdout.trim(), 'APPROVED', 'marks.approved set must derive APPROVED')

  const written = statusJson(dir)
  assert.strictEqual(written.marks.reviewOpened, undefined, 'the write following an accepted mark must drop marks.reviewOpened entirely, not merely null it')
  assert.strictEqual(written.journeys[JOURNEY].skinned, undefined, 'the write following an accepted mark must drop journeys[j].skinned entirely')
  assert.strictEqual(written.journeys[JOURNEY].reviewed, undefined, 'the write following an accepted mark must drop journeys[j].reviewed entirely')
})

// ---------------------------------------------------------------------------
// specs/20260906/03-questions-on-the-wireframe.md — TDD red: D2's `ledger add --screen`/
// `ledger ask` and D7's questions progress line + Then: hint do not exist yet on mocks-driver.js.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260906-03-2
// ---------------------------------------------------------------------------
test('AC-20260906-03-2: `ledger add --screen <label>` appends both the ledger row and a question note; refuses --screen on a process row, on a said-by-user tag, and on an unknown screen; `ledger ask` pins an existing open row to a screen and refuses re-pinning', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir) // declares the seed's journey/screens (LABELS[0] = "signin")

  const notesPath = path.join(dir, 'design/mocks/notes.json')
  const readNotes = () => (fs.existsSync(notesPath) ? JSON.parse(fs.readFileSync(notesPath, 'utf8')) : [])

  const added = ledgerCmd(dir, 'add', [
    '--id', 'W7', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'single-use link',
    '--tag', 'inferred', '--status', 'open', '--screen', LABELS[0],
  ])
  assert.strictEqual(added.status, 0, 'D2: `ledger add --screen ' + LABELS[0] + '` on a declared screen must exit 0: ' + added.stdout + added.stderr)
  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, /\| W7 \| WIREFRAMES \| product \| single-use link \| inferred \| open \|/,
    'D2: `ledger add --screen` must still append the ledger row exactly as a plain `ledger add` would: ' + ledgerText)
  const q = readNotes().find((n) => n.ledgerId === 'W7')
  assert.ok(q, 'D2: `ledger add --screen ' + LABELS[0] + '` must append a notes.json record carrying ledgerId "W7" — none found: ' + JSON.stringify(readNotes()))
  assert.deepStrictEqual(
    { kind: q.kind, scope: q.scope, screen: q.screen, state: q.state, text: q.text, by: q.by, status: q.status },
    { kind: 'question', scope: 'mock', screen: LABELS[0], state: null, text: 'single-use link', by: 'session', status: 'open' },
    'D2: the appended question record must carry exactly this shape: ' + JSON.stringify(q))

  const processRow = ledgerCmd(dir, 'add', [
    '--id', 'W8', '--step', 'WIREFRAMES', '--kind', 'process', '--claim', 'x',
    '--tag', 'inferred', '--status', 'open', '--screen', LABELS[0],
  ])
  assert.strictEqual(processRow.status, 2, 'D2: `--screen` on a `--kind process` row must refuse (exit 2) — a process row is never a question for the user: ' + processRow.stdout + processRow.stderr)
  assert.match(processRow.stderr + processRow.stdout, /never a question/, 'the process-row refusal must carry the exact D2 phrase "never a question": ' + processRow.stdout + processRow.stderr)

  const saidByUser = ledgerCmd(dir, 'add', [
    '--id', 'W9', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'x',
    '--tag', 'said-by-user', '--status', 'confirmed', '--screen', LABELS[0],
  ])
  assert.strictEqual(saidByUser.status, 2, 'D2: `--screen` on a "said-by-user" tag must refuse — the user already said it: ' + saidByUser.stdout + saidByUser.stderr)
  assert.match(saidByUser.stderr + saidByUser.stdout, /nothing to ask/, 'the said-by-user refusal must carry the exact D2 phrase "nothing to ask": ' + saidByUser.stdout + saidByUser.stderr)

  const unknownScreen = ledgerCmd(dir, 'add', [
    '--id', 'W10', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'x',
    '--tag', 'inferred', '--status', 'open', '--screen', 'nowhere',
  ])
  assert.strictEqual(unknownScreen.status, 2, 'D2: `--screen nowhere` (not a declared journey screen) must refuse: ' + unknownScreen.stdout + unknownScreen.stderr)
  assert.match(unknownScreen.stderr + unknownScreen.stdout, /unknown screen "nowhere"/, 'the unknown-screen refusal must carry the exact D2 message: ' + unknownScreen.stdout + unknownScreen.stderr)

  const plainRow = ledgerCmd(dir, 'add', [
    '--id', 'W11', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'y',
    '--tag', 'invented', '--status', 'open',
  ])
  assert.strictEqual(plainRow.status, 0, 'test setup requires a plain (un-pinned) open product row for `ledger ask` to pin: ' + plainRow.stderr)

  const asked = ledgerCmd(dir, 'ask', ['--id', 'W11', '--screen', LABELS[1]])
  assert.strictEqual(asked.status, 0, 'D2: `ledger ask --id W11 --screen ' + LABELS[1] + '` must pin an existing open product row and exit 0: ' + asked.stdout + asked.stderr)
  const askedNote = readNotes().find((n) => n.ledgerId === 'W11')
  assert.ok(askedNote && askedNote.screen === LABELS[1], 'D2: `ledger ask` must append a question note pinned to the given screen: ' + JSON.stringify(askedNote))

  const askedAgain = ledgerCmd(dir, 'ask', ['--id', 'W11', '--screen', LABELS[1]])
  assert.strictEqual(askedAgain.status, 2, 'D2: re-pinning an already-pinned row must refuse: ' + askedAgain.stdout + askedAgain.stderr)
  assert.match(askedAgain.stderr + askedAgain.stdout, /already a question on/, 'the re-pin refusal must carry the exact D2 phrase "already a question on": ' + askedAgain.stdout + askedAgain.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260906-03-8
// ---------------------------------------------------------------------------
test('AC-20260906-03-8: the WIREFRAMES draw-journey step\'s progress line names "questions: <open>/<total> open on <journey>" and its Then: block gains a line pointing at `ledger add … --screen`', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)

  const notesPath = path.join(dir, 'design/mocks/notes.json')
  const nowIso = () => new Date().toISOString()
  const question = (id, screen, ledgerId, resolved) => ({
    id, scope: 'mock', screen, state: null, kind: 'question', ledgerId,
    text: 'claim', by: 'session', at: nowIso(),
    status: resolved ? 'resolved' : 'open',
    addressed: null, reply: null, resolvedBy: resolved ? 'Ren' : null, resolvedAt: resolved ? nowIso() : null,
    answer: resolved ? { verdict: 'yes', text: '', by: 'Ren', at: nowIso() } : null,
  })
  fs.writeFileSync(notesPath, JSON.stringify([
    question('N001', LABELS[0], 'W7', false),
    question('N002', LABELS[1], 'W8', true),
  ], null, 2) + '\n')

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at the WIREFRAMES draw-journey step must exit 0: ' + r.stderr)
  assert.match(r.stdout, /questions: 1\/2 open on onboarding/,
    'D7: the draw-journey step\'s progress line must contain "questions: 1/2 open on onboarding" for one open question out of two declared on this journey\'s screens: ' + r.stdout)

  const thenIdx = r.stdout.indexOf('Then:')
  assert.ok(thenIdx > -1, 'the printed step must carry a "Then:" block: ' + r.stdout)
  const thenBlock = r.stdout.slice(thenIdx)
  assert.match(thenBlock, /ledger add/, 'D7: the draw step\'s Then: block must gain a line mentioning `ledger add` (pinning an assumption while drawing): ' + r.stdout)
  assert.match(thenBlock, /--screen/, 'D7: the draw step\'s Then: block must gain a line mentioning `--screen`: ' + r.stdout)
})
