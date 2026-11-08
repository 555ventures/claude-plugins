---
date: 2026-09-01
status: done
tier: critical
area: build-integrity
design: false
breaking: false
depends_on: ["specs/20260901/01-build-driver.md", "specs/20260901/02-run-provenance.md"]
depended_on_by: []
brief: 18
build_base: 7057642892ac238ec746904aff23b94b44bba42d
diff_base: 7057642892ac238ec746904aff23b94b44bba42d
open_markers: 0
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20260901-03-1, AC-20260901-03-2, AC-20260901-03-3, AC-20260901-03-4, AC-20260901-03-5, AC-20260901-03-6, AC-20260901-03-7, AC-20260901-03-8, AC-20260901-03-9, AC-20260901-03-10]
---

# Unified Build Loop — `/spec:build` carries a spec from hardened to done

## Goal

After `/spec:plan`, one command finishes a feature. `/spec:build <spec>` derives the next
stage from disk with the routing `spec-status.js` already owns, runs design (unchanged
internals) when due, then the build driver, then the review driver, and stops only at a human
gate, a checkpoint, or `done`. One checkpoint is mandatory and enforced: the session that
dispositions review findings must have no memory of the build's trade-offs, so the review
driver, when reached through the loop, refuses DISPOSITIONS until the session id in the stamp
has changed (a `/clear` and re-run). The pre-merge stop is the existing step-out of the
worktree — never a forced clear (JJ ruling 2026-09-01). The doctrine sentence that gave each
transition one command gives it one driver state instead (wording approved 2026-09-01), the
state gate admits `/spec:build` on `done`, the README loop becomes plan → build, and the fleet
reader answers the brief's kill condition with escapes-per-CLEAN split by `via`. Done means: a
fixture host's review driver invoked `--via loop` parks at CHECKPOINT with the same session id
and admits DISPOSITIONS with a new one; the gate admits `/spec:build` on a done spec; the
fleet query prints two numbers.
