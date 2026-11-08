---
date: 2026-11-05
status: done
area: fanout
depends_on: [specs/20261105/10-a-batch-tells-the-truth.md]
brief: n/a
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-11-1, AC-20261105-11-2, AC-20261105-11-3, AC-20261105-11-4, AC-20261105-11-5, AC-20261105-11-6, AC-20261105-11-7, AC-20261105-11-8, AC-20261105-11-9]
---

# The batch tells the rest of the truth

## Goal

Spec 10 promised that a mark says what it did to every lane, that the spec on trunk records every departure, and that the status goldens are the screen's own record. Four gaps were accepted as review advisories at its merge and lost with the worktree. After this spec every `done` lane that a red trunk holds back is named in the mark that held it, a fix lane records the files it touched outside its spec's plan, a golden shows the `brief-done-queued` decide line without breaking the v7 oracle, and the sent-back WAIT body's shape is what the doctrine says it is.
