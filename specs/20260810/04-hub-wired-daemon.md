---
date: 2026-08-10
status: done
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: true
depends_on: [specs/20260810/03-repo-discovery.md]
depended_on_by: [specs/20260810/05-service-bootstrap.md]
brief: 03
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-04-1, AC-20260810-04-2, AC-20260810-04-3, AC-20260810-04-4, AC-20260810-04-5, AC-20260810-04-6, AC-20260810-04-7, AC-20260810-04-8, AC-20260810-04-9, AC-20260810-04-10, AC-20260810-04-11, AC-20260810-04-12]
---

# Hub-wired daemon — autopilotd boots from hub.json; direct-Telegram mode deleted

## Goal

Connect the daemon to the hub it has never spoken to. Today `autopilotd` requires a
per-host `botToken` + `supergroupId` + hand-assigned per-lane `topicId`
(`daemon/config.js`) and talks Telegram directly — the pre-hub architecture, and the
reason per-machine setup cannot scale. After this spec, `autopilotd` boots from
`hub.json` + repo discovery (spec 03), narrates and asks through the hub API via a new
`daemon/hub-adapter.js` behind the existing messaging seam, and the direct-Telegram mode
is deleted (2026-08-10 ruling). Done = a freshly enrolled box starts the daemon with
zero hand-written config, and messages appear in the hub-owned Telegram topics.
