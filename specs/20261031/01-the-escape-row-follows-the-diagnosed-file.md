---
date: 2026-10-31
status: done
build_base: main
tier: standard
area: commit-escape
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: f1b23c69c2715222d1a16424ed27251b58594bb1
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261031-01-1, AC-20261031-01-2, AC-20261031-01-3, AC-20261031-01-4, AC-20261031-01-5, AC-20261031-01-6, AC-20261031-01-7, AC-20261031-01-8]
---

# The escape row follows the diagnosed file

## Goal

A fix commit's escape row names the spec that landed the file the diagnosis blames, not the
spec that most recently bumped a file every spec bumps. Today `/git:commit` step 3 picks the
landed entry with the latest `reviewTs`; `spec/.claude-plugin/plugin.json` is landed by 236
specs, so every version-bumping fix selects the newest spec, `escape-row.js` exits 3 on the
duplicate, and the commit records nothing (observed on `32b5af64`). Done means: the pick is
derived by `commit-coverage.js` from the file the session names (falling back to a rule that
ignores files every spec lands), step 3 reads that pick, a refused escape row yields the
`stage:"fix"` row instead of silence, and the missed row for `32b5af64` is in the ledger.
