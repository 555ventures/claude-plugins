---
date: 2026-10-29
status: hardened
tier: critical           # touches spec/scripts/question-style-gate.js (hook surface, rules § Risk Tiers)
area: genesis
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-31
open_markers: 0
---

# The genesis question diet

## Goal

A greenfield run asks the owner about 8 to 12 times before the first `/spec:plan`, down from 25
to 45, without deciding a single product fact for them. Every stack dimension whose research menu
has one clear, unpriced, non-minority leader is picked from the research and printed as
`📌 Auto-picked … (veto anytime)`; the questions that remain are batched four to a round, carry a
recommended default, and cover only genuine forks, money, external services and product facts.
The design forks the doctrine already calls mandatory (navigation shell, layout system, color
schemes, accessibility baseline, token tier count) get the one round no driver step ever gave
them. Mocks reads the genesis brief instead of asking for the idea twice, and confirms its
inferred product facts in one round instead of refusing three marks one row at a time.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 2.1, 2.2 and Part 4 item 6.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | DISCOVERY coverage is asked as pre-filled confirmation over fifteen keys in rounds of four: the ten `## Coverage` keys, the four `## Non-UI Coverage` keys that are not duplicates (`jobs`, `notifications`, `retention`, `admin`), and `success-metric`. The driver's DISCOVERY step prints the merged list grouped `round N of 4` with each key's current brief value; the session derives one guess per key from the idea and asks each round as one `AskUserQuestion` of up to four, every question naming its key in parentheses (e.g. `Who pays for the product (payer) — …?`), options `confirm: <guess> (Recommended)` / `correct it` / `not applicable`. `## Non-UI Coverage`'s `integrations` and `pricing` lines are copied by the session from the `integrations` and `payer` coverage answers, never asked; `success-metric` is written as `- success-metric: <label>` under `## Picks` (AC-20261029-06-1) | Product facts stay asked (core § Question Style), but the ten-second cold test is easier to pass when the owner confirms a sentence than when they answer an open question. One interview instead of two; the template's ten-key `## Coverage` and six-key `## Non-UI Coverage` blocks are unchanged, so no existing pin moves. |
| D2 | The archetype is a printed pick: the DISCOVERY step, while `## Picks` has no `- archetype:` line, prints `📌 derive the archetype from the idea, print "📌 Auto-picked archetype <key> — <one-line reason> (veto anytime)", then write - archetype: <key> under ## Picks (one of: …)` in place of today's bare `missing ## Picks line` hint, and `--mark discovery-done`'s existing refusal names the same `📌 Auto-picked archetype` rule (AC-20261029-06-2) | The master variable was silently chosen; a printed pick is the cheapest veto surface. The refusal itself already exists (specs/20260902/08) — only its instruction changes. |
| D3 | MENUS classifies every open dimension that has a recorded menu and no `## Picks` line from its research file: `auto` when exactly one option holds rank 1, that option is not `is_minority`, and its `priced` string begins `n/a`; `ask` otherwise (a rank tie, a minority leader, a priced leader, or a missing/non-integer `rank`). For each `auto` dimension the driver prints `📌 Auto-picked <dim>: <label> — <why_recommended> (veto anytime)` and `  write: - <dim>: <label>`; the session writes the line under `## Picks` (the driver never writes brief.md). The `ask` dimensions print under `ask (N): <dim> (<reason>)…` and the doctrine asks them batched four per `AskUserQuestion`, recommended first. DECIDE's hard-fork rule narrows to dimensions still without a `## Picks` line (AC-20261029-06-3, AC-20261029-06-4) `[asked: paid services are always asked — JJ chose "Always ask about paid services" over auto-picking within the stated vendor budget]` | The research already ranks with a reason; asking the owner to pick a package manager is the audit's GEN-10. Money and minority picks stay human. |
| D4 | FINALISTS prints a derived default under the existing cost line: `default: race (Recommended) — <dim> was asked` when the D3 classification of `framework` or `language-runtime` is `ask`, else `default: skip (Recommended) — every tournament dimension was auto-picked`; the doctrine makes race-or-skip one `AskUserQuestion` whose recommended option is that default (AC-20261029-06-5) | Real token cost; today nobody is named as decider. The classification is a pure function of the menu files, so FINALISTS re-derives it and the driver stores nothing new. |
| D5 | DECIDE prints the ops-conventions floor as `conventions auto-pick (8): error-taxonomy, logging, naming-identifiers, wire-representations, cross-plane-constants, env-config, ci, background-async — derive each from the stack and print 📌 Auto-picked <key> — <reason> (veto anytime)` and one `success-metric:` line — `<label> (from ## Picks)` when D1 wrote it, else `not in ## Picks — ask it, in the user's words` — and the doctrine's § Decision Record carries the rule (AC-20261029-06-6) | Conventions a model derives reliably from the stack; analytics is a vendor/privacy choice and belongs to discovery. § Decision Record is the section DECIDE's `print:` line loads; § Ops Conventions ADR is never loaded by a step. |
| D6 | DESIGN_BRIEF gains one design-direction round before the Fable dispatch: the driver prints a `## Direction round` block with `navigation shell`, `layout system`, `color schemes`, `accessibility baseline`, `token tiers`, each with one `(Recommended)` default derived from the archetype — `sidebar` for `web-app`/`desktop-app`/`realtime-trading`, `tabs` for `mobile-app`; `responsive grid, 3 breakpoints` (`single column, safe-area insets` for `mobile-app`); `system`; `WCAG 2.2 AA`; `2` — the session asks it as one `AskUserQuestion` of up to four (token tiers joins only when the kit catalogue offers more than one; otherwise printed as a `📌` line), hands the answers to the Fable dispatch, and the brief carries them as `## Direction` placed after `## Users and context`; `--mark design-brief-written` refuses while `docs/design/brief.md` lacks `## Direction` in that position (AC-20261029-06-7) `[asked: JJ confirmed these defaults]` | genesis.md § Hard-to-Reverse Dimensions lists these as mandatory design forks and no step asked them (audit GEN-16). |
| D7 | ROADMAP becomes notify-and-proceed: the step prints `proceeding unless vetoed: brief order and dependencies (reorder later with spec-queue move)` and `ask once: milestone gates — one AskUserQuestion`; the doctrine's step 2 "Confirm the sequence" is rewritten to that veto window (AC-20261029-06-8) | Briefs are markdown the queue can reorder later; milestone gates are product commitments. |
| D8 | Mocks: the SEED step prints `idea (from genesis brief): <first paragraph of ## What I think you're building>` when `.claude/genesis/brief.md` has that section, else `idea: ask the user for the product idea (no .claude/genesis/brief.md)`; every step print (SEED, SCREENS, the close block) is preceded by a `confirm these N assumptions` block listing each `product` ledger row that would block the gate (`<id> <tag> <status> — <claim>`), one `AskUserQuestion` instruction ("all correct / correct these: …") and the `ledger set` command per row, whenever N > 0; the terminal SCREENS block lists every pending journey (persona and beats each) under `approve all, or name the ones to change`, with one `--mark journey-approved --journey <j>` line per journey. The marks and the gate are unchanged (AC-20261029-06-9, AC-20261029-06-10) | The same idea was asked twice; the gate refused one row at a time at three mark names and never showed the rows; terminal mode showed one journey per run. |
| D9 | `question-style-gate.js`'s product-stage exemption narrows: a `derive` verdict is suppressed only when the run is live (today's `inProductStage`) AND some question's text matches `/\b(payer\|tenancy\|data-sensitivity\|residency\|ai-use\|unattended\|integrations\|scale-outage\|vendor-budget\|offline-mobile\|jobs\|notifications\|retention\|admin\|success-metric\|assumptions?)\b/i`; every other in-stage `derive` is advised as outside the stage (AC-20261029-06-11) | The exemption switched off the one mechanism that flags derivable questions exactly where most questions fired (audit Part 4 item 6). D1's key-in-parentheses format and D8's "assumptions" wording are what keep the shield on product facts. |
| D10 | Design doctrine `design.md` § Look stops is unchanged: journey approval, client review and `approve` stay human. `[no-ac: an invariant this spec does not touch]` | The diet never trades away a look stop. |
| D11 | `spec/.claude-plugin/plugin.json` bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: reviewer-held]` | Rules § Planning. |
| D12 | One spec, not a genesis/mocks pair: nine source rows, and the mocks rows (D8) exist only to stop the genesis brief being asked for twice. `[no-ac: decomposition ruling]` | core § Decomposition caps at ~12 source rows; splitting would put the one cross-stage promise (brief read once) in two specs. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/genesis.md | MODIFY | doctrine | § Discovery Interview: D1 rounds-of-four rule, key-in-parentheses format, D2 archetype pick, D3 auto/ask rule and the batched-ask rule; § Tournament of Scaffolds: D4 race-or-skip default; § Decision Record: D5 conventions auto-pick and the narrowed hard-fork rule; § Design Stage: D6 direction round; § Roadmap Decomposition: D7 veto window. No heading renamed; banned words (`panel`, `skin`) avoided |
| spec/scripts/genesis-driver.js | MODIFY | scripts | DISCOVERY prints the 15-key `round N of 4` list and the D2 `📌` instruction; `discovery-done` refusal names the `📌 Auto-picked archetype` rule; MENUS classifies auto/ask and prints `📌` + `write:` lines and `ask (N):`; FINALISTS prints the D4 default; DECIDE prints the D5 lines; DESIGN_BRIEF prints the `## Direction round` block and `DESIGN_BRIEF_REQUIRED_HEADINGS` gains `## Direction` after `## Users and context`; ROADMAP prints the D7 lines |
| spec/commands/genesis.md | MODIFY | doctrine | one Rules line: every derived pick prints `📌 Auto-picked … (veto anytime)`; remaining questions batch ≤4 per `AskUserQuestion`, recommended first (file stays ≤84 lines) |
| spec/templates/design-brief.md | MODIFY | doctrine | `## Direction` section after `## Users and context` with the five lines of Contracts (D6) |
| spec/skills/design-brief/SKILL.md | MODIFY | doctrine | step 0: read the direction answers handed in the dispatch and write `## Direction` first (D6) |
| spec/doctrine/mocks.md | MODIFY | doctrine | § Seed: SEED reads the genesis brief when present; § Provenance Ledger: the one batched confirmation round; § State Machine terminal mode: all pending journeys in one block (D8) |
| spec/commands/mocks.md | MODIFY | doctrine | SEED paragraph and argument-hint: idea from the genesis brief when present; SCREENS terminal sentence: approve all or name changes (D8) |
| spec/scripts/mocks-driver.js | MODIFY | scripts | SEED step `idea …` line; `confirm these N assumptions` block before every step print; terminal SCREENS block lists every pending journey (D8) |
| spec/scripts/question-style-gate.js | MODIFY | scripts | narrowed product-stage exemption (D9); header comment's exemption paragraph rewritten |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump (D11) |
| tests/genesis/discovery-rounds.test.js | CREATE | tests | AC-20261029-06-1, AC-20261029-06-2, AC-20261029-06-6 |
| tests/genesis/menus-autopick.test.js | CREATE | tests | AC-20261029-06-3, AC-20261029-06-4, AC-20261029-06-5 |
| tests/genesis/design-direction-round.test.js | CREATE | tests | AC-20261029-06-7, AC-20261029-06-8 |
| tests/mocks/seed-reads-brief.test.js | CREATE | tests | AC-20261029-06-9, AC-20261029-06-10 |
| tests/question-style-gate.test.js | MODIFY | tests | AC-20261029-06-11 (rewrites the AC-20260902-06-6 blanket-exemption test) |

