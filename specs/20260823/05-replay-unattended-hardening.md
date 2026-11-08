---
date: 2026-08-23
status: done
open_markers: 0
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-23
diff_base: 6ae2d45a4bc3e873d18bcdc95eaedf01597b4265
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-05-1, AC-20260823-05-2, AC-20260823-05-3, AC-20260823-05-4, AC-20260823-05-5, AC-20260823-05-6, AC-20260823-05-7, AC-20260823-05-8]
---

# Replay unattended hardening — writable scratch worktree + pinned diff base

## Goal

The scheduled mutation replay cannot run unattended, twice over. First, `replay.js --setup`
refuses any scratch worktree inside the repo root (exit 3), forcing it under `/private/tmp`,
where the permission classifier denies every agent Edit/Write — the mutation-authoring worker
blocked on manual approval on both live runs of 2026-08-23 (rv_387d84a3b424's replay; the
first worker returned `blocked` after even a no-op whitespace edit was denied). Second,
`--select` emits `diffBase` from spec frontmatter, where `build_base` is typically the moving
ref `main` — stale the moment the review's own merge lands, so the replay panel diffs against
the wrong base (observed: reconcile exit 3, two phantom out-of-plan files, two phantom
unrealized files, until hand-pinned to the true pre-image sha). Done = a due replay stands its
scratch worktree up inside the repo's gitignored `.claude/worktrees/` (where agent writes are
auto-approved, as build worktrees already prove daily) with the main tree's `git status` still
empty, and `--select` emits a pinned, ancestry-validated sha — or refuses loudly — never a
moving ref.
