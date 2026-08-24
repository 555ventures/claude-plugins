---
date: 2026-08-24
status: hardened
tier: critical           # removes spec-paths keys (key-set edit — critical trigger, precedent specs/20260823/01) and edits spec/templates/grounding-contract.md (contract hash)
area: design-stage
design: false
breaking: false
depends_on: [specs/20260824/04-render-rules.md]
depended_on_by: []
brief: 08
open_markers: 0
---

# Design doctrine cut and source-gate feed retirement

## Goal

Rewrite `spec/doctrine/design.md` around the render gate — contracts and invariants only —
with the ~80% cut the core commands got, and retire the source-grep feed that only existed
to serve the old gate: `dc-extract.js`, `fidelity-check.js`, their tests, the `.design/`
sidecar's remaining traces (gitignore generation, this repo's manifest claim, doctor's
orphan check, the spec template's comments), and the retainer/vision language. Done means:
`design.md` is at most 160 lines, every `§` citation in the corpus resolves, no plugin file
names a deleted script, and the host contract no longer requires `copyCatalogs`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design.md` is rewritten to five sections, in this order and with these exact headings: `## Design Canon (mocks, tokens, harness)`, `## Design Authoring Contracts`, `## Design Render Gate`, `## Design Atlas`, `## Workflows Encode Shape, Not Judgment`; total length ≤ 160 lines; the file's frontmatter `description` names the render gate (AC-20260824-05-1, AC-20260824-05-2) | Brief Scope 6; the heading set is what `shared-for` and every `§` citation resolve against |
| D2 | Content rule for the rewrite: keep every sentence that is a **contract a script enforces or a worker applies** (mark vocabulary, targets matrix, mock-authority lifecycle, grounded-vs-taste, base primitives, manifest + author justification, commitment entries, render gate exits/findings/tolerances, ledger shape, atlas badges and triage), delete every sentence that is **history, rationale for a retired mechanism, or a model seat** (retainer, vision consult, skeletons, extract, deltas, fidelity review, `ITERATE`, `FIDELITY_REVIEW`, v6 provenance, Claude Design fetch mechanics beyond one sentence naming it as a read-only escape hatch) [no-ac: authoring rule; AC-1/2/3 observe the result] | core § Model Placement: no resident consultant; `frontend-design` is the instructional layer (ADR-0001) |
| D3 | `## Design Render Gate` states: the gate's inputs (mock, story per state, matrix), the finding classes and tolerances by reference to `render-gate.js`'s header, the exclusions by mark, the auto-excuse policy, the rules pass, the ledger binding, and the fail-closed rule — nothing about how the stage sequences them (that is `/spec:design`) [no-ac: prose; sections pinned by AC-1] | Doctrine holds invariants; commands hold sequence |
| D4 | `spec-paths` `shared-for` lists: `design` → `Host Grounding\|State Machine\|Design Canon\|Design Authoring Contracts\|Design Render Gate\|Design Atlas\|Model Placement\|Decisions\|Question Style\|Console Output Style\|Worker Git Ban\|Read-Only Surfaces\|MCP Policy`; `atlas`, `sketch`, `genesis-*` unchanged (their sections survive by name) (AC-20260824-05-3) | The existing `shared-for` test fails on any map naming a vanished heading |
| D5 | `dc-extract.js` and `fidelity-check.js` are deleted with `tests/dc-extract.test.js`, `tests/dc-extract-anchor-rule.test.js`, `tests/dc-extract-inline-join.test.js`, `tests/fidelity-check.test.js`; keys `dc-extract`, `fidelity-check` and both `entrypoints.json` rows go; `tests/host-config/host-config-api.test.js` loses its AC-20260820-08-9 test (its subject is gone; the `CONFIG_RELPATH` remedy rule stays pinned by the review-legs test in the same file) (AC-20260824-05-4) | ADR-0002: the source gate and its extractor lose their consumer |
| D6 | The `.design/` sidecar is retired everywhere it is still written or checked: `init-gen.js` no longer emits the `specs/**/*.design/` gitignore line (the `.claude/worktrees/` line stays); this repo's `.gitignore` drops it; `.claude/spec-manifest.json`'s claim becomes `worktree gitignore rule present` with the worktree target only; `spec/commands/doctor.md` drops the orphaned-sidecar bullet; `spec/templates/spec.md` UI-section and `design_source` comments are rewritten to the render-gate flow (AC-20260824-05-5) | A sidecar nothing writes must not be provisioned by init or audited by doctor |
| D7 | Contract edit (the one per spec): `design.copyCatalogs` and `design.screenshot` become **legacy-tolerated** (accepted, unread) and the "REQUIRED when the host routes copy through an i18n stack" sentence is deleted; `design.render` (spec 01) is unchanged [no-ac: contract prose; hash change observed by `contract-hash`] | The render gate reads painted text — catalog values are already what paints; a required key with no consumer is a lie in the contract |
| D8 | Comment sweeps naming retired scripts: `.claude/agents/gate-scripts.md` example list (`fidelity-check.js` → `render-compare.js`); `tests/tracked-text-purity.test.js` and `tests/review/review-driver.test.js` headers keep their incident history verbatim (a dated incident may name a file that no longer exists) [no-ac: comment edits] | Doctor's stale-path check reads doctrine and agents, not test comments; history stays history |
| D9 | `docs/canonical/design.md` is rewritten to the four landed sections (render gate, design stage, mock hygiene, executable rules) plus the surviving component-vocabulary and atlas-sweep entries; `docs/canonical/pipeline.md` drops the driver from the frontmatter readers list — applied as Canonical Delta by review, not File Plan rows [no-ac: review-applied] | Canonical loop |
| D10 | Regression pins: `spec-paths shared-for design` continues to serve `Design Canon` and `Design Atlas` and stays a strict subset of the full doctrine (AC-20260824-05-6); `citations-check.js` over the corpus continues to report `MISS=0` (AC-20260824-05-7); `init-gen` continues to write exactly one `.claude/worktrees/` gitignore line across two runs (AC-20260824-05-5) | The rewrite must be observed to keep what it keeps |
| D11 | New-surface checklist: plugin.json bump to next free 7.35.x with a changelog paragraph that names the five-spec series and the deleted files [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/design.md | MODIFY | doctrine | Full rewrite (D1–D3): five sections, ≤ 160 lines, no retired mechanism or seat named |
| spec/bin/spec-paths | MODIFY | scripts | Remove keys `dc-extract`, `fidelity-check` + usage entries; `design)` shared-for list per D4 |
| spec/entrypoints.json | MODIFY | scripts | Drop `dc-extract.js` and `fidelity-check.js` rows |
| spec/scripts/init-gen.js | MODIFY | scripts | Drop the `specs/**/*.design/` gitignore entry (D6); header comment history line |
| spec/commands/doctor.md | MODIFY | doctrine | Remove the orphaned-design-sidecar bullet (D6) |
| spec/commands/init.md | MODIFY | doctrine | Phase 6 / config summary line: drop the `copyCatalogs` detection mention (D7) — one line |
| spec/templates/spec.md | MODIFY | doctrine | UI-section comment and `design_source` comment rewritten to the render-gate flow (D6) |
| spec/templates/grounding-contract.md | MODIFY | doctrine | `copyCatalogs`/`screenshot` legacy-tolerated; REQUIRED sentence deleted (D7) — the single contract edit |
| .claude/agents/gate-scripts.md | MODIFY | other | Example script list (D8) |
| .claude/spec-manifest.json | MODIFY | other | Gitignore claim narrowed to the worktree rule (D6) |
| .gitignore | MODIFY | other | Drop `specs/**/*.design/` (D6) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump (target 7.35.0, next-free rule) + changelog |
| tests/consistency/design-doctrine.test.js | CREATE | tests | AC-20260824-05-1, AC-20260824-05-2, AC-20260824-05-4 |
| tests/spec-paths.test.js | MODIFY | tests | Remove the two keys from the resolve-all list; AC-20260824-05-3, AC-20260824-05-6 (tag the existing shared-for subset test) |
| tests/consistency/citations-check.test.js | MODIFY | tests | AC-20260824-05-7 — tag the live-corpus zero-miss test (create it if none exists: run `citations-check.js --root .`, assert `MISS=0`) |
| tests/init-gen/generate.test.js | MODIFY | tests | AC-20260824-05-5 — AC-20260822-02-3's test updated in place: one worktrees line, zero `.design/` lines |
| tests/host-config/host-config-api.test.js | MODIFY | tests | Remove the AC-20260820-08-9 test (subject deleted, D5); header comment updated |

Orchestrator duties outside the table: `git rm` `spec/scripts/dc-extract.js`,
`spec/scripts/fidelity-check.js`, `tests/dc-extract.test.js`,
`tests/dc-extract-anchor-rule.test.js`, `tests/dc-extract-inline-join.test.js`,
`tests/fidelity-check.test.js` before the scripts batch runs.

## Contracts

`design.md` skeleton (headings verbatim; body per D2/D3):

```markdown
---
description: Design-stage doctrine — Design Canon, Authoring Contracts, Render Gate, and Atlas; fidelity is judged at the render (ADR-0002)
---
# Spec Pipeline: Design Doctrine
## Design Canon (mocks, tokens, harness)
## Design Authoring Contracts
## Design Render Gate
## Design Atlas
## Workflows Encode Shape, Not Judgment
```

`grounding-contract.md` `design` line after D7: `design` (`tool`/`command`/`storyFormat`/
`doctrine`/`render` — see § Render gate; optional `rulesManifest`, `atlasRoutes`,
`gateCommand`; legacy-tolerated and unread: `copyCatalogs`, `screenshot`).

## Behavior

- Hosts with `copyCatalogs` declared keep passing `/spec:doctor`'s config check (tolerated
  keys are never warnings); the `contractHash` mismatch is the only signal, with the standard
  `/spec:init --refresh` remedy.
