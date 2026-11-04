'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261029/08-the-policy-round-at-init.md D1/D2/D5: AC-20261029-08-1 (policy() defaults merge and
// validatePolicy findings), AC-20261029-08-2 (POLICY_DEFAULTS.models equals core.md § Model Placement),
// AC-20261029-08-7 (init-gen.js policy-check drift findings and exit codes).
// specs/20261103/04-predictable-stops-become-host-policy.md D1: AC-20261103-04-1 (the policy.stops block).

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

// specs/20261103/06-the-fan-out-drains-the-queue.md D3: the policy.fanout block.
test('AC-20261103-06-7: policy(root) defaults fanout.selfSurfaces and fanout.overlapExempt, merges a partial fanout block key by key, and validatePolicy reports a bad list and an unknown key exactly', () => {
  const { policy, validatePolicy } = lib()
  const bare = tmpdir('policy-fanout-bare')
  writeConfig(bare, {})
  const d = policy(bare).fanout
  assert.ok(d && d.selfSurfaces.includes('spec/scripts/fanout-driver.js'), 'the default selfSurfaces must name the driver, or a batch never stops before a spec rewriting the runner: ' + JSON.stringify(d))
  assert.ok(d.overlapExempt.includes('**/.claude-plugin/plugin.json'), 'the default overlapExempt must name plugin.json, or every spec serializes on its own version bump')
  const part = tmpdir('policy-fanout-part')
  writeConfig(part, { policy: { fanout: { overlapExempt: ['docs/**'] } } })
  const p = policy(part).fanout
  assert.deepStrictEqual(p.overlapExempt, ['docs/**'], 'a set list must win over its default, or a host cannot name its own ceremony paths')
  assert.ok(p.selfSurfaces.includes('spec/scripts/fanout-driver.js'), 'an unset list must keep its default, or a partial fanout block drops the other list')
  assert.deepStrictEqual(validatePolicy({ fanout: { selfSurfaces: 'x', other: 1 } }),
    ['fanout.selfSurfaces: expected an array of non-empty strings', 'unknown key fanout.other'],
    'a bad list and an unknown key must each yield exactly one finding naming the key, or an invalid hand-edit passes silently')
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

const STOP_DEFAULTS = { repairRound: 'repair', buildEscalate: 'derived', reviewEscalate: 'queue', redFindings: 'remove-mention', prototypeClose: 'ask', rejectWithEvidence: 'accept' }

test('AC-20261103-04-1 / AC-20261103-09-1: policy(root) returns the six stops defaults for a config without a block and merges a partial stops block key by key', () => {
  const { policy } = lib()
  const bare = tmpdir('policy-stops-bare')
  writeConfig(bare, {})
  assert.deepStrictEqual(policy(bare).stops, STOP_DEFAULTS,
    'an absent block must yield the safe stop defaults, or a host that never answered keeps asking every predictable stop')
  const part = tmpdir('policy-stops-part')
  writeConfig(part, { policy: { stops: { prototypeClose: 'keep' } } })
  assert.deepStrictEqual(policy(part).stops, { ...STOP_DEFAULTS, prototypeClose: 'keep' },
    'a set stop must win while the other five keep their defaults, or a partial block drops the rest')
  const ask = tmpdir('policy-stops-rwe')
  writeConfig(ask, { policy: { stops: { rejectWithEvidence: 'ask' } } })
  assert.deepStrictEqual(policy(ask).stops, { ...STOP_DEFAULTS, rejectWithEvidence: 'ask' },
    'a set rejectWithEvidence must win while the other five keep their defaults, or the key is dropped by the merge')
})

test('AC-20261103-04-1 / AC-20261103-09-1: validatePolicy reports a bad stops enum and an unknown stops key exactly, and a non-object stops as one finding', () => {
  const { validatePolicy } = lib()
  assert.deepStrictEqual(validatePolicy({ stops: { rejectWithEvidence: 'always' } }), ['stops.rejectWithEvidence: expected one of accept|ask'],
    'a bad rejectWithEvidence value must yield exactly its enum finding, or the owner cannot tell which stop to fix')
  assert.deepStrictEqual(validatePolicy({ stops: { repairRound: 'always', bogus: 1 } }),
    ['stops.repairRound: expected one of repair|ask', 'unknown key stops.bogus'],
    'the findings must name the stop key and its enum, or the owner cannot tell which stop to fix')
  assert.deepStrictEqual(validatePolicy({ stops: 'repair' }), ['stops: expected an object'],
    'a scalar stops block must be refused as a whole, or generate writes an unreadable block')
  assert.deepStrictEqual(validatePolicy({ stops: STOP_DEFAULTS }), [],
    'the default block must validate, or every freshly initialised host is refused')
})

// specs/20261102/03-one-session-runs-the-lanes.md D2: the lanes seat and agentCall's fourth argument.
test('AC-20261102-03-4: agentCall renders the lanes seat with isolation and background after effort, honours a host override, and validatePolicy names a bad lanes model', () => {
  const { agentCall, validatePolicy } = lib()
  const bare = tmpdir('policy-lanes-bare')
  writeConfig(bare, {})
  assert.strictEqual(agentCall(bare, 'lanes', 'general-purpose', { isolation: 'worktree', background: true }),
    'Agent {subagent_type: "general-purpose", model: opus, effort: medium, isolation: "worktree", run_in_background: true}',
    'a lane dispatch line must carry the lanes seat default plus the isolation and background flags, or a lane worker lands in the main tree or blocks the session')
  const over = tmpdir('policy-lanes-over')
  writeConfig(over, { policy: { models: { lanes: { model: 'sonnet' } } } })
  assert.match(agentCall(over, 'lanes', 'general-purpose', { isolation: 'worktree', background: true }), /model: sonnet, effort: medium/,
    'a host override of the lanes seat must win while the unset effort keeps the default, or the seat is not host-overridable')
  const f = validatePolicy({ models: { lanes: { model: 'gpt' } } })
  assert.strictEqual(f.length, 1, 'a bad lanes model must yield exactly one finding: ' + JSON.stringify(f))
  assert.ok(f[0].includes('lanes'), 'the finding must name the lanes seat, or the owner cannot tell which key to fix: ' + f[0])
})

test('AC-20261102-03-20: agentCall without a fourth argument prints no isolation or run_in_background text', () => {
  const { agentCall } = lib()
  const bare = tmpdir('policy-lanes-compat')
  writeConfig(bare, {})
  assert.strictEqual(agentCall(bare, 'reviewer', 'spec:reviewer'), 'Agent {subagent_type: "spec:reviewer", model: fable, effort: low}',
    'a three-argument call must render exactly as before, or every existing dispatch line changes')
  assert.doesNotMatch(agentCall(bare, 'reviewer', 'spec:reviewer'), /isolation|run_in_background/,
    'a seat dispatched without the fourth argument must never carry the lane flags')
})

const RULES = '.claude/rules/spec-pipeline.md'

function policyHost(policy, { trackLedger, riskBody, rulesKey = RULES, rulesText }) {
  const dir = tmpdir('policy-check')
  const git = gitRepo(dir)
  writeConfig(dir, rulesKey === null ? { policy } : { pipelineRules: rulesKey, policy })
  fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, RULES), rulesText !== undefined ? rulesText : '# Rules\n\n## Risk Tiers\n\n' + riskBody + '\n\n## Planning\n\nPlanning body.\n')
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

// A rules file policy-check cannot compare against is one finding naming why — never one
// "not in  § Risk Tiers" per tier with an empty filename (the missing-key escape).
for (const [name, opts, expected] of [
  ['the config has no pipelineRules key', { rulesKey: null }, 'riskTiers declared but config has no pipelineRules path'],
  ['pipelineRules names a missing file', { rulesKey: '.claude/rules/absent.md' }, 'riskTiers declared but pipelineRules .claude/rules/absent.md is unreadable (ENOENT)'],
  ['the rules file has no Risk Tiers section', { rulesText: '# Rules\n\n## Planning\n\nPlanning body.\n' }, 'riskTiers declared but ' + RULES + ' has no ## Risk Tiers section'],
]) {
  test('policy-check reports exactly one finding naming the cause when ' + name, () => {
    const dir = policyHost({ riskTiers: ['auth', 'PII'] }, { trackLedger: false, riskBody: '- auth', ...opts })
    const r = check(dir)
    assert.strictEqual(r.status, 1, 'an uncomparable rules file is drift and must exit 1: ' + r.stderr + r.stdout)
    assert.deepStrictEqual(JSON.parse(r.stdout), [expected],
      'one finding naming the cause, not one per tier blaming the tiers, or doctor 24 sends the owner to fix the wrong thing')
  })
}
