---
date: 2026-08-31
status: done
diff_base: e082b9d3fe809d7651de9a8b64f4d58238075c1d
tier: standard
area: design-render
design: false
breaking: false
depends_on: []
depended_on_by: []
# brief: n/a — defect-fix successor to the brief 08 render-gate series (specs/20260824/01..05),
# which is closed on the roadmap; re-stamping brief 08 would falsely reopen its derived status.
spiked: 2026-08-31
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260831-02-1, AC-20260831-02-2, AC-20260831-02-3, AC-20260831-02-4, AC-20260831-02-5, AC-20260831-02-6, AC-20260831-02-7, AC-20260831-02-8]
---

# Viewport adaptation as a rendered rule (no-overflow + line-length)

## Goal

The design pipeline's "matrix checks" never verify that a mock actually adapts at the
declared viewports: `design-atlas.js check --matrix` greps for a viewport meta tag and a dark
tokens block, and no `renderCheck` kind measures geometry against the viewport — so a
phone-only mock ratifies clean and the render gate later misattributes its non-adaptation to
components (prax, spec 20260823/11: 50–88 geometry findings per surface). Done means: a mock
that scrolls or clips horizontally at any declared viewport cell fails `render-gate --mocks`
at `/spec:sketch`'s exit through the existing rules pass — no new wiring, no new command
surface — and the static atlas checks stop overclaiming.
