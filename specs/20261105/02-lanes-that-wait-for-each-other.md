---
date: 2026-11-05
status: done
area: fanout
depends_on: []
brief: 34
architecture: false
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261105-02-1, AC-20261105-02-2, AC-20261105-02-3, AC-20261105-02-4, AC-20261105-02-5, AC-20261105-02-6, AC-20261105-02-7, AC-20261105-02-8, AC-20261105-02-9, AC-20261105-02-10, AC-20261105-02-11, AC-20261105-02-12, AC-20261105-02-13, AC-20261105-02-14, AC-20261105-02-15, AC-20261105-02-16]
---

# Lanes that wait for each other

## Goal

A fan-out never builds a spec beside or ahead of a spec it depends on, a lane that stops for another lane keeps its work and resumes on the trunk that has it, a finished lane lands while the others are still building, a conflict costs one dispatch, and a lane that cannot honour a Decision asks instead of rewriting the spec. On niko-hub's batch 1 this would have run lane 4 alone, held the three dependents with a printed reason, picked them next with their worktrees rebased, and saved roughly 45 minutes of builder time plus two dismissals.
