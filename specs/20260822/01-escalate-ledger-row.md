---
date: 2026-08-22
status: done
diff_base: 909bd30a126fbe9fab7632909fcc0b36fabeacdf
open_markers: 0
spiked: 2026-08-22
tier: critical           # edits verdict.js derive()/arg surface — named on Risk Tiers ("sole derivation of the review/release verdict word; never a second place that computes or asserts CLEAN"). The driver edit alone would be standard (spec 04 precedent), but the verdict edit governs.
area: review-verification
design: false
breaking: false
depends_on: ["specs/20260821/04-stopped-row-durability.md", "specs/20260821/03-cross-spec-skip-mapping.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260822-01-1, AC-20260822-01-2, AC-20260822-01-3, AC-20260822-01-4, AC-20260822-01-5, AC-20260822-01-6, AC-20260822-01-7, AC-20260822-01-8, AC-20260822-01-9, AC-20260822-01-10, AC-20260822-01-11, AC-20260822-01-12, AC-20260822-01-13]
---

# Escalate ledger row — a capped review is never invisible

## Goal

A review that burns its fix loop to the cap (2 iterations) and is then abandoned currently
writes **zero** ledger rows — three leg iterations and three reviewer dispatches leave no
trace, because the driver's only two append points are the hard-stop (`GATE_RED`) and the
CLEAN close, and the ESCALATE refusal reaches neither. The gap is self-concealing: it cannot
be counted from the ledger because it writes nothing. Done means: the cap refusal itself
appends one honest, durable ledger row (reusing spec 04's stopped-ledger path in worktrees),
the escalation fact rides as a typed row field minted by `verdict.js` — never a new verdict
word — and the ESCALATE step text finally names its exits. The doctrine invariant this
closes: "a stopped attempt is never invisible" (core doctrine), extended to capped attempts.
