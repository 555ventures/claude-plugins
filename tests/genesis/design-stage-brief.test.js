'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read, ROOT } = require('../helpers')
const { writeBrief, writeConventionsArtifacts, writeBindingSubset } = require('./tournament.fixtures.js')
const mockApp = require('../mocks/mock-app-fixtures.js')

// specs/20260926/04-the-design-brief.md: genesis-driver.js gains a DESIGN_BRIEF state between
// the green zero-day gate and ROADMAP for a visual, storybook-catalog host (D1), its own step
// text (D2), a design-paths.json validation (D3/D5's catalog line), the brief grammar check
// (D6), the design-contract-check overrides (D7), the D8 mark record, and D9's retirement of the
// mock app's product precedence. This file owns AC-20260926-04-1 through -5, -9, -11 through
// -14, and -16 through -18. None of this exists yet — every test below is red for that reason.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const STUB = path.join(ROOT, 'tests/fixtures/genesis/shadcn-stub.js')
const CARD_DOCS_DIR = path.join(ROOT, 'tests/fixtures/genesis/catalog-docs')

function bare(dir, opts) { return runNode(SCRIPT, ['--root', dir], opts) }
function state(dir, opts) { return runNode(SCRIPT, ['--root', dir, '--state'], opts) }
function mark(dir, name, file, opts) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv, opts)
}
function statusOf(dir) { return JSON.parse(fs.readFileSync(path.join(dir, '.claude/genesis/status.json'), 'utf8')) }

// ---------------------------------------------------------------------------
// Fixture plumbing — drives a synthetic host from a cold root all the way to a green zero-day
// gate on an archetype/designCatalog pair the caller names, reusing tournament.fixtures.js'
// shared writers rather than a third copy of the same conventions/binding-subset scaffolding.
// ---------------------------------------------------------------------------

// A journey given to the helpers below is {name, beats: [screen, screen, ...]} — beats.length is
// the beat count design/mocks/seed.md's own grammar (and DESIGN_BRIEF's "journey: <n> beats"
// line, per AC-4) counts.
function journeyBlock(j) {
  let block = `### ${j.name}\nA fixture persona does the one thing this journey is for.\n`
  j.beats.forEach((screen, i) => { block += `${i + 1}. "beat ${i + 1}" -> ${screen}\n` })
  return block + '\n'
}

function writeSeedJourneys(dir, journeys) {
  let body = '# Seed — Fixture Product\n\n## Records\n\n## Journeys\n\n'
  for (const j of journeys) body += journeyBlock(j)
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/seed.md'), body)
}

// Ratifies BRIEF's D3/D4 artifacts for a visual, non-design-skipped archetype: an APPROVED
// mocks status with an open ledger, a one-page doctrine with a non-empty Dissents, an empty
// design-rules.json, and (when journeys are given) design/mocks/seed.md plus a matching
// ## Journeys block appended to .claude/genesis/brief.md so briefJourneysCheck passes.
function ratifyVisualBrief(dir, journeys) {
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/status.json'), JSON.stringify({
    schemaVersion: 1, state: 'APPROVED', journeys: {}, directions: {}, theme: null,
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'design/mocks/ledger.md'), [
    '# Provenance ledger — test project', '',
    '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |', '',
    '## Misunderstandings', '',
    '| id | what | step | cost | note |',
    '| - | - | - | - | - |', '',
  ].join('\n'))
  fs.mkdirSync(path.join(dir, 'docs/design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/design/doctrine.md'), [
    '# Design doctrine', '',
    '## Dissents',
    'Nothing rejected — synthetic fixture for design-stage-brief.test.js.',
  ].join('\n'))
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/design-rules.json'), JSON.stringify({ rules: [] }))
  fs.writeFileSync(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')

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

const TOURNAMENT_ARCHETYPES = ['web-app', 'realtime-trading', 'backend-api', 'mobile-app', 'desktop-app']
const DESIGN_SKIPPED_ARCHETYPES = ['backend-api', 'data-ml']

function advanceToMenus(dir, archetype, journeys) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for archetype ' + archetype + ': ' + disco.stderr)
  if (!DESIGN_SKIPPED_ARCHETYPES.includes(archetype)) ratifyVisualBrief(dir, journeys)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted for archetype ' + archetype + ': ' + bw.stderr)
}

