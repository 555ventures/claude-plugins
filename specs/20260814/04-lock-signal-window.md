---
date: 2026-08-14
status: done
diff_base: 35522c2d3403c5e2733f626d614a54e4e0e5005c
open_markers: 0
risk: T3
area: autopilot-daemon
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260814/03-suite-baseline.md"]
brief: n/a
spiked: 2026-08-14
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260814-04-1, AC-20260814-04-2, AC-20260814-04-3, AC-20260814-04-4]
---

# Close autopilotd's lock-acquire → signal-handler window

## Goal

`autopilotd` writes its pidfile lock, then builds adapter and lanes, and only then installs
its SIGTERM/SIGINT handlers — so a stop signal landing in that window kills the process via
the default action and leaves a stale lockfile, falsifying the D5 "released on clean
shutdown" contract of specs/20260810/05-service-bootstrap.md (escape row appended
2026-08-15, `foundBy:"user"`, `preventedBy:"runtime-leg"`; the covering test flagged it only
as intermittent full-suite noise). This spec installs a provisional release-and-exit
handler in the same synchronous tick as lock acquisition; the full lane-stopping handlers
replace it once lanes exist. Done = the DI pins and ordering pin run green and the
previously-flaky lifecycle test passes its stability loop.
