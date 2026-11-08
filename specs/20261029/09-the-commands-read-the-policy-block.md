---
date: 2026-10-31
status: done
build_base: main
tier: standard           # readers only: driver step text, doctrine sentences; no contract, hook, merge-back or verdict edit
area: pipeline
breaking: false
depends_on: [specs/20261029/08-the-policy-round-at-init.md]
brief: n/a
open_markers: 0
diff_base: e2e79bed16d8104222addaddbf773a17e00011a9
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261029-09-1, AC-20261029-09-2, AC-20261029-09-3, AC-20261029-09-4, AC-20261029-09-5, AC-20261029-09-6, AC-20261029-09-7, AC-20261029-09-8, AC-20261029-09-9]
---

# The commands read the policy block

## Goal

Every key of the `policy` block spec 08 lands gets its reader: `/spec:run` honours
`worktreePerSpec`, the Direct lane honours `directLaneToMain`, the review MERGE step and
`/git:merge` honour `mergeStrategy`, the review CLOSE step and `/spec:doctor` check 20 honour
`testExpiry`, the plan lock commit tolerates an ignored ledger (`ledgerCommitted`), the
wireframe command honours `reviewService`, and every driver dispatch line prints the model and
effort `policy.models` names for that seat. A host with the default block sees today's output
on every line except one: the `/spec:connect` hint is no longer printed unless the host opted
into the hosted service. Done means each reader has a test that observes the changed output
with the key set and the default output without it.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 9, 10, 12,
18, 21 (the reader half). Sibling: specs/20261029/08-the-policy-round-at-init.md.
