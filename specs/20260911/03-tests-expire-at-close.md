---
date: 2026-09-11
status: done
build_base: main
tier: critical
area: review-close
design: false
breaking: false
depends_on: [specs/20260911/02-tests-have-a-ceiling.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: b8673741aaa1713b7ab91b7fc68338a5cf85da4a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260911-03-1, AC-20260911-03-2, AC-20260911-03-3, AC-20260911-03-4, AC-20260911-03-5, AC-20260911-03-6, AC-20260911-03-7, AC-20260911-03-8, AC-20260911-03-9]
---

# Tests expire at close

## Goal

A spec's tests die when the spec does. When `/spec:review` flips a spec to `done`, every test
tagged with that spec's AC-IDs is deleted unless it cites a ledger escape class, exercises a
script the pipeline itself runs, or pins an opt-in `SHALL CONTINUE TO` criterion. The close
ledger row records `tests:{born,kept,retired}`. The same rule runs once over every done spec
in a host through `/spec:doctor`, so prax and salon-os shed their closed specs' tests the same
way this repo did by hand on 2026-09-11. Done means: a review close in a fixture host deletes
the expired tests and stamps the row, the doctor dry run reports zero retirable tests in this
repo at HEAD, and untagged tests are never touched by either path.
