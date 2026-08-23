---
name: info-exclude-not-per-worktree
description: git info/exclude is NOT per-worktree — it lives in the shared common git dir; use the worktree's private git-dir (rev-parse --git-dir) for any marker that must die with the worktree
metadata:
  type: feedback
  reviewed: 2026-08-23
---

`git -C <linked-worktree> rev-parse --git-path info/exclude` resolves into the **shared common git
dir** — i.e. the MAIN repo's `.git/info/exclude` — not a per-worktree file. Any write there leaks
into the host repo and survives `git worktree remove`. Verified by hand:

```
$ git -C $S/gp/wt rev-parse --git-path info/exclude
$S/gp/repo/.git/info/exclude          <-- the MAIN repo
$ git -C $S/gp/wt rev-parse --git-dir
$S/gp/repo/.git/worktrees/wt          <-- genuinely per-worktree
```

**Why:** discovered in `spec/scripts/replay.js`'s `cmdSetup`/`cmdTeardown` — a prior fix tried to
exclude an untracked marker file via info/exclude so it wouldn't leak into `git add -A`. That
"fix" made things worse: it silently and permanently mutated the maintainer's real local git
config on every run, with no dedup and no cleanup, and info/exclude's shared-dir nature directly
contradicted the spec's own "never touches the main tree" rationale.

**How to apply:** when a script needs a marker that must vanish with a linked worktree (teardown
guard, sentinel, scratch state), write it into the worktree's own private git dir — resolve with
`git -C <dir> rev-parse --git-dir` (absolute path ending `/.git/worktrees/<name>` for a linked
worktree; verify it, don't assume — refuse if the path carries no `worktrees` segment, since that
means `--dir` isn't a linked worktree at all). Never write the marker into the working tree at
all if you can avoid it — that's strictly better than working-tree-plus-exclude, because
`git add -A` structurally cannot sweep a file that was never in the working tree, and `git status`
cannot show it either. `git worktree remove` deletes the private git dir for free, so no teardown
bookkeeping is needed beyond checking the marker exists before removing.

**Scope (clarified 2026-08-23).** This is a ban on info/exclude for *worktree-lifetime* markers,
not on info/exclude as such. A deliberate, deduped write of a MAIN-root ignore line for a file
that is *meant* to outlive every worktree is a legitimate different use — `spec-review-driver.js`'s
stopped-ledger self-provisioning is the standing example: it checks `git check-ignore` first,
appends at most once, and its shared-common-dir reach is the point rather than the bug. Do not
report that pattern as a recurrence of this note.
