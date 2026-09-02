'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260827/04-genesis-conventions-handoff.md D1/D2/D3/D4: a machine-readable
// ops-conventions ledger (`.claude/genesis/conventions.json`) that `--mark decided` validates;
// `--mark skeleton-landed` additionally requires every enforceable probe file plus a
// <=150-line CLAUDE.md/AGENTS.md naming the gate command and the test tree; HANDOFF is a
// judgment step that ends with `--mark profile-written --file <f> [--refresh]`, which runs
// `init-gen.js generate` itself and lands the new terminal state GROUNDED.
//
// Assumption A1 (executed micro-spike S5): `init-gen.js generate --root <dir>
// --profile <{}>` exits 2 naming `config.gateCommand`, and `tests/init-gen/generate.test.js`'s
// `baseProfile()` shape against a `gitRepo()` host generates green — the AC-4 fixture below
// copies that exact profile shape and the host under test is `gitRepo()`-initialised throughout
// this file, matching that spec's own `newHost()` pattern.

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

function markProfileWritten(dir, filePath, { refresh = false } = {}) {
  const argv = ['--root', dir, '--mark', 'profile-written', '--file', filePath]
  if (refresh) argv.push('--refresh')
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

// gitRepo()-initialised host: A1 requires it for the profile-written/init-gen leg, and it is
// harmless for the earlier decided/skeleton-landed legs, so every test in this file uses it.
function newHost(prefix) {
  const dir = tmpdir(prefix)
  gitRepo(dir)
  return dir
}

// Same shape as genesis-driver.test.js's own writeBrief (file-local duplication is deliberate —
// this file cannot require() another test file's helpers).
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for conventions-handoff.test.js.

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

function writeValidDecideArtifacts(dir, { scaffoldCommand = 'true', gateCommand = 'exit 0' } = {}) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1,
    archetype: 'data-ml',
    language: 'typescript',
    framework: 'next',
    packageManager: 'bun',
    testRunner: 'bun test',
    linter: 'eslint',
    typechecker: 'tsc',
    designCatalog: 'none',
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

// D2 requires every conventions.json row's `adr` to exist; content is otherwise unchecked.
function writeAdr0002(dir) {
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), `# 0002. Operational conventions

## Decision
See .claude/genesis/conventions.json for the row-by-row record.

## Dissents
None recorded — synthetic fixture for conventions-handoff.test.js.
`)
}

function row(key, enforceable, probe, testTree) {
  return {
    key, status: 'DECIDED', enforceable,
    probe: enforceable ? testTree + '/conventions/' + probe : null,
    reason: null, adr: 'docs/adr/0002-operational-conventions.md',
  }
}

// D1's shape, verbatim off the spec's own Contracts worked example: nine floor rows, five
// enforceable DECIDED rows carrying a probe under testTree, two non-enforceable DECIDED rows,
// two DEFERRED rows each carrying a non-empty reason.
function validConventionsObj(testTree) {
  testTree = testTree || 'tests'
  return {
    schemaVersion: 1,
    testTree,
    rows: [
      row('error-taxonomy', true, 'error-taxonomy.test.ts', testTree),
      row('logging', true, 'logging.test.ts', testTree),
      row('naming-identifiers', true, 'naming.test.ts', testTree),
      row('wire-representations', true, 'wire.test.ts', testTree),
      row('cross-plane-constants', true, 'cross-plane.test.ts', testTree),
      { key: 'env-config', status: 'DECIDED', enforceable: false, probe: null, reason: null, adr: 'docs/adr/0002-operational-conventions.md' },
      { key: 'ci', status: 'DECIDED', enforceable: false, probe: null, reason: null, adr: 'docs/adr/0002-operational-conventions.md' },
      { key: 'background-async', status: 'DEFERRED', enforceable: false, probe: null, reason: 'none-in-v1 — no unattended work in the brief', adr: 'docs/adr/0002-operational-conventions.md' },
      { key: 'success-metric', status: 'DEFERRED', enforceable: false, probe: null, reason: 'not measured in v1', adr: 'docs/adr/0002-operational-conventions.md' },
    ],
  }
}

function writeConventions(dir, obj) {
  writeJSON(path.join(dir, '.claude/genesis/conventions.json'), obj)
}

