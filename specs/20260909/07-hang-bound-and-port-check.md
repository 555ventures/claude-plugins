---
date: 2026-09-09
status: hardened
tier: standard
area: gate
design: false
breaking: false
depends_on: [specs/20260909/06-ephemeral-serve-ports.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
---

# A hanging test is a bounded red, and a fixed test port is a doctor finding

## Goal

A test that never finishes costs 45 seconds, not three hours: both the host `testCommand` and
`gateCommand` carry `--test-timeout=45000 --test-force-exit`, and the file-budget reporter moves
to stderr because force-exit truncates a second reporter on stdout. A new deterministic doctor
check, `port-check.js`, walks `tests/` and reports every fixed or computed port literal so the
class spec 06 removed cannot creep back. Done means: a fixture test holding an open socket goes
red with exit 1 inside the timeout, the budget sentinel still prints on every run, and the check
is green against this repo.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `.claude/spec.config.json` `testCommand` becomes `node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stderr`; `package.json` `scripts.test` stays `testCommand + " 'tests/**/*.test.js'"`; `gateCommand` becomes `node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit {testDirs}` (AC-20260909-07-1, AC-20260909-07-2) | Spiked: `--test-timeout` alone marks the test failed but the open handle keeps the process alive forever; with `--test-force-exit` it exits 1 in 2 s. 45 s per test can never be tighter than the 45 s per-file budget |
| D2 | The budget reporter's destination is stderr; its output contract (`__FILE_BUDGET_OK__` / `__FILE_BUDGET_RED__`, exit 1 on red) is unchanged (AC-20260909-07-3) | Spiked: as the second reporter on stdout under force-exit its end-of-stream tail is cut and the sentinel vanishes (0/1 runs); on stderr it printed 5/5 and the red case still exits 1 |
| D3 | `spec/scripts/port-check.js --root <dir> [--json]` walks every file under `<root>/tests` (location-based, no name or extension filter, `node_modules` and `.git` excluded) and reports each line matching one of three classes: `listen-literal` (`listen(` followed by a non-zero integer ≥ 1024), `computed-port` (an integer ≥ 1024 followed by `+` and `process.pid` or `Math.random`), `port-flag-literal` (`--port` followed, as the next argv string or shell token, by a non-zero integer ≥ 1024). Output one line per finding `<relpath>:<line>: <class> <matched text>`; exit 0 clean, 1 findings, 2 usage; `--json` prints `{findings:[{file,line,class,text}]}` (AC-20260909-07-4, AC-20260909-07-5, AC-20260909-07-6) | The Gotcha on name-shape filters: classify by location and admit everything inside it. URL strings (`localhost:6006`) and `--port 0`/`listen(0)` match none of the three |
| D4 | `spec/bin/spec-paths` gains `port-check` (and the usage string lists it); `spec/commands/doctor.md` gains check 18 **Fixed test ports** (deterministic, advisory) invoking `node "$(spec-paths port-check)" --root .` with the remedy "bind `--port 0` / `listen(0)` and read the port back, or use `tests/helpers.js`'s `freePort`/`serveAtlas`" (AC-20260909-07-7) | Same shape as checks 14–17 |
| D5 | The check is pinned green against this repo by a test that runs it on `ROOT` (AC-20260909-07-8) | Spec 06 removed the literals; this keeps them out |
| D6 | The hang bound is proven by a test that reads `testCommand` from `.claude/spec.config.json`, keeps every flag except the two reporter pairs, replaces `--test-timeout=45000` with `--test-timeout=1500`, and runs it against a fixture test that opens a `net` server and never resolves (AC-20260909-07-9) | The mechanism is what is being pinned; a 45 s wait in the suite would itself breach the file budget |
| D7 | `docs/canonical/gate-integrity.md`'s budget paragraph records the stderr destination and the timeout/force-exit pair [no-ac: applied by Canonical Delta] | Canon names the wiring hosts copy |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| .claude/spec.config.json | MODIFY | other | D1: `testCommand`, `gateCommand` |
| package.json | MODIFY | other | D1: `scripts.test` |
| tests/test-file-budget.test.js | MODIFY | tests | D1/D2: the wiring pin (AC-20260903-07-6 retagged to AC-20260909-07-1, AC-20260909-07-2) reads the sentinel from stderr (AC-20260909-07-3) |
| tests/test-hang-bound.test.js | CREATE | tests | AC-20260909-07-9 |
| spec/scripts/port-check.js | CREATE | scripts | D3 |
| spec/bin/spec-paths | MODIFY | scripts | D4: key + usage |
| spec/commands/doctor.md | MODIFY | doctrine | D4: check 18 |
| tests/doctor/port-check.test.js | CREATE | tests | AC-20260909-07-4, AC-20260909-07-5, AC-20260909-07-6, AC-20260909-07-7 |
| tests/doctor/port-check-clean.test.js | CREATE | tests | AC-20260909-07-8 |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 bump |

## Contracts

```text
.claude/spec.config.json
  testCommand: node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit
               --test-reporter=spec --test-reporter-destination=stdout
               --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stderr
  gateCommand: node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit {testDirs}
package.json scripts.test = testCommand + " 'tests/**/*.test.js'"

port-check.js --root <dir> [--json]
  walk: <root>/tests/** (every regular file; skip node_modules, .git)
  classes and regexes (per line, first match wins):
    listen-literal      /\blisten\(\s*(?:[1-9]\d{3,4})\b/
    computed-port       /\b[1-9]\d{3,4}\s*\+\s*\(?\s*(?:process\.pid|Math\.random)/
    port-flag-literal   /--port['"]?\s*[,:]?\s*(?:String\()?\s*['"]?(?:[1-9]\d{3,4})\b/
  stdout line: <relpath>:<line>: <class> <matched text>
  exit: 0 none · 1 findings (advisory) · 2 usage (no --root, root has no tests/)
  --json: {"findings":[{"file","line","class","text"}]}
```

## Behavior

- `npm test` with every file green: stdout carries the spec reporter (`ℹ tests N` still parses for
  `testCountPattern`), stderr carries one `__FILE_BUDGET_OK__` line, exit 0.
- One test opens a socket and never resolves: after 45 s node marks it `cancelled` with
  `'test timed out after 45000ms'`, force-exit ends the process, exit 1, the budget line still
  prints on stderr.
- `/spec:doctor` check 18 on a tree with `const port = 41230 + (process.pid % 300)`: one line
  `tests/x.test.js:12: computed-port 41230 + (process.pid`, exit 1, reported advisory.

## Acceptance Criteria

- **AC-20260909-07-1**: WHEN `.claude/spec.config.json` and `package.json` are read THE SYSTEM SHALL
  hold `testCommand` equal to the D1 string byte-for-byte and `scripts.test` equal to
  `testCommand + " 'tests/**/*.test.js'"` → test in tests/test-file-budget.test.js
- **AC-20260909-07-2**: WHEN `.claude/spec.config.json` is read THE SYSTEM SHALL hold `gateCommand`
  equal to `node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit {testDirs}`
  → test in tests/test-file-budget.test.js
- **AC-20260909-07-3**: WHEN the two-reporter wiring runs a passing fixture file THE SYSTEM SHALL
  print exactly one `__FILE_BUDGET_OK__` line on stderr and none on stdout, and WHEN
  `SPEC_TEST_FILE_BUDGET_MS=5` runs a 30 ms fixture THE SYSTEM SHALL print `__FILE_BUDGET_RED__` on
  stderr and exit 1 → tests in tests/test-file-budget.test.js
- **AC-20260909-07-4**: WHEN `port-check.js --root <dir>` runs on a synthetic `tests/` holding one
  file with `server.listen(4173)`, one with `const p = 41230 + (process.pid % 300)`, and one with
  `['serve', '--port', String(4599)]` THE SYSTEM SHALL exit 1 and print exactly three lines, one
  per class, each starting `tests/<file>:<line>:` → test in tests/doctor/port-check.test.js
- **AC-20260909-07-5**: WHEN the synthetic `tests/` holds only `listen(0)`, `'--port', '0'`,
  `'http://localhost:6006'` and `await freePort()` THE SYSTEM SHALL exit 0 and print nothing →
  test in tests/doctor/port-check.test.js
- **AC-20260909-07-6**: WHEN `--json` is passed on the AC-4 tree THE SYSTEM SHALL print one JSON
  object whose `findings` array has length 3 with `class` values `listen-literal`,
  `computed-port`, `port-flag-literal`; and WHEN `--root` is absent or names a dir with no
  `tests/` THE SYSTEM SHALL exit 2 with a usage line → tests in tests/doctor/port-check.test.js
- **AC-20260909-07-7**: WHEN `spec-paths port-check` runs THE SYSTEM SHALL print the path of
  `spec/scripts/port-check.js`, and `spec/commands/doctor.md` SHALL contain a numbered check whose
  body names `spec-paths port-check` → test in tests/doctor/port-check.test.js
- **AC-20260909-07-8**: WHEN `port-check.js --root <ROOT>` runs against this repository THE SYSTEM
  SHALL exit 0 with no findings → test in tests/doctor/port-check-clean.test.js
- **AC-20260909-07-9**: WHEN the host `testCommand`'s flags (reporter pairs removed,
  `--test-timeout` set to 1500) run a fixture test that binds a `net` server and returns a
  never-resolving promise THE SYSTEM SHALL exit 1 within 10 s with stdout containing
  `test timed out after 1500ms` → test in tests/test-hang-bound.test.js

