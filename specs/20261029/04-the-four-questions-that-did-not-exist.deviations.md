# Deviations — 04-the-four-questions-that-did-not-exist

- D6: the second plugin's manifest was bumped by hand (1.11.0 → 1.12.0, changelog rotated to three
  entries) instead of through `scripts/plugin-bump.js --bump`; the session's worktree guard refused the
  script call because the plugin's name is also a VCS command word. `plugin-bump.js --check` is green
  over the result, the same oracle D6 names.
- D6: the orchestrator ran both bumps and landed the `spec/entrypoints.json` row and the
  `.claude/spec.config.json` restamp (D8) itself rather than dispatching the `other` wave to a worker —
  four single-line mechanical edits with script oracles.