- `spec-paths shared-for design` output shrinks accordingly; commands that cite `§ Design
  Binding Pipeline` are edited in the same build (the collision-closure run at lock lists
  them; see Assumptions A2).

## Acceptance Criteria

- **AC-20260824-05-1**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL contain
  exactly the five `## ` headings of D1 in that order and no other `## ` heading →
  `tests/consistency/design-doctrine.test.js`
- **AC-20260824-05-2**: WHEN `spec/doctrine/design.md` is read THE SYSTEM SHALL be ≤ 160
  lines and contain none of the literals `dc-extract`, `fidelity-check`, `skeletons`,
  `deltas.json`, `retainer`, `vision consult`, `FIDELITY_REVIEW`, `ITERATE`, `wf-design` →
  `tests/consistency/design-doctrine.test.js`
- **AC-20260824-05-3**: WHEN `spec-paths shared-for design` runs THE SYSTEM SHALL emit the
  `## Design Render Gate` section and SHALL NOT emit `Design Binding Pipeline` →
  `tests/spec-paths.test.js`
- **AC-20260824-05-4**: WHEN `spec-paths dc-extract` or `spec-paths fidelity-check` is
  invoked THE SYSTEM SHALL exit non-zero with the usage line, and neither
  `spec/scripts/dc-extract.js` nor `spec/scripts/fidelity-check.js` SHALL exist →
  `tests/consistency/design-doctrine.test.js`