## Contracts

MENUS classification per open dimension with a recorded menu and no `## Picks` line (driver, from
`.claude/genesis/interview-research/<dim>.json`; `rank` is an integer, `is_minority` an optional
boolean, `priced` a string — wf-research.js `optionSetSchema`):

```
leaders = options.filter(o => o.rank === 1)
auto  ⇐ leaders.length === 1 ∧ leaders[0].is_minority !== true ∧ /^n\/a\b/i.test(leaders[0].priced)
ask   ⇐ otherwise   (reasons, verbatim: `rank tie` | `minority leader` | `priced: <priced>` | `no rank`)
```

Printed lines (`auto`):

```
📌 Auto-picked <dim>: <label> — <why_recommended> (veto anytime)
  write: - <dim>: <label>
```

Printed line (`ask`): `ask (N): <dim> (<reason>), <dim> (<reason>)` — one line, N = count; `ask (0): none` when empty.

DISCOVERY round list (15 keys, fixed order, four per round, `round N of 4` headings):

```
round 1 of 4: payer, tenancy, data-sensitivity, residency
round 2 of 4: ai-use, unattended, integrations, scale-outage
round 3 of 4: vendor-budget, offline-mobile, jobs, notifications
round 4 of 4: retention, admin, success-metric
```

Each key line: `- <key>: <current value or dark> · guess: <session fills from the idea>`; the
driver reads `## Coverage`, `## Non-UI Coverage` and `## Picks` (`success-metric`) for the current
value and prints `dark` when the key is absent.

