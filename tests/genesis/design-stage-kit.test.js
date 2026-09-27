'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read, ROOT } = require('../helpers')
const { writeBrief, writeConventionsArtifacts, writeBindingSubset } = require('./tournament.fixtures.js')
const { beatHash } = require(path.join(ROOT, 'spec/scripts/lib/surfaces.js'))

// specs/20260926/05-the-kit-and-the-journey-stories.md: genesis-driver.js gains DESIGN_KIT and
// DESIGN_JOURNEYS between DESIGN_BRIEF and ROADMAP (D1), runStorybookBuild (D3), the two step
// texts (D4/D7), the kit-landed/journeys-drawn mark handlers (D5/D8), the beats writer (D6), and
// HANDOFF's design-paths read (D9). This file owns AC-20260926-05-1, -2, -6 through -18. None of
// this exists yet — every test below is red for that reason.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const STUB = path.join(ROOT, 'tests/fixtures/genesis/storybook-build-stub.js')
const FIXTURE_KIT_JOURNEYS = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/kit-and-journeys.json')
const FIXTURE_MISSING_STATE = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/missing-state.json')
const FIXTURE_JOURNEY_UNTAGGED = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/journey-untagged.json')
const TOURNAMENT_ARCHETYPES = ['web-app', 'realtime-trading', 'backend-api', 'mobile-app', 'desktop-app']

function bare(dir, opts) { return runNode(SCRIPT, ['--root', dir], opts) }
function state(dir, opts) { return runNode(SCRIPT, ['--root', dir, '--state'], opts) }
function mark(dir, name, file, opts) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv, opts)
}
function statusOf(dir) { return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8')) }
function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content) }

// ---------------------------------------------------------------------------
// Fixture plumbing — drives a synthetic host from a cold root to the green zero-day gate and
// into the design-brief-written mark, reusing the same shape spec 04's own
// tests/genesis/design-stage-brief.test.js established (this file owns its own copy per this
// repo's "each test file owns its own fixture plumbing" convention; only tournament.fixtures.js's
// shared writers are reused).
// ---------------------------------------------------------------------------

function journeyBlock(j) {
  let block = `### ${j.name}\nA fixture persona does the one thing this journey is for.\n`
  j.beats.forEach((screen, i) => { block += `${i + 1}. "beat ${i + 1}" -> ${screen}\n` })
  return block + '\n'
}

function writeSeedJourneys(dir, journeys) {
  let body = '# Seed — Fixture Product\n\n## Records\n\n## Journeys\n\n'
  for (const j of journeys) body += journeyBlock(j)
  writeFile(path.join(dir, 'design/mocks/seed.md'), body)
}

function ratifyVisualBrief(dir, journeys) {
  writeFile(path.join(dir, 'design/mocks/status.json'), JSON.stringify({
    schemaVersion: 1, state: 'APPROVED', journeys: {}, directions: {}, theme: null,
  }, null, 2))
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
    'Nothing rejected — synthetic fixture for design-stage-kit.test.js.',
  ].join('\n'))
  writeFile(path.join(dir, '.claude/genesis/design-rules.json'), JSON.stringify({ rules: [] }))
  writeFile(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')

  if (journeys && journeys.length) writeSeedJourneys(dir, journeys)

  const briefPath = path.join(dir, '.claude/genesis/brief.md')
  const text = fs.readFileSync(briefPath, 'utf8')
  const journeysSection = journeys && journeys.length
    ? journeys.map(journeyBlock).join('')
    : '(no design/mocks/seed.md for this synthetic fixture — nothing to cover)\n'
  const nonUiSection = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']
    .map((k) => `- ${k}: covered — synthetic test note`).join('\n')
  fs.writeFileSync(briefPath, text.replace(/\n?$/, '') +
    '\n\n## Journeys\n' + journeysSection + '\n## Non-UI Coverage\n' + nonUiSection + '\n')
}

function advanceToMenus(dir, archetype, journeys) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for archetype ' + archetype + ': ' + disco.stderr)
  ratifyVisualBrief(dir, journeys)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted for archetype ' + archetype + ': ' + bw.stderr)
}

function advanceToDecide(dir, archetype, journeys) {
  advanceToMenus(dir, archetype, journeys)
  writeFile(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'),
    JSON.stringify({ dimension: DIM, options: [{ label: 'AWS', packages: [] }] }))
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted: ' + done.stderr)
  if (TOURNAMENT_ARCHETYPES.includes(archetype)) {
    const skip = mark(dir, 'finalists-skipped')
    assert.strictEqual(skip.status, 0, 'test setup requires finalists-skipped to be accepted for a tournament archetype: ' + skip.stderr)
  }
}

function writeValidDecideArtifacts(dir, { archetype, designCatalog = 'storybook', gateCommand = 'true', scaffoldCommand = 'true' }) {
  writeFile(path.join(dir, '.claude/genesis/stack-descriptor.json'), JSON.stringify({
    schemaVersion: 1, archetype, language: 'typescript', framework: 'next',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog, gateCommand, scaffoldCommand,
    decisionRecords: ['docs/adr/0001-hosting.md'],
  }, null, 2))
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
}

