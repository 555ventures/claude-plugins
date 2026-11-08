---
date: 2026-11-03
status: done
tier: standard           # per ADR-0039 D3 the tier is a property of files touched: the spec-status.js and grounding-contract.md rows are § Risk Tiers surfaces, so every AC carries a literal example; the spec as a whole is standard
area: fanout
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 15a0c61480e37b6a7c817471c055640e8bedb8b8
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-15-1, AC-20261103-15-2, AC-20261103-15-3, AC-20261103-15-4, AC-20261103-15-5, AC-20261103-15-6, AC-20261103-15-7, AC-20261103-15-8, AC-20261103-15-9, AC-20261103-15-10, AC-20261103-15-18, AC-20261103-15-11, AC-20261103-15-12, AC-20261103-15-13, AC-20261103-15-14, AC-20261103-15-15, AC-20261103-15-16, AC-20261103-15-17]
---

# Shared files land by rebase

## Goal

Shared files alone no longer serialize fan-out lanes. Today every briefless pair whose File Plans share one
path is held `waiting: File Plan overlap`, a spec touching a pipeline self-surface runs alone, and a critical
spec sharing a § Risk Tiers path ends the batch — in this repo every spec touches a central script, so five
hardened specs degrade to one lane at a time. After this spec the fan-out predicts nothing: every startable
spec is dispatched in parallel up to the four-lane cap, and the overlap is resolved where merge queues resolve
it — at landing. The MERGE step rebases the lane onto main and fast-forwards; a textual conflict sends the lane
back to its own worker to resolve by intent and return; the host gate runs on main after every landing as
today, and only a conflict the worker cannot resolve stops the lane. The only holds left are the ones a brief
declares: a shared brief and a `depends on` path. Done means: five hardened briefless specs that all name
`spec-status.js` and `fanout-driver.js` dispatch four lanes at once with the fifth planned and none waiting;
`spec-status.js` serializes nothing on File Plan overlap; `policy.fanout` and both batch boundaries are gone;
and a lane whose branch conflicts with a moved main is handed back to its worker with the rebase in progress.
