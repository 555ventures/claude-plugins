---
date: 2026-10-29
status: done
build_base: main
tier: standard           # no rules § Risk Tiers surface is edited: merge-back.sh is read, not changed (its inspect already prints RECOMMEND); the two drivers, the command docs and a new lib are not listed triggers and none is boot-path code
area: pipeline
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-31
open_markers: 0
diff_base: ab1aa463555f948aad7f957061b69ad5cb0fb716
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-07-1, AC-20261029-07-2, AC-20261029-07-3, AC-20261029-07-4, AC-20261029-07-5, AC-20261029-07-6, AC-20261029-07-7, AC-20261029-07-8, AC-20261029-07-9, AC-20261029-07-10, AC-20261029-07-11, AC-20261029-07-12, AC-20261029-07-13, AC-20261029-07-14]
---

# Every dead stop becomes a question with a default

## Goal

Twelve places where the build, review, fix, release or git commands today print an error and end
the turn become one `AskUserQuestion` each, with a recommended default and the consequence of
every option, so the owner answers in ten seconds instead of reconstructing the remedy from a
message. Two contradictions are settled: merge strategy is derived everywhere (the git plugin
stops asking), and `/spec:fix` can no longer waive its own reviewer's findings. Done means no
command in the File Plan ends a turn with a bare "STOP" where a choice exists.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 2.3 (RUN-01, BLD-01,
BLD-02, BLD-06, REV-01, REV-04, REV-05, REV-06, FIX-02), Part 2.4 (REL-05, REL-06, Q-01, GIT-03,
GIT-05, GIT-06), Part 3 #20 and Part 4 #3.
