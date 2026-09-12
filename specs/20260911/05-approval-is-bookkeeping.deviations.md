# Deviations — 05-approval-is-bookkeeping

- Test author (tests layer): D8 names only `tests/mocks/mocks-driver-exclusions.test.js`'s
  AC-20260910-05-4 exit-2/`ledger set --id E2 --status confirmed` half and
  `tests/mocks/exclusions-route.test.js`'s AC-20260910-05-6 confirm-disabled half as retired
  assertions to rewrite. A third pre-existing assertion collided the same way but is unnamed:
  `mocks-driver-exclusions.test.js`'s AC-20260910-05-8 test pinned the OLD one-heading
  `exclusions.md` format and the OLD "N exclusions" tail line, both fully superseded by D4's
  two-heading/"<a> agreed · <n> not contested" contract (which AC-20260911-05-6 re-specifies in
  full). Left unchanged it would go red the instant D4 lands, unpinned by any AC. Folded its
  coverage into the two new AC-20260911-05-6 tests (populated-both-headings, and the "- none"
  empty-heading fallback) and removed the old test — never left standing, never weakened.
- Test author (tests layer), scripts batch build: a fourth pre-existing collision, same class as
  the one above but in `tests/genesis/roadmap-parking-lot.test.js`. Its own AC-20260910-05-7
  sub-test "the BRIEF step's read-only 'derived from' line carries the confirmed-exclusion count"
  (line ~176) asserts `/exclusions confirmed: 1/` — the exact phrasing D5 retires and the sibling
  AC-20260911-05-8 test in the SAME file explicitly asserts is gone
  (`assert.ok(!/exclusions confirmed:/.test(brief.stdout), …)`). The two assertions are mutually
  exclusive; no code change satisfies both. Built to D5/AC-20260911-05-8 (the newer, more specific
  pin, and the one the spec's own Decision and Contracts block name) — `genesis-driver.js` now
  prints ` · exclusions: <a> agreed · <n> not contested`. The AC-20260910-05-7 sub-test is left
  red; it needs the same retag-and-rewrite the mocks-driver-exclusions.test.js item above already
  got, which is outside this worker's file list (tests/ is plugin-tests' surface, not
  gate-scripts').
- D8 named two retired assertions; a third was a predecessor CONTINUE-TO pin the literals grep
  cannot reach — `tests/genesis/roadmap-parking-lot.test.js`'s AC-20260910-05-7 BRIEF-count test
  asserted `exclusions confirmed: 1`, the exact line D5 retires, so its subject is deleted by this
  spec. The test is deleted (never weakened); its successor is this spec's AC-20260911-05-8 test in
  the same file, which asserts the replacement line. The file's header comment is retagged.
- Scope widened by two files on JJ's ruling (2026-09-11, build repair round 1):
  `spec/scripts/spec-number-check.js` skipped the deviations sidecar as `*-deviations.md` (hyphen)
  while both drivers write `<spec>.deviations.md` (dot), so the guard read this build's own sidecar
  as a second spec numbered 05 and reddened the post-gate on every live build. The skip now matches
  either separator and `tests/doctor/spec-number-check.test.js` covers the dot form the drivers
  actually write. Pre-existing defect (landed in 3d79c88), unrelated to this spec's behavior; JJ
  chose "fix it here" over pausing the build or closing on a red check.
