'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, runBash } = require('./helpers')

// specs/20260810/02-terminal-observable-acs.md (2026-08-10): the pipeline's dominant escape
// family is DEAD SURFACES — code that typechecks/lints/tests green but never executes or
// renders nothing (~14 recorded instances; 4 in one UpWell build on 2026-08-10). Root cause:
// every escape had a green terminal fed a hand-authored (invented) fixture, and the pure-UI
// TDD exemption handed the terminal to the catalog, which cannot fail. This spec makes
// liveness executable: every Decision promising an observable owes a terminal-observable AC
// whose fixture is PRODUCED by the spec's own producer chain (never invented); the pure-UI
// exemption is narrowed to appearance-only at all four of its homes; the lock audit and the
// mid-build ruling duty are extended to match. Pins AC-20260810-02-1 … -6.

const plan = read('spec/commands/plan.md')
const buildDoc = read('spec/commands/build.md')
const templateSpec = read('spec/templates/spec.md')
const sharedDoc = read('spec/doctrine/shared.md')
const initDoc = read('spec/commands/init.md')
const ledger = read('spec/doctrine/scaffold-ledger.md')

function between(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start !== -1, `marker "${startMarker}" not found — doctrine section moved or was renamed`)
  const rest = src.slice(start)
  if (!endMarker) return rest
  const endRel = rest.indexOf(endMarker, startMarker.length)
  return endRel === -1 ? rest : rest.slice(0, endRel)
}

// AC-20260810-02-1: plan.md Phase 2 must state the terminal-observable AC rule for EVERY
// Decision promising a user-observable surface (not just cross-file Decisions), with the
// assertion reached through the real in-repo route.
test('AC-20260810-02-1: plan.md Phase 2 states the terminal-observable AC rule for every Decision promising an observable', () => {
  const phase2 = between(plan, '## Phase 2', '## Phase 3')
  assert.match(phase2, /every Decision (that promises|promising) a user-observable surface|Decision that promises a user-observable surface/i,
    'Phase 2 must scope the terminal-observable AC rule to every Decision promising a ' +
    'user-observable surface, not only Decisions whose data path spans multiple File Plan ' +
    'rows — narrower scoping lets a single-file dead surface (D21/D22\'s class) escape the rule')
  assert.match(phase2, /real in-repo route/i,
    'Phase 2 must require the AC\'s assertion to be reached through the real in-repo route — ' +
    'without this phrase a mocked or stubbed hop between producer and terminal still satisfies ' +
    'the rule as written')
})

