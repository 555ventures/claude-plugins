'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')

// tournament family shared fixtures — split from tests/genesis/tournament.test.js by
// specs/20260903/07-test-file-budget-guard.md D7 (the guard's first live run reddened that file
// at 8 tests / ~46-49s serial). No `test(` calls here. Constants and helpers moved verbatim from
// the pre-image; consumed by the three shards (tournament.test.js, tournament-probe-pick.test.js,
// tournament-decided.test.js) via module.exports.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const COVERAGE_KEYS = [
  'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
]

function bare(dir) {
  return runNode(SCRIPT, ['--root', dir])
}

function state(dir) {
  return runNode(SCRIPT, ['--root', dir, '--state'])
}

function mark(dir, name, file) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv)
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

// Same shape as tests/genesis/genesis-driver.test.js's own writeBrief — this file cannot require
// that one (workflow-script-style file-local helpers, no shared module beyond tests/helpers.js).
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for tournament.test.js.

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

function writeHostingMenu(dir) {
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
  })
}

// specs/20260827/04-genesis-conventions-handoff.md D2/D3 (D11 build ruling): `decided`
// now additionally requires a valid `.claude/genesis/conventions.json` (every row's `adr`
// existing), and `skeleton-landed` now additionally requires every enforceable DECIDED row's
// probe file present-and-non-empty plus a <=150-line CLAUDE.md naming the gate command and the
// test tree. AC-20260827-01-7's three `decided` calls and AC-20260827-01-8's one `decided` +
// `skeleton-landed` pair are the only places in this file family that cross those two marks —
// this helper pair is written once, per § Review Checks' three-near-identical-blocks rule,
// instead of three times inline. All nine floor rows are DEFERRED: these tests exercise the
// tournament state machine, not conventions.json's own row-shape validation
// (conventions-handoff.test.js's job), so no row needs a probe file at all.
function writeAdr0002(dir) {
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), `# 0002. Operational conventions

## Decision
See .claude/genesis/conventions.json for the row-by-row record.

## Dissents
None recorded — synthetic fixture for tournament.test.js.
`)
}

const CONVENTIONS_FLOOR_KEYS = [
  'error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
  'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric',
]

function writeConventionsArtifacts(dir) {
  writeAdr0002(dir)
  writeJSON(path.join(dir, '.claude/genesis/conventions.json'), {
    schemaVersion: 1,
    testTree: 'tests',
    rows: CONVENTIONS_FLOOR_KEYS.map((key) => ({
      key, status: 'DEFERRED', enforceable: false, probe: null,
      reason: 'not exercised by this tournament-state fixture', adr: 'docs/adr/0002-operational-conventions.md',
    })),
  })
}

// D3's binding-subset doc: a short CLAUDE.md naming the exact gateCommand this fixture will run
// at skeleton-landed and the conventions testTree ("tests", matching writeConventionsArtifacts).
function writeBindingSubset(dir, gateCommand) {
  writeFile(path.join(dir, 'CLAUDE.md'), [
    '# Grounding',
    'Gate command: `' + gateCommand + '`',
    'Test tree: `tests`',
  ].join('\n'))
}

// specs/20260902/08-genesis-shrink-brief-state.md D1/D2/D4: discovery-done now requires the
// `- archetype: <key>` line up front, and BRIEF now sits between DISCOVERY and MENUS —
// `--mark brief-written` must be accepted before this file's MENUS-stage setup can proceed at
// all. Every archetype this file drives through is either `backend-api` or `data-ml`
// (DESIGN_SKIPPED_ARCHETYPES, D4), which owes nothing beyond DISCOVERY, so brief-written is
// accepted immediately with no mocks/doctrine artifacts — except the one PROBE test below that
// deliberately exercises web-app (a visual archetype), which writes its own full D4 ratification
// set instead of calling this helper.
// specs/20260902/11-brief-from-approved-set.md D1 repair (build gate red round 1): raceWebApp
// (below, the one call site that ratifies a web-app/visual archetype through this helper) drives
// brief.md through this file's own writeBrief() first (six sections, no Journeys/Non-UI
// Coverage). This fixture writes no design/mocks/seed.md, so briefJourneysCheck() has zero seed
// journeys to walk and passes trivially — but briefNonUiCheck() is unconditional. Appends a
// compliant, all-covered `## Non-UI Coverage` block (plus an empty `## Journeys` heading,
// harmless with no seed journeys to satisfy) onto whatever brief.md already exists, the same
// fix shape as tests/genesis/brief-state.test.js's own writeValidBriefArtifacts (deviations
// sidecar) — additive only, never touching the six sections writeBrief() already wrote.
const NON_UI_KEYS = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']
function ensureJourneysAndNonUiSections(dir) {
  const p = path.join(dir, '.claude/genesis/brief.md')
  const text = fs.readFileSync(p, 'utf8')
  if (text.includes('## Non-UI Coverage')) return
  fs.writeFileSync(p, text.replace(/\n?$/, '') +
    '\n\n## Journeys\n(no design/mocks/seed.md for this synthetic fixture — nothing to cover)\n' +
    '\n## Non-UI Coverage\n' + NON_UI_KEYS.map((k) => `- ${k}: covered — synthetic test note`).join('\n') + '\n')
}

