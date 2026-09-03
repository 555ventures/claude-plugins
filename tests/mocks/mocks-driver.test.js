'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260902/07-mocks-command-driver.md (TDD red): spec/scripts/mocks-driver.js does not
// exist yet — every test below is red until the driver lands. AC-20260902-07-1 .. -11 and -13.
// Fixtures build the SEED->APPROVED chain through the real binary (advanceTo* helpers), the way
// tests/genesis/genesis-driver.test.js drives genesis-driver.js, so each later-stage test's
// setup is itself an executed proof that every earlier mark's contract holds.

const SCRIPT = 'scripts/mocks-driver.js'

const FACT_KEYS = [
  'primary-surface', 'platforms-horizon', 'tenancy', 'offline', 'realtime', 'ai-in-loop',
  'residency', 'payer', 'day-one-integrations', 'scale-outage', 'vendor-limits', 'retention',
  'legal-floor',
]
const JOURNEY = 'onboarding'
const LABELS = ['signin', 'invite', 'consent', 'session-live']
const DENSE = 'session-live'

function bare(dir, extra = []) { return runNode(SCRIPT, ['--root', dir, ...extra]) }
function mark(dir, name, extra = []) { return runNode(SCRIPT, ['--root', dir, '--mark', name, ...extra]) }
function stateOf(dir) { return runNode(SCRIPT, ['--root', dir, '--state']) }
function ledgerCmd(dir, sub, extra = []) { return runNode(SCRIPT, ['--root', dir, 'ledger', sub, ...extra]) }

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }

function statusPath(dir) { return path.join(dir, 'design/mocks/status.json') }
function statusJson(dir) { return JSON.parse(fs.readFileSync(statusPath(dir), 'utf8')) }

function writeTargets(dir) {
  writeJSON(path.join(dir, 'design/targets.json'), {
    schemaVersion: 1, themes: ['light'],
    viewports: [{ name: 'mobile', width: 390, height: 844 }],
  })
}
function writeResearchBrief(dir) {
  writeFile(path.join(dir, 'docs/design/research-brief.md'),
    '# Research brief\n\n## Findings\nSynthetic test brief for mocks-driver.test.js.\n')
}

function writeSeed(dir, { journeyLabels = LABELS, journeyName = JOURNEY, dense = DENSE } = {}) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for tests.
Built for QA engineers running the driver's test suite.
It must let a user complete a short onboarding.

## Facts
${factLines}

## References
- none

## Journeys
### ${journeyName}
Mika (dispatch lead) signs in, sends an invite, gathers consent, and reaches the live session.
\`\`\`surfaces
${journeyLabels[0]} -> ${journeyLabels[1]}
${journeyLabels[1]} -> ${journeyLabels[2]}
${journeyLabels[2]} -> ${journeyLabels[3]}
\`\`\`

## Dense screen
- ${dense}
`)
}

// D3: confirms all 13 seed facts as said-by-user/confirmed product rows P1..P13, in the same
// order the fact keys are declared, so writeSeed()'s `- <key>: P<n>` lines always resolve.
function confirmFacts(dir) {
  FACT_KEYS.forEach((key, i) => {
    const r = ledgerCmd(dir, 'add', [
      '--id', 'P' + (i + 1), '--step', 'SEED', '--kind', 'product',
      '--claim', key, '--tag', 'said-by-user', '--status', 'confirmed',
    ])
    assert.strictEqual(r.status, 0,
      'test setup requires `ledger add` to accept a said-by-user/confirmed row for fact "' + key + '": ' + r.stderr)
  })
}

function writeCanon(dir) {
  writeFile(path.join(dir, 'design/mocks/canon.md'), `## Shells
none

## Primitives
- **Button** — primary action

## Rules
- One screen at a time.

## Grounding
This canon is binding: see docs/design/research-brief.md for the research basis.
`)
}

function writeWireframe(dir, label, { stateBtn = '' } = {}) {
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + stateBtn + '</main>\n')
}

function writeThemeDirection(dir, kebab, labels) {
  writeFile(path.join(dir, 'design/theme', kebab, 'tokens.css'), ':root{--text-body:#111}\n')
  for (const label of labels) {
    writeFile(path.join(dir, 'design/theme', kebab, label + '.html'),
      '<link rel="stylesheet" href="tokens.css">\n' +
      '<main data-screen-label="' + label + '" data-status="sketch">' + label + '</main>\n')
  }
}

