---
date: 2026-09-10
status: implementing
build_base: main
tier: critical
area: build-driver
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-10
open_markers: 0
diff_base: 246d1aaf895055fa8890594aebefb0f952ce143d
---

# Build runs a host-declared post-gate command once the scoped gate is green

## Goal

A host may declare one more command in its config, `postGateCommand`, that the build driver runs
right after the scoped gate passes, at integration and on every repair round. A red post-gate
enters the existing three-round repair loop exactly as a red gate does, so a build that passes its
own test directories but breaks a repo-wide pin (a version bump, a size ratchet, a read-load
budget, a byte-for-byte config pin) is repaired by the build's workers instead of bouncing at
review. The scoped `gateCommand` and review's `suite` leg are untouched. Done means: this repo
declares `{testCommand}` as its post-gate, a fixture host with a red post-gate lands `REPAIR`, a
host with no such key runs byte-for-byte what it runs today, and the build ledger row records
whether a post-gate was declared.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-build-driver.js`'s `runGate()` chains the host's optional `postGateCommand` (a non-empty string in the config) after the resolved scoped gate in the ONE `bash -c` child it already spawns: `<resolved gate> && echo '== postGateCommand' && <post>`. The chain's exit is the gate run's exit; a red scoped gate short-circuits and the post-gate never runs; output lands in the same `gate-<k>.log`. Nothing else in the driver changes — `handleIntegrated`, `handleRepairApplied`, `isAtRepairNow`, `REPAIR_CAP`, and the gate-cap file all see one gate run per round as today (AC-20260910-07-1, AC-20260910-07-2, AC-20260910-07-3, AC-20260910-07-5) | Executed spike (A2): bash `&&` gives exactly these three exits. Chaining into the existing child means the repair-round bookkeeping, which counts entries of one `marks.gateRuns` array, is never touched — a parallel `pinRuns` array (rejected) would have to be OR-ed into the repair-cap logic and the ESCALATE derivation. |
| D2 | The literal `{testCommand}` inside `postGateCommand` is replaced with the config's `testCommand` string before the chain is built; no other placeholder is recognized, and `{testDirs}`/`{scopeDirs}` are NOT resolved in the post-gate (AC-20260910-07-4) | This repo's value IS its `testCommand`; a second 200-character copy of that string in the config is a drift seam a byte-for-byte pin already guards on the original. Rejected: a boolean `postGate: true` meaning "run testCommand" — a host with a cheaper pin set has nowhere to name it. |
| D3 | When a post-gate is declared, the `REPAIR` step body gains one line after `gate: <log>`: `post-gate: <resolved post command> — red only after the scoped gate passed; find '== postGateCommand' in the log` (AC-20260910-07-6). The marker line itself is what D1 echoes into the log (AC-20260910-07-1) | The repair worker is routed by failing FILE; a red that comes from a repo-wide pin names files outside the File Plan, and the session needs to know which half of the log to read before it routes. Rejected: a separate `post-gate-<k>.log` — two logs per round doubles the artifact surface the step prints. |
| D4 | The `stage: "build"` ledger row's `gate` object gains `postGate: true` when the config declared a non-empty `postGateCommand` at row-write time, `false` otherwise (AC-20260910-07-7) | The only way to later measure whether the knob reduced review-time `GATE_RED` is a per-build boolean beside `finalRounds`. Additive; no consumer reads `gate` today (`fleet-reader.js` grep: none). |
| D5 | `lib/gate-resolve.js`, `review-legs.js`'s gate leg, `spec-review-driver.js`'s close-time gate re-run, and `scope-reconcile.js` are untouched: the post-gate is a build-driver-only chain, and `resolveGate()` returns the same string whether or not the key is present (AC-20260910-07-8, AC-20260910-07-9) | Review already runs the whole `testCommand` as its `suite` leg (specs/20260903/02 D1); chaining the post-gate into the shared resolver would run that suite a second time inside review's gate leg. specs/20260903/02 D7 ("build's scoped inner loops and final gate untouched") stands for the SCOPED gate: this spec adds a chained command after it and changes nothing about how `{testDirs}` resolves. |
| D6 | `spec/templates/grounding-contract.md` § Required config keys lists `postGateCommand` in its Optional set with a one-clause description; this is the spec's one contract edit and it changes `spec-paths contract-hash` — the build's host-escalation trigger for that change is EXPECTED and the session answers it "proceed, sanctioned by D6". Hosts re-stamp via `/spec:doctor` (this repo included; its stamp already trails the contract at `d84ad1eb648e` vs `84b249c1721e`) [no-ac: the deliverable is one prose line in an enumerating list — a regex over that prose is not a test (pipeline rules § Test Rules); the hash change is observed by the state-gate hook's own warning, not pinned] | The contract is the ONE binding home for config keys (core § Host Grounding: "plus the optional blocks the grounding contract enumerates"); an undocumented key would be a silent fork inside the plugin. The hash drift cost is already being paid. |
| D7 | This repo's `.claude/spec.config.json` declares `"postGateCommand": "{testCommand}"` (AC-20260910-07-10) | JJ ruling 2026-09-10: the whole suite (~60–100 s) as the value now; the 19-file pin set (~9 s, spike A3) is the downgrade if the minute per gate run starts to hurt. Which tests actually red at review is unrecoverable from history (A5), so the widest value is the honest first choice. |
| D8 | No edit to `spec/commands/build.md`, `run.md`, or `spec/doctrine/core.md`: the driver's header comment and D3's step line carry the runtime message; the contract (D6) carries the config contract [no-ac: absence of a change] | `/spec:build`'s read-load is 298 of a 300-line budget (`tests/consistency/read-load.test.js`); a new sentence forces a reflow, the fifth collision trigger in this repo's Gotchas. core.md already delegates optional keys to the contract. Printed reminders measurably fail (core § Model Placement rationale) — the mechanism is the message. |
| D9 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; no version literal anywhere in this spec [no-ac: `scripts/plugin-bump.js --check` in the suite is the oracle (pipeline rules § Planning)] | Behavior change under `spec/`. |
| D10 | `size-baseline.json` is raised for `spec/scripts/spec-build-driver.js` by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/07-post-gate-command.md` during the build, never by hand [no-ac: the ratchet's own live test is the oracle and the raise carries this spec as its cite] | A mechanism pays its own size (pipeline rules § Worker Rules). This build is the first to run its own post-gate (D7 lands in the same build), so the ratchet red surfaces at INTEGRATION rather than at review — the intended behavior, dogfooded on its own landing (A6). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D1 chain in `runGate()`, D2 `{testCommand}` substitution, D3 `REPAIR` step line, D4 `gate.postGate` on the ledger row; header comment gains the knob under the states/usage block (one owner citation: this spec) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D6: `postGateCommand` joins the Optional list in § Required config keys — one clause, no other wording touched |
| .claude/spec.config.json | MODIFY | other | D7: add `"postGateCommand": "{testCommand}"` after `testCommand`; no other key changes |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "..."` |
| size-baseline.json | MODIFY | other | D10: raised by `size-ratchet.js --reconcile --cite specs/20260910/07-post-gate-command.md` only |
| tests/build/build-driver-post-gate.test.js | CREATE | tests | AC-20260910-07-1, AC-20260910-07-2, AC-20260910-07-3, AC-20260910-07-4, AC-20260910-07-5, AC-20260910-07-6, AC-20260910-07-7, AC-20260910-07-8, AC-20260910-07-9, AC-20260910-07-10 — uses `tests/build/build-driver.fixtures.js` (`makeHost`/`makeNoTestsHost`, `toIntegration`, `toCommit`, `run`, `stateOf`) and rewrites the fixture's `.claude/spec.config.json` to add the key per case |

## Contracts

`.claude/spec.config.json` — new optional top-level key:

```jsonc
{
  "gateCommand": "node --test --test-timeout=45000 --test-force-exit {testDirs}",   // unchanged, scoped
  "testCommand": "node --test --test-timeout=45000 --test-force-exit --test-reporter=spec ...", // unchanged
  "postGateCommand": "{testCommand}"   // NEW, optional. A shell string run after a green scoped
                                       // gate; `{testCommand}` → the testCommand string. Absent,
                                       // empty, or non-string → no post-gate, today's behavior.
}
```

`spec-build-driver.js` `runGate()` child command (bash -c, one string):

```
absent:   <resolved gateCommand>
declared: <resolved gateCommand> && echo '== postGateCommand' && <postGateCommand with {testCommand} substituted>
```

`REPAIR` step body when declared (D3), one added line:

```
## REPAIR — round 1 of 3
gate: <sidecar>/gate-1.log
post-gate: <resolved post command> — red only after the scoped gate passed; find '== postGateCommand' in the log
File Plan rows by layer, so failures route to the worker that owns them:
...
```

`stage: "build"` ledger row (D4), `gate` object:

```
"gate":{"finalRounds":1,"postGate":true}     // key declared
"gate":{"finalRounds":2,"postGate":false}    // key absent / empty / non-string
```

`grounding-contract.md` § Required config keys, Optional set gains:

```
`postGateCommand` (a shell string the build driver chains after a green scoped gate at
integration and on every repair round; `{testCommand}` substitutes the host's `testCommand`;
absent = no post-gate)
```

## Behavior

- INTEGRATION → `--mark integrated` → `runGate()` builds the chain (D1/D2), spawns one bash
  child, streams stdout+stderr to `gate-<k>.log` as today, pushes `{exit, log}` onto
  `marks.gateRuns`. Exit 0 → COMMIT. Non-zero → REPAIR round k of 3, with D3's extra line when
  declared. A watchdog exit 124 from either half still records the `test-watchdog-trip` incident.
- REPAIR → `--mark repair-applied` → the same chain runs again; the cap, re-arm, and phantom-round
  rules are unchanged because the chain is one gate run.
- Absent key: `runGate()` is byte-for-byte today's behavior — no marker line, the child's command
  string is the resolved gate alone.
- `{testCommand}` with no `testCommand` in the config (contract-required, so only a broken host):
  substituted with the empty string; the chain then fails at bash with exit 127 or 2 and the log
  shows the shell's own message — no special handling, the remedy is `/spec:init`.
- Review is unaffected: `review-legs.js` still resolves the gate leg through `resolveGate()` and
  runs `testCommand` bare as the `suite` leg; a spec whose build passed its post-gate normally
  reaches review with the suite already green, which is the whole point.

## Acceptance Criteria

- **AC-20260910-07-1**: WHEN the fixture host's config declares `"postGateCommand": "bash post.sh"` where `post.sh` prints `POST-RED` and exits 3, and `--mark integrated` runs against a scoped gate that passes THE SYSTEM SHALL land state `REPAIR`, record `marks.gateRuns[0].exit === 3`, and write `gate-1.log` containing both the line `== postGateCommand` and `POST-RED` (e.g. gate `node --test 'tests/*.test.js'` green + `post.sh` exit 3 → `REPAIR`, log ends `== postGateCommand\nPOST-RED`) → `AC-20260910-07-1` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-2**: WHEN the config declares `"postGateCommand": "echo POST-GREEN"` and both the scoped gate and the post-gate exit 0 at `--mark integrated` THE SYSTEM SHALL land `COMMIT` with `gate-1.log` containing `== postGateCommand` followed by `POST-GREEN` (e.g. → `COMMIT`, `gateRuns[0].exit === 0`) → `AC-20260910-07-2` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-3**: WHEN the config declares `"postGateCommand": "echo POST-RAN"` and the scoped gate itself exits non-zero THE SYSTEM SHALL land `REPAIR` with `gate-1.log` containing neither `== postGateCommand` nor `POST-RAN` (e.g. `makeNoTestsHost` with `FAIL_FLAG` present → `REPAIR`, log lacks the marker) → `AC-20260910-07-3` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-4**: WHEN the config declares `"testCommand": "echo SUITE-SENTINEL-7"` and `"postGateCommand": "{testCommand}"` and the scoped gate passes THE SYSTEM SHALL run the substituted command, observable as `SUITE-SENTINEL-7` in `gate-1.log` after the marker line, and land `COMMIT` (e.g. `{testCommand}` → `echo SUITE-SENTINEL-7`) → `AC-20260910-07-4` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-5**: WHEN a run is at `REPAIR` because only the post-gate was red (AC-1's shape, `post.sh` reading a flag file) and the flag is removed before `--mark repair-applied --continued 1 --spawned 0` THE SYSTEM SHALL re-run the chain and land `COMMIT` with `marks.gateRuns.length === 2` and `gateRuns[1].exit === 0` (e.g. flag present → `REPAIR`; flag deleted + repair-applied → `COMMIT`) → `AC-20260910-07-5` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-6**: WHEN the bare driver invocation prints the `REPAIR` step on a host whose config declares `"postGateCommand": "bash post.sh"` THE SYSTEM SHALL print a line beginning `post-gate: bash post.sh` immediately after the `gate: <log>` line; on a host with no such key the step SHALL print no `post-gate:` line (e.g. declared → stdout matches `/^gate: .*\npost-gate: bash post\.sh — red only after the scoped gate passed/m`) → `AC-20260910-07-6` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-7**: WHEN `--mark committed` appends the `stage: "build"` ledger row THE SYSTEM SHALL write `gate.postGate` as `true` on a host whose config declared a non-empty `postGateCommand` string and `false` on a host without one (e.g. `{"postGateCommand":"echo x"}` → `"gate":{"finalRounds":1,"postGate":true}`; no key → `"gate":{"finalRounds":1,"postGate":false}`) → `AC-20260910-07-7` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-8**: WHEN the config has no `postGateCommand` key THE SYSTEM SHALL CONTINUE TO run the resolved scoped gate alone at `--mark integrated` — `gate-1.log` contains no `== postGateCommand` line and a green gate lands `COMMIT` (e.g. `makeHost()` unchanged → `COMMIT`, log lacks the marker) → `AC-20260910-07-8` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-9**: WHEN `lib/gate-resolve.js`'s `resolveGate(specText, config)` is called with a config that declares `postGateCommand` THE SYSTEM SHALL CONTINUE TO return the same `gate` string it returns for the identical config without that key (e.g. `{gateCommand:"node --test {testDirs}", postGateCommand:"exit 9"}` → `gate` equals the no-key result; `exit 9` appears nowhere in it) → `AC-20260910-07-9` in tests/build/build-driver-post-gate.test.js
- **AC-20260910-07-10**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL carry `postGateCommand` equal to the literal string `{testCommand}` (e.g. `config.postGateCommand === '{testCommand}'`) → `AC-20260910-07-10` in tests/build/build-driver-post-gate.test.js

## Assumptions (escalation triggers)

- A1: `/spec:build`'s read-load is 298 of 300 lines (`build.md` 100 + `shared-for build` 198, measured 2026-09-10), so no doctrine prose is added (D8) — **if false** (a reviewer or the session insists on a `build.md` sentence): condense one existing line in place, grepping every multi-word literal in the reflowed passage across `tests/` first (Gotchas, fifth trigger); never add a line.
- A2: Executed micro-spike, bash chain semantics: `bash -c 'true && echo post-ran; echo exit=$?'` → `post-ran`, `exit=0`; `bash -c 'false && echo post-ran'; echo $?` → nothing printed, `1`; `bash -c 'true && exit 7'; echo $?` → `7`. The chain's exit is the gate's when the gate is red and the post-gate's when the gate is green — **if false**: STOP, the whole design rests on it.
- A3: Executed spike in a worktree (Sonnet, 2026-09-10): the 19 repo-wide pin files (`tests/consistency/*.test.js` + `tests/test-file-budget.test.js` + `tests/tracked-text-purity.test.js`) run in ~8.9 s / 182 tests; the full `testCommand` in ~57.9 s / 1600 tests there (102 s measured on main earlier the same day under load). Negative claim executed: `spec/.claude-plugin/plugin.json` version `7.134.0` → `7.134` reddened `tests/consistency/plugin-version.test.js` AC-20260820-08-14 with `'7.134.0' !== '7.134'`; reverted, tree clean — **if false** (the whole suite exceeds ~120 s per gate run in practice): change D7's value to the space-joined 19-file glob list; the mechanism is unchanged.
- A4: `lib/host-config.js`'s `readConfig()` returns the parsed config verbatim, so `hostConfig.postGateCommand` needs no reader change — **if false**: add the key read beside `layerGroups` in the driver, never a lib edit.
- A5: Which test files reddened the 48 suite-red review rows since 2026-09-03 is unrecoverable: the ledger's `suite` leg stores only `{skips, todos, testsExecuted}`, and commit bodies name failing files for 3 rows only (`7fea8044`, `84a13e15`, `75e44f27` — all env or unit failures, none in the pin set). D7 therefore picks the whole suite — **if false** (a record surfaces): re-price D7 against it; no build change.
- A6: This spec's own build is the first run with the post-gate active (D7 lands in it), so the INTEGRATION gate will red on `tests/consistency/size-ratchet-live.test.js` for the driver's growth and on `plugin-bump.test.js` until the bump row lands; both are in-File-Plan repairs (D9, D10) — **if false** (the post-gate reds on a file outside the File Plan): the build's own "never silently widened" rule applies — ask add-to-scope / file separately / pause.
- A7: The `tests/build/*` fixture harness runs the real driver via `spawnSync`; each AC here costs one driver flow of a few seconds, so a fresh file stays inside the 45 s per-file budget (`tests/test-file-budget.test.js`) — **if false**: split the file at AC-5/AC-6, never raise the budget.
- A8: The build's host-escalation trigger "any edit that changes `spec-paths contract-hash` output" fires on D6 — **if it fires**: answer proceed, citing D6; **if it does not fire**: nothing owed.

## Rationale

The pattern this closes: since 2026-09-03, 51 of 112 review rows in this repo went `GATE_RED`, 48 with the whole-suite `suite` leg red, and 36 of those with the scoped build gate green — the build passed its own test directories and a repo-wide pin (version bump, size ratchet, read-load budget, byte-for-byte config pin) failed at review. Each such red costs one more nine-leg review iteration plus a session fix turn (median 69 min first-red-to-CLEAN, mostly latency). Hosts barely show it (prax 5/46, salon-os 3/61): it is this repo's pin density, hence an opt-in knob, not a default.

Two designs were tried and reverted before this one: a printed model reminder in `run.md` (core.md: printed reminders measurably fail) and widening `gateCommand` itself to the whole suite (duplicates the 100 s suite inside review's gate leg and needed a byte-for-byte pin laundered; it also reverses specs/20260903/02 D1/D7, the 2026-09-03 ruling that the scoped gate keeps build fast). Opus's second opinion ranked a post-gate knob first. The spike then showed the driver's repair loop keys off ONE `gateRuns` array, so the cheapest honest shape is a shell chain inside the existing child: one string, one log, one exit, and the cap logic never learns a second command exists. That is D1.

D7 chooses the whole suite over the 9-second pin set because history cannot say which tests actually red (A5); the pin set is the documented downgrade. D6 is the critical-tier trigger: one line in the grounding contract, whose hash already trails on every host including this one. D8 declines the prose edit the size of the budget forbids; the driver's step line (D3) is the only reminder and it prints at the moment it matters.

Fragile: the first build dogfoods the knob on its own landing (A6) — expect an INTEGRATION red on the size ratchet and the bump, both in-plan. The ledger boolean (D4) is what makes the knob measurable later: compare review `GATE_RED` rates for builds with `postGate: true` against the 36-of-54 baseline after ten or so specs.

Neighbors pinned: AC-8 (absent key, byte-for-byte today's gate child) and AC-9 (the shared resolver ignores the key, so review's gate leg and close-time re-run are unchanged).

## Canonical Delta

None — `docs/canonical/` has no build-driver page; the contract edit (D6) is the durable record and the driver's header comment cites this spec.
