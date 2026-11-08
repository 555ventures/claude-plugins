---
date: 2026-11-05
status: done
area: fanout
depends_on: [specs/20261105/02-lanes-that-wait-for-each-other.md]
brief: 36
architecture: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-07-1, AC-20261105-07-2, AC-20261105-07-3, AC-20261105-07-4, AC-20261105-07-5, AC-20261105-07-6, AC-20261105-07-7, AC-20261105-07-8, AC-20261105-07-9, AC-20261105-07-10, AC-20261105-07-11, AC-20261105-07-12, AC-20261105-07-13, AC-20261105-07-14, AC-20261105-07-15]
---

# A batch ends clean

## Goal

A fan-out batch starts with a fresh orchestrator, lands only green work on trunk, drains the fixes its own lanes created, discards on request, never turns a successful merge into exit 2, and tells the truth in every line. On the trial this would have saved shop-bltr's five-hour single-session drain, niko-hub's seven minutes of a type error on main plus a hand repair, two "queue drained" lies over running lanes, and two unmeetable evidence criteria.
