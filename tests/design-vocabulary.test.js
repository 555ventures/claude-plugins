'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// specs/20260810/01-design-path-model-placement.md — the registry-weighted-canon half of the
// 2026-08-10 model-placement ruling: (D5) wf-design workers are grounded in the component
// vocabulary the same way tokenPaths ground them today; (D4/D3) genesis seeds the vocabulary
// and validates it fail-closed at commit; (D8) the atlas gap sweep adopts the sketch ruling's
// sequential-dispatch contract, recorded once in shared § Design Atlas; (D7) review's
// component-manifest check treats commitment entries as first-class. Pinned here BEFORE any
// of the doctrine/workflow-source edits land (TDD red phase) — source-shape + doctrine regex
// pins per host convention.

// Pull the body of one `## Heading` section out of a doctrine file (up to the next `## `).
function section(src, heading) {
  const re = new RegExp('(?:^|\\n)## ' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b[\\s\\S]*?(?=\\n## |$)')
  const m = re.exec(src)
  return m ? m[0] : ''
}

// ---- AC-20260810-01-8: wf-design.body.js source-shape pins (D5) ---------------------------------

test('AC-20260810-01-8: wf-design.body.js args contract comment names componentManifestPath', () => {
  const src = read('spec/workflows/src/wf-design.body.js')
  assert.match(src, /componentManifestPath:\s*string/,
    'the args contract comment must document componentManifestPath (D5) so a session copying the ' +
    'field list from this source never omits registry grounding from a wf-design invocation')
})

test('AC-20260810-01-8: wf-design.body.js Design-canon block makes a boundaries contradiction a blocked fork, gated on a non-empty path', () => {
  const src = read('spec/workflows/src/wf-design.body.js')
  assert.match(src, /componentManifestPath/,
    'the worker-side Design-canon rules must reference componentManifestPath — the grounding is worker-side per D5, not just a driver preflight advisory')
  assert.match(src, /boundaries/i,
    'the Design-canon block must name `boundaries` as binding canon the same way token values are — the vocabulary joins the grounding set exactly the way tokenPaths do')
  assert.match(src, /componentManifestPath\s*\?/,
    'the manifest-grounding line must be present ONLY when componentManifestPath is non-empty (conditional template, mirroring the existing DOCTRINE_DOC/TOKEN_PATHS conditionals) — an always-on line would fire for hosts with no registry')
})

// ---- AC-20260810-01-9: doctrine states vocabulary seeding + sequential-dispatch ruling -----------

test('AC-20260810-01-9: genesis-design.md Phase 4.3 seeds the component vocabulary (commitment entries with boundaries)', () => {
  const src = read('spec/commands/genesis-design.md')
  assert.match(src, /vocabulary/i,
    'Phase 4.3 must document seeding the component vocabulary (D4) — the building blocks the winner\'s material commits the product to, beyond the base primitives already seeded there')
  assert.match(src, /boundaries/i,
    'the vocabulary-seeding text must name the `boundaries` field carried by commitment entries (D1/D2)')
})

test('AC-20260810-01-9: genesis-design.md Phase 4.5 commit step runs components-check fail-closed', () => {
  const src = read('spec/commands/genesis-design.md')
  assert.match(src, /components-check/,
    'the commit step (before rules-locked) must run components-check fail-closed (D3) — genesis validates a file it just wrote in a greenfield repo, so a malformed manifest must block the commit, not slip through to the first /spec:design run')
})

test('AC-20260810-01-9: shared.md § Design Atlas records the sequential-dispatch sweep ruling as the single doctrine home', () => {
  const src = read('spec/doctrine/shared.md')
  const sec = section(src, 'Design Atlas')
  assert.ok(sec, '§ Design Atlas heading must exist in shared.md')
  assert.match(sec, /sequential/i,
    'shared § Design Atlas must record the sequential-dispatch ruling (D8) — the atlas gap sweep retires parallel per-surface dispatch, and this is the one doctrine home a future sketch.md touch can pointer to')
  assert.doesNotMatch(sec, /parallel[- ]?dispatch/i,
    'the section must NOT retain "parallel dispatch" language for the sweep — the ruling replaces it, it does not sit alongside it')
})

test('AC-20260810-01-9: atlas.md sweep section adopts sequential dispatch with exemplar grounding and drops "Parallel dispatch"', () => {
  const src = read('spec/commands/atlas.md')
  assert.doesNotMatch(src, /Parallel dispatch/,
    'atlas.md\'s gap-sweep section must not say "Parallel dispatch" any more — D8 retires parallel per-surface dispatch for the greenfield full sweep, the exact surface where cross-screen coherence matters most')
  assert.match(src, /sequential/i,
    'atlas.md must say the sweep now runs as one sequential Sonnet dispatch (chained past ~10 surfaces)')
  assert.match(src, /exemplar/i,
    'atlas.md must name exemplar grounding — existing mocks (ratified/approved first, then this sweep\'s own earlier output) cited so late surfaces match early chrome')
})

// ---- AC-20260810-01-10: boundaries field + commitment entries are first-class -------------------

test('AC-20260810-01-10: shared.md § Design Authoring Contracts defines the boundaries field and commitment entries', () => {
  const src = read('spec/doctrine/shared.md')
  const sec = section(src, 'Design Authoring Contracts')
  assert.ok(sec, '§ Design Authoring Contracts heading must exist in shared.md')
  assert.match(sec, /boundaries/,
    'the component-manifest paragraph must define the `boundaries` field (D1/D2) alongside name/purpose/props/mockRefs')
  assert.match(sec, /commitment/i,
    'the component-manifest paragraph must define commitment entries — vocabulary rows genesis seeds ahead of any binding map, distinguished structurally by absent props/mockRefs (D1)')
})

test('AC-20260810-01-10: review.md includes commitment entries in the component-manifest near-duplicate comparison', () => {
  const src = read('spec/commands/review.md')
  assert.match(src, /commitment/i,
    'the component-manifest leg must treat commitment entries as first-class in the near-duplicate comparison (D7) — otherwise the vocabulary exerts no anti-duplication pressure and authoring a lookalike of a committed block goes unflagged')
})
