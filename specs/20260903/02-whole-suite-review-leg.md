---
date: 2026-09-03
status: implementing
tier: critical             # verdict.js + review-legs.js + spec-review-driver.js are this repo's critical triggers (pipeline rules § Risk Tiers)
area: pipeline
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 55883225efa714d1cddecfe257c88cc27d50b19b
---

# Whole-suite review leg: review runs the host's whole test suite once, and CLEAN is unreachable while it is red

## Goal

Close the `scoped-gate-blind-spot` escape class at its one honest seam. Every gate in the
pipeline runs only the test globs derived from the spec's File Plan, and the at-risk leg only
finds outside tests that name a changed file — so a repo-wide scanner test (a narration sweep,
a tracked-text purity walk, an exhaustive live-file pin) that goes red because of the diff is
invisible to build and review alike and main goes red after merge. Review gains one blocking
leg, `suite`, that runs the host's bare `testCommand` from the repo root once per legs
iteration and writes a manifest row; `verdict.js` requires it in both scopes and derives
`GATE_RED` while it is red; the review driver's close-time re-run widens to the same command so
the files CLOSE itself writes are covered too. Build's scoped loops stay exactly as they are.
Done means: a red test outside every File Plan test directory, naming no changed file, hard-
stops review before any reviewer spend; every existing fixture manifest and synthetic host
keeps deriving the word it derives today with the row added in place; the canonical pipeline
doc no longer justifies never widening the gate by a red-baseline rationale v7 retired; and the
replay corpus carries the class's section so the fleet reader's corpus-gap line clears.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `review-legs.js` gains a ninth leg, `suite`: after wave 1 (reconcile/gate/ci) completes and before wave 2 (at-risk/patterns) starts — its own wave, `1b`, never concurrent with another leg that runs host tests — it runs `config.testCommand` bare (no file arguments) through the existing `sh()` (cwd = root, `NODE_TEST_CONTEXT` scrubbed), writes `$ <cmd>\n\n<stdout+stderr>` to `<out-dir>/suite-output.txt`, and appends `{"leg":"suite","exit":<code>,"observed":{...gate's grammar...},"scope":<full\|fix-delta>}` through `appendRow` — `observed` is exactly what `computeSkips` + `computeTestsExecuted` yield for the gate row (`skips`, `todos` when the skip pattern matched, `testsExecuted`); it runs in EVERY scope including `--fix-delta`; the summary's `outputs:` line names `suite-output.txt` (AC-20260903-02-1, AC-20260903-02-3, AC-20260903-02-6) | Executed spike (Assumptions A2): a scanner test in a sibling test directory is green to gate and at-risk and red under the bare `testCommand` — the bare command is the only observation that sees it. Serial placement mirrors the smoke-wave ruling: two host test runs at once collide on shared runtime state on app hosts. Rejected: widening `{testDirs}` (build's speed rationale survives per the 2026-09-03 ruling); a host knob to skip the leg (a red suite is a broken "gates are plainly green" promise on every host, never a preference). |
| D2 | Two fail-closed alternatives on the `suite` row, mirroring the gate row's: no `testCommand` in config → `{"leg":"suite","exit":1,"observed":{"unavailable":"no-test-command"}}`; a declared `capabilities.testCountPattern` that matches an executed count of exactly `0` on an exit-0 run → exit forced to `1` with `testsExecuted: 0` (the at-risk contradiction rule, D5 of specs/20260820/06, applied to the whole suite); an absent/`"none"`/unmatched pattern keeps the child's real exit with the typed `{"unavailable":...}` value (AC-20260903-02-4, AC-20260903-02-5) | A whole suite that executed zero tests is the vacuous-green class the at-risk leg already refuses; `testCommand` is a contract-required key (grounding contract § Required config keys), so its absence is a broken host, not an honest standing config — red, never a silent 0. |
| D3 | `suite` is a BLOCKING leg everywhere the blocking set is spelled: `review-legs.js`'s `BLOCKING` array (summary line `❌`, `RED_BLOCKING: suite`, exit 1), `verdict.js`'s `REVIEW_LEGS` (required in BOTH scopes — never filtered out on fix-delta, like `gate`) and `REVIEW_BLOCKING` (red → `GATE_RED`, first-match), and `spec-review-driver.js`'s `BLOCKING_LEGS` (hard-stop → `STOPPED`, `GATE_RED` row, the STOPPED step prints `❌ suite exit=…`; excluded from the disposition pools). Built-in membership, not `--require` (AC-20260903-02-2, AC-20260903-02-7, AC-20260903-02-8, AC-20260903-02-9) | Executed check (A4): on the review profile `--require <leg>` widens the REQUIRED set only — a red `--require`d `suite` derived `HARD_FINDINGS`, a dispositionable word a waive can clear. The ruling is that CLEAN is unreachable while the whole suite is red; only the blocking set makes that structural. A red whole suite is the same category as a red gate (a test is red), so it takes the same path: hard-stop, fix, re-run — never a finding a session waives. |
| D4 | The driver's close-time re-run (`runCloseTimeGate`) runs the host `testCommand` bare, after the resolved gate and with the same env scrub and cwd, and refuses `--mark closed` (exit 2, state unchanged, before any mutation) on a non-zero exit with a message naming the literal phrase `suite red at close`, the command, and the `--mark closed` re-run remedy; a missing `testCommand` refuses the same way naming the config remedy (AC-20260903-02-10, AC-20260903-02-14) | The CLOSE step writes the canonical doc, the rules fold, Rationale lines and memory notes AFTER the legs ran; the recorded Gotcha about a Canonical Delta reddening the retired-name sweep at the close commit is this exact hole. The scoped gate re-run stays (a host's `gateCommand` may carry typecheck/lint the `testCommand` lacks); the suite run is additive. |
| D5 | `tests/consistency/red-fixture-coverage.test.js` gains a `suite` handler: a host whose planned test lives in `tests/inplan/` and whose planted red scanner lives in `tests/consistency/` (names no changed file, walks the tree for a literal the diff introduces) — asserts the `suite` row red, `suite-output.txt` carrying the planted assertion text, AND the `gate` row exit 0 and `at-risk` `files: 0` (AC-20260903-02-11) | The meta-test enumerates `REVIEW_LEGS` from `verdict.js`'s source and fails closed on an unfixtured leg — the handler is owed by construction, and asserting the other two legs green is what proves the leg engages where they cannot. |
| D6 | Every existing fixture manifest and synthetic host that must keep deriving its word is updated in place, never weakened, and retagged with this spec's regression pins: the `SIX_GREEN`/`SIX_LEGS_NO_AT_RISK` constants and their siblings gain a green `suite` row; `review-legs.test.js`'s required-leg list gains `suite`; the smoke-wave fixture's stand-in `testCommand` writes a marker per invocation shape (bare = suite, with files = at-risk) and boot records both; the pair test's at-risk recorder reports a nonzero executed count for the bare invocation and its existing count for the file invocation so the at-risk contradiction stays isolated from the suite's (AC-20260903-02-12, AC-20260903-02-13, AC-20260903-02-15, AC-20260903-02-16) | Executed check (A3): the pre-image `verdict.js` ignores an unknown green row (CLEAN over nine rows), so every pin is green pre-image as a `SHALL CONTINUE TO` pin must be. The Gotcha on exhaustive live-file pins: update in place and retag, never loosen, never leave red. |
| D7 | The gate leg, `lib/gate-resolve.js`, `scope-reconcile.js`'s at-risk derivation, and the build driver's scoped inner loops and final gate are untouched [no-ac: the deliverable is the absence of a change; AC-20260903-02-12 and AC-20260903-02-13 pin that gate and at-risk keep their behavior beside the new leg] | JJ ruling 2026-09-03: fix now, at review, leaving build's speed rationale intact. The suite leg is the compensation that makes the scoped build gate honest, not a replacement for it. |
| D8 | Canonical Delta rewrites `docs/canonical/pipeline.md` § "The gate is scoped, and the scoping is compensated" — the scoping stays for build; its stated reason (a livable red-pin baseline) is retired with v7; review's `suite` leg is the whole-suite observation; at-risk remains the diff-scoped compensation that names WHICH outside tests the diff endangers — and updates the leg inventory sentences in `docs/canonical/review.md` and `docs/canonical/review-legs.md` [no-ac: prose applied by the review driver's CLOSE step, no test surface] | A canonical paragraph whose rationale no longer exists is a standing invitation to re-argue the ruling; the delta names the retired rationale so the reader knows why the sentence changed. |
| D9 | Plugin version bumps to the next free minor (target 7.71.0) with the plugin.json description's changelog line, last-3 form [no-ac: the version-bump omission is a hard review finding already; the literal number is a target, not a pin (Gotchas)] | Behavior change discipline in pipeline rules § Planning. No test carries the version literal — a version literal in a test comment is the very escape this spec closes. |
| D10 | `spec/doctrine/replay-corpus.md` gains a derived section `### \`scoped-gate-blind-spot\`` under `## Derived classes`, after `server-code-in-client-bundle` (Contracts carries the text verbatim): derived-from line citing the ledger rows, recipe, a leg-invisibility requirement stating the class applies only to a host whose review lacks the `suite` leg — none after this spec — so a host declares it in `replay.inapplicableClasses`, and the worked example; this repo's `.claude/spec.config.json` `replay.inapplicableClasses` gains the id; the exhaustive class-order pin in `tests/replay/replay-corpus.test.js` is updated in place to nine classes and retagged (AC-20260903-02-17) | JJ ruling at lock (2026-09-03): fold it in now so `fleet-reader --owed`'s corpus-gap line clears when this ships, rather than a later doctrine edit. The section is honest about being mechanized — the precedent is `server-code-in-client-bundle`, which likewise declares itself inapplicable where a leg already catches it. The pin grows by one and is retagged, never loosened (Gotchas: exhaustive live-file pins). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/review-legs.js | MODIFY | scripts | `suite` leg in its own wave 1b (D1), fail-closed alternatives (D2), `BLOCKING` gains `suite` (D3); header comment gains the leg's row shape, the wave placement, `suite-output.txt` in the outputs line, and the exit-code note |
| spec/scripts/verdict.js | MODIFY | scripts | `REVIEW_LEGS` gains `suite` (required in both scopes) and `REVIEW_BLOCKING` gains `suite` (D3); header comment names the leg and why built-in membership, not `--require`, carries it |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | `BLOCKING_LEGS` gains `suite` (D3); `runCloseTimeGate` runs the bare `testCommand` after the gate and refuses on red or absent (D4); header comment updated |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version to the next free minor, changelog line (D9) |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260903-02-1, AC-20260903-02-2, AC-20260903-02-3, AC-20260903-02-4, AC-20260903-02-5, AC-20260903-02-12 — required-leg list gains `suite`, the sibling-directory scanner host, the fix-delta scope stamp on the `suite` row, the two fail-closed alternatives, the end-to-end CLEAN pin retag |
| tests/review/review-legs-smoke-wave.test.js | MODIFY | tests | AC-20260903-02-6 — stand-in `testCommand` writes a per-shape marker; boot records that both the suite and the at-risk invocations completed before it started |
| tests/review/legs-verdict-pair.test.js | MODIFY | tests | AC-20260903-02-16 — the at-risk recorder distinguishes the bare (suite) invocation from the file (at-risk) invocation so AC-20260820-06-6/-7 keep their words |
| tests/review/verdict.test.js | MODIFY | tests | AC-20260903-02-7, AC-20260903-02-8, AC-20260903-02-15 — `SIX_GREEN` and `SIX_LEGS_NO_AT_RISK` gain the green `suite` row; missing-`suite` → UNVERIFIED in both scopes; red `suite` → GATE_RED |
| tests/verdict-gatered-no-workflow.test.js | MODIFY | tests | AC-20260903-02-15 — fixture manifests gain the green `suite` row; existing words unchanged |
| tests/provenance/provenance.test.js | MODIFY | tests | AC-20260903-02-15 — fixture manifest gains the green `suite` row; existing words unchanged |
| tests/review/escalate-row.test.js | MODIFY | tests | AC-20260903-02-15 — fixture manifests gain the green `suite` row; existing words unchanged |
| tests/consistency/red-fixture-coverage.test.js | MODIFY | tests | AC-20260903-02-11 — `suite` handler registered in `LEG_HANDLERS` (D5) |
| tests/review/review-driver.test.js | MODIFY | tests | AC-20260903-02-9, AC-20260903-02-10, AC-20260903-02-13, AC-20260903-02-14 — red suite with a green gate lands STOPPED with a GATE_RED row; close-time refusal on a red `testCommand`; the existing STOPPED and closed-success tests retagged as pins |
| tests/review/review-legs-at-risk-argv.test.js | MODIFY | tests | AC-20260903-02-13 — A6's if-false clause taken at build: the malformed-entry test's "no log file" assertion becomes "no non-empty argv line", because the suite leg's bare invocation now creates the recorder log with one empty line |
| spec/doctrine/replay-corpus.md | MODIFY | doctrine | Derived section `### \`scoped-gate-blind-spot\`` appended after `server-code-in-client-bundle`, text verbatim from Contracts (D10) |
| .claude/spec.config.json | MODIFY | other | `replay.inapplicableClasses` gains `"scoped-gate-blind-spot"` (D10); no other key changes |
| tests/replay/replay-corpus.test.js | MODIFY | tests | AC-20260903-02-17 — the class-order pin reads nine classes with `scoped-gate-blind-spot` last and `derived:true`; updated in place and retagged |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260903-02-17 — found at the final gate: the `--pick-class` fixtures enumerate the derived classes by hand (a seeded ledger row per derived id; the `inapplicableClasses` list), so the ninth class won selection at zero rows; each fixture grows by the one id in place and is retagged, never loosened |

