---
date: 2026-08-20
status: done
open_markers: 0
tier: critical
area: review-verification
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260820/04-entrypoint-conformance.md"]
brief: n/a
diff_base: b098cd9eb5febc1798c8249f8be9f3a78b8b431c
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-03-1, AC-20260820-03-2, AC-20260820-03-3, AC-20260820-03-4, AC-20260820-03-5, AC-20260820-03-6, AC-20260820-03-7, AC-20260820-03-8, AC-20260820-03-9, AC-20260820-03-10, AC-20260820-03-11, AC-20260820-03-12]
---

# Review Observation Truth — typed unavailability, env preflight in review, promise-sweep applicability

## Goal

Close the three observation-integrity defects the Salon OS field report (2026-08-20)
demonstrated in this plugin's review path: an unparseable skip observation silently decays
to `testsSkipped.total: 0` and a CLEAN verdict (violating UPWELL-20260716-02's
never-assumed-zero rule the emitter already honors); `env-preflight.js` is authored and
wired into build/design/doctor but absent from the review path (3rd recurrence of the
authored-not-activated class); and `promise-sweep.js` applies retroactively to specs locked
before the carrier convention existed (52 noise findings at Salon OS, which trained
bulk-waiving — escape rv_8b7c4e2e9ec0 shipped inside a 17/17-waive review). Done means:
silence about skips is a visible finding, review refuses to start on an unprovisioned
environment, pre-convention specs produce a typed `not-applicable` row instead of findings,
and a new executed producer→consumer pair test pins the legs→verdict grammar end to end.
