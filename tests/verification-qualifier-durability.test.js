'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// CROSS-20260813-03 (hearwell ×2 + upwell): qualifiers that exist at run time die before the
// durable, machine-readable artifact records them. Three shapes:
// (a) review.md's ledger row writes `testsSkipped:<n>` identically whether every skip was
//     [env:]-declared-sanctioned or wholly unsanctioned — hearwell: testsSkipped:5 looked the
//     same for five [env: DATABASE_URL]-gated ACs and five that never ran for no declared
//     reason; every downstream consumer (doctor, escape correlation) has to re-open the specs
//     and count [env: tags by hand to tell the two apart.
// (b) hearwell's first release recorded verdict CLEAN with ci:"unavailable" — a structurally
//     absent required verdict leg — and nothing forces a later reader of the milestone word or
//     ledger row to weigh that pair; the transient ⚠️ console line is the only place the
//     qualifier ever lived.
// (c) upwell spec 20260811/01: the AC coverage machinery has no way for a spec to DECLARE a
//     non-test oracle (a typecheck/compiler pass, or a named gate command) — so an AC whose
//     correctness oracle legitimately isn't a test reports as uncovered even though its oracle
//     ran, identically to an AC nobody checked at all.

const review = read('spec/commands/review.md')
const release = read('spec/commands/release.md')
const verdictJs = read('spec/scripts/verdict.js')
const specTemplate = read('spec/templates/spec.md')

test('CROSS-20260813-03a: the ledger row schema distinguishes sanctioned [env:]-gated skips from unsanctioned ones in testsSkipped', () => {
  // Bound the check to the `testsSkipped` field's own value in the ledger row shape (one JSON
  // line) — a whole-doc regex would match "sanctioned" from the unrelated `verify.sanctioned`
  // field later on the SAME line and pass vacuously without a real split ever existing.
  const m = /"testsSkipped":(\{[^}]*\}|[^,}]+)/.exec(review)
  const testsSkippedValue = m ? m[1] : ''
  assert.notStrictEqual(testsSkippedValue, '',
    'could not locate the `"testsSkipped":` field in review.md\'s ledger row shape at all — ' +
    'update the extraction regex if the ledger row was restructured')
  assert.match(testsSkippedValue, /sanctioned|unsanctioned|env-gated|declared/i,
    'review.md\'s ledger row schema writes a single `testsSkipped:<n>` count (' +
    JSON.stringify(testsSkippedValue) + ') with no split between declaration-gated ' +
    '([env: VAR]) skips and unsanctioned ones — hearwell: testsSkipped:5 was written ' +
    'identically for five properly [env:]-tagged ACs and five that skipped with no declared ' +
    'reason, so every downstream consumer must re-open the spec and count [env: tags by hand ' +
    'to tell a sanctioned skip run from an unsanctioned one')
})

test('CROSS-20260813-03b: a structurally-absent required release leg is made durable in the milestone word or a mandatory row-level qualifier', () => {
  const hasQualifierWord = /CLEAN[- ]with[- ]qualifier/i.test(release) || /CLEAN[- ]with[- ]qualifier/i.test(verdictJs)
  assert.ok(hasQualifierWord,
    'neither release.md nor verdict.js has a distinct verdict word or mandatory row-level ' +
    'qualifier (e.g. a "CLEAN-with-qualifier" milestone word) for a structurally-absent ' +
    'required leg — hearwell\'s first release recorded verdict CLEAN with ci:"unavailable" ' +
    '(a required leg that never resolved), and nothing beyond the transient ⚠️ console line ' +
    'forces a later reader of the milestone word or the durable ledger row to weigh that pair')
})

test('CROSS-20260813-03c: the AC coverage machinery supports a DECLARED non-test oracle (typecheck/compiler or a named gate command), sibling to [env:]', () => {
  const declaresOracleSyntax = /\[oracle:/i.test(specTemplate) || /\[oracle:/i.test(review) ||
    /declared oracle|non-test oracle/i.test(specTemplate) || /declared oracle|non-test oracle/i.test(review)
  assert.ok(declaresOracleSyntax,
    'neither the spec template nor review.md has an oracle-declaration syntax sibling to the ' +
    'existing `[env: VAR]` AC tag — an AC whose correctness oracle is legitimately a ' +
    'typecheck/compiler pass or a named gate command (never a test) has no way to declare that, ' +
    'so review\'s mechanical grep matrix reports it uncovered identically to an AC nobody ' +
    'checked at all (upwell spec 20260811/01)')
})
