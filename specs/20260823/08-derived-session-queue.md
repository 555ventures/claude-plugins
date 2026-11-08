---
date: 2026-08-23
status: done
diff_base: 89978d3a85682e2169c33069948d0a981557c38e
tier: critical           # edits spec-status.js (frozen --next surface) and adds a hook surface (process boundary) — both named critical triggers in .claude/rules/spec-pipeline.md § Risk Tiers
area: session-queue
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 15
spiked: 2026-08-23
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-08-1, AC-20260823-08-2, AC-20260823-08-3, AC-20260823-08-4, AC-20260823-08-5, AC-20260823-08-6, AC-20260823-08-7, AC-20260823-08-8, AC-20260823-08-9, AC-20260823-08-10, AC-20260823-08-11, AC-20260823-08-12, AC-20260823-08-13, AC-20260823-08-14, AC-20260823-08-15]
---

# Derived Session Queue — durable sequencing behind the --next pointer

## Goal

Store the one thing the pipeline cannot derive — JJ's intended work order across briefs,
plus free-text work items and their done-when predicates — in a single per-repository file
inside the git common directory, and make `spec-status.js --next` consult it as an input
overlay so every existing consumer (status dashboard, review close-out, plan report) sees
queue-aware ordering with zero call-site changes. A SessionStart hook surfaces the top
item (ready to paste) plus any auto-placement veto notices when a session opens in the
main checkout, and a finish-current-spec line inside linked worktrees. Done means: the
2026-08-18-style "reconstruct the ordering by hand" session never recurs — the queue file
plus derivation answers it.
