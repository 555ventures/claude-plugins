---
date: 2026-11-08
status: done
area: queue
depends_on: [specs/20261108/01-the-host-declares-its-runtime-once.md, specs/20261108/02-every-mark-proves-its-claim.md, specs/20261108/04-the-session-reaps-what-it-started.md]
brief: n/a
architecture: true
breaking: true
text: 77c214d482357e72b253f6269de11f9a3965b04e
acs: [AC-20261108-06-1, AC-20261108-06-2, AC-20261108-06-3, AC-20261108-06-4, AC-20261108-06-5, AC-20261108-06-6, AC-20261108-06-7, AC-20261108-06-8, AC-20261108-06-9, AC-20261108-06-10, AC-20261108-06-11, AC-20261108-06-12, AC-20261108-06-13, AC-20261108-06-14]
---

# The queue syncs through your own commands

## Goal

Run `git push` on one machine and `git pull` on another, and `/spec:queue list` shows the items you placed in the same order on both, and an item a run closed on either machine reads closed on both once trunk is pulled, and a machine that has pulled never drains it again. No driver writes a path under `specs/queue/`, a queue commit costs a landing no full gate, and after `/spec:migrate` no machine holds a version 3 file.
