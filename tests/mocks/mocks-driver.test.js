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
  decideLook,
  advanceToShapePicked, advanceToKitSigned, advanceToCanonWritten, advanceToJourneyApproved, advanceToApproved,
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
// Split under specs/20260906/01-ac-drift-doctor-check.md D11 (per-file 45 s budget, specs/20260903/06-test-suite-critical-path.md): the second half lived in mocks-driver-2.test.js; test logic unchanged.
//
// Split again under specs/20260906/05-gray-states-on-every-wireframe.md D7 (per-file 45 s budget,
// specs/20260903/07-test-file-budget-guard.md): the AC-20260906-02-1..-4 and AC-20260906-03-2/-8
// tests moved verbatim to mocks-driver-3.test.js (not -2 — that name is already the D11 shard
// above, deviation recorded); test logic unchanged.

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
  // specs/20260907/07-mocks-retires-theme.md D7 fixture repair: marks.themePicked is retired
  // from freshStatus outright (never null, simply absent) — kitSignedOff (specs/20260907/04 D1)
  // joins the checked set here for the first time too.
  for (const key of ['seedDone', 'shapePicked', 'canonWritten', 'kitSignedOff', 'approved']) {
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
test('AC-20260908-07-12 (retag of AC-20260902-07-6) / AC-20260905-02-18 / AC-20260906-05-5: journey-drawn refuses a missing or non-conforming label and records drawn; journey-approved refuses before drawn or on a blocked gate even with a decided stop present; both marks CONTINUE TO accept once every screen declares its three gray states (the fixture default)', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)

  writeWireframe(dir, LABELS[0], { to: LABELS[1] })
  // LABELS[1] ("invite") deliberately missing
  let r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse when a declared label\'s file does not exist: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the refusal must name the missing label "' + LABELS[1] + '"')

  // specs/20260910/02-click-to-advance-and-real-records.md D6: each screen's control points at
  // the journey's next label — LABELS' terminal screen (session-live) gets none.
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })

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
  writeWireframe(dir, LABELS[1], { to: LABELS[2] }) // restore baseline before isolating the next violation
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
  writeWireframe(dir, LABELS[1], { to: LABELS[2] }) // restore baseline before isolating the next violation
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

  writeWireframe(dir, LABELS[1], { to: LABELS[2] })
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
  // specs/20260910/02-click-to-advance-and-real-records.md D2: the edge check runs BEFORE
  // check --states, so every screen still needs its data-to control here or the edge refusal
  // would preempt the states refusal this test pins.
  for (let i = 0; i < LABELS.length; i++) {
    writeWireframe(dir, LABELS[i], Object.assign({ to: LABELS[i + 1] }, LABELS[i] === 'consent' ? { states: [] } : {}))
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
// AC-20260906-05-6
// ---------------------------------------------------------------------------
// specs/20260906/05-gray-states-on-every-wireframe.md D2 promises the states refusal at BOTH
// marks; AC-20260906-05-3 above delivers only the journey-drawn arm, so the journey-approved
// arm shipped carried by an AC that asserts a neighbouring fact. Replay rp_d8fecf9d5bce
// weakened this arm's comparison to `> 1` — design-atlas.js check exits 1 on violations, so the
// refusal became unreachable — and every deterministic leg stayed green. This test is that
// mutation run as a pin: it fails against `> 1` and passes against `!== 0`.
//
// The journey is fully drawn and approvable FIRST, then one screen loses its states: that makes
// the refusal below differ from AC-20260906-05-5's accepting arm in exactly one thing, so an
// exit 2 can only have come from the states check. The capture config and the decided stop are
// written for the same reason — the states check runs ahead of the render gate and the stop
// decision, and without them a refusal could be either of those instead.
test('AC-20260906-05-6: journey-approved refuses when a screen has lost its three gray states since journey-drawn, naming the file, every missing state in empty/loading/error order, and the draw-the-missing-states remedy, and never records journeys.onboarding.approved', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })

  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(drawn.status, 0,
    'the journey must be genuinely drawn before this test can isolate the approval-time arm — a refusal here would make the assertions below meaningless: ' + drawn.stdout + drawn.stderr)

  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:' + JOURNEY, 'approve', { by: 'jj' })

  // the redraw D2's Rationale names: a screen loses a state between drawn and approved
  writeWireframe(dir, 'consent', { states: [], to: 'session-live' })

  const r = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2,
    'D2: journey-approved must refuse (exit 2) when check --states finds a screen that has lost its states since journey-drawn — otherwise a redrawn screen silently reaches the render gate and the approved mark without them: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /consent\.html: missing state\(s\) empty, loading, error/,
    'D1/D2: the approval-time refusal must name consent.html and every missing state in empty, loading, error order — a partial list leaves the author guessing which states to redraw: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /draw the missing states/,
    'D2: the approval-time refusal must carry the exact remedy phrase "draw the missing states", the same remedy the drawn arm gives: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved == null, true,
    'a refused journey-approved must never record journeys.onboarding.approved — a session must not believe the journey was approved when the states check blocked it: ' + JSON.stringify(statusJson(dir).journeys[JOURNEY]))
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
// AC-20260907-07-7
// ---------------------------------------------------------------------------
test('AC-20260907-07-7: a cold --root creates a status.json whose marks object has exactly seedDone/shapePicked/canonWritten/kitSignedOff/approved (each null) and carries no top-level theme or directions key; a pre-existing status.json carrying theme/marks.themePicked/directions writes none of those three keys on its next save', () => {
  const dir = tmpdir('mocks-driver')
  bare(dir)
  const cold = statusJson(dir)
  assert.deepStrictEqual(Object.keys(cold.marks).sort(),
    ['approved', 'canonWritten', 'kitSignedOff', 'seedDone', 'shapePicked'].sort(),
    'D7: a cold status.json\'s marks object must carry exactly these five keys, themePicked dropped outright: ' + JSON.stringify(cold.marks))
  for (const key of Object.keys(cold.marks)) {
    assert.strictEqual(cold.marks[key], null, 'mark "' + key + '" must be null on a cold status.json: ' + JSON.stringify(cold.marks))
  }
  assert.strictEqual('theme' in cold, false, 'D7: a cold status.json must carry no top-level "theme" key at all: ' + JSON.stringify(cold))
  assert.strictEqual('directions' in cold, false, 'D7: a cold status.json must carry no top-level "directions" key at all: ' + JSON.stringify(cold))

  const dir2 = tmpdir('mocks-driver')
  advanceToShapePicked(dir2)
  const legacy = statusJson(dir2)
  legacy.theme = 'quiet'
  legacy.marks.themePicked = '2026-09-01T00:00:00Z'
  legacy.directions = { quiet: { composed: '2026-09-01T00:00:00Z' } }
  fs.writeFileSync(statusPath(dir2), JSON.stringify(legacy, null, 2) + '\n')

  advanceToKitSigned(dir2)
  writeCanon(dir2)
  const canonWritten = mark(dir2, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted so a real save happens after the legacy fields are hand-written: ' + canonWritten.stdout + canonWritten.stderr)

  const written = statusJson(dir2)
  assert.strictEqual('theme' in written, false, 'D7: the next save after a legacy status.json carrying "theme" must drop that key entirely, never null it: ' + JSON.stringify(written))
  assert.strictEqual(written.marks.themePicked, undefined, 'D7: the next save must drop marks.themePicked entirely: ' + JSON.stringify(written.marks))
  assert.strictEqual('directions' in written, false, 'D7: the next save must drop the top-level "directions" key entirely: ' + JSON.stringify(written))
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D1: KIT sits between SHAPES and WIREFRAMES.
// ---------------------------------------------------------------------------
test('AC-20260907-04-1: WHEN the driver derives state on a root whose marks.shapePicked is set with a valid shape file and marks.kitSignedOff is null THE SYSTEM SHALL print KIT, and once marks.kitSignedOff is set with marks.canonWritten null it SHALL print WIREFRAMES', () => {
  const dir = tmpdir('mocks-driver')
  advanceToShapePicked(dir)
  const kit = stateOf(dir)
  assert.strictEqual(kit.status, 0, 'a bare --state on a shape-picked root must exit 0: ' + kit.stdout + kit.stderr)
  assert.strictEqual(kit.stdout.trim(), 'KIT',
    'D1: shapePicked valid + kitSignedOff null must derive KIT, the new step inserted between SHAPES and WIREFRAMES: ' + kit.stdout)

  advanceToKitSigned(dir)
  const wireframes = stateOf(dir)
  assert.strictEqual(wireframes.status, 0, 'a bare --state once kit-signed is accepted must exit 0: ' + wireframes.stdout + wireframes.stderr)
  assert.strictEqual(wireframes.stdout.trim(), 'WIREFRAMES',
    'D1: kitSignedOff set + canonWritten null must derive WIREFRAMES: ' + wireframes.stdout)
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D10: --reopen kit / the widened --reopen refusal.
// ---------------------------------------------------------------------------
test('AC-20260907-04-13: --reopen kit on an APPROVED root prints the exact D10 invalidated line, clears marks.kitSignedOff/marks.approved/decider, leaves every journeys[j].approved unchanged, and derives KIT; --reopen bogus exits non-zero naming the widened target list', () => {
  const dir = tmpdir('mocks-driver')
  advanceToApproved(dir)
  const journeyApprovedBefore = statusJson(dir).journeys[JOURNEY].approved
  assert.ok(journeyApprovedBefore,
    'test setup requires journeys.<j>.approved to be recorded before reopening kit, or the "leave journeys unchanged" assertion below is vacuous')

  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'kit'])
  assert.strictEqual(r.status, 0, '--reopen kit must exit 0 on an APPROVED root: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /↩ reopened kit — invalidated: kit, approved\(all\)/,
    'the reopen output must print the exact D10 invalidated line: ' + r.stdout)

  const status = statusJson(dir)
  assert.strictEqual(status.marks.kitSignedOff, null, '--reopen kit must clear marks.kitSignedOff')
  assert.strictEqual(status.marks.approved, null, '--reopen kit must clear marks.approved')
  assert.strictEqual(status.decider, null, '--reopen kit must clear decider')
  assert.strictEqual(status.journeys[JOURNEY].approved, journeyApprovedBefore,
    '--reopen kit must never touch journeys[j].approved — a kit change does not un-approve a journey by fiat (D10 rationale)')

  const derived = stateOf(dir)
  assert.strictEqual(derived.stdout.trim(), 'KIT', 'the next derivation after --reopen kit must land on KIT')

  const bogus = runNode(SCRIPT, ['--root', dir, '--reopen', 'bogus'])
  assert.notStrictEqual(bogus.status, 0, '--reopen bogus must exit non-zero: ' + bogus.stdout + bogus.stderr)
  // specs/20260907/07-mocks-retires-theme.md D6/AC-20260907-07-4 narrowed this literal: "theme"
  // dropped out of the --reopen target list entirely (there is no mark left for it to clear).
  // specs/20260907/08-walk-critic.md D6/AC-20260907-08-8 widens it again: walk:<j> joins the
  // list as the second target replacing --reopen theme.
  assert.match(bogus.stderr + bogus.stdout, /--reopen must be journey:<j>, walk:<j>, shapes, or kit/,
    'the refusal must name the exact live target list — an unknown --reopen target must still name every live target, kit and walk:<j> included and theme dropped: ' + bogus.stdout + bogus.stderr)
})

// ---------------------------------------------------------------------------
// specs/20260907/04-kit-canon-family.md D1: a pre-spec checkpointed root carries no
// marks.kitSignedOff key at all — the migration hazard is a state derivation that traps
// instead of advancing.
// ---------------------------------------------------------------------------
test('AC-20260907-04-15: WHEN the driver derives state on a root checkpointed under the pre-spec shape (shapePicked/canonWritten set, every journey approved, marks.approved null, and no kitSignedOff key at all) THE SYSTEM SHALL CONTINUE TO advance rather than trap — it SHALL print KIT and SHALL NOT throw', () => {
  const dir = tmpdir('mocks-driver')
  // specs/20260907/07-mocks-retires-theme.md: the mocks state machine has no theme pick, so
  // canonWritten + every journey approved is reached directly via advanceToJourneyApproved.
  advanceToJourneyApproved(dir) // canonWritten + every journey approved, marks.approved still null

  const raw = fs.readFileSync(statusPath(dir), 'utf8')
  const status = JSON.parse(raw)
  delete status.marks.kitSignedOff
  assert.ok(!('kitSignedOff' in status.marks),
    'test setup requires the legacy fixture to carry no kitSignedOff key at all, or this is not exercising the migration hazard')
  fs.writeFileSync(statusPath(dir), JSON.stringify(status, null, 2) + '\n')

  const r = stateOf(dir)
  assert.strictEqual(r.status, 0, 'deriving state on a legacy pre-spec root must not throw: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'KIT',
    'a legacy root with shapePicked/canonWritten already set but no kitSignedOff key at all must derive KIT, continuing to advance rather than trapping: ' + r.stdout)
})
