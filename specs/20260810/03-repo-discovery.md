---
date: 2026-08-10
status: done
risk: T2
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260810/04-hub-wired-daemon.md]
brief: 03
spiked: 2026-08-10
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-03-1, AC-20260810-03-2, AC-20260810-03-3, AC-20260810-03-12, AC-20260810-03-4, AC-20260810-03-5, AC-20260810-03-6, AC-20260810-03-7, AC-20260810-03-8, AC-20260810-03-9, AC-20260810-03-10, AC-20260810-03-11]
---

# autopilot discover — spec-grounded repo discovery + idempotent hub registration

## Goal

Kill the hand-typed `--project` flag as the only way a machine's repos become hub projects
(the 2026-08-10 incident: an enroll without it produced `"projects": []` and total
silence). A new `autopilot discover` subcommand scans one directory level under a
persisted repos root, identifies spec-grounded repos by the `/spec:init` artifact,
registers each against the hub's idempotent projects route, and rewrites `hub.json`.
`enroll` gains `--repos-root` so a fresh machine enrolls with its repos in one command.
Done = a box with N cloned spec-grounded repos needs zero typed project names.
