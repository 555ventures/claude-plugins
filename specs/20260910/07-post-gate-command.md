---
date: 2026-09-10
status: done
build_base: main
tier: critical
area: build-driver
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-10
open_markers: 0
diff_base: 246d1aaf895055fa8890594aebefb0f952ce143d
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260910-07-1, AC-20260910-07-2, AC-20260910-07-3, AC-20260910-07-4, AC-20260910-07-5, AC-20260910-07-6, AC-20260910-07-7, AC-20260910-07-8, AC-20260910-07-9, AC-20260910-07-10]
---

# Build runs a host-declared post-gate command once the scoped gate is green

## Goal

A host may declare one more command in its config, `postGateCommand`, that the build driver runs
right after the scoped gate passes, at integration and on every repair round. A red post-gate
enters the existing three-round repair loop exactly as a red gate does, so a build that passes its
own test directories but breaks a repo-wide pin (a version bump, a size ratchet, a read-load
budget, a byte-for-byte config pin) is repaired by the build's workers instead of bouncing at
review. The scoped `gateCommand` and review's `suite` leg are untouched. Done means: this repo
declares `{testCommand}` as its post-gate, a fixture host with a red post-gate lands `REPAIR`, a
host with no such key runs byte-for-byte what it runs today, and the build ledger row records
whether a post-gate was declared.
