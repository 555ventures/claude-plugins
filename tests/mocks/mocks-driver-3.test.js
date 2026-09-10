'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS,
  bare, mark, stateOf, ledgerCmd,
  statusJson, statusPath,
  decideLook,
  advanceToCanonWritten, advanceToJourneyApproved, advanceToJourneyWalked, advanceToApproved,
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
// `theme-picked` and `direction-composed` are not live marks (specs/20260907/07 Rationale) — the
// driver's only seven marks are seed-done, shape-picked, canon-written, kit-signed,
// journey-drawn, journey-approved and approved, and AC-20260907-07-1/-07-2 below assert the
// refusal directly for each retired name.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260907-07-1 (retag of AC-20260906-02-1)
// ---------------------------------------------------------------------------
test('AC-20260907-10-1 (retag of AC-20260907-07-1 / AC-20260907-08-1, itself a retag of AC-20260906-02-1): state derives WALK directly once canonWritten + kitSignedOff + every journey approved but not yet walked, with no status.theme and no design/tokens.css anywhere, never THEME; CLIENT once the journey is walked; APPROVED once marks.approved is additionally set; a legacy status.json additionally carrying marks.reviewOpened/decider/journeys[j].skinned/.reviewed derives the identical state, and the next accepted mark writes a status.json with none of reviewOpened/skinned/reviewed present', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir) // canonWritten + kitSignedOff (via the chain) + every declared journey approved, not yet walked

  assert.strictEqual(fs.existsSync(path.join(dir, 'design/tokens.css')), false,
    'test setup requires no design/tokens.css to exist yet, or the "CLIENT with no theme" assertion below is vacuous')
  assert.strictEqual('theme' in statusJson(dir), false,
    'test setup requires status.json to carry no top-level "theme" key at all, or the "CLIENT with no theme" assertion below is vacuous: ' + JSON.stringify(statusJson(dir)))

  // AC-20260907-08-1/D1: WALK now sits between WIREFRAMES and CLIENT — every declared journey
  // approved but none carrying `walked` must derive WALK, not CLIENT directly.
  const beforeWalk = stateOf(dir)
  assert.strictEqual(beforeWalk.stdout.trim(), 'WALK',
    'AC-20260907-08-1: canonWritten + kitSignedOff + every journey approved but not yet walked must derive WALK: ' + beforeWalk.stdout + beforeWalk.stderr)
  assert.ok(!beforeWalk.stdout.includes('THEME'),
    'AC-20260907-07-1: THEME must never be printed once the theme step is retired: ' + beforeWalk.stdout)

  advanceToJourneyWalked(dir)
  const s = stateOf(dir)
  assert.strictEqual(s.stdout.trim(), 'CLIENT',
    'AC-20260907-10-1: once every declared journey carries walked and marks.approved is unset, state must derive CLIENT (the SIGNOFF state is retired) — a legacy status.json stamped state:"SIGNOFF" with those marks derives CLIENT the same way: ' + s.stdout + s.stderr)
  assert.ok(!s.stdout.includes('THEME'),
    'AC-20260907-07-1: THEME must never be printed once the theme step is retired: ' + s.stdout)

  // Hand-write a legacy status.json in the pre-20260906/02 shape (state:"SKIN") plus every
  // other retired SKIN/REVIEW field, and confirm the derivation is unaffected by the fields it
  // carries alongside — unrelated to THEME's own retirement, kept from the prior AC this retags.
  const legacy = statusJson(dir)
  legacy.state = 'SKIN'
  legacy.marks.reviewOpened = '2026-09-01T00:00:00Z'
  legacy.decider = 'Ren'
  legacy.journeys[JOURNEY].skinned = '2026-09-01T00:00:00Z'
  legacy.journeys[JOURNEY].reviewed = '2026-09-01T00:00:00Z'
  fs.writeFileSync(statusPath(dir), JSON.stringify(legacy, null, 2))
  assert.strictEqual(stateOf(dir).stdout.trim(), 'CLIENT',
    'a legacy status.json written state:"SKIN" with no theme anywhere, plus reviewOpened/decider/skinned/reviewed, must still derive CLIENT — the legacy fields are ignored on read')

  advanceToApproved(dir)
  assert.strictEqual(stateOf(dir).stdout.trim(), 'APPROVED', 'marks.approved set must derive APPROVED')

  const written = statusJson(dir)
  assert.strictEqual(written.marks.reviewOpened, undefined, 'the write following an accepted mark must drop marks.reviewOpened entirely, not merely null it')
  assert.strictEqual(written.journeys[JOURNEY].skinned, undefined, 'the write following an accepted mark must drop journeys[j].skinned entirely')
  assert.strictEqual(written.journeys[JOURNEY].reviewed, undefined, 'the write following an accepted mark must drop journeys[j].reviewed entirely')
})

