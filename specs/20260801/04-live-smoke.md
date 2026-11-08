---
date: 2026-08-01
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md, specs/20260801/02-session-runner.md, specs/20260801/03-lane-engine.md]
depended_on_by: []
brief: n/a
spiked: 2026-08-01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260801-04-1, AC-20260801-04-2, AC-20260801-04-3, AC-20260801-04-4, AC-20260801-04-5, AC-20260801-04-6, AC-20260801-04-7, AC-20260801-04-8, AC-20260801-04-9, AC-20260801-04-10, AC-20260801-04-11, AC-20260801-04-12, AC-20260801-04-13]
---

# autopilot 04 — live smoke & standing boot proof

## Goal

Specs 01–03 shipped CLEAN with every seam faked on both sides, and the pipeline's one
executed-verification gate was switched off repo-wide by a `runtime.inert` line that stopped
being true the moment a daemon landed here. This spec closes both halves: a **one-time
supervised live run** proving a real lane drives a real stage against real Telegram and the
real SDK, and a **standing offline boot leg** so "the daemon still starts" is re-checked on
every future review instead of being assumed. Done means a phone tap has demonstrably reached
the model as an answer, the repo's boot smoke actually passes green against a real bootable
process, and a fresh clone can be turned into a running daemon from the README alone.
