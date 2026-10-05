'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261005/02-connect-runs-first.md — AC-20261005-02-7 through AC-20261005-02-10 (D6–D8):
// init-gen.js generate carries the walkthrough block from the host's config, treats a config that
// holds only the block (plus stamps) as not yet generated, and still refuses any other hand-edit.

const W = { baseUrl: 'https://x.example', project: 'acme', tokenEnv: 'WALKTHROUGH_TOKEN' }
const CONFIG_REL = '.claude/spec.config.json'

function baseProfile() {
  return {
    config: {
      gateCommand: 'node --test {testDirs}',
      testCommand: 'node --test',
      setupCommand: 'npm install',
      patternsScript: 'scripts/spec-patterns.sh',
      layerGroups: [['doctrine', 'scripts']],
      agentMap: { tests: 'test-owner', scripts: 'data-layer', default: 'data-layer' },
      pipelineRules: '.claude/rules/spec-pipeline.md',
      runtime: { inert: 'synthetic test host — no bootable process' }
    },
    rules: {
      paths: ['specs/**', '.claude/**'],
      sections: {
        'Risk Tiers': 'Risk tiers body.\n',
        'Planning': 'Planning body.\n',
        'Build': 'Build body.\n',
        'Worker Rules': 'Worker rules body.\n',
        'Test Rules': 'Test rules body.\n',
        'Review Checks': 'Review checks body.\n'
      }
    },
    conventionRules: [
      { file: 'queries.md', paths: ['src/**/queries.ts'], body: 'Queries convention body.\n' }
    ],
    agents: [
      {
        name: 'data-layer', kind: 'queries', description: 'Owns the data layer.',
        model: 'sonnet', persona: 'Data layer persona body.\n',
        expertise: ['src/**/queries.ts'], reference: ['src/schema.sql'],
        constraints: ['Never raw SQL outside queries.ts']
      },
      {
        name: 'test-owner', kind: 'tests', description: 'Owns the test suite.',
        model: 'sonnet', persona: 'Test owner persona body.\n',
        expertise: ['tests/**'], reference: ['tests/helpers.js'],
        constraints: ['Never writes implementation code']
      }
    ],
    selfVerifyExamples: "`node --test 'tests/x/*.test.js'`",
    skills: {
      specVerify: { description: 'Use to verify the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'spec-verify body.\n' },
      run: { description: 'Use to run the app locally.', allowedTools: ['Bash(npm test:*)'], body: 'run body.\n' }
    },
    settings: { extraAllow: [], extraDeny: [] },
    patternSweeps: ['sweep "as any" -e \':\\s*any\' -g \'!*.test.ts\''],
    sourceRoot: 'src',
    manifestExtras: [],
    probeOutcomes: {
      testCommand: { failsLoud: true },
      atRisk: { applicable: true }
    }
  }
}

// A synthetic git host plus the written profile; `diskConfig` (an object, or a raw string) is
// written to the host config first when given.
function setup(diskConfig, profile = baseProfile()) {
  const dir = tmpdir('init-gen-carry')
  gitRepo(dir)
  const profilePath = path.join(dir, 'profile.json')
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2))
  if (diskConfig !== undefined) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, CONFIG_REL), typeof diskConfig === 'string' ? diskConfig : JSON.stringify(diskConfig, null, 2) + '\n')
  }
  return { dir, profilePath }
}

const generate = (h, extra = []) => runNode('scripts/init-gen.js', ['generate', '--root', h.dir, '--profile', h.profilePath, ...extra])
const config = (h) => JSON.parse(fs.readFileSync(path.join(h.dir, CONFIG_REL), 'utf8'))

