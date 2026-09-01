# Deviations — 01-replay-range-materialization

- The doctrine worker ran a read-only `git log` on `spec/.claude-plugin/plugin.json` to confirm
  7.46.0 was still free before bumping, departing from the Worker Rules' "never run git".
  Forced by the tension between that rule and § Gotchas' version-bump-target rule, which requires
  the build (not the spec) to establish the next FREE version at build time. Read-only, no
  repository state changed; logged by the orchestrator, not the worker.
