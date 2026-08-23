# Deviations — specs/20260823/01-release-legs.md

- D13's literal version target (7.20.0 "at plan time") was stale by build time: a concurrent
  session landed 7.20.0 on main mid-build (the recorded semver-race gotcha). Bumped
  `spec/.claude-plugin/plugin.json` to the next free minor, **7.21.0**, per orchestrator
  ruling, keeping D13's changelog form (a paragraph in `description`, last-3-versions:
  7.21.0/7.20.0/7.19.0, 7.18.0 dropped).
