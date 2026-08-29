'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read } = require('../helpers')

// specs/20260827/03-genesis-design-state.md (2026-08-29, TDD red): the design lock stops being
// a separate command (/spec:genesis-design) and becomes a driver state, DESIGN, between ROADMAP
// and HANDOFF — doctrine-drafted (one-page doctrine, Dissents naming every rejected candidate) ->
// [tokens-landed, visual only: the winner's tokens.css ratified verbatim, an approved
// matrix-clean mock, design/components.json] -> rules-locked (design-rules.json category/
// grounding enums valid, components-check.js green, then the prune). backend-api/data-ml never
// enter it (design: "skipped"); every other non-visual archetype still enters DESIGN with no
// tokens step. None of AC-20260827-03-1..5 can pass yet: genesis-driver.js has no DESIGN state,
// no doctrine-drafted/tokens-landed/rules-locked marks, and roadmap-written always lands HANDOFF
// unconditionally (grep confirmed at authoring time, 2026-08-29).
//
// Fixtures follow Assumption A1 (executed micro-spike 2026-08-27, S4; re-verified 2026-08-29
// against the live design-atlas.js): a data-status="approved" mock that omits <meta
// name="viewport"> fails `check --matrix` naming the missing meta once design/targets.json
// declares more than one viewport. This file cannot require() genesis-driver.test.js's or
// explore-states.test.js's own file-local helpers (no shared module beyond tests/helpers.js) —
// writeBrief/menus-stage setup and the EXPLORE funnel helpers duplicate their shape deliberately.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'
const COVERAGE_KEYS = [
  'payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile',
]

function bare(dir) {
  return runNode(SCRIPT, ['--root', dir])
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

// Same shape as genesis-driver.test.js's/explore-states.test.js's own writeBrief.
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for design-state.test.js.

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

function writeValidDecideArtifacts(dir, { archetype, scaffoldCommand = 'true', gateCommand = 'true', designCatalog = 'none' } = {}) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1,
    archetype,
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

// Drives a fresh root all the way to the mark that closes ROADMAP, for any archetype, taking the
// external explore path (never the internal tile funnel) when visual — cheap setup for tests that
// only care about the state DESIGN/HANDOFF resolves to, not about a real ratified winner.
function advanceToRoadmap(dir, { archetype, visual = false, tournament = false, designCatalog = 'none' } = {}) {
  bare(dir)
  writeBrief(dir)
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief: ' + disco.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted for archetype ' + archetype + ': ' + menusDone.stderr)

  if (visual) {
    writeFile(path.join(dir, 'design/explore/external/mine/index.html'),
      '<html><body><div data-screen-label="home"></div></body></html>')
    writeJSON(path.join(dir, 'design/targets.json'), { themes: ['light'], viewports: [{ name: 'mobile', width: 390, height: 844 }] })
    const ext = mark(dir, 'external', 'design/explore/external/mine')
    assert.strictEqual(ext.status, 0, 'test setup requires the external explore path to be accepted for archetype ' + archetype + ': ' + ext.stderr)
  }
  if (tournament) {
    const skip = mark(dir, 'finalists-skipped')
    assert.strictEqual(skip.status, 0, 'test setup requires finalists-skipped to be accepted for archetype ' + archetype + ': ' + skip.stderr)
  }

  writeValidDecideArtifacts(dir, { archetype, designCatalog })
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)

  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)

  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green gateCommand to reach ROADMAP: ' + landed.stdout)

  writeRoadmap(dir, [{ name: '01-a.md', dependsOn: '—' }])
  return mark(dir, 'roadmap-written')
}

