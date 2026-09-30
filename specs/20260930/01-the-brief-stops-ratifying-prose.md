---
date: 2026-09-30
status: done
build_base: design-retool
tier: critical
area: genesis
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: d6248b5036abb271eb7882efc3597e3b69d58c57
---

# The brief stops ratifying prose

## Goal

Genesis's early BRIEF step still makes every non-API project write two design artifacts: a
one-page taste doctrine (`docs/design/doctrine.md`, ≤120 lines, a non-empty `## Dissents`) and a
category-only rules manifest (`.claude/genesis/design-rules.json`). ADR-0030 (b) says the design
contract is code, and that no prose enforces it. Brief 30's design stage now writes the real
contract: the design brief plus the auto-loaded rules file, checked by `design-contract-check`
and mechanized by `/spec:enforce`'s `kit-discipline` and per-layer naming cells. The old pair
is a second canon that nothing checks. This spec retires both artifacts, their driver gate,
and every reader: `/spec:enforce`'s design-enum fold, `/spec:doctor`'s hash check, `/spec:init`'s
legacy path, and the grounding contract's `designRulesHash` key. Done means a genesis run
reaches MENUS without either file on disk, and no live plugin surface names either file.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `--mark brief-written` no longer reads, requires or validates `docs/design/doctrine.md` or `.claude/genesis/design-rules.json` for any archetype or mode. A visual archetype still passes the unchanged mocks precondition and the `## Journeys` / `## Non-UI Coverage` checks, then records `design: "ratified"`. `--legacy` skips the mocks precondition, as today, and records `design: "ratified"` with nothing further. `genesis-driver.js` deletes `DOCTRINE_LINE_CAP`, `DESIGN_RULE_CATEGORIES`, `doctrinePath`, `designRulesPath`, `designRulesCheck` and every refusal they fed. It keeps `dissentsBody`/`dissentsNonEmpty`, because the ADR check still uses them, and rewrites their comment to name only ADRs. (AC-20260930-01-1, AC-20260930-01-3) | ADR-0030 (b): an unchecked prose canon beside the enforced one is the drift ADR-0030 retired. |
| D2 | `DESIGN_SKIPPED_ARCHETYPES` becomes `['backend-api', 'data-ml', 'conversational-bot', 'cli-devtool']`. BRIEF records `design: "skipped"` and `brief.mocks: null` for all four. Voice, persona and CLI-style choices go into the ordinary decision records and the root agent file (JJ, 2026-09-30). (AC-20260930-01-2) | Neither archetype reaches DESIGN_BRIEF (it is visual + Storybook only), so without this the doctrine would have been their only design record. JJ chose "nothing, like APIs" over keeping the doctrine for them. |
| D3 | The BRIEF step print (fresh, legacy and skipped arms) and the HANDOFF step's `Read only:` list never name `docs/design/doctrine.md` or `design-rules.json`. The legacy arm reads `Read only: .claude/genesis/brief.md` and prints only the `--mark brief-written --legacy` command. The visual arm drops its `Write docs/design/doctrine.md …` line and keeps the mark command. HANDOFF drops its `design-rules.json` read-list push. (AC-20260930-01-4, AC-20260930-01-5) | A step that tells the session to write a file nothing reads recreates the second canon by instruction. |
| D4 | `freshStatus()` and `spec/templates/status.json` drop the `designManifestPath` key. An existing `status.json` that still carries it is left alone: no reader exists, and no migration runs. (AC-20260930-01-4, AC-20260930-01-5) | Nothing reads the key, and it only names the retired file. |
| D5 | `spec/commands/enforce.md`: Phase 1's rule-surface list drops `.claude/genesis/design-rules.json`. The "Genesis-seeded repos also carry …" fold paragraph is deleted. Phase 6's hash sentence drops its `designRulesHash` comparison. Design categories now come only from the host's `design` block: the existing `kit-discipline` cell and the per-layer `naming/<layer>` cells from `design.rules` § Naming. Any other design rule (i18n, a11y, layout) is a written host rule under `.claude/rules/`, classified like every other clause (📌 auto-picked 2026-09-30: the default the queue item named; `kit-discipline` already exists since specs/20260926/02). (AC-20260930-01-5) | The fold's input is gone, and the enforcer cell it would feed already exists. |
| D6 | `spec/commands/doctor.md` check 9 keeps only these: `genesisStackDescriptor`, when recorded, exists and parses; every `docs/adr/*.md` has a `## Dissents` section (presence only). It drops the `designRulesHash` comparison, the `targetCategory` enum check, the "encodable dimension tokenized or DEFERRED in the doctrine" clause, and the design doctrine's `## Dissents` clause. (AC-20260930-01-5) | Each dropped clause reads a retired artifact. |
| D7 | `spec/commands/init.md` Phase 6: the genesis consume arm says the design stage authored the kit, tokens and rules file, with no legacy `design-rules.json` path. The consume-side keys it records are `genesisStackDescriptor` only. (AC-20260930-01-5) | `designRulesHash` has no producer or consumer once D5/D6 land. No script ever stamped it (grep: zero hits in `spec/scripts`). |
| D8 | `spec/templates/grounding-contract.md`, this spec's one contract edit: § Required config keys names only `genesisStackDescriptor` as a genesis-handoff key. § Genesis handoff deletes the `designRulesHash` bullet and replaces its "Decide vs implement" design-enum paragraph with one sentence: design rules reach `/spec:enforce` through the `design` block (the `kit-discipline` cell plus per-layer naming cells); any other design rule is a written host rule. This repo's `.claude/spec.config.json` `contractHash` is re-stamped to the new `spec-paths contract-hash` output in the same build. (AC-20260930-01-5, AC-20260930-01-6) | A genuine contract change: a key leaves the contract. Every host's grounding reads stale until a `/spec:doctor` re-stamp. That cost is intended, and it is why this spec is critical tier. |
| D9 | `spec/doctrine/genesis.md`. § Genesis: Brief State: the ratification tiers become two (the four design-skipped archetypes record `skipped`; the visual four pass the mocks precondition and record `ratified`); the **Doctrine (never values)** and **Design rules** paragraphs are deleted; the legacy sentence drops "never the ratification checks above". § Genesis: Archetype Registry: the `conversational-bot`/`cli-devtool` cells read `no`, `realtime-trading` reads `yes`, and the paragraph under the table names four design-skipped archetypes. § Genesis: Fresh UX Research: mechanizable rules flow into the rules file's tables at `DESIGN_BRIEF` (§ Genesis: Design Stage), not into `design-rules.json` at BRIEF. § Genesis: Enforcement Handoff: *decides* moves to `DESIGN_BRIEF` (the rules file); the `targetCategory` bullet and the doctor-warns bullet are replaced by D5's sentence. § Genesis: On-disk Handoff: the `design-rules.json` row is deleted. [no-ac: prose — `citations-check.js` MISS=0 (AC-20260930-01-7) and AC-20260930-01-5's sweep are the oracles] | Doctrine follows the driver. |
| D10 | `spec/templates/ux-research-brief.md`'s Enforcement line reads `gate-checkable (name the rules-file row or kit check that carries it)`. [no-ac: template prose; the old line names no banned literal] | The old wording pointed a research author at the retired category enum. |
| D11 | Test fixtures stop writing the retired artifacts: `ratifyBriefArtifacts` in `tests/genesis/tournament.fixtures.js`, and the `ratifyVisualBrief`-style helpers in `tests/genesis/design-stage-brief.test.js`, `design-stage-kit.test.js` and `design-stage-approval.test.js`, drop their `docs/design/doctrine.md` and `.claude/genesis/design-rules.json` writes and the comment clauses naming them; `design-stage-brief.test.js`'s local `DESIGN_SKIPPED_ARCHETYPES` mirror takes D2's four-entry value. No test name or assertion changes in these files. [no-ac: fixture hygiene — the files stay green, and the whole-suite gate is the oracle that the gate removal left them passing] | Refactors delete what they retire. A fixture that keeps writing a dead file teaches the next reader that it still matters. |
| D12 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: `plugin-bump.js --check` in the gate is the oracle] | Pipeline rules § Planning version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D4: brief-written drops the doctrine/rules gate and its helpers; DESIGN_SKIPPED_ARCHETYPES gains conversational-bot and cli-devtool; BRIEF step arms and HANDOFF read list drop the two files; freshStatus drops designManifestPath; header/section comments naming the retired canon rewritten |
| spec/templates/status.json | MODIFY | doctrine | D4: drop the `designManifestPath` key |
| spec/commands/enforce.md | MODIFY | doctrine | D5: drop the design-rules.json read, the fold paragraph, and the designRulesHash comparison |
| spec/commands/doctor.md | MODIFY | doctrine | D6: check 9 keeps only the stack-descriptor parse and ADR Dissents presence |
| spec/commands/init.md | MODIFY | doctrine | D7: genesis consume arm drops the legacy rules path and designRulesHash |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D8: the one contract edit — drop designRulesHash and the design-enum fold paragraph |
| .claude/spec.config.json | MODIFY | other | D8: re-stamp `contractHash` to the new `spec-paths contract-hash` output |
| spec/doctrine/genesis.md | MODIFY | doctrine | D9: Brief State, Archetype Registry, Fresh UX Research, Enforcement Handoff, On-disk Handoff |
| spec/templates/ux-research-brief.md | MODIFY | doctrine | D10: the Enforcement line |
| spec/.claude-plugin/plugin.json | MODIFY | other | D12: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/genesis/brief-retires-doctrine.test.js | CREATE | tests | AC-20260930-01-1, AC-20260930-01-2, AC-20260930-01-3, AC-20260930-01-4, AC-20260930-01-5 |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20260930-01-6 (retag the reused contractHash pin's title) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260930-01-7 (retag the reused citations-check test's title) |
| tests/genesis/tournament.fixtures.js | MODIFY | tests | D11: ratifyBriefArtifacts drops the two retired writes |
| tests/genesis/design-stage-brief.test.js | MODIFY | tests | D11: fixture helper drops the two retired writes and their comment clauses; the local DESIGN_SKIPPED_ARCHETYPES mirror takes D2's value |
| tests/genesis/design-stage-kit.test.js | MODIFY | tests | D11: fixture helper drops the two retired writes |
| tests/genesis/design-stage-approval.test.js | MODIFY | tests | D11: fixture helper drops the two retired writes |

