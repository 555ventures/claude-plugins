'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')

// specs/20261005/06-the-design-stage-sends-pictures.md — AC-20261005-06-14 (D10): the ROADMAP step
// prints the optional pictures command line, only for a connected project that declares a
// pictures block and holds the design approval record.

const SCRIPT = 'scripts/genesis-driver.js'
const OPTIONAL = 'Optional — show the client the designed screens: node '

function bare(dir) { return runNode(SCRIPT, ['--root', dir]) }
function mark(dir, name, file) {
  const argv = ['--root', dir, '--mark', name]
  if (file) argv.push('--file', file)
  return runNode(SCRIPT, argv)
}
function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content) }
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj, null, 2) + '\n') }

// A project driven from empty to the ROADMAP step (a non-design archetype, green zero-day gate).
function atRoadmap() {
  const dir = tmpdir('pictures-step')
  bare(dir)
  writeBrief(dir, { picks: ['- archetype: data-ml'] })
  assert.strictEqual(mark(dir, 'discovery-done').status, 0, 'setup: discovery-done must be accepted')
  assert.strictEqual(mark(dir, 'brief-written').status, 0, 'setup: brief-written must be accepted')
  writeJSON(path.join(dir, '.claude/genesis/interview-research/hosting.json'), { dimension: 'hosting', options: [{ label: 'AWS', packages: [] }] })
  assert.strictEqual(mark(dir, 'menu-written', 'interview-research/hosting.json').status, 0, 'setup: menu-written must be accepted')
  writeBrief(dir, { picks: ['- archetype: data-ml', '- hosting: AWS'] })
  assert.strictEqual(mark(dir, 'menus-done').status, 0, 'setup: menus-done must be accepted')
  writeJSON(path.join(dir, '.claude/genesis/stack-descriptor.json'), {
    schemaVersion: 1, archetype: 'web-app', language: 'typescript', framework: 'next', packageManager: 'bun',
    testRunner: 'bun test', linter: 'eslint', typechecker: 'tsc', designCatalog: 'none',
    gateCommand: 'true', scaffoldCommand: 'true', decisionRecords: ['docs/adr/0001-hosting.md'],
  })
  writeFile(path.join(dir, 'docs/adr/0001-hosting.md'), '# 0001. Hosting choice\n\n## Decision\nAWS chosen for `hosting`.\n\n## Dissents\nFly.io was considered and rejected for regional latency — no other minority option surfaced.\n')
  writeFile(path.join(dir, 'docs/adr/0002-operational-conventions.md'), '# 0002. Operational conventions\n\n## Decision\nSee conventions.json.\n\n## Dissents\nNone recorded — synthetic fixture.\n')
  const keys = ['error-taxonomy', 'logging', 'naming-identifiers', 'wire-representations', 'cross-plane-constants', 'env-config', 'ci', 'background-async', 'success-metric']
  writeJSON(path.join(dir, '.claude/genesis/conventions.json'), {
    schemaVersion: 1, testTree: 'tests',
    rows: keys.map((key) => ({ key, status: 'DEFERRED', enforceable: false, probe: null, reason: 'fixture', adr: 'docs/adr/0002-operational-conventions.md' })),
  })
  assert.strictEqual(mark(dir, 'decided').status, 0, 'setup: decided must be accepted')
  bare(dir)
  writeFile(path.join(dir, 'CLAUDE.md'), '# Grounding\nGate command: `true`\nTest tree: `tests`\n')
  const landed = mark(dir, 'skeleton-landed')
  assert.strictEqual(landed.status, 0, 'setup: skeleton-landed must be accepted: ' + landed.stderr)
  assert.match(landed.stdout, /ROADMAP/, 'setup: the project must reach the ROADMAP step: ' + landed.stdout)
  return dir
}

function configure(dir, { pictures, walkthrough, approval }) {
  const cfg = { generatedBy: 'test' }
  if (pictures) cfg.pictures = { command: 'node tools/pictures.js', dir: 'design/pictures' }
  if (walkthrough) cfg.walkthrough = { baseUrl: 'http://127.0.0.1:1', project: 'acme-shop', tokenEnv: 'WALKTHROUGH_TOKEN' }
  writeJSON(path.join(dir, '.claude/spec.config.json'), cfg)
  const ap = path.join(dir, 'docs/design/approval.json')
  fs.rmSync(ap, { force: true })
  if (approval) writeJSON(ap, { schemaVersion: 1, approvedAt: '2026-10-05T00:00:00.000Z', journeys: {} })
}

test('AC-20261005-06-14: the ROADMAP step prints the Optional pictures line directly before the Write docs/roadmap/ line for an approved, connected project with a pictures block', () => {
  const dir = atRoadmap()
  configure(dir, { pictures: true, walkthrough: true, approval: true })
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'the bare driver run must print the ROADMAP step: ' + r.stderr)
  const lines = r.stdout.split('\n')
  const at = lines.findIndex((l) => l.startsWith('Write docs/roadmap/'))
  assert.ok(at > 0, 'the ROADMAP step must still print its Write docs/roadmap/ line: ' + r.stdout)
  const picturesJs = path.join(__dirname, '../../spec/scripts/pictures.js')
  assert.strictEqual(lines[at - 1], OPTIONAL + picturesJs + ' --root ' + dir,
    'a connected project with a pictures block must be offered the pictures command on the line directly before the Write line, or no project learns the optional round exists: ' + r.stdout)
})

test('AC-20261005-06-14: the ROADMAP step contains no pictures.js line when pictures is missing, walkthrough is missing, or the approval record is absent', () => {
  const dir = atRoadmap()
  for (const [label, cfg] of [
    ['no pictures block', { pictures: false, walkthrough: true, approval: true }],
    ['no walkthrough block', { pictures: true, walkthrough: false, approval: true }],
    ['no approval record', { pictures: true, walkthrough: true, approval: false }],
  ]) {
    configure(dir, cfg)
    const r = bare(dir)
    assert.strictEqual(r.status, 0, label + ': the bare driver run must print the ROADMAP step: ' + r.stderr)
    assert.match(r.stdout, /Write docs\/roadmap\//, label + ': the step under test must be ROADMAP: ' + r.stdout)
    assert.ok(!r.stdout.includes('pictures.js'),
      label + ': the step must not offer a command that would be refused or has nothing approved to show — the print is conditional, never noise: ' + r.stdout)
  }
})
