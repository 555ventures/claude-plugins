---
date: 2026-08-20
status: implementing
tier: standard
area: fleet-evidence
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 17
open_markers: 0
diff_base: 7bc2d57ee53e3245d34aa163c31571eabe724de9
---

# Fleet evidence reader (read-only)

## Goal

One zero-dependency script that reads every spec-run ledger on this machine and answers six
fixed questions — leg red-recency, the brief-08 gate, escape aggregates, replay debt,
CLEAN-contradicted-by-escape, and a schema-drift census — so pipeline questions stop being
answered from this repo's least-representative 14% of the evidence. Done means: the script
derives all six queries from a synthetic fleet in tests and from the real `~/Projects` by
hand, records nothing, and the admission bar's derivable fields (materiality, generality,
removability) have a named, executable source. Two JJ-ruled doctrine changes ride along:
the third-recurrence trigger adopts the fleet denominator, and escape rows gain a `class`
field so recurrence is mechanically countable going forward.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Ship as `spec/scripts/fleet-reader.js`; register spec-paths key `fleet-reader`; entrypoints manifest row cites `spec/doctrine/core.md` as the caller (AC-20260820-05-14) | scripts/ conventions + the orphan guard requires a named caller; /spec:fleet command registration is out of scope v1 (brief) |
| D2 | Discovery = brief 03's ratified rule verbatim: scan exactly one level under `--repos-root` (default `~/Projects` via `os.homedir()`); a repo is in scope iff `<dir>/.claude/spec.config.json` exists; skip entries starting with `.`, `node_modules`, and worktree checkouts (`<dir>/.git` exists as a **file**) (AC-20260820-05-1) | stored repo lists rot (brief 17); the rule is already ratified and fleet-verified (A1) |
| D3 | Ledger glob per repo = `.claude/spec-runs*.jsonl` (live + year archives), matching spec-status.js's contract (AC-20260820-05-2) | spec-status already reads archives; a reader blind to them silently loses history the moment the first archive appears |
| D4 | Population first, always: both renders lead with repos scanned, rows read, unparseable count, oldest/newest ts per repo, before any query output; a config-bearing repo with no ledger is listed with rows=0, never omitted (AC-20260820-05-2) | the reader's biggest lie-risk is silent absence — an uncloned repo does not exist to it (brief 17) |
| D5 | Six queries fixed, no query flags; leg names are an **open set** treated as data, never an enum (AC-20260820-05-3) | fleet census found 17 distinct leg names incl. release legs (A3); a seventh query needs a spec, not a flag (brief Out of scope) |
| D6 | Brief-08 gate pins: cutover literal `2026-08-17` (v7.0.0 ship date, A6); qualifying pass = distinct spec with a `stage:"review"`,`verdict:"CLEAN"` row, `ts >= cutover`, in a non-self-repair repo; self-repair repo = `<dir>/.claude-plugin/marketplace.json` exists; in-window authored = distinct specs with a plan or build row `ts >= cutover`; share = self-repair authored / total authored (AC-20260820-05-4) | every term the gate needs, pinned to a literal so two sessions can't derive two answers; marketplace.json is the plugin-source marker no host has (A5) |
| D7 | core.md § Incident Policy adopts the **fleet denominator**: third recurrence counts across every readable repo ledger on the machine, numbers from the reader (literal invocation `node "$(spec-paths fleet-reader)" --json` cited in the paragraph); the "bar filled from one repo's ledger says so" degraded-mode clause stays (JJ ruling 2026-08-20) (AC-20260820-05-15) | per-repo counting starves the trigger — 26 fleet escapes vs at most 13 visible in any one repo (A2); JJ ruled fleet-wide this session |
| D8 | escape.md's row schema gains `"class":"<kebab-case defect-class id>"\|null` — derived from evidence in the existing step-4 classification call, `null` when underivable, never guessed; the 26 historical rows render as `unclassed` (JJ ruling 2026-08-20) (AC-20260820-05-16) | without a class label the bar's materiality count is forever hand-asserted; additive field, existing rows stay in-shape |
| D9 | `recurrent-unguarded` = a class with ≥3 fleet-wide escape recurrences — an escape row is by construction evidence no guard caught it, so recurrence count alone is the flag; latest recurrence ts rendered alongside (AC-20260820-05-5) | no machine link class→guard exists; a working guard stops the count growing, which is exactly what removability's kill-condition query measures |
| D10 | `observed` is opaque: the reader source contains **zero occurrences of the token `observed`** — structured fields only (leg name + exit, verdict, stage, ts, escape enums, replay outcomes, typed `promiseSweep`) (AC-20260820-05-10) | regexing the packed strings would mint the parser brief 16 exists to delete; the strongest pin is total absence |
| D11 | Queries consume every parseable row and render observed values **verbatim** (an out-of-enum `preventedBy:"test"` appears as itself in the distribution); the drift census counts shape violations separately; only unparseable lines are excluded from queries, and they are counted and printed per repo — nothing is ever coerced to zero or silently dropped (AC-20260820-05-8, AC-20260820-05-9) | coercing an unknown to zero is the exact defect specs/20260820/03 fixed; the reader must not reproduce it against itself (brief 17) |
| D12 | Read-only, stateless: no writes, no cache, no stored repo list; exit 0 = derived (even for 0 repos — the population render carries the absence), exit 2 = usage error (unknown flag, missing value, `--repos-root` not a directory) with the usage line on stderr (AC-20260820-05-11, AC-20260820-05-12) | ~1,100 rows parse in milliseconds (A1); a write channel is the brief's named failure mode |
| D13 | `--json` is the sole machine format (seven top-level keys: `population`, `legRecency`, `gate08`, `escapes`, `replayDebt`, `cleanContradicted`, `driftCensus`); bare invocation = human render, population first (AC-20260820-05-13) | scripts/ conventions: sentinels or `--json`, human render the only other format |
| D14 | Drift census "current shape" classifier (per-stage required fields + enums) is the closed set in Contracts; a failing row lands in a per-reason counted bucket per repo (AC-20260820-05-8) | prices brief 16's re-grounding (972 pre-v7 tier rows already measured, A7) and is free once the parser exists |
| D16 | gate08 clause thresholds (grounding from brief 17, which D6 cites by name): `clause1Met` = `hostSpecsCleaned >= 5`; `clause2Met` = `selfRepairShare < 0.20` (AC-20260820-05-4) | D6 pinned every derivation term but left the two comparison literals in the brief; AC-4's expected booleans (5 → true, 0.4286 → false) fix them unambiguously |
| D15 | Bump spec plugin to next free version (target 7.11.0) with last-3-versions description [no-ac: changelog surface — enforced by review's version-bump hard check, not testable ahead of the bump] | version bump discipline (pipeline rules § Planning); literal number is a target, not a pin (ledger gotcha) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/fleet-reader.js | CREATE | scripts | the reader: discovery (D2/D3), parse, six queries, human render + `--json` (D13), header + exit codes (D12) |
| spec/bin/spec-paths | MODIFY | scripts | add `fleet-reader` key → `$ROOT/scripts/fleet-reader.js` |
| spec/entrypoints.json | MODIFY | scripts | manifest row: `spec/scripts/fleet-reader.js` ← `spec/doctrine/core.md` (D1) |
| spec/doctrine/core.md | MODIFY | doctrine | § Incident Policy: fleet denominator + literal reader invocation; keep degraded-mode clause (D7) |
| spec/commands/escape.md | MODIFY | doctrine | `class` field: row-template JSON line + step-4 classification bullet (derive-then-confirm, null when unknown) (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | version bump + description changelog (D15) |
| tests/fleet-reader/discovery.test.js | CREATE | tests | AC-20260820-05-1, AC-20260820-05-2, AC-20260820-05-11, AC-20260820-05-12, AC-20260820-05-13 |
| tests/fleet-reader/queries.test.js | CREATE | tests | AC-20260820-05-3, AC-20260820-05-4, AC-20260820-05-5, AC-20260820-05-6, AC-20260820-05-7 |
| tests/fleet-reader/drift.test.js | CREATE | tests | AC-20260820-05-8, AC-20260820-05-9, AC-20260820-05-10 |
| tests/fleet-reader/doctrine-pins.test.js | CREATE | tests | AC-20260820-05-15, AC-20260820-05-16 |
| tests/spec-paths.test.js | MODIFY | tests | tag the existing shared-for escape section assert with AC-20260820-05-17 (regression pin) |

Orchestrator duty (outside the table): the entrypoints live-repo suite
(`tests/consistency/entrypoints.test.js`) is NOT edited — it passes mechanically once the
manifest row, spec-paths key, and core.md citation land (AC-20260820-05-14 rides on it).

## Contracts

```
Usage: node fleet-reader.js [--repos-root <dir>] [--json]
Exit codes: 0 = derived (0 repos found is still 0 — population carries the absence)
            2 = usage error (unknown flag, missing flag value, --repos-root not a directory);
                usage line on stderr
Flags: hand-rolled --flag value parsing only. No other flags in v1 (queries are fixed).
```

Discovery (D2): `readdirSync(reposRoot)`, one level. Include `<dir>` iff
`<dir>/.claude/spec.config.json` exists AND basename does not start with `.` AND basename
!== `node_modules` AND `<dir>/.git` is not a file. Ledgers = every file matching
`<dir>/.claude/spec-runs*.jsonl` (D3). Self-repair marker (D6):
`<dir>/.claude-plugin/marketplace.json` exists.

`--json` top-level shape (D13) — all counts are per readable data, never imputed:

```json
{
  "population": { "reposRoot": "...", "scanned": 11, "repos": [
      { "name": "hearwell", "rows": 77, "unparseable": 0,
        "oldest": "…", "newest": "…", "selfRepair": false } ] },
  "legRecency": { "fleet": [
      { "leg": "at-risk", "totalRuns": 47, "runsSinceRed": 24,
        "lastRedTs": "…", "neverRed": false } ],
    "byRepo": { "hearwell": [ { "leg": "at-risk", "totalRuns": 5,
        "runsSinceRed": 5, "lastRedTs": null, "neverRed": true } ] } },
  "gate08": { "cutover": "2026-08-17", "hostSpecsCleaned": 8,
    "byRepo": { "salon-os": 5, "upwell": 3 }, "clause1Met": true,
    "inWindowAuthored": 36, "selfRepairAuthored": 15,
    "selfRepairShare": 0.4167, "clause2Met": false },
  "escapes": { "total": 26, "killedMatchNull": 22,
    "preventedBy": { "doctrine": 5, "enforcer": 6, "none": 4,
      "review-check": 3, "runtime-leg": 7, "test": 1 },
    "byClass": { "unclassed": 26 }, "recurrentUnguarded": [],
    "byRepo": { "upwell": 13 } },
  "replayDebt": { "byRepo": [ { "name": "hearwell", "replays": 0,
      "reviewsSinceLastReplay": 47, "neverReplayed": true } ] },
  "cleanContradicted": { "byRepo": [ { "name": "prax", "cleans": 120,
      "contradicted": 2, "escapesUnjoined": 1 } ] },
  "driftCensus": { "byRepo": [ { "name": "prax", "inShape": 200,
      "drift": { "pre-v7-tier": 75, "preventedBy-out-of-enum": 1 },
      "unparseable": 0 } ] }
}
```

(Numbers above are illustrative of shape; live values move. `selfRepairShare` is the raw
ratio rounded to 4 decimal places in JSON; the human render shows an integer percent,
round-half-up: `15/36` → `0.4167` → `42%`.)

Drift-census classifier (D14) — a row is in-shape iff ALL that apply hold; each failure
increments a named reason bucket:

- every row: `ts` string present; `stage` ∈ `plan|build|review|escape|replay|observe|release`
  (else `stage-unknown`); `spec` string present for plan/build/review/escape/replay
  (else `missing-spec`)
- `tier` when present ∈ `standard|critical` (else `pre-v7-tier`)
- review rows: `verdict` string present (else `review-missing-verdict`)
- escape rows: `preventedBy` ∈ `doctrine|enforcer|review-check|runtime-leg|none` (else
  `preventedBy-out-of-enum`); `foundBy` ∈ `user|later-spec|production` (else
  `foundBy-out-of-enum`); `severity` ∈ `hard|soft` (else `severity-out-of-enum`)
- unparseable lines (JSON.parse throws): counted per repo as `unparseable`, excluded from
  queries, always printed (D11)

Query definitions (leg names come only from `legs[].leg` + `legs[].exit` — never `observed`):

1. **legRecency** — over review rows carrying a `legs` array, ordered by `ts`: per leg name,
   `totalRuns`, `runsSinceRed` (rows with that leg after the last row where its `exit` ≠ 0),
   `lastRedTs` (null when never red), `neverRed`. Fleet-wide and per repo.
2. **gate08** — D6's pinned definitions, both clause booleans.
3. **escapes** — total, `killedMatch === null` count, `preventedBy` distribution verbatim,
   `byClass` (rows without `class` → `unclassed`), `recurrentUnguarded` per D9, per-repo totals.
4. **replayDebt** — per repo: replay-row count, review rows with `ts` after the latest replay
   row's `ts` (no replay rows → all review rows + `neverReplayed: true`).
5. **cleanContradicted** — per repo: CLEAN review-row count; escapes whose `reviewRunId`
   equals the `runId` of a CLEAN review row in the same repo → `contradicted`; escapes with
   `reviewRunId` null or matching nothing → `escapesUnjoined` (counted, never folded into
   either side).
6. **driftCensus** — the classifier above, per repo.

Doctrine deltas (exact scope — nothing else in either file changes):

- `spec/doctrine/core.md` § Incident Policy: "third recurrence of the same class" gains
  "counted across every readable repo ledger on this machine"; the existing "Derived numbers
  come from the fleet evidence reader" sentence gains the literal invocation
  `node "$(spec-paths fleet-reader)" --json`; the degraded-mode sentence ("a bar filled from
  one repo's ledger says so") is kept verbatim. Section heading unchanged (shared-for match).
- `spec/commands/escape.md`: row-template JSON line gains `"class":"<kebab-case id>"|null`
  before `"preventedBy"`; step 4 gains one classification bullet: class is a stable
  kebab-case defect-class id derived from the evidence (same naming style as
  replay-corpus.md classes), confirmed in the existing single classification call, `null`
  when underivable — unknown is null, never a guess (the file's own standing rule).

## Behavior

Human render order: population block first (D4), then queries 1–6 in numbered order, each
with a one-line takeaway heading. Repos with `rows: 0` render in the population block with
an explicit `no ledger` marker. `recurrentUnguarded` renders each qualifying class with its
count and latest ts; while all escape rows are `unclassed` the section renders
`unclassed: 26 — class labels start accruing from escape.md's class field` (self-explaining
emptiness, not silence). The reader never prints a claim of fleet completeness — the
population block is scoped to "this machine's checkouts" wording.

## Acceptance Criteria

- **AC-20260820-05-1**: WHEN the reader scans a repos-root containing `repo-a/` (has
  `.claude/spec.config.json`, `.git` directory), `.hidden/` (has config), `node_modules/`
  (has config), `wt-b/` (has config, `.git` is a FILE), and `plain/` (no config) THE SYSTEM
  SHALL include exactly `repo-a` in `population.repos` (`scanned: 1`) → discovery test in
  tests/fleet-reader/discovery.test.js
- **AC-20260820-05-2**: WHEN a scanned repo has `spec.config.json` but no ledger file, and a
  second repo splits rows across `spec-runs.jsonl` and `spec-runs-2025.jsonl` THE SYSTEM
  SHALL list the first with `rows: 0` and the second with the SUM of rows from both files,
  and the human render's first section SHALL be the population block (e.g. 2 rows + 3 rows →
  `rows: 5`) → population test in tests/fleet-reader/discovery.test.js
- **AC-20260820-05-3**: WHEN a repo's review rows carry leg `x` with exits `[1,0,0,0]` (ts
  ascending) and leg `y` with exits `[0,0]` THE SYSTEM SHALL report for `x`
  `runsSinceRed: 3`, `neverRed: false`, `lastRedTs` = the first row's ts, and for `y`
  `runsSinceRed: 2`, `neverRed: true`, `lastRedTs: null` → leg-recency test in
  tests/fleet-reader/queries.test.js
- **AC-20260820-05-4**: WHEN the fleet fixture holds a self-repair repo (has
  `.claude-plugin/marketplace.json`) with 3 in-window authored specs and hosts with 5
  distinct post-cutover CLEANed specs out of 4 in-window authored THE SYSTEM SHALL report
  `hostSpecsCleaned: 5`, `clause1Met: true`, `inWindowAuthored: 7`, `selfRepairAuthored: 3`,
  `selfRepairShare: 0.4286`, `clause2Met: false` (share ≥ 0.20), human render `43%` → gate
  test in tests/fleet-reader/queries.test.js
- **AC-20260820-05-5**: WHEN escape rows contain 3 rows with `class: "silent-fallback"`, 1
  with `class: null`, and 1 with no `class` key THE SYSTEM SHALL report
  `byClass: { "silent-fallback": 3, "unclassed": 2 }` and list `silent-fallback` (count 3,
  latest ts) in `recurrentUnguarded` → escape-aggregates test in
  tests/fleet-reader/queries.test.js
- **AC-20260820-05-6**: WHEN a repo has 5 review rows and one replay row whose ts falls
  after the 2nd review, and a second repo has reviews but no replay rows THE SYSTEM SHALL
  report `reviewsSinceLastReplay: 3, neverReplayed: false` for the first and
  `reviewsSinceLastReplay: <total reviews>, neverReplayed: true` for the second →
  replay-debt test in tests/fleet-reader/queries.test.js
- **AC-20260820-05-7**: WHEN an escape row's `reviewRunId` matches a CLEAN review row's
  `runId` in the same repo, and a second escape has `reviewRunId: null` THE SYSTEM SHALL
  count `contradicted: 1` and `escapesUnjoined: 1`, never folding the unjoined row into
  either count → contradiction-join test in tests/fleet-reader/queries.test.js
- **AC-20260820-05-8**: WHEN a ledger holds a review row with `tier: "T3"` and an escape row
  with `preventedBy: "test"` THE SYSTEM SHALL count both in `driftCensus` (reasons
  `pre-v7-tier: 1`, `preventedBy-out-of-enum: 1`) AND still render `test: 1` verbatim inside
  `escapes.preventedBy` — drift-flagged, never dropped from the distribution → census test
  in tests/fleet-reader/drift.test.js
- **AC-20260820-05-9**: WHEN a ledger file contains a line that is not valid JSON between
  two valid rows THE SYSTEM SHALL report `unparseable: 1` for that repo in both population
  and census, parse both neighbors normally, and exit 0 → unparseable test in
  tests/fleet-reader/drift.test.js
- **AC-20260820-05-10**: WHEN tests read `spec/scripts/fleet-reader.js` source THE SYSTEM
  SHALL contain zero occurrences of the token `observed` (`src.includes('observed')` →
  `false`) → opacity pin in tests/fleet-reader/drift.test.js
- **AC-20260820-05-11**: WHEN the reader runs against a synthetic fleet THE SYSTEM SHALL
  leave every file byte-identical (recursive content hash before === after) → read-only test
  in tests/fleet-reader/discovery.test.js
- **AC-20260820-05-12**: WHEN invoked with an unknown flag (`--bogus`) or a `--repos-root`
  that is not a directory THE SYSTEM SHALL exit 2 with the usage line on stderr; WHEN
  invoked against a valid empty repos-root THE SYSTEM SHALL exit 0 with `scanned: 0` →
  exit-code tests in tests/fleet-reader/discovery.test.js
- **AC-20260820-05-13**: WHEN invoked with `--json` THE SYSTEM SHALL print a single valid
  JSON document with exactly the top-level keys `population`, `legRecency`, `gate08`,
  `escapes`, `replayDebt`, `cleanContradicted`, `driftCensus`; without `--json`, the human
  render → format test in tests/fleet-reader/discovery.test.js
- **AC-20260820-05-14** `[oracle: gate]`: WHEN the suite runs after the manifest row,
  spec-paths key, and core.md citation land THE SYSTEM SHALL hold
  tests/consistency/entrypoints.test.js green with `spec/scripts/fleet-reader.js` present in
  the inventory and non-orphaned (the live-repo conformance pins are the honest oracle — no
  new test duplicates them)
- **AC-20260820-05-15**: WHEN tests read `spec/doctrine/core.md` § Incident Policy THE
  SYSTEM SHALL find "across every readable repo ledger" and the literal invocation
  `node "$(spec-paths fleet-reader)" --json` and the retained degraded-mode sentence ("one
  repo's ledger says so") → doctrine pin in tests/fleet-reader/doctrine-pins.test.js
- **AC-20260820-05-16**: WHEN tests read `spec/commands/escape.md` THE SYSTEM SHALL find
  `"class":` inside the row-template JSON line and a step-4 classification bullet naming
  null-when-underivable → doctrine pin in tests/fleet-reader/doctrine-pins.test.js
- **AC-20260820-05-17**: WHEN `spec-paths shared-for escape` runs THE SYSTEM SHALL CONTINUE
  TO serve the `## Incident Policy` section (existing assert in tests/spec-paths.test.js
  tagged with this AC-ID, not duplicated)

## Assumptions (escalation triggers)

Executed micro-spikes, all run 2026-08-20 against the live fleet (scratch shell, no files kept):

- A1: Fleet today = 11 repos with `.claude/spec.config.json` one level under `~/Projects`, 8
  with ledgers, **1,077 rows total** (executed scan; per-repo: autopilot-hub 42,
  claude-plugins 176, hearwell 77, hiwora 60, prax 277, salon-os 39, upwell 333, zubu-menu
  73). The brief's "~1,250" overcounts today's disk; the reader reports what it reads.
  **if false:** population render self-reports — no code path depends on these numbers.
- A2: Escape rows fleet-wide: 26 total; `killedMatch` null in 22; key sets are the 10-key
  template (2 rows add `note`); **no row has a `class` key**; `preventedBy` values observed:
  doctrine 5, enforcer 6, none 4, review-check 3, runtime-leg 7, **test 1** (out of enum,
  upwell 2026-07-24). **if false:** D8/D11 handling absorbs any shape — census reasons just
  shift.
- A3: Leg names are an open set — 17 distinct fleet-wide including release legs (deploy,
  e2e, journeys, ready, substrate, production, storybook). **if false (closed set found):**
  no change; open-set handling is strictly more general.
- A4: The dead-leg smell is visible in today's data: at-risk exits are 0-only in hearwell
  (5 runs) and prax (2 runs) while salon-os/upwell/claude-plugins show reds — query 1
  reproduces the brief's motivating catch. **if false:** the query is still correct; the
  worked example moves to another leg.
- A5: Gate inputs verified: distinct specs CLEANed with `ts >= "2026-08-17"` — salon-os 5,
  upwell 3, all other hosts 0 → clause 1 met (8 ≥ 5). In-window authored (plan|build row
  `ts >= cutover`): fleet 36 distinct specs, claude-plugins 15 → share 41.7%, clause 2 not
  met. The brief's "~65%" used an unpinned definition; D6's definitions are now the pinned
  ones. **if false:** the definitions stay pinned; only the rendered numbers move.
- A6: v7.0.0 shipped 2026-08-17 (git log: "v7 stage 3 … version 7.0.0", 2026-08-17) — the
  cutover literal. **if false:** STOP, ask the user for the cutover date.
- A7: Drift is real and priced: 972 rows carry pre-v7 tiers (T2 278, T3 694); 238 rows lack
  `runId` (all 26 escapes use `reviewRunId` by schema — not drift); `spec-runs*.jsonl`
  archives exist nowhere yet but spec-status.js already contracts the glob. **if false:**
  census renders whatever is found.
- A8: All 11 live repos have `.git` as a directory — the worktree-skip path has no live
  instance and is covered by fixture (AC-1). **if false:** the rule still holds; brief 03
  ratified it.
- A9: The entrypoints guard accepts a doctrine file as a manifest entry point
  (`spec/doctrine/design.md` already appears as one for dc-extract.js/components-check.js).
  **if false:** STOP — D1's caller wiring needs re-adjudication with the user.

## Rationale

The reader is deliberately boring: one file, no state, fixed queries, because the brief's
named failure mode is an aggregator growing into autopilot. Every judgment call collapsed
into pinned literals (cutover date, share definition, self-repair marker) because the gate's
value is that two sessions derive the same answer. The fleet-denominator and class-field
rulings came from JJ this session (2026-08-20) via explicit AskUserQuestion — they are not
reader defaults; the brief's open question 1 is thereby closed. Open question 2 (is the
six-query list right at all) resolves by usage: v1 ships the six, and retirement is cheap.
D9's "escape row = unguarded by construction" reading avoids inventing a guard registry no
mechanism maintains; if a guarded class keeps recurring, that is precisely a signal worth
rendering, not suppressing. The share-definition mismatch with the brief (~65% vs measured
41.7%) is expected: the brief eyeballed an unpinned window; the spec pins one and the
number is whatever it derives. `recurrentUnguarded` starts empty (all 26 historical escapes
are unclassed) — the render says so explicitly rather than implying a clean bill.
Fragile to watch during build: the census classifier's enum lists must match escape.md's
enums byte-for-byte (including the new `class` nullability), and the human render must not
drift into report-render.js's lane — the reader owns its render like spec-status.js does.

Collision-closure waives (sweep run at lock, stems "third recurrence" / "same class"):
the `likely` hit on tests/consistency/entrypoints.test.js is waived — that suite reads the
live manifest/key-set/citations dynamically, so D1's additive row+key+citation keeps it
green with no edit (AC-20260820-05-14 is its oracle). All literal hits are waived as
incidental: .claude/rules/conventions/doctrine.md:15, README.md:152,
docs/audit/v7-backlog-drop.md:6, and docs/roadmap/01-claims-registry.md:7 restate "third
recurrence" with NO denominator claim (they cite core § Incident Policy as authority and
stay true under fleet counting); .claude/rules/spec-pipeline.md:184,
tests/spec-paths.test.js:28, and the entrypoints/red-fixture test comments use the phrase
as incident narrative; the "same class" hits in spec-design-driver.js, verdict.test.js, and
docs/audit/advisory-findings.md are unrelated senses of the phrase. The one restatement
that DOES owe the new wording is docs/canonical/doctrine-governance.md — carried in
Canonical Delta below, applied by /spec:review on CLEAN per the standing loop.

## Canonical Delta

`docs/canonical/doctrine-governance.md`, Incident policy bullet — replace the clause
"only a third recurrence of a class earns a standing guard" with "only a third recurrence
of a class — counted across every readable repo ledger on this machine, numbers from
`node "$(spec-paths fleet-reader)" --json` — earns a standing guard"; rest of the bullet
unchanged.

No new canonical file for the fleet-evidence area (repo convention: canonical docs appear
when an area accretes a second spec). Brief 17 is fully delivered by this spec;
`docs/roadmap/03-fleet-provisioning.md`'s superseded-marker question stays open and is
recorded there, not here.
