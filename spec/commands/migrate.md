---
description: One-time upgrade of a repo set up by spec v7 to v8's files and config, and to the current queue version
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js`. It changes nothing and prints the plan.
Show the plan and ask the user once whether to apply it. On a yes, run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js --apply`.

It also converts the queue file to the current queue version (3); until it has run, the queue commands, `/spec:run` and `/spec:fanout` refuse with `queue file is version <n> — run /spec:migrate`.

`--apply` refuses (exit 2) on a dirty tree, naming the dirty files; clean it first. On success it
commits the migration as `chore(spec): migrate v7 → v8` and prints the sha. Agents and skills the
repo owns are listed as "left alone (user-owned)", and worktree entries outside the repo are only
warned about.
Rollback: `git revert <migrate commit>`, then copy the backup files back into the git dir.