## Contracts

The manifest row `review-legs.js` appends for the new leg — the ninth member of the closed
row set (specs/20260820/06 Contracts), `observed` typed exactly like the gate row's:

```
suite   {"leg":"suite","exit":<code>,"observed":{"skips":N|{"unavailable":"pattern-no-match"|"no-format-declared"},
         "todos":N?,"testsExecuted":N|{"unavailable":"pattern-no-match"|"no-format-declared"}},"scope":"full"|"fix-delta"}
        — exit is FORCED to 1 when a declared testCountPattern observed exactly 0 executed tests on an
          exit-0 run (D2); `todos` is present only when the skip pattern matched (gate's own rule)
        | {"leg":"suite","exit":1,"observed":{"unavailable":"no-test-command"},"scope":…}
          — whole-row alternative when config declares no testCommand (D2)
```

`verdict.js` constants after this spec (the only edit to either):

```js
const REVIEW_LEGS = ['gate', 'suite', 'smoke', 'reconcile', 'ac-matrix', 'skip-reconcile', 'ci', 'at-risk', 'promise-sweep']
const REVIEW_BLOCKING = new Set(['gate', 'suite', 'smoke', 'ci'])
```

`review-legs.js` wave order after this spec: wave 1 (reconcile, gate, ci — parallel) → wave 1b
(`suite`, alone) → wave 2 (at-risk, patterns, drift — parallel) → wave 2b (smoke, alone) →
wave 3 (ac-matrix) → wave 3b (promise-sweep). `--fix-delta` skips reconcile/at-risk/patterns
exactly as today and runs `suite`.

