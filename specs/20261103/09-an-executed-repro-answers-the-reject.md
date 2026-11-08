---
date: 2026-11-03
status: done
tier: critical           # spec/templates/grounding-contract.md gains a policy.stops key (§ Risk Tiers: hash-stamped into every host)
area: pipeline
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 4e19cf5b20dabd3019d013a40435546a0426ac27
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-09-1, AC-20261103-09-2, AC-20261103-09-3, AC-20261103-09-4, AC-20261103-09-5, AC-20261103-09-6, AC-20261103-09-7, AC-20261103-09-8, AC-20261103-09-9, AC-20261103-09-10, AC-20261103-09-11, AC-20261103-09-12]
---

# An executed repro answers the reject

## Goal

The review stops asking the user to confirm a disposer `reject` the disposer already proved. Today every
`waive` and every `reject` recommendation goes to the user, even when the disposer's reason is a repro it
ran whose output contradicts the finding — the one disposition that is evidence, not judgment. After this
spec the disposer's return carries a `repro` field (the command it ran and what it observed) on a `reject`
that rests on execution; a host's `policy.stops.rejectWithEvidence` (`accept` by default, `ask` to bring the
question back) lets `--mark dispositions` accept such a reject itself, printing one vetoable
`📌 Auto-picked` line and recording the pick in the sidecar exactly as spec 20261103/04's stops do. A
`waive`, and a `reject` with no repro (a miscitation argued from quotes), still go to the user — only the
user waives. Done means a default host's review with one repro-backed reject and no waive reaches FIX or
CLOSE with no question, in-session and in a lane, and the fan-out's `--ask rejectWithEvidence` relays it for
one run.
