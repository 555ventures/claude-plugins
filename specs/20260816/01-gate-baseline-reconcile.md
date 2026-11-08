---
date: 2026-08-16
status: done
diff_base: 9006f241ef812af5b0a16ec3a48ab684e62121e1
open_markers: 0
risk: T3                 # touches verdict.js and suite-baseline.js (sole-derivation surfaces) + the gate-loop fragment (codegen seam)
area: spec-pipeline
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260816/02-sanctioned-red-closure.md", "specs/20260817/02-preimage-concurrent-sanction.md"]
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260816-01-1, AC-20260816-01-2, AC-20260816-01-3, AC-20260816-01-4, AC-20260816-01-5, AC-20260816-01-6, AC-20260816-01-7, AC-20260816-01-8, AC-20260816-01-9, AC-20260816-01-10, AC-20260816-01-11, AC-20260816-01-12, AC-20260816-01-13, AC-20260816-01-14, AC-20260816-01-15, AC-20260816-01-16, AC-20260816-01-17]
---

# Gate/baseline reconciliation — sanctioned reds subtracted deterministically

## Goal

The scoped gate (`gateCommand` with `{testDirs}` resolved) exits red whenever a spec's File
Plan pulls in test files carrying the repo's sanctioned always-red intake pins — 21 of 22
baseline pins red-gated the 2026-08-15 review of specs/20260815/01 for reasons unrelated to
the spec, and the session overrode the red by hand (the third recurrence of the class; see
also the 20260813 build wave-merge incident). Done means: a gate run whose only failures are
names in `.claude/suite-baseline.json` exits 0 **by derivation** — the reconciliation is
computed by the one script that already owns failing-set comparison, at every gate site
(review gate leg, build initial/final gates, wf-build/wf-design in-workflow wave gates) —
and a session never again decides whether a red gate "really" failed.
