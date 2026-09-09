---
date: 2026-09-08
status: implementing
build_base: main
tier: critical
area: release-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
diff_base: bace2b7b7493fd3ff268b97c148d153f59a15dd4
---

# Release e2e and journeys legs red on an unobserved run; one predicate, one home

## Goal

The release stage's e2e leg takes its green or red from the e2e command's own exit code, and
the counts it records (passed, failed, skipped) never force anything. A runner that exits 0
having executed zero tests, or whose declared count format never appears in its output,
therefore promotes a release on a suite that never ran. Review's at-risk and suite legs
already close this shape through one predicate landed by specs/20260907/03; release was never
given it. Done means: the e2e leg reds on an observed zero or an unmatched declared format,
the journeys leg reds when zero journeys were walked, the substrate leg is audited and left
alone with its reasons recorded, and the predicate plus the two count parsers it reads live in
exactly one shared module that both leg scripts import. The parser copy in release-legs.js
has already drifted from review's (first match versus last match, measured), which is the
evidence that a copy is not reuse.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/count-observation.js` is CREATED and exports `lastMatch(output, pattern)`, `computeTestsExecuted(output, pattern)`, `computeSkips(output, pattern)`, and `isUnobserved(testsExecuted)`, each moved byte-for-byte in semantics from `review-legs.js`'s current local functions (Contracts). `review-legs.js` deletes its four local definitions and requires the lib; no call site in it changes (AC-20260908-05-11, AC-20260908-05-12) | Sole-derivation rule (§ Risk Tiers, `review-legs.js` and `verdict.js`) and core § Doctrine Authoring: one binding home. Rejected: copying `isUnobserved` into release-legs.js the way the parsers were copied — that copy has already drifted (A1) |
| D2 | `release-legs.js` deletes its local `computeTestsExecuted`/`computeSkips` and requires the lib; skips are read as `computeSkips(output, pattern).skips` so the recorded `skipped` value is unchanged in shape. Consequence: the release parsers now read the LAST match in runner output, as review does (AC-20260908-05-5) | The decoy problem the suite leg's close record measured (a test name quoting the summary phrase precedes the real summary line) applies identically to an e2e runner; the release copy was still reading the first match (A1) |
| D3 | e2e leg: `executed = computeTestsExecuted(output, testCountPattern)` is computed on every run, red or green, and recorded as a new LAST key `executed` on the row's `observed` (`N` or the typed unavailability). `passed`/`failed`/`skipped` keep today's derivation exactly. On a child exit of 0 the row's `exit` is forced to 1 when `isUnobserved(executed)`; a non-zero child exit is recorded as-is (AC-20260908-05-1, AC-20260908-05-2, AC-20260908-05-4, AC-20260908-05-7) | The leg's promise is "the suite ran against staging"; an observed zero or a declared format that never matched is that promise unsupported (specs/20260907/03 D4, same words). `executed` is added because today an observed `0` with no skip format is recorded as `passed: {"unavailable":"no-format-declared"}` (A2, case B) — a forced red carrying that row would read as the one case that must never red. Ruled by the user 2026-09-08 |
| D4 | `{"unavailable":"no-format-declared"}` never forces on any leg; an all-skipped run (executed N, skipped N, passed 0, exit 0) never forces — the counts reach the promote question by name as release.md already requires (AC-20260908-05-3, AC-20260908-05-6) | A host that declared no format promised no observation, so nothing contradicts it (specs/20260907/03 D4). A second release-only rule on `passed` would be a second predicate. Ruled by the user 2026-09-08 |
| D5 | `append --leg journeys`: `exit` is forced to 1 when `walked` is `0` (with `failed` `0`); the observed row is unchanged, the append still lands, and the exit code returned is the row's own. `--walked 0 --failed 0` stays well-formed input, never an exit-2 refusal (AC-20260908-05-8, AC-20260908-05-9) | release.md requires one standing whole-product journey every release regardless of what shipped, so a zero walk contradicts doctrine the same way an observed zero contradicts a declared count. A red row keeps the ledger honest (`journeys: {walked:0,failed:0}` under GATE_RED); a refusal would leave the leg absent and the verdict UNVERIFIED with less evidence |
| D6 | substrate leg: no change. A zero-check manifest is already refused upstream (`manifest-check.sh` exits 5 → `stage` exits 2 with no row, measured A4); an all-inert manifest stays green because `inert` is a declared host state, the substrate analogue of `no-format-declared` (AC-20260908-05-10) | Audit outcome recorded as a pin so the next reader does not re-derive it. Reddening declared inertness would break every host whose production checks cannot run from the release machine, the same blast radius as reddening `no-format-declared` |
| D7 | `verdict.js` is untouched: `e2e` and `journeys` are already blocking in the release profile, so a forced-red row derives `GATE_RED` today (measured A5). `record` copies the widened `observed` verbatim, so the ledger's `e2e` object gains `executed` with no code change there `[no-ac: absence of change; AC-20260908-05-1 asserts the GATE_RED derivation end-to-end through the real script]` | The one-derivation rule for the verdict word (§ Risk Tiers); the row grammar stays typed and verdict.js stays a copier |
| D8 | Tests: the host builders in `tests/release-legs/release-legs.test.js` (`setupWorkingHost`, `writeConfig`, `writeReleaseManifest`, `readRows`, `rowFor`, `writeExecutable`, `makeStubBin`, `withStubPath`, `startStagingServer`, `waitForPort`, `GREEN_RELEASE_MANIFEST_CHECKS`) move verbatim into `tests/release-legs/release-legs.fixtures.js`; both the existing file and the new `tests/release-legs/e2e-unobserved.test.js` import them (AC-20260908-05-1 … -10) | The existing file holds 15 server-spawning tests under the 45 s per-file budget (specs/20260903/07); seven more in the same file risk the budget red. Sibling specs/20260908/03 establishes the `*.fixtures.js` pattern and does not touch `tests/release-legs/` |
| D9 | `spec/.claude-plugin/plugin.json` is bumped through `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the spec names no version literal `[no-ac: version discipline is a review check (plugin-bump.js --check in the gate), not a behavioural AC]` | § Planning version bump discipline |
| D10 | `release-legs.js`'s header row grammar gains the `executed` key on the e2e row and the two forcing rules (e2e, journeys) with their owner citation; `review-legs.js`'s header keeps its rule text and points at the lib for the predicate. `spec/commands/release.md` and `spec/templates/grounding-contract.md` are not edited `[no-ac: doctrine prose — release.md already cites the script header for row shapes (specs/20260823/01 D11); the contract's enum is unchanged, so no host restamps]` | core § Doctrine Authoring: the header is the row grammar's one home; a contract edit would move every host's stamped hash for a key the contract never enumerated |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| `spec/scripts/lib/count-observation.js` | CREATE | scripts | D1: `lastMatch`, `computeTestsExecuted`, `computeSkips`, `isUnobserved` — semantics moved from review-legs.js; header cites this spec and specs/20260907/03 D4/D5 |
| `spec/scripts/review-legs.js` | MODIFY | scripts | D1: four local functions deleted, lib required; call sites untouched; header comment points at the lib for the predicate |
| `spec/scripts/release-legs.js` | MODIFY | scripts | D2/D3/D5/D10: lib required, two local parsers deleted; e2e `executed` key + forced exit; journeys `walked === 0` forced exit; header row grammar updated |
| `tests/count-observation.test.js` | CREATE | tests | AC-20260908-05-11 |
| `tests/release-legs/release-legs.fixtures.js` | CREATE | tests | D8: host builders moved verbatim from release-legs.test.js, exported |
| `tests/release-legs/release-legs.test.js` | MODIFY | tests | D8: imports the fixtures module; AC-20260908-05-3, AC-20260908-05-6, AC-20260908-05-9 retag the existing AC-20260823-01-9, -8, -10 tests in place (the -8 expected row gains `executed: 5`) |
| `tests/release-legs/e2e-unobserved.test.js` | CREATE | tests | AC-20260908-05-1, AC-20260908-05-2, AC-20260908-05-4, AC-20260908-05-5, AC-20260908-05-7, AC-20260908-05-8, AC-20260908-05-10 |
| `spec/.claude-plugin/plugin.json` | MODIFY | doctrine | D9: semver bump + changelog paragraph via `plugin-bump.js` |

