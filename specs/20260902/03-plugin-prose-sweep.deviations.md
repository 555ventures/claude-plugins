# Deviations — 03-plugin-prose-sweep

- The baseline row `.claude/comment-narration.baseline.json` moved from layer `other` to `tests` at the
  TESTS step: red-check refused the pre-image as impure because the test author sets it in Phase 1 by
  spec design; as a tests-layer fixture (zero AC-IDs, never executed) it is exempt. Decision D9 also
  corrected D7's count from 2 to 3 (the scan is authoritative, A2).
- The `other`-layer wave for `.claude/rules/spec-pipeline.md` was executed by the kept doctrine worker
  in the doctrine+scripts wave (same file list, one worker); the driver's separate `other` wave was
  marked done without a second dispatch.
- The Gotchas section held 15 entries at build, not the 13 D3 counted; all 15 collapsed one-for-one
  (`prose-cap.js` cap 15 stays green; no test asserts the count).
