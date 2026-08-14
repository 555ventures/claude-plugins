---
date: 2026-08-14
status: done
diff_base: 58ac2a2c6a470059f2108c3908458dea6e0f59f3
open_markers: 0
risk: T3
area: report-surface
design: false
breaking: false
depends_on: ["specs/20260813/06-report-renderer.md"]
depended_on_by: ["specs/20260813/07-command-report-conformance.md"]
brief: n/a
---

# Return-envelope corrections — repeal the runId echo, single-source GATE, minority-preserving research cap

## Goal

Correct three defects spec 06 landed in the workflow return envelopes, before spec 07 builds
19 command reports on top of them: (1) the `runId` echo is built on a false premise — a
workflow script cannot know its own run id, so every envelope now carries a provenance field
that is always `undefined`; (2) spec 06's GATE-schema loosening was applied to wf-build only,
so the twin gate schemas (whose shared loop lives in one fragment precisely to prevent drift)
now disagree; (3) the wf-research option cap cuts purely by rank, which can silently discard
a minority option the research prompt explicitly orders preserved, and records cuts with no
dimension attribution. Done means: no workflow return names `runId`, the orchestrator remains
the sole provenance stamp-point, `const GATE` has exactly one definition (in the fragment,
beside its sole reader), and the research cap is minority-preserving with dimension-attributed
`alsoConsidered` — all pinned by the amended test file.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **Repeal spec 06 D9.** Delete the `runId` property from every return assembly in all six `spec/workflows/src/wf-*.body.js` (every `runId: args.runId,` occurrence — wf-build ×6, wf-design ×5, wf-panel ×1, wf-research ×1, wf-review ×3, wf-enforce ×1) and delete the `runId: string` entry (with its 2–3 comment lines) from each body's args-contract header comment. No replacement field, no resume-only threading. | The harness mints the run id at invoke time and delivers it only in the caller's tool result; no orchestrator passes `runId` in `args` (build.md's documented args object has no such key), so every echo evaluates to `undefined` — a contract that always lies. A resume-only thread would be a field defined half the time, which is worse than none. |
| D2 | The orchestrator stays the sole provenance stamp-point, untouched: ledger rows and the report's `📦 runId` line source the id from the Workflow tool result. review.md edits: remove `runId` from both return-shape strings (the `## Rules` shape list AND the Phase 1 `Returns {…}` line — both carry the identical `…, lensFailed, runId}` substring); delete the sentence asserting `runId` "is this Workflow invocation's run id, the same value Phase 2 step 2 passes to verdict.js --run-id" (it asserts a falsehood once D1 lands — the value it describes was never in the return). The ledger-row template's `"runId":"<wf_…>"` and the Gotcha-citation `runId {wf id}` form are orchestrator-sourced and stay verbatim. | Provenance is real and stays — it just lives where the id actually exists. Deleting only the false claim, not the true ones, keeps review.md's ledger contract intact. |
| D3 | tests/report/return-slots.test.js amendments, sanctioned by this spec: (a) AC-20260813-06-6's review.md `runId` clause (the `shapeMatch` assertion block) is REPLACED by the inverse pin covering the whole file, not just `## Rules`: zero matches for `lensFailed, runId` anywhere in review.md (pins both return-shape strings at once — refuter-caught: the `## Rules`-scoped extraction left the Phase 1 occurrence and its false sentence unpinned) and zero matches for the literal substring `` `runId` is this `` (pins the sentence deletion); its wf-review `impact` clauses stay; (b) AC-20260813-06-8's field lists drop `runId` from all six entries — `agentsFailed`/`verifyFailed`/`alsoConsidered` stay pinned — and the test gains the inverse assertion: `runId` absent from all six body sources; (c) AC-20260813-06-9's GATE extraction retargets from wf-build.body.js to fragments/gate-loop.js.frag and additionally asserts `const GATE` is ABSENT from both body sources; its CANDIDATE and RECEIPT clauses are unchanged. Test names updated to cite this spec's AC ids alongside the originals. | Review flags weakened assertions unless the spec sanctions them — this row is that sanction, scoped to exactly the three named edits. |
| D4 | **Single-source GATE.** Move `const GATE` into `spec/workflows/fragments/gate-loop.js.frag`, placed immediately above `async function runGateLoop` (its sole reader is the `schema: GATE` dispatch inside that function). The moved definition carries spec 06 D7's shape: `required: ['pass', 'failures']`, `summary` an optional property retaining the dated zero-readers comment. Delete both body definitions (wf-build.body.js `const GATE` block and wf-design.body.js `const GATE` block) entirely. The fragment must NOT use the per-workflow splice substitution token (the spliced region stays byte-identical in both generated files — the existing twin-parity pin). | One definition beside its one reader makes the D7 shape apply to both twins by construction and repairs the live divergence (wf-design still requires `summary`); the fragment is the ONE place the loop lives per spec 05 D5 — its schema belongs with it. |
| D5 | **Amend spec 06 D6 (research cap).** Hoist the cap logic into a named top-level function `capOptions(menus)` returning `{menus, alsoConsidered}` (the established evalFns-testable pattern), called where the inline cap sits today. Cut order per dimension when `options.length > 4`: sort by ascending `rank` with a **stable** sort (Node's `Array.prototype.sort` is stable — options tied on rank keep researcher order); cut **non-minority** options first, worst (highest) rank first, and among rank-ties the later-listed option is cut first; cut an `is_minority: true` option only when minority options alone exceed 4 — then minority options are cut by the same order. `is_minority` counts as minority only when `=== true` (absent/false → non-minority). Each cut is recorded as `{dimension, label}` in `alsoConsidered` (the flat label-string array is deleted). The return envelope's `alsoConsidered` becomes this array of objects. | Rank-only truncation silently discards the contrarian option the researcher prompt orders preserved (`is_minority` — "never average it away") — a new instance of the silent-degradation class spec 06 existed to close; dimension attribution makes the report line usable when several dimensions cut at once. `alsoConsidered` has zero consumers today (spec 07 is unbuilt), so the shape correction is free now and expensive after 07. |
| D6 | Version bump: next free minor of the spec plugin at build time (6.67.0 as of planning — a target, not a pin, per the Gotchas ledger on version races), with the plugin.json description updated as changelog. Re-stamp `spec/doctrine/claims-baseline.json` via `node spec/scripts/claims-lint.js --update-baseline` in the same change — claims-lint pins exact per-file line counts (growth OR shrinkage fails), and review.md shrinks here. | Repo discipline; the baseline is exact-count, so a shrink un-stamped is a red gate. |
| D7 | Chain wiring (applied at plan time, not build): spec 07's `depends_on` gains this spec; spec 06's `depended_on_by` gains this spec. Spec 07 builds only after this spec is `done`. | 07 migrates 19 command reports onto the envelope contract — it must build on the corrected contract, not correct 19 call sites afterward. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D1: delete 6 `runId: args.runId` occurrences + args-comment entry; D4: delete `const GATE` block |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D1: delete 5 `runId` occurrences + args-comment entry; D4: delete `const GATE` block |
| spec/workflows/src/wf-panel.body.js | MODIFY | workflows | D1: delete 1 `runId` occurrence + args-comment entry |
| spec/workflows/src/wf-research.body.js | MODIFY | workflows | D1: delete 1 `runId` occurrence + args-comment entry; D5: hoist `capOptions(menus)`, minority-preserving cut order, `{dimension, label}` records |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D1: delete 3 `runId` occurrences + args-comment entry |
| spec/workflows/src/wf-enforce.body.js | MODIFY | workflows | D1: delete 1 `runId` occurrence + args-comment entry |
| spec/workflows/fragments/gate-loop.js.frag | MODIFY | workflows | D4: `const GATE` (D7-of-06 shape) added above `runGateLoop`; header comment notes it is the schema's single source |
| spec/commands/review.md | MODIFY | doctrine | D2: drop `runId` from both return-shape strings; delete the false-equivalence sentence; ledger template untouched |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6: version + description changelog |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | D6: re-stamp via `--update-baseline` (review.md count changes) |
| tests/report/return-slots.test.js | MODIFY | tests | D3 + AC-20260813-06a-1..5 (retire runId pins, retarget GATE extraction, add absence pins, capOptions execution tests) |
| tests/workflows/twin-parity.test.js | MODIFY | tests | Tag-only: AC-20260813-06a-6 id added to the existing byte-identical-splice test; no assertion change |

Orchestrator duty (never a File Plan row): run `npm run build:workflows` after source/fragment
edits and commit source + generated `spec/workflows/wf-*.js` together;
`node spec/scripts/build-workflows.js --check` must be green before the batch is done.

## Contracts

Amended workflow return envelopes (delta only — all other fields unchanged):

```js
// ALL six workflows: the `runId` key is REMOVED from every return object.
// Provenance contract: the Workflow tool result delivers the run id to the CALLER;
// the orchestrator stamps it into the run ledger row and the 📦 report line. The
// workflow script never sees it and never claims to.

// wf-research return (amended):
{
  stage: string,
  menus: [...],                 // unchanged
  verifyFailed: number,         // unchanged
  alsoConsidered: [             // CHANGED: was string[] (labels, pooled across dimensions)
    { dimension: string, label: string },
  ],
  tokens: number,
}

// wf-research: hoisted, evalFns-testable
function capOptions(menus) {
  // menus: [{dimension, options: [{label, rank, is_minority?, ...}], ...}]
  // returns { menus, alsoConsidered: [{dimension, label}] }
  // per menu with >4 options: cut non-minority worst-rank-first; cut minority
  // options only when minority options alone number >4 (then worst-rank-first).
}

// gate-loop.js.frag: single GATE definition (spec 06 D7 shape), spliced into both twins:
const GATE = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'object', properties: { file: {...}, summary: {...} }, required: ['file', 'summary'] } },
    summary: { type: 'string' },   // optional — zero readers (2026-08-13 spec 06 D7); comment preserved
  },
  required: ['pass', 'failures'],
}
```

## Behavior

- **runId (D1/D2):** deletion only — no behavior replaces it. The report renderer's slots
  never included `runId` (spec 06's renderer contract is unaffected); the ledger row keeps it,
  sourced where it always actually existed: the orchestrator's Workflow tool result.
- **Research cap (D5):** worked example, `OPTION_CAP = 4`, dimension `"db"`:
  - 6 options, ranks 1–6, rank 5 has `is_minority: true` → kept ranks [1, 2, 3, 5];
    `alsoConsidered` = `[{dimension: "db", label: <rank-6 label>}, {dimension: "db", label: <rank-4 label>}]`
    (non-minority cut worst-rank-first: 6 then 4; the minority option survives over a
    better-ranked non-minority one).
  - 5 minority options (ranks 1–5, all `is_minority`) + 1 non-minority (rank 6) → cut rank 6
    (non-minority first), still 5 > 4 → cut rank-5 minority → kept minority ranks [1, 2, 3, 4].
  - Rank tie at the cut boundary: 5 non-minority options in researcher order A B C D E with
    ranks [1, 2, 3, 3, 2] → stable ascending sort A(1) B(2) E(2) C(3) D(3) → cut worst from
    the end → D is cut (the later-listed rank-3 option); kept [A, B, E, C];
    `alsoConsidered` = `[{dimension, label: "D"}]`.
  - ≤4 options → menu untouched, nothing recorded.
  - Kept options remain sorted ascending by rank; `options.length ≤ 4` always holds after the
    call (the AskUserQuestion 4-option ceiling downstream).
- **GATE (D4):** behavior of the gate loop is unchanged in wf-build; wf-design's gate agent
  stops being *required* to emit `summary` (it may still emit it — optional property). The
  spliced region in both generated files remains byte-identical.

## Acceptance Criteria

- **AC-20260813-06a-1**: WHEN the six `wf-*.body.js` sources are scanned THE SYSTEM SHALL
  contain zero occurrences of `runId` in any of them (e.g. grep `\brunId\b` over the six
  files → 0 hits), while each body's degradation fields SHALL CONTINUE TO be pinned in its
  return assembly (`agentsFailed` in wf-build/wf-design/wf-panel; `verifyFailed` and
  `alsoConsidered` in wf-research) → amended AC-8 test in tests/report/return-slots.test.js
- **AC-20260813-06a-2**: WHEN review.md is scanned in full THE SYSTEM SHALL contain zero
  occurrences of `lensFailed, runId` (pins BOTH return-shape strings — Phase 1 and `## Rules`)
  and zero occurrences of the literal substring `` `runId` is this `` (pins the
  false-equivalence sentence's deletion), AND the ledger-row template line SHALL CONTINUE TO
  contain `"runId":"<wf_…>"` (e.g. both shape strings → `{verdict, survivors, killed, verify,
  reviewerCount, scope, tokens, smells, lensFailed}`; ledger line unchanged) → amended AC-6
  test in tests/report/return-slots.test.js
- **AC-20260813-06a-3**: WHEN fragments/gate-loop.js.frag is read THE SYSTEM SHALL define
  `const GATE` with `required: ['pass', 'failures']` (literal array, no `summary`), AND WHEN
  wf-build.body.js and wf-design.body.js are read THE SYSTEM SHALL contain no `const GATE`
  definition in either → retargeted AC-9 test in tests/report/return-slots.test.js
- **AC-20260813-06a-4**: WHEN `capOptions` receives a menu of 6 options ranked 1–6 with rank 5
  flagged `is_minority` THE SYSTEM SHALL return that menu with exactly ranks [1, 2, 3, 5]
  kept and `alsoConsidered` = the rank-6 and rank-4 labels each as
  `{dimension, label}` → new test in tests/report/return-slots.test.js (executes `capOptions`
  via evalFns)
- **AC-20260813-06a-5**: WHEN `capOptions` receives 5 minority options (ranks 1–5) plus one
  non-minority (rank 6) THE SYSTEM SHALL cut the non-minority option first and then the
  rank-5 minority option (kept: minority ranks [1, 2, 3, 4]); WHEN it receives 5 non-minority
  options in order A B C D E with ranks [1, 2, 3, 3, 2] THE SYSTEM SHALL cut exactly D — the
  later-listed of the tied worst-rank options (stable sort; kept [A, B, E, C]); WHEN it
  receives a menu of ≤4 options THE SYSTEM SHALL return it unchanged with nothing recorded
  → new test in tests/report/return-slots.test.js
- **AC-20260813-06a-6**: WHEN `npm run build:workflows` regenerates the twins THE SYSTEM
  SHALL CONTINUE TO produce a byte-identical gate-loop spliced region in wf-build.js and
  wf-design.js (now including the moved GATE definition) → tag added to the existing
  byte-identical-splice test in tests/workflows/twin-parity.test.js (no assertion change)

## Assumptions (escalation triggers)

- A1: No functional reader of a workflow-return `runId` exists anywhere in the repo — the
  only `.runId` consumers are orchestrator-side (spec-design-driver.js reads its own Workflow
  tool result; verdict.js reads the ledger row), verified by repo-wide grep 2026-08-14 —
  **if false:** the reader breaks loudly at gate time; STOP, name the reader to the user
  before widening scope.
- A2: The harness mints the run id and delivers it only in the caller's tool result; nothing
  supplies `args.runId`. **Executed evidence (micro-spike, harness-adjudicated claim):** spec
  06's own build run — the Workflow tool result delivered `Run ID: wf_e0d6aca9-2e9` to the
  orchestrator (recorded in `.claude/spec-runs.jsonl`), while the invocation's `args` carried
  no `runId` key (build.md's args contract has none), so the six `runId: args.runId` echoes
  evaluate to `undefined` — the field the envelopes return is empty in every live run —
  **if false:** a harness version that injects `args.runId` would only make the deleted field
  redundant, never wrong; proceed.
- A3: `const GATE`'s sole reader is the `schema: GATE` dispatch inside the fragment's
  `runGateLoop` (grep over `spec/workflows/src` + `fragments`: definitions at wf-build:251,
  wf-design:95; single use at gate-loop.js.frag:88) — **if false:** a second reader outside
  the spliced region would throw ReferenceError at generation or test time; STOP and re-scope
  the move.
- A4: `alsoConsidered` has zero consumers (spec 07 is `hardened`, unbuilt; repo-wide grep
  finds only wf-research.body.js, its generated twin, and the spec-06 test) — **if false:**
  return blocked; the shape change needs the consumer migrated in the same spec.
- A5: The fragment splice is verbatim (no per-workflow substitution applied to gate-loop),
  so a static `const GATE` added to the fragment lands byte-identical in both twins —
  **if false:** twin-parity fails at gate time; STOP, the fragment pipeline changed under us.
- A6: claims-lint pins exact per-file line counts, so review.md's shrink requires the D6
  re-stamp. **Executed evidence (adversarial-check spike):** a scratch fixture stamped at 5
  lines then shrunk to 4 made `claims-lint.js --check` exit 1 with an explicit
  `[baseline-mismatch] shrinkage` finding — **if false:** n/a, verified by execution.

## Rationale

Spec 06 shipped green, but a post-build consult (Fable, seated as plan author's proxy)
refuted two of its premises with execution evidence, and the fixes are structural, not
patches. (1) D9 assumed the orchestrator "passes the run id back in" — it never does, and
cannot at first invoke: the id exists only in the tool result *after* the call. Every echo is
`undefined`. The honest correction is deletion: provenance stays at the only layer that holds
the id. The rejected alternative — threading `runId` through `args` on resume only — creates
a field that is defined on resumed runs and `undefined` on first runs: a contract that lies
half the time is worse than none. (2) Spec 06 D7's wording scoped the GATE loosening to
wf-build, silently forking the twins' gate schemas — the exact hand-copy drift spec 05
extracted the fragment to kill. Moving the definition into the fragment beside its only
reader makes divergence impossible rather than merely repaired. (3) The option cap protected
the AskUserQuestion ceiling but not the minority-preservation promise the researcher prompt
makes ("never average it away") — rank-only truncation is how a contrarian option dies
silently. Cut order and dimension attribution fix the *shape* while keeping the placement
(pre-Verify, in-workflow) that spec 06 got right. The 44-line § Console Output Style pin was
also examined and deliberately left untouched: zero headroom is the design; spec 07 needs no
net-new lines there. Adversarial check (2 blind refuters): four genuine findings, all FIXED,
none rejected — (1) the review.md pin covered only the `## Rules` shape string, leaving the
Phase 1 occurrence and the false sentence unpinned → AC-2 became a whole-file zero-hit pin;
(2) wf-build's `runId` count was 6, not 5 → corrected; (3) the second shape string sits under
Phase 1, not Phase 2 → relabeled; (4) `capOptions` rank-tie order was unspecified → pinned to
stable sort, later-listed tied option cut first, with a literal example (AC-5).

## Canonical Delta

docs/canonical/workflows.md (entry-per-durable-decision format) — two changes:

1. New entry: **"A workflow never claims data only its caller holds"** (2026-08-14, this
   spec). A workflow script cannot know its own run id — the harness mints it at invoke time
   and delivers it only in the caller's tool result. Provenance therefore lives at the
   orchestrator: the ledger row and the 📦 report line are stamped from the tool result;
   return envelopes carry no `runId` and never echo an args field the invoking contract does
   not supply. The general rule: a return-envelope field whose value the script cannot
   observe is a contract that lies — delete it rather than thread it.
2. Extend the existing entry **"Twins are fixed by extraction, not by copied comments"**:
   the extraction includes the schemas the shared loop dispatches with — `GATE` is defined
   in `fragments/gate-loop.js.frag` beside its sole reader (`summary` optional, zero
   readers), so a schema change reaches both twins by construction. Also note wf-research's
   cap contract: `alsoConsidered` is `[{dimension, label}]`, cut order minority-preserving.
