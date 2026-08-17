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

test('AC-20260815-06-1: a red-expected carrier whose file failed to LOAD executed zero assertions and must fail closed as unverified, never count as a satisfied red', () => {
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

test('AC-20260815-06-2: a red-expected carrier whose assertions actually ran and failed still matches, so the fix does not break ordinary TDD red', () => {
  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel({ assertionsRun: 3 })], true), [],
    'the ordinary red-first case — the file loads, its assertions execute, one fails — is the ' +
    'entire point of the probe; a discriminator that also rejects this has broken TDD rather ' +
    'than hardened it')
})

test('AC-20260815-06-3: a sentinel omitting the assertion attribution entirely fails closed rather than being read as attributed', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'red' }], [sentinel()], true)
  assert.strictEqual(m.length, 1,
    'an agent that does not report the attribution must not thereby get the permissive answer — ' +
    'silence reading as "assertions ran" reinstates the exact hole, and every other uncertain ' +
    'path in this function already fails closed')
  assert.strictEqual(m[0].observed, 'not-collected',
    'an absent attribution is an uncertain observation, so it takes the same unverified exit as ' +
    'a malformed sentinel — never a silent downgrade to a satisfied expectation')
})

// 2026-08-15 spec 06, D3 (the typed-host escape route): the intake carrier alone fixes untyped
// hosts while leaving every TS host vacuously satisfiable through the typecheck leg — TS2307
// names the importing file, which is exactly the attribution the pre-D3 check demands. A
// resolution-shaped diagnostic (missing module OR missing export) must fail closed instead of
// satisfying red, while a genuinely NON-resolution typecheck red keeps satisfying red alone
// under D2's OR-composition even when the same sentinel's runtime leg is unattributed.
const RESOLUTION_DIAG = P + "(5,32): error TS2307: Cannot find module '@/lib/price-feed'."
const NONRESOLUTION_DIAG = P + "(5,32): error TS2344: Type 'string' does not satisfy the constraint 'Feed'."
const MISSING_EXPORT_DIAG = P + "(3,10): error TS2305: Module '\"#/lib/logger\"' has no exported member 'truncateForLog'."

test('AC-20260815-06-7: resolution-shaped typecheck evidence never satisfies red, but an attributed non-resolution typecheck red still satisfies red alone even beside unattributed runtime red', () => {
  const resolutionOnly = crossCheckSentinels([{ path: P, expect: 'red' }],
    [sentinel({ sentinel: 'AUDIT_GREEN:' + P, typecheckRed: true, typecheckEvidence: RESOLUTION_DIAG })], true)
  assert.strictEqual(resolutionOnly.length, 1,
    'a missing-module diagnostic names the importing file exactly like a genuine type-level red ' +
    'does — accepting it as satisfied red walks the vacuous load-failure class back in through ' +
    'the typecheck leg, the same door D1-D3 close on the runtime leg')
  assert.strictEqual(resolutionOnly[0].observed, 'not-collected',
    'a resolution-shaped typecheck red is exactly as unverified as an unattributed runtime red — ' +
    'it must take the same fail-closed exit, not a silent satisfied-red pass-through')
  assert.match(resolutionOnly[0].detail, /stub/i,
    'the fail-closed detail must point the agent at the D4 stub re-probe remedy, or an operator ' +
    'reading the mismatch has no route to demonstrate a genuine red')

  assert.deepStrictEqual(
    crossCheckSentinels([{ path: P, expect: 'red' }],
      [sentinel({ sentinel: 'AUDIT_RED:' + P, assertionsRun: 0, typecheckRed: true, typecheckEvidence: NONRESOLUTION_DIAG })], true),
    [],
    'D2 composes legs by OR: an attributed non-resolution typecheck red proves the file is ' +
    'genuinely red on its own — it must not be dragged down to not-collected merely because the ' +
    'SAME sentinel\'s runtime leg happens to be unattributed AUDIT_RED')
})

test('AC-20260815-06-10: a missing-export typecheck diagnostic (TS2305) is resolution-shaped exactly like a missing-module one and must also fail closed rather than satisfy red', () => {
  const m = crossCheckSentinels([{ path: P, expect: 'red' }],
    [sentinel({ sentinel: 'AUDIT_GREEN:' + P, typecheckRed: true, typecheckEvidence: MISSING_EXPORT_DIAG })], true)
  assert.strictEqual(m.length, 1,
    'a spec\'s first act is more often adding an export to an existing module than adding a whole ' +
    'module — the TS2305 shape is the COMMONER half of the vacuous class D3 exists to close, not ' +
    'an edge case that can be left open')
  assert.strictEqual(m[0].observed, 'not-collected',
    'without the D3 amendment, TS2305 evidence names the file just as validly as TS2307 does and ' +
    'walks the vacuous class back in through the door D3 was supposed to close')
  assert.match(m[0].detail, /stub/i,
    'the fail-closed detail must name the D4 stub re-probe remedy for the missing-export shape ' +
    'exactly as it does for the missing-module shape')
})

