---
date: 2026-08-14
status: done
diff_base: 009b5addecf6129b7ec892820a80e64cf52cfb15
open_markers: 0
risk: T3
area: review-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260814/02-doctor-mergeback-fidelity-mechanics.md", "specs/20260814/03-suite-baseline.md"]
brief: 06
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260814-01-1, AC-20260814-01-2, AC-20260814-01-3, AC-20260814-01-4, AC-20260814-01-5, AC-20260814-01-6, AC-20260814-01-7, AC-20260814-01-8, AC-20260814-01-9, AC-20260814-01-10]
---

# ac-matrix.js — mechanize review's AC coverage + skip reconciliation legs

## Goal

The review verdict currently depends on two legs the model hand-executes from prose —
review.md Phase 0 step 5 (AC-line lint + AC↔test coverage matrix + `[oracle:]` handling) and
step 6 (skipped-test reconciliation + `[env:]` handling) — then feeds to `verdict.js` as if
they were mechanical. A hand-executed leg drifts per session and per model (the strict
downgrade shared.md § Rule Enforcement itself names). This spec extracts one sole-derivation
script, `spec/scripts/ac-matrix.js`, behind a `spec-paths` key; review.md's steps 5–6 shrink
to invocation lines; the manifest rows `verdict.js` reads become script output with
byte-identical observed formats. Done = the script's exec pins run green, the retagged
doctrine/test pins run green, and `verdict.js` derives identical words from script-written
manifests.
