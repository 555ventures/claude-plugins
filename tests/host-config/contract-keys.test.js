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