AC-20260908-05-12 has no File Plan test row: its oracle is review's own `suite` leg (see the AC).

## Contracts

```js
// spec/scripts/lib/count-observation.js — the sole home of the count parsers and the
// unobserved-run predicate (specs/20260907/03 D4/D5). No CLI. Semantics identical to the
// functions review-legs.js defined locally before this spec.

// Last match of `pattern` (a regex source string) over `output`, or null. LAST, never first:
// a test NAME quoting the summary phrase precedes the real summary line.
function lastMatch(output, pattern)               // -> RegExpMatchArray | null

// N | {unavailable:'no-format-declared'} (pattern absent or 'none') | {unavailable:'pattern-no-match'}
function computeTestsExecuted(output, pattern)

// {skips: N, todos: N} | {skips: {unavailable:'no-format-declared'}} | {skips: {unavailable:'pattern-no-match'}}
function computeSkips(output, pattern)

// true iff testsExecuted === 0 || testsExecuted.unavailable === 'pattern-no-match'
function isUnobserved(testsExecuted)

module.exports = { lastMatch, computeTestsExecuted, computeSkips, isUnobserved }
```

Release manifest row grammar (only the e2e row changes shape; `executed` is the last key):

```jsonc
// e2e — AFTER (D3). executed is always present; passed/failed/skipped exactly as today.
{"leg":"e2e","exit":E,"observed":{"passed":N|{"unavailable":R},"failed":M|{"unavailable":R},
    "skipped":K|{"unavailable":R},"executed":N|{"unavailable":R}}}   // R = "no-format-declared"|"pattern-no-match"

// child exit 0, testCountPattern declared, runner printed "executed 0 tests", no skip format — forced red
{"leg":"e2e","exit":1,"observed":{"passed":{"unavailable":"no-format-declared"},"failed":0,
    "skipped":{"unavailable":"no-format-declared"},"executed":0}}
// child exit 0, testCountPattern declared, never matched — forced red
{"leg":"e2e","exit":1,"observed":{"passed":{"unavailable":"pattern-no-match"},"failed":0,
    "skipped":{"unavailable":"no-format-declared"},"executed":{"unavailable":"pattern-no-match"}}}
// child exit 0, no testCountPattern — never forced (D4)
{"leg":"e2e","exit":0,"observed":{"passed":{"unavailable":"no-format-declared"},"failed":0,
    "skipped":{"unavailable":"no-format-declared"},"executed":{"unavailable":"no-format-declared"}}}
// child exit 3, pattern matched "executed 4 tests" — recorded as-is, executed still observed
{"leg":"e2e","exit":3,"observed":{"passed":{"unavailable":"no-format-declared"},
    "failed":{"unavailable":"no-format-declared"},"skipped":{"unavailable":"no-format-declared"},"executed":4}}

// journeys — shape unchanged; exit forced (D5)
{"leg":"journeys","exit":1,"observed":{"walked":0,"failed":0}}
```

