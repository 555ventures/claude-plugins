'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('./helpers')

// specs/20260908/05-release-e2e-unobserved-count.md D1/AC-20260908-05-11: the four count-parser
// functions review-legs.js defined locally move byte-for-byte into
// spec/scripts/lib/count-observation.js so release-legs.js can import the identical predicate
// instead of a copy that has already drifted (A1). No CLI — this is a pure require() unit pin.

test('AC-20260908-05-11: lib/count-observation.js exports isUnobserved, true for an observed 0 and a pattern-no-match unavailability, false for a nonzero count and a no-format-declared unavailability', () => {
  const { isUnobserved } = require(path.join(SPEC, 'scripts/lib/count-observation'))
  assert.strictEqual(isUnobserved(0), true,
    'an observed testsExecuted of 0 is the unsupported "the suite ran" promise this predicate ' +
    'exists to catch — isUnobserved must return true, or a zero-test run reads as green')
  assert.strictEqual(isUnobserved({ unavailable: 'pattern-no-match' }), true,
    'a declared testCountPattern that never matched the runner output is the second unsupported ' +
    'promise this predicate catches — isUnobserved must return true')
  assert.strictEqual(isUnobserved(3), false,
    'an observed nonzero count must never be treated as unobserved — isUnobserved(3) must return ' +
    'false, or every passing run with a real count would be forced red')
  assert.strictEqual(isUnobserved({ unavailable: 'no-format-declared' }), false,
    'D4: a host that declared no testCountPattern promised no observation at all, so it must ' +
    'never force — isUnobserved must return false for the no-format-declared unavailability, ' +
    'never collapse it into the pattern-no-match case')
})

test('AC-20260908-05-11: lib/count-observation.js exports computeTestsExecuted returning the LAST regex match, never a quoted decoy line that precedes the real summary', () => {
  const { computeTestsExecuted } = require(path.join(SPEC, 'scripts/lib/count-observation'))
  const executed = computeTestsExecuted('a\nexecuted 0 tests\nexecuted 5 tests\n', 'executed (\\d+) tests')
  assert.strictEqual(executed, 5,
    'computeTestsExecuted must return the LAST match (5), never the first (0) — a first-match ' +
    'read is the exact drift A1 measured between release-legs.js\'s copy and review-legs.js\'s ' +
    'lastMatch-based original, which a decoy line quoting the summary phrase before the real ' +
    'summary line would silently misread as a zero-test run: got ' + JSON.stringify(executed))
})

test('AC-20260908-05-11: lib/count-observation.js exports computeSkips returning a typed no-format-declared unavailability when the declared pattern is the literal "none"', () => {
  const { computeSkips } = require(path.join(SPEC, 'scripts/lib/count-observation'))
  const result = computeSkips('executed 5 tests\n', 'none')
  assert.deepStrictEqual(result, { skips: { unavailable: 'no-format-declared' } },
    'a pattern of "none" means the host declared no skip-report format at all — computeSkips ' +
    'must return the typed no-format-declared unavailability, never an assumed zero or a ' +
    'pattern-no-match reason that would misrepresent a declared absence as an unmatched format: ' +
    JSON.stringify(result))
})

test('AC-20260908-05-11 (Contracts): lib/count-observation.js exports lastMatch, the shared regex-match primitive both count parsers are built on', () => {
  const { lastMatch } = require(path.join(SPEC, 'scripts/lib/count-observation'))
  assert.strictEqual(typeof lastMatch, 'function',
    'lastMatch must be exported as a function — Contracts names it as one of the four sole-home ' +
    'exports, and a missing export here would force any importer (review-legs.js, release-legs.js) ' +
    'back onto a local re-implementation, recreating the drift this spec exists to remove')
  const m = lastMatch('skipped 1 test\nskipped 3 tests\n', 'skipped (\\d+) tests?')
  assert.strictEqual(m[1], '3',
    'lastMatch must return the LAST regex match over the output, never the first: ' + JSON.stringify(m))
})
