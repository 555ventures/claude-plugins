# 07 — Declared suite baseline: the sanctioned-red set becomes a checked-in artifact

Phase: P2
Depends on: 06

## Why this brief

A 2026-08-14 escape (ledger row on specs/20260813/10-host-capabilities.md): a Decision
changed `verdict.js`'s return value and broke five tests that were green at the pre-spec
base — invisible to the scoped gate (runs only the spec's own File Plan test dirs), to the
review panel (reads the diff, not the suite), and to the colliding-pin Gotcha (greps for
retired literals; the Decision retired none). Root cause, per the Fable retainer consult,
sits one level above the gate: **the sanctioned-red baseline is tacit** — prose plus a
stale hand-written count in the host's Test Rules — so a full-suite run is unjudgeable
anywhere, which is why the gate had to be scoped, which is why out-of-scope pins are
invisible to every review surface at once. Declaring the expected-failing set as a
machine-readable artifact collapses the whole chain: no base-commit worktree, no counting,
and drift in either direction becomes a review finding.

## Scope

- **`.claude/suite-baseline.json`** — host-owned, checked-in list of expected-failing test
  names (file + name; optional declared-flaky marking for tests measured to swap membership
  run-to-run). Absent file = empty set, the common host case.
- **`spec/scripts/suite-baseline.js`** — `--check` runs the host's full `testCommand` in
  the review tree (never a base-commit worktree), exact-set-compares failing names in both
  directions, names `--update` as the sole remedy; `--update` reseeds.
- **One advisory review leg** — recorded in the evidence manifest like the `patterns` leg,
  never added to `verdict.js`'s required set; drift yields one mechanical hard finding
  riding normal Phase 2 dispositions, never step 8's hard stop.
- **Test Rules cleanup** — the stale "(11 as of 2026-08-01)" count is deleted in favor of a
  pointer to the artifact.
- Scaffold-ledger registration with promote/retire conditions.

## Grounding

- .claude/spec-runs.jsonl — the escape row (stage:"escape", spec 20260813/10,
  preventedBy:"runtime-leg").
- spec/scripts/verdict.js — `REVIEW_LEGS`/`REVIEW_BLOCKING`; unknown manifest legs are
  ignored (the advisory leg rides free).
- spec/commands/review.md Phase 0 step 3 — the `patterns` leg precedent (recorded, not
  required).
- spec/scripts/claims-lint.js — the `--update-baseline` ratchet shape this artifact copies.
- .claude/rules/spec-pipeline.md § Test Rules — the tacit baseline being replaced.

## Out of scope

- Adding the leg to `verdict.js`'s required or blocking sets — required-leg status would
  break every six-green-shaped fixture across five suites, re-committing the incident being
  fixed. Promotion is a later, evidence-gated decision (the scaffold-ledger row carries it).
- A host-declared failing-name-format capability key for non-node runners — deferred; a
  clean-exiting suite needs no parsing on any runner, and the key would force an edit to
  the hash-stamped grounding contract. Reopen when a real non-node host carries a red
  baseline.
- A release-stage suite leg — review is the surface the incident escaped through.

## Open questions

None — planned same-day as this brief (specs/20260814/03), all forks resolved in the
consult and the planning session.
