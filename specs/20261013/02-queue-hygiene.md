---
date: 2026-10-13
status: done
build_base: main
tier: standard
area: session-queue
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 176b35e11eb52b845dea8f1abb58aabe2e24b3d7
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261013-02-1, AC-20261013-02-2, AC-20261013-02-3, AC-20261013-02-4, AC-20261013-02-5, AC-20261013-02-6, AC-20261013-02-7, AC-20261013-02-8, AC-20261013-02-9, AC-20261013-02-12, AC-20261013-02-13, AC-20261013-02-10, AC-20261013-02-11]
---

# Queue hygiene: refuse duplicates, show age, archive the done, groom the rest

## Goal

The session queue stops accumulating what it cannot clean itself. `add` refuses a free-text
prompt that near-duplicates a pending one. `list` shows each item's age and flags the three
shapes of rot a reader otherwise discovers by hand: a prompt citing a spec that already shipped,
a gate that is met but idle, a prompt older than two weeks. Ticked rows leave the queue file for
a sibling archive so the file holds only live work. A read-only `groom` subcommand prints every
flagged item in buckets with the two fate commands, and the command doctrine says the session
proposes one fate per item and asks per item — never ticks without a yes. Done means: the
duplicate pair this repo holds today (q321/q322) is refused at add time, every list row carries
an age, the queue file here shrinks from 316 rows to the pending ones, and `groom` prints
nothing to groom on a clean queue. Sibling of specs/20261013/01 (the upstream fix); this spec
handles only what that one cannot prevent.
