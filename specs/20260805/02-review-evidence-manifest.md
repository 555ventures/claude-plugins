---
date: 2026-08-05
status: done
open_markers: 0
risk: T3
area: review
design: false
breaking: false
depends_on: [01-review-scope-reconciliation.md]
depended_on_by: [03-done-unobserved-observation.md]
brief: n/a
spiked: 2026-08-05
---

# Evidence manifest — the review verdict is derived, never asserted

## Goal

Today `/spec:review` can say CLEAN with nothing executed: a zero-findings panel returns
CLEAN from the workflow, and the CLEAN definition (review.md:153-156) is prose a model
applies, not a value a script computes. This spec makes every verdict a **derived value**:
Phase 0 legs append machine-readable rows to a per-iteration evidence manifest, a new
`verdict.js` derives the verdict word from manifest + workflow return + dispositions, and
the command may only print/ledger the word the script emitted. CLEAN-with-an-empty-manifest
becomes unrepresentable, and so does CLEAN-on-stale-evidence (each fix iteration re-executes
its legs into a fresh manifest). CI status becomes one manifest row backed by a shared
`ci-query.js` (red = hard stop, unavailable = note, never block). `/spec:release` adopts the
same derivation under a release profile. Done means: no path exists on which the verdict
word originates in model prose or in evidence older than the code it judges.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Manifest = JSONL file created fresh (`mktemp`, like `patternsPath`) per verdict derivation — one per full review AND one per fix-delta iteration; each executed leg appends one row `{"leg","exit","observed"}` (`observed` ≤ 120 chars, counts/enums/short strings; NO command string — commands live in doctrine, keeping rows well under the 512-byte darwin PIPE_BUF so single-`printf` appends stay atomic). Review-profile legs: `gate`, `smoke`, `reconcile`, `ac-matrix`, `skip-reconcile`, `ci` (+ `patterns` always recorded; `drift` when config declares it; `design-*` when design-bound). On each fix-delta iteration the orchestrator RE-RUNS `gate`, `smoke`, `ac-matrix`, `skip-reconcile`, and `ci` into the new manifest (this is the existing fix-delta full-gate-reassertion rule made mechanical); `reconcile` is full-scope-only (01/D7). | Fresh-per-iteration manifests make stale evidence structurally unrepresentable — the refuter-demonstrated hole where a fix-delta CLEAN rode pre-fix gate rows; dropping the command string is what makes the append-atomicity claim actually computed, not asserted. |
| D2 | New script `spec/scripts/verdict.js --manifest <path> --workflow <path> [--waived N --rejected N --fixDispatched N] [--ledger --spec <path> --tier <T> --diff-loc N --iteration N]` prints exactly one verdict word on stdout line 1; `--ledger` additionally prints the complete run-ledger row JSON (one row per Phase-1 invocation — fix iterations each get a row, preserving the calibration history). Row fields the manifest can't know arrive as mechanical flags (`--spec/--tier/--diff-loc/--iteration` — all derived by the orchestrator from git/frontmatter, none judgment); `smoke` and `testsSkipped` are derived FROM manifest rows, whose `observed` formats are therefore pinned: smoke leg `observed ∈ pass|inert`, gate leg `observed = "skips=N todos=M"`. The survivor count is READ from the workflow file (`survivors.length`), never passed as a flag; `waived + rejected + fixDispatched > survivors.length` is a contradiction → exit 2. Exit codes: 0 = derived CLEAN · 1 = derived non-CLEAN word (still printed) · 2 = usage/unparseable/contradictory inputs. | One derivation produces word + ledger row — which requires every row field to have a specified source (blind-spot finding: `diff.loc`/`smoke`/`testsSkipped` had none); grounding the survivor count in the workflow file closes the typed-flag Goodhart hole; the 0/1 exit split lets close/merge steps gate on `$?` at shell level. |
| D3 | Derivation order (first match wins): workflow verdict `REVIEWER_FAILED` → `REVIEWER_FAILED`; any required leg missing from the manifest, or manifest empty/unparseable rows → `UNVERIFIED`; a red **blocking** leg — `gate`, `smoke` (exit 4 = inert counts green), or `ci` — → `GATE_RED`; any `fixDispatched > 0` → `FINDINGS` (a dispatched fix is non-terminal — CLEAN is only reachable via the next iteration's fresh derivation); undispositioned survivors (`survivors.length - waived - rejected - fixDispatched > 0`) → `HARD_FINDINGS` if any undispositioned survivor's severity is `hard`, else `FINDINGS` (medium and soft both land here — the workflow's severity enum is `hard|medium|soft`); else → `CLEAN`. `reconcile`, `ac-matrix`, and `skip-reconcile` are **findings-producing legs**: their non-zero exits mean "findings emitted", count as executed-green for leg purposes, and their findings ride the normal disposition flow — only `gate`/`smoke`/`ci` block. Required legs: `gate`, `smoke`, `reconcile`, `ac-matrix`, `skip-reconcile`, `ci`; on `scope: fix-delta`, `reconcile` is not required. | CLEAN is the residual state — reachable only by exhausting every failure branch against recorded evidence. The findings-producing/blocking split resolves the refuter-demonstrated dead-end where a waived uncovered-AC finding could never return to CLEAN; naming `medium` explicitly closes the fall-through-to-CLEAN gap. |
| D4 | New script `spec/scripts/ci-query.js --branch <name> [--root <dir>]` wraps `gh run list --branch {branch} --limit 1 --json status,conclusion,headSha,url,updatedAt` and prints normalized JSON `{"available":bool,"transient":bool,"status","conclusion","sha","url","runAt"}`: gh missing / no remote / `[]` → `available:false, transient:false` (structural — no CI to consult); gh executes but exits non-zero → `available:false, transient:true` (auth/network — retryable); otherwise the run's fields. The review `ci` leg maps this to its manifest row: conclusion in {failure, timed_out, cancelled} → exit 1 (red — review.md hard-stops pre-panel with "fix CI first"); `available:false` (either kind) → exit 0, `observed:"unavailable"` / `"unavailable-transient"`; status not completed → exit 0, `observed:"in-progress"`. Spec 03's `observe-ci.js` consumes the same script. | Spiked 2026-08-05 (A1): all five field names accepted, `[]` exit 0 on a CI-less repo, and an invalid field name errors exit 1 — so the raw-vs-mapped distinction is real and needs exactly one home; two independent gh wrappers (review + observe) was the drift seam spec 03's refuters flagged from the other side. |
| D5 | Ledger verdict enum becomes the derived set `CLEAN | FINDINGS | HARD_FINDINGS | REVIEWER_FAILED | UNVERIFIED | GATE_RED`; the undocumented `SURVIVORS` mapping is retired. Ledger row gains `"legs":[{"leg","exit"}]`. Historical rows keep their old enum; consumers match on stage, not verdict (verified: doctor.md nowhere greps `SURVIVORS`). | The enum mismatch between wf-review's return and review.md's documented row was an implicit mapping — exactly an asserted-not-derived seam. |
| D6 | review.md's CLEAN-definition prose (153-156) and verdict-assembly instructions are REPLACED by: build the manifest in Phase 0, hard-stop on a red blocking leg before dispatching the panel — and the hard-stop path STILL runs `verdict.js --ledger` and appends its `GATE_RED` row (a stopped attempt is never invisible to doctor's correlations or the observation derivation) — at each iteration close run `verdict.js --ledger`, print the word verbatim, append the row verbatim, and gate the Phase 3 close on `verdict.js` exit 0. Two existing pinned sentences are UPDATED in place, not deleted — the smoke-leg requirement (pinned by tests/run-ledger.test.js:88 `/boot smoke leg green/i`) and "never write CLEAN on a row whose survived is non-zero" (pinned at run-ledger.test.js:39-40) — with their pins updated to the new wording in the same File Plan row pair. One sentence in shared.md § Runtime Verification ("CLEAN requires it") is updated to cite the derivation instead of asserting it independently (section heading untouched — no § citation breakage). | The word must have exactly one origin on EVERY path including early stops (blind-spot finding: doctor check 12's tier-distribution and escape correlations assume each attempt leaves a row); the pins guard real invariants that survive the rewrite; the shared.md sentence was a second free-standing assertion of the CLEAN definition. |
| D7 | release.md adopts `verdict.js --profile release` with required legs `deploy`, `ready`, `e2e`, `journeys`, `substrate`, `production` (`production`: verified → exit 0; failed → exit 1; user-declined promote → exit 0 `observed:"skipped"`). Fail-fast is preserved: a Phase 2/3 leg failure still STOPs the run immediately — but the STOP path appends the red row and quotes `verdict.js --profile release --ledger` output (word `GATE_RED` + row) as its report, and the success path runs the same call in Phase 4; the verdict word has one origin on every path. `/spec:doctor` stays out of scope — it emits a report, not a verdict word. | The refuter-found gap: Phase 3's "promote that cannot be verified serving is a failure" lived outside the derivation, and inline STOPs were a second verdict origin; folding both in makes AC-7's "sole origin" claim true on failing runs too. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/verdict.js | CREATE | scripts | D2/D3/D7 derivation; header + exit codes per Worker Rules |
| spec/scripts/ci-query.js | CREATE | scripts | D4 normalized gh wrapper (shared with spec 03); header + exit codes |
| spec/bin/spec-paths | MODIFY | scripts | add `verdict` + `ci-query` keys + usage line |
| spec/commands/review.md | MODIFY | doctrine | D1 manifest lifecycle + per-iteration re-runs, D4 ci leg + hard stop, D6 verdict/ledger wiring incl. the two updated pinned sentences; DELETE replaced CLEAN/verdict prose (net lines down) |
| spec/commands/release.md | MODIFY | doctrine | D7 release profile incl. STOP-path wiring; DELETE replaced fail-closed verdict prose |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | gate row: verdict derivation + annotate the three existing rows whose enforcement re-homes into verdict.js (fail-closed reviewer, boot smoke leg, skipped-test reconciliation) with a pointer to the new row |
| spec/doctrine/shared.md | MODIFY | doctrine | § Runtime Verification: one sentence updated to cite the derivation (D6); heading untouched |
| .claude/rules/spec-pipeline.md | MODIFY | doctrine | § Risk Tiers: add verdict.js to this repo's sole-derivation T3 surfaces |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | bump 6.40.0 + description line |
| tests/review/verdict.test.js | CREATE | tests | AC-20260805-02-1 … AC-20260805-02-5, AC-20260805-02-9 |
| tests/review/ci-query.test.js | CREATE | tests | AC-20260805-02-10 (fake-gh exec tests) |
| tests/review/verdict-doctrine.test.js | CREATE | tests | AC-20260805-02-6, AC-20260805-02-7 |
| tests/run-ledger.test.js | MODIFY | tests | AC-20260805-02-8 (schema pins: new enum + legs field; migrate the two D6 pins to the new wording) |
| tests/spec-paths.test.js | MODIFY | tests | pin the new `verdict` + `ci-query` keys |

## Contracts

```
manifest row (JSONL):  {"leg":"gate","exit":0,"observed":"skips=0 todos=0"}   // no command field
verdict.js stdout:     line 1 = CLEAN|FINDINGS|HARD_FINDINGS|REVIEWER_FAILED|UNVERIFIED|GATE_RED
                       with --ledger: line 2 = the complete run-ledger row JSON
                       exit 0 = CLEAN · 1 = any other derived word · 2 = bad/contradictory inputs
--workflow input:      the wf-review return object written to a temp file by the orchestrator.
                       NOTE: the REVIEWER_FAILED return has NO verify object (wf-review.body.js:209-212)
                       — verdict.js must branch on verdict before touching verify/survivors.
ci-query.js stdout:    {"available":bool,"transient":bool,"status":...,"conclusion":...,
                       "sha":...,"url":...,"runAt":...}   · exit 0 = answered (either way) · 2 = usage
ledger row (additive): …existing review-row fields… ,"legs":[{"leg":"gate","exit":0},…]
                       "verdict" now ∈ D5 enum; still one row per Phase-1 invocation
release profile:       verdict.js --profile release --manifest <path>  (no --workflow)
                       required legs deploy|ready|e2e|journeys|substrate|production
                       word ∈ CLEAN|GATE_RED|UNVERIFIED
```

## Behavior

- Phase 0 legs already run in parallel (after 01's reconcile-first step); each now ends by
  appending its manifest row. `{manifestPath}` is a fresh `mktemp` file created alongside
  `{patternsPath}` at iteration start — never reused across iterations; stale rows cannot
  exist by construction. A leg that crashes before its append reads as missing →
  `UNVERIFIED` naming the leg (fail-closed; crash vs never-dispatched are deliberately not
  distinguished — the remedy, re-run the leg, is the same).
- Hard-stop ordering: after Phase 0 joins, review.md checks the manifest for red blocking
  rows (`gate`/`smoke`/`ci`) BEFORE invoking wf-review — panel spend is not incurred on a
  red substrate. The stop still runs `verdict.js --ledger` (workflow file absent → the
  derivation reaches `GATE_RED` before needing it) and appends the row — every attempt
  leaves a ledger trace. Findings-producing legs (`reconcile`, `ac-matrix`,
  `skip-reconcile`) never hard-stop; their findings enter Phase 2 dispositions.
- Dispositions: the orchestrator passes only `--waived/--rejected/--fixDispatched`;
  survivors come from the workflow file. A run with `fixDispatched > 0` derives `FINDINGS`
  and proceeds to the fix-delta iteration — CLEAN is only reachable from a fresh iteration
  whose own manifest and workflow return derive it.
- `UNVERIFIED` and `GATE_RED` are never soft outcomes: review.md presents them with the
  missing/failing leg named and the remedy; exit 1 means the close/status-flip/merge-back
  path is mechanically unreachable (the close step requires `verdict.js` exit 0).
- Release: Phase 2/3 legs append rows as they execute; both the STOP path and Phase 4 quote
  `verdict.js --profile release --ledger` for word + row.

## Acceptance Criteria

- **AC-20260805-02-1**: WHEN the manifest is empty or missing a required leg THE SYSTEM
  SHALL derive `UNVERIFIED`, exit 1, and never `CLEAN` (manifest with only
  `{"leg":"gate","exit":0}` + zero-findings workflow return → `UNVERIFIED`) → exec test in
  tests/review/verdict.test.js
- **AC-20260805-02-2**: WHEN all required legs are green (smoke exit 4 counts green-inert)
  and the workflow verdict is CLEAN THE SYSTEM SHALL derive `CLEAN` and exit 0 (six green
  rows + `{"verdict":"CLEAN",…}` → `CLEAN`, exit 0) → exec test in
  tests/review/verdict.test.js
- **AC-20260805-02-3**: WHEN the `ci` leg is red THE SYSTEM SHALL derive `GATE_RED` (exit 1)
  even with a CLEAN workflow return; WHEN `ci` observed `unavailable` with exit 0 THE
  SYSTEM SHALL treat it as satisfied; WHEN `ac-matrix` exits non-zero (findings emitted)
  with those findings waived THE SYSTEM SHALL still be able to derive `CLEAN` → exec test
  in tests/review/verdict.test.js
- **AC-20260805-02-4**: WHEN undispositioned survivors remain THE SYSTEM SHALL derive by
  highest undispositioned severity with `medium` landing in `FINDINGS` (3 survivors in the
  workflow file, `--waived 1`, remaining severities `medium`+`soft` → `FINDINGS`; remaining
  `hard` → `HARD_FINDINGS`); WHEN `--fixDispatched` is non-zero THE SYSTEM SHALL derive
  `FINDINGS` even if it equals the survivor count (fix is non-terminal) → exec test in
  tests/review/verdict.test.js
- **AC-20260805-02-5**: WHEN `--ledger` is passed THE SYSTEM SHALL print a row whose
  `verdict` equals line 1 and whose `legs` mirror the manifest name+exit pairs exactly
  → exec test in tests/review/verdict.test.js
- **AC-20260805-02-6**: WHEN review.md is read THE SYSTEM SHALL contain the fresh-manifest-
  per-iteration lifecycle, the per-iteration leg re-runs, the pre-panel red-leg hard stop
  WITH its ledger append (a stopped attempt leaves a `GATE_RED` row), the verbatim-quote +
  exit-0-gates-close rules, and NO surviving prose defining CLEAN independently of
  `verdict.js` (regex pins incl. a negative pin on the old CLEAN-⇔ sentence, plus the two
  migrated D6 pin sentences present in new wording) → tests/review/verdict-doctrine.test.js
- **AC-20260805-02-7**: WHEN release.md is read THE SYSTEM SHALL wire
  `verdict.js --profile release --ledger` as the verdict origin on BOTH the STOP path and
  Phase 4, with `production` among required legs (regex pins) →
  tests/review/verdict-doctrine.test.js
- **AC-20260805-02-8**: WHEN a review ledger row is authored per the new schema THE SYSTEM
  SHALL CONTINUE TO satisfy the existing hygiene pins (single line, counts/enums only,
  parseable) with `legs` present and `verdict` in the D5 enum → extend
  tests/run-ledger.test.js (tag with this AC-ID)
- **AC-20260805-02-9**: WHEN `--waived`+`--rejected`+`--fixDispatched` exceed the workflow
  file's `survivors.length` THE SYSTEM SHALL exit 2 without printing a verdict word
  (2 survivors, `--waived 3` → exit 2, stderr names the contradiction) → exec test in
  tests/review/verdict.test.js
- **AC-20260805-02-10**: WHEN gh is absent THE SYSTEM SHALL print
  `{"available":false,"transient":false,…}`; WHEN a fake gh exits non-zero THE SYSTEM SHALL
  print `transient:true`; WHEN fake gh prints a completed run THE SYSTEM SHALL pass through
  status/conclusion/sha/url/runAt (fake-gh-on-PATH exec tests) → tests/review/ci-query.test.js

## Assumptions (escalation triggers)

- A1: gh field names — **executed 2026-08-05** in this repo (remote present, no CI):
  `gh run list --branch main --limit 1 --json status,conclusion,headSha,workflowName,updatedAt`
  → `[]` exit 0, and separately `--json status,conclusion,headSha,url,updatedAt` → `[]`
  exit 0 — all fields D4 uses are accepted; a refuter additionally executed
  `--json bogus` → stderr `Unknown JSON field` exit 1, grounding the `transient` branch.
  **if false on a host** (older gh): drop the missing field; the mapping needs only
  `status`+`conclusion`.
- A2: doctor check 12's ledger passes don't match on the verdict enum (verified: no
  `SURVIVORS` hits in doctor.md; INTAKE.md:106 mentions it only as inert history). **if
  false:** update the affected jq snippet in the same diff.
- A3: Single-`printf` JSONL appends of ≤ ~200-byte rows are atomic in practice on darwin
  and linux local filesystems (rows carry no command string per D1 — the refuter computed
  that command-bearing rows could reach 632 bytes and exceed darwin's 512-byte PIPE_BUF;
  the schema change is the fix, not an assumption). **if false:** per-leg row files
  concatenated at join — same contract, no schema change.
- A4: wf-review.body.js needs no edit (verdict.js consumes its return; spec 01 already
  changed its prompt). **if false:** STOP — a workflow edit here collides with 01's rows
  and the series slicing must be revisited by the user.
- A5: The `{testDirs}` gate glob for this spec resolves to
  `'tests/review/*.test.js' tests/run-ledger.test.js tests/spec-paths.test.js` (Gotcha:
  directory form fails on Node 26 — use globs/files). **if false:** list files explicitly.

## Rationale

This is the reporter's finding 2 plus CI preflight, landed structurally instead of as two
patches: the root cause was never "no CI check" or "zero-findings CLEAN" individually — it
was that the verdict word originated in prose. Deriving word+ledger-row from one script
kills the class; the refuter round then killed three second-order variants the first draft
still carried: stale evidence (fix-delta iterations reusing pre-fix leg rows — now
structurally impossible via fresh-per-iteration manifests), ungrounded disposition counts
(survivor count now read from the workflow file, contradictions exit 2, fixDispatched
non-terminal), and the disposition dead-end (findings-producing legs no longer block).
`UNVERIFIED` vs `GATE_RED` split matters: one means "evidence missing", the other
"evidence says red" — conflating them (the old `waitForExit` sentinel collapse, same
shape) is how signal-death read as timeout. The 0/1/2 exit alphabet exists so the close
path is shell-gated, not prose-gated.

Adversarial-check dispositions (2026-08-05, two refuters): FIXED — findings-producing-leg
dead-end, `medium` severity fall-through, run-ledger pin collision (D6 now migrates both
pins), release Phase-3/STOP second-origin (D7), ci-leg implementation home (ci-query.js,
shared with spec 03), fix-delta stale evidence (D1 fresh manifests + re-runs), ungrounded
disposition flags (D2), manifest lifecycle ambiguity (D1), per-iteration ledger multiplicity
made explicit (D2), CLEAN-vs-stop exit codes (D2), PIPE_BUF row size (D1 drops the command
field, per the refuter's computed 632-byte counterexample), REVIEWER_FAILED verify absence
noted in Contracts; from the blind-spot sweep — hard-stop paths now ledger their GATE_RED
row (D6), the ledger row's `diff.loc`/`smoke`/`testsSkipped` sources are specified (D2),
the three scaffold-ledger rows whose enforcement re-homes here get pointers, and shared.md's
free-standing CLEAN sentence is folded into the derivation. REJECTED — "no deterministic
gate confirms the orchestrator invoked verdict.js at all" (the accepted doctrine-as-data
limitation this repo's dual red-team already adjudicated; exit-0-gates-close plus AC-6 pins
are the sanctioned depth, and the claims-registry brief owns the general problem). OUT OF
SCOPE, recorded: the autopilot daemon narrates any review result with a ✅ prefix regardless
of verdict word (session.js classifies by SDK subtype, not text) — an autopilot-plugin
defect this spec makes more visible but does not own; it needs its own intake row.

Review dispositions (2026-08-06): the 2-reviewer panel returned 5 demonstrated hard
findings collapsing to two defects — (A) the review `--ledger` row omitted
`runId`/`smoke`/`testsSkipped` and left disposition counts flat instead of nested under
`findings`, breaking escape.md's `reviewRunId`/`findings.killed` correlation; (B) the
release-profile row carried none of the milestone/briefs/staging/e2e/journeys/substrate/
production fields release.md documents. Both FIXED (verdict.js `--run-id`/`--milestone`/
`--briefs` flags + manifest-derived fields; release.md observed formats pinned;
7 exec-test pins added; bump 6.40.1); fix-delta re-review CLEAN. A post-CLEAN dogfood run
of `verdict.js --ledger` against the real wf-review return caught two residual
off-template shapes — `findings.killed` as array, `tokens` flat — normalized in the same
close with their own exec-test pins. WAIVED: the mechanical out-of-plan finding on
`docs/roadmap/00-overview.md` + `01-claims-registry.md` — untracked roadmap-planning
artifacts from another session, not build output (repeats spec 01's recorded waive).

Deviations folded (2026-08-06, one-off): the tests batch kept the two D6-pinned sentences'
regexes verbatim as invariant pins rather than inventing replacement wording the spec never
specified; the doctrine batch landed review.md +55 / release.md +28 lines against the File
Plan's "net lines down" prediction because AC-6/AC-7's pinned prose (manifest lifecycle,
hard-stop ledger append, two-path release wiring) outweighed the deleted CLEAN prose —
line-count predictions in File Plan summaries are estimates, not contracts.

## Canonical Delta

docs/canonical/review.md: append — "The verdict word and the ledger row are both emitted by
`verdict.js` from the per-iteration evidence manifest (fresh mktemp file; legs re-executed
each iteration) + workflow return + dispositions; survivor counts come from the workflow
file, never flags; `UNVERIFIED` = required leg missing, `GATE_RED` = blocking leg red; only
`gate`/`smoke`/`ci` block — `reconcile`/`ac-matrix`/`skip-reconcile` emit dispositionable
findings; CI status flows through `ci-query.js` (also used by observe-ci) — red blocks
pre-panel, unavailable never blocks; verdict.js exit 0 is the only door to Phase 3 close."
