'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { tmpdir, runNode, ROOT } = require('../helpers')
const { writeBrief, writeConventionsArtifacts, writeBindingSubset } = require('./tournament.fixtures.js')

// specs/20260926/06-the-approval-stop-and-the-roadmap.md: genesis-driver.js gains
// AWAITING_DESIGN_APPROVAL between DESIGN_JOURNEYS and ROADMAP (D1), the Storybook index probe
// and look-stop/refusal prints (D2), the design-approved mark writing docs/design/approval.json
// (D3), ROADMAP's approved: lines and approval-sourced placement check (D4), and the retirement
// of every driver read of the wireframe's own design/approval.json after DESIGN_BRIEF's print
// (D5). This file owns AC-20260926-06-1 through -8. None of this exists yet — every test below
// is red for that reason.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const STUB = path.join(ROOT, 'tests/fixtures/genesis/storybook-build-stub.js')
const FIXTURE_KIT_JOURNEYS = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/kit-and-journeys.json')
const FIXTURE_JOURNEY_UNTAGGED = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/journey-untagged.json')
const FIXTURE_SERVED_INDEX = path.join(ROOT, 'tests/fixtures/genesis/storybook-index/served-index.json')
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
// Fixture plumbing, reused verbatim from tests/genesis/design-stage-kit.test.js's own shape
// (this repo's "each test file owns its own fixture plumbing" convention) — cold root through
// the green zero-day gate, into design-brief-written, kit-landed and journeys-drawn.
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

const COMPOSITES = [
  { name: 'BookingSheet', intent: 'edit one record', states: 'Idle, Saving, Error' },
  { name: 'DestructiveConfirmDialog', intent: 'confirm destructive', states: 'Idle, Confirming' },
]

