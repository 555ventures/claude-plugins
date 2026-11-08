---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: []
depended_on_by: ["specs/20260901/02-run-provenance.md", "specs/20260901/03-unified-build-loop.md"]
brief: 18
build_base: main
diff_base: 980ffd325b1d7710afd520ae2385dedf88d7cb7b
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-01-1, AC-20260901-01-2, AC-20260901-01-3, AC-20260901-01-4, AC-20260901-01-5, AC-20260901-01-6, AC-20260901-01-7, AC-20260901-01-8, AC-20260901-01-9, AC-20260901-01-10, AC-20260901-01-11, AC-20260901-01-12, AC-20260901-01-13, AC-20260901-01-14, AC-20260901-01-15, AC-20260901-01-16, AC-20260901-01-17, AC-20260901-01-18]
---

# Build Driver — the build stage becomes a stepped program; build.md becomes the judgment shell

## Goal

Amended by: ADR-0015 (specs/20260910/08-gate-sees-created-files.md narrows D12's git-write clause — see the ADR's Applies to)

`/spec:build` today is a 161-line markdown procedure with no driver and no state file: it
resumes by inspecting the diff, runs the red-check, the gate, and scope-reconcile by hand, and
hand-appends its own ledger row — the last stage in the per-feature loop whose deterministic
choreography is still performed by an LLM (brief 18, seam 1). This spec gives build what review
got in specs/20260820/07: `spec-build-driver.js` re-derives the build's state from spec
frontmatter + a `<spec>.build/` sidecar + on-disk artifacts on every invocation, executes every
deterministic step itself (admission, wave derivation, gate resolution, env preflight, the
status flip, red-check, the final gate, scope-reconcile, diff counts, the ledger row), and
prints exactly one judgment step at a time (test-author dispatch, red attribution, worker
dispatch per wave, host integration, repair dispatch, the checkpoint commit). `build.md`
shrinks to the judgment shell. Done means: a fixture host can be driven from `hardened` to a
script-written `stage:"build"` ledger row by marks alone, every mark refused with a remedy when
its artifact is missing, and `/spec:build`'s read load stays under the 500-line budget. The
outer loop, run provenance, and the state-gate/doctrine changes are siblings 02 and 03.
