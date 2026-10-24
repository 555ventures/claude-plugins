# 0036. Replay retired

- Status: accepted
- Date: 2026-10-24
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20261024/05-replay-retired.md)
- Applies to: ADR-0025 — superseded in full; specs/20260819/02, 20260819/03, 20260820/02,
  20260821/02, 20260823/05, 20260823/09, 20260826/01, 20260831/01, 20260901/08, 20260909/02,
  20260913/01 — their replay surfaces retired
- Amended by: —

## Context

Mutation replay measured the reviewer's catch-rate: it injected one known defect class into a
tree a review had already passed, dispatched the standard reviewer blind, and recorded whether
the defect was caught. ADR-0025 moved it out of the review state machine into an on-demand
command with a status-footer reminder. After that move it ran rarely: 38 runs in total, the
last on 2026-09-14, and none in the 40 days and roughly 250 specs since. It still cost 6,755
lines across a script, a corpus library, a command, a doctrine file and five test files, plus
a dueness footer, two fleet queries and a review-legs flag kept only to blind a replay tree.

Core doctrine named its catch-rate one of two ground-truth signals. In practice every status
view, report and audit read the other one, the escape ledger.

## Decision

Replay is removed as one unit (specs/20261024/05-replay-retired.md D1–D4): the command, its
script and corpus library, its doctrine file and tests, the `replay due` status-footer clause,
fleet-reader's replay-debt and corpus-gap queries, and the review-legs replay flag. Core
doctrine now reads: the escape ledger is the pipeline's one ground-truth signal.

Left in place on purpose:

- The 38 historical `stage:"replay"` rows stay in the run ledger. No reader interprets them
  and nothing deletes them.
- The cross-worktree write hook keeps its replay scratch-worktree exception's logic (D8). It
  is reachable only through a marker the deleted script planted, so it is dead and harmless;
  editing a hook every session runs through costs more than it saves. Reopen at the next edit
  to that hook.
- The build stage's prototype REPLAY step is a different feature with the same word
  (specs/20261007/03) and is unchanged.

## Consequences

- No measured catch-rate exists any more. A CLEAN verdict is falsified only by an escape row.
- A host that still runs the old command or reads the removed fleet keys must upgrade past
  this version knowingly; none was known at lock.
- No grounding-contract change: the host config's `replay` block was never in the contract,
  so no host owes a re-stamp. This repo's own config drops the block.
