---
date: 2026-10-29
status: draft
tier: standard
area: doctrine
breaking: false
depends_on: []
brief: n/a
---

# Structural triggers at plan time: breaking changes, new dependencies, persisted-data changes

## Goal

Three kinds of change that a product owner expects to hear about before they land get a reader
in the plan stage: a spec marked `breaking: true`, a File Plan that adds a dependency, and a
non-empty Data Model that touches persisted rows. None of them asks a question by default; each
prints a `📌` notice at lock, and only the critical-tier path (persisted-data change) escalates to
the existing lock confirmation. Done means `breaking:` has a consumer, a lockfile-touching row
prints what it adds, and a Data Model section forces `tier: critical`.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 5, 6, 7.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `breaking: true` gains readers: at `/spec:plan` lock, `decision-lint.js` requires at least one Decision carrying `[asked: …]` or `[breaking: <what breaks for whom>]`; `/spec:release` Phase 0.2 lists every shipped spec with `breaking: true` under a `⚠️ breaking` heading in the shipped-brief list and the release row gains `breaking: [<spec paths>]` (AC-20261029-05-1, AC-20261029-05-2) | The flag exists in the template and nothing reads it (audit gap). A lint at lock and a listing at release are the two moments the owner acts. |
| D2 | `ac-matrix --lint` (the lock gate) prints one line per File Plan row whose path is a dependency manifest or lockfile (`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `pyproject.toml`, `poetry.lock`, `requirements*.txt`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `Gemfile*`): `📌 adds or changes dependencies — <path> (veto anytime)`; the spec's Decisions must name the packages when the row's Summary does not (`missing-dependency-names` finding) (AC-20261029-05-3) | Dependency additions are the most common silent supply-chain decision; naming the packages in the spec is enough for a reader to object. No question — reversible until merge. |
| D3 | A spec whose `## Data Model` section is non-empty and not the template placeholder is `tier: critical` at lock: `ac-matrix --lint` reports `data-model-requires-critical` when `tier: standard`; the Data Model section must state whether existing rows are affected (`existing rows: unaffected` or `existing rows: <what changes>` on its own line) — `missing-existing-rows-line` otherwise (AC-20261029-05-4, AC-20261029-05-5) | core § Tiers already lists migrations as the archetypal critical trigger; today only a host's Risk Tiers text can enforce it. The critical lock confirmation (spec 20261029/04 D3) then carries the question. |
| D4 | The spec template's `## Data Model` comment and frontmatter comment for `breaking:` are updated to state D1 and D3; `spec/doctrine/core.md` § Tiers gains one sentence: "A non-empty Data Model is critical by construction." (AC-20261029-05-6) | One binding home per rule; the template is where authors read it. |
| D5 | `spec/.claude-plugin/plugin.json` bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: reviewer-held]` | Rules § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/decision-lint.js | MODIFY | scripts | `breaking: true` requires an `[asked:]` or `[breaking:]` Decision (D1) |
| spec/scripts/ac-matrix.js | MODIFY | scripts | `--lint`: dependency-row notice + `missing-dependency-names`; `data-model-requires-critical`; `missing-existing-rows-line` (D2, D3) |
| spec/scripts/release-legs.js | MODIFY | scripts | shipped-brief derivation carries `breaking` spec paths (D1) |
| spec/commands/release.md | MODIFY | doctrine | Phase 0.2 `⚠️ breaking` listing (D1) |
| spec/templates/spec.md | MODIFY | doctrine | `breaking:` and Data Model comments (D4) |
| spec/doctrine/core.md | MODIFY | doctrine | § Tiers sentence (D4) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D5) |
| tests/ac-matrix/structural-triggers.test.js | CREATE | tests | AC-20261029-05-3, AC-20261029-05-4, AC-20261029-05-5 |
| tests/doctor/decision-lint-breaking.test.js | CREATE | tests | AC-20261029-05-1 |
| tests/release-legs/breaking-list.test.js | CREATE | tests | AC-20261029-05-2 |
| tests/consistency/critical-tier-doctrine.test.js | MODIFY | tests | AC-20261029-05-6 |

## Contracts

decision-lint.js new finding classes: `breaking-unasked` (frontmatter `breaking: true`, no Decision with `[asked:` or `[breaking:`).

ac-matrix.js `--lint` new finding classes: `missing-dependency-names`, `data-model-requires-critical`, `missing-existing-rows-line`; new stdout notice line `📌 adds or changes dependencies — <path> (veto anytime)` (advisory, not a finding).

Release row: `"breaking": ["specs/…/NN-x.md", …]` (empty array when none).

## Acceptance Criteria

- **AC-20261029-05-1**: WHEN `decision-lint.js --spec <s> --root <r>` runs on a spec with `breaking: true` and no Decision row containing `[asked:` or `[breaking:` THE SYSTEM SHALL exit 1 with one `breaking-unasked` finding; the same spec with a row ending `[breaking: the /v1/export route is removed]` SHALL exit 0 → writes tests/doctor/decision-lint-breaking.test.js
- **AC-20261029-05-2**: WHEN `release-legs.js` derives the shipped set from a ledger holding two done specs, one with `breaking: true` THE SYSTEM SHALL write `breaking: ["<that spec path>"]` on the release row and print a `⚠️ breaking` heading naming it (e.g. one shipped breaking spec → the array has exactly that path) → writes tests/release-legs/breaking-list.test.js
- **AC-20261029-05-3**: WHEN `ac-matrix.js --spec <s> --lint` runs on a spec whose File Plan has a `package.json | MODIFY` row whose Summary names no package and whose Decisions name none THE SYSTEM SHALL print `📌 adds or changes dependencies — package.json (veto anytime)` and one `missing-dependency-names` finding; with a Decision containing `adds zod@3` it SHALL print the notice and zero findings → writes tests/ac-matrix/structural-triggers.test.js
- **AC-20261029-05-4**: WHEN the spec's `## Data Model` holds `tables: orders gains column refunded_at` and frontmatter `tier: standard` THE SYSTEM SHALL report `data-model-requires-critical`; with `tier: critical` it SHALL NOT → writes tests/ac-matrix/structural-triggers.test.js
- **AC-20261029-05-5**: WHEN the `## Data Model` is non-empty and has no line starting `existing rows:` THE SYSTEM SHALL report `missing-existing-rows-line`; with `existing rows: unaffected` it SHALL NOT; the template placeholder text (`{ Persistence changes:` …) SHALL count as empty → writes tests/ac-matrix/structural-triggers.test.js
- **AC-20261029-05-6**: WHEN `spec/doctrine/core.md` § Tiers and `spec/templates/spec.md` are read THE SYSTEM SHALL contain `non-empty Data Model is critical` (core) and `existing rows:` (template Data Model comment) → writes tests/consistency/critical-tier-doctrine.test.js

## Assumptions (escalation triggers)

- A1: `ac-matrix.js --lint` is the lock gate every plan runs (plan.md Lock step 2) and already parses the File Plan table and frontmatter. — **if false:** put D2/D3 in a sibling lint script wired into the same step.
- A2: `release-legs.js` derives the shipped set from ledger rows and reads each spec's frontmatter. — **if false:** the release command derives the list in prose from `spec-status --json` and the row field is written by the command's ledger step.
- A3: `[NEEDS CLARIFICATION: should a dependency row ASK (not notify) on tier: critical specs, mirroring the out-of-plan gate rule? Default here: notify only, every tier.]`

## Rationale

The audit's gap table lists dependency additions, schema migrations and public-API changes as
decisions nothing in the pipeline surfaces. Each already has a natural carrier that was simply
unread: the `breaking:` flag, the File Plan row's path, the Data Model section. Reading them at
lock costs no new question; the critical lock confirmation from spec 04 is the only prompt, and
only for persisted-data changes. The package-name rule asks for words in the spec, not a decision,
because a reviewer can object to a named package and cannot object to `package.json | MODIFY`.

Rejected: a license or download-count lookup at lock. The MCP policy puts lookups at plan time,
but a registry fetch per dependency row adds network dependence to the lock gate; a later spec
can add it behind `registry-check.js` once the names are reliably present.

## Canonical Delta

docs/canonical/pipeline.md, the lock paragraph: add "Lock reads three structural carriers: a
`breaking: true` spec needs an asked or `[breaking:]` Decision; a dependency manifest in the File
Plan prints what it adds and needs the packages named; a non-empty Data Model makes the spec
critical and must say whether existing rows are affected."
