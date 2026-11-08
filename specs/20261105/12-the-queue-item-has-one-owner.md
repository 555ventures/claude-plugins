---
date: 2026-11-05
status: done
area: queue
depends_on: [specs/20261105/11-the-batch-tells-the-rest-of-the-truth.md]
brief: n/a
architecture: true
breaking: true
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-12-1, AC-20261105-12-2, AC-20261105-12-3, AC-20261105-12-4, AC-20261105-12-5, AC-20261105-12-6, AC-20261105-12-7, AC-20261105-12-8, AC-20261105-12-9, AC-20261105-12-10]
---

# The queue item has one owner

## Goal

A queue item means one thing everywhere: status, `queue next`, fanout, run and prototype read the same `type`, `spec` and bare `payload` from one module, so an item that pastes as a fix is a fix lane. Fanout never says "drained" while anything is open. A script that builds an item by hand fails the suite, and an unmigrated queue file stops with its remedy instead of being half-read.
