# Deviations — specs/20260906/06-sketch-high-fidelity-and-critique.md

- A3 (tests layer): `tests/review/reviewer-seat.test.js`'s `frontmatter()` reads only flat
  `key: value` lines and cannot see a `tools:` YAML list (reviewer.md's own `tools:` block),
  so it cannot pin `design-critic.md`'s `tools` array. Per A3's fallback,
  `tests/consistency/design-doctrine.test.js` carries its own ~12-line `frontmatterWithLists()`
  reader (handles the `key:` + indented `- item` list shape) instead of reusing the existing one.
- D2 (doctrine layer): D2's exact `[no-ac: prose contract]` wording — "the brief's existing
  wireframe-register mocks" and the printed fallback line "sketching in the wireframe
  register" — is reworded in `spec/commands/sketch.md` to "gray mocks" / "sketching gray,
  structure only". Literal "register" collides with `tests/design-look-handoff.test.js`'s
  AC-20260905-04-6 retired-hub-literal ban, which greps `spec/commands/{mocks,sketch,atlas}.md`
  case-insensitively for "register" (a leftover from the deleted machine-wide hub's
  registration endpoint) — the collision is coincidental (unrelated meaning), but the ban is a
  blunt substring match with no carve-out. No test pins D2's exact fallback string (it is
  `[no-ac:]`), so the reword is forced-but-unblocking: same substance (gray/wireframe register
  vs themed register), no literal "register" in sketch.md. `design-atlas.js`'s own violation
  message (D1, AC-20260906-06-1) still says "wireframe register" verbatim — that file is
  outside the ban's scope.
