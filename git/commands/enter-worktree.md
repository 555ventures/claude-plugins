---
description: Enter (or re-enter) the isolated worktree for a spec — derived from the spec doc path, idempotent
argument-hint: <spec path>
---

# Enter Spec Worktree

Provision and enter the isolated worktree for a spec, or re-enter an existing one. This is the
**single owner** of the worktree's front half: it captures the originating branch, creates +
enters + verifies the worktree, runs host setup, and writes `build_base` to the spec
frontmatter. The spec stages own none of this — `/spec:build` just builds in whatever cwd it is
in, and `/spec:review` reads `build_base` to merge back. If you never run this command, the
pipeline runs **in place** on the current branch.

This command shells into the spec plugin's `merge-back.sh` and writes spec frontmatter, so the
spec plugin must be installed.

## Input

`$ARGUMENTS` — path to the spec doc.

## Steps

1. **Derive paths.** Run `spec-paths merge-back` and keep its output as `{mergeBack}` (the
   `merge-back.sh` path; its `create` subcommand builds the worktree). Derive:
   - `{source} = "$({mergeBack} branch-for $ARGUMENTS)"` — `branch-for` is the sole owner of
     the `spec/<stem>` branch rule (e.g. `specs/20260810/07-per-sha-ci-legs.md` →
     `spec/07-per-sha-ci-legs`); `/spec:build` disowns all worktree mechanics and has no branch
     rule of its own.
   - `{name} = {source}` with `/`→`-` (e.g. `spec/checkout` → `spec-checkout`) — the exact
     rule `{mergeBack} create` applies.
   - `{root} =` the last stdout line of `{mergeBack} root` (the project root / main worktree).
   - `{worktree} = {root}/.claude/worktrees/{name}`.

2. **Re-enter path (idempotent).** If `{worktree}` appears in `git worktree list --porcelain`,
   it is already provisioned:
   - `EnterWorktree {path: {worktree}}`.
   - VERIFY: `git rev-parse --show-toplevel` (Bash) equals `{worktree}`. If not, echo the
     `EnterWorktree` result and `git worktree list` so the cause is visible, then report as
     **entry verification failed** (see ## Report) and stop.
   - Do **not** run setup and do **not** touch `build_base` — both were done at create time.
     Report as **re-entered** (see ## Report).

3. **Create path.** Else you are still on the originating branch — provision it:
   - **Capture the origin first, before any entry:** `{origin} = git rev-parse --abbrev-ref HEAD`
     (Bash). Once a worktree is entered, `HEAD` is the build branch and the origin is no longer
     recoverable from the session.
   - **Create:** `{mergeBack} create --source {source}`. It branches from the current HEAD (=
     origin) and does the `git worktree add`. Capture its **last stdout line** as `{worktree}`
     (the absolute path). Non-zero exit (branch/path exists, unborn HEAD, run from a worktree,
     `.claude/worktrees/` not gitignored — see `merge-back.sh`) → show the user its stderr, then
     report as **create failed** (see ## Report) and stop. Do **not** fall back to in-place; the
     user asked for isolation.
   - **Enter:** `EnterWorktree {path: {worktree}}`.
   - **VERIFY entry — the hard gate:** `git rev-parse --show-toplevel` (Bash) equals
     `{worktree}` → entered. It does **not** → the session is still on the root branch: write
     nothing further, echo the `EnterWorktree` result verbatim plus `git worktree list` (entry
     into a registered `{path:}` is deterministic — a failure is structural, not transient;
     surface it, do not loop-retry), then report as **entry verification failed** (see
     ## Report) and stop.
   - **Setup:** run the host's `setupCommand` (from `.claude/spec.config.json`) once inside
     `{worktree}` — a fresh worktree has no installed deps.
   - **Write `build_base` — but never over a pin:** write `build_base: {origin}` into the spec
     frontmatter. This is the sole writer of that field; a fresh create is the only time it runs.
     **Skip the write entirely** when the spec already carries a `diff_base:` line, or when its
     `status:` is past `hardened` (`implementing` or `done`) — both mean a build has already
     pinned the true pre-image, and `{origin}` is a moving ref that will name the wrong tree the
     moment those commits land on it. Writing it anyway is what produced the 2026-09-01 empty-diff
     review on spec 20260901/01: the build pinned `diff_base` correctly, this step then layered
     `build_base: main` on top, and by review time `main` carried the build's own commits, so the
     judged range was empty and every diff-scoped leg reported zero and green. When skipped, say
     so in the report and name the pin that won. `spec-review-driver.js` prefers the pin and
     refuses an empty range regardless — that is the deterministic backstop; this is the ordering
     guard that keeps the two writers from racing in the first place.
   - Report as **created** (see ## Report).

## Report

report contract: spec shared.md § Console Output Style — rendered via `spec-paths report-render`

Assemble a slots object and run `node "$(spec-paths report-render)" --slots <file>` (write the
JSON to the scratch dir first), printing its output verbatim:

- **Re-entered**: `outcome: {anchor:'✅', text:'worktree re-entered at {worktree}'}`,
  `next: {kind:'none', reason:'already provisioned, continue whatever stage you were running'}`.
- **Created**: `outcome: {anchor:'✅', text:'worktree created at {worktree}'}`,
  `next: {kind:'none', reason:'ready, continue whatever stage you were running'}`.
- **Entry verification failed**: `outcome: {anchor:'🚫', text:'worktree entry did not take —
  still on the root branch'}`, `next: {kind:'command', text:'inspect the EnterWorktree result
  and git worktree list printed above, then retry this command'}`.
- **Create failed**: `outcome: {anchor:'🚫', text:'worktree creation failed'}`,
  `next: {kind:'command', text:'resolve the error printed above and retry this command'}`.

```report
✅ **worktree created at /Users/jj/project/.claude/worktrees/spec-checkout**
Next: nothing needs you — ready, continue whatever stage you were running
```

## Notes

- **Fresh process?** Re-run this command before resuming any stage in a new process — it is
  idempotent (re-enter path) and restores cwd to the worktree. `/clear` and `/compact` keep
  cwd, so the common case needs nothing.
- **Don't rename the spec file after entry** — the slug → worktree path mapping would change and
  re-entry would no longer find this worktree.
