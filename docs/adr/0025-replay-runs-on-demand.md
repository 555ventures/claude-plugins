# 0025. Replay runs on demand

- Status: accepted
- Date: 2026-09-13
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260913/09-the-tool-shows-never-interrupts.md)
- Applies to: (a) specs/20260821/02-replay-review-phase.md D1/D2/D5 — retired: D1's REPLAY
  state (entered between MERGE's conclusion and DONE, running `replay.js --due`/`--select`
  itself), D2's `replay-recorded` mark (`replayTarget`, the target-runId row-count check), and
  D5's ruling that execution is "review's own close... rather than a printed reminder" are all
  reversed. (b) `spec/doctrine/core.md` § Feedback Loop — the replay-cadence paragraph is
  rewritten in place by specs/20260913/09 D5; this record is the durable account of why.
- Amended by: —

## Context

specs/20260821/02 built the REPLAY state on a real measurement: the printed-reminder form —
`/spec:review`'s CLEAN report printing `reviewer replay due — run /spec:replay` and nothing
running it — was tried first and skipped through 12+ reviews in ~48 hours. The state machine
fix that followed was defensible on its own terms: a checklist a state machine owns cannot be
scrolled past the way a printed line can. It shipped as D1 (REPLAY between MERGE and DONE),
D2 (the `replay-recorded` mark, refused until a `stage:"replay"` row exists for the selected
target), and D5 (doctrine recording that execution is the driver's own close, not a reminder).

The owner's finding, stated directly: the block is bypassed anyway, and the surprise of an
interrupt arriving mid-delivery — after CLOSE and MERGE have already concluded, with the
change already merged — is the actual cost, worse than the thing D1–D2 were built to prevent.
A state that exists solely to force an action the owner will route around is an interrupt with
no upside, the same conclusion ADR-0024 reached about a different forced producer in this same
queue class (a critic no person asked for). specs/20260913/09 takes this as final rather than
re-arguing it, and takes the printed-reminder measurement's real lesson — a fact that must be
seen to matter cannot live somewhere nobody is looking — to its next home: `/spec:status`'s
dashboard footer, read every session, carrying a `replay due (r/5) — /spec:replay` clause that
prints and is ignorable, never blocks, and needs no report to have been seen.

## Options considered

- **A. Rewrite specs/20260821/02 and core.md's cadence paragraph in place**, with no ADR.
  Rejected: specs/20260821/02 is a locked spec recording a measured ruling with its own cited
  evidence (the 12+-skip figure); silently rewriting it erases the fact that the ruling
  reversed and on what grounds, the same failure the amendment convention exists to prevent
  (ADR-0018, ADR-0019, ADR-0023, ADR-0024).
- **B. Leave specs/20260821/02 standing as text the code now disagrees with**, trusting the
  reversal to be self-evident from the new spec. Rejected: a locked Decision a reader can no
  longer trust against the running code is exactly the failure the roadmap-amendment
  convention prevents, and D1/D2's entire subject — the REPLAY state and its mark — is deleted
  outright by specs/20260913/09 D1, not merely narrowed.
- **C. One amendment ADR retiring D1/D2/D5 in specs/20260821/02 and recording why core.md's
  cadence paragraph was rewritten**, with the matching `Amended by` backlink on the spec.
  Adopted — the precedent ADR-0024 and ADR-0023 already set for this repo, applied here to a
  full retirement of a locked spec's three central Decisions rather than a narrowing of one.

## Decision

**Option C.** specs/20260821/02-replay-review-phase.md's D1, D2 and D5 are retired:

- **D1** (the REPLAY state) is reversed. `spec-review-driver.js`'s state chain no longer has a
  step between MERGE's conclusion and DONE: `CLOSE -> MERGE/CONFLICTS -> DONE (terminal)`.
  Deleted: `replayEntry`, `replayStepBody`, `countReplayRowsFor`, `handleReplayRecorded`, the
  REPLAY arm of the step map, and `replayBin`. A CLEAN close prints `DONE` every time, whether
  or not the harness reports a replay due.
- **D2** (the `replay-recorded` mark) is reversed. `marks.replayTarget`/`replayRecorded`, the
  `replay-recorded` case in `doMark`, and its name in the unknown-mark refusal are deleted; the
  refusal now enumerates `skips-extracted | reviewer-returned | dispositions | fix-applied |
  closed | merge-strategy | conflicts-resolved`. No mark can park a close on a replay outcome
  any more, because no state does the parking.
- **D5** (the "state instead of a print" ruling) is reversed. `core.md` § Feedback Loop's
  replay-cadence paragraph — rewritten in place by specs/20260913/09 D5 — records the opposite
  of what D5 ruled: execution is `/spec:replay`, run on demand, never the review driver's own
  close; dueness is seen on the `/spec:status` footer's `replay due` clause, printed every run
  whether or not anyone acts on it, rather than gating a report or a state transition.

`/spec:replay` becomes the **only** executor — `spec/commands/replay.md`'s "Two entry points,
one executor" paragraph (D4's own account of the REPLAY-state/manual-surface split) becomes
"One entry point." Dueness derivation itself does not change: `replay.js --due`'s
`reviewsSince`/`due` computation, moved verbatim into `spec/scripts/lib/observation.js` as
`replayDueness` by specs/20260913/09 D2, is the same derivation D1 called — only who calls it,
and what happens when it says due, changes.

D3 (REPLAY never re-derives or gates the verdict), D4 (one executor, two entry points — narrowed
above, not otherwise reopened), D6 (rejecting a standing never-red census surface), D7–D9 (the
version/entrypoints wiring that shipped with D1/D2), and D10 (agent-memory disposition at review
close) are untouched by this record.

## Applies to

1. `specs/20260821/02-replay-review-phase.md` D1/D2/D5 — retired, as above.
2. `spec/doctrine/core.md` § Feedback Loop — the replay-cadence paragraph, already rewritten in
   place by specs/20260913/09 D5; this record is the durable account of why.

## Consequences

- A reader of specs/20260821/02 who wants to know whether a due replay still parks a CLEAN
  close finds the `Amended by` line and follows it here, rather than trusting a Decision the
  code no longer runs.
- The printed-reminder measurement (12+ skips in ~48 hours) that justified D1 in the first
  place is not discarded — it is why dueness now lives somewhere read every session
  (`/spec:status`'s footer) rather than in a report a CLEAN close prints once and nobody
  revisits. The state-machine fix is retired; the lesson about where a fact must live to be
  seen is carried forward into a different, non-blocking home.
- A CLEAN close can no longer be delayed by a replay outcome under any circumstance — the
  owner's stated cost (a bypassed block plus a surprise mid-delivery interrupt) is fully
  removed, at the cost of dueness now depending on someone reading the footer rather than being
  structurally forced.
- `spec/scripts/lib/parse-selection.js`, whose sole consumer was the REPLAY state's `--select`
  parsing inside the driver, is deleted outright by specs/20260913/09 D1 alongside its test.
- specs/20260821/02's own Contracts and Behavior sections (the REPLAY state machine, the
  `replayTarget` sidecar shape) describe code that no longer exists; they are read historically,
  the same status every other amended-whole clause in this repo's ADR chain already carries.
- No other Decision in specs/20260821/02 (D3, D4's manual-surface half, D6–D10) is reopened.

## Dissents

None recorded. The REPLAY state was weighed at its own lock as the correct fix for a measured
failure (a checklist a state machine owns cannot be scrolled past), and specs/20260913/09's own
Rationale takes the owner's reversal as final rather than re-arguing it — a block on an
already-finished review (CLOSE and MERGE both concluded before REPLAY ran) is bypassed anyway,
and the interrupt's surprise, arriving mid-delivery, was judged the real cost, worse than the
skipped-reminder failure D1 was built to fix. No dissent was raised against specs/20260913/09's
Decisions at lock.
