'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// review.md Phase 0 step 5's AC-line lint calls any bullet whose leading bold token fails to
// fully match its stated regex a "malformed AC" — an automatic hard finding. The regex must
// therefore admit every AC-ID the pipeline itself mints, and letter-suffixed successor specs
// (`NNa-*`, sanctioned in doctor.md check 17, adr.md, roadmap-overview.md, genesis.md and the
// scaffold ledger) mint ids like AC-20260813-06a-1. The original `AC-\d{8}-\d{2}-\d+` did not:
// applied literally it flagged all six ACs of specs/20260813/06a as malformed, so a review of
// any successor spec would open with six phantom hard findings while the real coverage matrix
// (which greps the ids as literals) was green.
//
// This pin EXECUTES the regex lifted out of the doctrine rather than asserting its text: a
// source-text pin would pass against a regex that rejects the ids it is supposed to accept.

const reviewMd = read('spec/commands/review.md')

function acIdPattern() {
  const m = reviewMd.match(/full anchored match of `([^`]+)`/)
  assert.ok(m, 'review.md Phase 0 step 5 must state the AC-ID shape as a single backticked regex ' +
    'after "full anchored match of" — the lint is unpinnable if the shape lives in prose')
  return new RegExp('^(?:' + m[1] + ')$')
}

test('AC-ID lint admits the letter-suffixed successor-spec form', () => {
  const re = acIdPattern()
  for (const id of ['AC-20260813-06a-1', 'AC-20260813-06a-6', 'AC-20260805-01b-12']) {
    assert.match(id, re,
      `${id} must be well-formed: letter-suffixed successor specs (NNa-*) are sanctioned across ` +
      'doctor.md, adr.md, roadmap-overview.md and genesis.md, and their ACs are namespaced with ' +
      'the suffixed spec number. Rejecting them turns every successor-spec review into a pile of ' +
      'phantom hard findings against ACs whose tests actually exist')
  }
})

test('AC-ID lint CONTINUES to admit the plain numbered form', () => {
  const re = acIdPattern()
  for (const id of ['AC-20260813-06-4', 'AC-20260805-01-7', 'AC-20260801-04-12']) {
    assert.match(id, re, `${id} is the ordinary namespaced form and must stay well-formed`)
  }
})

test('AC-ID lint CONTINUES to reject shapes that would drop out of an AC-ID grep', () => {
  const re = acIdPattern()
  const malformed = [
    'AC-2026081-06-1',    // 7-digit date
    'AC-20260813-6-1',    // unpadded spec number
    'AC-20260813-06a',    // no AC ordinal
    'AC-20260813-06A-1',  // uppercase suffix — the successor convention is lowercase
    'AC-20260813-06ab-1', // multi-letter suffix is not a minted form
    'ACC-20260813-06-1',  // wrong prefix
  ]
  for (const id of malformed) {
    assert.doesNotMatch(id, re,
      `${id} must stay malformed — the lint exists because an id the AC-ID greps cannot see ` +
      'would silently drop out of coverage and ride to CLEAN')
  }
})