test('AC-20260827-03-1: roadmap-written for archetype backend-api prints state: HANDOFF and records design: "skipped"; for web-app it prints state: DESIGN with a Doctrine line naming Genesis: Design State; for cli-devtool it reaches DESIGN but refuses --mark tokens-landed naming cli-devtool and "no tokens step"', () => {
  const backend = tmpdir('design-ac1-backend')
  const roadmappedBackend = advanceToRoadmap(backend, { archetype: 'backend-api', tournament: true })
  assert.strictEqual(roadmappedBackend.status, 0, 'test setup requires roadmap-written to be accepted for backend-api: ' + roadmappedBackend.stderr)
  assert.match(roadmappedBackend.stdout, /state: HANDOFF/, 'D1: backend-api never enters DESIGN — roadmap-written must land straight on HANDOFF for this headless archetype')
  assert.strictEqual(statusOf(backend).design, 'skipped', 'D1: the driver must write design: "skipped" for backend-api the first derivation past ROADMAP, or downstream design tooling has no durable record that this archetype was never offered a design canon')

  const webapp = tmpdir('design-ac1-webapp')
  const roadmappedWeb = advanceToRoadmap(webapp, { archetype: 'web-app', visual: true, tournament: true })
  assert.strictEqual(roadmappedWeb.status, 0, 'test setup requires roadmap-written to be accepted for web-app: ' + roadmappedWeb.stderr)
  assert.match(roadmappedWeb.stdout, /state: DESIGN/, 'D1: web-app is a visual archetype — roadmap-written must land the driver in the new DESIGN state, between ROADMAP and HANDOFF, instead of skipping straight to handoff')
  assert.match(roadmappedWeb.stdout, /^Doctrine: spec\/doctrine\/genesis\.md § Genesis: Design State$/m, 'the DESIGN step must print a Doctrine: line naming § Genesis: Design State — its absence leaves the session with no printed pointer to the section governing the design ratification it is about to run')

  const cli = tmpdir('design-ac1-cli')
  const roadmappedCli = advanceToRoadmap(cli, { archetype: 'cli-devtool' })
  assert.strictEqual(roadmappedCli.status, 0, 'test setup requires roadmap-written to be accepted for cli-devtool: ' + roadmappedCli.stderr)
  assert.match(roadmappedCli.stdout, /state: DESIGN/, 'D1: cli-devtool is a non-visual archetype that still enters DESIGN (doctrine-drafted -> rules-locked, no tokens step) — it must not skip design entirely the way backend-api/data-ml do')
  const tokensRefused = mark(cli, 'tokens-landed')
  assert.strictEqual(tokensRefused.status, 2, 'D3: tokens-landed must be refused entirely for a non-visual archetype — there is no tokens step for it to land')
  assert.match(tokensRefused.stderr, /cli-devtool/, 'the refusal must name the archetype "cli-devtool" so the session understands why this mark does not apply to this project')
  assert.match(tokensRefused.stderr, /no tokens step/, 'the refusal must say "no tokens step" per D3\'s literal wording, or the session cannot tell this refusal apart from an ordinary missing-artifact refusal')
})

