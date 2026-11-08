---
date: 2026-08-10
status: done
diff_base: ec76afc8df45f7345120e940c376affde31d73ee
risk: T2                 # doctrine prose + pinned tests; no T3-trigger file touched (doctor/review/build/plan/release/init/genesis-design prose + spec template)
area: cross-cutting
design: false
breaking: false
depends_on: [20260810/07-per-sha-ci-legs]   # overlapping File Plan files: review.md, release.md, doctor.md
depended_on_by: [20260810/09-stale-reference-sweep]
brief: n/a               # audit-driven fix wave (command-surface audit 2026-08-10); no roadmap brief warranted
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-08-1, AC-20260810-08-2, AC-20260810-08-3, AC-20260810-08-4, AC-20260810-08-5, AC-20260810-08-6, AC-20260810-08-7, AC-20260810-08-8, AC-20260810-08-9, AC-20260810-08-10, AC-20260810-08-11]
---

# Command conflict fixes: where two doctrine surfaces send an orchestrator two ways

## Goal

The 2026-08-10 command-surface audit (four blind auditors over all spec/git commands) found
twelve places where two doctrine passages, or doctrine and a script, give an orchestrator
contradictory instructions — including three that JJ ruled on in the planning interview
(T2 pipeline entry, release invocation, in-place diff base). After this spec: each of the
twelve has exactly one authoritative behavior, stated where it is consumed, pinned by a test.
Done means an orchestrator following any one passage cold cannot diverge from an orchestrator
following its counterpart.
