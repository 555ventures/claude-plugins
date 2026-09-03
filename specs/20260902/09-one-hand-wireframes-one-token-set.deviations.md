# Deviations — 09-one-hand-wireframes-one-token-set

- D8's literal version-bump target (7.63.0) is stale by build time — the plugin is at 7.67.0 on
  this branch, and per `.claude/rules/spec-pipeline.md` § Gotchas ("A spec Decision naming a
  literal version-bump target can be stale by build time — concurrent sessions in this repo
  race the same semver") the build bumps to the next free version instead. Bumped to 7.68.0.
- Integration: `tests/consistency/genesis-doctrine.test.js` line 94 carried a date literal (`observed 2026-09-03`) landed by a concurrent `main` commit (cb7acb2) merged into this branch; the comment-narration sweep (AC-20260902-04-5) reddened on it. Replaced the date with the owner citation (this spec path) — no assertion touched.
