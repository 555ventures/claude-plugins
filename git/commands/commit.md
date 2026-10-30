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
- `node "$(spec-paths secrets-scan)" --root . --worktree --json` — the secrets scan (reads the working tree, so its order beside `git add -A` is irrelevant)

**Show user**: Only the `git status` output (file summary).

## Step 1b: Secrets Question (scan hits only)

Fires only on the scan's exit 1; exit 0 prints nothing new.

- Exit 1 → ONE `AskUserQuestion` naming every hit path as context: "These staged files look like
  secrets. Keep them out of this commit?"
  1. **Exclude them (Recommended)** — They stay on disk but out of history, which is the only place a leaked secret cannot be removed from later
  2. **Stage them anyway** — They go into the commit and into history, where a later commit cannot unpublish them

  Exclude → run `git reset -q -- <hit paths>` and list them in Step 4's `warns` slot as `kept out
  of this commit: <paths>`. Stage anyway → the commit proceeds and `warns` lists them as `staged
  on your say-so: <paths>`.
- Exit 2 (usage, not a git repo) → print `⚠️ secrets scan skipped — <stderr line>` and proceed.
- `spec-paths` absent on PATH (git plugin installed alone) → print `⚠️ secrets scan skipped —
  the spec plugin is not installed` and proceed.

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

## Step 3: Escape or Fix Row (fix commits only)

Runs only when `.claude/spec-runs.jsonl` exists at repo root **and** the commit is plausibly
a defect fix — the user said so, the invoker is `/spec:fix`, or the subject's conventional
type is `fix`/`hotfix` — otherwise skip with zero output. Never blocks the commit, never offers.

1. Run `node "$(spec-paths commit-coverage)" --root . --commit HEAD --json`. A non-zero
   exit prints one `⚠️` line naming the exit code and skips the check.
2. `landed` empty → invoker `/spec:fix`: append the `stage:"fix"` row (shape below); any other
   invoker: skip silently. A commit never earns both rows.
3. `landed` non-empty → write one escape row, no offer, with these fields:
   - `spec` and `reviewRunId` come from the `landed` entry whose `specs[0].reviewTs` is the
     latest (tie: the lexically smaller spec path).
   - `files` is every `landed[*].file`; `sha` is `HEAD` (40-hex); `via` is `spec-fix` when this
     session's `/spec:fix` invoked the commit, else `commit`.
   - `class` is the one question. With a root cause in session (a `/spec:fix` invoker, or the
     commit body) derive it from `fleet-reader --json`'s `.escapes.registry` and print
     `📌 Auto-picked class=<id> — <reason> (veto anytime)`; otherwise ask once via a skippable
     `AskUserQuestion` for the defect class — the registry's top entries, "a new word", "no
     class". Dismissed or "no class" → `class: null`; the row is still written.

   ```
   {"ts":"<ISO-8601>","stage":"escape","spec":"<spec path>","files":["<repo-relative path>",…],"reviewRunId":"rv_…"|null,"class":"<kebab-case id>"|null,"sha":"<HEAD 40-hex>"|null,"via":"commit"|"spec-fix"}
   ```

   Append it with `node "$(spec-paths escape-row)" --append --root . --row '<json>'`. Exit 3
   (a row for that spec already shares a file) → print the stderr line, append nothing, and
   continue the commit.
4. The `stage:"fix"` row is exactly ONE line appended to `.claude/spec-runs.jsonl`
   (`printf '%s\n' '<json>' >>`), paths/enums/booleans only — the root cause lives in the commit
   body the sha resolves to, never in the row:

   ```
   {"ts":"<ISO-8601>","stage":"fix","sha":"<HEAD 40-hex>","files":["<repo-relative path>",…],"reviewed":true|false,"via":"spec-fix"|"commit"}
   ```

   `files` is `git show --name-only --format= HEAD` minus the ledger itself; `via` is `spec-fix`
   when this session's `/spec:fix` invoked the commit, else `commit`; `reviewed` is true only when
   that invocation said its reviewer step completed — nothing said means `commit` and `false`.

Either line stays uncommitted until the next commit.

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
2. **Only 2 approval prompts for the commit itself** — parallel info-gathering, then commit; Step 1b's secrets question (scan hits only) and Step 3's one `AskUserQuestion` (the defect class) are additional, skippable, and only fires on fix-typed (or `/spec:fix`-invoked) commits that touch spec-landed lines
3. **Never selectively stage** unless user explicitly requests it
4. **No post-commit status check** — reduces unnecessary approval
5. **Secrets never stage silently** — a scan hit is a question; staging anyway is the user's explicit answer, never a default
6. **Never touch worktrees** — do not unstage, reset, rm, or modify anything under `.claude/worktrees/`
7. **The escape/fix-row check never slows non-fix commits** — gated on a fix-typed subject (or the user calling it a fix, or a `/spec:fix` invoker) AND ledger presence; absent both, zero cost
