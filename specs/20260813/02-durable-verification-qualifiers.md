---
date: 2026-08-13
status: done
diff_base: 21fded1769ec2050b66c36428cdd1a51a0e287ad
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260813/01-review-self-report-integrity.md", "specs/20260813/03-gate-script-mechanics.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260813-02-1, AC-20260813-02-2, AC-20260813-02-3, AC-20260813-02-4, AC-20260813-02-5, AC-20260813-02-6, AC-20260813-02-7, AC-20260813-02-8]
---

# Durable Verification Qualifiers

## Goal

Qualifiers that today live only in transient console output become durable, machine-readable
facts in the artifacts that outlive the run: the review ledger row's `testsSkipped` splits
sanctioned (`[env:]`-declared) from unsanctioned skips; a release whose required CI leg
structurally never delivered a verdict records the distinct milestone word
`CLEAN-with-qualifier` instead of an unqualified `CLEAN` beside `ci:"unavailable"`; and a spec
can declare a non-test oracle for an AC (`[oracle: <leg>]`, sibling of `[env:]`) so the
coverage matrix stops reporting a legitimately gate-verified AC identically to one nobody
checked. Done = the three qualifier pins run green, with the derivation-pin suite updated to
the new shapes and every unrelated derivation untouched.
