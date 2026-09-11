'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, tmpdir, SPEC } = require('../helpers')
const {
  SCRIPT, DENSE,
  mark, stateOf, bare, ledgerCmd, statusPath, statusJson,
  writeKitCanon, writeThemeKit, themeDirectionsRow,
  writeFile, writeCustomerRecords, writeTargets, writeResearchBrief, writeCanon, writeWireframe,
  confirmFacts, decideLook, freePort, startServe, stopServe,
  writeCaptureConfig, writeFixtureCapture,
  advanceToJourneyWalked, advanceToThemePicked, advanceToApproved,
  FACT_KEYS,
} = require('./mocks-driver-fixtures')

// specs/20260910/04-theme-before-the-client-walk.md (ADR-0013) — the second half of the theme
// family: D2's role-completeness leg on `composeViolations`, D3's THEME state (reinstated between
// WALK and CLIENT, the legacy no-stop path), D4's `theme shortlist`, and D6's `--mark theme-picked`
// (the `theme adopt` body verbatim, but a mocks-state mark this time). TDD red: mocks-driver.js
// has none of this on the pre-image — `theme compose` runs no role check, `deriveState` still
// lands CLIENT straight off WALK, `theme shortlist`/`--mark theme-picked --direction` are unknown,
// and `--reopen theme` is not one of the four accepted `--reopen` targets.

const KIT_PRIMITIVES = [{ key: 'sheet', purpose: 'a modal panel for one focused task' }]

// AC-20260910-04-2
test('AC-20260910-04-2: theme compose refuses (exit 2) a direction whose tokens.css omits one or more of the eleven wire roles, naming every missing role, and accepts once all eleven are re-declared', () => {
  const dir = tmpdir('mocks-driver-theme-2')
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'ink', KIT_PRIMITIVES) // writes a full eleven-role tokens.css by default
  themeDirectionsRow(dir, 'ink', 'P90')

  const tokensPath = path.join(dir, 'design/theme/ink/tokens.css')
  const full = fs.readFileSync(tokensPath, 'utf8')
  const dropped = full.replace('--ring:#999;', '').replace('--shadow:0 1px 2px rgba(0,0,0,.1)}', '}')
  assert.notStrictEqual(dropped, full, 'test setup requires the --ring/--shadow removal to actually change the file, or the refusal assertion below is vacuous')
  fs.writeFileSync(tokensPath, dropped)

  const refused = runNode(SCRIPT, ['--root', dir, 'theme', 'compose', '--direction', 'ink'])
  assert.strictEqual(refused.status, 2, 'theme compose must refuse (exit 2) a candidate whose tokens.css omits wire roles: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr, /design\/theme\/ink\/tokens\.css: missing role\(s\) --ring, --shadow — every wire role must be re-valued/,
    'the refusal must name the exact D2 message with both missing roles: ' + JSON.stringify(refused.stderr))

  writeThemeKit(dir, 'ink', KIT_PRIMITIVES) // restore all eleven roles
  const accepted = runNode(SCRIPT, ['--root', dir, 'theme', 'compose', '--direction', 'ink'])
  assert.strictEqual(accepted.status, 0, 'theme compose must accept once every one of the eleven wire roles is re-declared: ' + accepted.stdout + accepted.stderr)
})