Retained output file: `<out-dir>/suite-output.txt`, first line `$ <testCommand>`, blank line,
then the runner's stdout followed by stderr — the same layout as `at-risk.txt`.

The replay-corpus section (D10), appended verbatim after the `server-code-in-client-bundle`
section under `## Derived classes`:

```markdown
### `scoped-gate-blind-spot`

**Derived from:** the plugin repo's own escape rows × 2 (specs 20260813/10
`tests/review/verdict.test.js` via a backfill amendment, 20260903/01
`tests/fleet-reader/doctrine-pins.test.js` — `preventedBy: review-check`); the structural fix
specs/20260903/02-whole-suite-review-leg.md (the `suite` review leg).

**Recipe:** Inside one of the target spec's File Plan files, introduce content that a repo-wide
scanner test forbids and that no test in the spec's own File Plan directories checks — a version
literal or a fleet host name in a test comment (the narration sweep), a raw NUL byte or a tracked
binary (the tracked-text purity walk), a new member of an exhaustively pinned live set. The
scanner must live outside every directory the File Plan's test rows name and must reference no
changed file by path stem, so the scoped gate glob never runs it and the at-risk derivation never
selects it. The mutation is the forbidden content, never the scanner.

**Leg-invisibility requirement:** the host's review must lack a whole-suite leg. After
specs/20260903/02 every host's review runs the bare `testCommand` as the blocking `suite` leg, so
this class is mechanized everywhere and a replay that picks it can only record `leg-caught` —
declare it in `.claude/spec.config.json` → `replay.inapplicableClasses` and pick another. It
stays in the corpus so the recurrence count has a section to resolve against and so a host that
has not yet updated the plugin reads the recipe that describes its own hole.

**Worked example (the real escape):** a spec's build left a plugin version literal in a test
comment. The build gate ran only the planned directories' globs, the at-risk derivation found no
outside test naming a changed script, the review closed CLEAN (`rv_96a6a9ef5458`), and the
narration scan under `tests/consistency/` went red on main only after merge-back. Two sibling
specs re-tracked spike screenshots the same way against the tracked-text purity walk. The intended catch is the `suite` leg: one bare `testCommand` run per legs iteration, red
before any reviewer spend.
```

