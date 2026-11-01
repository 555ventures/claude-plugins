---
date: 2026-11-01
status: implementing
tier: critical
area: review-legs
breaking: false
depends_on: []
brief: n/a
open_markers: 0
build_base: main
spiked: 2026-11-01
diff_base: 2d51850e3b5a6458fedbe722038399246aba49a5
---

# The gate that ran the suite is the suite

## Goal

The review stage was built for a scoped gate: `gateCommand` carries `{testDirs}`, so the gate
runs the spec's own test directories and the `suite` leg is the one observation of the whole
tree. Nothing makes a host scope its gate, and the two hosts measured this week do not — their
gate ends in the bare test command — so one green review runs the full suite in the gate leg,
again in the suite leg, and twice more at `--mark closed`. On a 7-to-20-minute suite that is the
difference between a review that takes minutes and one that takes an hour, and no leg records
how long it took. Done means a gate that demonstrably ran the whole suite is reused as the suite
leg (in review-legs and at close), a scoped gate behaves exactly as today, and every legs run
writes wall-clock milliseconds per leg so a slow leg is visible without a profiler.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/gate-resolve.js` exports `gateRunsSuite(rawGate, resolvedGate, testCommand)` → `true` only when all three hold: `rawGate` contains neither `{testDirs}` nor `{scopeDirs}`; `testCommand` is a non-empty string; splitting `resolvedGate` on `&&` yields a segment whose `trim()` equals `testCommand.trim()`. `\|\|`, `;`, `\|`, a subshell, an env prefix or a quoting difference never match (the suite then runs for real — a miss costs one redundant run, never a missed observation). (AC-20261101-05-1) | One helper, one definition, read by review-legs and the driver so the two cannot drift; `&&` is the only operator under which "the gate exited 0" implies "the test command ran and exited 0". |
| D2 | `review-legs.js` wave 1b: when `gateRunsSuite(config.gateCommand, resolved.gate, config.testCommand)` is true AND the gate row's `observed.testsExecuted` is a number, the suite leg spawns nothing and appends `{"leg":"suite","exit":E,"observed":{...gateObserved,"reused":"gate"},"scope":…}` where `E` is `1` when `isUnobserved(gateObserved.testsExecuted)` else the gate row's exit; `suite-output.txt` is not written and the `outputs:` line omits it. When `testsExecuted` is an unavailability object (no pattern declared, or pattern-no-match) the bare `testCommand` runs exactly as today. Applies in full and `--fix-delta` scope. (AC-20261101-05-2, AC-20261101-05-3, AC-20261101-05-4, AC-20261101-05-5, AC-20261101-05-6, AC-20261101-05-7) | A reused row must carry the same evidence the real run would (skips, todos, executed count); without an executed count the gate could have gone green on lint alone with the runner never reached, so the suite runs for real — the vacuous-green rule (`isUnobserved` → exit 1) is preserved verbatim. |
| D3 | `spec-review-driver.js` `runCloseTimeGate()`: after the resolved-gate re-run exits 0, when `gateRunsSuite(gateConfig.gateCommand, resolved.gate, gateConfig.testCommand)` is true the whole-suite re-run is skipped and one stdout line `close-time suite: reused the gate run (<resolved gate>)` is printed; otherwise the bare `testCommand` re-run and its red refusal are unchanged. (AC-20261101-05-8, AC-20261101-05-9) | The close re-run exists to cover files CLOSE writes; a gate that runs the suite over the committed close tree already covers them. |
| D4 | `review-legs.js` records wall-clock milliseconds per leg: every `appendRow` call site measures from its spawn (or, for a reused/unavailable row, records `0`) and the script writes `<out-dir>/timings.json` `{"<leg>": <ms>, …, "total": <ms>}` (one key per appended row, in append order, `total` last) before the manifest rename; the summary line gains ` (<s>.<d>s)` after the observed JSON, e.g. `✅ gate           exit=0 {"skips":0,…} (12.4s)`. Manifest rows are byte-for-byte unchanged. (AC-20261101-05-10) | Rows are pinned by `deepStrictEqual` across five suites and read by `verdict.js`; a sidecar file costs no row-shape change and the summary line is the one place a person looks. |
| D5 | Header comments: `review-legs.js`'s suite-row grammar gains `"reused":"gate"` and names `timings.json`; the driver's `runCloseTimeGate` comment drops "unconditional" and names D3's condition; `lib/gate-resolve.js`'s header names `gateRunsSuite`. `[no-ac: prose in script headers; the behaviour is pinned by AC-20261101-05-2 and AC-20261101-05-8]` | The header is each script's contract (pipeline rules § Worker Rules). |
| D7 | The close-time pin's host keeps the real `node --test` as the runner behind a bash wrapper (`test.sh` = `echo >> counter` then `node --test`), never a stub that skips the runner: `gateCommand` `true && bash test.sh`, `testCommand` `bash test.sh`, `counter` git-ignored; the pin counts `counter` lines across `--mark closed`. (AC-20261101-05-8) | The driver's close path stays pinned on a gate that really judges the tree; the wrapper makes the number of runner invocations observable without touching the runner (A7's spike). |
| D6 | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`. `[no-ac: node scripts/plugin-bump.js --check in the gate is the oracle]` | Behaviour change under `spec/` (pipeline rules § Planning). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/gate-resolve.js | MODIFY | scripts | `gateRunsSuite` export + header (D1, D5) |
| spec/scripts/review-legs.js | MODIFY | scripts | suite-row reuse, `timings.json`, summary seconds, header (D2, D4, D5) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `runCloseTimeGate` reuse + header (D3, D5) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D6) |
| tests/review/review-legs-gate-reuse.test.js | CREATE | tests | AC-20261101-05-1, AC-20261101-05-2, AC-20261101-05-3, AC-20261101-05-4, AC-20261101-05-5, AC-20261101-05-6, AC-20261101-05-10 |
| tests/review/review-driver-close-gate-reuse.test.js | CREATE | tests | AC-20261101-05-8 |

