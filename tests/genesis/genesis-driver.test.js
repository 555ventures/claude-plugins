'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')

// specs/20260825/04-genesis-driver.md (TDD red): the architect stage becomes
// driver-stepped — one script, spec/scripts/genesis-driver.js, derives state from
// .claude/genesis/status.json plus on-disk artifacts on every invocation, runs every
// deterministic check itself (coverage audit, registry check, decision-record closure,
// scaffold, zero-day gate, roadmap closure), and prints only the one step needing judgment.
// None of AC-1..AC-7 can pass yet — spec/scripts/genesis-driver.js does not exist.
//
// Fixtures use packages: [] in every menu option so registry-check.js (invoked by the driver
// for `menu-written`) never probes a network endpoint (spec D16).
//
// specs/20260902/08-genesis-shrink-brief-state.md D1/D2/D11 (AC-20260902-08-1, AC-20260902-08-2):
// status.json becomes schemaVersion 3 (no `explore` key, adds `brief`) and the eight EXPLORE/
// DESIGN marks are retired; every shared helper below now interposes the new BRIEF state
// (archetype named at discovery-done, `--mark brief-written` accepted immediately for the
// DESIGN_SKIPPED_ARCHETYPES default `data-ml`) between discovery-done and MENUS.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'

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

// specs/20260908/03-test-fixture-dedupe.md D2: writeBrief is now shared from
// tournament.fixtures.js — byte-identical to this file's old local copy (same default dims
// `{ [DIM]: 'open' }`) save the project sentence, which the shared function's `label` param
// now fills.

// Drives the real binary from an empty root through the coverage-audit gate, the new BRIEF
// state, and to MENUS. specs/20260902/08-genesis-shrink-brief-state.md D2: `discovery-done` now
// also requires a `- archetype: <key>` ## Picks line; D4: `archetype` defaults to `data-ml`
// (DESIGN_SKIPPED_ARCHETYPES) so `--mark brief-written` is accepted immediately with no
// mocks/doctrine artifacts owed at all — every caller of this helper (every AC-20260825-04/
// AC-20260827-*/F1/F3/F6/logtail regression below) only cares about the state past MENUS, and a
// visual or doctrine-owing archetype default would force every one of them to author a design
// canon just to reach MENUS, which the worker contract forbids rewriting them for.
function advanceToMenus(dir, archetype = 'data-ml') {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief naming archetype ' + archetype + ': ' + r.stderr)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted immediately for a DISCOVERY-only archetype (' + archetype + ' owes nothing beyond discovery per D4): ' + bw.stderr)
  return bw
}

// Drives from MENUS through the registry-check menu write and the picks gate to DECIDE.
//
// specs/20260827/01-genesis-tournament.md D2/D15 (AC-20260827-01-9): --mark menus-done now also
// requires a `- archetype: <key>` line in ## Picks. `archetype` defaults to the non-tournament
// key `data-ml` — D15 (orchestrator ruling) is explicit that this shared fixture
// must NOT default to a tournament archetype (e.g. web-app): every caller of this helper
// (AC-20260825-04-4/-5/-6/-7 and the F1/F3/F6/logtail regressions below) asserts DECIDE straight
// after menus-done and then drives on into SCAFFOLD/GATE, and a tournament archetype would stop
// them at FINALISTS instead, forcing those existing pins to be rewritten — exactly what the
// worker contract forbids. Only AC-20260825-04-3 below passes a different archetype, to exercise
// D1's tournament routing itself.
function advanceToDecide(dir, archetype = 'data-ml') {
  advanceToMenus(dir, archetype)
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted once every open dimension has a pick and a valid archetype: ' + done.stderr)
  return done
}

// Writes a complete stack-descriptor.json + a valid ADR (Dissents non-empty, `hosting` named).
function writeValidDecideArtifacts(dir, { scaffoldCommand = 'true', gateCommand = 'true', designCatalog = 'none' } = {}) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1,
    archetype: 'web-app',
    language: 'typescript',
    framework: 'next',
    packageManager: 'bun',
    testRunner: 'bun test',
    linter: 'eslint',
    typechecker: 'tsc',
    designCatalog,
    gateCommand,
    scaffoldCommand,
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
}