Close-time refusal text (D4), stderr, exit 2:

```
suite red at close — <testCommand> exited <N> over the committed close tree.
The files written at CLOSE (canonical doc, rules fold) are inside the host's rule surface; fix them, commit the fix, then re-run `node <driver> <spec> --mark closed`.
--- last 40 lines of suite output ---
…
```

## Behavior

A review over a diff that adds a version literal to a test comment on a host whose repo-wide
narration scan forbids it: the gate glob for the planned test directories is green, at-risk
finds no outside test naming a changed file, and today the reviewer is dispatched and the
review closes CLEAN while `node --test` on the branch is red. After this spec: wave 1 is green,
wave 1b runs `node --test`, the scan fails, the `suite` row lands red, `review-legs.js` prints
`RED_BLOCKING: suite` and exits 1, the driver appends the `GATE_RED` row and parks at STOPPED
naming `❌ suite exit=1` with the manifest and `suite-output.txt` paths; the session fixes the
comment, deletes the manifest, re-runs, and the legs restart fresh.

The same diff on a host with no `testCountPattern`: identical, with `testsExecuted` typed as
`{"unavailable":"no-format-declared"}` — the leg's redness is exit-code only, never inferred
from a count.

Cost on this host: one extra whole-suite run per legs iteration and one at close (measured
below, A1). A clean review pays two; a review with one fix pass pays three.

## Acceptance Criteria

