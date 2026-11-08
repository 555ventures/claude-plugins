---
date: 2026-11-01
status: done
tier: standard
area: build-integrity
breaking: false
build_base: main
depends_on: []
brief: n/a
open_markers: 0
diff_base: 3a84b6609b091ae178b0e3d4c505351d0d762a3b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-03-1, AC-20261101-03-2, AC-20261101-03-3, AC-20261101-03-4, AC-20261101-03-5, AC-20261101-03-6, AC-20261101-03-7, AC-20261101-03-8]
---

# Legs read evidence, not exit codes alone

## Goal

Two legs contradict core § Runtime Verification and § Feedback Loop on any host that is not this
one. `red-check.js` reads a test runner's exit code only: a runner that exits 0 over zero matched
tests (cargo treats a file path as a name filter; any wrapper can) reports a sanctioned-green pin
as green having run nothing, although `review-legs.js` already refuses the same vacuous green
through `capabilities.testCountPattern`. `memory-sweep.js` decides a note "diff-hit" only when the
note names a `.js/.mjs/.cjs/.sh/.md/.json` path, so on a Python or Go host agent memory is never
surfaced for disposal and becomes the carrier core forbids; an uncommitted note never reaches
`ttl-expired` either. Done means red-check applies the host's declared count pattern the way
review-legs does, memory-sweep matches changed paths without an extension list, and an
uncommitted note ages from its file time.
