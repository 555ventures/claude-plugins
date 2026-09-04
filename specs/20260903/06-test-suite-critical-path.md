---
date: 2026-09-03
status: hardened
tier: standard
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260903/07-test-file-budget-guard.md]
brief: n/a
open_markers: 0
---

# Test suite critical path: split the three serial review-driver files

## Goal

`npm test` takes 85–90 s, and the pipeline runs it twice per spec (the blocking `suite` review
leg and the close-time re-run), so every spec waits about three minutes on a suite whose
CPU work is spread over 18 cores. One file, `tests/review/review-driver.test.js`, takes
94.6 s on its own: `node:test` runs files in parallel but the tests inside one file serially,
so that file's serial runtime IS the whole suite's wall clock. This spec splits that file and
the two next-worst (`escalate-row.test.js` 25.8 s, `disposer-gate.test.js` 18.0 s) into
sibling files grouped by owning AC family, moving every test verbatim. Done means: the same
tests run from more files, nothing asserted changes, and the suite's critical path drops from
~95 s to the low teens (the next floor is `smoke-shutdown-behavior` at 14.4 s, real `sleep`
polls, inherent). The durable guard against the trap re-forming is sibling spec 07.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Split by **moving tests verbatim** per the allocation table in Contracts: every `test(...)` block — name, body, assert messages, inline comments — moves byte-for-byte into its shard; no test is rewritten, merged, dropped, retagged, or given a new AC-ID (AC-20260903-06-1) | node:test parallelises across files and serialises within one; moving is the whole fix. Rejected: converting CLI-spawn tests to in-process calls (the 34 `spec/scripts/*.js` are top-level argv bodies; the process boundary — exit codes, sentinels, env scrub — is the guarantee under test) and `--test-concurrency` tuning (no evidence). Stubbing `gateCommand` in state-pinning driver tests (Fable's secondary, ~30% of the review family) is deferred, not rejected — see Rationale. |
| D2 | Helpers a family's shards share live in one **per-family fixtures module** — `tests/review/review-driver.fixtures.js`, `tests/review/escalate-row.fixtures.js`, `tests/review/disposer-gate.fixtures.js` — exporting them via `module.exports`, bodies moved byte-for-byte; a helper used by exactly one shard travels with that shard instead (AC-20260903-06-1) | Three modules, not one: the families' `specBody`/`makeHost` differ in shape and consolidating them is a refactor, which this spec is not. `tests/helpers.js` is the precedent for a non-`.test.js` file under `tests/`; both `node --test` bare and the glob form leave `*.fixtures.js` un-executed (A1). |
| D3 | The **original file names survive** as each family's first shard: `review-driver.test.js`, `escalate-row.test.js`, `disposer-gate.test.js` stay in place holding the tests the table assigns them `[no-ac: a naming choice with no behavioral surface — the diff shows it]` | Owner citations in `spec/scripts/spec-review-driver.js` (line ~208), `spec/scripts/lib/leg-findings.js` (line ~7), sibling test headers and 20+ closed specs name these paths; keeping them true costs nothing. |
| D4 | Every new shard and fixtures module opens with a header comment naming (a) the family it was split from and this spec, (b) the owner spec paths / AC-IDs of the tests it now holds — copied from the original header's relevant paragraphs; the fixtures module's header keeps the original file's provenance paragraphs that describe the helpers `[no-ac: comment content; the reviewer reads it]` | Test Rules require every test file to cite the owner id it pins; a shard that lost its header would be an uncited pin. |
| D5 | Shard membership is fixed by the table; **helper membership may be adjusted** by the worker only when a shard fails with a `ReferenceError`/`TypeError` for a helper the table placed elsewhere — move that helper into the fixtures module (never duplicate it) and record the move in the build's deviations `[no-ac: build-time adjustment rule; the shard's own green run is the evidence]` | The table was derived by grep at plan time; a missed use is a one-line move, not a fork. |
| D6 | No `plugin.json` version bump `[no-ac: version discipline governs plugin behavior; only this repo's own test layout changes]` | Nothing under `spec/` changes; the pipeline's observable behavior on every host is identical. |

## File Plan

<!-- All rows are tests-layer. NONE of them carries an AC-ID of THIS spec on purpose: the shards
     hold tests tagged with their ORIGINAL owner AC-IDs, moved verbatim. red-check.js reports each
     row as "carries zero AC-IDs — unclassified, never executed" (a warning, never a finding).
     Workers must NOT add AC-20260903-06-* (or any placeholder) to any shard — the spec's single
     AC is covered by the `suite` oracle, not by a test. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| tests/review/review-driver.fixtures.js | CREATE | tests | Shared review-driver helpers moved verbatim (see Contracts § review-driver shared set); `module.exports` of every listed name |
| tests/review/review-driver.test.js | MODIFY | tests | Keeps the "steps" group (Contracts table, shard A); requires the fixtures module; helpers `makeSkipsHost`, `makeKillHost`, `makeDoneHost` stay here |
| tests/review/review-driver-close-refusals.test.js | CREATE | tests | Shard B; helpers `unresolvableBaseSpecBody`, `specBodyNoTestFilePlanRow` travel here |
| tests/review/review-driver-close-row.test.js | CREATE | tests | Shard C; helpers `noDiffBaseSpecBody`, `makeNoDiffBaseHost`, `makeGotchasHost` travel here |
| tests/review/review-driver-fix-cycle.test.js | CREATE | tests | Shard D; helper `makeSuiteBlindSpotDriverHost` travels here |
| tests/review/review-driver-replay-entry.test.js | CREATE | tests | Shard E |
| tests/review/review-driver-replay-record.test.js | CREATE | tests | Shard F |
| tests/review/escalate-row.fixtures.js | CREATE | tests | Shared escalate-row helpers moved verbatim (Contracts § escalate-row shared set) |
| tests/review/escalate-row.test.js | MODIFY | tests | Keeps shard G (the four verdict.js-level tests + first four driver tests) |
| tests/review/escalate-row-step.test.js | CREATE | tests | Shard H |
| tests/review/disposer-gate.fixtures.js | CREATE | tests | Shared disposer-gate helpers moved verbatim (Contracts § disposer-gate shared set) |
| tests/review/disposer-gate.test.js | MODIFY | tests | Keeps shard I |
| tests/review/disposer-gate-refusals.test.js | CREATE | tests | Shard J; helpers `makeFiveFileReconcileHost`, `ONE_LEG_WAIVE` travel here |

## Contracts

Tests are identified by the first AC token (or leading phrase) of their `test('...')` name in
the pre-image file, in file order. Durations are the plan-time measurement (2026-09-03, all
three files run together, `--test-reporter=spec`) and exist only to show each shard is
balanced; they are not asserted.

### review-driver family (48 tests, ~70 s serial → six shards, max ~16 s)

| Shard | File | Tests (pre-image order) | ≈ s |
|-------|------|-------------------------|-----|
| A | `review-driver.test.js` | `AC-20260820-07-1`, `AC-20260820-07-2 (also AC-20260821-04-8 …)`, `AC-20260820-07-3`, `AC-20260820-07-4`, `AC-20260902-05-13`, `AC-20260820-07-5`, `AC-20260820-07-9`, `AC-20260820-07-10`, `AC-20260821-03-8`, `AC-20260820-07-11`, `AC-20260820-07-14`, `AC-20260820-07-15`, `AC-20260820-07-12 (also AC-20260821-04-9 …)`, `AC-20260901-02-4 (also AC-20260901-09-6 …)` | 15.7 |
| B | `review-driver-close-refusals.test.js` | `AC-20260903-02-10`, `AC-20260824-06-12`, `AC-20260820-07-7`, `AC-20260830-02-1`, `AC-20260830-02-4`, `AC-20260820-07-16` | 8.8 |
| C | `review-driver-close-row.test.js` | `AC-20260820-07-6 / AC-20260901-03-5 …`, `AC-20260824-06-6`, `the CLOSE step names the canonical doc …`, `the CLOSE step falls back to the area-derived …`, `AC-20260823-03-11`, `AC-20260823-05-7 / AC-20260824-06-11`, `AC-20260823-05-7: WHEN the driver flips a spec whose frontmatter already carries …`, `gotchas ratchet: the review row records …`, `gotchas ratchet: an over-cap section that lost …`, `gotchas ratchet: the CLOSE step names …` | 14.3 |
| D | `review-driver-fix-cycle.test.js` | `AC-20260903-02-9`, `AC-20260820-07-8 (also AC-20260822-01-10 …)`, `AC-20260820-07-8 (manifest-provable cap) …`, `AC-20260902-05-6`, `AC-20260902-05-8` | 10.5 |
| E | `review-driver-replay-entry.test.js` | `AC-20260821-02-1`, `AC-20260821-02-2: WHEN due and --select yields …`, `AC-20260823-09-7`, `AC-20260903-01-12: WHEN the driver enters REPLAY …`, `AC-20260903-01-12: WHEN --mark replay-recorded is refused …`, `WHEN the driver parses a seven-token selection line …`, `replay-root-4` | 11.9 |
| F | `review-driver-replay-record.test.js` | `AC-20260821-02-3`, `AC-20260821-02-4`, `AC-20260821-02-5`, `AC-20260821-02-6`, `AC-20260821-02-7`, `AC-20260821-02-2 (worktree merge carrier)` | 11.0 |

**review-driver shared set** (→ `review-driver.fixtures.js`, exported by these names): `DRIVER`,
`GREEN_TEST`, `specBody`, `makeHost`, `run`, `stateOf`, `toReviewer`, `returnFileWith`,
`oneFixReturnFile`, `CLEAN_RETURN`, `SURVIVOR_RETURN`, `rulesWithGotchas` (called by `makeHost`),
and the replay fixture family used by shards E and F: `seedReplayRow`, `seedReviewRow`,
`fiveSeedReviews`, `makeReplayHost`, `driveToClose`, `commitClose`, `ledgerRows`,
`closeRunIdOf`. Each shard destructures only what it uses:
`const { makeHost, run, stateOf, … } = require('./review-driver.fixtures')`. Shards keep their
own `require('node:test')`, `assert`, `fs`, `path`, `execFileSync`, and `../helpers` imports as
the moved bodies need them.

### escalate-row family (12 tests, ~28 s serial → two shards)

| Shard | File | Tests | ≈ s |
|-------|------|-------|-----|
| G | `escalate-row.test.js` | `AC-20260822-01-1`, `AC-20260822-01-2`, `AC-20260822-01-3`, `AC-20260822-01-4`, `AC-20260822-01-5`, `AC-20260824-06-7`, `AC-20260822-01-6`, `AC-20260822-01-7` | 13.4 |
| H | `escalate-row-step.test.js` | `AC-20260822-01-8`, `AC-20260822-01-9`, `AC-20260822-01-12`, `AC-20260822-01-13` | 14.0 |

**escalate-row shared set** (→ `escalate-row.fixtures.js`): `VERDICT`, `DRIVER`,
`STOPPED_LEDGER_REL`, `GREEN_TEST`, `specBody`, `run`, `stateOf`, `returnFileWith`,
`oneFixReturnFile`, `reviewerReturn`, `readJsonl`, `readSidecar`, `overrideLeg`, `makeHost`,
`makeWorktreeHost`, `driveToCapEdge`. The header paragraph tagging `AC-20260901-08-9` (the
`killed: []` shape `reviewerReturn()` carries) moves WITH `reviewerReturn` into the fixtures
module — that AC-ID's home is the helper, and the tag must keep resolving there.

### disposer-gate family (11 tests, ~19 s serial → two shards)

| Shard | File | Tests | ≈ s |
|-------|------|-------|-----|
| I | `disposer-gate.test.js` | `AC-20260901-09-1`, `AC-20260901-09-2`, `AC-20260901-09-3`, `AC-20260901-09-6 (disposer clause)`, `AC-20260901-09-9`, `AC-20260901-09-13` | 8.3 |
| J | `disposer-gate-refusals.test.js` | `AC-20260901-09-4`, `AC-20260901-09-7`, `AC-20260901-09-8`, `disposition-pool unit: WHEN the manifest holds a red reconcile row …`, `disposition-pool unit: WHEN the same five-file reconcile row …` | 11.0 |

**disposer-gate shared set** (→ `disposer-gate.fixtures.js`): `DRIVER`, `GREEN_TEST`,
`specBody`, `makeHost`, `readState`, `readStateRaw`, `lastLedgerRow`, `run`, `stateOf`,
`toReviewer`, `returnFileWith`, `writeStamp`, `CLEAN_RETURN`, `ONE_SURVIVOR_RETURN`,
`TWO_SURVIVOR_RETURN`, `makeTwoSurvivorPoolHost`, `validDispositions`, `disposerReturn`.

## Behavior

Nothing the driver, verdict, or legs do changes. The only runtime difference is scheduling:
`node --test` now starts ten review-family files instead of three, so their tests overlap
across processes. Each `tmpdir()` fixture is already unique per test (prefix + random), so
tests that used to run serially can run concurrently without sharing state — the same
property every other file in the suite already relies on.

Verification the build performs beyond the gates: run each shard alone
(`node --test tests/review/<shard>.test.js`) and confirm its test count matches the table, and
run `node --test 'tests/review/*.test.js'` to confirm the family totals (48 + 12 + 11 = 71
tests, 0 fail).

## Acceptance Criteria

- **AC-20260903-06-1** `[oracle: suite]`: WHEN the review's `suite` leg runs the host
  `testCommand` over the post-image THE SYSTEM SHALL CONTINUE TO exit 0 with `ℹ fail 0` and an
  `ℹ tests` count no lower than the pre-image's — 1061 executed at plan time (1058 static
  `test(` sites; a concurrent spec landing first raises the floor, never lowers it) — i.e.
  every moved test executes from its new home and none was dropped. The reviewer reads
  `suite-output.txt` for the count and the diff for the verbatim-move property (D1).

