# 0004. The loop checkpoint fails closed: a missing session stamp parks the run, never waives it

- Status: accepted
- Date: 2026-09-02
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (ledger evidence from two repos + doctrine audit, no panel)

## Context

Specs/20260901/03 decision D2 (brief 18, shipped 2026-09-01) made the one enforced stop of
the unified build loop deterministic: a `--via loop` review parks at `CHECKPOINT` after the
reviewer returns and refuses DISPOSITIONS until the session id in `.claude/spec-session.json`
changes. The same row also ruled the missing-stamp case: "No stamp file at reviewer-returned →
the checkpoint degrades to a printed warning naming `.claude/spec-session.json` and
DISPOSITIONS is admitted", rationalised as admitting honestly rather than stalling on evidence
the driver cannot obtain. Three things are now known that were not on 2026-09-01:

- **The degrade is the only path that has ever run.** Both `--via loop` reviews on this
  machine — `rv_1f7925471f6c` (this repo, specs/20260901/04) and `rv_005bdd6e0c23` (prax,
  its specs/20260901/04) — reached `reviewer-returned` with no stamp, printed the warning, and
  dispositioned in the build session. The checkpoint has never fired for real. Neither ledger
  row records that it was skipped; the ledger cannot answer "how often".
- **The trigger is the hook layer, not the user.** Diagnosed in prax (2026-09-01, not
  re-derived here): the Claude Code plugin cache rolled 7.47.0 → 7.50.0 mid-session; 7.47.0
  has no `spec-session-stamp.sh` and no hooks.json entry for it, so the session ran the old
  hook set against a 7.51.0 checkout's drivers. Under `--via loop` a missing stamp can only
  mean the pipeline's own prompt hook is not running — a version skew on the boot path, the
  exact class core § Tiers names as the highest-severity surface on record.
- **The doctrine already measured this shape to fail.** Core § Feedback Loop records the
  printed-reminder form of replay: shipped 2026-08-19, skipped through 12+ reviews in ~48
  hours while printing on every report. D2's degrade is the same form on the gate whose whole
  value is that it cannot be walked past; core's own rule elsewhere is that a check that
  cannot run is a finding, not a pass.

## Options considered

- **A. Keep D2; make the warning louder** — zero mechanism change; the gate stays a printed
  reminder, which is the measured-failing form.
- **B. Fail closed with an explicit, ledger-visible override** — no stamp parks the run at
  `CHECKPOINT` with a remedy that names the likely cause (restart Claude Code — the hook set
  is loaded at session start); the park lifts when any stamp appears; one deliberately
  awkward flag admits DISPOSITIONS with a reason that lands on the review row; every loop
  review row records the checkpoint outcome so materiality becomes a ledger query.
- **C. Fail closed with no override** — the honest maximum, but a host whose hook cannot
  write the stamp at all (no `jq`, unwritable `.claude/`) could never finish a loop review;
  the only exit would be `/spec:review` direct, which is a silent bypass with no ledger trace.

## Decision

**Option B.** The independence gate closes when its evidence is absent. The remedy printed
is the cause's remedy (restart, not `/clear` — a clear keeps the process and its hook set),
the escape is one flag nobody types by accident, and the outcome is a typed ledger field so
the next version of this question is answered by `jq`, never by memory.

The single most important reason: a gate that a missing file waives is not a gate, and
the file goes missing precisely when the pipeline's own boot path has failed.

## Consequences

- A stale plugin hook set now costs one Claude Code restart per loop review, once; the
  degrade cost nothing and delivered nothing.
- Every loop review row carries `checkpoint: {outcome}`; `overridden` rows carry the typed
  reason. Whether the override is being abused is a count, not a suspicion.
- D2 of specs/20260901/03 is superseded in effect on the no-stamp clause only; that spec is
  `done` and is not edited — the successor brief carries the change. The pinning test for the
  degrade is rewritten in place to the new behavior, never left beside it.
- The residual D9 fragility (two sessions prompting `/spec:` in one root) is unchanged.

## Applies to

- `18-unified-build` — consumed (specs/20260901/01..03 done); never edited. D2's no-stamp
  degrade (specs/20260901/03) is superseded by this decision. **Successor:
  `18a-checkpoint-fail-closed`** — letter-suffixed because it is the same scope corrected,
  not new scope; it carries the reversal (`Amends: 18` header line).
- `18a-checkpoint-fail-closed` — authored in this session with this ADR; Grounding cites it.

## Dissents

- **Option A** stays on record as the 2026-09-01 position ("admit honestly rather than
  stall"). Rejected on the measurement above: the honesty was a stderr line no ledger row
  kept, and 2 of 2 real runs walked past it.
- **Option C** stays live as the fallback if `overridden` rows appear at a rate that shows
  the flag has become the habit: the kill condition in brief 18a names the count.
