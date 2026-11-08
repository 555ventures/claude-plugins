---
date: 2026-09-09
status: done
tier: critical           # verdict.js is a named critical trigger (.claude/rules/spec-pipeline.md § Risk Tiers): this spec changes the CLEAN derivation
area: review
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260909/05-fix-delta-reviewer-pass.md]
brief: n/a
build_base: main
spiked: 2026-09-09
open_markers: 0
diff_base: daf4177e91f6442677b7e3ccba127005f661f9a4
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-04-1, AC-20260909-04-2, AC-20260909-04-3, AC-20260909-04-4, AC-20260909-04-5, AC-20260909-04-6, AC-20260909-04-7, AC-20260909-04-8, AC-20260909-04-9, AC-20260909-04-10, AC-20260909-04-11, AC-20260909-04-12, AC-20260909-04-13]
---

# Review convergence floor — soft findings are advisory, never a fix cycle

## Goal

A review pass whose only survivors are `soft` findings derives `CLEAN` today's way for hard
findings: verdict.js's disposition pool holds hard survivors and leg findings only, softs are
recorded in the ledger row (`findings.soft`) and in the retained artifact but never routed to
the disposer, never fix-dispatched, never waived. The driver skips the DISPOSITIONS step when
the hard pool is empty and derives the waived/rejected/fix counts from the disposer's return
file when it is not, so the session never hand-types a count. Done means: a soft-only reviewer
return reaches CLOSE with zero extra marks, a hard survivor still cannot reach CLEAN
undispositioned, and the two-iteration fix cap is untouched.
