'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns } = require('../helpers')

// specs/20260813/06-report-renderer.md (2026-08-13): the report skeleton (spec 06's other pin,
// tests/report/report-render.test.js) is only as good as the data workflows hand it. The audit
// found the console report starved of the fields it needed: findings surfaced jargon instead of
// plain-English impact (E4), degraded runs (fewer proposers, a failed currency verifier, a
// thinned reviewer panel) went silent (E9), and the report's provenance id was never pinned
// (E11). This file pins the six workflow bodies' return-schema/assembly deltas (D5-D9) by
// source-shape regex and by executing wf-panel's proposal-survival guard directly.
//
// specs/20260813/06a-return-envelope-corrections.md (2026-08-14, D3): a post-build consult
// refuted spec 06's D9 `runId` echo (every envelope's `runId` evaluates to `undefined` — no
// orchestrator ever passes `args.runId` in) and found the GATE-schema loosening applied to
// wf-build only, silently forking the twin gate schemas. Per D3(a)-(c): the AC-06-6 review.md
// pin becomes a whole-file inverse pin (zero `runId` occurrences in either return-shape string,
// zero occurrences of the deleted false-equivalence sentence); AC-06-8's field lists drop
// `runId` and gain an absence pin across all six bodies; AC-06-9's GATE extraction retargets
// from wf-build.body.js to the fragment it now single-sources from, plus an absence pin on both
// bodies. Two new tests (AC-06a-4, AC-06a-5) execute the hoisted `capOptions` minority-preserving
// cap directly.

test('AC-20260813-06-6: wf-review\'s finding schema requires `impact` (plain English, no code identifiers)', () => {
  const wfReviewSrc = read('spec/workflows/src/wf-review.body.js')
  const findingsBlockMatch = wfReviewSrc.match(/const FINDINGS = \{[\s\S]*?\n\}\n/)
  assert.ok(findingsBlockMatch, 'the FINDINGS schema constant could not be located in wf-review.body.js — source moved, update the extraction')
  const findingsBlock = findingsBlockMatch[0]
  assert.match(findingsBlock, /required:\s*\[[^\]]*'impact'[^\]]*\]/,
    'a finding\'s required fields must include `impact` (D5) — findings today require only file/line/severity/claim/rule, with no plain-English consequence line the console report can display')
  assert.match(findingsBlock, /impact:\s*\{[^}]*description:[^}]*plain English/i,
    'the `impact` property\'s schema description must demand plain English (D5) — without an enforced description reviewers surface raw code identifiers into the report\'s display line')
  assert.match(findingsBlock, /impact:\s*\{[^}]*description:[^}]*(no|never|forbid).{0,25}(code )?identifiers/i,
    'the `impact` property\'s schema description must forbid code identifiers (D5) — this is the exact failure mode E4 recorded')
})

test('AC-20260813-06a-2: review.md carries zero `runId` occurrences in either return-shape string, and zero occurrences of the deleted false-equivalence sentence, while the ledger-row template keeps its own `runId`', () => {
  const reviewMd = read('spec/commands/review.md')
  assert.doesNotMatch(reviewMd, /lensFailed, runId/,
    'spec 06a D1/D2 repeals the runId echo from every workflow return and D2 drops it from BOTH ' +
    'documented return-shape strings (the Phase 1 "Returns {…}" line and the "## Rules" shape ' +
    'list both carry this identical substring) — a leftover `runId` in either one re-asserts a ' +
    'field the workflow no longer returns, and the earlier `## Rules`-scoped pin left the Phase 1 ' +
    'occurrence unpinned (refuter finding 1)')
  assert.doesNotMatch(reviewMd, /`runId` is this/,
    'D2 deletes the sentence asserting `runId` "is this Workflow invocation\'s run id, the same ' +
    'value Phase 2 step 2 passes to verdict.js --run-id" — the sentence asserts a falsehood once ' +
    'the runId echo is repealed (the field it describes was never in the return), so its survival ' +
    'means the doctrine still teaches the false premise D1 corrects')
  assert.match(reviewMd, /"runId":"<wf_…>"/,
    'the ledger-row template\'s `"runId":"<wf_…>"` line must SHALL CONTINUE TO survive (D2) — ' +
    'provenance is real and orchestrator-sourced; only the workflow-return echo of a field the ' +
    'script cannot observe is being deleted, never the ledger\'s own true id')
})

