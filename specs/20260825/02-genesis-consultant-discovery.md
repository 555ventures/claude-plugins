---
date: 2026-08-25
status: done
tier: standard
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/01-genesis-panel-collapse.md]
depended_on_by: [specs/20260825/03-genesis-currency-executed.md]
brief: 10
diff_base: c2fc1be71c1954c1cb6bb4e5d7717e683c4cac7c
open_markers: 0
---

# Consultant discovery: the brief is the interface

## Goal

Replace the scripted, lens-batched genesis interview with an adaptive consultant-style
discovery: start open, reflect back, follow the answer, depth earned by signal, no probe cap.
What is fixed is a silent **coverage audit** over ten business/legal/product areas the model
cannot see (who pays, tenancy, data sensitivity, residency, AI use, unattended work,
integrations, scale and outage cost, vendor/budget limits, offline/mobile realities); dark
areas are asked in the user's own words before any stack menu. Claude's understanding stays
visible as a growing one-page brief re-rendered after every answer, with one throwaway core-
screen sketch as soon as there is enough to draw; the separate read-back gate goes. The
hard-to-reverse dimension set is derived from the coverage answers (the 2026 irreversibles —
tenancy, residency, AI layer, background jobs, observability, API versioning — added on top of
the registry floor), and every research menu option carries the answers that drove its rank
and a consequence priced against the user's own numbers. Done means: the doctrine and both
genesis commands run the interview this way, the brief template exists, and `wf-research`'s
option schema requires `because` and `priced`.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `genesis.md` § Genesis: Discovery Interview is rewritten: the interview is **adaptive** — open with a reflect-back of `$ARGUMENTS`, then follow the answer; depth is earned by signal (hesitation, vagueness, high stakes); the sentences "Probe thin / Other answers once", "One probe round, never a recursion", "Reflect back, twice", the lens list (Product/User/Scope/Architect), and the read-back gate are deleted — no scripted batch list survives (AC-20260825-02-1) | Brief 10 unit B; a fixed question list is the form the doctrine already said it was not |
| D2 | The **coverage audit** is the one fixed structure: ten keys — `payer`, `tenancy`, `data-sensitivity`, `residency`, `ai-use`, `unattended`, `integrations`, `scale-outage`, `vendor-budget`, `offline-mobile` — each recorded in `brief.md`'s `## Coverage` block as `- <key>: covered \| dark \| n/a — <one line in the user's words>`; the session audits silently after every answer and asks a dark key next, phrased as a plain-language question that passes core § Question Style's ten-second cold test; discovery ends when no key is `dark` (a user who declines is recorded `n/a — declined: <reason>`) (AC-20260825-02-1, AC-20260825-02-2) | Business constraints are invisible to the model (memory feedback-genesis-options-not-autopick); the audit is what makes an adaptive interview complete without being scripted |
| D3 | **The brief is the interface.** `.claude/genesis/brief.md` is authored from the new template `spec/templates/genesis-brief.md` with exactly these `## ` sections in order: `What I think you're building` (one page: the job, who it is for, the core screen, success in six months, what it must never do), `Coverage`, `Non-goals`, `Open Dimensions`, `Research Angles`, `Picks`; after **every** `AskUserQuestion` round the session rewrites the file and prints its `What I think you're building` + `Coverage` sections to the console verbatim; corrections are edits to the page; the finished page IS the discovery brief — no separate sign-off question (AC-20260825-02-2, AC-20260825-02-3) | Questions are the marked gaps in a page the user can read cold; console re-print is bare-token safe (brief open question — default taken) |
| D4 | **Throwaway sketch.** Once `What I think you're building` names a core screen, the session authors ONE `.claude/genesis/sketch.html` (plain HTML, inline CSS permitted, root `data-screen-label`, `data-status="sketch"`, the `frontend-design` instructional layer when installed), tells the user to open it, and folds "is this roughly it?" into the next round; a correction edits the page first, then the sketch; no `design-atlas.js check` (throwaway tier); deleted by `/spec:genesis-design`'s prune step [no-ac: session-authored artifact; the prune deletion is observed by AC-20260825-02-3's roster line] | ADR-0001: render-critique on a bare token; the sketch is the cheapest "did I understand you" check that exists |
| D5 | **Dimensions are derived.** `genesis.md` gains a derivation table under § Genesis: Hard-to-Reverse Dimensions mapping coverage answers → added dimension keys: `tenancy` = organisations → `tenancy-model`; `residency` ≠ global or `data-sensitivity` regulated → `data-residency`; `ai-use` = yes → `llm-provider`, `vector-store`, `eval-harness`; `ai-use` = yes ∧ customer data → `data-in-training`; `unattended` = yes → `background-jobs`; `scale-outage` any → `observability`; `integrations` naming a versioned external API → `api-versioning`; the registry floor (spec 01 D4) always applies; a dimension a coverage answer closes ("must use <vendor>") is written `constrained` in `## Open Dimensions` and never asked (AC-20260825-02-1) | The 2026 irreversibles are added, never substituted (brief unit B; memory research-20260824-genesis-best-practice) |
| D6 | `wf-research.js` `OPTION_SET_SCHEMA` becomes a named top-level function `optionSetSchema()` returning the schema (evalFns-extractable, per the workflow test-mode precedent); each option gains two REQUIRED string fields: `because` (the coverage keys and answers that drove this option's rank, e.g. "because residency=EU-only and tenancy=organisations") and `priced` (a concrete consequence at the brief's stated scale — a monthly figure with its jump point, a migration cost, or the literal `n/a — no number in the brief`); the research prompt instructs the agent to read `## Coverage` and to price against `scale-outage`/`vendor-budget` (AC-20260825-02-4, AC-20260825-02-5) | Generic tradeoff prose is a defect once numbers exist (brief unit B); a required schema field is enforced by the harness, not by prose |
| D7 | The menu `AskUserQuestion` (architect Phase 1 step 3) builds each option's description as `tradeoff` · `because` · `priced` · "current as of <fetchedAt>"; rank 1 first, "(Recommended)" with `why_recommended`; "Other / not sure" hatch stays; no dimension is auto-picked (AC-20260825-02-5) | memory feedback-genesis-options-not-autopick |
| D8 | `genesis-architect.md` Phase 1 is rewritten to D1–D5 and D7 (reflect-back → adaptive loop with page re-print → coverage audit → derived dimensions → menus); `genesis-design.md` Phase 1 adopts the same posture (reflect the design intent, follow the answer, page re-print, no probe cap) for its narrower design discovery (AC-20260825-02-1) | One interview posture, two commands |
| D9 | Regression pins: `spec-paths shared-for genesis-architect` continues to serve `## Question Style`; `wf-research.js` continues to pass `checkWorkflowSyntax` and `capOptions` continues to cut a 6-option menu to 4 preserving `is_minority` (AC-20260825-02-6) | The schema change must not break the workflow body or its cap |
| D10 | New-surface checklist: `plugin.json` bump to next free 7.37.x with a changelog paragraph naming the coverage audit and the brief-as-interface rule [no-ac: plugin-version guard] | — |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/genesis.md | MODIFY | doctrine | D1/D2/D3 Discovery Interview rewrite; D5 derivation table; roster line for `brief.md` template + `sketch.html` |
| spec/commands/genesis-architect.md | MODIFY | doctrine | D8 Phase 1 rewrite (D4 sketch step, D7 menu build) |
| spec/commands/genesis-design.md | MODIFY | doctrine | D8 Phase 1 posture; prune step deletes `sketch.html` |
| spec/templates/genesis-brief.md | CREATE | doctrine | D3 template: six sections, `## Coverage` pre-filled with the ten keys as `dark` |
| spec/workflows/wf-research.js | MODIFY | scripts | D6 `optionSetSchema()` + `because`/`priced` + prompt |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 version + changelog |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260825-02-1, AC-20260825-02-2, AC-20260825-02-3 |
| tests/genesis/research-menu.test.js | CREATE | tests | AC-20260825-02-4, AC-20260825-02-5, AC-20260825-02-6 |

