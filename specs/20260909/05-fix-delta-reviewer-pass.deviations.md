# Deviations — 05-fix-delta-reviewer-pass

- D2's empty-delta refusal at `--mark fix-applied` (spec-review-driver.js) reddens 13 pre-existing
  tests whose shared setup marks `fix-applied` with no real file edit since the reviewer returned
  — the exact A2 collision `tests/review/review-driver-fix-cycle.test.js`'s own header comment
  already names and fixes for its own file (`src/foo.js` touched before each `fix-applied` call).
  The same fix is needed in `tests/review/escalate-row.fixtures.js`'s shared `driveToCapEdge()`
  helper (used by `escalate-cap-durable.test.js`, `escalate-row.test.js`,
  `escalate-row-step.test.js`) and in `tests/review/disposer-gate-refusals.test.js`'s own
  AC-20260901-09-7 setup — none of these files are in this worker's dispatched file list
  (scripts layer: `spec/scripts/spec-review-driver.js` only), so they are left red rather than
  edited out-of-scope. D1-D5/AC-20260909-05-1..6's own dedicated fixtures
  (`tests/review/fix-delta-pass.test.js`, `tests/review/review-driver-fix-cycle.test.js`) pass
  cleanly against the implementation as written; the check was not narrowed to make the stale
  siblings pass.
- D9 (File Plan rows for `tests/review/escalate-row.fixtures.js` and
  `tests/review/disposer-gate-refusals.test.js`) is now applied: `driveToCapEdge()`'s three
  `fix-applied` calls and AC-20260901-09-7's setup each get a content-preserving `src/foo.js`
  edit first, matching `review-driver-fix-cycle.test.js`'s established pattern. A full
  `node --test 'tests/review/*.test.js'` run after the fix is 255 pass / 4 fail — the 4
  remaining failures are `escalate-cap-durable.test.js`'s two "durable cap" tests (own
  `fix-applied` calls at lines 67 and 80, after `driveToCapEdge()` returns) and
  `escalate-row-step.test.js`'s local `driveToCapEdgeHard()` mirror plus its own trailing
  `fix-applied` call — the identical A2 collision, same remedy, but neither file is a D9 File
  Plan row nor this worker's dispatched batch, so they are left red rather than edited
  out-of-scope. D9's own two rows are fully green.
- The 4 remaining failures noted above are now fixed by a second D9 File Plan batch
  (`tests/review/escalate-cap-durable.test.js`, `tests/review/escalate-row-step.test.js`): each
  non-capping `fix-applied` call gets the same content-preserving `src/foo.js` edit first
  (`escalate-cap-durable.test.js`'s two "durable cap" tests at lines 67/80;
  `escalate-row-step.test.js`'s `driveToCapEdgeHard()` loop and its AC-20260822-01-9 red-leg
  loop). `node --test 'tests/review/*.test.js'` is now 259 pass / 0 fail.
