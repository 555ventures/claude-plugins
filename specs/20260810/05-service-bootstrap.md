---
date: 2026-08-10
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260810/04-hub-wired-daemon.md]
brief: 03
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-05-1, AC-20260810-05-2, AC-20260810-05-3, AC-20260810-05-4, AC-20260810-05-5, AC-20260810-05-6, AC-20260810-05-7, AC-20260810-05-8, AC-20260810-05-9, AC-20260810-05-10, AC-20260810-05-11, AC-20260810-05-12, AC-20260810-05-13]
---

# autopilot service + doctor + bootstrap — survive reboots, one-command machine setup

## Goal

Make the daemon survive reboots and collapse per-machine setup to one pasted command.
Today nothing keeps `autopilotd` alive (launchd/systemd exist only as prose in
`autopilot/BRIEF.md`) — a provisioned box goes dark at the first power cycle. This spec
adds `autopilot service install|uninstall|status|logs` targeting systemd --user (the
mini-PC fleet is Linux), an offline `autopilot doctor`, a pidfile lock so two daemons
can never drive one repo, and `autopilot bootstrap --hub <url> --code <code>
[--repos-root <dir>]` as a thin composition: enroll → discover (inside enroll) →
plugin-enable → service install → doctor. Done = provisioning a box is one Telegram
`/enroll` tap + one pasted command + the Claude Code login.
