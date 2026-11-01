'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261029/08-the-policy-round-at-init.md D1/D2/D5: AC-20261029-08-1 (policy() defaults merge and
// validatePolicy findings), AC-20261029-08-2 (POLICY_DEFAULTS.models equals core.md § Model Placement),
// AC-20261029-08-7 (init-gen.js policy-check drift findings and exit codes).

const lib = () => require('../../spec/scripts/lib/host-config')

function writeConfig(dir, obj) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), JSON.stringify(obj, null, 2) + '\n')
}

test('AC-20261029-08-1: policy(root) returns the full default block for a config without one and merges a partial block key by key over the defaults', () => {
  const { policy } = lib()
  assert.strictEqual(typeof policy, 'function', 'host-config.js must export policy(root), or no command has one accessor for the block')
  const bare = tmpdir('policy-bare')
  writeConfig(bare, {})
  const d = policy(bare)
  assert.deepStrictEqual(d.models.reviewer, { model: 'fable', effort: 'low' }, 'an absent block must yield the reviewer default fable/low, or a host that never answered gets a different seat: ' + JSON.stringify(d))
  assert.strictEqual(d.mergeStrategy, 'derived', 'an absent block must yield mergeStrategy derived, or a host that never answered changes behaviour')

  const part = tmpdir('policy-part')
  writeConfig(part, { policy: { mergeStrategy: 'squash', models: { reviewer: { model: 'opus', effort: 'high' } } } })
  const p = policy(part)
  assert.strictEqual(p.mergeStrategy, 'squash', 'a set key must win over its default: ' + JSON.stringify(p))
  assert.deepStrictEqual(p.models.reviewer, { model: 'opus', effort: 'high' }, 'a set seat must win over its default')
  assert.deepStrictEqual(p.models.workers, { model: 'sonnet', effort: 'medium' }, 'an unset seat must keep its default, or a partial models block drops the other seats')
  assert.strictEqual(p.testExpiry, 'classify', 'an unset key must keep its default, or a partial block drops keys')
})

test('AC-20261029-08-1: validatePolicy returns one finding per defect naming the key, and nothing for a valid block', () => {
  const { validatePolicy } = lib()
  assert.strictEqual(typeof validatePolicy, 'function', 'host-config.js must export validatePolicy(block), or generate and doctor have no shared validator')
  assert.deepStrictEqual(validatePolicy({ mergeStrategy: 'rebase' }),
    ['mergeStrategy: expected one of derived|merge-commit|ff-only|squash|rebase-ff'],
    'a bad enum value must yield exactly the one enum finding, or the owner cannot tell which key to fix')
  const f = validatePolicy({ foo: 1, models: { reviewer: { model: 'gpt', effort: 'low' } } })
  assert.strictEqual(f.length, 2, 'two defects must yield two findings: ' + JSON.stringify(f))
  assert.ok(f.some(x => x.includes('unknown key foo')), 'an unknown key must be named: ' + JSON.stringify(f))
  assert.ok(f.some(x => x.includes('models.reviewer.model')), 'a bad seat model must be named by its path: ' + JSON.stringify(f))
  assert.deepStrictEqual(validatePolicy({}), [], 'an empty partial block is valid, or every host is refused at generate')
})

test('AC-20261029-08-2: POLICY_DEFAULTS.models equals core.md § Model Placement table rows for workers, reviewer and disposer', () => {
  const { POLICY_DEFAULTS } = lib()
  assert.ok(POLICY_DEFAULTS && POLICY_DEFAULTS.models, 'host-config.js must export POLICY_DEFAULTS with a models block')
  const core = read('spec/doctrine/core.md')
  const section = core.slice(core.indexOf('## Model Placement'), core.indexOf('## Decisions'))
  const row = (seat) => {
    const m = section.match(new RegExp('^\\|\\s*' + seat + '[^|]*\\|\\s*(\\w+)\\s*\\|\\s*(\\w+)\\s*\\|', 'm'))
    assert.ok(m, 'core.md § Model Placement must carry the ' + seat + ' row')
    return { model: m[1], effort: m[2] }
  }
  assert.deepStrictEqual(POLICY_DEFAULTS.models.workers, row('Implementation workers'), 'workers default drifted from the doctrine table')
  assert.deepStrictEqual(POLICY_DEFAULTS.models.reviewer, row('Reviewer'), 'reviewer default drifted from the doctrine table')
  assert.deepStrictEqual(POLICY_DEFAULTS.models.disposer, row('Disposer'), 'disposer default drifted from the doctrine table')
})

const RULES = '.claude/rules/spec-pipeline.md'

function policyHost(policy, { trackLedger, riskBody }) {
  const dir = tmpdir('policy-check')
  const git = gitRepo(dir)
  writeConfig(dir, { pipelineRules: RULES, policy })
  fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, RULES), '# Rules\n\n## Risk Tiers\n\n' + riskBody + '\n\n## Planning\n\nPlanning body.\n')
  if (trackLedger) fs.writeFileSync(path.join(dir, '.claude', 'spec-runs.jsonl'), '{"a":1}\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'seed policy host')
  return dir
}

const check = (dir) => runNode('scripts/init-gen.js', ['policy-check', '--root', dir, '--json'])

test('AC-20261029-08-7: policy-check exits 1 with exactly the tracked-ledger and missing-risk-tier findings', () => {
  const dir = policyHost({ ledgerCommitted: false, riskTiers: ['auth', 'PII'] }, { trackLedger: true, riskBody: '- auth: login paths' })
  const r = check(dir)
  assert.strictEqual(r.status, 1, 'two drifts must exit 1: ' + r.stderr + r.stdout)
  assert.deepStrictEqual(JSON.parse(r.stdout).slice().sort(), [
    'ledgerCommitted=false but .claude/spec-runs.jsonl is tracked',
    'riskTiers entry "PII" is not in ' + RULES + ' § Risk Tiers',
  ].sort(), 'only the two real drifts may be reported, or doctor 24 cries wolf or stays silent')
})

test('AC-20261029-08-7: policy-check exits 0 printing [] when the ledger is untracked and the risk tier differs only in case', () => {
  const dir = policyHost({ ledgerCommitted: false, riskTiers: ['Auth'] }, { trackLedger: false, riskBody: '- auth: login paths' })
  const r = check(dir)
  assert.strictEqual(r.status, 0, 'a clean block must exit 0: ' + r.stderr + r.stdout)
  assert.deepStrictEqual(JSON.parse(r.stdout), [], 'a clean block must print an empty JSON array')
})

test('AC-20261029-08-7: policy-check includes the validator finding for a bad enum value', () => {
  const dir = policyHost({ mergeStrategy: 'rebase' }, { trackLedger: false, riskBody: '- auth' })
  const r = check(dir)
  assert.strictEqual(r.status, 1, 'a validator defect must exit 1: ' + r.stderr + r.stdout)
  assert.ok(JSON.parse(r.stdout).includes('mergeStrategy: expected one of derived|merge-commit|ff-only|squash|rebase-ff'),
    'policy-check must surface validatePolicy findings, or an invalid hand-edit is never reported: ' + r.stdout)
})