function advanceThroughScaffold(dir, { archetype, designCatalog = 'storybook', gateCommand = 'true', scaffoldCommand = 'true' }) {
  writeValidDecideArtifacts(dir, { archetype, designCatalog, gateCommand, scaffoldCommand })
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, gateCommand)
  return scaffolded
}

function advanceToDesignBrief(dir, { archetype, designCatalog, journeys = [] }) {
  advanceToDecide(dir, archetype, journeys)
  advanceThroughScaffold(dir, { archetype, designCatalog })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  return landed
}

// ---------------------------------------------------------------------------
// D3/D6's own artifacts — design-paths.json, docs/design/brief.md, and the rules file. Mirrors
// design-stage-brief.test.js's own shapes, minus the mock-app pieces this file never exercises.
// ---------------------------------------------------------------------------

const COMPOSITES = [
  { name: 'BookingSheet', intent: 'edit one record', states: 'Idle, Saving, Error' },
  { name: 'DestructiveConfirmDialog', intent: 'confirm destructive', states: 'Idle, Confirming' },
]

// The journeys this whole file drives through — screens for the generic genesis brief.md/
// seed.md scaffolding advanceToDesignBrief needs (JOURNEYS_FOR_RATIFY), and the exact sentences
// D6/AC-12's beats file assertions pin (DETAILED_BEATS), written over the top once the host
// reaches DESIGN_KIT.
const JOURNEYS_FOR_RATIFY = [
  { name: 'first-visit', beats: ['home', 'booking'] },
  { name: 'daily-check', beats: ['home', 'today'] },
]
const DETAILED_BEATS = {
  'first-visit': [
    { sentence: 'I open the app', screen: 'home', state: null },
    { sentence: 'I tap new booking', screen: 'booking', state: 'empty' },
  ],
  'daily-check': [
    { sentence: 'I open the app', screen: 'home', state: null },
    { sentence: 'I review today', screen: 'today', state: null },
  ],
}

function writeDetailedSeedJourneys(dir, byName) {
  let body = '# Seed — Fixture Product\n\n## Records\n\n## Journeys\n\n'
  for (const [name, beats] of Object.entries(byName)) {
    body += `### ${name}\nA fixture persona does the one thing this journey is for.\n`
    beats.forEach((b, i) => {
      body += `${i + 1}. "${b.sentence}" -> ${b.screen}` + (b.state ? `@${b.state}` : '') + '\n'
    })
    body += '\n'
  }
  writeFile(path.join(dir, 'design/mocks/seed.md'), body)
}

function writeDesignPathsJson(dir, overrides = {}) {
  const base = {
    schemaVersion: 1,
    kit: 'src/components/kit',
    tokens: 'src/styles/tokens.css',
    rules: '.claude/rules/design.md',
    primitives: 'src/components/ui',
    primitivesAlias: '@/components/ui',
    journeys: 'src/journeys',
    storybook: {
      port: 6006,
      buildCommand: 'npx storybook build --test --quiet -o .claude/genesis/storybook-static',
      staticDir: '.claude/genesis/storybook-static',
    },
  }
  const merged = Object.assign({}, base, overrides)
  writeFile(path.join(dir, '.claude/genesis/design-paths.json'), JSON.stringify(merged, null, 2))
  return merged
}

function writeDesignBriefMd(dir, { journeys, composites = COMPOSITES }) {
  let body = '# Design brief — Fixture Product\n\n'
  body += '## Users and context\nFixture users, for a synthetic host.\n\n'
  body += '## Journeys\n'
  for (const j of journeys) {
    body += `### ${j.name}\nJTBD: When a fixture persona needs this, I want to do the one thing, so I can move on.\n`
  }
  body += '\n## Navigation\n| Task | Frequency | Entry |\n|------|-----------|-------|\n| do the thing | daily | home |\n\n'
  body += '## Catalog\n### Used\n### Excluded\n'
  body += '\n## Composites\n| Composite | Intent | States |\n|-----------|--------|--------|\n'
  for (const c of composites) body += `| ${c.name} | ${c.intent} | ${c.states} |\n`
  body += '\n## Contract\nTables: .claude/rules/design.md (## Intent to pattern, ## Naming).\n'
  writeFile(path.join(dir, 'docs/design/brief.md'), body)
}

function writeDesignRulesFile(dir, { composites = COMPOSITES } = {}) {
  let body = '---\npaths:\n  - "src/components/**"\n---\n# Design rules\n\n## Intent to pattern\n\n| Intent | Pattern | Composite |\n|--------|---------|-----------|\n'
  for (const c of composites) body += `| ${c.intent} | side sheet | ${c.name} |\n`
  body += '\n## Naming\n\n'
  for (const layer of ['code', 'schema', 'routes', 'wire']) {
    body += `### ${layer}\n| Kind | Convention | Example |\n|------|------------|---------|\n| thing | kebab-case | example-thing |\n\n`
  }
  writeFile(path.join(dir, '.claude/rules/design.md'), body)
}