## Contracts

`genesis-driver.js` observable changes (every other mark, state and refusal is unchanged):

```
# visual archetype, mocks APPROVED + open ledger, journeys/non-UI sections present,
# NO docs/design/doctrine.md, NO .claude/genesis/design-rules.json
$ genesis-driver.js --root <r> --mark brief-written
exit 0 · stdout last line: ✅ checkpoint — genesis state saved (BRIEF → MENUS); …
status.json: design "ratified", brief.mocks "design/mocks/status.json", brief.legacy false

# archetype conversational-bot (or cli-devtool), nothing on disk beyond the genesis brief
$ genesis-driver.js --root <r> --mark brief-written
exit 0 · status.json: design "skipped", brief = {mocks: null, legacy: false, ratifiedAt: <ISO>}

# legacy resume: marks.menusDone true, marks.briefWritten unset, visual archetype, no mocks
$ genesis-driver.js --root <r> --mark brief-written --legacy
exit 0 · status.json: design "ratified", brief.legacy true

# fresh status.json (no file on disk, bare invocation)
keys: schemaVersion, architect, design, archetype, localeScope, brief, stackDescriptorPath,
      gateCommand, lastUpdated, marks, menus, scaffold, zeroDayGate, handoff
      (no designManifestPath)
```

`DESIGN_SKIPPED_ARCHETYPES` (exact order): `['backend-api', 'data-ml', 'conversational-bot', 'cli-devtool']`.