function advanceToDecide(dir, archetype, journeys) {
  advanceToMenus(dir, archetype, journeys)
  fs.mkdirSync(path.join(dir, '.claude/genesis/interview-research'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/interview-research', DIM + '.json'),
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

function writeValidDecideArtifacts(dir, { archetype, designCatalog = 'none', gateCommand = 'true', scaffoldCommand = 'true' }) {
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/stack-descriptor.json'), JSON.stringify({
    schemaVersion: 1, archetype, language: 'typescript', framework: 'next',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog, gateCommand, scaffoldCommand,
    decisionRecords: ['docs/adr/0001-hosting.md'],
  }, null, 2))
  fs.mkdirSync(path.join(dir, 'docs/adr'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency — no other minority option surfaced.
`)
}

function advanceThroughScaffold(dir, { archetype, designCatalog = 'none', gateCommand = 'true', scaffoldCommand = 'true' }) {
  writeValidDecideArtifacts(dir, { archetype, designCatalog, gateCommand, scaffoldCommand })
  writeConventionsArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)
  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  writeBindingSubset(dir, gateCommand)
  return scaffolded
}

// Drives a cold root all the way to a green zero-day gate on a web-app/storybook host (or
// whatever archetype/designCatalog the caller names) and returns the `--mark skeleton-landed`
// result — the point where D1's DESIGN_BRIEF derivation first has to fire.
function advanceToDesignBrief(dir, { archetype, designCatalog, journeys = [] }) {
  advanceToDecide(dir, archetype, journeys)
  advanceThroughScaffold(dir, { archetype, designCatalog })
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  return landed
}

// ---------------------------------------------------------------------------
// D3/D6's own artifacts — design-paths.json, docs/design/brief.md, and the rules file.
// ---------------------------------------------------------------------------

const COMPOSITES = [
  { name: 'BookingSheet', intent: 'edit one record', states: 'Idle, Saving, Error' },
  { name: 'DestructiveConfirmDialog', intent: 'confirm destructive', states: 'Idle, Confirming' },
]

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
  fs.mkdirSync(path.join(dir, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/genesis/design-paths.json'), JSON.stringify(merged, null, 2))
  return merged
}

function writeDesignBriefMd(dir, { journeys, composites = COMPOSITES, usedComponents = [], excludedComponents = [] }) {
  let body = '# Design brief — Fixture Product\n\n'
  body += '## Users and context\nFixture users, for a synthetic host.\n\n'
  body += '## Journeys\n'
  for (const j of journeys) {
    body += `### ${j.name}\nJTBD: When a fixture persona needs this, I want to do the one thing, so I can move on.\n`
  }
  body += '\n## Navigation\n| Task | Frequency | Entry |\n|------|-----------|-------|\n| do the thing | daily | home |\n\n'
  body += '## Catalog\n### Used\n' + (usedComponents.length ? usedComponents.map((c) => `- ${c}`).join('\n') + '\n' : '')
  body += '### Excluded\n' + (excludedComponents.length ? excludedComponents.map((c) => `- ${c} — not needed`).join('\n') + '\n' : '')
  body += '\n## Composites\n| Composite | Intent | States |\n|-----------|--------|--------|\n'
  for (const c of composites) body += `| ${c.name} | ${c.intent} | ${c.states} |\n`
  body += '\n## Contract\nTables: .claude/rules/design.md (## Intent to pattern, ## Naming).\n'
  fs.mkdirSync(path.join(dir, 'docs/design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/design/brief.md'), body)
}

function writeDesignRulesFile(dir, { composites = COMPOSITES, filledLayers = ['code', 'schema', 'routes', 'wire'] } = {}) {
  let body = '---\npaths:\n  - "src/components/**"\n---\n# Design rules\n\n## Intent to pattern\n\n| Intent | Pattern | Composite |\n|--------|---------|-----------|\n'
  for (const c of composites) body += `| ${c.intent} | side sheet | ${c.name} |\n`
  body += '\n## Naming\n\n'
  for (const layer of ['code', 'schema', 'routes', 'wire']) {
    body += `### ${layer}\n| Kind | Convention | Example |\n|------|------------|---------|\n`
    if (filledLayers.includes(layer)) body += '| thing | kebab-case | example-thing |\n'
    body += '\n'
  }
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/rules/design.md'), body)
}

// Drives a cold root all the way to DESIGN_BRIEF and writes a fully-conforming design-paths.json,
// docs/design/brief.md, and rules file — the shared base AC-11 through AC-14 mutate one thing
// off of.
function setupValidDesignHost(prefix) {
  const dir = tmpdir(prefix)
  const journeys = [{ name: 'first-visit', beats: ['home'] }, { name: 'daily-check', beats: ['home'] }]
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys })
  writeDesignPathsJson(dir)
  writeDesignBriefMd(dir, { journeys })
  writeDesignRulesFile(dir, {})
  return { dir, journeys }
}

// ---------------------------------------------------------------------------
// AC-20260926-04-1 / AC-20260926-04-2 / AC-20260926-04-3
// ---------------------------------------------------------------------------

