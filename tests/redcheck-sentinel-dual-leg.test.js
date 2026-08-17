'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { read, evalFns } = require('./helpers')

// dashboard-20260813-10: the RedCheck sentinel cross-check compared a RUNTIME-ONLY sentinel
// against a DUAL-LEG expectation, which deadlocked every compile-time-only carrier. A type-level
// test (expectTypeOf, an assert-absence pin) is erased at runtime, so it can never be
// runtime-red: `expect: 'red'` failed the sentinel cross-check, `expect: 'green'` failed the
// dual-leg reading, and NO classification could pass. The build could only proceed by disabling
// the probe.
//
// Fix contract: the cross-check combines both legs — red iff the runtime sentinel is AUDIT_RED OR
// the typecheck leg is attributed to that file — while keeping every uncertain path failing CLOSED.
//
// 2026-08-15 spec 06, D6: retagged in place for the assertionsRun attribution hardening — a test
// importing a module the implementation has not created yet is NOT a compile-time-only carrier
// (it crashes at runtime rather than being erased by it; that was the misclassification the
// retired example sanctioned). TYPE_DIAG here is now a genuine type-assertion diagnostic so this
// suite keeps pinning the deadlock fix without embodying the class the sibling spec retires.

const src = read(path.join('spec', 'workflows', 'src', 'wf-build.body.js'))
const { crossCheckSentinels } = evalFns(src, ['crossCheckSentinels'])

const P = 'src/lib/price-feed.test.ts'
const TYPE_DIAG = P + "(5,32): error TS2344: Type 'string' does not satisfy the constraint 'Feed'."
const sentinel = (over) => ({
  path: P, sentinel: 'AUDIT_GREEN:' + P, typecheckRed: false, typecheckEvidence: '', ...over })

test('AC-20260815-06-4: a compile-time-only carrier classified red MATCHES via a genuine non-resolution type diagnostic (the deadlock case)', () => {
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

test('AC-20260815-06-5: an ordinary runtime-red carrier with its assertions demonstrated, and a clean green pin, both match', () => {
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }],
      [sentinel({ sentinel: 'AUDIT_RED:' + P, assertionsRun: 1 })], true),
    [],
    'a demonstrated runtime-red (assertionsRun >= 1) is the ordinary TDD red-first case and must ' +
    'keep matching once the attribution requirement lands')
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'green' }], [sentinel()], true),
    [],
    'a clean green pin is unaffected by the attribution requirement, which only gates red ' +
    'expectations')
})

test('AC-20260815-06-5: a green-expected carrier failing at runtime is a broken pin regardless of assertionsRun', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'green' }],
    [sentinel({ sentinel: 'AUDIT_RED:' + P })], true)
  assert.strictEqual(m.length, 1,
    'a green-expected carrier observed runtime-red is a broken pin no matter what assertionsRun ' +
    'says — a broken pin must never silently become "unverified" instead of a reported mismatch')
  assert.strictEqual(m[0].leg, 'runtime',
    'the deciding leg for a broken green pin is the runtime leg, unaffected by the attribution ' +
    'field the red path now consults')
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

test('AC-20260815-06-6: the RED schema requires both legs of per-file evidence PLUS the assertionsRun attribution', () => {
  // The cross-check can only combine legs the agent is actually obliged to report.
  const start = src.indexOf('sentinels: {')
  const schema = src.slice(start, src.indexOf('summary: { type:', start))
  for (const field of ['typecheckRed', 'typecheckEvidence', 'assertionsRun']) {
    assert.ok(schema.includes(field), 'RED.sentinels must carry ' + field +
      ' — an agent that never sees the field in its schema has no reason to ever report it')
  }
  assert.match(schema, /required:\s*\[[^\]]*'typecheckRed'[^\]]*'typecheckEvidence'/,
    'the pre-existing dual-leg required fields must survive the schema extension unweakened')
  assert.match(schema, /required:\s*\[[^\]]*'assertionsRun'[^\]]*\]/,
    'assertionsRun must join the required list so an agent omitting it fails schema validation ' +
    'and re-emits, rather than silently defaulting to an attributed reading')
})