// AC-20260910-04-3
test('AC-20260910-04-3: state derives THEME once every journey is walked and marks.themePicked is unset (the bare step naming `theme shortlist`), CLIENT once themePicked is set, and `--reopen theme` clears themePicked/approved/decider, appends a reopens row, and re-derives THEME', () => {
  const dir = tmpdir('mocks-driver-theme-2')
  advanceToJourneyWalked(dir)

  const walked = stateOf(dir)
  assert.strictEqual(walked.stdout.trim(), 'THEME',
    'once every declared journey is walked and marks.themePicked is unset, state must derive THEME (ADR-0013 reinstates it between WALK and CLIENT): ' + walked.stdout + walked.stderr)

  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'the bare driver at THEME must exit 0: ' + step.stdout + step.stderr)
  assert.match(step.stdout, /theme shortlist/, 'the bare THEME step must print `theme shortlist`: ' + step.stdout)

  advanceToThemePicked(dir)
  const picked = stateOf(dir)
  assert.strictEqual(picked.stdout.trim(), 'CLIENT', 'once marks.themePicked is set, state must derive CLIENT: ' + picked.stdout + picked.stderr)

  advanceToApproved(dir)
  const before = statusJson(dir)
  assert.ok(before.marks.approved, 'test setup requires marks.approved to be set before reopening theme, or the "clears approved" assertion below is vacuous: ' + JSON.stringify(before.marks))
  assert.ok(before.decider, 'test setup requires status.decider to be set before reopening theme, or the "clears decider" assertion below is vacuous: ' + JSON.stringify(before.decider))
  const reopensBefore = (before.reopens || []).length

  const reopened = runNode(SCRIPT, ['--root', dir, '--reopen', 'theme'])
  assert.strictEqual(reopened.status, 0, '--reopen theme must be accepted: ' + reopened.stdout + reopened.stderr)

  const after = statusJson(dir)
  assert.strictEqual(after.marks.themePicked, null, '--reopen theme must clear marks.themePicked: ' + JSON.stringify(after.marks))
  assert.strictEqual(after.marks.approved, null, '--reopen theme must clear marks.approved: ' + JSON.stringify(after.marks))
  assert.strictEqual(after.decider, null, '--reopen theme must clear status.decider: ' + JSON.stringify(after.decider))
  assert.strictEqual((after.reopens || []).length, reopensBefore + 1, '--reopen theme must append exactly one row to status.reopens: ' + JSON.stringify(after.reopens))
  assert.strictEqual(after.reopens[after.reopens.length - 1].target, 'theme', 'the appended reopens row must name its target "theme": ' + JSON.stringify(after.reopens))
  assert.strictEqual(stateOf(dir).stdout.trim(), 'THEME', 'once themePicked is cleared, state must derive THEME again: ' + stateOf(dir).stdout)
})

// ---------------------------------------------------------------------------
// AC-20260910-04-4 needs a seed declaring TWO dense screens (the spec's own Contracts example:
// "session-live" and "roster") — writeSeed's default fixture carries exactly one, and its
// `## Dense screen` shape is shared with other test files, so a custom local seed/chain is built
// here rather than widening that shared helper for one AC.
// ---------------------------------------------------------------------------
function writeTwoDenseSeed(dir) {
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeCustomerRecords(dir)
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for the theme shortlist test.
Built for QA engineers running the driver's test suite.
It must let a user reach the live session, then see the roster.

## Facts
${factLines}

## References
- none

## Records
- customer: records/customer.json

## Journeys
### onboarding
Mika (dispatch lead) signs in and reaches the roster.
\`\`\`surfaces
session-live -> roster
\`\`\`

## Dense screen
- session-live
- roster
`)
}

