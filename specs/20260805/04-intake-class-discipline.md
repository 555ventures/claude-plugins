---
date: 2026-08-05
status: done
open_markers: 0
risk: T2
area: intake
design: false
breaking: false
depends_on: [03-done-unobserved-observation.md]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260805-04-1, AC-20260805-04-2, AC-20260805-04-3, AC-20260805-04-4, AC-20260805-04-6, AC-20260805-04-5]
---

# Intake class discipline — second occurrence of a class requires a mechanism

## Goal

Recurring incident classes have been getting prose patches before mechanisms (measured: 5
patches in 3 days on the dashboard seam; 3 versions in 3 days on deltas/fidelity-check) —
the inverted sequencing behind the recent report volume. This spec makes the discipline
mechanical: every closed intake row must declare HOW it was fixed (`mechanism` or `prose`),
and a row whose Category already appeared before may only close as `prose` with a stated
impossibility reason. The carrier is the intake table itself plus a repo test that gates
every version bump — no new command, no judgment pass. Done means: closing a repeat-class
finding with undeclared or unjustified prose makes `npm test` red.
