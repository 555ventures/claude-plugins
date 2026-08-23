---
name: driver-contract-reproducibility-and-worktree-cwd-pins
description: Testing a stage-driver's "byte-equal to <subscript>'s own line" claim, and its "refused while CWD is inside the worktree" claim, without controlling the subscript's internal invocation.
metadata:
  type: feedback
  reviewed: 2026-08-23
---

Two reusable patterns from authoring tests/review/review-driver.test.js
(specs/20260820/07-review-driver.md, 2026-08-21) for a spec-design-driver.js-shaped stage
driver that owns ledger appends and merge-back:

**"Byte-equal to X.js's own stdout line" AC pins** (e.g. AC-20260820-07-2/-6: the driver's
GATE_RED/CLEAN ledger row must be byte-equal to verdict.js's own printed line, never
hand-composed): you cannot literally re-run the same command and diff stdout, because
verdict.js's row includes a call-time `ts` and (unless `--run-id` is passed) a fresh random
`runId` — two invocations are never byte-identical by construction. The provable version:
capture the driver's own appended row, then re-invoke the subscript directly against the
SAME manifest with `--run-id`/`--diff-loc`/`--iteration`/`--tier`/`--spec` **lifted off that
recorded row** (not independently re-derived), and `deepStrictEqual` both rows with `ts`
deleted from each. This proves reproducibility (same inputs -> same output) without
depending on wall-clock or RNG determinism, and is a fair operational reading of "byte-equal"
alongside the D4 mandate ("never hand-write the word").

**Testing a "refused while CWD is inside the worktree" mark** (AC-20260820-07-12, mirrors
merge-back.sh's own exit-4 CWD guard): build the fixture via `merge-back.sh create` (matches
[[merge-back-test-async-safe-fixture]]-style patterns already in tests/merge-back.test.js —
don't hand-roll worktree creation), then always pass the spec path to the driver as an
**absolute path anchored inside the worktree** (never relative to whatever CWD the test
passes). `git rev-parse --show-toplevel` run from that path's dirname resolves to the
worktree's own top-level regardless of the *process's* CWD, so the driver's D1 state
derivation (frontmatter + sidecar + on-disk artifacts) stays correct across relocation while
its separate D6 CWD-relocation check (comparing `process.cwd()` against that same derived
root) is exactly what changes between the two invocations: `run(wt, spec, ...)` (refused) vs
`run(root, spec, ...)` (accepted, same absolute spec arg). This is the general shape for
testing "the driver's own inherited CWD" checks in this codebase — vary the spawn `cwd`
option, never the specPath argument.

**Manifest-provable iteration/counter caps** (AC-20260820-07-8's Fragile Spots note: "the
iteration count derives from manifest files present, not a stored counter"): prove it by
hand-editing the sidecar's JSON state file to a large fake counter value with NO
corresponding manifest-N.jsonl files on disk, then asserting the derived state is still
NOT the capped/escalated state — followed by a genuine additional cycle succeeding normally.
A test that only drives the cap via real cycles can't distinguish "cap counts manifests" from
"cap counts a sidecar field" — the hand-edit step is what makes the distinction load-bearing.