The release ledger row (`verdict.js --profile release --ledger`) copies `observed` verbatim, so
its `e2e` object carries `executed` from the first run after this lands; older rows lack the
key and no reader is required to backfill it.

## Behavior

**e2e leg (D2/D3/D4).** After the child returns, `executed` is derived from the retained output
through the lib's last-match parser. The existing branch on the child's exit code runs
unchanged to produce `passed`/`failed`, `skipped` is `computeSkips(...).skips`, and then:
`exit = r.code === 0 && isUnobserved(executed) ? 1 : r.code`. The `stage` summary prints the
row with `❌` and `RED_BLOCKING: e2e` like any other red leg; `record` derives `GATE_RED`
through verdict.js with no change there. Reachability: as specs/20260907/03 A2 measured for
`node --test`, a plain runner exits non-zero whenever it prints no count line; the shape is
reached through a wrapper `e2eCommand` that swallows its own failure — a "no tests found"
refusal at exit 0 is the reported class.

**journeys (D5).** `append --leg journeys --walked 0 --failed 0` writes
`{"leg":"journeys","exit":1,"observed":{"walked":0,"failed":0}}` and exits 1, so release.md's
existing "exit 1 → STOP, skip to record" branch fires with no doctrine edit. `--walked 0
--failed 0` is not malformed input: the two non-negative-integer checks and the duplicate-row
refusal (exit 2) are untouched.