// AC-20260810-02-2: plan.md and templates/spec.md must name the produced-fixture requirement
// and the literal anti-pattern phrase "invented-fixture liveness".
test('AC-20260810-02-2: plan.md and templates/spec.md name produced-fixture provenance and the invented-fixture liveness anti-pattern', () => {
  assert.match(plan, /invented-fixture liveness/,
    'plan.md must name the anti-pattern literally as "invented-fixture liveness" — a ' +
    'paraphrase is not machine-greppable and future refuters/authors will miss the named class')
  assert.match(templateSpec, /invented-fixture liveness/,
    'templates/spec.md\'s AC comment must also carry the literal phrase — every spec authored ' +
    'from this template inherits the anti-pattern name, or new specs never see it')
  assert.match(plan, /produced.{0,40}(fixture|by the spec's own producer chain)|fixture.{0,20}is produced/i,
    'plan.md must require the fixture to be PRODUCED by the spec\'s own producer chain on ' +
    'realistic wire data, never hand-authored — this is the actual root-cause fix, not the ' +
    'terminal-observable framing alone')
})

// AC-20260810-02-3: all four pure-UI TDD exemption homes must scope the exemption to
// appearance and state reachability is never exempt. Asserted per file so a single
// un-narrowed home fails the test by name.
const CARVE_OUT = /reachability is\s+(never|not) exempt/i

test('AC-20260810-02-3: build.md:70-71 pure-UI exemption is narrowed — reachability is never exempt', () => {
  const anchor = 'gets no TDD tests'
  const idx = buildDoc.indexOf(anchor)
  assert.ok(idx !== -1, 'build.md\'s pure-UI exemption sentence moved — cannot locate it to check narrowing')
  const window = buildDoc.slice(idx, idx + 500)
  assert.match(window, CARVE_OUT,
    'build.md exempts pure-UI rendering from TDD with no reachability carve-out — a prop ' +
    'whose absence collapses a promised observable (D21/D22\'s class) reads as exempt appearance')
})

test('AC-20260810-02-3: templates/spec.md:84-86 AC-comment exemption is narrowed — reachability is never exempt', () => {
  const anchor = 'is exempt from TDD'
  const idx = templateSpec.indexOf(anchor)
  assert.ok(idx !== -1, 'templates/spec.md\'s pure-UI exemption sentence moved — cannot locate it to check narrowing')
  const window = templateSpec.slice(idx, idx + 500)
  assert.match(window, CARVE_OUT,
    'templates/spec.md\'s AC-section comment exempts pure-UI rendering with no reachability ' +
    'carve-out — every spec authored from this template inherits the un-narrowed exemption')
})

test('AC-20260810-02-3: shared.md § Design Canon exemption is narrowed — reachability is never exempt', () => {
  const anchor = "eyes gate UI"
  const idx = sharedDoc.indexOf(anchor)
  assert.ok(idx !== -1, 'shared.md\'s Design Canon exemption sentence moved — cannot locate it to check narrowing')
  const window = sharedDoc.slice(idx, idx + 500)
  assert.match(window, CARVE_OUT,
    'shared.md § Design Canon exempts UI rendering with no reachability carve-out — this ' +
    'section is served via shared-for to /spec:design, atlas, sketch, genesis-explore and ' +
    'genesis-design but NOT to plan/build, so leaving it unqualified lets the command that ' +
    'authors the catalog keep grounding on the un-narrowed framing (found by refutation)')
})

test('AC-20260810-02-3: init.md:303 Test Rules exemplar is narrowed — reachability is never exempt', () => {
  const anchor = 'what is exempt from TDD'
  const idx = initDoc.indexOf(anchor)
  assert.ok(idx !== -1, 'init.md\'s Test Rules exemplar sentence moved — cannot locate it to check narrowing')
  const window = initDoc.slice(idx, idx + 500)
  assert.match(window, CARVE_OUT,
    'init.md\'s Test Rules exemplar (the text every generated host\'s § Test Rules is drafted ' +
    'from) carries the uncarved exemption — every host bootstrapped after this spec reseeds ' +
    'the un-narrowed exemption into its own generated doctrine, and the fix never generalizes ' +
    'past this one repo')
})

// AC-20260810-02-4: plan.md Phase 4's lock audit extends the red-capable-AC trace to
// Decision-level observable promises, while CONTINUING to require the existing Goal-promise
// trace and the SHALL CONTINUE TO regression-pin check in the same step.
test('AC-20260810-02-4: plan.md Phase 4 lock audit covers Decision-level observable promises and continues the Goal-promise + regression-pin checks', () => {
  const phase4 = between(plan, '## Phase 4', null)
  assert.match(phase4, /Goal promise|promise in the Goal|every promise in.{0,10}Goal/i,
    'Phase 4 must SHALL CONTINUE TO require the existing Goal-promise trace — this AC checks ' +
    'the widened audit does not regress the mechanism JJ-20260720-01 already fixed')
  assert.match(phase4, /SHALL CONTINUE TO/,
    'Phase 4 must SHALL CONTINUE TO require the regression-pin check for defect-fix specs — ' +
    'this clause predates this spec and must survive the widening untouched')
  assert.match(phase4, /Decision(-level)? (that promises|promising) an observable|Decision-level observable promise/i,
    'Phase 4\'s lock audit must be widened from Goal-level promises to Decision-level ' +
    'observable promises — without this widening a Decision-only promise (D13\'s addendum-' +
    'style ruling) passes lock with no AC, exactly the escape class this spec closes')
})

// AC-20260810-02-5: build.md's blocked row requires a mid-build ruling that adds/changes an
// observable promise to add/update its terminal-observable AC in the same spec edit; plan.md's
// Phase 3 refuter prompt instructs refuters to treat a mocked in-repo hop as top-severity.
test('AC-20260810-02-5: build.md blocked row owes the AC in the same edit as the ruling, and plan.md refuters flag mocked in-repo hops as top-severity', () => {
  const blockedRowStart = buildDoc.indexOf('| `blocked` |')
  assert.ok(blockedRowStart !== -1, 'build.md Phase 2 blocked row not found — table restructured')
  const blockedRow = buildDoc.slice(blockedRowStart, blockedRowStart + 1200)
  assert.match(blockedRow, /terminal-observable AC/i,
    'build.md\'s blocked row must require a ruling that adds/changes an observable promise to ' +
    'add or update its terminal-observable AC — the Decisions that produced every escape\'s ' +
    'evidence (D13/D21/D22/D26) were added mid-build, where lock never runs again')
  assert.match(blockedRow, /same (spec )?edit/i,
    'the AC must be written in the SAME spec edit as the ruling prose — a deferred AC is an ' +
    'unrecorded promise, indistinguishable from the four measured escapes')

  const phase3 = between(plan, '## Phase 3', '## Phase 4')
  assert.match(phase3, /top-severity/i,
    'plan.md Phase 3\'s refuter prompt must instruct refuters to report a mocked/stubbed ' +
    'in-repo hop between producer and terminal as a top-severity finding')
  assert.match(phase3, /mocked or stubbed in-repo hop|mocked.{0,20}stubbed.{0,20}hop|hop between producer and terminal/i,
    'the refuter sentence must name the specific defect class — a mocked/stubbed hop between ' +
    'producer and terminal — or refuters have no falsifiable check to run')
})

// AC-20260810-02-6: scaffold-ledger.md carries a terminal-observable-ACs row (kind: gate)
// naming both retire conditions; verdict.js's REVIEW_LEGS and spec-paths's key set are
// unchanged (this spec ships no new script/mechanism — regression pins).
//
// specs/20260812/02-hotspot-audit.md AC-20260812-02-11 (2026-08-12): this key-set pin was
// already red at HEAD — missing `citations-check` (20260810/09 drift) — before hotspot-audit
// even lands its own `hotspot` key. This edit syncs the expected list to the true key set;
// red-to-green here is the AC's implementation, not a weakened assertion.
//
// AC-20260813-06-11 (specs/20260813/06-report-renderer.md, 2026-08-13): D1/D4 add
// spec/scripts/report-render.js behind a new `report-render` spec-paths key — like every
// other bundled script it needs one, or every command that resolves it fails silently
// (§ Risk Tiers, spec-paths). This deep-equal literal is the only place that key set is
// pinned, so the new key is added here rather than in a second, competing key-set test.
//
// AC-20260814-01-8 (specs/20260814/01-ac-matrix-script.md, 2026-08-14): D1 registers
// spec/scripts/ac-matrix.js behind a new `ac-matrix` spec-paths key — like every other
// bundled script it needs one, or the review workflow's invocation of it fails silently
// (§ Risk Tiers, spec-paths). This deep-equal literal is the only place that key set is
// pinned, so the new key is added here rather than in a second, competing key-set test.
//
// AC-20260814-02-11 (specs/20260814/02-doctor-mergeback-fidelity-mechanics.md, 2026-08-14,
// amended during 20260814/05's plan-time collision sweep): D1 registers
// spec/scripts/ci-gate-parity.js behind a new `ci-gate-parity` spec-paths key — the same
// silent-failure risk as every other bundled script (§ Risk Tiers, spec-paths). This closed
// deep-equal is the only place that key set is pinned, so the key change reddens this test by
// construction, from outside 02's own File Plan and outside its scoped gate — added here
// rather than left to surface as a mid-build out-of-plan patch.
//
// AC-20260814-03-13 (specs/20260814/03-suite-baseline.md, 2026-08-15, amended same session —
// D1's second amendment, the plan-time paths sweep): D1 registers
// spec/scripts/suite-baseline.js behind a new `suite-baseline` spec-paths key — same
// silent-failure risk as every bundled script, same closed deep-equal, same by-construction
// collision from outside this spec's own File Plan and scoped gate.
test('AC-20260810-02-6, AC-20260814-02-11, AC-20260814-03-13: scaffold-ledger.md gains a gate-kind terminal-observable-ACs row, and verdict.js/spec-paths stay unchanged apart from the registered ci-gate-parity and suite-baseline keys', () => {
  const rowStart = ledger.search(/\| ?Terminal-observable/i)
  assert.notStrictEqual(rowStart, -1,
    'scaffold-ledger.md has no Terminal-observable-ACs row — a new gate mechanism with no ' +
    'ledger row carrying a promote/retire condition is a hard review finding per this repo\'s ' +
    'own Review Checks')
  const row = rowStart === -1 ? '' : ledger.slice(rowStart, ledger.indexOf('\n', rowStart) === -1
    ? ledger.length
    : ledger.indexOf('\n', rowStart))
  assert.match(row, /\|\s*gate\s*\|/i,
    'the terminal-observable-ACs row must be Kind "gate" — this is an enforced authoring ' +
    'rule riding existing gates (AC-matrix, red-check, skip-reconcile), not merely advisory')
  assert.match(row, /fixture-provenance/i,
    'the row\'s promote/retire cell must name the fixture-provenance clause\'s own retire ' +
    'condition (two quarters of zero invented-fixture findings)')
  assert.match(row, /whole rule|dead-surface class/i,
    'the row\'s promote/retire cell must separately name the whole-rule retire condition ' +
    '(two quarters of zero dead-surface escapes) — conflating the two conditions loses the ' +
    'finer-grained retirement this spec\'s Decisions table locks')

  // Regression pins (D8: no new script, no new mechanism touching these two surfaces).
  const verdictSrc = read('spec/scripts/verdict.js')
  assert.match(verdictSrc, /const REVIEW_LEGS = \['gate', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci'\]/,
    'verdict.js\'s REVIEW_LEGS SHALL CONTINUE TO expose exactly this six-leg array unchanged — ' +
    'this spec adds no review leg (D8); a changed array means a mechanism crept into the ' +
    'wrong file')
  const keysOut = runBash('bin/spec-paths', ['root']).stdout
  assert.ok(keysOut.trim().length > 0, 'spec-paths root must resolve for the key-set check below to be meaningful')
  const specPathsSrc = read('spec/bin/spec-paths')
  const keys = [...specPathsSrc.matchAll(/^ {2}([a-z0-9-]+)\)/gm)].map(m => m[1]).sort()
  const expected = ['ac-matrix', 'ci-gate-parity', 'ci-query', 'citations-check', 'claims-lint', 'components-check',
    'contract', 'contract-hash', 'dc-extract', 'design-atlas', 'design-driver', 'feedback-template',
    'fidelity-check', 'hotspot', 'intake', 'manifest-check', 'merge-back', 'observe-ci',
    'parity-check', 'report-render', 'root', 'scaffold-ledger', 'scope-reconcile', 'shared',
    'shared-for', 'shared-genesis', 'skeletons-check', 'smoke', 'spec-status', 'suite-baseline',
    'template', 'templates', 'verdict', 'version', 'wf-build', 'wf-design', 'wf-enforce', 'wf-panel',
    'wf-research', 'wf-review', 'workflows'].sort()
  assert.deepStrictEqual(keys, expected,
    'spec/bin/spec-paths\'s key set (AC-20260812-02-11, AC-20260813-06-11, AC-20260814-01-8, ' +
    'AC-20260814-02-11, AC-20260814-03-13) must be exactly the true set scraped from the live ' +
    'case statement, including the pre-existing citations-check key (20260810/09 drift), ' +
    'hotspot-audit\'s hotspot key, report-renderer\'s report-render key, ac-matrix-script\'s ' +
    'ac-matrix key, 20260814/02\'s ci-gate-parity key, and this spec\'s new suite-baseline key — ' +
    'a mismatch means a key silently drifted or a script shipped unregistered')
})
