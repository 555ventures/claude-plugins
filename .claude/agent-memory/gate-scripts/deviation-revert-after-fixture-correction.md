---
name: deviation-revert-after-fixture-correction
description: A recorded deviations-sidecar departure (extra internal-only field, or an omitted step) can become invalid once the AC fixture it cited gets corrected — revert cleanly rather than re-justifying
metadata:
  reviewed: 2026-09-03
  type: feedback
---

Two departures recorded in specs/20260903/03-pipeline-queue-mechanics.deviations.md
(spec-status.js's `__gateTargetPending` sort tier + `queueGateTargetSpecs` Set, and
spec-queue.js `list` skipping the append step) were both justified by citing a specific
AC fixture's literal wording as over-constraining the spec's stated Behavior/Decision. Once
the test fixtures were corrected to match the spec's actual Decisions, both deviations became
simply wrong and were reverted outright — no Decision ever authorized the extra sort key, and
D8 does require `list` to virtually reconcile with the append step.

**Why:** a deviation entry pinned to "the AC fixture forced X, contradicting the spec" is only
as durable as that fixture. When the fixture is fixed, re-check whether the underlying
code still needs to exist at all — don't assume the deviation is now merely "stale wording."

**How to apply:** when asked to apply a `fix` disposition that reverts a previously-recorded
deviation, (1) delete the deviation entry, (2) remove the code/comment it justified entirely
(not just re-word it) if the spec's Behavior/Decisions never asked for it, and (3) leave the
deviations sidecar present with only its `# Deviations — <slug>` header if nothing remains.
