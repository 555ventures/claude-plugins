'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260827/02-genesis-explore-state.md: the explore stage is not a command but driver
// states between MENUS and FINALISTS — research-done -> positions-authored -> tiles-built ->
// tiles-culled, or external -- for the four VISUAL archetypes (web-app, mobile-app,
// realtime-trading, desktop-app); every other archetype gets explore: "skipped" on the first
// derivation past MENUS and continues unchanged.
//
// Tile fixtures follow Assumption A1: a tile.html linking ./tokens.css
// with a root data-screen-label and only var(--role) colors passes `design-atlas.js check`; an
// off-token color literal or a missing tokens.css link fails it naming the file. This file
// cannot require() genesis-driver.test.js's or tournament.test.js's own file-local helpers (no
// shared module beyond tests/helpers.js, per this repo's test convention) — writeBrief and the
// finalist()/BOOT_CMD race helpers below duplicate their shape deliberately.

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

// Same shape as genesis-driver.test.js's/tournament.test.js's own writeBrief.
function writeBrief(dir, { coverage = {}, dims = { [DIM]: 'open' }, picks = [] } = {}) {
  const cov = COVERAGE_KEYS.map((k) => `- ${k}: ${coverage[k] || 'covered — synthetic test value'}`).join('\n')
  const dimLines = Object.entries(dims).map(([k, v]) => `- ${k}: ${v}`).join('\n')
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for explore-states.test.js.

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

// Drives to a MENUS state whose hosting menu file is already written.
function advanceToMenusReady(dir) {
  bare(dir)
  writeBrief(dir)
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted on a fully-covered brief: ' + disco.stderr)
  writeHostingMenu(dir)
  const written = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(written.status, 0, 'test setup requires menu-written to be accepted on a zero-package menu: ' + written.stderr)
}

// Drives through menus-done with a VISUAL archetype and asserts the driver lands in EXPLORE —
// the shared setup for every AC-2..AC-6 test below.
function advanceToExplore(dir, archetype) {
  advanceToMenusReady(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'test setup requires menus-done to be accepted with a valid archetype and every open dimension picked: ' + done.stderr)
  assert.match(done.stdout, /state: EXPLORE/, 'test setup requires the visual archetype "' + archetype + '" to reach EXPLORE straight after menus-done: ' + done.stdout)
  return done
}

function writeResearchBrief(dir) {
  writeFile(path.join(dir, 'docs/design/research-brief.md'), '# Research brief\n\n## Angle one\nSynthetic research note for explore-states.test.js.\n')
}

const VALID_VIEWPORTS = [{ name: 'mobile', width: 390, height: 844 }]
function writeTargets(dir, viewports) {
  writeJSON(path.join(dir, 'design/targets.json'), { themes: ['light'], viewports })
}

const POSITION_LABELS = [
  'Stance', 'Rules cited', 'Anti-defaults', 'Reference direction',
  'Motion character', 'Density & layout intent', 'Starter tokens',
]

function positionBlock(kebab, omitLabel) {
  const lines = ['## Position: ' + kebab, '']
  for (const label of POSITION_LABELS) {
    if (label === omitLabel) continue
    lines.push('**' + label + ':** synthetic value for ' + kebab + ' — ' + label.toLowerCase() + '.')
  }
  lines.push('')
  return lines.join('\n')
}

function writePositionsMd(dir, kebabs, { omitLabelFrom = null, omitLabel = null, cullRecord = null } = {}) {
  let body = '# Explore positions\n\n'
  for (const k of kebabs) body += positionBlock(k, k === omitLabelFrom ? omitLabel : null)
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

// Assumption A1 shape: links ./tokens.css, root data-screen-label, only var(--role) colors.
function writeValidTile(dir, kebab) {
  writeFile(path.join(dir, 'design/explore/r0-' + kebab + '/tile.html'),
    '<!doctype html>\n<html><head><link rel="stylesheet" href="./tokens.css"></head>\n<body>\n' +
    '<div data-screen-label="' + kebab + '">\n' +
    '  <p style="color: var(--role-fg); background: var(--role-bg)">Tile</p>\n</div>\n</body></html>\n')
}

const EXPLORE_KEBABS = ['instrument', 'dense-professional', 'quiet-utility', 'loud-signal', 'soft-analog', 'sharp-technical']

function finalist(name, picks, overrides = {}) {
  return Object.assign({
    name, picks, scaffoldCommand: 'true', gateCommand: 'true', bootCommand: 'true', readyCheck: 'true',
  }, overrides)
}
const BOOT_CMD = "touch booted; trap 'exit 0' TERM; while :; do sleep 1; done"

test('AC-20260827-02-1: menus-done with archetype backend-api reaches FINALISTS and records explore: skipped, and menus-done with archetype web-app reaches EXPLORE with a Doctrine line naming Genesis: Explore State', () => {
  const backend = tmpdir('expl-ac1-backend')
  advanceToMenusReady(backend)
  writeBrief(backend, { picks: ['- archetype: backend-api', '- ' + DIM + ': AWS'] })
  const doneBackend = mark(backend, 'menus-done')
  assert.strictEqual(doneBackend.status, 0, 'a fully-covered, fully-picked brief with a valid archetype must be accepted: ' + doneBackend.stderr)
  assert.match(doneBackend.stdout, /state: FINALISTS/, 'D1: backend-api has no UI, so it is not one of the four visual archetypes — it must skip EXPLORE entirely and reach FINALISTS exactly as spec 01 left it')
  assert.strictEqual(statusOf(backend).explore, 'skipped', 'D1: every non-visual archetype must have the driver write explore: "skipped" on the first derivation past MENUS — its absence means a session (or the hook, per A3) has no durable record that this project was never offered the taste funnel')

  const webapp = tmpdir('expl-ac1-webapp')
  advanceToMenusReady(webapp)
  writeBrief(webapp, { picks: ['- archetype: web-app', '- ' + DIM + ': AWS'] })
  const doneWeb = mark(webapp, 'menus-done')
  assert.strictEqual(doneWeb.status, 0, 'a fully-covered, fully-picked brief with a valid archetype must be accepted: ' + doneWeb.stderr)
  assert.match(doneWeb.stdout, /state: EXPLORE/, 'D1: web-app is one of the four visual archetypes — menus-done must land the driver in the new EXPLORE state, between MENUS and FINALISTS, instead of racing straight into the tournament')
  assert.match(doneWeb.stdout, /^Doctrine: spec\/doctrine\/genesis\.md § Genesis: Explore State$/m, 'D13/AC-1: the EXPLORE step must print a Doctrine: line naming § Genesis: Explore State — its absence leaves the session with no printed pointer to the section governing the taste funnel it is about to run')
})

test('AC-20260827-02-2: research-done refuses a missing design/targets.json naming the file, refuses an empty viewports array naming viewports, and accepts a heading-bearing research brief with valid targets, writing explore: research-done and the (EXPLORE -> EXPLORE) checkpoint', () => {
  const dir = tmpdir('expl-ac2')
  advanceToExplore(dir, 'web-app')

  const missingTargets = mark(dir, 'research-done')
  assert.strictEqual(missingTargets.status, 2, 'D2: research-done must refuse when design/targets.json does not exist — without it the taste funnel has no viewport/theme matrix to render tiles against: ' + JSON.stringify(missingTargets))
  assert.match(missingTargets.stderr, /design\/targets\.json/, 'the refusal must name design/targets.json so the session knows exactly which file to write')

  writeResearchBrief(dir)
  writeTargets(dir, [])
  const emptyViewports = mark(dir, 'research-done')
  assert.strictEqual(emptyViewports.status, 2, 'D2: an empty viewports array is not a declared matrix — the mark must refuse it rather than accept a targets.json that declares nothing to render against: ' + JSON.stringify(emptyViewports))
  assert.match(emptyViewports.stderr, /viewports/, 'the refusal must name "viewports" so the session knows exactly which array is empty')

  writeTargets(dir, VALID_VIEWPORTS)
  const ok = mark(dir, 'research-done')
  assert.strictEqual(ok.status, 0, 'a research brief with a ## heading plus a valid non-empty targets.json must be accepted: ' + ok.stderr)
  assert.strictEqual(statusOf(dir).explore, 'research-done', 'D1: a successful research-done must record explore: "research-done" so re-derivation lands on the positions step next')
  assert.match(ok.stdout, /\(EXPLORE → EXPLORE\)/, 'the checkpoint line must read (EXPLORE → EXPLORE) — research-done advances EXPLORE\'s own internal mark progression, not the driver\'s top-level state, so the arrow must show no state change')
})

test('AC-20260827-02-3: positions-authored refuses fewer than six positions naming the floor 6, and refuses a position missing a mandatory label naming the position and the label', () => {
  const tooFew = tmpdir('expl-ac3-count')
  advanceToExplore(tooFew, 'web-app')
  writeResearchBrief(tooFew)
  writeTargets(tooFew, VALID_VIEWPORTS)
  assert.strictEqual(mark(tooFew, 'research-done').status, 0, 'test setup requires research-done to be accepted')
  writePositionsMd(tooFew, ['a-one', 'a-two', 'a-three', 'a-four', 'a-five'])
  const countRefused = mark(tooFew, 'positions-authored')
  assert.strictEqual(countRefused.status, 2, 'D3: five position blocks are below the 6-8 floor — the mark must refuse a round that never covered the design space: ' + JSON.stringify(countRefused))
  assert.match(countRefused.stderr, /\b6\b/, 'the refusal must name the floor "6" so the session knows exactly how many more positions to author')

  const missingLabel = tmpdir('expl-ac3-label')
  advanceToExplore(missingLabel, 'web-app')
  writeResearchBrief(missingLabel)
  writeTargets(missingLabel, VALID_VIEWPORTS)
  assert.strictEqual(mark(missingLabel, 'research-done').status, 0, 'test setup requires research-done to be accepted')
  writePositionsMd(missingLabel, EXPLORE_KEBABS, { omitLabelFrom: 'loud-signal', omitLabel: 'Motion character' })
  const labelRefused = mark(missingLabel, 'positions-authored')
  assert.strictEqual(labelRefused.status, 2, 'D3: a position block missing one of the seven mandatory labels is not a complete position — the mark must refuse the round rather than treat it as ready: ' + JSON.stringify(labelRefused))
  assert.match(labelRefused.stderr, /loud-signal/, 'the refusal must name the offending position "loud-signal" so the session knows which block to fix')
  assert.match(labelRefused.stderr, /Motion character/, 'the refusal must name the missing label "Motion character" so the session knows exactly what to add')
})

test('AC-20260827-02-3: positions-authored accepts six complete positions each carrying a tokens.css and copies every tokens.css to the additions-only authored baseline', () => {
  const dir = tmpdir('expl-ac3-ok')
  advanceToExplore(dir, 'web-app')
  writeResearchBrief(dir)
  writeTargets(dir, VALID_VIEWPORTS)
  assert.strictEqual(mark(dir, 'research-done').status, 0, 'test setup requires research-done to be accepted')
  writePositionsMd(dir, EXPLORE_KEBABS)
  for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
  const accepted = mark(dir, 'positions-authored')
  assert.strictEqual(accepted.status, 0, 'six complete positions each with a tokens.css must be accepted: ' + accepted.stderr)
  for (const k of EXPLORE_KEBABS) {
    const authoredPath = path.join(dir, '.claude/genesis/explore/authored/' + k + '.css')
    assert.ok(fs.existsSync(authoredPath), 'D3: a successful positions-authored must copy design/explore/r0-' + k + '/tokens.css to ' + authoredPath + ' as the additions-only baseline — its absence means tiles-built (D4) has no snapshot to diff a builder-appended tokens.css against')
  }
  assert.strictEqual(statusOf(dir).explore, 'positions-authored', 'D1: a successful positions-authored must record explore: "positions-authored" so re-derivation lands on the tiles step next')
})

test('AC-20260827-02-3, AC-20260827-02-4: tiles-built refuses a tokens.css whose authored line was changed (never merely appended) by naming the file and "append", and refuses a tile carrying an off-token color by naming its dir', () => {
  function setupThroughPositions(dir) {
    advanceToExplore(dir, 'web-app')
    writeResearchBrief(dir)
    writeTargets(dir, VALID_VIEWPORTS)
    assert.strictEqual(mark(dir, 'research-done').status, 0, 'test setup requires research-done to be accepted')
    writePositionsMd(dir, EXPLORE_KEBABS)
    for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
    const p = mark(dir, 'positions-authored')
    assert.strictEqual(p.status, 0, 'test setup requires positions-authored to be accepted: ' + p.stderr)
  }

  const changedLine = tmpdir('expl-ac3b-changed')
  setupThroughPositions(changedLine)
  for (const k of EXPLORE_KEBABS) writeValidTile(changedLine, k)
  // Mutate one tokens.css after the authored baseline is snapshotted, so it diverges from
  // (never startsWith) its own baseline — A2's additions-only carrier without git.
  fs.writeFileSync(path.join(changedLine, 'design/explore/r0-instrument/tokens.css'),
    ':root {\n  --role-bg: #000000;\n}\n')
  const changedRefused = mark(changedLine, 'tiles-built')
  assert.strictEqual(changedRefused.status, 2, 'A2/D4: an authored tokens.css line that was CHANGED (not just appended to) must refuse tiles-built — startsWith against the on-disk authored copy is the only signal a builder altered rather than extended the session-authored baseline, with no git in play: ' + JSON.stringify(changedRefused))
  assert.match(changedRefused.stderr, /instrument/, 'the refusal must name the offending position\'s file so the session knows which tokens.css regressed')
  assert.match(changedRefused.stderr, /append/, 'the refusal must say "append" — the remedy is restoring the authored baseline and only ever adding lines after it, never rewriting it (D4: "builders append, never alter")')

  const offToken = tmpdir('expl-ac3b-offtoken')
  setupThroughPositions(offToken)
  for (const k of EXPLORE_KEBABS) writeValidTile(offToken, k)
  writeFile(path.join(offToken, 'design/explore/r0-dense-professional/tile.html'),
    '<!doctype html>\n<html><head><link rel="stylesheet" href="./tokens.css"></head>\n<body>\n' +
    '<div data-screen-label="dense-professional">\n  <p style="color: #ff00ff">off-token</p>\n</div>\n</body></html>\n')
  const offTokenRefused = mark(offToken, 'tiles-built')
  assert.strictEqual(offTokenRefused.status, 2, 'D4: a tile carrying a literal off-token color must fail the deterministic design-atlas.js check — the mark must refuse the whole round, never building a partial gallery: ' + JSON.stringify(offTokenRefused))
  assert.match(offTokenRefused.stderr, /r0-dense-professional/, 'the refusal must name the offending dir "design/explore/r0-dense-professional" so the session knows which tile to fix')
})

test('AC-20260827-02-3: tiles-built accepts a round where every tile passes, writing design/explore/gallery.html and recording explore: tiles-built', () => {
  const dir = tmpdir('expl-ac3-tilesok')
  advanceToExplore(dir, 'web-app')
  writeResearchBrief(dir)
  writeTargets(dir, VALID_VIEWPORTS)
  assert.strictEqual(mark(dir, 'research-done').status, 0, 'test setup requires research-done to be accepted')
  writePositionsMd(dir, EXPLORE_KEBABS)
  for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
  assert.strictEqual(mark(dir, 'positions-authored').status, 0, 'test setup requires positions-authored to be accepted')
  for (const k of EXPLORE_KEBABS) writeValidTile(dir, k)
  const accepted = mark(dir, 'tiles-built')
  assert.strictEqual(accepted.status, 0, 'six positions each with a passing tile must be accepted: ' + accepted.stderr)
  assert.ok(fs.existsSync(path.join(dir, 'design/explore/gallery.html')), 'D4: a successful tiles-built must write design/explore/gallery.html — its absence means the user has no comparison page to cull from')
  assert.strictEqual(statusOf(dir).explore, 'tiles-built', 'D1: a successful tiles-built must record explore: "tiles-built" so re-derivation lands on the cull step next')
})

test('AC-20260827-02-4: tiles-culled refuses a cull record leaving three survivors naming the count 3, and leaving exactly two records their names in position order into exploreRecord.finalists, writes explore: tiles-culled, and the next bare run reaches FINALISTS', () => {
  function setupThroughTilesBuilt(dir) {
    advanceToExplore(dir, 'web-app')
    writeResearchBrief(dir)
    writeTargets(dir, VALID_VIEWPORTS)
    assert.strictEqual(mark(dir, 'research-done').status, 0, 'test setup requires research-done to be accepted')
    writePositionsMd(dir, EXPLORE_KEBABS)
    for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
    assert.strictEqual(mark(dir, 'positions-authored').status, 0, 'test setup requires positions-authored to be accepted')
    for (const k of EXPLORE_KEBABS) writeValidTile(dir, k)
    const built = mark(dir, 'tiles-built')
    assert.strictEqual(built.status, 0, 'test setup requires tiles-built to be accepted: ' + built.stderr)
  }

  const three = tmpdir('expl-ac4-three')
  setupThroughTilesBuilt(three)
  writePositionsMd(three, EXPLORE_KEBABS, {
    cullRecord: [
      '- **loud-signal** — culled: too loud for the audience',
      '- **soft-analog** — culled: too soft',
      '- **sharp-technical** — culled: too technical',
    ],
  })
  const threeRefused = mark(three, 'tiles-culled')
  assert.strictEqual(threeRefused.status, 2, 'D5: three survivors (instrument, dense-professional, quiet-utility) are not a cull — the mark must refuse leaving anything other than exactly two: ' + JSON.stringify(threeRefused))
  assert.match(threeRefused.stderr, /\b3\b/, 'the refusal must name the survivor count (3) so the session knows how many more to cull')

  const two = tmpdir('expl-ac4-two')
  setupThroughTilesBuilt(two)
  writePositionsMd(two, EXPLORE_KEBABS, {
    cullRecord: [
      '- **quiet-utility** — culled: too quiet',
      '- **loud-signal** — culled: too loud',
      '- **soft-analog** — culled: too soft',
      '- **sharp-technical** — culled: too technical',
    ],
  })
  const culled = mark(two, 'tiles-culled')
  assert.strictEqual(culled.status, 0, 'a cull record leaving exactly two survivors must be accepted: ' + culled.stderr)
  assert.deepStrictEqual(statusOf(two).exploreRecord.finalists, ['instrument', 'dense-professional'], 'D5: a successful tiles-culled must record the two survivors, in position order, into exploreRecord.finalists — a wrong order or a missing name means PROBE (D7) has no reliable tile source list')
  assert.strictEqual(statusOf(two).explore, 'tiles-culled', 'D1: a successful tiles-culled must record explore: "tiles-culled"')
  const next = bare(two)
  assert.match(next.stdout, /state: FINALISTS/, 'D1/Contracts: once explore resolves (tiles-culled), the next bare invocation must reach FINALISTS for a tournament archetype like web-app — anything else means EXPLORE never actually handed off to the tournament')
})

test('AC-20260827-02-5: external refuses an unlabeled screen naming the file and data-screen-label, accepts a labelled screen with valid targets recording the external finalist with no research brief required, and refuses a later research-done naming external', () => {
  const dir = tmpdir('expl-ac5')
  advanceToExplore(dir, 'web-app')

  writeFile(path.join(dir, 'design/explore/external/mine/index.html'), '<html><body><p>no label here</p></body></html>')
  const noLabel = mark(dir, 'external', 'design/explore/external/mine')
  assert.strictEqual(noLabel.status, 2, 'D6: an external bundle whose .html carries no data-screen-label attribute cannot be admitted — the mark must refuse it: ' + JSON.stringify(noLabel))
  assert.match(noLabel.stderr, /index\.html/, 'the refusal must name the offending file "index.html" so the session knows which file to label')
  assert.match(noLabel.stderr, /data-screen-label/, 'the refusal must name "data-screen-label" so the session knows exactly what attribute is missing')

  writeFile(path.join(dir, 'design/explore/external/mine/index.html'), '<html><body><div data-screen-label="home"></div></body></html>')
  writeTargets(dir, VALID_VIEWPORTS)
  const ok = mark(dir, 'external', 'design/explore/external/mine')
  assert.strictEqual(ok.status, 0, 'a labelled external screen with a valid targets.json must be accepted: ' + ok.stderr)
  assert.strictEqual(fs.existsSync(path.join(dir, 'docs/design/research-brief.md')), false, 'D6: the external path never owes docs/design/research-brief.md — its presence here would mean the funnel\'s research requirement leaked into a path that is explicitly exempt from it')
  assert.deepStrictEqual(statusOf(dir).exploreRecord.finalists, ['external/mine'], 'D6: a successful external mark must record exploreRecord.finalists === ["external/mine"] — PROBE (D7) has no other way to find the supplied design\'s tile source')
  assert.strictEqual(statusOf(dir).explore, 'external', 'D1: a successful external mark must record explore: "external"')

  const laterResearch = mark(dir, 'research-done')
  assert.strictEqual(laterResearch.status, 2, 'D6/Behavior: once external has been marked, a funnel mark like research-done must be refused — the external candidate skips the funnel entirely, it does not run alongside it: ' + JSON.stringify(laterResearch))
  assert.match(laterResearch.stderr, /external/, 'the refusal must name "external" so the session understands why the funnel mark makes no sense here')
})

test('AC-20260827-02-6: PROBE lists style-tile with both culled tile.html paths and never names sketch.html, probe-done refuses a style-tile entry missing one tile by naming it, refuses picked with no design-pick.json, and a valid pick records explore: picked alongside tournament.winner', () => {
  const dir = tmpdir('expl-ac6')

  advanceToExplore(dir, 'web-app')
  writeResearchBrief(dir)
  writeTargets(dir, VALID_VIEWPORTS)
  assert.strictEqual(mark(dir, 'research-done').status, 0, 'test setup requires research-done to be accepted')
  writePositionsMd(dir, EXPLORE_KEBABS)
  for (const k of EXPLORE_KEBABS) writeTokensCss(dir, k)
  assert.strictEqual(mark(dir, 'positions-authored').status, 0, 'test setup requires positions-authored to be accepted')
  for (const k of EXPLORE_KEBABS) writeValidTile(dir, k)
  assert.strictEqual(mark(dir, 'tiles-built').status, 0, 'test setup requires tiles-built to be accepted')
  writePositionsMd(dir, EXPLORE_KEBABS, {
    cullRecord: [
      '- **quiet-utility** — culled: too quiet',
      '- **loud-signal** — culled: too loud',
      '- **soft-analog** — culled: too soft',
      '- **sharp-technical** — culled: too technical',
    ],
  })
  assert.strictEqual(mark(dir, 'tiles-culled').status, 0, 'test setup requires tiles-culled to be accepted, leaving instrument and dense-professional')
  const finalistsStep = bare(dir)
  assert.match(finalistsStep.stdout, /state: FINALISTS/, 'test setup requires explore to hand off to FINALISTS: ' + finalistsStep.stdout)

  writeJSON(path.join(dir, '.claude/genesis/finalists.json'), {
    finalists: [
      finalist('stack-a', { hosting: 'AWS' }, {
        scaffoldCommand: 'touch scaffolded.txt', gateCommand: 'exit 0',
        bootCommand: BOOT_CMD, readyCheck: 'test -f booted', readyTimeout: 10,
      }),
      finalist('stack-b', { hosting: 'GCP' }, { scaffoldCommand: 'exit 3' }),
    ],
  })
  const written = mark(dir, 'finalists-written', 'finalists.json')
  assert.strictEqual(written.status, 0, 'test setup requires finalists-written to be accepted: ' + written.stderr)
  const probeStep = bare(dir)
  assert.match(probeStep.stdout, /state: PROBE/, 'test setup requires the race to reach PROBE: ' + probeStep.stdout)

  assert.match(probeStep.stdout, /style-tile/, 'D7: PROBE must list the style-tile task — its absence means the two culled looks are not being offered as the tournament\'s style-tile source at all')
  assert.match(probeStep.stdout, /design\/explore\/r0-instrument\/tile\.html/, 'D7: PROBE must name the instrument tile source path — a session without it has to go find the render source on its own')
  assert.match(probeStep.stdout, /design\/explore\/r0-dense-professional\/tile\.html/, 'D7: PROBE must name the dense-professional tile source path too — both culled looks render inside every finalist')
  assert.doesNotMatch(probeStep.stdout, /sketch\.html/, 'D7: sketch.html is never a tile source once explore has run — its appearance here means spec 01 D6\'s old tile source survived instead of being replaced')

  function probeJsonPath(d) { return path.join(d, '.claude/genesis/tournament/evidence/stack-a/probe.json') }
  function shotAt(d, filename) {
    const rel = '.claude/genesis/tournament/evidence/stack-a/' + filename
    const abs = path.join(d, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from([0]))
    return rel
  }

  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 0, tokens: 100, screenshot: null },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
      { task: 'style-tile', tile: 'instrument', passed: true, retries: 0, tokens: 50, screenshot: null },
    ],
  })
  const missingTile = mark(dir, 'probe-done')
  assert.strictEqual(missingTile.status, 2, 'D7: a probe.json carrying a style-tile entry for only one of the two culled tiles must be refused — the missing entry means one of the two looks was never actually probed inside this finalist: ' + JSON.stringify(missingTile))
  assert.match(missingTile.stderr, /dense-professional/, 'the refusal must name the missing tile "dense-professional" so the session knows exactly which slice still needs building')

  const shot1 = shotAt(dir, 'authed-crud-screen.png')
  const shot3 = shotAt(dir, 'style-tile.instrument.png')
  const shot4 = shotAt(dir, 'style-tile.dense-professional.png')
  writeJSON(probeJsonPath(dir), {
    tasks: [
      { task: 'authed-crud-screen', passed: true, retries: 0, tokens: 100, screenshot: shot1 },
      { task: 'background-job', passed: true, retries: 0, tokens: 200, screenshot: null },
      { task: 'style-tile', tile: 'instrument', passed: true, retries: 0, tokens: 50, screenshot: shot3 },
      { task: 'style-tile', tile: 'dense-professional', passed: true, retries: 0, tokens: 50, screenshot: shot4 },
    ],
  })
  const probed = mark(dir, 'probe-done')
  assert.strictEqual(probed.status, 0, 'a probe.json covering both style-tile entries and every other expected task must be accepted: ' + probed.stderr)
  assert.match(probed.stdout, /state: PICK/, 'a successful probe-done must advance the driver to PICK')

  const noPickFile = mark(dir, 'picked')
  assert.strictEqual(noPickFile.status, 2, 'D8: picked must refuse when .claude/genesis/design-pick.json does not exist — there is no record of which design (and stack) won: ' + JSON.stringify(noPickFile))
  assert.match(noPickFile.stderr, /design-pick\.json/, 'the refusal must name design-pick.json so the session knows exactly which file to write')

  writeJSON(path.join(dir, '.claude/genesis/design-pick.json'), {
    winner: 'design/explore/r0-instrument',
    rejected: [{ candidate: 'design/explore/r0-dense-professional', reason: 'less legible at small viewports', salvage: null }],
  })
  const picked = mark(dir, 'picked')
  assert.strictEqual(picked.status, 0, 'a design-pick.json whose winner matches a raced finalist\'s tile and whose rejected[] carries the other tile with a non-empty reason must be accepted: ' + picked.stderr)
  assert.strictEqual(statusOf(dir).explore, 'picked', 'D8: a successful picked must record explore: "picked" so the genesis design state can proceed once entered — the hook no longer admits or gates it at all (specs/20260827/03 D6 retires that arm entirely)')
  assert.strictEqual(statusOf(dir).tournament.winner, 'stack-a', 'D8: picked must ALSO record spec 01\'s tournament.winner alongside explore: "picked" — stack and design are picked together, never as two separate decisions')
})