test('AC-20260926-04-1: WHEN --mark skeleton-landed is accepted with a green gate on a web-app host whose descriptor names designCatalog storybook THE SYSTEM prints (SKELETON → DESIGN_BRIEF) and DESIGN_BRIEF for both the bare run and --state', () => {
  const dir = tmpdir('design-stage-ac1')
  const landed = advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook' })
  assert.match(landed.stdout, /\(SKELETON → DESIGN_BRIEF\)/,
    'D1: the checkpoint line must read "(SKELETON → DESIGN_BRIEF)" once the gate is green on a web-app/storybook host — its absence means the driver still routes straight to ROADMAP, skipping the new design stage entirely: ' + landed.stdout)
  assert.match(landed.stdout, /state: DESIGN_BRIEF/,
    'D1: the printed step header must show "state: DESIGN_BRIEF": ' + landed.stdout)
  const st = state(dir)
  assert.strictEqual(st.status, 0, '--state must exit 0 once DESIGN_BRIEF is the derived state: ' + st.stderr)
  assert.strictEqual(st.stdout, 'DESIGN_BRIEF\n',
    'D1: --state must print exactly "DESIGN_BRIEF\\n" — any other value means deriveState() is not treating this host as design-stage-applicable: ' + JSON.stringify(st.stdout))
})

test('AC-20260926-04-2: WHEN the same run happens on a data-ml host (designCatalog none) or a web-app host whose descriptor names a non-storybook designCatalog THE SYSTEM prints (SKELETON → ROADMAP), records status.designStage.skipped with an at timestamp, and refuses --mark design-brief-written naming "does not apply"', () => {
  const nonVisual = tmpdir('design-stage-ac2-nonvisual')
  const dataMlLanded = advanceToDesignBrief(nonVisual, { archetype: 'data-ml', designCatalog: 'none' })
  assert.match(dataMlLanded.stdout, /\(SKELETON → ROADMAP\)/,
    'D1: a data-ml host must keep going straight to ROADMAP — its checkpoint line must read "(SKELETON → ROADMAP)": ' + dataMlLanded.stdout)
  const stNonVisual = statusOf(nonVisual)
  assert.strictEqual(stNonVisual.designStage && stNonVisual.designStage.skipped, 'non-visual',
    'D1: a data-ml host must record status.designStage.skipped as "non-visual" — data-ml is not in VISUAL_ARCHETYPES regardless of its designCatalog: ' + JSON.stringify(stNonVisual.designStage))
  assert.ok(stNonVisual.designStage && stNonVisual.designStage.at,
    'D1: status.designStage must carry an "at" ISO timestamp: ' + JSON.stringify(stNonVisual.designStage))
  const refusedNonVisual = mark(nonVisual, 'design-brief-written')
  assert.strictEqual(refusedNonVisual.status, 2,
    'D1: --mark design-brief-written must never be accepted on a host the design stage does not apply to: ' + refusedNonVisual.stdout)
  assert.match(refusedNonVisual.stderr, /does not apply/,
    'D1: the refusal must name "does not apply": ' + refusedNonVisual.stderr)

  const nonStorybook = tmpdir('design-stage-ac2-nonstorybook')
  const nonStorybookLanded = advanceToDesignBrief(nonStorybook, { archetype: 'web-app', designCatalog: 'none' })
  assert.match(nonStorybookLanded.stdout, /\(SKELETON → ROADMAP\)/,
    'D1: a web-app host whose descriptor names a non-storybook designCatalog must also go straight to ROADMAP: ' + nonStorybookLanded.stdout)
  const stNonStorybook = statusOf(nonStorybook)
  assert.strictEqual(stNonStorybook.designStage && stNonStorybook.designStage.skipped, 'non-storybook',
    'D1: a visual archetype whose designCatalog is not "storybook" must record status.designStage.skipped as "non-storybook": ' + JSON.stringify(stNonStorybook.designStage))
  const refusedNonStorybook = mark(nonStorybook, 'design-brief-written')
  assert.strictEqual(refusedNonStorybook.status, 2,
    'D1: --mark design-brief-written must never be accepted on a non-storybook visual host either: ' + refusedNonStorybook.stdout)
  assert.match(refusedNonStorybook.stderr, /does not apply/,
    'D1: the refusal must name "does not apply": ' + refusedNonStorybook.stderr)
})

