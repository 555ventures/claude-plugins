---
date: 2026-08-23
status: done
diff_base: 6cf9ce162902be2faffc0e3aa1f035e9cb3e2fc5
open_markers: 0
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260823-09-1, AC-20260823-09-2, AC-20260823-09-3, AC-20260823-09-4, AC-20260823-09-5, AC-20260823-09-6, AC-20260823-09-7, AC-20260823-09-8, AC-20260823-09-9, AC-20260823-09-10, AC-20260823-09-11]
---

# Replay Baseline Attribution — red legs the mutation didn't cause

## Goal

The mutation-replay harness treats any red review leg as evidence about the planted defect,
but ~1 in 4 selectable CLEAN reviews closes with a leg legitimately red for pre-existing,
sanctioned reasons (measured 2026-08-23: 17 of 63 CLEAN rows; reconcile 14, ac-matrix 4).
On those targets the harness burns a guaranteed-futile authoring retry, then forces the
session to falsify a record field either way — `leg-caught` censors the reviewer measurement
and falsely resets the 5-review due window; `--legs green` lies about the leg state (the
live 2026-08-23 incident, row `rp_1b176ebff5c7`). Done means: the harness attributes each
red leg to its cause using the baseline the original review already recorded, only
*newly*-red legs trigger the retry/leg-caught path, and the permanent record can state the
truth with a new honest `baseline-red` value.