// specs/20260827/04-genesis-conventions-handoff.md D2/D3 (D11 build ruling): `decided`
// now additionally requires a valid `.claude/genesis/conventions.json` (plus every row's `adr`
// existing), and `skeleton-landed` now additionally requires every enforceable DECIDED row's
// probe file present-and-non-empty plus a <=150-line CLAUDE.md naming the gate command and the
// test tree. Every helper in this file that drives through those two marks needs this fixture
// plumbing — added once here (never repeated inline) per § Review Checks' three-near-identical-
// blocks rule. All nine floor rows are DEFERRED here: this file's tests exercise driver-state
// transitions, not conventions.json's own row-shape validation (that is
// tests/genesis/conventions-handoff.test.js's job), so no row needs a probe file at all.
function writeAdr0002(dir) {
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), `# 0002. Operational conventions

## Decision
See .claude/genesis/conventions.json for the row-by-row record.

## Dissents
None recorded — synthetic fixture for genesis-driver.test.js.
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
      reason: 'not exercised by this driver-state fixture', adr: 'docs/adr/0002-operational-conventions.md',
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

// Drives from an empty root all the way to DECIDE with valid decide-stage artifacts, then
// accepts \`decided\`, then runs the bare invocation that executes SCAFFOLD (driver-only). Also
// lands the D3 binding-subset doc (naming this call's own gateCommand) ahead of SKELETON: several
// callers below mark skeleton-landed directly on the returned host (to observe GATE_RED or the
// F6/logtail regressions) rather than going through advanceToRoadmap, so the doc is written here,
// the one place every such caller already passes through.
function advanceThroughScaffold(dir, opts = {}) {
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir, opts)
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted with a complete descriptor and ADR: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, opts.gateCommand || 'true')
  return scaffolded
}

// Drives all the way to ROADMAP (green zero-day gate).
function advanceToRoadmap(dir, opts = {}) {
  advanceThroughScaffold(dir, opts)
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green gateCommand to reach ROADMAP: ' + landed.stdout)
  return landed
}

function writeRoadmap(dir, briefs) {
  writeFile(path.join(dir, 'docs/roadmap/00-overview.md'), '# Overview\n\nSee Sequence.\n')
  for (const b of briefs) {
    writeFile(path.join(dir, 'docs/roadmap', b.name), `# ${b.name}

Phase: P0 · Depends on: ${b.dependsOn}
${b.surfaces ? '\n```surfaces\n' + b.surfaces.join('\n') + '\n```\n' : ''}
## Result
Something observable.
`)
  }
}

// ---------------------------------------------------------------------------
// specs/20260902/11-brief-from-approved-set.md D4/D5: journey placement (roadmap-written) and
// shell/component extraction (skeleton-landed) both apply only to a fresh visual run (Behavior:
// gated on status.brief.mocks being set) — genesis-driver.test.js's own advanceToMenus/
// advanceToDecide default to the non-visual archetype data-ml (D15 orchestrator ruling, see the
// header comment above), so a dedicated visual-archetype chain is built here, file-local (not
// shared with tests/genesis/brief-state.test.js's own near-identical helpers, per that file's
// own header comment on the same constraint).
// ---------------------------------------------------------------------------
function writeMocksStatusVisual(dir, { directions = { quiet: { composed: '2026-09-01T00:00:00.000Z' } }, theme = 'quiet' } = {}) {
  writeJSON(path.join(dir, 'design/mocks/status.json'), { schemaVersion: 1, state: 'APPROVED', journeys: {}, directions, theme })
}

function writeOpenLedger(dir) {
  writeFile(path.join(dir, 'design/mocks/ledger.md'), [
    '# Provenance ledger — test project', '', '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |',
    '', '## Misunderstandings', '',
    '| id | what | step | cost | note |', '| - | - | - | - | - |', '',
  ].join('\n'))
}

function writeDesignDoctrine(dir, dissentsBody) {
  writeFile(path.join(dir, 'docs/design/doctrine.md'), '# Design doctrine\n\n## Dissents\n' + dissentsBody + '\n')
}

function writeVisualDesignRules(dir) {
  writeJSON(path.join(dir, '.claude/genesis/design-rules.json'), { rules: [] })
}

function writeVisualTokens(dir) {
  writeFile(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')
}

// design/mocks/seed.md's `### <journey-kebab>` grammar (design-atlas.js's parseSeedJourneys) —
// see tests/genesis/brief-state.test.js's own near-identical writeSeed for the same grammar,
// duplicated here per that file's own file-locality comment.
function writeSeedJourneys(dir, journeys) {
  const blocks = journeys.map((j) => {
    const surf = j.labels.map((l, i) => (i === 0 ? l : `${j.labels[i - 1]} -> ${l}`)).slice(1)
    const first = j.labels.length ? j.labels[0] : ''
    return `### ${j.name}\n${j.persona}\n\`\`\`surfaces\n${first ? first + '\n' : ''}${surf.join('\n')}\n\`\`\`\n`
  }).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — test product

## Product
Synthetic product for genesis-driver.test.js.

## Facts
- primary-surface: P1

## References
- none

## Journeys
${blocks}
## Dense screen
- ${journeys[0] && journeys[0].labels[0]}
`)
}

function briefJourneysSectionFor(journeys) {
  return journeys.map((j) => {
    const surf = j.labels.map((l, i) => (i === 0 ? l : `${j.labels[i - 1]} -> ${l}`)).slice(1)
    const first = j.labels.length ? j.labels[0] : ''
    const states = j.labels.map((l) => `states: ${l}: default`).join('\n')
    return `### ${j.name}\n${j.persona}\n\`\`\`surfaces\n${first ? first + '\n' : ''}${surf.join('\n')}\n\`\`\`\n${states}\n`
  }).join('\n')
}

