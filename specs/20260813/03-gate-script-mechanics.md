---
date: 2026-08-13
status: done
diff_base: 806bea67e5f7272b31260967b1100621496fb493
open_markers: 0
risk: T3
area: gate-scripts
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260813/02-durable-verification-qualifiers.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-03-1, AC-20260813-03-2, AC-20260813-03-3, AC-20260813-03-4, AC-20260813-03-5, AC-20260813-03-6, AC-20260813-03-7, AC-20260813-03-8, AC-20260813-03-9, AC-20260813-03-10]
---

# Gate Script Mechanics: claims-lint CWD, scope-reconcile globs, verdict GATE_RED seam

## Goal

Three deterministic gate scripts stop lying by mechanics: `claims-lint.js` resolves the
plugin's own shipped corpus from any CWD (doctor check 18 has never actually run in any host —
silently green since it landed); `scope-reconcile.js` expands File Plan glob rows so a planned
codegen output stops double-reporting as both out-of-plan and unrealized; and `verdict.js`
implements review.md's documented pre-panel GATE_RED invocation (no `--workflow`) instead of
exiting 2 on it, with doctor check 12 learning that a GATE_RED review row legitimately carries
no `runId`. Done = the six open pins on these scripts run green with every existing derivation
pin untouched.
