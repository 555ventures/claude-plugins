---
date: 2026-11-02
status: done
tier: standard
area: plan-lock
breaking: false
depends_on: []
brief: n/a
build_base: main
open_markers: 0
diff_base: 262a669e1de8f9c298b9f263cb0f24b24aaafb30
---

# An additive-only Data Model stays standard tier

## Goal

Today any non-empty `## Data Model` forces `tier: critical` at lock, whatever the host's
§ Risk Tiers says, so on a CRUD product nearly every spec pays the critical cost (literal
examples on every AC, spikes, a lock confirmation stop, no env-skip). This spec narrows the
rule to what it was for: a Data Model that only adds (a new table, a nullable or defaulted
column) and leaves existing rows alone may stay `standard` when the spec says so in a
declared grammar, and the lint refuses the declaration whenever the section's own text
contradicts it. Done means: the carve-out lints deterministically, the doctrine states it in
the files an author reads, and every pre-existing lock behaves as before.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A non-empty `## Data Model` stays `tier: standard` only when the section holds BOTH lines on their own line: `changes: additive-only` and `existing rows: unaffected`. Either line absent → `data-model-requires-critical` fires exactly as today, with its detail text extended to name the carve-out (AC-20261102-02-1, AC-20261102-02-2). | A declared grammar is the only predicate a script can read; prose like "just adds a column" is not. Rejected: inferring additivity from the prose. |
| D2 | `decision-lint.js` gains the hard finding `additive-claim-contradicted` (id `Data Model`), raised on ANY tier when `changes: additive-only` is declared and the section also holds a contradicting line: an `existing rows:` value other than `unaffected`, or a line matching the migrating verbs `drop`, `rename`, `backfill`, `type change` / `alter … type`, or `not null` without `default` on the same line. The detail names the first offending line verbatim. The verb list lives in the script header only (AC-20261102-02-3, AC-20261102-02-7). | A declaration the section itself refutes is the lie the earlier gate trusted elsewhere; the verb list is a floor that catches the obvious, never a proof of additivity. |
| D3 | The carve-out is stated once per reading surface: core.md § Tiers (the sentence `A non-empty Data Model is critical by construction` grows the exception), the template's `## Data Model` comment (the two-line grammar), plan.md § Lock (the remedy for the two findings). Each names the literal `changes: additive-only` (AC-20261102-02-5). | One binding home per rule (core § Doctrine Authoring); the author meets the grammar where they write, not at the refusal. |
| D4 | The host's § Risk Tiers triggers and the boot-path trigger still decide critical above the carve-out: a spec adding a nullable column to a surface the host lists as critical is critical by the planner's call, never by this lint. The lint does not read § Risk Tiers for the Data Model check. `[no-ac: planner judgment with no mechanical surface — § Risk Tiers is free prose per host]` | Fuzzy word-matching the section against the host list would refuse honest specs and pass dishonest ones; the tier line is the planner's contract. |
| D5 | `--json` `counts` gains `additiveDataModel` (1 when the `changes: additive-only` line is present in a non-empty section, else 0); the plain first stdout line keeps its byte shape `decision-lint: restrictions=N deferrals=N findings=N` (AC-20261102-02-4). | plan.md copies the summary line into the ledger; tooling reads counts. |
| D6 | The `STRUCTURAL_LINT_APPLIES_FROM` date gate is untouched: a pre-cutoff spec still emits nothing; the carve-out only loosens post-cutoff locks (AC-20261102-02-6). | History never reddens; measured A1 shows no post-cutoff spec has a live Data Model, so no existing lock changes either way. |
| D1a | (build ruling, resolving Behavior step 3 against AC-20261102-02-3) The carve-out in D1 also requires the D2 contradiction predicate to find nothing: a contradicted declaration on `tier: standard` yields both `additive-claim-contradicted` and `data-model-requires-critical` (AC-20261102-02-3). | Behavior's own sentence "a contradicted declaration therefore yields two findings" and AC-3 both state it; step 3's predicate omitted the clause. |
| D1b | (build ruling, gate line `✖ AC-20261029-07-2 … recommended: park (failures did not shrink: 20 → 20 → 20)`) `tests/build/escalate-choice.test.js`'s counting-gate fixture drops its first line with `tail -n +2` + `mv` instead of `sed -i 1d`, which BSD sed reads as a backup suffix, so the fixture never advanced on macOS. Assertions unchanged. `[no-ac: fixture portability repair, the existing pins are the oracle]` | Pre-existing red on main on macOS; a fixture fix, never a weakening. |
| D7 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the paragraph names the grammar and the new finding class. Queue item q328 (the ratified decision) is marked done at lock. `[no-ac: version mechanics — plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline; the queue holds decisions until they are spec'd. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/decision-lint.js | MODIFY | scripts | D1 carve-out predicate, D2 `additive-claim-contradicted` + verb list in the header, D5 `counts.additiveDataModel`; header `Exit codes` and "does NOT" lines updated |
| spec/doctrine/core.md | MODIFY | doctrine | § Tiers sentence grows the exception naming `changes: additive-only` + `existing rows: unaffected` (D3) |
| spec/templates/spec.md | MODIFY | doctrine | `## Data Model` comment states the two-line grammar and that a contradicted declaration is refused (D3) |
| spec/commands/plan.md | MODIFY | doctrine | § Lock remedy text for `data-model-requires-critical` names the carve-out and `additive-claim-contradicted` (D3) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D7) |
| tests/decision-lint/additive-data-model.test.js | CREATE | tests | AC-20261102-02-1, AC-20261102-02-3, AC-20261102-02-4, AC-20261102-02-7 |
| tests/consistency/structural-triggers-doctrine.test.js | MODIFY | tests | AC-20261102-02-5 |
| tests/build/escalate-choice.test.js | MODIFY | tests | D1b — the counting-gate fixture drops its first line portably (`tail -n +2` + `mv`); assertions unchanged |
| tests/decision-lint/structural-triggers.test.js | MODIFY | tests | AC-20261102-02-2, AC-20261102-02-6 — the two CONTINUE-TO pins gain this spec's AC-IDs in their titles after the resolving prefix; assertions unchanged |

