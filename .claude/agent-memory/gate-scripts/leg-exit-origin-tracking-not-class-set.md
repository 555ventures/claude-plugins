---
name: leg-exit-origin-tracking-not-class-set
description: when one finding class can be emitted from two different manifest-leg loops, adding it to both legs' class-membership sets cross-contaminates both exits — track emission SITE via a Set of object references instead, never a field on the finding
metadata:
  type: feedback
  reviewed: 2026-09-02
---

`ac-matrix.js` derives two manifest leg exits (`ac-matrix`, `skip-reconcile`) by testing each
pushed finding's `class` against two `Set`s of class names. When one class (`rejected-trailing-
tag`, specs/20260823/03 D1) can legitimately be emitted from EITHER of the two underlying loops,
adding that class name to both sets makes a single-loop emission redden BOTH legs — a leg that
observed nothing still reports `exit:1`. Confirmed by executed repro (orchestrator, 2026-08-23):
a spec with one uncovered AC and zero skip lines wrote
`{"leg":"skip-reconcile","exit":1,"observed":{"skipped":0,"sanctioned":0}}`.

**Why:** this is exactly the class of silent misreport specs/20260823/03 exists to eliminate —
shipping one into the evidence manifest `verdict.js` reads would be self-refuting. The correct
fix (D9, locked) is emission-SITE tracking: leave the shared class OUT of both membership sets,
and at each of the class's several push sites also add the just-pushed finding OBJECT (by
reference) into a small per-leg `Set` (`acMatrixOrigin`, `skipOrigin`). The exit derivation then
ORs the class-set test with `origin.has(f)`. Critically, origin must NEVER become a key on the
finding object itself — a reviewer/AC pin (AC-20260823-03-13a here) will assert the finding's key
set stays exactly the pre-existing shape (`ac`,`class`,`detail`,`severity`); `--json` consumers
must see zero difference.

**How to apply:** any time a NEW finding class is added to a script that already partitions
exits/legs by class-set membership, check whether the class can be emitted from more than one
partition's code path. If so, do not add it to more than one set — track origin externally (a
`Set` keyed by object reference is the zero-dependency, zero-schema-change way) rather than
widening set membership, which silently couples two independently-meant signals. The sibling
instinct from the same spec: when a fixture and a locked Contract disagree, retarget the fixture
rather than loosening the mechanism to fit one caller.
