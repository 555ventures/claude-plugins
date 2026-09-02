# 18a — The loop checkpoint fails closed: no stamp parks, one awkward override, outcome on the ledger

Phase: P2 · Depends on: 18 · Amends: 18 (decision D2 of specs/20260901/03 — via ADR-0004)

## Why this brief

Successor to brief 18, minted 2026-09-02 from ledger evidence in two repos. Brief 18's one
enforced stop — the review driver parks at `CHECKPOINT` under `--via loop` until the session
id in `.claude/spec-session.json` changes — was locked with a degrade clause: no stamp file
at `reviewer-returned` prints a warning and admits DISPOSITIONS. Measured 2026-09-01/02:
both `--via loop` reviews on this machine (`rv_1f7925471f6c` here, `rv_005bdd6e0c23` in
prax) took that path. The checkpoint has never fired for real, and no ledger row says so.

The cause in prax (diagnosed there, do not re-derive): the plugin cache rolled 7.47.0 →
7.50.0 mid-session; 7.47.0 has no stamp hook, so the session's hook set — loaded at session
start — never wrote the file the driver reads. Under `--via loop` a missing stamp can only
mean the pipeline's own hook layer is not running: a boot-path skew, the class core § Tiers
puts on the critical tier. Core § Feedback Loop already records that a printed reminder in
place of an enforced stop is skipped (replay, 2026-08-19, 12+ reviews in ~48 hours).

## Result

A `--via loop` review with no stamp at `reviewer-returned` parks at `CHECKPOINT` and prints
the cause's remedy: restart Claude Code, then re-run `/spec:build <spec>`. The park lifts
when any stamp appears (a stamp can only be written by a hook, and a hook that was not loaded
cannot start being loaded without a new process). One deliberately awkward flag on
`--mark dispositions` admits the run with a reason; the reason lands on the review row.
Every loop review row records the checkpoint outcome as a typed field, so "how often is the
gate skipped, and why" is a `jq` query over the fleet ledgers.

## Current state

- `spec/scripts/spec-review-driver.js` — `checkpointStillParked()` treats a recorded
  `{sessionId: null}` as "not parked"; `handleReviewerReturned` prints the degrade warning.
- `spec/scripts/verdict.js` — review rows carry `via`/`model` after `tier`; nothing about
  the checkpoint.
- `tests/review/loop-checkpoint.test.js` — the second AC-20260901-03-4 test pins the
  degrade (no stamp → warning + DISPOSITIONS).
- `spec/commands/build.md` § Review stage — the CHECKPOINT bullet names only the `/clear`
  form.
- `docs/canonical/pipeline.md` § One command per feature — "degrading to a warning when no
  stamp exists".

## Scope

1. **Fail closed.** No stamp at `reviewer-returned` records `checkpoint: {sessionId: null}`
   and parks; the step body and the stderr line name `.claude/spec-session.json`, tell the
   user to restart Claude Code (stale hook set is the usual cause), and name the re-run
   command. The park lifts when any stamp exists; a same-session park keeps the `/clear`
   form unchanged.
2. **One override.** `--mark dispositions … --skip-independence-check-because "<reason>"`
   admits a no-stamp park only; refused on a same-session park (the `/clear` remedy exists),
   on a run that is not parked, on a `via: direct` run, and with a blank reason.
3. **Ledger.** `verdict.js` gains `--checkpoint <outcome>` (`cleared` | `stamp-appeared` |
   `overridden` | `not-reached`) and `--checkpoint-reason`; every loop review row carries
   `checkpoint: {outcome[, reason]}`; direct rows never do. The driver passes it on all
   three verdict passes.
4. **Tests + prose.** The degrade test is rewritten in place to the new behavior; both new
   paths (park, stamp-appears) and the override (admit + every refusal) are executed
   behaviorally; `build.md` and the canonical doc say what the gate does now.
5. **Kill condition (ledger-answerable).** Over the next 30 fleet loop reviews, if
   `checkpoint.outcome == "overridden"` rows exceed 3, the override is removed (ADR-0004
   option C) and the reason texts are read for the real cause.

## Out of scope

- Reloading plugin hooks without a restart — Claude Code's behavior, not the pipeline's.
- A fleet-reader question for checkpoint outcomes — one `jq` line answers it; a fixed
  question needs a spec of its own only if the count above ever trips.
- Sibling 02 D9 (two sessions prompting `/spec:` in one root) — recorded, unchanged.

## Grounding

- ADR-0004 (`docs/adr/0004-loop-checkpoint-fails-closed.md`).
- `spec/doctrine/core.md` § Feedback Loop (the printed-reminder measurement), § Tiers
  (boot-path skew is critical), § Incident Policy (same-session fix with a behavioral test).
- specs/20260901/03-unified-build-loop.md D2 and AC-20260901-03-4 (the clause reversed).
- Ledger rows `rv_1f7925471f6c` (claude-plugins) and `rv_005bdd6e0c23` (prax), both
  `via: loop`, `CLEAN`, no checkpoint record.
- Claude Code docs (read 2026-09-02): `/clear` yields a new session id
  (code.claude.com/docs/en/checkpointing); whether plugin hooks reload on `/clear` is not
  stated — the restart remedy rests on the prax observation.