## Contracts

Data Model grammar (template comment, D1) — a non-empty section stays `tier: standard` only
with both lines, each on its own line, case-exact:

```
changes: additive-only
existing rows: unaffected
```

decision-lint findings (all `severity: hard`), D1/D2:

```
data-model-requires-critical   id: Data Model
  detail: "## Data Model is non-empty — a persisted-data change is tier: critical (core § Tiers); set tier: critical, or declare `changes: additive-only` with `existing rows: unaffected` when it only adds a table or a nullable/defaulted column"
additive-claim-contradicted    id: Data Model
  detail: "## Data Model declares `changes: additive-only` but its own text says otherwise — `<offending line>`; drop the declaration and set tier: critical, or remove the migrating change"
```

Contradiction predicate (D2), evaluated over the non-placeholder section body, line by line:

```
existing rows: <anything other than `unaffected`>           → contradicted
/\b(drop|rename|backfill)\w*\b/i                             → contradicted
/\btype change\b|\balter\b[^\n]*\btype\b/i                   → contradicted
/\bnot null\b/i on a line with no /\bdefault\b/i            → contradicted
```

`--json` counts (D5): `{ restrictions, deferrals, breaking, dependencyRows, dataModel, additiveDataModel }`.

## Behavior

At lock, decision-lint reads the Data Model section as today. If it is empty or placeholder-only
nothing changes. If it is non-empty:

1. `missing-existing-rows-line` fires as today when no `existing rows:` line exists.
2. If `changes: additive-only` is present, the contradiction predicate runs; a hit raises
   `additive-claim-contradicted` naming the first offending line, on standard and critical alike.
3. `data-model-requires-critical` fires when `tier` is not `critical` AND NOT (both grammar
   lines present). A contradicted declaration therefore yields two findings on a standard spec
   (the contradiction and the tier demand): the remedy for both is the same tier flip.

Pre-cutoff specs (date dir before `STRUCTURAL_LINT_APPLIES_FROM`) skip all of this, as today.

## Acceptance Criteria

- **AC-20261102-02-1**: WHEN the spec's `## Data Model` holds `tables: orders gains nullable column refunded_at`, `changes: additive-only` and `existing rows: unaffected` with frontmatter `tier: standard` at `specs/20261102/09-x.md` THE SYSTEM SHALL exit 0 with zero findings, and `--json` reports `counts.dataModel` 1 and `counts.additiveDataModel` 1 → writes tests/decision-lint/additive-data-model.test.js
- **AC-20261102-02-2**: WHEN the spec's `## Data Model` holds `tables: orders gains column refunded_at` and `existing rows: unaffected` with no `changes:` line on `tier: standard` THE SYSTEM SHALL CONTINUE TO exit 1 with exactly one `data-model-requires-critical` finding → reuses tests/decision-lint/structural-triggers.test.js :: AC-20261029-05-3
- **AC-20261102-02-3**: WHEN `changes: additive-only` is declared and the section also holds `existing rows: backfilled from created_at` (or, in a second spec, the line `drop column legacy_total`) THE SYSTEM SHALL exit 1 with one `additive-claim-contradicted` finding whose detail quotes that line, on `tier: standard` and on `tier: critical` alike; on `tier: standard` the output also carries `data-model-requires-critical` → writes tests/decision-lint/additive-data-model.test.js
- **AC-20261102-02-4**: WHEN `--json` runs on the AC-1 spec THE SYSTEM SHALL carry `counts.additiveDataModel` = 1; on a non-empty section with no `changes:` line it carries 0; and in plain mode the first stdout line matches `/^decision-lint: restrictions=\d+ deferrals=\d+ findings=\d+$/` → writes tests/decision-lint/additive-data-model.test.js
- **AC-20261102-02-5**: WHEN `spec/doctrine/core.md` § Tiers, `spec/templates/spec.md`'s `## Data Model` section and `spec/commands/plan.md` § Lock are read THE SYSTEM SHALL each contain the literal `changes: additive-only`, and core.md § Tiers still contains `non-empty Data Model is critical` → rewrites tests/consistency/structural-triggers-doctrine.test.js :: AC-20261029-05-7: core.md § Tiers states
- **AC-20261102-02-6**: WHEN the spec path is `specs/20261025/01-x.md` with a non-empty Data Model and no `changes:` line on `tier: standard` THE SYSTEM SHALL CONTINUE TO exit 0 with zero findings → reuses tests/decision-lint/structural-triggers.test.js :: AC-20261029-05-5
- **AC-20261102-02-7**: WHEN `changes: additive-only` and `existing rows: unaffected` are declared with the line `column paid_cents integer not null default 0` THE SYSTEM SHALL exit 0; with `column paid_cents integer not null` instead THE SYSTEM SHALL exit 1 with `additive-claim-contradicted` quoting that line → writes tests/decision-lint/additive-data-model.test.js