function advanceToTwoDenseJourneyWalked(dir) {
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeTwoDenseSeed(dir)
  const seedDone = mark(dir, 'seed-done')
  assert.strictEqual(seedDone.status, 0, 'test setup requires seed-done to be accepted on the two-dense-screen seed: ' + seedDone.stderr)

  writeFile(path.join(dir, 'design/shapes/calm.html'), '<main data-screen-label="session-live" data-shape="calm">calm</main>\n')
  writeFile(path.join(dir, 'design/shapes/bold.html'), '<main data-screen-label="session-live" data-shape="bold">bold</main>\n')
  const shapeLedger = ledgerCmd(dir, 'add', ['--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: calm', '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'bold'])
  assert.strictEqual(shapeLedger.status, 0, 'test setup requires the shape ledger row to be accepted: ' + shapeLedger.stderr)
  decideLook(dir, 'shape-picked', 'pick', { pick: 'calm', others: ['bold'], by: 'jj' })
  const shapePicked = mark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapePicked.status, 0, 'test setup requires shape-picked to be accepted: ' + shapePicked.stderr)

  writeKitCanon(dir)
  decideLook(dir, 'kit-signed', 'approve', { by: 'jj' })
  const kitSigned = mark(dir, 'kit-signed')
  assert.strictEqual(kitSigned.status, 0, 'test setup requires kit-signed to be accepted: ' + kitSigned.stderr)

  writeCanon(dir)
  const canonWritten = mark(dir, 'canon-written')
  assert.strictEqual(canonWritten.status, 0, 'test setup requires canon-written to be accepted: ' + canonWritten.stderr)

  writeWireframe(dir, 'session-live', { to: 'roster' })
  writeWireframe(dir, 'roster', {})
  const drawn = mark(dir, 'journey-drawn', ['--journey', 'onboarding'])
  assert.strictEqual(drawn.status, 0, 'test setup requires journey-drawn to be accepted: ' + drawn.stderr)

  writeCaptureConfig(dir, writeFixtureCapture(dir))
  decideLook(dir, 'journey-approved:onboarding', 'approve', { by: 'jj' })
  const approved = mark(dir, 'journey-approved', ['--journey', 'onboarding'])
  assert.strictEqual(approved.status, 0, 'test setup requires journey-approved to be accepted: ' + approved.stderr)

  const walked = mark(dir, 'journey-walked', ['--journey', 'onboarding'])
  assert.strictEqual(walked.status, 0, 'test setup requires journey-walked to be accepted: ' + walked.stderr)
}

// AC-20260910-04-4
test('AC-20260910-04-4: theme shortlist --directions <a,b> --port <p> writes one open theme-picked stop with one candidate per (direction × dense screen) in seed dense-screen order, prints the /client/theme.html url and the pick reply line, and exits 0; one direction refuses (exit 2) naming "at least 2"; theme open is retired, exiting 2 naming theme shortlist', async () => {
  const dir = tmpdir('mocks-driver-theme-2')
  advanceToTwoDenseJourneyWalked(dir)
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'warm-paper', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'warm-paper', 'P90')
  writeThemeKit(dir, 'ink', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'ink', 'P91')

  const port = await freePort()
  let serveChild = null
  try {
    serveChild = await startServe(dir, port)
    const r = runNode(SCRIPT, ['--root', dir, 'theme', 'shortlist', '--directions', 'warm-paper,ink', '--port', String(port)])
    assert.strictEqual(r.status, 0, 'theme shortlist must exit 0 once two named directions both compose: ' + r.stdout + r.stderr)
    const lines = r.stdout.split('\n').filter((l) => l.trim() !== '')
    assert.strictEqual(lines.length, 2, 'theme shortlist must print exactly two stdout lines — the link and the fixed reply line: ' + JSON.stringify(r.stdout))
    assert.match(lines[0], /^🎨 ready for review — http:\/\/localhost:\d+\/client\/theme\.html#stop-P\d+$/,
      'theme shortlist must print the client theme.html url (D4\'s own --page /client/theme.html), not the atlas index: ' + JSON.stringify(lines[0]))
    assert.strictEqual(lines[1], 'Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>', 'a pick-kind stop must print the pick-shaped reply line: ' + JSON.stringify(lines[1]))

    const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
    const openStops = stops.filter((s) => s.status === 'open')
    assert.strictEqual(openStops.length, 1, 'theme shortlist must write exactly one open stop: ' + JSON.stringify(stops))
    const themeStop = openStops[0]
    assert.strictEqual(themeStop.kind, 'pick', 'the theme-picked stop must be a "pick" stop: ' + JSON.stringify(themeStop))
    assert.strictEqual(themeStop.key, 'theme-picked', 'the stop\'s key must be "theme-picked": ' + JSON.stringify(themeStop))
    assert.deepStrictEqual(themeStop.candidates, [
      { group: 'warm-paper', label: 'session-live', path: 'mocks/session-live.html?theme=warm-paper' },
      { group: 'warm-paper', label: 'roster', path: 'mocks/roster.html?theme=warm-paper' },
      { group: 'ink', label: 'session-live', path: 'mocks/session-live.html?theme=ink' },
      { group: 'ink', label: 'roster', path: 'mocks/roster.html?theme=ink' },
    ], 'D4: exactly one candidate per (direction × dense screen), directions in --directions order, dense screens in seed order: ' + JSON.stringify(themeStop.candidates))
  } finally {
    if (serveChild) await stopServe(serveChild)
  }

  const soloDir = tmpdir('mocks-driver-theme-2')
  advanceToTwoDenseJourneyWalked(soloDir)
  writeKitCanon(soloDir, KIT_PRIMITIVES)
  writeThemeKit(soloDir, 'warm-paper', KIT_PRIMITIVES)
  themeDirectionsRow(soloDir, 'warm-paper', 'P90')
  const solo = runNode(SCRIPT, ['--root', soloDir, 'theme', 'shortlist', '--directions', 'warm-paper'])
  assert.strictEqual(solo.status, 2, 'theme shortlist must refuse with fewer than 2 named directions: ' + solo.stdout + solo.stderr)
  assert.match(solo.stderr, /at least 2/, 'the refusal must name the two-direction floor: ' + JSON.stringify(solo.stderr))

  const openRetired = runNode(SCRIPT, ['--root', dir, 'theme', 'open'])
  assert.strictEqual(openRetired.status, 2, 'theme open is retired — it must exit 2: ' + openRetired.stdout + openRetired.stderr)
  assert.match(openRetired.stderr, /theme shortlist/, 'the retirement refusal must name `theme shortlist` as the remedy: ' + JSON.stringify(openRetired.stderr))
})