FINALISTS default line: `default: race (Recommended) — <dim> was asked` | `default: skip (Recommended) — every tournament dimension was auto-picked`.

DECIDE lines:

```
conventions auto-pick (8): error-taxonomy, logging, naming-identifiers, wire-representations, cross-plane-constants, env-config, ci, background-async — derive each from the stack and print 📌 Auto-picked <key> — <reason> (veto anytime)
success-metric: <label> (from ## Picks)   |   success-metric: not in ## Picks — ask it, in the user's words
```

`docs/design/brief.md` gains, after `## Users and context` and before `## Journeys`
(`DESIGN_BRIEF_REQUIRED_HEADINGS` = `## Users and context`, `## Direction`, `## Journeys`, `## Navigation`, `## Catalog`, `## Composites`, `## Contract`, in order):

```
## Direction
- navigation shell: <sidebar|top-nav|tabs> — <reason>
- layout system: <breakpoints/grid summary>
- color schemes: <light|dark|system>
- accessibility baseline: <WCAG level>
- token tiers: <n>
```

DESIGN_BRIEF `## Direction round` block (printed before the `Dispatch:` line):

```
## Direction round — ask once, recommended first, then hand the answers to the dispatch
- navigation shell: sidebar (Recommended) | top-nav | tabs          (mobile-app: tabs (Recommended) | …)
- layout system: responsive grid, 3 breakpoints (Recommended) | …   (mobile-app: single column, safe-area insets (Recommended) | …)
- color schemes: system (Recommended) | light | dark
- accessibility baseline: WCAG 2.2 AA (Recommended) | WCAG 2.2 AAA
- token tiers: 2 (Recommended) | 3
```

