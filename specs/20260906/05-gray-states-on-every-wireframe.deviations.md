# Deviations — 05-gray-states-on-every-wireframe

- D4 says `writeWireframe(dir, label, opts)` writes the three state buttons by default via
  `opts.states`; the pre-existing `opts.stateBtn` (a raw-HTML escape hatch three tests in
  `tests/mocks/mocks-driver-look-stops.test.js` depend on for one exact button element) is kept
  working unchanged and bypasses `states` entirely when passed — required to keep every existing
  mocks-driver test green under the fixture change, not a File Plan row.
- The default three-button set is wrapped in `<div data-contract="none">…</div>` inside the
  labeled root. Undeclared, `advanceToApproved`'s fixtures fail the pre-existing hygiene(d) rule
  (design-atlas.js, specs/20260824/03 D1(d): a `data-state-btn` inside the labeled root without a
  `data-contract="none"` ancestor) the moment `approved`'s `check --matrix` call runs over them —
  discovered empirically running the mocks glob after the plain fixture change.
- AC-20260906-05-2 ("check with no --states flag ... byte-identical to today") is authored and
  green against the untouched pre-image, not red — it pins the ABSENCE of the new --states
  mechanism on the flag-less path, the same sanctioned green-pre-change shape as prior specs'
  "not-yet-built mechanism's absence" pins. Confirmed empirically: `node --test
  --test-name-pattern="AC-20260906-05-2" tests/design-atlas.test.js` passes pre-image.
