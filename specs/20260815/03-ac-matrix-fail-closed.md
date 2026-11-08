---
date: 2026-08-15
status: done
diff_base: 96e4c2e1e1eb1b52da371cdaa74a31edf84e6ac6
open_markers: 0
risk: T2
area: review-integrity
design: false
breaking: false
depends_on: ["specs/20260815/02-at-risk-pins.md"]
depended_on_by: ["specs/20260815/04-runtime-shutdown-leg.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260815-03-1, AC-20260815-03-2, AC-20260815-03-3, AC-20260815-03-4, AC-20260815-03-5, AC-20260815-03-6, AC-20260815-03-7, AC-20260815-03-8, AC-20260815-03-9]
---

# ac-matrix fail-closed — the coverage denominator and the owning-spec sanction

## Goal

Two holes in `spec/scripts/ac-matrix.js`, both found by this repo's own review of
20260814/04 and pinned red at intake (JJ-20260815-01, JJ-20260815-02; two defects bundled
for economics, not one class). (1) A malformed AC bullet is dropped from the coverage
denominator, so the durable manifest row records `uncovered=0` while an unswept AC exists —
waive the one `malformed-ac` finding and the coverage claim is permanently false. (2) The
skipped-test reconciliation resolves `[env:]` only from the spec under review, so a
declaration living in the AC's *owning* spec is unreachable and a correctly-declared
env-gated suite reads as an unsanctioned HARD finding on every review touching that area —
the cry-wolf path back into this leg's founding incident. Done = unparseable counts as
uncovered in both drift modes, the owning-spec lookup resolves sanctions with fail-closed
edges, both intake pins run green, observed grammars are byte-unchanged, and both INTAKE
rows are stamped fixed.
