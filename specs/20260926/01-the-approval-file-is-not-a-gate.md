---
date: 2026-09-26
status: done
tier: critical
area: design
breaking: true
depends_on: []
build_base: design-retool
depended_on_by: [specs/20260926/02-the-design-contract-is-code.md, specs/20260926/03-gates-per-workspace.md]
brief: 27
open_markers: 0
diff_base: f4aa18c824fe28e60238ab9714284e9180e0abb0
---

# The approval file is not a gate

## Goal

The design canon gate between plan and build leaves the pipeline. `/spec:sketch`, the design
stage `/spec:run` used to route through, the `design_source` and `designed:` frontmatter
fields, and every plan, run, build, review and status check that read `design/approval.json`
are deleted; `/spec:mocks` and genesis keep writing and reading that file until briefs 29 and 30
retire them. The three lanes a change can travel — direct to main, prototype, plan first —
are written once, in the plugin's own Pipeline Entry doctrine. Done means: no plugin file, test,
canonical doc or README names the retired command, stage or fields; a `design: true` spec builds
without a `designed:` stamp; the status dashboard derives nothing from design fields.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/commands/sketch.md` and `spec/doctrine/stages/stage-design.md` are DELETED. Their four `spec/entrypoints.json` rows (env-preflight.js, mocks-driver.js, report-render.js ×2) are removed; every script keeps ≥1 other entry point. The `sketch` and `run-design` arms leave `spec-paths shared-for` (both fall open to the whole doctrine like every unknown command). (AC-20260926-01-3, AC-20260926-01-4, AC-20260926-01-5, AC-20260926-01-6) | ADR-0030 (a). No script loses its last caller (inventoried at lock), so no script deletion rides along. |
| D2 | `/spec:run`'s Routing loses step 1 (the design-due rung) and its `## Design stage` section; the render-server sentence about the design stage's render gate goes with it. The loop runs build then review. (AC-20260926-01-3) | The stage no longer exists; the routing table is `spec-status.js`'s `deriveNext` restated, and that script derives nothing from design fields after D4. |
| D3 | The build driver's design admission refusal (`spec declares design: true with no designed:`) is deleted: a `hardened` spec is admitted to PREFLIGHT regardless of `design:` frontmatter or a host `design` config block. (AC-20260926-01-2) | The only code reader of `config.design` in the per-feature pipeline. Legacy specs carrying `design: true` must still build. |
| D4 | `spec-status.js` stops reading `design:` and `designed:`: `allSpecs` entries carry neither key, dashboard `--json` `specs[]` carries neither key, and `next[].note` is `<status>` plus the optional ` (brief NN)` suffix — never ` [design]` / ` [designed]`. Routing is unchanged (a hardened spec → `/spec:run`). (AC-20260926-01-1) | The frozen `--json` shape loses two fields nothing consumes; `spec-status.js` is a critical-tier surface, so the change is exactly this and nothing else. |
| D5 | The spec template loses the `design:`, `designed:` and `design_source:` frontmatter lines and the UI section's design-stage sentence; `[pre-green: design-landed]` leaves the closed enum in `lib/spec-sections.js` (three members remain) and `red-check` reports a bullet carrying it as `invalid-pre-green`. (AC-20260926-01-7, AC-20260926-01-3) | No stage authors components before build any more, so the sub-shape has no producer; keeping it would let any UI AC self-certify as already shipped. |
| D6 | `/spec:plan`'s roadmap-brief entry reads a `surfaces` block as structure only: no screen read, no `approval.json` read, no `/spec:sketch` offer, no `design:` frontmatter bullet. `/spec:status`'s tag narration for `[design]`/`[designed]` is deleted. The reviewer agent's "design-stage approvals" not-finding clause is deleted. (AC-20260926-01-3) | ADR-0030 (a): `surfaces` blocks stay as structure for genesis and prototypes, never a gate (brief 27 open question 1, default taken). |
| D7 | The three lanes land as one paragraph in `spec/doctrine/core.md` § Pipeline Entry, the section that already holds the direct-work default: **direct** — a change stated in one sentence with no behaviour or data change is made on main through the host's `gateCommand`, no spec, no branch, the commit-time escape offer still runs; **behaviour** — a prototype (brief 28's command once it exists; a spec until then); **structural** — a schema or API change is planned first. A spec branch lands only through the review stage's merge-back; a direct change never has a branch, which is how the lanes are told apart at commit time. `/git:merge` gains no refusal. [no-ac: doctrine prose with no executable surface; `shared-for plan|init|genesis` already serve § Pipeline Entry, and the retired-literal sweep AC-20260926-01-3 is the mechanical residue] | ADR-0030 (d) and § Doctrine Authoring (one binding home). The brief's premise that `/git:merge` refuses a branch without a review row is false against the code (Rationale); a new refusal for a bypass with zero recurrences fails § Incident Policy. |
| D8 | `spec/doctrine/design.md` § Design Canon is rewritten for `/spec:mocks` and genesis only: the mock app is the artifact `/spec:mocks` authors; `design/approval.json` is written only by `mock-review approve --screen <name>` on the user's literal `approve`; look stops print `🎨 ready for review — <url>` and end the turn. Gone: the design stage, `/spec:sketch`, `design: true` routing, `design_source`, approved-vs-stale as a gate, and "authority inverts to built". § Design Authoring Contracts loses its design-stage reconcile paragraph and the "design stage's reconcile step" consumer line; § Workflows Encode Shape loses `/spec:sketch`. The file stays ≤160 lines and keeps the literals `design/approval.json`, `src/records`, `examples`, `@/components/ui`. (AC-20260926-01-3, AC-20260926-01-8) | `shared-for mocks|genesis|init` still serve § Design Canon; the approve-writer rule and the look-stop rule are what those commands need. AC-20260914-02-10's pin on the surviving literals is reused, not weakened. |
| D9 | `spec/doctrine/core.md` § State Machine drops "then runs design (when due)" and the "design stage never moves status" sentence; the lifecycle paragraph drops "design when due"; § Model Placement drops "sketch brainstorms". `stage-build.md`'s "design-landed component" paragraph is reworded to the generic rule it already enforces (an already-tracked `CREATE` row earns a WARN, never a refusal) with no design-stage sentence. (AC-20260926-01-3) | Same retirement, same sweep. The build-driver-base pin (`the pin beats the ref: a design-landed component is not called stub residue`) is behavioural and stays green untouched. |
| D10 | Retired-literal sweep: across `spec/`, `git/`, `scripts/`, `tests/`, `README.md`, `docs/canonical/` and `.claude/rules/` (never `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/`, `docs/spikes/`, `.claude/spec-runs*`, `.claude/worktrees/`, `node_modules/`) the literals `design_source`, `designed:`, `stage-design`, `spec:sketch`, `inverts to built` and `run-design` occur zero times, and neither deleted file exists. The sweeping test builds each literal by concatenation so it never matches itself. (AC-20260926-01-3) | Brief 27 scope 1's zero-hit AC. `docs/canonical/` is live surface the repo-wide retired-name sweep walks (pipeline rules Gotchas), so its edits are File Plan rows, not a Canonical Delta paragraph. The two frontmatter parser tests that used `design_source:` as a fixture key are retagged to a neutral key with no AC (fixture currency, never a red). |
| D11 | Done specs whose only citing test is deleted get `[retired: specs/20260926/01-the-approval-file-is-not-a-gate.md]` on that AC's pointer line: specs/20260914/02 AC 3, AC 9, AC 11 and specs/20260824/02 AC 3. Tests edited in place keep their AC-IDs (specs/20260914/02 AC 8 and AC 10 survive on their remaining assertions). (AC-20260926-01-3) [no-ac: sidecar edits to done specs; the live `ac-drift-clean` pin is the oracle] | Twelfth collision trigger in the pipeline rules Gotchas: an uncited done-spec AC reddens `ac-drift-clean.test.js` in a file no File Plan names. |
| D12 | The spec plugin bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; its description no longer names `/spec:sketch` or "design when due". README loses the sketch row, the sketch quickstart line and the Chrome note's sketch mention. [no-ac: `plugin-bump.js --check` in the gate is the oracle; README is covered by AC-20260926-01-3's sweep] | Pipeline rules § Planning version-bump discipline. |
| D13 | Build-time ruling (user, 2026-09-26): two out-of-plan edits join scope. `spec/scripts/red-check.js`'s `invalid-pre-green` detail names the out-of-enum reason(s) and lists `PRE_GREEN_REASONS` (class, exit code and shape unchanged) — AC-7 promises that message and no File Plan row delivered it. `specs/20260912/03-run-isolates-and-owns-the-stages.md` AC 20's pointer line gets the D11 `[retired: …]` tag — the deleted spec-paths test was its only citation (the D11 lock grep missed it). (AC-20260926-01-7) | Both are forced by this spec's own promises; the user ruled add-to-scope over pause. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/sketch.md | DELETE | doctrine | D1 — the per-brief design workbench |
| spec/doctrine/stages/stage-design.md | DELETE | doctrine | D1 — preflight → reconcile → look → stamp |
| spec/commands/run.md | MODIFY | doctrine | D2 — frontmatter description drops "design (when due)"; Routing step 1 and `## Design stage` deleted; render-server sentence about the design stage's render gate deleted; remaining steps renumbered 1–3 |
| spec/commands/plan.md | MODIFY | doctrine | D6 — Entry: `surfaces` block is structure only (one sentence replaces the screen/approval/sketch bullet text); the `design:` bullet under Draft deleted |
| spec/commands/status.md | MODIFY | doctrine | D6 — drop the `[design]`/`[designed]` tag sentence |
| spec/doctrine/design.md | MODIFY | doctrine | D8 — § Design Canon rewritten for mocks/genesis; reconcile paragraph and sketch mention removed; ≤160 lines |
| spec/doctrine/core.md | MODIFY | doctrine | D7 lanes paragraph in § Pipeline Entry; D9 lifecycle, § State Machine, § Model Placement edits |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D9 — already-tracked CREATE row paragraph reworded without the design stage |
| spec/agents/reviewer.md | MODIFY | doctrine | D6 — Not findings: drop the `designed:` clause |
| spec/templates/spec.md | MODIFY | doctrine | D5 — frontmatter lines 6, 12, 13 removed; UI section sentence removed; `design-landed` removed from the pre-green enum text |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D6 — Surfaces comment: structure genesis and prototypes read; no sketch, no plan warning. The `Design stage:` header field stays (genesis writes it; brief 30 owns it) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; description names neither sketch nor design-when-due |
| spec/bin/spec-paths | MODIFY | scripts | D1 — delete the `sketch)` and `run-design)` arms and the run-design comment block |
| spec/scripts/spec-status.js | MODIFY | scripts | D4 — drop `design`/`designed` from `allSpecs` entries and the note suffix; the `design_source` example in the frontmatter comment reworded |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D3 — delete the design admission block; the three "design stage" comments (incl. the `stage-design.md` path citation) reworded |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D5 — `PRE_GREEN_REASONS` loses `design-landed`; its explanatory comment deleted |
| spec/scripts/lib/frontmatter.js | MODIFY | scripts | D10 — comment example `design_source:` → a neutral key |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D9 — header comment "design-leg dispatch" reworded (comment only) |
| spec/scripts/red-check.js | MODIFY | scripts | D13 — `invalid-pre-green` detail names the bad reason and the valid set |
| spec/entrypoints.json | MODIFY | other | D1 — remove the four rows naming sketch.md / stage-design.md |
| README.md | MODIFY | other | D12 — sketch row, quickstart line, Chrome note, run row wording |
| docs/canonical/design.md | MODIFY | other | D10 — § Design Canon trimmed to the D8 shape; § Design Stage and § Sketch sections deleted; § mock stage and § Genesis sections untouched |
| docs/canonical/genesis.md | MODIFY | other | D10 — "the theme is picked in `/spec:sketch`" → "the theme is picked in `/spec:mocks`" |
| docs/canonical/build-integrity.md | MODIFY | other | D10 — the `design-landed` sentence deleted |
| specs/20260914/02-genesis-run-and-sketch-read-the-mock-app.md | MODIFY | other | D11 — `[retired: …]` tag on AC 3, AC 9, AC 11 pointer lines |
| specs/20260824/02-design-stage-on-render-gate.md | MODIFY | other | D11 — `[retired: …]` tag on AC 3's pointer line |
| specs/20260912/03-run-isolates-and-owns-the-stages.md | MODIFY | other | D13 — `[retired: …]` tag on AC 20's pointer line |
| tests/consistency/design-canon-retired.test.js | CREATE | tests | AC-20260926-01-3 |
| tests/spec-status.test.js | MODIFY | tests | AC-20260926-01-1 (rewrite the two design-note tests; the `[designed]` assertion goes) |
| tests/build/build-driver-design-admission.test.js | CREATE | tests | AC-20260926-01-2 (uses `build-driver.fixtures.js`'s `specBody({design:'true'})` and `makeHost`, adding a `design` block to the host config) |
| tests/consistency/entrypoints.test.js | MODIFY | tests | AC-20260926-01-4 (EXPECTED map and the stage-file set in the AC-20260912-03-7 test) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260926-01-5, AC-20260926-01-6; delete the AC-20260914-02-11 test and the `shared-for run-design` delta test |
| tests/consistency/read-load.test.js | MODIFY | tests | AC-20260926-01-6 (SHARED_FOR table loses `sketch` and `run-design`) |
| tests/consistency/design-stage-doctrine.test.js | MODIFY | tests | delete the AC-20260914-02-3 and AC-20260914-02-9 tests; AC-20260914-02-8 keeps only its retired-phrase assertions over design.md, mocks.md, mocks-driver.js and mock.config.ts; AC-20260914-02-10 and AC-20260914-02-16 untouched (AC-20260926-01-8 reuses -10) |
| tests/env-preflight.test.js | MODIFY | tests | delete the AC-20260824-02-3 test (reads stage-design.md) |
| tests/red-check/red-check.test.js | MODIFY | tests | AC-20260926-01-7 (enum loop → three members; the "four-member closed enum" test asserts three; the two design-landed tests collapse into one refusal test) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | assert message at the AC-20260907-05-8 test no longer says `/spec:sketch` (message only; no AC) |
| tests/frontmatter.test.js | MODIFY | tests | fixture key `design_source:` → `source_url:` (no AC — fixture currency) |
| tests/frontmatter/frontmatter.test.js | MODIFY | tests | fixture key `design_source:` → `source_url:` in DOC (no AC — fixture currency) |

Orchestrator duty outside the table: `docs/canonical/design.md`'s edit is applied by the build
wave (it is a File Plan row), so the review stage's Canonical Delta step finds nothing further to
apply (Canonical Delta below says so).

## Contracts

`spec-status.js --json` dashboard, `specs[]` entry key set after D4 (the `design` and `designed`
keys are gone; every other key unchanged):

```
{ path, status, brief, area, date, depends_on, superseded_by, filePlan, observation }
```

`--next --json` `next[].note` grammar after D4:

```
note := <status> [" (brief " NN ")"]
e.g.  "hardened (brief 27)"   — never "hardened [design] (brief 27)"
```

`lib/spec-sections.js` closed enum after D5:

```js
const PRE_GREEN_REASONS = ['fallback-rejection', 'absence-invariant', 'predicate-in-test']
```

Lanes paragraph (D7), landed verbatim as the last paragraph of core.md § Pipeline Entry:

> Changes travel one of three lanes, chosen by the shape of the ask. **Direct**: a change
> stated in one sentence with no behaviour or data change (copy, spacing, a token value, a
> component variant) is made on main through the host's `gateCommand` — no spec, no branch;
> the commit-time escape offer still runs. **Behaviour**: a behaviour change starts as a
> prototype (the prototype command once it exists; a spec until then). **Structural**: a schema
> or API change is planned first — a spec. A spec branch lands only through the review stage's
> merge-back; a direct change never has a branch, which is how the lanes are told apart at
> commit time.

## Behavior

`/spec:run` on a hardened spec: Step 0 isolation, then build, then review — the routing table
has three rungs. A spec that still carries `design: true` in frontmatter (every UI spec locked
before this one) is admitted to build exactly like one without it; the field is inert, never an
error. `/spec:status` prints a hardened spec's note as `hardened (brief NN)`.

`/spec:plan` on a UI-bearing brief: the `surfaces` block is read as the brief's structure (labels
and journey edges) and nothing is checked against `design/approval.json`. `/spec:mocks` and
`/spec:genesis` are unchanged — they keep reading and writing `design/approval.json` through the
package, and `shared-for mocks|genesis|init` keep serving § Design Canon.

