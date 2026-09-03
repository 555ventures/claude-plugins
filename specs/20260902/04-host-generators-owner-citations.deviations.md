# Deviations — 04-host-generators-owner-citations

- D10 says only "retagged AC-20260902-04-5 with the absent-baseline assertion added" for
  tests/consistency/comment-narration-live.test.js. That file held two prior standing tests
  keyed off the tracked baseline's *content* (AC-20260902-02-1, AC-20260902-03-1). D8 deletes
  the baseline file outright, which makes both of those assertions structurally incompatible
  with a passing AC-20260902-04-5 (one test would assert the baseline is absent while a
  sibling asserts its contents equal a specific object). Retagged the AC-20260902-02-1 test
  body in place as AC-20260902-04-5 (dropped the --baseline flag, asserts total 0 and file
  absence) and removed the AC-20260902-03-1 test body as superseded by D8, noting the
  supersession in the file's header comment instead of leaving a self-contradictory pin.
  AC-20260902-01-13 (baseline entries still exist on disk) was left untouched — it holds
  vacuously true against an empty/absent baseline and needs no change.
- D5 named only two narrated lines in grounding-contract.md but the tracked baseline held
  three contract findings; the third was § Session grounding's "(adopted 2026-07 from the
  mid-2026 Claude Code baseline: ...)" parenthetical, left untouched by D5's literal text.
  Session ruling (repair message): reworded to "(the Claude Code baseline: path-scoped
  rules, checked-in permissions, generated project skills)" — drops the date, keeps the
  meaning, headings untouched. Confirmed via `node spec/scripts/comment-narration.js --root
  . --json`: grounding-contract.md now reports zero findings.
- D2's init.md edit landed at net +2 lines (497 vs pre-image 495), over the "≤ +1" bar. Per
  A4's fallback, shortened the `config` bullet's authoring-bar sentence in the same edit
  ("Same authoring bar as ever: real paths, real commands, no invented references — the
  script validates required keys and exits 2 naming the first missing one, but a *wrong*
  value is never caught for you." → "Real paths, real commands, no invented references —
  the script validates keys and exits 2 naming the first missing one; a *wrong* value is
  never caught.") to bring the file to 496 lines (net +1), without touching the grammar
  literal or the ratchet.