## Behavior

A host already carrying `docs/design/doctrine.md` or `.claude/genesis/design-rules.json`
(the salon-os-era genesis hosts) keeps the files; nothing deletes them. Nothing reads them
either. The next `/spec:enforce` run rebuilds the manifest from the rule surface, which no
longer includes the rules manifest. Any cell whose `ruleRefs` named it drops out, and the
design block's own cells stay. The next `/spec:doctor` flags the stale `contractHash` stamp
through its existing grounding check, and a re-stamp clears it.

The ADR `## Dissents` requirement (DECIDE's ADR check, doctor check 9's ADR clause) is
untouched. Only the design doctrine's Dissents goes away.

A status.json whose `design` is a legacy partial value (`doctrine-drafted`/`tokens-landed`)
still blocks `/spec:init` exactly as today. Re-marking brief-written now clears it without
writing a doctrine.

## Acceptance Criteria

- **AC-20260930-01-1**: WHEN a `web-app` genesis root has passed `discovery-done`, carries an
  APPROVED `design/mocks/status.json` with an open ledger and a brief whose `## Journeys` /
  `## Non-UI Coverage` sections pass, and has neither `docs/design/doctrine.md` nor
  `.claude/genesis/design-rules.json`, THE SYSTEM SHALL accept `--mark brief-written` with exit 0,
  record `design: "ratified"` and `brief.mocks: "design/mocks/status.json"`, and create neither
  file (pre-image: exit 2, stderr contains `docs/design/doctrine.md does not exist`)
  → writes tests/genesis/brief-retires-doctrine.test.js
