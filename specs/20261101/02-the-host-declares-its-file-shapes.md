---
date: 2026-11-01
status: done
build_base: main
tier: critical
area: host-grounding
breaking: false
depends_on: [specs/20261101/01-the-host-names-its-own-test-cases.md]
brief: n/a
open_markers: 0
diff_base: 24f608d88452e244277ab6c9ccfdba00bf3cb5ff
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-02-1, AC-20261101-02-2, AC-20261101-02-3, AC-20261101-02-4, AC-20261101-02-5, AC-20261101-02-6, AC-20261101-02-7, AC-20261101-02-8, AC-20261101-02-9, AC-20261101-02-10, AC-20261101-02-11, AC-20261101-02-12, AC-20261101-02-13, AC-20261101-02-14, AC-20261101-02-15, AC-20261101-02-16, AC-20261101-02-17, AC-20261101-02-18]
---

# The host declares its file shapes

## Goal

Seven scripts that run against a host repo each carry their own private table of what a test
file, a code file or a dependency manifest looks like — five copies of the test globs, two
extension lists, one manifest regex — and every table is shaped like this Node repository. On a
Ruby, Java, .NET, Go-in-subdirectory or monorepo host, test files are not classified as tests (so
the at-risk leg finds no candidates, `ac-drift` reports false `uncovered-ac` findings and
`expire-tests`' keep-clause cannot protect a non-JavaScript gate script), and a dependency change
to `pom.xml` or a `.csproj` skips the structural lint without saying so. The host declares its
shapes once: an optional config block `fileShapes` with stack-neutral, widened defaults, read
through one library by every consumer, written by `/spec:init` and checked by `/spec:doctor`.
Done means every classification in the plugin comes from that one place, a host that declares
nothing gets the same answer this repo gets today, and the six sample layouts the audit found
unclassified are classified.
