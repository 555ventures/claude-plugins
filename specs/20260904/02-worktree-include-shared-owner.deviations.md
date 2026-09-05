# Deviations — 02-worktree-include-shared-owner

- `spec/entrypoints.json` gained a row for `spec/scripts/worktree-include.sh` although the File
  Plan did not list it: the entrypoints consistency sweep (`tests/consistency/entrypoints.test.js`)
  refuses any bundled script without a manifest row, so the whole-suite gate could not go green
  without it. The orchestrator added the File Plan row at build rather than asking — filing
  separately would leave the suite red and pausing had no product consequence to weigh.
