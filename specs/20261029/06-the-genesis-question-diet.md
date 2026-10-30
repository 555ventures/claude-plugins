---
date: 2026-10-29
status: draft
tier: critical           # touches spec/scripts/question-style-gate.js (hook surface) and spec/scripts/genesis-state-gate.sh's neighbour genesis-driver.js
area: genesis
breaking: false
depends_on: []
brief: n/a
---

# The genesis question diet

## Goal

A greenfield run asks the owner about 8 to 12 times before the first `/spec:plan`, down from 25
to 45, without deciding a single product fact for them. Every stack dimension that already has a
ranked, cited recommendation on disk is auto-picked and printed as `📌 Auto-picked … (veto
anytime)`; the questions that remain are batched four to a round, carry a recommended default,
and cover only genuine forks, money, external services and product facts. The design forks the
doctrine already calls mandatory (navigation shell, layout system, colour schemes, accessibility
baseline, token tiers) get the one round no driver step ever gave them. Mocks reads the genesis
brief instead of asking for the idea twice.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 2.1, 2.2 and Part 4 item 6.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | DISCOVERY coverage (ten keys) is asked as pre-filled confirmation: the session derives a guess per key from the idea, prints the guesses, and asks in rounds of four — each option "confirm <guess> (Recommended)" / "correct: …" / "not applicable"; the six Non-UI Coverage keys of BRIEF join the same rounds (the two duplicates `integrations`/`pricing` collapse into `integrations`/`payer`) (AC-20261029-06-1) | Product facts stay asked (core § Question Style), but the ten-second cold test is easier to pass when the owner confirms a sentence than when they answer an open question. One interview instead of two. |
| D2 | The archetype pick prints `📌 Auto-picked archetype <key> — <one-line reason> (veto anytime)` before `--mark discovery-done`; the driver refuses the mark while `## Picks` has no archetype line (AC-20261029-06-2) | The master variable was silently chosen; a printed pick is the cheapest veto surface. |
| D3 | MENUS auto-picks every open dimension whose research file has a unique rank-1 option that is not `is_minority` and not `priced`, printing one `📌` line each; it asks only for dimensions with a rank tie, an `is_minority` leader, or a `priced` vendor, batched four per `AskUserQuestion`, recommended first. DECIDE's hard-fork escalation fires only for a dimension still unresolved after MENUS (AC-20261029-06-3, AC-20261029-06-4) | The research already ranks with a reason; asking the owner to pick a package manager is the audit's GEN-10. Money and minority picks stay human. |
| D4 | FINALISTS (race or skip) is one question with the cost line the driver already prints and a derived default: race recommended only when MENUS left `framework` or `language-runtime` as an asked fork; otherwise skip recommended (AC-20261029-06-5) | Real token cost; today nobody is named as decider. |
| D5 | The ops-conventions ADR at DECIDE auto-fills eight rows from research (printed as `📌` lines); `success-metric` moves into the D1 discovery rounds as a product fact (AC-20261029-06-6) | Conventions a model derives reliably from the stack; analytics is a vendor/privacy choice. |
| D6 | DESIGN_BRIEF gains one design-direction round before the Fable dispatch: navigation shell, layout system, colour schemes, accessibility baseline (and token tier count when the catalogue offers more than one) — one `AskUserQuestion` of up to four, each with a recommended default derived from the archetype and confirmed journeys; answers are written into `docs/design/brief.md` § Direction, which the dispatched Fable step reads (AC-20261029-06-7) | genesis.md § lists these as mandatory forks and no step asked them (audit GEN-16, S-23). |
| D7 | ROADMAP's confirmation becomes notify-and-proceed with one veto window for ordering and dependencies, keeping a question only for milestone gates (AC-20261029-06-8) | Briefs are markdown the queue can reorder later; milestone gates are product commitments. |
| D8 | `/spec:mocks` SEED reads `.claude/genesis/brief.md` (`## What I think you're building`, `## Coverage`) when present and asks for the idea only when it is absent; the ledger's `product` rows are confirmed in ONE batched round ("these N assumptions — all correct / correct these: …") instead of blocking at three marks; terminal-mode journey confirmation shows every journey once ("approve all / name the ones to change") (AC-20261029-06-9, AC-20261029-06-10) | The same idea was asked twice; three re-blocks for one list of facts. |
| D9 | `question-style-gate.js`'s product-stage exemption narrows: the `derive` verdict is suppressed only for questions whose text names a coverage key or a product row (`payer`, `tenancy`, …, or the literal `assumption`), not for every question while genesis or mocks is live (AC-20261029-06-11) | The exemption switched off the one mechanism that flags derivable questions exactly where most questions fired (audit Part 4 item 6). Product facts keep their shield; stack picks lose it. |
| D10 | Design doctrine `design.md` § Look stops is unchanged: journey approval, client review and `approve` stay human. `[no-ac: an invariant this spec does not touch]` | The diet never trades away a look stop. |
| D11 | `spec/.claude-plugin/plugin.json` bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: reviewer-held]` | Rules § Planning. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/genesis.md | MODIFY | doctrine | DISCOVERY rounds (D1), archetype pick (D2), MENUS auto-pick rule (D3), FINALISTS default (D4), ops ADR (D5), design-direction round (D6), ROADMAP veto window (D7) |
| spec/scripts/genesis-driver.js | MODIFY | scripts | DISCOVERY step prints guesses and merged key list; `discovery-done` refuses without archetype line; MENUS step classifies each dimension auto/ask and prints `📌` lines; FINALISTS step prints the derived default; DESIGN_BRIEF step prints the direction round; ROADMAP step prints the veto window |
| spec/commands/genesis.md | MODIFY | doctrine | the batching rule (≤4 per call, recommended first) and the `📌` rule for every derived pick |
| spec/templates/design-brief.md | MODIFY | doctrine | `## Direction` section (D6) |
| spec/skills/design-brief/SKILL.md | MODIFY | doctrine | reads § Direction first (D6) |
| spec/doctrine/mocks.md | MODIFY | doctrine | SEED reads the genesis brief; one batched product-row round; all-journeys confirmation (D8) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | SEED step prints the brief-derived idea; ledger gate prints the batched round once; terminal SCREENS step prints every pending journey (D8) |
| spec/scripts/question-style-gate.js | MODIFY | scripts | narrowed product-stage exemption (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D11) |
| tests/genesis/discovery-rounds.test.js | CREATE | tests | AC-20261029-06-1, AC-20261029-06-2, AC-20261029-06-6 |
| tests/genesis/menus-autopick.test.js | CREATE | tests | AC-20261029-06-3, AC-20261029-06-4, AC-20261029-06-5 |
| tests/genesis/design-direction-round.test.js | CREATE | tests | AC-20261029-06-7, AC-20261029-06-8 |
| tests/mocks/seed-reads-brief.test.js | CREATE | tests | AC-20261029-06-9, AC-20261029-06-10 |
| tests/question-style-gate.test.js | MODIFY | tests | AC-20261029-06-11 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | existing pins on the DISCOVERY/MENUS step texts retagged, never weakened |

