---
date: 2026-11-03
status: implementing
tier: standard           # spec-status.js is touched render-only (one line deleted, --json shapes untouched) — the same shape specs/20261025/02 and specs/20261024/06 shipped at standard; no § Risk Tiers trigger fires
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
open_markers: 0
diff_base: 61135737158cb84fb1f4b16eef781a403beb254d
---

# Ceremony nothing reads

## Goal

About two commits in five maintain the pipeline itself, and one feature touches a dozen
decision-bearing artifacts. This spec deletes the ceremony whose output nothing outside the
ceremony consumes: the mocks provenance ledger (its grammar, tags, statuses, gate, confirmation
round, counts line, exclusion rows and the roadmap parking-lot check that read it), the ops-ADR
"derive pass" and "coverage check" that doctrine itself calls non-certifying, the mocks edge
paragraphs and the legacy-status branch behind them, four unread roadmap-brief header fields,
the genesis brief's duplicate `## Journeys` section and the `brief-written` gates on it, and
the scaffold tournament's race-or-skip question, which becomes an auto-picked skip. Nothing is
replaced with lighter prose; no stage, script or config key is added. Done means: the files are
gone, every citation of them is gone or points at the surviving home, the suite is green, and
approving a journey by story hash is the only provenance the mocks stage keeps.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The mocks provenance ledger is deleted end to end: `spec/doctrine/mocks.md` § Provenance Ledger and every ledger/gate sentence elsewhere in that file (the frontmatter description, § Mocks: Seed, § Mocks: Checkpoint contract, § Mocks: Authoring Rules, § Mocks: Confirmation), `spec/templates/mocks-ledger.md`, `spec/scripts/lib/mocks-ledger.js`, `tests/fixtures/mocks-ledger/`, the `mocks-driver.js` ledger subcommand, gate (`requireGateOpen`), confirm block (`confirmBlockLines`), exclusion rows in `--mark approved`, cold-root template copy and counts-line tail; `genesis-driver.js`'s BRIEF gate verdict precondition, `confirmedProductRows`/`productRowById`/`fencedExclusionRows`/`parkingLotSection`, the MENUS `primary-surface`/`platforms-horizon` print and ROADMAP's parking-lot refusal (`spec/doctrine/genesis.md` § Genesis: Roadmap Decomposition last paragraph, § Genesis: Brief State's `gateVerdict` clause, § Genesis: On-disk Handoff's `ledger.md`); `spec-status.js`'s 🧭 misunderstandings line and its `require`; `spec/commands/mocks.md`'s ledger section slice, confirm-block sentence, `catch:` warns and ledger rule; `spec/commands/genesis.md`'s BRIEF-derives rule; `spec/skills/design-brief/SKILL.md`'s "confirmed ledger rows" clause; `spec/entrypoints.json`'s `mocks-ledger.md` row. A `design/mocks/ledger.md` left on disk is never read. Approving a journey confirms its sentences by hash (§ Mocks: Confirmation, unchanged) and is the only provenance kept (AC-20261103-02-1, AC-20261103-02-2, AC-20261103-02-3, AC-20261103-02-5, AC-20261103-02-6, AC-20261103-02-7, AC-20261103-02-9) | Every reader of the ledger is the ledger machinery itself (A1); the hash approval already proves the client confirmed the story. Rejected: keeping `lib/mocks-ledger.js` as a reader for the status line — a parser for a file nothing writes. |
| D2 | `spec/scripts/question-style-gate.js` is not touched: its `PRODUCT_FACT_RE` keeps the `assumptions?` alternative, and mocks.md § Product-Stage Exemption keeps describing it. `[no-ac: a hook surface left byte-identical has nothing to observe]` | § Risk Tiers names the file as a process boundary (critical tier); the dead alternative in a regex costs nothing and removing it is wording. |
| D3 | `spec/doctrine/genesis.md` § Genesis: Ops Conventions ADR loses the "generating question", the **derive pass** and the **coverage check** sentences (from `The rows above are samples of one` to `never certifies completeness.`); the floor rows and the checker-enforceable rule stay. No driver prints these passes (A3) (AC-20261103-02-10) | Doctrine calls both passes advisory and non-certifying — a pass whose silence proves nothing is ceremony. |
| D4 | `spec/doctrine/mocks.md` § Mocks: State Machine loses the legacy move-aside sentence (`A status file not at schemaVersion: 3 … never moved.`) and the whole **Edges** paragraph; `mocks-driver.js` loses `retireLegacyStatus`, the `legacy` flag and its dispatch block, and the header lines about other schema versions. `design/mocks/status.json` is read as-is through `normalise`: a file of the retired flow derives `SEED` like any status with no `seedDone` mark and is overwritten only by the next accepted mark; nothing is moved aside and no remedy names it (AC-20261103-02-4, AC-20261103-02-9) | Terminal means gone — the retired mock-app flow gets no edge fork. The mid-flow config paragraphs had no driver branch (A4): mode is derived per call and the story hash is the only approval test. |
| D5 | `spec/templates/roadmap-brief.md`'s header keeps `Phase:`, `Depends on:` and `Primary workspaces:` only; `Risk:`, `Design stage:`, `Lane:` and `Expected specs:` are dropped with the comment's three Lane sentences, and the Surfaces comment opens `UI-bearing briefs only — delete the section otherwise.`; `spec/doctrine/core.md` § Pipeline Entry drops the parenthetical `(a brief's `Lane:` is advisory)` (AC-20261103-02-11) | Nothing reads the four fields (A5); `Phase:`/`Depends on:` are read by `spec-status.js` and `genesis-driver.js`. The sibling spec 20261103/01 adds a `journeys:` line to the same template below the header — this edit stays inside lines 3–5 and the comment. |
| D6 | `spec/templates/genesis-brief.md` loses `## Journeys` (seven `## ` headings remain, in order); `genesis-driver.js` loses `briefJourneysCheck`, `briefNonUiCheck`, `NON_UI_COVERAGE_KEYS` and both `brief-written` refusals, the BRIEF step's `derived from: … — write ## What I think you're building, ## Journeys, and ## Non-UI Coverage` line (the step prints `seed journeys: N · notes open: N`, § Genesis: Brief State's Derivation sources, unchanged), and DESIGN_BRIEF's `brief.md (## Journeys)` read item; `spec/doctrine/genesis.md` § Genesis: Brief State loses the **Brief generation is derived, never guessed** paragraph. `## Non-UI Coverage` is KEPT in the template: the DISCOVERY step reads and writes it (§ Genesis: Discovery Interview, `discoveryRoundLines`), so the "gate-only" claim proved false; only its `brief-written` gate goes (AC-20261103-02-6, AC-20261103-02-10) | `## Journeys` duplicated the seed, and DESIGN_BRIEF reads the seed directly. A section discovery fills is not ceremony; a gate that re-checks it after discovery is. |
| D7 | The scaffold tournament is opt-in: the FINALISTS step prints `📌 Auto-picked skip — the race costs one mini-build per finalist and ## Picks already names the stack (veto anytime)` in place of the `default:` line, lists `--mark finalists-skipped` before `--mark finalists-written`, and asks no `AskUserQuestion`; `spec/doctrine/genesis.md` § Genesis: Tournament of Scaffolds' FINALISTS paragraph says so in one sentence (a veto is composing finalists and `--mark finalists-written`). The states, marks and `tournament.skipped` record are unchanged; no config key (AC-20261103-02-8) | The race was auto-defaulted to skip already whenever every dimension was auto-picked; core § Question Style derives what the session can derive. |
| D8 | One ADR, `docs/adr/0038-approval-by-hash-is-the-only-provenance.md` (next free number at build time), supersedes ADR-0006's clause `The provenance ledger, not the session's judgment, gates each advance` and its rejected option C; ADR-0006 itself is not edited. `[no-ac: a decision record; /spec:doctor's ADR audit is the oracle]` | ADR-0006 decided the ledger gate and rejected the no-gate option; a spec that takes option C must say so in the record, superseding rather than amending (adr.md § Applies to). |
| D9 | Every done-spec AC whose only citing test this spec deletes gets `[retired: specs/20261103/02-ceremony-nothing-reads.md]` at the end of its bullet: specs/20261002/01 AC 19, specs/20260902/11 AC 6, specs/20260914/03 AC 7, specs/20260902/06 AC 9. Scope addition: specs/20261029/06 AC 5 (its only test was rewritten under AC-20261103-02-8) is tagged too. `[no-ac: ac-drift-clean.test.js in the gate is the oracle]` | Pipeline rules § Gotchas twelfth trigger. |
| D10 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (minor); the paragraph names the ledger deletion, the auto-skipped tournament and the dropped brief fields. `[no-ac: version mechanics — plugin-bump.js --check in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline. |
| D11 | Build-time scope addition: `specs/20261103/01-workers-never-run-git.md` is renumbered to `specs/20261103/03-workers-never-run-git.md` byte-identical to main's own renumber (commit d6fe8397), clearing the gate line `spec-number-check: specs/20261103 number 01` (tests/doctor/spec-number-check.test.js) inherited from this branch's base. `[no-ac: spec-number-check.test.js in the gate is the oracle]` | The collision predates this spec and main already resolved it; taking main's bytes makes the merge clean. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/mocks.md | MODIFY | doctrine | D1 § Provenance Ledger deleted with every ledger/gate/counts sentence and the frontmatter description's ledger clause; D4 legacy sentence and **Edges** paragraph deleted; `no dependency change` |
| spec/doctrine/genesis.md | MODIFY | doctrine | D1 `gateVerdict` clause (§ Genesis: Brief State), parking-lot paragraph (§ Genesis: Roadmap Decomposition), `ledger.md` (§ Genesis: On-disk Handoff); D3 derive-pass/coverage-check sentences; D6 brief-generation paragraph; D7 FINALISTS sentence |
| spec/doctrine/core.md | MODIFY | doctrine | D5 § Pipeline Entry drops the `Lane:` parenthetical |
| spec/commands/mocks.md | MODIFY | doctrine | D1 Setup slice `--section "State Machine\|Checkpoint contract"`, confirm-block sentence, `catch:` warns and ledger rule deleted |
| spec/commands/genesis.md | MODIFY | doctrine | D1/D6 the **BRIEF derives, never guesses** rule deleted |
| spec/skills/design-brief/SKILL.md | MODIFY | doctrine | D1 rule 1 reads `Users and context come from the seed, never invented.` |
| spec/templates/mocks-ledger.md | DELETE | doctrine | D1 |
| spec/templates/genesis-brief.md | MODIFY | doctrine | D6 `## Journeys` section deleted; `## Non-UI Coverage` kept |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D5 header lines 3–5 and the comment's Lane sentences; the Surfaces comment's parenthetical |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D10) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 ledger subcommand, gate, confirm block, exclusion rows, template copy, counts tail and `ledger` first word removed (exit code 1 line and header lines 30–33 go); D4 legacy branch removed |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1 ledger readers, BRIEF precondition verdict, MENUS seed-row print, ROADMAP parking-lot check and `require('./lib/mocks-ledger')`; D6 brief checks and prints; D7 FINALISTS print; header comments follow |
| spec/scripts/spec-status.js | MODIFY | scripts | D1 the 🧭 misunderstandings block (lines 881–895) and the `mocksLedgerLib` require deleted; `--json`/`--next --json`/`--lanes --json` byte-identical |
| spec/scripts/lib/mocks-ledger.js | DELETE | scripts | D1 |
| spec/entrypoints.json | MODIFY | other | D1 `spec/templates/mocks-ledger.md` removed from `mocks-driver.js`'s entryPoints |
| docs/adr/0038-approval-by-hash-is-the-only-provenance.md | CREATE | other | D8 (Contracts § ADR) |
| README.md | MODIFY | other | D1 the `/spec:mocks` paragraph's clause `gates every advance on a provenance ledger, and` deleted |
| tests/fixtures/mocks-ledger/dry-run.md | DELETE | tests | D1 — unreferenced fixture (A2) |
| tests/mocks/no-ledger.test.js | CREATE | tests | AC-20261103-02-1, AC-20261103-02-2, AC-20261103-02-3, AC-20261103-02-4 |
| tests/genesis/no-ceremony.test.js | CREATE | tests | AC-20261103-02-6 |
| tests/consistency/ceremony-nothing-reads.test.js | CREATE | tests | AC-20261103-02-9, AC-20261103-02-10, AC-20261103-02-11 |
| tests/spec-status.test.js | MODIFY | tests | AC-20261103-02-5 — the 🧭 case rewritten (helpers `writeLedgerFile`/`THIRTEEN_CATCH_ROWS` stay for the `--json` key-set case) |
| tests/genesis/menus-autopick.test.js | MODIFY | tests | AC-20261103-02-8 — the FINALISTS default case rewritten |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20261103-02-7 — one new case on the file's own `advanceToRoadmap`/`writeRoadmap` helpers |
| tests/mocks/seed-reads-brief.test.js | MODIFY | tests | AC-20261103-02-12 — the confirm-block half of the second case deleted; the terminal-block half keeps its title, gains this AC-ID after the prefix |
| tests/mocks/ledger-verbs.test.js | DELETE | tests | D1 (its subject is gone; D9 tags the owner) |
| tests/mocks/legacy-status-retired-in-place.test.js | DELETE | tests | D4 (no AC owner) |
| tests/mocks/wireframe-fixtures.js | MODIFY | tests | D1 `writeLedger`, `readLedger`, `BLOCKING_ROW` and the `ledger` option removed |
| tests/genesis/tournament.fixtures.js | MODIFY | tests | D1/D6 `ratifyBriefArtifacts` writes no ledger; `ensureJourneysAndNonUiSections` and `NON_UI_KEYS` removed |
| tests/spec-paths.test.js | MODIFY | tests | D1 the `## Provenance Ledger` heading case (AC-20260902-06-9) deleted |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | D6 the eight-heading pin becomes seven (no `Journeys`); assertions otherwise unchanged |
| specs/20261002/01-the-wireframe-command-runs-over-the-service.md | MODIFY | other | D9 retired tag on AC 19 |
| specs/20260902/11-brief-from-approved-set.md | MODIFY | other | D9 retired tag on AC 6 |
| specs/20260914/03-the-html-atlas-is-retired.md | MODIFY | other | D9 retired tag on AC 7 |
| specs/20260902/06-mocks-provenance-ledger.md | MODIFY | other | D9 retired tag on AC 9 |
| specs/20261029/06-the-genesis-question-diet.md | MODIFY | other | D9 retired tag on AC 5 (scope addition) |
| specs/20261103/01-workers-never-run-git.md | DELETE | other | D11 renumbered to 03 (scope addition) |
| specs/20261103/03-workers-never-run-git.md | CREATE | other | D11 main's renumbered copy, byte-identical (scope addition) |

## Contracts

Mocks accepted-mark tail (D1) — the last non-blank line of every accepted `--mark`:

```
✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks
```

`mocks-driver.js` first words (D1): `--state`, `--mark`, `--reopen`, `round`. Any other first
word is `unknown command "<word>" — remedy: run with no argument to print the current step`,
exit 2. Exit codes: 0, 2 only.

FINALISTS step (D7), the lines between `cost:` and `Then:`:

```
📌 Auto-picked skip — the race costs one mini-build per finalist and ## Picks already names the stack (veto anytime)
<last-measured line, unchanged>
Then:
  node <driver> --root <root> --mark finalists-skipped
  node <driver> --root <root> --mark finalists-written --file <finalists.json>
```

BRIEF step on a visual run (D1/D6): `Read only: design/mocks/seed.md, design/mocks/status.json,
.claude/genesis/brief.md`; `mocks: APPROVED · journeys: N`; `seed journeys: N · notes open: N`;
then the `--mark brief-written` line. DESIGN_BRIEF's read list names `design/mocks/seed.md`
and no longer `brief.md (## Journeys)`.

Roadmap brief header (D5):

```
Phase: { P0 } · Depends on: { NN, NN | — } · Primary workspaces: { areas }
```

Genesis brief headings (D6), exactly, in order: `What I think you're building`, `Coverage`,
`Non-goals`, `Open Dimensions`, `Research Angles`, `Picks`, `Non-UI Coverage`.

ADR (D8) — `docs/adr/0038-approval-by-hash-is-the-only-provenance.md`, template `adr.md`:
Status accepted; Date 2026-11-03; Archetype n/a (amendment ADR for this plugin repo); Deciders
`JJ + session (specs/20261103/02-ceremony-nothing-reads.md)`; Context: the ledger's every reader
was the ledger machinery; Options: keep the gate / reader-only parser / delete; Decision:
`Approving a journey confirms its sentences by hash; no other provenance record is kept or
gated on.`; Applies to: `ADR-0006 — its Decision's sentence "The provenance ledger, not the
session's judgment, gates each advance" and its rejected option C are superseded; the rest of
ADR-0006 stands`; Dissents: option C's own objection from ADR-0006 ("ask when unsure never
fires"), recorded verbatim.

## Behavior

- A cold `/spec:mocks` root gets `seed.md` and `status.json` only. Marks verify their own
  artifacts; the only approval test is the story hash. A `design/mocks/ledger.md` on an existing
  host stays on disk, unread by any script.
- A `status.json` from the retired mock-app flow (any `schemaVersion` other than 3) is read
  through `normalise`: with no `seedDone` mark the driver prints the SEED step and writes
  nothing until the next accepted mark, which saves a `schemaVersion: 3` file in place. Genesis's
  BRIEF precondition reads `state === "APPROVED"` only and is unaffected.
- Genesis BRIEF on a visual archetype: `--mark brief-written` requires `design/mocks/status.json`
  at `APPROVED` and nothing else; the brief's `## Journeys` is not read, `## Non-UI Coverage` is
  not gated. `--mark roadmap-written` keeps its `Phase:`/`Depends on:`/first-light/placement
  checks and runs no parking-lot check.
- FINALISTS asks nothing: the session reads the 📌 line and runs `--mark finalists-skipped`
  unless the owner vetoes, in which case it composes finalists and marks `finalists-written`.
- The sibling spec 20261103/01 lands on the same `roadmap-brief.md`; its hunk is below the
  header, this one's is the header and comment — the two apply in either order.

## Acceptance Criteria

- **AC-20261103-02-1**: WHEN `mocks-driver.js --root <cold>` runs on a root with no `design/mocks/` THE SYSTEM SHALL create `design/mocks/seed.md` and `design/mocks/status.json` and no `design/mocks/ledger.md`; and WHEN that root holds a valid two-journey seed and `--mark seed-done` runs THE SYSTEM SHALL exit 0 with the last non-blank stdout line matching `^✅ checkpoint — mocks state saved \(SEED → SCREENS\)` and no `📒` anywhere in stdout → writes tests/mocks/no-ledger.test.js
- **AC-20261103-02-2**: WHEN `mocks-driver.js --root <r> ledger counts` runs THE SYSTEM SHALL exit 2 with stderr matching `unknown command "ledger"` and write no file → writes tests/mocks/no-ledger.test.js
- **AC-20261103-02-3**: WHEN a terminal-mode root at SCREENS carries `design/mocks/ledger.md` holding `| A1 | SCREENS | product | x | invented | open | - | - | - |` THE SYSTEM SHALL print no `confirm these` block on a bare run, and `--mark journey-approved --journey owner-onboarding` SHALL exit 0 and record `by: "terminal"` → writes tests/mocks/no-ledger.test.js
- **AC-20261103-02-4**: WHEN `design/mocks/status.json` is `{"schemaVersion":2,"state":"SCREENS","marks":{"seedDone":"2026-09-01T00:00:00Z"}}` THE SYSTEM SHALL answer `--state` with `SEED`, exit 0, leave `status.json` byte-identical, create no `status.legacy.json`, and print neither `moved to` nor `rm` → writes tests/mocks/no-ledger.test.js
- **AC-20261103-02-5**: WHEN `spec-status.js --root <r>` runs on a root whose `design/mocks/ledger.md` carries 13 catches THE SYSTEM SHALL print no line containing `🧭`, and `--json`'s top-level keys SHALL be exactly `anomalies`, `briefs`, `specs`, `superseded` → rewrites tests/spec-status.test.js :: AC-20260902-11-6
- **AC-20261103-02-6**: WHEN a `web-app` genesis root at BRIEF has `design/mocks/status.json` at `APPROVED`, a one-journey seed, a `design/mocks/ledger.md` carrying a blocking `invented open` product row, and a brief with no `## Journeys` and every `## Non-UI Coverage` key `dark` THE SYSTEM SHALL print a BRIEF step whose `Read only:` names no `ledger.md`, carrying `seed journeys: 1 · notes open: 0` and no `derived from` or `## Journeys`, and `--mark brief-written` SHALL exit 0 recording `design: "ratified"` → writes tests/genesis/no-ceremony.test.js
- **AC-20261103-02-7**: WHEN a genesis root at ROADMAP has `design/mocks/ledger.md` carrying `| X1 | APPROVED | exclusion | export to csv | said-by-user | confirmed 2026-10-01 | - | - | deferred: n-1 |` and an overview whose `## Parking lot` section lacks `- export to csv` THE SYSTEM SHALL accept `--mark roadmap-written` (exit 0, no `parking lot` in stderr) → writes tests/genesis/genesis-driver.test.js
- **AC-20261103-02-8**: WHEN a tournament archetype reaches FINALISTS, whether `framework` was asked or auto-picked, THE SYSTEM SHALL print `📌 Auto-picked skip — the race costs one mini-build per finalist and ## Picks already names the stack (veto anytime)` on its own line, no line starting `default:`, and the `--mark finalists-skipped` line before the `--mark finalists-written` line → rewrites tests/genesis/menus-autopick.test.js :: AC-20261029-06-5
- **AC-20261103-02-9**: WHEN the plugin tree is read THE SYSTEM SHALL have no `spec/templates/mocks-ledger.md`, `spec/scripts/lib/mocks-ledger.js` or `tests/fixtures/mocks-ledger/`; `spec/entrypoints.json` SHALL name no `mocks-ledger.md`; `spec/doctrine/mocks.md` SHALL carry no `## Provenance Ledger` heading and no phrase `ledger`, `status.legacy.json` or `**Edges.**`; `spec/commands/mocks.md` SHALL carry no `ledger` → writes tests/consistency/ceremony-nothing-reads.test.js
- **AC-20261103-02-10**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL carry none of the phrases `derive pass`, `coverage check`, `generating question`, `Provenance Ledger`, `gateVerdict`, `exclusion`, `## Journeys`; and `spec/templates/genesis-brief.md`'s `## ` headings SHALL be exactly the seven of Contracts in order → writes tests/consistency/ceremony-nothing-reads.test.js
- **AC-20261103-02-11**: WHEN `spec/templates/roadmap-brief.md` is read THE SYSTEM SHALL carry none of `Lane:`, `Risk:`, `Expected specs`, `Design stage` before its first `## ` heading, and its header SHALL match `^Phase: .* · Depends on: .* · Primary workspaces: .*$`; `spec/doctrine/core.md` § Pipeline Entry SHALL carry no `Lane:` → writes tests/consistency/ceremony-nothing-reads.test.js
- **AC-20261103-02-12**: WHEN a terminal-mode root has two pending journeys THE SYSTEM SHALL CONTINUE TO print `## Step: confirm 2 journeys in the terminal`, one `### <journey>` block per journey, `approve all, or name the ones to change`, and one `--mark journey-approved --journey` line per journey → reuses tests/mocks/seed-reads-brief.test.js :: AC-20261029-06-10

## Assumptions (escalation triggers)

- A1 (verified 2026-11-03): every reader of `design/mocks/ledger.md` / `lib/mocks-ledger.js` is in this File Plan — `grep -rn "mocks-ledger" spec/ tests/ docs/canonical scripts/` → `spec/scripts/mocks-driver.js`, `spec/scripts/genesis-driver.js`, `spec/scripts/spec-status.js`, `spec/doctrine/mocks.md`, `spec/entrypoints.json`, `tests/spec-status.test.js`, `docs/canonical/status.md`; `grep -rln "ledger\.md\|Provenance Ledger\|said-by-user\|gateVerdict\|writeLedger\|BLOCKING_ROW\|confirm these" tests/` → `tests/mocks/{ledger-verbs,legacy-status-retired-in-place,seed-reads-brief}.test.js`, `tests/mocks/wireframe-fixtures.js`, `tests/genesis/tournament.fixtures.js`, `tests/spec-status.test.js`, `tests/spec-paths.test.js`, `tests/question-style-gate.test.js` (comment only, hook untouched), `tests/fixtures/mocks-ledger/dry-run.md` — **if false:** the extra reader enters the File Plan as a fix row in the same batch; never a kept parser.
- A2 (verified): `tests/fixtures/mocks-ledger/dry-run.md` has zero references (`grep -rn "mocks-ledger/dry-run\|dry-run.md" tests/ spec/` → none) — **if false:** keep the fixture and drop its DELETE row.
- A3 (verified): no script prints the ops-ADR passes — `grep -rn "derive pass\|coverage check\|generating question" spec/ tests/` hits only `spec/doctrine/genesis.md:147-152` and unrelated `coverage-scope.js`/contract lines — **if false:** delete the printing lines in the same batch.
- A4 (verified): the mid-flow config paragraphs have no driver branch — `grep -n "mid-flow\|legacy" spec/scripts/mocks-driver.js` hits only the `retireLegacyStatus` block and its dispatch (lines 104–120, 134, 747–757) — **if false:** delete that branch too.
- A5 (verified): `Risk:`, `Expected specs`, `Design stage` and `Lane:` have no script reader — `grep -rn "Lane:\|Risk:\|Expected specs\|Design stage" spec/ scripts/ --include=*.js --include=*.sh` → `prototype-driver.js:20` (a comment saying it is never read); `spec-status.js` and `genesis-driver.js` read `Phase:`/`Depends on:` only — **if false:** keep that field and record it in Rationale.
- A6 (verified): `## Non-UI Coverage` IS read — `genesis-driver.js:2582 discoveryRoundLines` and § Genesis: Discovery Interview — so D6 keeps it — **if false:** nothing changes; the section still costs nothing.
- A7 (verified): `spec/bin/spec-paths` names no `Provenance Ledger` section list (`grep -n "Provenance" spec/bin/spec-paths` → none) and `grounding-contract.md`'s `ledger` lines are the run ledger — neither critical file is touched — **if false:** STOP, ask the user (tier would turn critical).
- A8: `tests/prototype/prototype-driver.test.js`'s fixture brief keeps its `Lane: structural` line and the case keeps proving a brief with such a line is admitted — **if false:** (the case reddens) drop the fixture line and the one `assert.match` on it, nothing else.
- A9 (prediction, pipeline rules § Gotchas eighth trigger): the three fixture helpers (`makeRoot`, `ratifyBriefArtifacts`, `advanceToRoadmap`) are the only test setups that write a ledger — **if false:** the extra setup drops its ledger write in the same batch.

## Rationale

The owner's goal is removal, and the test for each item was "does anything outside the item read
it". The ledger failed that test in the one way that matters: every reader (the mocks gate, the
genesis BRIEF precondition, the parking-lot check, the MENUS seed-row print, the status line)
exists only because the ledger exists. The spec-status line is the closest to a real consumer —
it surfaces catches to the dashboard — but nothing would write a catch once the `ledger catch`
verb is gone, so a parser kept for it would parse nothing. ADR-0006 decided the ledger gate and
rejected its absence as option C, so D8 records the reversal as a superseding ADR rather than
silently contradicting it; ADR-0006's reordering decision stands.

