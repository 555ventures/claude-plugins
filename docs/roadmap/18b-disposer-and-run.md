# 18b — The loop keeps going: a fresh-context disposition agent replaces the session-change checkpoint, and the loop is named `/spec:run`

Phase: P2 · Depends on: 18a · Amends: 18, 18a (decision D2 of specs/20260901/03; D1–D3/D7 of specs/20260901/05 — via ADR-0005)

## Why this brief

Successor to briefs 18 and 18a, minted 2026-09-01 from a product ruling. JJ approved brief 18
believing one invocation carries a spec design → build → review, stopping only where a human
decision is needed. The shipped loop also stops once where no decision is needed: after the
reviewer returns it parks at `CHECKPOINT` and refuses dispositions until the session id
changes — `/clear`, re-paste `/spec:build <spec>`. Ruling: decision stops (design direction,
the catalog look, questions, blocked-worker forks, waive/reject calls) stay; a mechanical
restart is not a stop, it is friction, and it is the one thing that breaks "one go".

The property the restart protected — the mind dispositioning findings has no memory of the
build's trade-offs — is real and is kept. It is obtained the way the reviewer's independence
already is: a fresh-context subagent (Claude Code: a subagent "doesn't see your conversation
history"), whose return the driver refuses to advance without. Mechanical beats ceremonial.

A second smell surfaced in the same conversation: three stages, two stage commands. The
loop took the build stage's name, so `/spec:build` means two things and the build stage
cannot be run alone. The loop gets its own name.

## Result

`/spec:run <spec>` carries a spec from `hardened` to `done` with no human re-invocation
between stages. At DISPOSITIONS the session dispatches ONE `spec:disposer` agent (fresh
context, read-only, the session's model) with paths only; it returns one grounded
recommendation per survivor and leg finding. Fix recommendations dispatch without a
question; waive and reject recommendations go to the user — only the user waives. The review
driver refuses `--mark dispositions` without a return that covers every finding, on the loop
path and on `/spec:review` alike; every review row records `checkpoint: {outcome, overrides}`
so "how often does the user overrule the independent disposer" is a `jq` line.
`/spec:build`, `/spec:design`, and `/spec:review` are the three symmetric stage entries.
`spec-status --next` names `/spec:run` as the one next command for any spec past `hardened`.

## Current state

- `spec/scripts/spec-review-driver.js` — `CHECKPOINT` state between `REVIEWER` and
  `DISPOSITIONS` on `--via loop`; `checkpoint`/`checkpointCleared`/`checkpointOverride` marks;
  `--skip-independence-check-because`; `--checkpoint <outcome>` threaded onto loop verdict passes.
- `spec/scripts/verdict.js` — `--checkpoint <cleared|stamp-appeared|overridden|not-reached>`,
  `--checkpoint-reason`, refused on `--via direct`.
- `spec/agents/reviewer.md` — the fresh-context reviewer; the disposer's template.
- `spec/commands/build.md` — the loop and the build stage in one file (176 lines + 183 shared).
- `spec/scripts/spec-state-gate.sh` — `/spec:build` on `hardened|implementing|done`;
  `/spec:run` is not a recognised prompt (exit 0 unguarded, executed 2026-09-01).
- `spec/scripts/spec-status.js` — `deriveNext` emits `/spec:design`, `/spec:build`, or
  `/spec:review` by status; `--next` today prints `/spec:build @specs/20260901/08-…`.
- `tests/review/loop-checkpoint.test.js` — nine tests, all pinning the retired mechanism.

## Scope

1. **Disposer.** `spec/agents/disposer.md` (`spec:disposer`, `model: inherit`, read-only
   tools); the review driver's DISPOSITIONS step prints the dispatch and the evidence paths;
   `--mark dispositions --file <return>` verifies coverage, enum, reasons, user overrides, and
   count agreement; every iteration (fix-delta passes included) needs its own return; empty
   pools need no dispatch.
2. **Checkpoint retired.** No `CHECKPOINT` state, no stamp comparison, no override flag —
   the flag is refused by name, never silently ignored. Sidecars written by 7.53.0 with a
   `checkpoint` key resume at DISPOSITIONS.
3. **Ledger.** `verdict.js --checkpoint <disposer|empty|not-reached>` plus
   `--checkpoint-overrides N`; valid on both `via` values; old values and
   `--checkpoint-reason` refused; absent flags leave rows byte-identical.
4. **`/spec:run`.** New command file carrying the outer loop; `build.md` shrinks to the build
   stage; the state gate admits `/spec:run` on all three statuses and `/spec:build` on
   `hardened|implementing`; `spec-status` derives `/spec:run`; `spec-paths shared-for run`;
   `entrypoints.json`; every command, doctrine, README, and marketplace surface names the loop
   by its name.
5. **Kill condition (ledger-answerable).** Over the next 30 fleet reviews, if
   `checkpoint.overrides` summed exceeds the number of findings the disposer recommended to
   stand (waive + reject) — i.e. the user overrules more than half of the disposer's
   stand recommendations — the disposer is re-prompted or re-modelled, never removed in
   favour of session dispositions (ADR-0005 option C is the recorded fallback shape).

## Out of scope

- A heaviness heuristic for the advisory `/clear` line at build-complete — the session has
  no context-size signal; the line stays unconditional and advisory.
- A dashboard marker for "design due" under the `/spec:run` Next line — the loop derives it;
  revisit if JJ misses it in practice.
- Reviewer model experiments and the fleet reader's `cleanByVia` — unchanged (brief 18 § 5).
- 02 D9 (two sessions prompting `/spec:` in one root) — moot for dispositions; still real for
  the row's `model` field; unchanged.

## Grounding

- ADR-0005 (`docs/adr/0005-disposer-replaces-session-checkpoint.md`).
- ADR-0004 (the fail-closed checkpoint this brief retires), specs/20260901/03 D2/D10,
  specs/20260901/05 D1–D3/D7.
- `spec/doctrine/core.md` § Model Placement (independence = fresh-context, blind-to-author
  dispatch), § State Machine (the ownership sentence amended again), § Feedback Loop.
- Claude Code sub-agents doc (read 2026-09-01): `model: inherit` "is the same as leaving it
  unset" — the main conversation's model; "Each subagent starts with a fresh, isolated context
  window. It doesn't see your conversation history".
- JJ rulings 2026-09-01: "one-go means you can still stop for design fork, questions,
  inspection, etc like now.. one-go means unified design>build>review"; loop name `/spec:run`;
  fix without asking, ask only to waive or reject; stage commands stay as entries and doctrine
  source; the disposer applies to both review entries.
