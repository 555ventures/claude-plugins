# Deviations — 05-desktop-fill-render-rule

- D9 says design.md § Design Canon's "kind list gains `desktop-fill`", but the file carried no
  explicit renderCheck kind list to extend; the Render rules pass sentence gained one clause
  naming `desktop-fill` (content span vs `page.clientWidth`) instead of a new list. File at 158
  lines under the 160 cap.
- The +2 net lines from the above pushed `tests/consistency/read-load.test.js`'s per-command
  budgets over (`/spec:design` 502 > 500, `/spec:init` 972 > 970) on the whole-suite review leg.
  Per Assumption A5, compressed the same "Design harness"/"Render rules pass" paragraph back to
  net +0 (rewrapped at a wider fill width, shorter parentheticals — `(narrow root)` for
  `data-narrow`, `checks are static preconditions` unchanged, dropped no claim) rather than
  raising the cap. `spec/doctrine/design.md` is back to 156 lines, both `data-narrow` and
  `desktop-fill` still named; read-load and design-template tests green.
