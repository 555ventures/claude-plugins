---
date: 2026-08-13
status: implementing
diff_base: dd4d47e3851225e267aae997293800c28ed81da2
open_markers: 0
risk: T3
area: question-surface
design: false
breaking: false
depends_on: ["specs/20260813/07-command-report-conformance.md"]
depended_on_by: ["specs/20260813/09-model-placement-mechanics.md"]
brief: n/a
---

# Question contract — workflow schemas carry consequence + recommendation; doctrine stops fighting the hook

## Goal

The question-style hook (PreToolUse on AskUserQuestion, already wired in hooks.json) enforces
consequence-bearing options and reasoned recommendations at ask time — but the workflow
schemas that *manufacture* fork questions lack those fields, the doctrine sites that build
questions from those payloads never consume them, and four doctrine sites instruct the
opposite ("recommend nothing", "never batch-approve", "neutrally worded"). This spec makes
the data match the contract end to end: fork payloads are born with consequence and
recommendation-reason fields, every consumer renders them into the question it builds, and
every doctrine line that fights the hook is corrected in place. Done means: a fork surfaced
by any workflow reaches AskUserQuestion with everything the hook demands already in hand —
produced once, consumed where the question is built — and no command teaches the style the
hook blocks.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `wf-panel` AGGREGATE_SCHEMA: `hard_fork_list[].conflicting_positions[]` gains required `consequence` ("one plain-English line: what happens/what it costs if the user picks this") alongside the existing `option`/`rationale`; `hard_fork_list[]` gains required `recommended_first_reason` (why the existing `recommended_first` should win — the "(Recommended)" gloss); the aggregator prompt gains the ten-second cold-test clause (answerable by a product owner who has never seen this repo). | Fork options currently go to the user verbatim with rationale-why-the-panel-thinks-so but nothing about what picking costs (audit E1) — the hook then blocks the question downstream with no data to fix it from. (Field names verified at HEAD: the array is `hard_fork_list`, items `conflicting_positions` — not the audit's `hard_forks/options` shorthand.) |
| D2 | `wf-research` OPTION_SET_SCHEMA gains required `why_recommended` on the option set (one line: why rank 1 wins for THIS project); the prompt's "Phrase every label neutrally — do NOT lead the user" becomes "Phrase labels neutrally; the ranking and `why_recommended` carry the recommendation — the interview shows rank 1 as (Recommended) with your reason." | The prompt currently orders contract-inversion: a symmetric menu with a hidden rank field (E2); labels stay neutral, the recommendation becomes explicit data. |
| D3 | `wf-build`/`wf-design` `blocked` escalations: `options` becomes `[{option, consequence}]` (both required); `recommendation` stays optional but its description becomes "the option to present first, labeled (Recommended) — include whenever any option is defensible; omission means the orchestrator must derive or consult before asking". | Bare-string options make the downstream question unreconstructable (E3); the described recommendation field is what spec 09's underivable-fork rule keys on. |
| D4 | Consumers consume (the fields exist only if the question-builders read them): genesis-architect.md's menu-question and fork-question construction steps name the fields — option descriptions carry `tradeoff` + `consequence`, rank-1/`recommended_first` is labeled "(Recommended)" with `why_recommended`/`recommended_first_reason` as the stated reason; genesis-design.md and genesis-explore.md get the same one-line consumption edit at their wf-research/wf-panel question sites; genesis.md's field-shape description of the wf-research contract adds the new field; build.md's blocked-escalation step and spec-design-driver.js's blocked step text name `blocked.options[].consequence` and `recommendation` as the question's raw material. | Producing fields nobody consumes is the same defect this wave kills in spec 06 (GATE.summary — paid tokens, consumed by nobody); the refuter traced every consumer site and none read the payloads today. |
| D5 | Doctrine contradiction fixes, in place: review.md's "recommend nothing" → recommend the evidence-implied disposition, batch ≤4 findings per call (B1); doctor.md's "Never batch-approve" → batched ≤4 patches per call each showing before→after, forbidding only blanket approve-all (B2); build.md's `may be marked "(Recommended)"` → `is marked "(Recommended)"` with the symmetry clause scoped to the brief, never the question (B3); genesis-architect.md line 42's blanket "neutrally worded" clause deleted in favor of its own later recommended-first rule, replaced by the literal carve-out sentence "vision/taste dimensions may stay neutral — everywhere else the derived pick leads" (B4; the line-80 "neutral phrasing" inside the research-woven loop is the sanctioned labels-neutral-rank-recommends pattern and stays). | Every site is doctrine ordering what the wired hook blocks — commands obeying doctrine get their questions bounced, burning a rewrite round every run. |
| D6 | Missing-confirm fixes (B7): enforce.md's repo-wide format write-mode pass gains one batched confirm whose anchor sentence is the literal "Confirm before writing: {N} files will be rewritten" (with sample); audit.md's brief-writing fate gains the literal "preview the brief before it is written" step its sibling rule-row fate already has. | Two irreversible-ish actions currently fire with zero decision point — the inverse defect of B1–B4, same contract. |
| D7 | Question-teaching examples rewritten at the worst B6 sites — init.md's T3-surfaces and CI-inert questions, sketch.md's ratify/gap-surface asks, atlas.md's bound-region ask, release.md's 5-field ask (split to ≤4 + derive), audit.md's four-way fate menu (gains default), plan.md's mock-mismatch "which is right?" (gains recommended-first from evidence) — each rewritten to gloss-in-plain-English + recommended-first + consequence per option. Remaining B6 sites are left to the hook's runtime enforcement. | The hook catches malformed questions at runtime, but doctrine examples *teach* the malformation and cost a bounce every run at these recurring sites; the tail isn't worth hand-edits (the hook covers it). |
| D8 | Regression pin: hooks.json SHALL CONTINUE TO wire `question-style-gate.js` as a PreToolUse matcher on AskUserQuestion (tagged, green pre-change). | The wave's question contract assumes the hook; pin the wiring so a future hooks.json edit can't silently orphan it. |
| D9 | Scaffold-ledger row for the schema-level question contract (promote/retire: retire the schema fields only if the hook retires). Version bump target 6.66.0 — **superseded at build time (2026-08-14): HEAD already ships 6.69.0, so the bump lands on 6.70.0** (the literal in a spec is a target, not a pin; concurrent sessions race the semver). | Doctor check 13; repo discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/workflows/src/wf-panel.body.js | MODIFY | workflows | D1 consequence + recommended_first_reason + cold-test clause (on `hard_fork_list`/`conflicting_positions`) |
| spec/workflows/src/wf-research.body.js | MODIFY | workflows | D2 why_recommended + prompt inversion fix |
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D3 blocked options `{option, consequence}` + recommendation description |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D3 (same shape as build) |
| spec/commands/genesis-architect.md | MODIFY | doctrine | D4 consumption at menu + fork question sites; D5/B4 blanket-neutral fix w/ carve-out literal |
| spec/commands/genesis-design.md | MODIFY | doctrine | D4 consumption at its wf-panel/wf-research question sites |
| spec/commands/genesis-explore.md | MODIFY | doctrine | D4 consumption at its interview question site |
| spec/doctrine/genesis.md | MODIFY | doctrine | D4 field-shape description gains why_recommended (+ consequence where forks are described) |
| spec/commands/build.md | MODIFY | doctrine | D4 blocked-field consumption; D5/B3 "is marked" |
| spec/scripts/spec-design-driver.js | MODIFY | scripts | D4 blocked step text names consequence/recommendation |
| spec/commands/review.md | MODIFY | doctrine | D5/B1 disposition recommendation + ≤4 batch |
| spec/commands/doctor.md | MODIFY | doctrine | D5/B2 batched patches ≤4 |
| spec/commands/enforce.md | MODIFY | doctrine | D6 write-mode confirm (literal anchor) |
| spec/commands/audit.md | MODIFY | doctrine | D6 brief preview (literal anchor); D7 fate-menu default |
| spec/commands/init.md | MODIFY | doctrine | D7 T3-surfaces + CI-inert question rewrites |
| spec/commands/sketch.md | MODIFY | doctrine | D7 ratify/gap asks rewritten |
| spec/commands/atlas.md | MODIFY | doctrine | D7 bound-region ask rewritten |
| spec/commands/release.md | MODIFY | doctrine | D7 5-field ask split ≤4 + derive |
| spec/commands/plan.md | MODIFY | doctrine | D7 mock-mismatch ask gains evidence-backed recommendation |
| tests/question/schema-contract.test.js | CREATE | tests | AC-20260813-08-1 … AC-20260813-08-4 |
| tests/question/doctrine-alignment.test.js | CREATE | tests | AC-20260813-08-5 … AC-20260813-08-8 |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D9 row |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 bump + changelog |

## Contracts

```js
// wf-panel AGGREGATE_SCHEMA delta (real field names at HEAD):
// hard_fork_list[].conflicting_positions[]: required ['option','consequence','rationale']
//   consequence: 'one plain-English line: what happens / what it costs if the user picks this'
// hard_fork_list[]: required ['dimension','conflicting_positions','recommended_first',
//                             'recommended_first_reason']
//
// wf-research OPTION_SET_SCHEMA delta:
// option-set object: required += 'why_recommended'  // why rank 1 wins for THIS project, one line
//
// wf-build / wf-design blocked delta:
// options: { type: 'array', items: { required: ['option','consequence'], ... } }
// recommendation.description: 'the option to present first, labeled (Recommended); include
//   whenever any option is defensible — omission means derive-or-consult before asking'
//
// Consumption contract (D4, doctrine-side): a question built from any of these payloads
// renders consequence into each option's description, and the recommended option first,
// labeled "(Recommended)", with recommended_first_reason / why_recommended as the reason.
```

## Behavior

- Schema fields are additive-required: they invalidate no existing consumer (consumers read
  named fields), but every producer must now fill them — and D4 gives each field exactly one
  named consumer, so no field is paid for and dropped.
- Doctrine edits are strictly in-place rewrites of existing lines (holistic rule: no
  net-new prose sections); the claims ratchet acknowledges the deltas.
- File contention with spec 07 (review/build/doctor/init/sketch/atlas/release/plan/audit)
  is serialized by the dependency chain; the concerns are disjoint (report steps vs
  question sites).

## Acceptance Criteria

- **AC-20260813-08-1**: WHEN wf-panel's AGGREGATE_SCHEMA is read THE SYSTEM SHALL require
  `consequence` on `conflicting_positions` items and `recommended_first_reason` on
  `hard_fork_list` items (literal: `required: ['option', 'consequence', 'rationale']`), and
  the aggregator prompt SHALL contain the cold-test clause (literal: `never seen this repo`)
  → tests/question/schema-contract.test.js
- **AC-20260813-08-2**: WHEN wf-research's schema and prompt are read THE SYSTEM SHALL
  require `why_recommended` and SHALL NOT contain `do NOT lead the user` →
  tests/question/schema-contract.test.js
- **AC-20260813-08-3**: WHEN wf-build's and wf-design's blocked schemas are read THE SYSTEM
  SHALL require `{option, consequence}` items (literal: `required: ['option', 'consequence']`)
  → tests/question/schema-contract.test.js
- **AC-20260813-08-4**: WHEN hooks.json is read THE SYSTEM SHALL CONTINUE TO contain a
  PreToolUse matcher `AskUserQuestion` invoking `question-style-gate.js` (regression pin,
  green pre-change) → tests/question/schema-contract.test.js
- **AC-20260813-08-5**: WHEN review.md and doctor.md are read THE SYSTEM SHALL NOT contain
  `recommend nothing` nor `Never batch-approve`, and SHALL contain a `≤4`/`up to 4` batch
  bound at both sites → tests/question/doctrine-alignment.test.js
- **AC-20260813-08-6**: WHEN genesis-architect.md is read THE SYSTEM SHALL NOT contain
  `neutrally worded` and SHALL contain the carve-out literal `vision/taste dimensions may
  stay neutral`; WHEN build.md is read THE SYSTEM SHALL NOT contain `may be marked
  "(Recommended)"` and SHALL contain `is marked "(Recommended)"` →
  tests/question/doctrine-alignment.test.js
- **AC-20260813-08-7**: WHEN enforce.md and audit.md are read THE SYSTEM SHALL contain the
  literal anchors `Confirm before writing:` (enforce) and `preview the brief before it is
  written` (audit) → tests/question/doctrine-alignment.test.js
- **AC-20260813-08-8**: WHEN the D4 consumer sites are read THE SYSTEM SHALL find
  `consequence` named at genesis-architect.md's fork-question step, `why_recommended` named
  at its menu-question step, and `genesis.md`'s wf-research field description listing
  `why_recommended` (doctrine pins on the field names at the consuming sites) →
  tests/question/doctrine-alignment.test.js

## Assumptions (escalation triggers)

- The question-style gate's tier-1 checks (consequence-bearing descriptions ≥25 chars,
  recommendation reason ≥40 chars, identifier ban) already accept the outputs these schemas
  will produce — no gate change needed. If a D1–D3 field format trips the gate → fix the
  producing prompt, not the gate.