- **AC-20260824-05-5**: WHEN `init-gen.js` generates twice (second run `--refresh`) THE SYSTEM
  SHALL CONTINUE TO write exactly one `.claude/worktrees/` gitignore line and SHALL write zero
  `specs/**/*.design/` lines → `tests/init-gen/generate.test.js` (AC-20260822-02-3's test,
  updated in place)
- **AC-20260824-05-6**: WHEN `spec-paths shared-for design` runs THE SYSTEM SHALL CONTINUE TO
  include `## Design Canon` and `## Design Atlas` and stay strictly shorter than the full
  doctrine → `tests/spec-paths.test.js` (existing subset test, tagged)
- **AC-20260824-05-7**: WHEN `citations-check.js --root .` runs over the live corpus THE
  SYSTEM SHALL CONTINUE TO print `MISS=0` → `tests/consistency/citations-check.test.js`

## Assumptions (escalation triggers)

- A1: `design.md`'s five surviving heading names are cited by prefix in commands (`shared §
  Design Canon`, `§ Design Atlas`, `§ Design Authoring Contracts`); `§ Design Binding
  Pipeline` is cited in `spec/commands/design.md` (rewritten in spec 02 — verify at build that
  no citation survived) and `docs/canonical/design.md` (Canonical Delta) — **if false**
  (another live citation): edit it in the same build; citations-check names it.
- A2: Collision-closure literals leg at lock (`--literal dc-extract --literal fidelity-check
  --literal skeletons --literal deltas --literal sidecar --literal regionRef --literal
  retainer`) — every `likely` hit is in this File Plan or in an earlier sibling's; hits inside
  `specs/`, `docs/audit/`, `docs/adr/`, and `docs/roadmap/` are history and waived by
  location — **if false** at build (a live plugin file hit): add the row, never a stale
  reference.
- A3: `tests/consistency/citations-check.test.js` has no live-corpus zero-miss test today
  (unverified at lock — the file's AC-1/AC-2 tests use fixtures) — **if false** (one exists):
  tag it instead of creating one.
- A4: The plugin's `README.md` describes `/spec:design` as "mock → components → your approval"
  (read 2026-08-24) — still true; no README row (memory: single high-value README, never
  per-plugin).
- A5: No dependency-adjudicated claim is locked here; the size cap is a line count (precedent:
  `prose-cap.js` caps entry bullets — a cap is arithmetic, not a regex over meaning).

## Rationale

The doctrine is cut last so it documents what landed, not what was planned. The size cap is
the enforcement: a doctrine that must fit 160 lines cannot carry a retired mechanism's
rationale, and the literal ban (AC-2) is the reopen condition for every seat and artifact this
series deleted — a future edit that reintroduces a retainer or a sidecar reddens the suite.
The five headings are the citation surface; keeping four names unchanged means the atlas,
sketch, and genesis section lists need no edit, and one renamed section (`Binding Pipeline` →
`Render Gate`) is exactly the collision the lock-time closure run enumerates. `copyCatalogs`
stops being required because the thing that required it (verbatim copy in source) is not what
the gate judges — painted text is, and catalog values are what paints.

Rejected: keeping `dc-extract` for brief 10's external-candidate route (brief 10 names it for
literal harvesting when a Claude Design export has no token block — that route must re-derive
against `design-atlas.js check`'s literal detection or accept the export as a plain mock;
flagged to brief 10 rather than restated here); keeping `fidelity-check` as an optional
source leg (the render shows what a paraphrase would show — ADR-0002 Consequences).

Collision-closure at lock (2026-08-24): three `likely` hits — `tests/consistency/entrypoints.test.js`
(exhaustive pin, no waive owed), `tests/scope-reconcile-at-risk.test.js` against `.gitignore`
(lexical: the test authors its own ignore file in a tmpdir — **waived**, adjudicated by the
build's whole-suite check), `tests/ac-matrix/ac-matrix.test.js` against `spec/templates/spec.md`
(the AC-grammar comment block is untouched; only the UI-section and `design_source` comments
change — **waived**). Literals leg: `sidecar` hits in `core.md`, `build.md`, `review.md`,
`spec-review-driver.js`, `spec-queue.js`, `parse-selection.js`, `.claude/rules`, `.claude/spec-runs`
and the review tests name the **deviations/review sidecar**, a different artifact — **waived**
by meaning; `retainer` in `verdict.js:45`, `replay.js:14`, `docs/canonical/review.md:145` are
dated incident history — **waived**; `copyCatalogs` in `spec/commands/init.md` is a row;
`Design Binding Pipeline` in `spec/commands/design.md` is spec 02's rewrite (verify at build
per A1).

Watch: the retired-literal sweep across `tests/` was done by hand at lock (the closure leg
sweeps inherited literals only); `host-config-api.test.js` AC-9 and `init-gen` AC-3 are the
two behavioral pins that assert on deleted mechanisms and are updated in place, never
weakened.

## Canonical Delta

`docs/canonical/design.md` is rewritten (D9) to: Component vocabulary (unchanged entry),
Atlas gap sweep dispatch (unchanged entry), Render gate (spec 01), Design stage (spec 02),
Mock hygiene and marks (spec 03), Executable design rules (spec 04), plus one line: *Retired
2026-08-24 (specs/20260824/05): the source-grep fidelity gate, `dc-extract`, the `.design/`
sidecar, skeleton binding maps, delta rows, the Fable retainer, the vision consult, the exit
fidelity review, and `copyCatalogs` as a required key.* `docs/canonical/pipeline.md` §
*Frontmatter has one reader*: readers are `spec-review-driver.js`, `spec-status.js`, `replay.js`.
