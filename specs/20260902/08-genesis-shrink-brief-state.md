---
date: 2026-09-02
status: done
build_base: main
tier: critical             # genesis-state-gate.sh is a hook surface (pipeline rules § Risk Tiers); genesis-driver.js is the greenfield boot path
area: genesis
design: false
breaking: true             # the EXPLORE/DESIGN driver states and their marks are retired; legacy status.json files resume at BRIEF
depends_on: [specs/20260902/07-mocks-command-driver.md]
depended_on_by: [specs/20260902/11-brief-from-approved-set.md]
brief: 22
open_markers: 0
diff_base: 854156825ba55794d31eabe7cd33315f10ffca41
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260902-08-1, AC-20260902-08-2, AC-20260902-08-3, AC-20260902-08-4, AC-20260902-08-5, AC-20260902-08-6, AC-20260902-08-7, AC-20260902-08-8, AC-20260902-08-9, AC-20260902-08-10, AC-20260902-08-11, AC-20260902-08-12, AC-20260902-08-13, AC-20260902-08-14, AC-20260902-08-15, AC-20260902-08-16, AC-20260902-08-17]
---

# Genesis shrinks: DISCOVERY hands off to `/spec:mocks`, BRIEF ratifies the approved set

## Goal

Genesis loses its design states. The driver's chain becomes DISCOVERY → BRIEF → MENUS →
[FINALISTS → RACE → PROBE → PICK] → DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF →
GROUNDED: DISCOVERY names the archetype and hands off to `/spec:mocks` (or to an existing
approved set); BRIEF is entered only when `design/mocks/status.json` is `APPROVED` with zero
open product rows and is where the design lock is ratified (doctrine, tokens from THEME,
category-only rules); EXPLORE's tile funnel, the tournament's `style-tile` probe, the separate
DESIGN state and the throwaway discovery sketch are retired. A legacy `status.json` past MENUS
resumes at BRIEF with its existing artifacts, no re-run forced. Done = the driver, hook,
doctrine, templates and tests carry none of the retired states, and a legacy fixture resumes.