const NON_UI_KEYS_GD = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']
function briefNonUiSectionFor() {
  return NON_UI_KEYS_GD.map((k) => `- ${k}: covered — synthetic test note`).join('\n')
}

// specs/20260908/03-test-fixture-dedupe.md D2: the six D3 sections now come from the shared
// writeBrief (tournament.fixtures.js), with the ## Journeys/## Non-UI Coverage pair passed as
// extraSections — D2 places extraSections before ## Picks instead of after, which is harmless
// here since scripts/genesis-driver.js's own section() reader locates a heading by scanning to
// the next `## ` line regardless of what precedes or follows it. `dims: {}` matches this
// function's own prior "## Open Dimensions\nnone" literal (an empty dims object renders no
// dimension lines either way).
function writeVisualBrief(dir, { journeys }) {
  writeBrief(dir, {
    label: 'genesis-driver.test.js',
    dims: {},
    picks: ['- archetype: web-app'],
    extraSections: '## Journeys\n' + briefJourneysSectionFor(journeys) + '\n\n## Non-UI Coverage\n' + briefNonUiSectionFor(),
  })
}

// Drives a fresh visual (web-app) run through DISCOVERY/BRIEF/MENUS/DECIDE/SCAFFOLD, stopping
// right before `--mark skeleton-landed` so callers can vary the D5 shell/mocks/canon fixtures
// (or skip straight to ROADMAP via advanceToRoadmapVisual below, for callers that don't care).
function advanceToSkeletonVisual(dir, journeys) {
  bare(dir)
  writeVisualBrief(dir, { journeys })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for web-app: ' + disco.stderr)
  writeMocksStatusVisual(dir)
  writeOpenLedger(dir)
  writeSeedJourneys(dir, journeys)
  writeDesignDoctrine(dir, 'No minority direction rejected — synthetic fixture.')
  writeVisualDesignRules(dir)
  writeVisualTokens(dir)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted on a fully D1/D3/D4-compliant web-app fixture: ' + bw.stderr)
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted with no open dimensions: ' + menusDone.stderr)
  const skip = mark(dir, 'finalists-skipped')
  assert.strictEqual(skip.status, 0, 'test setup requires finalists-skipped to be accepted for the tournament archetype web-app: ' + skip.stderr)
  writeValidDecideArtifacts(dir)
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, 'true')
  // Deliberately writes no design/shell/app.html and no design/mocks/*.html: this file's own
  // AC-20260902-11-5 test calls this helper directly and needs full control over that fixture
  // per sub-case (missing shell, undeclared mock, missing primitive) — the compliant version
  // lives in advanceToRoadmapVisual below, not here, so it stays that test's to vary.
}

