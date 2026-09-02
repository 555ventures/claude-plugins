---
name: checkpoint-outcome-derivation-in-shared-arg-builder
description: Deriving a per-call verdict.js flag (--checkpoint) inside the driver's one shared viaModelArgs() arg-builder rather than at each of the three call sites
metadata:
  type: project
---

specs/20260901/05-checkpoint-fail-closed.md D1-D3 (2026-09-01, brief 18a): spec-review-driver.js's
three verdict.js passes (hard-stop, escalate, close) share one arg-builder, `viaModelArgs()`,
called fresh at each site. When a spec's A7 pins "insertion point decided here — the worker
returns blocked if the assumption is false," the safe move is to derive the new flag's value
inside that shared builder (a pure function of live `marks` state, e.g.
`checkpointOutcome()` reading `marks.checkpointOverride`/`checkpointCleared`/`checkpoint`), not
to thread a new parameter through each of the three call sites — this way a hard-stop row written
before the checkpoint exists (marks.checkpoint undefined) and a close row written after
dispositions clears it both derive correctly for free, with zero call-site changes.

**Why:** matches this repo's existing pattern (--via/--model already work this way) and avoids
touching three otherwise-unrelated functions (`runHardStopVerdict`, `writeEscalateRow`,
`doCloseWork`) for one derived field.

**How to apply:** when a spec says "the driver derives X inside the shared arg-builder" for a
loop-only flag, add a small pure derivation function next to the state predicate it reads
(e.g. beside `checkpointStillParked()`), and splice its result into the shared builder's
returned array — return `null`/omit when the flag doesn't apply (e.g. via !== 'loop'), never an
empty-string sentinel.
