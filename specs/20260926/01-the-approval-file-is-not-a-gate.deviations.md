# Deviations — 01-the-approval-file-is-not-a-gate

- D11's retirement list is incomplete: deleting the `AC-20260914-02-11: WHEN spec-paths
  shared-for run-design runs...` test from `tests/spec-paths.test.js` (per this spec's own
  File Plan row) also removes the only remaining citation of
  `specs/20260912/03-run-isolates-and-owns-the-stages.md`'s `AC-20260912-03-20` (the deleted
  test's header comment read "AC-20260914-02-11 (rewrites AC-20260912-03-20 in place)"). This
  reddens `tests/doctor/ac-drift-clean.test.js` with `specs/20260912/03-run-isolates-and-owns-
  the-stages.md AC-20260912-03-20 no test cites it` — the Twelfth-trigger Gotcha class (deleting
  a test file/citation orphans a done spec's AC), one hop removed: the orphaned AC-ID belongs to
  a THIRD spec (20260912/03) that D11 never enumerated, only 20260914/02 and 20260824/02.
  AC-20260912-03-20's own text ("SHALL CONTINUE TO emit `## Design Render Gate`") was in fact
  already superseded by specs/20260914/02 D10 (which deletes `## Design Render Gate` from
  design.md outright) — the citing test had evolved past what the AC literally claims, and only
  the comment's incidental mention of the ID kept `ac-drift.js` satisfied.
  Remedy (not applied here — `specs/20260912/03-run-isolates-and-owns-the-stages.md` is not a
  File Plan row of this spec and is doctrine-author's surface, not tests'): add
  `[retired: specs/20260926/01-the-approval-file-is-not-a-gate.md]` to
  `specs/20260912/03-run-isolates-and-owns-the-stages.md`'s `AC-20260912-03-20` pointer line, the
  same way D11 already does for specs/20260914/02 AC 3/9/11 and specs/20260824/02 AC 3.
- AC-20260926-01-7's text quoted the retired bullet shape verbatim as its worked example, and
  `parseAcBullets` read that quote as AC-7's own `[pre-green: design-landed]` tag — sanctioning
  its file green against the pre-image (red-check `broken-pin`), and it would fire
  `invalid-pre-green` on this spec once the enum shrinks. The orchestrator reworded the example
  to name the tag's reason without the bracket form; the promise and its literals are unchanged.
- The test author retitled the pointed tests; red-check resolves `rewrites <file> :: <name>` by
  title prefix, so the orchestrator restored each pointed title as the prefix (spec-status,
  spec-paths ×2, red-check) with the new AC-ID following it.
- AC-7's `→ rewrites` pointer also ended in the bracket form, which `trailingRun` reads as a
  trailing tag; the pointer and the pointed test title were reworded together to "declares the
  design-landed pre-green reason".
- Applied the remedy the first deviation entry above named but did not apply: added
  `[retired: specs/20260926/01-the-approval-file-is-not-a-gate.md]` to
  `specs/20260912/03-run-isolates-and-owns-the-stages.md`'s `AC-20260912-03-20` pointer line, so
  its orphaning (a consequence of deleting `tests/spec-paths.test.js`'s
  `AC-20260914-02-11` test, which was that AC's only remaining citation) does not red
  `tests/doctor/ac-drift-clean.test.js`.
- AC-20260926-01-7 requires the `invalid-pre-green` finding's `detail` to name the offending
  out-of-enum reason and the three valid reasons; `spec/scripts/red-check.js`'s message never
  did this even before this spec (`... reason outside PRE_GREEN_REASONS for <AC-ID> ...`, no
  reason value, no valid list) — not a File Plan row of this spec (File Plan lists only
  `lib/spec-sections.js`'s enum shrink under the scripts layer). Widened the message in place
  to include the tagged reason(s) and `PRE_GREEN_REASONS.join(', ')` so the AC's test passes;
  no other finding shape, class, or exit code changed.