// Drives a fresh visual (web-app) run all the way to ROADMAP: BRIEF is fully D1-compliant
// (## Journeys/## Non-UI Coverage covering `journeys`), MENUS/DECIDE run the tournament's
// skip path (`finalists-skipped`), SCAFFOLD/SKELETON use the same true/true commands and
// components.json shape AC-20260902-08-14 (brief-state.test.js) already proves accepted —
// D5's own new shell/data-shell/primitive checks are exercised separately, by this file's
// AC-20260902-11-5 test, not by every roadmap-written caller.
function advanceToRoadmapVisual(dir, journeys) {
  advanceToSkeletonVisual(dir, journeys)
  writeJSON(path.join(dir, 'design/components.json'), [{ name: 'Button', purpose: 'primary action' }])
  // Repair round 1 (build gate red — deviations sidecar): D5's skeleton-landed shell/data-shell/
  // matrix checks fire unconditionally once status.brief.mocks is set, which every caller of
  // this helper now hits — a compliant design/shell/app.html plus one data-shell-declaring mock
  // per journey label, the exact fixture shape this file's own AC-20260902-11-5 test already
  // proves passes `design-atlas.js check`/`check --matrix` (writeShellDirGD/mockDeclaringGD,
  // defined below). Only this ROADMAP-reaching helper gets it, never advanceToSkeletonVisual
  // itself — AC-20260902-11-5 calls that one directly and needs to vary the shell fixture
  // per sub-case.
  writeShellDirGD(dir)
  const allLabels = new Set()
  for (const j of journeys) for (const l of j.labels) allLabels.add(l)
  for (const label of allLabels) writeFile(path.join(dir, 'design/mocks', label + '.html'), mockDeclaringGD(label))
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green zero-day gate to reach ROADMAP: ' + landed.stdout)
}

// Review findings F1, F3, F6 (specs/20260825/04-genesis-driver.md review): three
// defects caught after the spec's own AC-1..AC-7 above were already green — one by the spec
// reviewer (F3), two by a Fable consult (F1, F6) — and already fixed in genesis-driver.js by the
// time this file was written, so these are regression pins on shipped fixes, not TDD-red ACs (no
// AC-ID fabricated; per this repo's review-finding convention, named "review finding <id>").
// F6 (highest value): the old runShell piped scaffoldCommand/gateCommand output through
// spawnSync's default 1 MiB maxBuffer; a real scaffold (create-next-app plus an install)
// routinely exceeds that, SIGTERM-killing the child mid-run (ENOBUFS) before a byte reached the
// log — genuinely truncating the scaffold, not merely failing to log it — and permanently
// bricking the project, since every re-run hit the identical wall. The fix streams the child's
// output straight to the log file's own fd instead of a Node pipe. D16's own test design used
// one-line fake commands, which is exactly why no prior test could see this — the fixtures below
// are deliberately sized past 1 MiB. F1 (D4): a dropped registry option's label was never printed
// on screen, only a pointer at the menu file. F3 (D1): --state routed through the same
// deriveState() that executes scaffoldCommand/gateCommand, so a "read-only" peek could run a real
// side-effecting shell command.

test('review finding F6: a scaffoldCommand emitting well past spawnSync\'s 1 MiB default maxBuffer runs to completion, is captured in full by scaffold.log, and records scaffold.exit 0, instead of being SIGTERM\'d mid-run by a Node-pipe-buffered runShell', () => {
  const dir = tmpdir('gdrv-f6-scaffold')
  const bigScaffoldCmd = "yes x | head -c 2000000; touch DID_NOT_BRICK.txt"
  const scaffolded = advanceThroughScaffold(dir, { scaffoldCommand: bigScaffoldCmd })
  assert.strictEqual(scaffolded.status, 0, 'this fixture is the size of a real create-next-app-plus-install run; a nonzero driver exit here means genesis dies on the FIRST real project it touches, with a remedy (fix the command, re-run) that can never succeed because the wall is structural, not the command')
  const markerPath = path.join(dir, 'DID_NOT_BRICK.txt')
  assert.ok(fs.existsSync(markerPath), 'the trailing touch only runs if the child was allowed to finish — its absence means runShell\'s 1 MiB Node pipe SIGTERM\'d the child mid-stream (ENOBUFS) before its own last line ran, the exact truncation this test pins')
  const logPath = path.join(dir, '.claude/genesis/scaffold.log')
  assert.ok(fs.existsSync(logPath), 'scaffold.log must exist even when the command emits megabytes of output — a missing log after a >1 MiB scaffold means the fd was never wired up to capture streamed output')
  const logSize = fs.statSync(logPath).size
  assert.ok(logSize >= 2000000, 'scaffold.log is only ' + logSize + ' bytes, short of the 2,000,000 the command emitted — a log truncated at the old 1 MiB ceiling is the diagnostic a bricked genesis project would be left with, silently useless past the actual failure point')
  const st = statusOf(dir)
  assert.strictEqual(st.scaffold.exit, 0, 'status.json must record the real exit of a scaffold that ran to completion, not the SIGTERM the old 1 MiB-buffered runShell substituted for it')
  assert.match(scaffolded.stdout, /SKELETON/, 'a scaffold that truly completed must advance the driver to SKELETON — stalling here after a genuinely successful run means every re-invocation hits the identical wall forever')
})