## Contracts

MENUS classification per dimension (driver, from `interview-research/<dim>.json`):

```
auto  ⇐ exactly one option at rank 1 ∧ ¬is_minority ∧ ¬priced
ask   ⇐ otherwise
```

Printed line for `auto`: `📌 Auto-picked <dim>: <option> — <why_recommended, first sentence> (veto anytime)`.

`docs/design/brief.md` gains:

```
## Direction
- navigation shell: <sidebar|top-nav|tabs> — <reason>
- layout system: <breakpoints/grid summary>
- colour schemes: <light|dark|system>
- accessibility baseline: <WCAG level>
- token tiers: <n>
```

question-style-gate.js exemption predicate: `productStage(root) && /\b(payer|tenancy|data-sensitivity|residency|ai-use|unattended|integrations|scale-outage|vendor-budget|offline-mobile|jobs|notifications|retention|admin|success-metric|assumption)\b/i.test(questionText)`.

## Acceptance Criteria

- **AC-20261029-06-1**: WHEN the DISCOVERY step prints for a brief with all keys `dark` THE SYSTEM SHALL list 15 keys (ten coverage + jobs, notifications, retention, admin, success-metric) each with a `guess:` line, grouped four per round with the heading `round N of 4` (e.g. 15 keys → 4 rounds) → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-2**: WHEN `--mark discovery-done` runs with no `- archetype:` line under `## Picks` THE SYSTEM SHALL exit 2 naming the missing line and the `📌 Auto-picked archetype` rule; with the line present it SHALL accept → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-3**: WHEN the MENUS step prints for research files where `framework` has a unique rank-1 non-minority unpriced option and `llm-provider` is `priced` THE SYSTEM SHALL print `📌 Auto-picked framework: <option> —` and list `llm-provider` under `ask (1):` → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-4**: WHEN a dimension has two rank-1 options THE SYSTEM SHALL list it under `ask`, and the DECIDE step SHALL print a hard-fork escalation only for dimensions whose `## Picks` line is still absent (e.g. all picked → `hard forks: none`) → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-5**: WHEN the FINALISTS step prints and `framework` was an `ask` dimension THE SYSTEM SHALL print `default: race (Recommended)`; when every tournament dimension was `auto` it SHALL print `default: skip (Recommended)` → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-6**: WHEN the DECIDE step prints the ops-conventions rows THE SYSTEM SHALL print eight `📌 Auto-picked` lines and SHALL NOT list `success-metric` among them; the DISCOVERY key list of AC-1 SHALL include `success-metric` → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-7**: WHEN the DESIGN_BRIEF step prints for a `web-app` archetype THE SYSTEM SHALL print a `## Direction round` block naming navigation shell, layout system, colour schemes and accessibility baseline, each with `(Recommended)` on one derived option, before the `Dispatch: Agent {model: "fable", effort: "high"}` line; `--mark design-brief-written` SHALL refuse while `docs/design/brief.md` lacks `## Direction` → writes tests/genesis/design-direction-round.test.js
- **AC-20261029-06-8**: WHEN the ROADMAP step prints THE SYSTEM SHALL print the sequence table under `proceeding unless vetoed` and exactly one `AskUserQuestion` instruction, about milestone gates → writes tests/genesis/design-direction-round.test.js
- **AC-20261029-06-9**: WHEN the mocks SEED step prints with `.claude/genesis/brief.md` present THE SYSTEM SHALL print `idea (from genesis brief):` followed by the brief's first paragraph and SHALL NOT print `ask the user for the product idea`; without the brief it SHALL print the ask → writes tests/mocks/seed-reads-brief.test.js
- **AC-20261029-06-10**: WHEN three `product` ledger rows are `inferred`/open at `seed-done` THE SYSTEM SHALL print one `confirm these 3 assumptions` block listing all three and one `AskUserQuestion` instruction, and the terminal SCREENS step with two pending journeys SHALL print both journeys under `approve all, or name the ones to change` → writes tests/mocks/seed-reads-brief.test.js
- **AC-20261029-06-11**: WHEN the gate's tier-2 judge returns `derive` for a question text `Which package manager should the repo use?` while a genesis run is live THE SYSTEM SHALL return the derive advisory (not suppressed); for `Who pays for the product — the end user or their employer?` it SHALL suppress it → writes tests/question-style-gate.test.js

