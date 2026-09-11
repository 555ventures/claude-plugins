# 0014. Next carries the lanes: the parallel-lane render moves into the default `🎯 Next` block, `📋 All open work` retires

- Status: accepted
- Date: 2026-09-10
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260909/08-next-carries-the-lanes.md)
- Applies to: specs/20260903/05-status-diet.md D1, D4, D5 — the "no `⚡`/`🚦` lane render by
  default" clause of AC-20260903-05-1, the "exactly one command line in the Next block" clause
  of AC-20260903-05-2, the `· {m} could run in parallel (--all)` and `nothing waits behind it`
  clauses of D4/AC-20260903-05-5, and the `📋 All open work` header of D5/AC-20260903-05-7 —
  every other clause of those criteria stands. `docs/roadmap/24-status-and-queue-diet.md`'s
  acceptance-picture footer line `🟢 next is ready · 2 wait behind it` quotes the retired
  wording and is amended in place by backlink only.
- Amended by: —

## Context

specs/20260903/05-status-diet.md shipped the four-block screen and, deliberately, kept the
parallel-lane render, the `🚦 solo` affordance, and the merge-conflict heads-up behind `--all`
under a `📋 All open work` header: "the only actionable line is the first one." Lived
experience on this repo (two independent unblocked briefs, both startable now) inverted that
call — a lane the fan-out already admits is startable now, and a user who does not already
believe parallelism exists never finds it by typing a flag they don't know to type. JJ's
2026-09-09 ruling: everything admissible is "next."

The `📋 All open work` header also re-printed the top pick as its first row once the lanes
moved up: a block whose first lines already rendered above it would only be re-stating them
under a redundant name.

## Options considered

- **A. Leave the lane render behind `--all`, unchanged** — the status quo `specs/20260903/05`
  shipped. Preserves the exact defect this record exists to close: runnable work reachable
  only by typing a flag.
- **B. Cap the default lane list to a few rows** — keeps the one-screen promise but re-creates
  the same hidden-work defect one level down (a lane past the cap is invisible again).
  Rejected (specs/20260909/08 D2).
- **C. Move the whole lane render into the default `🎯 Next` block; delete `📋 All open work`
  outright; `--all` adds only what is genuinely not startable (`🕓 after that`, `⛔ blocked`)
  plus the hygiene catalogue.**

## Decision

**Option C.** `spec-status.js`'s `🎯 Next` block now renders, in both the default screen and
`--all`: every `/spec:escape` entry first, then the lane render from the unchanged
`laneAdmission(entries)` derivation (the `⚡ {n} parallel lanes …` header and one line per
lane, or the single command plus `🚦 solo`, or — when nothing is unblocked — the top pick with
its `⏳` blocker lines). `📋 All open work` is deleted outright; `--all` inserts `🕓 after
that:` and `⛔ blocked:` directly after the `🎯 Next` block and before the `⚠️` decide lines,
filtering the top pick out of `⛔ blocked:` so nothing the Next block already printed
re-prints below it. The footer's `· {m} could run in parallel (--all)` clause is deleted (the
lanes are on screen); the wait clause keeps its count and derivation, reworded to `· {n} more
open` / `· nothing else open`. `laneAdmission`, `deriveNext`, and every frozen surface
(`--next`, `--next --json`, `--json`, `--pretty`, `--brief NN`) are untouched
(specs/20260909/08 D5).

A host checkpointed against the pre-image sees no migration: the render is display-only, and
no on-disk shape changes.

## Consequences

- specs/20260903/05-status-diet.md's D1/D4/D5 and the named clauses of
  AC-20260903-05-1/-2/-5/-7 are superseded by this record; the spec stays `done` and is never
  edited — this ADR is the durable account of what changed and why. Every other clause of
  those criteria (the roadmap block, the decide-line cap, the `🔴`/red-CI footer, the hygiene
  catalogue's continued life under `--all`) stands unchanged.
- `docs/roadmap/24-status-and-queue-diet.md`'s acceptance picture keeps its 2026-09-03 footer
  literal as a historical measurement, backlinked to this record rather than rewritten — the
  brief's prose is provenance, not a live contract.
- `spec/commands/status.md` is rewritten to the new contract (specs/20260909/08 D7); this ADR
  is provenance, not a second copy of the render's text.
- **Numbering note:** this record was drafted under the identifier `ADR-0013`, per
  specs/20260909/08-next-carries-the-lanes.md D6. By the time this spec built, `ADR-0013` had
  already been claimed by `docs/adr/0013-client-rehearses-the-journey.md` (accepted
  2026-09-10, landed on `main` ahead of this build). This record ships as `ADR-0014`, the next
  free number, with no change to its substance; the two `Amended by:` backlinks in
  `specs/20260903/05-status-diet.md` and `docs/roadmap/24-status-and-queue-diet.md` cite
  `ADR-0014` accordingly.