function writeSkinned(dir, labels, status = 'sketch') {
  for (const label of labels) {
    writeFile(path.join(dir, 'design/mocks', label + '.html'),
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<link rel="stylesheet" href="../tokens.css">\n' +
      '<style>* { box-sizing: border-box; }</style>\n' +
      '<main data-screen-label="' + label + '" data-status="' + status + '">' + label + '</main>\n')
  }
}

// ---------------------------------------------------------------------------
// Chained setup — each advanceTo* runs the REAL binary through the prior marks and asserts each
// is accepted, so a later-stage test's fixture is itself an executed proof of the earlier ACs.
// ---------------------------------------------------------------------------
function advanceToSeedDone(dir) {
  bare(dir) // cold-root creation
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'test setup requires seed-done to be accepted on a fully valid seed: ' + r.stderr)
  return r
}

function advanceToShapePicked(dir, chosen = 'calm', others = ['bold']) {
  advanceToSeedDone(dir)
  for (const k of [chosen, ...others]) {
    writeFile(path.join(dir, 'design/shapes', k + '.html'),
      '<main data-screen-label="' + DENSE + '" data-shape="' + k + '">' + k + '</main>\n')
  }
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: ' + chosen,
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', others.join(', '),
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the shape ledger row to be accepted: ' + ledgerR.stderr)
  const r = mark(dir, 'shape-picked', ['--shape', chosen])
  assert.strictEqual(r.status, 0, 'test setup requires shape-picked to be accepted once 2+ shapes exist and the ledger row confirms the pick: ' + r.stderr)
  return r
}

function advanceToCanonWritten(dir) {
  advanceToShapePicked(dir)
  writeCanon(dir)
  const r = mark(dir, 'canon-written')
  assert.strictEqual(r.status, 0, 'test setup requires canon-written to be accepted on a valid canon.md with no existing mocks: ' + r.stderr)
  return r
}

function advanceToJourneyApproved(dir, journeyName = JOURNEY, labels = LABELS) {
  advanceToCanonWritten(dir)
  for (const label of labels) writeWireframe(dir, label)
  const drawn = mark(dir, 'journey-drawn', ['--journey', journeyName])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted once every label of the journey conforms to D6: ' + drawn.stderr)
  const approved = mark(dir, 'journey-approved', ['--journey', journeyName])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted once the journey is drawn and the ledger gate is open: ' + approved.stderr)
  return approved
}

function advanceToDirectionComposed(dir, kebab, labels, ledgerId) {
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', ledgerId, '--step', 'THEME', '--kind', 'product',
    '--claim', 'theme-directions: ' + kebab, '--tag', 'said-by-user', '--status', 'confirmed',
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions ledger row to be accepted: ' + ledgerR.stderr)
  writeThemeDirection(dir, kebab, labels)
  const r = mark(dir, 'direction-composed', ['--direction', kebab])
  assert.strictEqual(r.status, 0, 'test setup requires direction-composed to be accepted for "' + kebab + '" once 3+ approved labels (incl. the dense screen) are composed under design/theme/' + kebab + ': ' + r.stderr)
  return r
}

function advanceToThemePicked(dir, chosen = 'quiet', other = 'warm') {
  advanceToJourneyApproved(dir)
  advanceToDirectionComposed(dir, chosen, [DENSE, LABELS[0], LABELS[1]], 'P15')
  advanceToDirectionComposed(dir, other, [DENSE, LABELS[0], LABELS[2]], 'P16')
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: ' + chosen,
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', other,
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-pick ledger row to be accepted: ' + ledgerR.stderr)
  const r = mark(dir, 'theme-picked', ['--direction', chosen])
  assert.strictEqual(r.status, 0, 'test setup requires theme-picked to be accepted once 2+ directions are composed and the theme row rejects every other one: ' + r.stderr)
  return r
}

function advanceToSkinned(dir, journeyName = JOURNEY, labels = LABELS) {
  advanceToThemePicked(dir)
  writeSkinned(dir, labels)
  const r = mark(dir, 'journey-skinned', ['--journey', journeyName])
  assert.strictEqual(r.status, 0, 'test setup requires journey-skinned to be accepted once every screen links only design/tokens.css: ' + r.stderr)
  return r
}

function advanceToReviewed(dir, journeyName = JOURNEY) {
  advanceToSkinned(dir)
  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted with a decider name: ' + opened.stderr)
  const r = mark(dir, 'journey-reviewed', ['--journey', journeyName])
  assert.strictEqual(r.status, 0, 'test setup requires journey-reviewed to be accepted once review is opened and the journey is skinned: ' + r.stderr)
  return r
}

