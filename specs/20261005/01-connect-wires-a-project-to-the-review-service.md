---
date: 2026-10-05
status: done
tier: critical
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
build_base: design-retool
open_markers: 0
diff_base: 616ac76e3e8f599c80cf97036e5001200dece188
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261005-01-1, AC-20261005-01-2, AC-20261005-01-3, AC-20261005-01-4, AC-20261005-01-5, AC-20261005-01-6, AC-20261005-01-7, AC-20261005-01-8, AC-20261005-01-9, AC-20261005-01-10, AC-20261005-01-11, AC-20261005-01-12, AC-20261005-01-13, AC-20261005-01-14, AC-20261005-01-15, AC-20261005-01-16, AC-20261005-01-17, AC-20261005-01-18, AC-20261005-01-19, AC-20261005-01-20]
---

# Connect wires a project to the review service

## Goal

Connecting a client project to the hosted review service takes five hand steps across two
repositories, and a project that skipped them falls back to confirming stories in the terminal
without saying why. `/spec:connect`, run in the client project with no arguments, creates (or
joins) the project on the service, keeps the token in a file git ignores, writes the
`walkthrough` config block, proves the link with a call that needs the token, and prints one
line. Done means: one command, safe to run twice, and the same session can send screens right
after it.
