'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, extractFn } = require('../helpers')

// specs/20260813/05-workflow-correctness-repairs.md D3/D7/D10 (AC-20260813-05-4, -5, -11, -13).
// Today wf-review.body.js's reviewerPrompt(i) renders ONLY `EMPHASES[i]` as its per-seat content
// — the AC↔test coverage requirement and the DRIFT_NOTE semantic-backstop text live solely inside
// EMPHASES[1], which is unreachable on every single-reviewer panel (fix-delta always 1, full scope
// usually 1 — the majority path). D3 appends that coverage block to EVERY reviewer prompt
// unconditionally, while EMPHASES stays a 2-element array of pure *framings* (AC-5 pins that the
// framing difference survives the extraction — a regression pin, already true and meant to stay
// true, per the spec's own Rationale). D7 fixes the verifier's git rule (git log was disallowed
// even though the verifier's own step 1 mandates `git log -1`) and downgrades its cleanup clause
// from a guarantee to best-effort. D10 gives review.md's gate leg the same {testDirs} placeholder
// resolution build.md's gate leg already performs.

const src = read('spec/workflows/src/wf-review.body.js')

test('AC-20260813-05-4: reviewerPrompt renders the AC-coverage requirement and drift-note text unconditionally, not only for seat 1', () => {
  // Extracting the function's own source text (not the EMPHASES array elsewhere in the file)
  // is the point: today the coverage block lives in EMPHASES[1], a SEPARATE top-level const —
  // reviewerPrompt's own body only interpolates `${EMPHASES[i]}`, so this literal text is
  // reachable from the function source only once D3 moves it into the shared prompt body.
  const fn = extractFn(src, 'reviewerPrompt')
  assert.match(fn, /every AC covered by a real test/,
    'the AC↔test coverage requirement must be part of every reviewer prompt (not gated behind ' +
    'seat index 1) — on a single-reviewer panel (the majority path: fix-delta always 1, full ' +
    'scope usually 1) EMPHASES[1] never renders today, so this check silently never fires')
  assert.match(fn, /semantic backstop/,
    'the DRIFT_NOTE "semantic backstop" text (hasDriftScript: false) must reach every reviewer ' +
    'prompt, not only the seat-1 framing that a single-reviewer panel never selects')
})

test('AC-20260813-05-5: reviewerPrompt CONTINUES to carry two distinct primary-framing lines (design integrity vs rule compliance) — regression pin, already true and meant to survive the D3 extraction', () => {
  const start = src.indexOf('const EMPHASES = [')
  assert.ok(start !== -1, 'EMPHASES array missing from wf-review source')
  const end = src.indexOf('\n]\n', start)
  const block = src.slice(start, end)
  assert.match(block, /Primary emphasis: design integrity/,
    'seat 0\'s framing line (design integrity vs duct tape / spec drift) must survive the D3 ' +
    'extraction — losing it collapses the two-seat panel to one framing')
  assert.match(block, /Primary emphasis: rule compliance and correctness/,
    'seat 1\'s framing line (rule compliance / File Plan / Contracts / wiring) must survive the ' +
    'D3 extraction as a framing distinct from seat 0, even after its coverage-block content ' +
    'moves into the shared prompt body')
})

test('AC-20260813-05-11: the verifier prompt permits git log alongside git status and downgrades cleanup to best-effort', () => {
  const fn = extractFn(src, 'verifyPrompt')
  assert.match(fn, /other than status and log/,
    'the closing rule must read "never run git commands other than status and log" — the ' +
    'verifier\'s own step 1 mandates `git log -1` (the stale-worktree sanity check), so the ' +
    'current "other than status" rule makes a compliant verifier refuse its own mandated check, ' +
    'producing false MISCITED kills')
  assert.match(fn, /best-effort/,
    'the cleanup clause must downgrade from a guaranteed "MANDATORY and unconditional" delete-and-' +
    'verify to best-effort — the porcelain close sweep (spec 20260813/01 D5) is the real guarantee, ' +
    'and the current unconditional promise is not honorable by a verifier avoiding all git except status')
})

test('AC-20260813-05-13: review.md\'s gate leg resolves {testDirs} to the glob form before running, or names it unavailable when unresolvable', () => {
  const doc = read('spec/commands/review.md')
  const anchor = "the host's `gateCommand`"
  const start = doc.indexOf(anchor)
  assert.ok(start !== -1, 'review.md must still name the host gateCommand as the deterministic gate leg')
  // Slice to the next bullet in the same list (the boot smoke leg) — the gate-leg bullet's own text.
  const end = doc.indexOf('boot smoke leg', start)
  const gateLegText = doc.slice(start, end === -1 ? start + 600 : end)
  assert.match(gateLegText, /\{testDirs\}/,
    'review.md\'s gate-leg step must name the {testDirs} placeholder it resolves before running the ' +
    'leg — today it runs the raw gateCommand with zero substitution, so any {testDirs}-composing ' +
    'host gets an unconditional red on every review')
  assert.match(gateLegText, /unavailable/,
    'an unresolvable placeholder must make the leg "unavailable" (naming the token), never a raw ' +
    'execution against literal placeholder text')
})
