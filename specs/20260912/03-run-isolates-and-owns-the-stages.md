---
date: 2026-09-12
status: done
tier: critical
area: pipeline-entry
design: false
breaking: true
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-12
open_markers: 0
build_base: main
diff_base: 66141d41b1c25a2b1727792e88a2542d139e7ec7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260912-03-1, AC-20260912-03-2, AC-20260912-03-3, AC-20260912-03-4, AC-20260912-03-5, AC-20260912-03-6, AC-20260912-03-7, AC-20260912-03-8, AC-20260912-03-9, AC-20260912-03-10, AC-20260912-03-11, AC-20260912-03-12, AC-20260912-03-13, AC-20260912-03-14, AC-20260912-03-15, AC-20260912-03-16, AC-20260912-03-17, AC-20260912-03-18, AC-20260912-03-19, AC-20260912-03-20]
---

# `/spec:run` isolates by default, and it is the only stage command

## Goal

`/spec:run <spec>` opens the spec's own git worktree itself, before anything else runs, instead
of requiring `/git:enter-worktree <spec>` by hand first. `--in-place` is the opt-out; a worktree
that cannot be created stops the run rather than silently continuing on the current branch. In
the same pass the three stage commands `/spec:design`, `/spec:build` and `/spec:review` stop
being slash commands: their bodies move under `spec/doctrine/stages/` as the prose `/spec:run`
already delegates into, and every surface that names them is rewritten. Done means: a bare
`/spec:run` on a `hardened` spec lands the session in `.claude/worktrees/spec-<stem>` before the
design stage, `/spec:build` is not an invokable command anywhere, and the ledger still records
`via` so the fleet's escapes-per-CLEAN query keeps working.
