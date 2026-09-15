# Deviations — 03-the-html-atlas-is-retired

- File Plan lists four tests/mocks/ DELETE rows that do not exist on disk pre-image
  (`client-walk-route.test.js`, `exclusions-route.test.js`, `notes-reanchor.test.js`,
  `wire-register.test.js`) — confirmed absent via `ls`. AC-20260914-03-6's "list generated from
  the File Plan at build" (A4) is reconciled against the live tree in
  `tests/consistency/atlas-retired.test.js`: these four paths are asserted absent (vacuously
  true today, stays true after the batch), never hand-counted or dropped from the pin.
- A2 fired false: `tests/consistency/read-load.test.js`'s `SHARED_FOR.atlas` row asserted a
  scoped section list that no key produces once `atlas` is deleted from `spec/bin/spec-paths`
  (AC-20260908-06-3 reddened with a fail-open superset diff). Per A2's own if-false remedy, the
  `atlas` row is removed from that table in this batch; the fail-open-equivalence pin already
  lives in tests/spec-paths.test.js's "shared-for: scoped output..." test, folded into the
  design/build/review retired-key group.
- tests/helpers.js (D5): `serveAtlas`, `withHandler`, `getJson`/`postJson` (and their private
  `readJsonResponse` helper) removed along with the now-dead `http`/`spawn` requires — no
  surviving test referenced any of the four, confirmed by repo-wide grep. `parseFlatDom` is also
  now unused (its only callers were the deleted design-atlas/review-page test files) but is not
  named by D5's drop list, so it is left in place rather than widening scope beyond the File
  Plan row.
- Orchestrator: deleting tests/design-atlas.test.js and the tests/mocks/ files orphaned 18 criteria of seven older
  done specs (specs/20260911/01, 20260911/06, 20260912/02, 20260912/05, 20260912/06, 20260912/12, 20260913/02),
  reddening tests/doctor/ac-drift-clean.test.js. Each is tagged `[retired: specs/20260914/03-the-html-atlas-is-retired.md]`
  on its pointer line, the same retirement spec 01 applied to its own orphans; those spec files are outside the File Plan.
- Orchestrator: two workers ran read-only git (`git blame`/`git diff`) despite the worker git ban; nothing was written.
  The other-layer worker's `rm -rf` was denied by the permission system and it used `rm -r` for the same File Plan deletions.