## Contracts

`spec/templates/genesis-brief.md` skeleton (headings verbatim):

```markdown
# Discovery brief — { project }

## What I think you're building
{ one page, in the user's words where given: the job · who it is for · the core screen ·
  success in six months (an outcome, not a feature) · what it must never do }

## Coverage
- payer: dark
- tenancy: dark
- data-sensitivity: dark
- residency: dark
- ai-use: dark
- unattended: dark
- integrations: dark
- scale-outage: dark
- vendor-budget: dark
- offline-mobile: dark

## Non-goals
## Open Dimensions
## Research Angles
## Picks
```

Coverage line grammar (D2): `^- (payer|tenancy|data-sensitivity|residency|ai-use|unattended|integrations|scale-outage|vendor-budget|offline-mobile): (covered|dark|n\/a)( — .+)?$`.

`wf-research.js` option shape after D6 (additive; existing fields unchanged):

```js
function optionSetSchema() {
  return {
    type: 'object', additionalProperties: false,
    required: ['dimension', 'options', 'version_bearing', 'why_recommended'],
    properties: {
      // …existing…
      options: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['label', 'tradeoff', 'recency', 'rank', 'because', 'priced'],
        properties: {
          // …existing label/tradeoff/recency/sources/rank/is_minority…
          because: { type: 'string', description: 'the coverage keys and answers that drove this rank, e.g. "because residency=EU-only and tenancy=organisations"' },
          priced: { type: 'string', description: 'one concrete consequence at the brief\'s stated scale — a monthly figure and where it jumps, a migration cost, or the literal "n/a — no number in the brief"' },
        } } },
    },
  }
}
const OPTION_SET_SCHEMA = optionSetSchema()
```

