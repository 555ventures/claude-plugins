'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, read } = require('../helpers')
const {
  DIM, bare, mark, writeFile, writeJSON, writeBrief, writeHostingMenu, writeConventionsArtifacts,
  writeBindingSubset, ratifyBriefArtifacts,
} = require('./tournament.fixtures')

// specs/20261029/06-the-genesis-question-diet.md — AC-20261029-06-7 (D6 direction round and the
// required ## Direction heading), AC-20261029-06-8 (D7 roadmap veto window).

function writeDescriptor(dir, designCatalog, archetype) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype, language: 'typescript', framework: 'next', packageManager: 'bun',
    testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc', designCatalog,
    gateCommand: 'true', scaffoldCommand: 'true', decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), `# 0001. Hosting choice

## Decision
AWS chosen for \`${DIM}\`.

## Dissents
Fly.io was considered and rejected for regional latency.
`)
}

// Drives a ratified visual archetype from an empty root to the green zero-day gate, where the
// design stage (storybook catalog) derives DESIGN_BRIEF.
function toDesignBrief(dir, archetype) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: ' + archetype] })
  assert.strictEqual(mark(dir, 'discovery-done').status, 0, 'test setup requires discovery-done to be accepted')
  ratifyBriefArtifacts(dir)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'test setup requires brief-written to be accepted: ' + bw.stderr)
  writeHostingMenu(dir)
  assert.strictEqual(mark(dir, 'menu-written', 'interview-research/' + DIM + '.json').status, 0, 'test setup requires menu-written to be accepted')
  writeBrief(dir, { picks: ['- archetype: ' + archetype, '- ' + DIM + ': AWS'] })
  ratifyBriefArtifacts(dir)
  const md = mark(dir, 'menus-done')
  assert.strictEqual(md.status, 0, 'test setup requires menus-done to be accepted: ' + md.stderr)
  const fs1 = mark(dir, 'finalists-skipped')
  assert.strictEqual(fs1.status, 0, 'test setup requires finalists-skipped to be accepted: ' + fs1.stderr)
  writeDescriptor(dir, 'storybook', archetype)
  writeConventionsArtifacts(dir)
  const dec = mark(dir, 'decided')
  assert.strictEqual(dec.status, 0, 'test setup requires decided to be accepted: ' + dec.stderr)
  bare(dir)
  writeBindingSubset(dir, 'true')
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'test setup requires skeleton-landed to be accepted: ' + landed.stderr)
  return landed
}

test('AC-20261029-06-7: the DESIGN_BRIEF step prints the direction round with archetype-derived recommended defaults before the Fable dispatch', () => {
  const web = tmpdir('direction-ac7-web')
  const landed = toDesignBrief(web, 'web-app')
  assert.match(landed.stdout, /state: DESIGN_BRIEF/, 'test setup requires the green gate to derive DESIGN_BRIEF for a storybook web-app: ' + landed.stdout)
  const out = landed.stdout
  const at = out.indexOf('## Direction round')
  const dispatch = out.indexOf('Dispatch: Agent {model: "fable", effort: "high"}')
  assert.ok(at !== -1, 'the step must print a ## Direction round block, or the mandatory design forks are never asked: ' + out)
  assert.ok(dispatch > at, 'the direction round must precede the Fable dispatch line, or the answers cannot be handed to the dispatch')
  for (const line of ['- navigation shell: sidebar (Recommended)', '- layout system: responsive grid, 3 breakpoints (Recommended)',
    '- color schemes: system (Recommended)', '- accessibility baseline: WCAG 2.2 AA (Recommended)', '- token tiers: 2 (Recommended)']) {
    const idx = out.indexOf(line)
    assert.ok(idx > at && idx < dispatch, 'the direction round must carry "' + line + '" before the dispatch, or the owner has no recommended default to confirm')
  }

  const mobile = tmpdir('direction-ac7-mobile')
  const m = toDesignBrief(mobile, 'mobile-app')
  assert.match(m.stdout, /- navigation shell: tabs \(Recommended\)/, 'a mobile-app must default its navigation shell to tabs, or a sidebar is recommended on a phone: ' + m.stdout)

})

test('AC-20261029-06-7: design-brief-written refuses a brief with every other required heading but no ## Direction, naming the heading and recording no mark', () => {
  const web = tmpdir('direction-ac7-refuse')
  toDesignBrief(web, 'web-app')
  const sp = path.join(web, '.claude/genesis/status.json')
  writeJSON(path.join(web, '.claude/genesis/design-paths.json'), JSON.parse(read('spec/templates/design-paths.json')))
  writeFile(path.join(web, 'docs/design/brief.md'), [
    '# Design brief', '', '## Users and context', 'x', '', '## Journeys', 'x', '', '## Navigation', 'x', '',
    '## Catalog', 'x', '', '## Composites', 'x', '', '## Contract', 'x', '',
  ].join('\n'))
  const r = mark(web, 'design-brief-written')
  assert.strictEqual(r.status, 2, 'a brief with no ## Direction must be refused: ' + r.stdout)
  assert.match(r.stderr, /## Direction/, 'the refusal must name the missing ## Direction heading so the Fable step knows what to write: ' + r.stderr)
  assert.notStrictEqual(JSON.parse(fs.readFileSync(sp, 'utf8')).marks.designBriefWritten, true, 'the refused mark must not be recorded, or the run advances past a brief with no direction')
})

test('AC-20261029-06-8: the ROADMAP step prints the proceeding-unless-vetoed line and the milestone-gates line and mentions AskUserQuestion exactly once', () => {
  const dir = tmpdir('direction-ac8')
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: data-ml'] })
  assert.strictEqual(mark(dir, 'discovery-done').status, 0, 'test setup requires discovery-done to be accepted')
  assert.strictEqual(mark(dir, 'brief-written').status, 0, 'test setup requires brief-written to be accepted for data-ml')
  writeHostingMenu(dir)
  assert.strictEqual(mark(dir, 'menu-written', 'interview-research/' + DIM + '.json').status, 0, 'test setup requires menu-written to be accepted')
  writeBrief(dir, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  assert.strictEqual(mark(dir, 'menus-done').status, 0, 'test setup requires menus-done to be accepted')
  writeDescriptor(dir, 'none', 'data-ml')
  writeConventionsArtifacts(dir)
  assert.strictEqual(mark(dir, 'decided').status, 0, 'test setup requires decided to be accepted')
  bare(dir)
  writeBindingSubset(dir, 'true')
  const landed = mark(dir, 'skeleton-landed')
  assert.match(landed.stdout, /state: ROADMAP/, 'test setup requires the green gate to derive ROADMAP for a non-visual archetype: ' + landed.stdout + landed.stderr)
  const out = landed.stdout
  assert.ok(out.includes('proceeding unless vetoed: brief order and dependencies (reorder later with spec-queue move)'), 'the ROADMAP step must announce the veto window instead of asking the sequence, or the owner is asked a reorderable fact: ' + out)
  assert.ok(out.includes('ask once: milestone gates — one AskUserQuestion'), 'the ROADMAP step must still ask milestone gates exactly once: ' + out)
  assert.strictEqual((out.match(/AskUserQuestion/g) || []).length, 1, 'the step text must mention AskUserQuestion exactly once, or the roadmap asks more than the one gate round')
})