## Assumptions (escalation triggers)

- A1 (executed micro-spike, 2026-09-09, Node 26.0.0): `node --test --test-timeout=1500` on a
  fixture holding an open `net` server did not exit within 60 s (observed process still alive,
  no output); adding `--test-force-exit` exited 1 in 2 s with `✖ … 'test timed out after
  1500ms'`, `ℹ cancelled 1` — **if false** on the host's Node: STOP, the bound does not hold;
  report the version.
- A2 (executed micro-spike, 2026-09-09): with the budget reporter as the second reporter on
  stdout under `--test-force-exit`, `__FILE_BUDGET_OK__` printed 0 times (passing-only and
  hang cases); with `--test-reporter-destination=stderr` it printed 1 time in 5/5 runs, and the
  red case (`SPEC_TEST_FILE_BUDGET_MS=5`, 30 ms test) printed `__FILE_BUDGET_RED__` with exit 1.
  A one-line event-logging reporter in the same position confirmed the mechanism: on stdout it
  received `test:summary` but never reached stream end; on stderr it did — **if false:** the
  reporter writes its sentinel through `fs.writeSync(2, …)` at `test:summary` instead; amend D2.
- A3: nothing but tests/test-file-budget.test.js and docs consume the budget sentinel
  (`grep -rl __FILE_BUDGET` hits the reporter, its test, package.json, spec.config.json and
  gate-integrity.md only) — **if false:** the consumer reads stderr; add its row.