test('AC-20261005-02-7: generate on a host whose config holds only a walkthrough block generates, stamps and keeps the block, with and without --refresh', () => {
  const h = setup({ walkthrough: W })
  const r = generate(h)
  assert.strictEqual(r.status, 0, 'a block-only config has no hand-edit to lose, so generate must exit 0 — otherwise genesis HANDOFF fails on every project that connected first: ' + r.stderr)
  const cfg = config(h)
  assert.strictEqual(cfg.gateCommand, 'node --test {testDirs}', 'the profile\'s config must be written over the block-only config, or the project is left ungrounded: ' + JSON.stringify(cfg))
  assert.match(cfg.generatedBy, /^spec@/, 'the stamp step must add generatedBy, or the host cannot tell what generated it: ' + JSON.stringify(cfg))
  assert.match(cfg.contractHash, /^[0-9a-f]{12}$/, 'the stamp step must add the 12-hex contractHash, or drift detection has nothing to compare: ' + JSON.stringify(cfg))
  assert.deepStrictEqual(cfg.walkthrough, W, 'the block must survive the generate verbatim, or the project is disconnected from the review service')

  const h2 = setup({ walkthrough: W })
  const r2 = generate(h2, ['--refresh'])
  assert.strictEqual(r2.status, 0, 'a refresh over a block-only config must exit 0: ' + r2.stderr)
  assert.ok(r2.stdout.includes('changed: .claude/spec.config.json'), 'a block-only config must be reported changed on refresh, since it is replaced by the generated one: ' + r2.stdout)
  assert.deepStrictEqual(config(h2).walkthrough, W, 'a refresh must keep the block, or a refresh disconnects the project')
})

test('AC-20261005-02-8: generate on a generated host whose config has since gained a walkthrough block succeeds with and without --refresh and keeps the block', () => {
  const h = setup()
  const first = generate(h)
  assert.strictEqual(first.status, 0, 'setup: the first generate must succeed before the block is added: ' + first.stderr)
  const cfg = config(h)
  cfg.walkthrough = W
  fs.writeFileSync(path.join(h.dir, CONFIG_REL), JSON.stringify(cfg, null, 2) + '\n')

  const plain = generate(h)
  assert.strictEqual(plain.status, 0, 'a plain generate over a generated host that gained a block must exit 0, or every connected host refuses its own regenerate: ' + plain.stderr)
  assert.deepStrictEqual(config(h).walkthrough, W, 'a plain generate must keep the block')

  const refreshed = generate(h, ['--refresh'])
  assert.strictEqual(refreshed.status, 0, 'a refresh must exit 0: ' + refreshed.stderr)
  assert.ok(refreshed.stdout.includes('unchanged: .claude/spec.config.json'), 'with the block carried, the config target must equal the file on disk and read unchanged: ' + refreshed.stdout)
  assert.deepStrictEqual(config(h).walkthrough, W, 'a refresh must keep the block, or it deletes the connection')
})

test('AC-20261005-02-9: when the profile config carries a different walkthrough than the disk, the one on disk is written', () => {
  const profile = baseProfile()
  profile.config.walkthrough = { baseUrl: 'https://other.example', project: 'zzz', tokenEnv: 'WALKTHROUGH_TOKEN' }
  const h = setup({ walkthrough: W }, profile)
  const r = generate(h)
  assert.strictEqual(r.status, 0, 'a block-only disk config must generate even when the profile names another block: ' + r.stderr)
  assert.deepStrictEqual(config(h).walkthrough, W, 'the disk\'s block must win over the profile\'s, or a typo in a profile moves the project to another service project')
})

test('AC-20261005-02-10: a config with a walkthrough block and another differing key is still refused with exit 3 without --refresh, naming the file and leaving it byte-identical', () => {
  const bytes = JSON.stringify({ gateCommand: 'make hand-edit', walkthrough: W }, null, 2) + '\n'
  const h = setup(bytes)
  const r = generate(h)
  assert.strictEqual(r.status, 3, 'a hand-edited key must still be refused with exit 3, or the carry is a way around the hand-edit guard: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('.claude/spec.config.json'), 'the refusal must name the config file, or the user cannot see what to refresh: ' + r.stderr)
  assert.strictEqual(fs.readFileSync(path.join(h.dir, CONFIG_REL), 'utf8'), bytes, 'a refused generate must leave the config byte-identical, or a hand-edit is lost')
})