- **AC-20260903-02-1**: WHEN `review-legs.js` runs full scope against a green synthetic host declaring `testCommand: "node --test"` and `skipReportPattern: "ℹ skipped (\\d+)"` and no `testCountPattern` THE SYSTEM SHALL append exactly one row `{"leg":"suite","exit":0,"observed":{"skips":0,"todos":0,"testsExecuted":{"unavailable":"no-format-declared"}},"scope":"full"}`, write `<out-dir>/suite-output.txt` whose first line is `$ node --test`, and list `suite-output.txt` in the summary's `outputs:` line (e.g. host with `tests/foo.test.js` green → row as above; `outputs: … suite-output.txt …`) → "AC-20260903-02-1" test in tests/review/review-legs.test.js
- **AC-20260903-02-2**: WHEN the host's File Plan names `tests/inplan/foo.test.js` and a test file `tests/consistency/scanner.test.js` (predating the diff, naming no changed file) fails because of a literal the diff introduces THE SYSTEM SHALL append `gate` with `exit:0`, `at-risk` with `observed.files` `0`, `suite` with `exit:1`, print a line matching `RED_BLOCKING: suite`, and exit 1 (e.g. the Assumptions A2 host: `gate exit=0`, `at-risk {"files":0,"testsExecuted":0}`, `suite exit=1`, process exit 1) → "AC-20260903-02-2" test in tests/review/review-legs.test.js
- **AC-20260903-02-3**: WHEN `review-legs.js` runs with `--fix-delta` THE SYSTEM SHALL still append the `suite` row with `"scope":"fix-delta"` as its last key (e.g. a green host under `--fix-delta` → `{"leg":"suite","exit":0,"observed":{…},"scope":"fix-delta"}`; rows `reconcile`/`at-risk` absent as today) → "AC-20260903-02-3" test in tests/review/review-legs.test.js
- **AC-20260903-02-4**: WHEN the host config declares `gateCommand` but no `testCommand` THE SYSTEM SHALL append `{"leg":"suite","exit":1,"observed":{"unavailable":"no-test-command"},"scope":"full"}`, print `RED_BLOCKING: suite`, and exit 1 (e.g. config `{"gateCommand":"node --test {testDirs}","runtime":{"inert":"x"}}` → that row, exit 1) → "AC-20260903-02-4" test in tests/review/review-legs.test.js
- **AC-20260903-02-5**: WHEN the host declares `testCountPattern: "ℹ tests (\\d+)"` and its `testCommand` exits 0 printing `ℹ tests 0` THE SYSTEM SHALL append the `suite` row with `exit:1` and `observed.testsExecuted` `0` (e.g. `testCommand` = a script printing `ℹ tests 0` and exiting 0 → `{"leg":"suite","exit":1,"observed":{"skips":{"unavailable":"no-format-declared"},"testsExecuted":0},"scope":"full"}`); WHEN the same script prints `ℹ tests 3` THE SYSTEM SHALL keep `exit:0` with `testsExecuted` `3` → "AC-20260903-02-5" tests in tests/review/review-legs.test.js
- **AC-20260903-02-6**: WHEN the host's `testCommand` is a stand-in that writes marker `suite-done` on a bare invocation and `at-risk-done` on an invocation with file arguments, and `runtime.bootCommand` records which markers exist at boot THE SYSTEM SHALL boot smoke only after BOTH markers exist, and SHALL have written `suite-done` before the at-risk invocation started (e.g. boot record `suite-complete,at-risk-complete`; the at-risk stand-in observes `suite-done` present when it starts) → "AC-20260903-02-6" test in tests/review/review-legs-smoke-wave.test.js
- **AC-20260903-02-7**: WHEN a review manifest carries every REVIEW_LEGS row green except that no `suite` row exists THE SYSTEM SHALL print `UNVERIFIED` and the stderr line `verdict.js: UNVERIFIED — missing required legs: suite (scope full)`, exit 1 — and the same under fix-delta scope (rows stamped `"scope":"fix-delta"`, no reconcile/at-risk) with `(scope fix-delta)` (e.g. `SIX_GREEN` minus `suite` + CLEAN workflow → `UNVERIFIED`) → "AC-20260903-02-7" tests in tests/review/verdict.test.js
- **AC-20260903-02-8**: WHEN a review manifest is green on every other leg and `{"leg":"suite","exit":1,"observed":{"skips":0,"todos":0,"testsExecuted":1035}}` THE SYSTEM SHALL print `GATE_RED` and exit 1 with a CLEAN zero-survivor workflow, and SHALL print `GATE_RED` with no `--workflow` at all (the hard-stop pass), never `HARD_FINDINGS` (e.g. pre-image derives `HARD_FINDINGS` for this manifest — A3) → "AC-20260903-02-8" tests in tests/review/verdict.test.js
- **AC-20260903-02-9**: WHEN the driver runs against a synthetic host whose planned test is green and whose `tests/consistency/scanner.test.js` (outside the File Plan, naming no changed file) is red THE SYSTEM SHALL land `--state` `STOPPED`, append exactly one ledger row with `verdict:"GATE_RED"`, and print the STOPPED step with a line matching `❌ suite exit=1` (e.g. the AC-2 host driven through `spec-review-driver.js` → `STOPPED`, one `GATE_RED` row, `❌ suite exit=1 {…}`) → "AC-20260903-02-9" test in tests/review/review-driver.test.js
- **AC-20260903-02-10**: WHEN `--mark closed` is invoked with every earlier refusal passing, `gateCommand` `true`, and `testCommand` `bash always-red.sh` THE SYSTEM SHALL refuse (exit 2), leave `marks.closed` unset (`--state` stays `CLOSE`), and print a message containing `suite red at close`, the literal `bash always-red.sh`, and `--mark closed` (e.g. stderr matches `/suite red at close — bash always-red.sh exited 1/`) → "AC-20260903-02-10" test in tests/review/review-driver.test.js
- **AC-20260903-02-11**: WHEN the red-fixture meta-test enumerates `verdict.js`'s `REVIEW_LEGS` THE SYSTEM SHALL find a `suite` handler whose planted sibling-directory scanner reddens the `suite` row, whose `suite-output.txt` contains `RED_FIXTURE_SUITE_PLANTED_VIOLATION`, and whose `gate` row is exit 0 and `at-risk` row `files:0` (e.g. handler output: `suite exit≠0`, file contains the literal, `gate exit=0`, `at-risk {"files":0,…}`) → "AC-20260903-02-11" handler in tests/consistency/red-fixture-coverage.test.js
- **AC-20260903-02-12**: WHEN `review-legs.js` runs full scope against the green synthetic host THE SYSTEM SHALL CONTINUE TO produce every required leg row (now nine, `suite` included), resolve `{testDirs}` to the glob form, exit 0, and feed `verdict.js` to `CLEAN` end-to-end (e.g. rows `gate,suite,smoke,reconcile,ac-matrix,skip-reconcile,ci,at-risk,promise-sweep` → `CLEAN`) → the existing AC-20260820-03-2 and end-to-end CLEAN tests in tests/review/review-legs.test.js, retagged
- **AC-20260903-02-13**: WHEN the synthetic gate fails THE SYSTEM SHALL CONTINUE TO append exactly one `GATE_RED` row and report `STOPPED`; and WHEN one at-risk file exists THE SYSTEM SHALL CONTINUE TO run it through `testCommand` with its real repo-relative path and record its row beside the new `suite` row (e.g. STOPPED on a red gate: one `GATE_RED` row; at-risk argv `['tests/atrisk.test.js']`) → the existing AC-20260820-07-2 test in tests/review/review-driver.test.js and the existing at-risk argv test in tests/review/review-legs-at-risk-argv.test.js, retagged
- **AC-20260903-02-14**: WHEN merge-strategy is marked from the main root in the two-branch fixture with `gateCommand` `true` and `testCommand` `node --test` over a green host THE SYSTEM SHALL CONTINUE TO run the close-time re-run green and land MERGE, never refusing a genuinely green suite (e.g. the AC-20260830-02-2 closed-success call still succeeds) → the existing AC-20260820-07-12 test in tests/review/review-driver.test.js, retagged
- **AC-20260903-02-15**: WHEN the fixture manifests `SIX_GREEN`, `SIX_LEGS_NO_AT_RISK`, and their siblings in the gatered/provenance/escalate suites carry a green `suite` row THE SYSTEM SHALL CONTINUE TO derive every verdict word and ledger field those tests assert today (e.g. `SIX_GREEN` + CLEAN workflow → `CLEAN`; the escalate fixtures → their recorded non-CLEAN words) → the existing fixture-consuming tests in tests/review/verdict.test.js, tests/verdict-gatered-no-workflow.test.js, tests/provenance/provenance.test.js, tests/review/escalate-row.test.js, retagged on their fixture constants' first consumer
- **AC-20260903-02-17**: WHEN `parseCorpus` reads the shipped `replay-corpus.md` THE SYSTEM SHALL return nine classes in file order — the six hand-authored ids with `derived:false`, then `prefix-collision-coverage-fail-open`, `server-code-in-client-bundle`, `scoped-gate-blind-spot` with `derived:true` — and the last section's text SHALL contain `inapplicableClasses` and `suite` (e.g. `ids.slice(-3)` → `["prefix-collision-coverage-fail-open","server-code-in-client-bundle","scoped-gate-blind-spot"]`) → the existing AC-20260901-08-1 class-order test in tests/replay/replay-corpus.test.js, updated in place and retagged
- **AC-20260903-02-16**: WHEN the at-risk contradiction host's recorder is invoked bare (the suite leg) THE SYSTEM SHALL CONTINUE TO derive the at-risk row `{"leg":"at-risk","exit":1,"observed":{"files":1,"testsExecuted":0},"scope":"full"}` and pool at least one leg finding, with the `suite` row green (recorder prints `ℹ tests 3` bare, `ℹ tests 0` with files) → the existing AC-20260820-06-6 and AC-20260820-06-7 tests in tests/review/legs-verdict-pair.test.js, retagged