test('review finding F6 (gate leg): a gateCommand emitting well past 1 MiB and then exiting 1 still records zeroDayGate.exit 1 and prints GATE_RED with its own log, instead of dying with no recorded status', () => {
  const dir = tmpdir('gdrv-f6-gate')
  // Newline-delimited filler (not a single 2,000,000-byte line): GATE_RED's step text embeds
  // gate.log's own tail via logTail() (last 20 lines), which this test's OUTER runNode call
  // captures through its own pipe — a single giant line here would blow up THAT unrelated
  // buffer and fail for a reason that has nothing to do with the runShell fix under test.
  const bigRedGateCmd = 'yes x | head -c 2000000; exit 1'
  advanceThroughScaffold(dir, { gateCommand: bigRedGateCmd })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'skeleton-landed is a valid mark regardless of the gate\'s own outcome — a refused mark here means the >1 MiB gate output killed the child via the same Node-pipe ceiling before it could even reach its own exit 1: ' + landed.stderr)
  const st = statusOf(dir)
  assert.strictEqual(st.zeroDayGate.exit, 1, 'a red zero-day gate that emitted megabytes of output must still report its true exit code — recording anything else means the driver can no longer tell a genuine gate failure from a pipe-killed child')
  assert.match(landed.stdout, /GATE_RED/, 'a failing gate this size must still reach GATE_RED — the one state whose remedy tells the session to fix scaffold-level issues and re-run')
  const gateLogPath = path.join(dir, '.claude/genesis/gate.log')
  assert.ok(fs.existsSync(gateLogPath), 'gate.log must exist so a red gate this size can be diagnosed from its own log instead of leaving the session with no record of what the command printed')
  const gateLogSize = fs.statSync(gateLogPath).size
  assert.ok(gateLogSize >= 2000000, 'gate.log is only ' + gateLogSize + ' bytes — a log truncated below the command\'s real output throws away the very evidence a red gate needs a session to read in order to fix it')
})

test('review finding F1 (D4): once registry-check.js drops an option for currency, the MENUS step re-print names the dropped option\'s label, and degrades to the generic wording without throwing when the menu file is unparseable', () => {
  // Hermetic per this file's own established pattern (see the header comment above AC-3): seed
  // status.json's recorded menus[key] state directly instead of driving a fabricated npm package
  // name through the live registry-check.js network path, so this suite stays network-free.
  const dir = tmpdir('gdrv-f1-labels')
  advanceToMenus(dir)
  const droppedLabel = 'zzz-fabricated-nonexistent-npm-package-9182'
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
    droppedForCurrency: [{ label: droppedLabel, packages: [droppedLabel] }],
  })
  const seeded = statusOf(dir)
  seeded.menus[DIM] = { registryExit: 1, at: new Date().toISOString() }
  writeJSON(path.join(dir, '.claude/genesis/status.json'), seeded)

  const step = bare(dir)
  assert.match(step.stdout, new RegExp(droppedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'a session reading only "see the menu file\'s droppedForCurrency" without the label in front of it has to open a second file mid-interview just to learn which option was dropped — the step text itself must name the label')

  // Same dimension, corrupted menu file: the defensive read must degrade, never throw.
  fs.writeFileSync(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), 'not json{{{')
  const degraded = bare(dir)
  assert.strictEqual(degraded.status, 0, 'a corrupt menu file must never crash the driver mid-step — a session that hit this would be left with no step text at all instead of a degraded-but-readable one: ' + degraded.stderr)
  assert.match(degraded.stdout, /some option\(s\) dropped for currency/, 'reading an unparseable menu file must fall back to the generic wording so the session still learns something was dropped, even without a label to show')
})

