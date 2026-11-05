---
description: Enter (or re-enter) the isolated worktree for a spec, derived from the spec path; idempotent
argument-hint: <spec path>
---

# Enter a spec's worktree

`/spec:run` opens its own worktree. Use this to repair one by hand or to re-enter one from a
fresh process. Running it twice is safe.

**Paths.** From the spec at `$ARGUMENTS` with basename `<stem>.md`: the branch is
`spec/<stem>`, the root is `git rev-parse --path-format=absolute --git-common-dir` without
its trailing `/.git`, and the worktree is `<root>/.claude/worktrees/spec-<stem>`.

**Already inside.** If `git rev-parse --show-toplevel` equals the worktree, report
`✅ worktree re-entered at <path>` and stop.

**Re-enter.** If `git worktree list --porcelain` lists the path and the directory exists,
call `EnterWorktree` with that path, then confirm that `git rev-parse --show-toplevel` equals
it. It was set up at creation, so don't run setup again or touch `build_base`. Report
re-entered.

**Create.**

1. Record the origin branch with `git rev-parse --abbrev-ref HEAD` before anything moves.
2. Refuse unless `git check-ignore -q .claude/worktrees/` succeeds.
3. If `refs/heads/spec/<stem>` exists, attach it with `git worktree add <path> spec/<stem>`.
   Otherwise run `git worktree add -b spec/<stem> <path> HEAD`.
4. Copy each path listed in `.worktreeinclude` into the worktree, then run the config's
   `setupCommand` there. If either step fails, show stderr and report
   `🚫 worktree creation failed`. Don't fall back to working in place.
5. Call `EnterWorktree` with the path and confirm the toplevel. If it doesn't match, echo the
   tool result and `git worktree list`, report
   `🚫 worktree entry did not take — still on the root branch`, and stop. Don't retry in a
   loop.
6. On a fresh create (not an attach), write `build_base: <origin>` into the spec frontmatter,
   unless its `status` is already `implementing` or `done`. In that case say which pin won.

End with one report: `✅ worktree created at <path>` (or `attached at` for an attach), with
Next `nothing needs you — ready, continue whatever stage you were running`.

Don't rename the spec after entering. The worktree path comes from its name.