// ---------------------------------------------------------------------------
// AC-20260907-07-2
// ---------------------------------------------------------------------------
// Repair round (specs/20260907/08-walk-critic.md D2/AC-20260907-08-3): the exact live-mark list
// gains "journey-walked" in chain position, directly after "journey-approved".
test('AC-20260907-07-2: --mark direction-composed --direction quiet and --mark theme-picked each exit 2 naming "unknown mark" and the exact live eight-mark list, with neither retired name in that list', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  const LIVE_LIST = 'seed-done, shape-picked, canon-written, kit-signed, journey-drawn, journey-approved, journey-walked, approved'
  const listRe = new RegExp('one of: ' + LIVE_LIST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$')

  const dc = mark(dir, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(dc.status, 2, 'D3: --mark direction-composed must exit 2 — the mark is retired outright: ' + dc.stdout + dc.stderr)
  assert.match(dc.stderr + dc.stdout, /unknown mark/, 'the refusal must say "unknown mark": ' + dc.stdout + dc.stderr)
  assert.match((dc.stderr + dc.stdout).trim(), listRe,
    'D3: the refusal must end with the exact eight-mark live list (canon-written before kit-signed, journey-walked directly after journey-approved per specs/20260907/08-walk-critic.md D2), naming neither direction-composed nor theme-picked: ' + JSON.stringify({ stdout: dc.stdout, stderr: dc.stderr }))

  const tp = mark(dir, 'theme-picked')
  assert.strictEqual(tp.status, 2, 'D3: --mark theme-picked must exit 2 — the mark is retired outright: ' + tp.stdout + tp.stderr)
  assert.match(tp.stderr + tp.stdout, /unknown mark/, 'the refusal must say "unknown mark": ' + tp.stdout + tp.stderr)
  assert.match((tp.stderr + tp.stdout).trim(), listRe,
    'D3: the refusal must end with the exact eight-mark live list (canon-written before kit-signed, journey-walked directly after journey-approved per specs/20260907/08-walk-critic.md D2), naming neither direction-composed nor theme-picked: ' + JSON.stringify({ stdout: tp.stdout, stderr: tp.stderr }))
})

// ---------------------------------------------------------------------------
// AC-20260906-02-2
// ---------------------------------------------------------------------------
test('AC-20260906-02-2: --mark journey-skinned/review-opened/journey-reviewed exit 2 naming "unknown mark" and the seven live mark names; --decider on a bare or --mark invocation exits 2 with the retirement message', () => {
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
    // specs/20260907/07-mocks-retires-theme.md D3 fixture repair: direction-composed and
    // theme-picked drop out of the live-mark list entirely (nine live marks -> seven).
    for (const live of ['seed-done', 'shape-picked', 'canon-written', 'kit-signed', 'journey-drawn', 'journey-approved', 'approved']) {
      assert.match(r.stderr + r.stdout, new RegExp(live), '--mark ' + markName + '\'s refusal must list the live mark name "' + live + '": ' + r.stdout + r.stderr)
    }
    assert.ok(!(r.stderr + r.stdout).includes('direction-composed'), '--mark ' + markName + '\'s refusal must never name the retired mark "direction-composed": ' + r.stdout + r.stderr)
    assert.ok(!(r.stderr + r.stdout).includes('theme-picked'), '--mark ' + markName + '\'s refusal must never name the retired mark "theme-picked": ' + r.stdout + r.stderr)
  }

  const deciderBare = runNode(SCRIPT, ['--root', dir, '--decider', 'Ren'])
  assert.strictEqual(deciderBare.status, 2, '--decider on a bare invocation must exit 2 — the flag is retired outright: ' + deciderBare.stdout + deciderBare.stderr)
  assert.match(deciderBare.stderr + deciderBare.stdout, /--decider is retired/, 'the refusal must carry the exact D2 retirement message: ' + deciderBare.stdout + deciderBare.stderr)

  const deciderOnMark = runNode(SCRIPT, ['--root', dir, '--mark', 'journey-approved', '--journey', JOURNEY, '--decider', 'Ren'])
  assert.strictEqual(deciderOnMark.status, 2, '--decider on a --mark invocation must also exit 2: ' + deciderOnMark.stdout + deciderOnMark.stderr)
  assert.match(deciderOnMark.stderr + deciderOnMark.stdout, /--decider is retired/, 'the refusal must carry the exact D2 retirement message on a --mark invocation too: ' + deciderOnMark.stdout + deciderOnMark.stderr)
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