test('AC-20260926-04-3: WHEN design-brief-written has been accepted and docs/design/brief.md is then deleted THE SYSTEM derives DESIGN_BRIEF again on the next bare run', () => {
  const journeys = [{ name: 'first-visit', beats: ['home'] }]
  const dir = tmpdir('design-stage-ac3')
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys })
  writeDesignPathsJson(dir)
  writeDesignBriefMd(dir, { journeys })
  writeDesignRulesFile(dir, {})
  const accepted = mark(dir, 'design-brief-written')
  assert.strictEqual(accepted.status, 0, 'test setup requires design-brief-written to be accepted on a complete host: ' + accepted.stderr)

  fs.rmSync(path.join(dir, 'docs/design/brief.md'))
  const st = state(dir)
  assert.strictEqual(st.status, 0, '--state must exit 0 after the brief file is deleted: ' + st.stderr)
  assert.strictEqual(st.stdout, 'DESIGN_BRIEF\n',
    'D1: deleting docs/design/brief.md after an accepted design-brief-written mark must re-derive DESIGN_BRIEF, never ROADMAP — a state derivation that trusts marks.designBriefWritten alone without checking the artifact physically exists would keep reporting ROADMAP here: ' + JSON.stringify(st.stdout))
})

// ---------------------------------------------------------------------------
// AC-20260926-04-4
// ---------------------------------------------------------------------------

test('AC-20260926-04-4: WHEN the bare run prints DESIGN_BRIEF THE SYSTEM includes the Session/Skill/Doctrine lines, one journey line per seed journey, a Read only: line naming design/approval.json, and the --mark design-brief-written command', () => {
  const dir = tmpdir('design-stage-ac4')
  const journeys = [
    { name: 'first-visit', beats: ['home', 'pick', 'confirm', 'done'] },
    { name: 'daily-check', beats: ['home', 'review', 'done'] },
  ]
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys })
  const printed = bare(dir).stdout

  assert.match(printed, /^Session: start a fresh session for this step — Model: Fable$/m,
    'D2: the step must print the fresh-session/model line verbatim: ' + printed)
  assert.match(printed, /^Skill: design-brief — load it before the first line$/m,
    'D2: the step must print the skill line naming design-brief: ' + printed)
  assert.match(printed, /^Doctrine: spec\/doctrine\/genesis\.md § Genesis: Design Stage$/m,
    'D2: the step must cite § Genesis: Design Stage as its doctrine section: ' + printed)
  assert.match(printed, /^journey: first-visit \(4 beats\)$/m,
    'D2/AC-4: the step must print "journey: first-visit (4 beats)" derived from the seed\'s own beat count: ' + printed)
  assert.match(printed, /^journey: daily-check \(3 beats\)$/m,
    'D2/AC-4: the step must print "journey: daily-check (3 beats)": ' + printed)
  assert.match(printed, /Read only:.*design\/approval\.json/,
    'D2: the Read only: line must name design/approval.json — the last read of the mock app\'s approval record: ' + printed)
  assert.match(printed, /--mark design-brief-written/,
    'D2: the step must print the --mark design-brief-written command: ' + printed)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-5
// ---------------------------------------------------------------------------

