---
date: 2026-09-28
status: done
build_base: design-retool
tier: critical
area: prototype
breaking: false
depends_on: [specs/20260928/01-the-prototype-command-and-the-pin-overlay.md]
depended_on_by: [specs/20260928/03-the-build-reads-the-freeze.md]
brief: 28
spiked: 2026-09-28
open_markers: 0
diff_base: 5b344310222a6089c2f6af513ea0c46852e6b802
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260928-02-1, AC-20260928-02-2, AC-20260928-02-3, AC-20260928-02-4, AC-20260928-02-5, AC-20260928-02-6, AC-20260928-02-7, AC-20260928-02-8, AC-20260928-02-9, AC-20260928-02-10, AC-20260928-02-11]
---

# Freeze, export and the contract

## Goal

On the user's approval the prototype driver freezes: it refuses unless the host's kit gates are
green on the prototype tree, captures every declared route and state as a structural record
keyed by kit-composite instance, writes the contract (routes, states, ids, the pins that become
tests), has the session derive one end-to-end test per behaviour pin into the host's e2e file on
main, exports the data and API layer to `harden/<stem>` before anything is deleted, writes the
behaviour-lane spec the build will run from, then deletes the worktree and `proto/<stem>` and
records one ledger row. Done means: on a fixture host the freeze refuses on a red gate, refuses
without a fixture per declared state, writes captures and a contract with the documented shape,
refuses the tests mark until every behaviour pin's test is listed by the host's runner, creates
`harden/<stem>` holding exactly the export globs' diff, writes a spec that passes the plan-time
lints, and leaves no `proto/<stem>` behind.
