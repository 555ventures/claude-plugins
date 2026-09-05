---
date: 2026-09-03
status: implementing
tier: standard
area: gate-integrity
design: false
breaking: false
depends_on: [specs/20260903/06-test-suite-critical-path.md]
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 9796f9da2228f414ec630077ba3fff3c3de5dcfb
---

# Per-file runtime budget: the suite goes red when one test file becomes the floor

## Goal

Sibling spec 06 splits the one test file whose serial runtime was the whole suite's wall
clock. Nothing stops the next file that grows past fifty exec-a-script tests from silently
becoming the floor again — the suite stays green, only slower, and nobody times it. This spec
makes that condition red: a `node:test` custom reporter sums each file's test durations and,
when any file exceeds a fixed budget, prints the file with a "split this file" remedy and
fails the run. It is wired into both spellings of the suite this repo runs — `npm test` (the
doctor's claim and JJ's hand runs) and the host `testCommand` (the review's `suite` leg, the
close-time re-run, red-check's per-file runs). Done means: a file over budget cannot pass the
`suite` leg, an under-budget suite is unchanged apart from one extra summary line, and the
reporter can never turn a failing run green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The guard is a **`node:test` custom reporter**, `scripts/test-file-budget-reporter.js` (Node built-ins only), that consumes the runner's event stream, sums `details.duration_ms` of every `test:pass`/`test:fail` event with `nesting === 0` per `data.file`, and after the stream ends sets `process.exitCode = 1` when any file's sum exceeds the budget (AC-20260903-07-2, AC-20260903-07-3) | Node 26 emits no file-level event (spiked: only per-test events carry `file`), so per-file duration is a sum — and because tests within a file run serially (spec 06 A2), the sum is the file's wall time. A reporter runs inside `npm test` with zero extra processes; the alternatives (a wrapper script re-parsing TAP, a consistency test counting `test(` calls) either add a layer or measure a proxy with a waive list. |
| D2 | The budget is the constant `BUDGET_MS = 45000`, exported from the reporter module. `SPEC_TEST_FILE_BUDGET_MS` may only **tighten** it: `resolveBudget(env)` returns `min(45000, n)` when the variable parses as a positive integer and `45000` otherwise (AC-20260903-07-4) | 45 s is 3× the post-split floor (`smoke-shutdown-behavior`, 14.4 s of real `sleep`) and ~3× the largest shard (≈16 s), so full-suite contention on a slower machine has headroom, while a file that regrows to the 95 s shape is red by a wide margin. The env hook exists so the reporter's own tests can exercise the red path in under a second; it cannot loosen, so it is not an escape hatch — there are no sanctioned env-gated skips. |
| D3 | **Wiring**: `package.json` `scripts.test` becomes `node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stdout 'tests/**/*.test.js'`; `.claude/spec.config.json` `testCommand` becomes the identical string **without** the trailing glob (bare discovery finds the same files, and red-check appends a file path to it). `gateCommand` (`node --test {testDirs}`) is untouched (AC-20260903-07-6, AC-20260903-07-1) | The `suite` leg and the close-time re-run execute `config.testCommand`, not `npm test` (`review-legs.js` wave 1b; `spec-review-driver.js` `runCloseTimeGate`) — so a guard only in `package.json` would never bite in the pipeline. Scoped gate runs need no budget. `npm test` as the `testCommand` was rejected: npm swallows a trailing path argument, which breaks red-check's `{testCommand} <file>` form. |
| D4 | **Output contract** (sentinel lines, stdout, after the spec reporter's summary): over budget → one line per offending file, worst first, `__FILE_BUDGET_RED__ <repo-relative path> <ms>ms > <budget>ms — split this file into sibling *.test.js files (node:test runs one file's tests serially; specs/20260903/06-test-suite-critical-path.md)`; otherwise exactly one `__FILE_BUDGET_OK__ slowest <repo-relative path> <ms>ms of <budget>ms` line (`(none) 0ms` when no test ran). Paths are relative to `process.cwd()`; ms are rounded integers (AC-20260903-07-2, AC-20260903-07-3) | Machine contracts here are sentinel lines; the OK line carrying the slowest file makes every green run print the number a maintainer needs without a separate timing pass. Neither line matches `testCountPattern` (`ℹ tests (\d+)`) or `skipReportPattern`, so the leg's last-match parsing is unaffected. |
| D5 | The reporter **never lowers** the exit status: it sets `exitCode` to 1 only, never to 0, and never calls `process.exit` (AC-20260903-07-5) | A reporter that wrote `exitCode = 0` on an under-budget run would mask node:test's own failure exit — the worst possible defect for a gate. |
| D6 | The reporter is a **host script under `scripts/`**, beside `spec-patterns.sh`, not under `spec/scripts/` — so it is not a plugin surface, owes no `spec/entrypoints.json` row, no `spec-paths` key, and no `plugin.json` bump `[no-ac: placement; the entrypoints consistency test's scope (spec/scripts + spec/workflows) is the evidence]` | This repo's own suite hygiene is host grounding, exactly like the patterns sweep; hosts that want the same guard copy the file. |
| D7 | **User ruling (build, 2026-09-04):** the guard's first live run reddened `tests/genesis/tournament.test.js` (8 tests, ~46–49 s serial, alone or under the full suite — it was the suite's real ~52 s floor, not the post-split shards spec 06 measured). Remedy applied in this spec, not deferred and not a budget raise: split it by AC family into `tests/genesis/tournament.test.js` (AC-20260827-01-1, AC-20260902-08-3, AC-20260827-01-3, AC-20260827-01-4), `tests/genesis/tournament-probe-pick.test.js` (AC-20260902-08-8/-15, AC-20260827-01-6, AC-20260827-01-8) and `tests/genesis/tournament-decided.test.js` (AC-20260827-01-7), sharing helpers through `tests/genesis/tournament.fixtures.js`; test bodies move verbatim, no assertion changes, every shard under 25 s alone (AC-20260903-07-1) | The three options were split here, pause and split under a separate spec, or raise the budget to 60 s; raising would leave the suite at its current floor and make the guard bite only on files worse than today's worst. Splitting is the spec's own stated remedy and the mechanical pattern spec 06 established. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| scripts/test-file-budget-reporter.js | CREATE | scripts | D1/D2/D4/D5: async-generator reporter, `module.exports = reporter` plus `module.exports.BUDGET_MS` and `module.exports.resolveBudget`; header per Worker Rules (usage, owner citation, what it does NOT do, exit-status note) |
| tests/test-file-budget.test.js | CREATE | tests | AC-20260903-07-2, AC-20260903-07-3, AC-20260903-07-4, AC-20260903-07-5, AC-20260903-07-6 |
| package.json | MODIFY | other | D3: `scripts.test` carries both reporters (spec + budget, each to stdout) ahead of the glob |
| .claude/spec.config.json | MODIFY | other | D3: `testCommand` = the `package.json` command minus the trailing `'tests/**/*.test.js'`; `gateCommand` unchanged |
| tests/genesis/tournament.test.js | MODIFY | tests | D7: keeps AC-20260827-01-1, AC-20260902-08-3, AC-20260827-01-3, AC-20260827-01-4 verbatim; helpers move to the fixtures module |
| tests/genesis/tournament-probe-pick.test.js | CREATE | tests | D7: AC-20260902-08-8/-15, AC-20260827-01-6, AC-20260827-01-8 moved verbatim |
| tests/genesis/tournament-decided.test.js | CREATE | tests | D7: AC-20260827-01-7 moved verbatim |
| tests/genesis/tournament.fixtures.js | CREATE | tests | D7: shared constants/helpers of the three tournament shards (no `test(` calls) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D7: the retired-literal sweep's waive list gains `tests/genesis/tournament-probe-pick.test.js` — the AC-20260902-08-8 regression that names `style-tile` as its input moved there verbatim |

## Contracts

```js
// scripts/test-file-budget-reporter.js — shape workers implement
'use strict'
const BUDGET_MS = 45000
function resolveBudget(env) {                       // D2: tighten-only
  const n = Number(env && env.SPEC_TEST_FILE_BUDGET_MS)
  return Number.isInteger(n) && n > 0 ? Math.min(BUDGET_MS, n) : BUDGET_MS
}
async function* reporter(source) {                  // D1, D4, D5
  const budget = resolveBudget(process.env)
  const perFile = new Map()                         // abs file → summed duration_ms
  for await (const ev of source) {
    if ((ev.type === 'test:pass' || ev.type === 'test:fail') && ev.data.nesting === 0 && ev.data.file) {
      perFile.set(ev.data.file, (perFile.get(ev.data.file) || 0) + ev.data.details.duration_ms)
    }
  }
  // … rank, relativise against process.cwd(), yield the D4 lines; process.exitCode = 1 iff any over
}
module.exports = reporter
module.exports.BUDGET_MS = BUDGET_MS
module.exports.resolveBudget = resolveBudget
```

Invocation shapes the reporter must serve (all spiked, Node v26.0.0):

| Caller | Command |
|--------|---------|
| `npm test`, doctor claim | `node --test <flags> 'tests/**/*.test.js'` |
| `suite` leg, close-time re-run | `node --test <flags>` (bare discovery) |
| red-check per file | `node --test <flags> "tests/x.test.js"` |

where `<flags>` = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stdout`.

Test harness for `tests/test-file-budget.test.js`: build a scratch tree with `tmpdir()`, spawn
`process.execPath` with the flags above but the reporter given as its **absolute** path
(`path.join(ROOT, 'scripts/test-file-budget-reporter.js')` — spiked from a foreign cwd) and
`cwd` = the scratch root, `SPEC_TEST_FILE_BUDGET_MS` set per case, `NODE_TEST_CONTEXT` deleted
from the child env (the nested-runner scrub every exec-a-runner test in this repo applies).

## Behavior

- Under budget, a run's stdout is the spec reporter's usual output plus one `__FILE_BUDGET_OK__`
  line; exit status is whatever node:test decided.
- Over budget, the `__FILE_BUDGET_RED__` line(s) follow the summary and the process exits 1
  even though every test passed. The remedy names the fix (split) and the mechanism (serial
  within a file) so the reader does not need this spec.
- A run with a failing test and every file under budget exits 1 with the OK line — the
  reporter adds information, never a verdict of its own.
- The budget's only knob tightens. Loosening means editing `BUDGET_MS` in a reviewed diff.

Edge: the spec reporter and this reporter both write to stdout; Node interleaves whole
yielded chunks, so the OK/RED lines land after the `ℹ` summary in practice, but no test
asserts ordering — only presence (D4's parsing claim rests on the sentinel never matching the
count/skip patterns, not on position).

## Acceptance Criteria

- **AC-20260903-07-1** `[oracle: suite]`: WHEN the review's `suite` leg runs the host
  `testCommand` over the post-image THE SYSTEM SHALL exit 0 and `suite-output.txt` SHALL
  contain exactly one `__FILE_BUDGET_OK__ slowest …` line and an `ℹ tests <n>` line with
  `n ≥ 1061` — the guard is wired into the pipeline's own whole-suite observation and every
  file is under budget.
- **AC-20260903-07-2**: WHEN `node --test` runs with the two reporters over a scratch tree
  holding `tests/slow.test.js` (two tests of 250 ms each) and `tests/fast.test.js` (one 10 ms
  test) with `SPEC_TEST_FILE_BUDGET_MS=300` THE SYSTEM SHALL exit 1, print exactly one line
  starting `__FILE_BUDGET_RED__ tests/slow.test.js ` whose next token is an integer followed
  by `ms > 300ms` and which contains `split this file`, print no `__FILE_BUDGET_OK__` line,
  and still print `ℹ tests 3` and `ℹ fail 0` → tests/test-file-budget.test.js
- **AC-20260903-07-3**: WHEN the same tree runs with `SPEC_TEST_FILE_BUDGET_MS=5000` THE
  SYSTEM SHALL exit 0, print `ℹ tests 3`, print exactly one `__FILE_BUDGET_OK__` line whose
  next token is `slowest`, then `tests/slow.test.js`, then `<integer>ms of 5000ms`, and print
  no `__FILE_BUDGET_RED__` line → tests/test-file-budget.test.js
- **AC-20260903-07-4**: WHEN `resolveBudget` (required in-process from the reporter module)
  is called THE SYSTEM SHALL return: `{}` → `45000`; `{ SPEC_TEST_FILE_BUDGET_MS: '300' }` →
  `300`; `'999999999'` → `45000`; `'0'`, `'-5'`, `'abc'`, `'1.5'`, `''` → `45000` each; and
  `BUDGET_MS` SHALL equal `45000` → tests/test-file-budget.test.js
- **AC-20260903-07-5**: WHEN the AC-3 tree gains `tests/broken.test.js` (one test asserting
  `1 === 2`) and runs with `SPEC_TEST_FILE_BUDGET_MS=5000` THE SYSTEM SHALL exit 1, print
  `ℹ fail 1`, and still print exactly one `__FILE_BUDGET_OK__` line — the reporter never masks
  the runner's own failure → tests/test-file-budget.test.js
- **AC-20260903-07-6**: WHEN `package.json` and `.claude/spec.config.json` are parsed THE
  SYSTEM SHALL satisfy `pkg.scripts.test === config.testCommand + " 'tests/**/*.test.js'"`,
  `config.testCommand` SHALL start with `node --test ` and contain the exact substring
  `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stdout`,
  and `config.gateCommand` SHALL CONTINUE TO equal `node --test {testDirs}` →
  tests/test-file-budget.test.js

## Assumptions (escalation triggers)

- A1: Node 26's reporter event stream carries `data.file`, `data.nesting` and
  `data.details.duration_ms` on `test:pass`/`test:fail`, emits **no** file-level row, and a
  reporter may set `process.exitCode`. **Executed 2026-09-03 (v26.0.0):** probe reporter over
  a 2-test file printed two `test:pass` events, `nest: 0`, `f: <abs path>`, `d: 401.8`; the
  summing reporter with budget 500 over two 800 ms files → `exit=1`,
  `__FILE_BUDGET_RED__ [["tests/a.test.js",804],["tests/b.test.js",804]]`; budget 5000 →
  `exit=0`, `__FILE_BUDGET_OK__`; `ℹ tests 4` / `ℹ fail 0` present in both. **if false:**
  STOP, ask the user — the guard needs a different mechanism.
- A2: Two `--test-reporter` flags each with `--test-reporter-destination=stdout` run side by
  side and the spec reporter's `ℹ tests N` summary survives. **Executed:** same runs as A1.
  **if false:** route the budget reporter to stderr (the leg concatenates `out + err`).
- A3: A failing test under budget still exits 1 with the reporter attached. **Executed:**
  scratch tree + a `1 === 2` test → `exit=1`, `ℹ fail 1`, `__FILE_BUDGET_OK__`. **if false:**
  D5 is violated by the platform; STOP.
- A4: Bare `node --test <flags>` (no path) discovers the default patterns exactly as bare
  `node --test` does, and `<flags> "tests/a.test.js"` runs only that file. **Executed:** bare →
  `ℹ tests 4`; with one path → `ℹ tests 2`. **if false:** `testCommand` keeps the glob and
  red-check's per-file form is re-spiked before build.
- A5: A reporter given as an absolute path loads from a foreign `cwd`. **Executed:** cwd =
  scratch `tests/`, `--test-reporter=/abs/…/file-budget-reporter.js` → `exit=0`, `ℹ tests 2`,
  `__FILE_BUDGET_OK__`. **if false:** the test copies the reporter into the scratch root and
  references it as `./`.
- A6: `red-check.js` composes `{testCommand} "<file>"` via `bash -c` with `cwd = root` (read at
  plan, `runLeg`), so `./scripts/test-file-budget-reporter.js` resolves during build Phase 1;
  likewise the `suite` leg (`sh(config.testCommand)`) and `runCloseTimeGate`
  (`bash -c`, `cwd: repoRoot`). In a linked worktree the reporter file is present because it
  is tracked. **if false:** `testCommand` names the reporter by `$PWD/scripts/…`; record.
- A7: The `entrypoints` consistency test inventories `spec/scripts/` and `spec/workflows/`
  only (docs/canonical/gate-integrity.md), so a new file under root `scripts/` owes no manifest
  row. **if false:** add the row; the test's own failure text names the shape.

## Rationale

The trap spec 06 removes re-forms silently by construction: node:test parallelises across
files, so a file's growth never shows up as a red, only as a slower green. The only honest
guard measures the real quantity — per-file wall time — inside the run that already produces
it. A reporter does that with no extra process, no TAP re-parsing, and no proxy (a `test(`-call
count would need a waive list for the 64-test `verdict.test.js`, which is fast because it is
pure derivation). Timing guards can flake; the budget is deliberately 3× the post-split floor
so only a machine three times slower than the planning laptop under full-suite load could
false-red, and the remedy on a true red is the same mechanical split spec 06 performed.

`testCommand` had to change, not just `package.json`: the pipeline's whole-suite observation
runs the host `testCommand` (specs/20260903/02 D4, "bare"), so a `package.json`-only guard
would be invisible to every review. The two strings are pinned identical-modulo-glob by
AC-6 so they cannot drift apart. `npm test` as the `testCommand` was the tempting one-spelling
answer and fails on red-check's per-file form (npm drops a trailing positional).

The env knob is tighten-only for a reason worth restating: "no sanctioned env-gated skips" is
a Test Rule, and a variable that could raise the budget would be a skip in disguise. Its sole
consumer is this spec's own test file, which needs a sub-second red path.

No `plugin.json` bump: the plugin ships nothing new; this is the host's test hygiene, the same
class as `scripts/spec-patterns.sh`. A future host wanting the guard copies the file and the
two command strings.

Fragile: the OK line's "slowest file" is informational; if a later spec wants it in the
review report, that is a leg change (review-legs.js), not a reporter change. The regression
pin on `gateCommand` (AC-6's SHALL CONTINUE TO clause) is tagged on the same new test rather
than duplicated elsewhere; no existing test covers `gateCommand`'s literal value, so a new
assertion is the honest home.

## Canonical Delta

Add to `docs/canonical/gate-integrity.md`'s bullet list, after "Gates are plainly green":

- **No single test file may be the suite's floor.** `node:test` parallelises across files
  and serialises within one, so a file's serial runtime caps the whole run regardless of core
  count. `scripts/test-file-budget-reporter.js` — wired into both `npm test` and the host
  `testCommand`, so the review's `suite` leg and the close-time re-run see it — sums each
  file's test durations and fails the run (`__FILE_BUDGET_RED__ <file> …`, exit 1) when any
  file exceeds 45 s; a green run prints `__FILE_BUDGET_OK__ slowest <file> <ms>ms of 45000ms`.
  The remedy is always the same: split the file into sibling `*.test.js` files by owning AC
  family, sharing helpers through a `<family>.fixtures.js` module. The budget tightens via
  `SPEC_TEST_FILE_BUDGET_MS` (tests only) and loosens only by editing the constant in a
  reviewed diff. (specs/20260903/07-test-file-budget-guard.md)