function ratifyBriefArtifacts(dir) {
  writeJSON(path.join(dir, 'design/mocks/status.json'), {
    schemaVersion: 1, state: 'APPROVED', journeys: {}, directions: {}, theme: null,
  })
  writeFile(path.join(dir, 'design/mocks/ledger.md'), [
    '# Provenance ledger — test project', '',
    '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |', '',
    '## Misunderstandings', '',
    '| id | what | step | cost | note |',
    '| - | - | - | - | - |', '',
  ].join('\n'))
  writeFile(path.join(dir, 'docs/design/doctrine.md'), [
    '# Design doctrine', '',
    '## Dissents',
    'Nothing rejected — synthetic fixture with no composed directions.',
  ].join('\n'))
  writeJSON(path.join(dir, '.claude/genesis/design-rules.json'), { rules: [] })
  writeFile(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')
  ensureJourneysAndNonUiSections(dir)
}

// Drives from an empty root, through the new BRIEF state, to a MENUS state whose hosting menu
// file is already written (the registry-check pass recorded) — everything AC-1/AC-2 need before
// they exercise the archetype line themselves.
function advanceToMenusReady(dir, archetype) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief naming archetype ' + archetype + ': ' + disco.stderr)
  const briefWritten = mark(dir, 'brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires brief-written to be accepted immediately for archetype ' + archetype + ' (DESIGN_SKIPPED_ARCHETYPES owe nothing beyond DISCOVERY, D4): ' + briefWritten.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
}

// Drives all the way through menus-done with a named TOURNAMENT archetype, asserting the driver
// actually lands in FINALISTS — the shared setup every AC-3..AC-8 test in this file family
// builds on.
function advanceToFinalists(dir, archetype) {
  advanceToMenusReady(dir, archetype)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted with a valid archetype and every open dimension picked: ' + done.stderr)
  assert.match(done.stdout, /state: FINALISTS/, 'test setup requires the tournament archetype "' + archetype + '" to reach FINALISTS straight after menus-done: ' + done.stdout)
  return done
}

function finalist(name, picks, overrides = {}) {
  return Object.assign({
    name,
    picks,
    scaffoldCommand: 'true',
    gateCommand: 'true',
    bootCommand: 'true',
    readyCheck: 'true',
  }, overrides)
}

// review finding (AC-20260902-08-8, AC-20260902-08-15): the boot command must clear its own
// ready marker on TERM — smoke.sh's pre-boot staleness guard (D4) fails closed with exit 7
// "stale-ready" whenever a readyCheck run finds `booted` already present before it has spawned
// a fresh bootCommand, which is exactly what happens on probe-done's post-race re-boot in the
// same finalist dir once a prior boot's marker survives its own stop.
const BOOT_CMD = "touch booted; trap 'rm -f booted; exit 0' TERM; while :; do sleep 1; done"

module.exports = {
  SCRIPT, DIM, COVERAGE_KEYS,
  bare, state, mark, writeFile, writeJSON, statusOf, writeBrief, writeHostingMenu,
  writeAdr0002, CONVENTIONS_FLOOR_KEYS, writeConventionsArtifacts, writeBindingSubset,
  NON_UI_KEYS, ensureJourneysAndNonUiSections, ratifyBriefArtifacts,
  advanceToMenusReady, advanceToFinalists, finalist, BOOT_CMD,
}
