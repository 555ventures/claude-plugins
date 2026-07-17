'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// Failure-density mining (2026-07-17): both independent design reviews found the same unmined
// asset — every host already records blocked-returns, deviations, review findings, verify
// outcomes, and escapes in `.claude/spec-runs.jsonl` and feedback briefs, but nothing queries
// which doctrine surface generates the failures. Hardening priority was a judgment call
// (armchair migration orders) when it could be a measurement. The mining lives in /intake's
// sweep phase so every triage session ends by NAMING the next hardening target, and the
// scaffold ledger's promote/retire decisions get fed with cross-host numbers instead of
// single-host anecdotes.

const intake = read('.claude/commands/intake.md')

test('intake sweep mines failure density across hosts', () => {
  assert.match(intake, /failure[- ]density/i,
    'no density rollup: hardening priority stays an armchair judgment call')
  assert.match(intake, /per[- ](doctrine[- ])?surface|per[- ]stage.*per[- ]surface|surface.*×|× *surface/i,
    'density must attribute failures to the doctrine surface that generated them, not just the stage')
  assert.match(intake, /jq/,
    'ledger rows are queried with jq — never read whole ledgers into context')
})

test('the sweep ends by naming the next hardening target', () => {
  assert.match(intake, /next hardening target/i,
    'the rollup must terminate in one named target, or it is a table nobody acts on')
  assert.match(intake, /promote|retire/i,
    'density numbers feed the scaffold-ledger promote/retire conditions')
})
