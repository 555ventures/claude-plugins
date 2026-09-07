'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, JOURNEY, LABELS, DENSE,
  bare, mark, stateOf, ledgerCmd,
  writeFile, statusJson, statusPath,
  writeTargets, writeResearchBrief, writeSeed, confirmFacts, writeCanon, writeWireframe,
  writeThemeDirection,
  decideLook,
  advanceToShapePicked, advanceToCanonWritten, advanceToJourneyApproved,
  advanceToDirectionComposed, advanceToThemePicked,
  writeFixtureCapture, writeCaptureConfig,
} = require('./mocks-driver-fixtures')

// specs/20260902/07-mocks-command-driver.md (TDD red): spec/scripts/mocks-driver.js does not
// exist yet — every test below is red until the driver lands. AC-20260902-07-1 .. -8.
// Fixtures build the SEED->APPROVED chain through the real binary (advanceTo* helpers), the way
// tests/genesis/genesis-driver.test.js drives genesis-driver.js, so each later-stage test's
// setup is itself an executed proof that every earlier mark's contract holds.
//
// specs/20260903/07-test-file-budget-guard.md's per-file 45s guard split this file: shared
// fixtures now live in mocks-driver-fixtures.js, and the D6/D7/D8 look-stop tests
// (AC-20260905-02-9..15) moved to the sibling mocks-driver-look-stops.test.js.
//
// Split under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md): the second half lives in mocks-driver-2.test.js; test logic unchanged.
//
// specs/20260906/02-mocks-ends-at-wireframes.md: SKIN and REVIEW retire — AC-20260906-02-1,
// -2, -3, and -4 (retag of the theme-picked test) replace AC-20260902-07-1's stale "SKIN"-shaped
// assumptions where they collide; the journey-skinned test (former AC-20260902-07-8) is deleted
// outright — journey-skinned is not among the driver's live marks.

