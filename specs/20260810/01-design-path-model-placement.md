---
date: 2026-08-10
status: done
open_markers: 0
risk: T2
area: design
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 02
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260810-01-1, AC-20260810-01-2, AC-20260810-01-3, AC-20260810-01-4, AC-20260810-01-5, AC-20260810-01-6, AC-20260810-01-7, AC-20260810-01-8, AC-20260810-01-9, AC-20260810-01-10]
---

# Design-path model placement: registry-weighted canon, registry-grounded workers, exit fidelity review, atlas sweep contract

## Goal

Land the genesis-design/design-stage half of the 2026-08-10 model-placement ruling (the
sketch half shipped in v6.48.0). Four capabilities: (1) genesis records the product's
**component vocabulary** — the building blocks it commits to, each with role and usage
boundaries — into the existing machine-readable registry `design/components.json`, kept
honest by a new deterministic shape check; (2) `wf-design` workers are **grounded in that
registry** the same way tokens ground them today, so they bind real building blocks instead
of inventing lookalikes; (3) `/spec:design` gets **one unified post-gate fidelity review**
(render vs ratified mock, judged by the expensive seat), replacing today's two overlapping
look-checks; (4) the `/spec:atlas` gap sweep **adopts the sequential-dispatch contract**
the sketch ruling established, recorded once in shared doctrine. Done = all four are
doctrine + code + pinned tests, plugin bumped.
