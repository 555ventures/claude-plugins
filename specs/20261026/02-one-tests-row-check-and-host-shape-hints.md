---
date: 2026-10-26
status: implementing
build_base: main
tier: critical
area: cross-cutting
breaking: false
depends_on: [specs/20261026/01-one-runner-for-host-commands.md]
brief: n/a
open_markers: 0
diff_base: 90473c82def1aa54781a77214a445205364e1208
---

# One tests-row check and host-shape hints

## Goal

Six scripts decide "is this File Plan row a tests row" with two different predicates: the build
driver, scope-reconcile and gate-resolve accept `test`, `Test`, `tests` (`/^tests?$/i`), while
red-check, ac-matrix and collision-closure accept only `tests`. A row spelled `Test` is
therefore dispatched as a test by build and silently skipped by red-check — the red-first check
passes on zero files. This spec moves the predicate into `lib/file-plan.js` as `isTestsRow` and
bans the inline copies. It also gives `/spec:doctor` two advisory hints the 2026-10-26 audit
found missing: a compound `runtime.bootCommand` (suggest a host script) and a host with no
`capabilities.testCountPattern` (ask the host to add one; zero tests stays sanctioned). Done means
red-check reports a `Test`-layer row's green pre-image, and port-check prints both new hint
classes for a host that has those shapes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/file-plan.js` exports `isTestsRow(row)` = `/^tests?$/i.test(String(row && row.layer || '').trim())`. Every tests-layer decision in `spec-build-driver.js` (8 sites), `red-check.js`, `ac-matrix.js`, `collision-closure.js`, `scope-reconcile.js` and `lib/gate-resolve.js` calls it. (AC-20261026-02-1, AC-20261026-02-2, AC-20261026-02-3) | The permissive spelling is what build already dispatches on; narrowing build instead would silently drop `Test` rows from the TESTS wave. |
| D2 | A consistency test fails on any `/^tests?$/` regex literal or any `toLowerCase() === 'tests'` comparison in `spec/scripts/**/*.js` outside `lib/file-plan.js`. `init-gen.js`'s `agent.kind === 'tests'` is not a layer test and does not match. (AC-20261026-02-4) | Deterministic guard so a seventh copy cannot drift again. |
| D3 | `port-check.js`'s config reader adds class `config-compound-boot` when `runtime` is not inert and `runtime.bootCommand` matches `/&&|;|\||^\s*cd\s/`; `text` = `runtime.bootCommand`, `line` = the key's line. (AC-20261026-02-5, AC-20261026-02-7) | Compound boots now work (7.274.0 + spec 01), but a host script is the shape hosts that never broke (prax, walkthrough, zubu-ai) already chose. |
| D4 | `port-check.js` adds class `config-no-test-count` when `capabilities.testCountPattern` is not a non-empty string and `testCommand` or `gateCommand` is a non-empty string; `text` = `capabilities.testCountPattern`, `line` = the `testCommand` key's line (else `gateCommand`'s). Advisory only: no leg, gate or verdict reads it, and zero executed tests stays sanctioned for such hosts. (AC-20261026-02-6, AC-20261026-02-7) | Without the pattern the review cannot tell a run of zero tests from a passing suite; forcing red would break hosts that chose this. |
| D5 | `/spec:doctor` check 19 is renamed **Fixed ports and host command shape** and names both new classes with their remedies: `config-compound-boot` → move the line into a host script (for example a `package.json` script) and point `bootCommand` at it; `config-no-test-count` → add `capabilities.testCountPattern` matching the runner's executed-tests count line. [no-ac: doctrine prose — the repo's Test Rules say regexes over prose are not tests; the classes it names are AC-20261026-02-5 and AC-20261026-02-6] | The doctor command is the only reader of port-check; the hint is useless unless its remedy is printed. |
| D6 | `port-check.js`'s header comment lists the two new classes; exit codes are unchanged (findings → 1, advisory in doctor). [no-ac: header prose; behaviour is AC-20261026-02-5 and AC-20261026-02-6] | Repo rule: every script header names what it reports. |
| D7 | `spec/.claude-plugin/plugin.json` is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: the gate's `plugin-bump.js --check` is the oracle] | Repo version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/file-plan.js | MODIFY | scripts | Add and export `isTestsRow` (D1). |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | Eight `/^tests?$/i` sites call `isTestsRow` (D1). |
| spec/scripts/red-check.js | MODIFY | scripts | Tests-layer filter calls `isTestsRow` (D1). |
| spec/scripts/ac-matrix.js | MODIFY | scripts | Tests-layer row filter calls `isTestsRow` (D1). |
| spec/scripts/collision-closure.js | MODIFY | scripts | `isTestsLayer` replaced by `isTestsRow` (D1). |
| spec/scripts/scope-reconcile.js | MODIFY | scripts | Tests-layer filter calls `isTestsRow` (D1). |
| spec/scripts/lib/gate-resolve.js | MODIFY | scripts | Tests-layer filter calls `isTestsRow` (D1). |
| spec/scripts/port-check.js | MODIFY | scripts | Two advisory config classes and header lines (D3, D4, D6). |
| spec/commands/doctor.md | MODIFY | doctrine | Check 19 renamed and both remedies named (D5). |
| spec/.claude-plugin/plugin.json | MODIFY | other | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (D7). |
| tests/file-plan/is-tests-row.test.js | CREATE | tests | AC-20261026-02-1 |
| tests/red-check/tests-layer-spelling.test.js | CREATE | tests | AC-20261026-02-2 |
| tests/ac-matrix/tests-layer-spelling.test.js | CREATE | tests | AC-20261026-02-3 |
| tests/consistency/one-tests-row-check.test.js | CREATE | tests | AC-20261026-02-4 |
| tests/doctor/host-shape-hints.test.js | CREATE | tests | AC-20261026-02-5, AC-20261026-02-6, AC-20261026-02-7 |

## Contracts

```js
// spec/scripts/lib/file-plan.js (added export)
// isTestsRow(row) -> boolean
//   true exactly when String(row && row.layer || '').trim() matches /^tests?$/i
module.exports = { parseFilePlan, splitPlanCell, parseFilePlanRows, isTestsRow }
```

```
# port-check.js plain output, one line per new finding (existing format)
.claude/spec.config.json:<line>: config-compound-boot runtime.bootCommand
.claude/spec.config.json:<line>: config-no-test-count capabilities.testCountPattern
```

## Behavior

- A host whose `runtime` is `{ "inert": "…" }` gets no `config-compound-boot`.
- This repo's own config (inert runtime, `testCountPattern` declared) produces neither class.
- Existing `config-fixed-port` findings and the tests-walk classes are unchanged in order and
  shape; the two new classes are appended after them.

## Acceptance Criteria

- **AC-20261026-02-1**: WHEN `isTestsRow` is given a row THE SYSTEM SHALL return true exactly for
  the layers `tests`, `test`, `Tests`, ` Test ` and false for `testing`, `baseline`, `` (empty)
  and a row with no layer (`{ layer: 'Test' }` → `true`; `{ layer: 'testing' }` → `false`;
  `{}` → `false`) → writes tests/file-plan/is-tests-row.test.js
- **AC-20261026-02-2**: WHEN red-check runs on a spec whose File Plan row is
  `| tests/a.test.js | CREATE | Test | AC-… |` and that test passes against the pre-image with no
  pre-green sanction THE SYSTEM SHALL report the file (`--json` findings contain one
  `unsanctioned-green` naming `tests/a.test.js`, exit `1`)
  → writes tests/red-check/tests-layer-spelling.test.js
- **AC-20261026-02-3**: WHEN ac-matrix resolves tests-layer rows and a row spelled `Test` names a
  missing CREATE file THE SYSTEM SHALL treat it as a tests row exactly as it treats `tests`
  (`| tests/missing.test.js | CREATE | Test | AC-… |` → the same findings, class and count, as the identical row spelled `tests`)
  → writes tests/ac-matrix/tests-layer-spelling.test.js
- **AC-20261026-02-4**: WHEN `spec/scripts/**/*.js` is scanned THE SYSTEM SHALL find zero inline
  tests-layer predicates outside `lib/file-plan.js` (patterns: a `/^tests?$/` regex literal, a
  `toLowerCase() === 'tests'` comparison; expected hits → `[]`; `agent.kind === 'tests'` → not a
  hit) → writes tests/consistency/one-tests-row-check.test.js
- **AC-20261026-02-5**: WHEN port-check runs on a host whose `runtime.bootCommand` is
  `pnpm build && cd apps/web && exec node server.mjs` THE SYSTEM SHALL print one
  `config-compound-boot runtime.bootCommand` line and exit `1`; for `pnpm start` it SHALL print
  none → writes tests/doctor/host-shape-hints.test.js
- **AC-20261026-02-6**: WHEN port-check runs on a host with `testCommand` `npm test` and no
  `capabilities.testCountPattern` THE SYSTEM SHALL print one
  `config-no-test-count capabilities.testCountPattern` line; with `testCountPattern`
  `ℹ tests (\\d+)` declared it SHALL print none → writes tests/doctor/host-shape-hints.test.js
- **AC-20261026-02-7**: WHEN port-check runs on a host whose `runtime` is `{ "inert": "x" }` with
  `testCountPattern` declared THE SYSTEM SHALL print neither new class (`--json` →
  `{"findings":[]}`) → writes tests/doctor/host-shape-hints.test.js

## Assumptions (escalation triggers)

- A1: no other script holds a tests-layer predicate in a form the D2 patterns miss. Read at plan
  time: the grep over `spec/scripts` found 8 build-driver sites, scope-reconcile, gate-resolve
  (`/^tests?$/i`) and red-check, ac-matrix, collision-closure (`=== 'tests'`). A prediction, not
  an inventory — **if false:** move the extra site onto `isTestsRow` in the same batch and widen
  the D2 pattern; never weaken the ban.
- A2: port-check has no existing tests, so no pin asserts its finding set is exactly
  `config-fixed-port`. Read at plan time (`grep -rln port-check tests` → none). — **if false:**
  update the pin in place and retag it.
- A3: spec 01 lands first; both specs edit `spec-build-driver.js`, `red-check.js` and
  `lib/gate-resolve.js` in disjoint lines. — **if false:** rebase on spec 01's close commit at
  build Phase 0 and record the base correction.

## Rationale

The audit counted the tests-layer split as a silent-wrong path: build dispatches a `Test` row as
a test, and red-check — the step that proves new tests fail before the change — never sees it, so
its pass is vacuous. Choosing the permissive spelling keeps every row build already accepts; the
strict spelling would push the same split the other way.

The doctor hints replace the first Fable read's heavier prescriptions. Instead of a contract that
forces hosts to declare `{cwd, run}`, the doctor nudges the two shapes that caused real bugs:
compound boot lines and missing test-count patterns. The second Fable read showed the real
silent green is hosts with no `testCountPattern` (autopilot-hub, bwm-booking, cctop, zubu-menu),
where zero executed tests is sanctioned by design; making that red is a product decision outside
this spec, so the hint stays advisory.

port-check is the home because it is already the doctor's runtime-config advisory reader; a new
script would add a `spec-paths` key and an entry point for two checks.

This spec is split from spec 01 because the decomposition cap counts 15 source rows there; the
two share no Decision and land green independently.

## Canonical Delta

None — this repo has no `docs/canonical/`.
