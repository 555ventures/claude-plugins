# Deviations — 10-page-notes-review-loop

- D10 named 7.64.0 as the version-bump target, but the plugin was already past it (7.68.0) by
  build time — a concurrent-session race on this repo's own semver (§ Gotchas: "a spec Decision
  naming a literal version-bump target can be stale by build time"). Bumped to the next free
  minor above the current version instead: 7.69.0.
- D2's unconditional injection ("every text/html response not carrying ?clean gets the script
  tag") collides with a pre-existing, out-of-File-Plan test pin: AC-20260902-07-12
  (tests/design-atlas.test.js:663) asserts `GET /mocks/a.html` (no `?clean`) returns
  `design/mocks/a.html`'s exact original bytes. That assertion is now false by design — D2 was
  applied verbatim (§ Gotchas: "a locked Decision that retires or narrows a literal ... can
  leave a live assertion of the retired form outside the spec's File Plan ... a colliding test
  pin is updated in place ... never left red"). tests/design-atlas.test.js is not in this
  worker's file list (scripts layer only) and this collision was not caught at plan-lock's
  collision-closure legs, so it is left red rather than hand-edited out of scope: the fix is to
  update AC-20260902-07-12's `mockRes` fetch to request `?clean` (or assert the injected form)
  and retag it, owned by the tests-layer worker.
- D8's atlas.md/sketch.md edits route their annotation loop through `spec-paths mocks-driver`
  (a new call site each), which spec/entrypoints.json (AC-20260820-04-6's manifest, consumed by
  tests/consistency/entrypoints.test.js) did not yet declare — a manifest gap, not a File Plan
  row for either worker's batch. Added spec/commands/atlas.md and spec/commands/sketch.md to
  spec/scripts/mocks-driver.js's entryPoints list in spec/entrypoints.json (mechanical JSON data
  fix, no script/doctrine content changed) so the live-repo invocation-direction scan stays at
  zero violations.
