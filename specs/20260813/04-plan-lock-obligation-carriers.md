---
date: 2026-08-13
status: done
diff_base: c20e2ba93647fbc8d8f7435687bb4ee05ffa2e57
open_markers: 0
risk: T2
area: doctrine-plan
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-04-1, AC-20260813-04-2, AC-20260813-04-3, AC-20260813-04-4, AC-20260813-04-5, AC-20260813-04-6, AC-20260813-04-7, AC-20260813-04-8]
---

# Plan-Lock Obligation Carriers

## Goal

Plan lock stops passing specs whose Decisions state obligations nothing carries: one lock-time
obligation→carrier sweep in plan.md covers the four cross-host shapes (a Decision-named file
with no File Plan row; a persisted artifact with no Contracts/schema row; CREATE-d modules whose
factory signatures tests must invent; helper-computed AC expectations with no ground-truth
carrier), the File Plan row grammar forbids bundled second-file edits, the AC guidance splits
library-default requirements into mechanism pin + shipped-config echo, and init.md gains the
authoring rule that generated prose names the derivation of a volatile enumerable fact instead
of inlining the enumeration. Done = the seven open doctrine pins on plan.md/init.md run green
with the existing lock checks intact.
