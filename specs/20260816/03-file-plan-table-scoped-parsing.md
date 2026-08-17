---
date: 2026-08-16
status: implementing
diff_base: f85d07a  # corrected at build close: a concurrent session committed JJ-20260817-01 between Phase 0's capture (c467bc3) and this build's commit; f85d07a is the true pre-image of this spec's diff
open_markers: 0
risk: T3                 # contract surface consumed by 4 gate scripts, two of them T3-listed sole derivations (spec-status.js, scope-reconcile.js)
area: scripts
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a               # escape-driven defect fix (host-reported, Salon OS 2026-08-17); no roadmap brief warranted
---

# File Plan parser: table-scoped header binding

## Goal

`parseFilePlanRows` in `spec/scripts/lib/file-plan.js` resolves Action/Layer column indices
section-wide after its walk, so the last header row in the `## File Plan` section wins for
every accumulated row. A second table under a `###` subheading whose header starts with
`Path` (observed in the wild: a "Landed at design stage" status table, 555ventures/salon-os
spec 20260816/02) clobbers the mapping — every row returns `layer: null`, `ac-matrix.js`
finds zero tests-layer rows, and review hard-blocks on false uncovered-ac findings with no
host-side workaround. Done means: header indices are bound per-table by one shared
table-aware walker used by both `parseFilePlan` and `parseFilePlanRows`, return shapes
unchanged, and the two-table repro parses correctly end-to-end through `ac-matrix.js`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | One internal table-aware section walker shared by `parseFilePlan` and `parseFilePlanRows`; it is NOT exported (module exports stay exactly `{ parseFilePlan, splitPlanCell, parseFilePlanRows }`) | The file already carries two hand-duplicated section walks that drifted; patching only `parseFilePlanRows` (the Salon OS report's minimal fix) leaves the duplication that produced this incident |
| D2 | Table scoping rule: a table is a maximal contiguous run of `\|`-prefixed lines inside the section; `actionIdx`/`layerIdx` reset to unbound (-1) at every table boundary; ONLY a table's first non-separator row can be its header (recognized when its first cell matches `/^(file\|path)s?$/i` — then bind indices from it); every later row in the same table is a data row even when its first cell matches the regex; rows are emitted with the indices in force at their own line | Boundary reset stops a header-less second table inheriting the first table's indices and misreading unrelated columns; first-row-only header recognition stops a data row whose path cell is literally `file`/`path` from rebinding mid-table and nulling trailing rows (refuter-executed defect in the draft's rebind-anywhere rule) |
| D3 | Per-table semantics, not first-table-only: rows from every table in the section stay in `parseFilePlanRows` output (a table without a Layer column yields `layer: null` for its own rows only), and `parseFilePlan` continues to collect path cells from all tables in the section | First-table-only would drop legitimately split File Plans (e.g. one table per layer); non-plan rows carrying `layer: null` are inert to every current consumer (`ac-matrix` filters `layer === 'tests'`; `scope-reconcile` line 166 same; `collision-closure` reads paths). Whether a status table's paths *belong* in `parseFilePlan`'s plan set is a deliberate non-change — see Rationale |
| D4 | Doc comment updated in place: the existing "a table with no Layer column yields `layer: null`" sentence gains the per-table clarification and the dated incident (Salon OS 2026-08-17, escaped from specs/20260814/01's review) | The comment already promised per-table behavior the implementation didn't deliver; the header-comment convention requires the dated incident |
| D5 | Version bump: `spec/.claude-plugin/plugin.json` to the next free patch/minor at landing time (target 6.86.0 — a target, not a pin, per the concurrent-session gotcha), description delta noting the per-table File Plan parser fix | Behavior change → bump discipline; description is the de facto changelog |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/file-plan.js | MODIFY | scripts | D1–D4: shared table-aware walker, per-table index binding, doc comment incident note |
| tests/file-plan/multi-table.test.js | CREATE | tests | AC-20260816-03-1, AC-20260816-03-2, AC-20260816-03-3, AC-20260816-03-4, AC-20260816-03-5, AC-20260816-03-6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D5: version bump + description delta |

## Contracts

Public surface of `spec/scripts/lib/file-plan.js` — unchanged, pinned:

```js
module.exports = { parseFilePlan, splitPlanCell, parseFilePlanRows }
// parseFilePlan(text: string) -> string[]          // de-duped path cells, all tables in section
// splitPlanCell(cell: string) -> string[]          // unchanged, not touched by this spec
// parseFilePlanRows(text: string) -> Array<{
//   paths: string[],                               // splitPlanCell of column 1, path-shaped only
//   action: string | null,                         // from the row's OWN table's header, else null
//   layer: string | null,                          // from the row's OWN table's header, else null
// }>
```

The internal walker is a module-private helper; its shape is the worker's choice and is not
part of the contract.

## Behavior

Section walk (both exports, via the D1 shared walker):

1. Find `## File Plan` (or `###`, per the existing `/^(#{2,3}) File Plan/i` match); section
   ends at the next heading of level ≤ the File Plan heading's level — so under a `##` File
   Plan heading, `###` subheadings do NOT end the section and their tables are in scope,
   handled per-table. When the File Plan heading is itself `###`, a following `###`
   subheading DOES end the section and its tables are excluded — existing section-boundary
   behavior, deliberately unchanged by this spec either way.
2. Within the section, `|`-prefixed lines form tables; any non-`|` line (blank, prose,
   `###` subheading) is a table boundary.
3. Per table: separator rows (`---` cells) skipped; ONLY the table's first non-separator row
   is eligible to be its header — recognized when its first cell matches
   `/^(file|path)s?$/i`, binding `actionIdx`/`layerIdx` from it (case-insensitive
   `Action`/`Layer` cell match, any column order). Every subsequent row of the table is a
   data row emitted with the bound indices, even when its first cell matches the header
   regex. At each table boundary both indices reset to -1; a table whose first row is not a
   recognized header has no bound indices (all its rows emit `action: null, layer: null`).
4. `parseFilePlanRows` keeps the existing per-row path filter (`includes('/')` or extension
   regex) and drops rows with no surviving paths. `parseFilePlan` keeps its existing
   column-1-only, de-duped path set.

Zero rows parsed stays the sanctioned no-op (existing contract, unchanged).

## Acceptance Criteria

- **AC-20260816-03-1**: WHEN `parseFilePlanRows` parses a `## File Plan` section holding a
  `| File | Action | Layer | Summary |` table followed by a `### Landed at design stage`
  subheading and a `| Path | State | Summary |` table, THE SYSTEM SHALL bind each row's
  `action`/`layer` from that row's own table header (literal: first-table row
  `| tests/a.test.js | CREATE | tests | pin |` → `{ paths: ['tests/a.test.js'], action:
  'CREATE', layer: 'tests' }`; second-table row `| src/x.js | landed | note |` →
  `{ paths: ['src/x.js'], action: null, layer: null }`) → tests/file-plan/multi-table.test.js
- **AC-20260816-03-2**: WHEN `ac-matrix.js` runs (spawned via `runNode`, the real script)
  against a synthetic-host spec fixture whose File Plan contains that same two-table shape,
  whose tests row names a test file that exists on disk and contains the spec's AC-ID, THE
  SYSTEM SHALL exit 0 with zero `uncovered-ac` findings (literal: fixture AC line
  `- **AC-20260101-01-1**: WHEN x THE SYSTEM SHALL y → tests/t.test.js`, tests row
  `| tests/t.test.js | CREATE | tests | AC-20260101-01-1 |`, file `tests/t.test.js`
  containing `AC-20260101-01-1` → exit 0, no `uncovered-ac` in output) —
  the terminal observable of the defect's real chain, reached through the shipped script,
  fixture parsed by the production `parseFilePlanRows` route →
  tests/file-plan/multi-table.test.js
- **AC-20260816-03-3**: WHEN a second table in the section has no recognized header row
  (literal: first table as in AC-1, then a blank line, then `| Module | Owner |` /
  `| lib/z.js | core |`), THE SYSTEM SHALL return the second table's data rows with
  `action: null, layer: null` rather than indices inherited from the previous table, while
  first-table rows keep their own bindings → tests/file-plan/multi-table.test.js
- **AC-20260816-03-4**: WHEN `parseFilePlanRows` parses a single-table File Plan, THE SYSTEM
  SHALL CONTINUE TO resolve reordered columns from the header (literal:
  `| File | Layer | Action |` row `| src/a.js | scripts | MODIFY |` →
  `{ action: 'MODIFY', layer: 'scripts' }`) and SHALL CONTINUE TO yield `layer: null` on
  every row of a table with no Layer column → tests/file-plan/multi-table.test.js
- **AC-20260816-03-6**: WHEN a single table contains a data row whose first cell is
  literally `file` or `paths` between two path rows (literal: header
  `| File | Action | Layer |`, rows `| src/a.js | MODIFY | scripts |`,
  `| file | CREATE | tests |`, `| src/b.js | MODIFY | scripts |`), THE SYSTEM SHALL keep
  the surrounding rows bound to the table's header (`src/a.js` AND `src/b.js` both →
  `{ action: 'MODIFY', layer: 'scripts' }`) — the bare-cell row itself stays dropped by the
  existing path-shape filter → tests/file-plan/multi-table.test.js
- **AC-20260816-03-5**: WHEN `parseFilePlan` parses the AC-1 two-table section, THE SYSTEM
  SHALL CONTINUE TO return the de-duped union of path-shaped column-1 cells from all tables
  (literal: AC-1 fixture → includes both `tests/a.test.js` and `src/x.js`), including
  compound-cell splitting (`a.js + b.js` → both) → tests/file-plan/multi-table.test.js

## Assumptions (escalation triggers)

- A1: The defect reproduces exactly as specified — **executed evidence (2026-08-17, this
  planning session):** a scratch two-table File Plan (File/Action/Layer table with a
  `tests/a.test.js | create | tests` row, then `### Landed at design stage` with a
  `| Path | State | Summary |` table) run through the installed `parseFilePlanRows` returned
  3 rows all `{ action: null, layer: null }`, tests-layer rows: 0. **If the AC-1 test does
  not go red against pre-change code:** STOP — the defect model is wrong; do not ship a
  rewrite of a T3 surface on a broken repro.
- A2: No consumer depends on the buggy cross-table clobbering — verified at plan time:
  `ac-matrix.js` and `scope-reconcile.js` filter `layer === 'tests'`, `spec-status.js` reads
  only `parseFilePlan` paths, and `collision-closure.js` uses the INVERSE filter
  (`!isTestsLayer(r)` → targets), where the fix is a strict improvement: pre-fix the
  clobbered `layer: null` dumped even real tests rows into its advisory target set; post-fix
  tests rows are correctly excluded and only genuine non-tests/null rows remain, and its
  output is advisory by its own header, never blocking. **If false** (a
  scoped or whole-suite pin goes red on the fix): treat as a colliding pin per the host
  Gotchas — update the pin in place, retag with this spec's AC-ID, never weaken; if the red
  is in a *behavioral* consumer path rather than a pin, return blocked.
- A3: The full suite's sanctioned-red INTAKE baseline is untouched by this spec — the scoped
  gate is `node spec/scripts/build-workflows.js --check && node --test
  'tests/file-plan/*.test.js'` (glob form per the `{testDirs}` gotcha). **If false:** STOP
  and re-scope.

## Rationale

The Salon OS report proposed the minimal fix (bind indices per-row at accumulation inside
`parseFilePlanRows`). Rejected as the landing shape, accepted as the semantic: the file
carries two near-identical hand-rolled section walks (`parseFilePlan` lines 28–52,
`parseFilePlanRows` lines 62–100; the duplicated section-finding/walk portion is roughly
29–50 vs 63–89) that have already drifted once — the row variant gained the index bug the
path variant can't express. One shared walker is the holistic fix; the minimal patch would be
the third copy of the walk logic. Return shapes and the export list are pinned (Contracts) so
all four consumers are untouched. D1's "shared" property is structural and deliberately has
no AC (both functions' behavior is pinned independently; sharing is verified by the review
diff, not a test) — a worker who patches only one function violates D1, which review checks
against the Decisions table.

First-table-only parsing was rejected (D3): the 333-spec corpus grammar says path-in-column-1
tables, plural tables were never excluded, and hosts may legitimately split a File Plan by
layer. The open question deliberately NOT decided here: `parseFilePlan` ingests a status
table's `Path` cells into the plan-path set, which makes `scope-reconcile`'s out-of-plan
check *lenient* for files a host lists in a non-plan table; the same shape reaches
`collision-closure.js`'s advisory target/planned sets via its inverse tests-filter (status
rows carry `layer: null`, so they count as non-tests targets — advisory-only by that
script's contract). Both are pre-existing behavior, pinned by AC-5 as a CONTINUE — changing
them silently would alter review scope verdicts across all hosts. Reopen only on a real
incident of a file escaping out-of-plan detection via a status table.

Adversarial-check dispositions (T3, two blind refuters, both executed their claims): refuter
A confirmed AC-1/AC-2 repro end-to-end through the real `ac-matrix.js` CLI (pre-fix exit 1,
`uncovered-ac` hard finding) and found no colliding test pins anywhere in `tests/`; its two
low-severity notes (collision-closure characterization, line-range drift) are folded in
above. Refuter B refuted the draft's original rebind-anywhere header rule with an executed
counterexample (a data row whose path cell is literally `file` nulled trailing same-table
rows) — fixed as D2's first-row-only header recognition plus AC-6 — and flagged the Behavior
section's overgeneral `###`-subheading claim, fixed by scoping it to the heading level. No
findings were rejected.

Provenance: `parseFilePlanRows` shipped via specs/20260814/01-ac-matrix-script.md and passed
that review with only single-table fixtures — this is an escape; after this spec locks, the
session records the ledger row via `/spec:escape` (a command flow, deliberately not a File
Plan row — the ledger append is owned by that command, and this spec is the fix the row
points at).

Fragile to watch during execution: D2's reset-at-boundary rule interacts with prose lines
between a table's header and its rows (none observed in the corpus, but a mid-table comment
line would split the table and orphan the trailing rows from their header — the walker treats
that as two tables, second unbound, which is the conservative failure: `null`, never a
misread column).

## Canonical Delta

None — `docs/canonical/` carries no area doc for the gate-script layer in this repo; the
authoritative doc surface is the script's own header comment (updated by D4).
