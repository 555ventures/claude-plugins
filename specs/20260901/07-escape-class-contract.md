---
date: 2026-09-01
status: hardened
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260901/08-corpus-derivation-and-kill-match.md]
brief: 19
open_markers: 0
---

# Escape class contract — validated classes, append-only amendments, the joined count

## Goal

Every escape row carries either a validated defect class or an explicit reason it has none, and
the 24 historical rows across six repos become repairable without rewriting a byte: one
deterministic script owns escape-row validation and the ledger append, an append-only
`escape-class` amendment row fixes a historical row's class, and the fleet reader joins
amendments when it counts recurrences, lists the rows still needing a class, and flags
unvalidated rows as drift. `/spec:escape` classifies registry-first (existing fleet classes
before an invented id) and gains the one-time fleet-wide backfill mode. Done means the third-
recurrence rule in core § Incident Policy fires on the joined count, and the fleet reader's
`unclassedRows` is the one list the backfill run consumes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New module `spec/scripts/lib/escape-row.js` is the ONE escape-row validator: exports `PREVENTED_BY`, `FOUND_BY`, `SEVERITY` (today's fleet-reader sets, moved), `UNCLASSED_REASONS = ['no-fix-diff', 'deferred']`, `CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`, `escapeKey(row)` (= `escapeTs ?? ts`, `spec`, `file` joined by `\0`), `validateEscapeRow(row, {amended})`, `validateAmendmentRow(row)`, `joinAmendments(rows)`; every violation is a reason name from the closed set in Contracts; the three existing reason names keep their spelling (AC-20260901-07-1, AC-20260901-07-2) | The brief's "nothing validates a class": fleet-reader's inline enums become the shared derivation, so the CLI and the drift census cannot disagree; rejected: a second inline copy in the CLI |
| D2 | New CLI `spec/scripts/escape-row.js` (spec-paths key `escape-row`, entrypoints row citing `spec/commands/escape.md`) with three modes — `--check (--row <json>\|--file <path>)`, `--append --root <dir> --row <json> [--allow-duplicate]`, `--amend --root <dir> --escape-ts <ts> --spec <p> --file <f> (--class <id>\|--unclassed-reason <r>) [--via backfill\|manual]` — hand-rolled flags, zero deps, header per Worker Rules; exit 0 ok · 1 validation reasons printed one per line · 2 usage/unreadable · 3 refusal (duplicate spec+file without `--allow-duplicate`; `--amend` key matching no escape row in `<dir>`'s ledger) (AC-20260901-07-3, AC-20260901-07-4, AC-20260901-07-5, AC-20260901-07-6, AC-20260901-07-7) | Script-owned append, replay.js `--record`'s precedent: the row's shape is the recurrence count's substrate, and a session `printf` can append anything; rejected: validate-only with the session still appending (an invalid row could still land) |
| D3 | Amendment row shape (Contracts): `stage:"escape-class"`, keyed by `escapeTs`+`spec`+`file` (the original row's `ts` verbatim), `class` xor `unclassedReason`, `via` ∈ `backfill\|manual`; the ledger stays append-only — a wrong amendment is superseded by a later one, never edited (JJ ruling 2026-09-01) (AC-20260901-07-6, AC-20260901-07-8) | Originals stay byte-identical across six repos' histories; latest-wins join makes a wrong derivation fixable by one more row; rejected: in-place rewrite of 24 rows (first-ever ledger edit, in six repos) |
| D4 | `fleet-reader.js`: `STAGES`/`SPEC_STAGES` gain `escape-class`; `computeEscapes` counts on the **effective class** (latest amendment for the row's key, else the row's own `class`) for `byClass`, `classLatest`, `recurrentUnguarded`; gains `escapes.unclassedRows` (rows whose effective class is null AND effective `unclassedReason` is null — `{repo, ts, spec, file, reviewRunId, preventedBy}`, sorted repo then ts) and `escapes.amendments` (count of `escape-class` rows); the eight `--json` top-level keys are unchanged (AC-20260901-07-8, AC-20260901-07-9, AC-20260901-07-11) | The brief's "the fleet reader joins amendments when counting"; `unclassedRows` is the backfill's input list and the drift census's `class-missing` denominator, so the two can never disagree; rejected: a separate `--unclassed` listing mode in the CLI (would re-implement fleet discovery) |
| D5 | Drift census routes every `escape` and `escape-class` row through D1's validator; an escape row with no class, no reason, and no amendment lands in `class-missing`; an amendment whose key matches no escape row in the same repo lands in `amendment-unmatched`; the 24 historical rows therefore read as drift **until amended** — 20260820/05 D8's "existing rows stay in-shape" is superseded for the class field (AC-20260901-07-10, AC-20260901-07-12) | Drift is the pressure that makes the backfill happen; a census that keeps calling an unclassed row in-shape is the "nothing validates a class" defect restated; rejected: grandfathering rows older than the field |
| D6 | `escape.md`: step 4's class bullet becomes registry-first — run `node "$(spec-paths fleet-reader)" --json`, read `.escapes.byClass` keys (minus `unclassed`) plus the corpus's class headings, and pick an existing id whenever the defect shape matches, inventing a new kebab-case id only when none fits; gains the `unclassedReason` bullet (`no-fix-diff` when no diagnosis or fix exists to derive from; `deferred` when the user declines to class at the confirm call; null otherwise); step 5 appends via `node "$(spec-paths escape-row)" --append --root . --row '<json>'` (exit 3 → the step-2 distinct-defect confirm, then `--allow-duplicate`); new `## Backfill mode` section (Behavior); AC-20260820-05-16's three pinned phrases survive verbatim; escape's read-load stays ≤ 500 lines (AC-20260901-07-13) [no-ac for the prose itself: doctrine choreography — the reviewer verifies the file against this row and Behavior] | JJ ruling 2026-09-01: open ids with existing classes shown first — the cheapest-to-reverse answer to count-splitting; rejected: a fixed enum (forces new shapes into wrong buckets) and an alias table (a second stored taxonomy) |
| D7 | `doctor.md` check 12: the stage enum gains `escape-class`; the Escapes bullets gain one line — when the fleet reader's `escapes.unclassedRows` is non-empty, report `/spec:escape --backfill` as due, naming the count [no-ac: doctrine prose; reviewer verifies against this row] | Without it doctor reports every amendment row as a broken line; the due-line is the second carrier (with D4's render) that keeps the backfill obligation visible — the 20260821/03 D8 lesson (an obligation living only in a `[no-ac]` row slipped) |
| D8 | `core.md` § Incident Policy, Materiality bullet: the recurrence count is the **joined** count — escape rows plus their `escape-class` amendments, as `fleet-reader --json`'s `escapes.byClass` derives it; the three phrases AC-20260820-05-15 pins stay verbatim (AC-20260901-07-14) | Brief scope 5; the bar must cite the number the reader actually computes, or two sessions derive two counts |
| D9 | Bump spec plugin to the next free version (target 7.52.0), last-3-versions description [no-ac: changelog surface — enforced by review's version-bump hard check] | Version-bump discipline; the literal is a target, not a pin (host Gotchas) |
| D10 | `spec-paths` gains key `escape-row`; `tests/spec-paths.test.js`'s exhaustive key list is updated in place (never weakened); `spec/entrypoints.json` gains the script's row — `lib/` files get no row (unrepresentable, host Gotchas) (AC-20260901-07-15) | New-surface checklist (pipeline rules § Planning); the exhaustive-pin collision is the known build-time class, one waive line at most |
| D11 | The backfill itself is a one-time run, not a build: `/spec:escape --backfill` from this repo, one confirmation table over every `unclassedRows` entry, amendments appended into each repo's own ledger (repos left with one uncommitted ledger line each, named in the report) — recorded as a session-queue item at lock, gated on sibling 08 landing (the derived-corpus fold happens in the same run) [no-ac: operator process — carried by D4's render line, D7's doctor line, and the queue item, never by memory] | JJ ruling 2026-09-01: one fleet-wide run beats six per-repo sessions; the three carriers exist because a `[no-ac: operator process]` row alone has already been measured to slip (20260821/03 D8) |
| D12 | Human render of query 3 gains `  unclassed rows needing a class: N — run /spec:escape --backfill` (only when N > 0) and `  amendments: N`; the existing `recurrentUnguarded` branch wording is untouched (AC-20260901-07-16) | The reader's render is where JJ reads the fleet numbers (brief Grounding); the line is the first carrier of D11 |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/escape-row.js | CREATE | scripts | D1 validator module: enums, `CLASS_ID_RE`, `escapeKey`, `validateEscapeRow`, `validateAmendmentRow`, `joinAmendments`; header per Worker Rules |
| spec/scripts/escape-row.js | CREATE | scripts | D2 CLI: `--check`, `--append`, `--amend`; reads ledgers via `lib/observation.js` `readLedgerRows`; exit codes 0/1/2/3 documented in the header |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D4/D5/D12: `escape-class` stage, effective-class join, `unclassedRows`, `amendments`, validator-backed drift reasons, two render lines; enums imported from `lib/escape-row.js` |
| spec/bin/spec-paths | MODIFY | scripts | D10: key `escape-row`; usage line |
| spec/entrypoints.json | MODIFY | other | D10: row for `spec/scripts/escape-row.js` → `spec/commands/escape.md` |
| spec/commands/escape.md | MODIFY | doctrine | D6: registry-first class bullet, `unclassedReason` bullet, row template with the new field, script-owned step 5, `## Backfill mode` section |
| spec/commands/doctor.md | MODIFY | doctrine | D7: stage enum + the backfill-due line in check 12 |
| spec/commands/plan.md | MODIFY | doctrine | D6 collision fix: the lock step's ledger append drops its "escape.md's mechanism —" attribution (escape.md no longer appends with `printf`); the `printf` instruction itself stays |
| spec/doctrine/core.md | MODIFY | doctrine | D8: Materiality bullet names the joined count |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version bump + description |
| tests/escape/escape-row.test.js | CREATE | tests | AC-20260901-07-1, AC-20260901-07-2, AC-20260901-07-3, AC-20260901-07-4, AC-20260901-07-5, AC-20260901-07-6, AC-20260901-07-7 |
| tests/fleet-reader/escape-class.test.js | CREATE | tests | AC-20260901-07-8, AC-20260901-07-9, AC-20260901-07-10, AC-20260901-07-16 |
| tests/fleet-reader/queries.test.js | MODIFY | tests | AC-20260901-07-11 — tag the existing AC-20260820-05-5 test (no assertion change) |
| tests/fleet-reader/discovery.test.js | MODIFY | tests | AC-20260901-07-12 — tag the existing eight-keys test (no assertion change) |
| tests/fleet-reader/doctrine-pins.test.js | MODIFY | tests | AC-20260901-07-14 — tag the existing AC-20260820-05-15 test and add one assert for the joined-count wording |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260901-07-15 — key list gains `escape-row` in place |

Orchestrator duty (outside the table): after the version bump, run the full suite once
(`node --test 'tests/**/*.test.js'` per the host's gateCommand) — the exhaustive key-set pin and
the entrypoints count pin are the two known collision surfaces (host Gotchas).

## Contracts

```js
// spec/scripts/lib/escape-row.js
const PREVENTED_BY = ['doctrine', 'enforcer', 'review-check', 'runtime-leg', 'none']
const FOUND_BY = ['user', 'later-spec', 'production']
const SEVERITY = ['hard', 'soft']
const UNCLASSED_REASONS = ['no-fix-diff', 'deferred']
const CLASS_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VIA = ['backfill', 'manual']

// Closed reason set. The first three keep fleet-reader's existing spelling.
//   preventedBy-out-of-enum · foundBy-out-of-enum · severity-out-of-enum
//   class-malformed              class present but not (null | string matching CLASS_ID_RE)
//   class-missing                effective class null AND effective unclassedReason null
//                                (escape rows: suppressed when {amended: true})
//   unclassed-reason-out-of-enum unclassedReason present, not null, not in UNCLASSED_REASONS
//   unclassed-reason-with-class  class is a string AND unclassedReason is not null
//   amendment-missing-escape-ts  escape-class row without a string escapeTs
//   amendment-unmatched          (fleet-reader only) no escape row in the same repo has this key
//   amendment-via-out-of-enum    escape-class row whose via is not in VIA

function escapeKey(row)   // `${row.escapeTs ?? row.ts}\0${row.spec}\0${row.file}`
function validateEscapeRow(row, { amended = false } = {})   // -> string[] (empty = valid)
function validateAmendmentRow(row)                           // -> string[]
function joinAmendments(rows)
// -> Map<key, {class, unclassedReason, ts}>: for every stage:"escape-class" row, latest `ts`
//    wins; equal ts -> later read order wins. Never consults escape rows (unmatched detection
//    is the caller's join).
module.exports = { PREVENTED_BY, FOUND_BY, SEVERITY, UNCLASSED_REASONS, CLASS_ID_RE, VIA,
  escapeKey, validateEscapeRow, validateAmendmentRow, joinAmendments }
```

Escape row (escape.md step 5 template — `unclassedReason` is the one new field, placed
directly after `class`; `class` stays before `preventedBy`):

```
{"ts":"<ISO-8601>","stage":"escape","spec":"<repo-relative spec path>","file":"<repo-relative defect file>","reviewRunId":"<rv_…>"|null,"foundBy":"<user|later-spec|production>","severity":"<hard|soft>","killedMatch":true|false|null,"class":"<kebab-case defect-class id>"|null,"unclassedReason":"no-fix-diff"|"deferred"|null,"preventedBy":"<doctrine|enforcer|review-check|runtime-leg|none>","via":"commit|manual"}
```

Amendment row (`escape-row.js --amend` is its only writer):

```
{"ts":"<ISO-8601 of the amendment>","stage":"escape-class","spec":"<spec path of the original row>","file":"<file of the original row>","escapeTs":"<original row's ts, verbatim>","class":"<kebab-case id>"|null,"unclassedReason":"no-fix-diff"|"deferred"|null,"via":"backfill"|"manual"}
```

`escape-row.js` modes and exits:

```
escape-row.js --check (--row '<json>' | --file <path>)
escape-row.js --append --root <dir> --row '<json>' [--allow-duplicate]
escape-row.js --amend  --root <dir> --escape-ts <ts> --spec <path> --file <path>
                       (--class <id> | --unclassed-reason no-fix-diff|deferred) [--via backfill|manual]
Exit codes: 0 = ok (--check: no reasons; --append/--amend: one line appended, stdout
                `appended spec=… file=…` / `amended escapeTs=… spec=… file=… class=…|null`)
            1 = validation reasons found, printed one per line on stdout, nothing appended
            2 = usage error, unreadable/unparseable --row/--file, --root not a directory,
                --amend with both or neither of --class/--unclassed-reason
            3 = refusal: --append finds an escape row with the same spec+file in <dir>'s ledger
                (live + archives) and --allow-duplicate is absent; --amend finds no escape row
                with key (escapeTs, spec, file) in <dir>'s ledger — nothing appended, stderr names
                the remedy (--allow-duplicate / the exact key that was searched)
```

`fleet-reader.js --json` additions (top-level keys unchanged):

```
escapes: {
  total, killedMatchNull, preventedBy, byClass, recurrentUnguarded, byRepo,   // as today, on the effective class
  amendments: <count of stage:"escape-class" rows fleet-wide>,
  unclassedRows: [{ repo, ts, spec, file, reviewRunId, preventedBy }]          // sorted repo asc, ts asc
}
driftCensus.byRepo[].drift gains buckets: class-missing, class-malformed, unclassed-reason-out-of-enum,
  unclassed-reason-with-class, amendment-missing-escape-ts, amendment-unmatched, amendment-via-out-of-enum
```

## Behavior

**Effective class.** For each repo, `joinAmendments(rawRows)` gives the latest amendment per
key. An escape row's effective class = amendment.class when an amendment exists, else its own
`class`; effective reason likewise. `byClass` keys on the effective class (`unclassed` when
null). An amendment with `class: null` and a reason moves the row from `unclassedRows` to
`unclassed` in `byClass` — it is classed as "known unclassable", which is still not a defect
class and never feeds `recurrentUnguarded`.

**Backfill mode (`/spec:escape --backfill [--repos-root <dir>]`)** — the `## Backfill mode`
section escape.md gains, written for the planning-seat session in this repo:

1. Run `node "$(spec-paths fleet-reader)" --json [--repos-root <dir>]`; the work list is
   `escapes.unclassedRows` verbatim. Empty → report `nothing to backfill` and stop.
2. Registry = `escapes.byClass` keys minus `unclassed`, plus the class headings of
   `spec-paths replay-corpus` (sibling 08 makes the corpus half script-derived; until then the
   session reads the headings).
3. Per row, dispatch one Sonnet agent with **paths only**: repo dir, spec path, defect file,
   `escapeTs`, the retained artifact path `<repo>/.claude/spec-runs/<reviewRunId>.json` when it
   exists, the shas of `git -C <repo> log --format=%H --since=<escapeTs date> -- <file>`, and the
   repo's pipeline-rules path (its Gotchas may cite the row). The agent returns
   `{class: <registry id or new kebab id> | null, unclassedReason: 'no-fix-diff' | null,
   evidence: <one line naming the commit/Gotchas line it derived from>}` — an existing registry
   id whenever the shape matches, a new id only when none fits, `no-fix-diff` when neither a
   fix commit nor a citing Gotchas line exists.
4. Print ONE table — repo · spec · file · derived class (or reason) · evidence — then ONE
   `AskUserQuestion`: apply all as shown (Recommended) / correct rows first (free text naming
   `row N → <id>`). Dismissed → STOP, nothing appended.
5. Per confirmed row: `node "$(spec-paths escape-row)" --amend --root <repo dir> --escape-ts
   <ts> --spec <spec> --file <file> (--class <id> | --unclassed-reason <r>) --via backfill`.
6. Report: rows amended per repo; the repos now carrying an uncommitted ledger line; then
   re-run the fleet reader and print query 3's render verbatim (recurrentUnguarded now on the
   joined count).

**`--append` duplicate rule.** Same `spec` AND same `file` on any existing `stage:"escape"`
row in the root's ledger → exit 3. escape.md's step 2 keeps its user-facing grep so the user is
never interviewed for a duplicate; the script's refusal is the backstop, and
`--allow-duplicate` is the sanctioned override after the step-2 confirm.

**Drift census join.** `classifyRow` receives the repo's amendment map: an escape row whose key
is in the map is validated with `{amended: true}` (its own missing class is not
`class-missing`); the amendment row itself is validated by `validateAmendmentRow` plus the
unmatched check against the repo's escape keys.

## Acceptance Criteria

- **AC-20260901-07-1**: WHEN `escape-row.js --check --row '<json>'` receives an escape row THE
  SYSTEM SHALL exit 0 printing nothing for a valid row, and exit 1 printing exactly the violated
  reason names one per line otherwise — literal pairs: `{"class":"Silent_Fallback", …}` →
  `class-malformed`; `{"class":null}` with no `unclassedReason` → `class-missing`;
  `{"class":null,"unclassedReason":"no-fix-diff"}` → exit 0; `{"class":"a-b","unclassedReason":"deferred"}`
  → `unclassed-reason-with-class`; `{"unclassedReason":"because"}` →
  `unclassed-reason-out-of-enum`; `{"preventedBy":"test"}` → `preventedBy-out-of-enum` (the
  existing spelling) → `tests/escape/escape-row.test.js`
- **AC-20260901-07-2**: WHEN `--check` receives a `stage:"escape-class"` row THE SYSTEM SHALL
  apply the amendment rules — a row without `escapeTs` → `amendment-missing-escape-ts`; `via:"cron"`
  → `amendment-via-out-of-enum`; `class:null` with no reason → `class-missing`; a valid
  amendment → exit 0 → `tests/escape/escape-row.test.js`
- **AC-20260901-07-3**: WHEN `--append --root R --row '<valid escape json>'` runs against a root
  with no `.claude/spec-runs.jsonl` THE SYSTEM SHALL create the file and append exactly one line
  equal to `JSON.stringify(JSON.parse(row))` followed by `\n`, print `appended spec=<spec>
  file=<file>`, and exit 0; an invalid row → exit 1 with reasons and the file untouched
  → `tests/escape/escape-row.test.js`
- **AC-20260901-07-4**: WHEN `--append` finds an existing `stage:"escape"` row with the same
  `spec` and `file` in R's live ledger or a `spec-runs-2026.jsonl` archive THE SYSTEM SHALL exit
  3 naming `--allow-duplicate` on stderr with nothing appended; the same call with
  `--allow-duplicate` appends and exits 0 → `tests/escape/escape-row.test.js`
- **AC-20260901-07-5**: WHEN `--amend --root R --escape-ts T --spec S --file F --class silent-fallback`
  runs and R's ledger holds an escape row with `ts:T, spec:S, file:F` THE SYSTEM SHALL append
  one `stage:"escape-class"` row carrying `escapeTs:T, spec:S, file:F, class:"silent-fallback",
  unclassedReason:null, via:"manual"` (default) and an ISO `ts`, print `amended escapeTs=T
  spec=S file=F class=silent-fallback`, exit 0 → `tests/escape/escape-row.test.js`
- **AC-20260901-07-6**: WHEN `--amend`'s key matches no escape row in R (wrong `escapeTs`,
  or the row lives in a different root) THE SYSTEM SHALL exit 3, append nothing, and print the
  searched key on stderr; `--unclassed-reason no-fix-diff` with `--via backfill` appends
  `class:null, unclassedReason:"no-fix-diff", via:"backfill"` → `tests/escape/escape-row.test.js`
- **AC-20260901-07-7**: WHEN `--amend` receives both `--class` and `--unclassed-reason`, or
  neither, or `--root` names a non-directory THE SYSTEM SHALL exit 2 with the usage line on
  stderr; `--class Bad_Id` → exit 1 printing `class-malformed` → `tests/escape/escape-row.test.js`
- **AC-20260901-07-8**: WHEN a repo's ledger holds an escape row with `class:null` and a later
  `escape-class` row with the same key and `class:"silent-fallback"` THE SYSTEM SHALL count it
  under `byClass["silent-fallback"]` (not `unclassed`); WHEN two amendments share the key with
  `ts` `2026-09-02T00:00:00Z` → `a-b` and `2026-09-03T00:00:00Z` → `c-d` THE SYSTEM SHALL count
  `c-d` only; WHEN one native `x-y` row plus two amended-to-`x-y` rows exist THE SYSTEM SHALL
  list `x-y` in `recurrentUnguarded` with `count: 3` → `tests/fleet-reader/escape-class.test.js`
- **AC-20260901-07-9**: WHEN the fleet holds (a) an escape row with `class:null` and no reason
  and no amendment, (b) one with `class:null, unclassedReason:"no-fix-diff"`, (c) one amended
  with `unclassedReason:"deferred"`, and (d) one with `class:"a-b"` THE SYSTEM SHALL return
  `escapes.unclassedRows` containing exactly (a) as `{repo, ts, spec, file, reviewRunId,
  preventedBy}`, and `escapes.amendments` equal to the number of `escape-class` rows (1) →
  `tests/fleet-reader/escape-class.test.js`
- **AC-20260901-07-10**: WHEN the drift census classifies (a) above THE SYSTEM SHALL count
  `class-missing: 1`; the same row with an amendment present → no `class-missing`; an
  `escape-class` row whose key matches no escape row → `amendment-unmatched: 1` and never
  `stage-unknown`; a `preventedBy:"test"` row still counts `preventedBy-out-of-enum: 1` →
  `tests/fleet-reader/escape-class.test.js`
- **AC-20260901-07-11**: WHEN no `escape-class` rows exist THE SYSTEM SHALL CONTINUE TO fold
  null/missing `class` into `unclassed` and feed `recurrentUnguarded` at 3+ → the existing
  AC-20260820-05-5 test in `tests/fleet-reader/queries.test.js`, tagged
- **AC-20260901-07-12**: WHEN `--json` runs THE SYSTEM SHALL CONTINUE TO print exactly the
  eight contracted top-level keys → the existing eight-keys test in
  `tests/fleet-reader/discovery.test.js`, tagged
- **AC-20260901-07-13** `[oracle: gate]`: WHEN escape.md gains the Backfill section THE SYSTEM
  SHALL keep `/spec:escape`'s read-load (own lines + `shared-for escape` lines) ≤ 500 — the
  read-load budget test in the gate is the oracle
- **AC-20260901-07-14**: WHEN core.md's Incident Policy is edited THE SYSTEM SHALL CONTINUE TO
  carry `across every readable repo ledger`, the literal `node "$(spec-paths fleet-reader)" --json`
  invocation, and `one repo's ledger says so`, AND the Materiality bullet SHALL name the joined
  count via the literal `escape-class` → the existing AC-20260820-05-15 test in
  `tests/fleet-reader/doctrine-pins.test.js`, tagged and extended by one assert
- **AC-20260901-07-15**: WHEN `spec-paths escape-row` runs THE SYSTEM SHALL print a path to an
  existing executable file, and the exhaustive key-list pin includes `escape-row` →
  `tests/spec-paths.test.js` (in place)
- **AC-20260901-07-16**: WHEN the human render runs over a fleet with 2 `unclassedRows` and 1
  amendment THE SYSTEM SHALL print `  unclassed rows needing a class: 2 — run /spec:escape --backfill`
  and `  amendments: 1` inside query 3; with 0 unclassed rows the first line is absent →
  `tests/fleet-reader/escape-class.test.js`

## Assumptions (escalation triggers)

- A1: `ts`+`spec`+`file` is unique across every fleet escape row — **executed 2026-09-01**:
  `jq` over all 37 rows in 11 config-bearing checkouts, `sort | uniq -d | wc -l` → `0`.
  **if false:** `--amend` refuses an ambiguous key with exit 3 naming both rows.
- A2: `spec-status.js` tolerates an `escape-class` row — **executed 2026-09-01** against a copy
  of this repo's ledger plus one amendment row: `--json` → `anomalies: 0`, exit 0. **if false:**
  add the stage to its known set in this spec's File Plan (one row).
- A3: fleet-reader today classifies an `escape-class` row as drift — **executed 2026-09-01**,
  same fixture: `driftCensus.byRepo[0].drift` → `{"pre-v7-tier":133,"stage-unknown":1}` and the
  amended row still counted `unclassed`. This is AC-10's red. **if false:** nothing changes.
- A4: Fix-diff locatability for the backfill — **executed 2026-09-01**: of the 24 unclassed
  fleet rows, 8 have zero commits touching the defect file since the escape date and 1 file no
  longer exists (`autopilot/bin/autopilotd`, deleted by 20260820/01); the remaining 15 have 1–10
  commits, most of them unrelated build commits. Expect roughly a third of the backfill to land
  as `no-fix-diff`. **if false (more than half come back no-fix-diff):** the derivation prompt
  widens to the row's citing Gotchas line and the spec's deviations record before the reason is
  written — never a guessed class.
- A5: Read-load headroom — **executed 2026-09-01** through the real binary: escape own 191 +
  shared 146 = 337 of 500 (163 lines free); doctor 382. **if false:** trim the Backfill section
  to the six numbered steps; the derivation prompt never becomes a template file.
- A6: `lib/observation.js` `readLedgerRows(root)` merges live + year archives in read order
  (code-read). **if false:** `--append`'s duplicate check and `--amend`'s key check read the
  same glob fleet-reader uses (`spec-runs*.jsonl`).
- A7: AC-20260820-05-16 pins escape.md's template line (`"class":` before `"preventedBy"`) and
  the step-4 phrases `kebab-case` / `null when underivable` (code-read). **if false:** update
  the pin in place and retag, never weaken.
- A8: The cross-worktree write hook matches only `Write|Edit|NotebookEdit` (code-read,
  hooks.json), so the backfill's Bash-run `--amend` into sibling repos is not blocked.
  **if false:** the run reports the blocked repo and the remedy (run `--amend` from inside it).
- A9: The `readLedgerRows` archive pattern the CLI's duplicate check relies on covers
  `spec-runs-<year>.jsonl` — AC-4 exercises an archive. **if false:** STOP, ask the user.

## Rationale

The brief's diagnosis is that the two ground-truth signals never meet because classes are
neither validated nor complete. This spec is the contract half: it makes a class a validated
field, gives historical rows an append-only repair path, and moves recurrence counting onto the
joined count. Sibling 08 is the corpus half (derivation from the joined count, `replay.js`
validation, the kill-match input).

**Why a script owns the append (D2).** escape.md appends with `printf` today, which is exactly
how a `preventedBy:"test"` and a `foundBy:"build"` row reached prax's ledger. replay.js already
owns its own row for the same reason; the CLI mirrors that precedent and folds the duplicate
check into a refusal so the session cannot skip it.

**Why amendments, not edits (D3).** JJ confirmed append-only 2026-09-01. The ledger is read by
`spec-status.js`, the fleet reader, and `/spec:doctor` in every repo; an in-place rewrite in six
repos' histories would be the first, and a wrong one would need a second. Latest-wins join
means a bad derivation costs one more row.

**Why historical rows become drift (D5).** The alternative — grandfather rows older than the
field — is the "unclassed is a computed bucket that absorbs everything" defect the brief names.
Drift is the pressure; `unclassedRows` is the list; the render and doctor lines are the two
carriers. The 20260821/03 D8 obligation slipped precisely because its only carrier was a
`[no-ac: operator process]` row, so D11 names three carriers and a queue item.

**Class taxonomy (D6).** JJ ruled open ids with existing classes shown first. A fixed enum
forces genuinely new shapes into wrong buckets; an alias table is a second stored taxonomy. The
registry is derived on every classification (fleet `byClass` keys ∪ corpus headings) and never
stored — the brief's own rule.

**Fleet numbers at plan time** (executed 2026-09-01, superseding the brief's 35/11/24): escapes
37, unclassed 24, 11 distinct classes, one at the third-recurrence bar. Fleet replay rows 28,
of which 6 `missed` (prax 2, salon-os 3, upwell 1) — replay is saturated in **this repo** (9/9
caught), not fleet-wide; the brief's "reviewer changes become measurable" is about
discriminating per class, not about the fleet catch-rate being 100%.

**Fragile.** The exhaustive spec-paths key pin and the entrypoints count pin will both redden
at build (known class, one waive line each at most, never a lock-time guard — host Gotchas).
escape.md's read-load has 163 lines of headroom; the Backfill section is written as six steps.

**Collision closure (lock, 2026-09-01, `--literal printf`).** D6 retires escape.md's `printf`
append. Literals leg: 15 hits. `spec/commands/escape.md` is in the File Plan (the retirement);
`spec/commands/plan.md` attributes its own lock-step append to "escape.md's mechanism" and is
added to the File Plan as a one-phrase fix. The other 13 hits (`scripts/spec-patterns.sh`,
`setup/export.sh`, `setup/import.sh`, `block-cross-worktree-writes.sh`, `genesis-state-gate.sh`,
`init-gen.js`, `manifest-check.sh`, `merge-back.sh`, `release-legs.js`, `spec-session-stamp.sh`,
`spec-state-gate.sh`, `tests/question-style-gate.test.js`, `docs/roadmap/19-*.md`) use the
generic token for their own output and never name escape's append — **waived**. `likely` hits
(4) owe nothing (host Gotchas, measured 2026-08-24).

## Canonical Delta

Append to `docs/canonical/review.md` after the paragraph on `/spec:escape` deriving
`killedMatch`:

- Every escape row carries a validated defect class or an explicit `unclassedReason`
  (`no-fix-diff` | `deferred`); `spec/scripts/lib/escape-row.js` is the one validator and
  `escape-row.js` the one writer (`--append`, duplicate-refusing; `--amend`). A historical row's
  class is repaired by an append-only `stage:"escape-class"` amendment keyed by the original's
  `ts`+`spec`+`file`; latest amendment wins. The fleet reader counts recurrences on the joined
  (row + amendment) class, lists rows still needing a class as `escapes.unclassedRows`, and
  flags unvalidated rows in the drift census (`class-missing`, `amendment-unmatched`). The
  third-recurrence bar's Materiality field cites the joined count.
  (specs/20260901/07-escape-class-contract.md)