`red-check` on a bullet tagged `[pre-green: design-landed]`: the tag is not in the enum, so the
existing `invalid-pre-green` finding fires, naming the three valid reasons.

## Acceptance Criteria

- **AC-20260926-01-1**: WHEN `spec-status.js --root <host> --next --json` runs over a host whose `specs/20260719/05-ui.md` is `status: hardened`, `design: true`, `designed: 2026-07-21`, `brief: 04` THE SYSTEM SHALL route it to `/spec:run` with `note` exactly `hardened (brief 04)` (no `[designed]`, no `[design]`), and the dashboard `--json` `specs[]` entry for it SHALL carry neither a `design` nor a `designed` key (`Object.keys(entry)` excludes both) → rewrites tests/spec-status.test.js :: AC-20260824-02-4
- **AC-20260926-01-2**: WHEN the build driver runs on a `hardened` spec whose frontmatter is `design: true` with no `designed:` line, in a host whose `.claude/spec.config.json` carries `"design": { "app": "app" }` THE SYSTEM SHALL proceed past admission into PREFLIGHT (stderr does not match `/designed:|run \/spec:run .* first/` and the process does not exit with the die code before env-preflight runs; the spec flips to `implementing` when preflight is green) → writes tests/build/build-driver-design-admission.test.js
- **AC-20260926-01-3**: WHEN the retired-literal sweep runs over `spec/`, `git/`, `scripts/`, `tests/`, `README.md`, `docs/canonical/` and `.claude/rules/` (excluding `specs/`, `docs/roadmap/`, `docs/adr/`, `docs/audit/`, `docs/spikes/`, `.claude/spec-runs*`, `.claude/worktrees/`, `node_modules/`, and the sweeping test's own file) THE SYSTEM SHALL find zero occurrences of each of `design_source`, `designed:`, `stage-design`, `spec:sketch`, `inverts to built`, `run-design` (each assembled by string concatenation in the test), and `spec/commands/sketch.md` and `spec/doctrine/stages/stage-design.md` SHALL not exist (`fs.existsSync` → `false`) → writes tests/consistency/design-canon-retired.test.js
- **AC-20260926-01-4**: WHEN `spec/entrypoints.json` is read THE SYSTEM SHALL list `spec/scripts/env-preflight.js` with entry points `spec/commands/doctor.md`, `spec/scripts/spec-build-driver.js`, `spec/scripts/review-legs.js` and no `stage-design.md`; `spec/scripts/mocks-driver.js` with no `sketch.md`; `spec/scripts/report-render.js` with `stage-build.md` and `stage-review.md` present and neither retired file — and the live-repo forward check SHALL report zero "entry-point file does not exist" violations → rewrites tests/consistency/entrypoints.test.js :: AC-20260912-03-7: spec/entrypoints.json's former
- **AC-20260926-01-5**: WHEN `spec-paths shared-for sketch` or `spec-paths shared-for run-design` runs THE SYSTEM SHALL fall open exactly like an unknown command — stdout begins with core.md's frontmatter and contains `## Design Canon` — and the scoped roster (every `<cmd>) SECTIONS=` arm) SHALL have exactly 12 members, none of them `sketch` or `run-design` → rewrites tests/spec-paths.test.js :: shared-for: every scoped command serves § Session Execution
- **AC-20260926-01-6**: WHEN `spec-paths shared-for <cmd>` runs for every scoped command THE SYSTEM SHALL print exactly the pinned section list per command with `sketch` and `run-design` absent from the pinned table, and the 12 remaining commands' lists SHALL be unchanged from the pre-image (e.g. `plan` still begins `Host Grounding, Pipeline Entry, Tiers`) → rewrites tests/spec-paths.test.js :: shared-for: scoped output carries its sections
- **AC-20260926-01-7**: WHEN `red-check.js` reads a tests-layer File Plan row whose carried AC bullet `AC-20260821-95-1` carries a pre-green tag with the reason `design-landed` (the bullet written in the test's own fixture spec) THE SYSTEM SHALL exit 1 with one `invalid-pre-green` finding naming `design-landed` and the three valid reasons `fallback-rejection`, `absence-invariant`, `predicate-in-test`; and `PRE_GREEN_REASONS` SHALL export exactly those three → rewrites tests/red-check/red-check.test.js :: AC-20260821-01-1: a tests-layer file whose carried AC declares the design-landed pre-green reason
- **AC-20260926-01-8**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL CONTINUE TO carry `## Design Canon`, `## Design Authoring Contracts`, `## Workflows Encode Shape, Not Judgment`, name `design/approval.json`, `src/records`, `examples`, `@/components/ui`, stay ≤160 lines, and `citations-check.js` SHALL CONTINUE TO exit 0 → reuses tests/consistency/design-stage-doctrine.test.js :: AC-20260914-02-10

## Assumptions (escalation triggers)

- A1: Deleting the `sketch)` and `run-design)` arms leaves 12 scoped arms. **Executed at lock:** `grep -E '^\s+[a-z-]+\)\s+SECTIONS="' spec/bin/spec-paths | grep -v run-design | grep -vc 'sketch)'` → `12`. The `shared-for: every scoped command serves § Session Execution` test's floor is `>= 13` and must become `>= 12` (AC-5). — **if false:** count the arms the same way and set the floor to the observed number; never add an arm to satisfy the floor.
- A2: No script loses its last entry point when the two files are deleted: env-preflight.js keeps 3, mocks-driver.js keeps 3, report-render.js keeps 16 (inventoried from `spec/entrypoints.json` at lock). — **if false:** the orphaned script's deletion moves into this spec (eleventh collision trigger), with its own DELETE row and `spec-paths` key removal.
- A3: No test pins `run.md`'s routing prose, `core.md`'s "design (when due)", `reviewer.md`'s `designed:` clause, or the build driver's admission refusal — grepped at lock (`tests/build/build-driver.fixtures.js` has a `design` parameter no caller passes). — **if false:** the pin's file enters the File Plan as a rewrite row retagged with the covering AC, never weakened.
- A4: `tests/consistency/ac-drift-clean.test.js` reads AC ownership from defining `## Acceptance Criteria` bullets and honours a `[retired: <spec>]` tag on the pointer line (Gotchas, twelfth trigger). — **if false:** STOP, ask the user; the alternative (deleting done-spec ACs) rewrites history.
- A5: The sweep's exclusion list is complete: `.claude/worktrees/agent-*` holds three stale full-repo copies with ~70 hits each, and `.claude/spec-runs/*.json` holds historical review records. — **if false:** add the offending prefix to the exclusion list in the test and the Decision; never delete history to make a sweep green.
- A6: New-script naming is not exercised by this spec (no script is created). Node's default test discovery was nevertheless probed for the sibling specs' names at lock: two files named `design-contract-check.js` and `workspace-scan.js` under `spec/scripts/` in a scratch tree → `node --test` printed `ℹ tests 0`. — **if false:** n/a here.

## Rationale

Brief 27 scope 1 asked for four things: delete the sketch command and the design stage, drop
the frontmatter contract and its readers, name the lanes, and narrow the `/git:merge` review-row
refusal to spec branches. The first three are what this spec does. The fourth rests on a
premise the code contradicts: `git/commands/merge.md` has no ledger read and no review-row
refusal — its only STOP is a dirty tree — and the ledger's `via: "direct"` rows mean "a stage
invoked outside the loop", not "a spec-free commit to main". So there is nothing to narrow. The
option to *create* a refusal now was rejected under § Incident Policy: a standing guard is
earned by a third recurrence, and a hand-merge of a spec branch around review has zero recorded
recurrences. Spec branches land through the review driver's merge-back; that sentence is the
lanes paragraph's discriminator.

The lanes go into core.md § Pipeline Entry, not a new host rules section: that section already
holds "the default is direct work gated by the host's `gateCommand`", § Doctrine Authoring
demands one binding home, and a new required host section would re-hash the grounding contract
for every host to say something no host may customise.

Everything the brief listed as "the `mock-authoring` skill's approval half" lives in
`design.md` § Design Canon and the two deleted files, not in the skill (26 lines, four authoring
rules, no approval prose). The skill is untouched.

`design.md` is rewritten rather than deleted because `shared-for mocks|genesis|init` serve
§ Design Canon and mocks.md cites it for the `mock-review approve` writer rule. The surviving
text is the mocks-stage contract only.

The File Plan carries 18 source-layer rows against the ~12 guideline. It was kept as one spec
because the rows are deletions and one-sentence edits of one retirement, and any landing-unit
split leaves the surviving half pointing at a stage that no longer exists for a spec's lifetime.

Critical tier: `spec-status.js` (frozen `--json` API) and `spec/bin/spec-paths` are both
listed critical surfaces in the pipeline rules § Risk Tiers. Every AC carries a literal.

No `SHALL CONTINUE TO` pin beyond AC-8 (design.md's surviving shape) is added: the retired
surfaces have no behaviour to keep, and the sweep is the guard that outlives close.

Collision closure at lock (`collision-closure --literal design_source --literal designed: --literal stage-design --literal spec:sketch --literal run-design --literal design-landed --literal "inverts to built"`): every literals-leg hit under `spec/`, `tests/`, `README.md` and `docs/canonical/` is a File Plan row except `tests/build/build-driver-base.test.js` (a test title says `design-landed`; the behaviour it pins is generic and `design-landed` is not in the sweep set — waived). Hits under `docs/roadmap/`, `docs/adr/`, `docs/audit/` and `docs/spikes/` are history the sweep excludes by design — waived. `executes` hits on `lib/frontmatter.js` (comment-only edit) and `lib/spec-sections.js` (the enum shrinks; the one test asserting its size is a File Plan row) need no fixture repair beyond the rows listed.

Not queued as separate work: q245 ("surfaces blocks declare flow order, and sketch refuses an
unordered one") is voided by D1 and is marked done at lock with that reason.

Build-time one-offs (2026-09-26): the test author retitled the tests the `→ rewrites` pointers
name, and red-check resolves a pointer by title prefix, so the orchestrator restored each pointed
title as the prefix with the new AC-ID following it. The two out-of-plan edits (red-check's
`invalid-pre-green` detail; the 20260912/03 AC 20 retired tag) were recorded as D13 on the user's
add-to-scope ruling. Review iteration 1 found AC-8 uncovered by ID (the `reuses` pointer does not
count for ac-matrix); the fix tagged the reused test's title, and the fix-delta pass was CLEAN.

## Canonical Delta

Already applied by this spec's own File Plan rows (`docs/canonical/design.md`, `genesis.md`,
`build-integrity.md` are MODIFY rows, D10), because `docs/canonical/` is walked by the
retired-name sweep and a Delta paragraph narrating the retirement would red the sweep at the
close commit. The review stage applies nothing further. Content landed: § Design Canon in
`docs/canonical/design.md` describes the mock app as `/spec:mocks`'s artifact, the package as
the only writer of the approval record, and look stops as printed turn-enders; the sections on
the plan-to-build stage and the per-brief sweep loop are gone; `genesis.md` says the theme is
picked in the mocks stage; `build-integrity.md` names three pre-green reasons.
