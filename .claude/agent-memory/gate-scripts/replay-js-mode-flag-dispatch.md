---
name: replay-js-mode-flag-dispatch
description: replay.js's pattern for a single script with mutually-exclusive boolean mode flags (--due/--select/--setup/...) instead of a subcommand positional — worked cleanly against the spec's tests
metadata:
  type: project
---

specs/20260819/02-mutation-replay.md (D1) asked for one script (`spec/scripts/replay.js`) owning
8 harness modes as flags (`--due`, `--select`, `--setup`, `--apply`, `--score`, `--record`,
`--stats`, `--teardown`) rather than a `merge-back.sh`-style positional subcommand. Implemented
as a `MODE_FLAGS` lookup object consumed in the same hand-rolled arg loop as every other flag —
first flag matching `MODE_FLAGS` sets `mode`, a second one is a usage error (exit 2). Each mode
is its own top-level function that ends by calling `process.exit()` itself; a trailing `switch
(mode)` dispatches. This reads cleanly and kept the header's Exit codes list simple since every
mode shares one alphabet (0/1/2/3/4) instead of each subcommand inventing its own.

**Why noted:** the repo's two prior exemplars (`merge-back.sh` subcommand-positional,
`verdict.js` all-flags-single-mode) don't cover the "one script, several mutually-exclusive
mode flags" shape — this is the third pattern and worked without friction. Reach for it when a
future spec asks for a script with several disjoint boolean-flag modes rather than a verb-first
positional or a single derivation.

**Also confirmed:** root resolution for scripts with no `--root` flag is simply
`process.cwd()` — no `git rev-parse --show-toplevel` needed even for modes that shell out to
git (`--select`, `--setup`, `--teardown`); the calling command/test always passes the intended
root as the process's cwd, matching spec-status.js's own cwd-default shape ([[spec-v6200-derived-next-pointer]] uses the same convention family).

See also [[gate-scripts-parallel-batch-corpus-landing]].
