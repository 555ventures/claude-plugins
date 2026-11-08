---
date: 2026-08-08
status: done
open_markers: 0
risk: T2
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-08
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260808-01-1, AC-20260808-01-2, AC-20260808-01-3, AC-20260808-01-4, AC-20260808-01-5, AC-20260808-01-6, AC-20260808-01-7, AC-20260808-01-8, AC-20260808-01-9, AC-20260808-01-10, AC-20260808-01-11, AC-20260808-01-13, AC-20260808-01-12]
---

# autopilot enroll — spoke-side enrollment CLI

## Goal

Make the hub's paste-ready line work end-to-end on a fresh machine:
`autopilot enroll --hub <url> --code <code>` exchanges a one-time enrollment code for a
spoke identity against the deployed autopilot-hub (contract version 1), persists the
credentials the later spoke calls need (hub URL, spokeId, bearer token, projects) to a
0600 local file, and prints a token-free success line. Done = the stub suite proves the
exact wire contract, and one real enrollment against the production hub succeeds.
The poll/report loop that will consume these credentials is out of scope (no roadmap
brief covers it yet — see Rationale).