test('AC-20260827-03-2: doctrine-drafted refuses a 130-line doctrine naming 130, refuses an empty ## Dissents naming Dissents, refuses a design-pick.json rejection unnamed in Dissents by naming it, and accepts once all three hold, writing design: "doctrine-drafted" and the (DESIGN → DESIGN) checkpoint', () => {
  function doctrineOfLength(total, dissentsBody) {
    const lines = ['# Design doctrine', '']
    while (lines.length < total - 2) lines.push('Filler line ' + lines.length + ' for line-count padding.')
    lines.push('## Dissents')
    lines.push(dissentsBody)
    return lines.slice(0, total).join('\n')
  }

  const tooLong = tmpdir('design-ac2-toolong')
  advanceToRoadmap(tooLong, { archetype: 'cli-devtool' })
  writeFile(path.join(tooLong, 'docs/design/doctrine.md'),
    doctrineOfLength(130, 'Fly.io was considered and rejected for regional latency — no other minority option surfaced.'))
  const tooLongRefused = mark(tooLong, 'doctrine-drafted')
  assert.strictEqual(tooLongRefused.status, 2, 'D2: a 130-line doctrine is over the one-page (120-line) cap — the mark must refuse it rather than let the doctrine sprawl: ' + JSON.stringify(tooLongRefused))
  assert.match(tooLongRefused.stderr, /\b130\b/, 'the refusal must name the measured line count "130" so the session knows exactly how far over the cap the file is')

  const emptyDissents = tmpdir('design-ac2-emptydissents')
  advanceToRoadmap(emptyDissents, { archetype: 'cli-devtool' })
  writeFile(path.join(emptyDissents, 'docs/design/doctrine.md'),
    '# Design doctrine\n\nOne page, one canon.\n\n## Dissents')
  const emptyRefused = mark(emptyDissents, 'doctrine-drafted')
  assert.strictEqual(emptyRefused.status, 2, 'D2: a ## Dissents heading followed by no non-blank line records no minority position at all — the mark must refuse it: ' + JSON.stringify(emptyRefused))
  assert.match(emptyRefused.stderr, /Dissents/, 'the refusal must name "Dissents" so the session knows exactly which section is empty')

  const unnamedReject = tmpdir('design-ac2-unnamed')
  advanceToRoadmap(unnamedReject, { archetype: 'cli-devtool' })
  writeJSON(path.join(unnamedReject, '.claude/genesis/design-pick.json'), {
    winner: 'design/explore/r0-instrument',
    rejected: [{ candidate: 'design/explore/r0-dense-professional', reason: 'less legible at small viewports' }],
  })
  writeFile(path.join(unnamedReject, 'docs/design/doctrine.md'),
    '# Design doctrine\n\nOne page, one canon.\n\n## Dissents\nFly.io was considered and rejected for regional latency — no other minority option surfaced.\n')
  const unnamedRefused = mark(unnamedReject, 'doctrine-drafted')
  assert.strictEqual(unnamedRefused.status, 2, 'D2: design-pick.json rejects r0-dense-professional but the Dissents body never names it — a rejected design direction with no recorded minority position is exactly the loss D2 exists to prevent: ' + JSON.stringify(unnamedRefused))
  assert.match(unnamedRefused.stderr, /dense-professional/, 'the refusal must name the unrecorded candidate "dense-professional" so the session knows exactly which rejected direction to add to Dissents')

  const ok = tmpdir('design-ac2-ok')
  advanceToRoadmap(ok, { archetype: 'cli-devtool' })
  writeJSON(path.join(ok, '.claude/genesis/design-pick.json'), {
    winner: 'design/explore/r0-instrument',
    rejected: [{ candidate: 'design/explore/r0-dense-professional', reason: 'less legible at small viewports' }],
  })
  writeFile(path.join(ok, 'docs/design/doctrine.md'),
    '# Design doctrine\n\nOne page, one canon.\n\n## Dissents\ndense-professional was considered and rejected — less legible at small viewports.\n')
  const accepted = mark(ok, 'doctrine-drafted')
  assert.strictEqual(accepted.status, 0, 'a doctrine under the line cap, with a non-empty Dissents naming every rejected candidate, must be accepted: ' + accepted.stderr)
  assert.strictEqual(statusOf(ok).design, 'doctrine-drafted', 'a successful doctrine-drafted must record design: "doctrine-drafted" so re-derivation lands on the next DESIGN step')
  assert.match(accepted.stdout.trimEnd().split('\n').pop(), /\(DESIGN → DESIGN\)/, 'doctrine-drafted advances DESIGN\'s own internal mark progression, not the driver\'s top-level state, so the checkpoint arrow must show no state change')
})

// Shared fixture for AC-3/AC-4: a real internal EXPLORE funnel (not the external path) so the
// pick has an actual design/explore/r0-<kebab> winner dir with real tokens.css content to ratify
// verbatim against — the external path has no prefix rule at all (D3) and so cannot exercise it.
const EXPLORE_KEBABS = ['instrument', 'dense-professional', 'quiet-utility', 'loud-signal', 'soft-analog', 'sharp-technical']
const POSITION_LABELS = [
  'Stance', 'Rules cited', 'Anti-defaults', 'Reference direction',
  'Motion character', 'Density & layout intent', 'Starter tokens',
]

function writeResearchBrief(dir) {
  writeFile(path.join(dir, 'docs/design/research-brief.md'), '# Research brief\n\n## Angle one\nSynthetic research note for design-state.test.js.\n')
}

