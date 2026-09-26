---
date: 2026-09-26
status: hardened
tier: critical
area: design
breaking: true
depends_on: [specs/20260926/01-the-approval-file-is-not-a-gate.md]
depended_on_by: [specs/20260926/03-gates-per-workspace.md]
brief: 27
open_markers: 0
---

# The design contract is code

## Goal

A host with a UI stack carries its design contract as code, and the plugin verifies presence
mechanically: a token file, a kit directory of intent-named composite components, and one
auto-loaded rule file holding the intent-to-pattern table and the naming-convention table (one
section per layer: code, schema, routes, wire). `/spec:init` records where they are and seeds
the rule file from a template when absent; `/spec:doctor` runs one script that reports every
missing piece and every pattern row without its composite. `/spec:enforce` gains the
`kit-discipline` category those rules feed. No doctrine prose enforces any of it. Done means:
the check script exists with executed tests, the grounding contract defines the `design` block
in its new shape, this repo's own config is re-stamped, and the taxonomy carries the new
category in all three of its homes.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The grounding contract's `design` block becomes `{ "kit": "<dir>", "tokens": "<file>", "rules": "<file>", "app"?: "<dir>" }` — present = the host has a UI stack; `kit`, `tokens`, `rules` are repo-relative and required when the block is present; `app` stays optional (the mock app dir `/spec:mocks` and genesis write, until briefs 29/30). This is the spec's single contract edit; it also adds `kit-discipline` to the reserved category taxonomy in the same edit. (AC-20260926-02-7, AC-20260926-02-8) | ADR-0030 (b). One contract edit per spec (pipeline rules § Planning). |
| D2 | New script `spec/scripts/design-contract-check.js` (`spec-paths design-contract-check`): `--root <dir> [--json]`. Reads `.claude/spec.config.json`; no `design` block → exit 0, `{ok:true, skipped:"no-design-block"}`. Otherwise findings, each `{kind, path?, layer?, intent?, composite?, remedy}` with `kind` ∈ `tokens-missing | kit-missing | rules-missing | table-missing | table-empty | naming-section-missing | composite-missing`; any finding → exit 1; usage error → exit 2. Human render one line per finding; `--json` `{ok, findings, skipped?}`. (AC-20260926-02-1 … AC-20260926-02-6, AC-20260926-02-10) | The doctor is a prose checklist; a presence check that parses a table and walks a directory is a script with an exit code (§ Incident Policy). |
| D3 | Table grammar the check parses (Contracts): the rules file carries `## Intent to pattern` with columns `Intent | Pattern | Composite` and `## Naming` with `### code`, `### schema`, `### routes`, `### wire` subsections, each a `Kind | Convention | Example` table. A composite is present when a file under `design.kit` has a basename (extension stripped) equal to the composite name in PascalCase or its kebab-case form, or a file under `design.kit` contains `export (default )?(function|const|class) <Composite>\b`. (AC-20260926-02-1, AC-20260926-02-2, AC-20260926-02-3) | Brief 27 open question 2, default taken: parse the markdown, no sidecar. Two spellings admit both file-per-component and barrel layouts. |
| D4 | New template `spec/templates/design-rules.md` (`spec-paths design-rules-template`): `paths:` frontmatter placeholder, the two headings, the four naming subsections, empty tables with header rows only, one HTML comment per table stating who fills it (genesis's design stage; a brownfield host by hand). (AC-20260926-02-10) | Init needs something to seed; the empty tables surface as `table-empty` findings so the gap is visible, never silent. |
| D5 | `/spec:init` Phase 1's component-catalog bullet becomes the **UI stack** bullet: a UI framework or component library in the dependencies decides the `design` block. Phase 6 is rewritten: locate the token file, the kit directory (the directory holding intent-named composites — an existing `components/base` or barrel counts) and the rules file; when no rules file exists, copy the template to `.claude/rules/design.md` with `paths:` globs over the kit and screen directories and record it as a `manifestExtras` row; write `design: {kit, tokens, rules}` into `profile.config`; run `design-contract-check --root .` and print its findings as Phase 7 warns. The adopt/craft `AskUserQuestion` and the living-showcase and doctrine-doc deliverables are deleted; a greenfield host with no UI yet is told to run `/spec:genesis`. The genesis-precedence branches stay (they read `status.design`). [no-ac: command prose; the check script and its tests are the executable residue] | ADR-0030 (b) and (g): genesis authors the tables; init records and verifies. Init never invents components or tokens. |
| D6 | `/spec:doctor` check 8 is rewritten to `node "$(spec-paths design-contract-check)" --root . --json` — advisory (⚠️) per finding, each with the script's remedy; check 1 drops the legacy `storybook*`-to-`design` migration note; check 6 drops `design.command` / `design.screenshot` (keys the contract no longer knows). [no-ac: prose; the script is the oracle and `citations-check` pins the section names] | The old check 8 read `design.doctrine`, a key the contract retired two specs ago. |
| D7 | `kit-discipline` joins the taxonomy in all three homes (contract, enforce.md, wf-enforce.js `CATEGORIES`): raw colours, arbitrary values, restyles of kit components, primitive imports outside the kit directory, and a missing state story per declared state. Not a ratchet category. The genesis design enum folds `color | typography | density` into `kit-discipline` (was forbidden-symbol/structural-pattern); the rest of the fold is unchanged. `/spec:enforce` Phase 1 adds one `kit-discipline` cell per stack whose host has a `design` block, with `ruleRefs = [design.rules]`. (AC-20260926-02-8) | ADR-0030 (b) "enforce gains a category". One cell, one enforcer per stack; the enforcer bundles several rules exactly as a lint config does. |
| D8 | `spec/workflows/wf-enforce.js` is edited under this spec's name (frozen script rule): `CATEGORIES` gains `'kit-discipline'`; nothing else changes. The comment citing `tests/enforce/taxonomy.test.js` becomes true again because that file is recreated. (AC-20260926-02-8) | Pipeline rules § Worker Rules: frozen scripts are edited only under a spec that names them. |
| D9 | This repo's `.claude/spec.config.json` `contractHash` is re-stamped to `spec-paths contract-hash`'s new value in the same build; `.claude/spec-manifest.json` is untouched. (AC-20260926-02-9) | The live contract-stamp pin (AC-20260912-15-8) reddens otherwise. Other hosts see a grounding-drift warning until their next `/spec:doctor`. |
| D10 | Spec plugin bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; `spec-paths` gains the keys `design-contract-check` and `design-rules-template`; `spec/entrypoints.json` gains a row for the script (entry points: `spec/commands/doctor.md`, `spec/commands/init.md`). (AC-20260926-02-11) [no-ac: bump — `plugin-bump.js --check` is the oracle] | New-surface checklist (pipeline rules § Planning). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 — `design` block redefined; taxonomy line gains `kit-discipline`; § Genesis handoff fold sentence updated |
| spec/commands/init.md | MODIFY | doctrine | D5 — Phase 1 UI-stack bullet; Phase 6 rewritten (locate, seed, record, check); deliverables list item 7 reworded; Phase 7 warns from the check |
| spec/commands/doctor.md | MODIFY | doctrine | D6 — checks 1, 6, 8 |
| spec/commands/enforce.md | MODIFY | doctrine | D7 — taxonomy list, design-enum fold, Phase 1 kit-discipline cell |
| spec/workflows/wf-enforce.js | MODIFY | doctrine | D8 — `CATEGORIES` gains `kit-discipline` (frozen script, named here) |
| spec/templates/design-rules.md | CREATE | doctrine | D4 — the seed rule file |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 — bump command |
| spec/scripts/design-contract-check.js | CREATE | scripts | D2, D3 — header: usage, owner `specs/20260926/02 D2`, does NOT author tables or components, `Exit codes: 0 clean/skipped · 1 findings · 2 usage` |
| spec/bin/spec-paths | MODIFY | scripts | D10 — two keys |
| spec/entrypoints.json | MODIFY | other | D10 — one row |
| .claude/spec.config.json | MODIFY | other | D9 — `contractHash` re-stamp |
| tests/doctor/design-contract-check.test.js | CREATE | tests | AC-20260926-02-1, AC-20260926-02-2, AC-20260926-02-3, AC-20260926-02-4, AC-20260926-02-5, AC-20260926-02-6, AC-20260926-02-10 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20260926-02-7 (rewrites the AC-20260914-02-1 test's `design` regex), AC-20260926-02-9 (reuses the hash test) |
| tests/enforce/taxonomy.test.js | CREATE | tests | AC-20260926-02-8 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260926-02-11 |

## Contracts

`.claude/spec.config.json` `design` block (D1):

```jsonc
"design": {
  "kit": "src/components/kit",      // required: directory of intent-named composites
  "tokens": "src/styles/tokens.css", // required: the token file (a Tailwind 4 @theme block, or the stack's equivalent)
  "rules": ".claude/rules/design.md",// required: the auto-loaded rule file holding both tables
  "app": "app"                       // optional: the mock app dir (/spec:mocks + genesis, until briefs 29/30)
}
```

Rules file shape (D3) — `spec/templates/design-rules.md` is this with empty tables:

```markdown
---
paths:
  - "src/components/**"
  - "src/screens/**"
---
# Design rules

## Intent to pattern

| Intent | Pattern | Composite |
|--------|---------|-----------|
| edit one record | side sheet, save + cancel | RecordEditSheet |
| confirm destructive | modal, typed confirmation | DestructiveConfirmDialog |

## Naming

### code
| Kind | Convention | Example |
|------|------------|---------|
| component | PascalCase noun | RecordEditSheet |

### schema
| Kind | Convention | Example |
|------|------------|---------|
| table | snake_case plural | salon_clients |

### routes
| Kind | Convention | Example |
|------|------------|---------|
| path segment | kebab-case plural | /salon-clients/:id |

### wire
| Kind | Convention | Example |
|------|------------|---------|
| JSON key | camelCase | createdAt |
```

`design-contract-check.js --json` (D2):

```jsonc
{ "ok": false,
  "findings": [
    { "kind": "composite-missing", "intent": "edit one record", "composite": "RecordEditSheet",
      "path": "src/components/kit", "remedy": "add RecordEditSheet under src/components/kit or fix the Composite cell" },
    { "kind": "naming-section-missing", "layer": "schema", "path": ".claude/rules/design.md",
      "remedy": "add a ### schema table under ## Naming" },
    { "kind": "table-empty", "path": ".claude/rules/design.md", "layer": "wire",
      "remedy": "fill the ### wire table (genesis design stage, or by hand)" }
  ] }
{ "ok": true, "findings": [], "skipped": "no-design-block" }
```

Taxonomy after D7 (identical in the three homes):

```
module-boundary | naming | forbidden-symbol | structural-pattern | datetime | schema-validation |
format | duplication | cycle | kit-discipline
```

## Behavior

`/spec:init` on a brownfield UI host: Phase 1 finds the UI stack; Phase 6 locates the three
files, seeds `.claude/rules/design.md` from the template when no rules file exists, writes the
`design` block, and runs the check — the report's warns list the empty tables and missing
composites; nothing blocks. A genesis-seeded host arrives with the tables filled (brief 30) and
the check is clean. A host with no UI stack writes no `design` block and the check reports
`skipped`.

`/spec:doctor` check 8: one script run, findings as ⚠️ stale lines carrying the remedy; the
closing recommendation names the rules file for table gaps and `/spec:enforce` for nothing (the
check never re-derives an enforcer).

`/spec:enforce` on a host with a `design` block: the classify phase emits one
`<stack>:kit-discipline` cell whose `ruleRefs` is the rules file; discovery, verify and wiring
run as for any category. Restyle is blocked once the host has folded its overrides into
variants — until then the cell records `fallback: "review-check"` for that rule, which the
manifest already allows.

## Acceptance Criteria

- **AC-20260926-02-1**: WHEN `design-contract-check.js --root <host> --json` runs over a synthetic host whose config carries `"design": {"kit":"src/kit","tokens":"src/tokens.css","rules":".claude/rules/design.md"}`, all three paths exist, the rules file holds both tables with rows `edit one record | side sheet | RecordEditSheet` and `confirm destructive | modal | DestructiveConfirmDialog` plus one row in each of the four naming subsections, and `src/kit/record-edit-sheet.tsx` and `src/kit/index.ts` (containing `export function DestructiveConfirmDialog`) exist THE SYSTEM SHALL exit 0 with stdout parsing to `{ok:true, findings:[]}` → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-2**: WHEN the same host lacks any file matching `DestructiveConfirmDialog` (basename `DestructiveConfirmDialog.*` or `destructive-confirm-dialog.*`, or an `export … DestructiveConfirmDialog` line under `src/kit`) THE SYSTEM SHALL exit 1 with exactly one finding `{kind:"composite-missing", intent:"confirm destructive", composite:"DestructiveConfirmDialog", path:"src/kit"}` whose `remedy` names `DestructiveConfirmDialog` and `src/kit` → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-3**: WHEN the rules file has `## Naming` with `### code`, `### routes`, `### wire` but no `### schema` THE SYSTEM SHALL exit 1 with a finding `{kind:"naming-section-missing", layer:"schema", path:".claude/rules/design.md"}` and no other `naming-section-missing` finding → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-4**: WHEN the host config has no `design` key THE SYSTEM SHALL exit 0 with `{ok:true, findings:[], skipped:"no-design-block"}` and print `skipped: no design block` in the human render → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-5**: WHEN `design.tokens` names `src/tokens.css` and that file does not exist, and `design.kit` names `src/kit` and that directory does not exist THE SYSTEM SHALL exit 1 with findings `{kind:"tokens-missing", path:"src/tokens.css"}` and `{kind:"kit-missing", path:"src/kit"}` (and, because the kit is missing, no `composite-missing` findings) → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-6**: WHEN the script runs with no `--root` THE SYSTEM SHALL exit 2 and print a usage line on stderr containing `--root <dir>` and `[--json]` → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-7**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL describe `design` with the sub-keys `kit`, `tokens`, `rules` (required) and `app` (optional) — matching `/`design`[\s\S]{0,400}"kit"[\s\S]{0,400}"tokens"[\s\S]{0,400}"rules"/` — and contain none of `storyFormat`, `rulesManifest`, `atlasRoutes`, `copyCatalogs`, `## Render gate`, `design.doctrine`, `design.command`, `design.screenshot` → rewrites tests/consistency/contract-stamp.test.js :: AC-20260914-02-1
- **AC-20260926-02-8**: WHEN the `CATEGORIES` array is extracted from `spec/workflows/wf-enforce.js` (via `tests/helpers.js` `extractFn`/`evalFns` or a literal parse) THE SYSTEM SHALL yield exactly the ten names ending in `kit-discipline`, and the same ten names in the same order SHALL appear as the taxonomy list in `spec/templates/grounding-contract.md` § Rule enforcement and in `spec/commands/enforce.md` § The category taxonomy; `validateCells([{id:"typescript:kit-discipline", stack:"typescript", category:"kit-discipline", ruleRefs:[".claude/rules/design.md"]}], CATEGORIES, log)` SHALL return it accepted with `skipped: []` → writes tests/enforce/taxonomy.test.js
- **AC-20260926-02-9**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL CONTINUE TO carry a `contractHash` equal to the first 12 characters of the SHA-256 of `spec/templates/grounding-contract.md` as `spec-paths contract-hash` prints it → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20260926-02-10**: WHEN a host is seeded by copying `spec/templates/design-rules.md` to `.claude/rules/design.md` unchanged, with `design.kit` and `design.tokens` pointing at an existing empty directory and an existing empty file THE SYSTEM SHALL exit 1 with findings whose `kind` values are all `table-empty` — one for the intent table and one per naming layer `code`, `schema`, `routes`, `wire` (five findings) — and no `table-missing` or `naming-section-missing` finding → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-02-11**: WHEN `spec-paths design-contract-check` and `spec-paths design-rules-template` run THE SYSTEM SHALL print `spec/scripts/design-contract-check.js` and `spec/templates/design-rules.md` respectively, both existing files → rewrites tests/spec-paths.test.js :: every documented key resolves to an existing path

## Assumptions (escalation triggers)

- A1: `design-contract-check.js` is not matched by node's default test discovery. **Executed at lock:** a scratch tree with `spec/scripts/design-contract-check.js` (and `workspace-scan.js`) → `node --test` printed `ℹ tests 0`, status 0. — **if false:** n/a (executed).
- A2: `tests/helpers.js` exports `extractFn` and `evalFns` that can lift `validateCells` and the `CATEGORIES` literal out of `wf-enforce.js` (verified at lock: `module.exports = { …, extractFn, evalFns, … }`; `validateCells` is a named top-level function written for exactly this). — **if false:** parse `CATEGORIES` with a regex over the source and call `validateCells` through `evalFns` only; never `require` the workflow.
- A3: The only test pinning the contract's `design` block shape is `contract-stamp.test.js`'s AC-20260914-02-1 test (regex ``/`design`\s*\n?\(`\{ "app": "<dir/``); the retired-key bans in that test do not name `kit`, `tokens`, `rules`. — **if false:** the additional pin's file enters the File Plan as a rewrite row.
- A4: No other consumer of `config.design` remains in the per-feature pipeline after spec 01 (build driver reader deleted; `lib/invariants.js` collects command strings from any block and tolerates the new keys). — **if false:** the consumer is reworded to the new keys in this build and recorded as a deviation.
- A5: `enforce.md`'s design-enum fold is prose only (no script folds `targetCategory` values), so changing the fold target needs no script edit. — **if false:** the folding script enters the File Plan.
- A6: A markdown table row is parsed as `|`-separated cells with surrounding whitespace trimmed; the header row and the `|---|` separator are skipped; a table with only those two rows is `table-empty`. Composite names are matched case-sensitively in PascalCase and by the kebab-case transform `RecordEditSheet → record-edit-sheet`. — **if false (a host writes composites in another case):** the host fixes the cell; the check is never loosened.

## Rationale

ADR-0030 (b) says the doctor verifies presence and no prose enforces the contract. The
grounding contract is where a host's config keys are defined, so the `design` block is
redefined there — additively over `app`, which the mocks driver and genesis still write. Kit,
tokens and rules are paths, never tool names, so the check is stack-agnostic: a Flutter host
points `tokens` at its theme file and `kit` at its widgets directory.

The check parses markdown rather than requiring a machine-readable sidecar (brief default,
taken): the rule file is what the model reads at every session start, so it is the one place
the tables can be true; a sidecar would be a second artifact kept in agreement by hand, the
exact failure ADR-0030 retires.

Init's adopt/craft flow and the living-showcase deliverable are removed rather than
rewritten: genesis now owns design authorship (ADR-0030 (g), brief 30), and a brownfield host
either has the pieces or gets the seeded rule file plus visible findings. Init never authors a
component.

`kit-discipline` is one category, not five: enforce's unit is one enforcer per (stack ×
category) cell, and the rules it bundles are what a single lint config carries. The state-story
rule rides in the same cell because its checker reads the same kit directory. Folding
`color | typography | density` into it keeps genesis's design rules on the path that now has a
named home.

Critical tier: the grounding contract is hash-stamped into every host (pipeline rules § Risk
Tiers). Every AC carries a literal.

`SHALL CONTINUE TO` pins: AC-9 only (this repo's own contract stamp). The check script's tests
expire at close as usual; the taxonomy identity test is a new pin by construction (it reads
three files) and stays.

## Canonical Delta

`docs/canonical/bootstrap.md` gains under § Invariants: "A host with a UI stack declares
`design: {kit, tokens, rules}`; init seeds the rules file from the plugin template when absent
and never authors components or tokens; `design-contract-check.js` is the presence oracle and
doctor check 8 runs it." `docs/canonical/design.md` gains a section "The design contract is
code": the three paths, the two tables and their layer sections, the composite-present rule,
and the `kit-discipline` category as the enforce home for the rules the tables imply.
