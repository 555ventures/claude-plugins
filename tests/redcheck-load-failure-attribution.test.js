'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { read, evalFns } = require('./helpers')

// HEARWELL-20260814-01 (hearwell brief 2026-08-14, spec 20260813/01 review 2026-08-13):
// wf-build's TDD red-check validates a new test by "fails on current code, passes after". When a
// spec's first act is introducing a new export — the overwhelmingly common case, and exactly when
// a spec is most likely to be pinning something new — importing it makes the ENTIRE test file fail
// to LOAD. Every assertion in that file then clears the red bar vacuously, because the file was
// never executed at all. Measured on that host: deleting the six words implementing the spec's
// headline guarantee left 9/9 worker tests green through a 2-reviewer CLEAN panel.
//
// crossCheckSentinels() reads a binary AUDIT_RED:<path> / AUDIT_GREEN:<path> sentinel. Module
// resolution failure and a failing assertion are the SAME observation to it, so the probe that
// exists to prove a pin is falsifiable cannot tell "this assertion fails" from "this file does not
// load" — and the second one proves nothing.
//
// Fix contract: the red observation must be attributed. A red file that executed ZERO assertions
// did not demonstrate anything; it fails CLOSED as unverified, exactly as every other uncertain
// path in this function already does (`not-collected`, malformed sentinel, unattributed
// typecheckRed). The discriminator must stay runner-agnostic — "did any assertion in this file
// actually run" is answerable on every runner; parsing vitest/jest/go-test output is not.
//
// Composes with, does not replace: UPWELL-20260718-01 (paths collect zero files),
// HEARWELL-20260804-02 (unregistered package → not-collected), PRAX-20260726-01 (sanctioned-green
// carriers). Those cover a file that never RAN; this covers a file that ran and proved nothing.

const src = read(path.join('spec', 'workflows', 'src', 'wf-build.body.js'))
const { crossCheckSentinels } = evalFns(src, ['crossCheckSentinels'])

const P = 'src/lib/price-feed.test.ts'
const sentinel = (over) => ({
  path: P, sentinel: 'AUDIT_RED:' + P, typecheckRed: false, typecheckEvidence: '', ...over })

test('JJ-20260815-07: a red-expected carrier whose file failed to LOAD executed zero assertions and must fail closed as unverified, never count as a satisfied red', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'red' }],
    [sentinel({ assertionsRun: 0 })], true)
  assert.strictEqual(m.length, 1,
    'a file that is red because it never loaded has demonstrated nothing about the assertions ' +
    'inside it — accepting it as a satisfied red is what let a spec\'s headline guarantee be ' +
    'deleted with every test still green through a CLEAN review panel')
  assert.strictEqual(m[0].observed, 'not-collected',
    'the unverified path is the existing fail-closed shape in this function, not a new verdict ' +
    'word — an unattributable red resolves the same way a malformed sentinel already does')
})

test('JJ-20260815-07: a red-expected carrier whose assertions actually ran and failed still matches, so the fix does not break ordinary TDD red', () => {
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel({ assertionsRun: 3 })], true), [],
    'the ordinary red-first case — the file loads, its assertions execute, one fails — is the ' +
    'entire point of the probe; a discriminator that also rejects this has broken TDD rather ' +
    'than hardened it')
})

test('JJ-20260815-07: a sentinel omitting the assertion attribution entirely fails closed rather than being read as attributed', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel()], true)
  assert.strictEqual(m.length, 1,
    'an agent that does not report the attribution must not thereby get the permissive answer — ' +
    'silence reading as "assertions ran" reinstates the exact hole, and every other uncertain ' +
    'path in this function already fails closed')
  assert.strictEqual(m[0].observed, 'not-collected',
    'an absent attribution is an uncertain observation, so it takes the same unverified exit as ' +
    'a malformed sentinel — never a silent downgrade to a satisfied expectation')
})
