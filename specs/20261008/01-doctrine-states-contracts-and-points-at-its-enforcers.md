---
date: 2026-10-08
status: done
build_base: main
open_markers: 0
tier: standard
area: doctrine
breaking: false
depends_on: []
brief: n/a
diff_base: c467f7b1c20d4ba2e0681569a6f7fc73982a8012
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261008-01-1, AC-20261008-01-2, AC-20261008-01-3, AC-20261008-01-4, AC-20261008-01-5, AC-20261008-01-6]
---

# Doctrine states contracts and points at its enforcers

## Goal

The six doctrine files under `spec/doctrine/` (core, genesis, mocks, design, and the two stage
files) shrink to the contracts a session cannot derive from a script, and every rule a script,
hook or driver already enforces becomes a one-line pointer at that enforcer. Nothing is
rewritten: lines are deleted or replaced by a pointer, every `## ` heading survives byte for
byte (drivers, `shared-for` and `--section` slice by heading), and `/spec:connect` stops
loading the whole doctrine. Done means: each file at or under its ceiling, every heading in
place, the citation sweep at zero misses, every command's read-load pinned at its new measured
value, and the test suite green with every retired phrase pin gone rather than weakened.
