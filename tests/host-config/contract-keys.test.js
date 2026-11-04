'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { read, runBash, section, phrase, ROOT } = require('../helpers')

// specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md D1: AC-20261101-07-1 —
// the grounding contract names the optional slowTestCommand key and its test-tier section.
// specs/20261103/04-predictable-stops-become-host-policy.md D2: AC-20261103-04-2 — the contract's § Policy
// carries the stops block, its enums, and this repo's contractHash is restamped over it.

test('AC-20261101-07-1 / AC-20261103-06-8: the contract carries ## Test tiers (optional) after Test expiry, names slowTestCommand there and in the optional key run, carries the fanout block with both lists and enums in § Policy, and its hash moved and equals the config stamp', () => {
  const pol = section('spec/templates/grounding-contract.md', /^## Policy/, /^## (?!Policy)/)
  const json = pol.slice(pol.indexOf('```json'), pol.indexOf('```', pol.indexOf('```json') + 7))
  assert.match(json, /"fanout"\s*:\s*\{/, 'the § Policy JSON block must carry a fanout object, or hosts never learn the block exists')
  for (const k of ['selfSurfaces', 'overlapExempt']) {
    assert.match(json, new RegExp('"' + k + '"\\s*:\\s*\\['), 'the fanout block must carry ' + k + ', or init writes a different default than the drivers read')
    assert.match(pol, phrase('`fanout.' + k + '`'), 'the Enums paragraph must name fanout.' + k + ', or a host cannot tell what shape the list takes')
  }
  const stamp = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8')).contractHash
  assert.strictEqual(stamp, runBash('bin/spec-paths', ['contract-hash']).stdout.trim(),
    'the config contractHash must equal spec-paths contract-hash, or /spec:doctor flags this repo as stale')
  const src = read('spec/templates/grounding-contract.md')
  const expiry = src.indexOf('## Test expiry (required)')
  const tiers = src.indexOf('## Test tiers (optional)')
  assert.ok(expiry !== -1 && tiers > expiry,
    'the tier section must exist after Test expiry — without it a host has no contract text telling it where the slow tier lives')
  const next = src.indexOf('\n## ', tiers + 1)
  assert.ok(src.slice(tiers, next === -1 ? undefined : next).includes('slowTestCommand'),
    'the section must name slowTestCommand, or the key is specified nowhere')
  const keys = src.slice(src.indexOf('## Required config keys'), src.indexOf('## Runtime verification'))
  assert.ok(keys.includes('slowTestCommand'),
    'the key must be listed with the optional run of config keys, or hosts and init never learn it exists')
  const hash = runBash('bin/spec-paths', ['contract-hash']).stdout.trim()
  assert.notStrictEqual(hash, 'd3216056413e',
    'the contract hash must differ from the pre-spec stamp, or hosts never see their grounding as stale')
})

test('AC-20261103-04-2 / AC-20261103-09-2: the contract § Policy JSON block carries the six stops keys with their defaults, the Enums sentence names prototypeClose ask | keep | delete and rejectWithEvidence accept | ask, and this repo\'s contractHash equals the edited contract\'s hash', () => {
  const pol = section('spec/templates/grounding-contract.md', /^## Policy/, /^## (?!Policy)/)
  const json = pol.slice(pol.indexOf('```json'), pol.indexOf('```', pol.indexOf('```json') + 7))
  assert.match(json, /"stops"\s*:\s*\{/, 'the JSON block must carry a stops object, or hosts never learn the block exists')
  for (const [k, v] of [['repairRound', 'repair'], ['buildEscalate', 'derived'], ['reviewEscalate', 'queue'], ['redFindings', 'remove-mention'], ['prototypeClose', 'ask'], ['rejectWithEvidence', 'accept']]) {
    assert.match(json, new RegExp('"' + k + '"\\s*:\\s*"' + v + '"'), 'the block must carry "' + k + '": "' + v + '", or init writes a different default than the drivers read')
  }
  assert.match(pol, phrase('`stops.prototypeClose` `ask | keep | delete`'), 'the Enums paragraph must name the prototypeClose enum, or a host cannot tell delete is opt-in')
  assert.match(pol, phrase('`stops.rejectWithEvidence` `accept | ask`'), 'the Enums paragraph must name the rejectWithEvidence enum, or a host cannot tell the repro accept can be turned off')
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/spec.config.json'), 'utf8'))
  const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'spec/templates/grounding-contract.md'))).digest('hex').slice(0, 12)
  assert.notStrictEqual(cfg.contractHash, '4a008a392b20', 'the earlier stale stamp must not survive the contract edit, or every host sees no staleness')
  assert.notStrictEqual(cfg.contractHash, 'e3fb765dadad', 'the pre-edit stamp must not survive the contract edit, or every host sees no staleness')
  assert.strictEqual(cfg.contractHash, expected, 'contractHash must equal the edited contract\'s hash, or /spec:doctor flags this repo\'s own grounding as stale')
})