- Making schema fields required doesn't break wf-panel/wf-research resume flows mid-wave
  (same assumption as spec 06's `impact`; same fallback: optional-with-warning one version).
- The B6 tail (jargon question sites not rewritten here) is genuinely covered by the hook's
  runtime bounce. If post-wave evidence shows repeated bounces at a specific site → that
  site's rewrite is a T1 edit, not a new spec.

## Rationale

Audit provenance: Class E (E1–E3), Class B (B1–B4, B6, B7), plus the discovery that
hooks.json already wires the gate — which converted this spec from "wire the hook" to "make
the data, the consumers, and the doctrine match the hook".

Refuter-driven corrections (two seats, 2026-08-13): the Contracts block now uses the real
schema field names (`hard_fork_list`/`conflicting_positions` — the audit's
`hard_forks/options` was shorthand that would have made a build worker bolt on a spurious
field); D4 (consumption rows) was added because every question-building consumer site was
verified to ignore the payloads — producing unconsumed required fields repeats the exact
GATE.summary defect spec 06 deletes.

Rejected findings/items, with reasons: **B5 (git merge.md) dropped** — refuter verified
merge.md already derives the strategy from its printed table, recommends first, and glosses
`ours/theirs`; the audit's B5 was a misdiagnosis, and "derive + confirm" would contradict
merge.md's own deliberate "always ask — strategy is a real fork" rule (mirrored in
review.md's Phase 4). **B7's review.md deletion confirm dropped** — review.md:479's
"Merge-back is part of CLEAN, not an extra ask" is a deliberate design ruling (CLEAN
auto-flow); the strategy AskUserQuestion is the sanctioned decision point in that flow, and
adding a cleanup confirm would re-open a ratified derive-don't-interview call. The audit
item is recorded as rejected, not deferred. Also rejected: rewriting all ~14 B6 sites by
hand (runtime enforcement covers the tail); extending tier-1 gate regexes (fail-open design
is deliberate, no evidence of misses).

## Canonical Delta

None.
