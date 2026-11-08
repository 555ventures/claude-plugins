---
date: 2026-11-05
status: done
area: queue
depends_on: [specs/20261105/14-the-prototype-is-pinned-in-chat-and-proved-at-look.md]
brief: n/a
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-16-1, AC-20261105-16-2, AC-20261105-16-3, AC-20261105-16-4, AC-20261105-16-5, AC-20261105-16-6, AC-20261105-16-7, AC-20261105-16-8, AC-20261105-16-9, AC-20261105-16-10, AC-20261105-16-11, AC-20261105-16-12, AC-20261105-16-13, AC-20261105-16-14, AC-20261105-16-15, AC-20261105-16-16, AC-20261105-16-17, AC-20261105-16-18, AC-20261105-16-19, AC-20261105-16-20, AC-20261105-16-21, AC-20261105-16-22, AC-20261105-16-23, AC-20261105-16-24]
---

# The queue fills itself again

## Goal

On a repo with open briefs and specs, `queue next` prints the real next command and `queue list` shows the same work the status screen shows, with each row's type and what is in progress. Reading the queue writes nothing, so the file never holds a second copy of spec state. Bare fanout builds what is startable in v7's order and stops where v7 stopped, and it says `drained` only when nothing is open. Mistyped flags, missing spec paths and old-format queue files stop with their remedy instead of giving a quiet wrong answer. A fix has one command, `/spec:fix`.
