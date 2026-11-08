---
date: 2026-08-01
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md]
depended_on_by: [specs/20260801/03-lane-engine.md]
brief: n/a
spiked: 2026-08-01
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260801-02-1, AC-20260801-02-2, AC-20260801-02-3, AC-20260801-02-4, AC-20260801-02-5, AC-20260801-02-9, AC-20260801-02-10, AC-20260801-02-6, AC-20260801-02-7, AC-20260801-02-8]
---

# autopilot 02 — SDK session runner

## Goal

The daemon's stage executor: spawn one fresh Claude Agent SDK session per pipeline stage
(`/spec:plan|design|build|review` — BRIEF "why a daemon"), intercept AskUserQuestion and
permission prompts via `canUseTool` and relay them to caller-supplied handlers (the Telegram
adapter, in spec 03), classify the outcome, and report cost. Done means a stage round-trips
question → injected answer → completion against a fake `queryImpl` with zero real SDK calls
in tests.
