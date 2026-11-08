---
date: 2026-09-08
status: superseded
superseded_by: direct fix on 2026-09-08 — scope was four host files, below the pipeline-entry bar (core § Pipeline Entry); kept as the design record for scripts/plugin-bump.js
tier: standard
area: plugin-versioning
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-01-1, AC-20260908-01-2, AC-20260908-01-3, AC-20260908-01-4, AC-20260908-01-5, AC-20260908-01-6, AC-20260908-01-7, AC-20260908-01-8]
---

# Plugin bump script and merge-base version pin

## Goal

Specs in this repo stop naming a plugin version number. Today every spec that changes the
`spec` plugin carries a Decision row with a literal target ("bump to 7.98.0") plus a prose
ledger of which sibling spec claims which number; the ledger is stale the moment any sibling
merges, and the only check that a bump happened at all is a reviewer reading prose. After this
lands, a host script derives the next minor and rotates the changelog, and a gate test proves
against the merge base that a change under a plugin directory came with a higher version.
Done means: `node scripts/plugin-bump.js --check` is green in the gate, a spec branch that
edits `spec/**` without a bump goes red with a remedy line, and the pipeline rules tell
planners to cite the script instead of a number.
