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
| UPWELL-20260718-01 | UpWell `[plugin]` gotcha (wf-build tdd-red-check joins repo-root-relative File Plan paths onto a workspace-filtered `pnpm --filter app test`; vitest resolves them inside the workspace, collects zero files, red-check returns conservatively, and every TDD build falls back to direct dispatch — reproduced at `spec/workflows/src/wf-build.body.js` RedCheck phase, which appends `testFiles` verbatim) | workflow-defect | build | `tests/redcheck-workspace-paths.test.js` | open |
| PRAX-20260719-01 | Prax `[plugin]` gotcha (spec 20260713/03-auth D17: a requirement satisfied by a library DEFAULT got an AC pinning the library mechanism that passed before any implementation existed, leaving the shipped config's engagement unobserved — `rateLimit: {enabled: false}` would disarm production abuse gating with every AC green; plan.md's AC-shape guidance has no library-default split rule) | checklist-gap | plan | `tests/ac-split-library-default.test.js` | open |
| PRAX-20260719-02 | Prax `[plugin]` gotcha (falsified plan-time vendor reference must re-open orchestrator-level MCP lookup; an orchestrator enforcing the worker no-MCP rule on itself burned a retainer cycle authoring a remedy the vendor docs contradicted — reported at spec@6.7.1, already fixed upstream) | doctrine-rot | build | `pre-contract` — build.md § "Falsified embedded reference → orchestrator refreshes it first" | 6.9.0 |
| JJ-20260720-01 | Fable hardening-review brief 2026-07-20 (Sonnet-planned spec promised an outcome in its Goal with no delivering Decision; ACs written from Decisions stayed green in the mechanism's absence; Phase 3 refuters verify claims the spec makes, not promises made without a mechanism, and build/review check diff-against-spec, never spec-against-goal — the class survives the whole pipeline; user-attested, source spec not re-executed) | checklist-gap | plan | `tests/goal-mechanism-audit.test.js` | 6.15.2 |

## Rejected findings

Dedupe stamps for gotcha/escape-sourced findings dispositioned `rejected` — the next sweep
matches on the ID/signature here and skips them. Corroboration from a second host reopens.

- **ZUBU-20260716-01** (zubu-menu escape 2026-07-17, `preventedBy: review-check`): batch
  existence-check in `publishAllCore.ts` treated "not in this batch" as "does not exist"
  for refs legitimately outside the batch; escaped a CLEAN fix-delta review
  (`wf_e717bc0b-a06`), found by a later spec. Rejected 2026-07-19: the defect is host-domain
  reference semantics no mechanical review check reproduces; the ledger shows the fix-delta
  review structurally sound (smoke pass, 0 skips). Retained as density signal on the review
  surface; a second-host escape through a fix-delta CLEAN reopens.
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
