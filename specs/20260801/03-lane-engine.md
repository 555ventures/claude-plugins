---
date: 2026-08-01
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md, specs/20260801/02-session-runner.md]
depended_on_by: []
brief: n/a
spiked: 2026-08-01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260801-03-1, AC-20260801-03-2, AC-20260801-03-3, AC-20260801-03-4, AC-20260801-03-5, AC-20260801-03-6, AC-20260801-03-7, AC-20260801-03-8, AC-20260801-03-9, AC-20260801-03-10, AC-20260801-03-11, AC-20260801-03-12, AC-20260801-03-13]
---

# autopilot 03 — lane engine & daemon

## Goal

The daemon itself: load a per-host config, run one lane per project, and in each lane loop
`spec-status --next --json` → brief checkpoint → stage session → halt-or-advance, relaying
every human decision to Telegram (BRIEF.md architecture sketch, lines 29–43). Done means
`autopilotd` drives a synthetic host repo through the loop against fake adapter/session
implementations, and every BRIEF locked decision (#2–#7) is pinned by an AC.
