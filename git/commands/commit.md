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

## NON-NEGOTIABLE RULES

1. **`git add -A` is MANDATORY** — add ALL changes regardless of relevance to previous work
2. **Only 2 approval prompts** — parallel info-gathering, then commit
3. **Never selectively stage** unless user explicitly requests it
4. **No post-commit status check** — reduces unnecessary approval
5. **Warn about sensitive files** (.env, credentials) but still stage them
6. **Never touch worktrees** — do not unstage, reset, rm, or modify anything under `.claude/worktrees/`