// ---------------------------------------------------------------------------
// AC-20260902-07-1
// ---------------------------------------------------------------------------
test('AC-20260902-07-1: WHEN the driver runs on a cold --root THE SYSTEM creates status.json/ledger.md/seed.md from templates and prints a SEED step naming seed.md as Read only', () => {
  const dir = tmpdir('mocks-driver')
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a cold-root bare invocation must exit 0 and print the SEED step: ' + r.stderr)

  const status = statusJson(dir)
  assert.strictEqual(status.schemaVersion, 1, 'a cold status.json must be created with schemaVersion 1')
  assert.strictEqual(status.state, 'SEED', 'a cold status.json must record state SEED')
  assert.strictEqual(status.look, 'playwright', 'a cold status.json must default look to "playwright"')
  for (const key of ['seedDone', 'shapePicked', 'canonWritten', 'themePicked', 'approved']) {
    assert.strictEqual(status.marks[key], null, 'mark "' + key + '" must be null on a cold status.json, never a stale value from a template default')
  }

  assert.ok(fs.existsSync(path.join(dir, 'design/mocks/ledger.md')), 'a cold root must create design/mocks/ledger.md from the template — a session cannot record a single assumption without it')
  assert.ok(fs.existsSync(path.join(dir, 'design/mocks/seed.md')), 'a cold root must create design/mocks/seed.md from the template — a session has nowhere to author the seed without it')

  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
  const stepIdx = lines.findIndex((l) => /^## Step: seed/.test(l))
  assert.ok(stepIdx > -1, 'the printed step must open with a "## Step: seed …" heading: ' + r.stdout)
  const readOnlyIdx = lines.findIndex((l, i) => i > stepIdx && /^Read only:/.test(l))
  assert.ok(readOnlyIdx > -1 && readOnlyIdx <= stepIdx + 2,
    'a "Read only:" line must follow shortly after the "## Step: seed" heading, or the session has no idea what to read before authoring the seed: ' + r.stdout)
  assert.match(lines[readOnlyIdx], /design\/mocks\/seed\.md/, 'the Read only line must name design/mocks/seed.md')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-2
// ---------------------------------------------------------------------------
test('AC-20260902-07-2: WHEN a mark is accepted THE SYSTEM prints the ledger counts line then the exact checkpoint line, and --state prints only the derived state name', () => {
  const dir = tmpdir('mocks-driver')
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'seed-done must be accepted on a fully valid seed for this checkpoint assertion to be meaningful: ' + r.stderr)

  const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
  assert.strictEqual(lines.length >= 2, true, 'an accepted mark must print at least the counts line and the checkpoint line: ' + r.stdout)
  const [ledgerLine, checkpointLine] = lines.slice(-2)
  assert.strictEqual(ledgerLine,
    '📒 ledger: 13 said-by-user · 0 ratified-doc · 0 inferred (0 open) · 0 invented (0 open) · 0 process · 0 catches',
    'the second-to-last non-blank line must be the exact D3 counts line for 13 confirmed said-by-user facts and nothing else: ' + r.stdout)
  assert.strictEqual(checkpointLine,
    '✅ checkpoint — mocks state saved (SEED → SHAPES); safe to /clear and re-run /spec:mocks',
    'the last non-blank line must be the exact D1 checkpoint line naming the SEED → SHAPES transition — any deviation breaks a session parsing this line to know it is safe to /clear')

  const s = stateOf(dir)
  assert.strictEqual(s.status, 0, '--state must exit 0: ' + s.stderr)
  assert.strictEqual(s.stdout.trim(), 'SHAPES', '--state must print only the derived state name, nothing else')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-3
// ---------------------------------------------------------------------------
test('AC-20260902-07-3: WHEN --mark seed-done runs against a malformed seed THE SYSTEM refuses naming the exact fault, and accepts once every check holds', () => {
  const dir = tmpdir('mocks-driver')
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)

  // missing `payer` fact line entirely
  writeSeed(dir)
  let seedText = fs.readFileSync(path.join(dir, 'design/mocks/seed.md'), 'utf8')
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), seedText.replace('- payer: P8\n', ''))
  let r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse (exit 2) when a required fact key is missing from ## Facts: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /payer/, 'the refusal must name the missing key "payer"')

  // payer present but its ledger row is inferred/open, not confirmed
  writeSeed(dir)
  const badRow = ledgerCmd(dir, 'set', ['--id', 'P8', '--status', 'open', '--tag', 'inferred'])
  assert.strictEqual(badRow.status, 0, 'test setup requires `ledger set` to flip P8 to inferred/open: ' + badRow.stderr)
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when the referenced row is inferred/open rather than confirmed: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /P8/, 'the refusal must name the offending row id P8')
  assert.match(r.stderr + r.stdout, /confirmed/, 'the refusal must name "confirmed" as the required status')
  const fixRow = ledgerCmd(dir, 'set', ['--id', 'P8', '--status', 'confirmed', '--tag', 'said-by-user'])
  assert.strictEqual(fixRow.status, 0, 'test setup requires restoring P8 to confirmed/said-by-user: ' + fixRow.stderr)

  // a label declared in two journeys
  writeSeed(dir)
  seedText = fs.readFileSync(path.join(dir, 'design/mocks/seed.md'), 'utf8')
  const dupJourney = seedText + `
### duplicate-journey
Another persona reaches the same dense screen.
\`\`\`surfaces
foo -> ${DENSE}
\`\`\`
`
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), dupJourney)
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when a label is declared in two journeys: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(DENSE), 'the refusal must name the doubly-declared label')

  // no research brief
  writeSeed(dir)
  fs.rmSync(path.join(dir, 'docs/design/research-brief.md'))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when docs/design/research-brief.md is absent: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /docs\/design\/research-brief\.md/, 'the refusal must name the missing research brief path')
  writeResearchBrief(dir)

  // everything satisfied
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'seed-done must be accepted once every check holds: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.seedDone !== null, true, 'an accepted seed-done must record marks.seedDone')
  assert.strictEqual(statusJson(dir).state, 'SHAPES', 'an accepted seed-done must advance the derived state to SHAPES')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-4
