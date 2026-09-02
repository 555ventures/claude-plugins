---
name: red-proof-must-match-persisted-not-inmemory-order
description: when red-proving a reorder fix by reverting it, match the OLD PERSISTED (saveSidecar-relative) order, not just the in-memory statement order, or the revert is a no-op
metadata:
  type: feedback
  reviewed: 2026-09-01
---

When a dispatch describes a fix as "X now runs before Y" (e.g. spec-build-driver.js's
handleRepairApplied(): `runGate()` now runs BEFORE `marks.repairs.push(...)` + `saveSidecar()`),
red-proving it by swapping just the push/runGate statement order without also moving `saveSidecar()`
can produce a silent no-op revert: if `runGate()` itself dies via `process.exit(2)` (driver-io.js's
fail-closed `runChild`), the process is torn down before an in-memory-only `.push()` ever reaches
disk regardless of statement order — the test stays green because nothing was ever persisted either
way.

**Why**: caught 2026-09-01 on spec 20260901/01's AC-20260901-01-8 phantom-round pin
(spec-build-driver.js `handleRepairApplied`). First revert attempt (`runGate(); push(); save()` →
`push(); runGate(); save()`) left all 22 tests green under the reverted driver — no red at all. The
old-order rationale text ("the round persisted in repairs[]") only holds if `saveSidecar()` also runs
before the death, i.e. the real pre-fix order was `push(); saveSidecar(); runGate()`. Moving
`saveSidecar()` too reproduced the bug and reddened exactly the intended test.

**How to apply**: when constructing a red-proof for a "step A now happens before step B" fix, trace
every persistence call (`saveSidecar`/`fs.writeFileSync`/similar) relative to the reordered steps in
the CURRENT code, and put persistence on the same side of the reorder it was on before the fix — not
just the two named steps. Verify the revert actually reddens the target test before trusting a green
run as proof of nothing to prove.