- **AC-20260930-01-2**: WHEN a genesis root whose `## Picks` names `- archetype: conversational-bot`
  (and, in a second root, `- archetype: cli-devtool`) has passed `discovery-done` with no design
  artifacts on disk, THE SYSTEM SHALL accept `--mark brief-written` with exit 0 and record
  `design: "skipped"` and `brief.mocks: null` (e.g. `{"design":"skipped","brief":{"mocks":null,
  "legacy":false,…}}`) → writes tests/genesis/brief-retires-doctrine.test.js
- **AC-20260930-01-3**: WHEN a `web-app` status.json carries `marks.discoveryDone` and
  `marks.menusDone` but no `marks.briefWritten`, with no mocks status, no doctrine and no rules
  manifest on disk, THE SYSTEM SHALL accept `--mark brief-written --legacy` with exit 0 and record
  `design: "ratified"`, `brief.legacy: true` → writes tests/genesis/brief-retires-doctrine.test.js
- **AC-20260930-01-4**: WHEN the driver is invoked bare on a fresh root (no status.json), and
  again at BRIEF for a web-app root with APPROVED mocks, a legacy-resume root and a
  conversational-bot root, THE SYSTEM SHALL write a status.json with no `designManifestPath` key,
  and print step text containing neither `doctrine.md` nor `design-rules.json` in any of the three
  BRIEF arms → writes tests/genesis/brief-retires-doctrine.test.js
- **AC-20260930-01-5**: WHEN every file under `spec/` (commands, doctrine, scripts, templates,
  bin, workflows) and `README.md` is read THE SYSTEM SHALL contain zero occurrences of each of
  the literals `design-rules.json`, `docs/design/doctrine.md`, `designRulesHash`,
  `designManifestPath` and `DOCTRINE_LINE_CAP` (e.g. `spec/commands/enforce.md` → 0 hits for
  `design-rules.json`; `spec/templates/grounding-contract.md` → 0 hits for `designRulesHash`).
  The offending path and literal are named on failure. The literal `design-rules.md` and the
  `spec-paths` key `design-rules-template` are not banned
  → writes tests/genesis/brief-retires-doctrine.test.js
- **AC-20260930-01-6**: WHEN this repo's `.claude/spec.config.json` is read after the contract
  edit THE SYSTEM SHALL CONTINUE TO carry a `contractHash` equal to `spec-paths contract-hash`'s
  output → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8
- **AC-20260930-01-7**: WHEN `scripts/citations-check.js` runs over the repo root after the
  genesis doctrine edits THE SYSTEM SHALL CONTINUE TO exit 0 and print `MISS=0`
  → reuses tests/consistency/genesis-doctrine.test.js :: AC-20260902-08-10: spec/doctrine/genesis.md carries

## Assumptions (escalation triggers)

- A1: No behavioral test pins any retired refusal (the doctrine-missing, the one-page cap,
  the empty Dissents, or any `design-rules.json` refusal). Verified at plan: `grep -rn` across
  `tests/` for `one-page cap`, `doctrine.md does not exist`, `targetCategory` and
  `design-rules.json` finds only fixture writes (the four D11 files) and
  `tests/consistency/atlas-retired.test.js`'s already-retired template path. The earlier pins
  expired at their specs' close. — **if false:** the hit is a deletion row added to this spec,
  never weakened, and its AC-ID is tagged `[retired: specs/20260930/01]` on its spec's pointer
  line (pipeline rules § Gotchas, twelfth trigger).
- A2: No script reads `designRulesHash` or `designManifestPath`. Verified at plan: both appear
  only in prose, `freshStatus()` and the status template (grep over `spec/scripts`,
  `spec/workflows`, `scripts/`). — **if false:** the reader becomes a File Plan row that
  deletes its read; STOP if it is a frozen `wf-*.js`.
