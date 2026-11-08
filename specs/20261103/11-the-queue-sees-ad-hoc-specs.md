---
date: 2026-11-03
status: done
tier: critical           # spec/scripts/verdict.js changes how --briefs reaches the release ledger row (§ Risk Tiers: verdict.js is a trigger)
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
diff_base: 0f1e8700fb0e365ea07e144caec143e22864a59d
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-11-1, AC-20261103-11-2, AC-20261103-11-3, AC-20261103-11-4, AC-20261103-11-5, AC-20261103-11-6, AC-20261103-11-7, AC-20261103-11-8]
---

# The queue sees ad-hoc specs

## Goal

Two ad-hoc gaps close. The session queue stops reporting "queue empty — nothing left undone" and
"nothing pending" while hardened or implementing ad-hoc (`brief: n/a`) specs are open: the queue's
reconcile seeds every open ad-hoc spec as a `spec` item, in specs/ file order after the briefs, so
`spec-queue next` and `list` name the open work. And a release's `--briefs` stops dropping a
letter-suffixed brief id such as `04a` silently from the ledger row: `NN` and `NNa` are both
recorded, and any other token is a usage error naming it. Done means a host with two hardened
ad-hoc specs and no briefs gets a non-empty queue on the first `spec-queue next`, and
`--briefs 04,04a` ledgers both ids.