Two "unread" claims proved partly false and were handled narrowly. `## Non-UI Coverage` is read
and written by DISCOVERY (D6 keeps it; only its `brief-written` gate goes). `spec-status.js` is a
critical-tier file by name, but the touch is one render line with the `--json` shapes untouched,
the exact shape two earlier specs shipped at standard; the tier stays standard and the reviewer
reads that diff with the `--json` key-set pin in front of it.

D4's choice — read any `status.json` through `normalise` rather than refuse it — is the owner's
"terminal means gone": the retired flow is not a case. A retired APPROVED file derives SEED in
the mocks driver while genesis keeps reading `state`; the first mark rewrites it, which is the
correct end for a retired artifact. D7 narrows a question to a printed pick instead of deleting
the tournament, because the owner asked for opt-in; the states and marks are untouched so no
state-machine pin moves.

The File Plan carries thirteen source-layer rows, one over the ~12 cap. Every row is a deletion
inside one landing unit (a ledger reader left behind in any file reddens the suite); splitting by
file would be slicing by layer, which core § Decomposition forbids. `question-style-gate.js`
keeps a dead regex alternative (D2) because removing it is wording on a hook surface.
`tests/prototype/prototype-driver.test.js` keeps its `Lane: structural` fixture: it proves a
brief with an extra header line is admitted, which stays true (A8). `genesis.md` § Genesis:
Discovery Interview's "exactly six `## ` sections" sentence was already stale against the
template's eight and is left alone — not this spec's prose.

