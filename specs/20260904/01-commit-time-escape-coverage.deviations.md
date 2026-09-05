# Deviations — 01-commit-time-escape-coverage

- D9's literal target 7.78.0 was taken by a concurrent commit; bumped to 7.79.0 (Gotchas: literal is a target, not a pin)
- `tests/commit-coverage/commit-mode.test.js` line 43's header comment ("...at committer date 2026-08-22T00:00:00Z.") trips comment-narration.js's `date` class, turning `tests/consistency/comment-narration-live.test.js` red repo-wide. This is a pre-authored, pinned test file outside the gate-scripts batch (owned by plugin-tests) — not edited here per the worker contract (never touch pinned tests). Flagging for the test-author/reviewer to reword the comment (the date literal describes the fixture's committer date, not incidental narration prose).