// D4/D5 (2026-08-15 spec 06): the RED dispatch prompt is the agent-facing copy the probe reads
// at runtime — the most dangerous of the three sanction loci, because it is not pure code but a
// live instruction the agent follows literally. It must teach assertionsRun attribution and the
// stub-then-delete demonstration route, and must never again tell the probe that a test
// "importing a module the implementation has not created yet" can never be runtime-red.
const wfSrc = src
const redCheckStart = wfSrc.indexOf("phase('RedCheck')")
const redPrompt = wfSrc.slice(redCheckStart, wfSrc.indexOf('FAIL CLOSED', redCheckStart))
const schemaRegion = wfSrc.slice(wfSrc.indexOf('const RED = {'), redCheckStart)
const buildMd = read(path.join('spec', 'commands', 'build.md'))
const RETIRED_SANCTION = /importing a module the implementation has (not created yet|yet to create)/i

test('AC-20260815-06-8: the live RED dispatch prompt instructs assertionsRun attribution and the stub-re-probe-then-delete protocol, and its no-edit sentence carries the stub exception rather than forbidding it', () => {
  assert.match(redPrompt, /assertionsRun/,
    'the probe agent that just ran the file is the only party who can honestly answer "did any ' +
    'assertion execute" — without this instruction in the live prompt, the agent has no reason ' +
    'to ever report the field the schema now requires')
  assert.match(redPrompt, /stub/i,
    'the demonstration route for a load-blocked red-expected file is the inert stub protocol — ' +
    'the prompt must teach it, since D4 is agent behavior with no other pin surface')
  assert.doesNotMatch(redPrompt, /Do not edit any file\./,
    'the unqualified "Do not edit any file." sentence directly forbids the stub protocol this ' +
    'same prompt is supposed to authorize — a self-contradictory prompt leaves the agent unable ' +
    'to follow either instruction faithfully')
  assert.match(redPrompt, /Do not edit any file, with exactly one exception/i,
    'the no-edit rule must carry the stub-protocol exception in the SAME sentence, or the ' +
    'blanket prohibition and the stub instruction remain in direct conflict')
})

test('AC-20260815-06-9: the retired "importing a module the implementation has not created yet" sanction is gone from all three loci — the schema comment, the live RED prompt, and build.md — and build.md\'s fast path names the load-red stub discipline', () => {
  assert.doesNotMatch(schemaRegion, RETIRED_SANCTION,
    'the RED.sentinels schema comment (~line 231) is the first of three loci that sanctioned a ' +
    'load-blocked carrier as "can never be runtime-red" — that example WAS the incident class, ' +
    'so it must not survive the fix')
  assert.doesNotMatch(redPrompt, RETIRED_SANCTION,
    'the live RED prompt string (~line 454) is the agent-facing copy the probe reads at runtime ' +
    '— leaving the retired sanction here leaves the hole fully open no matter what the pure ' +
    'crossCheckSentinels function refuses')
  assert.doesNotMatch(buildMd, RETIRED_SANCTION,
    'build.md\'s tdd-red-check row restates the same retired example — doctrine text still ' +
    'sanctioning the vacuous class defeats the point of hardening the mechanism that enforces it')
  const fastPathStart = buildMd.indexOf('**Fast path (no workflow).**')
  const fastPathStep1 = buildMd.slice(fastPathStart, buildMd.indexOf('2. Dispatch the implementation batch', fastPathStart))
  assert.match(fastPathStep1, /stub/i,
    'the fast path has no workflow prompt to inherit the stub discipline from — the orchestrator ' +
    'runs the probe itself, so build.md must state the same stub/re-run/clean discipline by hand')
})

test('AC-20260815-06-11: build.md\'s tdd-red-check row scopes "strictly redder than red" to collection-level absence and states a load-shaped not-collected never proceeds on the spec\'s authority', () => {
  const rowStart = buildMd.indexOf('| `tdd-red-check` |')
  const row = buildMd.slice(rowStart, buildMd.indexOf('| `out-of-scope-failure` |'))
  assert.match(row, /strictly redder than red/,
    'the pre-existing pinned literal must survive verbatim — this is a scoping addition, not a ' +
    'rewrite of the clause tests/redcheck-new-package.test.js already pins')
  assert.match(row, /the spec itself creates/,
    'the second pinned literal must also survive verbatim for the same reason')
  assert.match(row, /(load|loaded)[\s\S]{0,300}(never|not)[\s\S]{0,80}(proceed|authority)/i,
    'without an explicit boundary sentence, the pre-existing "strictly redder than red" ' +
    'pass-through silently re-swallows D2\'s fail-closed not-collected result for a file that ' +
    'was collected and attempted but failed to LOAD — precisely the vacuous class this spec closes')
})
