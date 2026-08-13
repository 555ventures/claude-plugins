---
date: 2026-08-13
status: done
diff_base: 806bea67e5f7272b31260967b1100621496fb493
open_markers: 0
risk: T3
area: gate-scripts
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/02-durable-verification-qualifiers.md"]
brief: n/a
---

# Gate Script Mechanics: claims-lint CWD, scope-reconcile globs, verdict GATE_RED seam

## Goal

Three deterministic gate scripts stop lying by mechanics: `claims-lint.js` resolves the
plugin's own shipped corpus from any CWD (doctor check 18 has never actually run in any host —
silently green since it landed); `scope-reconcile.js` expands File Plan glob rows so a planned
codegen output stops double-reporting as both out-of-plan and unrealized; and `verdict.js`
implements review.md's documented pre-panel GATE_RED invocation (no `--workflow`) instead of
exiting 2 on it, with doctor check 12 learning that a GATE_RED review row legitimately carries
no `runId`. Done = the six open pins on these scripts run green with every existing derivation
pin untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `claims-lint.js` default resolution anchors to the script's own location, never CWD — two-stage: (a) **upward walk**: from `__dirname`, walk up at most 3 levels to the first directory containing `spec/doctrine/claims-baseline.json`; found (the dev/marketplace layout — this repo) → behave byte-identically to `--root <that dir>`, including `resolvePath`'s repo-root-anchored `enforcedBy:` pointer checks. (b) Walk fails (installed-plugin layout) → **`PLUGIN_HOME` mode**: `PLUGIN_HOME = path.resolve(__dirname, '..')`; corpus at `PLUGIN_HOME/{commands,doctrine,agents}`, baseline at `PLUGIN_HOME/doctrine/claims-baseline.json`, report keys stay canonical `spec/<subdir>/<file>`; `enforcedBy:` targets resolve against `PLUGIN_HOME` with a leading `spec/` stripped, and a target whose tree is not shipped in the plugin (e.g. `tests/…` — no such directory under `PLUGIN_HOME`) is counted in a new `skippedPointers` JSON key and reported informationally — **never** a `stale-pointer` finding (undecidable ≠ stale). `--root <dir>` keeps today's exact semantics for fixtures and dev. All three modes documented in the header. | Doctor's only call pattern is `node "$(spec-paths claims-lint)" --json` from a host CWD; `--root` defaulting to `process.cwd()` means check 18 has never scanned anything anywhere. Refuter-demonstrated: naive `PLUGIN_HOME`-only anchoring breaks `resolvePath` (claims-lint.js:160) for BOTH corpus pointer conventions (`spec/scripts/…` double-prefixes; `tests/…` lives beside `spec/`, not under it), flooding every host's check 18 with false stale-pointer findings — worse than never running. The upward walk restores full repo-root semantics wherever the repo exists; skip-with-accounting keeps installed hosts honest about what they cannot decide. |
| D2 | `scope-reconcile.js` treats a File Plan row containing glob metacharacters (`*`, `?`, `[`) as a pattern via the existing `lib/glob-match.js` `globMatch`: a changed file matching a glob row is in-plan (never `outOfPlan`), and a glob row matched by ≥1 changed file is realized (never `unrealized`). **Realization counts only non-excluded changed files**: the glob-row match for `unrealized` runs against `changed` minus `excludedSet` (pipeline-owned files are reconciliation noise and must not fake a row's realization — refuter finding: a host whose `pipelineOwnedPaths` glob overlaps a codegen File Plan row would otherwise mark the row realized by a file review never sees). A glob row matched by zero non-excluded changed files lands in `unrealized` as the literal row text, exactly as today. Concrete rows keep exact-match semantics untouched. | The exact-string `filePlanPaths.has(p)` check double-counts every planned codegen output (prax 20260810/05, 20260812/01): the concrete file lands `outOfPlan` and the glob row lands `unrealized` — one legitimate row, two false findings. `globMatch` is already the repo's sole glob semantics (D4 of 20260805/01); no second matcher. |
| D3 | `verdict.js` makes `--workflow` optional on the review profile, exactly as narrow as review.md documents: without `--workflow`, the derivation runs manifest-only — `UNVERIFIED` (missing/invalid legs) and `GATE_RED` (red blocking leg) both reachable; a manifest that is green and complete **without** `--workflow` is a usage error (exit 2) whose message names the remedy ("all legs green — the panel must run; pass --workflow <path to the wf-review return>"). **Every `workflow.*` dereference is guarded — there are THREE sites, not two:** (i) the eager `requiredLegs` computation at verdict.js:115-117 (`workflow.scope === 'fix-delta'`), which runs before `derive()` is ever invoked and NPEs first under an arg-only relax (refuter-executed: `TypeError: Cannot read properties of null (reading 'scope')` on the exact AC-7 invocation) — becomes `(workflow && workflow.scope === 'fix-delta')`; (ii) `derive()`'s REVIEWER_FAILED check and survivor math; (iii) the ledger branch's `scope`/`tokens`/`findings`/`verify` row keys — apply only when a workflow file was given; a no-workflow ledger row carries `spec/stage/tier/verdict/iteration/diff/smoke/testsSkipped/legs` and omits the rest (STOP-path rows are partial by nature — the release profile precedent). | review.md Phase 0 step 8's documented invocation is unimplementable today (exit 2), so every aborted review hand-crafts a stub workflow file (spec-05 session 2026-08-08; prax third occurrence, whose gotcha flagged the `derive()` NPE — the refuter located the actual first-crash site outside `derive()`, at the eager `requiredLegs` line). The green-manifest guard preserves the original protection: a panel-less CLEAN stays impossible. |
| D4 | doctor.md check 12: `runId` becomes OPTIONAL on review rows whose `verdict` is `GATE_RED` — the narrow contract, never a row-class exemption: a pre-panel hard stop structurally has no run id, while an in-workflow red iteration legitimately still carries one and keeps it. | prax: 5 of 6 GATE_RED rows (`runId:null`) tripped ledger hygiene on a host following review.md verbatim; the exemption list only knew whole row classes. |
| D5 | Version bump target 6.60.0 in `spec/.claude-plugin/plugin.json` (target, not a pin — bump to next free on a race and log the deviation). | Standing discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/claims-lint.js | MODIFY | scripts | D1 default-root discovery (upward walk → `PLUGIN_HOME` mode) + `skippedPointers` accounting + header/usage update (three documented modes, remedy strings unchanged) |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | D2 glob-row expansion in the `outOfPlan`/`unrealized` computation; header notes the glob contract |
| spec/scripts/verdict.js | MODIFY | scripts | D3 optional `--workflow` on review profile, green-manifest guard, `workflow.*` deref guards, partial no-workflow ledger row; header/usage update |
| spec/commands/doctor.md | MODIFY | doctrine | D4 check 12 GATE_RED `runId`-optional clause |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for the doctor.md line-count delta (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D5 version bump + changelog description |
| tests/claims-lint-baseline-path.test.js | MODIFY | tests | AC-20260813-03-1, AC-20260813-03-2 (tag existing red pins) |
| tests/claims/claims-lint.test.js | MODIFY | tests | AC-20260813-03-3 (tag existing green `--root` fixture pins — regression pin) |
| tests/scope-reconcile-glob-rows.test.js | MODIFY | tests | AC-20260813-03-4, AC-20260813-03-5 (tag existing red pins) |
| tests/review/scope-reconcile.test.js | MODIFY | tests | AC-20260813-03-6 (tag existing green concrete-row pins — regression pin) |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | AC-20260813-03-7, AC-20260813-03-9 (tag existing red pins); AC-20260813-03-8 (new: green manifest without `--workflow` exits 2 naming the remedy) |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260813-03-10 (tag representative existing green with-`--workflow` pins — regression pin) |
| spec/INTAKE.md | MODIFY | doctrine | flip PRAX-20260813-04, PRAX-20260813-07, JJ-20260808-01 to the fixing version with `mechanism(<path>)` citations |

## Contracts

```js
// claims-lint.js (D1) — default-root discovery, in order:
// 1. upward walk (≤3 levels from __dirname) to the first dir D where
//    D/spec/doctrine/claims-baseline.json exists → root = D, semantics byte-identical
//    to --root D (corpus, baseline, report keys, AND resolvePath pointer checks)
// 2. else PLUGIN_HOME mode: const PLUGIN_HOME = path.resolve(__dirname, '..')
//    corpus <PLUGIN_HOME>/{commands,doctrine,agents}; baseline
//    <PLUGIN_HOME>/doctrine/claims-baseline.json; report keys 'spec/<subdir>/<file>';
//    resolvePath(p): strip leading 'spec/' → check under PLUGIN_HOME; a target whose
//    first path segment has no directory under PLUGIN_HOME (unshipped tree, e.g.
//    'tests/…') → counted in JSON `skippedPointers`, informational, never stale-pointer
// --root <dir>: byte-identical to today

// scope-reconcile.js (D2)
const isGlobRow = (p) => /[*?\[]/.test(p)
// outOfPlan: p is out of plan only if no concrete row equals p AND no glob row globMatch-es p
//   (p has already survived the excludedSet filter at that point, as today)
// unrealized: a glob row is unrealized only if no NON-EXCLUDED changed file globMatch-es it
//   (match set = changed minus excludedSet — pipeline-owned noise never realizes a row)

// verdict.js (D3) — guard shape, review profile
if (!manifestPath) { usage(); exit(2) }                    // manifest always required
// SITE (i), eager, runs BEFORE derive() — must be guarded or it NPEs first:
const requiredLegs = profile === 'release'
  ? RELEASE_LEGS
  : ((workflow && workflow.scope === 'fix-delta')
      ? REVIEW_LEGS.filter(l => l !== 'reconcile') : REVIEW_LEGS)
// workflow optional; after derive():
//   word ∈ {UNVERIFIED, GATE_RED} → proceed (ledger row partial, runId optional)
//   otherwise, if profile !== 'release' && !workflow → exit 2:
//   "verdict.js: all legs green — the panel must run; pass --workflow <path>"
```

## Behavior

- D1 changes no output format: `--json`/`--check`/`--update-baseline` behave identically; only
  where the corpus and baseline are found by default changes. Exit-code alphabet unchanged.
- D2's `excluded`/`renamed` handling is untouched; `--dirs` mode reflects the changed set, not
  the plan, so it is unaffected. A glob row never matches a *directory* — matching is against
  the concrete changed-file paths only, via `globMatch`'s existing semantics.
- D3 ordering inside `derive()` already puts `UNVERIFIED` and `GATE_RED` before every
  workflow-dependent branch — the guards make that ordering safe, not different. The
  no-workflow ledger row still prints on line 2 under `--ledger` (the documented Phase 0 step 8
  contract) and `--run-id` stays accepted-but-optional.

## Acceptance Criteria

- **AC-20260813-03-1**: WHEN `claims-lint.js --json` runs from a foreign CWD with no `--root`
  (doctor check 18's exact pattern) THE SYSTEM SHALL scan the shipped corpus and print the JSON
  report **with findings identical to a `--root <repo>` run** (e.g. from a scratch dir: stdout
  parses, `totalLines > 0`, stderr free of `no baseline`, and the findings list matches the
  `--root` invocation's — the corpus is clean under `--root .` today, so any stale-pointer
  finding in the no-root run is a resolution regression, the refuter-demonstrated false-flood
  failure mode) → PRAX-20260813-04a (extended with the parity assertion) in
  tests/claims-lint-baseline-path.test.js
- **AC-20260813-03-2**: WHEN `claims-lint.js --check` runs from a foreign CWD with no `--root`
  THE SYSTEM SHALL lint the shipped corpus rather than exit 2, with the same exit code as the
  `--root <repo>` invocation (e.g. from a scratch dir: exit ∈ {0,1} equal to the `--root` run's,
  never the "no baseline" precondition failure) → PRAX-20260813-04b (extended with the exit
  parity assertion) in tests/claims-lint-baseline-path.test.js
- **AC-20260813-03-3**: WHEN `--root <dir>` is passed THE SYSTEM SHALL CONTINUE TO resolve the
  corpus at `<dir>/spec/{commands,doctrine,agents}` and the baseline at
  `<dir>/spec/doctrine/claims-baseline.json` (fixture layout — e.g. the tmpdir fixtures in
  tests/claims/claims-lint.test.js keep passing byte-identically) → tests/claims/claims-lint.test.js
- **AC-20260813-03-4**: WHEN a File Plan row is a glob and a changed file matches it THE SYSTEM
  SHALL keep that file out of `outOfPlan` (e.g. row `packages/contracts/schemas/*.json`, changed
  file `packages/contracts/schemas/run_event.json` → `outOfPlan` excludes it, exit 0) →
  PRAX-20260813-05 test 1 in tests/scope-reconcile-glob-rows.test.js
- **AC-20260813-03-5**: WHEN a glob row is matched by ≥1 changed file THE SYSTEM SHALL keep the
  row out of `unrealized` (same fixture → `unrealized` excludes the literal glob string) →
  PRAX-20260813-05 test 2 in tests/scope-reconcile-glob-rows.test.js
- **AC-20260813-03-6**: WHEN File Plan rows are concrete paths THE SYSTEM SHALL CONTINUE TO
  reconcile them by exact match (out-of-plan exit 3, unrealized listing, rename pairing, and
  pipeline-owned exclusion all byte-identical) → tests/review/scope-reconcile.test.js
- **AC-20260813-03-7**: WHEN `verdict.js --manifest … --ledger` runs with no `--workflow` on the
  review profile against a manifest with a red blocking leg THE SYSTEM SHALL print `GATE_RED` on
  stdout line 1, the partial ledger row on line 2, and exit 1 (e.g. the six-row manifest with
  `gate` exit 1 → `GATE_RED`, exit 1) → tests/verdict-gatered-no-workflow.test.js
- **AC-20260813-03-8**: WHEN the manifest is green and complete and no `--workflow` was passed on
  the review profile THE SYSTEM SHALL exit 2 with a usage error naming `--workflow` as the remedy
  (e.g. six green rows, no `--workflow` → exit 2, stderr matches `--workflow`) — a panel-less
  CLEAN stays underivable → new test in tests/verdict-gatered-no-workflow.test.js
- **AC-20260813-03-9**: WHEN doctor check 12 audits review rows THE SYSTEM SHALL admit a
  GATE_RED review row with null/absent `runId` — the check 12 text names GATE_RED explicitly as
  `runId`-optional, never as a blanket row-class exemption → the doctor-facet test in
  tests/verdict-gatered-no-workflow.test.js
- **AC-20260813-03-10**: WHEN `--workflow` is passed THE SYSTEM SHALL CONTINUE TO derive every
  existing word and ledger shape unchanged (REVIEWER_FAILED precedence, disposition math,
  CLEAN/FINDINGS/HARD_FINDINGS, full row keys) → tests/review/verdict.test.js

## Assumptions (escalation triggers)

- A1: `spec-paths claims-lint` resolves to the script inside the plugin tree in every install
  layout, so `__dirname` is always inside a tree whose parent holds `doctrine/` and `commands/`
  — true in this repo (`spec/scripts/`) and in plugin installs (`<plugin>/scripts/`); the D1
  upward walk additionally recovers full repo-root semantics wherever the marketplace repo
  exists. Executed evidence (refuter, 2026-08-13): `--root .` reports a fully clean corpus
  (0 findings), so the AC-1 parity assertion has a meaningful baseline; both corpus pointer
  conventions (`spec/…` and `tests/…`) resolve today only against the repo root. **if false
  (a layout separates scripts from doctrine entirely):** STOP and ask — no silent fallback.
- A2: No File Plan row in any live host legitimately contains `*`, `?`, or `[` as literal
  filename characters — glob metachars in a row always mean a pattern. **if false:** the row
  matches itself under `globMatch` anyway (a literal path is a pattern matching exactly itself),
  so behavior degrades to today's, never worse.
- A3: `tests/review/verdict.test.js`'s existing pins all pass `--workflow` (verified by grep
  during planning), so D3 is purely additive to them. **if false:** the affected pin is a
  documented-contract change — escalate, never weaken silently (host escalation trigger).
- A4: doctor.md's check 12 slice markers (`12. **Run ledger hygiene` / `13. **Scaffold audit`)
  survive the edit — D4 adds a clause inside the block without renaming headings. **if false:**
  update the slice bounds in tests/verdict-gatered-no-workflow.test.js (a File Plan row already
  owns that file).
- A5: The `claims-baseline.json` re-stamp covers doctor.md's delta only — claims-lint.js is a
  script, outside the claims corpus. **if false (ratchet flags more):** re-run
  `--update-baseline` and include the full hunk in the same commit.

## Rationale

T3 by the host rubric — all three scripts are named T3 triggers (sole derivations of the claims
ratchet, the scope reconciliation, and the verdict word). Tier A intensity: each fix is a
contract mismatch between what doctrine documents and what the script executes, so the fixes are
full-strength with no advisory staging. D1 rejects the alternative of doctor passing `--root`
(a call-site patch would leave every other future caller — CI, tests, hosts — re-payable; the
script owning its own home is the root cause fix) and rejects auto-detecting the marketplace
repo vs installed layout by directory *name* (fragile; `__dirname` anchoring is
layout-independent). D2 rejects banning glob rows outright (codegen outputs are legitimately
enumerable only by pattern; prax hit this twice in three days) and rejects expanding globs at
parse time inside `lib/file-plan.js` (parseFilePlan serves other consumers — hotspot targeting —
where literal rows are wanted; the match belongs at the comparison site). D3 keeps the guard's
protective intent: the only newly-legal invocation is the one review.md documents (manifest-only
red stops); a green run without a panel remains exit 2 — this asymmetry is the whole design.
D4 deliberately refuses the blanket row-class exemption prax's symptom suggested: an
in-workflow red iteration still mints a runId and must keep it; only the pre-panel stop is
structurally id-less. Fragile: the no-workflow ledger row's key set — release-profile precedent
says partial rows are fine, but any consumer newly assuming `findings` exists on every review
row would break; review.md's row-shape prose already scopes the full shape to panel-backed rows
(and spec 02, which follows this spec, re-touches that prose).

Adversarial-check adjudications (2026-08-13, two blind refuters, both executing repros):
ACCEPTED and folded — the eager `requiredLegs` NPE site outside `derive()` (both refuters
reproduced the crash on AC-7's own invocation; D3 now names all three guard sites and the
Contract shows the guarded ternary); the `resolvePath` breakage under naive `PLUGIN_HOME`
anchoring (both refuters executed it: all 7 live `enforcedBy:` markers — `spec/…` and
`tests/…` conventions — resolve only against the repo root; D1 now runs the upward walk to
recover full repo-root semantics in dev, `skippedPointers` accounting for unshipped trees in
installed hosts, and AC-1/2 gained findings-parity assertions so a stale-pointer flood cannot
ship green); the `unrealized`-vs-`excludedSet` ordering gap (D2 now pins the match set).
No findings rejected.

## Canonical Delta

None — plugin doctrine edits are the delta itself (repo precedent).
