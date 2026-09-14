# Deviations — 09-the-tool-shows-never-interrupts

- A5 false: `docs/adr/0024` was taken by `0024-the-critic-is-out.md`; the ADR ships as
  `docs/adr/0025-replay-runs-on-demand.md`, and D6, its File Plan row and AC-20260913-09-10 were
  amended before the build started.
- A1 false in spirit: `spec/entrypoints.json` declared `spec/scripts/spec-review-driver.js` as an
  entry point of `replay.js`; D1 deleted that call site, so `tests/consistency/entrypoints.test.js`
  reddened. The row was removed per A1's remedy and the file added to the File Plan.
- A2 false: the reddened exact-footer pins were not in `tests/status/status-diet.test.js` but in
  `tests/status/red-alarm.test.js` (fixture carries one CLEAN review row, no release row). Both
  pins were rewritten to include the earned `· 1 done, never released` clause per A2's remedy,
  never weakened; the file was added to the File Plan.
- `specs/20260821/02-replay-review-phase.md` gained the ADR amendment convention's single
  `Amended by: ADR-0025` header line (orchestrator edit, as ADR-0023/0024 did for their targets);
  the file was added to the File Plan.
- Canonical Delta said "None", but `docs/canonical/review.md` (the replay-cadence passage) and
  `docs/canonical/pipeline.md` (the replay row `via` sentence) still described the deleted
  close-time REPLAY state as live. Both were brought current at integration and added to the
  File Plan; the retired mark name is kept out of the canonical prose.
