# 15 — Derived session queue: durable sequencing behind the --next pointer

Phase: P2
Depends on: none

## Why this brief

The pipeline derives each brief's *state* (open/designed/planned/done) but not the
*sequence* JJ actually intends: interleaving product work between briefs, holding a brief
until a counter fills ("08 after 5 host specs"), jumping follow-up briefs ahead of
not-yet-started ones. Those are decisions, not derivable facts — today they live only in
conversation, are re-explained to a fresh session from memory, and are forgotten between
sessions. The 2026-08-18 session reconstructed the full ordering by hand for at least the
third time.

The fix is a thin stored layer holding exactly what cannot be derived — ordering, item
payloads, and done-when predicates — with everything else (done, blocked, newly-arrived)
derived on read, in line with the statuses-derived-not-stored doctrine. `spec-status.js
--next` remains the single derivation surface: the queue is an *input overlay* to it, never
a sibling script that computes its own next-pointer.

## Scope

- **Queue store** — one file per repository holding ordered items: a payload (the exact
  paste — a `/spec:plan @docs/roadmap/…` line or a saved prompt) and a done-when predicate
  (brief-state reached, spec exists, ledger-row count crossed). Stored in the repo's git
  common directory (resolved via `git rev-parse --git-common-dir`), so every linked
  worktree reads and writes the same file — no per-worktree copies, no `.worktreeinclude`
  involvement, nothing in `git status`.
- **Derived completion and blocking** — predicates are evaluated on read against the
  existing derivation (`spec-status.js --json`) and the run ledger. No stored done flags;
  an item is done when the repo says so. Non-derivable items (external work tracked by a
  counter) complete via the counter predicate, or a one-command manual tick as the
  fallback of last resort.
- **Reconcile pass** — on every read, set-diff the roadmap directory against the queue.
  A brief on disk but not in the queue (a follow-up staged mid-spec, arriving at
  merge-back) is auto-inserted after the brief that spawned it and ahead of all
  not-yet-started items, using plan-lock follow-up records and `Depends on:` lines as
  provenance. Concurrent arrivals from parallel worktrees order by arrival time. Every
  automatic placement prints as an anomaly line with a one-command veto (`bump`), never
  silently.
- **SessionStart surfacing** — a hook prints the top unblocked item (payload included,
  ready to paste) when a session opens in the main checkout, and prints
  finish-the-current-spec instead when the session is inside a linked worktree, where the
  global pointer would mislead. The hook output is also what makes the queue
  model-visible each session without doctrine prose.
- **Command surface** — one registered command wrapping the script: `next`, `add`,
  `bump`, `defer`, `done` (manual tick). `spec-status.js --next` learns to consult the
  overlay so every existing consumer (status render, review close-out, autopilot lane)
  sees queue-aware ordering for free.

## Out of scope

- A cross-repo aggregator ("what's next on this machine") — the per-repo store supports
  building one later as a pure reader; not in v1.
- Automatic tracking of work performed in *other* repositories — counters or manual ticks
  cover it; no cross-repo write channel.
- A second derivation script or a stored-status side channel — both explicitly ruled out;
  the queue stores only decisions (ordering, payloads, predicates).
- Grading or prioritization heuristics beyond the single insertion rule — ordering stays
  a human decision surfaced for veto.

## Grounding

- `spec/scripts/spec-status.js` header — `--next` is the sole next-pointer surface;
  consumers include the status render, `/spec:review` close-out, and
  autopilot/daemon/lane.js (`--next --json`).
- `docs/roadmap/00-overview.md` — brief-state derivation from spec frontmatter stamps;
  the queue must not duplicate it.
- Worktree copy semantics (`.worktreeinclude`, merge-back.sh) — why in-checkout storage
  diverges per worktree and the git common dir does not.
- The 2026-08-18 design session (session-resident) — the full decision trail: derived
  completion, insertion heuristic, parallel-arrival ordering, common-dir storage,
  worktree-aware hook output.

## Open questions

- Predicate vocabulary: is {brief-state, spec-exists, ledger-count} sufficient, or is a
  small expression form needed? Start minimal; extend on the second real case.
- Overlay integration shape: does `spec-status.js` read the queue file directly, or does
  the queue script post-process `--next --json`? The former keeps one derivation entry
  point; the latter keeps spec-status.js host-agnostic. Decide with a spike against
  autopilot's consumption.
- Hook noise budget: print only the top item vs top item plus pending-anomaly count;
  whether an empty queue prints nothing or one quiet line.
- Whether `done` manual ticks append to the queue file or to a sibling journal so the
  queue file stays a pure statement of intent.