// The two seed journeys this whole file drives through, screens matching the spec's own
// Contracts block verbatim (`screens: home, booking` / `screens: home, day`) so AC-6's approved:
// lines can be pinned as the exact literal the spec prints.
const JOURNEYS_FOR_RATIFY = [
  { name: 'first-visit', beats: ['home', 'booking'] },
  { name: 'daily-check', beats: ['home', 'day'] },
]
const DETAILED_BEATS = {
  'first-visit': [
    { sentence: 'I open the app', screen: 'home', state: null },
    { sentence: 'I tap new booking', screen: 'booking', state: 'empty' },
  ],
  'daily-check': [
    { sentence: 'I open the app', screen: 'home', state: null },
    { sentence: 'I review today', screen: 'day', state: null },
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

function setupAtDesignJourneys(prefix) {
  const dir = setupAtDesignKit(prefix)
  prepareKitArtifacts(dir)
  const landed = mark(dir, 'kit-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires kit-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /DESIGN_JOURNEYS/, 'test setup requires kit-landed to reach DESIGN_JOURNEYS: ' + landed.stdout)
  bare(dir) // D6 (spec 05): the first bare print at DESIGN_JOURNEYS writes the beats files
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

function setupReadyForJourneysDrawn(prefix) {
  const dir = setupAtDesignJourneys(prefix)
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  return dir
}

// This spec's own entry point: journeys-drawn accepted, landing on AWAITING_DESIGN_APPROVAL (D1).
function setupAtAwaitingApproval(prefix) {
  const dir = setupReadyForJourneysDrawn(prefix)
  const drawn = mark(dir, 'journeys-drawn')
  assert.strictEqual(drawn.status, 0, 'test setup requires journeys-drawn to be accepted: ' + drawn.stderr)
  return dir
}

function writeMinimalRoadmap(dir, { briefName = '02-fixture.md', surfaces = [] } = {}) {
  writeFile(path.join(dir, 'docs/roadmap/00-overview.md'), '# Roadmap\n')
  let body = 'Phase: 1\nDepends on: none\n\n## Work\n'
  if (surfaces.length) body += '\n```surfaces\n' + surfaces.join('\n') + '\n```\n'
  writeFile(path.join(dir, 'docs/roadmap/' + briefName), body)
}

// ---------------------------------------------------------------------------
// This spec's own plumbing — the D2 probe's inputs.
// ---------------------------------------------------------------------------

// D2: `design-paths.storybook.indexUrl`, when set, is what the probe fetches instead of the port
// URL. `port: null`/`indexUrl: null` deletes that key so a prior test's edit never leaks forward.
function setStorybookProbe(dir, { port, indexUrl } = {}) {
  const p = path.join(dir, '.claude/genesis/design-paths.json')
  const dp = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (port !== undefined) dp.storybook.port = port
  if (indexUrl !== undefined) {
    if (indexUrl === null) delete dp.storybook.indexUrl
    else dp.storybook.indexUrl = indexUrl
  }
  fs.writeFileSync(p, JSON.stringify(dp, null, 2))
  return dp
}

function fileUrl(absPath) { return 'file://' + absPath }

// A port bound then closed before the run — deterministically unreachable without depending on
// nothing else in this test process ever having listened there (tests/helpers.js's runNode is
// spawnSync, so an in-process listener the child could actually reach is not an option here).
function getClosedPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

// A tmp copy of the kit-and-journeys index with the daily-check journey entry stripped out, for
// AC-2's "missing story" case — written per-test (not a shared fixture) since only this one case
// needs it.
function writeMissingDailyIndex(dir) {
  const full = JSON.parse(fs.readFileSync(FIXTURE_KIT_JOURNEYS, 'utf8'))
  delete full.entries['journeys-daily-check--default']
  const p = path.join(dir, '.claude/genesis/probe-missing-daily-index.json')
  writeFile(p, JSON.stringify(full, null, 2))
  return p
}

// D3: no key literally named "hash" or "sha" anywhere in the approval record — the rationale
// paragraph is explicit that a per-file hash is deliberately never recorded, only the beats hash
// under the key "beats".
function assertNoHashKeys(obj, where) {
  if (!obj || typeof obj !== 'object') return
  for (const [k, v] of Object.entries(obj)) {
    assert.ok(!/hash|sha/i.test(k),
      'D3: docs/design/approval.json must carry no key named hash or sha (found "' + k + '" at ' +
      where + ') — recording a hash would invite exactly the gate "frozen after approval, never gated later" forbids: ' + JSON.stringify(obj))
    assertNoHashKeys(v, where + '.' + k)
  }
}

// ---------------------------------------------------------------------------
// AC-20260926-06-1
// ---------------------------------------------------------------------------

test('AC-20260926-06-1: WHEN journeys-drawn is accepted THE SYSTEM prints (DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL) and --state prints AWAITING_DESIGN_APPROVAL; WHEN design-approved is later accepted and docs/design/approval.json is deleted THE SYSTEM re-derives AWAITING_DESIGN_APPROVAL', () => {
  const dir = setupReadyForJourneysDrawn('design-stage-approval-ac1')

  const drawn = mark(dir, 'journeys-drawn')
  assert.strictEqual(drawn.status, 0, 'test setup requires journeys-drawn to be accepted: ' + drawn.stderr)
  assert.match(drawn.stdout, /\(DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL\)/,
    'D1: the checkpoint line must read "(DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL)" once journeys-drawn is accepted — its absence means the driver still hands straight to ROADMAP, skipping the approval stop: ' + drawn.stdout)

  const st = state(dir)
  assert.strictEqual(st.status, 0, '--state must exit 0 once AWAITING_DESIGN_APPROVAL is the derived state: ' + st.stderr)
  assert.strictEqual(st.stdout, 'AWAITING_DESIGN_APPROVAL\n',
    'D1: --state must print exactly "AWAITING_DESIGN_APPROVAL\\n" once journeys-drawn is accepted: ' + JSON.stringify(st.stdout))

  const approved = mark(dir, 'design-approved')
  assert.strictEqual(approved.status, 0, 'test setup requires design-approved to be accepted: ' + approved.stderr)

  fs.rmSync(path.join(dir, 'docs/design/approval.json'))
  const st2 = state(dir)
  assert.strictEqual(st2.status, 0, '--state must exit 0 after docs/design/approval.json is deleted: ' + st2.stderr)
  assert.strictEqual(st2.stdout, 'AWAITING_DESIGN_APPROVAL\n',
    'D1: deleting docs/design/approval.json after an accepted design-approved mark must re-derive AWAITING_DESIGN_APPROVAL — trusting marks.designApproved alone without checking the artifact physically exists would keep reporting ROADMAP here: ' + JSON.stringify(st2.stdout))
})

// ---------------------------------------------------------------------------
// AC-20260926-06-2
// ---------------------------------------------------------------------------

test('AC-20260926-06-2: WHEN Storybook is unreachable on the recorded port THE SYSTEM prints the refusal naming the port and the session command, never a URL; WHEN the index is reachable but lacks a journey story THE SYSTEM prints "missing story" for it and no 🎨 line', async () => {
  const unreachableDir = setupAtAwaitingApproval('design-stage-approval-ac2-unreachable')
  const closedPort = await getClosedPort()
  setStorybookProbe(unreachableDir, { port: closedPort, indexUrl: null })
  const printedUnreachable = bare(unreachableDir).stdout

  assert.match(printedUnreachable, new RegExp('Storybook is not serving the journey stories on port ' + closedPort + ' — unreachable'),
    'D2: a closed port must print "Storybook is not serving the journey stories on port ' + closedPort + ' — unreachable": ' + printedUnreachable)
  assert.match(printedUnreachable, new RegExp('Session:.*storybook dev -p ' + closedPort + ' --ci --no-open'),
    'D2: the refusal must carry a Session: line naming "storybook dev -p ' + closedPort + ' --ci --no-open" for the session to run in the background: ' + printedUnreachable)
  assert.doesNotMatch(printedUnreachable, /http:\/\/localhost/,
    'D2: a refusal print must never contain a URL — the spike showed Storybook answering 200 for a story id that does not exist, so a URL here would point JJ at a page that may show nothing: ' + printedUnreachable)

  const missingStoryDir = setupAtAwaitingApproval('design-stage-approval-ac2-missing-story')
  const missingIndexPath = writeMissingDailyIndex(missingStoryDir)
  setStorybookProbe(missingStoryDir, { indexUrl: fileUrl(missingIndexPath) })
  const printedMissing = bare(missingStoryDir).stdout

  assert.match(printedMissing, /missing story journeys-daily-check--default/,
    'D2: an index missing the daily-check journey\'s story must print "missing story journeys-daily-check--default": ' + printedMissing)
  assert.doesNotMatch(printedMissing, /🎨/,
    'D2: an index missing a required journey story must never print the 🎨 ready-for-review line: ' + printedMissing)
})

// ---------------------------------------------------------------------------
// AC-20260926-06-3
// ---------------------------------------------------------------------------

test('AC-20260926-06-3: WHEN the served index carries both journey stories THE SYSTEM prints the 🎨 ready-for-review line, one journey: line per journey in seed order, the composite count, the approve reply line, and --mark design-approved', () => {
  const dir = setupAtAwaitingApproval('design-stage-approval-ac3')
  setStorybookProbe(dir, { indexUrl: fileUrl(FIXTURE_SERVED_INDEX) })
  const printed = bare(dir).stdout

  assert.match(printed, /🎨 ready for review — http:\/\/localhost:6006\/\?path=\/story\/journeys-first-visit--default/,
    'D2: a served index carrying every journey story must print the 🎨 ready-for-review line naming the first journey\'s own verified URL: ' + printed)
  assert.match(printed, /^journey: first-visit → http:\/\/localhost:6006\/\?path=\/story\/journeys-first-visit--default$/m,
    'D2: the step must print "journey: first-visit → http://localhost:6006/?path=/story/journeys-first-visit--default" in seed order: ' + printed)
  assert.match(printed, /^journey: daily-check → http:\/\/localhost:6006\/\?path=\/story\/journeys-daily-check--default$/m,
    'D2: the step must print "journey: daily-check → http://localhost:6006/?path=/story/journeys-daily-check--default" in seed order, after first-visit: ' + printed)
  assert.match(printed, /^composites: 5 state stories$/m,
    'D2: the step must print "composites: 5 state stories" — the served fixture\'s 5 non-journey entries: ' + printed)
  assert.match(printed, /Reply `approve`/,
    'D2: the step must print the reply line inviting the literal word "approve": ' + printed)
  assert.match(printed, /--mark design-approved/,
    'D2: the step must print the --mark design-approved command: ' + printed)
})

// ---------------------------------------------------------------------------
// AC-20260926-06-4
// ---------------------------------------------------------------------------

test('AC-20260926-06-4: WHEN design-approved runs before journeys-drawn THE SYSTEM exits 2 naming journeys-drawn; WHEN it runs against an index leaving daily-check untagged THE SYSTEM exits 2 naming journey daily-check and writes no docs/design/approval.json', () => {
  const earlyDir = setupReadyForJourneysDrawn('design-stage-approval-ac4-early')
  const early = mark(earlyDir, 'design-approved')
  assert.strictEqual(early.status, 2, 'D3: design-approved run before journeys-drawn has been marked must refuse: ' + early.stdout)
  assert.match(early.stderr, /journeys-drawn/,
    'D3: the refusal must name journeys-drawn as the mark to run first: ' + early.stderr)

  const untaggedDir = setupAtAwaitingApproval('design-stage-approval-ac4-untagged')
  setBuildCommand(untaggedDir, { index: FIXTURE_JOURNEY_UNTAGGED })
  const untagged = mark(untaggedDir, 'design-approved')
  assert.strictEqual(untagged.status, 2, 'D3: design-approved must re-run the build and journeyStoriesCheck against a fresh index, refusing when daily-check\'s story is untagged: ' + untagged.stdout)
  assert.match(untagged.stderr, /journey daily-check/,
    'D3: the refusal must name "journey daily-check": ' + untagged.stderr)
  assert.ok(!fs.existsSync(path.join(untaggedDir, 'docs/design/approval.json')),
    'D3: a refused design-approved must write no docs/design/approval.json: ' + JSON.stringify(fs.existsSync(path.join(untaggedDir, 'docs/design/approval.json'))))
})

// ---------------------------------------------------------------------------
// AC-20260926-06-5
// ---------------------------------------------------------------------------

test('AC-20260926-06-5: WHEN design-approved runs against a fully-tagged index THE SYSTEM exits 0, writes docs/design/approval.json with the journeys\' screens/beats-hash/story and the composites\' states, no hash/sha key, and marks.designApproved, and prints (AWAITING_DESIGN_APPROVAL → ROADMAP)', () => {
  const dir = setupAtAwaitingApproval('design-stage-approval-ac5')
  const r = mark(dir, 'design-approved')
  assert.strictEqual(r.status, 0, 'D3: design-approved must be accepted once the rebuilt index carries every declared state and both journey stories: ' + r.stderr)
  assert.match(r.stdout, /\(AWAITING_DESIGN_APPROVAL → ROADMAP\)/,
    'D1: the checkpoint line must read "(AWAITING_DESIGN_APPROVAL → ROADMAP)" once design-approved is accepted: ' + r.stdout)

  const approvalPath = path.join(dir, 'docs/design/approval.json')
  assert.ok(fs.existsSync(approvalPath), 'D3: design-approved must write docs/design/approval.json')
  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'))

  assert.deepStrictEqual(approval.journeys['first-visit'].screens, ['home', 'booking'],
    'D3: journeys["first-visit"].screens must equal ["home","booking"], the labels in beat order: ' + JSON.stringify(approval.journeys['first-visit']))
  const beatsOnDisk = JSON.parse(fs.readFileSync(path.join(dir, 'src/journeys/first-visit.beats.json'), 'utf8'))
  assert.strictEqual(approval.journeys['first-visit'].beats, beatsOnDisk.beatHash,
    'D3: journeys["first-visit"].beats must equal the beats file\'s own beatHash, never a value computed some other way: ' + approval.journeys['first-visit'].beats)
  assert.strictEqual(approval.journeys['first-visit'].story, 'journeys-first-visit--default',
    'D3: journeys["first-visit"].story must equal the built story id "journeys-first-visit--default": ' + approval.journeys['first-visit'].story)
  assert.deepStrictEqual(approval.composites.BookingSheet, ['Idle', 'Saving', 'Error'],
    'D3: composites.BookingSheet must equal ["Idle","Saving","Error"], the brief\'s own declared states: ' + JSON.stringify(approval.composites))
  assert.match(approval.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'D3: approvedAt must be an ISO timestamp: ' + approval.approvedAt)
  assertNoHashKeys(approval, 'approval.json')

  const st = statusOf(dir)
  assert.strictEqual(st.marks.designApproved, true,
    'D3: marks.designApproved must be true once accepted: ' + JSON.stringify(st.marks))
})

// ---------------------------------------------------------------------------
// AC-20260926-06-6
// ---------------------------------------------------------------------------

test('AC-20260926-06-6: WHEN ROADMAP prints on a host carrying docs/design/approval.json THE SYSTEM prints one approved: line per approved journey and reads the record; on a host whose design stage was skipped THE SYSTEM prints no approved: line', () => {
  const dir = setupAtAwaitingApproval('design-stage-approval-ac6')
  const approved = mark(dir, 'design-approved')
  assert.strictEqual(approved.status, 0, 'test setup requires design-approved to be accepted: ' + approved.stderr)

  const printed = bare(dir).stdout
  assert.match(printed, /^approved: first-visit — 2 beats · screens: home, booking · story: journeys-first-visit--default$/m,
    'D4a: ROADMAP must print "approved: first-visit — 2 beats · screens: home, booking · story: journeys-first-visit--default" straight from the approval record: ' + printed)
  assert.match(printed, /Read only:.*docs\/design\/approval\.json/,
    'D4: ROADMAP\'s Read only: line must name docs/design/approval.json: ' + printed)

  const skippedDir = tmpdir('design-stage-approval-ac6-skipped')
  advanceToDesignBrief(skippedDir, { archetype: 'data-ml', designCatalog: 'none' })
  const printedSkipped = bare(skippedDir).stdout
  assert.doesNotMatch(printedSkipped, /^approved:/m,
    'D4a: a host whose design stage was skipped (no docs/design/approval.json ever written) must print no approved: line at ROADMAP: ' + printedSkipped)
})

// ---------------------------------------------------------------------------
// AC-20260926-06-7
// ---------------------------------------------------------------------------

test('AC-20260926-06-7: WHEN roadmap-written runs with the approval record\'s screens only partly placed THE SYSTEM refuses naming the unplaced screen; WHEN it is placed THE SYSTEM accepts even though a label the seed gained afterward is placed nowhere', () => {
  const dir = setupAtAwaitingApproval('design-stage-approval-ac7')
  const approved = mark(dir, 'design-approved')
  assert.strictEqual(approved.status, 0, 'test setup requires design-approved to be accepted: ' + approved.stderr)

  // The seed gains a journey after the approval record is frozen — its "archive" label must
  // never re-enter the placement check once docs/design/approval.json exists (D4: the seed is
  // no longer the source).
  const seedPath = path.join(dir, 'design/mocks/seed.md')
  const seedText = fs.readFileSync(seedPath, 'utf8')
  fs.writeFileSync(seedPath, seedText.replace(/\n$/, '') +
    '\n\n### archived-items\nA fixture persona does the one thing this journey is for.\n' +
    '1. "I open the archive" -> archive\n')

  writeMinimalRoadmap(dir, { surfaces: ['home', 'booking'] })
  const refused = mark(dir, 'roadmap-written')
  assert.strictEqual(refused.status, 2,
    'D4: roadmap-written must refuse while the approval record\'s "day" screen is placed in no brief: ' + refused.stdout)
  assert.match(refused.stderr, /not placed/, 'D4: the refusal must carry "not placed": ' + refused.stderr)
  assert.match(refused.stderr, /day/, 'D4: the refusal must name the unplaced screen "day": ' + refused.stderr)

  writeMinimalRoadmap(dir, { surfaces: ['home', 'booking', 'day'] })
  const accepted = mark(dir, 'roadmap-written')
  assert.strictEqual(accepted.status, 0,
    'D4: roadmap-written must accept once every approval-record screen is placed, even though the seed\'s own "archive" label (added after the approval froze) is placed nowhere — the approval record, not the seed, is the placement source once it exists: ' + accepted.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-06-8
// ---------------------------------------------------------------------------

test('AC-20260926-06-8: WHEN app/design/approval.json (the wireframe\'s record) is deleted after design-brief-written THE SYSTEM still accepts kit-landed, journeys-drawn, design-approved and roadmap-written and prints HANDOFF', () => {
  const dir = tmpdir('design-stage-approval-ac8')
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys: JOURNEYS_FOR_RATIFY })
  writeDesignPathsJson(dir)
  writeDesignBriefMd(dir, { journeys: JOURNEYS_FOR_RATIFY })
  writeDesignRulesFile(dir)
  writeDetailedSeedJourneys(dir, DETAILED_BEATS)
  writeFile(path.join(dir, 'app/design/approval.json'), JSON.stringify({ schemaVersion: 1, journeys: {} }, null, 2))

  const briefWritten = mark(dir, 'design-brief-written')
  assert.strictEqual(briefWritten.status, 0, 'test setup requires design-brief-written to be accepted: ' + briefWritten.stderr)

  fs.rmSync(path.join(dir, 'app/design/approval.json'))

  prepareKitArtifacts(dir)
  const kitLanded = mark(dir, 'kit-landed')
  assert.strictEqual(kitLanded.status, 0,
    'D5: kit-landed must still be accepted once the wireframe\'s own design/approval.json is gone — the driver must never read it again after DESIGN_BRIEF\'s print: ' + kitLanded.stderr)

  bare(dir)
  writeCleanJourneyStory(dir, 'src/journeys', 'first-visit')
  writeCleanJourneyStory(dir, 'src/journeys', 'daily-check')
  const journeysDrawn = mark(dir, 'journeys-drawn')
  assert.strictEqual(journeysDrawn.status, 0,
    'D5: journeys-drawn must still be accepted with the wireframe\'s design/approval.json gone: ' + journeysDrawn.stderr)

  const designApproved = mark(dir, 'design-approved')
  assert.strictEqual(designApproved.status, 0,
    'D5: design-approved must still be accepted with the wireframe\'s design/approval.json gone: ' + designApproved.stderr)

  writeMinimalRoadmap(dir, { surfaces: ['home', 'booking', 'day'] })
  const roadmapWritten = mark(dir, 'roadmap-written')
  assert.strictEqual(roadmapWritten.status, 0,
    'D5: roadmap-written must still be accepted with the wireframe\'s design/approval.json gone: ' + roadmapWritten.stderr)

  const st = state(dir)
  assert.strictEqual(st.stdout, 'HANDOFF\n',
    'D5: --state must print "HANDOFF\\n" once kit-landed, journeys-drawn, design-approved and roadmap-written are all accepted with app/design/approval.json absent throughout: ' + JSON.stringify(st.stdout))
})