- A4: a test-level `{timeout}` option (tests/mocks/notes-layer-isolation.test.js sets 60000)
  coexists with the CLI flag; whichever fires first cancels the test — **if false** (the CLI flag
  is ignored where a test-level option exists): that file's option drops to 45000; add the row.
- A5: spec 06 has landed, so the clean test (AC-8) is green on first run — **if false:**
  `depends_on` is enforced by the state gate; STOP and build 06 first.

## Rationale

The naive fix — a per-test timeout — was spiked and falsified before it reached this table: node
cancels the test but the open socket keeps the event loop alive, so the process still hangs. The
force-exit flag is the half that ends the process, and it has a side effect the spike also
caught: a second reporter sharing stdout loses its tail. Moving the budget reporter to stderr is
therefore not cosmetic; it is what keeps the file-budget gate observable under the new flags.
The two `ℹ tests N` / `ℹ skipped N` patterns the config declares stay on stdout with the spec
reporter, so `testCountPattern`/`skipReportPattern` parsing is unaffected.

The port check is deliberately narrow: three regex classes over every file under `tests/`,
nothing clever. It will not catch a port smuggled through a variable, and it is advisory. Its
job is to turn the slow re-accumulation of pid-derived windows into a doctor line the next
session sees, which is what was missing for the three months those windows grew.

Rejected: `--test-timeout` only (falsified); a per-file `{timeout}` sweep across serve tests
(bounds the test, not the process — same hang); a stdout `fs.writeSync` rewrite of the reporter
(the spike showed the stream end itself is lost, not just the flush).

## Canonical Delta

docs/canonical/gate-integrity.md, the file-budget paragraph: "`npm test` and the host
`testCommand` carry `--test-timeout=45000 --test-force-exit` so a test that never resolves is a
`cancelled` red and the process ends; the budget reporter is wired to **stderr** because a
second reporter on stdout is truncated under force-exit; the scoped `gateCommand` carries the
same two flags without the reporter. `/spec:doctor` check 18 (`port-check.js`) reports any fixed,
computed or `--port <n>` literal under `tests/`." (specs/20260909/07-hang-bound-and-port-check.md)
