# Deviations — specs/20260912/14-the-design-stage-prints-the-work-not-the-inventory.md

- AC-20260912-14-9's worked counts line was arithmetically wrong about its own fixture. The AC
  asked for `📝 open notes: 3 (1 project · 2 mock) · addressed: 1` from a fixture of one open
  project note, two open mock notes, one addressed mock note and one open question. That fixture
  holds 3 mock-scope notes (2 open + 1 addressed), not 2 — `cmdNotesOpen`'s `mockCount` counts
  every non-resolved mock note, addressed included (only `status: "resolved"` drops one), so the
  true pre-image output is `📝 open notes: 4 (1 project · 3 mock) · addressed: 1`, executed and
  confirmed against the untouched `spec/scripts/mocks-driver.js`. The pin in
  `tests/mocks/bounded-output-pins.test.js` asserts the observed correct line, and the AC's
  literal was corrected in the spec in the same build so the two agree. No Decision moves: D1–D4
  never reach `cmdNotesOpen`'s counts line, so the pin's `SHALL CONTINUE TO` purpose is intact.
- D6's line-count constraint was paid for by reflowing five adjacent § Mocks: Page Notes
  paragraphs (Status, Questions, the client's page, Walk findings, Picks) onto the wider
  line-width precedent already present elsewhere in the file, recovering 7 lines against the 6
  added — no wording was lost and no grepped literal was split. `spec/doctrine/mocks.md` went
  from 468 to 467 lines; `tests/consistency/read-load.test.js` is green at 18/18.
