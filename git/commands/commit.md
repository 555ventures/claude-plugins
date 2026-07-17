---
description: Add all changes and commit in two approvals — parallel info-gathering, then a descriptive commit
---

# Git Add All and Commit

When the user invokes this command:

## Step 1: Info Gathering (ONE APPROVAL)

Run ALL of these commands **in parallel in a single message**:

- `git add -A` — ADD ALL changes, no exceptions
- `git status` — show staged files
- `git diff --staged` — for commit message context (don't display full output)
- `git log -5 --oneline` — for commit style reference

**Show user**: Only the `git status` output (file summary).

## Step 2: Commit (ONE APPROVAL)

Generate a descriptive commit message based on the changes and commit immediately:

```bash
git commit -m "$(cat <<'EOF'
<commit message here>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Step 3: Escape Check (fix commits only, skippable)

Runs only when the commit is plausibly a defect fix (user said so, or the drafted
message is fix-shaped: `fix`/`bug`/`regression`/`hotfix`) **and**
`.claude/spec-runs.jsonl` exists at repo root — otherwise skip with zero output.

1. `git blame -L` the fixed lines (or `git log --oneline -3 -- <touched files>`) — did a
   spec merge/close commit referencing a `specs/...` path land them? No → skip silently.
2. Yes → `jq` the ledger for a matching `stage:"review"` row on that spec path. No match
   → skip silently.
3. Match → offer once, via `AskUserQuestion` (skippable, never blocking the commit):
   record a `/spec:escape` row correlating this defect to that review's `runId`?
   Question style: plain language, self-contained, consequences per option, recommended
   pick first.
4. Yes → run `/spec:escape <spec path>` (it owns the row schema; tell it the invocation is
   commit-driven so the row carries `via:"commit"`). No → proceed silently.

## NON-NEGOTIABLE RULES

1. **`git add -A` is MANDATORY** — add ALL changes regardless of relevance to previous work
2. **Only 2 approval prompts for the commit itself** — parallel info-gathering, then commit; Step 3's `AskUserQuestion` is additional, skippable, and only fires on fix-shaped commits
3. **Never selectively stage** unless user explicitly requests it
4. **No post-commit status check** — reduces unnecessary approval
5. **Warn about sensitive files** (.env, credentials) but still stage them
6. **Never touch worktrees** — do not unstage, reset, rm, or modify anything under `.claude/worktrees/`
7. **Escape check never slows non-fix commits** — gated on fix-shaped message AND ledger presence; both absent means zero cost
