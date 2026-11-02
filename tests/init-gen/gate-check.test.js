'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo, SPEC } = require('../helpers')

// specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md D4: AC-20261101-07-7,
// AC-20261101-07-8, AC-20261101-07-9, AC-20261101-07-10 — init-gen's unscoped-gate warning,
// slowTestCommand validation and manifest row, the gate-check mode, and the invariants root.

const WARNING = 'init-gen: gateCommand is unscoped — every build iteration and the review gate run the whole suite; put {testDirs} where the test runner takes its paths, or accept this when the runner takes none'

function baseProfile(extraConfig) {
  return {
    config: {
      gateCommand: 'npm run lint && npm test',
      testCommand: 'npm test',
      setupCommand: 'npm install',
      patternsScript: 'scripts/spec-patterns.sh',
      layerGroups: [['doctrine', 'scripts']],
      agentMap: { tests: 'test-owner', scripts: 'data-layer', default: 'data-layer' },
      pipelineRules: '.claude/rules/spec-pipeline.md',
      runtime: { inert: 'synthetic test host — no bootable process' },
      ...extraConfig,
    },
    rules: {
      paths: ['specs/**', '.claude/**'],
      sections: {
        'Risk Tiers': 'Risk tiers body.\n', 'Planning': 'Planning body.\n', 'Build': 'Build body.\n',
        'Worker Rules': 'Worker rules body.\n', 'Test Rules': 'Test rules body.\n',
        'Review Checks': 'Review checks body.\n',
      },
    },
    conventionRules: [{ file: 'queries.md', paths: ['src/**/queries.ts'], body: 'Queries convention body.\n' }],
    agents: [
      { name: 'data-layer', kind: 'queries', description: 'Owns the data layer.', model: 'sonnet',
        persona: 'Data layer persona body.\n', expertise: ['src/**/queries.ts'],
        reference: ['src/schema.sql'], constraints: ['Never raw SQL outside queries.ts'] },
      { name: 'test-owner', kind: 'tests', description: 'Owns the test suite.', model: 'sonnet',
        persona: 'Test owner persona body.\n', expertise: ['tests/**'],
        reference: ['tests/helpers.js'], constraints: ['Never writes implementation code'] },
    ],
    selfVerifyExamples: "`node --test 'tests/x/*.test.js'`",
    skills: {
      specVerify: { description: 'Use to verify the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'spec-verify body.\n' },
      run: { description: 'Use to run the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'run body.\n' },
    },
    settings: { extraAllow: [], extraDeny: [] },
    patternSweeps: ['sweep "as any" -e \':\\s*any\' -g \'!*.test.ts\''],
    sourceRoot: 'src',
    manifestExtras: [],
    probeOutcomes: { testCommand: { failsLoud: true }, atRisk: { applicable: true } },
  }
}

function generate(prefix, extraConfig) {
  const dir = tmpdir(prefix)
  gitRepo(dir)
  fs.writeFileSync(path.join(dir, 'slow.sh'), '#!/usr/bin/env bash\nexit 0\n')
  const p = path.join(dir, 'profile.json')
  fs.writeFileSync(p, JSON.stringify(baseProfile(extraConfig)))
  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', p])
  return { dir, r }
}

function gateCheck(config) {
  const dir = tmpdir('gate-check')
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config))
  return runNode('scripts/init-gen.js', ['gate-check', '--root', dir, '--json'])
}

test('AC-20261101-07-7: generate prints exactly one unscoped-gate warning for a gate without {testDirs} and none for a scoped gate, exiting 0 both times', () => {
  const a = generate('gc-unscoped', {})
  assert.strictEqual(a.r.status, 0, 'an unscoped gate is reported, never refused: ' + a.r.stderr)
  const lines = a.r.stderr.split('\n').filter(l => l.includes('unscoped'))
  assert.deepStrictEqual(lines, [WARNING],
    'the owner must hear once that every build iteration runs the whole suite — silence leaves the unscoped gate undiscovered: ' + a.r.stderr)
  const b = generate('gc-scoped', { gateCommand: 'npm run lint && npm test {testDirs}' })
  assert.strictEqual(b.r.status, 0, 'a scoped gate must generate cleanly: ' + b.r.stderr)
  assert.ok(!b.r.stderr.includes('unscoped'),
    'a gate carrying {testDirs} must not be reported as unscoped — a false warning teaches owners to ignore it: ' + b.r.stderr)
})

test('AC-20261101-07-8: an empty slowTestCommand exits 2 naming config.slowTestCommand, and a declared one is written verbatim with an exec manifest row', () => {
  const bad = generate('gc-slow-empty', { slowTestCommand: '' })
  assert.strictEqual(bad.r.status, 2, 'an empty slow command is an invalid profile, not a silent no-op: ' + bad.r.stdout + bad.r.stderr)
  assert.ok(bad.r.stderr.includes('config.slowTestCommand'),
    'the refusal must name the offending key or the operator cannot find it: ' + bad.r.stderr)
  const ok = generate('gc-slow-ok', { slowTestCommand: 'bash slow.sh' })
  assert.strictEqual(ok.r.status, 0, 'a valid slow command must generate cleanly: ' + ok.r.stderr)
  const cfg = JSON.parse(fs.readFileSync(path.join(ok.dir, '.claude/spec.config.json'), 'utf8'))
  assert.strictEqual(cfg.slowTestCommand, 'bash slow.sh',
    'the key must reach the host config verbatim or review never runs the slow tier: ' + JSON.stringify(cfg))
  const manifest = JSON.parse(fs.readFileSync(path.join(ok.dir, '.claude/spec-manifest.json'), 'utf8'))
  assert.ok(manifest.checks.some(c => c.claim === 'slow tier command runs' && c.kind === 'exec' && c.target === 'bash slow.sh'),
    'init must prove the slow command runs before stamping, or a mistyped command first fails in a review: ' + JSON.stringify(manifest))
})

test('AC-20261101-07-9: gate-check --json reports an unscoped suite-running gate and a scoped gate with a slow tier as the two pinned objects, exiting 0', () => {
  const a = gateCheck({ gateCommand: 'npm run lint && npm test', testCommand: 'npm test' })
  assert.strictEqual(a.status, 0, 'gate-check reports, it never refuses: ' + a.stderr)
  assert.strictEqual(a.stdout.trim(), '{"scoped":false,"gateRunsSuite":true,"slowTier":false}',
    'doctor reads this line to flag an unscoped gate — a wrong shape hides it: ' + a.stdout + a.stderr)
  const b = gateCheck({ gateCommand: 'npm run lint && npm test {testDirs}', testCommand: 'npm test', slowTestCommand: 'npm run test:slow' })
  assert.strictEqual(b.status, 0, 'gate-check reports, it never refuses: ' + b.stderr)
  assert.strictEqual(b.stdout.trim(), '{"scoped":true,"gateRunsSuite":false,"slowTier":true}',
    'a scoped gate with a declared slow tier must not be flagged: ' + b.stdout + b.stderr)
})

test('AC-20261101-07-10: the invariants universe roots at the script a slowTestCommand names', () => {
  const dir = tmpdir('gc-invariants')
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'scripts/slow.sh'), '#!/usr/bin/env bash\n')
  const cfg = { slowTestCommand: 'bash scripts/slow.sh' }
  const { deriveInvariants } = require(path.join(SPEC, 'scripts/lib/invariants.js'))
  const res = deriveInvariants(dir, cfg)
  assert.ok(res.roots.includes('scripts/slow.sh'),
    'configCommandStrings must carry slowTestCommand or expiry treats the slow tier script\'s guarding tests as expirable: ' + JSON.stringify(res.roots))
})
