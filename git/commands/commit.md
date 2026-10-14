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

## Step 3: Escape or Fix Row (fix commits only, skippable)

Runs only when `.claude/spec-runs.jsonl` exists at repo root **and** the commit is plausibly
a defect fix — the user said so, the invoker is `/spec:fix`, or the subject's conventional
type is `fix`/`hotfix` — otherwise skip with zero output.

1. Run `node "$(spec-paths commit-coverage)" --root . --commit HEAD --json`. A non-zero
   exit prints one `⚠️` line naming the exit code and skips the check — never blocks.
2. `offer: false` (or, when the user called it a fix, `landed` empty) **and the invoker is not
   `/spec:fix`** → skip silently: no touched file was landed by a spec whose review closed
   before this commit, and nothing asked for a fix row.
3. Otherwise ask once via `AskUserQuestion` (skippable, never blocking the commit) which row
   this commit earns — recommended pick first, consequences per option, plain language:
   - **Escape of `<spec>`** (only when `landed` is non-empty; recommended whenever offered —
     the escape ledger is ground truth, core § Feedback Loop): the defect lived in lines that
     spec's review (`reviewRunId`) passed. Name
     `landed[0].specs[0].spec`, the count of landed files and of distinct landing specs (more
     than one → say `/spec:escape` will derive the spec and print it for veto).
   - **Fix row** (recommended when `landed` is empty and the invoker is `/spec:fix`): the defect
     was not that spec's, or no spec landed these files — record this commit as a Direct-lane
     repair instead of charging it to a spec that merely touched the files.
   - **Neither**.
4. Escape → run `/spec:escape <that spec path>` (it owns the row schema; tell it the invocation
   is commit-driven so the row carries `via:"commit"`). Fix row → append exactly ONE line to
   `.claude/spec-runs.jsonl` (`printf '%s\n' '<json>' >>`), paths/enums/booleans only — the
   root cause lives in the commit body the sha resolves to, never in the row:

   ```
   {"ts":"<ISO-8601>","stage":"fix","sha":"<HEAD 40-hex>","files":["<repo-relative path>",…],"reviewed":true|false,"via":"spec-fix"|"commit"}
   ```

   `files` is `git show --name-only --format= HEAD` minus the ledger itself; `via` is `spec-fix`
   when this session's `/spec:fix` invoked the commit, else `commit`; `reviewed` is true only when
   that invocation said its reviewer step completed — nothing said means `commit` and `false`.
   The line stays uncommitted until the next commit, like an escape row. Neither → proceed silently.

## Step 4: Report

report contract: spec core.md § Console Output Style — rendered via `spec-paths report-render`

Assemble slots and run `node "$(spec-paths report-render)" --slots <file>` (write the JSON to
the scratch dir first), printing its output verbatim:

- `outcome: {anchor:'✅', text:'committed — {subject} ({N} files)'}` — `{subject}` is the
  commit message's first line, `{N}` is the file count from Step 1's `git status`.
- `next`: if `git branch --show-current` (Step 1) matches the worktree convention
  `spec/<slug>` (set by `/git:enter-worktree`, whose branch-derivation rule is owned by
  `merge-back.sh branch-for` — this reverse parse can't call a forward-derivation subcommand,
  so it keeps its own inline match, but the rule's owner is that subcommand), find
  `specs/**/<slug>.md` and read its `build_base` frontmatter field as `{base}` — `next:
  {kind:'command', text:'/git:merge — land it on {base}'}`. Otherwise `next: {kind:'none',
  reason:'commit landed'}`.

```report
✅ **committed — fix(spec): tighten worktree entry gate (3 files)**
Next: nothing needs you — commit landed
```

```report
✅ **committed — fix(spec): tighten worktree entry gate (3 files)**
Next: /git:merge — land it on main
```

## NON-NEGOTIABLE RULES

1. **`git add -A` is MANDATORY** — add ALL changes regardless of relevance to previous work
2. **Only 2 approval prompts for the commit itself** — parallel info-gathering, then commit; Step 3's `AskUserQuestion` is additional, skippable, and only fires on fix-typed (or `/spec:fix`-invoked) commits
3. **Never selectively stage** unless user explicitly requests it
4. **No post-commit status check** — reduces unnecessary approval
5. **Warn about sensitive files** (.env, credentials) but still stage them
6. **Never touch worktrees** — do not unstage, reset, rm, or modify anything under `.claude/worktrees/`
7. **The escape/fix-row check never slows non-fix commits** — gated on a fix-typed subject (or the user calling it a fix, or a `/spec:fix` invoker) AND ledger presence; absent both, zero cost
