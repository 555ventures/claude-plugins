# Deviations — 05-the-kit-and-the-journey-stories

- Test author (tests-layer batch): `tests/fixtures/genesis/storybook-build-stub.js`'s call-count
  location is unspecified by the spec beyond "choose a location ... and document it in the stub's
  header" — implemented as the `STORYBOOK_BUILD_CALL_COUNTER` env var (unset = no counter kept),
  mirroring the existing `tests/fixtures/genesis/shadcn-stub.js`'s `STUB_COUNTER` convention. The
  build implementer's `runShell`/`runStorybookBuild` call does not need to know about this env var
  at all — it only matters to tests that set it before invoking a mark.
- Test author: `journeyStoriesCheck`'s exact return shape (D2) is left unpinned in
  `tests/genesis/storybook-index.test.js` — the File Plan only cites AC-3/-4/-5 for that file
  (readIndex, stateStoriesCheck, normalizeName, importSpecifiers), and D2's remaining function is
  exercised only indirectly through the driver's `--mark journeys-drawn` behavior in
  `tests/genesis/design-stage-kit.test.js` (AC-14/-16/-17), which pins only its observable effect
  (the refusal message, `status.designStage.journeys.stories`) — not its internal call shape. The
  build implementer is free to choose `journeyStoriesCheck`'s internal return type.
