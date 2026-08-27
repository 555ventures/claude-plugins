- D7's literal version target `7.37.2` was stale at build time — the manifest was already at
  `7.39.1` (concurrent sessions landed 7.38.x/7.39.x after the spec was hardened). Per orchestrator
  ruling and pipeline rules § Gotchas ("a spec Decision naming a literal version-bump target can be
  stale by build time"), bumped to the next free version `7.39.2` instead, with the changelog
  paragraph's leading version token changed from `7.37.2` to `7.39.2` (every other word kept
  verbatim, including the correct, unrenumbered reference to "7.37.1"). Changelog window is
  `7.39.2` + `7.39.1` + `7.39.0` (last-3 form); `7.38.1` rolled off instead of D7's stale `7.36.0`.
