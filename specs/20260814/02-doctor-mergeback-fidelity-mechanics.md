---
date: 2026-08-14
status: done
diff_base: 0d2eb6238aba909a9c360289c227a85aa1309b74
open_markers: 0
risk: T3
area: pipeline-mechanics
design: false
breaking: false
depends_on: ["specs/20260814/01-ac-matrix-script.md"]
depended_on_by: []
brief: 06
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260814-02-1, AC-20260814-02-2, AC-20260814-02-3, AC-20260814-02-4, AC-20260814-02-5, AC-20260814-02-6, AC-20260814-02-7, AC-20260814-02-8, AC-20260814-02-9, AC-20260814-02-10, AC-20260814-02-11]
---

# Mechanize doctor, merge-back, and fidelity prose algorithms

## Goal

Four small prose-executed algorithms become deterministic mechanics: doctor check 19's
gate↔CI substring parity becomes `spec/scripts/ci-gate-parity.js`; the `spec/<stem>` build-
branch derivation gets one owner (`merge-back.sh branch-for`) called by both prose copies
(enter-worktree step 1, doctor check 11); doctor's legacy-migration flags (checks 16/17) gate
on the config's `generatedBy` version and check 12's ~1000-char threshold demotes to a
secondary tripwire behind the schema/shape check; and `fidelity-check.js` detects the
regionRef over-claim class so design.md's `<surface>-screen` incident paragraph collapses to
one class-level sentence. Done = the two scripts' exec pins run green, both prose copies of
the branch rule are invocations, and the retagged doctrine pins run green.
