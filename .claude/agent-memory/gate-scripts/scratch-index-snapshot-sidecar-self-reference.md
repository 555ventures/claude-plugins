---
name: scratch-index-snapshot-sidecar-self-reference
description: a GIT_INDEX_FILE scratch-index tree snapshot placed inside a driver's own sidecar dir must exclude that dir via a negative pathspec, or it captures its own churn and lock file
metadata:
  type: project
---

When a driver snapshots the working tree as a git tree object via `GIT_INDEX_FILE=<scratch> git
add -A . && git write-tree` (spec-review-driver.js's D1, specs/20260909/05-fix-delta-reviewer-pass.md),
and the scratch index file lives inside the driver's own sidecar directory (the natural place — it
dies with the sidecar), `git add -A .` must explicitly exclude that sidecar via a negative pathspec:
`git add -A -- . ':(exclude)<sidecarRel>'`.

Two failure modes without the exclusion, both confirmed by an executed spike (2026-09-10):
1. The sidecar's own churn (reviewer-return-N.json, disposer-return-N.json, review-state.json
   edits between two snapshots) gets captured as "changed files," polluting any file-delta derived
   from diffing two snapshots — silently wrong in test hosts that don't gitignore the sidecar
   pattern (`specs/**/*.review/` is gitignored in the real plugin repo but NOT in the synthetic
   `tests/review/*.fixtures.js` hosts, which never gitignore it).
2. If the scratch index file itself sits inside the directory `git add -A` scans, git's own
   `<indexfile>.lock` transiently created during `add` can get picked up as an untracked file and
   added to the very tree being built — a snapshot capturing its own lock file.

Both are fixed by the same negative pathspec excluding the sidecar directory; `git status
--porcelain` on the REAL index is unaffected either way (GIT_INDEX_FILE never touches it).

See [[gate-scripts-parallel-batch-corpus-landing]] for the general pattern of test hosts diverging
from the real repo's gitignore assumptions.