test('AC-20260813-06-7: wf-panel throws naming the degraded count when fewer than 3 proposals survive, and proceeds to aggregation at exactly 3', () => {
  const src = read('spec/workflows/src/wf-panel.body.js')
  // D6: "throws when fewer than 3 proposals survive (the arg-boundary invariant enforced at
  // runtime too; the throw sits inside the runProposers block)". Per this repo's established
  // pattern (wf-build's assertGateArgs/assertResolutions/crossCheckSentinels), the check is
  // hoisted into a named top-level function — `assertProposalSurvival(proposals)` — so this test
  // can execute it standalone via evalFns instead of only asserting on prompt text.
  const { assertProposalSurvival } = evalFns(src, ['assertProposalSurvival'])
  assert.throws(() => assertProposalSurvival([{ role: 'a' }, { role: 'b' }]),
    /2/,
    'fewer than 3 surviving proposals must throw, naming the degraded count — a silently-thinned MoA panel (2 proposers instead of 3) is exactly the silent-degradation class (E9) this spec closes; the throw must also name the count so the failure is diagnosable')
  assert.doesNotThrow(() => assertProposalSurvival([{ role: 'a' }, { role: 'b' }, { role: 'c' }]),
    'exactly 3 surviving proposals must SHALL CONTINUE TO proceed to aggregation, never be treated as degraded — the panel doctrine\'s own count, not a stricter one')
})

test('AC-20260813-06-8 / AC-20260813-06a-1: each of the six workflow bodies pins its body-specific degradation field in its return assembly, and none of the six pins `runId` anywhere in its source', () => {
  const bodies = {
    'wf-build': ['agentsFailed'],
    'wf-design': ['agentsFailed'],
    'wf-panel': ['agentsFailed'],
    'wf-research': ['verifyFailed', 'alsoConsidered'],
    'wf-review': [],
    'wf-enforce': [],
  }
  for (const [name, fields] of Object.entries(bodies)) {
    const src = read(`spec/workflows/src/${name}.body.js`)
    for (const field of fields) {
      assert.match(src, new RegExp('\\b' + field + '\\s*:'),
        `${name}.body.js must pin \`${field}\` in its return assembly (D6) — the envelope contract exists only by convention today; a silently-reduced-assurance run with no data carrier is exactly what E9 recorded`)
    }
    assert.doesNotMatch(src, /\brunId\b/,
      `${name}.body.js must contain zero occurrences of \`runId\` (spec 06a D1) — a workflow ` +
      'script cannot know its own run id (the harness delivers it only in the caller\'s tool ' +
      'result, never in args), so every `runId: args.runId` echo evaluates to `undefined`; the ' +
      'repeal deletes both the return-object property and the args-contract comment entry')
  }
})

