---
date: 2026-11-05
status: done
area: doctrine
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: 35
architecture: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-06-1, AC-20261105-06-2, AC-20261105-06-3, AC-20261105-06-4, AC-20261105-06-5, AC-20261105-06-6, AC-20261105-06-7, AC-20261105-06-8, AC-20261105-06-9, AC-20261105-06-10, AC-20261105-06-11, AC-20261105-06-12, AC-20261105-06-13, AC-20261105-06-14, AC-20261105-06-15]
---

# The client says yes

## Goal

A clean run asks nothing. A run that meets a client-level choice asks once, in one batched question, and the answer is recorded in the spec by the driver, never by a builder. On the v8 trial this would have asked JJ twice (niko-hub 04's D11/D13 self-amend; shop-bltr 08's dropped D8/D12) and blocked the lock of specs whose Decisions took something away from users without a recorded yes, while leaving the 20 clean lanes exactly as quiet as they were.
