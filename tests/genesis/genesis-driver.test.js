'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260825/04-genesis-driver.md (2026-08-26, TDD red): the architect stage becomes
// driver-stepped — one script, spec/scripts/genesis-driver.js, derives state from
// .claude/genesis/status.json plus on-disk artifacts on every invocation, runs every
// deterministic check itself (coverage audit, registry check, decision-record closure,
// scaffold, zero-day gate, roadmap closure), and prints only the one step needing judgment.
// None of AC-1..AC-7 can pass yet — spec/scripts/genesis-driver.js does not exist.
//
// Fixtures use packages: [] in every menu option so registry-check.js (invoked by the driver
// for `menu-written`) never probes a network endpoint (spec D16).

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

// Writes .claude/genesis/brief.md with all ten coverage keys defaulted to `covered`, one open
// dimension (`hosting`), and whatever pick lines the caller supplies — the one artifact every
// DISCOVERY/MENUS-stage test needs, built once here instead of six times inline.
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for genesis-driver.test.js.

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

// Drives the real binary from an empty root through the coverage-audit gate to MENUS.
function advanceToMenus(dir) {
  bare(dir)
  writeBrief(dir)
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief: ' + r.stderr)
  return r
}

// Drives from MENUS through the registry-check menu write and the picks gate to DECIDE.
//
// specs/20260827/01-genesis-tournament.md D2/D15 (AC-20260827-01-9): --mark menus-done now also
// requires a `- archetype: <key>` line in ## Picks. `archetype` defaults to the non-tournament
// key `data-ml` — D15 (orchestrator ruling, 2026-08-27) is explicit that this shared fixture
// must NOT default to a tournament archetype (e.g. web-app): every caller of this helper
// (AC-20260825-04-4/-5/-6/-7 and the F1/F3/F6/logtail regressions below) asserts DECIDE straight
// after menus-done and then drives on into SCAFFOLD/GATE, and a tournament archetype would stop
// them at FINALISTS instead, forcing those existing pins to be rewritten — exactly what the
// worker contract forbids. Only AC-20260825-04-3 below passes a different archetype, to exercise
// D1's tournament routing itself.
function advanceToDecide(dir, archetype = 'data-ml') {
  advanceToMenus(dir)
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

// Drives from an empty root all the way to DECIDE with valid decide-stage artifacts, then
// accepts \`decided\`, then runs the bare invocation that executes SCAFFOLD (driver-only).
function advanceThroughScaffold(dir, opts = {}) {
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir, opts)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted with a complete descriptor and ADR: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
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

## Result
Something observable.
`)
  }
}

test('AC-20260825-04-1: a cold --root creates status.json schemaVersion 2 with the template key set and prints state: DISCOVERY', () => {
  const dir = tmpdir('gdrv-ac1')
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a cold empty root must be a valid starting point, not a driver error: ' + r.stderr)
  const statusPath = path.join(dir, '.claude/genesis/status.json')
  assert.ok(fs.existsSync(statusPath), 'the driver must create .claude/genesis/status.json on first invocation so re-entry has something to derive state from')
  const st = JSON.parse(fs.readFileSync(statusPath, 'utf8'))
  assert.strictEqual(st.schemaVersion, 2, 'a v1 status.json silently starves the driver of marks/menus/scaffold/zeroDayGate — the file must be created as v2')
  assert.deepStrictEqual(Object.keys(st).sort(), [
    'architect', 'archetype', 'design', 'designManifestPath', 'explore', 'gateCommand',
    'lastUpdated', 'localeScope', 'marks', 'menus', 'scaffold', 'schemaVersion',
    'stackDescriptorPath', 'zeroDayGate',
  ].sort(), 'a missing or extra key here means the driver and status.json template have drifted apart, breaking every downstream mark that reads a specific key')
  assert.match(r.stdout, /^\[genesis-driver\] state: DISCOVERY/, 'the printed state line is the one thing a re-invoking session reads to know what to do next')
  const s = state(dir)
  assert.strictEqual(s.stdout, 'DISCOVERY\n', '--state must print exactly the state name and a newline so scripting callers never have to parse the full step text')
})

test('AC-20260825-04-2: --mark discovery-done refuses a dark coverage key by name and accepts once every key is covered/n-a', () => {
  const dir = tmpdir('gdrv-ac2')
  bare(dir)
  writeBrief(dir, { coverage: { residency: 'dark' } })
  const refused = mark(dir, 'discovery-done')
  assert.strictEqual(refused.status, 2, 'a dark coverage key means the interview left a required question unasked — the mark must be refused, not silently accepted')
  assert.match(refused.stderr, /residency/, 'the refusal must name the dark key so the session knows exactly which question to ask next')

  writeBrief(dir, { coverage: {} })
  const accepted = mark(dir, 'discovery-done')
  assert.strictEqual(accepted.status, 0, 'a brief with every coverage key covered must be accepted: ' + accepted.stderr)
  const lines = accepted.stdout.trimEnd().split('\n')
  assert.match(lines[lines.length - 1], /^✅ checkpoint — genesis state saved \(DISCOVERY → MENUS\); safe to \/clear/, 'the checkpoint line is the session\'s only signal that it is safe to /clear and re-invoke — losing it strands the session mid-context')

  const next = bare(dir)
  assert.match(next.stdout, /state: MENUS/, 'the very next bare invocation must re-derive MENUS from the recorded mark, or re-entry after /clear is broken')
  const stepLines = next.stdout.split('\n').filter((l) => l.trim().length > 0)
  const stepHeadingIdx = stepLines.findIndex((l) => l.startsWith('## Step:'))
  assert.notStrictEqual(stepHeadingIdx, -1, 'every non-terminal state must print a ## Step: heading naming what the session does next')
  assert.match(stepLines[stepHeadingIdx + 1], /^Read only:/, 'D9 requires every step body to open with a Read only: file list so the session never re-reads the whole .claude/genesis/ directory')
})

test('AC-20260825-04-3, AC-20260827-01-9: MENUS lists an undiscovered open dimension, menu-written records a zero-package registry pass, and menus-done gates on the picks list and (D15) continues to reach DECIDE straight from MENUS for the non-tournament archetype data-ml', () => {
  const dir = tmpdir('gdrv-ac3')
  advanceToMenus(dir)
  writeBrief(dir, { dims: { [DIM]: 'open', persistence: 'constrained' } })
  const step = bare(dir)
  assert.match(step.stdout, /open, no menu yet:[^\n]*\bhosting\b/, 'a dimension with no menu file and no pick line must be listed as open with no menu yet, naming it by key so the session knows what to research')
  assert.doesNotMatch(step.stdout.match(/open, no menu yet:[^\n]*/)[0], /\bpersistence\b/, 'a constrained dimension must never appear in the open-dimensions reading list — it was already decided by a coverage answer')

  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'a menu whose options carry packages: [] must be accepted — registry-check.js probes nothing and exits 0: ' + written.stderr)
  const st1 = statusOf(dir)
  assert.strictEqual(st1.menus[DIM].registryExit, 0, 'the recorded registry exit is what a re-invoking session trusts instead of re-running registry-check.js itself')
  assert.match(written.stdout.trimEnd().split('\n').pop(), /^✅ checkpoint —/, 'menu-written is a re-enterable checkpoint like every other accepted mark')

  const tooEarly = mark(dir, 'menus-done')
  assert.strictEqual(tooEarly.status, 2, 'menus-done must be refused while hosting has a menu but no pick line under ## Picks — the interview is not finished')
  assert.match(tooEarly.stderr, /hosting/, 'the refusal must name the dimension missing its pick so the session knows what to ask')

  writeBrief(dir, { dims: { [DIM]: 'open', persistence: 'constrained' }, picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'menus-done must be accepted once every open dimension has both a menu and a pick line, and a valid archetype line is present (D2): ' + done.stderr)
  assert.strictEqual(state(dir).stdout, 'DECIDE\n', 'AC-20260827-01-9/D15: a completed menus-done for the non-tournament archetype data-ml must CONTINUE TO advance the derived state straight to DECIDE, exactly as before this spec — a state other than DECIDE here means D1\'s tournament routing wrongly caught a non-tournament archetype')
})

test('AC-20260825-04-4: --mark decided refuses each of a missing scaffoldCommand, an empty Dissents section, and an unnamed open dimension by name, and accepts once all three hold', () => {
  const missingScaffold = tmpdir('gdrv-ac4a')
  advanceToDecide(missingScaffold)
  writeValidDecideArtifacts(missingScaffold)
  const descPath = path.join(missingScaffold, '.claude/genesis/stack-descriptor.json')
  const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'))
  delete desc.scaffoldCommand
  writeJSON(descPath, desc)
  const r1 = mark(missingScaffold, 'decided')
  assert.strictEqual(r1.status, 2, 'a descriptor missing scaffoldCommand can never run the scaffold step, so decided must refuse it')
  assert.match(r1.stderr, /scaffoldCommand/, 'the refusal must name the missing key, not a generic "descriptor invalid" message')

  const emptyDissents = tmpdir('gdrv-ac4b')
  advanceToDecide(emptyDissents)
  writeValidDecideArtifacts(emptyDissents)
  const adrPath = path.join(emptyDissents, 'docs/adr/0001-hosting.md')
  writeFile(adrPath, `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents

## Applies to
None.
`)
  const r2 = mark(emptyDissents, 'decided')
  assert.strictEqual(r2.status, 2, 'an ADR whose Dissents heading is followed by no non-blank line before the next heading loses the recorded minority-option evidence and must refuse the mark')
  assert.match(r2.stderr, /0001-hosting\.md/, 'the refusal must name the offending ADR path so the session knows which file to fix')

  const unnamedDim = tmpdir('gdrv-ac4c')
  advanceToDecide(unnamedDim)
  writeValidDecideArtifacts(unnamedDim)
  writeFile(path.join(unnamedDim, 'docs/adr/0001-hosting.md'), `# 0001. Some decision

## Decision
A choice unrelated to the open dimension key.

## Dissents
No minority option surfaced.
`)
  const r3 = mark(unnamedDim, 'decided')
  assert.strictEqual(r3.status, 2, 'an open dimension named in no ADR was never actually decided anywhere durable — the mark must refuse it')
  assert.match(r3.stderr, /hosting/, 'the refusal must name the undecided dimension key')

  const ok = tmpdir('gdrv-ac4d')
  advanceToDecide(ok)
  writeValidDecideArtifacts(ok)
  const r4 = mark(ok, 'decided')
  assert.strictEqual(r4.status, 0, 'a complete descriptor plus a valid, dimension-naming ADR must be accepted: ' + r4.stderr)
  assert.strictEqual(statusOf(ok).architect, 'decisions-recorded', 'a successful decided mark must flip architect to decisions-recorded so downstream hooks/commands see the closure')
  const next = bare(ok)
  assert.doesNotMatch(next.stdout, /state: (DISCOVERY|MENUS|DECIDE)\b/, 'the invocation after a successful decided mark must have moved past DECIDE into the driver-owned scaffold/gate stages')
})

test('AC-20260825-04-5, AC-20260827-01-9: SCAFFOLD executes scaffoldCommand exactly once, records scaffold.exit, writes scaffold.log, and reprints SKELETON, and (D15) a second bare invocation continues to not re-execute scaffoldCommand once it has already gone green', () => {
  const dir = tmpdir('gdrv-ac5')
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir, { scaffoldCommand: 'touch scaffolded.txt' })
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)

  const scaffoldRun = bare(dir)
  const scaffoldedFile = path.join(dir, 'scaffolded.txt')
  assert.ok(fs.existsSync(scaffoldedFile), 'the bare invocation reaching SCAFFOLD must actually execute scaffoldCommand inside --root, not just narrate it')
  const st = statusOf(dir)
  assert.strictEqual(st.scaffold.exit, 0, 'a successful scaffoldCommand run must record scaffold.exit === 0 so re-invocation knows not to re-run it')
  assert.ok(fs.existsSync(path.join(dir, '.claude/genesis/scaffold.log')), 'scaffold stdout/stderr must be captured to scaffold.log so a failure can be diagnosed without re-running the command')
  assert.match(scaffoldRun.stdout, /SKELETON/, 'a green scaffold must advance straight to the SKELETON step')

  fs.unlinkSync(scaffoldedFile)
  bare(dir)
  assert.strictEqual(fs.existsSync(scaffoldedFile), false, 'AC-20260827-01-9: a second bare invocation must CONTINUE TO NOT re-execute scaffoldCommand once scaffold.exit === 0 is already recorded — idempotence is what makes /clear safe here, and the tournament\'s new FINALISTS/RACE states must not have disturbed it')
})

test('AC-20260825-04-6: skeleton-landed runs the zero-day gate, recording GATE_RED on a failing command and scaffold-complete plus a copied gateCommand on a green one', () => {
  const redDir = tmpdir('gdrv-ac6-red')
  advanceThroughScaffold(redDir, { gateCommand: 'exit 1' })
  const red = mark(redDir, 'skeleton-landed')
  assert.strictEqual(red.status, 0, 'skeleton-landed itself is a valid mark even when the gate it triggers fails — the failure is a state, not a refused mark: ' + red.stderr)
  assert.strictEqual(statusOf(redDir).zeroDayGate.exit, 1, 'a failing gateCommand must record its real exit code so the driver never silently treats a red gate as green')
  assert.match(red.stdout, /state: GATE_RED/, 'a failing zero-day gate must print GATE_RED, not silently continue to ROADMAP')
  assert.match(red.stdout, /fix scaffold-level issues|re-run/i, 'GATE_RED must print a remedy naming what to do next, per the Worker Rules requirement that every error path names its repair')
  assert.strictEqual(statusOf(redDir).architect, 'decisions-recorded', 'a failed gate must leave architect at decisions-recorded — scaffold-complete is earned only by a green gate')

  const greenDir = tmpdir('gdrv-ac6-green')
  advanceThroughScaffold(greenDir, { gateCommand: 'exit 0' })
  const green = mark(greenDir, 'skeleton-landed')
  assert.strictEqual(green.status, 0, 'a green gate must be accepted: ' + green.stderr)
  const st = statusOf(greenDir)
  assert.strictEqual(st.architect, 'scaffold-complete', 'a green zero-day gate is the one executed fact that closes the architect stage — it must flip architect to scaffold-complete')
  assert.strictEqual(st.gateCommand, 'exit 0', 'the descriptor\'s gateCommand must be copied into status.json so downstream commands never have to re-read the stack descriptor for it')
  assert.match(green.stdout, /ROADMAP/, 'a green gate must advance to ROADMAP')
})

test('AC-20260825-04-7: roadmap-written refuses a Depends-on cycle by naming it and, once acyclic, prints HANDOFF with the designCatalog-conditioned next command', () => {
  const cyclic = tmpdir('gdrv-ac7-cycle')
  advanceToRoadmap(cyclic)
  writeRoadmap(cyclic, [
    { name: '01-a.md', dependsOn: '02' },
    { name: '02-b.md', dependsOn: '01' },
  ])
  const cycleResult = mark(cyclic, 'roadmap-written')
  assert.strictEqual(cycleResult.status, 2, 'a Depends-on cycle makes the roadmap uninvokable — /spec:plan on either brief would wait forever — the mark must refuse it')
  assert.match(cycleResult.stderr, /cycle/i, 'the refusal must say what is wrong (a cycle), not just which files are involved')
  assert.match(cycleResult.stderr, /01/, 'the refusal must name a brief in the cycle so the session knows where to break it')
  assert.match(cycleResult.stderr, /02/, 'the refusal must name the other brief in the cycle too, or the session can only guess which dependency to remove')

  const noneCatalog = tmpdir('gdrv-ac7-none')
  advanceToRoadmap(noneCatalog, { designCatalog: 'none' })
  writeRoadmap(noneCatalog, [{ name: '01-a.md', dependsOn: '—' }])
  const noneAccepted = mark(noneCatalog, 'roadmap-written')
  assert.strictEqual(noneAccepted.status, 0, 'an acyclic roadmap with an overview file must be accepted: ' + noneAccepted.stderr)
  const noneHandoff = bare(noneCatalog)
  assert.match(noneHandoff.stdout, /next: \/spec:init/, 'a headless/no-catalog descriptor must hand off straight to /spec:init — there is no design stage to run')
  assert.doesNotMatch(noneHandoff.stdout, /next: \/spec:genesis-explore/, 'designCatalog: "none" must never print the design-genesis handoff — that would send the user into a stage this project has no use for')

  const storybookCatalog = tmpdir('gdrv-ac7-storybook')
  advanceToRoadmap(storybookCatalog, { designCatalog: 'storybook' })
  writeRoadmap(storybookCatalog, [{ name: '01-a.md', dependsOn: '—' }])
  const sbAccepted = mark(storybookCatalog, 'roadmap-written')
  assert.strictEqual(sbAccepted.status, 0, 'an acyclic roadmap with an overview file must be accepted: ' + sbAccepted.stderr)
  const sbHandoff = bare(storybookCatalog)
  assert.match(sbHandoff.stdout, /next: \/spec:genesis-explore/, 'a project with a design catalog must hand off into design genesis before /spec:init')
  assert.doesNotMatch(sbHandoff.stdout, /next: \/spec:init\b/, 'designCatalog: "storybook" must not also print the /spec:init handoff — HANDOFF names exactly one next command')
})

// Review findings F1, F3, F6 (specs/20260825/04-genesis-driver.md review, 2026-08-26): three
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

// logTail excerpt-size regression (found 2026-08-26 in the fix-delta pass of the review of
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