## Assumptions (escalation triggers)

- A1: The whole suite on this host is affordable per legs iteration — **executed:** `node --test` on main at 5588322: `ℹ tests 1035 · pass 1035 · fail 0`, exit 0, `real 83.54s` (user 280s — the runner parallelizes). — **if false** (a host whose suite runs for many minutes): the leg still runs; a host knob is a later spec, never a silent skip here.
- A2: A scanner test in a sibling directory is invisible to the gate glob and the at-risk derivation and red under the bare `testCommand` — **executed** against the real scripts on a synthetic host (planned `tests/foo.test.js`, scanner at `tests/consistency/scanner.test.js` walking the tree for a literal the diff adds to `src/foo.js`): `scope-reconcile --json` → `atRisk=[] outOfPlan=[]`; `review-legs.js` → every leg ✅ (`gate exit=0`, `at-risk {"files":0,"testsExecuted":0}`), exit 0; `node --test` in that host → `ℹ tests 2 · pass 1 · fail 1`, exit 1. A first attempt with the scanner in `tests/` beside the planned test reddened the GATE — the glob is `<dir>/*.test.js`, so the blind spot is directory-shaped, which is why the D5 handler and AC-2 host put the scanner in a sibling directory. — **if false:** STOP, the premise of the spec is wrong.
- A3: The pre-image `verdict.js` ignores an unknown green row and pools an unknown red one as a finding — **executed:** `SIX_GREEN` + `{"leg":"suite","exit":0,…}` + CLEAN workflow → `CLEAN` exit 0; with `{"leg":"suite","exit":1,…}` → `HARD_FINDINGS` exit 1. So D6's pins are green pre-image and AC-8 is red pre-image. — **if false:** the fixtures are updated in the same build regardless; only the red-check expectation classification changes.
- A4: `--require suite` on the review profile does not block — **executed:** the red-suite manifest with `--require suite` → `HARD_FINDINGS` exit 1 (required-only widening, as the flag's header says). — **if false:** built-in membership (D3) is still the chosen mechanism; nothing changes.
- A5: Every other synthetic host in `tests/review/*` and `tests/build/*` that declares `testCommand: "node --test"` has a green suite of its own (its only tests are the planned green test and, where present, a green at-risk test), so the added leg does not change those tests' outcomes — grep-verified list in the File Plan's omissions. — **if false:** update that fixture in place and retag under AC-15; never weaken.
- A6: The at-risk argv recorder appends `argv.slice(2).join('\n') + '\n'`, so the suite's bare invocation contributes an empty line that the test's `filter(Boolean)` drops and `deepStrictEqual(argv, ['tests/atrisk.test.js'])` keeps holding; the red-exit variant asserts the at-risk row only. — **if false:** the file joins the File Plan as one MODIFY row under AC-13 (a sixteenth row is inside the cap's "roughly").
- A7: `review-legs.js`'s existing `sh()` is the right runner for the suite (cwd = root, `NODE_TEST_CONTEXT` scrubbed) — the same scrub the driver's close-time gate performs, since both are invoked from inside `node --test` by their own tests. — **if false** (a nested-runner silent pass observed): STOP, ask the user.

## Rationale

**Why now, against the guard bar.** Core § Incident Policy admits a standing guard at the
third fleet recurrence; the class reads two rows in the joined escape count. JJ ruled on
2026-09-03 to fix now: this is not a new guard invented from a hunch but a documented blind
spot in an existing one, observed three times on this host in two days (specs 20260902/09 and
20260902/10 re-tracked spike screenshots against the tracked-text purity pin; spec 20260903/01
left a version literal in a test comment for the narration scan — recorded as
`escape:claude-plugins:2026-09-03T21:19:57Z:tests/fleet-reader/doctrine-pins.test.js`, class
`scoped-gate-blind-spot`, `preventedBy: review-check`, correlated review `rv_96a6a9ef5458`
CLEAN). The scoped gate's written rationale — that scoping "makes a red-pin baseline livable" —
described the sanctioned-red apparatus v7 retired; with gates plainly green there is no cost
the scoping still protects at review time, only the hole.

**Why a blocking leg and not a finding.** A finding is dispositionable; only the user waives,
but a waive exists. The ruling is that CLEAN must be structurally unreachable while the whole
suite is red, and `verdict.js` has exactly one structure for that: `REVIEW_BLOCKING`. A red
suite is a red test, the same category as a red gate, so it takes the gate's path — hard-stop
before reviewer spend, fix, fresh manifest. The `--require` flag was the design's first draft
(session summary); the executed check A4 showed it widens the required set only on the review
profile, so built-in membership is the mechanism and `--require` stays what it is.

**Why the close-time re-run widens too.** The recorded Gotcha about a Canonical Delta reddening
the retired-name sweep at the close commit is a whole-suite red introduced by CLOSE's own writes,
after the last legs run. One more suite run at close is the only observation that covers it.

**Why build stays scoped.** The ruling leaves build's inner repair loops fast; the review leg
runs once per legs iteration. A post-merge suite run on main (a sibling's red, not this
spec's) is adjacent and out of scope — the memory rule "run the whole suite on main after every
merge-back" stands as a habit until measured.

**What is fragile.** Wave placement: the suite must never overlap smoke (shared runtime state
on app hosts) — the smoke-wave test pins it. Fixture updates: three suites carry hand-written
full manifests; each gains one row and its first consumer is retagged, never a loosened
assertion. The corpus section (D10) is the one doctrine edit here; JJ chose at lock to fold it
into this spec (over a later direct edit, or leaving the gap listed) so the owed render's
corpus-gap line clears when this ships — sixteen File Plan rows, inside the cap's "roughly".

**Lock record (2026-09-03).** Critical tier: JJ confirmed the lock as drafted — a red suite
hard-stops (no finding path), and the close-time re-run is widened. Collision closure (`--literal
red-pin`, `--literal "scoping is compensated"`): every literals hit is either
`docs/canonical/pipeline.md` (the Delta's own target, rewritten at close), a frozen historical
spec under `specs/` (narrative, never a live surface), or a sibling worktree's mirror of those
same files — all waived, none owe a row. Paths-leg `executes` hits for the three scripts: the
fixture repairs are planned as File Plan rows where a fixture's word or shape changes
(review-legs, smoke-wave, pair, verdict, gatered, provenance, escalate, red-fixture, driver); the
remaining executing tests (entrypoints, host-config-api, observed-grammar-purity, ac-matrix,
frontmatter, deviations-backstop, disposer-gate, merge-reentry, review-base-derivation,
reviewer-return-killed, stopped-row-durability, scope-reconcile-at-risk) drive green synthetic
hosts whose whole suite is their planned green test (A5) and change no assertion.

**Rejected:** widening `{testDirs}` for build (ruling); a `driftScript` config hook running the
suite (this host declares none, and a knob makes the promise optional); pooling a red suite as
a finding (waivable); a per-host opt-out (a red suite is never a preference).

## Canonical Delta

In `docs/canonical/pipeline.md`, replace the section **"The gate is scoped, and the scoping is
compensated"** (heading and both paragraphs) with:

> ## The build gate is scoped; review runs the whole suite
>
> Every build gate resolves `{testDirs}` from the spec's own File Plan tests rows, so a build
> iteration runs only the test globs of the directories the spec names — the inner repair loops
> stay fast, and that is the whole reason the scoping survives. Its earlier justification, that
> scoping "makes a red-pin baseline livable", described the sanctioned-red apparatus v7 retired:
> gates are plainly green now, so at review time nothing is protected by not looking. The cost of
> a scoped gate is directory-shaped and precise: a test outside every named directory — a shared
> script's pinned return, a repo-wide scanner (narration sweep, tracked-text purity, an exhaustive
> live-file pin) — can go red because of the diff while neither the build gate nor the review
> panel ever runs it (escape `wf_e1da0ea6-94c`: five pins, two files, zero signal; class
> `scoped-gate-blind-spot`: three merges in two days went red on main only after merge-back).
>
> Two compensations, one per question. `scope-reconcile.js` derives the **at-risk** set — outside
> test files whose content names a changed file's path stem — and review runs that set as a
> required, non-blocking leg whose failures are ordinary findings: it answers *which* outside
> tests this diff endangers. The **`suite`** leg answers whether the tree is green at all: review
> runs the host's bare `testCommand` once per legs iteration in its own wave (never concurrent
> with another leg that runs host tests), in both scopes, and it is blocking — a red suite
> derives `GATE_RED` before any reviewer spend, and the driver's close-time re-run runs the same
> command over the committed close tree so the files CLOSE itself writes are covered. Build never
> runs unscoped; review never closes on a scoped observation alone.
> (specs/20260815/02-at-risk-pins.md, done 2026-08-16; specs/20260903/02-whole-suite-review-leg.md)

In `docs/canonical/review.md`, in the bullet beginning "The verdict word and the ledger row are
both emitted by `verdict.js`", change `only `gate`/`smoke`/`ci` block` to `only
`gate`/`suite`/`smoke`/`ci` block` and leave the findings-leg list unchanged. Append one bullet
after the at-risk inventory bullet:

> - The Phase 0 leg inventory carries **`suite`**: required in both scopes, blocking. It runs the
>   host's bare `testCommand` from the repo root in its own wave after gate/reconcile/ci and before
>   at-risk and smoke, writes `<out-dir>/suite-output.txt`, and types its row like the gate's
>   (`skips`, `todos`, `testsExecuted`); a declared `testCountPattern` observing zero executed tests
>   forces exit 1, and a host with no `testCommand` gets a red `{"unavailable":"no-test-command"}`
>   row, never a silent skip. The close-time re-run runs the same command after the resolved gate.
>   (specs/20260903/02-whole-suite-review-leg.md)

In `docs/canonical/review-legs.md`, append a section:

> ## The suite leg
>
> `review-legs.js` runs the host's bare `testCommand` once per legs iteration as the `suite` leg —
> the one observation that sees repo-wide scanner tests the scoped gate glob and the at-risk stem
> match cannot. It is blocking in `review-legs.js`, `verdict.js` (`REVIEW_LEGS` + `REVIEW_BLOCKING`,
> required in both scopes) and the review driver's `BLOCKING_LEGS` alike; `--require` was not the
> mechanism because on the review profile it widens the required set only. It has its own wave so
> it never overlaps another leg that runs host tests. (specs/20260903/02-whole-suite-review-leg.md)
