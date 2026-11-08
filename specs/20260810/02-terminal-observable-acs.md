---
date: 2026-08-10
status: done
open_markers: 0
risk: T2
area: pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-02-1, AC-20260810-02-2, AC-20260810-02-3, AC-20260810-02-4, AC-20260810-02-5, AC-20260810-02-6]
---

# Terminal-observable ACs: executable liveness for promised surfaces

## Goal

Close the pipeline's dominant escape family — **dead surfaces**: code that typechecks, lints and
tests green but can never execute or renders nothing (~14 recorded instances across hosts; 4 in
a single UpWell build on 2026-08-10). The cause is not that specs lack a liveness document; it
is that the observable end of every promise was verified against **invented fixtures or nothing
at all** — the pure-UI TDD exemption hands rendering to the component catalog, and the catalog
is fed props the author typed by hand from the same mental model that wrote the wrong code. This
spec makes liveness executable rather than asserted: a Decision that promises a user-observable
surface owes a **terminal-observable AC** whose assertion is on the observable itself and whose
fixture is **produced by the spec's own producer chain, never invented**; the pure-UI exemption
is narrowed to appearance only; the lock audit and the mid-build ruling duty are extended to
match. Done = four doctrine edits, one ledger row, pinned tests, plugin bumped. **No new script,
no new section, no new review agent** — enforcement rides the AC↔test matrix, red-check and
skipped-test reconciliation, which are already gates.