## Contracts

`lib/gate-resolve.js` (D1), additive:

```
gateRunsSuite(rawGate: string, resolvedGate: string|null, testCommand: unknown) -> boolean
  false when rawGate matches /\{testDirs\}|\{scopeDirs\}/, when resolvedGate is not a string,
  or when testCommand is not a non-empty string;
  else resolvedGate.split('&&').some(seg => seg.trim() === testCommand.trim())
```

Manifest suite row (D2), the reused alternative beside today's two:

```
{"leg":"suite","exit":E,"observed":{"skips":N,"todos":N,"testsExecuted":N,"reused":"gate"},"scope":"full"|"fix-delta"}
```

`<out-dir>/timings.json` (D4):

```
{"reconcile":412,"gate":12388,"ci":0,"suite":0,"tests":90,"at-risk":0,"patterns":230,"smoke":3104,"ac-matrix":55,"skip-reconcile":12,"promise-sweep":40,"total":16331}
```

Summary line (D4): `<glyph> <leg padEnd 14> exit=<n> <observed JSON> (<seconds to one decimal>s)`.

## Behavior

Fixture (`tests/review/review-legs-gate-reuse.test.js`, built with `makeReviewLegsHost`): stub
`lint.sh` exits 0; stub `test.sh` appends one line to `<host>/counter`, prints `ℹ tests 3` and
`ℹ skipped 0`, exits `${STUB_EXIT:-0}`; `runtime: {"inert": "fixture"}`; `capabilities`
declares `testCountPattern` `ℹ tests (\d+)` and `skipReportPattern` `ℹ skipped (\d+)`.

- Unscoped gate `bash lint.sh && bash test.sh`, `testCommand` `bash test.sh` → the counter holds
  1 line after review-legs; suite row reused; `verdict.js --workflow <CLEAN return>` derives CLEAN.
- Same host, `--fix-delta` → counter 1, suite row `scope: "fix-delta"`.
- Same host minus `testCountPattern` → counter 2 (suite ran for real), suite row carries no
  `reused` key and `testsExecuted` `{"unavailable":"no-format-declared"}`.
