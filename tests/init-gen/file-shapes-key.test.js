'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo, read } = require('../helpers')

// specs/20261101/02-the-host-declares-its-file-shapes.md: AC-20261101-02-11 .. AC-20261101-02-14 pin
// init-gen's handling of config.fileShapes (generate, probe, shapes-check) and the init/doctor
// doctrine that names it.

const BLOCK = { testGlobs: ['qa/**'], codeExtensions: ['.rb'], manifests: ['Gemfile'] }

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

function generate(prefix, block) {
  const dir = tmpdir(prefix)
  gitRepo(dir)
  const p = path.join(dir, 'profile.json')
  fs.writeFileSync(p, JSON.stringify(baseProfile({ fileShapes: block })))
  const r = runNode('scripts/init-gen.js', ['generate', '--root', dir, '--profile', p])
  return { dir, r }
}

// A committed host: files maps rel -> body, cfg is written to .claude/spec.config.json.
function committedHost(prefix, cfg, files) {
  const dir = tmpdir(prefix)
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(cfg))
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  g('add', '-A'); g('commit', '-q', '-m', 'host')
  return dir
}

test('AC-20261101-02-11: generate writes a valid config.fileShapes block verbatim and refuses an invalid one with exit 2 and no config written', () => {
  const ok = generate('fsk-ac11a', BLOCK)
  assert.strictEqual(ok.r.status, 0, 'a valid fileShapes block must generate cleanly: ' + ok.r.stderr)
  const cfg = JSON.parse(fs.readFileSync(path.join(ok.dir, '.claude/spec.config.json'), 'utf8'))
  assert.deepStrictEqual(cfg.fileShapes, BLOCK, 'the block must reach the host config verbatim or the host never declares its shapes: ' + JSON.stringify(cfg))

  const bad = generate('fsk-ac11b', { ...BLOCK, codeExtensions: ['rb'] })
  assert.strictEqual(bad.r.status, 2, 'an extension without a leading dot must be refused at generate, not discovered at use: ' + bad.r.stdout + bad.r.stderr)
  assert.ok(bad.r.stderr.includes('profile field "config.fileShapes" fileShapes.codeExtensions entries must start with "."'),
    'the refusal must name the field and the validator message so the interview can fix the profile: ' + bad.r.stderr)
  assert.ok(!fs.existsSync(path.join(bad.dir, '.claude/spec.config.json')),
    'a refused profile must write no config, or the host is left half-grounded')
})

test('AC-20261101-02-12: probe classifies with the existing config\'s testGlobs and --test-globs overrides it', () => {
  const dir = committedHost('fsk-ac12', { fileShapes: { testGlobs: ['qa/**'] } }, {
    'qa/a_spec.rb': "# covers tests/b.test.js\n",
    'tests/b.test.js': "test('b', () => {})\n",
  })
  const declared = runNode('scripts/init-gen.js', ['probe', '--root', dir])
  assert.strictEqual(declared.status, 0, 'probe never fails: ' + declared.stderr)
  const a = JSON.parse(declared.stdout).atRisk
  assert.ok(a && a.refs >= 1,
    'with testGlobs [qa/**], tests/b.test.js is a sampled source file and qa/a_spec.rb the test citing it; refs 0 means the probe still classifies with its own defaults: ' + declared.stdout)
  const forced = runNode('scripts/init-gen.js', ['probe', '--root', dir, '--test-globs', 'tests/**'])
  assert.strictEqual(forced.status, 0, 'probe with --test-globs must not fail: ' + forced.stderr)
  const f = JSON.parse(forced.stdout).atRisk
  assert.ok(f && f.refs === 0,
    'with --test-globs tests/** the citing file qa/a_spec.rb is a source, tests/b.test.js the only test and it cites nothing; refs>0 means the override is ignored: ' + forced.stdout)
})

test('AC-20261101-02-13: shapes-check reports unmatched declared test globs with exit 3, invalid blocks with exit 3, and an undeclared host with exit 0', () => {
  const dir = committedHost('fsk-ac13a', { fileShapes: { testGlobs: ['qa/**', '**/*_spec.rb', 'nothing/**'] } }, {
    'qa/a_spec.rb': 'x\n',
  })
  const r = runNode('scripts/init-gen.js', ['shapes-check', '--root', dir, '--json'])
  assert.strictEqual(r.status, 3, 'a declared glob matching no file is drift and must exit 3: ' + r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepStrictEqual(out, { declared: true, invalid: null, testFiles: 1, unmatchedTestGlobs: ['nothing/**'] },
    'the machine contract must name exactly the unmatched glob and the matched file count: ' + r.stdout)
  assert.ok(r.stderr.includes('nothing/**'), 'stderr must carry one line naming the dead glob for the doctor to print: ' + r.stderr)

  const bad = committedHost('fsk-ac13b', { fileShapes: { codeExtensions: ['rb'] } }, { 'a.rb': 'x\n' })
  const b = runNode('scripts/init-gen.js', ['shapes-check', '--root', bad, '--json'])
  assert.strictEqual(b.status, 3, 'an invalid block must exit 3: ' + b.stdout + b.stderr)
  assert.strictEqual(JSON.parse(b.stdout).invalid, 'fileShapes.codeExtensions entries must start with "."',
    'invalid must carry the validator message verbatim: ' + b.stdout)

  const none = committedHost('fsk-ac13c', { gateCommand: 'true' }, { 'tests/a.test.js': 'x\n', 'src/x.js': 'y\n' })
  const n = runNode('scripts/init-gen.js', ['shapes-check', '--root', none, '--json'])
  assert.strictEqual(n.status, 0, 'a host declaring no block has nothing to drift: ' + n.stdout + n.stderr)
  assert.deepStrictEqual(JSON.parse(n.stdout), { declared: false, invalid: null, testFiles: 1, unmatchedTestGlobs: [] },
    'an undeclared host reports the default-classified file count and no unmatched globs: ' + n.stdout)
})