// ---------------------------------------------------------------------------
test('AC-20260902-07-4: ledger add/check/set/catch operate through the driver exactly like spec 06\'s lib', () => {
  const dir = tmpdir('mocks-driver')
  bare(dir)

  const added = ledgerCmd(dir, 'add', [
    '--id', 'W4', '--step', 'WIREFRAMES', '--kind', 'product', '--claim', 'x',
    '--tag', 'invented', '--status', 'open',
  ])
  assert.strictEqual(added.status, 0, '`ledger add` must accept a well-formed row: ' + added.stderr)
  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, /\| W4 \| WIREFRAMES \| product \| x \| invented \| open \|/,
    'the appended row must re-parse (appear verbatim) in ledger.md: ' + ledgerText)

  const blocked = ledgerCmd(dir, 'check')
  assert.strictEqual(blocked.status, 1, '`ledger check` must exit 1 while W4 is invented/open: ' + blocked.stdout + blocked.stderr)
  assert.match(blocked.stdout, /📒 ledger: 0 said-by-user · 0 ratified-doc · 0 inferred \(0 open\) · 1 invented \(1 open\) · 0 process · 0 catches/,
    'ledger check must print the exact D3 counts line before the verdict: ' + blocked.stdout)
  assert.match(blocked.stdout, /gate: blocked/, '`ledger check` must print "gate: blocked" on a blocking row')
  assert.match(blocked.stdout, /W4 invented open/, '`ledger check` must print the blocking row\'s id, tag, and status')

  const flipped = ledgerCmd(dir, 'set', ['--id', 'W4', '--status', 'confirmed 2026-09-02', '--tag', 'said-by-user'])
  assert.strictEqual(flipped.status, 0, '`ledger set` must flip only the named row: ' + flipped.stderr)
  const open = ledgerCmd(dir, 'check')
  assert.strictEqual(open.status, 0, '`ledger check` must exit 0 once the only blocking row is confirmed: ' + open.stdout + open.stderr)
  assert.match(open.stdout, /gate: open/, '`ledger check` must print "gate: open" once nothing blocks')

  const caught = ledgerCmd(dir, 'catch', ['--id', 'M1', '--what', 'assumed the wrong payer', '--step', 'SEED', '--cost', '20 minutes'])
  assert.strictEqual(caught.status, 0, '`ledger catch` must append a Misunderstandings row: ' + caught.stderr)
  const afterCatch = ledgerCmd(dir, 'check')
  assert.match(afterCatch.stdout, /1 catches/, 'the counts line\'s catches figure must rise from 0 to 1 after `ledger catch`: ' + afterCatch.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260902-07-5
// ---------------------------------------------------------------------------
test('AC-20260902-07-5: WHEN --mark canon-written runs THE SYSTEM refuses on a missing grounding literal or a pre-existing mock, and copies the wire templates on acceptance', () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)

  writeFile(path.join(dir, 'design/mocks/canon.md'), `## Shells
none

## Primitives
- **Button** — primary action

## Rules
- One screen at a time.

## Grounding
No citation here.
`)
  let r = mark(dir, 'canon-written')
  assert.strictEqual(r.status, 2, 'canon-written must refuse when ## Grounding does not contain the literal docs/design/research-brief.md: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /docs\/design\/research-brief\.md/, 'the refusal must name the missing literal')

  writeCanon(dir)
  writeFile(path.join(dir, 'design/mocks/a.html'), '<main data-screen-label="a">pre-existing</main>\n')
  r = mark(dir, 'canon-written')
  assert.strictEqual(r.status, 2, 'canon-written must refuse when a design/mocks/*.html already exists (canon must come before any screen): ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /a\.html/, 'the refusal must name the pre-existing file')
  fs.rmSync(path.join(dir, 'design/mocks/a.html'))

  assert.strictEqual(fs.existsSync(path.join(dir, 'design/wire/tokens.css')), false,
    'design/wire/tokens.css must not exist before canon-written is accepted, or the copy-on-absence assertion below is vacuous')
  r = mark(dir, 'canon-written')
  assert.strictEqual(r.status, 0, 'canon-written must be accepted once the grounding literal is present and no mock exists yet: ' + r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(dir, 'design/wire/tokens.css')), 'canon-written must copy the wire tokens template into design/wire/tokens.css when absent')
  assert.ok(fs.existsSync(path.join(dir, 'design/wire/wire.css')), 'canon-written must copy the wire stylesheet template into design/wire/wire.css when absent')
  assert.strictEqual(statusJson(dir).marks.canonWritten !== null, true, 'an accepted canon-written must record marks.canonWritten')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-6
// ---------------------------------------------------------------------------
test('AC-20260902-07-6 / AC-20260905-02-18 / AC-20260906-05-5: journey-drawn refuses a missing or non-conforming label and records drawn; journey-approved refuses before drawn or on a blocked gate even with a decided stop present; both marks CONTINUE TO accept once every screen declares its three gray states (the fixture default)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)

  writeWireframe(dir, LABELS[0])
  // LABELS[1] ("invite") deliberately missing
  let r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse when a declared label\'s file does not exist: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the refusal must name the missing label "' + LABELS[1] + '"')

  for (const label of LABELS) writeWireframe(dir, label)

  // AC-6's three named non-conforming shapes, each isolated to ONE violation against an
  // otherwise-conforming file — the literal text requires exit 2, the failing label, AND
  // design-atlas.js check's own output line on ALL THREE, not just a label match.
  const CHECK_LINE_RE = /design-atlas\.js check|CHECK FAIL/

  // (a) data-status="ratified" — otherwise D6-conforming (both wire links present); ratified
  // tier binds design-atlas.js check's hygiene rules (e.g. the border-box reset), which this
  // bare fixture carries none of, so check fails and prints its own CHECK FAIL line.
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[1] + '.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<main data-screen-label="' + LABELS[1] + '" data-status="ratified">' + LABELS[1] + '</main>\n')
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse a data-status="ratified" file (not the required sketch stage): ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the ratified-status refusal must carry the failing label "' + LABELS[1] + '"')
  assert.match(r.stderr + r.stdout, CHECK_LINE_RE,
    'the ratified-status refusal must also carry design-atlas.js check\'s own output line, not just the label — the AC requires both: ' + r.stdout + r.stderr)

  // (b) links no wire/tokens.css — otherwise D6-conforming (sketch status, wire.css still
  // linked); design-atlas.js check unconditionally requires a tokens.css link at any tier.
  writeWireframe(dir, LABELS[1]) // restore baseline before isolating the next violation
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[1] + '.html'),
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<main data-screen-label="' + LABELS[1] + '" data-status="sketch">' + LABELS[1] + '</main>\n')
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse a file that links no wire/tokens.css: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the missing-tokens-link refusal must carry the failing label "' + LABELS[1] + '"')
  assert.match(r.stderr + r.stdout, CHECK_LINE_RE,
    'the missing-tokens-link refusal must also carry design-atlas.js check\'s own output line, not just the label: ' + r.stdout + r.stderr)

  // (c) contains an off-token color literal (#999) — otherwise D6-conforming; design-atlas.js
  // check unconditionally flags inline off-token color literals at any tier.
  writeWireframe(dir, LABELS[1]) // restore baseline before isolating the next violation
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[1] + '.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>.x { color: #999; }</style>\n' +
    '<main data-screen-label="' + LABELS[1] + '" data-status="sketch">' + LABELS[1] + '</main>\n')
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse a file containing an off-token color literal (#999): ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the off-token-color refusal must carry the failing label "' + LABELS[1] + '"')
  assert.match(r.stderr + r.stdout, CHECK_LINE_RE,
    'the off-token-color refusal must also carry design-atlas.js check\'s own output line, not just the label: ' + r.stdout + r.stderr)

  writeWireframe(dir, LABELS[1])
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0,
    'AC-20260906-05-5: journey-drawn must CONTINUE TO be accepted once every label of the journey conforms to D6, including the fixture default\'s three declared gray states: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].drawn !== null, true, 'an accepted journey-drawn must record journeys.<j>.drawn')

  // journey-approved before any draw, on a fresh journey name that was never drawn
  const dir2 = tmpdir('mocks-driver')
  advanceToCanonWritten(dir2)
  decideLook(dir2, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  const early = mark(dir2, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(early.status, 2, 'journey-approved must refuse before journey-drawn has been recorded, even with a decided approve stop present: ' + early.stdout + early.stderr)

  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })
  const approved = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(approved.status, 0,
    'AC-20260906-05-5: journey-approved must CONTINUE TO be accepted once drawn and the ledger gate is open, including the fixture default\'s three declared gray states: ' + approved.stdout + approved.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved !== null, true, 'an accepted journey-approved must record journeys.<j>.approved')
})

