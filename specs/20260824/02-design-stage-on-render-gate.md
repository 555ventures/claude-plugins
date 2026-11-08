---
date: 2026-08-24
status: done
tier: critical           # removes spec-paths keys (key-set edit — critical trigger per .claude/rules/spec-pipeline.md § Risk Tiers, precedent specs/20260823/01) and retires spec-design-driver.js, the state machine behind a pipeline stage
area: design-stage
design: false
diff_base: 592e4728e4ae2251ffb144e62f7c719cbe001275
breaking: false
depends_on: [specs/20260824/01-render-gate.md]
depended_on_by: [specs/20260824/03-mock-states-hygiene.md]
brief: 08
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260824-02-1, AC-20260824-02-2, AC-20260824-02-3, AC-20260824-02-4, AC-20260824-02-5, AC-20260824-02-6]
---

# Design stage on the render gate — thin `/spec:design`, feed retired

## Goal

Rebuild `/spec:design`'s body on the render gate: transcription workers (one warm Sonnet per
surface, the mock HTML in context, the component manifest as canon) behind the host gate and
the render gate, your Storybook look kept as a blocking step after the gates, one reconcile,
the `designed:` stamp. The state-machine driver, the `wf-design` workflow, the skeleton binding
map and its checker, the `.design/` sidecar's driver-side lifecycle, the Haiku match pass, the
Fable retainer, the vision consult, and the `ITERATE` catalog loop go with it. Done means: a
fresh session runs `/spec:design` on a hardened UI spec in a host that declares `design.render`
and reaches `designed:` through gates it can observe, with every step re-derivable from disk.
