---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: gate
design: false
breaking: false
depends_on: [specs/20260909/06-ephemeral-serve-ports.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: 614c32451ec398fd4df4e4b34dbe40816454eb59
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-07-1, AC-20260909-07-2, AC-20260909-07-3, AC-20260909-07-4, AC-20260909-07-5, AC-20260909-07-6, AC-20260909-07-7, AC-20260909-07-8, AC-20260909-07-9]
---

# A hanging test is a bounded red, and a fixed test port is a doctor finding

## Goal

A test that never finishes costs 45 seconds, not three hours: both the host `testCommand` and
`gateCommand` carry `--test-timeout=45000 --test-force-exit`, and the file-budget reporter moves
to stderr because force-exit truncates a second reporter on stdout. A new deterministic doctor
check, `port-check.js`, walks `tests/` and reports every fixed or computed port literal so the
class spec 06 removed cannot creep back. Done means: a fixture test holding an open socket goes
red with exit 1 inside the timeout, the budget sentinel still prints on every run, and the check
is green against this repo.
