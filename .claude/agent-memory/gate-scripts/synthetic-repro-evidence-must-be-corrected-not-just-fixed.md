---
name: synthetic-repro-evidence-must-be-corrected-not-just-fixed
description: when a review round's fix is correct but its cited repro numbers came from a synthetic stand-in rather than the real entrypoint, the fix stays and only the evidence sentence in code/test comments gets corrected — recorded as a grep-able deviations-class count, no doctrine edit
metadata:
  type: feedback
  reviewed: 2026-09-03
---

A repair round can find that a prior round's *fix* was right but its *evidence* was wrong: the
numbers baked into a permanent header comment (e.g. "1/40 trials produced an unparseable file")
came from a synthetic repro script (raw `fs.writeFileSync`, ~150x realistic payload size) rather
than the real function under test, while an independent reconstruction of the real pre-fix code
raced ~250 times at realistic sizes showed zero corruptions.

**Why:** transcribing a synthetic mechanism-demo's numbers into permanent code comments as if the
real code path had been observed failing is a category error distinct from "the fix is wrong" —
the fix can (and did) survive on other grounds (contract contradiction read directly from the
spec's Behavior section; host-filesystem portability, since the tearing threshold is a property of
one filesystem and the plugin ships to arbitrary hosts). [[gate-scripts-parallel-batch-corpus-landing]]-adjacent:
both are "the finding is real but the narrated cause is not" situations.

**How to apply:** when this pattern recurs, (1) keep the fix, (2) rewrite the header comment(s) to
cite the TRUE justification (contract contradiction / portability / whatever survives), stating
plainly what was NOT observed in the real code, (3) rename/re-head any test whose name overclaims
discrimination power it doesn't have — state exactly what it CAN and CANNOT discriminate, backed
by the real numbers, (4) bump the count on the `synthetic-repro-presented-as-real` entry in the
host rules' Gotchas (`.claude/rules/spec-pipeline.md`) — NOT in the spec's `.deviations.md`, which
is folded and deleted at review close, so a slug recorded only there leaves no greppable trail.
The class stands at 1 as of 2026-08-23; never build a standing guard or add doctrine prose before
a third recurrence — core § Incident Policy, and Generality/Materiality are unfillable that early.
This is the "corrected round 2" half of specs/20260823/08-derived-session-queue.md's fix loop.
