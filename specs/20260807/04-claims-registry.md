---
date: 2026-08-07
status: done
open_markers: 0
risk: T3
area: doctrine-governance
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260807-04-1, AC-20260807-04-2, AC-20260807-04-3, AC-20260807-04-4, AC-20260807-04-5, AC-20260807-04-6, AC-20260807-04-7, AC-20260807-04-8, AC-20260807-04-9]
---

# Claims registry: every blocking claim names its enforcement carrier

## Goal

End the prose-patch-before-mechanism pattern (measured: 5 patches/3 days on the dashboard
seam) by making the doctrine corpus's highest-stakes claims machine-auditable: every
blocking-consequence claim in `spec/commands/*.md` + `spec/doctrine/*.md` carries an inline
`enforcedBy:` pointer to a real carrier or an explicit `unenforced:` sanction, a deterministic
lint (`claims-lint.js`) gates version bumps on orphan claims and on the corpus line-count
ratchet, and `/spec:doctor` check 18 derives the full inventory on demand. Done = the lint is
green on a baseline it wrote, `review.md` is converted as the seed exemplar, the corpus is
strictly smaller than the 5,186 lines it started at, and a new orphan claim or unbudgeted
doctrine growth cannot ship without a visible, diffable baseline edit.
