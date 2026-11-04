'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md D1 (AC-20261103-10-1, AC-20261103-10-2):
// spec/scripts/lib/brief.js parses a brief stamp once and is the one place two briefs are compared.

const brief = () => require(path.join(SPEC, 'scripts/lib/brief.js'))

test('AC-20261103-10-1: parseBrief returns briefed with the normalized number for a number and ad-hoc for every briefless spelling, and briefNum, briefOrd and normBrief agree', () => {
  const { parseBrief, briefNum, briefOrd, normBrief } = brief()
  assert.deepStrictEqual(parseBrief('32'), { kind: 'briefed', num: '32' }, 'a plain number must parse as briefed, or every briefed spec loses its brief')
  assert.deepStrictEqual(parseBrief('4b-auth'), { kind: 'briefed', num: '04b' }, 'a lettered stamp must normalize onto its roadmap number, or it reads as an orphan')
  for (const raw of ['n/a', 'NONE', '-', '—', '', undefined, null]) {
    assert.deepStrictEqual(parseBrief(raw), { kind: 'adhoc' }, 'the briefless spelling ' + JSON.stringify(raw) + ' must parse as ad-hoc, or it collapses into a falsy value again')
  }
  assert.strictEqual(briefNum(parseBrief('04b')), '04b', 'briefNum must return the number of a briefed value, or --json prints the wrong stamp')
  assert.strictEqual(briefNum(parseBrief('n/a')), null, 'briefNum must return null for ad-hoc, or --json changes shape for ad-hoc specs')
  assert.strictEqual(briefOrd(parseBrief('04b')), 4.02, 'briefOrd must give the sortable rank of a lettered brief, or 04b sorts out of place')
  assert.strictEqual(briefOrd(parseBrief('n/a')), Infinity, 'briefOrd must sort ad-hoc after every briefed spec')
  assert.strictEqual(normBrief('4b-auth'), '04b', 'normBrief from lib/brief.js must normalize a lettered stamp')
  const queue = require(path.join(SPEC, 'scripts/lib/queue.js'))
  assert.strictEqual(queue.normBrief('4b-auth'), '04b', 'lib/queue.js must re-export normBrief unchanged, or the queue and the status script disagree on a brief number')
})

test('AC-20261103-10-2: relateBriefs answers same, different or unknown with the reason, and refuses an unparsed argument with a TypeError', () => {
  const { parseBrief, relateBriefs } = brief()
  const rel = (a, b) => relateBriefs(parseBrief(a), parseBrief(b))
  assert.deepStrictEqual(rel('32', '32'), { relation: 'same', reason: null }, 'two equal briefs must be same with no reason, or the shared-brief serialization is lost')
  assert.deepStrictEqual(rel('32', '33'), { relation: 'different', reason: null }, 'two different briefs must be different with no reason')
  assert.deepStrictEqual(rel('n/a', 'n/a'), { relation: 'unknown', reason: 'both ad-hoc' }, 'two ad-hoc specs must be unknown, never same, or the fan-out blames the first stopped lane')
  assert.deepStrictEqual(rel('n/a', '32'), { relation: 'unknown', reason: 'left ad-hoc' }, 'an ad-hoc left side must be unknown with its reason')
  assert.deepStrictEqual(rel('32', 'n/a'), { relation: 'unknown', reason: 'right ad-hoc' }, 'an ad-hoc right side must be unknown with its reason')
  assert.throws(() => relateBriefs('32', '32'), (e) => e instanceof TypeError && e.message.startsWith('relateBriefs: expected a parsed brief'),
    'an unparsed argument must throw a TypeError, or a raw string compares silently and the defect class returns')
})
