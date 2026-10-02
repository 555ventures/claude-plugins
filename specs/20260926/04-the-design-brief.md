---
date: 2026-09-26
status: done
build_base: design-retool
tier: critical
area: genesis
breaking: true
depends_on: [specs/20260926/03-gates-per-workspace.md]
depended_on_by: [specs/20260926/05-the-kit-and-the-journey-stories.md]
brief: 30
spiked: 2026-09-26
open_markers: 0
diff_base: 26b5c1e7e13d61c4bdc0232a1651666e972f3489
---

# The design brief

## Goal

Genesis gains a design stage on the product's real stack. This spec lands its first state:
after the zero-day gate is green and before the roadmap, a web host enters `DESIGN_BRIEF`, where
Fable writes `docs/design/brief.md` (users and context, one jobs-to-be-done line per approved
journey, navigation as task plus frequency, the installed catalog read whole, one composite per
intent with its declared states) and fills the two tables brief 27 asks for in the host's
auto-loaded rules file. The driver generates the catalog inventory, prints the step with a
fresh-session and model line, and verifies the brief and the tables mechanically before it
advances. The gray mock app stops being treated as the product: genesis always picks the stack
and scaffolds, and reads the mock app's approval record for the last time at this state's entry.
Done means: a web-app genesis run on a fixture host stops at `DESIGN_BRIEF`, refuses a brief
that is missing a journey's JTBD line or leaves a rules table empty, and accepts a complete one;
a `data-ml` run passes through untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `genesis-driver.js` gains the state `DESIGN_BRIEF`, derived after the zero-day gate is green (`status.architect === 'scaffold-complete'`) and before `ROADMAP`, for a host where `designStageApplies()` holds: `isVisualArchetype(status.archetype)` AND the stack descriptor's `designCatalog === 'storybook'`. Any other host records `status.designStage = { skipped: 'non-visual' \| 'non-storybook', at }` on the first derivation past the gate and continues to `ROADMAP` with no mark. `deriveState` returns `DESIGN_BRIEF` while `!marks.designBriefWritten` (or the brief file or `design-paths.json` has vanished); `handleSkeletonLanded`'s green branch returns `next: 'DESIGN_BRIEF'` when the stage applies, `'ROADMAP'` otherwise. The new mark is `design-brief-written`; the unknown-mark usage list names it. (AC-20260926-04-1, AC-20260926-04-2, AC-20260926-04-3) | ADR-0030 (g): the design stage runs on the product's real stack, so it must follow the scaffold, not the menus. The descriptor already carries `designCatalog`; brief 30 § Out of scope leaves non-web stacks to a later brief, and `storybook` is the one carrier this brief names. |
| D2 | The `DESIGN_BRIEF` step text: `## Step: write the design brief`; `Read only:` the seed, the mock app's `design/approval.json` (journeys — read here for the last time), `.claude/genesis/brief.md` (`## Journeys`), `docs/design/catalog.md`, `.claude/genesis/design-paths.json`, the rules file; `Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage`; the line `Session: start a fresh session for this step — Model: Fable (authors the brief and the tables)`; `Skill: design-brief — load it before the first line`; `catalog: N components · M compositions unavailable` (from D4); the approved journeys listed one per line as `journey: <name> (<beats> beats)`; then `Then:` naming `--mark design-brief-written`. (AC-20260926-04-4) | Brief 30 scope 3: doctrine and the driver print "start a fresh session" at DESIGN's entry; the model line is how a driver that cannot switch models hands the step to the right seat. |
| D3 | New session-authored file `.claude/genesis/design-paths.json` (template `spec/templates/design-paths.json`, `spec-paths design-paths-template`): `{ schemaVersion: 1, kit, tokens, rules, primitives, primitivesAlias, journeys, storybook: { port, buildCommand, staticDir } }` — every path repo-relative, chosen by Fable in the stack's idiom at this step. `--mark design-brief-written` refuses when the file is missing, does not parse, or lacks any of `kit`, `tokens`, `rules`, `primitives`, `primitivesAlias`, `journeys`, `storybook.port` (integer 1024–65535), `storybook.buildCommand`, `storybook.staticDir`. Later marks (spec 05) and HANDOFF read it. (AC-20260926-04-5) | The driver needs the kit, tokens and rules paths before any of them exist on disk; brief 27's `design` block is written at HANDOFF, too late. One file, one writer, read by every later step. |
| D4 | New script `spec/scripts/catalog-inventory.js` (`spec-paths catalog-inventory`): `--root <dir> --out <file> [--check] [--json] [--shadcn <command>]`. When `<root>/components.json` is absent it writes `<out>` with the line `catalog: none (no components.json)` and exits 0 (`{ok:true, catalog:"none"}`). Otherwise it runs `<shadcn> info --json` (default `npx shadcn@latest`, split on spaces, `cwd = root`) and, for every name in `components[]`, fetches `links.components` with `[component]` replaced by the name (`https:`/`http:` via the global `fetch`, 10 s timeout; `file:` read from disk) and copies the `## Composition` section (through the line before the next `## `) under a `### <name>` heading; a fetch failure or a page without that section writes `composition: unavailable` for that name. Exit 0 with the written file; `--json` prints `{ok, catalog:"shadcn", base, components:[{name, composition:true\|false}], unavailable:N}`. `--check` reads the existing `<out>`'s `### ` names and compares them with the live `components[]`: identical → exit 0 `current`; else exit 1 naming `added:`/`removed:`; `<out>` absent → exit 1 `missing`. Usage error → exit 2. (AC-20260926-04-6, AC-20260926-04-7, AC-20260926-04-8) | Brief 30 open question 1, default taken: a generated inventory at DESIGN, refreshed by doctor. Spiked 2026-09-26: shadcn 4.21.0's `info --json` lists `components` and `links.components`; the per-component `.md` page carries `## Composition`. `file:` support is what lets the test suite run without the network. |
| D5 | The driver runs D4 at `DESIGN_BRIEF`'s print when `docs/design/catalog.md` is absent (`runChild`, `cwd = root`, `--out docs/design/catalog.md`), records `status.designStage.catalog = { exit, components, unavailable, at }`, and prints the `catalog:` line from the recorded counts on every later print; a non-zero exit prints `⚠️ catalog inventory failed (exit N) — write ## Catalog by hand from the installed components` and never blocks the mark. `/spec:doctor` gains one advisory check, at the next free ordinal (the ordinal is taken at build time, never a literal in this spec): only when `docs/design/catalog.md` exists, run `node "$(spec-paths catalog-inventory)" --root . --out docs/design/catalog.md --check`; exit 1 → one ⚠️ line naming the added/removed components and the remedy (re-run without `--check`). (AC-20260926-04-9, AC-20260926-04-10) | The inventory is a derivation, so the driver owns running it; the doctor refresh is the "refreshed by doctor when the kit changes" half of the brief's default. |
| D6 | New template `spec/templates/design-brief.md` (`spec-paths design-brief-template`) fixes `docs/design/brief.md`'s grammar: `# Design brief — <product>`, then in this order `## Users and context`, `## Journeys` (one `### <journey>` per approved journey, each carrying a line starting `JTBD: When `), `## Navigation` (table `Task \| Frequency \| Entry`), `## Catalog` (`### Used` and `### Excluded` bullet lists of component names), `## Composites` (table `Composite \| Intent \| States`, States a comma-separated list of story export names), `## Contract` (one line naming the rules file — the tables live there, never copied here). `--mark design-brief-written` refuses, naming the first failure: a missing or out-of-order heading; a seed journey with no `### ` block or whose block has no `JTBD: When ` line; a heading introducing entities, records or data (`/^## (Entities\|Records\|Data model)/i`) anywhere in the file; an empty `## Composites` table; a `Composite` cell absent from the rules file's `## Intent to pattern` `Composite` column or vice versa (the two sets must be equal); a `### Used` name absent from `docs/design/catalog.md`'s `### ` names when that inventory lists any. (AC-20260926-04-11, AC-20260926-04-12, AC-20260926-04-13) | ADR-0030 (g): journeys are locked in the brief before any entity section exists — the driver can check order and absence, never quality. The composite set equality is what ties the brief to brief 27's table without a second copy. |
| D7 | `design-contract-check.js` gains the override flags `--rules <file> --kit <dir> --tokens <file>` (all three together, else exit 2; repo-relative to `--root`), which bypass `.claude/spec.config.json` entirely and run the same findings over the named paths. `--mark design-brief-written` runs it with `design-paths.json`'s three paths and refuses on any `table-missing`, `table-empty` or `naming-section-missing` finding; `kit-missing`, `tokens-missing` and `composite-missing` are tolerated at this mark (the kit lands in spec 05). (AC-20260926-04-14, AC-20260926-04-15) | At genesis time no `design` block exists yet; the tables are the same tables brief 27's check already parses, so the parser is reused through flags, never duplicated in the driver. |
| D8 | On acceptance the mark records `marks.designBriefWritten = true` and `status.designStage = { paths: '.claude/genesis/design-paths.json', brief: 'docs/design/brief.md', catalog: <D5 record>, briefAt: '<ISO>' }`, prints the checkpoint line and the next step (`DESIGN_KIT` once spec 05 lands; until then `ROADMAP`). (AC-20260926-04-11) | `status.designStage` is the one record every later design mark extends; `status.design` keeps its BRIEF meaning (`ratified`/`skipped`) untouched so the state gate hook is unaffected. |
| D9 | The mock app stops being the product. Deleted from the driver: `MOCK_APP_FIXED_DIMS`, `appendDerivedPicksToBrief`, MENUS's auto-pick lines and `status.tournament = { skipped: 'mock-app' }`, the scaffold skip `status.scaffold = { skipped: 'mock-app' }`, and `handleSkeletonLanded`'s `mock-review check --json` branch (with the driver's `require('./lib/mock-cli')`). MENUS on a host with `app/mock.config.ts` routes a tournament archetype to `FINALISTS` like any other; `skeleton-landed` runs the probe and binding-subset checks only. BRIEF's precondition (mocks `APPROVED`, ledger gate open) and its `seed journeys: N · notes open: N` derivation are unchanged. `tests/genesis/genesis-mock-app.test.js` loses the three tests pinning the retired branches; specs/20260914/02's AC-5, AC-6 and AC-13 pointer lines are tagged `[retired: specs/20260926/04-the-design-brief.md]` in the same batch. The two doctrine paragraphs that describe the shortcut are deleted from `spec/doctrine/genesis.md` — "The mock app pre-empts the tournament" (§ Genesis: Tournament of Scaffolds) and "The mock app is the day-zero skeleton" (§ Genesis: Day-Zero Skeleton) — and the live pin that required them (`tests/consistency/genesis-doctrine.test.js :: AC-20260914-02-7`) is rewritten in place to assert their absence while keeping its `design/approval.json`-under-Brief-State and banned-phrase clauses. (AC-20260926-04-16, AC-20260926-04-17, AC-20260926-04-18, AC-20260926-04-22) | ADR-0030 (j) supersedes ADR-0028; JJ confirmed 2026-09-26 that the mock is a throwaway and genesis always scaffolds the real stack. The last read of the wireframe's approval record is `DESIGN_BRIEF`'s step print (D2). |
| D10 | New skill `spec/skills/design-brief/SKILL.md` (frontmatter `name: design-brief`), auto-discovered like `mock-authoring`: the method Fable applies — users and context from confirmed ledger rows and the seed, never invented personas (synthetic users are noise); one JTBD line per journey in the `When …, I want to …, so I can …` form, journeys before any entity; navigation as task plus frequency, never one list-detail pair per entity; the catalog read whole from `docs/design/catalog.md` and split into used and excluded with a reason per exclusion; one composite per intent row with its states declared as story export names; the intent-to-pattern and naming tables written into the rules file in the stack's idiom, one naming section per layer. (AC-20260926-04-19) | Brief 30 scope 1 names the skill; a skill is the plugin's one mechanism for step-scoped authoring rules (mocks precedent). |
| D11 | `spec/doctrine/genesis.md` gains `## Genesis: Design Stage` (the states, marks, files and the fresh-session rule; the section name is never `Design State`, which a live pin bans), the § Genesis: State Machine chain becomes `… → GATE_RED \| DESIGN_BRIEF → [DESIGN_KIT → DESIGN_JOURNEYS → AWAITING_DESIGN_APPROVAL, specs 05/06] → ROADMAP → …` with the skip rule, § Genesis: On-disk Handoff gains rows for `design-paths.json`, `docs/design/brief.md` and `docs/design/catalog.md`, and the ADR-0028 sentence in § Genesis: Brief State is reworded so BRIEF still names `design/approval.json` as its journey-count source (a live pin requires the literal). `spec/commands/genesis.md` names the design stage in its chain sentence and adds the fresh-session rule in ≤3 lines, staying ≤120 lines (live pin) and within the 500-line read-load budget (324 today). `spec/doctrine/design.md` § Design Canon gains one sentence: the wireframe's approval record is read by genesis at `DESIGN_BRIEF` only; the design contract that follows is code (brief 27). [no-ac: prose; `citations-check`, the ≤120 pin and the read-load pin are the oracles] | Doctrine follows the driver; the line caps and the banned heading are inherited pins the File Plan must respect. |
| D12 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; `spec-paths` gains `catalog-inventory`, `design-brief-template`, `design-paths-template`; `spec/entrypoints.json` gains a row for `catalog-inventory.js` (entry points `spec/commands/genesis.md`, `spec/commands/doctor.md`); `docs/adr/0006-mocks-first-genesis.md` gains the missing `Amended by ADR-0030` backlink line under its Applies to; the session's research is recorded once at `docs/spikes/20260926-design-stage/research.md` (Storybook 10.6 CSF and CLI facts, shadcn 4.21 CLI facts, the salon-os static-build finding). (AC-20260926-04-20) | New-surface checklist (pipeline rules § Planning); brief 30 § Grounding asks spec 01 to copy the research notes under docs/spikes/. |

| D13 | User ruling at build (2026-09-26, REPAIR round 1): `spec/scripts/lib/gate-resolve.js` drops every File Plan path under a `fixtures/` directory (`/(^\|\/)fixtures\//`) before deriving `{testDirs}` globs and `{scopeDirs}`; a fixture is never a test entry point. A File Plan whose only test rows are fixtures resolves to the existing `{ gate: null, reason }` form. (AC-20260926-04-23) | The scoped gate ran `tests/fixtures/genesis/shadcn-stub.js` and `catalog-docs/card.md` as test files and reddened on both; specs 05 and 06 add fixture rows of the same shape. The whole-suite post-gate never matches them (node's default discovery), so only the scoped glob needs the filter. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1 state + predicate + `status.designStage`; D2 step text with Session/Model/Skill/catalog/journey lines; D3 design-paths read + validation; D5 inventory run at print; D6 brief grammar checks; D7 contract check via overrides; D8 mark record; D9 deletions (auto-pick, scaffold skip, check --json branch, mock-cli require); usage list names the new mark; header comment updated (owner citation, exit codes unchanged) |
| spec/scripts/catalog-inventory.js | CREATE | scripts | D4 — shadcn inventory with `## Composition` excerpts, `file:` + `https:` sources, `--check`, `--json`; header cites this spec; exit codes 0/1/2 |
| spec/scripts/design-contract-check.js | MODIFY | scripts | D7 — `--rules --kit --tokens` overrides bypassing the config; header usage line and Does-NOT list updated |
| spec/scripts/lib/gate-resolve.js | MODIFY | scripts | D13 — exclude `fixtures/` paths from `{testDirs}`/`{scopeDirs}` derivation; header comment names the rule |
| spec/bin/spec-paths | MODIFY | scripts | D12 — keys `catalog-inventory`, `design-brief-template`, `design-paths-template` |
| spec/entrypoints.json | MODIFY | scripts | D12 — row for `spec/scripts/catalog-inventory.js` |
| spec/templates/design-brief.md | CREATE | doctrine | D6 — the brief grammar with one HTML comment per section saying what the driver checks |
| spec/templates/design-paths.json | CREATE | doctrine | D3 — the paths file shape with example values |
| spec/skills/design-brief/SKILL.md | CREATE | doctrine | D10 — the authoring method; frontmatter `name: design-brief` |
| spec/doctrine/genesis.md | MODIFY | doctrine | D11 — `## Genesis: Design Stage`; chain, on-disk handoff rows, Brief State wording |
| spec/commands/genesis.md | MODIFY | doctrine | D11 — chain sentence + fresh-session rule; stays ≤120 lines |
| spec/commands/doctor.md | MODIFY | doctrine | D5 — the catalog currency check at the next free ordinal |
| spec/doctrine/design.md | MODIFY | doctrine | D11 — one sentence in § Design Canon; stays ≤160 lines and keeps every literal AC-20260926-01-8 pins |
| spec/.claude-plugin/plugin.json | MODIFY | other | D12 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| docs/adr/0006-mocks-first-genesis.md | MODIFY | other | D12 — `Amended by ADR-0030` backlink line |
| docs/spikes/20260926-design-stage/research.md | CREATE | other | D12 — the research record (sources dated, executed spike outputs summarized) |
| specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md | MODIFY | other | D9 — `[retired: specs/20260926/04-the-design-brief.md]` on the AC-5, AC-6 and AC-13 pointer lines |
| tests/genesis/design-stage-brief.test.js | CREATE | tests | AC-20260926-04-1, AC-20260926-04-2, AC-20260926-04-3, AC-20260926-04-4, AC-20260926-04-5, AC-20260926-04-9, AC-20260926-04-11, AC-20260926-04-12, AC-20260926-04-13, AC-20260926-04-14, AC-20260926-04-16, AC-20260926-04-17, AC-20260926-04-18 |
| tests/doctor/catalog-inventory.test.js | CREATE | tests | AC-20260926-04-6, AC-20260926-04-7, AC-20260926-04-8 |
| tests/doctor/design-contract-check.test.js | MODIFY | tests | AC-20260926-04-15 |
| tests/genesis/genesis-mock-app.test.js | MODIFY | tests | D9 — delete the AC-20260914-02-5, AC-20260914-02-6 and `MENUS on a mock-app host …` tests; the AC-20260914-02-4 test stays and carries AC-20260926-04-21 |
| tests/consistency/design-stage-genesis.test.js | CREATE | tests | AC-20260926-04-10, AC-20260926-04-19, AC-20260926-04-20 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260926-04-20 (the exhaustive key pin gains the three keys) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260926-04-22 — the AC-20260914-02-7 test rewritten: absence of the two retired paragraphs, `design/approval.json` under Brief State kept |
| tests/review/review-legs.test.js | MODIFY | tests | AC-20260926-04-23 — a synthetic host whose File Plan carries a non-JS fixture row and a stub `.js` fixture row alongside a real test row: the resolved gate names no `fixtures/` glob and the gate leg exits 0 |
| tests/fixtures/genesis/shadcn-stub.js | CREATE | tests | a stub `shadcn` command printing a canned `info --json` whose `links.components` is a `file:` URL into the fixture dir; used by AC-6/AC-7/AC-9 |
| tests/fixtures/genesis/catalog-docs/card.md | CREATE | tests | a component page with a `## Composition` section and an `## API Reference` after it |

`tests/consistency/entrypoints.test.js` and `tests/spec-paths.test.js`'s exhaustive pins gain the new row/keys by construction (pipeline rules § Gotchas: one review waive line, never a lock-time guard).

## Contracts

`.claude/genesis/design-paths.json` (D3) — `spec/templates/design-paths.json` is this file:

```jsonc
{
  "schemaVersion": 1,
  "kit": "src/components/kit",             // intent-named composites; brief 27's design.kit
  "tokens": "src/styles/tokens.css",       // the @theme block; brief 27's design.tokens
  "rules": ".claude/rules/design.md",      // the auto-loaded rules file; brief 27's design.rules
  "primitives": "src/components/ui",       // the installed catalog's directory (shadcn `aliases.ui`)
  "primitivesAlias": "@/components/ui",    // the import specifier journeys may never use (spec 05)
  "journeys": "src/journeys",              // beats files, journey stories and journey screens (spec 05)
  "storybook": {
    "port": 6006,
    "buildCommand": "npx storybook build --test --quiet -o .claude/genesis/storybook-static",
    "staticDir": ".claude/genesis/storybook-static"
  }
}
```

`docs/design/brief.md` (D6) — `spec/templates/design-brief.md` is this with comments:

```markdown
# Design brief — Salon OS

## Users and context
Owners of one-to-three-chair salons, on a phone between clients; …

## Journeys
### first-visit
JTBD: When a walk-in arrives, I want to book them in under a minute, so I can get back to the chair.
### daily-check
JTBD: When I open the app in the morning, I want today's bookings and gaps at a glance, so I can fill the gaps.

## Navigation
| Task | Frequency | Entry |
|------|-----------|-------|
| see today | every open | home |
| book a walk-in | several per day | home → booking |

## Catalog
### Used
- button
- card
- dialog
### Excluded
- carousel — no gallery surface in any journey

## Composites
| Composite | Intent | States |
|-----------|--------|--------|
| BookingSheet | edit one record | Idle, Saving, Error |
| DestructiveConfirmDialog | confirm destructive | Idle, Confirming |

## Contract
Tables: .claude/rules/design.md (## Intent to pattern, ## Naming — brief 27's grammar).
```

`docs/design/catalog.md` (D4):

```markdown
# Catalog — shadcn (radix) · generated by catalog-inventory.js, never edited by hand

## Components
### button
composition: unavailable
### card
Use the following composition to build a `Card`:
Card
├── CardHeader
│   ├── CardTitle
│   ├── CardDescription
│   └── CardAction
├── CardContent
└── CardFooter
```

`catalog-inventory.js --json` (D4): `{"ok":true,"catalog":"shadcn","base":"radix","components":[{"name":"button","composition":false},{"name":"card","composition":true}],"unavailable":1}`; no components.json → `{"ok":true,"catalog":"none"}`; `--check` → `{"ok":false,"status":"stale","added":["sheet"],"removed":[]}` exit 1, or `{"ok":true,"status":"current"}` exit 0.

`shadcn info --json` fields the script reads (spiked, shadcn 4.21.0): `components: string[]`, `links.components: "https://ui.shadcn.com/docs/components/radix/[component].md"`, `config.base: "radix"`.

`status.designStage` after D8 (spec 05 and 06 extend it):

```jsonc
{ "paths": ".claude/genesis/design-paths.json", "brief": "docs/design/brief.md",
  "catalog": { "exit": 0, "components": 3, "unavailable": 1, "at": "<ISO>" }, "briefAt": "<ISO>" }
// or, when the stage does not apply:
{ "skipped": "non-visual" | "non-storybook", "at": "<ISO>" }
```

`DESIGN_BRIEF` step text (D2), rendered:

```
## Step: write the design brief
Read only: app/design/mocks/seed.md, app/design/approval.json (journeys — last read), .claude/genesis/brief.md (## Journeys), docs/design/catalog.md, .claude/genesis/design-paths.json, .claude/rules/design.md
Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage
Session: start a fresh session for this step — Model: Fable (authors the brief and the tables)
Skill: design-brief — load it before the first line
catalog: 3 components · 1 compositions unavailable
journey: first-visit (4 beats)
journey: daily-check (3 beats)
Write docs/design/brief.md (template: design-brief.md via spec-paths templates), .claude/genesis/design-paths.json (template: design-paths.json), and fill ## Intent to pattern and ## Naming in the rules file.
Then:
  node <driver> --root <root> --mark design-brief-written
```

`design-contract-check.js` overrides (D7): `--root <dir> --rules <file> --kit <dir> --tokens <file> [--json]`; any of the three without the other two → exit 2 `usage: --rules, --kit and --tokens go together`.

## Behavior

A web-app genesis on a host whose descriptor says `designCatalog: "storybook"`: `skeleton-landed`
runs the gate; green → the checkpoint line reads `(SKELETON → DESIGN_BRIEF)`. The bare run prints
the D2 step; if `docs/design/catalog.md` is absent the driver runs the inventory first and
records the counts. Fable, in a fresh session, loads the skill, writes the brief, the paths file
and the two tables, then marks. Refusals name the first failing check and exit 2, leaving
`marks.designBriefWritten` unset. Acceptance records D8 and prints the next state.

A `data-ml` or `backend-api` run, or a visual run whose descriptor names another catalog: the
first derivation past the gate writes `status.designStage.skipped` and prints `ROADMAP`; no new
mark is ever demanded. The shared test helpers (`advanceToRoadmap` with `data-ml`,
`designCatalog: 'none'`) therefore keep reaching `ROADMAP` unchanged.

A host with the React mock app (`app/mock.config.ts`): MENUS prints no auto-pick line and does
not record a skipped tournament; a tournament archetype reaches `FINALISTS`; `decided` runs the
scaffold; `skeleton-landed` never spawns `mock-review`. BRIEF still requires the mocks status
`APPROVED` and prints the seed journey count from `design/approval.json`.

## Acceptance Criteria

- **AC-20260926-04-1**: WHEN `--mark skeleton-landed` is accepted with a green gate on a host whose `status.archetype` is `web-app` and whose `stack-descriptor.json` has `designCatalog: "storybook"` THE SYSTEM SHALL print `(SKELETON → DESIGN_BRIEF)` in the checkpoint line, and the bare run SHALL print `state: DESIGN_BRIEF` with `--state` printing `DESIGN_BRIEF\n` (e.g. fixture host with `archetype: web-app`, descriptor `designCatalog: "storybook"`, gateCommand `true` → stdout matches `/state: DESIGN_BRIEF/`) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-2**: WHEN the same run happens on a host whose descriptor has `designCatalog: "none"` (or whose archetype is `data-ml`) THE SYSTEM SHALL print `(SKELETON → ROADMAP)`, write `status.designStage` as `{ "skipped": "non-storybook" }` (respectively `{ "skipped": "non-visual" }`) with an `at` timestamp, and never accept `--mark design-brief-written` (exit 2, stderr names `does not apply`) (e.g. `data-ml` + `designCatalog: "none"` → `status.json.designStage.skipped === "non-visual"`) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-3**: WHEN `design-brief-written` has been accepted and `docs/design/brief.md` is then deleted THE SYSTEM SHALL derive `DESIGN_BRIEF` again on the next bare run (e.g. `rm docs/design/brief.md` → `--state` prints `DESIGN_BRIEF\n`, never `ROADMAP`) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-4**: WHEN the bare run prints `DESIGN_BRIEF` THE SYSTEM SHALL include, each on its own line, `Session: start a fresh session for this step — Model: Fable`, `Skill: design-brief — load it before the first line`, `Doctrine: spec/doctrine/genesis.md § Genesis: Design Stage`, one `journey: <name> (<n> beats)` line per seed journey, a `Read only:` line naming `design/approval.json`, and `--mark design-brief-written` (e.g. seed with journeys `first-visit` (4 beats) and `daily-check` (3 beats) → lines `journey: first-visit (4 beats)` and `journey: daily-check (3 beats)`) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-5**: WHEN `--mark design-brief-written` runs with `.claude/genesis/design-paths.json` absent, unparseable, or missing a required key THE SYSTEM SHALL exit 2 naming the file and the first missing key (e.g. a file without `storybook.staticDir` → stderr contains `design-paths.json` and `storybook.staticDir`; `storybook.port: 80` → stderr contains `storybook.port`) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-6**: WHEN `catalog-inventory.js --root <r> --out <f>` runs on a root with no `components.json` THE SYSTEM SHALL write `<f>` containing `catalog: none (no components.json)` and exit 0; WHEN run with `--shadcn "node <stub>"` whose `info --json` lists `["button","card"]` with a `file:` `links.components` pointing at a fixture dir holding only `card.md` (with `## Composition` then `## API Reference`) THE SYSTEM SHALL write `### button` followed by `composition: unavailable`, `### card` followed by the Composition section's lines and none of the API Reference lines, exit 0, and `--json` SHALL print `"unavailable":1` (e.g. `components[1] = {"name":"card","composition":true}`) → writes tests/doctor/catalog-inventory.test.js
- **AC-20260926-04-7**: WHEN `--check` runs against an inventory whose `### ` names are `button, card` and the stub now lists `["button","card","sheet"]` THE SYSTEM SHALL exit 1 printing `stale` with `added: sheet`; WHEN the lists match THE SYSTEM SHALL exit 0 printing `current`; WHEN `<out>` is absent THE SYSTEM SHALL exit 1 printing `missing` → writes tests/doctor/catalog-inventory.test.js
- **AC-20260926-04-8**: WHEN `catalog-inventory.js` runs without `--root` or without `--out` THE SYSTEM SHALL exit 2 with a usage line on stderr (e.g. `--root <r>` alone → exit 2, stderr starts `usage:`) → writes tests/doctor/catalog-inventory.test.js
- **AC-20260926-04-9**: WHEN the bare run first prints `DESIGN_BRIEF` on a host with `components.json` and no `docs/design/catalog.md`, with `design-paths.json` absent and the env `GENESIS_SHADCN_COMMAND="node <stub>"` set THE SYSTEM SHALL create `docs/design/catalog.md`, record `status.designStage.catalog.exit === 0` and `.components === 2`, and print `catalog: 2 components · 1 compositions unavailable`; a second bare run SHALL NOT re-run the inventory (the fixture stub's call counter stays at 1) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-10**: WHEN `spec/commands/doctor.md` is read THE SYSTEM SHALL contain a numbered check line invoking `node "$(spec-paths catalog-inventory)" --root . --out docs/design/catalog.md --check` whose surrounding sentence names `docs/design/catalog.md` as the existence guard (e.g. regex `/spec-paths catalog-inventory\)" --root \. --out docs\/design\/catalog\.md --check/` matches exactly once) → writes tests/consistency/design-stage-genesis.test.js
- **AC-20260926-04-11**: WHEN `--mark design-brief-written` runs with a complete `docs/design/brief.md` (the Contracts example, journeys `first-visit` and `daily-check`), a valid `design-paths.json`, a rules file whose `## Intent to pattern` `Composite` column is exactly `BookingSheet, DestructiveConfirmDialog` and whose four naming tables each have one row, and no kit or tokens on disk THE SYSTEM SHALL exit 0, set `marks.designBriefWritten === true`, write `status.designStage.brief === "docs/design/brief.md"` and `status.designStage.briefAt` as an ISO timestamp, and print the checkpoint line `(DESIGN_BRIEF → ROADMAP)` → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-12**: WHEN the brief's `### daily-check` block has no line starting `JTBD: When ` THE SYSTEM SHALL exit 2 with stderr containing `daily-check` and `JTBD`; WHEN `## Navigation` precedes `## Journeys` THE SYSTEM SHALL exit 2 with stderr containing `order` and `## Journeys`; WHEN the file contains a `## Entities` heading THE SYSTEM SHALL exit 2 with stderr containing `Entities` and `journeys are locked before any entity` → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-13**: WHEN the brief's `## Composites` table lists `BookingSheet` only while the rules file's `Composite` column lists `BookingSheet, DestructiveConfirmDialog` THE SYSTEM SHALL exit 2 with stderr containing `DestructiveConfirmDialog` and `Composites`; WHEN `### Used` lists `carousel` and `docs/design/catalog.md` lists `button, card` only THE SYSTEM SHALL exit 2 with stderr containing `carousel` and `not in docs/design/catalog.md` → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-14**: WHEN the rules file's `### wire` table has only its header and separator rows THE SYSTEM SHALL exit 2 with stderr containing `table-empty` and `wire`; the same host with the wire row filled and still no kit directory SHALL be accepted (exit 0) — `kit-missing` is tolerated here (e.g. `design-paths.kit = "src/components/kit"`, directory absent → exit 0) → writes tests/genesis/design-stage-brief.test.js
- **AC-20260926-04-15**: WHEN `design-contract-check.js --root <r> --rules <f> --kit <d> --tokens <t> --json` runs on a root with NO `.claude/spec.config.json` THE SYSTEM SHALL report findings for the named paths instead of `skipped` (e.g. missing kit dir + filled tables → `{"ok":false,"findings":[{"kind":"kit-missing",…}]}` exit 1); WHEN only `--rules` is passed THE SYSTEM SHALL exit 2 with stderr naming `--rules, --kit and --tokens go together` → writes tests/doctor/design-contract-check.test.js
- **AC-20260926-04-16**: WHEN MENUS runs on a host whose `design/mocks/status.json` says `app: "app"` with `app/mock.config.ts` present and `framework`, `language`, `packageManager` open THE SYSTEM SHALL print no line containing `Auto-picked`, leave `status.tournament` without a `skipped` key, and route a `web-app` archetype to `FINALISTS` after `menus-done` (e.g. stdout of the post-menus-done run matches `/FINALISTS/` and not `/DECIDE/`) → writes tests/genesis/design-stage-brief.test.js [retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]
- **AC-20260926-04-17**: WHEN `--mark skeleton-landed` runs on a host with `app/mock.config.ts` and a stub `mock-review` on PATH that exits 1 with `ok: false` THE SYSTEM SHALL accept the mark when the probe, binding-subset and gate checks pass, never spawning the stub (the stub's call-counter file stays absent) and recording `status.scaffold.exit === 0` rather than `{ "skipped": "mock-app" }` → writes tests/genesis/design-stage-brief.test.js [retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]
- **AC-20260926-04-18**: WHEN `spec/scripts/genesis-driver.js` is read THE SYSTEM SHALL contain zero occurrences of `MOCK_APP_FIXED_DIMS`, `appendDerivedPicksToBrief`, `skipped: 'mock-app'` and `require('./lib/mock-cli')` (regex `/MOCK_APP_FIXED_DIMS|appendDerivedPicksToBrief|skipped:\s*'mock-app'|require\(['"]\.\/lib\/mock-cli['"]\)/` → no match) → writes tests/genesis/design-stage-brief.test.js [retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]
- **AC-20260926-04-19**: WHEN `spec/skills/design-brief/SKILL.md` is read THE SYSTEM SHALL exist with frontmatter `name: design-brief`, and its body SHALL name `JTBD`, `frequency`, `docs/design/catalog.md`, `## Intent to pattern` and `## Naming` (e.g. `/^name:\s*design-brief\s*$/m` matches) → writes tests/consistency/design-stage-genesis.test.js
- **AC-20260926-04-20**: WHEN `spec-paths catalog-inventory`, `spec-paths design-brief-template` and `spec-paths design-paths-template` run THE SYSTEM SHALL print `spec/scripts/catalog-inventory.js`, `spec/templates/design-brief.md` and `spec/templates/design-paths.json` respectively, each an existing file; and `spec/doctrine/genesis.md` SHALL contain the heading `## Genesis: Design Stage` and never `## Genesis: Design State`; and `spec/commands/genesis.md` SHALL contain `DESIGN_BRIEF` → writes tests/consistency/design-stage-genesis.test.js
- **AC-20260926-04-22**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL name `design/approval.json` under `## Genesis: Brief State`, contain none of `shell adopt`, `check --matrix`, `data-shell`, `design/components.json`, and contain neither `skipped: "mock-app"` nor `mock-review check` anywhere (e.g. `/skipped:\s*"mock-app"/` → no match in the whole file) → rewrites tests/consistency/genesis-doctrine.test.js :: AC-20260914-02-7 [retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]
- **AC-20260926-04-23**: WHEN `review-legs.js` resolves `gateCommand: "node --test {testDirs}"` for a spec whose File Plan tests rows are `tests/a.test.js`, `tests/fixtures/x/stub.js` and `tests/fixtures/x/docs/page.md` THE SYSTEM SHALL run a gate naming only `'tests/*.test.js'` (no glob containing `fixtures/`) and the gate leg SHALL exit 0 on a host where `stub.js` exits 1 when run bare and `page.md` is not valid JavaScript (e.g. the manifest's gate row carries `exit: 0`, and `resolveGate()`'s returned `gate` string for the same spec text and config does not match `/fixtures\//` — the manifest row records no command string) → writes tests/review/review-legs.test.js
- **AC-20260926-04-21**: WHEN genesis-driver.js runs at BRIEF on a host whose `design/mocks/status.json` is APPROVED, whose `design/approval.json` has journeys `first-visit` and `daily-check`, and whose `design/notes.json` has one open note and one open journey conversation THE SYSTEM SHALL CONTINUE TO print `seed journeys: 2 · notes open: 2` → reuses tests/genesis/genesis-mock-app.test.js :: AC-20260914-02-4: [retired: specs/20261002/01-the-wireframe-command-runs-over-the-service.md]

## Assumptions (escalation triggers)

- A1 (executed 2026-09-26, shadcn 4.21.0 on a fresh `shadcn init -t vite -b radix -p nova` app): `npx shadcn@latest info --json` exits 0 and prints `components: ["button","card","dialog"]`, `config.resolvedPaths.ui` as an absolute path, and `links.components: "https://ui.shadcn.com/docs/components/radix/[component].md"`; the kit directory's files never appear in `components`. — **if false:** the inventory script reads `components.json`'s `aliases.ui` directory listing instead; record the deviation.
- A2 (executed 2026-09-26): `GET https://ui.shadcn.com/docs/components/radix/card.md` returns HTTP 200 `text/markdown` with a `## Composition` section ("Use the following composition to build a `Card`:" and the tree) followed by `## API Reference`; `dialog`, `field`, `select` carry the same section. — **if false:** the inventory records `composition: unavailable` for that name (already the design); nothing blocks.
- A3 (executed 2026-09-26): `npx shadcn@latest docs card --json` returns `{"base":"radix","results":[{"component":"card","base":"radix","links":{"docs":…,"examples":…}}]}`. — **if false:** unused by the script (recorded for the skill's guidance only).
- A4: `spec/commands/genesis.md` sits at 113 of 120 lines and the genesis read-load is 324 of 500; D11's additions fit in ≤3 command lines. — **if false:** condense an existing sentence in the same file, never delete a rule; grep the literals a pin reads (`/spec:mocks → /spec:genesis → /spec:enforce`) before reflowing.
- A5: `tests/consistency/genesis-doctrine.test.js` bans the heading `## Genesis: Design State` and the literal `genesis-design` repo-wide outside a waive list; this spec's names (`## Genesis: Design Stage`, `design-brief`, `DESIGN_BRIEF`, `designStage`) never match either regex. — **if false:** rename the offending literal; never edit the pin.
- A6: the shared genesis test helpers reach `ROADMAP` with `archetype: data-ml` and `designCatalog: 'none'`, so D1's pass-through keeps every existing driver test green without edits. — **if false:** add the skip fixture to the helper in the same batch; never weaken the new predicate.
- A7: deleting the three mock-app tests leaves specs/20260914/02's AC-5, AC-6 and AC-13 with no citing test; the `[retired: …]` pointer tag is the sanctioned form (pipeline rules § Gotchas, twelfth trigger). — **if false:** `ac-drift-clean` names the remaining citation; tag that AC too.
- A8: `fetch` is a Node built-in global on Node ≥ 22 (this repo runs Node 26). — **if false:** use `node:https` with the same timeout.
- A9: the `shadcn` command override for the driver is the env `GENESIS_SHADCN_COMMAND` (tests) and the script flag `--shadcn` (doctor and tests); production runs use the default `npx shadcn@latest`. — **if false:** STOP, ask the user.

## Rationale

The design stage sits after the gate, not after MENUS as brief 30's wording ("between STACK and
ROADMAP") suggests, because the kit and the journey stories must be written against the real
scaffolded app, and the scaffold only exists once `decided` ran it. The predicate reuses the
descriptor's `designCatalog` rather than sniffing `package.json`: the descriptor is what DECIDE
already validates, and brief 30 names Storybook as the one carrier this brief supports.

The mock-app precedence retirement (D9) is the largest scope call. Until 2026-09-26 genesis
treated the React mock app as the product's source (ADR-0028), auto-picking Vite/React and
skipping the scaffold. ADR-0030 (j) superseded that and JJ confirmed today that the mock is a
throwaway. Leaving the shortcut in place would have made spec 05 build the kit inside the gray
wireframe. The retirement costs three tests and three retired-AC tags.

The tables live in the rules file only (D6 § Contract). Brief 30's text puts them in the design
brief too; a second copy kept in agreement by hand is exactly what ADR-0030 measured failing, so
the brief points at the file and the driver checks the composite sets are equal.

The catalog inventory needs the network once (composition pages are not shipped inside the
host). A failure degrades to `composition: unavailable` and never blocks — the brief's Catalog
section can be written from the component list alone. `file:` URLs exist so the suite never
touches the network.

Collision closure (lock, 2026-09-26): the literals leg for `check --json` hits 22 files, all
but two on the mocks stage's live surfaces (`mocks-driver.js`, `mock-cli.js`, `mocks.md`, the
mock templates and their tests) — waived: D9 retires only the genesis driver's own branch; the
mocks stage keeps `mock-review check --json` until brief 29. The two genesis hits
(`genesis-driver.js`, `genesis-doctrine.test.js`) are File Plan rows. `spec/bin/spec-paths`'s
`executes` hits are the ordinary exhaustive-pin waive (one review line).

Rejected: parsing the brief's tables into the rules file automatically (the tables are Fable's
judgment in the stack's idiom; a copy step adds nothing); a `--json` flag on the driver (out of
scope, no consumer); retiring BRIEF's `docs/design/doctrine.md` and `design-rules.json`
ratification (they feed `/spec:enforce`'s categories today; adjacent, not this brief).

Critical tier: `spec/bin/spec-paths` is a listed trigger; every AC carries a literal example
and JJ confirms the lock.

Build and review record (2026-09-26). The first AC-16 test draft left framework, language and
package-manager unresolved at `menus-done`, which passed only while the D9-retired narrowing
survived under a new name; the orchestrator held D9's "like any other" binding, the narrowing was
deleted, and the setup now menus and picks those three dimensions like any host. The
catalog-inventory test's local `run()` helper dropped its `{ env }` argument, so the stub cases
never saw their fixture paths; fixed in the same build. D13 (the scoped gate ran fixture files
as tests) was a user ruling at repair round 1. Review took two fix rounds: round 1 fixed an
unrecorded inventory failure, the missing Session-line parenthetical and a non-integer port;
its no-retry fix gated on the record alone and overwrote a pre-existing catalog, which round 2
restored to the file-absent-and-unrecorded conjunction.

## Canonical Delta

docs/canonical/genesis.md § Driver: the chain gains `DESIGN_BRIEF` between the green gate and
`ROADMAP` for visual archetypes whose descriptor names Storybook as the design catalog; other
hosts record `designStage.skipped`. At `DESIGN_BRIEF` the driver generates
`docs/design/catalog.md` (shadcn `info --json` plus each component's composition section),
prints a fresh-session line naming Fable and the `design-brief` skill, and `--mark
design-brief-written` verifies `docs/design/brief.md` (heading order, one JTBD line per approved
journey, no entity section, a non-empty composites table equal to the rules file's composite
column, used components present in the inventory), `.claude/genesis/design-paths.json`, and the
rules file's tables via `design-contract-check --rules --kit --tokens`. The mock app is no longer
the product: MENUS auto-picks nothing, the tournament and scaffold run for every host, and
`skeleton-landed` runs no `mock-review` check; BRIEF still requires the mocks set `APPROVED` and
reads `design/approval.json` for the journey count, and `DESIGN_BRIEF`'s step is the last read
of that record.

docs/canonical/design.md § The design contract is code: genesis's design stage authors the
intent-to-pattern and naming tables at `DESIGN_BRIEF`; `design-contract-check` accepts
`--rules --kit --tokens` overrides for hosts whose config has no `design` block yet.