## Assumptions (escalation triggers)

- A1: Every MENUS research file carries `rank`, `is_minority` and `priced` per option (wf-research.js OPTION_SET_SCHEMA). — **if false:** treat a missing field as `ask`.
- A2: The existing genesis-doctrine pins on step texts are additive-compatible (they match substrings, not whole lines). — **if false:** retag the pin in the same batch; never weaken.
- A3: `[NEEDS CLARIFICATION: target count — is 8 to 12 owner turns before /spec:plan the right budget, or should the diet go further (auto-pick priced vendors with a stated budget from vendor-budget)?]`
- A4: `[NEEDS CLARIFICATION: design-direction defaults — JJ to confirm the derived defaults are acceptable as recommendations (sidebar for web-app, system colour scheme, WCAG AA) or name different ones.]`

## Rationale

The audit counted the greenfield interview at 25 to 45 owner turns and classified roughly half as
derivable from research already on disk. Anthropic's current guidance says to ask only when the
answer changes the work materially, and the plugin's own doctrine already says "derive before
asking" and already has the `📌` line; genesis simply never applied it, partly because the
question-style gate's exemption told the session every genesis question was a user decision.
The diet keeps every product fact, every priced vendor and every look stop as questions, and
turns stack mechanics into printed picks the owner can veto.

Rejected: removing the archetype or MENUS questions entirely and relying on veto. A `📌` line is a
veto surface only if it is printed before the mark that depends on it, which D2 enforces.

## Canonical Delta

docs/canonical/genesis.md: the DISCOVERY paragraph gains "coverage is confirmed from pre-filled
guesses in rounds of four; the archetype is printed as a `📌` pick before `discovery-done`"; the
MENUS paragraph gains the auto/ask rule; the DESIGN_BRIEF paragraph gains the direction round;
the ROADMAP paragraph gains "proceeds unless vetoed; milestone gates are the one question".
docs/canonical/design.md § The walkthrough client: "SEED reads the genesis brief when present."