## Assumptions (escalation triggers)

- A1: `node --test` — bare (the close-time re-run and red-check's per-file form) and with the
  `'tests/**/*.test.js'` glob (`npm test`) — never executes a `tests/review/*.fixtures.js`
  module as a test. **Executed 2026-09-03 (Node v26.0.0):** scratch tree with
  `tests/a.test.js`, `tests/b.test.js` (2 tests each) and `tests/review/x.fixtures.js`
  containing only `throw new Error('FIXTURE_EXECUTED_AS_TEST')`; `node --test` → `ℹ tests 4`,
  `ℹ fail 0`, no `FIXTURE` text; `node --test 'tests/**/*.test.js'` → identical. **if false:**
  rename the modules to `tests/review/fixtures/<family>.js` (a directory the default patterns
  also skip) and re-verify; STOP if that also executes.
- A2: `node:test` runs files in parallel and the tests within one file serially, so a file's
  runtime is the sum of its tests. **Executed 2026-09-03:** two files × two 400 ms tests →
  `ℹ duration_ms 863` wall (serial would be 1600, fully parallel 400) — parallel across files,
  serial within. Plan-time per-test durations in Contracts sum to 70 s for review-driver, and
  the prior session measured that file alone at 94.6 s vs the whole suite at 85–90 s. **if
  false:** the split cannot help; STOP, ask the user.
- A3: Every test in the three files is self-contained: zero `before`/`after`/`beforeEach`/
  `describe` hooks and no mutable module-level state (verified by grep at plan time: every
  top-level binding is a `const` constant or a `function`). **if false:** the hook or shared
  state moves into the fixtures module as an exported factory; if two shards would need to
  share MUTABLE state, return blocked.
- A4: `red-check.js` treats a tests-layer File Plan file carrying none of this spec's AC-IDs as
  "unclassified, never executed" (a warning), so the shards — which carry only their original
  owner AC-IDs — produce no `unsanctioned-green` finding at build Phase 1 (read at plan:
  `spec/scripts/red-check.js`, the D3 zero-carried-AC branch). **if false:** pass every shard
  via `--expect-green`; do not add AC-IDs.
- A5: No live test pins the three original file paths or their test counts (grep at plan:
  every hit is a comment, a closed spec, a ledger row, or agent memory). **if false:** update
  the pin in place, retagged to nothing new — record in deviations.

## Rationale

The pre-image file grew by accretion: fourteen specs since 2026-08-20 appended tests to
`review-driver.test.js` because it was the natural home, and each addition was invisible in
the suite's wall clock until the file became the critical path. Fable's second opinion
(2026-09-03) picked the split over every alternative because it changes nothing about what is
asserted — every test keeps its process boundary, argv, fixtures, and messages — and it
addresses the actual mechanism (serial-within-file). The expected result is ~85 s → ~25–30 s
for `npm test`, measured at close from the suite leg's `suite-output.txt` duration line; it is
not an AC here because timing is a machine property, and sibling spec 07 turns it into the
durable, mechanical guard.

Rejected and not to be revisited: in-process module calls (the scripts are not importable
without rewriting the product, and the process boundary is the guarantee); tree-hash caching
of the close-time re-run (reopens the escape class specs/20260903/02 D4 closed); shared git
fixture templates (`gitRepo` is 51 ms per test — 8 s of CPU across the suite, nothing on the
wall clock); `--test-concurrency` tuning (three runs gave 253/430/643 s against an 85 s
baseline — noise, no signal). Deferred, worth its own spec if the review family is still the
floor after 07's guard lands: stubbing `gateCommand` with a `node -e` gate in driver tests
that pin STATE rather than runner-output parsing (each driver step boots a real nested
`node --test`, ~115 ms, four per close path — Fable's estimate is ~30% of the review family;
unverified).

Fragile points: the shard allocation names tests by the leading token of their names, so a
concurrent spec that renames or adds a test in one of these three files between plan and
build changes the table's inputs — the build handles it by placing the new test in the shard
its nearest neighbour lands in and recording the deviation. Duplication: the three fixtures
modules each hold a `run`/`stateOf`/`returnFileWith`/`GREEN_TEST` copy because the pre-image
files already did; the diff moves, never adds, those copies. Consolidating them is a refactor
this spec deliberately does not attempt (the reviewer's three-near-identical-blocks
calibration applies to blocks a diff creates, and Rationale records this so the finding, if
raised, is a recorded waive).

Decomposition: the guard (a reporter script, a package.json edit, a host-config edit and a
test) is its own landing unit in spec 07 — it can only be green after this split lands
(pre-split, the guard would redden on the 95 s file), which is exactly `depends_on`, and
keeping it separate holds this spec to the ~15-row cap with a single primary area.

## Canonical Delta

Add to `docs/canonical/scripts.md`'s top-level bullet list, after the "path-substring sweep"
entry:

- **`node:test` parallelises across files and serialises within one.** A single file's
  serial runtime is a hard floor on the whole suite's wall clock no matter how many cores the
  other files spread over; measured 2026-09-03, one 49-test file at 94.6 s alone WAS a 106-file
  suite's 85–90 s. Keep exec-a-script test files to a dozen-odd tests grouped by owning AC
  family; when a family's shards need shared helpers, they live in a sibling
  `tests/<topic>/<family>.fixtures.js` module (never executed as a test by either the bare or
  the glob form). (specs/20260903/06-test-suite-critical-path.md)
