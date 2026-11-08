---
date: 2026-09-07
status: done
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/07-mocks-retires-theme.md]
depended_on_by: []
brief: 22a
spiked: 2026-09-07
open_markers: 0
diff_base: 5e4aa870b0e399a1a839f4b4e5f7f8fb1fe0f680
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260907-08-1, AC-20260907-08-2, AC-20260907-08-3, AC-20260907-08-4, AC-20260907-08-5, AC-20260907-08-6, AC-20260907-08-7, AC-20260907-08-8, AC-20260907-08-9, AC-20260907-08-10, AC-20260907-08-11, AC-20260907-08-12]
---

# `/spec:mocks` gains WALK: one fresh-context critic per journey, flow breaks only, cited to a screen and a state or refused

## Goal

Between `WIREFRAMES` and `SIGNOFF` the driver gains a `WALK` state. Each declared seed journey
is walked once by a fresh-context critic that holds no authoring memory, reads the journey's
screens in declared order with the gray empty/loading/error states entered as branches at the
step where they occur, and may report only **flow breaks** — no path back, no path forward, a
state with no exit, a step needing data no earlier step collected, a control meaning two things
across screens, an error state with no recovery. Naming, hierarchy, density and "consider…" are
refused. Every finding is a note of its own kind, anchored to a screen and one of that screen's
declared states, and no journey can be marked walked while one of its findings is still open.
The same critic replaces the four-heuristic per-screen critique pass at `/spec:sketch`. Done
means the chain reads `SEED → SHAPES → KIT → WIREFRAMES → WALK → SIGNOFF → APPROVED` and the
mocks stage cannot be signed off on a journey nobody walked.