function writeTargets(dir, viewports) {
  writeJSON(path.join(dir, 'design/targets.json'), { themes: ['light'], viewports })
}

function positionBlock(kebab) {
  const lines = ['## Position: ' + kebab, '']
  for (const label of POSITION_LABELS) lines.push('**' + label + ':** synthetic value for ' + kebab + ' — ' + label.toLowerCase() + '.')
  lines.push('')
  return lines.join('\n')
}

function writePositionsMd(dir, kebabs, cullRecord) {
  let body = '# Explore positions\n\n'
  for (const k of kebabs) body += positionBlock(k)
  if (cullRecord) {
    body += '\n## Cull record\n\n'
    for (const line of cullRecord) body += line + '\n'
  }
  writeFile(path.join(dir, 'design/explore/positions.md'), body)
}

function writeTokensCss(dir, kebab) {
  writeFile(path.join(dir, 'design/explore/r0-' + kebab + '/tokens.css'),
    ':root {\n  --role-bg: #ffffff;\n  --role-fg: #111111;\n}\n')
}

function writeValidTile(dir, kebab) {
  writeFile(path.join(dir, 'design/explore/r0-' + kebab + '/tile.html'),
    '<!doctype html>\n<html><head><link rel="stylesheet" href="./tokens.css"></head>\n<body>\n' +
    '<div data-screen-label="' + kebab + '">\n' +
    '  <p style="color: var(--role-fg); background: var(--role-bg)">Tile</p>\n</div>\n</body></html>\n')
}

const VALID_VIEWPORTS = [{ name: 'mobile', width: 390, height: 844 }]
const TWO_VIEWPORTS = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]

// Assumption A1 shape: a mock with data-status="approved", a tokens.css link, no off-token color
// literals, and clean hygiene ((a) a universal border-box reset), so the ONLY dimension a caller
// varies is whether the viewport <meta> is present.
function mockHtml({ withViewportMeta }) {
  return '<!doctype html>\n<html><head>' +
    (withViewportMeta ? '<meta name="viewport" content="width=device-width, initial-scale=1">' : '') +
    '<link rel="stylesheet" href="../tokens.css"></head>\n<body>\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<div data-screen-label="home" data-status="approved">\n' +
    '  <p style="color: var(--role-fg); background: var(--role-bg)">Approved mock</p>\n' +
    '</div>\n</body></html>\n'
}

