---
date: 2026-09-08
build_base: main
status: done
tier: standard
area: doctrine-governance
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: c7bb7245e8c29fa0faf7ecc2fca4cb2f7d8d7aea
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260908-06-1, AC-20260908-06-2, AC-20260908-06-3, AC-20260908-06-4, AC-20260908-06-5]
---

# Command prose states contracts — drivers print the steps

## Goal

The four driver-stepped command files (`build`, `review`, `run`, `mocks`) stop restating what
their driver prints at runtime, every command loses the duplicate read of the host rules file
and the duplicate `AskUserQuestion` bullet, the two longest incident retellings become rules,
and the genesis brief is edited in place instead of rewritten and reprinted every interview
round. Done means the read-load test carries a lower budget per trimmed command, a bullet cap
on every `## Rules` section, and an exact pin of every `shared-for` section list, all green,
with every existing doctrine pin still green.