ROADMAP lines: `proceeding unless vetoed: brief order and dependencies (reorder later with spec-queue move)` and `ask once: milestone gates — one AskUserQuestion`.

Mocks SEED line: `idea (from genesis brief): <first paragraph>` | `idea: ask the user for the product idea (no .claude/genesis/brief.md)`.

Mocks confirmation block (before any step print, only when ≥1 `product` row would block the gate per `gateVerdict`):

```
confirm these N assumptions — one AskUserQuestion: "all correct" / "correct these: …"
  <id> <tag> <status> — <claim>
  …
  on confirm: node <driver> --root <root> ledger set --id <id> --status confirmed --tag said-by-user   (one line per row)
```

Mocks terminal SCREENS block: `## Step: confirm N journeys in the terminal` · `Read only: design/mocks/seed.md` · doctrine line · for each pending journey `### <name>`, persona line, numbered beats · `approve all, or name the ones to change` · one `node <driver> --root <root> --mark journey-approved --journey <j>` line per journey.

question-style-gate.js exemption (replaces the blanket `inProductStage` suppression):

```
suppressDerive(questions, root) ⇐ inProductStage(root) ∧ questions.some(q => PRODUCT_FACT_RE.test(String(q.question || '')))
PRODUCT_FACT_RE = /\b(payer|tenancy|data-sensitivity|residency|ai-use|unattended|integrations|scale-outage|vendor-budget|offline-mobile|jobs|notifications|retention|admin|success-metric|assumptions?)\b/i
```

## Acceptance Criteria

