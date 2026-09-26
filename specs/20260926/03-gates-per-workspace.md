---
date: 2026-09-26
status: hardened
tier: critical
area: enforce
breaking: false
depends_on: [specs/20260926/02-the-design-contract-is-code.md]
depended_on_by: []
brief: 27
open_markers: 0
---

# Gates, per workspace

## Goal

`/spec:enforce` discovers and wires enforcers once per workspace, not once per repo: a Python
backend and a TypeScript frontend in one tree each get their own checker set, and a naming
gate is discovered per layer (code, schema, routes, wire) from the host's naming table. A
deterministic script finds the workspaces; the enforce workflow's cell carries the workspace
root and, for naming, the layer; the enforcement manifest records both. Done means: the
workspace scanner exists with executed tests, the workflow accepts and refuses cells by the new
grammar, the contract describes entries per (workspace × stack × category), and the doctor's
enforcement check resolves each entry's workspace.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/workspace-scan.js` (`spec-paths workspace-scan`): `--root <dir> [--json] [--depth N]` (default depth 4). Walks the tree skipping `node_modules`, `.git`, `vendor`, `dist`, `build`, `out`, `.venv`, `venv`, `target`, `.next`, `coverage`, `.claude`; every directory holding a package manifest is a workspace: `package.json` (stack `typescript` when `tsconfig.json` sits beside it, else `javascript`), `pyproject.toml` | `setup.py` | `requirements.txt` → `python`, `go.mod` → `go`, `Cargo.toml` → `rust`, `pubspec.yaml` → `dart`, `Gemfile` → `ruby`, `composer.json` → `php`, `*.csproj` → `dotnet`, `mix.exs` → `elixir`, `build.gradle` | `build.gradle.kts` | `pom.xml` → `jvm`. Output `[{root, stack, manifest}]` sorted by root, root `.` for the repo root; `--json` prints the array, the human render one line per workspace. Exit 0 always on a readable root (an empty array is a valid result); exit 2 on usage or an unreadable root. (AC-20260926-03-1, AC-20260926-03-2, AC-20260926-03-3, AC-20260926-03-4) | Brief 27 scope 3's plan-time check: discovery assumes one stack per cell and one gate string per repo today; nothing models a workspace. A manifest walk is stack-agnostic and names no tool. |
| D2 | The enforce cell grammar gains `workspace` (repo-relative dir, `.` when omitted) and, for `category: "naming"` only, `layer` ∈ `code | schema | routes | wire`. Cell id: `<workspace>:<stack>:<category>[/<layer>]`, with the `<workspace>:` prefix omitted when the workspace is `.` — so `python:module-boundary` stays a valid id (root workspace) and `api:python:naming/schema` is the nested form. `validateCells` refuses `layer` on a non-naming cell (`reason: "layer-on-non-naming"`) and an unknown layer (`reason: "unknown-layer"`), and defaults a missing `workspace` to `.`. (AC-20260926-03-5, AC-20260926-03-6) | Back-compatible: every existing manifest entry parses as the root workspace. The layer set is the naming table's own section list (spec 02 D3). |
| D3 | `spec/workflows/wf-enforce.js` is edited under this spec's name: the args comment and the `CANDIDATE`-side cell shape carry `workspace` and `layer`; `validateCells` implements D2; `researchPrompt` names the workspace root ("stack=<stack> in workspace <root>") and, for naming cells, the layer and the instruction that the host naming table's matching `###` section is the rule text. (AC-20260926-03-5, AC-20260926-03-6) | Frozen-script rule: named here. The workflow still installs and runs nothing. |
| D4 | The grounding contract § Rule enforcement: one entry per `(workspace × stack × category)` cell; an entry carries `workspace` (repo-relative dir, `.` for the root) and, for naming, `layer`; the id grammar of D2 is stated. This is the spec's single contract edit. (AC-20260926-03-7) | One contract edit per spec; the manifest is provenance for every host. |
| D5 | `/spec:enforce` Phase 1 runs `workspace-scan --root . --json` first; an empty result means one root workspace whose stack is confirmed from the config and manifests as today. Cells are built per workspace. For naming: one cell per workspace per layer that has a non-empty `###` section in the host's naming table (`design.rules` § Naming — present after spec 02; a host without a `design` block gets a single `naming/code` cell from its pipeline rules as today). For `kit-discipline`: one cell per workspace that owns the `design.kit` directory. Phase 3's verify step for a `kit-discipline` candidate requires a red probe: a scratch file carrying one raw palette class and one arbitrary value must make the candidate's run command exit non-zero, else the candidate fails verify. Phase 4 wires each checker to run from its workspace root, chained into the host's one `gateCommand` (the driver's gate string is unchanged in shape). [no-ac: command prose; D1–D3 are the executable residue] | ADR-0030 (c): per workspace, deterministic, wired into the gate. The red probe exists because the spike showed a wired palette lint passing raw colours when the theme never resets the default palette — a verify step that only checks the tool runs would adopt that hole. |
| D6 | `/spec:doctor` check 10 additionally resolves each entry's `workspace` directory (missing → the same "re-run /spec:enforce" remedy) and refuses a `layer` outside the four. [no-ac: prose; the check reads the manifest by hand] | Same check, two more fields. |
| D7 | Spec plugin bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; `spec-paths` gains `workspace-scan`; `spec/entrypoints.json` gains its row (entry point `spec/commands/enforce.md`); this repo's `contractHash` re-stamped. (AC-20260926-03-8) [no-ac: bump — `plugin-bump.js --check` is the oracle] | New-surface checklist. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | D4 — § Rule enforcement entry shape and id grammar |
| spec/commands/enforce.md | MODIFY | doctrine | D5 — Phase 1 workspace scan and per-workspace/per-layer cells; Phase 3 red probe for kit-discipline; Phase 4 run-from-workspace wiring; manifest example gains `workspace` |
| spec/workflows/wf-enforce.js | MODIFY | doctrine | D2, D3 — cell shape, `validateCells`, `researchPrompt` (frozen script, named here) |
| spec/commands/doctor.md | MODIFY | doctrine | D6 — check 10 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 — bump command |
| spec/scripts/workspace-scan.js | CREATE | scripts | D1 — header: usage, owner `specs/20260926/03 D1`, does NOT read config or pick tools, `Exit codes: 0 scanned · 2 usage/unreadable root` |
| spec/bin/spec-paths | MODIFY | scripts | D7 — key |
| spec/entrypoints.json | MODIFY | other | D7 — row |
| .claude/spec.config.json | MODIFY | other | D7 — `contractHash` re-stamp |
| tests/enforce/workspace-scan.test.js | CREATE | tests | AC-20260926-03-1, AC-20260926-03-2, AC-20260926-03-3, AC-20260926-03-4 |
| tests/enforce/cells.test.js | CREATE | tests | AC-20260926-03-5, AC-20260926-03-6, AC-20260926-03-7 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260926-03-8 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | the AC-20260912-15-8 hash test stays green after the re-stamp (no assertion change; row present so the reconcile leg sees the re-run) |

## Contracts

`workspace-scan.js --json` (D1):

```jsonc
[ { "root": ".",   "stack": "typescript", "manifest": "package.json" },
  { "root": "api", "stack": "python",     "manifest": "pyproject.toml" } ]
```

Enforce cell (D2) and manifest entry (D4):

```jsonc
// cell
{ "id": "api:python:naming/schema", "workspace": "api", "stack": "python",
  "category": "naming", "layer": "schema", "ruleRefs": [".claude/rules/design.md"] }
{ "id": "python:module-boundary", "stack": "python", "category": "module-boundary",
  "ruleRefs": [".claude/rules/spec-pipeline.md"] }           // workspace defaults to "."

// manifest entry (unchanged fields elided)
{ "id": "web:typescript:kit-discipline", "workspace": "web", "stack": "typescript",
  "category": "kit-discipline", "ruleRefs": [".claude/rules/design.md"],
  "enforcer": { "tool": "…", "mechanism": "…", "configPath": "web/…", "gateWiring": "cd web && …", … },
  "fallback": "none" }
```

`validateCells` refusals (D2), appended to `skipped`:

```jsonc
{ "id": "api:python:module-boundary/schema", "category": "module-boundary", "reason": "layer-on-non-naming" }
{ "id": "api:python:naming/db",              "category": "naming",          "reason": "unknown-layer" }
```

## Behavior

`/spec:enforce` on a monorepo `web/` (TypeScript, owns the kit) + `api/` (Python): the scan
returns two workspaces; classify yields `web:typescript:*` and `api:python:*` cells, naming
cells per non-empty naming-table section per workspace, one `web:typescript:kit-discipline`
cell; the workflow researches each cell against its own workspace root; verify runs each
candidate from that root and, for kit-discipline, must see the red probe fail; wiring chains
`cd web && …` and `cd api && …` invocations into the single gate string. The manifest records
`workspace` on every entry. A single-package repo behaves exactly as before, with `workspace:
"."` on each entry.

## Acceptance Criteria

- **AC-20260926-03-1**: WHEN `workspace-scan.js --root <tmp> --json` runs over a tree with `package.json` and `tsconfig.json` at the root and `api/pyproject.toml` THE SYSTEM SHALL exit 0 and print exactly `[{"root":".","stack":"typescript","manifest":"package.json"},{"root":"api","stack":"python","manifest":"pyproject.toml"}]` (sorted by root) → writes tests/enforce/workspace-scan.test.js
- **AC-20260926-03-2**: WHEN the tree also holds `node_modules/left-pad/package.json`, `web/dist/package.json` and `.claude/worktrees/x/package.json` THE SYSTEM SHALL list none of those directories as workspaces (the output is identical to AC-1's) → writes tests/enforce/workspace-scan.test.js
- **AC-20260926-03-3**: WHEN the tree holds `package.json` without `tsconfig.json` at the root and `svc/go.mod` THE SYSTEM SHALL print `[{"root":".","stack":"javascript","manifest":"package.json"},{"root":"svc","stack":"go","manifest":"go.mod"}]`; and WHEN a tree holds no manifest at all THE SYSTEM SHALL exit 0 and print `[]` → writes tests/enforce/workspace-scan.test.js
- **AC-20260926-03-4**: WHEN the script runs with no `--root`, or with `--root` naming a path that does not exist THE SYSTEM SHALL exit 2 with a usage line on stderr containing `--root <dir>` and `[--json]` → writes tests/enforce/workspace-scan.test.js
- **AC-20260926-03-5**: WHEN `validateCells` (lifted from `spec/workflows/wf-enforce.js` via `tests/helpers.js` `evalFns`) receives `[{id:"api:python:naming/schema", workspace:"api", stack:"python", category:"naming", layer:"schema", ruleRefs:[]}, {id:"python:module-boundary", stack:"python", category:"module-boundary", ruleRefs:[]}]` THE SYSTEM SHALL accept both, with the second cell's `workspace` defaulted to `"."`, and `skipped` empty → writes tests/enforce/cells.test.js
- **AC-20260926-03-6**: WHEN `validateCells` receives `{id:"api:python:module-boundary/schema", category:"module-boundary", layer:"schema", …}` and `{id:"api:python:naming/db", category:"naming", layer:"db", …}` THE SYSTEM SHALL accept neither and return `skipped` entries with `reason: "layer-on-non-naming"` and `reason: "unknown-layer"` respectively, each carrying the cell's `id` → writes tests/enforce/cells.test.js
- **AC-20260926-03-7**: WHEN `spec/templates/grounding-contract.md` § Rule enforcement is read THE SYSTEM SHALL state entries per `(workspace × stack × category)` (the literal `workspace × stack × category`), name the `workspace` field with `.` as the root value, name the four naming layers `code`, `schema`, `routes`, `wire`, and the id example `api:python:naming/schema` → writes tests/enforce/cells.test.js
- **AC-20260926-03-8**: WHEN `spec-paths workspace-scan` runs THE SYSTEM SHALL print `spec/scripts/workspace-scan.js`, an existing file → rewrites tests/spec-paths.test.js :: every documented key resolves to an existing path

## Assumptions (escalation triggers)

- A1: `workspace-scan.js` is not matched by node's default test discovery. **Executed at lock:** scratch `spec/scripts/workspace-scan.js` → `node --test` printed `ℹ tests 0`, status 0. — **if false:** n/a (executed).
- A2: `validateCells` remains a pure top-level named function in `wf-enforce.js`, liftable by `extractFn`, and the workflow sandbox never `require`s it — the D3 edit keeps that shape. — **if false:** the test parses the source for `CATEGORIES` and evaluates `validateCells` through `evalFns` with an injected `log`; never `require` the workflow.
- A3: The host gate is one string (`gateCommand`) consumed by `lib/gate-resolve.js`, both drivers, `review-legs.js`, `ci-gate-parity.js` and `lib/invariants.js`; per-workspace checkers are chained inside it (`cd <ws> && …`). — **if false (a consumer rejects a `cd` segment):** STOP, ask the user; splitting the gate into per-workspace strings is a contract change this spec does not own.
- A4: `ci-gate-parity.js` splits the gate on placeholders and requires CI to run the segments verbatim; a `cd web && tool` segment is a segment like any other. — **if false:** the host records the parity finding as advisory (check 14 is advisory) and this spec's Rationale is amended at build.
- A5: `comment-narration.js` reads `enforcement.json` expecting a top-level array with `notes` (latent mismatch inventoried at lock; the manifest is `{schemaVersion, entries}` so the scan is a no-op today). Adding `workspace` and `layer` to entries changes nothing it reads. — **if false:** report, never fix here (a pre-existing defect; queued below).

## Rationale

The brief asked to verify at plan time whether discovery assumes one stack per repo. It does,
in three places: the classify prose builds `(stack × category)` cells with a single stack
string, the workflow's cell schema has no root, and the config holds exactly one gate string.
This spec fixes the first two and leaves the third: a per-workspace gate string would be a
second contract change and touches every gate consumer, while a `cd <ws> && …` segment inside
the one string is what a host orchestrator would write by hand anyway.

Naming is per layer because the layers have different oracles (a code linter, a schema
definition, a route table, a wire document) and the naming table (spec 02) has one section per
layer; a cell per section lets each get its own discovered checker with its own citation. The
layer enum is the table's section list, so adding a layer is a spec 02 D3 change first.

The plugin names no tool anywhere in this spec. The brief's candidates (the spike's eslint
rule, typescript-eslint's naming rule, ruff's N rules, Spectral over OpenAPI) are what a host's
enforce run may discover and cite; core § Rule Enforcement forbids the plugin from anchoring
them, and the spike's rule ships to salon-os as host code under that host's own enforce run.
Restyle blocking is host work (fold overrides into variants first), so a host records
`fallback: "review-check"` on that rule until it is ready — the manifest already allows it.

The red probe in verify comes straight from the spike: the host's existing palette lint
passed `bg-red-500` because the theme never reset the default palette. A verify step that
only proves the tool runs would have adopted that lint as the raw-colour enforcer.

Critical tier: the grounding contract edit. Every AC carries a literal. No `SHALL CONTINUE TO`
pin: the scanner and the cell grammar are new surfaces; the contract-stamp hash test that
already outlives every close is the one continuing pin, reused by the sibling spec.

Queued at lock (after this spec): `comment-narration.js`'s enforcement.json reader expects a
shape the manifest never had — a one-line fix with a test, direct lane.

## Canonical Delta

`docs/canonical/scripts.md` gains a row for `workspace-scan.js` (usage, exit codes, what it
never does). A new `docs/canonical/enforce.md` opens with three sections: § Cells (the
(workspace × stack × category) grammar, the naming layer enum, the id forms), § Verify (the
kit-discipline red probe), § Wiring (checkers run from their workspace root inside the one
gate string).
