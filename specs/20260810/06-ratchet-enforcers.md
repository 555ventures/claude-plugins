---
date: 2026-08-10
status: implementing
risk: T3
open_markers: 0
area: spec-enforce
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
---

# Ratchet-mode architecture enforcers: `duplication` + `cycle` categories

## Goal

`/spec:enforce`'s category taxonomy grows two architecture-smell categories — `duplication`
and `cycle` — enforced as **ratchets**: a per-host baseline snapshot quarantines existing
violations at wiring time, and the gate fails only on violations not in the baseline. This
gives every host continuous, deterministic control over the two research-backed AI-signature
smell classes without ever handing the user a red gate over legacy debt. Done means: the
taxonomy is byte-identical across its four homes and pinned by a test (it is unpinned today),
`enforce.md` carries the ratchet semantics, and `wf-enforce` accepts the new categories as
research cells.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Taxonomy grows exactly `duplication` and `cycle`, edited in all four homes: `spec/templates/grounding-contract.md` (canonical), `spec/commands/enforce.md`, `spec/workflows/src/wf-enforce.body.js` `CATEGORIES`, `spec/commands/doctor.md` (enum restatement, one location) | The two research-backed AI-signature classes; complexity rejected — noisiest ratchet class, belongs to the future audit layer's hotspot targeting |
| D2 | Ratchet is a **per-category capability requirement**, not a new mechanism class: `enforce.md` declares `duplication` and `cycle` as ratchet categories; Phase 3 verify additionally requires the candidate to support a baseline / known-violations mode (tool-native baseline file, ignore-list, or equivalent); a candidate without one fails verify for these categories | No tool is ever named in plugin prose (standing rule); a capability requirement is stable while tools churn |
| D3 | The baseline is established once at Phase 4 wiring and recorded in the manifest enforcer entry as `baseline: { path, establishCmd }`; the gate invocation runs in no-new-violations mode; shrinking the baseline (paying debt down) is manual, never automatic | Quarantine-then-ratchet is the mainstream pattern (Clean-as-You-Code / ratchet files); auto-shrink would make the gate nondeterministic across runs |
| D4 | Rules provenance: hosts typically have no written duplication/cycle rule, so `enforce.md` Phase 5's gap-hunt gains architecture-smell gaps as an explicit class to PROPOSE (alongside fail-silent reference-resolution layers); only a user-approved clause classifies into the new categories | Respects the standing propose-never-auto-author rule; an unapproved gap stays recorded, not filled |
| D5 | New test `tests/enforce/taxonomy.test.js` pins the four-home enum sync (byte-identical member list) plus the ratchet doctrine prose | The 4-way sync is unpinned today (verified by grep) — this spec would otherwise widen an existing silent-drift surface |
| D6 | `spec/doctrine/scaffold-ledger.md` gains a row for the ratchet mechanism: promote when any host's ratchet check blocks a real new violation (evidence: feedback brief or run ledger); retire if two consecutive releases show only baseline noise and zero catches | Every new gate/mechanism needs a ledger row with a promote/retire condition (repo convention) |
| D7 | `spec/.claude-plugin/plugin.json` bumps to 6.52.0 (orchestrator note 2026-08-11: spec originally targeted 6.51.0, already taken at HEAD by spec 02 — next-free-version rule per pipeline rules § Gotchas version-race entry) with a description delta; `spec/doctrine/claims-baseline.json` regenerates via `node spec/scripts/claims-lint.js --update-baseline` in the same change | Doctrine line counts change → the claims ratchet requires a baseline hunk in the same diff (Review Checks); behavior change → semver bump. Note: the claims corpus is `spec/commands`, `spec/doctrine`, `spec/agents` only — `spec/templates/grounding-contract.md` is outside it, so the contract edit needs no baseline hunk (don't chase a phantom) |
| D8 | New blocking-consequence claims in the added prose carry `<!-- enforcedBy: tests/enforce/taxonomy.test.js -->` where that test pins them, `<!-- unenforced: host-runtime judgment -->` otherwise | Claims-registry grammar (shared.md § Doctrine Authoring) applies to every new hard/STOP/NEVER claim |
| D9 | This spec is `brief: n/a` — it hydrates no roadmap brief; the companion layers (review advisory smell lens; hotspot audit + disposition ledger) are captured as roadmap briefs 04 and 05, written by the planning session, out of this spec's scope | The 2026-08-10 research session produced the design directly; the deliberate `n/a` records that as a decision, not a forgotten stamp |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | Extend the reserved taxonomy enum with `duplication \| cycle`; one sentence declaring them ratchet categories (baseline + no-new-violations); extend the manifest-entry description (currently lines 101–103) so the entry shape names the ratchet baseline. Canonical home; sole contract-file edit in this spec (one row, all hunks together) |
| spec/commands/enforce.md | MODIFY | doctrine | Operational taxonomy copy += the two categories; ratchet-mode doctrine per D2–D4 (verify capability requirement, Phase 4 ratchet-baseline establishment + manifest `baseline` field, Phase 5 architecture-smell gap class); Phase 6 schema example gains the `baseline` field; Phase 7 report shape gains a ratchet slot line (baseline path + quarantined-violation count; drop-when-empty like the other slots); the genesis design-rules fold (lines 42–45) gains one sentence: NO design category folds into the ratchet categories — they arrive only via written host rules or Phase 5 propose; the write-mode carve-out prose (Phase 4 + the Rules bullet) gains a disambiguating clause "distinct from the ratchet baseline snapshot" — the new concept is always called **ratchet baseline** in prose |
| spec/commands/doctor.md | MODIFY | doctrine | Sync the single enum restatement (currently near line 114) to the extended list; check 10's wiring-resolves leg gains a ratchet case (a ratchet entry whose `baseline.path` does not exist on disk fails the check); the drift remedy line (near line 334) names the stale/missing-ratchet-baseline failure shape |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | Ratchet-enforcer row with the D6 promote/retire condition |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | Regenerate via `claims-lint.js --update-baseline` after all doctrine edits land (last doctrine step) |
| spec/workflows/src/wf-enforce.body.js | MODIFY | workflows | `CATEGORIES` += `'duplication', 'cycle'`; extract the inline cell-validation filter (currently an arrow callback around lines 113–122) into a named top-level **pure** `function validateCells(cells, categories, log)` returning `{ accepted, skipped }` with behavior unchanged — dependencies injected, no closure over `CATEGORIES`/sandbox `log` (tests/helpers.js `extractFn` only matches named top-level functions, and `evalFns` evaluates them without module scope); call site becomes `validateCells(args.cells, CATEGORIES, log)`; research-prompt gains one conditional line for ratchet categories: candidates MUST support a baseline/known-violations mode and citations must show it |
| tests/enforce/taxonomy.test.js | CREATE | tests | AC-20260810-06-1 … AC-20260810-06-5 (pipeline-authored tests live under `tests/<scope>/` so scoped gate runs stay pin-free — Test Rules; gate resolves `{testDirs}` to the glob `'tests/enforce/*.test.js'`) |
| spec/.claude-plugin/plugin.json | MODIFY | other | 6.51.0 → 6.52.0 (see D7 orchestrator note); append the ratchet-enforcer delta to `description` |

Orchestrator integration duty (not a row): `npm run build:workflows` after the body edit;
`node spec/scripts/build-workflows.js --check` before declaring the batch done; commit source +
generated `wf-enforce.js` together.

## Contracts

The reserved taxonomy enum, after this spec (must appear byte-identically in all four homes):

```
module-boundary | naming | forbidden-symbol | structural-pattern | datetime |
schema-validation | format | duplication | cycle
```

Manifest enforcer entry (enforce.md Phase 6 schema) gains one optional field, present exactly
when the cell's category is a ratchet category and an enforcer (not a fallback) was wired:

```jsonc
"enforcer": {
  // ...existing fields...
  "baseline": {                    // ratchet categories only
    "path": "<baseline file as discovered/configured — tool-native location, recorded not invented>",
    "establishCmd": "<the command run once at wiring to snapshot current violations>"
  }
}
```

## Behavior

- **Phase 2 (research)**: cells with a ratchet category carry the extra candidate requirement —
  the discovered tool must support a baseline / known-violations / ignore-file mode, and the
  citations must show that capability, not just the check itself.
- **Phase 3 (verify)**: for ratchet categories, verify = install → run → establish the baseline
  via the tool's documented mode → re-run → the re-run must exit green. A candidate that cannot
  go green over its own baseline fails verify; fallbacks per the existing order (sweep →
  review-check), never a silent drop.
- **Phase 4 (wire)**: the gate invocation is the no-new-violations form; the baseline file is
  committed with the enforcement config; `baseline.{path,establishCmd}` recorded in the manifest.
  This is snapshot-only — distinct from the existing `baselineRun` write-mode carve-out, which
  edits source; the ratchet baseline never touches application source.
- **Phase 5 (propose)**: when a host has no written duplication/cycle rule, propose one
  (grounded in what the codebase already does) via `AskUserQuestion`; only on approval does the
  clause enter Phase 1 classification for these categories.

## Acceptance Criteria

- **AC-20260810-06-1**: WHEN the plugin test suite runs THE SYSTEM SHALL assert the reserved
  category enum is identical across `spec/templates/grounding-contract.md`,
  `spec/commands/enforce.md`, `spec/workflows/src/wf-enforce.body.js` (`CATEGORIES`), and
  `spec/commands/doctor.md`, and that the member list is exactly `module-boundary, naming,
  forbidden-symbol, structural-pattern, datetime, schema-validation, format, duplication,
  cycle` (order-insensitive across prose homes; the workflow array is the reference list) →
  tests/enforce/taxonomy.test.js
- **AC-20260810-06-2**: WHEN `wf-enforce.body.js`'s `validateCells` (the pure named top-level
  function this spec extracts from the inline filter; extracted in tests via
  `extractFn`/`evalFns` source-shape mode) is called as `validateCells([{ id:
  "js:duplication", stack: "js", category: "duplication" }], <the CATEGORIES list parsed from
  the same source>, () => {})` (and likewise `"cycle"`) THE SYSTEM SHALL accept the cell —
  it lands in `accepted`, not in `skipped` with reason `unknown-category` →
  tests/enforce/taxonomy.test.js
