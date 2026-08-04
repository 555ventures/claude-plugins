# Intake Ledger: Host Findings → Plugin Fixes

The plugin-side half of the feedback loop. Hosts emit findings (feedback briefs in
`docs/spec-feedback/`, `[plugin]`-tagged Gotchas, escape rows); the plugin repo's `/intake`
command triages them into this ledger. This file **ships with the plugin** so host-side
`/spec:doctor` (upstream-fixes check) can compare its rows against the host's stamped
`generatedBy` version and report which findings the host is still working around that a
newer plugin already fixed.

**The intake contract:** an accepted finding is a **failing test first** — reproduced
against this repo's test suite (a fixture host under `tests/fixtures/` where the finding
needs one) before any fix lands. The test is the backlog item, the duplicate key, and the
regression guard; "when did this test start passing" is the `Fixed in` column. A finding
that cannot be reproduced is either host-specific (routed back as a `[host]` gotcha) or not
yet understood (not accepted). Rows predating this contract (the UpWell 2026-07 brief,
absorbed into v5.3.0) cite the scaffold-ledger row or doc test that pins the fix instead —
marked `pre-contract`.

Statuses: `open` (accepted, test failing, fix not landed) · `fixed@<version>` ·
`rejected` (with reason) · `already-fixed` (reporter's version predates the fix).

| ID | Source | Category | Stage | Pinned by | Fixed in |
|---|---|---|---|---|---|
| UPWELL-20260716-01 | UpWell brief Part 1–2 (static-only verification passed a program that cannot boot; 2 CLEAN reviews on a crash-loop) | missing-substrate | review | `tests/smoke-manifest.test.js` (boot smoke leg, fail-closed) | 5.3.0 |
| UPWELL-20260716-02 | UpWell brief 3.2 (skipped tests reported as passes; AC matrix counted collected, not executed) | reporting-integrity | review | `pre-contract` — review.md skip reconciliation + scaffold-ledger "Skipped-test reconciliation" row | 5.3.0 |
| UPWELL-20260716-03 | UpWell brief Part 2 (init stamped complete with Deliverable #6 never written; authored ≠ activated) | reporting-integrity | init | `tests/smoke-manifest.test.js` (manifest-check fail-closed) | 5.3.0 |
| UPWELL-20260716-04 | UpWell brief 3.4 (ADR bound a convention the pinned dependency rejects; spike triggered on felt uncertainty) | doctrine-rot | genesis | `pre-contract` — scaffold-ledger "Shape-triggered micro-spike" row | 5.3.0 |
| UPWELL-20260716-05 | UpWell brief 3.5 (poisoned generated doctrine had no repair path short of full re-init) | doctrine-rot | doctor | `pre-contract` — doctor.md `--fix` repair mode | 5.3.0 |
| UPWELL-20260716-06 | UpWell brief Part 4 (escape ledger existed, qualifying incident occurred, ledger empty — no consumer, no capture trigger) | workflow-defect | escape | `pre-contract` — `preventedBy` field + commit-time capture (git plugin 1.2.0) + scaffold-ledger "Prevention delta" row | 5.3.0 |
| UPWELL-20260716-07 | UpWell brief 3.6 (plugin defects living as host folklore; each host re-pays the discovery) | doctrine-rot | doctor | `tests/feedback-loop.test.js` (provenance tags, brief flush, this ledger) | 5.4.0 |
| UPWELL-20260716-08 | UpWell brief Part 4 (state gate trippable by describing the marker syntax in prose) | workflow-defect | plan | `tests/state-gates.test.js` (frontmatter marker counter authoritative) | 5.3.0 |
| UPWELL-20260716-09 | UpWell brief Part 4 (AC-ID tags collide across specs touching one test file) | template-bug | plan | `pre-contract` — `templates/spec.md` AC-{YYYYMMDD-NN} namespacing | 5.3.0 |
| UPWELL-20260716-10 | UpWell brief 3.7 (designed affordance entered build with spec authority and no spec scrutiny) | workflow-defect | design | `pre-contract` — scaffold-ledger "Affordance ↔ contract reconcile" row | 5.3.0 |
| UPWELL-20260716-11 | UpWell brief Part 3 (per-spec CLEAN verdicts don't compose; no executed milestone gate) | missing-substrate | release | `pre-contract` — commands/release.md + scaffold-ledger "Release stage executed checks" row | 5.3.0 |
| UPWELL-20260716-12 | UpWell genesis run (chain ended with no plannable unit; roadmap hand-authored) | missing-substrate | genesis | `pre-contract` — scaffold-ledger "Roadmap as genesis phase" row | 5.2.0 |
| PRAX-20260717-01 | Prax widened audit (ops-conventions ADR dictation omits naming/identifiers and wire-representations rows; produced the run_id/runId contradiction inside ADR-0012's own output, three divergent id spellings in byte-locked artifacts, a +00:00 timestamp defect, and an unrepresentable bigint — executor exceeded the list once by luck, never reliably) | checklist-gap | genesis | `tests/ops-conventions-rows.test.js` | 6.4.2 |
| PRAX-20260717-02 | Prax brief 2026-07-17 (worktrees live INSIDE the parent repo at `.claude/worktrees/`, so a build worker whose toolchain resolves upward for a project root ran `pnpm gate` against the live parent checkout — another session's uncommitted work — and turbo's shared cache replayed a main-checkout log as a worktree hit; no wf-build prompt pins gate/red-check/self-verify CWD) | workflow-defect | build | `tests/worktree-cwd.test.js` | open |
| UPWELL-20260718-01 | UpWell `[plugin]` gotcha (wf-build tdd-red-check joins repo-root-relative File Plan paths onto a workspace-filtered `pnpm --filter app test`; vitest resolves them inside the workspace, collects zero files, red-check returns conservatively, and every TDD build falls back to direct dispatch — reproduced at `spec/workflows/src/wf-build.body.js` RedCheck phase, which appends `testFiles` verbatim) | workflow-defect | build | `tests/redcheck-workspace-paths.test.js` | 6.29.0 |
| PRAX-20260719-01 | Prax `[plugin]` gotcha (spec 20260713/03-auth D17: a requirement satisfied by a library DEFAULT got an AC pinning the library mechanism that passed before any implementation existed, leaving the shipped config's engagement unobserved — `rateLimit: {enabled: false}` would disarm production abuse gating with every AC green; plan.md's AC-shape guidance has no library-default split rule) | checklist-gap | plan | `tests/ac-split-library-default.test.js` | open |
| PRAX-20260719-02 | Prax `[plugin]` gotcha (falsified plan-time vendor reference must re-open orchestrator-level MCP lookup; an orchestrator enforcing the worker no-MCP rule on itself burned a retainer cycle authoring a remedy the vendor docs contradicted — reported at spec@6.7.1, already fixed upstream) | doctrine-rot | build | `pre-contract` — build.md § "Falsified embedded reference → orchestrator refreshes it first" | 6.9.0 |
| PRAX-20260721-01 | Prax session 2026-07-21 (roadmap delta binding 01-app-spine carried the security rules for a T3 auth change — OAuth account-linking hazard; brief 01 predated the delta and cited nothing; plan.md Phase 0 read only "every delta the brief cites", nothing derived or checked the `Binds:` backlink, delta silently skipped at plan time. Disposition removes the artifact class instead of instrumenting it: post-genesis decisions are amendment ADRs with an `Applies to` list whose effects are edited into the named briefs at decision time — `Amended by ADR-NNNN` backlinks, letter-suffixed successor briefs for consumed briefs, doctor check 17 bidirectional audit + legacy `deltas/` migration flag, plan Phase 0 unpropagated-amendment net) | workflow-defect | plan | `tests/roadmap-amendments.test.js` | 6.18.0 |
| JJ-20260720-01 | Fable hardening-review brief 2026-07-20 (Sonnet-planned spec promised an outcome in its Goal with no delivering Decision; ACs written from Decisions stayed green in the mechanism's absence; Phase 3 refuters verify claims the spec makes, not promises made without a mechanism, and build/review check diff-against-spec, never spec-against-goal — the class survives the whole pipeline; user-attested, source spec not re-executed) | checklist-gap | plan | `tests/goal-mechanism-audit.test.js` | 6.15.2 |
| HEARWELL-20260721-01 | Hearwell brief 2026-07-21 (TDD red-probe runs the runtime test-runner only, so a test that is red under the gate's typecheck leg — optional-property addition, TS2339 at probe time — passes vacuously at runtime and is falsely reported "not red"; TDD silently lost for every spec whose red-ness lives in typecheck: union members, widened signatures, assert-absence tests) | workflow-defect | build | `tests/redcheck-typecheck-leg.test.js` | 6.29.0 |
| HEARWELL-20260721-02 | Hearwell brief 2026-07-21 (`rulesEnforcementHash` matched no committed revision of `enforcement.json` ever — stamp computed against an intermediate state, manifest written afterward; doctor check 10 fires unconditionally, so the enforcement drift detector was dark from install; sibling `designRulesHash` recomputes exactly, isolating the defect to the enforce stamp order) | reporting-integrity | enforce | `tests/enforce-hash-stamp.test.js` | open |
| PRAX-20260721-01 | Prax brief 2026-07-21, corroborated by upwell escape 2026-07-24 (a gateCommand leg can be a cache lookup at TWO levels — the runner's cache and the tool's own incremental cache; ruff served stale "All checks passed" over red files while `turbo --force` dutifully re-invoked it, 6 files invisibly red across ~36 commits behind a CLEAN; upwell's `dataplane:test` turbo-cache replay behind a CLEAN is the same class. Fix shape: activation probe at init/doctor — inject a red probe per leg, require non-zero exit — plus per-tool cache-defeat doctrine) | workflow-defect | init | `tests/gate-activation-probe.test.js` | open |
| PRAX-20260721-02 | Prax brief 2026-07-21 (a cross-plane contracts change needs an orchestrator-only codegen step BETWEEN implementation batches — regenerated schemas + pydantic mirror are read-only worker surfaces, so workers correctly block, the repair loop burns rounds nothing can fix, and the build abandons the workflow for fastPath; any host with a codegen seam hits this on every spec touching it. Fix shape: declared orchestrator step at a layer-group boundary) | workflow-defect | build | `tests/build-codegen-seam.test.js` | open |
| PRAX-20260721-03 | Prax brief 2026-07-21 (parity-check planes are file-globbed but casing conventions scope by syntactic role and seam side: 20/20 remaining findings false positives — `class RunEvent` folded against its own module name `run_event.py` (PEP 8), and snake_case internals constructing camelCase wire kwargs lines apart. The same run's contracts plane caught a genuine invisible contradiction — fix the plane grammar, do not downgrade to advisory) | workflow-defect | doctor | `tests/parity-check-roles.test.js` | open |
| PRAX-20260726-01 | Prax `[plugin]` gotcha ×2 (specs 20260725/01 D14, 20260725/08) + hearwell `[plugin]` gotcha (spec 20260724/01 design-landed components) — red-check's sanctioned-green exemption is the literal phrase "SHALL CONTINUE TO" (6.25.0), but the class is any AC whose carrier is a legitimately-green test: negative-invariant/absence pins, tag-only re-tag ACs, and tests against components pre-landed at the design stage; each instance loops tdd-red-check into fastPath abandonment | workflow-defect | build | `tests/redcheck-green-carriers.test.js` | 6.29.0 |
| UPWELL-20260725-01 | Upwell `[plugin]` gotcha (spec 20260725/03: a File Plan row bundling an edit to a different file — "create cli.ts; add the npm scripts to app/package.json in this row" — hands the worker a file its contract forbids touching, so the bundled edit silently becomes an unrecorded orchestrator duty and is dropped) | checklist-gap | plan | `tests/fileplan-bundled-edits.test.js` | open |
| CROSS-20260727-01 | Escape-ledger rollup, 3 hosts (zubu `wf_e717bc0b-a06`; prax `wf_1d2110d7-d3c`, `wf_f988caea-506`; upwell `wf_cce37245-ec1`, plus cache-replay CLEAN `wf_e260acd3-1da`) — every recorded escape through a CLEAN went through a fix-delta iteration-2 CLEAN or a cache-inherited gate leg: the fix-delta pass scopes one reviewer to the fix diff + prior findings and INHERITS the full diff's gate/smoke state instead of re-asserting it, so the verdict certifies executed state nobody re-executed; ZUBU-20260716-01's recorded reopen condition fired | workflow-defect | review | `tests/fixdelta-full-state.test.js` | open |
| UPWELL-20260730-01 | UpWell brief 2026-07-30 (ITERATE handoff names components but never WHERE they live; against a single mega-showcase catalog — 5,400-line stories file, 12 exports, specs appending at the bottom — "run storybook, six component names" sends the reviewer hunting, degrading with every spec; Storybook deep links are mechanically derivable from title+export slugs, so omission is inexcusable) | template-bug | design | `tests/design-driver.test.js` (ITERATE 🔗 navigation-line pin) | 6.30.0 |
| UPWELL-20260730-02 | UpWell brief 2026-07-30 (deltas.json addressed with a region label — `investigation-unpack.handoff.provenance` — where the checker wants the surface id; unknown surfaceId fell through to "sliceQuote not found verbatim", blaming grep-verified evidence for an addressing error and burning a debugging cycle) | workflow-defect | design | `tests/fidelity-check.test.js` (region-label addressing error) | 6.30.0 |
| UPWELL-20260730-03 | UpWell brief 2026-07-30 (the sanctioned verbatim-carrier-comment fix for merged copy strings silently fails when the `//` comment wraps: norm() collapses the newline but the continuation line's own `//` marker interleaves into the collapsed haystack, breaking the contiguous match) | workflow-defect | design | `tests/fidelity-check.test.js` (wrapped `//` carrier comment) | 6.30.0 |
| PRAX-20260804-01 | prax user message 2026-08-04, corroborated by escape `wf_82cfbb56-a7b` (a T3 spec written to eliminate unfalsifiable checks shipped two of its own: `ENABLE ROW LEVEL SECURITY` without `FORCE` leaves `relforcerowsecurity` false so the mutation reddened nothing, and drizzle's migrator never re-applies a recorded migration so the restore AC asserted the opposite of reality; every positive dependency-adjudicated claim was executed per Phase 1.5, the negative ones weren't — all the trigger's example shapes are positive) | checklist-gap | plan | `tests/negative-claim-microspike.test.js` | 6.37.0 |
| CROSS-20260804-01 | hearwell gotchas ×2 (spec 20260731/06 — sole finding killed MISCITED over a line-number typo whose content the verifier's own evidence confirmed, CLEAN with zero survivors; spec 20260801/05 — real finding killed on "does not exist" from a stale `.claude/worktrees/agent-*` checkout) + prax gotcha (spec 20260731/07 — structured MISCITED result contradicting its own evidence prose, only the structured field feeds `verdict`): three uncovered false-kill paths in one shared verifyPrompt | workflow-defect | review | `tests/verifier-kill-integrity.test.js` | 6.37.0 |
| HEARWELL-20260804-01 | hearwell gotcha (spec 20260801/07 build `wf_32360253-a2c` — the gate agent enumerates failures from stdout, so a passing file's deliberate `mockRejectedValueOnce` log line ("metering db unreachable") became a phantom failure entry every round; being outside the File Plan it hard-returned `out-of-scope-failure` on round 0, masking the real TS2493/TS2339 failure underneath) | workflow-defect | build | `tests/gate-phantom-failures.test.js` | 6.37.0 |
| HEARWELL-20260804-02 | hearwell gotcha (spec 20260801/05 — a spec that creates its own workspace package leaves red-check structurally blind: turbo/spec-test.sh cannot collect tests for an unregistered package, every red-expected file returns `not-collected`, and the build loops tdd-red-check; not-collected-because-the-spec-creates-the-home is strictly redder than red) | workflow-defect | build | `tests/redcheck-new-package.test.js` | 6.37.0 |
| PRAX-20260801-01 | prax brief 2026-08-01 finding 01 (dc-extract on a static local bundle classes all 1854 strings `copy` — no `{{ }}`/`sc-for` syntax to class on; classification pressure absorbed by templates + 6.32–6.34 matching fixes; accepted residual: inline markup splits one translatable sentence into 3 catalog fragments — extraction-side adjacent-text join is the cleaner home than 6.33.0's matching-side fix) | workflow-defect | design | `tests/dc-extract-inline-join.test.js` | 6.37.0 |
| PRAX-20260801-02 | prax brief 2026-08-01 finding 02 (future-brief capability entangled inside a region the current brief must bind costs an evidence-gated delta row where a separate region would be inherited free via the coverage ledger; measured on verdict-standing's standing-object region — two hand-proven delta rows; retainer-drafted sketch.md line, ratified 2026-08-04) | checklist-gap | sketch | `tests/sketch-region-granularity.test.js` | 6.37.0 |
| PRAX-20260801-03 | prax brief 2026-08-01 finding 03 (fidelity-check compares normalized text only — a mock `<a>` rendered as an inert `<div>` passes, and the reverse would too; measured: 15 raw anchors shipped where the route family requires typed Links, caught by diff-reading not the gate; the reconcile affordance↔contract matrix covers it in doctrine, the gap is mechanization) | missing-substrate | design | `tests/fidelity-element-semantics.test.js` | open |
| PRAX-20260804-02 | prax gotcha (spec 20260731/04 design — a skeleton named exactly as the surface id claims every region of the mock including the fake iOS status bar, and the fidelity refusal names the `09:44` clock copy rather than the naming collision, reading as a transcription miss) | checklist-gap | design | `tests/skeleton-subset-binding.test.js` | 6.37.0 |

## Rejected findings

Dedupe stamps for gotcha/escape-sourced findings dispositioned `rejected` — the next sweep
matches on the ID/signature here and skips them. Corroboration from a second host reopens.

- **ZUBU-20260716-01** (zubu-menu escape 2026-07-17, `preventedBy: review-check`): batch
  existence-check in `publishAllCore.ts` treated "not in this batch" as "does not exist"
  for refs legitimately outside the batch; escaped a CLEAN fix-delta review
  (`wf_e717bc0b-a06`), found by a later spec. Rejected 2026-07-19: the defect is host-domain
  reference semantics no mechanical review check reproduces; the ledger shows the fix-delta
  review structurally sound (smoke pass, 0 skips). Retained as density signal on the review
  surface; a second-host escape through a fix-delta CLEAN reopens. **Reopen condition fired
  2026-07-27** — prax (×2) and upwell escapes all trace to fix-delta iteration-2 CLEANs; the
  host-domain defect stays rejected, the shared channel is accepted as CROSS-20260727-01.
- **JJ-20260720-02/03/04** (same Fable hardening-review brief as JJ-20260720-01): the
  brief's three heavier companion proposals, rejected 2026-07-20. (02) per-spec
  escape-ledger worklist — the planner instantiating every recorded failure shape per run
  charges every future plan O(ledger) forever and decays into rubber-stamp "why it can't
  apply" prose (the failure mode that retired the refutation filter); the intent already
  ships as escape `preventedBy` deterministic checks. (03) runtime-behavior spike trigger —
  no observed escape in the class; the existing Phase 1.5 shape trigger covers
  dependency-adjudicated claims, and "load-bearing runtime assumption" is felt-uncertainty
  wording the trigger doctrine explicitly forbids; reopens when a runtime-behavior escape
  lands. (04) optional Fable T3 mechanism-audit pass — an expensive-model dispatch designed
  to converge on finding nothing is the retired mandatory-T3-checkpoint shape; redundant
  whenever the planner was already Fable/Opus. Corroboration from a recorded escape reopens
  any of the three.
- **PRAX-20260804-R1** (same 2026-08-04 prax user message, second issue): retainer rulings
  that prescribe a command with an expected observation arrive dense with `path:line`
  citations, so the unexecuted prediction reads as pre-verified. Rejected 2026-08-04: no
  wrong-prescription incident is recorded on any host; the role brief already mandates an
  explicit could-not-verify closing line, which covers an honest retainer. Same precedent as
  JJ-20260720-03 (no observed escape in the class). The first retainer command-prescription
  that escapes wrong reopens this as an accepted row.
- **HEARWELL-20260804-R1** (hearwell gotcha, spec 20260731/02 review): `review:1` (the
  design-integrity emphasis) died twice on the StructuredOutput retry cap while
  schema-probing, re-invoke could not recover the slot (an errored agent leaves no journal
  cache entry), and the leg never ran. Rejected 2026-08-04: `REVIEWER_FAILED` fails closed —
  integrity holds, the defect is availability on a single host's single run; a documented
  recovery path (re-dispatch the dead emphasis with a model/effort change) is the fix shape
  when it recurs. A second host, or a second run on any host, reopens.
- **ZUBU-20260717-01** (zubu-menu escape 2026-07-17, `preventedBy: runtime-leg`): hard
  defect in `migration/src/strip-orderrank.ts` after review `wf_3f0cf1f0-06d`. Rejected
  2026-07-19: that review returned SURVIVORS (1 survived, 1 waived, 0 fixes dispatched) —
  consistent with an unactioned survivor — and one-off migration scripts sit outside the
  boot-smoke runtime leg's declared scope; no reproducible plugin mechanism identified.
  Retained as density signal; corroboration reopens.

## Adding a row

`/intake` appends rows; nothing else writes here. Every row needs all six columns. `Pinned
by` names the failing-then-passing test (or, `pre-contract`, the doc/ledger artifact); a row
whose pin is neither is invalid — do not land it. When a fix ships, update `Fixed in` in the
same commit that lands the fix, so host doctors and this repo never disagree about what a
version contains.