## Assumptions (escalation triggers)

- A1 (executed): zero specs dated ≥ `STRUCTURAL_LINT_APPLIES_FROM` (20261029) carry a live Data Model (census over `specs/202610[23]*` and `specs/202611*` via `extractSection` with the placeholder stripped: 0 hits), so no existing lock changes under D1 — **if false:** list them; the carve-out only loosens, so none redden.
- A2: `fmValue(specText, 'tier')` and `extractSection(specText, 'Data Model')` keep their current shapes (both already used by the Data Model check) — **if false:** blocked; adjudicate here.
- A3: the D2 verb list is a floor, not proof. A false `additive-only` claim the words miss is the reviewer's to catch against the diff (the reviewer reads the spec's Data Model), and mid-build evidence upgrades the tier (core § Tiers) — **if false (such a claim escapes):** the escape row carries class `declared-metadata-contradicts-content`; a third recurrence earns a stronger guard per core § Incident Policy, never a wider word list by feel.

## Rationale

The 2026-10-29 structural-triggers spec made any persisted-data change critical because the
one host then measured had none post-cutoff, so the cost was invisible. A host with a real
database reported 31 of 46 specs critical, which turns the tier from a signal into the
default and makes every lock pay for a stop and spike work the change does not warrant. JJ
ratified the narrowing on 2026-11-02 (queue q328): additive-only, existing rows unaffected.

D1 insists on a declared grammar because the alternative, reading additivity out of prose,
cannot be deterministic, and core § Rule Enforcement forbids an LLM judging it at lock. D2
exists because the state gate had just been caught trusting a self-reported counter
(7.298.0): a declaration the same section refutes must be refused by the script, not by the
reviewer's goodwill. The verb list is deliberately short and lives in one header; growing it
on feel is the prose creep § Incident Policy forbids, so A3 routes misses to the ledger.
D4 keeps the host list and boot-path trigger above the carve-out without reading them in the
lint: the planner states the tier and why (plan.md § Entry), and a column on a money table is
the planner's critical call. Rejected: a per-host config switch for the Data Model rule, since
the problem is the rule's width, not its home; and a tier `--force` flag, since a flag with no
grammar is the self-report again. Fragile: `not null` without `default` on one line is a
heuristic over free text; a wrapped line will miss it, which A3 accepts.

Collision-closure waives (executes leg): `tests/host-config/file-shapes.test.js` and
`tests/spec-paths.test.js` execute decision-lint only through its manifest-row and key-resolution
paths, which D1/D2 leave untouched, so neither is a File Plan row.

Build deviations (2026-11-02, folded at close): AC-20261102-02-5's `rewrites` pointer named a
case an earlier close's expiry had already removed, so the build recreated it under that title
carrying only this spec's pins (the § Gotchas expired-MODIFY shape). D1a records that the
carve-out also requires the contradiction predicate to find nothing, as Behavior's own "two
findings" sentence and AC-20261102-02-3 state.

## Canonical Delta

docs/canonical/pipeline.md, the structural-carriers sentence: "a non-empty Data Model makes the
spec critical and must carry an `existing rows:` line" becomes "a non-empty Data Model makes the
spec critical and must carry an `existing rows:` line, unless it declares `changes:
additive-only` with `existing rows: unaffected` (a new table or a nullable/defaulted column);
a declaration the section's own text contradicts is refused as `additive-claim-contradicted`
(specs/20261102/02)".
