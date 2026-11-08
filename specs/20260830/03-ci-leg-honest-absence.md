---
date: 2026-08-30
status: done
diff_base: 1c0de02b6da33e35a6efe117157a1b0f8bc8526c
tier: critical
area: review-legs
design: false
breaking: false
depends_on: ["specs/20260830/02-close-gate-rerun.md"]
depended_on_by: []
# brief: n/a — ad-hoc hardening from a salon-os host escape report (2026-08-30)
# tier rationale: review-legs.js and verdict-feeding evidence rows are named critical-tier
# surfaces in this host's pipeline rules § Risk Tiers.
# depends_on is File-Plan ordering only (both specs edit review-legs.js and bump
# plugin.json), not a logical dependency.
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260830-03-1, AC-20260830-03-2, AC-20260830-03-3, AC-20260830-03-4, AC-20260830-03-5, AC-20260830-03-6]
---

# CI leg honest absence — an unpushed HEAD is not "no CI"

## Goal

The review and release `ci` legs query GitHub per-SHA; a commit never pushed returns an
empty run list, which today maps to `unavailable: "no-adapter"` — indistinguishable from a
repo with no CI at all — and the leg reports green while the branch on origin may have been
red for days (salon-os 2026-08-30: origin red four days, local main 23 commits ahead, leg
CLEAN). Done means: that state is labeled honestly (`sha-unseen`, carrying the origin
branch's actual latest conclusion) and surfaced as a warning in the review/release report —
while never blocking the verdict (JJ ruling 2026-08-30: local work may be exactly what
fixes the red; blocking can be layered on later).
