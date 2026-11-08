---
date: 2026-08-20
status: done
open_markers: 0
diff_base: cf10ce87c8c5f0a16b04c060130dd1da04beb38f
tier: standard
area: consistency-guards
design: false
breaking: false
depends_on: ["specs/20260820/03-review-observation-truth.md"]
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260820-04-1, AC-20260820-04-2, AC-20260820-04-3, AC-20260820-04-4, AC-20260820-04-5, AC-20260820-04-6, AC-20260820-04-7]
---

# Entry-Point Conformance — every authored check declares who calls it, diffed against reality

## Goal

Close the "authored but never activated" class structurally (3rd recurrence — env-preflight
absent from review was the third instance; core § Incident Policy earns a deterministic
guard). Every executable script in `spec/scripts/` and `spec/workflows/` gets a manifest
entry declaring its entry points — the files that invoke it — and a conformance test diffs
those declarations against the repo's actual call sites in both directions on every
`npm test`. Done means: a script nothing invokes is a red test, a declared call site that
no longer invokes is a red test, an invocation the manifest doesn't know is a red test, and
a `spec-paths` key resolving to a deleted file is a red test — so the class fails loudly at
the diff that introduces it instead of surfacing as a host field report.