function setupAtDesignKit(prefix) {
  const dir = tmpdir(prefix)
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys: JOURNEYS_FOR_RATIFY })
  writeDesignPathsJson(dir)
  writeDesignBriefMd(dir, { journeys: JOURNEYS_FOR_RATIFY })
  writeDesignRulesFile(dir)
  writeDetailedSeedJourneys(dir, DETAILED_BEATS)
  const accepted = mark(dir, 'design-brief-written')
  assert.strictEqual(accepted.status, 0, 'test setup requires design-brief-written to be accepted: ' + accepted.stderr)
  return dir
}

// ---------------------------------------------------------------------------
// D5's own artifacts — real composite files (design-contract-check's compositePresent walks the
// kit directory for a matching basename or export), a physical tokens file, and .storybook/main.*.
// ---------------------------------------------------------------------------

function writeAllKitComposites(dir, kitRel, composites = COMPOSITES) {
  for (const c of composites) writeFile(path.join(dir, kitRel, c.name + '.tsx'), `export function ${c.name}() { return null }\n`)
}
function writeTokensFile(dir, tokensRel) { writeFile(path.join(dir, tokensRel), ':root { --brand: #123; }\n') }
function writeStorybookMain(dir) { writeFile(path.join(dir, '.storybook/main.ts'), 'export default {}\n') }

function setBuildCommand(dir, { index = FIXTURE_KIT_JOURNEYS, noIframe = false, fail = false } = {}) {
  const p = path.join(dir, '.claude/genesis/design-paths.json')
  const dp = JSON.parse(fs.readFileSync(p, 'utf8'))
  let cmd = 'node ' + STUB + ' --index ' + index + ' -o ' + dp.storybook.staticDir
  if (noIframe) cmd += ' --no-iframe'
  if (fail) cmd += ' --fail'
  dp.storybook.buildCommand = cmd
  fs.writeFileSync(p, JSON.stringify(dp, null, 2))
}

function prepareKitArtifacts(dir, opts = {}) {
  writeAllKitComposites(dir, 'src/components/kit')
  writeTokensFile(dir, 'src/styles/tokens.css')
  writeStorybookMain(dir)
  setBuildCommand(dir, opts)
}

function withCounter(dir, name) {
  const counterPath = path.join(dir, name)
  const env = Object.assign({}, process.env, { STORYBOOK_BUILD_CALL_COUNTER: counterPath })
  return { counterPath, env }
}
function readCounter(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '' }

