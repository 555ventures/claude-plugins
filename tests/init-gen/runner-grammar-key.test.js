'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo, section, phrase } = require('../helpers')

// specs/20261102/01-the-host-names-its-runner-grammar.md: AC-20261102-01-14 .. AC-20261102-01-18 pin
// init-gen's handling of config.trunk, capabilities.forge and capabilities.failCountPattern
// (generate, grammar-check) and the init/doctor doctrine that names them.

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

// extraConfig is spread into config; capabilities, when given, is merged into config.capabilities.
function generate(prefix, extraConfig) {
  const dir = tmpdir(prefix)
  gitRepo(dir)
  const p = path.join(dir, 'profile.json')
  fs.writeFileSync(p, JSON.stringify(baseProfile(extraConfig)))
  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', p])
  return { dir, r }
}

function committedHost(prefix, cfg) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(cfg))
  g('add', '-A'); g('commit', '-q', '-m', 'host')
  return dir
}

test('AC-20261102-01-14: generate refuses a forge outside github|none, an empty trunk, and a failCountPattern that is neither "none" nor a regex with a capture group, each with exit 2 naming the field and no config written; valid declarations generate', () => {
  const refused = [
    ['forge gitlab', { capabilities: { forge: 'gitlab' } }, 'config.capabilities.forge'],
    ['empty trunk', { trunk: '' }, 'config.trunk'],
    ['pattern without a group', { capabilities: { failCountPattern: 'no group' } }, 'config.capabilities.failCountPattern'],
    ['uncompilable pattern', { capabilities: { failCountPattern: '(unclosed' } }, 'config.capabilities.failCountPattern'],
  ]
  for (const [label, cfg, field] of refused) {
    const { dir, r } = generate('rgk-ac14-bad', cfg)
    assert.strictEqual(r.status, 2, label + ': an invalid grammar declaration must be refused at generate, not discovered when a leg reads it: ' + r.stdout + r.stderr)
    assert.ok(r.stderr.includes('profile field "' + field + '"'),
      label + ': the refusal must name the field so the interview can fix the profile: ' + r.stderr)
    assert.ok(!fs.existsSync(path.join(dir, '.claude/spec.config.json')),
      label + ': a refused profile must write no config, or the host is left half-grounded')
  }
  const forge = generate('rgk-ac14-forge', { capabilities: { forge: 'gitlab' } })
  assert.ok(forge.r.stderr.includes('init-gen: profile field "config.capabilities.forge" must be "github" or "none"'),
    'the forge refusal must state the two accepted values or the interview cannot repair it: ' + forge.r.stderr)

  const ok = generate('rgk-ac14-ok', { trunk: 'develop', capabilities: { forge: 'none', failCountPattern: 'none' } })
  assert.strictEqual(ok.r.status, 0, 'forge none, a named trunk and failCountPattern "none" are all valid declarations and must generate: ' + ok.r.stderr)
  const cfg = JSON.parse(fs.readFileSync(path.join(ok.dir, '.claude/spec.config.json'), 'utf8'))
  assert.strictEqual(cfg.trunk, 'develop', 'trunk must reach the host config verbatim or the review never reads it: ' + JSON.stringify(cfg))
  assert.strictEqual(cfg.capabilities.forge, 'none', 'forge must reach the host config verbatim: ' + JSON.stringify(cfg))
  assert.strictEqual(cfg.capabilities.failCountPattern, 'none', 'failCountPattern must reach the host config verbatim: ' + JSON.stringify(cfg))
})

test('AC-20261102-01-15: grammar-check on a host declaring forge github, an existing trunk main, no failCountPattern and a testCommand without {file} prints the declared-facts JSON and exits 0', () => {
  const dir = committedHost('rgk-ac15', {
    testCommand: 'node --test', capabilities: { forge: 'github' }, trunk: 'main',
  })
  const r = runNode('scripts/init-gen.js', ['grammar-check', '--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'a host declaring a complete, resolving grammar has nothing to drift: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(JSON.parse(r.stdout),
    { file: { testCommand: false, typecheckCommand: null }, failCountPattern: 'built-in',
      trunk: { declared: 'main', resolves: true }, forge: 'github' },
    'the machine contract must report each declared fact exactly, or the doctor prints findings from a guess: ' + r.stdout)
})

test('AC-20261102-01-16: grammar-check on a host declaring trunk nosuch, failCountPattern "(unclosed" and no forge exits 3 with the three findings in the JSON and three stderr lines naming .claude/spec.config.json', () => {
  const dir = committedHost('rgk-ac16', {
    testCommand: 'node --test', trunk: 'nosuch', capabilities: { failCountPattern: '(unclosed' },
  })
  const r = runNode('scripts/init-gen.js', ['grammar-check', '--root', dir, '--json'])
  assert.strictEqual(r.status, 3, 'a dead trunk, an invalid pattern and an undeclared forge are drift and must exit 3: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out.trunk, { declared: 'nosuch', resolves: false },
    'a declared trunk naming no branch must report resolves:false: ' + r.stdout)
  assert.strictEqual(out.failCountPattern, 'invalid', 'a pattern that does not compile must report invalid: ' + r.stdout)
  assert.strictEqual(out.forge, 'undeclared', 'a missing forge key must report undeclared: ' + r.stdout)
  const lines = r.stderr.split('\n').filter((l) => l.startsWith('init-gen: grammar-check:'))
  assert.strictEqual(lines.length, 3,
    'doctor prints one warning per stderr line, so each of the three findings needs its own line: ' + r.stderr)
  for (const l of lines) {
    assert.ok(l.includes('.claude/spec.config.json'),
      'each finding must name the config file as its remedy or the host cannot act on it: ' + l)
  }
})

test('AC-20261102-01-17: doctor.md names the grammar-check command under check 1 and capabilities.forge under check 2', () => {
  const doctor = 'spec/commands/doctor.md'
  const check1 = section(doctor, /^1\. \*\*Config integrity\*\*/, /^2\. /)
  assert.match(check1, phrase('init-gen)" grammar-check --root . --json'),
    'doctor check 1 must run init-gen grammar-check or an undeclared grammar is invisible to the host')
  const check2 = section(doctor, /^2\. \*\*Contract stamp\*\*/, /^3\. /)
  assert.match(check2, phrase('capabilities.forge'),
    'doctor check 2 must name capabilities.forge or the CI-evidence-off nudge never tells the host which key to declare')
})

test('AC-20261102-01-18: init.md Phase 4 names config.trunk, config.capabilities.forge, config.capabilities.failCountPattern and {file}, and Phase 1 names refs/remotes/origin/HEAD and git remote get-url origin', () => {
  const init = 'spec/commands/init.md'
  const p4 = section(init, /^## Phase 4/, /^## Phase 5/)
  for (const key of ['config.trunk', 'config.capabilities.forge', 'config.capabilities.failCountPattern', '{file}']) {
    assert.match(p4, phrase(key),
      'init Phase 4 must tell the session to write ' + key + ' or no host ever declares it')
  }
  const p1 = section(init, /^## Phase 1 /, /^## Phase 1\.5/)
  for (const detect of ['refs/remotes/origin/HEAD', 'git remote get-url origin']) {
    assert.match(p1, phrase(detect),
      'init Phase 1 must profile the host with ' + detect + ' or trunk and forge are guessed from a stack name')
  }
})
