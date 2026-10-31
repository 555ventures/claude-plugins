---
name: concurrent-worker-file-collision-select-tiebreak
description: Edit tool's "modified on disk since you last read it" warning means STOP and re-Read in full before trusting your own draft; the concurrent editor is usually the ORCHESTRATOR that dispatched you, so report what you found and never stand down as "already done"
metadata:
  type: feedback
  reviewed: 2026-10-31
---

Dispatched 2026-08-21 to author tests/review/review-driver.test.js (AC-20260821-02-1..7 — those
tests now live in tests/review/the review-driver-*.test.js family since specs/20260903/06 sharded it) and
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

> Corrected 2026-10-29: the second half of this note (replay.js `--select` self-selecting the driver's own
> CLOSE row) was dropped; ADR-0025 deleted the REPLAY state and `spec/scripts/replay.js` no longer exists.
