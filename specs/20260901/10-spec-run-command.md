---
date: 2026-09-01
status: hardened
tier: critical
area: build-integrity
design: false
breaking: true
depends_on: ["specs/20260901/09-disposer-gate.md"]
depended_on_by: []
brief: 18b
open_markers: 0
---

# `/spec:run` is the loop; `/spec:build` is the build stage again

## Goal

The loop gets its own name and the three stages get symmetric direct entries. `/spec:run
<spec>` carries a spec from `hardened` to `done` — design when due, the build driver, the
review driver, each `--via loop` — stopping only for decisions. `/spec:build` returns to
being the build stage alone (`hardened|implementing`, `--via direct`), beside `/spec:design`
and `/spec:review`. The state gate, `spec-status --next`, `spec-paths shared-for`,
`entrypoints.json`, and every command, doctrine, README, and marketplace surface name the
loop by its name. Done means: the gate admits `/spec:run` on all three statuses and refuses
`/spec:build` on `done` again; `spec-status --next` prints `/spec:run @<spec>` for every spec
past `hardened`; `/spec:run` loads within the read-load budget; the entrypoints pin is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **`spec/commands/run.md`** is created: frontmatter (`description`, `argument-hint: <spec path>`); Setup (`spec-paths shared-for run`, host config + pipeline rules, `spec-paths build-driver` → `{driver}`, `spec-paths review-driver` → `{review-driver}`); Input (a spec at `hardened`, `implementing`, or `done`); § Routing — derived from disk, in this order (build.md's four rungs today, verbatim, with `/spec:run` in place of `/spec:build`); § Design stage (execute `spec/commands/design.md`'s steps unchanged, then re-derive); § Build stage (run `node {driver} <spec> --via loop` per `spec/commands/build.md`'s Protocol, Worker Contract, and `blocked` rules, which the loop follows unchanged; on DONE print the advisory `✅ checkpoint — build complete; safe to /clear and re-run /spec:run <spec>` and continue); § Review stage (run `node {review-driver} <spec> --via loop` per `spec/commands/review.md`'s Protocol and Rules, unchanged; the pre-merge step-out bullet); § Report (build.md's Report section today, with `/spec:run <spec>` as the same-spec chain); § Rules (the driver never dispatches agents / writes Decisions / renders / runs git; `AskUserQuestion` dismissed → STOP). Read load ≤ 500 lines with `shared-for run` (204 lines measured, so run.md ≤ 296 lines; target ≤ 140). (AC-20260901-10-7, AC-20260901-10-8) | Core § Doctrine Authoring: one binding home per protocol — the stage protocols stay in their stage files; run.md is the router and cites them, never restates them. |
| D2 | **`spec/commands/build.md`** returns to the build stage: frontmatter description drops the loop; Input: a `hardened` spec (or `implementing`, to resume); the Routing section, the design rung, the review stage, and the advisory build-complete line are removed; the driver is invoked `node {driver} <spec path>` (no `--via` → `direct`); Worker Contract, `blocked` returns, and Rules unchanged; Report: `outcome` from the driver's state, `next` = the driver's captured `spec-status --next` verbatim at DONE (never a hand-applied command). Read load ≤ 500. (AC-20260901-10-7, AC-20260901-10-8) | Symmetric with review.md: a stage command ends by printing the derivation, and after D5 that derivation says `/spec:run`. |
| D3 | **`spec/commands/review.md`** § Input's direct-entry note names `/spec:run` as the loop that reaches the same driver with `--via loop`; nothing else changes. `[no-ac: one-sentence prose; read-load oracle AC-20260901-10-7 covers the file]` | Sibling 09 already rewrote the note's substance; this is the name. |
| D4 | **`spec-state-gate.sh`**: the recognised-prompt case gains `/spec:run*`; `/spec:run` requires `hardened`, `implementing`, or `done` (the loop's resume and no-op entries), remedy `Run /spec:plan first.`; `/spec:build` requires `hardened` or `implementing` again (`done` removed), its refusal naming `/spec:run` as the loop that resumes a `done` spec; `/spec:design` and `/spec:review` unchanged; the `open_markers`/marker gate applies to `/spec:run` exactly as to the other three; header comment lists the four commands and their sets. (AC-20260901-10-1, AC-20260901-10-2, AC-20260901-10-3) | Executed 2026-09-01: `/spec:run` on a `draft` spec exits 0 today (unrecognised prompt) — the loop is unguarded until this lands. `done` was admitted on `/spec:build` only as the loop's post-checkpoint resume (03 D5); the loop has moved. |
| D5 | **`spec-status.js` `deriveNext`**: every spec at `hardened` (with or without `design: true`, `designed:` set or not) and every spec at `implementing` derives the action `/spec:run`; `/spec:design`, `/spec:build`, and `/spec:review` are never emitted as actions. `/spec:plan` (unplanned briefs) and `/spec:escape` are unchanged, as are ranking, blockers, lanes, the queue overlay, and the `--json` shape — only the action string values change; the `--json` action set is now `/spec:plan | /spec:run | /spec:escape` and the header comment's routing paragraph says so (a deliberate change to the frozen action set, host § Risk Tiers). The dashboard's status column continues to show the spec's status word. (AC-20260901-10-4, AC-20260901-10-5, AC-20260901-10-6) | JJ ruling 2026-09-01: status prints `/spec:run` as the sole Next command; the loop derives design-due itself, so status no longer needs to. Rejected: keeping `/spec:design` for design-due specs — two next-commands for one state is the ambiguity the loop exists to remove. |
| D6 | **`spec/bin/spec-paths`**: `shared-for run` serves `Host Grounding\|Tiers\|State Machine\|Runtime Verification\|Model Placement\|Incident Policy\|Decisions\|Question Style\|Console Output Style\|Worker Git Ban\|Read-Only Surfaces\|MCP Policy\|On-Disk Handoff\|Canonical Docs Loop` (the union of build's and review's lists); the usage string's `shared-for <command>` text is unchanged (it names no commands). (AC-20260901-10-7) | An unknown command falls back to both full documents (~700 lines) and read-load would fail — the read-load oracle is the honest pin. |
| D7 | **`spec/entrypoints.json`**: `spec/commands/run.md` is added as an entry point of `spec-build-driver.js`, `spec-review-driver.js`, and `report-render.js`; `spec/commands/build.md` keeps `spec-build-driver.js` and `report-render.js` and loses `spec-review-driver.js`; `review.md` unchanged. (AC-20260901-10-8) | The live-green entrypoints pin forward-verifies every declared edge against a real invocation literal in the command file. |
| D8 | **`spec/doctrine/core.md`**: (a) the intro lifecycle sentence "`/spec:plan` → `/spec:design` (optional, UI specs in design-capable hosts) → `/spec:build` → `/spec:review` (the only command that flips `done`; on CLEAN it commits the close and merges back) → `/spec:release`" becomes "`/spec:plan` → `/spec:run` (design when due, then build, then review — each stage also has its own direct entry: `/spec:design`, `/spec:build`, `/spec:review`, the last the only one that flips `done`; on CLEAN it commits the close and merges back) → `/spec:release`"; (b) § State Machine's sentence "`/spec:build` runs both drivers in sequence; `/spec:review` remains the review driver's direct entry;" becomes "`/spec:run` runs design (when due), then both drivers in sequence; `/spec:build` and `/spec:review` remain each driver's direct entry;" — the rest of both paragraphs unchanged, headings byte-identical. Doctrine edit — wording approved by JJ at this spec's lock. `[no-ac: doctrine prose; behavior pinned by AC-20260901-10-1..6]` | Core § State Machine is what the gate enforces; the sentence must name the command the gate admits. |
| D9 | **Surface sweep** — every other surface that names `/spec:build` as the loop names `/spec:run` instead, and names `/spec:build` only where the build stage is meant: `design.md` (§ intro "sits between `/spec:plan` and the build stage; `/spec:run` runs it when due"; the resume table's and Report's `next` become `/spec:run <spec path>`); `plan.md` (the marker-gate sentence lists `/spec:run` alongside the three stage commands; "fit one `/spec:build` run" stays); `queue.md` (the derived-line parenthetical lists `/spec:plan`/`/spec:run`); `status.md` (the `designed:` sentence: "`designed:` set means the design stage already ran; either way the Next line is `/spec:run`"); `README.md` (the loop block becomes `/spec:sketch` / `/spec:plan` / `/spec:run`; the bullet "`/spec:build` carries a hardened spec…stops twice" becomes a `/spec:run` bullet that says it stops only for decisions — design approval, findings the disposition agent wants to let stand, merge strategy, and the step out of the worktree before merge — and never for a `/clear`; the gate paragraph says `/spec:run` is admitted on all three statuses; the command table gains a `/spec:run` row and rewords `/spec:build`, `/spec:design`, `/spec:review` as stage entries); `.claude-plugin/marketplace.json` ("plan → build" becomes "plan → run"). `[no-ac: prose and manifests; the single high-value README rule; collision-closure enumerated these at lock]` | Brief 18b § 4. A name that means two things on any surface is the smell this spec removes. |
| D10 | `spec/.claude-plugin/plugin.json`: version bump target 7.55.0 (next free if taken); the lifecycle string gains `/spec:run` and the changelog paragraph (last-3 form: 7.55.0, 7.54.0, 7.53.0). `[no-ac: manifest — pinned by tests/consistency/plugin-version.test.js]` | Host § Planning. |
| D11 | **Tests.** `tests/state-gates.test.js`: the AC-20260901-03-1/-10 test is rewritten in place — the `done` assertion flips back to exit 2 (AC-20260901-10-2), the `hardened`/`implementing` assertions and the design/review assertions are tagged AC-20260901-10-3 (`SHALL CONTINUE TO`); new assertions for `/spec:run` (AC-20260901-10-1) join the same file, including the marker block. `tests/spec-status.test.js`: every `/spec:build`, `/spec:design`, `/spec:review` action expectation is updated in place to `/spec:run` and tagged AC-20260901-10-4; the unplanned-brief `/spec:plan` and escape expectations are tagged AC-20260901-10-5 in place; the `--json` action-set assertion (AC-20260901-10-6) joins the file. `tests/queue/queue-overlay.test.js`: the Next-line pin is updated in place (AC-20260901-10-4). `tests/consistency/red-fixture-coverage.test.js`, `tests/report/report-render.test.js`, `tests/spec-paths.test.js`, and every other file whose `/spec:build` literal is a comment or a fixture string are not edited. (AC-20260901-10-1, AC-20260901-10-2, AC-20260901-10-3, AC-20260901-10-4, AC-20260901-10-5, AC-20260901-10-6) | Host § Gotchas: a retired literal is asserted where the File Plan never looked — the lock-time grep enumerated every `spec:build` hit in `tests/` (36 files repo-wide, 10 under `tests/`); only the three files above assert the loop's name as behavior. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/commands/run.md | CREATE | doctrine | D1: the outer loop — routing, stage delegation, advisory build-complete line, pre-merge step-out, report |
| spec/commands/build.md | MODIFY | doctrine | D2: build stage only; `--via direct`; report with `spec-status --next` |
| spec/commands/review.md | MODIFY | doctrine | D3: direct-entry note names `/spec:run` |
| spec/commands/design.md | MODIFY | doctrine | D9: intro sentence; `next` = `/spec:run <spec path>` (resume table + Report) |
| spec/commands/plan.md | MODIFY | doctrine | D9: marker-gate sentence lists `/spec:run` |
| spec/commands/queue.md | MODIFY | doctrine | D9: derived-line parenthetical |
| spec/commands/status.md | MODIFY | doctrine | D9: `designed:` sentence |
| spec/doctrine/core.md | MODIFY | doctrine | D8: intro lifecycle sentence + § State Machine sentence, approved wording verbatim |
| spec/scripts/spec-state-gate.sh | MODIFY | scripts | D4: `/spec:run` arm, `/spec:build` set, header, messages |
| spec/scripts/spec-status.js | MODIFY | scripts | D5: `deriveNext` action strings; header routing paragraph |
| spec/bin/spec-paths | MODIFY | scripts | D6: `shared-for run` section list |
| spec/entrypoints.json | MODIFY | doctrine | D7: run.md edges; build.md loses the review-driver edge |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: 7.55.0 + lifecycle string + changelog paragraph |
| .claude-plugin/marketplace.json | MODIFY | doctrine | D9: "plan → run" |
| README.md | MODIFY | other | D9: loop block, `/spec:run` bullet, gate paragraph, command table |
| tests/state-gates.test.js | MODIFY | tests | AC-20260901-10-1, AC-20260901-10-2 (flip the `done` pin in place), AC-20260901-10-3 (tag the unchanged pins) |
| tests/spec-status.test.js | MODIFY | tests | AC-20260901-10-4 (update action pins in place), AC-20260901-10-5 (tag), AC-20260901-10-6 |
| tests/queue/queue-overlay.test.js | MODIFY | tests | AC-20260901-10-4 (Next-line pin in place) |

Orchestrator duty (outside the table): `tests/consistency/read-load.test.js` and
`tests/consistency/entrypoints.test.js` are the live oracles for AC-20260901-10-7 and
AC-20260901-10-8; they are not edited. `docs/canonical/pipeline.md` and
`docs/canonical/build-integrity.md` change only through the Canonical Delta at review close.
Eighteen rows: the cap is exceeded by five one-sentence prose substitutions (design, plan,
queue, status, marketplace) that cannot land apart from the rename without leaving a surface
naming a loop that no longer exists under that name; recorded here, not hidden.

## Contracts

```
spec-state-gate.sh
  /spec:run    -> hardened | implementing | done      (new; marker gate applies)
  /spec:build  -> hardened | implementing             (done removed; refusal names /spec:run)
  /spec:design -> hardened                            (unchanged)
  /spec:review -> implementing | done                 (unchanged)
  refusal text: "Spec state gate: /spec:run requires status: hardened, implementing, or done —
    <spec> has status: <s>. Run /spec:plan first."
                "Spec state gate: /spec:build requires status: hardened (or implementing to
    resume) — <spec> has status: <s>. A done spec resumes through /spec:run <spec>."

spec-status.js  (--json entries[].action, the frozen set)
  before: /spec:plan | /spec:design | /spec:build | /spec:review | /spec:escape
  after : /spec:plan | /spec:run | /spec:escape
  deriveNext: hardened (any design state) -> /spec:run ; implementing -> /spec:run
  --next line: "🎯 Next\n/spec:run @<path>"

spec-paths shared-for run
  SECTIONS="Host Grounding|Tiers|State Machine|Runtime Verification|Model Placement|Incident Policy|Decisions|Question Style|Console Output Style|Worker Git Ban|Read-Only Surfaces|MCP Policy|On-Disk Handoff|Canonical Docs Loop"

entrypoints.json  (edges)
  spec-build-driver.js : [build.md, run.md]
  spec-review-driver.js: [review.md, run.md]
  report-render.js     : [... build.md, run.md, ...]

core.md § State Machine (approved wording, verbatim replacement of one sentence):
  `/spec:run` runs design (when due), then both drivers in sequence; `/spec:build` and
  `/spec:review` remain each driver's direct entry;
core.md intro (verbatim replacement of one sentence):
  `/spec:plan` → `/spec:run` (design when due, then build, then review — each stage also has
  its own direct entry: `/spec:design`, `/spec:build`, `/spec:review`, the last the only one
  that flips `done`; on CLEAN it commits the close and merges back) → `/spec:release`
```

## Behavior

| On disk | `/spec:run` does | `/spec:build` does | `spec-status --next` |
|---|---|---|---|
| `hardened`, `design: true`, no `designed:`, host has `design` block | design.md's steps (its approvals are stops), then re-derive | admitted by the gate; the build driver's own admission refuses a design-due spec (`design: true`, no `designed:`, design host) with its existing remedy — unchanged | `/spec:run @spec` |
| `hardened` / `implementing`, no `<spec>.review/` | build driver `--via loop` to DONE; advisory line; continue | build driver `--via direct` to DONE; `spec-status --next` | `/spec:run @spec` |
| `implementing` / `done` with `<spec>.review/` | review driver `--via loop`; DISPOSITIONS per review.md (sibling 09); pre-merge step-out is the only stop | refused (state gate: `done`) / refused by the build driver's admission (`implementing` with a review sidecar prints the resume-review remedy, unchanged) | `/spec:run @spec` (implementing) / n/a (done) |
| `done`, no `<spec>.review/` | the review driver's cold DONE: `spec-status --next` | refused (state gate) | next spec |

## Acceptance Criteria

- **AC-20260901-10-1**: WHEN the state gate receives `/spec:run <spec>` against `status: hardened`, `implementing`, or `done` THE SYSTEM SHALL exit 0; against `draft` it SHALL exit 2 with stderr naming `/spec:run` and `/spec:plan`; against `hardened` with `open_markers: 2` it SHALL exit 2 → `tests/state-gates.test.js`
- **AC-20260901-10-2**: WHEN the state gate receives `/spec:build <spec>` against `status: done` THE SYSTEM SHALL exit 2 with stderr naming `/spec:run` → `tests/state-gates.test.js` (the AC-20260901-03-1 assertion flipped in place)
- **AC-20260901-10-3**: WHEN the state gate receives `/spec:build` against `hardened` or `implementing`, `/spec:design` against `hardened`, or `/spec:review` against `implementing` THE SYSTEM SHALL CONTINUE TO exit 0; `/spec:design` or `/spec:review` against `draft` SHALL CONTINUE TO exit 2; a `/spec:build` prompt against a spec whose body still carries an unresolved planning marker (the gate's existing marker check) SHALL CONTINUE TO exit 2 → `tests/state-gates.test.js`, tagged in place
- **AC-20260901-10-4**: WHEN `spec-status --next` runs over a host whose only open spec is `specs/20260701/01-a.md` at `hardened` THE SYSTEM SHALL print exactly `🎯 Next\n/spec:run @specs/20260701/01-a.md`; WHEN the spec is `hardened` with `design: true` and no `designed:`, or `hardened` with `designed:` set, or `implementing` THE SYSTEM SHALL derive `/spec:run` for it; and the queue-overlay Next line SHALL read `/spec:run @specs/20260701/02-ready.md` for its existing fixture → `tests/spec-status.test.js`, `tests/queue/queue-overlay.test.js` (pins updated in place)
- **AC-20260901-10-5**: WHEN an unplanned brief's dependencies are met THE SYSTEM SHALL CONTINUE TO derive `/spec:plan @docs/roadmap/NN-…md`, and an unresolved escape SHALL CONTINUE TO derive `/spec:escape` → `tests/spec-status.test.js`, tagged in place
- **AC-20260901-10-6**: WHEN `spec-status --json` runs over a host with one `hardened` spec, one `implementing` spec, one unplanned brief with met dependencies, and one open escape THE SYSTEM SHALL emit entries whose `action` values are each one of exactly `/spec:plan`, `/spec:run`, `/spec:escape` and none of `/spec:design`, `/spec:build`, `/spec:review` → `tests/spec-status.test.js`
- **AC-20260901-10-7** `[oracle: gate]`: WHEN `tests/consistency/read-load.test.js` runs THE SYSTEM SHALL find `/spec:run`, `/spec:build`, and `/spec:review` each at or under 500 lines including their `shared-for` sections (a missing `shared-for run` case falls back to both full doctrine files and fails this oracle)
- **AC-20260901-10-8** `[oracle: gate]`: WHEN `tests/consistency/entrypoints.test.js` runs THE SYSTEM SHALL find `spec/commands/run.md` declared as an entry point of both `spec-build-driver.js` and `spec-review-driver.js` with real invocation literals, `spec/commands/build.md` no longer declared for `spec-review-driver.js`, and zero forward, reverse, or reachability violations

## Assumptions (escalation triggers)

- A1: Executed 2026-09-01 — `spec-state-gate.sh` with `{"prompt":"/spec:run specs/x/01-a.md"}` against `status: draft` exits 0 today (the prompt is unrecognised, line 21's case list), and `/spec:build` against the same exits 2 — so AC-20260901-10-1's draft clause is red today — **if false:** the arm already exists; re-read the gate.
- A2: Executed 2026-09-01 — `spec-status --next` prints `/spec:build @specs/20260901/08-corpus-derivation-and-kill-match.md` today, and `tests/spec-status.test.js` holds 15 `/spec:build` action expectations plus `/spec:design`/`/spec:review` ones (line 249's `designed:` incident test among them) — **if false:** fewer pins to update; the AC shapes stand.
- A3: Executed 2026-09-01 — read-load: build 359, review 387 of 500; the union section list for `run` measures 204 lines, leaving 296 for run.md — **if false (the union exceeds ~300):** drop `Canonical Docs Loop` and `Runtime Verification` from run's list (the review stage reads them through review.md's own `shared-for`); never touch the cap.
- A4: `tests/consistency/entrypoints.test.js` counts a declared edge as live when the command file contains a real invocation literal of the script (a `spec-paths <key>` resolution that is then run) — run.md's Setup keeps `spec-paths build-driver` and `spec-paths review-driver` and its stage sections run `node {driver} … --via loop` / `node {review-driver} … --via loop`, the same literals build.md carries today — **if false:** the worker returns `blocked`; the literal shape is decided here.
- A5: `spec-status.js`'s `deriveNext` selects the action in one ternary (lines 440–444 today) and no other script or test derives an action string from status (executed grep 2026-09-01: zero quoted `/spec:build`/`/spec:review`/`/spec:design` literals in `spec/scripts/` outside spec-status.js) — **if false:** STOP, ask the user; a second derivation is the exact class § Risk Tiers forbids.
- A6: `spec-build-driver.js` admits `implementing` with a review sidecar by printing its own resume-review remedy today (untouched by this spec) — **if false (it admits and re-runs waves):** record the departure and leave the driver alone; the state gate is the boundary this spec owns.

## Rationale

**Why a rename and not a revert.** Brief 18's valuable half is the build driver and run
provenance; the awkward half is that the loop took the build stage's name. Reverting to the
pre-18 command would lose the driver to fix a name. Four commands — three symmetric stage
entries under one loop — is the shape the stage files already imply: the loop delegates to
design.md and review.md "unchanged", and now delegates to build.md the same way.

**Why status says only `/spec:run`.** The loop derives the next stage from disk with the same
`deriveNext` order status uses; printing `/spec:design` for a design-due spec would offer a
second, narrower next-command for one state. The dashboard's status column still shows where
a spec stands; the Next line says what to type. The frozen `--json` action set shrinks from
five strings to three — deliberate, named in D5 and in the header comment, and pinned by
AC-20260901-10-6 so any consumer that breaks does so loudly.

**Why `/spec:build` loses `done`.** `done` was admitted only as the loop's post-`/clear` resume
entry (03 D5). With sibling 09 there is no such resume; a `done` spec's only legitimate
re-entry is the loop's no-op or `/spec:review`'s re-run, both of which remain.

**Why eighteen rows.** Five of them are one-sentence name substitutions in files that would
otherwise name a loop under a retired name. Splitting them into a sibling would slice by
layer (prose vs. mechanics), which core § Decomposition forbids; the overage is recorded in
the File Plan.

**What is fragile.** External `--json` consumers of `spec-status` (none known in this repo;
FleetView-style tooling elsewhere may exist) see three action strings instead of five —
`breaking: true` is set for that reason. `README.md` is prose without a pin; the
collision-closure sweep at lock enumerated its loop sentences and D9 names each.

**Collision closure (executed at lock, 2026-09-01).** Literals leg for `/spec:build` as the
loop (`carries a hardened spec`, `hardened → done`, `plan → build`, `post-checkpoint resume
entry`, `runs both drivers`): `README.md`, `.claude-plugin/marketplace.json`,
`spec/doctrine/core.md`, `spec/commands/{build,review,design,plan,queue,status}.md`,
`spec/scripts/spec-state-gate.sh`, `spec/scripts/spec-status.js`, `tests/state-gates.test.js`,
`tests/spec-status.test.js`, `tests/queue/queue-overlay.test.js` are File Plan rows;
`docs/canonical/pipeline.md` and `docs/canonical/build-integrity.md` are the Canonical
Delta; `spec/doctrine/genesis.md:514`, `spec/templates/grounding-contract.md:16,181`,
`spec/templates/spec.md`, `spec/scripts/scope-reconcile.js:16`,
`spec/scripts/spec-build-driver.js` (header), `spec/scripts/spec-review-driver.js:265` (the
"run /spec:build first" remedy for a spec not yet `implementing`), `spec/scripts/merge-back.sh`
and `spec/scripts/block-cross-worktree-writes.sh` (header comments), `git/commands/enter-worktree.md`,
`spec/commands/doctor.md:37`, `spec/commands/atlas.md:8` ("plan → build → review → release"
names stages, still true), and the test-file comments in `tests/build/`,
`tests/review/review-base-derivation.test.js`, `tests/spec-paths.test.js` name `/spec:build`
as the build stage, which stays true — waived, no edit;
`tests/consistency/red-fixture-coverage.test.js` and `tests/provenance/provenance.test.js`
use `/spec:build …` as a hook-prompt fixture string that the gate must still block/stamp —
waived, no edit; `specs/`, `docs/roadmap/`, `docs/adr/` are historical record.

## Canonical Delta

In `docs/canonical/pipeline.md` § One command per feature, replace the opening sentence
"After `/spec:plan`, `/spec:build <spec>` derives the stage from disk and runs design (when
due), the build driver, and the review driver in sequence, each with `--via loop`." with
"After `/spec:plan`, `/spec:run <spec>` derives the stage from disk and runs design (when
due), the build driver, and the review driver in sequence, each with `--via loop`; `/spec:design`,
`/spec:build`, and `/spec:review` are the three stages' direct entries (`--via direct`)."; replace
"the state gate admits `/spec:build` on all three" with "the state gate admits `/spec:run` on all
three (`/spec:build` on `hardened|implementing`, `/spec:review` on `implementing|done`)"; and
replace the closing "`/spec:design` and `/spec:review` remain direct entry points to the same
drivers." with "`spec-status --next` names `/spec:run` for every spec past `hardened`; its
`--json` action set is `/spec:plan | /spec:run | /spec:escape`
(specs/20260901/10-spec-run-command.md, ADR-0005)."

In `docs/canonical/build-integrity.md` § Run provenance, replace "`loop` when produced by
`/spec:build`'s unified loop" with "`loop` when produced by `/spec:run`".
