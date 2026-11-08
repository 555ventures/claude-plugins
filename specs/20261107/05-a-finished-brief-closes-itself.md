---
date: 2026-11-07
status: done
area: queue
depends_on: []
brief: n/a
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261107-05-1, AC-20261107-05-2, AC-20261107-05-3, AC-20261107-05-4, AC-20261107-05-5, AC-20261107-05-6, AC-20261107-05-7]
---

# A finished brief closes itself

## Goal

Merging a brief's last spec closes the brief when nothing outside specs is left, so a finished batch reports `nothing needs you`. A brief with an open step stays queued, says how many steps are open, and closes when the user says so, as it does today.