function setupAtDesignJourneys(prefix) {
  const dir = setupAtDesignKit(prefix)
  prepareKitArtifacts(dir)
  const landed = mark(dir, 'kit-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires kit-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /DESIGN_JOURNEYS/, 'test setup requires kit-landed to reach DESIGN_JOURNEYS: ' + landed.stdout)
  bare(dir) // D6: the first bare print at DESIGN_JOURNEYS writes the beats files
  return dir
}

function writeCleanJourneyStory(dir, journeysRel, name) {
  writeFile(path.join(dir, journeysRel, name + '.journey.stories.tsx'), [
    "import type { Meta, StoryObj } from '@storybook/react-vite'",
    "import beats from './" + name + ".beats.json'",
    "const meta = { title: 'Journeys/" + name + "', tags: ['journey'] }",
    'export default meta',
    'export const Default = {',
    '  play: async ({ step }) => {',
    '    for (const b of beats.beats) { await step(b.sentence, async () => {}) }',
    '  },',
    '}',
    '',
  ].join('\n'))
}

function writeMinimalRoadmap(dir, { briefName = '02-fixture.md', surfaces = [] } = {}) {
  writeFile(path.join(dir, 'docs/roadmap/00-overview.md'), '# Roadmap\n')
  let body = 'Phase: 1\nDepends on: none\n\n## Work\n'
  if (surfaces.length) body += '\n```surfaces\n' + surfaces.join('\n') + '\n```\n'
  writeFile(path.join(dir, 'docs/roadmap/' + briefName), body)
}

// ---------------------------------------------------------------------------
// AC-20260926-05-1
// ---------------------------------------------------------------------------

test('AC-20260926-05-1: WHEN design-brief-written, kit-landed and journeys-drawn are each accepted in turn THE SYSTEM prints (DESIGN_BRIEF → DESIGN_KIT), then (DESIGN_KIT → DESIGN_JOURNEYS), then (DESIGN_JOURNEYS → ROADMAP), and --state prints DESIGN_KIT between the first two', () => {
  const dir = tmpdir('design-stage-kit-ac1')
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys: JOURNEYS_FOR_RATIFY })
  writeDesignPathsJson(dir)
  writeDesignBriefMd(dir, { journeys: JOURNEYS_FOR_RATIFY })
  writeDesignRulesFile(dir)
  writeDetailedSeedJourneys(dir, DETAILED_BEATS)

  const briefWritten = mark(dir, 'design-brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires design-brief-written to be accepted: ' + briefWritten.stderr)
  assert.match(briefWritten.stdout, /\(DESIGN_BRIEF → DESIGN_KIT\)/,
    'D1: the checkpoint line must read "(DESIGN_BRIEF → DESIGN_KIT)" once design-brief-written is accepted — its absence means the driver still routes straight to ROADMAP, skipping the new kit stage: ' + briefWritten.stdout)

  const st = state(dir)
  assert.strictEqual(st.status, 0, '--state must exit 0 once DESIGN_KIT is the derived state: ' + st.stderr)
  assert.strictEqual(st.stdout, 'DESIGN_KIT\n',
    'D1: --state must print exactly "DESIGN_KIT\\n" once design-brief-written is accepted: ' + JSON.stringify(st.stdout))

  prepareKitArtifacts(dir)
  const kitLanded = mark(dir, 'kit-landed')
  assert.strictEqual(kitLanded.status, 0, 'D5: kit-landed must be accepted on a fully-conforming kit host: ' + kitLanded.stderr)
  assert.match(kitLanded.stdout, /\(DESIGN_KIT → DESIGN_JOURNEYS\)/,
    'D1: the checkpoint line must read "(DESIGN_KIT → DESIGN_JOURNEYS)" once kit-landed is accepted: ' + kitLanded.stdout)

  bare(dir)
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  const journeysDrawn = mark(dir, 'journeys-drawn')
  assert.strictEqual(journeysDrawn.status, 0, 'D8: journeys-drawn must be accepted once every journey story is clean and the build proves it: ' + journeysDrawn.stderr)
  assert.match(journeysDrawn.stdout, /\(DESIGN_JOURNEYS → ROADMAP\)/,
    'D1: the checkpoint line must read "(DESIGN_JOURNEYS → ROADMAP)" once journeys-drawn is accepted: ' + journeysDrawn.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-2
// ---------------------------------------------------------------------------

test('AC-20260926-05-2: WHEN kit-landed has been accepted and .storybook/main.ts is deleted THE SYSTEM re-derives DESIGN_KIT; WHEN journeys-drawn has been accepted and a journey story is deleted THE SYSTEM re-derives DESIGN_JOURNEYS', () => {
  const kitDir = setupAtDesignJourneys('design-stage-kit-ac2-kit')
  fs.rmSync(path.join(kitDir, '.storybook/main.ts'))
  const stKit = state(kitDir)
  assert.strictEqual(stKit.status, 0, '--state must exit 0 after .storybook/main.ts is deleted: ' + stKit.stderr)
  assert.strictEqual(stKit.stdout, 'DESIGN_KIT\n',
    'D1: deleting .storybook/main.ts after an accepted kit-landed mark must re-derive DESIGN_KIT, never DESIGN_JOURNEYS — a derivation that trusts marks.kitLanded alone without checking the artifact physically exists would keep reporting DESIGN_JOURNEYS here: ' + JSON.stringify(stKit.stdout))

  const journeysDir = setupAtDesignJourneys('design-stage-kit-ac2-journeys')
  writeCleanJourneyStory(journeysDir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(journeysDir, 'src/journeys', 'daily-check')
  const drawn = mark(journeysDir, 'journeys-drawn')
  assert.strictEqual(drawn.status, 0, 'test setup requires journeys-drawn to be accepted: ' + drawn.stderr)

  fs.rmSync(path.join(journeysDir, 'src/journeys/daily-check.journey.stories.tsx'))
  const stJourneys = state(journeysDir)
  assert.strictEqual(stJourneys.status, 0, '--state must exit 0 after a journey story file is deleted: ' + stJourneys.stderr)
  assert.strictEqual(stJourneys.stdout, 'DESIGN_JOURNEYS\n',
    'D1: deleting src/journeys/daily-check.journey.stories.tsx after an accepted journeys-drawn mark must re-derive DESIGN_JOURNEYS — trusting marks.journeysDrawn alone would keep reporting ROADMAP here: ' + JSON.stringify(stJourneys.stdout))
})

// ---------------------------------------------------------------------------
// AC-20260926-05-6 / AC-20260926-05-7
// ---------------------------------------------------------------------------

test('AC-20260926-05-6: WHEN kit-landed runs with a buildCommand that exits 1 THE SYSTEM exits 2 naming "storybook build" and the log\'s last line, leaves marks.kitLanded unset, and writes .claude/genesis/storybook-build.log', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac6')
  prepareKitArtifacts(dir, { fail: true })
  const r = mark(dir, 'kit-landed')
  assert.strictEqual(r.status, 2, 'D5/D3: a failing build must refuse kit-landed with exit 2: ' + r.stdout)
  assert.match(r.stderr, /storybook build/,
    'D3: the refusal must name "storybook build" so the operator knows which step failed: ' + r.stderr)
  assert.match(r.stderr, /fixture-forced failure/,
    'D3: the refusal must quote the log\'s last line (logTail) so the operator sees the real failure without opening the log file: ' + r.stderr)
  assert.strictEqual(statusOf(dir).marks.kitLanded, undefined,
    'D5: marks.kitLanded must stay unset after a failing build: ' + JSON.stringify(statusOf(dir).marks))
  assert.ok(fs.existsSync(path.join(dir, '.claude/genesis/storybook-build.log')),
    'D3: the build\'s stdout+stderr must stream to .claude/genesis/storybook-build.log regardless of the build\'s own exit code')
})

test('AC-20260926-05-7: WHEN the build exits 0 but writes no iframe.html THE SYSTEM exits 2 naming "iframe.html", and <staticDir>/.gitignore contains "*" after the attempt', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac7')
  prepareKitArtifacts(dir, { noIframe: true })
  const r = mark(dir, 'kit-landed')
  assert.strictEqual(r.status, 2, 'D2/D3: a build with no iframe.html must refuse kit-landed with exit 2: ' + r.stdout)
  assert.match(r.stderr, /iframe\.html/,
    'D2: the refusal must name "iframe.html" — the salon-os spike showed a build exiting 0 with no iframe at all, so the refusal must be specific about what is missing: ' + r.stderr)
  const gitignore = fs.readFileSync(path.join(dir, '.claude/genesis/storybook-static/.gitignore'), 'utf8')
  assert.match(gitignore, /\*/,
    'D3: <staticDir>/.gitignore must contain "*" after any build attempt, successful or not, so the static export is never accidentally committed: ' + JSON.stringify(gitignore))
})

// ---------------------------------------------------------------------------
// AC-20260926-05-8
// ---------------------------------------------------------------------------

test('AC-20260926-05-8: WHEN the bare run prints DESIGN_KIT THE SYSTEM includes the Session/Skill lines, one composite line per brief row, the init recipe, the iframe.html note, and --mark kit-landed', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac8')
  const printed = bare(dir).stdout

  assert.match(printed, /^Session: start a fresh session for this step — Model: Fable \(authors tokens, shell and composites\)$/m,
    'D4: the step must print the fresh-session/model line verbatim: ' + printed)
  assert.match(printed, /^Skill: frontend-design — load it if installed/m,
    'D4: the step must print the frontend-design skill line: ' + printed)
  assert.match(printed, /^composite: BookingSheet — states: Idle, Saving, Error$/m,
    'D4: the step must print "composite: BookingSheet — states: Idle, Saving, Error" from the brief\'s own Composites table: ' + printed)
  assert.match(printed, /^composite: DestructiveConfirmDialog — states: Idle, Confirming$/m,
    'D4: the step must print "composite: DestructiveConfirmDialog — states: Idle, Confirming": ' + printed)
  assert.match(printed, /storybook@latest init --yes --no-dev/,
    'D4: the step must print the non-interactive Storybook init recipe: ' + printed)
  assert.match(printed, /iframe\.html/,
    'D4: the step must print the TanStack Start iframe-input note (or otherwise name iframe.html) from the setup recipe: ' + printed)
  assert.match(printed, /--mark kit-landed/,
    'D4: the step must print the --mark kit-landed command: ' + printed)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-9 / AC-20260926-05-10
// ---------------------------------------------------------------------------

test('AC-20260926-05-9: WHEN kit-landed runs with the kit directory missing the DestructiveConfirmDialog composite THE SYSTEM exits 2 naming "composite-missing" and "DestructiveConfirmDialog" before any build runs', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac9')
  writeAllKitComposites(dir, 'src/components/kit', [COMPOSITES[0]]) // BookingSheet only
  writeTokensFile(dir, 'src/styles/tokens.css')
  writeStorybookMain(dir)
  const { counterPath, env } = withCounter(dir, 'build-calls.txt')
  setBuildCommand(dir)
  const r = mark(dir, 'kit-landed', undefined, { env })
  assert.strictEqual(r.status, 2, 'D5: a missing composite must refuse kit-landed before any build attempt: ' + r.stdout)
  assert.match(r.stderr, /composite-missing/, 'D5: the refusal must name "composite-missing": ' + r.stderr)
  assert.match(r.stderr, /DestructiveConfirmDialog/, 'D5: the refusal must name the missing composite DestructiveConfirmDialog: ' + r.stderr)
  assert.strictEqual(readCounter(counterPath), '',
    'D5: design-contract-check must run before D3\'s build — the stub\'s call-counter file staying absent proves the build never ran: ' + JSON.stringify(readCounter(counterPath)))
})

test('AC-20260926-05-10: WHEN the contract check passes but no .storybook/main.* exists THE SYSTEM exits 2 naming ".storybook/main" and "storybook@latest init"', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac10')
  writeAllKitComposites(dir, 'src/components/kit')
  writeTokensFile(dir, 'src/styles/tokens.css')
  setBuildCommand(dir)
  const r = mark(dir, 'kit-landed')
  assert.strictEqual(r.status, 2, 'D5: a passing contract check with no .storybook/main.* must still refuse kit-landed: ' + r.stdout)
  assert.match(r.stderr, /\.storybook\/main/, 'D5: the refusal must name ".storybook/main": ' + r.stderr)
  assert.match(r.stderr, /storybook@latest init/, 'D5: the refusal must point at the init recipe by naming "storybook@latest init": ' + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-11
// ---------------------------------------------------------------------------

test('AC-20260926-05-11: WHEN the build succeeds against the missing-state fixture THE SYSTEM refuses naming the missing composite/state; against the complete fixture it accepts kit-landed and records the build\'s story count', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac11')
  prepareKitArtifacts(dir, { index: FIXTURE_MISSING_STATE })
  const missing = mark(dir, 'kit-landed')
  assert.strictEqual(missing.status, 2, 'D5: a built index missing a declared state must refuse kit-landed: ' + missing.stdout)
  assert.match(missing.stderr, /composite BookingSheet: no state story Error under src\/components\/kit/,
    'D5: the refusal must read "composite BookingSheet: no state story Error under src/components/kit": ' + missing.stderr)

  setBuildCommand(dir, { index: FIXTURE_KIT_JOURNEYS })
  const accepted = mark(dir, 'kit-landed')
  assert.strictEqual(accepted.status, 0, 'D5: a built index carrying every declared state must accept kit-landed: ' + accepted.stderr)
  const st = statusOf(dir)
  assert.strictEqual(st.marks.kitLanded, true, 'D5: marks.kitLanded must be true once accepted: ' + JSON.stringify(st.marks))
  assert.strictEqual(st.designStage.kit.build.exit, 0, 'D5: status.designStage.kit.build.exit must record 0: ' + JSON.stringify(st.designStage.kit))
  assert.strictEqual(st.designStage.kit.build.stories, 7, 'D5: status.designStage.kit.build.stories must record 7 (the kit-and-journeys fixture\'s entry count): ' + JSON.stringify(st.designStage.kit))
})

// ---------------------------------------------------------------------------
// AC-20260926-05-12
// ---------------------------------------------------------------------------

test('AC-20260926-05-12: WHEN the bare run first prints DESIGN_JOURNEYS THE SYSTEM writes each journey\'s beats.json with the seed\'s own hash; an edited seed then refuses journeys-drawn naming the changed hash, and a later bare run rewrites the file', () => {
  const dir = setupAtDesignKit('design-stage-kit-ac12')
  prepareKitArtifacts(dir)
  const landed = mark(dir, 'kit-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires kit-landed to be accepted: ' + landed.stderr)

  bare(dir)
  const beatsPath = path.join(dir, 'src/journeys/first-visit.beats.json')
  assert.ok(fs.existsSync(beatsPath),
    'D6: the driver must write src/journeys/first-visit.beats.json the first time it prints DESIGN_JOURNEYS')
  const parsed = JSON.parse(fs.readFileSync(beatsPath, 'utf8'))
  assert.deepStrictEqual(parsed.beats[1], { n: 2, sentence: 'I tap new booking', screen: 'booking', state: 'empty' },
    'D6: beats[1] must equal {"n":2,"sentence":"I tap new booking","screen":"booking","state":"empty"}, the seed\'s own second beat verbatim: ' + JSON.stringify(parsed.beats))
  const expectedHash = beatHash([
    { n: 1, beat: 'I open the app', screen: 'home', state: null },
    { n: 2, beat: 'I tap new booking', screen: 'booking', state: 'empty' },
  ])
  assert.strictEqual(parsed.beatHash, expectedHash,
    'D6: beatHash must equal lib/surfaces.js\'s own beatHash of the seed\'s beats — a different value means the file was hashed some other way, breaking journeys-drawn\'s re-hash check: ' + parsed.beatHash)

  const seedPath = path.join(dir, 'design/mocks/seed.md')
  const seedText = fs.readFileSync(seedPath, 'utf8').replace('"I tap new booking"', '"I tap the new booking button"')
  fs.writeFileSync(seedPath, seedText)
  const refused = mark(dir, 'journeys-drawn')
  assert.strictEqual(refused.status, 2, 'D6: journeys-drawn must refuse once the printed beats file\'s hash no longer matches the seed: ' + refused.stdout)
  assert.match(refused.stderr, /first-visit/, 'D6: the refusal must name the changed journey first-visit: ' + refused.stderr)
  assert.match(refused.stderr, /changed since the last print/, 'D6: the refusal must carry "changed since the last print": ' + refused.stderr)

  bare(dir)
  const rewritten = JSON.parse(fs.readFileSync(beatsPath, 'utf8'))
  assert.notStrictEqual(rewritten.beatHash, parsed.beatHash,
    'D6: a subsequent bare run must rewrite the beats file with the new hash once the seed changed — an unchanged hash means the "rewrite a file whose beatHash differs" rule never fired: ' + rewritten.beatHash)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-13
// ---------------------------------------------------------------------------

test('AC-20260926-05-13: WHEN the bare run prints DESIGN_JOURNEYS THE SYSTEM includes the Sonnet session line, the one-session note, a per-journey line naming its beat count and story path, the primitive-ban note, and --mark journeys-drawn', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac13')
  const printed = bare(dir).stdout

  assert.match(printed, /^Session: start a fresh session for this step — Model: Sonnet may draw/m,
    'D7: the step must print the fresh-session/model line naming Sonnet: ' + printed)
  assert.match(printed, /all journeys in this one session/,
    'D7: the step must print "all journeys in this one session": ' + printed)
  assert.match(printed, /^journey: first-visit — 2 beats → src\/journeys\/first-visit\.journey\.stories\.tsx$/m,
    'D7: the step must print "journey: first-visit — 2 beats → src/journeys/first-visit.journey.stories.tsx": ' + printed)
  assert.match(printed, /never @\/components\/ui/,
    'D7: the step must print the primitive-ban rule naming "never @/components/ui": ' + printed)
  assert.match(printed, /--mark journeys-drawn/,
    'D7: the step must print the --mark journeys-drawn command: ' + printed)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-14
// ---------------------------------------------------------------------------

test('AC-20260926-05-14: journeys-drawn refuses a missing story file, then a story importing the wrong beats file, then one with no step( call — each naming the exact offender', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac14')
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')

  const noFile = mark(dir, 'journeys-drawn')
  assert.strictEqual(noFile.status, 2, 'D8: a missing journey story file must refuse journeys-drawn: ' + noFile.stdout)
  assert.match(noFile.stderr, /daily-check/, 'D8: the refusal must name daily-check: ' + noFile.stderr)
  assert.match(noFile.stderr, /no journey story/, 'D8: the refusal must carry "no journey story": ' + noFile.stderr)

  writeFile(path.join(dir, 'src/journeys/daily-check.journey.stories.tsx'), [
    "import type { Meta } from '@storybook/react-vite'",
    "import beats from './other.beats.json'",
    "const meta = { title: 'Journeys/daily-check', tags: ['journey'] }",
    'export default meta',
    'export const Default = { play: async ({ step }) => { for (const b of beats.beats) { await step(b.sentence, async () => {}) } } }',
    '',
  ].join('\n'))
  const wrongImport = mark(dir, 'journeys-drawn')
  assert.strictEqual(wrongImport.status, 2, 'D8: a story importing the wrong beats file must refuse journeys-drawn: ' + wrongImport.stdout)
  assert.match(wrongImport.stderr, /daily-check\.beats\.json/, 'D8: the refusal must name daily-check.beats.json, the expected import: ' + wrongImport.stderr)

  writeFile(path.join(dir, 'src/journeys/daily-check.journey.stories.tsx'), [
    "import type { Meta } from '@storybook/react-vite'",
    "import beats from './daily-check.beats.json'",
    "const meta = { title: 'Journeys/daily-check', tags: ['journey'] }",
    'export default meta',
    'export const Default = { play: async ({ canvas }) => { void beats; void canvas } }',
    '',
  ].join('\n'))
  const noStep = mark(dir, 'journeys-drawn')
  assert.strictEqual(noStep.status, 2, 'D8: a story with no step( call must refuse journeys-drawn: ' + noStep.stdout)
  assert.match(noStep.stderr, /step\(/, 'D8: the refusal must name "step(": ' + noStep.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-15
// ---------------------------------------------------------------------------

test('AC-20260926-05-15: journeys-drawn refuses a journey file importing a primitive by alias, then by a relative path resolving into primitives, and never refuses a commented-out primitive import', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac15')
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  const screenPath = path.join(dir, 'src/journeys/first-visit/Screen.tsx')

  writeFile(screenPath, "import { Button } from '@/components/ui/button'\nexport function Screen() { return null }\n")
  const alias = mark(dir, 'journeys-drawn')
  assert.strictEqual(alias.status, 2, 'D8: a journey file importing the primitives alias must refuse journeys-drawn: ' + alias.stdout)
  assert.match(alias.stderr,
    /journey file src\/journeys\/first-visit\/Screen\.tsx imports a primitive \(@\/components\/ui\/button\) — import composites from src\/components\/kit only/,
    'D8: the refusal must carry the exact "journey file <f> imports a primitive (<specifier>) — import composites from <kit> only" wording: ' + alias.stderr)

  writeFile(screenPath, "import { Button } from '../../components/ui/button'\nexport function Screen() { return null }\n")
  const relative = mark(dir, 'journeys-drawn')
  assert.strictEqual(relative.status, 2, 'D8: a relative import resolving into the primitives directory must also refuse journeys-drawn: ' + relative.stdout)
  assert.match(relative.stderr, /\.\.\/\.\.\/components\/ui\/button/,
    'D8: the refusal must name the specifier exactly as written, "../../components/ui/button": ' + relative.stderr)

  writeFile(screenPath, "// import { Button } from '@/components/ui/button'\nexport function Screen() { return null }\n")
  setBuildCommand(dir, { index: FIXTURE_KIT_JOURNEYS })
  const { env } = withCounter(dir, 'ac15-build-calls.txt')
  const commented = mark(dir, 'journeys-drawn', undefined, { env })
  assert.strictEqual(commented.status, 0,
    'D8: a commented-out primitive import must never be refused — its presence in the primitive ban means importSpecifiers is not stripping comments before scanning: ' + commented.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-16 / AC-20260926-05-17
// ---------------------------------------------------------------------------

test('AC-20260926-05-16: WHEN every journey file is clean and the build runs against the journey-untagged fixture THE SYSTEM refuses naming daily-check; against the complete fixture it accepts and records the story ids', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac16')
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')

  setBuildCommand(dir, { index: FIXTURE_JOURNEY_UNTAGGED })
  const untagged = mark(dir, 'journeys-drawn')
  assert.strictEqual(untagged.status, 2, 'D8: a rebuilt index missing the journey+play-fn tags on daily-check must refuse journeys-drawn: ' + untagged.stdout)
  assert.match(untagged.stderr, /journey daily-check: no story tagged journey with a play function in the index/,
    'D8: the refusal must read "journey daily-check: no story tagged journey with a play function in the index": ' + untagged.stderr)

  setBuildCommand(dir, { index: FIXTURE_KIT_JOURNEYS })
  const accepted = mark(dir, 'journeys-drawn')
  assert.strictEqual(accepted.status, 0, 'D8: a rebuilt index carrying both journeys tagged journey/play-fn must accept journeys-drawn: ' + accepted.stderr)
  const st = statusOf(dir)
  assert.strictEqual(st.designStage.journeys.stories['first-visit'], 'journeys-first-visit--default',
    'D8: status.designStage.journeys.stories["first-visit"] must record the built story id "journeys-first-visit--default": ' + JSON.stringify(st.designStage.journeys))
  assert.strictEqual(st.marks.journeysDrawn, true, 'D8: marks.journeysDrawn must be true once accepted: ' + JSON.stringify(st.marks))
})

test('AC-20260926-05-17: WHEN journeys-drawn is accepted THE SYSTEM has run the build exactly once during that mark, and the checkpoint line reads (DESIGN_JOURNEYS → ROADMAP)', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac17')
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  setBuildCommand(dir, { index: FIXTURE_KIT_JOURNEYS })
  const { counterPath, env } = withCounter(dir, 'ac17-build-calls.txt')
  const r = mark(dir, 'journeys-drawn', undefined, { env })
  assert.strictEqual(r.status, 0, 'test setup requires journeys-drawn to be accepted: ' + r.stderr)
  assert.strictEqual(readCounter(counterPath), '1',
    'D8: the build must run exactly once during a single journeys-drawn mark — a higher count means the driver rebuilds redundantly (once for the primitive-ban gate, once for the journey-story check, say): ' + readCounter(counterPath))
  assert.match(r.stdout, /\(DESIGN_JOURNEYS → ROADMAP\)/,
    'D1: the checkpoint line must read "(DESIGN_JOURNEYS → ROADMAP)": ' + r.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260926-05-18
// ---------------------------------------------------------------------------

test('AC-20260926-05-18: WHEN HANDOFF prints on a host whose design stage landed a kit THE SYSTEM names design-paths.json\'s kit/tokens/rules in the config.design line and in Read only:; on a host whose stage was skipped it prints no "kit":', () => {
  const dir = setupAtDesignJourneys('design-stage-kit-ac18')
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  const drawn = mark(dir, 'journeys-drawn')
  assert.strictEqual(drawn.status, 0, 'test setup requires journeys-drawn to be accepted: ' + drawn.stderr)

  writeMinimalRoadmap(dir, { surfaces: ['home', 'booking', 'today'] })
  const roadmapWritten = mark(dir, 'roadmap-written')
  assert.strictEqual(roadmapWritten.status, 0, 'test setup requires roadmap-written to be accepted: ' + roadmapWritten.stderr)

  const printed = bare(dir).stdout
  assert.match(printed,
    /config\.design set to \{ "kit": "src\/components\/kit", "tokens": "src\/styles\/tokens\.css", "rules": "\.claude\/rules\/design\.md" \}/,
    'D9: HANDOFF must print config.design set to { "kit": ..., "tokens": ..., "rules": ... } read from design-paths.json once status.designStage.kit exists: ' + printed)
  assert.match(printed, /Read only:.*design-paths\.json/,
    'D9: the Read only: line must name design-paths.json: ' + printed)

  const skippedDir = tmpdir('design-stage-kit-ac18-skipped')
  advanceToDesignBrief(skippedDir, { archetype: 'data-ml', designCatalog: 'none' })
  writeMinimalRoadmap(skippedDir)
  const skippedRoadmap = mark(skippedDir, 'roadmap-written')
  assert.strictEqual(skippedRoadmap.status, 0, 'test setup requires roadmap-written to be accepted on the skipped-stage host: ' + skippedRoadmap.stderr)
  const printedSkipped = bare(skippedDir).stdout
  assert.doesNotMatch(printedSkipped, /"kit":/,
    'D9: a host whose design stage was skipped must print no "kit": in its HANDOFF step — its presence means the driver read a design-paths.json that was never validated for this host: ' + printedSkipped)
})
