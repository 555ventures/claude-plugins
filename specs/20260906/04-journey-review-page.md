---
date: 2026-09-06
status: done
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260906/03-questions-on-the-wireframe.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: 16aea5f7c3c1e6731da9fa451550ffdc8a5a6e47
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260906-04-1, AC-20260906-04-2, AC-20260906-04-3, AC-20260906-04-4, AC-20260906-04-5, AC-20260906-04-6, AC-20260906-04-7, AC-20260906-04-8, AC-20260906-04-9, AC-20260906-04-10]
---

# The journey review page: screens rail, artboards with state tabs, a question inspector with keyboard flow — the look surface for a journey

## Goal

`stop open journey:<j>` points at a page built for answering: a three-pane review page per journey served at `/review/<j>.html`. Left, the journeys and this journey's screens with open counts. Centre, one artboard per screen on a dotted canvas, each an iframe of the served mock with `happy | empty | loading | error` state tabs. Right, the inspector: every question and note on the journey, filtered Open / Answered / All, answered inline, a composer with scope and reason, foldable to a strip, driven by `J K Y N Esc \`. The header carries the breadcrumb, `k of n answered`, and the stop's Approve control, disabled while anything is open. The chrome is authored under the frontend-design skill in the shadcn idiom on the viewer's zinc register; the wireframes inside the iframes stay gray. Done means the journey look happens on this page, the atlas index links to it, and nothing about the endpoints or the stores changes.