function advanceToApproved(dir, labels = LABELS) {
  advanceToReviewed(dir)
  writeSkinned(dir, labels, 'approved')
  const r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'test setup requires approved to be accepted once every screen is stamped approved, every journey is reviewed, and the matrix check passes: ' + r.stderr)
  return r
}

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
  for (const key of ['seedDone', 'shapePicked', 'canonWritten', 'themePicked', 'reviewOpened', 'approved']) {
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
test('AC-20260902-07-6: journey-drawn refuses a missing or non-conforming label and records drawn; journey-approved refuses before drawn or on a blocked gate', () => {
  const dir = tmpdir('mocks-driver')
  advanceToCanonWritten(dir)

  writeWireframe(dir, LABELS[0])
  // LABELS[1] ("invite") deliberately missing
  let r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse when a declared label\'s file does not exist: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the refusal must name the missing label "' + LABELS[1] + '"')

  for (const label of LABELS) writeWireframe(dir, label)
  // corrupt one file: ratified status is not a valid sketch stage, and no wire tokens link
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[1] + '.html'),
    '<main data-screen-label="' + LABELS[1] + '" data-status="ratified">no tokens link</main>\n')
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-drawn must refuse a non-conforming file (wrong status or missing wire/tokens.css link): ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[1]), 'the refusal must carry the failing label')

  writeWireframe(dir, LABELS[1])
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-drawn must be accepted once every label of the journey conforms to D6: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].drawn !== null, true, 'an accepted journey-drawn must record journeys.<j>.drawn')

  // journey-approved before any draw, on a fresh journey name that was never drawn
  const dir2 = tmpdir('mocks-driver')
  advanceToCanonWritten(dir2)
  const early = mark(dir2, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(early.status, 2, 'journey-approved must refuse before journey-drawn has been recorded: ' + early.stdout + early.stderr)

  const approved = mark(dir, 'journey-approved', ['--journey', JOURNEY])
  assert.strictEqual(approved.status, 0, 'journey-approved must be accepted once drawn and the ledger gate is open: ' + approved.stdout + approved.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].approved !== null, true, 'an accepted journey-approved must record journeys.<j>.approved')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-7
// ---------------------------------------------------------------------------
// Deviation (recorded in specs/20260902/07-mocks-command-driver.deviations.md): the spec names
// a "theme-directions"/"theme" product ledger ROW without pinning how the driver identifies it
// (ledger ids are ^[A-Z]+\d+[a-z]?$, so the row cannot literally be id "theme-directions"). This
// fixture writes said-by-user/confirmed rows whose `claim` cell carries the literal
// "theme-directions: <kebab>" / "theme: <kebab>" text as the most literal reading of D8 — an
// implementation reading a different cell/shape for this row is a legitimate in-bounds choice
// the spec leaves open, not a locked Decision this test overrides.
test('AC-20260902-07-7: direction-composed refuses too few screens; theme-picked refuses under 2 directions or an incomplete rejection, and copies tokens on acceptance', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)

  writeThemeDirection(dir, 'quiet', [DENSE, LABELS[0]]) // only 2 screens, dense screen present
  const ledgerR = ledgerCmd(dir, 'add', ['--id', 'P15', '--step', 'THEME', '--kind', 'product', '--claim', 'theme-directions: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the theme-directions row to be accepted: ' + ledgerR.stderr)
  let r = mark(dir, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(r.status, 2, 'direction-composed must refuse with only 2 composed screens (the floor is 3, incl. the dense screen): ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /2/, 'the refusal must name the actual screen count')

  writeThemeDirection(dir, 'quiet', [DENSE, LABELS[0], LABELS[1]])
  r = mark(dir, 'direction-composed', ['--direction', 'quiet'])
  assert.strictEqual(r.status, 0, 'direction-composed must be accepted with 3 approved screens including the dense screen: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).directions.quiet.composed !== null, true, 'an accepted direction-composed must record directions.quiet.composed')

  let picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 2, 'theme-picked must refuse while only one direction is composed: ' + picked.stdout + picked.stderr)

  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[0], LABELS[2]], 'P16')
  const badRejectRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed'])
  assert.strictEqual(badRejectRow.status, 0, 'test setup requires the theme row (missing rejected cell) to be accepted: ' + badRejectRow.stderr)
  picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 2, 'theme-picked must refuse when the theme row\'s rejected cell omits a composed direction ("warm"): ' + picked.stdout + picked.stderr)
  assert.match(picked.stderr + picked.stdout, /warm/, 'the refusal must name the omitted composed direction "warm"')

  // D14's `ledger set` only rewrites status/tag, never `rejected` — so the fix for a
  // theme row missing its rejected cell is authoring it correctly the first time, exercised for
  // real via advanceToThemePicked's own helper below.
  const dir2 = tmpdir('mocks-driver')
  advanceToThemePicked(dir2, 'quiet', 'warm')
  assert.strictEqual(fs.readFileSync(path.join(dir2, 'design/tokens.css'), 'utf8'),
    fs.readFileSync(path.join(dir2, 'design/theme/quiet/tokens.css'), 'utf8'),
    'theme-picked must copy design/theme/<k>/tokens.css to design/tokens.css byte-for-byte')
  assert.strictEqual(statusJson(dir2).state, 'SKIN', 'an accepted theme-picked must advance the derived state to SKIN')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-8
