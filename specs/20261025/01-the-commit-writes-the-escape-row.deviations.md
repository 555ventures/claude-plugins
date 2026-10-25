# Deviations — 01-the-commit-writes-the-escape-row

- tests/run-ledger.test.js: the rewritten case (commit.md replaces escape.md in the ledger-reference loop) is GREEN on the pre-image because git/commands/commit.md already references the ledger; the criterion says SHALL CONTINUE TO but its pointer verb is rewrites, so a red cannot be produced without inventing behaviour. Kept green, tagged with the criterion id.
- tests/spec-status.test.js: the lane-render case (spec 20260909/08 criterion 4) and the frozen-action-set case in the prototype-anomaly test pinned /spec:escape outside the spec's AC list (assumption A2 was false); both retargeted in place to /spec:fix, original tags kept.
- tests/escape/escape-row.test.js: the amend newline-guard case and the three old amend/tri-state cases were deleted or rewritten because --amend and killedMatch/softMatch validation retire (D3, D4); their old criterion ids (spec 20260901/07 criteria 5 and 6, spec 20260912/04 criterion 1) lose their only citing test.
- Orchestrator resolution of the two spec defects above: AC-11's pointer verb amended
  `rewrites` → `reuses` (its text already says CONTINUE TO; no promise changes), and the three
  retired criteria (spec 20260901/07 ACs 5 and 6, spec 20260912/04 AC 1) tagged retired on their
  pointer lines, with both spec files added as explicit File Plan rows. The retired set was
  derived as AC-IDs cited under tests/ at HEAD minus those cited now — exactly these three.
- tests worker (D11): also deleted the escape `## Feedback Loop` assert in tests/spec-paths.test.js; under fail-open it would pass vacuously, so its scoped-arm subject retires with the Incident Policy assert. The '12 remaining scoped commands' comment is historical and left; the live scoped roster loop now has 6 commands (no literal 14 existed in the file).
