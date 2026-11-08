---
date: 2026-11-02
status: done
tier: critical
area: fanout
breaking: false
depends_on: [specs/20261102/02-a-delegated-driver-stops-on-disk.md]
brief: 32
spiked: 2026-11-02
open_markers: 0
diff_base: e4dd870f43257bd6e88d86b525ca7ea01c22768b
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261102-03-1, AC-20261102-03-2, AC-20261102-03-19, AC-20261102-03-3, AC-20261102-03-4, AC-20261102-03-20, AC-20261102-03-5, AC-20261102-03-6, AC-20261102-03-7, AC-20261102-03-21, AC-20261102-03-22, AC-20261102-03-8, AC-20261102-03-9, AC-20261102-03-10, AC-20261102-03-11, AC-20261102-03-12, AC-20261102-03-13, AC-20261102-03-14, AC-20261102-03-15, AC-20261102-03-16, AC-20261102-03-17, AC-20261102-03-18]
---

# One session runs the lanes

## Goal

`/spec:status` already names the queue's startable lanes, but running them means one terminal per
lane and a human relaying every stop by hand. After this spec one command in the main session reads
the lanes from a new machine surface, asks the three predictable questions once up front, dispatches
one worktree-isolated sub-agent per lane through the Agent tool, relays every question the lanes
write (batched four at a time; answered by the user or by the up-front sheet, never by a worker),
merges each finished lane into main one at a time with the host gate re-run after every merge, and
renders one report. The dispatch table lives in the git common dir, so `/clear` loses nothing. Done
means a four-lane day is one session: dispatch, supervise, resume, merge, report — with every
decision still the user's.