test('AC-20260813-06-9 / AC-20260813-06a-3: wf-enforce requires `notes`, RECEIPT.files[].summary stays required, and the single GATE schema (no `summary` required) now lives ONLY in the fragment', () => {
  const enforceSrc = read('spec/workflows/src/wf-enforce.body.js')
  const candidateMatch = enforceSrc.match(/const CANDIDATE = \{[\s\S]*?\n\}\n/)
  assert.ok(candidateMatch, 'the CANDIDATE schema constant could not be located in wf-enforce.body.js — source moved, update the extraction')
  assert.match(candidateMatch[0], /required:\s*\['id',\s*'stack',\s*'category',\s*'candidates',\s*'fallback',\s*'notes'\]/,
    'CANDIDATE\'s required list must include `notes` (D7) — the report\'s mandatory ⚠️ fallback line has no data source without it (E6)')

  const buildSrc = read('spec/workflows/src/wf-build.body.js')
  const receiptMatch = buildSrc.match(/const RECEIPT = \{[\s\S]*?\n\}\n/)
  assert.ok(receiptMatch, 'the RECEIPT schema constant could not be located in wf-build.body.js — source moved, update the extraction')
  assert.match(receiptMatch[0], /required:\s*\['path',\s*'action',\s*'summary'\]/,
    'files[].summary SHALL CONTINUE TO be required (regression pin, D7) — it is actively consumed in repair prompts; un-requiring it would inject undefined into them')

  const designSrc = read('spec/workflows/src/wf-design.body.js')
  assert.doesNotMatch(buildSrc, /const GATE\b/,
    'wf-build.body.js must define NO `const GATE` (spec 06a D4) — the schema moves into ' +
    'fragments/gate-loop.js.frag beside its sole reader; a definition left behind in the body ' +
    'is exactly the hand-copy drift D4 exists to make structurally impossible')
  assert.doesNotMatch(designSrc, /const GATE\b/,
    'wf-design.body.js must define NO `const GATE` either (D4) — wf-design\'s copy is the one ' +
    'that actually drifted (still required `summary` after spec 06 D7 loosened wf-build only); ' +
    'deleting both bodies\' definitions is what makes a future schema edit reach both twins by construction')

  const fragSrc = read('spec/workflows/fragments/gate-loop.js.frag')
  const gateMatch = fragSrc.match(/const GATE = \{[\s\S]*?\n\}\n/)
  assert.ok(gateMatch, 'fragments/gate-loop.js.frag must define `const GATE` (D4) — the fragment ' +
    'is the ONE place the shared gate loop lives (spec 05 D5); its schema belongs beside its sole ' +
    'reader, `runGateLoop`\'s `schema: GATE` dispatch, immediately above the function')
  assert.match(gateMatch[0], /required:\s*\['pass',\s*'failures'\]/,
    'the fragment\'s GATE must carry spec 06 D7\'s shape — required: [\'pass\', \'failures\'] with ' +
    'no `summary` — a repo-wide grep found zero readers of `summary`; requiring it burdens both ' +
    'twins with a consumed-by-nobody field again')
})

test('AC-20260813-06a-4: capOptions keeps a minority-flagged option over a better-ranked non-minority one, recording the cut labels dimension-attributed', () => {
  const src = read('spec/workflows/src/wf-research.body.js')
  const { capOptions } = evalFns(src, ['capOptions'])
  // Worked example from the spec's Behavior section: 6 options ranked 1-6, dimension "db",
  // rank 5 flagged is_minority — the non-minority cut order is worst-rank-first (6 then 4), so
  // the minority option survives over a better-ranked (rank 4) non-minority option.
  const options = [1, 2, 3, 4, 5, 6].map(rank => ({ label: 'opt' + rank, rank, is_minority: rank === 5 }))
  const { menus, alsoConsidered } = capOptions([{ dimension: 'db', options }])

  assert.strictEqual(menus.length, 1, 'capOptions must return exactly one menu per menu it received — the input had one')
  const keptRanks = menus[0].options.map(o => o.rank)
  assert.deepStrictEqual(keptRanks, [1, 2, 3, 5],
    'a 6-option menu with rank 5 flagged is_minority must keep exactly ranks [1, 2, 3, 5] — cutting ' +
    'to rank-only worst-first (keeping [1,2,3,4]) silently discards the researcher-preserved ' +
    'contrarian option (is_minority), the exact silent-degradation class this spec closes')
  assert.deepStrictEqual(alsoConsidered, [{ dimension: 'db', label: 'opt6' }, { dimension: 'db', label: 'opt4' }],
    'alsoConsidered must record the two non-minority cuts worst-rank-first (opt6 then opt4) as ' +
    '{dimension, label} objects — a pooled flat label string (spec 06\'s shape) loses which ' +
    'dimension a cut option belonged to once more than one dimension trims in the same round')
})