Collision closure (literals `mocks-ledger`, `Provenance Ledger`, `ledger.md`, `gateVerdict`,
`countsLine`, `confirm these`, `finalists-skipped`, `default: race`, `default: skip`, `Lane:`,
`Risk:`, `Expected specs`, `Design stage`, `## Journeys`, `Non-UI Coverage`, `status.legacy`,
`derive pass`, `coverage check`, `Parking lot`, `exclusion`): every hit in a file this plan
edits is a File Plan row (`README.md` and the canonical `confirm these` sentence were added by
the sweep). Waived: `docs/adr/*`, `docs/audit/*`, `docs/roadmap/*` are history; `docs/canonical/*`
changes through the Canonical Delta; `spec/scripts/question-style-gate.js` keeps its owner
citation and regex (D2); `spec/commands/doctor.md`'s `scaffold-ledger.md` and the `Lane:` hits
in `spec/commands/fix.md`, `fanout-driver.js`, `lib/queue.js`, `pending-question.js`,
`spec-build-driver.js`, `spec-queue.js` and their tests are the queue's lane column, not the
brief field; `Risk:` in `docs/roadmap/*` is authored history; `Non-UI Coverage` hits in
`genesis-driver.js`/`discovery-rounds.test.js`/`genesis-doctrine.test.js` are the DISCOVERY
reader and its pins, which D6 keeps; `## Journeys` in `mocks-seed.md`, `design-brief.md` and
`design-direction-round.test.js` is the seed's and the design brief's own section; `Parking lot`
in `roadmap-overview.md` is the surviving heading; `exclusion`, `coverage check` and `derive
pass` hits outside the File Plan are the English word (`scope-reconcile`, `coverage-scope.js`,
`release-legs`), not the ledger kind; `tests/prototype/prototype-driver.test.js` and its
fixture per A8; `tests/genesis/{design-direction-round,tournament}.test.js` exercise
`finalists-skipped`, which D7 keeps.

