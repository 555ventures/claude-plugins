'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { read, evalFns } = require('./helpers')

// dashboard-20260813-10: the RedCheck sentinel cross-check compared a RUNTIME-ONLY sentinel
// against a DUAL-LEG expectation, which deadlocked every compile-time-only carrier. A type-level
// test (expectTypeOf, an assert-absence pin, a test importing a module the implementation has not
// created yet) is erased at runtime, so it can never be runtime-red: `expect: 'red'` failed the
// sentinel cross-check, `expect: 'green'` failed the dual-leg reading, and NO classification could
// pass. The build could only proceed by disabling the probe.
//
// Fix contract: the cross-check combines both legs — red iff the runtime sentinel is AUDIT_RED OR
// the typecheck leg is attributed to that file — while keeping every uncertain path failing CLOSED.

const src = read(path.join('spec', 'workflows', 'src', 'wf-build.body.js'))
const { crossCheckSentinels } = evalFns(src, ['crossCheckSentinels'])

const P = 'src/lib/price-feed.test.ts'
const TYPE_DIAG = P + "(5,32): error TS2307: Cannot find module '@/lib/price-feed'."
const sentinel = (over) => ({
  path: P, sentinel: 'AUDIT_GREEN:' + P, typecheckRed: false, typecheckEvidence: '', ...over })

test('a compile-time-only carrier classified red MATCHES (the deadlock case)', () => {
  // Runtime passes by construction; typecheck is red. This is the real spec 20260813/10 shape.
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }],
      [sentinel({ typecheckRed: true, typecheckEvidence: TYPE_DIAG })], true),
    [])
})

test('the same carrier classified green is still a MISMATCH', () => {
  // Guards against "fixing" the deadlock by making both classifications pass.
  const m = crossCheckSentinels([{ path: P, expect: 'green' }],
    [sentinel({ typecheckRed: true, typecheckEvidence: TYPE_DIAG })], true)
  assert.strictEqual(m.length, 1)
  assert.strictEqual(m[0].observed, 'red')
  assert.strictEqual(m[0].leg, 'typecheck')
})

test('a red-expected file green on BOTH legs is still caught', () => {
  // The probe's original purpose: tests passing before implementation means the spec is wrong.
  const m = crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel()], true)
  assert.strictEqual(m.length, 1)
  assert.strictEqual(m[0].observed, 'green')
})

test('an ordinary runtime-red carrier and a clean green pin both match', () => {
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }],
      [sentinel({ sentinel: 'AUDIT_RED:' + P })], true),
    [])
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'green' }], [sentinel()], true),
    [])
})

test('a green-expected carrier failing at runtime is a broken pin', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'green' }],
    [sentinel({ sentinel: 'AUDIT_RED:' + P })], true)
  assert.strictEqual(m.length, 1)
  assert.strictEqual(m[0].leg, 'runtime')
})

test('typecheckRed without a diagnostic naming the file fails CLOSED', () => {
  // Attribution is a reading, so it only counts when it carries its evidence.
  const m = crossCheckSentinels([{ path: P, expect: 'red' }],
    [sentinel({ typecheckRed: true, typecheckEvidence: 'some other file errored' })], true)
  assert.strictEqual(m[0].observed, 'not-collected')
  assert.match(m[0].detail, /UNVERIFIED/)
})

test('typecheckRed on a host with no typecheck leg fails CLOSED', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'red' }],
    [sentinel({ typecheckRed: true, typecheckEvidence: TYPE_DIAG })], false)
  assert.strictEqual(m[0].observed, 'not-collected')
})

test('a malformed or missing sentinel fails CLOSED', () => {
  assert.strictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel({ sentinel: 'lgtm' })], true)[0]
      .observed, 'not-collected')
  assert.strictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }], [], true)[0].observed, 'not-collected')
})

test('the RED schema requires both legs of per-file evidence', () => {
  // The cross-check can only combine legs the agent is actually obliged to report.
  const start = src.indexOf('sentinels: {')
  const schema = src.slice(start, src.indexOf('summary: { type:', start))
  for (const field of ['typecheckRed', 'typecheckEvidence']) {
    assert.ok(schema.includes(field), 'RED.sentinels must carry ' + field)
  }
  assert.match(schema, /required:\s*\[[^\]]*'typecheckRed'[^\]]*'typecheckEvidence'/)
})
