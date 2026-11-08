---
date: 2026-10-26
status: done
build_base: main
tier: critical
area: cross-cutting
breaking: false
depends_on: [specs/20261026/01-one-runner-for-host-commands.md]
brief: n/a
open_markers: 0
diff_base: 90473c82def1aa54781a77214a445205364e1208
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261026-02-1, AC-20261026-02-2, AC-20261026-02-3, AC-20261026-02-4, AC-20261026-02-5, AC-20261026-02-6, AC-20261026-02-7]
---

# One tests-row check and host-shape hints

## Goal

Six scripts decide "is this File Plan row a tests row" with two different predicates: the build
driver, scope-reconcile and gate-resolve accept `test`, `Test`, `tests` (`/^tests?$/i`), while
red-check, ac-matrix and collision-closure accept only `tests`. A row spelled `Test` is
therefore dispatched as a test by build and silently skipped by red-check — the red-first check
passes on zero files. This spec moves the predicate into `lib/file-plan.js` as `isTestsRow` and
bans the inline copies. It also gives `/spec:doctor` two advisory hints the 2026-10-26 audit
found missing: a compound `runtime.bootCommand` (suggest a host script) and a host with no
`capabilities.testCountPattern` (ask the host to add one; zero tests stays sanctioned). Done means
red-check reports a `Test`-layer row's green pre-image, and port-check prints both new hint
classes for a host that has those shapes.