test('review finding F3 (D1): --state at the post-decided state prints SCAFFOLD without executing scaffoldCommand, writing scaffold.log, or touching status.json, and a later bare invocation still runs the scaffold correctly', () => {
  const dir = tmpdir('gdrv-f3-peek')
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir, { scaffoldCommand: 'touch SIDE_EFFECT_MARKER.txt' })
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)

  const statusPath = path.join(dir, '.claude/genesis/status.json')
  const mtimeBefore = fs.statSync(statusPath).mtimeMs

  const peek = state(dir)
  assert.strictEqual(peek.stdout, 'SCAFFOLD\n', '--state is documented as a read-only peek that prints the state name and a newline only — anything else here means it executed driver logic instead of just reporting on it')

  const markerPath = path.join(dir, 'SIDE_EFFECT_MARKER.txt')
  assert.strictEqual(fs.existsSync(markerPath), false, '--state must never execute scaffoldCommand — a marker file appearing here is the exact incident this test pins: a documented "read-only" peek that ran a real side-effecting shell command')
  assert.strictEqual(fs.existsSync(path.join(dir, '.claude/genesis/scaffold.log')), false, '--state must not write scaffold.log — its presence means the peek ran the scaffold step instead of only deriving state from what is already on disk')
  const statusAfterPeek = statusOf(dir)
  assert.strictEqual(statusAfterPeek.scaffold, null, '--state must leave status.json\'s scaffold field unset — a recorded scaffold result means the peek executed and persisted a real run')
  const mtimeAfterPeek = fs.statSync(statusPath).mtimeMs
  assert.strictEqual(mtimeAfterPeek, mtimeBefore, 'status.json must not be rewritten by a peek — any mtime change means --state took the same save-status side effect a bare invocation takes, defeating its purpose as a peek safe to call at any time')

  const scaffoldRun = bare(dir)
  assert.ok(fs.existsSync(markerPath), 'a subsequent bare invocation must still actually run the scaffold — the earlier peek must not have consumed or short-circuited the real work')
  assert.match(scaffoldRun.stdout, /SKELETON/, 'once the scaffold genuinely runs, the bare invocation must advance to SKELETON exactly as it would have without the earlier peek')
})

// logTail excerpt-size regression (found in the fix-delta pass of the review of
// specs/20260825/04-genesis-driver.md, already fixed in genesis-driver.js by the time this file
// was written — no AC-ID and no F-id: this defect was found against the F6 fix itself, one
// review pass later, so per this repo's review-finding convention these are named by the
// invariant, with no id token to fabricate). F6 (above) stopped runShell from piping
// scaffoldCommand/gateCommand through spawnSync's 1 MiB maxBuffer by streaming straight to the
// log fd, correctly letting a log grow past 1 MiB. But logTail — which quotes the log back
// inside the GATE_RED/SCAFFOLD_RED step text embedded in the driver's OWN stdout — bounded its
// excerpt by LINE COUNT ONLY (`text.split('\n').slice(-n)`). A gate command emitting one
// unbroken multi-megabyte line with no newline (realistic `\r`-driven progress output) makes
// "the last 20 lines" the WHOLE file, so the driver's own stdout inherits the size the F6 fix
// existed to remove — any caller capturing that stdout with a default-sized buffer (this file's
// own `mark()`/`bare()` helpers included) dies with the identical ENOBUFS-class failure one layer
// up. The fix reads only a trailing LOGTAIL_MAX_BYTES (4096) window off disk before ever slicing
// lines, and attaches a "truncated" marker naming the full log's path whenever either the byte
// window or the line slice dropped content — proven below by a third test asserting the
// marker's ABSENCE on a log that fits inside both bounds, since a marker that never disappears
// means nothing when it does appear.

