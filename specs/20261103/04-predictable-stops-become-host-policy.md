---
date: 2026-11-03
status: done
tier: critical           # spec/templates/grounding-contract.md gains the policy.stops block (§ Risk Tiers: hash-stamped into every host)
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 973d0c5ec371344bfbea884acf54562c73fe1c25
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-04-1, AC-20261103-04-2, AC-20261103-04-3, AC-20261103-04-4, AC-20261103-04-5, AC-20261103-04-6, AC-20261103-04-7, AC-20261103-04-8, AC-20261103-04-9, AC-20261103-04-10, AC-20261103-04-11, AC-20261103-04-12, AC-20261103-04-13, AC-20261103-04-14, AC-20261103-04-15, AC-20261103-04-16, AC-20261103-04-17, AC-20261103-04-18, AC-20261103-04-19, AC-20261103-04-20, AC-20261103-04-21, AC-20261103-04-22]
---

# Predictable stops become host policy

## Goal

The pipeline stops asking questions whose answer is the same every run. Today `/spec:fanout` opens with a
three-question standing sheet that dies with `spec-fanout.json` at `--mark reported`, so every fan-out
re-asks it; solo `/spec:run` asks the same stops at every STOPPED, ESCALATE and critical-tier RED_FINDINGS;
`/spec:fix` asks before committing a dirty tree that `/git:commit` already confirms twice. After this spec a
`policy.stops` block in the host config, written with safe defaults by `/spec:init` and shared by solo runs
and lanes, answers the predictable stops; each auto-pick prints one vetoable `📌 Auto-picked` line and is
listed in the run report; a stop keeps asking only where its policy value is `ask` (the default for
deleting a prototype) or where the answer genuinely depends on the user (waive dispositions, worker
`blocked` forks, `/spec:fix` decisions). Done means a fan-out on a default host reaches DISPATCH with no
question, a solo review on a default host repairs a red leg without asking, and every retired ask has a
policy value that brings it back.

Prior art: Renovate's per-rule `automerge`, Dependabot auto-merge with branch protection as the veto,
merge-queue policy kept in repo config instead of a per-run prompt.