// AC-20260910-04-6
test('AC-20260910-04-6: --mark theme-picked over a decided theme-picked stop copies the picked direction\'s tokens.css byte-for-byte, appends a confirmed said-by-user "theme: <k>" ledger row naming the rejected sibling(s), sets marks.themePicked and status.theme, consumes the stop and derives CLIENT; a disagreeing --direction refuses naming the page pick; theme adopt is retired, exiting 2 naming --mark theme-picked', () => {
  const dir = tmpdir('mocks-driver-theme-2')
  advanceToJourneyWalked(dir)
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'ink', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'ink', 'P90')
  writeThemeKit(dir, 'warm-paper', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'warm-paper', 'P91')

  decideLook(dir, 'theme-picked', 'pick', {
    pick: 'ink', others: ['warm-paper'], by: 'me',
    candidates: [
      { group: 'ink', label: DENSE, path: 'mocks/' + DENSE + '.html?theme=ink' },
      { group: 'warm-paper', label: DENSE, path: 'mocks/' + DENSE + '.html?theme=warm-paper' },
    ],
  })

  const disagree = mark(dir, 'theme-picked', ['--direction', 'warm-paper'])
  assert.strictEqual(disagree.status, 2, '--direction warm-paper must refuse against a page pick of "ink": ' + disagree.stdout + disagree.stderr)
  assert.match(disagree.stderr, /disagrees with the page pick "ink"/, 'the refusal must name the page\'s actual pick "ink": ' + JSON.stringify(disagree.stderr))
  assert.ok(!fs.existsSync(path.join(dir, 'design/tokens.css')), 'a disagreeing --direction must never write design/tokens.css: ' + fs.existsSync(path.join(dir, 'design/tokens.css')))

  const r = mark(dir, 'theme-picked', ['--direction', 'ink'])
  assert.strictEqual(r.status, 0, '--mark theme-picked must accept a decided theme-picked pick stop: ' + r.stdout + r.stderr)

  const written = fs.readFileSync(path.join(dir, 'design/tokens.css'), 'utf8')
  const source = fs.readFileSync(path.join(dir, 'design/theme/ink/tokens.css'), 'utf8')
  assert.strictEqual(written, source, '--mark theme-picked must write design/tokens.css byte-identical to the picked direction\'s own tokens.css: ' + JSON.stringify({ written, source }))

  const ledgerText = fs.readFileSync(path.join(dir, 'design/mocks/ledger.md'), 'utf8')
  assert.match(ledgerText, /\|\s*P\d+\s*\|\s*SKETCH\s*\|\s*product\s*\|\s*theme: ink\s*\|\s*said-by-user\s*\|\s*confirmed \d{4}-\d{2}-\d{2}\s*\|\s*warm-paper\s*\|/,
    '--mark theme-picked must append a "theme: ink" row at step SKETCH, said-by-user/confirmed today, whose rejected cell names "warm-paper": ' + ledgerText)

  const stops = JSON.parse(fs.readFileSync(path.join(dir, 'design/mocks/picks.json'), 'utf8'))
  const themeStop = stops.find((s) => s.key === 'theme-picked')
  assert.strictEqual(themeStop.status, 'consumed', '--mark theme-picked must consume the theme-picked stop: ' + JSON.stringify(themeStop))

  const status = statusJson(dir)
  assert.ok(status.marks.themePicked, 'D6: --mark theme-picked must set status.marks.themePicked (unlike the retired theme adopt, which left mocks-state marks untouched): ' + JSON.stringify(status.marks))
  assert.strictEqual(status.theme, 'ink', 'D6: --mark theme-picked must set status.theme to the picked kebab: ' + JSON.stringify(status.theme))
  assert.strictEqual(stateOf(dir).stdout.trim(), 'CLIENT', 'once themePicked is set, state must derive CLIENT: ' + stateOf(dir).stdout)

  const adoptRetired = runNode(SCRIPT, ['--root', dir, 'theme', 'adopt'])
  assert.strictEqual(adoptRetired.status, 2, 'theme adopt is retired — it must exit 2: ' + adoptRetired.stdout + adoptRetired.stderr)
  assert.match(adoptRetired.stderr, /--mark theme-picked/, 'the retirement refusal must name `--mark theme-picked` as the remedy: ' + JSON.stringify(adoptRetired.stderr))
})

