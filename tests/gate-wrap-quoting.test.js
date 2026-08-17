'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// INTAKE JJ-20260817-02 — logged during the review of
// specs/20260816/01-gate-baseline-reconcile.md (2026-08-17).
//
// D5 of that spec fixed the gate wrap form's regression-vs-sanctioned-pin blindness, but left the
// wrap form itself carrying two independent shell hazards, both stated identically at build.md's
// Phase 0 step 3, review.md's gate leg, and review.md's fix->re-review re-run:
//   `node "$(spec-paths suite-baseline)" --gate "<resolved gateCommand>" --root {root}`
// (a) `{root}` is UNQUOTED — a host whose repo path contains a space produces a broken command at
//     every one of those sites.
// (b) `$(spec-paths suite-baseline)` is an unexpanded command substitution embedded directly in
//     the string that becomes `args.gate.command` for the wf-build/wf-design workflow gate agent,
//     making that agent's PATH resolution of `spec-paths` load-bearing for the first time. Both
//     build.md and review.md already state the house fix for exactly this hazard elsewhere ("run
//     `spec-paths X` once and keep the printed absolute path") — the wrap form departs from it.
//
// Both pins are LOOSE: they assert the doctrine states the obligation (quote the root argument;
// resolve suite-baseline's own path once to an absolute path rather than embedding it inline),
// never the exact remedy wording, so the fix spec keeps its design freedom. EXPECTED RED until
// that spec lands.

const build = read('spec/commands/build.md')
const review = read('spec/commands/review.md')

// Anchored on the literal `--gate "<resolved gateCommand>" --root <token>` shape, which is
// specific to the gate wrap form under discussion (not the many OTHER unquoted `--root {root}`
// invocations elsewhere in these files for scope-reconcile/ci-query/ac-matrix/etc, which this
// finding does not cover).
function unquotedGateWrapRootSites(src) {
  const re = /--gate "<resolved gateCommand>" --root ([^\s`]+)/g
  const bad = []
  let m
  while ((m = re.exec(src))) {
    if (!m[1].startsWith('"')) bad.push(m[0])
  }
  return bad
}

test('JJ-20260817-02: the gate wrap invocation quotes its root argument at every gate-resolution site, so a repo path containing a space does not break the wrapped command', () => {
  const bad = [...unquotedGateWrapRootSites(build), ...unquotedGateWrapRootSites(review)]
  assert.strictEqual(bad.length, 0,
    'build.md and review.md still write the gate wrap invocation with a bare, unquoted `--root {root}` ' +
    'at every gate-resolution site (build Phase 0, review\'s gate leg, review\'s fix->re-review re-run) — ' +
    'a host whose repo path contains a space breaks the wrapped `node "$(spec-paths suite-baseline)" ' +
    '--gate ... --root ...` command at each of them: ' + JSON.stringify(bad))
})

// Anchored on every mention of `suite-baseline` (not just the `--gate` wrap sites), since the fix
// this pin wants may state the resolve-once obligation once, generally, the same way build.md's
// Setup already does for wf-build/wf-review's scriptPath ("run `spec-paths X` once and keep the
// printed absolute path") rather than repeating it at each of the three wrap occurrences.
function hasResolveOnceObligationNearSuiteBaseline(src) {
  const mentionRe = /suite-baseline/g
  const obligationRe = /(printed absolute path|resolve[a-z]*\s+(?:it\s+)?once|already[- ]resolved absolute path)/i
  let m
  while ((m = mentionRe.exec(src))) {
    const window = src.slice(Math.max(0, m.index - 400), m.index + 400)
    if (obligationRe.test(window)) return true
  }
  return false
}

test('JJ-20260817-02: the wrapped command handed to the workflow gate (args.gate.command) carries an already-resolved absolute wrapper path, not an inline `$(spec-paths suite-baseline)` command substitution', () => {
  assert.ok(hasResolveOnceObligationNearSuiteBaseline(build),
    'build.md embeds `$(spec-paths suite-baseline)` directly in the string that becomes ' +
    '`args.gate.command` for the wf-build workflow gate agent (Phase 0 step 3), making that agent\'s ' +
    'PATH resolution of `spec-paths` load-bearing for the first time, with none of the "run `spec-paths ' +
    'X` once and keep the printed absolute path" discipline build.md already applies to wf-build/wf-review ' +
    'nearby suite-baseline mentions')
  assert.ok(hasResolveOnceObligationNearSuiteBaseline(review),
    'review.md embeds `$(spec-paths suite-baseline)` directly in the string that becomes ' +
    '`args.gate.command` for the wf-review-driven gate leg and its fix->re-review re-run, with none ' +
    'of the "run `spec-paths X` once and keep the printed absolute path" discipline review.md already ' +
    'applies to wf-review nearby suite-baseline mentions')
})