**substrate (D6).** Nothing changes. `{"checks":[]}` → manifest-check exit 5 → `stage` exit 2,
zero rows; a manifest whose every row is `kind: inert` → `TOTAL=N FAILS=0 INERT=N`, exit 0,
green substrate row.

**review-legs.js (D1).** Byte-identical behaviour on every leg; only the definition site of four
functions moves. The whole-suite leg of this spec's own review is the oracle.

## Acceptance Criteria

- **AC-20260908-05-1**: WHEN `release-legs.js stage` runs against a synthetic host declaring
  `testCountPattern: "executed (\\d+) tests"` and no `skipReportPattern`, whose `e2eCommand`
  prints `executed 0 tests` and exits 0, THE SYSTEM SHALL append the row
  `{"leg":"e2e","exit":1,"observed":{"passed":{"unavailable":"no-format-declared"},"failed":0,"skipped":{"unavailable":"no-format-declared"},"executed":0}}`,
  print `RED_BLOCKING: e2e`, exit 1, and that manifest — with `journeys` (`--walked 1 --failed 0`)
  and `production` (`--result skipped`) rows appended through `append` — fed to
  `verdict.js --profile release` SHALL print `GATE_RED` → `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-2**: WHEN the same host's `e2eCommand` prints `runner refused: no tests found`
  and exits 0 (the declared pattern never matches), THE SYSTEM SHALL append
  `{"leg":"e2e","exit":1,"observed":{"passed":{"unavailable":"pattern-no-match"},"failed":0,"skipped":{"unavailable":"no-format-declared"},"executed":{"unavailable":"pattern-no-match"}}}`
  and exit 1 → `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-3**: WHEN a host declares no `testCountPattern` and its `e2eCommand` exits 0
  printing no count line, THE SYSTEM SHALL CONTINUE TO append an e2e row with `exit` `0`,
  `passed` `{"unavailable":"no-format-declared"}` and `failed` `0` — a host that declared no
  format is never forced (retag of AC-20260823-01-9) → `tests/release-legs/release-legs.test.js`
