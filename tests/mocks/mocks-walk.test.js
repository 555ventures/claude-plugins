'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// specs/20260910/03-client-journey-player.md D4: spec/scripts/lib/mocks-walk.js does not exist
// yet — every test below is red until recordEvent/confirmJourney/waiveJourney/isClosed land.
// Gotcha (a require() throw here would abort every test in the file before node:test can report
// per-test failures): guarded the same way tests/mocks/client-route.test.js guards
// lib/client-capture.js. AC-20260910-03-4.

let mocksWalkLib
try {
  // eslint-disable-next-line global-require
  mocksWalkLib = require('../../spec/scripts/lib/mocks-walk')
} catch (e) {
  const reason = 'spec/scripts/lib/mocks-walk.js does not exist yet (D4): ' + e.message
  const boom = () => { throw new Error(reason) }
  mocksWalkLib = { recordEvent: boom, confirmJourney: boom, waiveJourney: boom, isClosed: boom }
}
const { recordEvent, confirmJourney, waiveJourney, isClosed } = mocksWalkLib

const NOW_ISO = '2026-09-10T00:00:00.000Z'
function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString() }

test('AC-20260910-03-4: recordEvent appends from/to to an empty journey\'s reached exactly once across two identical "to" events, appends a "miss" to misses without touching reached, confirmJourney refuses an empty sentence (naming the journey), records confirmedAt/sentence on a real one, and refuses a second confirm naming "already confirmed"', () => {
  let walk = { journeys: {} }
  walk = recordEvent(walk, { journey: 'onboarding', walk: 'to', from: 'signin', to: 'invite', at: NOW_ISO }) || walk
  walk = recordEvent(walk, { journey: 'onboarding', walk: 'to', from: 'signin', to: 'invite', at: NOW_ISO }) || walk
  assert.deepStrictEqual(walk.journeys.onboarding.reached, ['signin', 'invite'],
    'AC-4: two identical "to" events over an empty journey must leave reached as [\'signin\',\'invite\'] — from and to each appended exactly once, never duplicated: got ' + JSON.stringify(walk.journeys.onboarding.reached))

  walk = recordEvent(walk, { journey: 'onboarding', walk: 'miss', from: 'invite', target: 'button#help Need help?', at: NOW_ISO }) || walk
  assert.deepStrictEqual(walk.journeys.onboarding.misses, [{ at: NOW_ISO, from: 'invite', target: 'button#help Need help?' }],
    'AC-4: a "miss" event must append {at, from, target} to misses: got ' + JSON.stringify(walk.journeys.onboarding.misses))
  assert.deepStrictEqual(walk.journeys.onboarding.reached, ['signin', 'invite'],
    'AC-4: a "miss" event must leave reached unchanged: got ' + JSON.stringify(walk.journeys.onboarding.reached))

  assert.throws(() => confirmJourney(walk, { journey: 'onboarding', sentence: '', at: NOW_ISO }), /onboarding/,
    'AC-4: confirmJourney with an empty sentence must throw, naming the journey "onboarding"')

  walk = confirmJourney(walk, { journey: 'onboarding', sentence: '招待を送って、同意をもらって、セッションを始めた', at: NOW_ISO }) || walk
  assert.strictEqual(walk.journeys.onboarding.confirmedAt, NOW_ISO,
    'AC-4: confirmJourney with a real sentence must set confirmedAt: got ' + JSON.stringify(walk.journeys.onboarding))
  assert.strictEqual(walk.journeys.onboarding.sentence, '招待を送って、同意をもらって、セッションを始めた',
    'AC-4: confirmJourney must record the sentence verbatim: got ' + JSON.stringify(walk.journeys.onboarding))

  assert.throws(() => confirmJourney(walk, { journey: 'onboarding', sentence: 'again', at: NOW_ISO }), /already confirmed/,
    'AC-4: a second confirmJourney on an already-confirmed journey must throw naming "already confirmed"')

  assert.strictEqual(isClosed(walk, 'onboarding'), true,
    'AC-4: isClosed must be true for a confirmed journey: got ' + isClosed(walk, 'onboarding'))
})

test('AC-20260910-03-4: waiveJourney refuses before seven days have elapsed since openedAt (naming 6 and 7), accepts at seven days and records waived.reason, and isClosed is true for a waived journey', () => {
  let walk = { journeys: {} }
  const sixDaysAgo = isoDaysAgo(6)
  assert.throws(
    () => waiveJourney(walk, { journey: 'onboarding', reason: 'no reply', by: 'session', now: new Date(), openedAt: sixDaysAgo }),
    (err) => /6/.test(err.message) && /7/.test(err.message),
    'AC-4: waiveJourney at six days silent must throw naming "6" and "7"',
  )

  const sevenDaysAgo = isoDaysAgo(7)
  walk = waiveJourney(walk, { journey: 'onboarding', reason: 'no reply', by: 'session', now: new Date(), openedAt: sevenDaysAgo }) || walk
  assert.strictEqual(walk.journeys.onboarding.waived && walk.journeys.onboarding.waived.reason, 'no reply',
    'AC-4: waiveJourney at seven days silent must set waived.reason: got ' + JSON.stringify(walk.journeys.onboarding.waived))
  assert.strictEqual(isClosed(walk, 'onboarding'), true,
    'AC-4: isClosed must be true for a waived journey: got ' + isClosed(walk, 'onboarding'))
})

test('AC-20260910-03-4: recordEvent stamps journeys[j].lastEventAt with `at` on BOTH a "to" and a "miss" event, and waiveJourney clocks from the later of openedAt and lastEventAt so a correct click made seconds ago refuses a waiver even eight days after openedAt', () => {
  let walk = { journeys: {} }
  const eightDaysAgo = isoDaysAgo(8)
  const justNow = new Date().toISOString()

  walk = recordEvent(walk, { journey: 'onboarding', walk: 'to', from: 'signin', to: 'invite', at: justNow }) || walk
  assert.strictEqual(walk.journeys.onboarding.lastEventAt, justNow,
    'AC-4: a "to" event must stamp journeys[j].lastEventAt with `at`: got ' + JSON.stringify(walk.journeys.onboarding))

  assert.throws(
    () => waiveJourney(walk, { journey: 'onboarding', reason: 'no reply', by: 'session', now: new Date(), openedAt: eightDaysAgo }),
    /onboarding/,
    'AC-4: waiveJourney must refuse a journey whose lastEventAt is seconds old, even though openedAt was eight days ago — the click, not openedAt, is the live clock: got no throw',
  )

  let missWalk = { journeys: {} }
  missWalk = recordEvent(missWalk, { journey: 'onboarding', walk: 'miss', from: 'signin', target: 'button#help', at: justNow }) || missWalk
  assert.strictEqual(missWalk.journeys.onboarding.lastEventAt, justNow,
    'AC-4: a "miss" event must also stamp journeys[j].lastEventAt with `at`: got ' + JSON.stringify(missWalk.journeys.onboarding))
})
