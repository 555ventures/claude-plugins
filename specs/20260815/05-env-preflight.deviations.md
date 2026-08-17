# Deviations — specs/20260815/05-env-preflight.md

Forced-but-unblocking departures recorded during `/spec:build`. Folded into findings by
`/spec:review` at close.

- **D8 version target stale.** The Decision names `6.79.0`; `spec/.claude-plugin/plugin.json`
  was already at `6.83.0` at build time (concurrent sessions race semver — the established
  gotcha D8 itself anticipates). Bumped to the next free version, **6.84.0**, with the
  description changelog line. Assumption A4 ("6.79.0 is free at build time") is therefore
  falsified as written and resolved by its own stated remedy; no scope or behavior change.
- **Placeholder AC token removed from a colliding pin (orchestrator edit).** The test worker
  wrote a literal `AC-20260815-05-N` into the `tests/terminal-observable-acs.test.js` key-set
  test name and assert message. The File Plan assigns that row no AC (it is the collision-sweep
  fix), and `AC-…-N` does not match `ac-matrix.js`'s AC-ID grammar, so the token was removed
  rather than replaced with an invented ID. Assertions unchanged.
