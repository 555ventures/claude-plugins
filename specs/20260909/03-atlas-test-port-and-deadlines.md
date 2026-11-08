---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: daf4177e91f6442677b7e3ccba127005f661f9a4
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260909-03-1, AC-20260909-03-2, AC-20260909-03-3, AC-20260909-03-4, AC-20260909-03-5, AC-20260909-03-6, AC-20260909-03-7, AC-20260909-03-8, AC-20260909-03-9]
---

# The browser-driven atlas tests stop sharing ports and stop waiting forever

## Goal

Two test runs in this repo at the same time — two sessions, or a review leg while the user runs
the suite — can hang one of them indefinitely at zero CPU. The Chrome-driving atlas tests derive
a port from their process id; when a sibling run already serves that port, `design-atlas.js
serve` answers `already serving` and exits 0, the shared harness reads that line as "ready", the
test drives the *other* run's server, and its cleanup then waits for an exit event on a child
that has already exited — which never fires. This spec makes the harness ask the server for a
free port (so two runs can never collide), refuse to proceed on any answer other than its own
`serving` line, bound every wait it holds with a named deadline, and never hang on a child that
is already gone. Done means: the three Chrome-driving test files carry no `process.pid` port
arithmetic, every wait in the harness rejects with a message inside a fixed time, and `serve
--port 0` announces the port it actually bound.