function writeAllProbes(dir, conv) {
  for (const r of conv.rows) {
    if (r.enforceable && r.status === 'DECIDED' && r.probe) {
      writeFile(path.join(dir, r.probe), '// synthetic probe placeholder for conventions-handoff.test.js\n')
    }
  }
}

function claudeMdOfLength(totalLines, { gateCommand = 'exit 0', testTree = 'tests', includeGate = true } = {}) {
  const out = ['# Grounding']
  if (includeGate) out.push('Gate command: `' + gateCommand + '`')
  out.push('Test tree: `' + testTree + '`')
  let i = 0
  while (out.length < totalLines) out.push('Filler line ' + (i++) + ' for line-count padding.')
  return out.slice(0, totalLines).join('\n')
}

function writeClaudeMd(dir, content) {
  writeFile(path.join(dir, 'CLAUDE.md'), content)
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

// baseProfile(), copied verbatim from tests/init-gen/generate.test.js per Assumption A1 (this
// file cannot require() another test file's helper; the schema shape must match exactly).
function validProfile() {
  return {
    config: {
      gateCommand: 'node --test {testDirs}',
      testCommand: 'node --test',
      setupCommand: 'npm install',
      patternsScript: 'scripts/spec-patterns.sh',
      layerGroups: [['doctrine', 'scripts']],
      agentMap: { tests: 'test-owner', scripts: 'data-layer', default: 'data-layer' },
      pipelineRules: '.claude/rules/spec-pipeline.md',
      runtime: { inert: 'synthetic test host — no bootable process' }
    },
    rules: {
      paths: ['specs/**', '.claude/**'],
      sections: {
        'Risk Tiers': 'Risk tiers body.\n',
        'Planning': 'Planning body.\n',
        'Build': 'Build body.\n',
        'Worker Rules': 'Worker rules body.\n',
        'Test Rules': 'Test rules body.\n',
        'Review Checks': 'Review checks body.\n'
      }
    },
    conventionRules: [
      { file: 'queries.md', paths: ['src/**/queries.ts'], body: 'Queries convention body.\n' }
    ],
    agents: [
      {
        name: 'data-layer', kind: 'queries', description: 'Owns the data layer.',
        model: 'sonnet', persona: 'Data layer persona body.\n',
        expertise: ['src/**/queries.ts'], reference: ['src/schema.sql'],
        constraints: ['Never raw SQL outside queries.ts']
      },
      {
        name: 'test-owner', kind: 'tests', description: 'Owns the test suite.',
        model: 'sonnet', persona: 'Test owner persona body.\n',
        expertise: ['tests/**'], reference: ['tests/helpers.js'],
        constraints: ['Never writes implementation code']
      }
    ],
    selfVerifyExamples: "`node --test 'tests/x/*.test.js'`",
    skills: {
      specVerify: { description: 'Use to verify the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'spec-verify body.\n' },
      run: { description: 'Use to run the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'run body.\n' }
    },
    settings: { extraAllow: [], extraDeny: [] },
    patternSweeps: ['sweep "as any" -e \':\\s*any\' -g \'!*.test.ts\''],
    sourceRoot: 'src',
    manifestExtras: [],
    probeOutcomes: {
      testCommand: { failsLoud: true },
      atRisk: { applicable: true }
    }
  }
}

// Drives a fresh gitRepo() host to DECIDE (archetype data-ml, non-visual, non-tournament, so
// menus-done lands DECIDE directly — the same shortest path genesis-driver.test.js's own
// advanceToDecide uses).
function advanceToDecide(dir) {
  bare(dir)
  writeBrief(dir)
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief: ' + disco.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted for archetype data-ml: ' + done.stderr)
  return done
}

// Drives from DECIDE through a valid decided mark (descriptor + hosting ADR + a fully valid
// conventions.json + its ADR) into a completed scaffold, reaching SKELETON — the point at which
// AC-2's probe/binding-subset checks apply.
function advanceToSkeleton(dir, opts = {}) {
  advanceToDecide(dir)
  writeValidDecideArtifacts(dir, opts)
  writeAdr0002(dir)
  writeConventions(dir, opts.conventions || validConventionsObj())
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted with a valid descriptor, hosting ADR, and conventions.json: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  return scaffolded
}

// Drives all the way to HANDOFF (data-ml is design-skipped, so roadmap-written lands HANDOFF
// directly, exactly as genesis-driver.test.js's own AC-20260825-04-7 pin already exercises).
function advanceToHandoff(dir, opts = {}) {
  advanceToSkeleton(dir, opts)
  const conv = opts.conventions || validConventionsObj()
  writeAllProbes(dir, conv)
  writeClaudeMd(dir, claudeMdOfLength(10))
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted with every probe file and a valid CLAUDE.md present: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green gateCommand to reach ROADMAP: ' + landed.stdout)
  writeRoadmap(dir, [{ name: '01-a.md', dependsOn: '—' }])
  const roadmapped = mark(dir, 'roadmap-written')
  assert.strictEqual(roadmapped.status, 0, 'test setup requires roadmap-written to be accepted: ' + roadmapped.stderr)
  assert.match(roadmapped.stdout, /state: HANDOFF/, 'test setup requires archetype data-ml (design-skipped) to reach HANDOFF straight after roadmap-written: ' + roadmapped.stdout)
  return roadmapped
}

test('AC-20260827-04-1: --mark decided refuses a missing conventions.json, a missing floor row, an empty-reason DEFERRED row, and a probe outside testTree, each naming the offending key, and accepts a fully valid conventions.json (including the shipped template itself), advancing to SCAFFOLD', () => {
  const noFile = tmpdir('conv-ac1-nofile')
  advanceToDecide(noFile)
  writeValidDecideArtifacts(noFile)
  writeAdr0002(noFile)
  const r1 = mark(noFile, 'decided')
  assert.strictEqual(r1.status, 2, 'D2: decided must refuse when .claude/genesis/conventions.json does not exist at all — accepting it would land the decision record with no machine-readable ops-conventions ledger at all: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /conventions\.json/, 'the refusal must name "conventions.json" so the session knows exactly which artifact is missing')

  const missingRow = tmpdir('conv-ac1-missingrow')
  advanceToDecide(missingRow)
  writeValidDecideArtifacts(missingRow)
  writeAdr0002(missingRow)
  const conv = validConventionsObj()
  conv.rows = conv.rows.filter((r) => r.key !== 'logging')
  writeConventions(missingRow, conv)
  const r2 = mark(missingRow, 'decided')
  assert.strictEqual(r2.status, 2, 'D2: decided must refuse when a floor key is missing from conventions.json rows — the nine floor keys are required per D1, and a silently-dropped one means a whole ops-conventions dimension was never actually decided or deferred: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /logging/, 'the refusal must name the missing floor key "logging" so the session knows which row to add')

  const emptyReason = tmpdir('conv-ac1-emptyreason')
  advanceToDecide(emptyReason)
  writeValidDecideArtifacts(emptyReason)
  writeAdr0002(emptyReason)
  const conv2 = validConventionsObj()
  const bgRow = conv2.rows.find((r) => r.key === 'background-async')
  bgRow.reason = ''
  writeConventions(emptyReason, conv2)
  const r3 = mark(emptyReason, 'decided')
  assert.strictEqual(r3.status, 2, 'D2: decided must refuse a DEFERRED row whose reason is empty — a deferred convention with no recorded reason is indistinguishable from one nobody ever considered: ' + JSON.stringify(r3))
  assert.match(r3.stderr, /background-async/, 'the refusal must name the offending key "background-async" so the session knows which row to fix')
  assert.match(r3.stderr, /reason/, 'the refusal must name "reason" so the session knows which field of that row is the problem')

  const badProbe = tmpdir('conv-ac1-badprobe')
  advanceToDecide(badProbe)
  writeValidDecideArtifacts(badProbe)
  writeAdr0002(badProbe)
  const conv3 = validConventionsObj()
  const errRow = conv3.rows.find((r) => r.key === 'error-taxonomy')
  errRow.probe = 'src/x.test.ts'
  writeConventions(badProbe, conv3)
  const r4 = mark(badProbe, 'decided')
  assert.strictEqual(r4.status, 2, 'D2: decided must refuse an enforceable row whose probe does not begin with "<testTree>/" — a probe living outside the host\'s own test tree can never be picked up by the gate command that runs that tree: ' + JSON.stringify(r4))
  assert.match(r4.stderr, /error-taxonomy/, 'the refusal must name the offending key "error-taxonomy"')
  assert.match(r4.stderr, /tests\//, 'the refusal must name the expected "tests/" prefix so the session knows exactly what its probe path is missing')

  const ok = tmpdir('conv-ac1-ok')
  advanceToDecide(ok)
  writeValidDecideArtifacts(ok)
  writeAdr0002(ok)
  writeConventions(ok, validConventionsObj())
  const r5 = mark(ok, 'decided')
  assert.strictEqual(r5.status, 0, 'a conventions.json with every floor row DECIDED-with-probe or DEFERRED-with-reason must be accepted: ' + r5.stderr)
  assert.match(r5.stdout, /SCAFFOLD/, 'a successful decided mark must still advance straight to SCAFFOLD — D2 only ADDS a validation gate ahead of the existing decideCheck() closure, it never changes what a passing decided does next: ' + r5.stdout)

  const templatePath = path.join(SPEC, 'templates/conventions.json')
  assert.ok(fs.existsSync(templatePath), 'D1: spec/templates/conventions.json must exist — its absence means the shipped starting-point template this spec introduces was never created')
  const templateDir = tmpdir('conv-ac1-template')
  advanceToDecide(templateDir)
  writeValidDecideArtifacts(templateDir)
  writeAdr0002(templateDir)
  fs.mkdirSync(path.join(templateDir, '.claude/genesis'), { recursive: true })
  fs.copyFileSync(templatePath, path.join(templateDir, '.claude/genesis/conventions.json'))
  const r6 = mark(templateDir, 'decided')
  assert.strictEqual(r6.status, 0, 'D1: the shipped spec/templates/conventions.json, copied byte-for-byte into a host, must itself pass the same "decided" validation this AC pins — a template that fails its own schema check would ship every genesis project a starting point it immediately trips on: ' + r6.stderr)
})

test('AC-20260827-04-2: --mark skeleton-landed refuses a missing enforceable probe file naming the key and path, refuses no CLAUDE.md/AGENTS.md naming CLAUDE.md, refuses a 151-line CLAUDE.md naming 151, refuses a CLAUDE.md missing the gateCommand literal naming gateCommand, and accepts once all four hold, recording architect: scaffold-complete', () => {
  const missingProbe = tmpdir('conv-ac2-missingprobe')
  advanceToSkeleton(missingProbe)
  const conv = validConventionsObj()
  const rowsExceptOne = conv.rows.filter((r) => r.key !== 'error-taxonomy')
  writeAllProbes(missingProbe, { rows: rowsExceptOne })
  writeClaudeMd(missingProbe, claudeMdOfLength(10))
  const r1 = mark(missingProbe, 'skeleton-landed')
  assert.strictEqual(r1.status, 2, 'D3: skeleton-landed must refuse when an enforceable DECIDED row\'s probe file does not exist on disk yet — a row that claims a probe with no landed file behind it means the gate is not actually enforcing anything for that convention: ' + JSON.stringify(r1))
  assert.match(r1.stderr, /error-taxonomy/, 'the refusal must name the key "error-taxonomy" whose probe is missing')
  assert.match(r1.stderr, /tests\/conventions\/error-taxonomy\.test\.ts/, 'the refusal must name the exact missing path so the session knows exactly which file to land')

  const noBindingSubset = tmpdir('conv-ac2-nobinding')
  advanceToSkeleton(noBindingSubset)
  writeAllProbes(noBindingSubset, validConventionsObj())
  const r2 = mark(noBindingSubset, 'skeleton-landed')
  assert.strictEqual(r2.status, 2, 'D3: skeleton-landed must refuse when neither CLAUDE.md nor AGENTS.md exists — every probe file landing with no binding-subset doc means agents have no ≤150-line pointer at the gate command and the test tree: ' + JSON.stringify(r2))
  assert.match(r2.stderr, /CLAUDE\.md/, 'the refusal must name "CLAUDE.md" (or AGENTS.md) so the session knows which file to author')

  const tooLong = tmpdir('conv-ac2-toolong')
  advanceToSkeleton(tooLong)
  writeAllProbes(tooLong, validConventionsObj())
  writeClaudeMd(tooLong, claudeMdOfLength(151))
  const r3 = mark(tooLong, 'skeleton-landed')
  assert.strictEqual(r3.status, 2, 'D3: skeleton-landed must refuse a CLAUDE.md over the 150-line cap — a binding subset that has grown past one page has stopped being the thing agents actually read: ' + JSON.stringify(r3))
  assert.match(r3.stderr, /\b151\b/, 'the refusal must name the measured line count "151" so the session knows exactly how far over the cap the file is')

  const noGateLiteral = tmpdir('conv-ac2-nogate')
  advanceToSkeleton(noGateLiteral)
  writeAllProbes(noGateLiteral, validConventionsObj())
  writeClaudeMd(noGateLiteral, claudeMdOfLength(10, { includeGate: false }))
  const r4 = mark(noGateLiteral, 'skeleton-landed')
  assert.strictEqual(r4.status, 2, 'D3: skeleton-landed must refuse a CLAUDE.md that never names the descriptor\'s gateCommand literal — a binding subset that does not say what the gate command IS gives an agent no way to run it: ' + JSON.stringify(r4))
  assert.match(r4.stderr, /gateCommand/, 'the refusal must name "gateCommand" so the session knows which literal is missing from the file')

  const ok = tmpdir('conv-ac2-ok')
  advanceToSkeleton(ok)
  writeAllProbes(ok, validConventionsObj())
  writeClaudeMd(ok, claudeMdOfLength(10))
  const r5 = mark(ok, 'skeleton-landed')
  assert.strictEqual(r5.status, 0, 'every enforceable probe file present plus a valid, in-cap CLAUDE.md naming the gate command must be accepted: ' + r5.stderr)
  assert.strictEqual(statusOf(ok).architect, 'scaffold-complete', 'D3: the zero-day gate must still run exactly as before once the new probe/binding-subset checks pass — a gateCommand of "exit 0" must still flip architect to scaffold-complete')
  assert.match(r5.stdout, /ROADMAP/, 'a green gate must still advance to ROADMAP once the new D3 checks pass')
})

test('AC-20260827-04-3: a bare run reaching HANDOFF prints a step naming init-profile.json and --mark profile-written, and --mark profile-written --file f run with {} exits 2 with stderr naming exited 2, config.gateCommand, and the init-gen.log path, writes that log, leaves status.handoff null, and --state still prints HANDOFF', () => {
  const dir = newHost('conv-ac3')
  advanceToHandoff(dir)

  const step = bare(dir)
  assert.match(step.stdout, /init-profile\.json/, 'D4: the HANDOFF step must name init-profile.json — its absence means the session has no printed pointer to the file it is about to author')
  assert.match(step.stdout, /--mark profile-written/, 'D4: the HANDOFF step must name the "--mark profile-written" command — its absence means the session has no printed command to close the step with')
  assert.match(step.stdout, /init\.md/, 'D4: the HANDOFF step must point at spec/commands/init.md (Phase 4\'s profile schema) — its absence leaves the session with no named source for what the profile must contain')

  writeJSON(path.join(dir, '.claude/genesis/init-profile.json'), {})
  const refused = markProfileWritten(dir, '.claude/genesis/init-profile.json')
  assert.strictEqual(refused.status, 2, 'D4: profile-written must refuse an empty profile — init-gen.js generate exits non-zero on it (Assumption A1), and the driver must never treat that as a pass: ' + JSON.stringify(refused))
  assert.match(refused.stderr, /exited 2/, 'the refusal must say "exited 2", naming the exact init-gen exit code it observed')
  assert.match(refused.stderr, /config\.gateCommand/, 'the refusal must carry init-gen\'s own "config.gateCommand" field name — a generic "profile invalid" message would leave the session to re-run generate itself just to learn what field is missing')
  assert.match(refused.stderr, /\.claude\/genesis\/init-gen\.log/, 'the refusal must name the log path .claude/genesis/init-gen.log so the session can read the untruncated output')
  assert.ok(fs.existsSync(path.join(dir, '.claude/genesis/init-gen.log')), 'the init-gen.log file must actually exist on disk after a refused profile-written — a refusal that never writes the log it names would leave the session with no way to read the "truncated" excerpt in full')

  assert.strictEqual(statusOf(dir).handoff, null, 'a refused profile-written must leave status.handoff null — recording a non-null handoff on a failed run would make a re-invoking session believe grounding already happened')
  assert.strictEqual(state(dir).stdout, 'HANDOFF\n', 'after a refused profile-written, --state must still print exactly "HANDOFF" — a refused mark must never advance the derived state')
})

test('AC-20260827-04-4: --mark profile-written --file f run with a valid baseProfile()-shape profile on a git-initialised root exits 0, writes .claude/spec.config.json with generatedBy and contractHash, records handoff.initGenExit 0, prints the (HANDOFF → GROUNDED) checkpoint, and the next bare run prints state: GROUNDED with next: /spec:enforce and convention probes: 5; re-running the mark without --refresh after the config was hand-edited exits 2 naming --refresh', () => {
  const dir = newHost('conv-ac4')
  advanceToHandoff(dir)

  writeJSON(path.join(dir, '.claude/genesis/init-profile.json'), validProfile())
  const accepted = markProfileWritten(dir, '.claude/genesis/init-profile.json')
  assert.strictEqual(accepted.status, 0, 'A1: a baseProfile()-shape profile against a gitRepo()-initialised host must be accepted by profile-written — the same profile shape generates green directly against init-gen.js in tests/init-gen/generate.test.js\'s own AC-20260822-02-1: ' + accepted.stderr)

  const cfgPath = path.join(dir, '.claude/spec.config.json')
  assert.ok(fs.existsSync(cfgPath), 'a successful profile-written must write .claude/spec.config.json — its absence means init-gen generate never actually ran, or ran and was not observed')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  assert.ok(cfg.generatedBy, 'the written spec.config.json must carry a non-empty generatedBy — its absence means the host has no record of which contract version grounded it')
  assert.ok(cfg.contractHash, 'the written spec.config.json must carry a non-empty contractHash — its absence breaks the state-gate hook\'s drift detection for every future session on this host')

  assert.strictEqual(statusOf(dir).handoff.initGenExit, 0, 'D4: status.handoff.initGenExit must record 0 on a successful run — a durable record of the observed exit code is what lets a re-invoking session trust the grounding without re-running generate')
  assert.match(accepted.stdout.trimEnd().split('\n').pop(), /\(HANDOFF → GROUNDED\)/, 'a successful profile-written must print the (HANDOFF → GROUNDED) checkpoint — its absence means the session has no signal that genesis just reached its terminal state')

  const next = bare(dir)
  assert.match(next.stdout, /state: GROUNDED/, 'D4: the next bare invocation after a successful profile-written must re-derive GROUNDED from the recorded handoff — a state other than GROUNDED here means the terminal state was never actually reached, or re-entry is broken')
  assert.match(next.stdout, /next: \/spec:enforce/, 'D5: GROUNDED must print next: /spec:enforce — greenfield genesis is init + enforce, and a different (or missing) next command strands the session with no printed chain to follow')
  assert.match(next.stdout, /convention probes: 5/, 'GROUNDED must print "convention probes: 5" — this fixture\'s conventions.json carries exactly five enforceable DECIDED rows, and a wrong or missing count means the report is not actually reading the landed probe set')

  // init-gen.js's own diff (buildFileTargets' CONFIG_RELPATH target, spec/scripts/init-gen.js:376)
  // strips exactly `generatedBy`/`contractHash` from BOTH sides before comparing (line 465-469) —
  // a hand-edit to either key can never differ from the profile's own re-derivation, so it could
  // never trigger the exit-3 refresh refusal this sub-case exists to prove. Hand-editing
  // `gateCommand` instead (a field the diff never strips) is a real divergence from what the
  // profile would regenerate — the fixture this AC's promise actually needs.
  const hand = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  hand.gateCommand = 'hand-edited-for-conventions-handoff-test'
  fs.writeFileSync(cfgPath, JSON.stringify(hand, null, 2))
  const reRun = markProfileWritten(dir, '.claude/genesis/init-profile.json')
  assert.strictEqual(reRun.status, 2, 'D4/Behavior: re-running profile-written without --refresh once .claude/spec.config.json has been hand-edited to differ must be refused, never silently overwritten — init-gen exits 3 for exactly this case, and the driver\'s own exit stays 2: ' + JSON.stringify(reRun))
  assert.match(reRun.stderr, /--refresh/, 'the refusal must name "--refresh" so the session knows the remedy is re-marking with that flag, not hand-fixing the config itself')
})
