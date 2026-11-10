---
description: One-time upgrade of a repo set up by spec v7 to v8's files and config, and to the current queue version
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js`. It changes nothing and prints the plan.
Show the plan and ask the user once whether to apply it. On a yes, run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/migrate.js --apply`.

It also moves each machine's queue file (version 1 to 3) to version 4 (ADR-0050): every open row, and every tombstone of
unfinished work, becomes a tracked item `specs/queue/<id>.json` with a new id (`qN → 20261108-a3f9` is printed), in stored
order after the committed items, in the one migration commit; a row matching an open committed item is skipped, done
prompts are dropped, and the local file is left `{version: 4, items: [], holds: {}}` with a backup kept. Run it on each
machine, in the main checkout on trunk (it refuses in a linked worktree, off trunk, with a fan-out live or on a file that
is not valid JSON). Until it has run, the queue commands, `/spec:run` and `/spec:fanout` refuse with `queue file is
version <n> — run /spec:migrate`.

It also moves the `prototype` keys `bootCommand`, `url` and `publicUrl` into the `runtime` block (an
existing `runtime` key wins, and the plan says so; `runtime` keeps `readyCheck`, `envCommand`,
`readySeconds` and `stopCommand`); until it has run, every reader refuses with `still has prototype.<key> — run /spec:migrate`.

It also rewrites every v7 prototype record under `design/prototypes/<stem>/` (`status.json`,
`pins.json`, `contract.json`) to the sentence shape and trims the `prototype` config block
(`e2eRun` becomes `e2eCommand`; the browser hook, the test-listing command and the database hooks
are dropped); files it does not own in those folders are listed as "left alone". Until it has run, every
prototype command, `/spec:plan` on a `prototype:` spec and `/spec:run` refuse with
`is a v7 file — run /spec:migrate`. A mid-round v7 prototype with uncommitted files is committed
by the user first, so the migration commit holds only migration changes.

It keeps a v7 `gateCommand` as `testCommand` with its `{testDirs}`, `{scopeDirs}` and `{testFiles}`
removed (v8 does not scope), keeps v8's own keys (`gateConcurrency`, `doctorProbeMs`), drops a
`mergeStrategy` v8 cannot run (`derived`, `rebase-ff`), and writes v7's `capabilities.testCountPattern`
to `release.testCountPattern`. Lanes get the gitignored files `.worktreeinclude` names; it writes none.

`--apply` refuses (exit 2) on a dirty tree, naming the dirty files; clean it first. On success it
commits the migration as `chore(spec): migrate v7 → v8` and prints the sha. Agents and skills the
repo owns are listed as "left alone (user-owned)", and worktree entries outside the repo are only
warned about.
Rollback: `git revert <migrate commit>`, then copy the backup files back into the git dir.
