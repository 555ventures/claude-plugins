---
name: gate-thresholds-live-in-roadmap-brief
description: A spec Decision defining a "gate" (clause1/clause2-style pass criteria) can state the derivation formula without stating the literal threshold numbers — check the docs/roadmap/NN brief the Decision cites for the concrete threshold before writing the assertion.
metadata:
  type: feedback
  reviewed: 2026-08-26
---

specs/20260820/05-fleet-evidence-reader.md D6 ("Brief-08 gate pins") defines `hostSpecsCleaned`,
`inWindowAuthored`, `selfRepairAuthored`, and `selfRepairShare` precisely, but never states the
actual pass/fail thresholds for `clause1Met`/`clause2Met` anywhere in the spec body (Decisions,
Contracts, AC text, Assumptions all describe the *shape*, not the *cutoff*). AC-20260820-05-4's
own worked example (`selfRepairShare: 0.4286, clause2Met: false`) is consistent with more than
one threshold value, so it can't be reverse-engineered from the example alone with confidence.

The actual numbers were in `docs/roadmap/17-fleet-evidence-reader.md` (the brief D6 itself
names as its subject — search `docs/roadmap/*.md` for the brief number a "brief-NN gate"
Decision references): "clause 1 (>=5 product passes) is MET; clause 2 (self-repair share <20%)
is not". This is grounding, not a design fork — it's the same status as reading a cited
doctrine section — but it's easy to miss because the spec's own Contracts/Decisions read as
self-contained.

**Why:** without the roadmap brief's literal thresholds, the AC-4 gate08 test's clause1Met/
clause2Met assertions would have been guesses, or would have required a `blocked` return for
what's actually a locked, citable number one grep away.

**How to apply:** when a Decision says "brief-NN gate" or "per brief NN" and gives a formula but
not a cutoff number, grep `docs/roadmap/` for that brief number before treating it as an
unlocked fork. See [[stale-dispatch-premise-concurrent-session]] for the sibling lesson about
re-deriving state rather than trusting a dispatch prompt's narrative in isolation.