// Drives web-app all the way through the internal tile funnel to ROADMAP -> DESIGN, culling to
// exactly two survivors (instrument, dense-professional) and skipping the tournament's race
// entirely via finalists-skipped (D8's picked-mark path is exercised in explore-states.test.js;
// this DESIGN-stage fixture only needs a real winner dir, never a recorded tournament.winner).
function advanceToDesignWithFunnel(dir) {
  bare(dir)
  writeBrief(dir)
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted: ' + written.stderr)
  writeBrief(dir, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
  const menusDone = mark(dir, 'menus-done')
  assert.strictEqual(menusDone.status, 0, 'test setup requires menus-done to be accepted for web-app: ' + menusDone.stderr)
  assert.match(menusDone.stdout, /state: EXPLORE/, 'test setup requires the visual archetype web-app to reach EXPLORE straight after menus-done: ' + menusDone.stdout)

  writeResearchBrief(dir)
  writeTargets(dir, VALID_VIEWPORTS)
  const researchDone = mark(dir, 'research-done')
  assert.strictEqual(researchDone.status, 0, 'test setup requires research-done to be accepted: ' + researchDone.stderr)
  writePositionsMd(dir, EXPLORE_KEBABS)
  for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
  const positionsAuthored = mark(dir, 'positions-authored')
  assert.strictEqual(positionsAuthored.status, 0, 'test setup requires positions-authored to be accepted: ' + positionsAuthored.stderr)
  for (const k of EXPLORE_KEBABS) writeValidTile(dir, k)
  const tilesBuilt = mark(dir, 'tiles-built')
  assert.strictEqual(tilesBuilt.status, 0, 'test setup requires tiles-built to be accepted: ' + tilesBuilt.stderr)
  writePositionsMd(dir, EXPLORE_KEBABS, [
    '- **quiet-utility** — culled: too quiet',
    '- **loud-signal** — culled: too loud',
    '- **soft-analog** — culled: too soft',
    '- **sharp-technical** — culled: too technical',
  ])
  const tilesCulled = mark(dir, 'tiles-culled')
  assert.strictEqual(tilesCulled.status, 0, 'test setup requires tiles-culled to be accepted, leaving instrument and dense-professional: ' + tilesCulled.stderr)

  const finalistsStep = bare(dir)
  assert.match(finalistsStep.stdout, /state: FINALISTS/, 'test setup requires explore to hand off to FINALISTS for web-app: ' + finalistsStep.stdout)
  const skipped = mark(dir, 'finalists-skipped')
  assert.strictEqual(skipped.status, 0, 'test setup requires finalists-skipped to be accepted: ' + skipped.stderr)

  writeValidDecideArtifacts(dir, { archetype: 'web-app', designCatalog: 'storybook' })
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'test setup requires decided to be accepted: ' + decided.stderr)

  const scaffolded = bare(dir)
  assert.match(scaffolded.stdout, /SKELETON/, 'test setup requires the auto-run scaffold to reach SKELETON: ' + scaffolded.stdout)
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'test setup requires a green gateCommand to reach ROADMAP: ' + landed.stdout)

  writeRoadmap(dir, [{ name: '01-a.md', dependsOn: '—' }])
  const roadmapped = mark(dir, 'roadmap-written')
  assert.strictEqual(roadmapped.status, 0, 'test setup requires roadmap-written to be accepted: ' + roadmapped.stderr)
  assert.match(roadmapped.stdout, /state: DESIGN/, 'test setup requires the visual archetype web-app to reach DESIGN straight after roadmap-written: ' + roadmapped.stdout)

  writeJSON(path.join(dir, '.claude/genesis/design-pick.json'), {
    winner: 'design/explore/r0-instrument',
    rejected: [{ candidate: 'design/explore/r0-dense-professional', reason: 'less legible at small viewports' }],
  })
}

function acceptDoctrineDrafted(dir) {
  writeFile(path.join(dir, 'docs/design/doctrine.md'),
    '# Design doctrine\n\nOne page, one canon.\n\n## Dissents\ndense-professional was considered and rejected — less legible at small viewports.\n')
  const r = mark(dir, 'doctrine-drafted')
  assert.strictEqual(r.status, 0, 'test setup requires doctrine-drafted to be accepted with a short doctrine naming the rejected candidate in Dissents: ' + r.stderr)
  return r
}

