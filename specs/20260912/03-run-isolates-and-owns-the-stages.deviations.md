# Deviations — 03-run-isolates-and-owns-the-stages

- AC-20260912-03-14: `tests/consistency/read-load.test.js`'s `BUDGET.run` is left at its
  pre-image value (310) rather than a guessed number — the test-authoring wave cannot measure
  `own + shared` for `spec/commands/run.md` until the doctrine wave lands Step 0. The
  implementation wave MUST re-measure `spec-paths shared-for run` + `run.md`'s own line count
  once Step 0 is written and raise `BUDGET.run` to that true value (never a round number chosen
  ahead of it, per AC-20260912-03-14's own instruction).
- AC-20260912-03-15: `tests/consistency/stage-files.test.js`'s `STAGE_CAPS` table
  (`stage-build.md: 96`, `stage-review.md: 130`, `stage-design.md: 212`) is a placeholder derived
  from the retired command files' own line counts minus their 4 frontmatter lines (the spec's own
  worked example for `stage-build.md`). The implementation wave MUST re-measure each of the three
  new stage files once written and correct these three numbers to the true measured line count —
  the cap may only shrink from a guessed ceiling, never rise past the true measurement.
- AC-20260912-03-2: the AC's own text says the two `merge-back.sh create` refusals SHALL
  CONTINUE TO exit 2, but its `→` pointer declared `rewrites`, which `red-check.js` reads as a
  demand that the named case be RED against the pre-image — the two contradict each other and
  the run stopped with a `gutted-rewrite` hard finding. The pointer verb was corrected in place
  to `reuses` (the CONTINUE-TO disposition, as AC-20260912-03-16 already spells it); the AC's
  promise, its subject and its test are unchanged.
- AC-20260912-03-12 / AC-20260912-03-17: the test-authoring wave tagged
  `tests/consistency/red-fixture-coverage.test.js` and `tests/render/render-gate.test.js` with
  those AC-IDs in comment lines, although both files' only change is fixture/literal currency and
  both stay green against the pre-image. `red-check.js` derives red expectation from AC-ID
  occurrence anywhere in the file, so both reported `unsanctioned-green`. Per host rules
  § Gotchas the fix is removal, never an invented ID: both comments now name the spec and the
  Decision without the AC-ID. Coverage is unaffected — AC-12's red home is
  `tests/state-gates.test.js` and AC-17's is `tests/consistency/retired-stage-commands.test.js`.
- AC-20260912-03-13 / AC-20260912-03-14: the test-authoring wave put each AC's genuinely-red
  assertions in a NEW sibling test while the AC's `→` pointer names an existing test that stays
  green, which `red-check.js` reports as `gutted-rewrite` (a failing sibling never satisfies the
  named case). Both sets of assertions were folded into the test the pointer actually names —
  `shared-for: scoped …` in `tests/spec-paths.test.js` and `every /spec command has a read-load
  budget entry …` in `tests/consistency/read-load.test.js` — which is also their semantic home:
  each test already owns the roster-versus-table correspondence the AC extends.
- AC-20260912-03-10, out-of-plan collision (host rules § Gotchas, the predecessor-CONTINUE-TO-pin
  and narrowed-default triggers): D10's change of the drivers' recorded `via` default from
  `direct` to `loop` stranded three live assertions no literal in this spec's File Plan names.
  All three were repaired in place and retagged, never weakened: `tests/review/review-driver.test.js`
  carried a SECOND `via === 'direct'` pin (inside the `AC-20260820-07-2` test) that the
  test-authoring wave missed when it rewrote the primary occurrence; `tests/spec-paths.test.js`'s
  scoped-roster floor was a hardcoded `>= 16` that D13's three retirements drop to 13, lowered to
  a floor of 13 because the assertion exists to catch a collapsed roster, not to pin a count; and
  `tests/review/stopped-row-durability.test.js` reconstructed its byte-equality expectation by
  re-invoking `verdict.js` WITHOUT `--via`, so verdict.js's own untouched `direct` default no
  longer matched the driver's row. That last file was outside the File Plan and has been added to
  it as a MODIFY row; its re-run now threads the row's own recorded `via`/`model`, which is what
  its sibling reproducibility pin already documented as the correct shape.