test('a gateCommand emitting one unbroken multi-megabyte line with no newline still keeps the driver\'s own stdout small and the log on disk complete, instead of embedding the whole file into GATE_RED\'s excerpt and overflowing a caller\'s default maxBuffer', () => {
  const dir = tmpdir('gdrv-logtail-oneline')
  // head/tr, not node -e "process.stdout.write(...)" — the latter self-truncates at the 64 KiB
  // async pipe-flush ceiling this file's writeOut() comment already documents, before the bytes
  // ever reach the driver; coreutils piped through bash -c has no such ceiling.
  const bigLineGateCmd = "head -c 3000000 /dev/zero | tr '\\0' 'x'; exit 1"
  advanceThroughScaffold(dir, { gateCommand: bigLineGateCmd })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.error, undefined, 'the outer runNode call must not itself fail to spawn or read its child — an error here means the driver\'s own stdout already overflowed this test\'s default maxBuffer, the exact wall one layer up that the F6 fix was supposed to remove')
  assert.strictEqual(landed.status, 0, 'skeleton-landed is a valid mark regardless of the gate\'s own outcome; a null status here means the OUTER runNode call was ENOBUFS-killed reading the driver\'s stdout, not that the mark was refused: ' + landed.stderr)
  assert.ok(landed.stdout.length < 50 * 1024, 'the driver\'s own stdout is ' + landed.stdout.length + ' bytes — a bound-by-line-count logTail turns "the last 20 lines" into the whole 3,000,000-byte file when the log has no newlines, so any caller capturing this stdout through a default-sized pipe buffer dies the same ENOBUFS death the F6 fix existed to prevent, just one layer up')
  const gateLogPath = path.join(dir, '.claude/genesis/gate.log')
  const gateLogSize = fs.statSync(gateLogPath).size
  assert.ok(gateLogSize >= 3000000, 'gate.log is only ' + gateLogSize + ' bytes, short of the 3,000,000 the command emitted — the streamed log itself must stay complete even after logTail\'s excerpt is bounded, or the byte-window fix silently regressed the F6 guarantee it sits beside')
  assert.strictEqual(statusOf(dir).zeroDayGate.exit, 1, 'the true failing exit code must still be recorded even when the gate\'s output is one enormous unbroken line')
  assert.match(landed.stdout, /GATE_RED/, 'a failing gate this size must still reach GATE_RED — the state a session needs the printed step for')
  assert.match(landed.stdout, /truncated, full log at/, 'the excerpt for a log this large must carry the truncation marker — its absence would tell the reader a 3,000,000-byte single-line log is the log\'s complete content')
})

test('a gate log spanning many short lines past the byte window still carries the truncated marker naming the full log\'s path, because the byte-window slice runs before the line slice rather than after it', () => {
  const dir = tmpdir('gdrv-logtail-manylines')
  // 4000 lines of 33 bytes each (32 chars + \n) = 132,000 bytes — comfortably past the 4096-byte
  // window and the 20-line tail, so both truncation conditions this fix ORs together are live.
  const manyLinesGateCmd = "yes 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' | head -n 4000; exit 1"
  advanceThroughScaffold(dir, { gateCommand: manyLinesGateCmd })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'skeleton-landed must be accepted regardless of the gate\'s own outcome: ' + landed.stderr)
  const gateLogPath = path.join(dir, '.claude/genesis/gate.log')
  assert.strictEqual(fs.statSync(gateLogPath).size, 132000, 'the fixture must land exactly 132,000 bytes across 4,000 lines, or the byte-window-vs-line-bound arithmetic this test pins is not actually being exercised')
  assert.match(landed.stdout, /truncated, full log at [^\n]*gate\.log/, 'prepending the marker and THEN slicing the last N lines lets the line slice discard the marker itself on any window holding more than N lines — the exact defect this test pins, where the reader sees a plausible-looking excerpt with no sign it is partial or that a full log exists')
  assert.ok(landed.stdout.length < 50 * 1024, 'the driver\'s own stdout is ' + landed.stdout.length + ' bytes — the excerpt must stay bounded to the byte window even for a many-line log, not grow with the full 132,000-byte file')
})