- **AC-20260908-05-4**: WHEN the AC-20260908-05-3 host runs, THE SYSTEM SHALL record
  `executed` as `{"unavailable":"no-format-declared"}` on that same exit-0 row — the key is
  present on every e2e row, never omitted → `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-5**: WHEN a host declares `testCountPattern: "executed (\\d+) tests"` and
  its `e2eCommand` prints the line `✔ pins "executed 0 tests"` FOLLOWED BY `executed 5 tests`
  and exits 0, THE SYSTEM SHALL append an e2e row with `exit` `0` and `executed` `5` — the
  last match, never the quoted decoy (`"… executed 0 tests\nexecuted 5 tests"` → `5`) →
  `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-6**: WHEN a host declares both patterns and its `e2eCommand` prints
  `executed 5 tests` and `skipped 1 test` and exits 0, THE SYSTEM SHALL CONTINUE TO append an
  e2e row with `exit` `0`, `passed` `4`, `failed` `0`, `skipped` `1` — an observed non-zero
  count is never reddened (retag of AC-20260823-01-8; the expected row additionally carries
  `executed: 5`, asserted by AC-20260908-05-5's rule) → `tests/release-legs/release-legs.test.js`
- **AC-20260908-05-7**: WHEN a host declares `testCountPattern` and its `e2eCommand` prints
  `executed 4 tests` and exits 3, THE SYSTEM SHALL append
  `{"leg":"e2e","exit":3,"observed":{"passed":{"unavailable":"no-format-declared"},"failed":{"unavailable":"no-format-declared"},"skipped":{"unavailable":"no-format-declared"},"executed":4}}`
  — the child's real exit code, `executed` still observed on a red run →
  `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-8**: WHEN `release-legs.js append --manifest <fresh> --leg journeys --walked 0
  --failed 0` runs, THE SYSTEM SHALL append `{"leg":"journeys","exit":1,"observed":{"walked":0,"failed":0}}`
  and exit 1, and a release manifest holding that row with every other leg green fed to
  `verdict.js --profile release` SHALL print `GATE_RED` → `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-9**: WHEN `append --leg journeys` runs with `--walked 1 --failed 0`, THE
  SYSTEM SHALL CONTINUE TO append `{"leg":"journeys","exit":0,"observed":{"walked":1,"failed":0}}`
  and exit 0; WHEN it runs with `--walked 2 --failed 1` THE SYSTEM SHALL CONTINUE TO append
  an exit-1 row and exit 1 (retag of AC-20260823-01-10) → `tests/release-legs/release-legs.test.js`
- **AC-20260908-05-10**: WHEN `stage` runs against a host whose `.claude/release-manifest.json`
  holds only `kind: inert` rows (one row), THE SYSTEM SHALL CONTINUE TO append
  `{"leg":"substrate","exit":0,"observed":{"checked":1,"failed":0,"inert":1}}`; WHEN the manifest
  is `{"checks":[]}` THE SYSTEM SHALL CONTINUE TO exit 2 naming the release-manifest remedy with
  no row appended → `tests/release-legs/e2e-unobserved.test.js`
- **AC-20260908-05-11**: WHEN `lib/count-observation.js` is required, THE SYSTEM SHALL export
  `isUnobserved` returning `true` for `0` and `{unavailable:'pattern-no-match'}` and `false` for
  `3` and `{unavailable:'no-format-declared'}`; `computeTestsExecuted('a\nexecuted 0 tests\nexecuted 5 tests\n', 'executed (\\d+) tests')`
  SHALL return `5`; `computeSkips(output, 'none')` SHALL return `{skips:{unavailable:'no-format-declared'}}`
  → `tests/count-observation.test.js`
- **AC-20260908-05-12** `[oracle: suite]`: WHEN `review-legs.js` runs after the four local
  functions are replaced by the lib require, THE SYSTEM SHALL CONTINUE TO force the at-risk and
  suite legs red on an observed `0` or a `pattern-no-match`, and SHALL CONTINUE TO leave
  `no-format-declared` unforced — the existing pins AC-20260907-03-5 … -8 in
  `tests/review/legs-verdict-pair.test.js` are the executed evidence, run whole by review's suite
  leg (that file is not edited here: sibling specs/20260908/03 owns it this week)

## Assumptions (escalation triggers)

- **A1**: the release copy of the count parser has drifted from review's. *Executed 2026-09-08*:
  over `'✔ test pins "executed 0 tests"\nexecuted 5 tests\n'` with pattern `executed (\d+) tests`,
  release-legs.js's `new RegExp(p).exec` form yields `0`; review-legs.js's `lastMatch` form yields
  `5`. — **if false:** D2's behaviour change collapses to a pure move; AC-20260908-05-5 still holds.
- **A2**: the pre-image is vacuous-green on both forcing shapes, and an observed zero is
  currently recorded as `no-format-declared`. *Executed 2026-09-08* through the real
  `release-legs.js stage` against a synthetic host (git repo, child-process staging server,
  one exec check): (A) pattern declared, runner prints a refusal and exits 0 → stage exit 0,
  row `passed: {"unavailable":"pattern-no-match"}`, exit 0; (B) runner prints `executed 0 tests`,
  exit 0 → stage exit 0, row `passed: {"unavailable":"no-format-declared"}` (skipped's reason
  masks the observed zero); (C) no pattern → exit 0, `no-format-declared`; (D) executed 3,
  skipped 3 → exit 0, `passed: 0, skipped: 3`. — **if false:** STOP, ask the user; the defect
  was mis-derived.
- **A3**: `append --leg journeys --walked 0 --failed 0` exits 0 today. *Executed 2026-09-08*:
  exit 0, row `{"leg":"journeys","exit":0,"observed":{"walked":0,"failed":0}}`. — **if false:**
  D5 is already landed somewhere; find the owner and drop D5.
- **A4**: the substrate leg cannot observe zero checks and an all-inert manifest is green.
  *Executed 2026-09-08*: `{"checks":[]}` → manifest-check exit 5 ("expected … at least one
  entry"); one `inert` row → `TOTAL=1 FAILS=0 INERT=1`, exit 0. — **if false:** D6 becomes a
  forcing decision mirroring D3 (`checked === 0` forces); amend at build, never silently.
- **A5**: `verdict.js --profile release` derives `GATE_RED` from a red e2e row with every other
  required leg present. *Executed 2026-09-08*: a seven-row manifest with `e2e` exit 1 →
  `GATE_RED`, exit 1. — **if false:** STOP; a change to verdict.js is critical-tier and outside
  this File Plan.
- **A6**: no test outside `tests/release-legs/` and `tests/review/legs-verdict-pair.test.js`
  spawns `release-legs.js` or asserts an e2e row shape; no test pins release-legs.js's
  "copied verbatim" header sentence or the local function names (grep executed 2026-09-08 over
  `tests/`: no hit for `computeTestsExecuted`, `isUnobserved`, `lastMatch`, or the sentence
  outside `tests/review/review-legs.test.js`). — **if false:** the colliding pin is updated in
  place and retagged, never weakened (§ Gotchas retired-literal entry).
- **A7**: sibling hardened specs (20260908/01–04) touch none of `release-legs.js`,
  `review-legs.js`, `tests/release-legs/*`, or `lib/count-observation.js` (File Plans read
  2026-09-08); 03 modifies `tests/review/legs-verdict-pair.test.js`, which is why AC-12 uses an
  oracle instead of a retag there. — **if false:** rebase and re-derive `diff_base` at build
  Phase 0 per § Gotchas.
- **A8**: `scripts/size-ratchet.js` (specs/20260908/01, hardened) does not exist at build time.
  — **if false:** the orchestrator runs `node scripts/size-ratchet.js --root . --update` after
  all rows land so the new lib file and the two shrunk scripts are baselined (orchestrator
  duty, outside the File Plan).

## Rationale

Three legs were audited for the shape "green derived from a child's exit code while the
recorded observation says nothing ran". e2e has it fully; journeys has it in miniature (a
session can record a zero walk as green, though doctrine says every release walks at least
one journey); substrate does not have it, because its upstream check already refuses an empty
manifest and its only zero-like state, inert, is a declared one. The rule the user set at plan
time governs all three: a *declared* absence (`no-format-declared`, `inert`) is never a red,
because the host promised no observation; an *observed* zero or a promised format that never
appeared is always a red, because the promise was made and not kept.

The predicate is reused, not re-authored, and reuse here means an import. The plan brief said
"reuse rather than invent a second one", and the repository already holds the counter-example:
release-legs.js's header says its parsers were "copied verbatim so the two consumers never
read them differently", and they now read differently (A1). Moving the four functions into a
lib is the smallest change that makes the sentence true again and makes the next leg unable
to drift. The lib name avoids `lib/observation.js`, which already exists for the ledger's
observation-state algorithm and is unrelated.

The `executed` key was the one fork put to the user. Without it a forced red can carry
`passed: no-format-declared` (A2 case B), which reads as the exact case D4 says must never
red; the retained `e2e.txt` would disambiguate, but the ledger row is the carrier that outlives
the run (core § Feedback Loop) and should not need a second file to be read correctly. The
user also declined a release-only `passed === 0` rule for all-skipped suites: skips reach the
promote question by name, as release.md already requires, and a second predicate would be the
thing this spec exists to remove.

Admission bar (core § Incident Policy): considered and judged not to apply. This is the third
vacuous-green occurrence in the ledger's memory (36c2f14, the prax review behind 20260907/03,
and this), but the fix is each leg keeping its own exit promise through the predicate that leg
family already owns, not a new standing guard wired around the legs. Ruled by the user
2026-09-08.

