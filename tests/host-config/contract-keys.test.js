'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, runBash } = require('../helpers')

// specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md D1: AC-20261101-07-1 —
// the grounding contract names the optional slowTestCommand key and its test-tier section.

test('AC-20261101-07-1: the contract carries ## Test tiers (optional) after Test expiry, names slowTestCommand there and in the optional key run, and its hash moved', () => {
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
