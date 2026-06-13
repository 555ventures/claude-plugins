---
description: Guided branch merge — pre-merge inspection, strategy choice, conflict repair, and worktree cleanup
argument-hint: [source branch]
---

# Git Merge with Conflict Repair

## Step 1: Identify Source Branch (ASK IF AMBIGUOUS)

If the user provided a branch name as an argument, use it. Otherwise, run **in parallel**:

- `git branch --show-current` — current branch (the merge target)
- `git branch -vv` — list branches with tracking info
- `git worktree list` — show worktrees (we may be inside one)
- `git log --oneline -5` — recent context on current branch

If the source branch is still ambiguous, use `AskUserQuestion` with concrete branch options pulled from `git branch -vv`. Do NOT guess.

## Step 2: Pre-Merge Inspection (ONE APPROVAL)

Run **in parallel in a single message**:

- `git fetch --all --prune` — sync remotes
- `git status` — verify working tree is clean
- `git log --oneline <target>..<source>` — commits being merged in
- `git diff --stat <target>...<source>` — file-level summary of incoming changes
- `git merge-base <target> <source>` — common ancestor (for sanity)

**If working tree is dirty**: STOP. Report to user, do not proceed.

**Show user**: short summary — N commits, M files, list of touched paths. Do not dump full diffs.

## Step 3: Choose Merge Strategy (ASK)

Use `AskUserQuestion` with these options (always ask — strategy is a real fork):

- **Merge commit** (`git merge --no-ff`) — preserves branch history, creates merge commit
- **Fast-forward only** (`git merge --ff-only`) — fails if not FF; cleanest history when possible
- **Squash** (`git merge --squash`) — collapse source branch into a single commit on target
- **Rebase then FF** (`git rebase` on source, then FF merge) — linear history, rewrites source

Include the recommended default based on commit count:
- 1 commit → fast-forward
- 2-5 commits, feature work → merge commit
- Many small WIP commits → squash

## Step 4: Execute Merge

Run the chosen merge command. If it succeeds cleanly, jump to Step 6.

## Step 5: Conflict Repair (IF CONFLICTS)

If `git merge` reports conflicts:

1. Run `git status` and `git diff --diff-filter=U` to enumerate conflicted files
2. **For each conflicted file**: read the file, understand BOTH sides of the conflict markers, and resolve based on intent — do not blindly pick one side
3. For non-trivial conflicts (logic changes on both sides, structural disagreement, deleted-vs-modified), use `AskUserQuestion` with concrete options:
   - "Keep target version (ours)"
   - "Keep source version (theirs)"
   - "Manual merge — combine both" (and describe the proposed combination)
4. After resolving, run `git add <file>` for each repaired file
5. Run `git diff --cached` and show the user a concise summary of resolutions before committing
6. Complete with `git commit --no-edit` (uses the prepared merge message) OR `git commit -m "..."` if squash

**NEVER** use `git checkout --ours/--theirs` blindly. **NEVER** use `git merge --abort` without asking.

## Step 6: Verify Merge

Run **in parallel**:

- `git log --oneline -3` — confirm merge commit landed
- `git status` — confirm clean tree

## Step 7: Worktree Cleanup

If we are inside a worktree (detected in Step 1) OR the source branch had a dedicated worktree:

**Correct sequence (avoids CWD warning):**

`ExitWorktree(action="remove")` cannot be called after merging — the worktree branch still appears unmerged from the harness's perspective at that point. And merging requires switching to the target branch, which is impossible from inside the worktree (it's already checked out in the main repo). The clean path is:

1. **`ExitWorktree(action="keep")`** — restores the session CWD to the main repo root; leaves the worktree directory and branch intact. No unmerged-commit check on `keep`.
2. **Do the merge** from the main repo root (Steps 3–5 execute here — target branch is already checked out).
3. **Remove the worktree** from the main repo root — no CWD warning:
   ```
   git worktree remove <worktree-path>
   git branch -d <source-branch>
   ```

If the worktree path no longer exists (e.g. already removed), treat cleanup as done — verify with `git worktree list` if unsure.

If the session was NOT entered via `EnterWorktree` (ExitWorktree is a no-op), skip step 1 and do steps 2–3 directly via `git -C <main-repo-path>`. A CWD warning may appear — this is unavoidable in that case.

## NON-NEGOTIABLE RULES

1. **Never `--no-verify`** — pre-merge hooks run unmodified
2. **Never force-push, never `merge --abort` silently** — both require explicit user approval
3. **Never resolve conflicts by picking a side without reading the file** — conflicts are logic decisions
4. **Worktree cleanup**: Call `ExitWorktree(action="keep")` first — restores session CWD to the main repo root without checking for unmerged commits. Then merge normally. Then `git worktree remove <path> && git branch -d <branch>` from the main repo root. Never call `ExitWorktree(action="remove")` after merging — the harness still sees the branch as unmerged at that point. If ExitWorktree is a no-op (session not entered via `EnterWorktree`), skip it and run git commands directly; a CWD warning is unavoidable in that case.
5. **Always use `AskUserQuestion`** for strategy choice and non-trivial conflict resolution
6. **Never push after merge** unless user explicitly asks
