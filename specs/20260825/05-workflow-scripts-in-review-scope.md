---
date: 2026-08-25
status: done
diff_base: 8ac188c818e079a3ec82318e1e3d879409d5d225
tier: standard
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260825-05-1, AC-20260825-05-2, AC-20260825-05-3, AC-20260825-05-4]
---

# Workflow scripts return to review scope

## Goal

Remove `spec/workflows/wf-*.js` from this repo's `pipelineOwnedPaths` so the two frozen
workflow scripts (`wf-research.js`, `wf-enforce.js`) are ordinary review surface again: an
unplanned edit to one becomes a visible out-of-plan finding at review, and collision-closure's
literals leg can see inside them at plan lock. The entry was written for a code generator that
no longer exists; today it only hides. "Done" means the exclusion is gone, the four surfaces
that currently explain themselves by that exclusion say something true instead, and the repo's
own config is what the new tests exercise — not a synthetic stand-in.