## Behavior

- Interview loop (architect Phase 1): reflect back → `AskUserQuestion` → rewrite `brief.md`
  → print `What I think you're building` + `Coverage` → audit → next question is the highest-
  stakes dark key, or a follow-up the last answer earned → … → no dark keys → derive
  `## Open Dimensions` (registry floor + D5 table) → menus (research-woven loop, unchanged
  mechanics, D7 descriptions).
- A research call that returns nothing in good time still falls back to a model-knowledge menu
  stamped `unverified`; `because`/`priced` are then the session's own lines, marked
  `(unverified)`.
- `genesis-design.md` prune step: `sketch.html` is deleted together with the non-winning
  candidate dirs.

## Acceptance Criteria

- **AC-20260825-02-1**: WHEN `spec/doctrine/genesis.md`, `spec/commands/genesis-architect.md`,
  and `spec/commands/genesis-design.md` are read THE SYSTEM SHALL contain none of the literals
  `Probe once`, `One probe round`, `never a recursion`, `read-back gate`, `Reflect back, twice`,
  `[Product lens]`, `[User lens]`, `[Scope lens]`, `[Architect lens]`, and `genesis.md` SHALL
  contain every one of the ten coverage keys and the six derived keys `tenancy-model`,
  `data-residency`, `llm-provider`, `background-jobs`, `observability`, `api-versioning` (e.g.
  a doctrine still containing `One probe round, never a recursion` → red) →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-02-2**: WHEN `$(spec-paths templates)/genesis-brief.md` is read THE SYSTEM
  SHALL exist and contain exactly the six `## ` headings of D3 in that order, and its
  `## Coverage` block SHALL contain exactly ten lines matching the coverage grammar, all `dark`
  (e.g. `- payer: dark` ×10 → green; nine lines → red) →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-02-3**: WHEN `genesis.md` § Genesis: On-disk Handoff is read THE SYSTEM SHALL
  name `genesis-brief.md` as `brief.md`'s template and `.claude/genesis/sketch.html` as a
  throwaway artifact deleted at `/spec:genesis-design`'s prune (e.g. the roster missing
  `sketch.html` → red) → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-02-4**: WHEN `optionSetSchema` is extracted from `spec/workflows/wf-research.js`
  via `evalFns` and called THE SYSTEM SHALL return a schema whose `properties.options.items.required`
  includes `because` and `priced` and whose `properties.options.items.properties` defines both as
  `type: 'string'` (e.g. `required` = `['label','tradeoff','recency','rank','because','priced']`
  → green; missing `priced` → red) → `tests/genesis/research-menu.test.js`
- **AC-20260825-02-5**: WHEN `spec/workflows/wf-research.js`'s research prompt is read THE
  SYSTEM SHALL instruct the agent to read the brief's `## Coverage` section and to fill
  `because` and `priced` (the prompt string contains `## Coverage`, `because`, and `priced`),
  and `genesis-architect.md`'s menu step SHALL name `because` and `priced` as description parts
  (e.g. a prompt with no `## Coverage` mention → red) → `tests/genesis/research-menu.test.js`
- **AC-20260825-02-6**: WHEN `wf-research.js` is checked with `checkWorkflowSyntax` and
  `capOptions` is extracted and run on a 6-option menu with one `is_minority` option THE SYSTEM
  SHALL CONTINUE TO parse as a valid workflow body and to return 4 options including the
  minority one (e.g. ranks 1–6, rank 5 minority → survivors ranks 1,2,3,5) →
  `tests/genesis/research-menu.test.js`

## Assumptions (escalation triggers)

- A1: `tests/helpers.js`'s `extractFn`/`evalFns` brace-match a named top-level `function
  optionSetSchema() {…}` whose body is a single `return {…}` (precedent: `capOptions`,
  `dispatch` in the workflow family; executed 2026-08-25: `grep -n "function capOptions"
  spec/workflows/wf-research.js` → line 154, extracted by the same helper) — **if false**
  (extraction fails on the object literal): declare the schema inside the function with a
  `const` then `return`, matching `capOptions`' inner-const layout.
- A2: The workflow harness enforces `schema.required` on agent returns (the existing
  `RESEARCH`/`OPTION_SET` schemas already rely on it — spec 20260813/08 D2 added
  `why_recommended` as required the same way) — **if false**: the command treats a missing
  `because`/`priced` as `(unverified)` per Behavior; never blocks the interview.
- A3: The coverage-line grammar in Contracts is what spec 03/04's driver will parse — this
  spec's consumer is the session and the template test; no script parses it yet (recorded so
  the driver spec cannot silently change the grammar).
- A4: No `§ Genesis: Discovery Interview` citation depends on the deleted sub-headings (the
  section keeps its `## ` heading; only body paragraphs change) — **if false**:
  `citations-check` (spec 01 AC-7, still live) names it.
