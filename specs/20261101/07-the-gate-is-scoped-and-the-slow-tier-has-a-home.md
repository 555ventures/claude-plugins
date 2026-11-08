---
date: 2026-11-01
status: done
build_base: main
tier: critical
area: grounding-contract
breaking: false
depends_on: [specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
open_markers: 0
diff_base: c709a684e888310e55e537e7847c4a9300f84db5
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-07-1, AC-20261101-07-2, AC-20261101-07-3, AC-20261101-07-4, AC-20261101-07-5, AC-20261101-07-6, AC-20261101-07-7, AC-20261101-07-8, AC-20261101-07-9, AC-20261101-07-10]
---

# The gate is scoped, and the slow tier has a home

## Goal

The pipeline's doctrine says the build gate is scoped and review runs the whole suite once; the
contract never asks a host to write `{testDirs}`, `/spec:init` never checks it, and `/spec:doctor`
never reports its absence — so two of the eight known hosts run every build iteration and every
review gate over their full suite without knowing it. The same hosts have nowhere to put a slow
test: every acceptance criterion owes an executed test, a skipped test is a hard finding, and the
only test command the contract knows is `testCommand`, so boot, build and integration tests
(15 to 240 seconds each) sit in the everyday gate and the suite leg beside millisecond unit tests.
Every mature test culture the prior-art search found (Bazel sizes, Go `-short`, pytest markers,
Vitest projects, Cucumber tags) splits by speed and runs the slow set once per change. Done means
the contract names one optional `slowTestCommand` the review stage runs once per legs iteration as
its own blocking leg, `/spec:init` writes a scoped gate when the runner takes paths and asks the
owner where the slow tier lives, `/spec:doctor` reports an unscoped gate, and a host that declares
nothing is byte-for-byte unchanged.