// ---------------------------------------------------------------------------
// AC-20260906-05-3
// ---------------------------------------------------------------------------
// specs/20260906/05-gray-states-on-every-wireframe.md D2, TDD red: mocks-driver.js does not run
// `check --states` at journey-drawn yet, so a screen declaring none of the three states passes
// journey-drawn today (status 0) — every assertion below expects the refusal D2 promises instead.
test('AC-20260906-05-3: journey-drawn refuses when one screen of the journey declares none of the three gray states, naming the file, every missing state in empty/loading/error order, and the draw-the-missing-states remedy, and never records journeys.onboarding.drawn', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (const label of LABELS) {
    writeWireframe(dir, label, label === 'consent' ? { states: [] } : {})
  }

  const r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2,
    'D2: journey-drawn must refuse (exit 2) once check --states finds a screen declaring none of the three required states: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /consent\.html: missing state\(s\) empty, loading, error/,
    'D1/D2: the refusal must name consent.html and every missing state in empty, loading, error order — a partial list leaves the author guessing which states to draw: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /draw the missing states/,
    'D2: the refusal must carry the exact remedy phrase "draw the missing states" (in the wireframe register, then re-mark): ' + r.stdout + r.stderr)
  const journeyRecord = statusJson(dir).journeys[JOURNEY]
  assert.strictEqual(journeyRecord === undefined || journeyRecord.drawn == null, true,
    'a refused journey-drawn must never record journeys.onboarding.drawn — a session must not believe the journey was drawn when the states check blocked it: ' + JSON.stringify(journeyRecord))
})

// ---------------------------------------------------------------------------
// AC-20260906-05-4
// ---------------------------------------------------------------------------
// TDD red: the WIREFRAMES "draw journey <j>" step's Then: block carries no states line today.
test('AC-20260906-05-4: the bare driver\'s "draw journey <j>" step Then: block gains a line naming the empty/loading/error states and the data-no-state opt-out', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at the WIREFRAMES draw-journey step must exit 0: ' + r.stdout + r.stderr)
  const thenIdx = r.stdout.indexOf('Then:')
  assert.ok(thenIdx > -1, 'the printed draw-journey step must carry a "Then:" block for this assertion to be meaningful: ' + r.stdout)
  const thenBlock = r.stdout.slice(thenIdx)
  assert.match(thenBlock, /states: empty, loading, error on every screen/,
    'D3: the draw step\'s Then: block must gain a line naming "states: empty, loading, error on every screen" — without it a session drawing wireframes has no prompt to add the gray states: ' + r.stdout)
  assert.match(thenBlock, /data-no-state/,
    'D3: the draw step\'s Then: block must gain a line naming the data-no-state opt-out, or a session with a genuinely state-less screen has no documented escape: ' + r.stdout)
})

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
