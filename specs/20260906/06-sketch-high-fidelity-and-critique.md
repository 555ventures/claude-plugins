---
date: 2026-09-06
status: done
tier: standard
area: design-sketch
design: false
breaking: false
depends_on: [specs/20260906/03-questions-on-the-wireframe.md, specs/20260906/05-gray-states-on-every-wireframe.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: dea9175f8d069ebe562ac5a262db9b357a759a10
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260906-06-1, AC-20260906-06-2, AC-20260906-06-3, AC-20260906-06-5, AC-20260906-06-4]
---

# Sketch owns high fidelity per brief in the picked theme, argues each surface's UX, and closes with a fixed critique pass

## Goal

`/spec:sketch <brief>` is where a surface becomes production fidelity: every mock the brief declares is authored or reworked in the picked theme (`design/tokens.css`, the shell canon), each surface's UI/UX is argued individually in the brief, and before the exit stop a fixed critique pass runs — the render rules, the states check, and one fresh-context critic whose findings land as page notes tagged with the four blind spots models share (error prevention, error recovery, help and documentation, efficiency of use). A mock still linking the wireframe register after the theme exists is a violation at ratification. Done means sketch cannot ratify a gray mock in a themed product and cannot skip the critique.