- A3: The four fixture files keep passing once their doctrine/rules writes are gone. For a
  visual archetype, BRIEF's only remaining requirements are the mocks precondition and the
  brief sections, which the helpers still write. — **if false:** a test that still reaches
  a doctrine-reading path means D1 missed a caller. Fix the driver, never the fixture.
- A4: Adding `conversational-bot`/`cli-devtool` to the skipped set changes no other state's
  path. Verified at plan: `isDesignSkipped` is called only in `handleBriefWritten` and the
  BRIEF step print. `designStageApplies()` already excludes both, since neither is visual.
  — **if false:** STOP, ask the user.
- A5: No micro-spike applies. No claim here is adjudicated by a third-party dependency; every
  behavior is this repo's own driver and prose. `spikes: 0`.

## Rationale

The queue item came from specs/20260926/04's Rationale. That spec deliberately left the BRIEF
doctrine and rules manifest alone because `/spec:enforce` still consumed the manifest's
categories. Since specs/20260926/02, the host `design` block earns a `kit-discipline` cell and
per-layer naming cells from the rules file's tables. Those cover `color | typography |
density | structure` mechanically. So the manifest's only live job, feeding enforce, is
already done by the contract ADR-0030 (b) names. What remains of the old pair is prose
nothing checks: the exact "second artifact kept in agreement by hand" that ADR-0030's
Context measured failing on salon-os.

D2 is JJ's ruling. Chat-bot and CLI projects never reach DESIGN_BRIEF, so retiring the
doctrine leaves them with no design page at all. JJ took "nothing, like APIs" over keeping a
doctrine for just those two archetypes, because that would keep a second, unchecked design
path alive. Their tone decisions live in ADRs and the root agent file, which a fresh agent
actually reads.

Critical tier: D8 edits `grounding-contract.md`, a listed trigger. Every host's stamp goes
stale until `/spec:doctor` re-stamps it. That cost is intended, because a key really leaves
the contract. Leaving the key described but dead would make the contract lie.

No SHALL CONTINUE TO pin guards the surviving mocks precondition. Brief 29 retires that
precondition when walkthrough v1 runs, so a pin here would hand brief 29 a pin to delete.
The two CONTINUE-TO ACs reuse existing pins only.

Rejected: deleting the files from existing hosts (a host's own tree is its own business, and
nothing reads them); a doctor warning for a leftover `design-rules.json` (a check for a file
nothing reads is noise); keeping `designRulesHash` as a deprecated contract key (no producer,
no consumer).

Collision closure at lock (literals leg, 5 files outside the File Plan, all waived): `docs/adr/0007-plugin-owned-capture.md`, `docs/roadmap/08-design-thinning.md` and `docs/audit/style-audit-2026-08-13.md` are historical records under waived prefixes; `tests/consistency/atlas-retired.test.js` names `spec/templates/design-rules.json` only to assert that already-deleted template stays deleted; `tests/genesis/genesis-driver.test.js` names `DESIGN_SKIPPED_ARCHETYPES` only in comments about `data-ml`, which stays in the set.

Review 2026-09-30 (rv_a23fc5647ebe, CLEAN): the reviewer's two soft findings — two stale
comments in `genesis-driver.js` still describing the two-entry skipped set and the retired
BRIEF write instruction — were fixed comment-only in the close commit; no behavior changed.

Fragile: genesis.md's § Genesis: Brief State is sliced by `genesis-doctrine.test.js`
(AC-20260907-05-8). The rewrite must not introduce `design/tokens.css` or the literal `skin`.
The collision-closure run at lock lists every other literal hit.

## Canonical Delta

In `docs/canonical/genesis.md`, the paragraph opening "Since specs/20260902/08 the design stage
has left genesis" replaces its sentence "`--mark brief-written` ratifies the one-page doctrine
(`## Dissents` present and non-empty, recording the minority positions the doctrine rejects)
plus category-only design-rules (`design: "ratified"`; `backend-api`/`data-ml` record
`design: "skipped"`)" with: "`--mark brief-written` records `design: "ratified"` once the mocks
precondition and the brief's `## Journeys` / `## Non-UI Coverage` checks pass. `backend-api`,
`data-ml`, `conversational-bot` and `cli-devtool` record `design: "skipped"`. Since
specs/20260930/01 there is no BRIEF doctrine or rules manifest: the design contract is the
rules file DESIGN_BRIEF writes, mechanized by `/spec:enforce`'s `kit-discipline` and naming
cells."