test('AC-20260926-04-5: WHEN --mark design-brief-written runs with design-paths.json absent, missing a required key, or carrying an out-of-range storybook.port THE SYSTEM exits 2 naming the file and the first missing/invalid key', () => {
  const dir = tmpdir('design-stage-ac5')
  const journeys = [{ name: 'first-visit', beats: ['home'] }]
  advanceToDesignBrief(dir, { archetype: 'web-app', designCatalog: 'storybook', journeys })
  writeDesignBriefMd(dir, { journeys })
  writeDesignRulesFile(dir, {})

  const noFile = mark(dir, 'design-brief-written')
  assert.strictEqual(noFile.status, 2, 'design-brief-written must refuse when design-paths.json does not exist at all: ' + noFile.stdout)
  assert.match(noFile.stderr, /design-paths\.json/, 'the refusal must name design-paths.json: ' + noFile.stderr)

  const withoutStaticDir = writeDesignPathsJson(dir)
  delete withoutStaticDir.storybook.staticDir
  fs.writeFileSync(path.join(dir, '.claude/genesis/design-paths.json'), JSON.stringify(withoutStaticDir, null, 2))
  const missingKey = mark(dir, 'design-brief-written')
  assert.strictEqual(missingKey.status, 2, 'design-brief-written must refuse when storybook.staticDir is missing: ' + missingKey.stdout)
  assert.match(missingKey.stderr, /design-paths\.json/, 'the refusal must name design-paths.json: ' + missingKey.stderr)
  assert.match(missingKey.stderr, /storybook\.staticDir/, 'the refusal must name the exact missing key storybook.staticDir: ' + missingKey.stderr)

  writeDesignPathsJson(dir, { storybook: { port: 80, buildCommand: 'npx storybook build', staticDir: '.claude/genesis/storybook-static' } })
  const badPort = mark(dir, 'design-brief-written')
  assert.strictEqual(badPort.status, 2, 'design-brief-written must refuse when storybook.port is out of the 1024–65535 range: ' + badPort.stdout)
  assert.match(badPort.stderr, /storybook\.port/, 'the refusal must name storybook.port: ' + badPort.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-9
// ---------------------------------------------------------------------------

test('AC-20260926-04-9: WHEN the bare run first prints DESIGN_BRIEF on a host with components.json and no docs/design/catalog.md THE SYSTEM generates the catalog once, records the counts, prints the catalog line, and never re-runs the inventory on a second bare run', () => {
  const dir = tmpdir('design-stage-ac9')
  advanceToDecide(dir, 'web-app', [])
  advanceThroughScaffold(dir, { archetype: 'web-app', designCatalog: 'storybook' })

  fs.writeFileSync(path.join(dir, 'components.json'), JSON.stringify({ aliases: { ui: 'src/components/ui' } }))
  const counter = path.join(dir, 'stub-calls.txt')
  const env = Object.assign({}, process.env, {
    GENESIS_SHADCN_COMMAND: 'node ' + STUB,
    STUB_COMPONENTS: 'button,card',
    STUB_DOCS_DIR: CARD_DOCS_DIR,
    STUB_COUNTER: counter,
  })

  const landed = mark(dir, 'skeleton-landed', undefined, { env })
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /DESIGN_BRIEF/, 'test setup requires a green gate to reach DESIGN_BRIEF: ' + landed.stdout)

  assert.ok(fs.existsSync(path.join(dir, 'docs/design/catalog.md')),
    'D5: the driver must generate docs/design/catalog.md the first time it prints DESIGN_BRIEF on a host carrying components.json — its absence means the inventory never ran')
  const st = statusOf(dir)
  assert.ok(st.designStage && st.designStage.catalog, 'D5: status.designStage.catalog must be recorded: ' + JSON.stringify(st.designStage))
  assert.strictEqual(st.designStage.catalog.exit, 0, 'D5: status.designStage.catalog.exit must record 0 for a successful inventory run: ' + JSON.stringify(st.designStage.catalog))
  assert.strictEqual(st.designStage.catalog.components, 2, 'D5: status.designStage.catalog.components must record 2 (button, card): ' + JSON.stringify(st.designStage.catalog))
  assert.match(landed.stdout, /catalog: 2 components · 1 compositions unavailable/,
    'D5: the DESIGN_BRIEF print must show the recorded catalog counts as "catalog: 2 components · 1 compositions unavailable": ' + landed.stdout)
  assert.strictEqual(fs.readFileSync(counter, 'utf8').trim(), '1',
    'the shadcn stub must be invoked exactly once by the first DESIGN_BRIEF print: ' + fs.readFileSync(counter, 'utf8'))

  const second = bare(dir, { env })
  assert.strictEqual(second.status, 0, 'a second bare invocation at DESIGN_BRIEF must exit 0: ' + second.stderr)
  assert.strictEqual(fs.readFileSync(counter, 'utf8').trim(), '1',
    'D5: a second bare invocation must NOT re-run the inventory — the stub call-counter staying at 1 is the proof; any higher count means the driver re-fetches the catalog on every print')
})

// ---------------------------------------------------------------------------
// AC-20260926-04-11
// ---------------------------------------------------------------------------

test('AC-20260926-04-11: WHEN --mark design-brief-written runs with a complete brief, a valid design-paths.json, and a rules file whose Composite column matches and whose four naming tables each carry a row THE SYSTEM exits 0, records the marks and status, and prints (DESIGN_BRIEF → ROADMAP)', () => {
  const { dir } = setupValidDesignHost('design-stage-ac11')
  const accepted = mark(dir, 'design-brief-written')
  assert.strictEqual(accepted.status, 0,
    'D6/D7/D8: a fully-conforming brief, design-paths.json and rules file must be accepted — no kit or tokens directory exists on this host, and D7 tolerates kit-missing/tokens-missing at this mark: ' + accepted.stderr)
  const st = statusOf(dir)
  assert.strictEqual(st.marks.designBriefWritten, true, 'D8: marks.designBriefWritten must be true: ' + JSON.stringify(st.marks))
  assert.strictEqual(st.designStage.brief, 'docs/design/brief.md', 'D8: status.designStage.brief must name docs/design/brief.md: ' + JSON.stringify(st.designStage))
  assert.ok(st.designStage.briefAt, 'D8: status.designStage.briefAt must be an ISO timestamp: ' + JSON.stringify(st.designStage))
  assert.match(accepted.stdout, /\(DESIGN_BRIEF → ROADMAP\)/,
    'D8: the checkpoint line must read "(DESIGN_BRIEF → ROADMAP)": ' + accepted.stdout)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-12
// ---------------------------------------------------------------------------

test('AC-20260926-04-12: WHEN a journey block has no JTBD line, or ## Navigation precedes ## Journeys, or the file names ## Entities THE SYSTEM refuses naming the exact offender', () => {
  const { dir: jtbdDir } = setupValidDesignHost('design-stage-ac12-jtbd')
  const jtbdBriefPath = path.join(jtbdDir, 'docs/design/brief.md')
  const jtbdText = fs.readFileSync(jtbdBriefPath, 'utf8')
    .replace(/### daily-check\nJTBD: When[^\n]*\n/, '### daily-check\nNo JTBD line at all here.\n')
  assert.notStrictEqual(jtbdText, fs.readFileSync(jtbdBriefPath, 'utf8'), 'the fixture edit must actually remove the daily-check JTBD line, or this leg proves nothing')
  fs.writeFileSync(jtbdBriefPath, jtbdText)
  const jtbdResult = mark(jtbdDir, 'design-brief-written')
  assert.strictEqual(jtbdResult.status, 2, 'a journey block with no JTBD line must be refused: ' + jtbdResult.stdout)
  assert.match(jtbdResult.stderr, /daily-check/, 'the refusal must name the offending journey daily-check: ' + jtbdResult.stderr)
  assert.match(jtbdResult.stderr, /JTBD/, 'the refusal must name JTBD as what is missing: ' + jtbdResult.stderr)

  const { dir: orderDir, journeys: orderJourneys } = setupValidDesignHost('design-stage-ac12-order')
  const swapped = [
    '# Design brief — Fixture Product', '',
    '## Users and context', 'Fixture users.', '',
    '## Navigation',
    '| Task | Frequency | Entry |',
    '|------|-----------|-------|',
    '| do the thing | daily | home |', '',
    '## Journeys',
    ...orderJourneys.map((j) => `### ${j.name}\nJTBD: When a fixture persona needs this, I want to do the one thing, so I can move on.\n`),
    '## Catalog', '### Used', '### Excluded', '',
    '## Composites',
    '| Composite | Intent | States |',
    '|-----------|--------|--------|',
    '| BookingSheet | edit one record | Idle, Saving, Error |',
    '| DestructiveConfirmDialog | confirm destructive | Idle, Confirming |', '',
    '## Contract', 'Tables: .claude/rules/design.md (## Intent to pattern, ## Naming).', '',
  ].join('\n')
  fs.writeFileSync(path.join(orderDir, 'docs/design/brief.md'), swapped)
  const orderResult = mark(orderDir, 'design-brief-written')
  assert.strictEqual(orderResult.status, 2, '## Navigation preceding ## Journeys must be refused: ' + orderResult.stdout)
  assert.match(orderResult.stderr, /order/, 'the refusal must name "order": ' + orderResult.stderr)
  assert.match(orderResult.stderr, /## Journeys/, 'the refusal must name "## Journeys": ' + orderResult.stderr)

  const { dir: entitiesDir } = setupValidDesignHost('design-stage-ac12-entities')
  const entitiesBriefPath = path.join(entitiesDir, 'docs/design/brief.md')
  fs.writeFileSync(entitiesBriefPath, fs.readFileSync(entitiesBriefPath, 'utf8') + '\n## Entities\nA client record.\n')
  const entitiesResult = mark(entitiesDir, 'design-brief-written')
  assert.strictEqual(entitiesResult.status, 2, 'a file naming ## Entities must be refused: ' + entitiesResult.stdout)
  assert.match(entitiesResult.stderr, /Entities/, 'the refusal must name "Entities": ' + entitiesResult.stderr)
  assert.match(entitiesResult.stderr, /journeys are locked before any entity/, 'the refusal must carry the exact "journeys are locked before any entity" wording: ' + entitiesResult.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-13
// ---------------------------------------------------------------------------

test('AC-20260926-04-13: WHEN ## Composites is missing a rules-file composite, or ### Used names a component absent from docs/design/catalog.md THE SYSTEM refuses naming the exact offender', () => {
  const { dir: compositesDir } = setupValidDesignHost('design-stage-ac13-composites')
  const compositesBriefPath = path.join(compositesDir, 'docs/design/brief.md')
  const compositesText = fs.readFileSync(compositesBriefPath, 'utf8')
    .replace('| DestructiveConfirmDialog | confirm destructive | Idle, Confirming |\n', '')
  fs.writeFileSync(compositesBriefPath, compositesText)
  const compositesResult = mark(compositesDir, 'design-brief-written')
  assert.strictEqual(compositesResult.status, 2, 'a ## Composites table missing a rules-file composite must be refused: ' + compositesResult.stdout)
  assert.match(compositesResult.stderr, /DestructiveConfirmDialog/, 'the refusal must name the missing composite DestructiveConfirmDialog: ' + compositesResult.stderr)
  assert.match(compositesResult.stderr, /Composites/, 'the refusal must name "Composites": ' + compositesResult.stderr)

  const { dir: catalogDir } = setupValidDesignHost('design-stage-ac13-catalog')
  fs.mkdirSync(path.join(catalogDir, 'docs/design'), { recursive: true })
  fs.writeFileSync(path.join(catalogDir, 'docs/design/catalog.md'),
    '# Catalog — shadcn (radix)\n\n## Components\n### button\ncomposition: unavailable\n### card\nsomething\n')
  const catalogBriefPath = path.join(catalogDir, 'docs/design/brief.md')
  fs.writeFileSync(catalogBriefPath, fs.readFileSync(catalogBriefPath, 'utf8').replace('### Used\n', '### Used\n- carousel\n'))
  const catalogResult = mark(catalogDir, 'design-brief-written')
  assert.strictEqual(catalogResult.status, 2, 'a ### Used name absent from docs/design/catalog.md must be refused: ' + catalogResult.stdout)
  assert.match(catalogResult.stderr, /carousel/, 'the refusal must name the offending component carousel: ' + catalogResult.stderr)
  assert.match(catalogResult.stderr, /not in docs\/design\/catalog\.md/, 'the refusal must carry the exact "not in docs/design/catalog.md" wording: ' + catalogResult.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-14
// ---------------------------------------------------------------------------

test('AC-20260926-04-14: WHEN the rules file\'s ### wire table has only its header and separator rows THE SYSTEM refuses table-empty for wire; the same host with wire filled and still no kit directory is accepted', () => {
  const { dir } = setupValidDesignHost('design-stage-ac14')
  writeDesignRulesFile(dir, { filledLayers: ['code', 'schema', 'routes'] })
  const emptyResult = mark(dir, 'design-brief-written')
  assert.strictEqual(emptyResult.status, 2, 'an empty ### wire table must be refused: ' + emptyResult.stdout)
  assert.match(emptyResult.stderr, /table-empty/, 'the refusal must name "table-empty": ' + emptyResult.stderr)
  assert.match(emptyResult.stderr, /wire/, 'the refusal must name the layer "wire": ' + emptyResult.stderr)

  writeDesignRulesFile(dir, {})
  const filledResult = mark(dir, 'design-brief-written')
  assert.strictEqual(filledResult.status, 0,
    'D7: filling the ### wire table on the same host (no kit directory exists at all) must be accepted — kit-missing is tolerated at this mark, so a still-nonzero exit means it is wrongly treated as blocking: ' + filledResult.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260926-04-16 / AC-20260926-04-17 / AC-20260926-04-18 (D9's mock-app retirement)
// ---------------------------------------------------------------------------

test('AC-20260926-04-16: WHEN MENUS runs on a host with app/mock.config.ts present and framework/language/packageManager open THE SYSTEM prints no Auto-picked line, leaves status.tournament without a skipped key, and routes a tournament archetype to FINALISTS after menus-done', () => {
  const dir = tmpdir('design-stage-ac16')
  mockApp.writeStatus(dir, { state: 'SEED' })
  mockApp.writeApp(dir)

  writeBrief(dir, {
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    // backend-api: a TOURNAMENT archetype that is also DESIGN_SKIPPED, so brief-written is
    // accepted immediately with no mocks/doctrine artifacts owed — the mock-app host above is
    // for MENUS to read, not for BRIEF's ratification gate.
    picks: ['- archetype: backend-api'],
  })
  assert.strictEqual(mark(dir, 'discovery-done').status, 0, 'test setup requires discovery-done to be accepted')
  assert.strictEqual(mark(dir, 'brief-written').status, 0, 'test setup requires brief-written to be accepted immediately for backend-api')

  // D9 retires the mock-app narrowing that once fixed framework/language/package-manager for
  // free — every dimension, including these three, now gets a menu file and a ## Picks line
  // exactly as any non-mock host would.
  fs.mkdirSync(path.join(dir, '.claude/genesis/interview-research'), { recursive: true })
  const dimensionPicks = { framework: 'react', language: 'typescript', 'package-manager': 'npm', 'test-runner': 'vitest' }
  for (const [dim, label] of Object.entries(dimensionPicks)) {
    fs.writeFileSync(path.join(dir, '.claude/genesis/interview-research', dim + '.json'),
      JSON.stringify({ dimension: dim, options: [{ label, packages: [] }] }))
    const written = mark(dir, 'menu-written', 'interview-research/' + dim + '.json')
    assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted for ' + dim + ': ' + written.stderr)
  }
  writeBrief(dir, {
    dims: { framework: 'open', language: 'open', 'package-manager': 'open', 'test-runner': 'open' },
    picks: ['- archetype: backend-api'].concat(Object.entries(dimensionPicks).map(([dim, label]) => '- ' + dim + ': ' + label)),
  })

  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare invocation at MENUS on a mock-app host must exit 0: ' + r.stderr)
  assert.doesNotMatch(r.stdout, /Auto-picked/,
    'D9: MENUS must print no "Auto-picked" line once the mock app stops being the product\'s frontend — its presence means the retired auto-pick mechanism is still live: ' + r.stdout)

  const afterMenus = statusOf(dir)
  assert.ok(!(afterMenus.tournament && 'skipped' in afterMenus.tournament),
    'D9: status.tournament must carry no "skipped" key purely from MENUS observing the mock app — its presence means the retired mock-app tournament-skip is still recording itself: ' + JSON.stringify(afterMenus.tournament))

  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted: ' + menusDone.stderr)
  assert.match(menusDone.stdout, /FINALISTS/,
    'D9: a tournament archetype must reach FINALISTS after menus-done on a mock-app host — its absence means the retired mock-app tournament-skip still routed straight to DECIDE: ' + menusDone.stdout)
})

test('AC-20260926-04-17: WHEN --mark skeleton-landed runs on a host with app/mock.config.ts and a stub mock-review on PATH that would exit 1 THE SYSTEM never spawns it, records status.scaffold.exit 0 instead of skipped mock-app, and accepts the mark once the probe/binding-subset/gate checks pass', () => {
  const dir = tmpdir('design-stage-ac17')
  advanceToDecide(dir, 'data-ml', [])
  writeValidDecideArtifacts(dir, { archetype: 'data-ml', designCatalog: 'none', gateCommand: 'true', scaffoldCommand: 'true' })
  writeConventionsArtifacts(dir)
  mockApp.writeStatus(dir, { state: 'SEED' })
  mockApp.writeApp(dir)
  assert.strictEqual(mark(dir, 'decided').status, 0, 'test setup requires decided to be accepted')

  const stubDir = path.join(dir, '.mock-review-bin')
  fs.mkdirSync(stubDir, { recursive: true })
  const counterPath = path.join(dir, 'mock-review-called.txt')
  fs.writeFileSync(path.join(stubDir, 'mock-review'),
    '#!/usr/bin/env bash\nset -u\necho called >> "' + counterPath + '"\necho \'{"ok":false}\'\nexit 1\n')
  fs.chmodSync(path.join(stubDir, 'mock-review'), 0o755)
  const env = Object.assign({}, process.env, { PATH: stubDir + path.delimiter + process.env.PATH })

  const scaffolded = bare(dir, { env })
  assert.strictEqual(scaffolded.status, 0, 'the scaffold must run to completion even with app/mock.config.ts present: ' + scaffolded.stderr)
  assert.match(scaffolded.stdout, /SKELETON/, 'the scaffold must reach SKELETON: ' + scaffolded.stdout)
  const afterScaffold = statusOf(dir)
  assert.strictEqual(afterScaffold.scaffold && afterScaffold.scaffold.exit, 0,
    'D9: status.scaffold.exit must be 0 (scaffoldCommand actually ran) even though app/mock.config.ts exists — its being {skipped:"mock-app"} instead means the retired scaffold-skip branch is still live: ' + JSON.stringify(afterScaffold.scaffold))

  writeBindingSubset(dir, 'true')
  const landed = mark(dir, 'skeleton-landed', undefined, { env })
  assert.strictEqual(landed.status, 0,
    'D9: skeleton-landed must be accepted once the probe/binding-subset/gate checks pass, regardless of app/mock.config.ts existing — its refusal means the retired mock-review-gated branch is still live: ' + landed.stderr)
  assert.ok(!fs.existsSync(counterPath),
    'D9: the mock-review stub must never be invoked by skeleton-landed once the retired branch is gone — its counter file existing means "mock-review check --json" still ran: ' + counterPath)
})

test('AC-20260926-04-18: spec/scripts/genesis-driver.js contains none of MOCK_APP_FIXED_DIMS, appendDerivedPicksToBrief, skipped: \'mock-app\', or require(\'./lib/mock-cli\')', () => {
  const src = read('spec/scripts/genesis-driver.js')
  const banned = /MOCK_APP_FIXED_DIMS|appendDerivedPicksToBrief|skipped:\s*'mock-app'|require\(['"]\.\/lib\/mock-cli['"]\)/
  const found = src.match(banned)
  assert.ok(!found,
    'D9: spec/scripts/genesis-driver.js must contain none of MOCK_APP_FIXED_DIMS, appendDerivedPicksToBrief, skipped: \'mock-app\', or require(\'./lib/mock-cli\') — a match means a retired mock-app-precedence branch is still in the driver: ' + JSON.stringify(found))
})
