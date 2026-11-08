---
date: 2026-11-07
status: done
area: run
depends_on: []
brief: 39
architecture: true
breaking: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261107-02-1, AC-20261107-02-2, AC-20261107-02-3, AC-20261107-02-4, AC-20261107-02-5, AC-20261107-02-6, AC-20261107-02-7, AC-20261107-02-8, AC-20261107-02-9]
---

# Run and fanout match the v8 design

## Goal

run.js, fanout.js, state.js and host.js are under their caps with every behaviour above kept. A run lands only a tree it has gated, asks only product questions, and prints what it decided. /spec:fix and fanout's fix lanes behave as today for the user.
