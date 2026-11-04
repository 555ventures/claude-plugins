---
description: Add all changes and commit in two approvals, gathering info in parallel and then writing a descriptive commit
---

# Add all and commit

## Step 1: Gather (one approval)

Run these in parallel in one message:

`git add -A`, `git status`, `git diff --staged` (for the message; don't display it),
`git log -5 --oneline` (for the house style), and `git branch --show-current`.

Show the user only the `git status` file summary.

If any staged path looks like a secret (`.env*`, private keys, credential or token files),
ask once, naming the paths: "These staged files look like secrets. Keep them out of this
commit?"

1. **Exclude them (Recommended).** They stay on disk but out of history, the one place a
   leaked secret can't be removed from later. Run `git reset -q -- <paths>`.
2. **Stage them anyway.** They go into history.

## Step 2: Commit (one approval)

Write a descriptive message from the diff in the log's style, and commit:

```bash
git commit -m "$(cat <<'EOF'
<message>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Step 3: Report

End with one report: `✅ committed — <subject> (<N> files)`, with any secrets kept out or
staged on the user's say-so listed as a warning. On a `spec/<stem>` branch, the Next line is
`/git:merge — land it on <base>`. `<base>` is the spec's `build_base` frontmatter, or else
the config's `trunk`, or else `main`. Otherwise Next is `nothing needs you — commit landed`.

## Rules

- Stage everything with `git add -A`. Stage selectively only when the user asks.
- Two approvals for the commit itself. Skip the post-commit status check.
- Leave `.claude/worktrees/` alone: no unstaging, resetting or removing anything under it.
