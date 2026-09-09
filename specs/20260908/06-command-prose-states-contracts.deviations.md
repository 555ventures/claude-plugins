# Deviations — specs/20260908/06-command-prose-states-contracts.md

## D1 — AC-20260908-06-3's key count is 18, not 17

**Spec text:** D6 and AC-20260908-06-3 say "sixteen scoped commands plus `run-design`" and
"17 keys, exact order".

**Observed at build TESTS step:** `spec/commands/` holds 17 command files, and
`spec/bin/spec-paths`'s `shared-for` case statement names all 17 explicitly (none falls
through to the default) plus `run-design` — 18 keys.

**Applied:** `SHARED_FOR` in `tests/consistency/read-load.test.js` pins all 18 keys, derived
by running `spec-paths shared-for <key>` per the AC's own instruction ("derive the table's
real values by running the command"). Pinning 17 would have left one command's section list
unpinned, which is the exact silent-drift hole D6 exists to close.

**Scope:** the AC's predicate is unchanged — every scoped key's heading list is pinned
exactly. Only the count literal in the prose is wrong.

## D2 — design's read-load budget is 510, not D7's 490

**Spec text:** D7 and AC-20260908-06-1 set `design ≤ 490`, derived from A4's measurement of 500.

**Observed at build Phase 1:** design measures 510 (own 217 + shared 293) at `build_base`, and
the pre-existing `RATCHET` at HEAD already carried `design: 510` — granted by the recorded
review-gate ruling in specs/20260907/09-atlas-index-and-note-navigation.md D13, which held that
the ten added lines are contracts, not procedure. design.md's File Plan authorizes only D3 (one
bullet removed) and D4 (Setup reword), which net to zero lines.

**Applied:** A4's escalation clause fired — re-measured at build, restated line count 0 (design
is not one of D1's driver-stepped files), budget set to the true ceiling of 510. Recorded as
D12 in the Decisions table on a user ruling (2026-09-09), AC-20260908-06-1's literal corrected
with the superseded text demoted to an indented sub-line, and the test's BUDGET entry carries
the D13 citation inline.

**Not done:** cutting ~20 lines from spec/commands/design.md. It would reverse D13 two days
after it was ruled and would edit prose no File Plan row names. A second option — trimming
design's `shared-for` section list to cut the 293 shared lines — was rejected here: it changes
which doctrine binds the design stage (a behavior change), and AC-20260908-06-3 now pins those
lists precisely so such a change is deliberate and spec-scoped.
