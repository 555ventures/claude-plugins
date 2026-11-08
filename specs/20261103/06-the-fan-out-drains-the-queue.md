---
date: 2026-11-03
status: done
tier: critical           # spec/scripts/spec-status.js changes what --next --json / --lanes --json derive; spec/templates/grounding-contract.md gains policy.fanout (§ Risk Tiers: both are triggers)
area: pipeline
breaking: false
depends_on: [specs/20261103/04-predictable-stops-become-host-policy.md]
brief: n/a
open_markers: 0
diff_base: 7558f3425a15a62b80bd4d5fa97e6eb87e85ceb1
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-06-1, AC-20261103-06-2, AC-20261103-06-3, AC-20261103-06-4, AC-20261103-06-5, AC-20261103-06-6, AC-20261103-06-7, AC-20261103-06-8, AC-20261103-06-9, AC-20261103-06-10, AC-20261103-06-11, AC-20261103-06-12, AC-20261103-06-13, AC-20261103-06-14, AC-20261103-06-15, AC-20261103-06-16, AC-20261103-06-17, AC-20261103-06-18, AC-20261103-06-19, AC-20261103-06-20, AC-20261103-06-21, AC-20261103-06-22, AC-20261103-06-23, AC-20261103-06-24, AC-20261103-06-25]
---

# The fan-out drains the queue

## Goal

`/spec:fanout` becomes automation in batches: at invocation the driver derives the batch — the
queue's startable specs in order up to a derived boundary — prints it as one vetoable `📌` line,
and from then on re-queries after every landing: serialized members are dispatched when the lane
they waited on has merged, fixes born of a member lane join the same batch, and REPORT prints only
when the batch is done; the next bare run starts the next batch. Two root causes go: `spec-status.js`
never marks a briefless spec parallel-ok (it compares briefs only), so a repo of ad-hoc specs never
has a second lane; and the driver tables one wave and reports when it empties. Done means a queue of
briefless, hardened specs is run batch after batch with no `/spec:run` paste and no question —
in parallel where their File Plans are disjoint outside the ceremony paths, in series where they
overlap — stopping only before a spec that rewrites the pipeline itself, a critical spec sharing a
Risk Tiers file with an unmerged lane, a dependency the batch cannot meet, or a planning item.

Prior art: bors, GitHub merge queue and Prow tide re-form the queue after each landing, batch size is
config and a human intervenes on red only; Buildkite dynamic pipeline upload lets runtime-born steps
join the same build; the bootstrap rule — never upgrade the runner inside the job — is what
`selfSurfaces` encodes.
