# Deviations — 02-freeze-export-and-the-contract

- Tests-layer only (plugin-tests worker): no Decision states how a capture's full URL is built
  from `prototype.url` plus a `states.json` state's own path value, even though `contract.json`'s
  own Contracts example stores that value as a bare relative path ("/women"). freeze.test.js
  assumes simple string concatenation (`prototype.url + statePath`) and documents this as a
  test-owned contract in its header comment; the implementer may need a different join rule
  (e.g. `new URL(statePath, prototype.url)`), in which case `PROTO_CAPTURE_FAIL_URL`'s expected
  value in the AC-20260928-02-6 capture-failure test needs updating to match.
- `tests/fixtures/prototype/host/.claude/spec.config.json`: changed `gateCommand` from `"true"`
  to `"node gate.js"` and `prototype.e2eList` from `"true {file}"` to `"node list-tests.js
  {file}"`, per the File Plan row's own literal wording ("gateCommand = `node gate.js`" / "an
  e2eList stub"). Added `prototype.dbDestroy: "node scripts/destroy-db.js"`. `prototype.export`
  was left at `["src/db/**"]` in the shared fixture (adding `drizzle/**` there would fail the
  existing AC-20260928-01-10 "check exits 0 on a clean fixture host" test, since no tracked file
  would match it) — freeze.test.js's export/harden cases instead `patchConfig` a local
  `["src/db/**", "drizzle/**"]` onto their own throwaway host copy.
- Collision-sweep finding (not fixed — out of this worker's assigned file list):
  `tests/prototype/prototype-driver.test.js`'s AC-20260928-01-6 case ("...reports state APPROVED
  with the not-available freeze step") pins the literal `## Step: freeze — not available in this
  version` and asserts no `Then:` line at APPROVED. This spec's D3 (`--mark frozen`) and D4 (the
  TESTS step) mean the APPROVED bare-run step is expected to change once freeze.js and the
  `frozen`/`tests-derived` marks exist. No other mark/state pin elsewhere in `tests/` collides
  (grepped for `prototype-driver`, `proto-capture`, `proto-stable-id`, `proto-overlay`,
  `proto-capture-page` outside `tests/prototype/`; only an unrelated spec-paths inventory-key
  mention was found).
- Not fixed — test-file defect, out of this worker's remit (never edit test files per the
  worker contract): `freeze.test.js`'s AC-20260928-02-9 case calls
  `runNode('scripts/ac-matrix.js', ['--spec', contract.spec, '--lint', '--resolve-root', dir])`
  and `runNode('scripts/promise-sweep.js', ['--spec', contract.spec])` with NO `{ cwd: dir }`
  option. `ac-matrix.js`'s `--spec` read (`fs.readFileSync(specPath, ...)`, spec/scripts/ac-
  matrix.js ~line 175) resolves `specPath` against the CHILD PROCESS'S cwd, which `runNode`
  (tests/helpers.js) defaults to the TEST RUNNER'S OWN cwd (this worktree's root) when no `opts`
  is passed — never `dir` (the synthetic tmpdir host `--mark tests-derived` actually wrote the
  spec into). `--resolve-root` does not help: it is used only to resolve a `rewrites`/`reuses`
  disposition's reference file (ac-matrix.js line ~253), never the primary `--spec` path itself,
  and this generated spec's own AC bullets use `writes` (per D6/D9), which is deliberately left
  unresolved (Assumption A5) — so `--resolve-root` is inert for this call regardless. The
  driver's OWN internal lint/sweep check inside `--mark tests-derived` (D6) correctly passes
  `cwd: root` when spawning both scripts and succeeds (confirmed: the overall mark exits 0, so
  that internal check ran clean) — this failure is isolated to the test's own SECOND, redundant
  external verification call. Remedy: add `{ cwd: dir }` to both `runNode` calls in that test
  case. Not applied here since it requires editing a test file outside this worker's file list
  and outside the assigned batch's rules.
- Orchestrator: D9 names `spec/scripts/prototype-driver.js` as proto-capture.js's caller, but D2
  puts the spawn inside `spec/scripts/lib/freeze.js` (`captureAll`), which the driver calls; the
  entrypoints manifest requires the invocation literal in the declared caller, so the row names
  `spec/scripts/lib/freeze.js`.
- Orchestrator: D3(5)'s `prototype.url` probe is advisory (printed, never refusing); an
  unreachable URL is still refused before anything later runs, by D3(6)'s capture exiting 2 on
  navigation failure (D1), forwarded verbatim. Keeps the PROTO_CAPTURE_BIN seam network-free.
- Orchestrator: the predecessor pin in `tests/prototype/prototype-driver.test.js` (spec 01's
  APPROVED-step case) asserted the retired not-available freeze step; updated in place to assert
  the freeze step and its `--mark frozen` Then: line, and added as a File Plan row.
- Orchestrator: the scripts worker rendered outside-export File Plan rows always as MODIFY; D6
  says the action comes from the diff status, so the driver now maps A/M/D, and the fixture
  host gains a base `src/ui/a.js` so AC 9's case genuinely modifies it (the test had created it).
  The AC 9 case's external ac-matrix/promise-sweep calls now pass `cwd` = the host root.