- **AC-20261029-06-1**: WHEN the DISCOVERY step prints for a brief whose `## Coverage` keys are all `dark`, `## Non-UI Coverage` is the template's six dark lines and `## Picks` is empty THE SYSTEM SHALL print four headings `round 1 of 4` … `round 4 of 4` grouping exactly these 15 keys in Contracts order (round 4 = `retention, admin, success-metric`), each as `- <key>: dark · guess:`, and SHALL NOT list `pricing` (e.g. the line `- payer: dark · guess:` appears under `round 1 of 4`) → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-2**: WHEN `--mark discovery-done` runs on a brief with every coverage key `covered` and no `- archetype:` line under `## Picks` THE SYSTEM SHALL exit 2 with stderr containing both `## Picks is missing a` and `📌 Auto-picked archetype`; and the DISCOVERY step print for that brief SHALL contain `📌 Auto-picked archetype <key>` and SHALL NOT contain `missing ## Picks line:`; with `- archetype: data-ml` present the mark SHALL exit 0 (e.g. stderr `… — derive it from the idea and print 📌 Auto-picked archetype <key> — <reason> (veto anytime) …`) → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-3**: WHEN the MENUS step prints with `framework` and `llm-provider` open, both recorded via `menu-written`, neither picked, where `framework.json` has one rank-1 option `{label: "Next.js", rank: 1, priced: "n/a — no number in the brief", why_recommended: "fits the brief"}` plus a rank-2 option and `llm-provider.json` has one rank-1 option with `priced: "$20/month at 1k users"` THE SYSTEM SHALL print `📌 Auto-picked framework: Next.js — fits the brief (veto anytime)` followed by `  write: - framework: Next.js`, and `ask (1): llm-provider (priced: $20/month at 1k users)` → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-4**: WHEN a recorded, unpicked dimension's menu has two rank-1 options THE SYSTEM SHALL list it as `<dim> (rank tie)` under `ask (…)` and print no `📌 Auto-picked <dim>` line; and a rank-1 option with `is_minority: true` SHALL list as `<dim> (minority leader)`; and a menu whose rank-1 option lacks `rank` SHALL list as `<dim> (no rank)` (e.g. `ask (3): hosting (rank tie), auth (minority leader), persistence (no rank)`) → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-5**: WHEN the FINALISTS step prints for a `web-app` run whose `framework.json` classifies `ask` (two rank-1 options) THE SYSTEM SHALL print `default: race (Recommended) — framework was asked` after the `cost: roughly one mini-build per finalist` line; when every tournament dimension's menu classifies `auto` it SHALL print `default: skip (Recommended) — every tournament dimension was auto-picked` → writes tests/genesis/menus-autopick.test.js
- **AC-20261029-06-6**: WHEN the DECIDE step prints THE SYSTEM SHALL print one line beginning `conventions auto-pick (8): error-taxonomy, logging, naming-identifiers, wire-representations, cross-plane-constants, env-config, ci, background-async` that does not contain `success-metric`, and one line `success-metric: not in ## Picks — ask it, in the user's words` when `## Picks` has no `- success-metric:` line, or `success-metric: weekly active teams (from ## Picks)` when it reads `- success-metric: weekly active teams` → writes tests/genesis/discovery-rounds.test.js
- **AC-20261029-06-7**: WHEN the DESIGN_BRIEF step prints for a `web-app` archetype THE SYSTEM SHALL print a `## Direction round` block containing `- navigation shell: sidebar (Recommended)`, `- layout system: responsive grid, 3 breakpoints (Recommended)`, `- color schemes: system (Recommended)`, `- accessibility baseline: WCAG 2.2 AA (Recommended)` and `- token tiers: 2 (Recommended)` before the `Dispatch: Agent {model: "fable", effort: "high"}` line (for `mobile-app`: `- navigation shell: tabs (Recommended)`); and `--mark design-brief-written` SHALL exit 2 naming `## Direction` when `docs/design/brief.md` has every other required heading but no `## Direction` between `## Users and context` and `## Journeys` → writes tests/genesis/design-direction-round.test.js
- **AC-20261029-06-8**: WHEN the ROADMAP step prints THE SYSTEM SHALL print the line `proceeding unless vetoed: brief order and dependencies (reorder later with spec-queue move)` and the line `ask once: milestone gates — one AskUserQuestion`, and the string `AskUserQuestion` SHALL occur exactly once in the step text → writes tests/genesis/design-direction-round.test.js
- **AC-20261029-06-9**: WHEN the mocks SEED step prints on a cold root where `.claude/genesis/brief.md` holds `## What I think you're building` whose first paragraph is `A shared inbox for vet clinics.` THE SYSTEM SHALL print `idea (from genesis brief): A shared inbox for vet clinics.` and SHALL NOT print `ask the user for the product idea`; on a cold root without that file it SHALL print `idea: ask the user for the product idea (no .claude/genesis/brief.md)` → writes tests/mocks/seed-reads-brief.test.js
- **AC-20261029-06-10**: WHEN the ledger holds three `product` rows `A1 inferred open`, `A2 inferred open`, `A3 invented open` and the driver prints a step THE SYSTEM SHALL print `confirm these 3 assumptions` followed by one `A1 inferred open — <claim>` style line per row, exactly one `AskUserQuestion` mention, and three `ledger set --id A<n> --status confirmed --tag said-by-user` lines before the `## Step:` heading; and the terminal SCREENS step with the two-journey fixture seed and no approvals SHALL print `## Step: confirm 2 journeys in the terminal`, both `### owner-onboarding` and `### team-invite`, the line `approve all, or name the ones to change`, and two `--mark journey-approved --journey` lines → writes tests/mocks/seed-reads-brief.test.js
- **AC-20261029-06-11**: WHEN the tier-2 judge returns `derive` while a genesis run is live (`.claude/genesis/status.json` with `handoff: null`) for the question `Which package manager should the repo use?` THE SYSTEM SHALL exit 0 and emit the derive advisory (`answerable without the user`) in `additionalContext`; for `Who pays for the product (payer) — the end user or their employer?` and for `These 3 assumptions about the product — all correct?` it SHALL exit 0 with empty stdout; outside any live run the first question SHALL still emit the advisory → rewrites tests/question-style-gate.test.js :: AC-20260902-06-6: a derive verdict is silenced