test('AC-20260813-06a-5: capOptions cuts non-minority options before minority ones, breaks rank ties by cutting the later-listed option, and leaves a menu of 4 or fewer untouched', () => {
  const src = read('spec/workflows/src/wf-research.body.js')
  const { capOptions } = evalFns(src, ['capOptions'])

  // Part 1: 5 minority options (ranks 1-5) + 1 non-minority (rank 6) — cut the non-minority
  // option first even though it outranks nothing yet, then cut the worst-ranked minority option
  // once minority alone still exceeds the cap.
  const minorityHeavy = [1, 2, 3, 4, 5].map(rank => ({ label: 'm' + rank, rank, is_minority: true }))
    .concat([{ label: 'n6', rank: 6, is_minority: false }])
  const part1 = capOptions([{ dimension: 'runtime', options: minorityHeavy }])
  assert.deepStrictEqual(part1.menus[0].options.map(o => o.rank), [1, 2, 3, 4],
    'with 5 minority options plus 1 non-minority, the SYSTEM must cut the non-minority option ' +
    'first and then only the worst-ranked (rank 5) minority option, keeping minority ranks ' +
    '[1, 2, 3, 4] — cutting a second minority option before the non-minority one is exhausted ' +
    'would average away the minority-preservation promise')
  assert.deepStrictEqual(part1.alsoConsidered, [{ dimension: 'runtime', label: 'n6' }, { dimension: 'runtime', label: 'm5' }],
    'the cut order recorded in alsoConsidered must be the non-minority option (n6) then the ' +
    'worst-ranked minority option (m5), in that order — reversing it would misreport which class ' +
    'was protected longest')

  // Part 2: 5 non-minority options in researcher order A B C D E with ranks [1, 2, 3, 3, 2] — a
  // stable ascending sort yields A(1) B(2) E(2) C(3) D(3); cutting worst-rank-first at a tie must
  // cut the LATER-LISTED of the tied options (D, not C).
  const tieBreak = [
    { label: 'A', rank: 1, is_minority: false },
    { label: 'B', rank: 2, is_minority: false },
    { label: 'C', rank: 3, is_minority: false },
    { label: 'D', rank: 3, is_minority: false },
    { label: 'E', rank: 2, is_minority: false },
  ]
  const part2 = capOptions([{ dimension: 'hosting', options: tieBreak }])
  assert.deepStrictEqual(part2.menus[0].options.map(o => o.label), ['A', 'B', 'E', 'C'],
    'on a rank tie at the cut boundary, the LATER-LISTED tied option must be the one cut (D, not ' +
    'C) — Array.prototype.sort is stable, so a naive implementation that sorts then slices ' +
    'without honoring researcher order on ties could just as easily cut C, silently reordering ' +
    'which of two equally-ranked options the user sees')
  assert.deepStrictEqual(part2.alsoConsidered, [{ dimension: 'hosting', label: 'D' }],
    'exactly one cut must be recorded, naming D — cutting or recording C instead means the tie-' +
    'break rule (later-listed loses) was not honored')

  // Part 3: a 4-option menu is at the cap, not over it — must pass through completely unchanged
  // with nothing recorded.
  const atCap = [1, 2, 3, 4].map(rank => ({ label: 'x' + rank, rank, is_minority: false }))
  const part3 = capOptions([{ dimension: 'infra', options: atCap }])
  assert.deepStrictEqual(part3.menus[0].options, atCap,
    'a menu of exactly 4 options (at, not over, the cap) must be returned untouched — trimming ' +
    'or reordering it would violate "≤4 options → menu untouched" on the common case where ' +
    'research already respected the cap')
  assert.deepStrictEqual(part3.alsoConsidered, [],
    'a menu at or under the cap must record nothing in alsoConsidered — a spurious entry here ' +
    'would misreport a cut that never happened')
})
