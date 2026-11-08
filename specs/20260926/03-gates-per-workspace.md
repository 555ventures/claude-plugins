---
date: 2026-09-26
status: done
build_base: design-retool
tier: critical
area: enforce
breaking: false
depends_on: [specs/20260926/02-the-design-contract-is-code.md]
depended_on_by: []
brief: 27
open_markers: 0
diff_base: 0995b4ec914d09d24213e38fce6848614413ee74
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260926-03-1, AC-20260926-03-2, AC-20260926-03-3, AC-20260926-03-4, AC-20260926-03-5, AC-20260926-03-6, AC-20260926-03-7, AC-20260926-03-8]
---

# Gates, per workspace

## Goal

`/spec:enforce` discovers and wires enforcers once per workspace, not once per repo: a Python
backend and a TypeScript frontend in one tree each get their own checker set, and a naming
gate is discovered per layer (code, schema, routes, wire) from the host's naming table. A
deterministic script finds the workspaces; the enforce workflow's cell carries the workspace
root and, for naming, the layer; the enforcement manifest records both. Done means: the
workspace scanner exists with executed tests, the workflow accepts and refuses cells by the new
grammar, the contract describes entries per (workspace × stack × category), and the doctor's
enforcement check resolves each entry's workspace.