test('AC-20260827-03-3: tokens-landed refuses a design/tokens.css that does not start with the winner\'s tokens.css by naming the file and "verbatim", refuses when no approved mock exists by naming data-status="approved", refuses a mock failing check --matrix (no viewport meta) by naming design/mocks with the check output, and accepts once all three hold, writing design: "tokens-landed"', () => {
  const badPrefix = tmpdir('design-ac3-verbatim')
  advanceToDesignWithFunnel(badPrefix)
  acceptDoctrineDrafted(badPrefix)
  writeFile(path.join(badPrefix, 'design/tokens.css'), ':root {\n  --role-bg: #223344;\n}\n')
  writeTargets(badPrefix, TWO_VIEWPORTS)
  writeFile(path.join(badPrefix, 'design/mocks/home.html'), mockHtml({ withViewportMeta: true }))
  writeJSON(path.join(badPrefix, 'design/components.json'), [])
  const prefixRefused = mark(badPrefix, 'tokens-landed')
  assert.strictEqual(prefixRefused.status, 2, 'D3: design/tokens.css must startsWith the winner\'s r0-instrument/tokens.css verbatim — a divergent file must refuse the mark: ' + JSON.stringify(prefixRefused))
  assert.match(prefixRefused.stderr, /design\/tokens\.css/, 'the refusal must name "design/tokens.css" so the session knows exactly which file diverged')
  assert.match(prefixRefused.stderr, /verbatim/, 'the refusal must say "verbatim" — the remedy is ratifying the winner\'s file byte-for-byte, not authoring a new one')

  const noMock = tmpdir('design-ac3-mock')
  advanceToDesignWithFunnel(noMock)
  acceptDoctrineDrafted(noMock)
  writeFile(path.join(noMock, 'design/tokens.css'), fs.readFileSync(path.join(noMock, 'design/explore/r0-instrument/tokens.css'), 'utf8'))
  fs.mkdirSync(path.join(noMock, 'design/mocks'), { recursive: true })
  writeJSON(path.join(noMock, 'design/components.json'), [])
  const noMockRefused = mark(noMock, 'tokens-landed')
  assert.strictEqual(noMockRefused.status, 2, 'D3: design/mocks/ must hold at least one approved mock — an empty mocks dir must refuse the mark rather than land tokens with nothing to show for the matrix expansion: ' + JSON.stringify(noMockRefused))
  assert.match(noMockRefused.stderr, /data-status="approved"/, 'the refusal must name the missing data-status="approved" attribute so the session knows exactly what an approved mock requires')

  const failMatrix = tmpdir('design-ac3-matrix')
  advanceToDesignWithFunnel(failMatrix)
  acceptDoctrineDrafted(failMatrix)
  writeFile(path.join(failMatrix, 'design/tokens.css'), fs.readFileSync(path.join(failMatrix, 'design/explore/r0-instrument/tokens.css'), 'utf8'))
  writeTargets(failMatrix, TWO_VIEWPORTS)
  writeFile(path.join(failMatrix, 'design/mocks/home.html'), mockHtml({ withViewportMeta: false }))
  writeJSON(path.join(failMatrix, 'design/components.json'), [])
  const matrixRefused = mark(failMatrix, 'tokens-landed')
  assert.strictEqual(matrixRefused.status, 2, 'A1/D3: an approved mock missing <meta name="viewport"> fails design-atlas.js check --matrix once targets.json declares more than one viewport — the mark must refuse it: ' + JSON.stringify(matrixRefused))
  assert.match(matrixRefused.stderr, /design\/mocks/, 'the refusal must name "design/mocks" so the session knows which directory the failing check ran against')
  assert.match(matrixRefused.stderr, /viewport/i, 'the refusal must carry the check\'s own output naming the missing viewport meta, or the session has to re-run the check itself to learn what failed')

  const ok = tmpdir('design-ac3-ok')
  advanceToDesignWithFunnel(ok)
  acceptDoctrineDrafted(ok)
  writeFile(path.join(ok, 'design/tokens.css'), fs.readFileSync(path.join(ok, 'design/explore/r0-instrument/tokens.css'), 'utf8'))
  writeTargets(ok, TWO_VIEWPORTS)
  writeFile(path.join(ok, 'design/mocks/home.html'), mockHtml({ withViewportMeta: true }))
  writeJSON(path.join(ok, 'design/components.json'), [])
  const accepted = mark(ok, 'tokens-landed')
  assert.strictEqual(accepted.status, 0, 'a verbatim tokens.css, an approved matrix-clean mock, and an existing components.json must be accepted: ' + accepted.stderr)
  assert.strictEqual(statusOf(ok).design, 'tokens-landed', 'a successful tokens-landed must record design: "tokens-landed" so re-derivation lands on the rules-locked step next')
})

const TARGET_CATEGORIES = ['color', 'typography', 'i18n', 'structure', 'a11y', 'density', 'layout']

function acceptTokensLanded(dir) {
  writeFile(path.join(dir, 'design/tokens.css'), fs.readFileSync(path.join(dir, 'design/explore/r0-instrument/tokens.css'), 'utf8'))
  writeTargets(dir, TWO_VIEWPORTS)
  writeFile(path.join(dir, 'design/mocks/home.html'), mockHtml({ withViewportMeta: true }))
  writeJSON(path.join(dir, 'design/components.json'), [])
  const r = mark(dir, 'tokens-landed')
  assert.strictEqual(r.status, 0, 'test setup requires tokens-landed to be accepted: ' + r.stderr)
  return r
}

