---
date: 2026-11-05
status: done
area: fanout
depends_on: [specs/20261105/07-a-batch-ends-clean.md]
brief: 38
architecture: false
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-10-1, AC-20261105-10-2, AC-20261105-10-3, AC-20261105-10-4, AC-20261105-10-5, AC-20261105-10-6, AC-20261105-10-7, AC-20261105-10-8, AC-20261105-10-9, AC-20261105-10-10, AC-20261105-10-11, AC-20261105-10-12, AC-20261105-10-13, AC-20261105-10-14, AC-20261105-10-15]
---

# A batch tells the truth

## Goal

A fan-out batch whose lanes overlap no longer serialises itself: a ready lane lands while a sent-back lane is still resolving, and the resolver pays one more rebase instead of every other lane waiting (spec 06 was rebased three times behind 08, and 08 behind 06, in the fix round). Every mark prints what it did, so an operator never has to run the driver bare to learn a lane was sent back. Briefs quote the spec faithfully, the spec on trunk says what was actually built, and a brief leaves the queue only when the user closes it.
