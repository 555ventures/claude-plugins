---
date: 2026-08-24
status: done
diff_base: 6f3b4ec9a557efed651fa48e8f2647e6bee97bfb
tier: critical           # removes spec-paths keys (key-set edit — critical trigger, precedent specs/20260823/01) and edits spec/templates/grounding-contract.md (contract hash)
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/04-render-rules.md]
depended_on_by: []
brief: 08
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-05-1, AC-20260824-05-2, AC-20260824-05-3, AC-20260824-05-4, AC-20260824-05-5, AC-20260824-05-6, AC-20260824-05-7]
---

# Design doctrine cut and source-gate feed retirement

## Goal

Rewrite `spec/doctrine/design.md` around the render gate — contracts and invariants only —
with the ~80% cut the core commands got, and retire the source-grep feed that only existed
to serve the old gate: `dc-extract.js`, `fidelity-check.js`, their tests, the `.design/`
sidecar's remaining traces (gitignore generation, this repo's manifest claim, doctor's
orphan check, the spec template's comments), and the retainer/vision language. Done means:
`design.md` is at most 160 lines, every `§` citation in the corpus resolves, no plugin file
names a deleted script, and the host contract no longer requires `copyCatalogs`.
