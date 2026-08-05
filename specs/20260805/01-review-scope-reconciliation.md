---
date: 2026-08-05
status: implementing
open_markers: 0
risk: T3
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [02-review-evidence-manifest.md]
brief: n/a
spiked: 2026-08-05
---

# Review scope reconciliation — full diff, File Plan as prediction under test

## Goal

`/spec:review` currently diffs only the directories named in the spec's File Plan, so any
edit outside the plan is never seen by a reviewer — the structural gap behind the confirmed
2026-08 host escape (an out-of-plan `waitForExit` edit rode a CLEAN verdict into production).
This spec makes review diff the **whole** change and mechanically reconcile it against the
File Plan's prediction: out-of-plan files become findings AND get reviewed; planned-but-
untouched files become findings too. Done means: no file can change without either appearing
in the File Plan or surfacing as a disposition-requiring finding, enforced by a script, not
by reviewer diligence.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/scope-reconcile.js` computes the reconciliation: changed files (committed diff ∪ untracked) vs File Plan paths, minus pipeline-owned exclusions. `--json` output `{outOfPlan:[], unrealized:[], excluded:[]}`. Exit 0 = reconciled, 3 = out-of-plan files present, 2 = usage/parse error. | Deterministic carrier for the scope guarantee; rejected alternative — prompt the reviewer to "also look outside the plan" — is exactly the asserted-not-derived prose this series retires. |
| D2 | `parseFilePlan`/`splitPlanCell` move from `spec-status.js` into a new `spec/scripts/lib/file-plan.js`; both `spec-status.js` and `scope-reconcile.js` require it. CLI behavior of `spec-status.js` is byte-identical. | Single derivation of File Plan parsing (v6.20.0 rule generalized); rejected — duplicating the parser — is how the two derivations drift apart. |
| D3 | Changed-file set = `git diff --name-status {base}` (both sides of rename/copy rows) UNION untracked paths from `git status --porcelain` (`??` lines). A rename whose old path was planned realizes that plan row, and its new path inherits in-plan status — renames surface in the `renamed` output field, never as an out-of-plan + unrealized finding pair. | Spiked 2026-08-05: `git diff` omits untracked files entirely (A2), and `--name-only` reports only a rename's NEW path (refuter-executed: `git mv planned.js renamed.js` → `--name-only` prints `renamed.js` alone, `--name-status` prints `R079 planned.js renamed.js`) — without both sides, a routine planned-file rename would spuriously produce a hard finding plus a soft finding for one coherent change. |
| D4 | Pipeline-owned exclusions: built-in defaults `specs/**` and `.claude/spec-runs.jsonl` only, plus an optional additive `pipelineOwnedPaths` (array of globs) key in `.claude/spec.config.json`. This repo's own config adds `spec/workflows/wf-*.js` (generated surface changes with its source every run). | The pipeline legitimately writes spec docs/sidecars and the ledger outside every File Plan; anything beyond that must surface. Defaults are deliberately minimal — over-excluding recreates the blind spot. |
| D5 | No edit to `spec/templates/grounding-contract.md`. `pipelineOwnedPaths` is optional with script-internal defaults; `/spec:init` does not generate it. | A contract-hash change flags every host's grounding stale for an optional knob — cost without benefit. |
| D6 | Reviewer prompt in `wf-review.body.js` switches to unscoped `git diff ${args.base}`; new workflow arg `reconcilePath` (path string, `''` on fix-delta scope) points at the Phase 0 reconcile JSON; the prompt instructs: review out-of-plan files' content against spec intent and repo rules — their existence is already a mechanical finding, don't re-report it. | The diff instruction was self-contradictory (prompt promised "spec drift" coverage its own diff command made impossible — wf-review.body.js:91 vs :105). Args stay within the closed alphabet (a path). |
| D7 | Phase 0 of review.md runs the script; exit 3 yields ONE mechanical **hard** finding grouping all out-of-plan files; non-empty `unrealized` yields ONE mechanical **soft** finding (plan overshoot). Both enter Phase 2 dispositions (fix/waive/reject) exactly like AC-coverage findings. | Grouped findings keep disposition cost O(1) per class; hard for out-of-plan matches the AC-matrix precedent (a plan miss is spec drift, waivable with recorded reason). |
| D8 | The mechanical pattern sweep (`patternsScript`) scopes to the directories of **actually changed files**: Phase 0 runs `scope-reconcile.js` FIRST (sub-second — pure git + one file parse), then launches the parallel background legs, passing `scope-reconcile --dirs` output where `{dirs from the spec's File Plan}` sits today. No second derivation of the changed set exists anywhere. | Same prediction-vs-reality inversion: sweeping predicted dirs misses the out-of-plan dirs that most need sweeping; the brief serialization is the price of a single derivation — re-deriving the set inline in review.md prose was rejected as the exact drift seam this series retires. |
| D9 | `/spec:build`'s Final gate additionally runs `scope-reconcile.js --json` as an ADVISORY: non-empty `outOfPlan` prints one ⚠️ line naming the files and pointing at the existing out-of-scope-failure fork row (build.md:163) — report-only, never blocks, no new fork. | Build already owns an out-of-scope prose fork; giving it the same mechanical signal review uses means drift surfaces before checkpoint-commit instead of retroactively at review (blind-spot finding) — at zero new machinery. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/file-plan.js | CREATE | scripts | extracted `parseFilePlan`/`splitPlanCell` (verbatim move, D2) |
| spec/scripts/spec-status.js | MODIFY | scripts | require the lib; delete the moved functions; CLI behavior identical |
| spec/scripts/scope-reconcile.js | CREATE | scripts | D1/D3/D4 reconciliation; header comment + exit-code alphabet per Worker Rules |
| spec/bin/spec-paths | MODIFY | scripts | add `scope-reconcile` key + usage line |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D6: unscoped diff, `reconcilePath` arg + prompt lines; regenerate wf-review.js via `npm run build:workflows` (never a File Plan row) |
| spec/commands/review.md | MODIFY | doctrine | Phase 0 reconcile-first ordering + D7 mechanical findings + D8 sweep scoping + `reconcilePath` in BOTH args-contract occurrences (Phase 1 block AND the Rules restatement at review.md:300-301); DELETE the File-Plan-scoped diff/sweep prose it replaces (net doctrine lines must go down) |
| .claude/spec.config.json | MODIFY | doctrine | this repo's `pipelineOwnedPaths: ["spec/workflows/wf-*.js"]` (D4) |
| spec/commands/build.md | MODIFY | doctrine | D9 Final-gate advisory reconcile line (report-only) |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Risk Tiers: add scope-reconcile.js to this repo's sole-derivation T3 surfaces |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | new gate row for scope reconciliation with promote/retire condition |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | bump 6.39.0 + description changelog line |
| tests/review/scope-reconcile.test.js | CREATE | tests | AC-20260805-01-1, AC-20260805-01-2, AC-20260805-01-3, AC-20260805-01-4 |
| tests/review/review-scope-doctrine.test.js | CREATE | tests | AC-20260805-01-5, AC-20260805-01-6 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260805-01-7 (tag existing CLI-output test with the AC-ID) |
| tests/spec-paths.test.js | MODIFY | tests | pin the new `scope-reconcile` key |

## Contracts

```
scope-reconcile.js [--root <dir>] --base <ref> --spec <path> [--json | --dirs]
  stdout (--json): {"outOfPlan":[], "unrealized":[], "excluded":[], "renamed":[{"from","to"}]}
  stdout (--dirs): unique directories of the changed-file set, one per line (D8 input)
  changed set = paths from `git diff --name-status <base>` (BOTH sides of R/C rows)
                ∪ `??` paths from `git status --porcelain`
  outOfPlan   = changed set \ FilePlanPaths \ pipelineOwned — where a rename's new path
                counts as in-plan when its old path was planned (the rename realizes the
                planned row; it is reported in `renamed`, never as a finding pair)
  unrealized  = FilePlanPaths \ changed set — a plain set difference over the SAME flat path
                list parseFilePlan already returns (a DELETE row is realized by its deletion
                appearing in --name-status; generated files never get File Plan rows per
                pipeline rules § Planning, so no Action/annotation awareness exists or is
                needed — parseFilePlan strips parentheticals and reads only the path column,
                pinned by tests/spec-status.test.js:466-485, and this spec keeps that)
  excluded    = changed files matched by pipelineOwned globs (visibility, never silent)
  Exit codes: 0 = outOfPlan empty · 3 = outOfPlan non-empty · 2 = usage/unreadable spec/no File Plan
  pipelineOwned = ["specs/**", ".claude/spec-runs.jsonl"] ∪ config.pipelineOwnedPaths (additive)

lib/file-plan.js  module.exports = { parseFilePlan, splitPlanCell }   // verbatim from spec-status.js

wf-review args (additive): reconcilePath: string  // path to --json output; '' when scope==='fix-delta'
```

## Behavior

- review.md Phase 0, after diff-base derivation and BEFORE the parallel leg group: run
  `node "$(spec-paths scope-reconcile)" --root {root} --base {base} --spec {spec path} --json > {reconcilePath}`,
  then `--dirs` (same invocation flags) to fill the patternsScript directory list, then
  launch the parallel background legs (D8). Exit 2 stops the run (unreadable spec/plan is a
  preflight defect, not a finding).
- Exit 3 → Phase 2 gains one mechanical hard finding: "out-of-plan changes: {list}" with each
  file's diffstat. `unrealized` non-empty → one mechanical soft finding: "planned but
  untouched: {list}". `excluded` is printed in the verdict presentation (one line), never
  silently dropped.
- Fix-delta scope skips reconciliation (`reconcilePath: ''`) — the fix diff is by definition
  responding to findings; full-scope re-review still reconciles.
- Glob semantics: `**` matches path segments, `*` within a segment; matching is against
  repo-relative paths. This is the first such matcher in the repo (verified — no existing
  script hand-rolls one); keep it ≈15 lines per A5, zero dependencies.
- Renames: `renamed` pairs are printed in the verdict presentation as one informational
  line each (`↷ planned.js → renamed.js`) — visibility without a finding; a rename whose
  old path was NOT planned is just an ordinary out-of-plan new path.
- Edge: a File Plan row whose path is a directory (rare, legacy) counts any changed file
  under it as realizing the row and puts those files in-plan.

## Acceptance Criteria

- **AC-20260805-01-1**: WHEN the diff contains a file absent from the File Plan and not
  pipeline-owned THE SYSTEM SHALL exit 3 and list it in `outOfPlan`
  (File Plan rows `src/a.js`; changed `src/a.js`+`src/b.js` → `{"outOfPlan":["src/b.js"],…}`, exit 3)
  → exec test in tests/review/scope-reconcile.test.js
- **AC-20260805-01-2**: WHEN every changed file is planned or pipeline-owned THE SYSTEM SHALL
  exit 0 with `outOfPlan: []` and list pipeline-owned matches in `excluded`
  (changed `src/a.js`+`specs/20260805/01-x.md` → `{"outOfPlan":[],"excluded":["specs/20260805/01-x.md"]}`, exit 0)
  → exec test in tests/review/scope-reconcile.test.js
- **AC-20260805-01-3**: WHEN a File Plan path has no corresponding change THE SYSTEM SHALL
  list it in `unrealized` and still exit 0 when `outOfPlan` is empty
  (File Plan `src/a.js`+`src/never.js`; changed `src/a.js` → `{"unrealized":["src/never.js"]}`, exit 0)
  → exec test in tests/review/scope-reconcile.test.js
- **AC-20260805-01-4**: WHEN an out-of-plan file is created but never committed (untracked)
  THE SYSTEM SHALL still list it in `outOfPlan` (untracked `src/new.js` in a repo whose diff
  vs base is empty → `{"outOfPlan":["src/new.js"]}`, exit 3)
  → exec test in tests/review/scope-reconcile.test.js
- **AC-20260805-01-8**: WHEN a planned file is renamed in the diff THE SYSTEM SHALL report
  the pair in `renamed` and neither path as a finding (File Plan `src/a.js`; diff
  `R src/a.js src/b.js` → `{"outOfPlan":[],"unrealized":[],"renamed":[{"from":"src/a.js","to":"src/b.js"}]}`,
  exit 0) → exec test in tests/review/scope-reconcile.test.js
- **AC-20260805-01-5**: WHEN wf-review builds the full-scope reviewer prompt THE SYSTEM SHALL
  instruct `git diff ${args.base}` with NO File-Plan directory scoping and SHALL reference
  `args.reconcilePath` (source-shape pin via `extractFn` on the generated-from source)
  → tests/review/review-scope-doctrine.test.js
- **AC-20260805-01-6**: WHEN review.md Phase 0 is read THE SYSTEM SHALL name the
  reconcile-first ordering, the exit-3 → hard-finding wiring, and changed-dir sweep scoping;
  and WHEN build.md's Final gate is read THE SYSTEM SHALL name the advisory reconcile line
  (doctrine regex pins) → tests/review/review-scope-doctrine.test.js
- **AC-20260805-01-7**: WHEN `spec-status.js` runs against a fixture host THE SYSTEM SHALL
  CONTINUE TO produce its current output for `--json`, `--next`, and `--brief` (the lib
  extraction is invisible at the CLI) → tag the existing covering tests in
  tests/spec-status.test.js with this AC-ID (green pre-change; sanctioned pin exception)

## Assumptions (escalation triggers)

- A1: No existing test pins the literal File-Plan-scoped diff prompt line (verified by grep
  across tests/ 2026-08-05 — zero hits for `File Plan|git diff` in the wf-review pin files).
  **if false:** the pinning test is updated in the same File Plan row pair, per Test Rules.
- A2: `git diff --name-only <base>` excludes untracked files. **Executed 2026-08-05** in a
  scratch repo: committed `planned.js` edit + untracked `surprise.js` → diff printed only
  `planned.js`; `git status --porcelain` printed `?? surprise.js`. Basis of D3. **if false:**
  the union is redundant but harmless — keep it.
- A3: `spec-status.js` has no `module.exports` today and is consumed CLI-only (verified by
  grep; tests use `runNode`). The lib extraction breaks no consumer. **if false:** keep the
  moved functions re-exported from `spec-status.js` as a shim and STOP to note the consumer.
- A4: The question-style/state gates don't intercept new Phase 0 legs (they gate prompts and
  state transitions, not preflight bash). **if false:** consult the retainer before rewiring.
- A5: Glob matching needs no dependency — `minimatch` is banned (zero-dependency rule); a
  ~15-line segment matcher suffices for `**`/`*`. **if false (an edge the matcher can't
  express):** tighten the default globs to literal prefixes; never add a package.

## Rationale

The reporter's evidence (out-of-plan `scripts/lib/` edits invisible at review; reviewer
prose promising drift-coverage the diff command withheld) reproduced exactly against
wf-review.body.js:105 vs :91. The fix inverts the File Plan's role: from scope-definer to
prediction-under-test — review always sees reality, and the plan's misses are themselves
findings. Severity split (hard for out-of-plan, soft for unrealized) mirrors the existing
AC-matrix precedent, keeping the disposition UX unchanged. The minimal exclusion default is
deliberate: every additional default glob is a re-opened blind spot, so hosts opt into their
own exclusions visibly in config. D2's lib extraction is the only cross-surface touch; it is
behavior-preserving and regression-pinned by AC-7. Fragile spots to watch during execution:
the glob matcher (keep it dumb), and review.md's line budget — this spec must delete more
scoping prose than it adds (the deletion targets are review.md:38-43 sweep scoping and the
reviewer-method sentences the new leg supersedes).

Adversarial-check dispositions (2026-08-05, two refuters): FIXED — the `unrealized`
DELETE/`(generated)` skip-logic was unimplementable from the verbatim-moved parser (both
refuters; exclusions dropped entirely — a DELETE row is realized by its deletion appearing
in `--name-status`, and generated files never get rows, so the plain set difference is
correct with zero new parsing); rename false-positive pair (refuter-executed `git mv`
evidence; D3 now takes both sides of `--name-status` R rows, new `renamed` field + AC-8);
D8 sweep-scoping had no data path (reconcile now runs before the parallel group and feeds
`--dirs` — single derivation preserved at the cost of a sub-second serialization); glob
"existing style" precedent was false (reworded — first matcher in the repo); the args
contract is restated at review.md:300-301 (File Plan row now names both occurrences).
From the blind-spot sweep: build's Final gate gains the advisory reconcile (D9 — build
already owned this class as a prose fork with no signal), and this repo's pipeline-rules
T3 list gains scope-reconcile.js (a new sole-derivation surface belongs on the list that
exists for exactly that). REJECTED — nothing; every finding was accepted.

## Canonical Delta

docs/canonical/review.md (create if absent): "Review scope is derived, not predicted: the
reviewer diff is unscoped from base; `scope-reconcile.js` reconciles it against the File
Plan; out-of-plan files are hard findings and reviewed content; `pipelineOwnedPaths`
(config, additive over `specs/**` + the run ledger) is the only sanctioned exclusion."
