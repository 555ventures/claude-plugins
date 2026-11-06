# 0041. The status screen is v7's derivation on v8's state

- Status: accepted
- Date: 2026-11-05
- Amended by: specs/20261105/10-a-batch-tells-the-truth.md D6 (§2: a brief item closes only by `/spec:queue done`)
- Amended by: docs/adr/0042-the-queue-item-has-one-owner.md (§1: the item shape, queue file version 3, `lib/queue.js` as the only owner)

## Context

Two attempts to give v8 the v7 `/spec:status` screen drifted: a rebuild from a text capture lost
queue types, `after` gates, specs being built in worktrees and the decide lines; a plan to carry
v7's 930-line script and five libs verbatim (specs/20261105/03, never built) would have put a
second frontmatter, File Plan and brief parser beside v8's own and a lane rule that disagrees
with fanout. JJ's ruling is final: exactly v7's behaviour and UI/UX, built cleanly on v8, not
copied code, minus the ledger lines ADR-0040 already removed.

Two audits (scratchpad `status-audit-findings.md`, 2026-11-05) listed every behaviour v7's
screen has and v8's lacks. Four of them need state v8 does not hold: a prompt item's type, an
`after` gate on any item, a brief that is done when its specs are done (no tick), and a spec
being built in a lane worktree counting as implementing.

## Options considered

- **Carry v7's script verbatim** — exact output, two parsers of everything, a lane rule fanout
  does not share, a 930-line file exempt from every cap. Rejected by JJ.
- **Rebuild from the captured screens** — drifted twice; a capture is not a specification.
- **Port v7's derivation onto v8's modules, prove it with v7's own script** (chosen) — v8's
  parsers gain v7's stricter rules and stay the only parsers; the queue model gains `type` and
  `after`; the proof is a byte-diff against the tagged v7 script on fixture hosts.

## Decision

1. The queue item is `{id, kind, payload, added, done?, type?, after?}`: `type` on prompt items
   only (`plan | prototype | fix | decide`), `after` is `{brief: "NN"}` or `{spec: "specs/…md"}`.
   No `origin`, no `when`. `queue add` takes `--type` and `--after`; `queue next` honours the
   gate; fanout's PLAN waits an item whose gate is unmet.
2. Brief state is v7's rule and lives in one lib (`spec/scripts/lib/work.js`): no spec →
   `unplanned`; every live spec done → `done` (no queue tick needed); else `in-flight`; a
   `Superseded by` banner with nothing in flight → `superseded`. The queue's `reconcile` never
   ticks a brief item: a finished brief's item stays pending until the user runs
   `/spec:queue done NN` (specs/20261105/10 D6). specs/20261105/01 D2's "and the brief's queue
   item ticked" is retired.
3. A spec's state is its frontmatter, except `implementing` while a live run sidecar exists for
   it in the root or in `.claude/worktrees/spec-<stem>/`. The worktree's own frontmatter is never
   read.
4. The screen is v7's derivation — entries, blockers, pairwise lane admission with no cap, decide
   lines, v7's own anomaly kinds as hygiene — ported onto `lib/state.js`, `lib/work.js` and a new
   `lib/next.js`. v8's parsers take v7's stricter rules (`Depends on:` items, every File Plan
   table, bracketless `depends_on`, both banner forms, uppercase brief suffixes). The screen no
   longer calls `doctor.check`; `/spec:doctor` stays the deep audit. ADR-0040's sentence "The
   screen's data is specs, briefs, the queue, run sidecars and `doctor.check`" is amended to end
   at "run sidecars"; its decision on ledger lines stands.
5. The lane block is advice to a person opening worktrees (its header says so); fanout's cap and
   admission are fanout's and are printed by fanout at PLAN. specs/20261105/01 D5 ("lanes on
   screen are what fanout would start") is retired.
6. Proof: v7's `spec-status.js` from tag `spec-v7-final` runs on fixture hosts beside v8's
   `status.js`; the outputs are byte-identical after removing the ledger lines and renaming the
   two v7 command names in anomaly remedies. The test fails, never skips, when the tag is absent.

## Consequences

- One parser each for frontmatter, File Plan tables and roadmap headers; fanout and run.js read
  the same stricter values the screen does.
- The screen and fanout can disagree on how many lanes: the screen says what is independent
  now, fanout says what it starts. Both are stated in the contract.
- `queue.js` grows past its 150-line note (raised to 200); `status.js` is a ≤400 driver plus two
  ≤250 libs, inside the caps.
- The v7 modes `--next`, `--lanes --json`, `--pretty` and the `prototype-open` anomaly are not
  carried: nothing in v8 calls them or can trigger it.
