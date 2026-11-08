---
date: 2026-11-05
status: done
area: fanout
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: 37
architecture: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-08-1, AC-20261105-08-2, AC-20261105-08-3, AC-20261105-08-4, AC-20261105-08-5, AC-20261105-08-6, AC-20261105-08-7, AC-20261105-08-8, AC-20261105-08-9, AC-20261105-08-10, AC-20261105-08-11, AC-20261105-08-12, AC-20261105-08-13, AC-20261105-08-14, AC-20261105-08-15, AC-20261105-08-16, AC-20261105-08-17]
---

# Lanes share a machine

## Goal

On a shared laptop a fan-out batch stops paying for load twice: a red gate caused by an untouched slow test is re-run instead of handed to a builder, so no lane "repairs" a host timeout and no two lanes collide on the same config edit at merge; gates queue behind a lock so four builders never run four full suites at once; doctor says up front when the box is too small for the configured lanes, when temp space is short, and when lanes would start without the env file the suite needs; and the reports show how many reruns and how long the lock waits cost. On shop-bltr's batch 2 this would have turned four red gates into four reruns, avoided both rebase conflicts and the escalation, and named the `/tmp` and `.env` problems before dispatch.
