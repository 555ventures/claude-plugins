---
date: 2026-10-07
status: done
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: [specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md, specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
brief: 28a
spiked: 2026-10-07
build_base: main
open_markers: 0
diff_base: 639ae05b66a9da56ec35c2ed30552aca22248c65
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261007-01-1, AC-20261007-01-2, AC-20261007-01-3, AC-20261007-01-4, AC-20261007-01-5, AC-20261007-01-6, AC-20261007-01-7, AC-20261007-01-8, AC-20261007-01-9]
---

# Approve writes a behaviour contract

## Goal

On the user's `approve`, the prototype driver writes a **behaviour contract** and nothing else
leaves the worktree: every pin as a plain sentence, one picture of every declared route × state
made by a command the host owns, and one end-to-end test per behaviour pin that passed against
the prototype and now waits, red, for a production build. No gate runs on the prototype tree, no
kit is required, no data or API layer is exported, no spec is generated, and the worktree and
`proto/<stem>` stay until a later `--mark closed`. The driver hands the contract to `/spec:plan`
by printing the paste and queueing it. Done means: on a fixture host the contracted mark refuses
without behaviour pins or a picture, writes the pictures and `contract.json`, the tests-derived
mark refuses a test the runner does not list or that is red against the prototype, copies the
test file into the contract, queues the plan paste and records one ledger row; `--mark closed`
deletes the database, worktree and branch; `/git:merge` still refuses `proto/*` and names the
contract.
