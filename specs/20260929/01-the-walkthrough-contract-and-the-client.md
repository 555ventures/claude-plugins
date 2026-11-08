---
date: 2026-09-29
status: done
build_base: design-retool
tier: critical
area: design
breaking: false
depends_on: []
depended_on_by: []
brief: 29
spiked: 2026-09-29
open_markers: 0
diff_base: 5cc9cda7e9625855db69f9bc0d7033936ced6691
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260929-01-1, AC-20260929-01-2, AC-20260929-01-3, AC-20260929-01-4, AC-20260929-01-5, AC-20260929-01-6, AC-20260929-01-7, AC-20260929-01-8, AC-20260929-01-9, AC-20260929-01-10, AC-20260929-01-11, AC-20260929-01-12, AC-20260929-01-13, AC-20260929-01-14, AC-20260929-01-15, AC-20260929-01-16, AC-20260929-01-17, AC-20260929-01-18, AC-20260929-01-19]
---

# The walkthrough contract and the client

## Goal

The plugin gains the one scripted HTTP client that talks to the hosted review service
(`walkthrough`), the one machine-readable contract file both repositories test against, and the
gray wireframe vocabulary as plain JSON, so a session can check a round before it sends it. A
project that declares no `walkthrough` block in its config is untouched: no request, no file, no
error. Done means: against a stub service the client pushes a wireframe round and a picture
round, pulls notes and approvals into `design/rounds/<n>/` as files git can diff, answers a note,
marks a round, refuses every answer that breaks the contract, and never prints the token.
`/spec:mocks` and the npm reviewer are not touched; switching them is a later spec of brief 29.
