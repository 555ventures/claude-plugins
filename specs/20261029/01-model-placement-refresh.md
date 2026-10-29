---
date: 2026-10-29
status: hardened
open_markers: 0
tier: critical           # touches spec/scripts/question-style-gate.js (hook surface, rules § Risk Tiers)
area: doctrine
breaking: false
depends_on: []
brief: n/a
---

# Model placement refresh: seats pin a tier and an effort, independence is a fresh context

## Goal

Every model seat in the plugin names a tier alias and an effort level, in one per-seat table in
core doctrine and in the agent frontmatter and dispatch lines that act on it. The reviewer and
disposer seats stop depending on which model the invoking session happens to run; review
independence is stated as fresh-context, blind-to-author dispatch with executed evidence, and
the "different model family" sentence is retired. The one hard-pinned model id in the plugin
(the question judge's dated Haiku snapshot) becomes an alias, and the genesis design steps
dispatch a Fable subagent instead of stopping the human to switch models by hand. Done means:
no file under `spec/` names a versioned model id, the three pinned tests read the new table,
and a Fable session running `/spec:run` or `/spec:fix` gets an Opus reviewer.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Reviewer seat is `model: opus`, `effort: high` in `spec/agents/reviewer.md` frontmatter (AC-20261029-01-1) | Anthropic's documented review-independence mechanism is a fresh context, not a different family; Opus 5.5 at high is the documented bug-finding seat and 2.5× cheaper per token than Fable. Rejected: Fable at low (top tier at minimum effort is upside-down spend; same model as a Fable session's author). |
| D2 | Disposer seat is `model: opus`, `effort: medium` in `spec/agents/disposer.md` — never `inherit` (AC-20261029-01-2) | `inherit` makes the seat Fable in a Fable session (cost drift, and not independent of the session). Judgment-heavy but bounded input, so medium. |
| D3 | core.md § Model Placement is rewritten around a per-seat table — planner `fable`/`high`, build and review orchestrator = the invoking session (`opus` recommended), workers `sonnet`/`medium`, reviewer `opus`/`high`, disposer `opus`/`medium`, lookups and re-reads `haiku`/`low`, research agents `sonnet`/`medium` — and states independence as fresh-context, blind-to-author dispatch plus executed evidence; the phrases "different model family" and "a different family from the Opus session that builds" are gone from `spec/` (AC-20261029-01-3, AC-20261029-01-10) | The old section gave three answers to "who builds" (Fable plans, Opus builds, Sonnet is every worker). The table is the single binding home; command prose points at it. Rejected: keeping a family rule — nothing in the plugin can compare families, and the rule was already false for a Fable session. |
| D4 | `question-style-gate.js` spawns the judge with `--model haiku` (the alias), never a dated id (AC-20261029-01-4) | The pinned `claude-haiku-4-5-20251001` snapshot retires silently: the judge then fails open and vanishes with no message. Alias resolves to the newest Haiku on the Anthropic API. Spiked: `claude -p … --model haiku` exits 0 (A2). |
| D5 | Genesis design steps (DESIGN_BRIEF, DESIGN_KIT, DESIGN_JOURNEYS) print `Dispatch: Agent {model: "fable", effort: "high"}` lines and the command text tells the session to dispatch that subagent with the step's read list and skill, from whatever model the session runs; the `/clear` + `/model fable` stop in `spec/commands/genesis.md` is deleted; the existing "unavailable `fable` falls back to `opus`" rule stands (AC-20261029-01-5, AC-20261029-01-6) | Three human stops existed only because "no script can see the active model". A subagent is the fresh context the steps wanted, and subagent frontmatter/params take `fable` (A1). Rejected: keeping "a session already on Fable works in place" — one unconditional rule is cheaper to read and test. |
| D6 | `/spec:fix` step 4 dispatches the reviewer with the agent's own seat (`opus`/`high`), unconditionally; the "`opus` when this session runs Fable, else `fable`" switch is deleted (AC-20261029-01-7) | The switch was the only place the family rule was applied and it inverted the seat by session. Code authors are Sonnet workers in every lane, so Opus is always a different model from the author even without a condition. |
| D7 | The build driver's wave step prints `Agent {model: sonnet, effort: medium}`; `run.md`, `stage-build.md` and `stage-review.md` no longer say "Orchestrator and workers: Sonnet" — the orchestrator is the invoking session and workers are the seat in D3 (AC-20261029-01-8) | Sonnet 5.5 at `low` raises check-ins and skipped verification; `medium` is Anthropic's documented worker default. The orchestrator seat was never enforceable (it is the session), so doctrine stops claiming it. |
| D8 | README's one-sentence thesis reads "a fresh-context reviewer must demonstrate its verdicts" in place of "an uncorrelated model reviews the result" (AC-20261029-01-9) | The README is the public statement of the mechanism; it must match D3. |
| D9 | The emphasis-prompting pass is a recorded no-op: `grep -rniE "be thorough\|exhaustive\|think hard\|don't be lazy\|keep going"` over `spec/commands spec/agents spec/doctrine git/commands` returns zero lines, and the remaining ALL-CAPS tokens (`ONE`, `STOP`, `MUST`) are contractual markers other tests pin. `[no-ac: nothing to change; evidence is the grep in Rationale]` | Anthropic's guidance targets emphasis that inflates effort; this plugin's prose has none. Stripping contractual markers would re-open pinned tests for no behaviour gain. |
| D10 | No file under `spec/` (excluding `spec/evals/`) may contain a versioned model id matching `claude-(fable\|opus\|sonnet\|haiku)-[0-9]`; seats use aliases only (AC-20261029-01-10) | Aliases track the newest tier automatically, which is the whole point for a plugin that must survive model churn; the ledger still records the exact id via `sessionModel()`. |
| D11 | `spec/.claude-plugin/plugin.json` is bumped through `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` with a changelog paragraph naming the per-seat table, the judge alias and the genesis dispatch. `[no-ac: the reviewer runs plugin-bump.js --check against the merge base; a test judging the tree against main is a hard finding per rules § Review Checks]` | Rules § Planning version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/core.md | MODIFY | doctrine | § Model Placement → per-seat table (D3); independence sentence; family phrases removed |
| spec/agents/reviewer.md | MODIFY | doctrine | frontmatter `model: opus`, `effort: high` (D1) |
| spec/agents/disposer.md | MODIFY | doctrine | frontmatter `model: opus`, `effort: medium` (D2) |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | drop "Orchestrator … Sonnet" claim; reviewer/disposer dispatch lines cite the seat table; fix worker `sonnet`/`medium` (D7) |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | drop "Orchestrator and workers: Sonnet" (D7) |
| spec/commands/run.md | MODIFY | doctrine | drop "Orchestrator and workers: Sonnet" (D7) |
| spec/commands/fix.md | MODIFY | doctrine | step 4 reviewer dispatch unconditional (D6) |
| spec/commands/genesis.md | MODIFY | doctrine | design steps dispatch a Fable subagent; `/model fable` stop deleted (D5) |
| spec/scripts/genesis-driver.js | MODIFY | scripts | three design-step `Session:` lines → `Dispatch: Agent {model: "fable", effort: "high"}` (D5) |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | wave step prints `Agent {model: sonnet, effort: medium}` (D7) |
| spec/scripts/question-style-gate.js | MODIFY | scripts | `JUDGE_MODEL = 'haiku'`; header comment names the alias rule (D4) |
| README.md | MODIFY | other | thesis sentence (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | other | `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` (D11) |
| tests/review/reviewer-seat.test.js | MODIFY | tests | AC-20261029-01-1, AC-20261029-01-2, AC-20261029-01-3 |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20261029-01-5, AC-20261029-01-6 |
| tests/consistency/model-placement.test.js | CREATE | tests | AC-20261029-01-7, AC-20261029-01-8, AC-20261029-01-9, AC-20261029-01-10 |
| tests/question-style-gate.test.js | MODIFY | tests | AC-20261029-01-4 |

## Contracts

core.md § Model Placement, binding shape (prose around it is free; the table rows are not):

```
| Seat | Model | Effort | Where it is set |
|---|---|---|---|
| Planner (/spec:plan, genesis design seats) | fable | high | the session; genesis design steps dispatch `Agent {model: "fable", effort: "high"}` |
| Build / review orchestrator | the invoking session (opus recommended) | — | /model |
| Implementation workers | sonnet | medium | build driver wave step, host agentMap agents |
| Reviewer | opus | high | spec/agents/reviewer.md |
| Disposer | opus | medium | spec/agents/disposer.md |
| Research / option-menu agents | sonnet | medium | wf-research.js, wf-enforce.js |
| Lookups, re-reads, queue groom, question judge | haiku | low | queue.md, question-style-gate.js |
```

Followed by the independence sentence: "Review independence comes from fresh-context,
blind-to-author dispatch and executed evidence — the reviewer never sees the conversation that
produced the diff." And the standing fallback: "an unavailable `Agent {model: "fable"}` falls
back to `opus`." Seats name aliases only (D10).

genesis-driver.js design-step line, exact text (one per step, replacing the `Session:` line):

```
Dispatch: Agent {model: "fable", effort: "high"} — fresh context; hand it this step's read list, doctrine and skill lines verbatim
```

## Behavior

- A Fable session running `/spec:run` reaches REVIEWER and dispatches `spec:reviewer`; the
  agent's frontmatter resolves to `opus`/`high` with no per-call override needed.
- A Fable, Opus or Sonnet session running `/spec:genesis` at DESIGN_BRIEF reads the step, and
  dispatches one Fable subagent with the step text; no `/clear`, no `/model`, no end-of-turn
  for a model switch. AWAITING_DESIGN_APPROVAL (the human `approve`) is unchanged.
- The question judge keeps its fail-open contract; only the `--model` argument changes.

## Acceptance Criteria

- **AC-20261029-01-1**: WHEN `spec/agents/reviewer.md` frontmatter is parsed THE SYSTEM SHALL
  yield `model` = `opus` and `effort` = `high` (e.g. the frontmatter lines `model: opus` /
  `effort: high` → `{model:'opus', effort:'high'}`) → rewrites tests/review/reviewer-seat.test.js :: reviewer seat
- **AC-20261029-01-2**: WHEN `spec/agents/disposer.md` frontmatter is parsed THE SYSTEM SHALL
  yield `model` = `opus` and `effort` = `medium` (e.g. `model: opus` / `effort: medium` →
  `{model:'opus', effort:'medium'}`; `inherit` → fail) → rewrites tests/review/reviewer-seat.test.js :: disposer seat
- **AC-20261029-01-3**: WHEN core.md's text between `## Model Placement` and `## Decisions` is
  read THE SYSTEM SHALL contain a markdown table with a row whose Seat cell starts `Reviewer`
  and whose Model and Effort cells are `opus` and `high`, a row `Disposer` / `opus` / `medium`,
  a row starting `Implementation workers` / `sonnet` / `medium`, the phrase `fresh-context`, and
  SHALL NOT contain `different model family` or `different family` (e.g. the row
  `| Reviewer | opus | high | spec/agents/reviewer.md |` → pass; the sentence `a different
  family from the Opus session` → fail) → rewrites tests/review/reviewer-seat.test.js :: core.md § Model Placement
- **AC-20261029-01-4**: WHEN the question-style gate's tier-2 judge runs against a tier-1-clean
  question with `SPEC_QUESTION_JUDGE_BIN` pointing at a fake binary that records its argv THE
  SYSTEM SHALL invoke that binary with the consecutive arguments `--model` `haiku` (e.g.
  recorded argv `[-p, <prompt>, --model, haiku]` → pass; `--model claude-haiku-4-5-20251001`
  → fail) → writes tests/question-style-gate.test.js
- **AC-20261029-01-5**: WHEN `spec/scripts/genesis-driver.js` source is split into lines THE
  SYSTEM SHALL contain exactly 3 lines matching `/'Dispatch: Agent \{model: "fable", effort:
  "high"\}/` and 0 lines matching `/Session: start a fresh session for this step/` (e.g. 3 and 0
  → pass; 3 and 3 → fail) → rewrites tests/consistency/genesis-doctrine.test.js :: every genesis design step's Session: line names Fable
- **AC-20261029-01-6**: WHEN `spec/commands/genesis.md` is read THE SYSTEM SHALL contain
  `Agent {model: "fable", effort: "high"}` and SHALL NOT contain `/model fable` (e.g. the old
  sentence `print \`/clear\`, \`/model fable\`, re-run` → fail) → writes tests/consistency/genesis-doctrine.test.js
- **AC-20261029-01-7**: WHEN `spec/commands/fix.md` is read THE SYSTEM SHALL contain, inside the
  step 4 paragraph, `Agent {subagent_type: 'spec:reviewer'}` and SHALL NOT contain `when this
  session runs Fable` or `a different family` (e.g. `with \`model: 'opus'\` when this session
  runs Fable, else` → fail) → writes tests/consistency/model-placement.test.js
- **AC-20261029-01-8**: WHEN `spec/scripts/spec-build-driver.js` source is read THE SYSTEM SHALL
  contain `Agent {model: sonnet, effort: medium}` and SHALL NOT contain `Agent {model: sonnet}`
  followed directly by ` per layer`; and WHEN `spec/commands/run.md`,
  `spec/doctrine/stages/stage-build.md` and `spec/doctrine/stages/stage-review.md` are read THE
  SYSTEM SHALL NOT contain `Orchestrator and workers: Sonnet` (e.g. the wave line `spawn one
  long-lived Agent {model: sonnet} per layer` → fail; `… Agent {model: sonnet, effort: medium}
  per layer` → pass) → writes tests/consistency/model-placement.test.js
- **AC-20261029-01-9**: WHEN `README.md` is read THE SYSTEM SHALL contain `fresh-context
  reviewer` and SHALL NOT contain `uncorrelated model` (e.g. `an uncorrelated model reviews the
  result` → fail) → writes tests/consistency/model-placement.test.js
- **AC-20261029-01-10**: WHEN every regular file under `spec/` except `spec/evals/**` is read
  THE SYSTEM SHALL contain zero matches of `/claude-(fable|opus|sonnet|haiku)-[0-9]/` (e.g.
  `claude-haiku-4-5-20251001` in question-style-gate.js → fail; `haiku` → pass) → writes tests/consistency/model-placement.test.js
## Assumptions (escalation triggers)

- A1: The Agent tool's `model` parameter and subagent frontmatter accept the alias `fable`
  (Claude Code sub-agents doc, read 2026-10-29: `model` takes `sonnet`, `opus`, `haiku`,
  `fable`, a full id, or `inherit`). — **if false:** core's standing rule applies — dispatch
  `opus`; record the fallback in Decisions, never a dated id.
- A2: `claude -p <prompt> --model haiku` is accepted. Spiked 2026-10-29 from `/tmp`:
  `timeout 90 claude -p "reply with the single word ok" --model haiku` → stdout `ok`, exit 0. —
  **if false:** keep the alias and open an incident; never reinstate a dated id.
- A3: A subagent dispatched for a design step can load the `design-brief` and
  `frontend-design` skills itself. — **if false:** the orchestrating session resolves each
  skill's SKILL.md path and prepends "Read <path> first" to the dispatch prompt; the driver's
  `Skill:` lines stay as they are.
- A4: The only tests pinning the old design-step text are
  `tests/consistency/genesis-doctrine.test.js:1194-1208` (`grep -rn "Model: Fable\|Session:
  start a fresh session\|/model fable" tests` → that one block). — **if false:** rewrite the
  extra pin in the same batch; never keep a `Session:` line to satisfy it.
- A5: No test pins the dated judge id (`grep -rn "claude-haiku-4-5" tests` → no hits) and the
  judge test harness already injects a fake binary via `SPEC_QUESTION_JUDGE_BIN`
  (tests/question-style-gate.test.js:19-31). — **if false:** extend the fake to record argv in
  the same batch.
## Rationale

The audit at `docs/audit/question-points-and-model-placement-2026-10-29.md` Part 1 is the
grounding. Three facts drove the shape. First, Anthropic's documentation on review states the
independence mechanism as a reviewer that "never saw your conversation", with Opus 5.5 named as
the model that catches more bugs with fewer false alarms; no first-party source recommends a
different model family, and nothing in this plugin can compare families anyway (`sessionModel()`
returns a raw string that no code branches on). Second, the only place the family rule was
applied, `/spec:fix` step 4, inverted the seat by session model, and `/spec:run` never applied
it, so a Fable session reviewed its own planning with Fable. Third, the question judge's dated
Haiku id is the one versioned literal under `spec/`, and its failure mode is silence.

D5 removes up to three human stops per greenfield project. The driver's design steps were
written as "fresh session" because the session could not see its own model; a subagent gives
the fresh context directly and takes `model: "fable"` as a parameter. Nothing in those steps
asks the user (approval happens later, in the main session), so losing AskUserQuestion inside
the subagent costs nothing.

D9 is deliberately a recorded no-op. The emphasis grep returned nothing and the ALL-CAPS tokens
that remain (`ONE AskUserQuestion`, `STOP`) are contractual words that other pins read.

Fragile: AC-20261029-01-10's regex also bans a dated id inside a code comment; write comments
with the alias. The genesis-doctrine pin is rewritten in place (its 2026-10-25 origin comment
should be amended to this spec), and the `exactly 3` count keeps its guard against a silently
added or dropped design step.

Collision closure (lock-time literals leg, every hit outside the File Plan): `spec/commands/init.md:20`
matches `Model: Fable` only through its case-insensitive "Intended model: Fable or Opus" header —
a tier statement, not a session line; waived, untouched. `docs/roadmap/30-genesis-design-stage.md`,
`docs/roadmap/18b-disposer-and-run.md`, `docs/audit/*` are historical records under the waived
prefixes. Every other literals hit (`core.md`, `fix.md`, `genesis.md`, `genesis-driver.js`,
`question-style-gate.js`, `run.md`, `stage-build.md`, `README.md`, `reviewer.md`, `disposer.md`,
`reviewer-seat.test.js`, `genesis-doctrine.test.js`) is a File Plan row. Paths-leg `likely` and
`mentions` hits owe no waive line.

Found while locking, queued as a follow-up (not this spec's scope): `.claude/rules/enforcement.json`
and rules § Review Checks still name `tests/consistency/plugin-bump.test.js` as the gate wiring for
the version-bump check, and that file no longer exists; the check is reviewer-held today.

Rejected adversarial finding: "keep `inherit` for the disposer so a cheaper session gets a cheaper
disposer." Rejected because the seat must not float with the session; cost control belongs to
the per-seat table, and `medium` on `opus` is the documented default.

## Canonical Delta

docs/canonical/pipeline.md, the paragraph beginning "Independence is a fresh-context
`spec:disposer` agent": replace "(read-only, paths only, the session's model)" with "(read-only,
paths only, `opus` at `effort: medium` — the disposer seat in core § Model Placement)". Add one
sentence at the end of that paragraph: "The reviewer seat is `opus` at `effort: high`; both
seats are fixed aliases, never the session's model, and independence is the fresh context plus
executed evidence, not a model family."

docs/canonical/genesis.md: wherever a design step is described as printing "a fresh-session line
naming Fable", replace with "a dispatch line — `Agent {model: "fable", effort: "high"}` — run as a
subagent from whatever model the session holds". Remove any mention of `/model fable`.
