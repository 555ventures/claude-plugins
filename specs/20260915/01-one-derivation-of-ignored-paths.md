---
date: 2026-09-15
status: done
tier: critical
area: gate-scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-15
build_base: main
open_markers: 0
diff_base: da0ef15c0940fbe7c608cdb315568259f3f5c273
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260915-01-1, AC-20260915-01-2, AC-20260915-01-3, AC-20260915-01-4, AC-20260915-01-5, AC-20260915-01-6, AC-20260915-01-7, AC-20260915-01-8, AC-20260915-01-9]
---

# One derivation of git-ignored paths, shared by both repo walks

## Goal

`red-check.js` expands a wildcard File Plan tests row by walking the whole tree from `--root`,
and that walk descends into every git-ignored path — in this repo, four full checkouts under
`.claude/worktrees/`. A row starting with `**` therefore resolves test files that live inside a
copy of the repository, and red-check colour-classifies and executes them as if the File Plan
had named them. `scope-reconcile.js` already closed this class for its own walk
(specs/20260907/03-ignored-paths-and-unobserved-count.md D1/D2); this spec lifts that derivation
into a shared library and makes red-check its second consumer. Done means: a wildcard tests row
never reaches inside a git-ignored path on any host layout, an exact-path tests row is still
resolved and checked wherever it points, and a wildcard that resolves nothing says so instead of
passing in silence.