- A5: No dependency-adjudicated claim is locked by this spec (`spikes: 0`).

## Rationale

The interview today spends three cold lens batches on product/user/scope and jumps to stack
menus; the constraints that actually rank a hosting or tenancy option — who pays, whether
customers are organisations, where data must live, what runs unattended — surface only if the
user is asked in their own terms. JJ's 2026-08-24 ruling fixed the shape: discovery first and
adaptive like a consultant, a silent coverage audit instead of a script, the brief as the
interface, consequences priced on the user's numbers. The coverage keys are the only
structure that survives because they are exactly the areas the model cannot derive; everything
else (order, depth, follow-ups) is judgment the session holds. The read-back gate goes because
the page is re-rendered after every answer — a sign-off over a page the user has already
corrected six times is theater.

`because` and `priced` are schema fields, not prompt suggestions, so the harness refuses a
menu that omits them; a `priced` of `n/a — no number in the brief` is honest and allowed —
the defect the brief names is generic prose *when numbers exist*. The dimension derivation is
a table in doctrine rather than code because its consumer is the session's judgment; the
driver (spec 04) later reads `## Open Dimensions`, not the coverage answers, so the mapping
stays a documented derivation with an executed check on its output.

Rejected: a local web page for the growing brief (needs a server; console print is bare-token
safe — sketch page only once a sketch exists, the brief's own default); running
`design-atlas.js check` on the throwaway sketch (it requires a `tokens.css` link; the sketch
predates tokens); making the coverage audit a question list (it is an audit the session runs
silently, asked only where dark — the brief is explicit).

Collision-closure at lock (2026-08-25, `--literal "Probe once" --literal read-back --literal
"lens]"`): paths leg `likely` = 0; literals leg — every plugin-file hit
(`genesis-architect.md`, `genesis-design.md`, `genesis.md`) is a File Plan row;
`docs/adr/0001` and `docs/roadmap/10` are history, waived by location.

Build deviation (one-off, folded 2026-08-26 — first instance of its class, so no Gotchas entry
per core § Incident Policy): AC-20260825-02-2's test was authored with a defective `## Coverage`
extraction regex (`/^## Coverage\n([\s\S]*?)(?=\n## |\n?$)/m`) — under the `m` flag `$` matches
before every line terminator, so the lazy capture always stopped after the section's first line
and the ten-line count assertion was unsatisfiable for any file content. Found at build when the
doctrine worker returned `blocked` against a template authored verbatim to Contracts; reproduced
by the orchestrator (`node -e` against the real template returned only `"- payer: dark"`), then
repaired in the tests wave — the lookahead alternative became `(?![\s\S])` (true end-of-string,
unaffected by `m`), with an inline comment recording why the naive form was wrong. Assertion
strength unchanged: still exactly ten lines, still the full Contracts grammar, still `dark` on
every line, verified discriminating against 9-line, 11-line, and section-bleed mutants of the
template string.

Review disposition (2026-08-26, runId `rv_6229b7af0d0b`): the reviewer's one soft survivor — D9
names three regression pins but AC-20260825-02-6 and its test encoded only two, leaving
`spec-paths shared-for genesis-architect` serving `## Question Style` unpinned — was dispositioned
**fix** by the user. A sibling test citing the same AC-ID now executes the script and asserts the
section, proven red against a bogus section name and green against the real one.

No `SHALL CONTINUE TO` neighbor beyond AC-6 needs pinning: the woven-loop mechanics
(`wf-research` args, `interview-research/*.json`, `fetchedAt` stamping) are untouched and
remain covered by the existing `spec-paths`/workflow syntax tests.

## Canonical Delta

Append to `docs/canonical/genesis.md` a section *Discovery (consultant posture)*: *Since
specs/20260825/02 the genesis interview is adaptive, not scripted. The one fixed structure is
the coverage audit — ten keys (`payer`, `tenancy`, `data-sensitivity`, `residency`, `ai-use`,
`unattended`, `integrations`, `scale-outage`, `vendor-budget`, `offline-mobile`) recorded in
`brief.md`'s `## Coverage` as covered/dark/n-a lines; dark keys are asked before any menu. The
brief (`spec/templates/genesis-brief.md`) is re-rendered to the console after every answer and
is the discovery record; a throwaway `sketch.html` checks understanding early and is pruned at
design lock. Hard-to-reverse dimensions = registry floor + keys derived from coverage answers.
Every `wf-research` option carries `because` (the answers behind its rank) and `priced` (a
consequence at the stated scale).*
