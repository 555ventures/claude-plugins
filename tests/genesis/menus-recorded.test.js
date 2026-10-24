'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')

// specs/20261024/02-genesis-marks-and-the-no-stand-ins-test.md — AC-20261024-02-1, -2, -3:
// the MENUS gate and the design-stage derivation read recorded marks, never file presence.

const SCRIPT = 'scripts/genesis-driver.js'
const DIM = 'hosting'

function bare(dir) { return runNode(SCRIPT, ['--root', dir]) }
function state(dir) { return runNode(SCRIPT, ['--root', dir, '--state']) }
function mark(dir, name, file) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv)
}
function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }
function statusPath(dir) { return path.join(dir, '.claude/genesis/status.json') }
function menuPath(dir) { return path.join(dir, '.claude/genesis/interview-research', DIM + '.json') }
function writeMenu(dir) { writeJSON(menuPath(dir), { dimension: DIM, options: [{ label: 'AWS', packages: [] }] }) }

function advanceToMenus(dir) {
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: data-ml'] })
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 0, 'setup requires discovery-done accepted: ' + r.stderr)
  const bw = mark(dir, 'brief-written')
  assert.strictEqual(bw.status, 0, 'setup requires brief-written accepted for data-ml: ' + bw.stderr)
}

function writePicks(dir) {
  writeBrief(dir, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
}

test('AC-20261024-02-1: a hand-written menu file with no menu-written mark makes menus-done refuse (exit 2) naming the dimension, and --state stays MENUS', () => {
  const dir = tmpdir('menus-rec-1')
  advanceToMenus(dir)
  writeFile(menuPath(dir), 'not json{{{')
  writePicks(dir)
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 2, 'menus-done accepted a dimension whose registry check never ran, so a broken hand-written menu advances the run to DECIDE with status.menus empty: ' + done.stdout + done.stderr)
  assert.match(done.stderr, new RegExp(DIM), 'the refusal does not name the unrecorded dimension, so the session cannot tell which menu still owes menu-written')
  const st = state(dir)
  assert.match(st.stdout, /^MENUS$/m, 'the derived state left MENUS on file presence alone, skipping the registry check the state exists for: ' + st.stdout)
})

test('AC-20261024-02-2: with a status.menus record and a Picks line for every open dimension menus-done is accepted and the next state derives with the menu files deleted', () => {
  const dir = tmpdir('menus-rec-2')
  advanceToMenus(dir)
  writeMenu(dir)
  const w = mark(dir, 'menu-written', 'interview-research/' + DIM + '.json')
  assert.strictEqual(w.status, 0, 'setup requires menu-written accepted on a zero-package menu: ' + w.stderr)
  writePicks(dir)
  const done = mark(dir, 'menus-done')
  assert.strictEqual(done.status, 0, 'menus-done refused a fully recorded dimension: ' + done.stderr)
  fs.rmSync(menuPath(dir))
  const st = state(dir)
  assert.match(st.stdout, /^DECIDE$/m, 'deleting the menu file after the mark sent the run back to MENUS, so the gate still reads file presence instead of the record: ' + st.stdout)
})

// Decide-stage artifacts for a Storybook-catalog descriptor.
function writeDecideArtifacts(dir) {
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'web-app', language: 'typescript', framework: 'next',
    packageManager: 'bun', testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc',
    designCatalog: 'storybook', gateCommand: 'true', scaffoldCommand: 'true',
    decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), '# 0001. Hosting choice\n\n## Decision\nAWS chosen for `' + DIM + '`.\n\n## Dissents\nFly.io was considered and rejected for regional latency.\n')
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), '# 0002. Operational conventions\n\n## Decision\nSee conventions.json.\n\n## Dissents\nNone recorded.\n')
  const floor = ['error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations',
    'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric']
  writeJSON(path.join(dir, '.claude/genesis/conventions.json'), {
    schemaVersion: 1, testTree: 'tests',
    rows: floor.map((key) => ({ key, status: 'DEFERRED', enforceable: false, probe: null, reason: 'synthetic', adr: 'docs/adr/0002-operational-conventions.md' })),
  })
  writeFile(path.join(dir, 'CLAUDE.md'), '# Grounding\nGate command: `true`\nTest tree: `tests`\n')
}

test('AC-20261024-02-3: with designBriefWritten marked, the post-brief state derives with docs/design/brief.md and design-paths.json removed', () => {
  const dir = tmpdir('menus-rec-3')
  advanceToMenus(dir)
  writeMenu(dir)
  assert.strictEqual(mark(dir, 'menu-written', 'interview-research/' + DIM + '.json').status, 0, 'setup requires menu-written accepted')
  writePicks(dir)
  assert.strictEqual(mark(dir, 'menus-done').status, 0, 'setup requires menus-done accepted')
  writeDecideArtifacts(dir)
  const decided = mark(dir, 'decided')
  assert.strictEqual(decided.status, 0, 'setup requires decided accepted: ' + decided.stderr)
  const sc = bare(dir)
  assert.match(sc.stdout, /SKELETON/, 'setup requires the scaffold to reach SKELETON: ' + sc.stdout + sc.stderr)
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'setup requires skeleton-landed accepted: ' + landed.stderr)
  // Flip the host to a visual archetype past its tournament and record the design-brief mark.
  const st = JSON.parse(fs.readFileSync(statusPath(dir), 'utf8'))
  st.archetype = 'web-app'
  st.tournament = { skipped: true }
  st.marks.designBriefWritten = true
  writeJSON(statusPath(dir), st)
  fs.rmSync(path.join(dir, 'docs/design/brief.md'), { force: true })
  fs.rmSync(path.join(dir, '.claude/genesis/design-paths.json'), { force: true })
  const peek = state(dir)
  assert.match(peek.stdout, /^DESIGN_KIT$/m, 'the derivation re-read the brief or design-paths.json behind a mark that was only set after both were verified, so a moved artifact lands the resume in DESIGN_BRIEF: ' + peek.stdout + peek.stderr)
})