## Behavior

- **Who prints what.** The driver prints instructions and derived lines; it never asks and never
  writes `brief.md`. The session asks each `AskUserQuestion` and writes the brief. Every `📌` line
  the driver prints is an instruction to the session to print the same line to the owner.
- **DISCOVERY flow.** The step prints the 15-key round list. The session derives a guess per
  `dark` key from the idea, asks round 1 (four questions, each option set `confirm: <guess>
  (Recommended)` / `correct it` / `not applicable`), writes the four answers (`## Coverage` or
  `## Non-UI Coverage` lines; `success-metric` under `## Picks`), re-runs the driver, and continues
  until no key is `dark`. `integrations` and `pricing` under `## Non-UI Coverage` are copied from
  `integrations` and `payer`. The archetype follows D2. `--mark discovery-done`'s checks are
  unchanged except the archetype refusal's wording.
- **MENUS flow.** For every open dimension the session still runs `wf-research` and
  `--mark menu-written`; the driver then prints the D3 classification. `auto` picks are written
  under `## Picks` verbatim and the `📌` line is printed to the owner; `ask` dimensions are asked
  in rounds of four built from the menus (recommended first, existing description grammar). An
  owner veto of a `📌` pick is a `## Picks` edit before `menus-done`.
- **Hard forks at DECIDE.** Only a dimension still without a `## Picks` line after MENUS is a hard
  fork there; the rule "two options within one rank" is retired.
- **Direction round.** The session asks the `## Direction round` as one `AskUserQuestion` (four
  items; `token tiers` joins the question only when the kit catalogue offers more than one tier
  model, else the `2 (Recommended)` line is printed as a `📌` pick), then dispatches the Fable
  step with the answers appended to the hand-off; the Fable step writes `## Direction` from them.
- **Mocks confirmation block.** Printed before any step whenever `gateVerdict` would block; the
  mark-time refusal stays as the backstop. Rows confirmed via the printed `ledger set` lines
  disappear from the block on the next run.
- **Mocks terminal journeys.** On "approve all" the session runs every printed mark line in order;
  on a named change it edits the seed (which reopens that journey by hash) and re-runs the driver.

## Assumptions (escalation triggers)

- A1: Every MENUS research file carries integer `rank` and string `priced` per option (required by wf-research.js `optionSetSchema`); `is_minority` is optional. — **if false:** the Contracts rule already classifies a missing/non-integer `rank` as `ask (no rank)`; a missing `priced` is treated as not beginning `n/a`, i.e. `ask (priced: <undefined>)` — never `auto`.
- A2: No test pins the prose inside genesis.md's DISCOVERY, MENUS, FINALISTS, DECIDE, DESIGN_BRIEF or ROADMAP paragraphs; pins cover headings, key names and banned words (`panel`, `skin`, `shell adopt`, `data-shell`). Verified by reading tests/consistency/genesis-doctrine.test.js this session. — **if false:** retag the pin in the same batch; never weaken.
- A3: No existing test builds a `docs/design/brief.md` with `## Users and context` (grep over tests/ returned nothing), so adding `## Direction` to the required headings breaks no pre-image test. — **if false:** add `## Direction` to that fixture in the same batch.
- A4: `tests/genesis/tournament.test.js` pins only the `cost: roughly one mini-build per finalist` line of FINALISTS (line-anchored); D4 appends after it. — **if false:** blocked — the pin would have to move, which is a doctrine change.
- A5: Micro-spike (executed 2026-10-31, Node v26.8.1, scratch file deleted): the Contracts regex returns `false` for `Which package manager should the repo use?`, `false` for `Who pays for the product — the end user or their employer?` (no key word — hence D1's key-in-parentheses format and AC-11's `(payer)` text), `false` for the existing fixture `Should system notices only come from a fixed list, or accept any text?`, `true` for `These 3 assumptions about the product — all correct?`, `true` for `Is the data-sensitivity of patient records high?`; `'n/a — no number in the brief'.startsWith('n/a')` is `true` and `'$20/month at 1k users'.startsWith('n/a')` is `false`. — **if false:** blocked; the predicate is the deliverable.
- A6: The existing AC-20260902-06-6 test expects the blanket suppression for a question with no product-fact word; under D9 that expectation flips, so the test is rewritten (not weakened — it asserts the narrower rule). Baseline: `tests/question-style-gate.test.js` 14/14 green before this spec. — **if false:** blocked.
- A7: `spec/commands/genesis.md` is at 83 lines against a pinned cap of 84; D3/D1's command-file rule fits in one line. — **if false:** fold the rule into an existing Rules line rather than adding one.

