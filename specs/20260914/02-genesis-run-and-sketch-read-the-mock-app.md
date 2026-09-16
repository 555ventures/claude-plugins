---
date: 2026-09-14
status: hardened
tier: critical
area: design
design: false
breaking: true
depends_on: [specs/20260914/01-the-mock-contract-and-the-driver.md]
depended_on_by: [specs/20260914/03-the-html-atlas-is-retired.md]
brief: 26
open_markers: 0
---

# Genesis, run and sketch read the mock app

## Goal

Every consumer of the design stage's output reads the mock app, never HTML. Genesis derives the
frontend framework from the mock app, skips the scaffold race for it, and lands the day-zero
skeleton on `mock-review check`. The run design stage collapses to preflight → reconcile → look
→ stamp, with `design_source` naming screen files and drift detected by the approval hash.
`/spec:sketch` becomes the per-brief sweep loop whose ratification is the approval record. The
grounding contract's `design` block becomes `{ "app": "<dir>" }`, `/spec:init` stops offering
the frontend-design skill, and the shared design doctrine describes one artifact. Done means:
`stage-design.md`, `stage-review.md`, `sketch.md`, `plan.md`, `genesis.md` and `design.md` name
none of `render-gate`, `design-coverage.json`, `components.json`, `data-status`, `design-atlas`
or `storyFormat`; genesis's SKELETON precondition executes `mock-review check --json`; the
contract hash is restamped. The HTML scripts still exist until spec 03; nothing here calls them.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md`'s `design` block is `{ "app": "<dir holding mock.config.ts, relative to the repo root>" }` and nothing else — the same value as `design/mocks/status.json`'s `app` (spec 01 D4, `"app"` on a host the SEED block scaffolded), and genesis's HANDOFF writes it from `status.app` when it stamps `spec.config.json`; the sub-keys `tool`, `command`, `storyFormat`, `doctrine`, `render`, `rulesManifest`, `atlasRoutes`, `gateCommand`, `copyCatalogs`, `screenshot` are retired and the § Render gate section is deleted. A `design` block present = design-capable host. This repo's `.claude/spec.config.json` `contractHash` is restamped from `spec-paths contract-hash` in the same build (its one sanctioned edit to the contract, pipeline rules § Planning). (AC-20260914-02-1, AC-20260914-02-2) | One key says where the app is; every other key described how to render a second artifact. |
| D2 | `spec/doctrine/stages/stage-design.md` is rewritten to four steps — **preflight → reconcile → look → stamp** — resumed from disk: `designed:` set → DONE; every surface approved and current → look; else preflight. Preflight, in order: `design.app` declared (else STOP printing `"design": { "app": "<dir>" }` with the directory that holds `mock.config.ts` if one is found one level down, else `"app"`); when `design/mocks/status.json` exists and its `app` differs from `design.app`, STOP naming both values with `remedy: set "design": { "app": "<status.app>" }` (the driver's value wins — it is the one the scaffold wrote); `env-preflight`; `status: hardened`; `design_source` resolves, under `<design.app>/`, to one `src/screens/<label>.tsx` or the directory `src/screens` — every named screen must carry `approval.screens[<name>].approvedAt` and `approval.screens[<name>].hash === check.screens[<name>].hash`, else STOP naming `/spec:sketch <brief>` (missing → "not approved"; mismatch → "changed since approval"); `mock-review check --json` `ok: true` (via `lib/mock-cli.js`, contract refusal first). No components.json, no coverage ledger, no stories, no render gate, no author dispatch. (AC-20260914-02-3) | The screens are the components; what remains is proving the spec binds to approved, unchanged screens. |
| D3 | Reconcile (stage-design.md): one `Agent {model: "sonnet"}` dispatch folds the spec's UI section to `check --json`'s screens, states and shells for the named surfaces; an AC that names a state no screen exports is a fork → `AskUserQuestion` (add the state / amend the AC), never a silent pass; the affordance ↔ contract reconcile stays as today's prose. Look: print `🎨 ready for review — <check.serve.url>/#/<screen>` one line per surface, then the fixed reply line, then end the turn; only the literal `approve` accepts; a change reply is one in-session edit round under the `mock-authoring` skill, then `check`, then re-approve on the page (the hash changes, so approval.json must be re-stamped by the page before the next preflight passes). Stamp `designed: YYYY-MM-DD`; checkpoint-commit. (AC-20260914-02-3) | A look that ends in an edit must go back through the page's approval, or the hash rule is fiction. |
| D4 | Standalone preamble (no brief, no `design_source`): author the screens in-session under the `mock-authoring` skill, approve them on the served page, persist `design_source: src/screens/<label>.tsx` (one file, or `src/screens` when the spec owns several), continue at preflight. Roadmap specs never take it. [no-ac: doctrine prose; AC-20260914-02-3 pins the file names none of the retired mechanics] | Same as today minus the HTML. |
| D5 | `spec/doctrine/stages/stage-review.md`: the `design/components.json` `authorJustification` audit and the `render-gate.js --spec` advisory leg are deleted from the review dispatch paragraph; a `design: true` spec gets no extra design leg. `spec/scripts/spec-review-driver.js`'s REVIEWER step text drops its "advisory render-gate run" clause (the driver prints text only; it never ran the gate). (AC-20260914-02-3, AC-20260914-02-16) | Both legs measured the second artifact. |
| D6 | `genesis-driver.js`: (a) `briefPreconditionCheck` keeps its `status.state === 'APPROVED'` and ledger closure and reads the journey count from `design/approval.json` (`journeys` keys) and the open-note count from `design/notes.json` (`status === "open"`, notes and journeys alike) through `fs` + JSON, never `lib/mocks-notes`; the BRIEF step prints `seed journeys: N · notes open: N`; the app directory is `status.app` from `design/mocks/status.json` (`"app"` by default) and "the mock app exists" below means `<root>/<status.app>/mock.config.ts` exists. (b) MENUS: when the mock app exists, the dimensions the app already fixes are derived and recorded as decided — `framework` = `vite-react`, `language` = `typescript`, `packageManager` = `npm` — each printed as `📌 Auto-picked <value> — the mock app is the product's frontend (ADR-0028) (veto anytime)`; every other dimension (`archetype`, `testRunner`, `linter`, …) stays open and the seed-row pricing print stays for those. (c) When the mock app exists the tournament is recorded as `status.tournament = { skipped: "mock-app" }` at MENUS and FINALISTS/RACE/PROBE/PICK are never derived; DECIDE proceeds on the derived dimensions. (d) SCAFFOLD: when the mock app exists, `scaffoldCommand` is not run and `status.scaffold = { skipped: "mock-app" }`; `--mark skeleton-landed` refuses unless `mock-review check --json` reports `ok: true` (via `lib/mock-cli.js`) and the gate is green; the `data-shell` scan, `design-atlas.js check --matrix`, `shell adopt` and `design/components.json` checks are deleted. (AC-20260914-02-4, AC-20260914-02-5, AC-20260914-02-6, AC-20260914-02-13) | The mock app is the day-zero skeleton; racing frontend scaffolds against an app that already exists is meaningless, and the backend, if any, is a roadmap brief. |
| D7 | `spec/doctrine/genesis.md` § Genesis: Tournament of Scaffolds and § Genesis: Day-Zero Skeleton each gain one paragraph stating D6 (b)–(d); § Genesis: Brief State names `design/approval.json` and `design/notes.json` as the BRIEF step's derivation sources; `spec/commands/genesis.md` stays ≤120 lines and keeps the literal `/spec:mocks → /spec:genesis → /spec:enforce`. (AC-20260914-02-7, AC-20260914-02-14) | Doctrine says what the driver does; the two pins that already exist on genesis.md keep holding. |
| D8 | `spec/commands/sketch.md` is rewritten: Setup (`shared-for sketch`, `spec-paths mocks-driver`, `lib/mock-cli` contract check via `node "$(spec-paths mocks-driver)" --root . --state`); Input resolution unchanged except a mock path is `src/screens/<label>.tsx`; Ground; Bound check (a surface whose `approval.screens[label]` is claimed by a `done` spec — the coverage ledger is retired, so "claimed" means a `done` spec whose `design_source` names it — is a contract; drift routes to `/spec:run`); **the sweep loop** — `npx mock-review sweep`, act on the brief's labels only, the five triage bins (mock-detail, structure → `surfaces` block first, intent → Scope/ADR, question back → `answer`, architecture-impacting) and the UX argument lines (`# job:`, `# risk:`, `# choice:` comment lines under the surface's label in the `surfaces` block) kept verbatim; Critique = `npx mock-review check` (a screen missing the states the seed requires is a `states` warn finding — spec 01's contract; it never flips `ok`, and the session fixes it or leaves it open for the user); Exit = every brief label approved and current in `approval.json` and every journey through them `approvedAt` — the look stop prints the served URL per label; there is no `ratified` stamp, no theme step, no atlas build, no matrix expansion, no render gate. (AC-20260914-02-8) | The reviewer page is the ratification; the brief and the app are the only write targets. |
| D9 | `spec/commands/plan.md`: the UI-bearing-brief line reads each surface's screen under `src/screens/` and offers `/spec:sketch <brief>` when a label has no approved, current entry in `design/approval.json`; the `design:` rule records `design_source:` as a screen file or `src/screens`. `spec/templates/spec.md`'s `design_source` comment says the same. (AC-20260914-02-9) | Plan is the reader that decides whether design is due; it must read the new record. |
| D10 | `spec/doctrine/design.md` keeps § Design Canon and § Design Authoring Contracts (bodies rewritten: the three import layers, screens with `meta` + named states, project components and shells with a doc line and `examples`, records as the only data, `design/approval.json` as the canon with authority lifecycle approved → built when the claiming spec is `done`, stale when the hash differs), deletes § Design Render Gate and § Design Atlas, keeps § Workflows Encode Shape, Not Judgment; the file stays ≤160 lines. `spec-paths shared-for` lists for `genesis`, `sketch`, `init`, `run-design` and `atlas` drop `Design Atlas`, `Design Render Gate`; `run-design` = `Design Canon\|Design Authoring Contracts`. Every `§ Design Atlas` / `§ Design Render Gate` citation in `spec/commands/*.md`, `spec/doctrine/**` and `spec/templates/*.md` is rewritten to the surviving section or removed — the closure at lock found `spec/commands/run.md`, `spec/doctrine/core.md` § Model Placement and `spec/templates/roadmap-brief.md`'s surfaces comment (whose "data-screen-label anchors" clause becomes "screen file names under src/screens") (`citations-check.js` is the oracle). (AC-20260914-02-10, AC-20260914-02-11, AC-20260914-02-15) | Heading names cited elsewhere survive; the two sections about the second artifact do not. |
| D11 | `spec/commands/init.md`'s frontend-design install offer (lines ~211–226) is deleted and `spec/scripts/init-gen.js` drops `probeFrontendDesign` and the `frontendDesign` field from its output. (AC-20260914-02-12) | The `mock-authoring` skill replaced it in spec 01. |
| D12 | `.claude/design-coverage.json`, `design/components.json`, `design/targets.json`, `design/tokens.css` and story ids are no longer read or written by any command or stage; a leftover on a host is inert. [no-ac: absence; AC-20260914-02-3 and AC-20260914-02-10 pin the doctrine names none of them] | All four were bindings between the two artifacts. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1: `design: { app }`; § Render gate deleted |
| .claude/spec.config.json | MODIFY | other | D1: `contractHash` restamped from `spec-paths contract-hash` |
| spec/doctrine/stages/stage-design.md | MODIFY | doctrine | D2–D4: four steps |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D5 |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D6 (a)–(d) |
| spec/doctrine/genesis.md | MODIFY | doctrine | D7 |
| spec/commands/genesis.md | MODIFY | doctrine | D7: one line naming the derived framework; ≤120 lines |
| spec/commands/sketch.md | MODIFY | doctrine | D8 |
| spec/commands/plan.md | MODIFY | doctrine | D9 |
| spec/templates/spec.md | MODIFY | doctrine | D9 |
| spec/doctrine/design.md | MODIFY | doctrine | D10 |
| spec/bin/spec-paths | MODIFY | scripts | D10 shared-for lists |
| spec/commands/run.md | MODIFY | doctrine | D10: § Design Atlas citation rewritten |
| spec/doctrine/core.md | MODIFY | doctrine | D10: § Model Placement's `design.md § Design Atlas` citation rewritten |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D10: surfaces comment (citation + anchors clause) |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D5: REVIEWER step text drops the render-gate clause |
| spec/commands/init.md | MODIFY | doctrine | D11 |
| spec/scripts/init-gen.js | MODIFY | scripts | D11 |
| spec/.claude-plugin/plugin.json | MODIFY | other | `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/consistency/design-stage-doctrine.test.js | CREATE | tests | AC-20260914-02-3, AC-20260914-02-8, AC-20260914-02-9, AC-20260914-02-10, AC-20260914-02-16 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20260914-02-1 (rewrite), AC-20260914-02-2 (reuse) |
| tests/genesis/genesis-mock-app.test.js | CREATE | tests | AC-20260914-02-4, AC-20260914-02-5, AC-20260914-02-6 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260914-02-7 (rewrite) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260914-02-11 (rewrite) |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260914-02-12 |

Orchestrator duties (outside the table): `node "$(spec-paths citations-check)"` green after D10;
`node scripts/plugin-bump.js --check` green after the bump; `tests/mocks/mock-app-fixtures.js`
(spec 01) is reused by `tests/genesis/genesis-mock-app.test.js` for the stub `mock-review`.

## Contracts

`.claude/spec.config.json` design block (the whole contract surface):

```jsonc
"design": { "app": "app" }   // the directory holding mock.config.ts, relative to the root; present = design-capable
```

`design_source:` frontmatter: `src/screens/<label>.tsx` or `src/screens`, resolved under `<design.app>/`.

Genesis status additions (schemaVersion unchanged; both keys optional):

```json
"tournament": { "skipped": "mock-app" },
"scaffold":   { "skipped": "mock-app" }
```

## Behavior

Design stage on `/spec:run`: preflight reads `check --json` once per invocation; the hash rule
means an edit after approval is a STOP naming sketch, never a silent re-bind. Sketch: the sweep
prints every red item in the product; the session acts only on the brief's labels and leaves
the rest; a note on a screen another brief owns is an Out-of-scope fence, reported not fixed.
Genesis: each MENUS auto-pick line prints once per run while its dimension is open; a host without
`<status.app>/mock.config.ts` runs the tournament exactly as today (no behavior change on brownfield hosts,
which never reach genesis anyway).

## Acceptance Criteria

- **AC-20260914-02-1**: WHEN `spec/templates/grounding-contract.md` is read THE SYSTEM SHALL contain `"design"` described with the single sub-key `app` and contain none of `storyFormat`, `rulesManifest`, `atlasRoutes`, `copyCatalogs`, `## Render gate` → rewrites tests/consistency/contract-stamp.test.js :: AC-20260912-15-7: WHEN spec/templates/grounding-contract.md is read
- **AC-20260914-02-2**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL CONTINUE TO carry a `contractHash` equal to the first 12 characters of the SHA-256 of the current template → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20260914-02-3**: WHEN `spec/doctrine/stages/stage-design.md` and `spec/doctrine/stages/stage-review.md` are read THE SYSTEM SHALL satisfy: stage-design.md names `preflight`, `reconcile`, `look`, `stamp`, `design.app`, `status.app`, `approval.json`, `check --json`, `changed since approval`, `/spec:sketch`; neither file contains `render-gate`, `design-coverage.json`, `components.json`, `data-status`, `storyFormat`, `design-atlas`, `authorJustification`, `stories` → writes tests/consistency/design-stage-doctrine.test.js
- **AC-20260914-02-4**: WHEN `genesis-driver.js --root <host>` runs at BRIEF on a host whose `design/mocks/status.json` is `APPROVED` (schemaVersion 2), whose `design/approval.json` has journeys `first-visit` and `daily-check`, and whose `design/notes.json` has one note `status: "open"` and one journey conversation `status: "open"` THE SYSTEM SHALL print `seed journeys: 2 · notes open: 2` and never require `lib/mocks-notes` (the module is absent from the fixture's require graph: deleting `spec/scripts/lib/mocks-notes.js` in a copy of the plugin — `fs.rmSync` with `force: true`, since spec 03 deletes the file for good — leaves the run's exit unchanged) → writes tests/genesis/genesis-mock-app.test.js
- **AC-20260914-02-5**: WHEN MENUS runs on a host whose `design/mocks/status.json` says `app: "app"`, with `app/mock.config.ts` present and `framework`, `language`, `packageManager` open THE SYSTEM SHALL print `📌 Auto-picked vite-react — the mock app is the product's frontend (ADR-0028)`, `📌 Auto-picked typescript` and `📌 Auto-picked npm`, record those three as decided and `testRunner` still open, record `status.tournament = { "skipped": "mock-app" }`, and `--state` after DECIDE never prints `FINALISTS`, `RACE`, `PROBE` or `PICK` → writes tests/genesis/genesis-mock-app.test.js
- **AC-20260914-02-13**: WHEN MENUS runs on a host with no `<status.app>/mock.config.ts` THE SYSTEM SHALL CONTINUE TO leave `framework` open and SHALL CONTINUE TO print no auto-pick line → writes tests/genesis/genesis-mock-app.test.js
- **AC-20260914-02-6**: WHEN `--mark skeleton-landed` runs on a host with `app/mock.config.ts` and the stub `mock-review check --json` reports `ok: false` with one finding THE SYSTEM SHALL exit 2 printing that finding's `file` and `message` and leave `marks.skeletonLanded` null; WHEN it reports `ok: true` and the gate is green THE SYSTEM SHALL record the mark with `status.scaffold = { "skipped": "mock-app" }` and `scaffold.log` absent → writes tests/genesis/genesis-mock-app.test.js
- **AC-20260914-02-7**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL name `mock-review check` under § Genesis: Day-Zero Skeleton, `skipped: "mock-app"` under § Genesis: Tournament of Scaffolds, `design/approval.json` under § Genesis: Brief State, and contain none of `shell adopt`, `check --matrix`, `data-shell`, `design/components.json` → rewrites tests/consistency/genesis-doctrine.test.js :: AC-20260902-11-8
- **AC-20260914-02-14**: WHEN `spec/commands/genesis.md` is read THE SYSTEM SHALL CONTINUE TO be ≤120 lines and SHALL CONTINUE TO contain `/spec:mocks → /spec:genesis → /spec:enforce` → reuses tests/consistency/genesis-doctrine.test.js :: AC-20260902-08-11
- **AC-20260914-02-8**: WHEN `spec/commands/sketch.md` is read THE SYSTEM SHALL name `npx mock-review sweep`, `npx mock-review check`, `design/approval.json`, `# job:`, `# risk:`, `# choice:`, and contain none of `data-screen-label`, `data-status`, `design-atlas`, `tokens.css`, `theme compose`, `frontend-design`, `ratified`, `render-gate`, `check --matrix` → writes tests/consistency/design-stage-doctrine.test.js
- **AC-20260914-02-9**: WHEN `spec/commands/plan.md` and `spec/templates/spec.md` are read THE SYSTEM SHALL name `src/screens/` and `design/approval.json` in plan.md's roadmap-brief entry and `src/screens/<label>.tsx` in spec.md's `design_source` comment, and neither contains `design/mocks/<label>.html` → writes tests/consistency/design-stage-doctrine.test.js
- **AC-20260914-02-10**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL carry `## Design Canon`, `## Design Authoring Contracts` and `## Workflows Encode Shape, Not Judgment`, neither `## Design Render Gate` nor `## Design Atlas`, name `design/approval.json`, `src/records`, `examples` and `@/components/ui`, be ≤160 lines, and `node "$(spec-paths citations-check)"` exits 0 → writes tests/consistency/design-stage-doctrine.test.js
- **AC-20260914-02-11**: WHEN `spec-paths shared-for run-design` runs THE SYSTEM SHALL emit `## Design Canon` and `## Design Authoring Contracts` and never `## Design Render Gate` or `## Design Atlas` → rewrites tests/spec-paths.test.js :: AC-20260912-03-20
- **AC-20260914-02-15**: WHEN `spec-paths shared-for genesis` runs THE SYSTEM SHALL CONTINUE TO emit `## Design Canon`, `## Design Authoring Contracts` and `## Host Grounding` → reuses tests/consistency/genesis-doctrine.test.js :: AC-20260902-08-17: spec-paths shared-for genesis SHALL CONTINUE TO
- **AC-20260914-02-16**: WHEN `spec/scripts/spec-review-driver.js` is read THE SYSTEM SHALL contain no `render-gate` (the REVIEWER step's printed text names no advisory run) → writes tests/consistency/design-stage-doctrine.test.js
- **AC-20260914-02-12**: WHEN `init-gen.js` runs on the minimal-host fixture THE SYSTEM SHALL print JSON with no `frontendDesign` key, and `spec/commands/init.md` contains no `frontend-design` → writes tests/init-gen/generate.test.js

## Assumptions (escalation triggers)

- A1: The genesis tournament states (FINALISTS/RACE/PROBE/PICK) are derived inside one branch keyed on `status.tournament` (genesis-driver.js ~1820–1840), so recording `{ skipped: "mock-app" }` and gating that branch on `!status.tournament.skipped` is a local edit. — **if false:** add the gate at each of the four derivations in the same batch; never a second state.
- A2: `genesis-driver.js`'s SCAFFOLD handler is one function (`runShell(desc.scaffoldCommand, …)` at ~1353) so "skip when `mock.config.ts` exists" is one early return recording `status.scaffold`. — **if false:** gate every `scaffoldCommand` call site; never run it against a root holding `mock.config.ts`.
- A3: `citations-check.js` reports every `§ Design Atlas` and `§ Design Render Gate` citation across `spec/` once the sections are deleted, so the rewrite sweep is mechanical (the script is the oracle, AC-10). — **if false:** grep `§ Design (Atlas|Render Gate)` across `spec/` and `tests/` at build and enter each hit.
- A4: `tests/consistency/read-load.test.js`'s budgets (`mocks: 325`, `plan: 328`, `init: 735`, flat `500` for sketch/genesis) hold after the rewrites because every rewrite is shorter than what it replaces (sketch.md 219 → shorter; design.md ≤160). — **if false:** shorten the command file, never raise a budget.
- Collision closure (executed at lock over `render-gate`, `design-coverage`, `storyFormat`, `components.json`, `Design Atlas`, `Design Render Gate`, `authorJustification`, `data-status`, `probeFrontendDesign`): fix rows entered — `spec/commands/run.md`, `spec/doctrine/core.md`, `spec/templates/roadmap-brief.md` (§ citations), `spec/scripts/spec-review-driver.js` (printed text). Waived as comment text, never an assertion: `spec/scripts/citations-check.js`, `spec/scripts/lib/host-config.js`, `spec/scripts/lib/glob-match.js`, `tests/env-preflight.test.js`, `tests/frontmatter/frontmatter.test.js`, `tests/host-config/config-read.test.js`, `tests/genesis/genesis-driver.test.js` (fixture files carrying `data-status` that D6 (d) no longer inspects; its seven tests assert gate and scaffold behavior only). Hits inside files spec 01 rewrote or spec 03 deletes are carried by those File Plans; the rest are history under `specs/`, `docs/adr/`, `docs/roadmap/`, `docs/audit/` or stale `.claude/worktrees/` trees.
- A5: Restamping `contractHash` is the only consequence of D1 for this repo; hosts with a stale hash are told by `/spec:doctor`, and no host declares a `design` block today (explore 2026-09-14: `config.design` read only by `render-gate.js`). — **if false:** `/spec:doctor` names the stale block; nothing here migrates it.

## Rationale

Spec 01 made the driver read the mock app; this spec makes everyone else. The design stage
shrinks the most: six steps existed to author components from a mock and prove the two agreed,
and both halves are gone when the screens are the components. What survives is the part that
was always about the spec — does it bind to something approved, and is that thing still what
was approved — which is a hash comparison plus a look. Genesis keeps its tournament for hosts
without a mock app, so brownfield remains untouched, and derives the frontend for hosts with one,
because racing scaffolds against an existing app would either overwrite it or be theater.
Sketch keeps its whole triage discipline because that part was never about pixels; it loses
the ratify stamp because the page already records approval with a hash, and a second stamp
would drift from the first. The contract's `design` block loses every key but one; that edit is
the critical trigger here and is done once.

Rejected: keeping `.claude/design-coverage.json` as the claim ledger (a second record of the
same fact as `approval.json`); an `atlas` command rewrite (the reviewer's Screens and Journeys
tabs are the map — spec 03 deletes the command); letting the design stage edit screens itself
on a change reply without re-approval on the page (would make the hash rule hollow).

## Canonical Delta

`docs/canonical/design.md` is rewritten in full (spec 03 carries the file row; this spec's
delta is its content): § Design Canon = one artifact, the three layers, states as the AC
matrix, records, the approval record and its authority lifecycle; § Design Stage = the four
steps and the hash rule; § Sketch = the sweep loop and the triage bins; § Genesis and the mock
app = the derived framework, the skipped tournament and scaffold, the `check` precondition.
Every passage on the render gate, the atlas, the coverage ledger, components.json, stories and
the `.design/` sidecar is removed. `docs/canonical/genesis.md` "Brief from the approved set"
names `design/approval.json` and `design/notes.json` as the BRIEF derivation sources and
gains the D6 (b)–(d) paragraph. `docs/canonical/bootstrap.md`: the frontend-design install
offer passage is removed (D11).
