---
date: 2026-08-01
status: done
risk: T2
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260801/02-session-runner.md, specs/20260801/03-lane-engine.md]
brief: n/a
spiked: 2026-08-01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260801-01-1, AC-20260801-01-2, AC-20260801-01-3, AC-20260801-01-4, AC-20260801-01-5, AC-20260801-01-6, AC-20260801-01-7, AC-20260801-01-8, AC-20260801-01-9]
---

# autopilot 01 — Telegram messaging adapter

## Goal

Give the autopilot daemon (BRIEF.md decisions #8–#10) its messaging seam: a zero-dependency
Telegram adapter that long-polls one bot token, posts into one supergroup's forum topics
(one topic per project), renders AskUserQuestion-shaped questions as inline keyboards, and
routes button taps back to pending asks. Done means the adapter round-trips a question to an
answer against an injected fake transport under `tests/autopilot/`, and the `autopilot`
plugin exists in the marketplace.