## Rationale

The audit counted the greenfield interview at 25 to 45 owner turns and classified roughly half as
derivable from research already on disk. The plugin's own doctrine already says "derive before
asking" and already has the `📌` line; genesis never applied it, partly because the question-style
gate's exemption told the session every genesis question was a user decision. The diet keeps every
product fact, every priced vendor and every look stop as questions, and turns stack mechanics into
printed picks the owner can veto.

Grounding changed the draft in five places. The archetype refusal at `discovery-done` already
exists, so D2 is a wording change plus the printed pick. `priced` is a string on every option,
never a flag, so the money rule reads "price not n/a". The template pins exactly ten coverage and
six non-UI keys, so `success-metric` lives under `## Picks`, not as an eleventh key. The driver
never prints `AskUserQuestion` wording — doctrine does — so every "one question" promise is a
doctrine edit plus a driver-printed default, and ACs assert the driver's lines. The mocks driver
already printed one journey per run and never showed ledger rows; the "three marks" in the audit
are three mark names sharing one gate.

JJ chose to keep every paid service a question (over auto-picking within the stated vendor budget)
and confirmed the design-direction defaults. Rejected: `--journey all` for the mocks mark — listing
one mark line per journey keeps the marks untouched. Rejected: a key-list header on each question
to drive the gate exemption — headers cap at 12 characters and five keys are longer.

Collision waive: `docs/adr/0013-client-rehearses-the-journey.md` line 89 ("One journey at a time,
cut by flow complexity") is a drawing-scope rule for service mode, not the terminal confirmation
sentence D8 replaces; it stays as written. `within one rank` and `Confirm the sequence` are rewritten
in `spec/doctrine/genesis.md` (planned row); `One journey at a time` in `spec/commands/mocks.md` is
rewritten under its planned row.

## Canonical Delta

docs/canonical/genesis.md § Driver gains: "Since specs/20261029/06 DISCOVERY prints fifteen keys
(ten coverage, four non-UI, `success-metric`) in `round N of 4` groups for pre-filled confirmation;
the archetype is a printed `📌 Auto-picked archetype` pick before `discovery-done`; MENUS classifies
each recorded, unpicked dimension `auto` (one rank-1 leader, not minority, `priced` begins `n/a`)
or `ask`, printing `📌 Auto-picked <dim>: …` for `auto`; FINALISTS prints a race/skip default from
whether `framework` or `language-runtime` was asked; DECIDE prints the eight derivable conventions
rows and reads `success-metric` from `## Picks`; DESIGN_BRIEF prints a `## Direction round` and
`design-brief-written` requires `## Direction` after `## Users and context`; ROADMAP proceeds unless
vetoed and asks only milestone gates. Paid services are always asked (JJ, 2026-10-31)."
docs/canonical/design.md § The walkthrough client gains: "SEED prints the idea from
`.claude/genesis/brief.md` when present; every mocks step print is preceded by one
`confirm these N assumptions` block for blocking `product` rows; terminal SCREENS lists every
pending journey in one block (specs/20261029/06)."
docs/canonical/gate-integrity.md gains: "question-style-gate.js suppresses a `derive` verdict
inside a live genesis/mocks run only for a question naming a coverage key or `assumption(s)`
(specs/20261029/06 D9)."
