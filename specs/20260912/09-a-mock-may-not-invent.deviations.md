# Deviations — 09-a-mock-may-not-invent

- A5 falsified at build: `docs/adr/0017-a-mock-may-not-invent.md` was claimed by a sibling
  (`0017-the-register-is-the-whole-shadcn-set.md`), as were 0018–0021. The ADR ships as
  `docs/adr/0022-a-mock-may-not-invent.md`; the File Plan row and A5 were amended in this build
  per the row's own instruction.
- A2's site count did not hold against a live grep at the tests wave: `wire/` appears in
  `tests/design-atlas.test.js` at exactly one genuinely wire-linking, style-bearing site
  (`wireAfterThemeMock`, itself unused by any test in the file) rather than "five," and in
  `tests/mocks/mocks-driver-fixtures.js` at exactly one (`writeWireframe`) rather than "six" —
  `writeKitCanon`/`writeThemeKit` link `wire/`/`tokens.css` but carry no `<style>` block to
  repair. Both real sites were repaired as instructed. Removing `writeWireframe`'s box-sizing
  reset is confirmed, per the spec's own Assumption A1, to redden hygiene (a) against the
  pre-image `design-atlas.js` — this reddens one out-of-File-Plan test at the tests wave,
  `tests/mocks/mocks-driver-notes-gate.test.js`'s `AC-20260912-07-4` (via
  `advanceToJourneyApproved`'s `check --matrix`), because D8's compensating "wire-register link
  satisfies hygiene (a)" route lives in the scripts wave's File Plan row for
  `spec/scripts/design-atlas.js`, not this one. This is expected to self-resolve once that row
  lands in the same build; flagging here rather than leaving it for the reviewer to rediscover
  as an unexplained regression outside the File Plan.
- Scripts wave, D5/D7: the orchestrator's own hazard note ("wire.css's HEADER COMMENT contains
  tokens like `.js` and `.md` — strip comments before parsing, in both classNamesIn and rulesIn")
  is applied verbatim in `spec/scripts/lib/kit-layers.js` — `classNamesIn`/`rulesIn` strip
  `/* … */` before any class-name or rule regex runs. `tests/mocks/mock-invention.test.js`'s own
  `WIRE_CAP` helper (top of the file) does NOT strip comments, and its class regex (`\.([-\w]+)`)
  also admits a bare digit after `.` (e.g. `1.4` inside `calc(var(--radius) * 1.4)` reads as a
  class named `4`). Measured against the current `spec/templates/mocks/wire.css` (23 real
  classes after spec 08's primitive re-draw): the test's own helper computes 29 (23 real +
  `css`/`js`/`md`/`4`/`6`/`8` picked up from the header prose and the border-radius calc); the
  correctly comment-stripped, letter-first-character implementation in `kit-layers.js` computes
  23. This makes AC-20260912-09-4's second assertion (expects `over the shared kit's own 29`)
  fail against the correct implementation — `design-atlas.js check` reports `over the shared
  kit's own 23`, the true count. This is a defect in the already-landed test fixture's own
  `WIRE_CAP` helper, not in this wave's implementation: the hazard note is unambiguous that the
  cap must be computed from a comment-stripped read, and a stale/inflated cap is exactly the
  false negative D5 exists to prevent (a project kit at 29 non-comment classes would silently
  clear a cap that should have been 23). Fix belongs in
  `tests/mocks/mock-invention.test.js`'s `classNamesInCss` (strip `/\/\*[\s\S]*?\*\//g` first,
  and require a letter/underscore immediately after `.`) — out of this wave's file list (tests/
  is owned by a different wave), so left for the reviewer/disposer rather than touched here.
- Fixed the deferred item above: `tests/mocks/mock-invention.test.js`'s `classNamesInCss` now
  strips `/* ... */` comments before parsing selectors, matching the comment-stripping
  discipline `spec/scripts/lib/kit-layers.js`'s `classNamesIn` already applies. wire.css's own
  header comment (`.md`, `.css`, `.js`, `calc(var(--radius) * 0.6|0.8|1.4)`) previously inflated
  the derived cap from 23 to 29, giving AC-20260912-09-4 six phantom class-name slots and hiding
  a real over-cap defect. The cap is still computed from the template at run time, not
  hardcoded; the helper stays independent of kit-layers.js so the assertion isn't tautological
  against the code under test. All 7 tests in the file pass after the fix.
- D9 cites the hygiene spec as `specs/20260824/03-mock-hygiene-and-marks.md`; no such file
  exists. The real path is `specs/20260824/03-mock-states-hygiene.md`, which is the spec that
  carries hygiene check (a) in its D1. The ADR's `Applies to` entry uses the real path — a
  dangling `Applies to` reference would have been worse than a departure from the Decision's
  literal spelling.