test('AC-20260827-03-4: rules-locked refuses a rule whose targetCategory is "engine" by naming it and the seven categories, refuses a duplicate component name carrying components-check.js\'s own output, and accepts once valid, writing design: "rules-locked", pruning the losing candidate/gallery/sketch/authored-snapshot while keeping the winner and positions.md, and reaching HANDOFF on the next bare run', () => {
  const badCategory = tmpdir('design-ac4-category')
  advanceToDesignWithFunnel(badCategory)
  acceptDoctrineDrafted(badCategory)
  acceptTokensLanded(badCategory)
  writeJSON(path.join(badCategory, '.claude/genesis/design-rules.json'), {
    rules: [{ id: 'no-raw-color', targetCategory: 'engine', grounding: 'grounded', severity: 'error', appliesTo: ['src/**'] }],
  })
  const categoryRefused = mark(badCategory, 'rules-locked')
  assert.strictEqual(categoryRefused.status, 2, 'D4: "engine" is not one of the seven closed targetCategory values — the mark must refuse a rule carrying it: ' + JSON.stringify(categoryRefused))
  assert.match(categoryRefused.stderr, /engine/, 'the refusal must name the offending value "engine" so the session knows which rule to fix')
  for (const cat of TARGET_CATEGORIES) {
    assert.match(categoryRefused.stderr, new RegExp(cat), 'the refusal must enumerate the seven valid categories (missing "' + cat + '") so the session knows every value it may pick instead')
  }

  const dupComponent = tmpdir('design-ac4-dup')
  advanceToDesignWithFunnel(dupComponent)
  acceptDoctrineDrafted(dupComponent)
  acceptTokensLanded(dupComponent)
  writeJSON(path.join(dupComponent, '.claude/genesis/design-rules.json'), {
    rules: [{ id: 'no-raw-color', targetCategory: 'color', grounding: 'grounded', severity: 'error', appliesTo: ['src/**'] }],
  })
  writeJSON(path.join(dupComponent, 'design/components.json'), [
    { name: 'Button', purpose: 'primary action' },
    { name: 'Button', purpose: 'secondary action' },
  ])
  const dupRefused = mark(dupComponent, 'rules-locked')
  assert.strictEqual(dupRefused.status, 2, 'D4: a duplicate component "name" is a components-check.js finding — the mark must refuse it and carry that finding, never silently accept a manifest with two homes for one component: ' + JSON.stringify(dupRefused))
  assert.match(dupRefused.stderr, /duplicate/, 'the refusal must carry components-check.js\'s own "duplicate" finding so the session sees exactly what that tool reported')
  assert.match(dupRefused.stderr, /Button/, 'the refusal must name the offending component "Button" so the session knows which entry to rename or merge')

  const ok = tmpdir('design-ac4-ok')
  advanceToDesignWithFunnel(ok)
  acceptDoctrineDrafted(ok)
  acceptTokensLanded(ok)
  writeFile(path.join(ok, '.claude/genesis/sketch.html'), '<html><body>legacy sketch</body></html>\n')
  writeJSON(path.join(ok, '.claude/genesis/design-rules.json'), {
    rules: [{ id: 'no-raw-color', targetCategory: 'color', grounding: 'grounded', severity: 'error', appliesTo: ['src/**'] }],
  })
  writeJSON(path.join(ok, 'design/components.json'), [
    { name: 'Button', purpose: 'primary action' },
    { name: 'Input', purpose: 'text entry' },
  ])
  const accepted = mark(ok, 'rules-locked')
  assert.strictEqual(accepted.status, 0, 'a design-rules.json with only valid categories and a components.json with no duplicate names must be accepted: ' + accepted.stderr)
  assert.strictEqual(statusOf(ok).design, 'rules-locked', 'a successful rules-locked must record design: "rules-locked" so the next derivation reaches HANDOFF')

  assert.strictEqual(fs.existsSync(path.join(ok, 'design/explore/r0-dense-professional')), false, 'D4: prune must delete every losing r0-* candidate dir except the winner\'s — its survival means the accepted rules-locked mark left a stale losing candidate on disk')
  assert.strictEqual(fs.existsSync(path.join(ok, 'design/explore/gallery.html')), false, 'D4: prune must delete the explore gallery once the design is locked — its survival is a stale artifact from a decision already made')
  assert.strictEqual(fs.existsSync(path.join(ok, '.claude/genesis/sketch.html')), false, 'D4: prune must delete a legacy sketch.html even though this driver never writes one itself — a project carrying one from an older genesis run must not keep it past rules-locked')
  assert.strictEqual(fs.existsSync(path.join(ok, '.claude/genesis/explore/authored')), false, 'D4: prune must delete the authored-tokens snapshot directory once the design is locked — it exists only to diff builder-appended tokens.css against during EXPLORE and has no further use')
  assert.ok(fs.existsSync(path.join(ok, 'design/explore/r0-instrument')), 'D4: the winning candidate\'s dir must survive the prune — deleting it would destroy the very design the driver just ratified')
  assert.ok(fs.existsSync(path.join(ok, 'design/explore/positions.md')), 'D4: positions.md must survive the prune — it is the durable record of every position considered, not scratch output')

  const handoff = bare(ok)
  assert.match(handoff.stdout, /state: HANDOFF/, 'D4: a successful rules-locked must advance the driver straight to HANDOFF on the next invocation')
})