## Canonical Delta

`docs/canonical/status.md`: delete the paragraph beginning `The dashboard prints one line
directly under the 🗺️ Roadmap block — 🧭 misunderstandings`; the render has no such line.

`docs/canonical/genesis.md`: in the specs/20260902/08 bullet, `BRIEF requires
design/mocks/status.json APPROVED with an open ledger gate` becomes `BRIEF requires
design/mocks/status.json APPROVED` and `once the mocks precondition and the brief's ## Journeys
/ ## Non-UI Coverage checks pass` becomes `once the mocks precondition passes`. Replace the
**Brief from the approved set (specs/20260902/11)** bullet with: `The genesis brief carries no
## Journeys section and brief-written gates neither journeys nor ## Non-UI Coverage; the BRIEF
step prints seed journeys: N · notes open: N. MENUS prints no seed rows. ROADMAP runs no
parking-lot check (specs/20261103/02).` In the specs/20261029/06 bullet, `FINALISTS prints a
race/skip default from whether framework or language-runtime was asked` becomes `FINALISTS
prints 📌 Auto-picked skip and asks nothing (specs/20261103/02)`. Add one bullet: `Since
specs/20261103/02 the mocks provenance ledger is gone: no ledger.md, no gate, no counts line,
no exclusion rows; approving a journey by story hash is the only provenance. The ops-ADR derive
pass and coverage check are deleted. The mocks driver reads any status.json as-is; the retired
flow has no move-aside branch.`

`docs/canonical/design.md`: delete the sentence `A brief's Lane: field is advisory; running this
command is choosing the behaviour lane, and no gate runs on the prototype tree.` and land
`Running this command is choosing the behaviour lane, and no gate runs on the prototype tree.`
in its place (the brief has no `Lane:` field). In the specs/20261029/06 paragraph, delete the
clause `every mocks step print is preceded by one confirm these N assumptions block for blocking
product rows;` so it reads `SEED prints the idea from .claude/genesis/brief.md when present;
terminal SCREENS lists every pending journey in one block.`