// ---------------------------------------------------------------------------
test('AC-20260902-07-8: journey-skinned refuses before theme-picked and while a screen still links wire/, and records skinned once every screen links only tokens.css', () => {
  const dir = tmpdir('mocks-driver')
  advanceToJourneyApproved(dir)
  const early = mark(dir, 'journey-skinned', ['--journey', JOURNEY])
  assert.strictEqual(early.status, 2, 'journey-skinned must refuse before theme-picked has been recorded: ' + early.stdout + early.stderr)

  advanceToDirectionComposed(dir, 'quiet', [DENSE, LABELS[0], LABELS[1]], 'P15')
  advanceToDirectionComposed(dir, 'warm', [DENSE, LABELS[0], LABELS[2]], 'P16')
  const themeRow = ledgerCmd(dir, 'add', ['--id', 'P17', '--step', 'THEME', '--kind', 'product', '--claim', 'theme: quiet', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'warm'])
  assert.strictEqual(themeRow.status, 0, 'test setup requires the theme row to be accepted: ' + themeRow.stderr)
  const picked = mark(dir, 'theme-picked', ['--direction', 'quiet'])
  assert.strictEqual(picked.status, 0, 'test setup requires theme-picked to be accepted: ' + picked.stdout + picked.stderr)

  writeSkinned(dir, LABELS)
  // leave one file still linking wire/wire.css
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'),
    '<link rel="stylesheet" href="../wire/wire.css">\n<link rel="stylesheet" href="../tokens.css">\n' +
    '<main data-screen-label="' + LABELS[0] + '" data-status="sketch">' + LABELS[0] + '</main>\n')
  let r = mark(dir, 'journey-skinned', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2, 'journey-skinned must refuse while any screen still links a wire/ stylesheet: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[0]), 'the refusal must name the offending file')
  assert.match(r.stderr + r.stdout, /wire\//, 'the refusal must name the wire/ register still linked')

  writeSkinned(dir, LABELS)
  r = mark(dir, 'journey-skinned', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-skinned must be accepted once every screen links only ../tokens.css: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].skinned !== null, true, 'an accepted journey-skinned must record journeys.<j>.skinned')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-9
// ---------------------------------------------------------------------------
test('AC-20260902-07-9: journey-reviewed refuses before review-opened, naming the remedy; records reviewed once review is opened with a decider', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSkinned(dir)
  const early = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(early.status, 2, 'journey-reviewed must refuse before review-opened is recorded: ' + early.stdout + early.stderr)
  assert.match(early.stderr + early.stdout, /review-opened --decider/, 'the refusal must name the remedy command "review-opened --decider"')

  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'review-opened must be accepted with a decider name: ' + opened.stdout + opened.stderr)
  assert.strictEqual(statusJson(dir).decider, 'Ren', 'review-opened must record decider: "Ren" verbatim')

  const r = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0, 'journey-reviewed must be accepted once review is opened and the journey is skinned: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].reviewed !== null, true, 'an accepted journey-reviewed must record journeys.<j>.reviewed')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-10
// ---------------------------------------------------------------------------
test('AC-20260902-07-10: approved refuses a sketch-status screen or a failing matrix check, and records approved + APPROVED terminal state once every check holds', () => {
  const dir = tmpdir('mocks-driver')
  advanceToReviewed(dir)

  writeSkinned(dir, LABELS, 'approved')
  // leave one screen at sketch
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + LABELS[0] + '" data-status="sketch">' + LABELS[0] + '</main>\n')
  let r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2, 'approved must refuse while any design/mocks/*.html is still data-status="sketch": ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, new RegExp(LABELS[0]), 'the refusal must name the still-sketch file')

  // every screen approved, but strip the viewport meta so `check --matrix` fails
  writeSkinned(dir, LABELS, 'approved')
  fs.writeFileSync(path.join(dir, 'design/mocks', LABELS[0] + '.html'),
    '<link rel="stylesheet" href="../tokens.css">\n<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + LABELS[0] + '" data-status="approved">' + LABELS[0] + '</main>\n')
  r = mark(dir, 'approved')
  assert.strictEqual(r.status, 2, 'approved must refuse when `design-atlas.js check --matrix` fails: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /viewport/, 'the refusal must carry check\'s own stdout naming the missing viewport meta')

  writeSkinned(dir, LABELS, 'approved')
  r = mark(dir, 'approved')
  assert.strictEqual(r.status, 0, 'approved must be accepted once every screen is approved, every journey reviewed, and the matrix check passes: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).marks.approved !== null, true, 'an accepted approved mark must record marks.approved')
  assert.strictEqual(statusJson(dir).state, 'APPROVED', 'an accepted approved mark must stamp state: "APPROVED"')

  const rerun = bare(dir)
  assert.strictEqual(rerun.status, 0, 'a bare re-run at APPROVED must exit 0 and print the terminal step: ' + rerun.stdout + rerun.stderr)
  assert.match(rerun.stdout, /next: \/spec:genesis/, 'the terminal APPROVED step must print "next: /spec:genesis"')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-11
// ---------------------------------------------------------------------------
test('AC-20260902-07-11: --reopen journey clears that journey\'s marks and derives WIREFRAMES; --reopen theme clears theme + skin/review marks and derives THEME', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSkinned(dir)
  const opened = mark(dir, 'review-opened', ['--decider', 'Ren'])
  assert.strictEqual(opened.status, 0, 'test setup requires review-opened to be accepted: ' + opened.stderr)
  const reviewed = mark(dir, 'journey-reviewed', ['--journey', JOURNEY])
  assert.strictEqual(reviewed.status, 0, 'test setup requires journey-reviewed to be accepted: ' + reviewed.stderr)

  const beforeFiles = LABELS.map((l) => fs.readFileSync(path.join(dir, 'design/mocks', l + '.html'), 'utf8'))
  const r = runNode(SCRIPT, ['--root', dir, '--reopen', 'journey:' + JOURNEY])
  assert.strictEqual(r.status, 0, '--reopen journey:<j> must exit 0 on a real journey: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /↩ reopened journey:onboarding — invalidated:/, 'the reopen output must print the exact D11 prefix naming what was invalidated')
  assert.match(r.stdout, /skinned/, 'reopening a skinned+reviewed journey must list "skinned" among the invalidated marks')
  assert.match(r.stdout, /reviewed/, 'reopening a skinned+reviewed journey must list "reviewed" among the invalidated marks')

  const status = statusJson(dir)
  assert.strictEqual(status.journeys[JOURNEY].skinned, null, 'reopen must clear journeys.<j>.skinned')
  assert.strictEqual(status.journeys[JOURNEY].reviewed, null, 'reopen must clear journeys.<j>.reviewed')
  assert.ok(Array.isArray(status.reopens) && status.reopens.length === 1, 'reopen must append exactly one entry to status.reopens')

  const afterFiles = LABELS.map((l) => fs.readFileSync(path.join(dir, 'design/mocks', l + '.html'), 'utf8'))
  assert.deepStrictEqual(beforeFiles, afterFiles, 'reopen must never delete or modify any file on disk — only status.json marks change')

  const derived = stateOf(dir)
  assert.strictEqual(derived.stdout.trim(), 'WIREFRAMES', 'the next bare/--state derivation after reopening the only journey must land on WIREFRAMES')

  const dir2 = tmpdir('mocks-driver')
  advanceToSkinned(dir2)
  const themeReopen = runNode(SCRIPT, ['--root', dir2, '--reopen', 'theme'])
  assert.strictEqual(themeReopen.status, 0, '--reopen theme must exit 0: ' + themeReopen.stdout + themeReopen.stderr)
  const status2 = statusJson(dir2)
  assert.strictEqual(status2.theme, null, '--reopen theme must clear status.theme')
  assert.strictEqual(status2.journeys[JOURNEY].skinned, null, '--reopen theme must clear every journey\'s skinned mark')
  const derived2 = stateOf(dir2)
  assert.strictEqual(derived2.stdout.trim(), 'THEME', 'the next derivation after --reopen theme must land on THEME')
})

// ---------------------------------------------------------------------------
// AC-20260902-07-13
// ---------------------------------------------------------------------------
// PATH-stub npx binaries: a bash script on a synthetic PATH ahead of the real one, so the driver's
// own `npx --no-install playwright …` calls hit the stub instead of the real CLI (no network, no
// real Playwright install required in this suite).
function stubNpx(dir, { exitCode = 0, logArgvTo = null } = {}) {
  const binDir = path.join(dir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const npxPath = path.join(binDir, 'npx')
  const log = logArgvTo ? `echo "$@" >> "${logArgvTo}"\n` : ''
  fs.writeFileSync(npxPath, `#!/usr/bin/env bash\n${log}exit ${exitCode}\n`)
  fs.chmodSync(npxPath, 0o755)
  return binDir + path.delimiter + process.env.PATH
}

test('AC-20260902-07-13: look-probe refuses on a failing npx naming the install remedy; a bare run at SHAPES refuses the same way unless look-via browser was recorded; look invokes the screenshot CLI and deletes its sibling', () => {
  const dir = tmpdir('mocks-driver')
  advanceToSeedDone(dir) // now at SHAPES

  const failingPath = stubNpx(dir, { exitCode: 1 })
  const probe = runNode(SCRIPT, ['--root', dir, 'look-probe'], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(probe.status, 2, 'look-probe must exit 2 when the npx CLI is unreachable: ' + probe.stdout + probe.stderr)
  assert.match(probe.stderr + probe.stdout, /npx playwright install chromium/, 'the refusal must name the exact install remedy')

  const bareEnv = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(bareEnv.status, 2, 'a bare run reaching SHAPES must refuse the same way when the look probe fails and look-via is not "browser": ' + bareEnv.stdout + bareEnv.stderr)
  assert.match(bareEnv.stderr + bareEnv.stdout, /npx playwright install chromium/, 'the bare-run refusal must carry the same install remedy')

  const viaBrowser = runNode(SCRIPT, ['--root', dir, 'look-via', 'browser'], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(viaBrowser.status, 0, 'look-via browser must be accepted (a browser MCP path is declared, not probed): ' + viaBrowser.stdout + viaBrowser.stderr)
  assert.strictEqual(statusJson(dir).look, 'browser', 'look-via browser must record status.look = "browser"')
  const bareAfter = runNode(SCRIPT, ['--root', dir], { env: { ...process.env, PATH: failingPath } })
  assert.strictEqual(bareAfter.status, 0, 'once look is "browser", a bare run must print the step instead of refusing on the unreachable probe: ' + bareAfter.stdout + bareAfter.stderr)

  // look with a stub npx exiting 0 that logs its argv
  const dir2 = tmpdir('mocks-driver')
  advanceToSeedDone(dir2)
  writeFile(path.join(dir2, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<main data-screen-label="a" data-status="sketch"><button data-state-btn="busy">Busy</button></main>\n')
  const argvLog = path.join(dir2, 'npx-argv.log')
  const okPath = stubNpx(dir2, { exitCode: 0, logArgvTo: argvLog })
  const outPng = path.join(dir2, 'out.png')
  const looked = runNode(SCRIPT, ['--root', dir2, 'look', 'a', '--state', 'busy', '--out', outPng],
    { env: { ...process.env, PATH: okPath } })
  assert.strictEqual(looked.status, 0, 'look must exit 0 when the screenshot CLI succeeds: ' + looked.stdout + looked.stderr)
  const argv = fs.readFileSync(argvLog, 'utf8')
  assert.match(argv, /screenshot --viewport-size=390,844/, 'look must invoke `playwright screenshot --viewport-size=390,844` from the first declared viewport')
  assert.match(argv, /file:\/\/.*\.look-a\.html/, 'look must pass a file:// URL to a generated .look-a.html sibling')
  assert.match(argv, new RegExp(outPng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'look must pass the requested --out path as the screenshot destination')
  const leftoverLooks = fs.readdirSync(path.join(dir2, 'design/mocks')).filter((f) => f.startsWith('.look-'))
  assert.deepStrictEqual(leftoverLooks, [], 'the generated .look-a.html sibling must be deleted after the screenshot runs, leaving no trace on disk')
})
