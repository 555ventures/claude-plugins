---
date: 2026-11-01
status: done
build_base: main
tier: critical
area: test-scanning
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: c6f833a7d10f4f87266ecbcf7638dee84685c368
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261101-01-1, AC-20261101-01-2, AC-20261101-01-3, AC-20261101-01-4, AC-20261101-01-5, AC-20261101-01-6, AC-20261101-01-7, AC-20261101-01-8, AC-20261101-01-9, AC-20261101-01-10, AC-20261101-01-11, AC-20261101-01-12, AC-20261101-01-13, AC-20261101-01-14, AC-20261101-01-15, AC-20261101-01-16, AC-20261101-01-17, AC-20261101-01-18, AC-20261101-01-19, AC-20261101-01-20]
---

# The host names its own test cases

## Goal

Test-file discovery is language-neutral, but the one reader of "a test case" understands only
line-start `test(`/`it(` JavaScript calls. On a host whose tests are not that shape (pytest, Go,
Rust, anything else), every test file is found and read as zero cases: `count-tests --titles`
prints nothing, `ac-matrix --lint --resolve-root` refuses every `→ reuses`/`→ rewrites` pointer
as `unresolved-disposition`, and the host can never pin an existing test. The plugin names no
language: a new optional grounding-contract key, `testCaseScanner`, lets the host declare the
command that lists its cases, and every consumer of "a test case" reads through one dispatch that
prefers the host's listing and falls back to the built-in JavaScript walker. Done means a host
that declares the key pins, counts, lints and expires its cases like a JavaScript host, a host
that declares nothing is byte-for-byte unchanged, and `/spec:init` and `/spec:doctor` know the key.
