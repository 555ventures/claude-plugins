# 0005. Review independence is a fresh-context disposition agent, not a session change; the loop gets its own name

- Status: accepted
- Date: 2026-09-01
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (product ruling on what "one loop" means, doctrine audit, no panel)

## Context

Brief 18 (specs/20260901/01..03, shipped 7.50.0) made `/spec:build` the loop that carries a
spec from `hardened` to `done`. Its one enforced stop — specs/20260901/03 D2, hardened by
18a/ADR-0004 into a fail-closed gate — parks a `--via loop` review at `CHECKPOINT` after the
reviewer returns and refuses `--mark dispositions` until the session id in
`.claude/spec-session.json` changes. The remedy is `/clear`, then re-paste `/spec:build <spec>`.
The property it buys is real: the mind that dispositions review findings has no memory of the
build's trade-offs, so it cannot rationalise a shortcut it made an hour earlier.

Three things are now on record that were not when brief 18 was approved:

- **The approval was given against a different reading of "one loop".** JJ approved brief 18
  believing one invocation runs design → build → review with stops only where a human
  decision is needed (design direction, the catalog look, questions, blocked-worker forks).
  Ruling 2026-09-01: decision stops are fine and expected; a stop that asks for no decision
  and only makes the user restart the machine — the `/clear` + re-paste — is what breaks
  "one go". The checkpoint is exactly that kind of stop.
- **The ceremony is the weakest form of the property.** A `/clear` guarantees independence
  only if the human performs it and nothing else has rotated the stamp (03 D9's two-sessions
  case is recorded as a bypass). A fresh-context subagent has the property by construction —
  Claude Code documents that a subagent "doesn't see your conversation history" — and a
  driver can refuse to advance without that agent's artifact, making the gate mechanical,
  unskippable, and testable instead of a ritual.
- **The loop's name is a stage's name.** Three stages, two of which kept their own command
  (`/spec:design`, `/spec:review`) while the third's command was repurposed into the loop.
  `/spec:build` now means both "the build stage" and "run everything", and there is no way to
  run the build stage alone. JJ, 2026-09-01: "this is a smell." It is — a naming and ownership
  asymmetry, not a broken mechanism.

## Options considered

- **A. Keep the session-id checkpoint** — the property stays, at the cost of one restart
  ceremony per feature and a gate whose evidence is a file a hook writes.
- **B. Fresh-context disposition agent, mechanical artifact gate; rename the loop** — a
  `spec:disposer` agent (same fresh-context, read-only shape as `spec:reviewer`, running on the
  session's model) reads spec, diff, findings, and evidence, and returns one grounded
  recommendation per finding. The review driver refuses `--mark dispositions` without a
  return that covers every finding. Fix recommendations are applied without a question; waive
  and reject recommendations go to the user, because only the user waives. Every review row
  records the outcome and how many recommendations the user overrode. The loop becomes
  `/spec:run`; `/spec:build` is the build stage again, so all three stages have symmetric
  direct entries under one loop.
- **C. Drop the gate** — the building session dispositions its own review. Zero stops, zero
  independence; the exact failure brief 18 named as the one thing a separate session bought.

## Decision

**Option B.** Independence moves from a human ritual to an agent boundary the driver can
verify. The user is asked only when a finding is about to stand — a decision only they can
make — and never to restart the process. The loop is named for what it is.

The single most important reason: a stop that carries no decision is not a checkpoint, it is
friction, and the property it protected is obtainable without it.

## Consequences

- The `CHECKPOINT` state, the session-stamp comparison at `reviewer-returned`, the
  `checkpoint`/`checkpointCleared`/`checkpointOverride` marks, and
  `--skip-independence-check-because` are retired. The stamp hook stays: the row's `model`
  field is still derived from it.
- `verdict.js --checkpoint` keeps its position on the row but its enum becomes
  `disposer | empty | not-reached`, gains `--checkpoint-overrides N`, and is valid on
  `--via direct` rows too — the disposer runs on both review entries, so there is one review
  doctrine, not two. `cleared`, `stamp-appeared`, `overridden`, and `--checkpoint-reason` are
  refused; rows already written with those values stay as history.
- `/spec:run` admits `hardened | implementing | done`; `/spec:build` returns to
  `hardened | implementing`. `spec-status.js --next` names `/spec:run` for every spec past
  `hardened` and never emits `/spec:design`, `/spec:build`, or `/spec:review` as an action —
  the `--json` action set becomes `/spec:plan | /spec:run | /spec:escape` (frozen-API change,
  deliberate).
- 03 D2, 03 D10's "mandatory CHECKPOINT" clause, and 05 D1–D3/D7 are superseded in effect;
  those specs are `done` and are not edited. Their pinning tests are deleted or rewritten in
  place to the new behavior, never left beside it.
- The context-hygiene value the `/clear` incidentally provided is kept as the existing
  advisory line at build-complete ("safe to /clear and re-run"), never enforced.

## Applies to

- `18-unified-build` — consumed; never edited. 03 D2 (the enforced session-change checkpoint)
  and the loop's name are superseded by this decision.
- `18a-checkpoint-fail-closed` — consumed; never edited. 05 D1–D3/D7 (fail-closed park, the
  override flag, the outcome enum) are superseded by this decision; the "outcome on every
  review row" idea survives with a new enum.
- **Successor: `18b-disposer-and-run`** — letter-suffixed because it is the same scope
  corrected, not new scope; carries the reversal (`Amends: 18, 18a` header line).

## Dissents

- **Option A** stays on record as the 2026-09-01 morning position (brief 18 § Why: "the loop
  keeps that by mandating a checkpoint `/clear`"). Rejected on the product ruling above and
  on the mechanism argument: an agent boundary is the stronger form of the same property.
- **Option C** is the kill-switch if the disposer proves to be theatre: the user-override
  count on review rows is the measurement. If overrides run high, the disposer is adding a
  dispatch without changing outcomes and should go — but the fallback is then a better
  disposer, never the session dispositioning its own build.
