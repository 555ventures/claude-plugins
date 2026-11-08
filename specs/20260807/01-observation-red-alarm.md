---
date: 2026-08-07
status: done
open_markers: 0
risk: T3                 # spec-status.js is a listed T3 trigger (sole "what's next" derivation)
area: status
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260807-01-1, AC-20260807-01-2, AC-20260807-01-3, AC-20260807-01-4, AC-20260807-01-5, AC-20260807-01-12, AC-20260807-01-6, AC-20260807-01-7, AC-20260807-01-8, AC-20260807-01-9, AC-20260807-01-10, AC-20260807-01-11]
---

# Observation slims to a red alarm; the status render bottom-anchors Next

## Goal

The post-review observation window (specs/20260805/03) shipped two things fused together: a
red alarm (CI broke on landed code → dashboard goes red with a paste-ready `/spec:escape`)
and a green-certification ledger (every done spec is "unobserved" until a containing run is
recorded). The owner has ruled the certification half is pure noise — merge-back never
pushes, so historical specs can never qualify and sit "⏳ unobserved" forever. This spec
keeps the alarm and deletes the certification: observation becomes **silent unless red**.
Independently, the `--pretty` dashboard prints its actionable sections first, so on large
hosts the 🎯 Next block scrolls off the top of the terminal; the render inverts to
**bottom-anchored** — detail up top, 🎯 Next and the verdict headline as the last lines on
screen. Done means: a healthy host shows zero observation output anywhere, a red run on
landed spec code still tops Next as one escape entry, and Next is visible without scrolling.
