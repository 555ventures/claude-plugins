# Deviations — 02-run-provenance

- Orchestrator, build Phase 0: corrected `build_base` from the moving ref `main` to
  `c0113441b316a1de01a42534df0e1f876c7b88dd`, sibling 01's review-close commit and this spec's
  true pre-image. `main` (`980ffd3`) predates sibling 01's build on this branch, so `red-check.js`
  refused with `pre-image is not pure` naming six non-tests File Plan paths (`.gitignore`,
  `spec/.claude-plugin/plugin.json`, `spec/entrypoints.json`, `spec/scripts/init-gen.js`,
  `spec/scripts/spec-build-driver.js`, `spec/scripts/spec-review-driver.js`) that sibling 01
  already changed. Ruled by JJ 2026-09-01 (spec 02's review panel covers spec 02 only) and
  recorded as D10. Same class as the `[plugin]` stale-`diff_base` § Gotchas entry; build.md's
  "never writes `build_base`" is departed from here because the field named a base that no longer
  exists as a pre-image. `merge-back.sh branch-for` derives the merge target independently of this
  field, so merge-back is unaffected.
- Test author, `tests/provenance/provenance.test.js`: repaired a fixture defect the coordinator's
  red-attribution pass caught. `manifestFixture()` (used by the three AC-20260901-02-3/-6
  `status === 0`-asserting tests) originally wrote a single `{"leg":"gate","exit":0,"observed":{}}`
  manifest row against a minimal `{"verdict":"CLEAN",...}` workflow object — missing seven of
  verdict.js's eight required `REVIEW_LEGS` rows, this derives `UNVERIFIED` (exit 1) regardless of
  `--via`/`--model`, so those three tests failed on the wrong axis. Replaced with the same
  eight-leg-green fixture and full workflow-return shape `tests/review/verdict.test.js` uses to
  reach CLEAN (`SIX_GREEN` + `cleanWorkflow`), confirmed by direct execution against the
  unmodified `verdict.js` (no `--via`/`--model` involved) that the fixture alone derives CLEAN and
  exits 0. The three tests now fail on the `--via`/`--model` contract (an unrecognized flag or a
  missing key/value), not on the verdict word.
- Scripts worker: D1's new hook script `spec/scripts/spec-session-stamp.sh` (wired into
  `spec/hooks/hooks.json` by the doctrine worker) trips a pre-existing fail-closed meta-test,
  `tests/consistency/red-fixture-coverage.test.js`'s `HOOK_HANDLERS` guard, which refuses to pass
  an unfixtured hook script rather than silently skip it. This spec's File Plan has no row for
  that file (only `tests/consistency/entrypoints.test.js` is listed), and the scripts agent is
  contractually forbidden from editing test files — a `HOOK_HANDLERS` entry belongs to the
  `plugin-tests` agent. Left red and out of scope for this worker; flagging for the tests layer
  (or a follow-up spec) to add the fixture handler for `spec-session-stamp.sh`.
- Scripts worker: a second, unplanned casualty of D7's `spec/entrypoints.json` addition — the
  exhaustive-pin collision class the host Gotchas already document twice.
  `tests/consistency/entrypoints.test.js`'s `Object.keys(manifest).length === executables.length`
  pin now reads 41 !== 40: the manifest's new `spec/scripts/lib/session-stamp.js` row is a
  deliberate lib/ exception (this spec's own driver requires now name it as a consumer, per D7),
  while the executables scan separately excludes `spec/scripts/lib/` by design — the two
  assertions were mutually consistent before this spec and now collide out-of-File-Plan. Per the
  existing Gotcha, this is a build-caught, review-waived pin update, not a plan defect; fixing it
  requires editing a test file, which is out of the scripts agent's scope. Left red; flagging for
  the tests layer.

- Orchestrator, wave doctrine+scripts: removed the `spec/scripts/lib/session-stamp.js` row the
  doctrine worker added to `spec/entrypoints.json` under D7. The manifest's executable scan
  excludes `spec/scripts/lib/` by design, and `tests/consistency/entrypoints.test.js`
  AC-20260820-04-1 asserts `Object.keys(manifest).length === executables.length`; the lib row made
  it 41 vs 40, fixable only by weakening a pin D7's own rationale calls never-weakened. Recorded as
  D11. The hook script's row (`spec/scripts/spec-session-stamp.sh` → `spec/hooks/hooks.json`) is
  unaffected and is what AC-20260901-02-8 pins.
- Test author, `tests/consistency/red-fixture-coverage.test.js`: outside this spec's File Plan
  (added to scope by ruling D12) — closed the scripts worker's flagged casualty above. Registered
  a `spec-session-stamp.sh` handler in `HOOK_HANDLERS` proving the hook ENGAGES rather than that
  it BLOCKS, since D1 fixes its only exit code at 0: a planted `/spec:` prompt must produce
  `<cwd>/.claude/spec-session.json` carrying THAT invocation's own planted `session_id`/
  `transcript_path` (never a generic existence check), a planted non-`/spec:` prompt must write
  nothing (the discriminating control — otherwise an always-fires stub would pass the first case
  too), and both invocations must exit 0 with empty stdout. Generalized the shared per-hook test
  title from "can actually block on a planted violation" to "can actually engage on a planted
  input, per its own contract" for ALL four hooks, not just this one — the four pre-existing
  handlers (spec-state-gate.sh, genesis-state-gate.sh, question-style-gate.js,
  block-cross-worktree-writes.sh) still assert a real block (status 2/nonzero) inside their own
  handler bodies, unchanged; only the outer label changed, no assertion was touched or weakened.
  Verified: `node --test 'tests/consistency/*.test.js'` — 93/93 pass; `npm test` — 867/867 pass.

- Orchestrator, wave other: applied the one-line `.gitignore` row (D6) directly instead of
  dispatching a `general-purpose` worker for it. The wave's whole file set was a single literal
  line with no design question; a fresh-context dispatch would have cost a full agent for zero
  judgment. Recorded as `--workers 0` on the ledger row so the count stays honest — no worker ran.