- `test.sh` prints `ℹ tests 0` → suite row `exit: 1`, `reused: "gate"`, `RED_BLOCKING: suite`
  (gate's own exit stays whatever the child returned, as today).
- `STUB_EXIT=1` → gate row exit 1, suite row exit 1 reused, counter 1, `RED_BLOCKING: gate,suite`.
- Scoped gate `bash lint.sh && bash test.sh {testDirs}` → counter 2, no `reused` key (today's path).

Close-time fixture (`tests/review/review-driver-close-gate-reuse.test.js`, D7): the host from
`review-driver.fixtures.js`'s `makeHost` shape with `gateCommand` `true && bash test.sh`,
`testCommand` `bash test.sh`, where `test.sh` is `echo >> counter` then `node --test` (the real
runner still judges the fixture's test file, so the gate stays a genuine gate; `counter` is
git-ignored so the close tree stays clean). The test drives the review to CLOSE, commits the
close, reads the `counter` line count, runs `--mark closed`, and asserts the count grew by
exactly 1 and the D3 line was printed. Without D3 the count grows by 2 (gate + whole-suite half).

## Acceptance Criteria

- **AC-20261101-05-1**: WHEN `gateRunsSuite` is called THE SYSTEM SHALL return `true` for (`lint && node --test`, same, `node --test`) and `false` for each of: raw `node --test {testDirs}` with resolved `node --test 'tests/*.test.js'`; (`lint || node --test`, same, `node --test`); (`lint && node --test tests/a.test.js`, same, `node --test`); (`lint && CI=1 node --test`, same, `node --test`); (`lint && node --test`, same, `""`); (`lint && node --test`, `null`, `node --test`) → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-2**: WHEN review-legs runs full scope over the unscoped fixture with `testCountPattern` declared THE SYSTEM SHALL leave exactly 1 line in `counter`, append `{"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":3,"reused":"gate"},"scope":"full"}`, print an `outputs:` line that does not contain `suite-output.txt`, and `verdict.js --manifest <m> --workflow <CLEAN return>` SHALL print `CLEAN` → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-3**: WHEN the same run carries `--fix-delta` THE SYSTEM SHALL leave 1 line in `counter` and append the suite row with `"reused":"gate"` and `"scope":"fix-delta"` as its last key → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-4**: WHEN the unscoped fixture declares no `testCountPattern` THE SYSTEM SHALL leave 2 lines in `counter` and append a suite row whose `observed` has no `reused` key and whose `testsExecuted` is `{"unavailable":"no-format-declared"}` → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-5**: WHEN the unscoped fixture's `test.sh` prints `ℹ tests 0` and exits 0 THE SYSTEM SHALL append the suite row with `exit` `1`, `testsExecuted` `0`, `reused` `gate`, and print `RED_BLOCKING: suite` → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-6**: WHEN the unscoped fixture's `test.sh` exits 1 printing `ℹ tests 3` THE SYSTEM SHALL leave 1 line in `counter`, append gate `exit` `1` and suite `exit` `1` with `reused` `gate`, and print `RED_BLOCKING: gate,suite` → writes tests/review/review-legs-gate-reuse.test.js
- **AC-20261101-05-7**: WHEN the host's gate is `node --test {testDirs}` and `testCommand` `node --test` THE SYSTEM SHALL CONTINUE TO run the bare `testCommand` as the suite leg and append a suite row without a `reused` key (e.g. `{"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":{"unavailable":"no-format-declared"}},"scope":"full"}`) → reuses tests/review/review-legs.test.js :: AC-20260903-02-1:
- **AC-20261101-05-8**: WHEN `--mark closed` runs over a host whose raw `gateCommand` is `<lint> && <testCommand>` with no `{testDirs}` and the committed close tree is green THE SYSTEM SHALL run `testCommand` exactly once during close (e.g. the `counter` file gains exactly 1 line across the `--mark closed` invocation), print one stdout line starting `close-time suite: reused the gate run (`, and exit 0 → writes tests/review/review-driver-close-gate-reuse.test.js
- **AC-20261101-05-9**: WHEN `--mark closed` runs over a host whose gate is `node --test {testDirs}` THE SYSTEM SHALL CONTINUE TO run the resolved gate and then the bare `testCommand` and exit 0 on a green tree → reuses tests/review/review-driver-close-expiry.test.js :: AC-20260912-15-2:
- **AC-20261101-05-10**: WHEN review-legs finishes any run THE SYSTEM SHALL write `<out-dir>/timings.json` holding one non-negative integer per appended leg plus `total` as the last key (e.g. keys `["reconcile","gate","ci","suite","tests","at-risk","patterns","smoke","ac-matrix","skip-reconcile","promise-sweep","total"]` for a full-scope run on the inert fixture), and every summary line SHALL end with ` (<digits>.<digit>s)` (e.g. `✅ suite          exit=0 {"skips":0,"todos":0,"testsExecuted":3,"reused":"gate"} (0.0s)`) → writes tests/review/review-legs-gate-reuse.test.js

## Assumptions (escalation triggers)

- A1: No fixture under `tests/` declares a raw `gateCommand` without `{testDirs}` whose `&&`-segment equals its `testCommand` (spike run 2026-11-01: 378/378 review, verdict, release-legs, ceiling and consistency tests green with D1+D2 applied) — **if false:** the fixture enters the File Plan and its pin is updated in place with this spec's AC-ID, never weakened.
- A2: `verdict.js` judges the `suite` row by `exit` alone and checks `observed` only as a non-null object; nothing reads `suite.observed.*` (checked: `REVIEW_LEGS`/`REVIEW_BLOCKING`, `legIsRed`, `testsSkipped` comes from the gate row) — **if false:** the reused row keeps the exact gate `observed` and `reused` moves to a sibling `timings.json`-style sidecar; `verdict.js` is never edited by this spec.
- A3: No test pins the exact text of review-legs' summary lines past the observed JSON (grep at lock: `exit=\d+ \{` patterns and `✅ gate` matches) — **if false:** the seconds suffix moves to a separate `timings:` line after `manifest:`.
- A4: The driver's close-time run goes through `runHost` with `encoding: 'utf8'` and the gate re-run's result is in scope where D3's check lands (`runCloseTimeGate` body) — **if false:** D3 reads the config and resolved gate again locally; still one helper.
- A5: `makeReviewLegsHost` accepts a `config` with `runtime: {inert}` and `extraFiles` for the two stubs, and `env-preflight.js` exits 0 with no `testEnv` (spike harness ran this way) — **if false:** the new test builds its host inline, same shape.
- A6 (micro-spike, executed at lock): a scratch implementation of D1's rule run over the seven AC-1 shapes plus `check && lint && vitest run` / `vitest run` (true) and `lint; node --test` (false) returned the expected boolean for every row (9/9 `ok`) — **if false:** n/a, executed.
- A7 (micro-spike, executed at lock): a bash wrapper `test.sh` (`echo >> counter`; `node --test`) spawned from a process holding `NODE_TEST_CONTEXT=child` with that var deleted from the child env ran the nested runner as a top-level runner (`status 0`, `ℹ tests 1`, `ℹ pass 1`, counter 1 line); `lib/host-run.js` deletes the var the same way — **if false:** the close pin counts `node --test` invocations through a `node` shim first on PATH instead.
- A8: `tests/` holds no fixture whose raw `gateCommand` lacks `{testDirs}` while an `&&` segment equals its `testCommand` (grep at lock: the unscoped gates are genesis `true`/`exit 0` fixtures and `walkthrough-carry`'s `make hand-edit`, none with a matching `testCommand`) — **if false:** same remedy as A1.

## Rationale

The suite leg's own header says why it exists: a scoped gate cannot see a repo-wide scanner test,
so one bare whole-suite run per iteration is the blocking observation of the tree. That design
assumes the gate is scoped. The canonical doctrine even states "Build never runs unscoped" — but
`{testDirs}` is a placeholder a host may or may not write, `/spec:init` never requires it, and
both hosts measured on 2026-11-01 run `… && uv run pytest -q` and `npm run gate` (which is
`check && lint && vitest run`). For them the gate IS the whole suite, and the suite leg is a
second identical run. The close-time re-run doubles it again: four full-suite runs for one green
review, plus a fifth over at-risk files, each 7 to 21 minutes on those hosts.

D1's rule is deliberately narrow. Only `&&` guarantees that a zero exit from the gate implies the
test command ran and passed; `||`, `;`, pipes, subshells and env prefixes all admit a green gate
whose test segment never ran or whose exit was swallowed. A miss on those shapes costs one
redundant run, which is today's behaviour, never a lost observation. D2 adds a second guard the
spike surfaced: a gate whose output shows no executed-test count may have gone green on lint
alone, so the suite runs for real unless the count was observed. This keeps `isUnobserved`'s
vacuous-green rule byte-identical and keeps `verdict.js` untouched — it judges the suite row by
exit, and the reused row carries the gate's full evidence plus one provenance key.

Timings go to a sidecar file, not the row. Manifest rows are `deepStrictEqual`-pinned in five
suites and consumed by the verdict derivation; a row key would be a critical-tier change for a
diagnostic. The summary line suffix is where a person reads it.

Rejected: making `{testDirs}` mandatory (a contract change, and the hosts' gates would still be
whatever they wrote — that is specs/20261101/07's init and doctor work, not this leg's); a
`--skip-suite` flag (review-legs has no flag that skips a leg by design, and a copied row with
provenance is evidence where a skip is silence); comparing gate and suite output text (runner
output is not deterministic).

## Canonical Delta

docs/canonical/review-legs.md § The suite leg — append: "When the host's raw `gateCommand`
carries no `{testDirs}`/`{scopeDirs}` and one of its `&&` segments is exactly `testCommand`,
the gate already ran the whole suite; the suite row then copies the gate row's evidence with
`\"reused\":\"gate\"` and spawns nothing, provided the gate's executed-test count was observed —
with no count the bare run stays, so a gate green on lint alone never vouches for the suite. The
same helper, `gateRunsSuite` in `lib/gate-resolve.js`, lets the driver's close-time re-run skip
its whole-suite half. Every legs run also writes `timings.json` beside the manifest, one
wall-clock millisecond count per leg. (specs/20261101/05-the-gate-that-ran-the-suite-is-the-suite.md)"

docs/canonical/pipeline.md § The build gate is scoped; review runs the whole suite — append after
"Build never runs unscoped; review never closes on a scoped observation alone.": "A host whose
gate carries no placeholder runs unscoped everywhere; review recognises that gate as the suite
observation rather than running the suite twice (specs/20261101/05)."
