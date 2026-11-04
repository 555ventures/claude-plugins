---
description: Guided branch merge covering pre-merge inspection, strategy choice, conflict repair, and worktree cleanup
argument-hint: "[source branch]"
---

# Guided merge

**1. Source.** Use `$ARGUMENTS` if given. Otherwise run `git branch --show-current` (the
target), `git branch -vv`, `git worktree list` and `git log --oneline -5` in parallel. If the
source is still ambiguous, ask with the real branches as options. A single `spec/*` branch
ahead of the target goes first, marked Recommended. Refuse a `proto/*` source:
`🚫 <source> is a prototype branch — it is never merged; its contract lands through a spec`,
with Next `/spec:plan design/prototypes/<stem>/contract.json`.

**2. Inspect (one approval).** In parallel: `git fetch --all --prune`, `git status`,
`git log --oneline <target>..<source>`, `git diff --stat <target>...<source>`,
`git merge-base <target> <source>`. Summarise as N commits, M files, and the touched paths.
If the tree is dirty, ask:

- commit them first with `/git:commit` (Recommended), then continue;
- stash them with `git stash push -u -m "merge: <source>"` and restore them after;
- abort. Nothing is merged. Report `🚫 working tree is dirty — cannot inspect or merge safely`.

**3. Strategy.** Use the config's `mergeStrategy` if it is set. Otherwise derive it: `ff-only`
when the target has not moved since the merge base, else `merge-commit`. Print
`📌 Auto-picked <strategy> — <reason> (veto anytime)` and go on. The user can veto by naming
`--no-ff`, `--ff-only`, `--squash`, or rebase then fast-forward.

**4. Merge.** If you are inside the source's worktree, call `ExitWorktree(action="keep")`
first. Then merge from the main checkout.

**5. Conflicts.** List them with `git diff --diff-filter=U`. Read both sides of each file and
resolve by intent. For a real disagreement (logic on both sides, deleted vs modified), ask
with ours / theirs / a described combination. `git add` each file, show a short summary of the
resolutions, then `git commit --no-edit` (or `-m` for a squash).

**6. Clean up.** Confirm with `git log --oneline -3` and `git status`. If the source had a
worktree, run `git worktree remove <path>` and `git branch -d <source>`. A path that is
already gone counts as cleaned.

End with one report: `✅ merged <source> into <target>`, with commit and file counts.

## Rules

- No `--no-verify`, no force-push, no push unless asked.
- Never `git merge --abort` or take one side of a conflict without asking.