// AC-20260910-04-9
test('AC-20260910-04-9: on a walked host with no marks.themePicked, --mark theme-picked --direction <k> accepts with no stop when design/tokens.css is byte-equal to design/theme/<k>/tokens.css (the legacy path); with tokens.css byte-equal to the wire template it refuses naming theme shortlist', () => {
  const dir = tmpdir('mocks-driver-theme-2')
  advanceToJourneyWalked(dir)
  writeKitCanon(dir, KIT_PRIMITIVES)
  writeThemeKit(dir, 'legacy', KIT_PRIMITIVES)
  themeDirectionsRow(dir, 'legacy', 'P90')
  const legacyTokens = fs.readFileSync(path.join(dir, 'design/theme/legacy/tokens.css'), 'utf8')
  fs.mkdirSync(path.join(dir, 'design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), legacyTokens)

  const stopsPath = path.join(dir, 'design/mocks/picks.json')
  assert.ok(!fs.existsSync(stopsPath) || !JSON.parse(fs.readFileSync(stopsPath, 'utf8')).some((s) => s.key === 'theme-picked'),
    'test setup requires no theme-picked stop of any kind, or the "accepts with no stop" assertion below is vacuous')

  const r = mark(dir, 'theme-picked', ['--direction', 'legacy'])
  assert.strictEqual(r.status, 0, 'D3/AC-9: --mark theme-picked --direction legacy must accept with no stop when tokens.css already matches that direction byte-for-byte: ' + r.stdout + r.stderr)
  const status = statusJson(dir)
  assert.ok(status.marks.themePicked, 'the legacy path must still set marks.themePicked: ' + JSON.stringify(status.marks))
  assert.strictEqual(status.theme, 'legacy', 'the legacy path must still set status.theme to the matching kebab: ' + JSON.stringify(status.theme))

  const wireDir = tmpdir('mocks-driver-theme-2')
  advanceToJourneyWalked(wireDir)
  fs.mkdirSync(path.join(wireDir, 'design'), { recursive: true })
  fs.copyFileSync(path.join(SPEC, 'templates/mocks/wire-tokens.css'), path.join(wireDir, 'design/tokens.css'))
  const refused = mark(wireDir, 'theme-picked')
  assert.strictEqual(refused.status, 2, 'with design/tokens.css still the wireframe gray register byte-for-byte, --mark theme-picked must refuse — the legacy path never fires on an ungray-picked register: ' + refused.stdout + refused.stderr)
  assert.match(refused.stderr, /theme shortlist/, 'the refusal must name `theme shortlist` as the remedy: ' + JSON.stringify(refused.stderr))
})
