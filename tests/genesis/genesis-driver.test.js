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
function advanceToDecide(dir) {
  advanceToMenus(dir)
  writeJSON(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'), {
    dimension: DIM,
    options: [{ label: 'AWS', packages: [] }],
  })
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
  writeBrief(dir, { picks: ['- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted once every open dimension has a pick: ' + done.stderr)
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

test('AC-20260825-04-3: MENUS lists an undiscovered open dimension, menu-written records a zero-package registry pass, and menus-done gates on the picks list', () => {
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

  writeBrief(dir, { dims: { [DIM]: 'open', persistence: 'constrained' }, picks: ['- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'menus-done must be accepted once every open dimension has both a menu and a pick line: ' + done.stderr)
  assert.strictEqual(state(dir).stdout, 'DECIDE\n', 'a completed menus-done must advance the derived state to DECIDE')
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

test('AC-20260825-04-5: SCAFFOLD executes scaffoldCommand exactly once, records scaffold.exit, writes scaffold.log, and reprints SKELETON', () => {
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
  assert.strictEqual(fs.existsSync(scaffoldedFile), false, 'a second bare invocation must NOT re-execute scaffoldCommand once scaffold.exit === 0 is already recorded — idempotence is what makes /clear safe here')
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
