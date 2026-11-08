---
date: 2026-08-31
status: done
open_markers: 0
diff_base: 86390013d547a3f932c8e75668265e7fd4b3bc0b
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-31
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260831-01-1, AC-20260831-01-2, AC-20260831-01-3, AC-20260831-01-4, AC-20260831-01-5, AC-20260831-01-6, AC-20260831-01-7]
---

# Replay Range Materialization — the baseline worktree honors the judged range's true upper bound

## Goal

Replay's baseline worktree stands at the close commit's parent (F3), but the range-identity
spec (20260824/06 D3/D7) defines a `diff.dirty:true` review row's judged range as *completed
by the close commit that follows it* — fix-worker edits uncommitted at pass time ride that
commit. For those rows (12 of 17 recent flagged CLEAN rows here, 5 of 6 in upwell) the
baseline tree is below the judged range: legs green over the close-commit tree go red at the
parent, and replay.md step 7 rung 3 (newly-red → retry once → still red) records a **false
`leg-caught`**, polluting the catch-rate — one of the pipeline's two ground-truth signals
(the live upwell incident, rv_128f1a459e42 / rp_d4b6fcf66c93). Done means: `--setup`
materializes the close commit's tree in the worktree with review-outcome surfaces surgically
held at the parent (blindness preserved), step 7 verifies a still-red leg against the
pristine baseline before ever recording `leg-caught`, and dirty closes stay first-class
replay targets — neither refused at close (that would reverse 20260824/06 D3, pinned by
AC-20260824-06-6) nor made select-ineligible (that would starve ~70% of the candidate pool).