- **AC-20260810-06-3**: WHEN `spec/commands/enforce.md` is read THE SYSTEM SHALL contain the
  ratchet doctrine: a verify-phase requirement that ratchet-category candidates support a
  baseline/known-violations mode, a Phase 4 rule that the baseline is established once and
  recorded as `baseline` with `path` and `establishCmd` in the manifest entry, and gate wiring
  in no-new-violations form, plus the disambiguation clause separating the ratchet baseline
  (snapshot) from the pre-existing `baselineRun` write-mode carve-out (regex pins on the
  load-bearing phrases, not full sentences) → tests/enforce/taxonomy.test.js
- **AC-20260810-06-4**: WHEN `spec/commands/enforce.md` Phase 5 is read THE SYSTEM SHALL name
  architecture-smell gaps (duplication/cycle rules absent from the host's rule surface) as an
  explicit gap class to propose — never auto-author → tests/enforce/taxonomy.test.js
- **AC-20260810-06-5**: WHEN `validateCells` processes a cell with any pre-existing category
  (literal: `{ id: "js:module-boundary", stack: "js", category: "module-boundary" }`)
  THE SYSTEM SHALL CONTINUE TO accept it as a known category (no existing test covers this
  behavior — the pin lands in the new test file; the *behavior* predates this spec even
  though the named function is extracted by it, so the pin is green immediately after the
  mechanical extraction) → tests/enforce/taxonomy.test.js

## Assumptions (escalation triggers)

- A1: `doctor.md` restates the enum at exactly one location (verified: grep hit at line 114
  only) — **if false:** sync every occurrence and extend the AC-1 pin to all of them.
- A2: Editing `grounding-contract.md` flips `spec-paths contract-hash`, so every host's
  `/spec:doctor` flags stale grounding until re-init/re-enforce — this is the intended
  propagation path for a genuine contract change, per the host-escalation trigger in Build
  rules; the build escalates (as required) and the orchestrator proceeds, it is not a defect —
  **if the hash does NOT change:** the contract edit didn't land; stop and check the file.
- A3: `claims-lint.js --update-baseline` is the sanctioned baseline regeneration and reflects
  all four doctrine-file edits in one run — **if false:** run `node spec/scripts/claims-lint.js
  --check` and follow its remedy output.
- A4: No existing test pins `CATEGORIES` or the enum prose (verified by repo-wide grep for
  `forbidden-symbol` outside source homes) — **if false:** fold the sync pin into the existing
  test instead of creating a parallel one.
- A5: `tests/enforce-hash-stamp.test.js` slices `enforce.md` ±1500 chars around the first
  `rulesEnforcementHash` occurrence and is a LIVE RED intake pin today (HEARWELL-20260721-02,
  open row in `spec/INTAKE.md`); this spec's Phase 6 schema insert sits above that anchor and
  shifts the window — the pin is expected to stay red and MUST NOT be "fixed" or touched by
  this spec's workers; it turns green only via its own intake item — **if the insert
  accidentally turns it green or changes its failure text:** report at the Final gate, do not
  adjust the test.
- A6: Tools with baseline/known-violations modes exist for both categories on mainstream
  stacks (research-cited, 2026-08-10 session) — but no tool is named here by design, and the
  real gate is per-host two-stage verify at enforce time; **if a host finds no verifiable
  candidate:** the existing fallback order (sweep → review-check) applies — the category
  degrades gracefully, it never blocks this spec.

## Rationale

The 2026-08-10 research session (four-agent fan-out over 2025–26 practice) established:
ratchet/no-new-violations baselines are the mainstream debt gate (SonarQube Clean-as-You-Code,
Notion's lint ratchet, Betterer); duplication is the #1 AI-signature smell (GitClear: copy-paste
~5× refactoring, 8× duplicated blocks) with dependency cycles/boundary erosion next; and
periodic-only audits demonstrably fail at AI velocity (CMU compounding data; Devin's daily
sweep) — so the continuous gate layer must carry the load. That maps exactly onto
`/spec:enforce`, which already owns deterministic rule mechanization; this spec is therefore an
extension of an existing organ, not a new one. Complexity thresholds were rejected as a ratchet
category (user ruling this session): noisiest class, and the planned audit layer's
churn×complexity targeting covers it better. `shared.md` § Rule Enforcement deliberately does
not restate the enum, so it needs no edit — resisting the additive reflex. The ratchet
`baseline` (snapshot) is kept structurally distinct from the existing `baselineRun` (write-mode
source edit) because they answer different questions — "what do we tolerate" vs "make the tree
conform" — and conflating them would erode the never-edit-application-source rule. No
micro-spike ran: no claim in this spec is adjudicated by a third-party dependency at plan time —
tool discovery/verification is deliberately deferred to per-host enforce runs, and A6 records
the graceful degradation if discovery comes up empty.

Adversarial-check adjudication (two refuters + one blind-spot sweep, all findings fixed in
place, none rejected): (1) both refuters independently caught that the ACs' `extractFn` test
mechanism could not reach the inline cell-validation callback — fixed by planning a pure
named `validateCells(cells, categories, log)` extraction (dependencies injected, since the
test sandbox evaluates without module scope); (2) doctor's wiring-resolves check and drift
remedy had no case for a missing ratchet-baseline file — added to the doctor.md row; (3) the
canonical contract's manifest-entry description and enforce.md's closed Phase 7 report shape
would have hidden the ratchet baseline — both rows extended; (4) the genesis design-enum fold
is an exhaustive map, so an explicit "no design category folds into ratchet categories"
sentence prevents a worker inventing `structure → cycle`; (5) the Phase 6 schema insert
shifts the grep window of a live RED intake pin (`tests/enforce-hash-stamp.test.js`,
HEARWELL-20260721-02) — A5 now fences it from well-meaning workers; (6) the new test moved
under `tests/enforce/` per the Test Rules scoped-directory convention; (7) AC-3 now also pins
the ratchet-baseline vs `baselineRun` disambiguation clause the Rationale calls load-bearing.
Verified non-findings worth keeping: no `schemaVersion` bump is required for an additive
optional manifest field, and `wf-enforce.body.js` has no other CATEGORIES-adjacent enum to
update.

## Canonical Delta

None — no `docs/canonical/` doc covers the enforce area; the taxonomy's canonical home is the
grounding contract itself, which this spec edits directly.
