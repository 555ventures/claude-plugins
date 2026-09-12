---
name: ac-drift-clean-standing-test
description: tests/doctor/ac-drift-clean.test.js pins ac-drift.js against ROOT itself (not a synthetic host) — its red count shifts with every retire/tag edit landed in the same spec.
metadata:
  type: project
  reviewed: 2026-09-12
---

specs/20260907/02-ac-drift-backfill.md D5 adds `tests/doctor/ac-drift-clean.test.js`, a
standing test that runs `ac-drift.js --root <ROOT> --json` against **this repository's own
real tree** (via `runNode('scripts/ac-drift.js', ['--root', ROOT, '--json'])` — `ROOT` from
`helpers.js`, not a `tmpdir()` fixture). This is the one sanctioned exception to
`tests/doctor/ac-drift.test.js`'s all-synthetic-host convention (that file's own header notes
it is pre-existing TDD-red pins on synthetic trees).

**Why this matters for red/green proof:** the finding count this test observes moves with
*every* other file in the same spec's File Plan. At red-phase authoring time the real count
was 41; editing even one sibling `[retired:]` tag (or, in this build, retagging
`AC-20260823-03-13a/b`'s titles with the bare `AC-20260823-03-13` token, which happens to
satisfy one previously-uncovered AC as a side effect) changes the live count before the
File Plan's other MODIFY rows land. Don't hardcode the observed finding count in the test
itself — only assert `findings.length === 0` and `scanned >= 87` (the AC's own literal
floor) — and don't be surprised if the count logged during red-phase verification isn't
exactly 41.

**How to apply:** when authoring or re-verifying this test, run
`node spec/scripts/ac-drift.js --root . --json` directly first to see the live count/shape
before trusting a spec's Assumptions-cited number.
