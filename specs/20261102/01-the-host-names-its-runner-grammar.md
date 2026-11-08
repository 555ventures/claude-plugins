---
date: 2026-11-02
status: done
tier: critical
area: host-grounding
breaking: true
depends_on: []
brief: 31
spiked: 2026-11-02
build_base: main
open_markers: 0
diff_base: 60dff05d657080ce33f1348b31e322873e8272f8
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261102-01-1, AC-20261102-01-2, AC-20261102-01-3, AC-20261102-01-4, AC-20261102-01-5, AC-20261102-01-6, AC-20261102-01-7, AC-20261102-01-8, AC-20261102-01-9, AC-20261102-01-10, AC-20261102-01-19, AC-20261102-01-11, AC-20261102-01-12, AC-20261102-01-13, AC-20261102-01-14, AC-20261102-01-15, AC-20261102-01-16, AC-20261102-01-17, AC-20261102-01-18]
---

# The host names its runner's grammar

## Goal

Four places assume how a host's test runner, CI forge and git trunk behave, and each yields a
wrong verdict on a non-Node or non-GitHub host without an error: the test file is always
appended to `testCommand`, the gate log's failure count is read from two built-in shapes, the
review diffs against `main`-then-`master`, and a `gh` failure on a non-GitHub remote reads as
retryable so the CI leg passes with no evidence. The host declares, once, how its own tools
speak — a `{file}` placeholder, `capabilities.failCountPattern`, `trunk`, and a fail-closed
`capabilities.forge` — and every leg that runs them reads the declaration; `/spec:init` detects
and writes the four, `/spec:doctor` re-checks them with one deterministic line. Done means a host
that declares nothing gets byte-for-byte today's commands, counts and base, except that CI
evidence is now reported absent rather than assumed, and `cargo test`, `go test ./pkg/...`,
`dotnet test --filter` and `mvn -Dtest=` are all expressible.
