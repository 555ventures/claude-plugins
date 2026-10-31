---
date: 2026-10-29
status: hardened
tier: standard           # touches decision-lint.js, two lib parsers, four doctrine files and tests — none is a rules § Risk Tiers surface (no spec-paths key, no grounding-contract edit, no verdict.js/spec-status.js edit)
area: doctrine
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-31
---

# Structural triggers at plan time: breaking changes, new dependencies, persisted-data changes

## Goal

Three kinds of change that a product owner expects to hear about before they land get a reader
in the plan stage: a spec marked `breaking: true`, a File Plan that adds or changes a dependency,
and a non-empty Data Model that touches persisted rows. None of them adds a question by default;
each is read at lock by the lint that already runs there, and only the critical-tier path
(a persisted-data change, or a dependency row on an already-critical spec) rides the existing
lock confirmation. Done means `breaking:` has a consumer at lock and at release, a
manifest-or-lockfile row prints what it adds and must name its packages, and a non-empty Data
Model forces `tier: critical` and must say whether existing rows are affected.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 5, 6, 7.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `decision-lint.js` gains the **breaking** check: when frontmatter `breaking:` is `true` (read through `lib/frontmatter.js`'s `fmValue`) and no live Decision row carries a non-empty `[asked: …]` or `[breaking: <what breaks for whom>]` tag, it emits hard finding `breaking-unasked` with id `frontmatter` (detail text in Contracts). A spec with `breaking: false`, absent, or any other value emits nothing. (AC-20261029-05-1, AC-20261029-05-5) | The flag exists in the template and nothing reads it (audit row 5). decision-lint already runs at every lock, enumerates live Decision rows and reads `[asked:]` tags, so the reader lands where the owner already acts. Rejected: `ac-matrix --lint` — its header contract is "the AC-line lint alone, no File Plan read", and a frontmatter-vs-Decisions check is exactly the Decisions-shape lint decision-lint exists for. |
| D1a | `/spec:release` Phase 0.2 (the shipped-brief derivation) gains one sentence after the list: read each shipped spec's frontmatter `breaking:`; every `breaking: true` spec is listed under a `⚠️ breaking` heading in the shipped-brief list, one line per spec quoting its `[breaking:]` or `[asked:]` Decision tag text; no breaking spec → no heading. The release ledger row is unchanged. (AC-20261029-05-7) | Release is the second moment the owner acts on a breaking change (audit row 5). `spec-status --json` already lists the shipped specs' paths; the `breaking:` read is one grep per path. Rejected: a `breaking: [...]` key on the release ledger row — verdict.js derives release rows from the legs' typed observed objects, never from session assertions, and verdict.js is a rules § Risk Tiers surface; a listing in the report serves the owner without a critical-tier edit. |
| D2 | `decision-lint.js` gains the **dependency-row** check over `lib/file-plan.js`'s `parseFilePlanRows`: for every File Plan row whose path's basename is in the closed MANIFEST set (`package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `bun.lock`, `pyproject.toml`, `poetry.lock`, `Pipfile`, `Pipfile.lock`, `requirements*.txt`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `Gemfile`, `Gemfile.lock`, `composer.json`, `composer.lock`; the list lives in the script header, no host configuration) and whose Summary cell is not the literal `no dependency change`, it prints the notice `📌 adds or changes dependencies — <path> (veto anytime)` on stdout (one line per row, after the finding lines; `--json` lists them under `notices`) and emits hard finding `missing-dependency-names` with id `<path>` when that row's Summary cell holds no backtick span (the packages are named in backticks in the Summary: `` adds `zod@3` ``). A Summary of exactly `no dependency change` prints no notice and no finding. A row whose table binds no Summary column (`summary === null`) is a finding — fail-closed. Any other path prints nothing. On a `tier: critical` spec the notice lines are carried into plan.md step 2b's question text (D5). (AC-20261029-05-2, AC-20261029-05-6) `[asked: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 row 6 — the audit chose "notice at plan; ask only on tier: critical", so the notice is advisory on standard tier and rides the existing critical lock confirmation, never a question of its own]` | Dependency additions are the most common silent supply-chain decision (audit row 6); a named package in the row is enough for a reader to object, and `package.json | MODIFY` is not. The Summary cell is the one place: a reader of the File Plan sees the packages beside the path, and the lint needs no second search through Decisions. Rejected: a registry lookup (license, downloads) at lock — it adds network dependence to the lock gate (Rationale). |
| D2a | `lib/file-plan.js`'s `parseFilePlanRows` gains an additive `summary` field per row: the row's cell under the table's own `Summary` header (case-insensitive, any column order, bound the same table-scoped way `Action`/`Layer` are), `null` when that table binds no Summary column. `parseFilePlan`'s return shape and every existing caller are unchanged. (AC-20261029-05-6) | ac-matrix.js already relies on the table-scoped Action/Layer binding; a third column rides the same walker, never a second table parser. |
| D3 | `decision-lint.js` gains the **data-model** check: the spec's `## Data Model` section (via `extractSection`) with the template placeholder removed (the regex `/\{\s*Persistence changes:[\s\S]*?\}/`) and trimmed is **non-empty** → the spec must be `tier: critical` (hard finding `data-model-requires-critical` with id `Data Model` when `fmValue(tier)` is anything else) and the section must hold one line matching `/^existing rows:\s*\S/m` — `existing rows: unaffected` or `existing rows: <what changes>` — else hard finding `missing-existing-rows-line`. An absent section, or one holding only the placeholder, emits nothing. (AC-20261029-05-3, AC-20261029-05-4) | core § Tiers already names irreversible surfaces as the critical trigger and migrations are its archetype (audit row 7); today only a host's Risk Tiers text can enforce it. Forcing the tier means the critical lock confirmation (plan.md step 2b, specs/20261029/04 D3) carries the question, and the `existing rows:` line is the one sentence the owner needs. |
| D4 | `lib/spec-sections.js` exports `STRUCTURAL_LINT_APPLIES_FROM = '20261029'` beside `DECISION_LINT_APPLIES_FROM`; D1, D2 and D3 apply only to a spec whose `--spec` path carries a `specs/<YYYYMMDD>/` segment ≥ that date, or no such segment (a tmp-path fixture is linted in full, the same convention the existing checks use). decision-lint's existing not-applicable short-circuit (`< DECISION_LINT_APPLIES_FROM`) is unchanged. `--json`'s `counts` gains `breaking` (0 or 1), `dependencyRows` (N notices) and `dataModel` (0 or 1 — non-empty section); the plain stdout summary line is byte-unchanged. (AC-20261029-05-5) | 29 locked specs carry `breaking: true` with no tag, two of them dated after the decision-lint cutoff; a lint that re-reads history must never redden it. The summary line is what plan.md's ledger step copies; new counters live in `--json` only. |
| D5 | Doctrine states each rule once, in the file an author reads: `spec/templates/spec.md`'s `breaking:` frontmatter comment names the `[breaking: <what breaks for whom>]` Decision tag and the lock refusal `breaking-unasked`; its `## Data Model` comment states "a non-empty Data Model makes the spec `tier: critical`" and the `existing rows:` line grammar; `spec/doctrine/core.md` § Tiers gains the sentence "A non-empty Data Model is critical by construction (refused at lock by `decision-lint`)."; `spec/commands/plan.md` § Lock step 2's decision-lint sentence names the three new finding classes and the `📌 adds or changes dependencies` notice, and step 2b's question text gains ", and it adds or changes dependencies: <paths>" when decision-lint printed any notice; `spec/commands/release.md` Phase 0.2 carries D1a's sentence. (AC-20261029-05-7) | One binding home per rule; the template is where authors meet it, plan.md is where the session runs it. |
| D6 | `spec/.claude-plugin/plugin.json` is bumped through `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | Rules § Planning version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/decision-lint.js | MODIFY | scripts | three structural checks: `breaking-unasked`, dependency-row notice + `missing-dependency-names`, `data-model-requires-critical` + `missing-existing-rows-line`; MANIFEST set in the header; `--json` `notices` and three new `counts` keys; applicability via `STRUCTURAL_LINT_APPLIES_FROM` (D1, D2, D3, D4) |
| spec/scripts/lib/file-plan.js | MODIFY | scripts | `parseFilePlanRows` rows gain `summary` (table-scoped `Summary` column, `null` when unbound) (D2a) |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | export `STRUCTURAL_LINT_APPLIES_FROM = '20261029'` (D4) |
| spec/commands/plan.md | MODIFY | doctrine | § Lock step 2 names the new finding classes and the notice; step 2b question text carries the dependency notice lines on critical tier (D5) |
| spec/commands/release.md | MODIFY | doctrine | Phase 0.2 `⚠️ breaking` listing sentence (D1a, D5) |
| spec/templates/spec.md | MODIFY | doctrine | `breaking:` frontmatter comment and `## Data Model` comment (D5) |
| spec/doctrine/core.md | MODIFY | doctrine | § Tiers sentence (D5) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D6) |
| tests/decision-lint/structural-triggers.test.js | CREATE | tests | AC-20261029-05-1, AC-20261029-05-2, AC-20261029-05-3, AC-20261029-05-4, AC-20261029-05-5 |
| tests/file-plan/summary-column.test.js | CREATE | tests | AC-20261029-05-6 |
| tests/consistency/structural-triggers-doctrine.test.js | CREATE | tests | AC-20261029-05-7 |

## Contracts

decision-lint.js — new hard finding classes (all `severity: 'hard'`, same `{ severity, class, id, detail }` shape and the same `  <class> <id>: <detail>` stdout line as the existing two):

```
breaking-unasked             id: frontmatter
  detail: "breaking: true has no reader — add [breaking: <what breaks for whom>] or [asked: <what the user chose>] to the Decision that introduces the break"
missing-dependency-names     id: <File Plan path>
  detail: "<path> adds or changes dependencies but its Summary names no package — write the packages in backticks (adds `zod@3`) or the literal `no dependency change`"
data-model-requires-critical id: Data Model
  detail: "## Data Model is non-empty — a persisted-data change is tier: critical (core § Tiers); set tier: critical or remove the section"
missing-existing-rows-line   id: Data Model
  detail: "## Data Model has no `existing rows:` line — add `existing rows: unaffected` or `existing rows: <what changes>` on its own line"
```

Notice line (stdout, after the finding lines, one per qualifying File Plan row; never a finding):

```
📌 adds or changes dependencies — <path> (veto anytime)
```

`--json` shape (additive):

```
{ findings: [...], counts: { restrictions, deferrals, breaking, dependencyRows, dataModel },
  notices: [{ kind: 'dependency-row', path: '<path>' }] }
```

Plain stdout first line stays `decision-lint: restrictions=<R> deferrals=<F> findings=<N>` byte-for-byte.

Exit codes unchanged: 0 none, 1 findings, 2 usage. Notices alone never change the exit code.

lib/file-plan.js — `parseFilePlanRows(text)` row shape: `{ paths, action, layer, summary }`.

lib/spec-sections.js — `STRUCTURAL_LINT_APPLIES_FROM = '20261029'`.

Data Model grammar (template comment, D5): a non-empty section holds one line `existing rows: unaffected` or `existing rows: <what changes>`.

plan.md step 2b question text on critical tier, when decision-lint printed notices: "This spec is critical tier because it touches <the § Risk Tiers trigger>, and it adds or changes dependencies: <path>, <path>. Lock it now?"

release.md Phase 0.2 heading literal: `⚠️ breaking`.

## Acceptance Criteria

- **AC-20261029-05-1**: WHEN `decision-lint.js --spec <s> --root <r>` runs on an undated tmp-path spec with frontmatter `breaking: true` and no live Decision row containing `[asked:` or `[breaking:` THE SYSTEM SHALL exit 1 with exactly one finding of class `breaking-unasked` and id `frontmatter`; the same spec with a row ending `[breaking: the /v1/export route is removed]` SHALL exit 0 with zero findings; the same spec with `breaking: false` SHALL exit 0 with zero findings (e.g. `breaking: true` + untagged rows → stdout line `  breaking-unasked frontmatter:`) → writes tests/decision-lint/structural-triggers.test.js
- **AC-20261029-05-2**: WHEN the spec's File Plan holds the row `| package.json | MODIFY | other | dependency bump |` THE SYSTEM SHALL print `📌 adds or changes dependencies — package.json (veto anytime)` and one `missing-dependency-names` finding with id `package.json`; with Summary `` adds `zod@3` `` it SHALL print the notice and zero findings (exit 0); with Summary `no dependency change` it SHALL print neither; a row `| src/app.js | MODIFY | scripts | thing |` SHALL print nothing; `--json` SHALL carry `notices: [{kind:'dependency-row', path:'package.json'}]` and `counts.dependencyRows` equal to the notice count → writes tests/decision-lint/structural-triggers.test.js
- **AC-20261029-05-3**: WHEN the spec's `## Data Model` holds `tables: orders gains column refunded_at` and `existing rows: unaffected` with frontmatter `tier: standard` THE SYSTEM SHALL exit 1 with one `data-model-requires-critical` finding (id `Data Model`); with `tier: critical` it SHALL exit 0 with zero findings and `counts.dataModel` = 1 → writes tests/decision-lint/structural-triggers.test.js
- **AC-20261029-05-4**: WHEN the spec's `## Data Model` is non-empty and has no line matching `/^existing rows:\s*\S/m` THE SYSTEM SHALL report `missing-existing-rows-line`; with `existing rows: unaffected` on its own line it SHALL NOT; a section holding only the template placeholder (`{ Persistence changes: … }`) or no `## Data Model` section SHALL report neither `missing-existing-rows-line` nor `data-model-requires-critical` and `counts.dataModel` = 0 → writes tests/decision-lint/structural-triggers.test.js
- **AC-20261029-05-5**: WHEN the spec path is `specs/20261025/01-x.md` with `breaking: true`, an untagged Decision, a `package.json` row with an empty Summary and a non-empty Data Model on `tier: standard` THE SYSTEM SHALL emit zero findings and zero notices (dated before `STRUCTURAL_LINT_APPLIES_FROM`, which `lib/spec-sections.js` exports as `'20261029'`); the same content at `specs/20261029/09-x.md` SHALL emit all four classes; the plain stdout first line SHALL still match `/^decision-lint: restrictions=\d+ deferrals=\d+ findings=\d+$/` and `--json` `counts` SHALL carry the keys `breaking`, `dependencyRows`, `dataModel` → writes tests/decision-lint/structural-triggers.test.js
- **AC-20261029-05-6**: WHEN `parseFilePlanRows` reads a File Plan table with header `| Path | Action | Layer | Summary |` and the row `| package.json | MODIFY | other | adds \`zod@3\` |` THE SYSTEM SHALL return `summary: 'adds `zod@3`'` for that row; a table with header `| Path | Action | Layer |` SHALL return `summary: null` on every row; a table with the columns reordered (`| Summary | Path | Action | Layer |`) SHALL still bind summary by header name; `parseFilePlan` on the same text SHALL return the flat path list unchanged → writes tests/file-plan/summary-column.test.js
- **AC-20261029-05-7**: WHEN `spec/doctrine/core.md` § Tiers, `spec/templates/spec.md`, `spec/commands/plan.md` § Lock and `spec/commands/release.md` Phase 0 are read THE SYSTEM SHALL contain `non-empty Data Model is critical` (core § Tiers), `existing rows:` (template `## Data Model` comment) and `[breaking:` (template frontmatter comment), `breaking-unasked` and `adds or changes dependencies` (plan.md § Lock), and `⚠️ breaking` (release.md Phase 0 step 2) (e.g. `section(core,'Tiers').includes('non-empty Data Model is critical')` → true) → writes tests/consistency/structural-triggers-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `decision-lint.js` is the lock gate every plan runs (plan.md § Lock step 2), enumerates live Decision rows with `^\|\s*(~~)?\s*D\d+` excluding struck rows, and reads `[asked:]` tags through `tagTexts`. Verified by reading the script (150 lines; S3 ran it on this draft: `restrictions=0 deferrals=0 findings=0`, exit 0). — **if false:** the three checks become a sibling `structural-lint.js` wired into the same step, with a `spec-paths` key (which would raise the tier to critical).
- A2: `ac-matrix --lint` reads no File Plan — its header says "the AC-line lint alone, no File Plan read" and the lint arm returns before the File Plan read (ac-matrix.js lines 233–331). Verified by reading. This is why the draft's placement of D2/D3 in ac-matrix was dropped. — **if false:** none; the design no longer depends on it.
- A3: `release-legs.js` does not derive the shipped set; release.md Phase 0.2 derives it from `spec-status --json`, and `spec-status --json`'s per-spec entry carries no `breaking` field (S4: keys are `path, status, brief, area, date, depends_on, superseded_by, filePlan, observation`). Verified by running `spec-status --json`. — **if false:** D1a lists from the field instead of a grep; the prose changes, the heading does not.
- A4 (S1, executed): `extractSection(template, 'Data Model')` returns the placeholder `{ Persistence changes: … }` text, so a placeholder-only section must count as empty (D3's regex). On this draft (no section) it returns `null`. — **if false:** D3 compares against the template text verbatim.
- A5 (S2, executed): `parseFilePlanRows` on `| package.json | MODIFY | other | adds zod@3 |` returns `{paths:['package.json'], action:'MODIFY', layer:'other'}` — paths are basenames as written, so the MANIFEST match runs on `path.basename(p)`; no `summary` yet (D2a adds it). — **if false:** none.
- A6 (S5, executed): 29 specs carry `breaking: true`; two are dated ≥ `DECISION_LINT_APPLIES_FROM` (specs/20261025/01, /02, both `done`); zero specs dated ≥ 20261016 have a non-empty Data Model. D4's cutoff keeps every one green. — **if false:** raise the cutoff to the first date with no untagged breaking spec.
- A7: No test file currently exercises decision-lint.js (its owner's `tests/decision-lint.test.js` was swept as expired in commit 25e278f1); the new test directory `tests/decision-lint/` is this spec's. — **if false:** the new tests join the existing file instead.

## Rationale

The audit's gap table lists dependency additions, schema migrations and public-API changes as
decisions nothing in the pipeline surfaces. Each already has a natural carrier that was simply
unread: the `breaking:` flag, the File Plan row's path, the Data Model section. Reading them at
lock costs no new question; the critical lock confirmation from spec 20261029/04 is the only
prompt, and only for persisted-data changes or dependency rows on a spec that is critical anyway.

The three checks live in `decision-lint.js`, not `ac-matrix --lint`, because ac-matrix's lint
arm is by contract the AC-line lint and nothing else, while decision-lint is the lock's
"what the Decisions table owes" gate: a breaking change owes a tagged Decision, a dependency row
owes named packages, a data-model change owes a tier and an `existing rows:` line. Keeping
them together means one script, one `--json`, one plan.md sentence — and no new `spec-paths`
key, which would have made this spec critical tier for a wiring reason alone.

The package-name rule asks for words in the File Plan row, not a decision, because a reviewer can
object to a named package and cannot object to `package.json | MODIFY`. `no dependency change`
is the explicit escape for a version-only or metadata-only manifest edit, so the lint never
forces a fake package name.

The release side stays prose: the release report already lists shipped briefs and specs, so one
`⚠️ breaking` heading is a listing rule, not a new leg. A ledger field would need verdict.js,
which derives release rows from typed observed legs and is a Risk Tiers surface; the audit's
"ask about version bump" is host-specific (this repo derives bumps mechanically) and is not
adopted.

Rejected: a license or download-count lookup at lock. The MCP policy puts lookups at plan time,
but a registry fetch per dependency row adds network dependence to the lock gate; once package
names are reliably present in the row, `registry-check.js` has what it would need.

## Canonical Delta

docs/canonical/pipeline.md, the status-transitions paragraph (plan's lock → `hardened`): add
"Lock reads three structural carriers through `decision-lint`: a `breaking: true` spec needs an
`[asked:]` or `[breaking:]` Decision; a dependency manifest or lockfile in the File Plan prints
`📌 adds or changes dependencies` and must name its packages in the row's Summary (or say `no
dependency change`); a non-empty Data Model makes the spec critical and must carry an `existing
rows:` line. Specs dated before 2026-10-29 are exempt. (specs/20261029/05)"
