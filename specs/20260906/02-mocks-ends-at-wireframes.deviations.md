# Deviations — 02-mocks-ends-at-wireframes

- tests/mocks/mocks-driver.test.js's File Plan row names AC-20260906-02-7 alongside AC-1/2/3/4,
  but AC-20260906-02-7's own bullet routes both its WHEN clauses (`--reopen theme` and `--reopen
  journey:<j>` on an APPROVED root) to `tests/mocks/mocks-driver-2.test.js` only. Since
  `red-check.js` derives a file's expected redness from AC-ID occurrence anywhere in the file
  (comments included — spec/pipeline gotcha, specs/20260822/02), mentioning AC-20260906-02-7 in
  mocks-driver.test.js's header without a corresponding test there would force a false red
  expectation onto a file whose actual AC-7 coverage lives entirely in the sibling file. AC-7 is
  pinned only in mocks-driver-2.test.js's `--reopen theme`/`--reopen journey:<j>` test (both
  WHEN clauses, verbatim); mocks-driver.test.js's header comment does not name AC-20260906-02-7.
- AC-20260906-02-5's second pin ("a fixture capture command writing a broken inventory → exit 2
  naming the render finding, no file rewritten") is read as: retag the EXISTING
  AC-20260905-06-9 test (the CHROME_BIN-unreachable/no-design-block scenario) rather than author
  a new "broken inventory" render-finding scenario — AC-20260905-06-7 already covers a broken
  (phone-column) inventory exiting 2 naming "fails the rendered adaptation gate" at
  journey-approved, so a third near-duplicate at `approved` would be redundant coverage, not a
  new invariant. The retagged AC-20260905-06-9 test keeps its CHROME_BIN scenario and setup
  (advanceToThemePicked replacing the retired advanceToReviewed), and adds the "no file
  rewritten" byte-unchanged assertion AC-5 calls for on a refused approved mark.
- **Escalation, not resolved by this worker** (spec-scripts layer; needs a tests-layer fix):
  design-atlas.js check --matrix's hygiene rule (a) unconditionally requires a `box-sizing:
  border-box` rule inside every bound file's OWN inline `<style>` block (external stylesheets are
  never read for this check) — unchanged, pre-existing behavior, forced onto drafts by `--matrix`
  regardless of `data-status`. Before this spec, `approved` was only reachable after the retired
  SKIN step, whose fixture (`writeSkinned`, now deleted) always emitted this rule by hand. Under
  the new SEED→SIGNOFF chain, `approved` is reachable directly from wireframe-stage content, but
  the surviving shared fixtures `writeWireframe`/`writeThemeDirection`
  (tests/mocks/mocks-driver-fixtures.js) never emit a `<style>` block at all, so
  `design-atlas.js check --matrix design/mocks` (called by `handleApproved`, D5, "SHALL CONTINUE
  TO ... green (existing)") always refuses them with "no universal box-sizing: border-box rule".
  This reddens every test that carries a mark through to `approved`: AC-20260906-02-1
  (mocks-driver.test.js), AC-20260906-02-5 and the retagged AC-20260905-06-9 and
  AC-20260906-02-7 (mocks-driver-2.test.js), AC-20260905-02-14 and AC-20260906-02-6
  (mocks-driver-look-stops-2.test.js), and AC-20260902-10-6 (mocks-notes.test.js).
  `handleApproved` is implemented exactly per D5 (order: gate open → theme-picked first → notes
  resolved → stop decided → viewport precondition → `--matrix` check → render-gate → stamp →
  decider/marks.approved → consume); the fix belongs in the tests layer — add an inline
  `<style>* { box-sizing: border-box; }</style>` block to `writeWireframe`/`writeThemeDirection`'s
  emitted HTML (mirroring what the deleted `writeSkinned` used to carry) — not in this file,
  since tests are not the scripts layer's to edit. Resolved in repair round 1 on the tests
  layer: writeWireframe now emits the viewport meta and the box-sizing rule.
