---
date: 2026-09-14
status: done
tier: critical
area: design
design: false
breaking: true
build_base: main
depends_on: [specs/20260914/01-the-mock-contract-and-the-driver.md, specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md]
depended_on_by: []
brief: 26
open_markers: 0
diff_base: 5391703f6e2455fd9415834b1cee3da5f45e3649
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260914-03-1, AC-20260914-03-2, AC-20260914-03-8, AC-20260914-03-3, AC-20260914-03-4, AC-20260914-03-5, AC-20260914-03-6, AC-20260914-03-7]
---

# The HTML atlas is retired

## Goal

Every script, library, test, template, fixture and chrome mock of the HTML design system is
deleted, together with `/spec:atlas`, the spec-paths keys and entrypoints rows that named them,
and the test harness that served them. The commit before the deletion is tagged
`atlas-html-final`. Done means: the retired-literal sweep over the plugin, the README and the
canonical docs finds nothing; the whole suite is green with every File Plan DELETE row gone; the provenance
ledger and the `surfaces` grammar still load; `docs/canonical/design.md` describes one
artifact.
