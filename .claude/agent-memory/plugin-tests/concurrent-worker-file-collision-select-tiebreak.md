---
name: concurrent-worker-file-collision-select-tiebreak
description: Edit tool's "modified on disk since you last read it" warning means STOP and re-Read in full before trusting your own draft — the concurrent editor is usually the ORCHESTRATOR that dispatched you (its completion notification can fire early), so report what you found and never stand down as "already done"; also, replay.js --select's own tie-break means a driver CLOSE's own just-appended CLEAN+runId row is always a self-selectable candidate
metadata:
  type: feedback
  reviewed: 2026-08-26
---

Dispatched 2026-08-21 to author tests/review/review-driver.test.js (AC-20260821-02-1..7) and
tests/run-ledger.test.js (AC-20260821-02-8/9) for specs/20260821/02-replay-review-phase.md. By
the time I finished research and called Edit on review-driver.test.js, the tool returned
success but flagged: "the file had been modified on disk since you last read it." `git status`
then showed spec/commands/review.md, spec/doctrine/core.md, and tests/run-ledger.test.js ALSO
already modified.

**Corrected attribution (orchestrator, 2026-08-21).** The concurrent editor was the BUILD
ORCHESTRATOR itself, not a doctrine-author or a sibling plugin-tests dispatch. The harness fired
this agent's completion notification while it was still executing; the orchestrator, believing
the dispatch had returned empty, began writing the same files itself. So the concurrency was
real and the observation was correct — the attribution was not. Do not generalize this into "a
sibling worker probably did my job": the only process that had, here, was the one that
dispatched me. The original note ended "my own task was effectively subsumed; I did not re-add
anything", which is exactly the inference that got a companion memory
(`assigned-file-may-already-be-implemented`, gate-scripts) deleted the same day for teaching
workers to skip real work. The durable lesson is the re-read discipline below and the
`--select` tie-break at the end — never the deferral.

My Edit's `old_string` still matched (it anchored on original HEAD content), so it inserted my
draft at that anchor point, landing beside an already-appended block — producing a file with two
copies of AC-20260821-02-1..7 tests. Re-reading the full file surfaced the duplication; the
orchestrator removed my block and kept its own, which handled the `--select` tie-break my draft
had missed.

**Why this matters:** the tool's "modified since you last read it" warning is not a formality —
it is the signal that your own diff was computed against a stale base. Applying the edit
anyway (which the tool does — it's a warning, not a refusal) can silently create duplicate or
conflicting content in a shared file. Blindly trusting your own drafted content afterward
(without a fresh full Read + `node --test` run) risks landing a worse or duplicate version of
work another live process already completed — or, in the recorded case, of concluding that a
process which had NOT completed your work had done so.

**How to apply:** the moment an Edit/Write result carries that warning, stop narrating your
own plan and (1) `git status --porcelain` on every file in your assigned batch AND every
doctrine/script file the spec's File Plan touches — not just the one you just edited, since a
whole-spec concurrent build can be landing multiple layers at once; (2) fully re-Read the file
you just edited; (3) if your inserted content duplicates or conflicts with content already
there, diff the two versions for correctness before deciding what survives — don't assume
"mine is right because I wrote it last", and equally never conclude your assignment is already
done and stand down — report what you found and let the orchestrator adjudicate. (4) Re-run
`node --test <your files>` regardless of which version wins, to confirm red/green status is what
the spec's TDD contract expects before reporting completion.

**The specific bug this caught** (worth its own note for future replay-phase fixture authors):
spec-review-driver.js's `doCloseWork()` appends its OWN authoritative verdict.js pass as a
`stage:"review"` ledger row for the SPEC UNDER TEST ITSELF, carrying `verdict:"CLEAN"` and a
fresh `runId` — moments before REPLAY's own `--due`/`--select` run. That row is therefore
ALWAYS a `--select` candidate for its own review (same-tier, latest-read-order). If a test
separately seeds a different "eligible target" spec+row hoping `--select` will pick it, the
fixture's own just-appended CLOSE row will instead win the tie-break (`c.i >= best.i` favors
later read-order among equal tiers) — `--select` selects the fixture's OWN spec, not the
seeded one. Two consequences for any REPLAY-phase fixture: (a) a "due but no eligible CLEAN
row" (AC-3-shaped) fixture can NOT be built by simply omitting an eligible row — a candidate
always exists once the driver's own CLOSE runs, so exit 1 ("no eligible row") is
structurally unreachable from REPLAY; the reachable arm is `--select` failing to RESOLVE the
self-selected candidate (exit 4), e.g. by amending the close commit so the spec's newest
commit has no parent revision carrying a `build_base`/`diff_base`. (b) an "eligible CLEAN row"
(AC-2-shaped) fixture doesn't need a separately-seeded target at all — read the fixture's own
selected `runId`/`spec` back off the ledger after `driveToClose()` (e.g. filter
`stage:"review"` rows for one whose `runId` starts with the driver's own prefix) and assert
against THAT, rather than asserting a different pre-seeded spec path was chosen.
