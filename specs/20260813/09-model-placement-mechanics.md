---
date: 2026-08-13
status: done
diff_base: 4b4f2c16bcb80a73ea1d814b93ebee1392fec46c
open_markers: 0
risk: T3
area: model-placement
design: false
breaking: false
depends_on: ["specs/20260813/08-question-contract.md"]
depended_on_by: ["specs/20260813/10-host-capabilities.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-09-1, AC-20260813-09-2, AC-20260813-09-3, AC-20260813-09-4, AC-20260813-09-5, AC-20260813-09-6, AC-20260813-09-7, AC-20260813-09-8, AC-20260813-09-9, AC-20260813-09-10]
---

# Model placement mechanics — Fable seat with fallback, explicit effort, underivable-fork consults

## Goal

Give "consult Fable more" its mechanical seat instead of a manual ask: the panel aggregator
(the workflow layer's highest-judgment seat) moves to Fable behind a dispatch-level model
fallback — with every doctrine site that asserts the seat is Opus updated in the same spec —
every workflow seat declares model AND effort explicitly under a stated rule, the
"uncorrelated model" doctrine claim is narrowed to what is true at both places it appears,
and forks with no derivable recommended default trigger a Fable retainer consult recorded in
a ledger that /spec:audit mines. JJ ratified the three rulings 2026-08-13 (Fable-first
aggregator with Opus fallback; wording-narrowing over reviewer-tier change; wave shape).