What to watch during execution: the test-file budget — `release-legs.test.js` is already 15
server-spawning tests, hence D8's fixtures module and a second file. The AC-20260823-01-8
expected row must gain `executed: 5` in place (a deep-equal on the whole row), retagged as the
AC-20260908-05-6 pin; do not loosen it to a subset match. `review-legs.js`'s edit is deletion
plus one require: any diff beyond that in the file is out of plan.

**Collision closure (run at lock, 2026-09-08, `--literal computeTestsExecuted --literal
computeSkips --literal isUnobserved`).** The literals leg returned five hits, every one inside
`release-legs.js` or `review-legs.js`, both already File Plan rows — nothing waived, nothing
widened. The `executes` tier names the suites that spawn the two changed scripts:
`tests/release-legs/release-legs.test.js` is a File Plan row (D8 moves its fixtures; the
AC-20260823-01-8 row gains `executed: 5`); `tests/spec-paths.test.js` only resolves the key;
the seven review suites exercise `review-legs.js`, whose observable behaviour is byte-identical
after D1, so no fixture repair is planned and this spec's own suite leg adjudicates if that
reading is wrong. `tests/consistency/entrypoints.test.js` excludes `spec/scripts/lib/` from its
executable inventory by design, so the new lib file needs no `spec/entrypoints.json` row and no
`spec-paths` key.

## Canonical Delta

- `docs/canonical/release-pipeline.md` § Counts are only ever derived from declared formats —
  append: "The e2e row also carries `executed` (the raw count, or the same typed unavailability).
  On a child exit of 0 the leg's `exit` is forced to 1 when `executed` is an observed `0` or a
  `{"unavailable":"pattern-no-match"}` — the same predicate review's at-risk and suite legs
  apply, imported from `spec/scripts/lib/count-observation.js`, never a second copy.
  `no-format-declared` never forces, and an all-skipped run (executed N, skipped N) never
  forces: skips reach the promote question by name. `append --leg journeys` forces exit 1 on
  `walked: 0`, because every release walks at least one journey by doctrine; the substrate leg
  needs no rule — an empty manifest is refused before any row exists and `inert` rows are a
  declared state, never an unobserved one (specs/20260908/05-release-e2e-unobserved-count.md
  D3–D6)."
- `docs/canonical/review.md` — in the `suite` leg paragraph, after "The at-risk leg carries the
  identical rule.", append: "The predicate and both count parsers live in
  `spec/scripts/lib/count-observation.js`; release's e2e leg imports the same functions
  (specs/20260908/05-release-e2e-unobserved-count.md D1)."
