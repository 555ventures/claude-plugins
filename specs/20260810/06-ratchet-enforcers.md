---
date: 2026-08-10
status: done
risk: T3
open_markers: 0
area: spec-enforce
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-06-1, AC-20260810-06-2, AC-20260810-06-3, AC-20260810-06-4, AC-20260810-06-5]
---

# Ratchet-mode architecture enforcers: `duplication` + `cycle` categories

## Goal

`/spec:enforce`'s category taxonomy grows two architecture-smell categories — `duplication`
and `cycle` — enforced as **ratchets**: a per-host baseline snapshot quarantines existing
violations at wiring time, and the gate fails only on violations not in the baseline. This
gives every host continuous, deterministic control over the two research-backed AI-signature
smell classes without ever handing the user a red gate over legacy debt. Done means: the
taxonomy is byte-identical across its four homes and pinned by a test (it is unpinned today),
`enforce.md` carries the ratchet semantics, and `wf-enforce` accepts the new categories as
research cells.