test('a gate log that fits inside both the byte window and the line bound renders in full with no truncation marker, so the marker means something when it does appear', () => {
  const dir = tmpdir('gdrv-logtail-short')
  const shortGateCmd = 'echo short-gate-output-line; exit 1'
  advanceThroughScaffold(dir, { gateCommand: shortGateCmd })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'skeleton-landed must be accepted regardless of the gate\'s own outcome: ' + landed.stderr)
  assert.match(landed.stdout, /short-gate-output-line/, 'a log that fits inside both bounds must still render its actual content — a step text with no content here means the driver is hiding a log that had room to show')
  assert.doesNotMatch(landed.stdout, /truncated, full log at/, 'a marker on a complete excerpt would train the reader to ignore it — the marker must appear only when content was actually dropped, which a short single-line log never triggers')
})

const ONBOARDING_JOURNEY = [{ name: 'onboarding', persona: 'Priya (owner) signs in and invites staff to a live session.', labels: ['signin', 'invite', 'session-live'] }]

// specs/20260901/04-shell-composed-mocks.md D1's own Contracts example, byte-identical to
// tests/design-shell.test.js's own CANON_APP_HTML/SHELL_APP_CSS — duplicated here file-locally
// (per this file's own header comment on the cross-file fixture-sharing constraint) as a
// known-valid `design-atlas.js check` fixture for D5's new shell/data-shell/matrix checks.
const CANON_APP_HTML = '<!doctype html><html><head><meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<link rel="stylesheet" href="../tokens.css">\n' +
  '<link rel="stylesheet" href="app.css">\n' +
  '<style>* { box-sizing: border-box; }</style></head><body>\n' +
  '<div data-shell-canon="app" class="shell">\n' +
  '  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
  '    <a data-nav="inbox" href="#">Inbox</a>\n' +
  '    <a data-nav="settings" href="#">Settings</a>\n' +
  '  </nav>\n' +
  '  <header data-slot="header" data-contract="none">…</header>\n' +
  '  <main data-slot="content"></main>\n' +
  '</div></body></html>\n'
const SHELL_APP_CSS = '.shell { display: flex; gap: 1rem; }\n' +
  '.shell nav a { color: var(--text-body); font-size: 14px; line-height: 1.4; }\n'

function writeShellDirGD(dir) {
  fs.mkdirSync(path.join(dir, 'design/shell'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/shell/app.html'), CANON_APP_HTML)
  fs.writeFileSync(path.join(dir, 'design/shell/app.css'), SHELL_APP_CSS)
}

// A mock already adopted into the shell (data-shell="app", the region byte-consistent with
// CANON_APP_HTML) plus the box-sizing reset and no off-token color literals — the shape
// tests/design-shell.test.js's own "adopt --apply" test proves passes `design-atlas.js check`.
function mockDeclaringGD(label) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<link rel="stylesheet" href="../shell/app.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="' + label + '" data-status="ratified" data-shell="app">' +
    '<div data-shell-region="app" class="shell">\n' +
    '  <nav data-slot="nav" data-contract="none" aria-label="Main">\n' +
    '    <a data-nav="inbox" href="#">Inbox</a>\n' +
    '    <a data-nav="settings" href="#">Settings</a>\n' +
    '  </nav>\n' +
    '  <header data-slot="header" data-contract="none">…</header>\n' +
    '  <main data-slot="content"><h1>' + label + '</h1></main>\n' +
    '</div></div>\n'
}

// A mock with its own (undeclared) chrome, no data-shell at all — the exact D5 "consent.html
// lacking data-shell" Contracts example.
function mockNoShellGD(label) {
  return '<link rel="stylesheet" href="../tokens.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + label + '" data-status="ratified">plain, undeclared chrome</main>\n'
}

function writeCanonMd(dir, primitives) {
  writeFile(path.join(dir, 'design/mocks/canon.md'), `## Shells
none

## Primitives
${primitives.map((p) => `- **${p}** — synthetic primitive`).join('\n')}

## Rules
- One screen at a time.

## Grounding
This canon is binding: see docs/design/research-brief.md for the research basis.
`)
}

const CONSENT_JOURNEY = [{ name: 'onboarding', persona: 'Priya (owner) signs in, gathers consent, and reaches the live session.', labels: ['signin', 'consent', 'session-live'] }]

