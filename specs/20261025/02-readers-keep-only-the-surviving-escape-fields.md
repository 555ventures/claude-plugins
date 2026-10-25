---
date: 2026-10-25
status: done
build_base: main
tier: standard
area: cross-cutting
breaking: true           # fleet-reader --json loses the `owed` key and --owed flag; commit-coverage loses two modes
depends_on: ["specs/20261025/01-the-commit-writes-the-escape-row.md"]
brief: n/a
open_markers: 0
diff_base: 84cf542ca6cda74cce6078d9f110b17b05fd17f7
---

# Readers keep only the surviving escape fields

## Goal

Sibling 01 slimmed the escape row to spec, files, review run, class, sha and via, and retired
the command that wrote the rest. This spec brings the readers in line: the fleet reader stops
counting fields no writer produces (`killedMatch`, `softMatch`, `preventedBy`, amendments, the
backfill work list) and drops the owed query that was built on `preventedBy`; commit coverage
keeps only the one derivation the commit uses; doctor, release and the Incident Policy's
materiality line describe the ledger as it now is; the last mentions of `/spec:escape` and the
dead fields leave `spec/` and `git/`. Done means a zero-hit grep for the retired names across
the plugin tree and a fleet reader whose escape block carries six keys.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `fleet-reader --json`'s `escapes` object carries exactly `total`, `byClass`, `recurrentUnguarded`, `byRepo`, `incidents`, `registry`; the human render of query 3 prints the `3. Escapes — N total` head line, the `byClass (escapes + build incidents)` line, the `buildIncidents` line and the `recurrentUnguarded` block, nothing else. (AC-20261025-02-1, AC-20261025-02-4, AC-20261025-02-13) | `killedMatchNull`, `softMatchTrue`, `preventedBy`, `amendments` and `unclassedRows` summarised fields the row no longer has. |
| D2 | Query 9 (`owed`) is deleted: no `owed` top-level key, `--owed` is an unknown flag (exit 2), `computeOwed`, `ownerBucket`, `renderOwed`, `renderOwedItemLine` and the `docs/spec-feedback/` frontmatter scan are gone; the reader answers eight fixed questions. (AC-20261025-02-1, AC-20261025-02-7, AC-20261025-02-13) | The owed query selected rows by `preventedBy`, a field no writer produces after 01; a query with an empty population is a lie waiting to be read. |
| D3 | A row's class is its own `class` field; `stage:"escape-class"` stays a KNOWN legacy stage in the drift census (validated for `ts` and `spec` only) and contributes nothing to `byClass`; the amendment join is deleted. (AC-20261025-02-2, AC-20261025-02-3) | Three amendment rows exist fleet-wide; un-joining them moves `scoped-gate-blind-spot` from 2 to 1 and `promise-carried-not-delivered` from 6 to 5 — neither crosses the guard threshold of 3. Rejected: rewriting the three rows (the ledger is append-only fleet-wide). |
| D4 | The drift census validates every `stage:"escape"` row with 01's slim `validateEscapeRow`; `lib/escape-row.js` exports exactly `CLASS_ID_RE`, `VIA`, `escapeFiles`, `validateEscapeRow` — `escapeKey`, `joinAmendments`, `validateAmendmentRow`, `PREVENTED_BY`, `FOUND_BY`, `SEVERITY`, `UNCLASSED_REASONS` are deleted. (AC-20261025-02-3, AC-20261025-02-6) | 01 kept them exported only so this reader kept running until now. |
| D5 | `commit-coverage.js` keeps commit mode only: `--since` and `--repos-root` are usage errors (exit 2) naming `--commit`; the header, `USAGE` and the window/fleet functions go; `tests/commit-coverage/commit-coverage.fixtures.js` (imported by nothing) is deleted. (AC-20261025-02-5, AC-20261025-02-14) | With the row written automatically, "the share of fix commits that record a row" is 1 by construction; a measurement of a constant is dead code. |
| D6 | `doctor.md`'s Escapes paragraph keeps the contradicted-CLEAN correlation and the "≥10 CLEAN rows and zero escape rows" bullet, and drops the `preventedBy:"doctrine"` open-repair, the `preventedBy:"enforcer"` enforce-due and the backfill bullets; `release.md`'s Phase 2 STOP `next` text reads `route the defect to the normal flow — /spec:fix for a repair (its commit records the escape row), or a spec`; `core.md` § Incident Policy's Materiality bullet reads `escape rows and build-row \`incidents\`` with no amendment clause. (AC-20261025-02-8) | Each sentence named a field, mode or command that no longer exists. |
| D7 | `spec-build-driver.js`'s `--mark incident` refusal reads `--mark incident needs --class <kebab-case id> (the fleet's class vocabulary — read \`.escapes.registry\` from fleet-reader --json first)`; `verdict.js`'s two comments naming `/spec:escape` say `the escape row` instead. Zero occurrences of `/spec:escape`, `spec:escape`, `escape.md`, `killedMatch`, `softMatch`, `preventedBy`, `unclassedReason`, `--owed`, `--amend`, `escape-class` remain under `spec/`, `git/`, `README.md` and `docs/canonical/` — except the `escape-class` literal inside `fleet-reader.js`'s drift-census stage set (D3). (AC-20261025-02-7, AC-20261025-02-11, AC-20261025-02-15) | A retired identifier that survives in prose or comments is the next dangling reference. |
| D9 | (build, auto-picked add to scope) AC-20261025-02-7's grep covers `docs/canonical/`, where `pipeline.md` (the owed paragraph) and `review.md` (the `killedMatch`/`softMatch`/`unclassedReason`/`--amend`/amendment paragraphs) still carry retired names; the build applies the Canonical Delta to those two files itself so the gate can go green, with the retired names elided and the amendment paragraph's `specs/20260901/07-escape-class-contract.md` citation dropped with it. Review's delta step finds them already applied. (AC-20261025-02-7) | Otherwise AC-7 stays red until the review close, after the last build gate. |
| D10 | (build, auto-picked add to scope) `expire-tests.js`'s section comment `escape-class ids` is the one AC-20261025-02-7 hit outside the File Plan; it reads `defect-class ids`. Comment only — the script's logic is untouched, as the Rationale promises. (AC-20261025-02-7) | The zero-hit grep cannot go green otherwise. |
| D8 | `cleanContradicted`, `cleanByVia`, the `incidents` join into `byClass`, `gate08`, `legRecency`, `population` and `driftCensus` keep their shapes byte-for-byte. (AC-20261025-02-9, AC-20261025-02-10) | The reviewer-quality measurement is the reason the row survives at all. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/fleet-reader.js | MODIFY | scripts | query 3 slimmed (D1), query 9 deleted (D2), census without amendments (D3, D4), header rewritten |
| spec/scripts/lib/escape-row.js | MODIFY | scripts | exports exactly CLASS_ID_RE, VIA, escapeFiles, validateEscapeRow (D4) |
| spec/scripts/commit-coverage.js | MODIFY | scripts | commit mode only (D5) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | incident refusal wording (D7) |
| spec/scripts/verdict.js | MODIFY | scripts | two comments (D7) |
| spec/scripts/expire-tests.js | MODIFY | scripts | one section comment says `defect-class ids` (D10) |
| spec/commands/doctor.md | MODIFY | doctrine | Escapes paragraph (D6) |
| spec/commands/release.md | MODIFY | doctrine | Phase 2 STOP next text (D6) |
| spec/doctrine/core.md | MODIFY | doctrine | Materiality bullet (D6) |
| docs/canonical/pipeline.md | MODIFY | doctrine | Canonical Delta applied at build (D9) |
| docs/canonical/review.md | MODIFY | doctrine | Canonical Delta applied at build (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/fleet-reader/escape-class.test.js | DELETE | tests | amendment join retired (D3) |
| tests/commit-coverage/commit-coverage.fixtures.js | DELETE | tests | imported by nothing (D5) |
| specs/20260901/07-escape-class-contract.md | MODIFY | doctrine | AC 8 tagged retired (its only test is deleted, D3) |
| specs/20260903/01-owed-query-and-row-handoff.md | MODIFY | doctrine | AC 8 tagged retired (the owed key leaves the pin, D2) |
| tests/fleet-reader/queries.test.js | MODIFY | tests | AC-20261025-02-2, AC-20261025-02-9, AC-20261025-02-10 |
| tests/fleet-reader/review-fixes.test.js | MODIFY | tests | AC-20261025-02-1 |
| tests/fleet-reader/slim-escapes.test.js | CREATE | tests | AC-20261025-02-3, AC-20261025-02-4, AC-20261025-02-6, AC-20261025-02-13 |
| tests/commit-coverage/commit-coverage.test.js | CREATE | tests | AC-20261025-02-5, AC-20261025-02-14 |
| tests/consistency/escape-command-retired.test.js | CREATE | tests | AC-20261025-02-7, AC-20261025-02-8 |
| tests/build/build-driver-commit.test.js | MODIFY | tests | AC-20261025-02-11, AC-20261025-02-15 |

## Contracts

`fleet-reader.js` after this spec:

```
fleet-reader.js [--repos-root <dir>] [--json]
--json top-level keys (sorted): cleanByVia, cleanContradicted, driftCensus, escapes, gate08, legRecency, population
escapes: { total, byClass, recurrentUnguarded, byRepo, incidents, registry }
exit 2: unknown flag (including --owed), --repos-root missing/unreadable
```

Human render of query 3 (D1), exactly these lines in this order:

```
3. Escapes — <total> total
  byClass (escapes + build incidents): <k=v, …>|none
  buildIncidents: <n>
  recurrentUnguarded:            (block as today) | recurrentUnguarded: none
```

Drift census stage sets (D3):

```js
const STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay', 'observe', 'release', 'prototype', 'fix'])
const SPEC_STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay'])
// stage:"escape"       → reasons from validateEscapeRow(row)
// stage:"escape-class" → missing-ts / missing-spec only (legacy, read by nothing else)
```

`commit-coverage.js` (D5):

```
commit-coverage.js --commit <sha> [--root <dir>] [--json]
exit 2: --since or --repos-root given ("only --commit remains — the window and fleet shares retired with specs/20261025/02")
```

`lib/escape-row.js` exports (D4): `{ CLASS_ID_RE, VIA, escapeFiles, validateEscapeRow }`.

## Behavior

- **Legacy fleet.** This repo's ledger has 20 `escape` rows, 3 `escape-class` rows, 3 build rows with `incidents`. After this spec the census reports all 26 escape-family rows in shape; `byClass` loses the two amended classes' extra count (D3 names the numbers); `recurrentUnguarded` is unchanged for every class at or above 3.
- **Where the retired names may still appear.** `specs/` (history), `docs/adr/` (history), `docs/roadmap/` (briefs 19 and 25 are superseded by their own `Result` sections — not edited here), `tests/` assertion messages, and `.claude/spec-runs.jsonl` rows. AC-7's grep scope is `spec/`, `git/`, `README.md`, `docs/canonical/`.

## Acceptance Criteria

- **AC-20261025-02-1**: WHEN `fleet-reader.js --repos-root <fixture> --json` runs over a fleet large enough to exceed 64KB of output THE SYSTEM SHALL exit 0 and emit top-level keys exactly `["cleanByVia","cleanContradicted","driftCensus","escapes","gate08","legRecency","population"]` (sorted) → rewrites tests/fleet-reader/review-fixes.test.js :: review finding 1
- **AC-20261025-02-13**: WHEN `fleet-reader.js --repos-root <fixture> --json` runs over a fleet whose rows include one slim escape row THE SYSTEM SHALL emit `Object.keys(escapes).sort()` exactly `["byClass","byRepo","incidents","recurrentUnguarded","registry","total"]` and no `owed` top-level key; WHEN `--owed` is passed THE SYSTEM SHALL exit 2 naming `--owed` on stderr → writes tests/fleet-reader/slim-escapes.test.js
- **AC-20261025-02-2**: WHEN a repo holds `{"stage":"escape","class":null,"ts":"2026-08-14T22:49:11.580Z","spec":"specs/a.md","file":"x.js",…}` and an amendment `{"stage":"escape-class","escapeTs":"2026-08-14T22:49:11.580Z","spec":"specs/a.md","file":"x.js","class":"silent-fallback",…}` THE SYSTEM SHALL count `byClass.unclassed = 1` and no `silent-fallback` key from that pair, while explicit `class` values still count and fold into `recurrentUnguarded` at 3 → rewrites tests/fleet-reader/queries.test.js :: AC-20260820-05-5 / AC-20260901-07-11
- **AC-20261025-02-3**: WHEN the drift census reads a legacy escape row carrying `foundBy`, `severity`, `killedMatch:"maybe"`, `preventedBy:"test"`, `unclassedReason:"no-fix-diff"`, a slim row `{ts, stage:"escape", spec, files:["a.js"], reviewRunId:null, class:null, sha:null, via:"commit"}`, and an `escape-class` row with `ts` and `spec` THE SYSTEM SHALL count all three as `inShape` with an empty `drift` object; WHEN the slim row's `class` is `"Bad Class"` THE SYSTEM SHALL report `drift["class-malformed"] = 1` and no `amendment-unmatched` or `class-missing` key anywhere → writes tests/fleet-reader/slim-escapes.test.js
- **AC-20261025-02-4**: WHEN the human render runs over a fleet with 2 escape rows (`class: "silent-fallback"` and `class: null`) and one build row with one `incidents` entry of class `silent-fallback` THE SYSTEM SHALL print the query-3 block as exactly `3. Escapes — 2 total` / `  byClass (escapes + build incidents): silent-fallback=2, unclassed=1` / `  buildIncidents: 1` / `  recurrentUnguarded: none`, with no line containing `preventedBy`, `amendments`, `unclassed rows`, `kill match` or `/spec:escape` → writes tests/fleet-reader/slim-escapes.test.js
- **AC-20261025-02-5**: WHEN `commit-coverage.js --since 2026-08-17 --root <repo>` or `--repos-root <dir>` is run THE SYSTEM SHALL exit 2 with stderr containing `--commit` and `retired` → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261025-02-14**: WHEN `commit-coverage.js --commit HEAD --root <git fixture with a File-Plan-listed file and a prior review row> --json` is run THE SYSTEM SHALL CONTINUE TO exit 0 with `mode:"commit"`, a `landed` entry carrying `specs[0].reviewRunId` and `specs[0].reviewTs`, and the `offer` boolean → writes tests/commit-coverage/commit-coverage.test.js
- **AC-20261025-02-6**: WHEN `require('spec/scripts/lib/escape-row.js')` is inspected THE SYSTEM SHALL export exactly the keys `["CLASS_ID_RE","VIA","escapeFiles","validateEscapeRow"]` (sorted) → writes tests/fleet-reader/slim-escapes.test.js
- **AC-20261025-02-7**: WHEN every file under `spec/`, `git/`, `docs/canonical/` and `README.md` is grepped (node_modules excluded) for `/spec:escape`, `spec:escape`, `escape.md`, `killedMatch`, `softMatch`, `preventedBy`, `unclassedReason`, `--owed`, `--amend`, `joinAmendments`, `validateAmendmentRow`, `escapeKey`, `computeOwed` THE SYSTEM SHALL report zero hits, and for `escape-class` exactly the hits inside `spec/scripts/fleet-reader.js` → writes tests/consistency/escape-command-retired.test.js
- **AC-20261025-02-8**: WHEN `spec/commands/doctor.md`, `spec/commands/release.md` and `spec/doctrine/core.md` are read THE SYSTEM SHALL find in doctor's Escapes paragraph the literals `contradicted CLEAN` and `zero escape rows` and none of `open repair`, `backfill`, `enforce\` is due`; in release the literal `/spec:fix for a repair (its commit records the escape row)`; in core's Materiality bullet the literal `escape rows and build-row \`incidents\`` and no `amendment` → writes tests/consistency/escape-command-retired.test.js
- **AC-20261025-02-9**: WHEN a repo's CLEAN review rows and escape rows are read THE SYSTEM SHALL CONTINUE TO derive `cleanContradicted` per repo and fleet with `falseCleanRate` as `contradicted / cleans` and `null` for a repo with no CLEAN rows → reuses tests/fleet-reader/queries.test.js :: cleanContradicted carries falseCleanRate
- **AC-20261025-02-10**: WHEN build rows carry `incidents` entries THE SYSTEM SHALL CONTINUE TO join them into `escapes.byClass` and `recurrentUnguarded` while `escapes.total` counts escape rows only → reuses tests/fleet-reader/queries.test.js :: Incident Policy: build-row incidents join escapes.byClass
- **AC-20261025-02-11**: WHEN `spec-build-driver.js <spec> --mark incident` runs without `--class` or with `--class "Bad Class"` THE SYSTEM SHALL exit non-zero with stderr containing `.escapes.registry` and not containing `escape.md` → rewrites tests/build/build-driver-commit.test.js :: Incident Policy: --mark incident records a classed entry
- **AC-20261025-02-15**: WHEN `spec-build-driver.js <spec> --mark incident --class silent-fallback` runs at a live step THE SYSTEM SHALL CONTINUE TO record a `{ts, class:"silent-fallback", exit}` entry on the build sidecar without moving the state → reuses tests/build/build-driver-commit.test.js :: Incident Policy: --mark incident records a classed entry
- **AC-20261025-02-12** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass `node scripts/plugin-bump.js --check` with the `spec` manifest bumped → reuses tests/spec-paths.test.js :: AC-20260901-07-15

## Assumptions (escalation triggers)

- A1: Sibling 01 has landed (`lib/escape-row.js` exports the slim `validateEscapeRow` and `escapeFiles`) — **if false:** STOP; `depends_on` is the gate.
- A2: `tests/commit-coverage/commit-coverage.fixtures.js` has no importer (grep at plan time: none) — **if false:** keep the file and add its importer to the File Plan.
- A3: `tests/consistency/replay-retired.test.js :: AC-20261024-05-5` keeps passing: it asserts `escapes` and `population` keys exist and no retired corpus key under `escapes` — **if false:** the escapes object lost a key this spec keeps; fix the reader, never the test.
- A4: No third-party dependency adjudicates a claim here; `spikes: 0`.

## Rationale

The reader side could not go first: the fleet reader imported the amendment join and the owed query from the row module, so deleting the fields before the writer changed would have left a reader validating rows against a shape no writer produced, and deleting the reader before the writer would have hidden rows the old command was still writing. Hence writer (01) then reader (02).

Query 9 (`owed`) goes because its population was defined by `preventedBy`, which stops being written in 01; a query over a field with a dead writer returns the same answer forever. The window and fleet modes of commit coverage measured the share of fix commits that recorded an escape row — after 01 that share is 1 by construction for every landed fix commit, so the number has no information left. The three amendment rows are left in the ledgers as history; D3 states the two class counts they move, and neither crosses the guard threshold, so the Incident Policy's answer does not change.

Collision closure (literals `preventedBy`, `killedMatch`, `softMatch`, `unclassedReason`, `joinAmendments`, `validateAmendmentRow`, `escapeKey`, `computeOwed`, `spec:escape`; 77 hits, 30 files outside the File Plan, each waived here): `README.md`, `git/commands/commit.md`, `spec/commands/escape.md`, `spec/scripts/escape-row.js`, `spec/scripts/init-gen.js`, `spec/scripts/spec-review-driver.js`, `spec/scripts/spec-status.js`, `spec/doctrine/stages/stage-review.md` and their tests (`tests/escape/*`, `tests/queue/queue-overlay.test.js`, `tests/review/review-driver.test.js`, `tests/spec-status.test.js`, `tests/status/red-alarm.test.js`) are sibling 01's File Plan rows and land first; `docs/adr/*`, `docs/audit/*`, `docs/roadmap/*` are history; `docs/canonical/*` changes through the Canonical Delta; `.claude/rules/spec-pipeline.md` is host-generated; `tests/fixtures/minimal-host/.claude/spec-runs.jsonl` holds legacy rows that D3/D4 keep in shape as data; `tests/fixtures/minimal-host/docs/spec-feedback/20260716-brief.md` was read only by the owed scan and stays as a shared fixture; `tests/review/verdict.test.js`, `tests/review/stopped-row-durability.test.js`, `tests/spec-paths.test.js` mention the names in comments and assertion messages only.

What this deliberately keeps: the contradicted-CLEAN join (the only measurement of the reviewer that exists), the class registry (the incident rule's counter and the build driver's `--mark incident` vocabulary), and the test-expiry clause that keeps a class-citing test alive — `expire-tests.js` reads `class` and `incidents[].class` only, and is untouched.

Build deviations (folded 2026-10-25): `tests/commit-coverage/commit-coverage.test.js` did not exist,
so its CREATE row stood and its fixture helpers are inlined (the fixtures file is deleted here).
AC-11 (`rewrites`) and AC-15 (`reuses`) named the same build-driver case, which cannot be both red
and green; the case was split into two sharing the pointer prefix — a new red AC-11 case and the
original body carrying AC-15. A lock-time read of every pointer pair naming one case would have
caught it; the Gotchas section is at its cap and the red-check entry already covers pointer verbs,
so this stays a Rationale line.

## Canonical Delta

`docs/canonical/pipeline.md`: the fleet reader answers eight fixed questions; the owed query and its `escape:<repo>:<ts>:<file>` citation key are retired (this spec); the "Commit-time escape coverage" paragraph ends with: the window and fleet share numbers are retired — the row is written by the commit itself, so only the per-commit landing derivation (`--commit`) remains.

`docs/canonical/review.md`: the `escapes.softMatchTrue` counter and the `killedMatch` derivation are retired; the escape row carries spec, files, review run id, class, sha and via.

`docs/canonical/review-close.md`: unchanged — the class-citing keep clause reads the row's `class` field, which survives.
