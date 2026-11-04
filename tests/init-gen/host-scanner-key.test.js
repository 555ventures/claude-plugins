'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo, read, ROOT } = require('../helpers')

// specs/20261101/01-the-host-names-its-own-test-cases.md: AC-20261101-01-11..-14 pin init-gen's
// handling of config.testCaseScanner and the doctor/init doctrine that names it.

function baseProfile(extraConfig) {
  return {
    config: {
      gateCommand: 'node --test {testDirs}',
      testCommand: 'node --test',
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
  fs.writeFileSync(path.join(dir, 'scanner.js'), "console.log('tests/test_x.py :: test_alpha')\n")
  const p = path.join(dir, 'profile.json')
  fs.writeFileSync(p, JSON.stringify(baseProfile(extraConfig)))
  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', p])
  return { dir, r }
}

test('AC-20261101-01-11: generate writes config.testCaseScanner verbatim and a manifest exec row proving the scanner lists at least one case', () => {
  const { dir, r } = generate('hsk-ac11', { testCaseScanner: 'node scanner.js' })
  assert.strictEqual(r.status, 0, 'a valid scanner key must generate cleanly: ' + r.stderr)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec.config.json'), 'utf8'))
  assert.strictEqual(cfg.testCaseScanner, 'node scanner.js',
    'the key must reach the host config verbatim or the host never declares its case grammar: ' + JSON.stringify(cfg))
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.claude/spec-manifest.json'), 'utf8'))
  const all = []
  ;(function walk(v) {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') { all.push(v); Object.values(v).forEach(walk) }
  })(manifest)
  const row = all.find(o => o.claim === 'test-case scanner lists at least one case')
  assert.ok(row, 'without the manifest row a scanner that lists nothing is stamped as grounded: ' + JSON.stringify(manifest))
  assert.strictEqual(row.kind, 'exec', 'the row must be an exec proof: ' + JSON.stringify(row))
  assert.strictEqual(row.target, 'node scanner.js | grep -q .', 'the row must run the scanner into grep: ' + JSON.stringify(row))
})

test('AC-20261101-01-12: generate exits 2 naming config.testCaseScanner when the key is an empty string or a number, and writes no config', () => {
  for (const [label, bad] of [['empty', ''], ['number', 42]]) {
    const { dir, r } = generate('hsk-ac12-' + label, { testCaseScanner: bad })
    assert.strictEqual(r.status, 2, label + ' scanner key must be refused with exit 2: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('profile field "config.testCaseScanner" must be a non-empty shell command string'),
      'the refusal must name the field so init can repair the profile: ' + r.stderr)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
      'a refused profile must write no config: a half-grounded host results')
  }
})

test('AC-20261101-01-13: generate allows the scanner command in settings.json so the pipeline can run it unprompted', () => {
  const { dir, r } = generate('hsk-ac13', { testCaseScanner: 'node scanner.js' })
  assert.strictEqual(r.status, 0, 'generation must succeed: ' + r.stderr)
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'))
  assert.ok(settings.permissions.allow.includes('Bash(node scanner.js:*)'),
    'without the allow entry every scanner run prompts and a headless build stalls: ' + JSON.stringify(settings.permissions))
})

