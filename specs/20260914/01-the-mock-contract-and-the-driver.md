---
date: 2026-09-14
status: done
build_base: main
tier: critical
area: mocks
design: false
breaking: true
depends_on: []
depended_on_by: [specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md, specs/20260914/03-the-html-atlas-is-retired.md]
brief: 26
open_markers: 0
spiked: 2026-09-14
diff_base: c636be83d55786631e2e12a19cfe06f770290bdc
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260914-01-1, AC-20260914-01-2, AC-20260914-01-3, AC-20260914-01-4, AC-20260914-01-5, AC-20260914-01-6, AC-20260914-01-7, AC-20260914-01-8, AC-20260914-01-9, AC-20260914-01-10, AC-20260914-01-12, AC-20260914-01-13, AC-20260914-01-14, AC-20260914-01-15, AC-20260914-01-16, AC-20260914-01-24, AC-20260914-01-17, AC-20260914-01-18, AC-20260914-01-19, AC-20260914-01-22, AC-20260914-01-23]
---

# The mock contract and the driver

## Goal

`/spec:mocks` drives a greenfield product's own Vite + React + shadcn app instead of gray HTML
wireframes. This spec ships the one contract between this plugin and the separate reviewer
package (`spec/templates/mock/contract.json`), a dependency-free library that calls the package's
CLI through it and refuses a version mismatch, and `mocks-driver.js` rewritten over
SEED → SHELL → SCREENS → THEME → CLIENT → APPROVED, with the provenance ledger's verbs and gate
kept verbatim. Done means: on a host with the package installed, every mark is derived from
`design/notes.json`, `design/approval.json` and `mock-review check --json`, the SEED step prints
the executed scaffold command, and the old driver's retired verbs refuse with a remedy. The HTML
scripts still exist after this spec (specs 02 and 03 rewire and delete them); nothing this spec
ships calls them.
