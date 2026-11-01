---
date: 2026-11-01
status: draft
tier: critical
area: grounding-contract
breaking: false
depends_on: [specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md]
brief: n/a
---

# The gate is scoped, and the slow tier has a home

## Goal

The pipeline's doctrine says the build gate is scoped and review runs the whole suite once; the
contract never asks a host to write `{testDirs}`, `/spec:init` never checks it, and `/spec:doctor`
never reports its absence — so two of the eight known hosts run every build iteration and every
review gate over their full suite without knowing it. The same hosts have nowhere to put a slow
test: every acceptance criterion owes an executed test, a skipped test is a hard finding, and the
only test command the contract knows is `testCommand`, so boot, build and integration tests
(15 to 240 seconds each) sit in the everyday gate and the suite leg beside millisecond unit tests.
Every mature test culture the prior-art search found (Bazel sizes, Go `-short`, pytest markers,
Vitest projects, Cucumber tags) splits by speed and runs the slow set once per change. Done means
the contract names one optional `slowTestCommand` the review stage runs once per legs iteration as
its own blocking leg, `/spec:init` writes a scoped gate when the runner takes paths and asks the
owner where the slow tier lives, `/spec:doctor` reports an unscoped gate, and a host that declares
nothing is byte-for-byte unchanged.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` gains one optional key, `slowTestCommand` (a shell string, no placeholders: the host's own invocation of the tests it has excluded from `testCommand` by its runner's own mechanism — a marker, a project, a tag; the plugin names none), listed under § Required config keys' optional run and specified in a new section `## Test tiers (optional)` placed after § Test expiry: `testCommand` is the fast tier and the one every gate, suite, at-risk and close-time run executes; `slowTestCommand` runs once per review legs iteration as the blocking `slow` leg and never at close; `gateCommand` carries `{testDirs}` (or `{scopeDirs}`) wherever the runner accepts appended paths, and an unscoped gate is reported by doctor, never refused. (AC-20261101-07-1) | Core § Host Grounding: the repo supplies grounding, the plugin supplies process. Rejected: a per-test speed annotation the plugin parses (stack-shaped), a numeric suite budget (no published source names one; Bazel's size classes are the closest and they are host-declared), and making `{testDirs}` required (breaking for every host whose runner takes no paths). |
| D2 | `review-legs.js`: when `config.slowTestCommand` is a non-empty string, a new wave 2c runs it bare through `sh()` ALONE, after smoke and before wave 3, writes `<out-dir>/slow-output.txt`, and appends `{"leg":"slow","exit":E,"observed":{"skips":N,"todos":N,"testsExecuted":N|{unavailable}}}` typed exactly like the suite row (`computeSkips`, `computeTestsExecuted`, `isUnobserved` → exit 1), in full and `--fix-delta` scope; `slow` joins the summary's `BLOCKING` list. Absent key → no row, no file, no summary line. (AC-20261101-07-2, AC-20261101-07-3, AC-20261101-07-4) | The slow tier is the one place a boot or integration test may live without being in every gate; once per legs iteration is the prior-art cadence (slow tests run on the change, not on every inner loop), and alone-in-its-wave is the same collision rule smoke already follows. |
| D3 | `verdict.js`: `slow` is blocking-if-present — `blockingLegs.add('slow')` only when `legRows.has('slow')`; it is never added to `REVIEW_LEGS` (required). `spec-review-driver.js` `BLOCKING_LEGS` gains `'slow'`. (AC-20261101-07-5, AC-20261101-07-6) | A host that declares no slow tier must derive exactly today's verdicts; a host that does must not close on a red slow leg. |
| D4 | `init-gen.js`: `validateProfile` accepts `config.slowTestCommand` when absent or a non-empty string (else exit 2 naming `config.slowTestCommand`); `generate` prints one stderr warning when `config.gateCommand` carries neither `{testDirs}` nor `{scopeDirs}`: `init-gen: gateCommand is unscoped — every build iteration and the review gate run the whole suite; put {testDirs} where the test runner takes its paths, or accept this when the runner takes none` (never a refusal); `deriveAllowEntries` includes `slowTestCommand`; a declared key adds the manifest row `{claim:"slow tier command runs", kind:"exec", target:"<slowTestCommand>"}`. New mode `init-gen gate-check --root <dir> [--json]` prints `{"scoped":bool,"gateRunsSuite":bool,"slowTier":bool}` (`gateRunsSuite` through `lib/gate-resolve.js`'s helper with `resolveGate` over an empty spec text), exit 0 always except usage 2. `lib/invariants.js` `configCommandStrings` includes `slowTestCommand`. (AC-20261101-07-7, AC-20261101-07-8, AC-20261101-07-9, AC-20261101-07-10) | The pattern precedent is `testNameFilter`/`patternsScript`: the plugin names the key, init writes the host's value and proves it runs before stamping; the exec-recall sweep must know every command string the config carries. |
| D5 | `spec/commands/init.md`: Phase 1 profiles whether the runner accepts appended paths (the contract already asserts `testCommand` does) and whether any test boots a process, builds, or needs a service; Phase 3 gains one interview question — where the slow tier lives: "(Recommended) none — every test is fast enough for the gate" when Phase 1 found no boot/build/service test, else the runner's own exclusion mechanism named with its command (consequence text: slow tests leave the gate and run once per review); Phase 4's `config` guidance names `{testDirs}` at the test segment and `slowTestCommand`. `spec/commands/doctor.md` gains check 25 **Gate scope** (advisory): run `node "$(spec-paths init-gen)" gate-check --root . --json`; `scoped:false` → `⚠️ gate is unscoped: build iterations and the review gate run the whole suite — add {testDirs} to gateCommand`; `scoped:false` and `slowTier:false` → a second line `⚠️ no slow tier declared — boot/integration tests, if any, run in every gate`. `[no-ac: command prose; the script behind it is pinned by AC-20261101-07-9]` | Init is where the owner answers once; doctor is where drift is reported. |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/`. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | optional key `slowTestCommand`; `## Test tiers (optional)` (D1) — the one contract edit |
| spec/scripts/review-legs.js | MODIFY | scripts | wave 2c `slow` leg, `slow-output.txt`, BLOCKING (D2) |
| spec/scripts/verdict.js | MODIFY | scripts | `slow` blocking-if-present (D3) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `BLOCKING_LEGS` + `'slow'` (D3) |
| spec/scripts/init-gen.js | MODIFY | scripts | validation, unscoped warning, allow entries, manifest row, `gate-check` (D4) |
| spec/scripts/lib/invariants.js | MODIFY | scripts | `configCommandStrings` + `slowTestCommand` (D4) |
| spec/commands/init.md | MODIFY | doctrine | Phase 1/3/4 slow-tier and `{testDirs}` guidance (D5) |
| spec/commands/doctor.md | MODIFY | doctrine | check 25 Gate scope (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| tests/review/review-legs-slow-leg.test.js | CREATE | tests | AC-20261101-07-2, AC-20261101-07-3, AC-20261101-07-4 |
| tests/review/verdict-slow-leg.test.js | CREATE | tests | AC-20261101-07-5, AC-20261101-07-6 |
| tests/init-gen/gate-check.test.js | CREATE | tests | AC-20261101-07-7, AC-20261101-07-8, AC-20261101-07-9, AC-20261101-07-10 |
| tests/contract/contract-keys.test.js | CREATE | tests | AC-20261101-07-1 |

## Contracts

`.claude/spec.config.json` (D1), additive:

```jsonc
"slowTestCommand": "uv run pytest -q -m slow"          // or "npx vitest run --project integration"
```

Manifest row (D2):

```
{"leg":"slow","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":17},"scope":"full"}
{"leg":"slow","exit":1,"observed":{"skips":0,"todos":0,"testsExecuted":0},"scope":"full"}   // vacuous
```

`init-gen gate-check --json` (D4):

```
{"scoped":false,"gateRunsSuite":true,"slowTier":false}
```

Stderr warning (D4), exact: `init-gen: gateCommand is unscoped — every build iteration and the review gate run the whole suite; put {testDirs} where the test runner takes its paths, or accept this when the runner takes none`

## Behavior

Fixture (review-legs): specs/20261101/05's inert host plus `slowTestCommand` `bash slow.sh`
(appends to `<host>/slow-counter`, prints `ℹ tests 2`, exits `${SLOW_EXIT:-0}`). A full run
appends the `slow` row after `smoke` and before `ac-matrix`; `slow-counter` holds 1 line; the gate
and suite stubs' counters are unaffected. `SLOW_EXIT=1` → `RED_BLOCKING: slow`, exit 1. Printing
`ℹ tests 0` → exit forced 1. Removing the key → no `slow` row, `slow-output.txt` absent.

Fixture (verdict): a green full-scope manifest from `review-legs.test.js`'s CLEAN fixture plus
one `slow` row — exit 0 → `CLEAN`; exit 1 → `GATE_RED`; no `slow` row → `CLEAN` (today's
derivation, byte-identical stdout).

Fixture (init-gen): a profile JSON whose `config.gateCommand` is `npm run lint && npm test` and
`testCommand` `npm test` → `generate` succeeds and prints the D4 warning once; the same with
`gateCommand` `npm run lint && npm test {testDirs}` → no warning. `gate-check` over a host with
the first config → `{"scoped":false,"gateRunsSuite":true,"slowTier":false}`; with the second
and `slowTestCommand` declared → `{"scoped":true,"gateRunsSuite":false,"slowTier":true}`.

`[NEEDS CLARIFICATION: blocking or advisory — D2/D3 make a red slow leg GATE_RED like a red
suite. The alternative is a required-but-non-blocking leg whose red is a review finding (the
at-risk precedent). Decide at lock.]`

## Acceptance Criteria

- **AC-20261101-07-1**: WHEN `$(spec-paths contract)` is read THE SYSTEM SHALL contain the heading `## Test tiers (optional)` after `## Test expiry (required)`, name `slowTestCommand` in that section and in the § Required config keys optional run, and `$(spec-paths contract-hash)` SHALL differ from the value stamped in this repo's own `.claude/spec.config.json` before this spec (e.g. not `1c783fff201e`) → writes tests/contract/contract-keys.test.js
- **AC-20261101-07-2**: WHEN review-legs runs full scope over the inert fixture with `slowTestCommand` `bash slow.sh` THE SYSTEM SHALL append `{"leg":"slow","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":2},"scope":"full"}` positioned after the `smoke` row and before `ac-matrix`, write `slow-output.txt` whose first line is `$ bash slow.sh`, leave 1 line in `slow-counter`, and exit 0 → writes tests/review/review-legs-slow-leg.test.js
- **AC-20261101-07-3**: WHEN `slow.sh` exits 1 THE SYSTEM SHALL print `RED_BLOCKING: slow` and exit 1; WHEN it exits 0 printing `ℹ tests 0` THE SYSTEM SHALL append the slow row with `exit` `1` and `testsExecuted` `0` → writes tests/review/review-legs-slow-leg.test.js
- **AC-20261101-07-4**: WHEN the config declares no `slowTestCommand` THE SYSTEM SHALL append no `slow` row, write no `slow-output.txt`, and print no summary line containing `slow` (e.g. the manifest's leg set equals today's eleven) → writes tests/review/review-legs-slow-leg.test.js
- **AC-20261101-07-5**: WHEN `verdict.js --manifest <m> --workflow <CLEAN return>` reads a green full-scope manifest plus `{"leg":"slow","exit":1,"observed":{"skips":0,"todos":0,"testsExecuted":17},"scope":"full"}` THE SYSTEM SHALL print `GATE_RED` on stdout line 1; with the slow row's `exit` `0` it SHALL print `CLEAN` → writes tests/review/verdict-slow-leg.test.js
- **AC-20261101-07-6**: WHEN the same manifest carries no `slow` row THE SYSTEM SHALL CONTINUE TO print `CLEAN` and name no missing leg (e.g. stderr empty) → reuses tests/review/review-legs.test.js :: AC-20260903-02-12
- **AC-20261101-07-7**: WHEN `init-gen generate` runs over a profile whose `config.gateCommand` is `npm run lint && npm test` THE SYSTEM SHALL exit 0 and print exactly one stderr line equal to the D4 warning; WHEN the gate is `npm run lint && npm test {testDirs}` THE SYSTEM SHALL print no line containing `unscoped` → writes tests/init-gen/gate-check.test.js
- **AC-20261101-07-8**: WHEN a profile's `config.slowTestCommand` is `""` THE SYSTEM SHALL exit 2 with stderr containing `config.slowTestCommand`; WHEN it is `bash slow.sh` THE SYSTEM SHALL write it into `.claude/spec.config.json` verbatim and the deliverable manifest SHALL contain `{"claim":"slow tier command runs","kind":"exec","target":"bash slow.sh"}` → writes tests/init-gen/gate-check.test.js
- **AC-20261101-07-9**: WHEN `init-gen gate-check --root <host> --json` runs over a config with `gateCommand` `npm run lint && npm test`, `testCommand` `npm test`, no `slowTestCommand` THE SYSTEM SHALL print `{"scoped":false,"gateRunsSuite":true,"slowTier":false}` and exit 0; over `gateCommand` `npm run lint && npm test {testDirs}` with `slowTestCommand` `npm run test:slow` it SHALL print `{"scoped":true,"gateRunsSuite":false,"slowTier":true}` → writes tests/init-gen/gate-check.test.js
- **AC-20261101-07-10**: WHEN `lib/invariants.js`'s `configCommandStrings` reads a config carrying `slowTestCommand` `bash scripts/slow.sh` THE SYSTEM SHALL include that string in its result (e.g. the result array contains `"bash scripts/slow.sh"`) → writes tests/init-gen/gate-check.test.js

## Assumptions (escalation triggers)

- A1: `verdict.js` builds `blockingLegs` as a `Set` from `REVIEW_BLOCKING` before the derivation and `legIsRed` reads `legRows.get(leg)` (checked: lines 568-590, 649-650); adding `slow` conditionally touches no required-leg logic — **if false:** the `slow` row's red is folded into the gate check by review-legs (exit forced on the gate row) and verdict stays untouched; D3 is amended.
- A2: The review driver's `BLOCKING_LEGS` (line 843) is the only driver-side list that decides STOPPED on a red row — **if false:** every such list enters the File Plan row for the driver.
- A3: `init-gen generate` has one validation seam (`validateProfile`) and one allow-list seam (`deriveAllowEntries`), and `manifestExtras`-style rows can be appended programmatically (spec 01 D6 added one the same way) — **if false:** the manifest row is written by the session via `manifestExtras` and D4 drops it.
- A4: `tests/contract/` may not exist; `tests/host-config/` holds the contract-adjacent tests today — **if false:** the AC-1 test moves to `tests/host-config/contract-keys.test.js`, same assertions.
- A5: Editing the contract changes `spec-paths contract-hash`; this repo's own `.claude/spec.config.json` is re-stamped by the build's existing contract-hash path and every other host reports stale grounding at doctor check 2 until `/spec:init` refresh, as specs/20261101/01 and 02 already accept — **if false:** STOP, ask the user.
- A6: No existing fixture declares `slowTestCommand` or asserts the exact set of manifest legs by count (grep at lock: `legs.length`, `eleven`, `REVIEW_LEGS.length`) — **if false:** the pin enters the File Plan and is updated in place with this spec's AC-ID.

## Rationale

The measured hosts are not sloppy; they did what the pipeline rewards. Every AC owes an executed
test, a skip is a hard finding, a stub is not its dependency, and the observable surface must be
reached through the real route — so a Worker boot test, a parity script, a PGlite migration test
all land as `it(` blocks in the one `testCommand`, which is also the gate. The doctrine's sentence
"Build never runs unscoped" was true of this repository's own config and never checked anywhere
else. This spec does the three things prior art agrees on: a declared slow tier that the default
command excludes (Go `-short`, pytest `-m "not slow"`, Rust `#[ignore]`, Vitest `--project`),
run once per change (Bazel sizes with their own timeouts), and a scoped fast gate as the inner
loop. It names no tool: `slowTestCommand` is whatever string the host's runner needs, exactly as
`testCommand` and `runtime.bootCommand` already are.

Blocking was chosen over advisory because the slow tier is the host's own tests over its own tree;
a red there is a red. The `[NEEDS CLARIFICATION]` stays because the at-risk precedent went the
other way and the owner should choose with the consequence in view: advisory means a review can
close with a failing integration test as a waivable finding. The leg does not run at close: close
writes a canonical doc and a rules fold, which the fast gate covers, and the slow tier ran over
the same tree minutes earlier (spec 06 would reuse even that if the tree is unchanged).

An unscoped gate is reported, never refused: a runner that accepts no file arguments has no
honest place for `{testDirs}`, and `gate-resolve.js` already returns the raw command in that
case. Doctor's line and init's warning are the whole mechanism; the contract text is the binding
home. Rejected: a numeric budget (no source prescribes one; it would be a guess dressed as a
rule), a plugin-side slow-test detector (stack-shaped), and a change to expiry (specs/20261101/01
makes the scanner host-declared; doctor check 20 already reports the retirable count — the
62% figure measured on zubu-web this week is a host decision to apply, not a plugin gap).

## Canonical Delta

docs/canonical/pipeline.md § The build gate is scoped; review runs the whole suite — append:
"The scoping is a host declaration the contract now spells out: `gateCommand` carries `{testDirs}`
wherever its runner takes paths, `/spec:init` warns when it does not, and `/spec:doctor` check 25
reports it. The contract also names the slow tier: `slowTestCommand`, the host's own invocation of
the tests it excludes from `testCommand`, runs once per legs iteration as the blocking `slow` leg,
alone in its wave after smoke, never at close, and a host that declares none is unchanged.
(specs/20261101/07-the-gate-is-scoped-and-the-slow-tier-has-a-home.md)"

docs/canonical/review-legs.md — new section after § The suite leg: "## The slow leg\n\nWhen the
host declares `slowTestCommand`, `review-legs.js` runs it bare once per legs iteration as the
`slow` leg, typed like the suite row, blocking in review-legs, `verdict.js` (blocking only when
the row is present, never required) and the driver alike. Absent key, absent row.
(specs/20261101/07)"
