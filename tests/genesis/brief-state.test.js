'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260902/08-genesis-shrink-brief-state.md: the new BRIEF state sits between DISCOVERY
// and MENUS. discovery-done now requires an `- archetype: <key>` ## Picks line (D2);
// brief-written ratifies the design canon, tiered by archetype (D3/D4/D6); skeleton-landed
// gains the components.json check relocated from the retired DESIGN state (D5). None of this
// file's ACs can pass yet — spec/scripts/genesis-driver.js has no BRIEF state, no brief-written
// mark, and no archetype requirement at discovery-done.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const COVERAGE_KEYS = [
  'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
]
const REGISTRY_KEYS = [
  'web-app', 'realtime-trading', 'backend-api', 'mobile-app', 'desktop-app',
  'data-ml', 'conversational-bot', 'cli-devtool',
]

function bare(dir) {
  return runNode(SCRIPT, ['--root', dir])
}

function mark(dir, name, argv = []) {
  return runNode(SCRIPT, ['--root', dir, '--mark', name, ...argv])
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function writeJSON(p, obj) {
  writeFile(p, JSON.stringify(obj, null, 2) + '\n')
}

function statusOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8'))
}

// Same shape as genesis-driver.test.js's own writeBrief (files cannot share fixture helpers
// beyond tests/helpers.js).
function writeBrief(dir, { coverage = {}, dims = {}, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for brief-state.test.js.

## Coverage
${cov}

## Non-goals
none

## Open Dimensions
${dimLines}

## Research Angles
none — synthetic host, no research needed.

## Picks
${picks.join('\n')}
`)
}

// Empty ledger.md (D2/D3's grammar, matching spec/scripts/lib/mocks-ledger.js's own committed
// template) — zero rows parses to errors: [] and gateVerdict open: true, blocking: [].
const LEDGER_TEMPLATE_ROWS = [
  '# Provenance ledger — test project',
  '',
  '## Assumptions',
  '',
  '| id | step | kind | claim | tag | status | rejected | dependents | note |',
  '| - | - | - | - | - | - | - | - | - |',
]

function writeLedger(dir, extraAssumptionRows = []) {
  const lines = LEDGER_TEMPLATE_ROWS.slice(0, 6).concat(extraAssumptionRows, [
    '',
    '## Misunderstandings',
    '',
    '| id | what | step | cost | note |',
    '| - | - | - | - | - |',
    '',
  ])
  writeFile(path.join(dir, 'design/mocks/ledger.md'), lines.join('\n'))
}

function writeMocksStatus(dir, { state = 'APPROVED', directions = {}, theme = null } = {}) {
  writeJSON(path.join(dir, 'design/mocks/status.json'), {
    schemaVersion: 1, state, journeys: {}, directions, theme,
  })
}

function writeTokens(dir) {
  writeFile(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')
}

function writeDoctrine(dir, { totalLines = 20, dissentsBody = 'No minority direction rejected — synthetic fixture.' } = {}) {
  const lines = ['# Design doctrine', '']
  while (lines.length < totalLines - 2) lines.push('Filler line ' + lines.length + ' for line-count padding.')
  lines.push('## Dissents')
  lines.push(dissentsBody)
  writeFile(path.join(dir, 'docs/design/doctrine.md'), lines.slice(0, totalLines).join('\n'))
}

function writeDesignRules(dir, rules = []) {
  writeJSON(path.join(dir, '.claude/genesis/design-rules.json'), { rules })
}

// Drives a fresh root to a completed, archetype-named discovery-done — one call short of BRIEF's
// own ratifying mark, so every AC-3/-4/-5/-6/-7 test below controls exactly what brief-written
// sees.
function advanceToDiscoveryDone(dir, archetype) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief naming archetype ' + archetype + ': ' + r.stderr)
  return r
}

// Full D4 ratification artifact set for a visual archetype: an APPROVED mocks status with two
// composed directions (only one picked), an open ledger, a valid doctrine naming the unpicked
// direction, a valid (empty) design-rules.json, and tokens.css.
function writeValidBriefArtifacts(dir) {
  writeMocksStatus(dir, { directions: { quiet: { composed: '2026-09-01T00:00:00.000Z' }, warm: { composed: '2026-09-01T00:00:00.000Z' } }, theme: 'quiet' })
  writeLedger(dir)
  writeDoctrine(dir, { dissentsBody: 'The "warm" direction was composed and rejected in favor of "quiet" — no other minority option surfaced.' })
  writeDesignRules(dir, [])
  writeTokens(dir)
}

test('AC-20260902-08-3: WHEN --mark discovery-done runs with every coverage key covered but no `- archetype:` line THE SYSTEM exits 2 naming archetype and the eight registry keys; with `- archetype: web-app` it records status.archetype and prints a DISCOVERY→BRIEF checkpoint whose step text names /spec:mocks; with `- archetype: backend-api` the step text names --mark brief-written and not /spec:mocks', () => {
  const noArchetype = tmpdir('brief-ac3-none')
  bare(noArchetype)
  writeBrief(noArchetype, { picks: [] })
  const refused = mark(noArchetype, 'discovery-done')
  assert.strictEqual(refused.status, 2, 'D2: a brief with no `- archetype:` line has never named which registry key genesis is building — the mark must refuse it, not silently proceed with archetype: null')
  assert.match(refused.stderr, /archetype/, 'the refusal must name "archetype" so the session knows exactly what is missing from ## Picks')
  for (const key of REGISTRY_KEYS) {
    assert.ok(refused.stderr.includes(key), 'the refusal must list the registry key "' + key + '" among the valid choices, or the session has to go hunting in the registry doctrine for the grammar it was just told to fill in: ' + refused.stderr)
  }

  const webapp = tmpdir('brief-ac3-webapp')
  const webResult = advanceToDiscoveryDone(webapp, 'web-app')
  assert.strictEqual(statusOf(webapp).archetype, 'web-app', 'D2: a valid archetype line must be recorded onto status.archetype at discovery-done — deferring it to menus-done (its old home) leaves BRIEF unable to know whether a mocks set is owed')
  assert.match(webResult.stdout, /\(DISCOVERY → BRIEF\)/, 'D1: discovery-done must now hand off to the new BRIEF state, not MENUS — the driver chain skipped the design stage\'s new home')
  assert.match(webResult.stdout, /\/spec:mocks/, 'D2: a visual archetype\'s discovery-done output must render the BRIEF step for a not-yet-approved mocks set, whose hand-off names /spec:mocks — its absence leaves the session with no path into the design stage')

  const backend = tmpdir('brief-ac3-backend')
  const backendResult = advanceToDiscoveryDone(backend, 'backend-api')
  assert.match(backendResult.stdout, /--mark brief-written/, 'D2: backend-api owes nothing beyond DISCOVERY (D4) — its BRIEF step text must tell the session to run --mark brief-written directly')
  assert.doesNotMatch(backendResult.stdout, /\/spec:mocks/, 'D2: backend-api is not a visual archetype — its BRIEF step text must never send the session to /spec:mocks, a design stage this archetype never enters')
})

test('AC-20260902-08-4: WHEN --mark brief-written runs for web-app with no design/mocks/status.json THE SYSTEM exits 2 naming that path and "run /spec:mocks"; with state: "SKIN" it exits 2 naming SKIN; with state: "APPROVED" but a ledger holding a blocking invented-open row it exits 2 naming that row\'s id', () => {
  const noStatus = tmpdir('brief-ac4-nostatus')
  advanceToDiscoveryDone(noStatus, 'web-app')
  const refused = mark(noStatus, 'brief-written')
  assert.strictEqual(refused.status, 2, 'D3: BRIEF for a visual archetype must refuse brief-written outright when design/mocks/status.json does not exist — nothing has been shown to the user yet')
  assert.match(refused.stderr, /design\/mocks\/status\.json/, 'the refusal must name the missing path so the session knows exactly what /spec:mocks is expected to have produced')
  assert.match(refused.stderr, /run \/spec:mocks/, 'the refusal must name the remedy — /spec:mocks is the only command that can produce this file')

  const notApproved = tmpdir('brief-ac4-skin')
  advanceToDiscoveryDone(notApproved, 'web-app')
  writeMocksStatus(notApproved, { state: 'SKIN' })
  writeLedger(notApproved)
  const skinRefused = mark(notApproved, 'brief-written')
  assert.strictEqual(skinRefused.status, 2, 'D3: a mocks run still at SKIN has not been approved by the user yet — brief-written must refuse it')
  assert.match(skinRefused.stderr, /SKIN/, 'the refusal must name the actual state "SKIN" so the session knows how far the mocks run still has to go')

  const blockedLedger = tmpdir('brief-ac4-blocked')
  advanceToDiscoveryDone(blockedLedger, 'web-app')
  writeMocksStatus(blockedLedger, { directions: { quiet: { composed: '2026-09-01T00:00:00.000Z' } }, theme: 'quiet' })
  writeLedger(blockedLedger, ['| W4 | WIREFRAMES | product | c | invented | open | - | - | - |'])
  const ledgerRefused = mark(blockedLedger, 'brief-written')
  assert.strictEqual(ledgerRefused.status, 2, 'D3: an APPROVED mocks status with a still-open invented product row in its own provenance ledger means the approval was never actually clean — brief-written must refuse it exactly as /spec:mocks itself would')
  assert.match(ledgerRefused.stderr, /W4/, 'the refusal must name the blocking row\'s id "W4" so the session knows exactly which assumption still needs resolving')
})

test('AC-20260902-08-5: WHEN the BRIEF precondition holds for web-app, doctrine-drafted at 121 lines is refused naming the count; an unnamed composed direction in ## Dissents is refused naming it; a bad design-rules targetCategory is refused naming the enum; a missing tokens.css is refused naming it; once all hold brief-written records marks.briefWritten, brief.mocks/legacy/ratifiedAt, design: "ratified", and prints (BRIEF → MENUS); for data-ml it writes design: "skipped"', () => {
  const tooLong = tmpdir('brief-ac5-toolong')
  advanceToDiscoveryDone(tooLong, 'web-app')
  writeValidBriefArtifacts(tooLong)
  writeDoctrine(tooLong, { totalLines: 121, dissentsBody: 'The "warm" direction was composed and rejected in favor of "quiet".' })
  const tooLongRefused = mark(tooLong, 'brief-written')
  assert.strictEqual(tooLongRefused.status, 2, 'D4: docs/design/doctrine.md is capped at 120 lines — a 121-line doctrine must be refused, not silently ratified')
  assert.match(tooLongRefused.stderr, /121/, 'the refusal must name the actual line count so the session knows exactly how much to trim')

  const missingDirection = tmpdir('brief-ac5-dissents')
  advanceToDiscoveryDone(missingDirection, 'web-app')
  writeValidBriefArtifacts(missingDirection)
  writeDoctrine(missingDirection, { dissentsBody: 'Nothing else was considered.' })
  const dissentsRefused = mark(missingDirection, 'brief-written')
  assert.strictEqual(dissentsRefused.status, 2, 'D4: ## Dissents must name every composed-but-unpicked direction — "warm" was composed and not picked, so its absence from Dissents must refuse the mark')
  assert.match(dissentsRefused.stderr, /warm/, 'the refusal must name the missing direction "warm" so the session knows exactly which rejected direction to record')

  const badCategory = tmpdir('brief-ac5-badcat')
  advanceToDiscoveryDone(badCategory, 'web-app')
  writeValidBriefArtifacts(badCategory)
  writeDesignRules(badCategory, [{ id: 'r1', targetCategory: 'tailwind', grounding: 'taste', severity: 'warn', appliesTo: ['*'] }])
  const catRefused = mark(badCategory, 'brief-written')
  assert.strictEqual(catRefused.status, 2, 'D4: design-rules.json retains the closed targetCategory enum — "tailwind" is not one of the seven valid categories and must be refused')
  assert.match(catRefused.stderr, /tailwind/, 'the refusal must name the offending value "tailwind" so the session knows exactly which rule to fix')

  const noTokens = tmpdir('brief-ac5-notokens')
  advanceToDiscoveryDone(noTokens, 'web-app')
  writeMocksStatus(noTokens, { directions: { quiet: { composed: '2026-09-01T00:00:00.000Z' }, warm: { composed: '2026-09-01T00:00:00.000Z' } }, theme: 'quiet' })
  writeLedger(noTokens)
  writeDoctrine(noTokens, { dissentsBody: 'The "warm" direction was composed and rejected in favor of "quiet".' })
  writeDesignRules(noTokens, [])
  const tokensRefused = mark(noTokens, 'brief-written')
  assert.strictEqual(tokensRefused.status, 2, 'D4: design/tokens.css (written by THEME) must exist before BRIEF ratifies a design canon around it — its absence must refuse the mark')
  assert.match(tokensRefused.stderr, /design\/tokens\.css/, 'the refusal must name the missing tokens.css path')

  const ok = tmpdir('brief-ac5-ok')
  advanceToDiscoveryDone(ok, 'web-app')
  writeValidBriefArtifacts(ok)
  const accepted = mark(ok, 'brief-written')
  assert.strictEqual(accepted.status, 0, 'a complete D4 artifact set must be accepted: ' + accepted.stderr)
  const st = statusOf(ok)
  assert.strictEqual(st.marks.briefWritten, true, 'a successful brief-written must record marks.briefWritten so re-derivation never asks for it again')
  assert.strictEqual(st.brief.mocks, 'design/mocks/status.json', 'D4: status.brief.mocks must record the mocks status path this ratification was built on — the pick record now lives here instead of design-pick.json')
  assert.strictEqual(st.brief.legacy, false, 'a fresh, non-legacy ratification must record brief.legacy: false')
  assert.ok(st.brief.ratifiedAt, 'D4: status.brief.ratifiedAt must be recorded — its absence leaves no timestamp for when the design canon was locked')
  assert.strictEqual(st.design, 'ratified', 'D4: a successful brief-written for a visual archetype must record design: "ratified"')
  assert.match(accepted.stdout, /\(BRIEF → MENUS\)/, 'a successful brief-written must checkpoint into MENUS — the tournament/DECIDE chain picks up unchanged from there')

  const dataMl = tmpdir('brief-ac5-dataml')
  advanceToDiscoveryDone(dataMl, 'data-ml')
  const dataMlAccepted = mark(dataMl, 'brief-written')
  assert.strictEqual(dataMlAccepted.status, 0, 'D4: data-ml owes nothing beyond DISCOVERY — brief-written must be accepted with no mocks/doctrine/rules/tokens artifacts at all: ' + dataMlAccepted.stderr)
  assert.strictEqual(statusOf(dataMl).design, 'skipped', 'D4: data-ml\'s brief-written must record design: "skipped" — it is one of the two archetypes that never ratifies a design canon')
})

test('AC-20260902-08-6: WHEN --mark skeleton-landed runs for web-app with the probes and binding subset in place but no design/components.json THE SYSTEM exits 2 naming the file; with a manifest that duplicates a name it exits 2 carrying components-check.js\'s own line', () => {
  function advanceToSkeleton(dir) {
    advanceToDiscoveryDone(dir, 'web-app')
    writeValidBriefArtifacts(dir)
    const briefWritten = mark(dir, 'brief-written')
    assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted: ' + briefWritten.stderr)

    writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
      dimension: DIM, options: [{ label: 'AWS', packages: [] }],
    })
    const written = mark(dir, 'menu-written', ['--file', 'interview-research/' + DIM + '.json'])
    assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted: ' + written.stderr)
    writeBrief(dir, { dims: { [DIM]: 'open' }, picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
    const menusDone = mark(dir, 'menus-done')
    assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted: ' + menusDone.stderr)

    // web-app is a tournament archetype, but the tournament block is FINALISTS-through-PICK,
    // which this fixture skips outright — orthogonal to the D5 components.json check under test.
    const skip = mark(dir, 'finalists-skipped')
    assert.strictEqual(skip.status, 0, 'test setup requires finalists-skipped to be accepted: ' + skip.stderr)

    writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
      schemaVersion: 1, archetype: 'web-app', language: 'typescript', framework: 'next',
      packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
      designCatalog: 'none', gateCommand: 'true', scaffoldCommand: 'true',
      decisionRecords: ['docs/adr/0001-hosting.md'],
    })
    writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
    writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), `# 0002. Operational conventions

## Decision
See .claude/genesis/conventions.json for the row-by-row record.

## Dissents
None recorded — synthetic fixture.
`)
    writeJSON(path.join(dir, '.claude/genesis/conventions.json'), {
      schemaVersion: 1, testTree: 'tests',
      rows: [
        'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
        'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
      ].map((key) => ({
        key, status: 'DEFERRED', enforceable: false, probe: null,
        reason: 'not exercised by this fixture', adr: 'docs/adr/0002-operational-conventions.md',
      })),
    })
    const decided = mark(dir, 'decided')
    assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
    const scaffolded = bare(dir)
    assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
    writeFile(path.join(dir, 'CLAUDE.md'), '# Grounding\nGate command: `true`\nTest tree: `tests`\n')
  }

  const noManifest = tmpdir('brief-ac6-nomanifest')
  advanceToSkeleton(noManifest)
  const refused = mark(noManifest, 'skeleton-landed')
  assert.strictEqual(refused.status, 2, 'D5: a visual archetype must not be allowed to land the skeleton without design/components.json — the manifest is the shell/inventory extraction from the approved mocks set')
  assert.match(refused.stderr, /design\/components\.json/, 'the refusal must name the missing file so the session knows to seed it before re-marking skeleton-landed')

  const dupManifest = tmpdir('brief-ac6-dup')
  advanceToSkeleton(dupManifest)
  writeJSON(path.join(dupManifest, 'design/components.json'), [
    { name: 'Button', purpose: 'primary action' },
    { name: 'Button', purpose: 'duplicate name' },
  ])
  const dupRefused = mark(dupManifest, 'skeleton-landed')
  assert.strictEqual(dupRefused.status, 2, 'D5: a components.json with a duplicated component name is invalid per components-check.js\'s own schema authority — skeleton-landed must refuse it, not silently accept a broken manifest')
  assert.match(dupRefused.stderr, /Button/, 'the refusal must carry components-check.js\'s own finding naming the duplicated component "Button", per D5\'s "carrying components-check.js\'s own line"')
})

test('AC-20260902-08-7: WHEN a v2 status.json is past ROADMAP with explore: "picked", design: "rules-locked", and no marks.briefWritten THE SYSTEM derives BRIEF with step text naming "legacy:" and "--legacy"; brief-written without --legacy exits 2 naming design/mocks/status.json; with --legacy and D4\'s artifacts it accepts, records brief.legacy: true, and the next bare run derives HANDOFF', () => {
  const dir = tmpdir('brief-ac7-legacy')
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
  const statusPath = path.join(dir, '.claude/genesis/status.json')
  const raw = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  raw.schemaVersion = 2
  delete raw.brief
  raw.archetype = 'web-app'
  raw.explore = 'picked'
  raw.design = 'rules-locked'
  raw.architect = 'scaffold-complete'
  raw.scaffold = { exit: 0 }
  raw.zeroDayGate = { exit: 0 }
  raw.gateCommand = 'true'
  raw.marks = { discoveryDone: true, menusDone: true, decided: true, roadmapWritten: true }
  fs.writeFileSync(statusPath, JSON.stringify(raw, null, 2) + '\n')

  const peek = bare(dir)
  assert.strictEqual(peek.status, 0, 'test setup requires a bare invocation over the hand-seeded legacy v2 file to run cleanly: ' + peek.stderr)
  assert.match(peek.stdout, /state: BRIEF/, 'D6: a v2 status past ROADMAP with menusDone and no briefWritten must derive BRIEF, regardless of decided/roadmapWritten already being marked — the legacy resume enters at BRIEF, never MENUS or DECIDE')
  assert.match(peek.stdout, /legacy:/, 'D6: the BRIEF step text for a legacy resume must open with "legacy:" naming that explore/design artifacts are accepted in place of a mocks set')
  assert.match(peek.stdout, /--legacy/, 'D6: the legacy BRIEF step text must name the --legacy flag as the remedy for this resume path')

  const withoutLegacy = mark(dir, 'brief-written')
  assert.strictEqual(withoutLegacy.status, 2, 'D6: brief-written without --legacy must still run D3\'s ordinary precondition for a visual archetype — there is no design/mocks/status.json for this legacy host, so it must refuse')
  assert.match(withoutLegacy.stderr, /design\/mocks\/status\.json/, 'the refusal must name the missing mocks status path exactly as the non-legacy precondition refusal does')

  writeDoctrine(dir, { dissentsBody: 'Legacy resume — no mocks directions to name; nothing else was rejected.' })
  writeDesignRules(dir, [])
  writeTokens(dir)
  const withLegacy = mark(dir, 'brief-written', ['--legacy'])
  assert.strictEqual(withLegacy.status, 0, 'D6: --mark brief-written --legacy must skip D3\'s mocks precondition and accept once D4\'s ratification artifacts (doctrine, design-rules, tokens) hold: ' + withLegacy.stderr)
  assert.strictEqual(statusOf(dir).brief.legacy, true, 'D6: a legacy-flagged acceptance must record brief.legacy: true so downstream tooling knows this canon was ratified from explore/design artifacts, not a mocks set')

  const next = bare(dir)
  assert.match(next.stdout, /state: HANDOFF/, 'D6: every downstream legacy mark (decided, roadmapWritten, the scaffold-complete architect flag) must already be valid, so the very next bare invocation after the one brief-written mark must land on the run\'s real next state, HANDOFF — never MENUS or DECIDE, which would force a re-run of work this legacy host already did')
})

test('AC-20260902-08-13: WHEN --mark menus-done runs on a brief whose archetype line is already present THE SYSTEM CONTINUES TO accept it', () => {
  const dir = tmpdir('brief-ac13')
  advanceToDiscoveryDone(dir, 'data-ml')
  const briefWritten = mark(dir, 'brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted for data-ml: ' + briefWritten.stderr)
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM, options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', ['--file', 'interview-research/' + DIM + '.json'])
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted: ' + written.stderr)
  // D2: the archetype line still sits under ## Picks (carried over from discovery-done's own
  // brief.md, never removed) — menus-done must still accept it, not reject a now-familiar line
  // as unexpected.
  writeBrief(dir, { dims: { [DIM]: 'open' }, picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'D2: menus-done must CONTINUE TO accept a ## Picks archetype line that is already present (moved to discovery-done, not removed from the grammar) — refusing it here would break every legacy brief.md that still carries the line: ' + done.stderr)
})

test('AC-20260902-08-14: WHEN --mark skeleton-landed runs for web-app with a valid design/components.json THE SYSTEM CONTINUES TO run the zero-day gate', () => {
  const dir = tmpdir('brief-ac14')
  advanceToDiscoveryDone(dir, 'web-app')
  writeValidBriefArtifacts(dir)
  const briefWritten = mark(dir, 'brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted: ' + briefWritten.stderr)
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM, options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', ['--file', 'interview-research/' + DIM + '.json'])
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted: ' + written.stderr)
  writeBrief(dir, { dims: { [DIM]: 'open' }, picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted: ' + menusDone.stderr)
  const skip = mark(dir, 'finalists-skipped')
  assert.strictEqual(skip.status, 0, 'test setup requires finalists-skipped to be accepted: ' + skip.stderr)
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'web-app', language: 'typescript', framework: 'next',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog: 'none', gateCommand: 'exit 0', scaffoldCommand: 'true',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), `# 0002. Operational conventions

## Decision
See .claude/genesis/conventions.json for the row-by-row record.

## Dissents
None recorded — synthetic fixture.
`)
  writeJSON(path.join(dir, '.claude/genesis/conventions.json'), {
    schemaVersion: 1, testTree: 'tests',
    rows: [
      'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
      'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
    ].map((key) => ({
      key, status: 'DEFERRED', enforceable: false, probe: null,
      reason: 'not exercised by this fixture', adr: 'docs/adr/0002-operational-conventions.md',
    })),
  })
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeFile(path.join(dir, 'CLAUDE.md'), '# Grounding\nGate command: `exit 0`\nTest tree: `tests`\n')
  writeJSON(path.join(dir, 'design/components.json'), [{ name: 'Button', purpose: 'primary action' }])

  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'D5: a valid design/components.json must not, by itself, block skeleton-landed: ' + landed.stderr)
  assert.strictEqual(statusOf(dir).zeroDayGate.exit, 0, 'skeleton-landed must CONTINUE TO run the zero-day gate exactly as it did before D5\'s components.json check was added — its absence here means the new check was inserted ahead of the gate instead of alongside it')
  assert.match(landed.stdout, /ROADMAP/, 'a green zero-day gate must still advance the driver to ROADMAP')
})