test('AC-20260827-03-5: HANDOFF prints next: /spec:init and never "genesis-design" for both designCatalog "storybook" and "none", and spec/commands/genesis.md\'s chain bullet reads /spec:genesis → /spec:atlas with no genesis-explore or genesis-design', () => {
  const storybook = tmpdir('design-ac5-storybook')
  const roadmappedSb = advanceToRoadmap(storybook, { archetype: 'data-ml', designCatalog: 'storybook' })
  assert.strictEqual(roadmappedSb.status, 0, 'test setup requires roadmap-written to be accepted: ' + roadmappedSb.stderr)
  const sbHandoff = bare(storybook)
  assert.match(sbHandoff.stdout, /next: \/spec:init/, 'D5: HANDOFF must print next: /spec:init regardless of designCatalog — the design lock is inside genesis now, so there is no separate command left to hand off into')
  assert.doesNotMatch(sbHandoff.stdout, /genesis-design/, 'D5: HANDOFF must never print "genesis-design" for any designCatalog — the command it used to name is deleted')

  const none = tmpdir('design-ac5-none')
  const roadmappedNone = advanceToRoadmap(none, { archetype: 'data-ml', designCatalog: 'none' })
  assert.strictEqual(roadmappedNone.status, 0, 'test setup requires roadmap-written to be accepted: ' + roadmappedNone.stderr)
  const noneHandoff = bare(none)
  assert.match(noneHandoff.stdout, /next: \/spec:init/, 'D5: HANDOFF must print next: /spec:init for designCatalog "none" too — both catalogs share the one remaining next command')
  assert.doesNotMatch(noneHandoff.stdout, /genesis-design/, 'D5: HANDOFF must never print "genesis-design" for designCatalog "none" either')

  const chainLine = (read('spec/commands/genesis.md').match(/^- Chain:.*$/m) || [])[0]
  assert.ok(chainLine, 'D5: spec/commands/genesis.md must carry a "- Chain:" bullet naming the commands after genesis — its absence means the doctrine no longer tells the session what comes next')
  assert.match(chainLine, /\/spec:genesis → \/spec:atlas/, 'D5: the chain bullet must read /spec:genesis → /spec:atlas directly — design is folded into genesis, so atlas is the very next named step')
  assert.doesNotMatch(chainLine, /genesis-explore/, 'D5: the chain bullet must not name genesis-explore — that command was deleted by spec 02 and folded into the driver')
  assert.doesNotMatch(chainLine, /genesis-design/, 'D5: the chain bullet must not name genesis-design — that command is deleted by this spec and folded into the driver')
})
