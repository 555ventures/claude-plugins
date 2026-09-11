# Deviations — specs/20260910/02-click-to-advance-and-real-records.md

## Test-author wave

- **tests/consistency/wire-register.test.js**: File Plan listed this file as a D6 repair row
  ("inline mocks that expect acceptance gain data-to"). On inspection it carries no call to
  `journey-drawn`/`journey-approved` and no inline mock through the mocks-driver CLI at all — it
  pins `lib/wire-register.js`'s two exports directly (`stylesheetTargets`/`linksWireRegister`) as
  pure functions. No edit was made; there is nothing in this file the new edge check can affect.
- **size-baseline.json**: D8 names only the scripts-layer raise (`mocks-driver.js`,
  `design-atlas.js`, the `spec/scripts` tree) at build close. The D6 repair itself (adding
  `opts.to`/`writeWireframe` calls and an indexed loop across several existing test files) pushed
  nine tracked tests-layer files over their size-ratchet budgets. Reconciled now via
  `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/02-click-to-advance-and-real-records.md`
  so the test-author wave leaves `npm test` (the size ratchet's own live gate,
  AC-20260908-01-9) green — the scripts-layer raise D8 still names remains the build wave's job.

No genuine fork was hit; A2's seven-file grep held (with the one no-op above), A3/A4 are
unexercised by tests written so far (scripts wave not yet built).

## Scripts wave

- **A2 stale assumption — an eighth caller surfaced**: `tests/mocks/mocks-driver-walk.test.js`
  (not a File Plan row, not covered by the test-author wave's grep above) marks
  `journey-drawn`/`journey-approved` over inline `writeWireframe(dir, 'second-a')` /
  `writeWireframe(dir, 'second-b')` calls (its own second-journey fixture, lines ~32-41) and over
  `writeWireframe(dir, label)` for every `LABELS` entry (line ~64) with no `{to: …}` — none of
  these mocks carry a `data-to` for their journey's own seed edges, so once `edgeGaps` runs at
  `journey-drawn` (D2, this batch) both marks refuse: `AC-20260907-10-1` and `AC-20260907-08-2`
  now red under `node --test 'tests/mocks/*.test.js'`. This is scripts-layer work (`edgeGaps`
  wired into `mocks-driver.js`) surfacing a tests-layer gap outside this worker's File Plan rows
  (spec/scripts/lib/mock-seed-checks.js, spec/scripts/lib/walk-mode.browser.js,
  spec/scripts/mocks-driver.js, spec/scripts/design-atlas.js) and outside the rule against
  editing test files — never fixed here. The fix is the same D6 repair the other seven files
  already got: add `{to: <next label>}` to each `writeWireframe` call above per A2's own named
  remedy ("add data-to to that test's inline mock in the same batch; never weaken the gate").
- **A2 remedy applied — fixture repair, not a redesign**: `tests/mocks/mocks-driver-walk.test.js`
  repaired under A2's own named remedy: `writeWireframe(dir, 'second-a')` now passes
  `{ to: 'second-b' }` (`second-b` is the journey's terminal screen, so it gets none), and the
  `for (const label of LABELS) writeWireframe(dirUnapproved, label)` loop is now an indexed
  `for (let i = 0; i < LABELS.length; i++) writeWireframe(dirUnapproved, LABELS[i], { to: LABELS[i + 1] })`,
  matching the pattern already used by `advanceToJourneyApproved`/`advanceToApproved` in
  `tests/mocks/mocks-driver-fixtures.js`. No assertion, matcher, or AC tag was touched.
  `node --test --test-timeout=45000 --test-force-exit 'tests/mocks/*.test.js'` now passes all
  145 tests, `AC-20260907-10-1` and `AC-20260907-08-2` included — A2 is proven false (eight
  files, not seven) and closed.
