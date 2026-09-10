---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: gate
design: false
breaking: false
depends_on: [specs/20260909/06-ephemeral-serve-ports.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: 614c32451ec398fd4df4e4b34dbe40816454eb59
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
| D3 | `spec/scripts/port-check.js --root <dir> [--json]` walks every file under `<root>/tests` (location-based, no name or extension filter, `node_modules` and `.git` excluded) and reports each line matching one of three classes: `listen-literal` (`listen(` followed by a non-zero integer ≥ 1024), `computed-port` (an integer ≥ 1024 followed by `+` and, within a short run of intervening characters, `process.pid` or `Math.random` — the run tolerates nesting such as `((process.pid + k) % 300)` and `Math.floor(Math.random() * 2000)`), `port-flag-literal` (`--port` followed, as the next argv string or shell token, by a non-zero integer ≥ 1024). Output one line per finding `<relpath>:<line>: <class> <matched text>`; exit 0 clean, 1 findings, 2 usage; `--json` prints `{findings:[{file,line,class,text}]}` (AC-20260909-07-4, AC-20260909-07-5, AC-20260909-07-6) | The Gotcha on name-shape filters: classify by location and admit everything inside it. URL strings (`localhost:6006`) and `--port 0`/`listen(0)` match none of the three |
| D4 | `spec/bin/spec-paths` gains `port-check` (and the usage string lists it); `spec/commands/doctor.md` gains check 18 **Fixed test ports** (deterministic, advisory) invoking `node "$(spec-paths port-check)" --root .` with the remedy "bind `--port 0` / `listen(0)` and read the bound port back from the server rather than choosing one" — the technique only, with a host-neutral parenthetical that a repo may wrap it in a shared test helper; the remedy names no file path, because `doctor.md` ships to hosts that have no `tests/helpers.js` (AC-20260909-07-7) | Same shape as checks 14–17. A remedy citing this repo's own helper would send every host looking for a file it does not have |
| D5 | The check is pinned green against this repo by a test that runs it on `ROOT` (AC-20260909-07-8) | Spec 06 removed the literals; this keeps them out |
| D6 | The hang bound is proven by a test that reads `testCommand` from `.claude/spec.config.json`, keeps every flag except the two reporter pairs, replaces `--test-timeout=45000` with `--test-timeout=1500`, and runs it against a fixture test that opens a `net` server and never resolves (AC-20260909-07-9) | The mechanism is what is being pinned; a 45 s wait in the suite would itself breach the file budget |
| D7 | `docs/canonical/gate-integrity.md`'s budget paragraph records the stderr destination and the timeout/force-exit pair [no-ac: applied by Canonical Delta] | Canon names the wiring hosts copy |
| D9 | `tests/mocks/mocks-driver-client.test.js`'s two `'--port', '4321'` literals (lines 180 and 192 at the pre-image) become `'0'`; the assertions are untouched (AC-20260909-07-8) | Both runs are `notes address --id N001 --change …`, which the driver refuses on an earlier argument before any socket is bound, so the flip is assertion-neutral — verified by executing spec 07's own `port-flag-literal` regex against the spec 06 worktree on 2026-09-10: exactly these two lines, `exit would be 1 (2 findings)`. Spec 06's owner confirmed the same two lines and queued the flip to this spec rather than growing a diff its reviewer already held; without this row the fix lands out-of-plan and `scope-reconcile` reports it |
| D10 | `tests/mocks/notes-layer-isolation.test.js`'s test-level `{ timeout: 60000 }` drops to `45000` `[no-ac: a literal alignment with D1's bound; the per-file budget already reds the file either way]` | A test-level option OVERRIDES the CLI default rather than racing it (A4 corrected), so that one test's bound would stay 60 s while every other test's is 45 s. Aligning it removes the exception rather than documenting it |
| D8 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D11 (build ruling, 2026-09-10) | `tests/doctor/port-check.test.js` composes every port literal it writes into its synthetic fixtures — and every assertion message quoting one — from concatenated fragments (e.g. `'server.listen(' + '4173)'`), so the test file's own source bytes never spell one of D3's three patterns; the bytes written to the fixture files and every assertion stay identical (AC-20260909-07-4, AC-20260909-07-8) | Build-time collision: D3's Gotcha forbids classifying by file name or extension, so the walk admits `tests/doctor/port-check.test.js` itself, and its inline fixture literals are real `listen-literal`/`computed-port`/`port-flag-literal` matches — 6 findings, all in that one file, which reds AC-8's clean pin. Exempting a path or narrowing a regex is the forbidden fix (it reopens exactly the hole the Gotcha names); moving the literal out of the source text is assertion-neutral and keeps the check at full strength. Executed 2026-09-10: `port-check.js --root .` reported `tests/doctor/port-check.test.js:22,23,24,25,26,60` and nothing else |

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
| tests/mocks/mocks-driver-client.test.js | MODIFY | tests | D9: two `'--port', '4321'` literals → `'0'`; no assertion changes (AC-20260909-07-8) |
| tests/mocks/notes-layer-isolation.test.js | MODIFY | tests | D10: test-level `{ timeout: 60000 }` → `45000` |
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
    computed-port       /\b[1-9]\d{3,4}\s*\+\s*.{0,24}?(?:process\.pid|Math\.random)/
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
  [retired: specs/20260910/01-contention-proof-budget-and-uncapped-suite.md — D1 drops
  `--test-concurrency=3` from the pinned string; the live pin is AC-20260910-01-1]
- **AC-20260909-07-2**: WHEN `.claude/spec.config.json` is read THE SYSTEM SHALL hold `gateCommand`
  equal to `node --test --test-concurrency=3 --test-timeout=45000 --test-force-exit {testDirs}`
  → test in tests/test-file-budget.test.js
  [retired: specs/20260910/01-contention-proof-budget-and-uncapped-suite.md — D1 drops
  `--test-concurrency=3` from the pinned string; the live pin is AC-20260910-01-2]
- **AC-20260909-07-3**: WHEN the two-reporter wiring runs a passing fixture file THE SYSTEM SHALL
  print exactly one `__FILE_BUDGET_OK__` line on stderr and none on stdout, and WHEN
  `SPEC_TEST_FILE_BUDGET_MS=5` runs a 30 ms fixture THE SYSTEM SHALL print `__FILE_BUDGET_RED__` on
  stderr and exit 1 → tests in tests/test-file-budget.test.js
- **AC-20260909-07-4**: WHEN `port-check.js --root <dir>` runs on a synthetic `tests/` holding one
  file with `server.listen(4173)`, one with `const p = 41230 + (process.pid % 300)`, one with
  `const q = 41830 + ((process.pid + offset) % 300)`, one with
  `const r = 43000 + Math.floor(Math.random() * 2000)`, and one with
  `['serve', '--port', String(4599)]` THE SYSTEM SHALL exit 1 and print exactly five lines —
  one `listen-literal`, three `computed-port`, one `port-flag-literal` — each starting
  `tests/<file>:<line>:` → test in tests/doctor/port-check.test.js
- **AC-20260909-07-5**: WHEN the synthetic `tests/` holds only `listen(0)`, `'--port', '0'`,
  `'http://localhost:6006'` and `await freePort()` THE SYSTEM SHALL exit 0 and print nothing →
  test in tests/doctor/port-check.test.js
- **AC-20260909-07-6**: WHEN `--json` is passed on the AC-4 tree THE SYSTEM SHALL print one JSON
  object whose `findings` array has length 5, carrying one `listen-literal`, three
  `computed-port` and one `port-flag-literal` `class` value; and WHEN `--root` is absent or names a dir with no
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
- A4 (**corrected 2026-09-10**): a test-level `{timeout}` option OVERRIDES the CLI default rather
  than racing it, so tests/mocks/notes-layer-isolation.test.js's `{ timeout: 60000 }` (line 63)
  would keep a 60 s bound under D1's 45 s flag. The promise still holds by a second mechanism —
  the per-file 45 s budget reporter reds that file regardless — but the exception is removed
  rather than documented: D10 drops the literal to 45000 — **if false** (the CLI flag does win):
  D10 is a no-op alignment and nothing else changes.
- A6: the two `'--port', '4321'` literals in tests/mocks/mocks-driver-client.test.js (lines 180,
  192) are the only `port-flag-literal` hits left after spec 06 lands, and D9 flips them here
  rather than in 06 — executed 2026-09-10, this spec's own regexes over the spec 06 worktree
  returned exactly those two lines and no `computed-port` or `listen-literal` hit — **if false**
  (a further literal survives 06): it joins D9's row; AC-8 is the oracle and cannot go green
  until it does.
- A7: spec 06 has landed its consolidation, so `tests/` carries no pid- or random-derived port
  when AC-8 runs — **if false:** `depends_on` is enforced by the state gate; STOP and build 06
  first (A5 already covers the ordering; this names the observable).
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

A live in-repo confirmation arrived from spec 06's build on 2026-09-10: with the SIGKILL removed
from `serveAtlas`'s timeout path, `--test-name-pattern='AC-20260909-06-4'` did not fail — it
HUNG, the stub child outliving the rejection and holding the runner alive until the leftover
`node --test`, the harness child and the stub were killed by pid after ~90 s of no output;
restoring the kill returned `✔ AC-20260909-06-4 (5004 ms)` with no orphan left. That is this
spec's premise observed rather than argued: the failure mode of a missing kill in this repo is a
hang, not a red, and D1's timeout/force-exit pair is what converts it into a bounded red.

Force-exit buys the bound at a named cost: when node cancels a hung test and tears the process
down, that test's `finally` never runs — no `Browser.close`, no serve `stop()` — so a Chrome or
`design-atlas.js serve` child spawned by the cancelled test outlives the runner. This is accepted
rather than solved here: a 45 s red with a handful of orphaned children beats a 3 h hang, and
with spec 06's ephemeral ports an orphan poisons no port for the next run. A tracked-child
SIGKILL on `process.on('exit')` in the shared helper is the shape of the real fix and is
deliberately left out of this spec — it belongs with the helper, not with the gate wiring.

The port check is deliberately narrow: three regex classes over every file under `tests/`,
nothing clever. It will not catch a port smuggled through a variable, and it is advisory. Its
job is to turn the slow re-accumulation of pid-derived windows into a doctor line the next
session sees, which is what was missing for the three months those windows grew.

Two build-time departures, folded from the deviations sidecar. First, the AC-3 OK-case half of
the wiring pin was green before any implementation landed: `--test-reporter-destination` is a
node:test CLI mechanism this reporter already honored unmodified, so D2's "output contract
... is unchanged" is literally true and only the red half (`SPEC_TEST_FILE_BUDGET_MS=5` over a
30 ms fixture) plus AC-1/AC-2's host-config pins were genuinely red. Second, the check turned out
to flag its own test: D3's Gotcha forbids classifying by file name, so the walk admits
`tests/doctor/port-check.test.js`, whose inline fixture literals are real matches — six findings,
all in that one file, reddening AC-8. D11 resolves it by composing those literals from
concatenated fragments; the bytes written to the fixtures and every assertion are unchanged.
Exempting a path or narrowing a regex was rejected as the fix that reopens exactly the hole the
Gotcha closes.

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
