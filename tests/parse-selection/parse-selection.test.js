'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// specs/20260823/09-replay-baseline-attribution.md AC-20260823-09-8 (2026-08-24 review): the
// review-driver.test.js fixture for this AC (`makeReplayHost` + `driveToClose` + `commitClose`)
// invokes the REAL spec/scripts/replay.js, whose --select line unconditionally appends
// `baselineRed=`/`baselineLegs=` as VALUES — `unknown`, never an omitted key — so that fixture
// can never produce a genuine five-token line. The AC's own regex fallback (`m[6] || null`,
// `m[7] || null`) therefore had zero coverage: the exec test's two assertions (reaches REPLAY,
// stdout doesn't match /die|parse.*fail/) passed trivially whether or not the fallback worked.
// This file drives spec-review-driver.js's extracted parser directly with a hand-built
// five-token string, the only way to exercise the absence branch at all. AC-20260823-09-8's
// coverage lives HERE now; review-driver.test.js's same-named test is retargeted to what its
// exec fixture actually proves (a seven-token line still enters REPLAY).

const { parseSelection } = require('../../spec/scripts/lib/parse-selection')

const FIVE_TOKEN = 'spec=specs/20260823/09-replay-baseline-attribution.md reviewRunId=rv_abc123 ' +
  'commit=deadbeef parent=cafef00d diffBase=1234abcd'
const SEVEN_TOKEN = FIVE_TOKEN + ' baselineRed=2 baselineLegs=5'

test('AC-20260823-09-8: WHEN parseSelection reads a genuine five-token line carrying neither baseline token THE SYSTEM returns baselineRed and baselineLegs as null while the five required fields still parse, never a parse failure', () => {
  const parsed = parseSelection(FIVE_TOKEN)
  assert.notStrictEqual(parsed, null,
    'a valid five-token line (the pre-D1 replay.js shape, or an old sidecar resumed mid-flight against it) must still match the regex at all — returning null here IS the parse die AC-8 forbids: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.baselineRed, null,
    'the two new capture groups are OPTIONAL (each with its own trailing "?") — when the literal baselineRed= key is absent from the line, the field must default to null via `m[6] || null`, never crash or coerce to some other falsy sentinel: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.baselineLegs, null,
    'same as baselineRed — absence of the baselineLegs= key must default to null via `m[7] || null`, not undefined or a parse failure: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.spec, 'specs/20260823/09-replay-baseline-attribution.md',
    'the five required fields must parse correctly even when the optional trailing groups never match — a regression here would mean the two new optional groups silently broke the required ones: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.reviewRunId, 'rv_abc123',
    'reviewRunId must survive unrelated to whether the baseline tokens are present: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.commit, 'deadbeef',
    'commit must survive unrelated to whether the baseline tokens are present: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.parent, 'cafef00d',
    'parent must survive unrelated to whether the baseline tokens are present: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.diffBase, '1234abcd',
    'diffBase must survive unrelated to whether the baseline tokens are present: ' + JSON.stringify(parsed))
})

test('AC-20260823-09-7: WHEN parseSelection reads a seven-token line (today\'s replay.js shape) THE SYSTEM captures baselineRed and baselineLegs as their literal values, not the string "null" or the token text itself', () => {
  const parsed = parseSelection(SEVEN_TOKEN)
  assert.notStrictEqual(parsed, null,
    'a seven-token line — what replay.js --select actually prints today — must match: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.baselineRed, '2',
    'baselineRed must capture the value after the = sign, not the whole "baselineRed=2" token or a stale default: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.baselineLegs, '5',
    'baselineLegs must capture the value after the = sign, not the whole "baselineLegs=5" token or a stale default: ' + JSON.stringify(parsed))
})

test('a non-matching string returns null rather than throwing or returning a partially-populated object', () => {
  assert.strictEqual(parseSelection('replay.js: no base candidate for specs/x/01.md'), null,
    'an advisory or error line that never matches the spec=.../reviewRunId=.../... shape must return null so callers can detect "nothing to parse" instead of reading undefined fields off a bogus object: ' + JSON.stringify(parseSelection('replay.js: no base candidate for specs/x/01.md')))
})
