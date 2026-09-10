---
date: 2026-09-10
status: done
tier: critical
area: gate
design: false
breaking: false
depends_on: [specs/20260909/06-ephemeral-serve-ports.md, specs/20260909/07-hang-bound-and-port-check.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-10
build_base: main
open_markers: 0
diff_base: 99dee42bcea1919b9bae4acddf9139d50ceef010
---

# The per-file budget proves an offender alone, and the suite stops running on three cores

## Goal

`npm test` takes five minutes on an eighteen-core machine because `--test-concurrency=3` caps
it at three workers. The cap exists because the per-file budget guard measures wall time, which
inflates 30–60% under load, so raising parallelism turned healthy files red — the guard was
measuring the machine, not the files. This spec makes the guard prove an offender by re-running
only the suspects one at a time, then drops the cap. Done means: the suite runs at the runner's
own default fan-out, a file that is only slow under load is not a red, a file that is slow alone
still is, and the one file that genuinely exceeds the budget is split.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--test-concurrency=3` is removed from BOTH `.claude/spec.config.json` `gateCommand` and `testCommand`; no replacement flag is added, so `node --test` uses its own default fan-out (`os.availableParallelism() - 1`). `testCommand` becomes `node --test --test-timeout=45000 --test-force-exit --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stderr`; `gateCommand` becomes `node --test --test-timeout=45000 --test-force-exit {testDirs}`; `package.json` `scripts.test` stays `testCommand + " 'tests/**/*.test.js'"` (AC-20260910-01-1, AC-20260910-01-2) | Executed 2026-09-10 on 18 cores: capped at 3 the suite is 300.7 s (772.7 s CPU, 2.6x efficiency); uncapped it is 76.4 / 77.1 / 77.9 / 79.0 s across four consecutive runs, all 1,572 tests green, variance ±1.6%. Rejected: an explicit adaptive expression (`cores-2`) — the runner's own default already adapts, and a hand-rolled clamp is a second derivation of the same number |
| D2 | `scripts/test-file-budget-reporter.js` gains a confirmation step. On end-of-stream, files whose summed `duration_ms` exceeds the budget are **suspects**, not offenders: the reporter re-runs exactly those files via `spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=' + __filename, '--test-reporter-destination=stdout', …suspects])` (no `spec` reporter in the child, so its stdout carries only measurement lines), `SPEC_TEST_BUDGET_CONFIRMING=1` set and `NODE_TEST_CONTEXT` deleted in the child env, `cwd` = the parent's. A suspect still over budget in that serial child is a confirmed offender → `__FILE_BUDGET_RED__` and `process.exitCode = 1`, as today. A suspect under budget alone prints `__FILE_BUDGET_CONTENTION__` and sets no exit code. With `SPEC_TEST_BUDGET_CONFIRMING=1` the reporter measures and prints `__FILE_BUDGET_MEASURED__ <file> <ms>ms` per file only, spawning nothing and setting no exit code. The env-var name is exported as `CONFIRMING_ENV` so the pin in D4 reads it in-process (AC-20260910-01-3, AC-20260910-01-4, AC-20260910-01-5, AC-20260910-01-8) | Spiked 2026-09-10: a custom reporter may spawn at end-of-stream and still set `process.exitCode`; the real suite reproduced both arms. Rejected: measuring per-file CPU instead of wall (probed — `test:pass`/`test:complete`/`test:summary` carry only `details.duration_ms`, no rusage; workers are child processes); pinning the guard to a reference concurrency (a CI box need not honour it, and it freezes the number); a `scripts.test` wrapper (breaks the byte-equality pin and `test-hang-bound.test.js`'s argv derivation, and the blocking whole-suite review leg runs bare `testCommand`, so a side script would never reach it) |
| D7 | The serial confirm child is bounded, never unbounded: its argv carries `--test-timeout=<budget * CHILD_TIMEOUT_FACTOR>` and `--test-force-exit`, and its `spawnSync` call carries `timeout: budget * CHILD_TIMEOUT_FACTOR * (suspects + 1) + CHILD_STARTUP_SLACK_MS`; `CHILD_STARTUP_SLACK_MS` (`30000`) and `CHILD_TIMEOUT_FACTOR` (`2`) are new exports. The child's per-test timeout is strictly above the budget so an offender under `2 x budget` measures truthfully and a slower one reports a lower bound rather than the threshold itself; a file in which a test timed out or was cancelled is confirmed regardless of its measured number, marked by a ` timedout` suffix on its measured line; and `aloneMs > budget` is compared before any rounding. A suspect the bounded child leaves unmeasured still falls to the existing confirmed branch (AC-20260910-01-9, AC-20260910-01-10) | Review finding, executed 2026-09-10: with no timeout on the child, one never-resolving test measures just over the parent's 45,000 ms timeout, becomes a suspect, and is re-run in a child whose own per-test timeout is 0 — the run hangs forever and a killed parent orphans the child. `node:test`'s per-invocation timeout does not inherit across a spawn. The startup slack is a second executed finding: a bare `node --test` child costs 90-160 ms to reach its first measurement line, so a bound of `budget * (suspects + 1)` alone kills the child at any fixture-scale budget and turns every suspect into a false confirmed red. A first attempt set the child's timeout to the budget itself; the reviewer executed a 30 ms test against a 5 ms budget and measured 6 ms, never 30 ms, with one run in forty rounding to exactly 5 ms and printing CONTENTION with exit 0 for a six-fold offender — a threshold must never also be the clamp on the thing it judges. This restores the bound specs/20260909/07 established, which that spec's own pin cannot see because it strips the reporter pairs from `testCommand` |
| D3 | `tests/mocks/mocks-driver-client.test.js` splits: its last five tests (`AC-20260907-10-11`, `AC-20260907-10-22`, `AC-20260907-10-14`, `AC-20260907-10-15`, `AC-20260907-10-16` — every `test(` from line 206 to end of file, with each test's preceding `// AC-…` divider comment) move **verbatim** into a new sibling `tests/mocks/mocks-driver-client-2.test.js`; names, bodies, assert messages, inline comments and AC tags move byte-for-byte, none is rewritten, merged, dropped or retagged. The only non-verbatim edit is the file header: each sibling's header comment lists only the AC tags it holds, and the new file's header cites this spec's D3 as the reason it exists. Both files import the family's existing `mocks-driver-fixtures.js` and the same `helpers` names (AC-20260910-01-7) | Executed 2026-09-10, the file ALONE at `--test-concurrency=1` on a settled machine: 43,185 / 45,559 / 49,853 / 54,707 ms against a 45,000 ms budget — a genuine offender that straddles and mostly exceeds the line, not a contention artifact. It is the only such file: the next candidates measure 27,598 ms (`mocks-driver-2`) and 23,190 ms (`replay`) alone. The verbatim-move rule is sibling spec 20260903/06 D1's, for the same reason: node:test parallelises across files and serialises within one |
| D4 | `tests/consistency/test-concurrency-cap.test.js` retires its `--test-concurrency <= 3` assertion on both commands and pins the replacement mechanism instead: neither command may carry a `--test-concurrency` flag, and the reporter module loaded in-process must export `CONFIRMING_ENV === 'SPEC_TEST_BUDGET_CONFIRMING'` (the export exists only because the confirm step does — a regeneration that drops the confirm drops the export). The file keeps its name and its D15 header citation, amended to record that D15's cap is superseded by the contention-proof guard (AC-20260910-01-6) | D15 (specs/20260907/09) capped parallelism because a green full-suite run stopped proving anything. Both causes it was reacting to are now closed — port collisions by specs/20260909/06, false budget reds by D2 here — so the guard, not the cap, is what makes a run reproducible. Deleting the test outright would leave the regeneration hole D15 was written to close |
| D5 | `size-baseline.json`'s entry for `scripts/test-file-budget-reporter.js` is raised with `cite` = this spec `[no-ac: the ratchet's own --check in the gate is the oracle]` | D2 grows the reporter; the pipeline rules make an uncited raise a hard review finding |
| D6 | `docs/canonical/gate-integrity.md`'s budget paragraph records that the budget is confirmed serially before it reds, and that neither gate command caps parallelism `[no-ac: applied by Canonical Delta]` | Canon names the wiring hosts copy |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| .claude/spec.config.json | MODIFY | other | D1: `testCommand`, `gateCommand` drop `--test-concurrency=3` |
| package.json | MODIFY | other | D1: `scripts.test` |
| scripts/test-file-budget-reporter.js | MODIFY | scripts | D2: suspects → serial confirm → offenders; `SPEC_TEST_BUDGET_CONFIRMING` child mode |
| tests/test-file-budget.test.js | MODIFY | tests | AC-20260910-01-1, AC-20260910-01-2 (retag of AC-20260909-07-1/-2, literals updated), AC-20260910-01-3, AC-20260910-01-4, AC-20260910-01-5, AC-20260910-01-8 |
| tests/consistency/test-concurrency-cap.test.js | MODIFY | tests | AC-20260910-01-6 |
| tests/mocks/mocks-driver-client.test.js | MODIFY | tests | D3: the five tests from line 206 to end of file move out; header AC list trimmed (AC-20260910-01-7) |
| tests/mocks/mocks-driver-client-2.test.js | CREATE | tests | D3: the moved tests, verbatim (AC-20260910-01-7) |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D3: the helper block both siblings need moves here rather than being duplicated into the new sibling `[no-ac: behaviour-neutral relocation; the dup-windows check in the gate is the oracle]` |
| dup-baseline.json | MODIFY | other | D3: the two siblings' identical require preamble raised to 7 windows each, `cite` = this spec `[no-ac: the dup check's own run in the gate is the oracle]` |
| size-baseline.json | MODIFY | other | D5: reporter raise, `cite` = this spec |

## Contracts

The reporter's stderr sentinel alphabet. `__FILE_BUDGET_OK__` and `__FILE_BUDGET_RED__` keep
their existing text and meaning; two lines are added.

```
__FILE_BUDGET_OK__ slowest <relpath> <ms>ms of <budget>ms
__FILE_BUDGET_RED__ <relpath> <ms>ms > <budget>ms — split this file into sibling *.test.js files (node:test runs one file's tests serially; specs/20260903/06-test-suite-critical-path.md)
__FILE_BUDGET_CONTENTION__ <relpath> <loadMs>ms under load but <aloneMs>ms alone — under the <budget>ms budget, not a red
__FILE_BUDGET_MEASURED__ <relpath> <ms>ms[ timedout]   # <ms> is the raw summed duration, decimals and all
```

`__FILE_BUDGET_MEASURED__` is emitted only when `SPEC_TEST_BUDGET_CONFIRMING=1` (the serial
child), never in a normal run. Exit-code contract, unchanged in shape: the reporter may only
raise a run's exit code to 1, never lower one the run already set, and only for a **confirmed**
offender.

```
resolveBudget(env) -> number     # unchanged: min(45000, SPEC_TEST_FILE_BUDGET_MS) when that is a positive integer, else 45000
BUDGET_MS === 45000              # unchanged
CONFIRMING_ENV === 'SPEC_TEST_BUDGET_CONFIRMING'   # new export: the child-mode env-var name
CHILD_STARTUP_SLACK_MS === 30000 # new export (D7): the confirm child's process-startup allowance
CHILD_TIMEOUT_FACTOR === 2       # new export (D7): the child's per-test timeout as a multiple of the budget
```

The serial child, exactly:

```
spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', '--test-timeout=' + budget * CHILD_TIMEOUT_FACTOR, '--test-force-exit',
   '--test-reporter=' + __filename, '--test-reporter-destination=stdout', ...suspectRelPaths],
  { cwd: process.cwd(), encoding: 'utf8',
    timeout: budget * CHILD_TIMEOUT_FACTOR * (suspectRelPaths.length + 1) + CHILD_STARTUP_SLACK_MS,
    env: { ...process.env, SPEC_TEST_BUDGET_CONFIRMING: '1' } /* NODE_TEST_CONTEXT deleted */ })
```

The parent parses `__FILE_BUDGET_MEASURED__ <relpath> <ms>ms` lines from the child's stdout; the
child's exit status is not consulted. A suspect with no measurement line is confirmed (see
Behavior).

**The child is bounded, and its measurement stays truthful (D7).** The child's per-test timeout is
`budget * CHILD_TIMEOUT_FACTOR`, strictly above the budget, so a file that genuinely runs over the
budget is measured at its real serial duration rather than truncated to the threshold it is about
to be compared against. `spawnSync` carries
`timeout: budget * CHILD_TIMEOUT_FACTOR * (suspects + 1) + CHILD_STARTUP_SLACK_MS`, where
`CHILD_STARTUP_SLACK_MS === 30000` is a fixed allowance for node's own process and test-runner
startup — without it a fixture running at a tiny budget is killed before it can print its
measurement line. The slack is not a per-test bound; the child's own `--test-timeout` is.

**A timed-out test confirms, it never measures.** A test that times out still emits `test:fail`
carrying a `duration_ms` near its timeout, so a hang would otherwise arrive as an ordinary
measurement instead of as an absent one. The confirming child therefore appends ` timedout` to the
measured line for any file in which a test timed out or was cancelled, and the parent confirms such
a suspect regardless of the number on the line. A hanging test thus dies inside the child at
`budget * CHILD_TIMEOUT_FACTOR` and is reported red; a child that hangs anyway is killed at the
`spawnSync` deadline and leaves no line at all, which the fail-closed branch already confirms.

**The comparison does not round first — and neither does the wire.** The confirming child prints
its raw summed duration, decimals included, and the parent compares that raw number against the
budget. Rounding happens only when a `__FILE_BUDGET_RED__`, `__FILE_BUDGET_CONTENTION__` or
`__FILE_BUDGET_OK__` line is built for a human to read. Rounding anywhere upstream of the
comparison — in the parent or on the wire — puts a genuine offender's verdict on the wrong side of
the line whenever its measurement lands within half a millisecond of the budget.

**What the measured number means.** For a file that exceeds the budget but finishes inside the
child's own per-test timeout, the number is its true serial duration. For a file confirmed by the
timed-out rule the number is a lower bound, not a measurement: the test was cut off at
`budget * CHILD_TIMEOUT_FACTOR`, so the file is at least that slow and the printed figure says so.
The verdict never rests on the number in that case, only the diagnosis does.

## Behavior

A normal run streams to end, sums each file's `duration_ms`, and finds zero suspects on a
healthy suite — one `__FILE_BUDGET_OK__` line, no child process, no measurable cost. When a
file is over budget the reporter spawns one serial child for the suspects only. That child runs
the same reporter in confirming mode, which measures and prints without spawning again, so the
recursion is one level deep by construction. The parent reads `__FILE_BUDGET_MEASURED__` lines
off the child's stdout and decides per file.

A suspect the child cannot measure at all — the child crashed, timed out, or printed no
measurement line for that file — is treated as **confirmed**, not as contention: the guard
fails closed, because an unmeasurable file is exactly the shape of a file that hangs.

## Acceptance Criteria

- **AC-20260910-01-1**: WHEN `tests/test-file-budget.test.js` reads `.claude/spec.config.json` and `package.json` THE SYSTEM SHALL find `testCommand` equal to `node --test --test-timeout=45000 --test-force-exit --test-reporter=spec --test-reporter-destination=stdout --test-reporter=./scripts/test-file-budget-reporter.js --test-reporter-destination=stderr` byte-for-byte and `scripts.test` equal to that string plus `" 'tests/**/*.test.js'"` → the retagged byte-equality pin in `tests/test-file-budget.test.js`
- **AC-20260910-01-2**: WHEN the same test reads `gateCommand` THE SYSTEM SHALL find it equal to `node --test --test-timeout=45000 --test-force-exit {testDirs}` byte-for-byte → the retagged gate pin in `tests/test-file-budget.test.js`
- **AC-20260910-01-3**: WHEN a two-file fixture suite runs under `SPEC_TEST_FILE_BUDGET_MS=50` where one file sleeps ~300 ms and is over budget both under load and alone THE SYSTEM SHALL print `__FILE_BUDGET_RED__` naming that file on stderr and exit 1 (`tests/slow.test.js` at 303 ms > 50 ms → confirmed red) → a confirm test in `tests/test-file-budget.test.js`
- **AC-20260910-01-4**: WHEN a fixture file exceeds the budget in the parallel stream but measures under it in the serial confirm THE SYSTEM SHALL print `__FILE_BUDGET_CONTENTION__` naming that file on stderr, print no `__FILE_BUDGET_RED__` line for it, and leave the run's exit code at the underlying test result (0 when every test passed). Literal fixture: `tests/contended.test.js` holds one test that sleeps 300 ms, or 10 ms when `process.env.SPEC_TEST_BUDGET_CONFIRMING === '1'`; under `SPEC_TEST_FILE_BUDGET_MS=50` the run prints `__FILE_BUDGET_CONTENTION__ tests/contended.test.js <~300>ms under load but <~10>ms alone — under the 50ms budget, not a red` and exits 0 → a contention test in `tests/test-file-budget.test.js`
- **AC-20260910-01-5**: WHEN the reporter runs with `SPEC_TEST_BUDGET_CONFIRMING=1` over a fixture that exceeds the budget THE SYSTEM SHALL print exactly one `__FILE_BUDGET_MEASURED__ <relpath> <ms>ms` line per file on its destination stream, no `__FILE_BUDGET_RED__`/`__FILE_BUDGET_OK__`/`__FILE_BUDGET_CONTENTION__` line, and exit 0 when every test passed (`tests/slow.test.js` at ~500 ms under `SPEC_TEST_FILE_BUDGET_MS=50` → `__FILE_BUDGET_MEASURED__ tests/slow.test.js <ms>ms`, exit 0 — a second MEASURED line or a RED line would mean the child mode recursed or judged) → a recursion-guard test in `tests/test-file-budget.test.js`
- **AC-20260910-01-6**: WHEN `tests/consistency/test-concurrency-cap.test.js` reads both gate commands and requires the reporter module THE SYSTEM SHALL fail if either command matches `/--test-concurrency\b/` and fail if `require('scripts/test-file-budget-reporter.js').CONFIRMING_ENV !== 'SPEC_TEST_BUDGET_CONFIRMING'` (today's config, carrying `--test-concurrency=3`, fails the first assertion) → the amended pin in `tests/consistency/test-concurrency-cap.test.js`
- **AC-20260910-01-7**: WHEN the two `mocks-driver-client` sibling files are read together THE SYSTEM SHALL contain all nine of the original file's `test(` blocks exactly once across the pair, with `AC-20260907-10-1`, `-2`, `-17`, `-10` in the first and `AC-20260907-10-11`, `-22`, `-14`, `-15`, `-16` in the second, and no test name text altered → a split-integrity test in `tests/test-file-budget.test.js`
- **AC-20260910-01-9**: WHEN a fixture file holds a test that never resolves and the reporter's parent run carries `--test-timeout=<t>` with `SPEC_TEST_FILE_BUDGET_MS` below `<t>` THE SYSTEM SHALL terminate within `budget * CHILD_TIMEOUT_FACTOR * (suspects + 1) + CHILD_STARTUP_SLACK_MS` milliseconds of the confirm starting, print `__FILE_BUDGET_RED__` naming that file, exit non-zero, and leave no surviving child process (literal fixture: `tests/hang.test.js` holding `test('hangs', () => new Promise(() => {}))`, run under `SPEC_TEST_FILE_BUDGET_MS=500` and `--test-timeout=500`, ends in under ~2 s with `__FILE_BUDGET_RED__ tests/hang.test.js`, not an unbounded hang) → a bounded-confirm test in `tests/test-file-budget.test.js`
- **AC-20260910-01-10**: WHEN a fixture file genuinely exceeds the budget alone THE SYSTEM SHALL confirm it as an offender on every run, never as contention, whether it exceeds the budget by running long or by timing out inside the confirm child; a file confirmed this way SHALL report a duration strictly greater than the budget, being its true serial duration when it finished inside the child's own timeout and a lower bound when it did not (literal fixture: `tests/thirty.test.js` holding one test that sleeps 30 ms, under `SPEC_TEST_FILE_BUDGET_MS=5`, prints `__FILE_BUDGET_RED__` and exits 1 on twenty consecutive runs with a reported duration above 5 ms on every one of them, and the reporter exports `CHILD_TIMEOUT_FACTOR === 2`) → a boundary test in `tests/test-file-budget.test.js`
- **AC-20260910-01-8** (SHALL CONTINUE TO): WHEN a suite runs with every file under budget THE SYSTEM SHALL CONTINUE TO print exactly one `__FILE_BUDGET_OK__ slowest <file> <ms>ms of 45000ms` line on stderr, SHALL CONTINUE TO keep both sentinels off stdout, and SHALL CONTINUE TO expose `BUDGET_MS === 45000` and a `resolveBudget` that tightens only → the existing pins in `tests/test-file-budget.test.js`, retagged

## Assumptions (escalation triggers)

- A1: On a 6-core machine the runner's default fan-out is 5 workers — the same fan-out that produced the 2026-09-08 coin flip that D15 capped. Both causes then live are now closed (port collisions by specs/20260909/06, false budget reds by D2 here). — **if false:** a 6-core run reds on a test that passes in isolation → re-add `--test-concurrency=3` to both commands, open a `/spec:escape` row naming the test, and treat the cap as permanent grounding rather than a measurement artifact.
- A2: A node:test custom reporter may `spawnSync` at end-of-stream and still influence the run's exit code. — **Executed 2026-09-10:** a spike reporter spawned a serial child and the run exited 1 on a confirmed offender (`__CONFIRMED_RED__ tests/slow.test.js 303ms alone > 50ms`, `exit=1`); against the real suite it emitted `__SUSPECT__ 1 file(s) over budget under parallel load — confirming serially` then confirmed. — **if false:** move the confirm into a `scripts.test` wrapper and rewrite the byte-equality pin and `test-hang-bound.test.js`'s argv derivation with it.
- A3: Omitting `--test-concurrency` yields `os.availableParallelism() - 1` workers, not 1. — **Executed 2026-09-10:** eight fixture files sleeping 1.5 s each completed in 1.64 s wall with no flag (serial would be 12 s), on a box reporting `availableParallelism = 18`. — **if false:** the suite would slow to serial → restore an explicit `--test-concurrency` set to `cores-1`.
- A4: `tests/test-hang-bound.test.js` keeps working when `--test-concurrency=3` leaves `testCommand`: it strips reporter pairs, rewrites `--test-timeout=45000`, and asserts only that the first token is `node`. — **if false:** the hang-bound pin reds → add the concurrency flag back to that test's derived argv only, never to the config.
- A5: `tests/mocks/mocks-driver-client.test.js`'s last five tests are separable — they share only the `mocks-driver-fixtures.js` module, not file-local mutable state. — **if false:** move a different, genuinely independent subset that still brings both siblings under budget, and record the deviation.
- A6: A node:test worker process inherits the env the runner was spawned with, so the serial child's `SPEC_TEST_BUDGET_CONFIRMING=1` is visible inside AC-4's fixture test and the fixture can be deterministic rather than load-dependent. — **Executed 2026-09-10:** a one-test fixture sleeping `env.SPEC_TEST_BUDGET_CONFIRMING === '1' ? 10 : 300` ms, run under `node --test --test-concurrency=1` with a measuring reporter on stdout: `302ms` with the variable unset, `12ms` with it set to `1`, both exit 0. — **if false:** the contention fixture cannot be made deterministic → AC-4's test instead runs the reporter in-process over a synthetic event stream (a `test:pass` event whose `duration_ms` exceeds the budget) with the spawn injected, and records the deviation.

## Rationale

The cap was a rational response to a lying instrument. On 2026-09-08 a full-suite run at the
runner's default fan-out passed every test but pushed seven files past the 45 s per-file budget,
and a second run failed a genesis test that passed in isolation. The owner capped parallelism at
three, which made runs reproducible and tripled the wall clock. Measurement on 2026-09-10 shows
the seven files were never the problem: per-file wall time inflates 30–60% purely from
contention (`mocks-driver-client` 43–55 s alone, 52.7 s at 12 workers, 59.7 s at 16, 65.0 s
uncapped; `replay` 20.8 s alone, 43.6 s uncapped), and the guard sums exactly that inflated
number. The genesis failure was a port collision, closed since by specs/20260909/06.

So the fix is to make the guard prove its claim rather than to keep the machine idle. The
confirm lives inside the reporter, not in a wrapper, for three reasons: the blocking whole-suite
review leg runs bare `testCommand` (a `npm run test:confirm` side script would never reach it);
`scripts.test` is pinned byte-equal to `testCommand` plus the glob; and `test-hang-bound.test.js`
derives its argv by string-munging `testCommand`. Keeping `testCommand` a bare `node --test …`
string leaves all three intact.

Fragile points. The recursion guard is an env var — a future edit that forgets to set it in the
child spawn turns one confirm into an unbounded fork chain; the guard is therefore pinned by its
own AC rather than left to reading. The confirm's cost is one extra serial run of the suspects,
paid only on the red path, and a suite with many genuine offenders would pay it repeatedly —
acceptable while the count is one, worth revisiting above three. `mocks-driver-client`'s spread
(43.2–54.7 s across four serial runs) means its post-split siblings should land well under the
budget, not just under it; if either sibling measures above ~35 s alone, split further rather
than accepting a file that will re-offend on a slower machine.

Collision closure at lock (`--literal test-concurrency`): six literals-leg hits. Four are File
Plan rows (`.claude/spec.config.json`, `package.json`, `tests/consistency/test-concurrency-cap.test.js`,
`tests/test-file-budget.test.js`). Two are waived: `.claude/rules/spec-pipeline.md` names the
flag inside a Gotchas entry as the history of a broken pin, which stays true as history; and
`size-baseline.json` carries the literal only as the cap test's file name, which D4 keeps. The
one `executes` hit (`tests/test-file-budget.test.js` runs the reporter) is a File Plan row.

Folded from the deviations sidecar at close. **The split's helpers.** D3 scoped its verbatim
rule to test blocks and their divider comments, which does not reach the file-local helpers the
moved tests call (`notesPath`, `writeNotesFile`, `readNotesFile`, `nowIso`, `isoDaysAgo`,
`patchStatus`, `sha256`, `stubNpxScreenshot`). Duplicating them into the new sibling tripped the
repo's duplicate-window gate at 21 windows, so they were moved into `mocks-driver-fixtures.js` —
the module D3 already names as the siblings' shared import — and both files now import them. No
test body changed in either move. The siblings' remaining 7 windows are their identical require
preamble, raised with a cite as five sibling pairs in this repo already are.
**AC-20260910-01-3 is a continuity pin, not a red-until-landed pin.** Its literal example, a file
over budget both under load and alone, is observationally identical with or without the confirm
step — Contracts keeps the confirmed-red line's existing text and meaning — so its test passes on
pre-D2 code. D2's genuinely red carriers are AC-4 and AC-5.

Rejected and recorded: an explicit `cores-2` clamp (the runner's default already adapts, and a
second derivation of the same number is a drift seam); a two-lane split quarantining the
Chrome-driving files (measured — 89.1 s overlapped versus 77.9 s for a single uncapped lane, so
the lane machinery costs 11 s and buys nothing); `--test-concurrency=16` (73.2 s but +21% summed
contention, driving the guard deeper red); deleting `test-concurrency-cap.test.js` (leaves open
the regeneration hole D15 closed).

## Canonical Delta

`docs/canonical/gate-integrity.md`, the budget paragraph: the per-file budget is confirmed
before it reds. A file whose summed test duration exceeds 45 s in a parallel run is a suspect,
not an offender; the reporter re-runs the suspects one at a time and reds only those still over
the budget alone, printing `__FILE_BUDGET_CONTENTION__` for the rest. Per-file wall time inflates
substantially under load, so an unconfirmed budget check measures the machine rather than the
file. Neither `gateCommand` nor `testCommand` caps `--test-concurrency`; both use the runner's
own default fan-out, and the confirming guard — not a cap — is what keeps a green run meaningful.
