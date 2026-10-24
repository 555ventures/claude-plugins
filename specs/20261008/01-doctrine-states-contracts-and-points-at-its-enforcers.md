---
date: 2026-10-08
status: done
build_base: main
open_markers: 0
tier: standard
area: doctrine
breaking: false
depends_on: []
brief: n/a
diff_base: c467f7b1c20d4ba2e0681569a6f7fc73982a8012
---

# Doctrine states contracts and points at its enforcers

## Goal

The six doctrine files under `spec/doctrine/` (core, genesis, mocks, design, and the two stage
files) shrink to the contracts a session cannot derive from a script, and every rule a script,
hook or driver already enforces becomes a one-line pointer at that enforcer. Nothing is
rewritten: lines are deleted or replaced by a pointer, every `## ` heading survives byte for
byte (drivers, `shared-for` and `--section` slice by heading), and `/spec:connect` stops
loading the whole doctrine. Done means: each file at or under its ceiling, every heading in
place, the citation sweep at zero misses, every command's read-load pinned at its new measured
value, and the test suite green with every retired phrase pin gone rather than weakened.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The pointer rule.** A section (or paragraph) whose rule a script, hook or driver enforces keeps its `## ` heading, states the invariant in at most three lines, and names the enforcer in backticks as its binding home — e.g. `Enforced by spec-state-gate.sh; its header is the contract.` The enforcer's own header comment is the canonical statement; the doctrine never restates its branches, exit codes or wording. (AC-20261008-01-3) | One binding home per rule (core § Doctrine Authoring already says it); research measured prose instructions as not changing agent outcomes, so a restated enforcer is pure read-load. Rejected: keeping a "summary" paragraph beside the pointer — that is the second copy the rule forbids. |
| D2 | **The keep/delete rule for judgment prose.** In a section with no enforcer, a line survives when it names an artifact path, a key, a mark, a refusal, a state, a template, a table row, a fixed output line, a script invocation (`spec-paths <key>`, a script basename — `spec/entrypoints.json` declares doctrine files as call sites), or is a pin anchor listed in Rationale § Pin inventory; a line that describes how to think, phrase, prioritise or justify, or cites history ("measured 3-for-3…", "(specs/… build)"), is deleted. Tables and fenced blocks are kept whole. (AC-20261008-01-3) | Workers need a mechanical line test, not taste. The surviving lines are the grammar the drivers parse and the tests pin; the deleted lines are advice. |
| D3 | **Deletion only, no rewriting.** No sentence is paraphrased, condensed or merged into new prose; the only new text is D1 pointer lines and the connective minimum (a colon, a list marker). A diff hunk that adds prose other than a pointer line is a review finding. `[no-ac: reviewer judgment over the diff; no leg can see paraphrase]` | The refactor rule: retired prose leaves; it does not come back shorter. Rewriting is where new contradictions enter. |
| D4 | **Headings are frozen.** Every `## ` heading in the six files is byte-identical to the pre-image and in the same order (the list is in Contracts). No heading is added, removed, renamed or re-ordered. (AC-20261008-01-4) | `spec-paths shared-for` and `--section` slice by heading; `genesis-driver.js`, `mocks-driver.js` and the review driver print `Doctrine: § <heading>` pointers; `citations-check.js` resolves `§` citations against headings. A renamed heading silently serves nothing. |
| D5 | **Per-file ceilings** (Contracts § Ceilings): core.md ≤ 230, genesis.md ≤ 450, mocks.md ≤ 200, design.md ≤ 65, stages/stage-build.md ≤ 85, stages/stage-review.md ≤ 95 lines, each with per-section ceilings in Behavior. The build records the measured line count of each file as its budget; the budget may only shrink afterwards. (AC-20261008-01-3) | A ceiling is the one thing a test can hold a prose file to without regex-over-prose. The numbers come from the section-by-section fate table below, not from a round figure. |
| D6 | **`/spec:connect` gets a scoped `shared-for` arm**: `Host Grounding|Question Style|Console Output Style|Session Execution`. The scoped roster grows from 13 to 14 members; the pinned SHARED_FOR table and the roster count follow it. (AC-20261008-01-1, AC-20261008-01-2) | Today `connect` falls open to both whole files (419 lines) for a 22-line command that asks nothing of the doctrine beyond how to report. Rejected: leaving it fail-open — it is the single largest read-load in the roster. |
| D7 | **Read-load becomes fully pinned.** `tests/consistency/read-load.test.js`'s `BUDGET` carries one entry per command (all fourteen), each set to the value measured at build after this spec's cuts; the flat `CAP` fallback is deleted. The existing ratchet rule (an entry may only shrink) is unchanged. (AC-20261008-01-2) | A flat 500-line cap never fired for commands sitting at 250; a measured per-command number does. Spec 02 (the command bodies) lowers the same entries again. |
| D8 | **Retired phrase pins leave, never weaken.** Every test that asserts a literal phrase this spec deletes is either deleted (its subject is gone) or re-targeted to the surviving contract line in the same File Plan row; no assertion is loosened to pass. The pins are enumerated in Rationale § Pin inventory from the lock-time blanking spike (A3). `[no-ac: the host gate is the oracle; the spike found no pin D2 fails to keep]` | pipeline rules § Test Rules: a weakened assertion is a doctrine change. The spike is the inventory; a pin the spike missed is handled under A3's remedy. |
| D9 | **`replay-corpus.md` is untouched.** `lib/replay-corpus.js` parses it at runtime; it is data, not prose. `[no-ac: absence of change; the replay suite already pins the parse]` | The audit's doctrine bucket included it only because it lives in the directory. |
| D10 | **Plugin version bump** via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; no version literal is named here. `[no-ac: scripts/plugin-bump.js --check in the gate is the oracle]` | pipeline rules § Planning. |
| D11 | **User ruling at build (red-check `unsanctioned-green`):** the frozen-headings promise is a continuation — AC-20261008-01-4 reads SHALL CONTINUE TO, its new test is green on the pre-image and stays green through the cuts. (AC-20261008-01-4) | The headings already match; the spec's job is to keep them matching. Rejected: dropping the guard (a renamed uncited heading would slip through). |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ doctrine | scripts | tests | other. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/core.md | MODIFY | doctrine | D1/D2/D4/D5 — per-section cuts per Behavior § core.md; ≤ 230 lines; headings frozen |
| spec/doctrine/genesis.md | MODIFY | doctrine | D1/D2/D4/D5 — per-section cuts per Behavior § genesis.md; ≤ 450 lines; headings frozen |
| spec/doctrine/mocks.md | MODIFY | doctrine | D1/D4/D5 — Checkpoint contract and Product-Stage Exemption become pointers; ≤ 200 lines |
| spec/doctrine/design.md | MODIFY | doctrine | D2/D4/D5 — the On-disk handoff restatement and canon justification lines go; ≤ 65 lines |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D1/D4/D5 — Report and Worker Contract restatements become pointers; ≤ 85 lines |
| spec/doctrine/stages/stage-review.md | MODIFY | doctrine | D1/D4/D5 — Report block and reviewer-dispatch restatements become pointers; ≤ 95 lines |
| spec/bin/spec-paths | MODIFY | scripts | D6 — add the `connect)` SECTIONS arm beside `prototype)`; the usage line is unchanged |
| tests/consistency/read-load.test.js | MODIFY | tests | D6/D7 — AC-20261008-01-1, AC-20261008-01-2: SHARED_FOR gains the `connect` row; BUDGET gains every command at its measured value; `CAP` deleted |
| tests/spec-paths.test.js | MODIFY | tests | D6 — AC-20261008-01-1: the scoped-roster count 13 → 14 and connect joins the "serves § Session Execution" sweep |
| tests/consistency/doctrine-budget.test.js | CREATE | tests | AC-20261008-01-3: the six per-file ceilings, measured values written at build, ratchet only shrinks |
| tests/consistency/doctrine-headings.test.js | CREATE | tests | AC-20261008-01-4: the `## ` heading list of each of the six files equals the Contracts list, in order |
| tests/consistency/design-stage-doctrine.test.js | MODIFY | tests | D5 — the `<=160` design.md cap tightens to the value measured at build (AC-20261008-01-6 keeps its citations-check clause) |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |

<!-- The blanking spike (Rationale § Pin inventory) found no pin that D2 does not keep, so no
     further test row is planned; A3 names the remedy if one reddens. -->

## Contracts

### Ceilings (D5) — the `DOCTRINE_BUDGET` table `tests/consistency/doctrine-budget.test.js` pins

```js
// measured at build after the cuts; each entry may only shrink afterwards
const DOCTRINE_BUDGET = {
  'spec/doctrine/core.md': 230,
  'spec/doctrine/genesis.md': 450,
  'spec/doctrine/mocks.md': 200,
  'spec/doctrine/design.md': 65,
  'spec/doctrine/stages/stage-build.md': 85,
  'spec/doctrine/stages/stage-review.md': 95,
}
```

### Frozen headings (D4) — the list `tests/consistency/doctrine-headings.test.js` pins, in order

```
core.md: Host Grounding · Grounding Drift · Rule Enforcement · Pipeline Entry · Tiers ·
  Runtime Verification · Release Stage · Feedback Loop · Incident Policy · Decomposition ·
  State Machine · Model Placement · Decisions · Question Style (every `AskUserQuestion`, every stage) ·
  Console Output Style (progress narration and end-of-run reports) · On-Disk Handoff ·
  Worker Git Ban · Read-Only Surfaces · MCP Policy · Canonical Docs Loop · Session Execution ·
  Doctrine Authoring
genesis.md: Genesis: Discovery Interview (the intake posture) · Genesis: Brief State ·
  Genesis: Tournament of Scaffolds · Genesis: Decision Record (one proposer) ·
  Genesis: Ops Conventions ADR · Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion) ·
  Genesis: Archetype Registry (the master variable) · Genesis: Fresh UX Research (method fixed, content researched) ·
  Genesis: Executed Assumptions (dependency-adjudicated claims never lock by argument) ·
  Genesis: Enforcement Handoff to the spec pipeline · Genesis: Day-Zero Skeleton ·
  Genesis: Conventions Probe Suite · Genesis: State Machine · Genesis: Design Stage ·
  Genesis: Roadmap Decomposition · Genesis: On-disk Handoff (the genesis artifacts)
mocks.md: Provenance Ledger · Mocks: State Machine · Mocks: Seed · Mocks: Checkpoint contract ·
  Mocks: Authoring Rules · Mocks: Rounds and Notes · Mocks: Confirmation ·
  Product-Stage Exemption (question-style-gate.js)
design.md: Design Canon (the wireframe is gray screen files the service renders) ·
  Design Authoring Contracts · Workflows Encode Shape, Not Judgment
stages/stage-build.md: Input · Build stage — the build driver owns this part of the state machine ·
  Prototype specs · Worker Contract — every dispatch this session makes · `blocked` returns · Report · Rules
stages/stage-review.md: Input · Protocol — the driver owns the state machine · Rules — the judgments this session holds
```

The test reads each file, collects lines starting `## `, strips nothing, and compares the full
heading text (parenthetical included) to the list above. `### ` sub-headings are not frozen.

### `spec-paths shared-for connect` (D6)

```
<!-- shared invariants scoped to /spec:connect — full doctrine: … -->
## Host Grounding
## Question Style (every `AskUserQuestion`, every stage)
## Console Output Style (progress narration and end-of-run reports)
## Session Execution
```

The `SHARED_FOR` table in `read-load.test.js` gains
`connect: ['Host Grounding', 'Question Style', 'Console Output Style', 'Session Execution']`;
`tests/spec-paths.test.js`'s roster assertion reads 14, and connect is swept with the others
for § Session Execution.

### Pointer-line grammar (D1)

One line, flush left or as the section's first bullet:

```
Enforced by `<script or hook file name>` — its header comment is the contract.
```

or, when the home is a driver's printed step: ``Printed by `<driver>.js` at <STATE>; never restated here.``
A pointer names a file that exists under `spec/scripts/`, `spec/scripts/lib/` or `spec/hooks/`;
the reviewer checks each one resolves.

## Behavior

### Fate table — core.md (337 → ≤ 230)

| Section | Now | Ceiling | Fate |
|---|---|---|---|
| preamble (H1 + lifecycle paragraph) | 15 | 8 | keep the lifecycle sentence; drop the second paragraph (restates `shared-for`) |
| Host Grounding | 20 | 14 | keep both file bullets and the STOP line; drop the regeneration-ownership paragraph (restated in commands) |
| Grounding Drift | 9 | 4 | D1 pointer at `spec-state-gate.sh` + `/spec:doctor` check 2 |
| Rule Enforcement | 12 | 8 | keep the deterministic-in-gateCommand rule and the no-tool-named rule; drop the two-stage narrative |
| Pipeline Entry | 17 | 14 | keep the three lanes paragraph and the commit-time test; drop the opt-in justification sentence |
| Tiers | 18 | 12 | keep triggers list and what critical means; drop the second paragraph's history citation |
| Runtime Verification | 17 | 8 | keep the bold rules; D1 pointer at `smoke.sh` / `verdict.js` required leg; drop the host-500 anecdote |
| Release Stage | 10 | 8 | keep the shape line; drop the justification sentence |
| Feedback Loop | 38 | 24 | keep carriers list, the agent-memory rule in two lines (pin anchor: `.claude/agent-memory/` + "carry, correct, or delete"), the two ground-truth signals; replay cadence keeps its three contract lines (pin anchor: `replay.js --due`, "on demand" by `/spec:replay`, the footer's `replay due` clause, `docs/adr/0025`) and loses the rest |
| Incident Policy | 29 | 26 | keep whole (the admission bar is a contract); drop the closing "a bar filled from one repo's ledger says so" line only |
| Decomposition | 8 | 8 | keep |
| State Machine | 10 | 5 | keep the transition line; D1 pointer at `spec-state-gate.sh` |
| Model Placement | 16 | 12 | keep seat assignments (pin anchor: the literal `reviewer seat is Fable at \`effort: low\``); drop the explanatory clauses ("low holds because…") |
| Decisions | 6 | 6 | keep |
| Question Style | 35 | 16 | keep the floor paragraph as D1 pointer at `question-style-gate.js`; keep the five bullets that are rules (plain language, options carry consequences, derive before asking, product facts asked, ten-second test) as one line each; drop the rest |
| Console Output Style | 17 | 7 | D1 pointer at `report-render.js`; keep the close-the-loop line (spec-status --next verbatim) and the queue-before-render line |
| On-Disk Handoff | 8 | 6 | keep |
| Worker Git Ban | 6 | 4 | keep the ban; drop the justification |
| Read-Only Surfaces | 6 | 5 | keep |
| MCP Policy | 9 | 7 | keep |
| Canonical Docs Loop | 6 | 4 | keep the two mechanics; drop the moral |
| Session Execution | 15 | 12 | keep the five bullets at one line each |
| Doctrine Authoring | 6 | 6 | keep |

### Fate table — genesis.md (797 → ≤ 450)

| Section | Now | Ceiling | Fate |
|---|---|---|---|
| preamble | 8 | 6 | keep |
| Discovery Interview | 107 | 45 | keep: the ten coverage keys and their `## Coverage` grammar; the six brief sections in order; the `discovery-done` archetype line; the research-round mechanics as the three numbered steps at one line each; the "never organizational" rule as one line. Delete: posture prose, escape-hatch/non-goals bullets' justifications, model-placement paragraph (core § Model Placement), provenance and bridge paragraphs |
| Brief State | 57 | 30 | keep: precondition archetype split, derivation sources line, the ratification tiers, the on-success status shape, legacy resume marks, the two generated sections' names and the refusal list. Delete: justification sentences; driver-restating "refuses when…" prose beyond the one-line list |
| Tournament of Scaffolds | 57 | 30 | keep: state order, the "wireframe is not the product" rule in one line, FINALISTS composition rule, PICK rule, re-scaffold-clean rule, artifacts list. Delete: RACE/PROBE narrative (driver-run; D1 pointer at `genesis-driver.js`) |
| Decision Record | 24 | 14 | keep: cannot-nest rule, proposer input/output, hard-fork definition, Dissents rule. Delete: partitioned-evidence paragraph's justification |
| Ops Conventions ADR | 50 | 30 | keep: the row list as a bullet per row (name + one clause), checker-enforceable rule, DECIDED/DEFERRED rule, the generating question in one sentence. Delete: parentheticals of measured history, derive-pass and coverage-check narrative beyond one line each |
| Hard-to-Reverse Dimensions | 31 | 26 | keep both lists and the derived-dimensions table whole |
| Archetype Registry | 26 | 22 | keep the table whole and the two closing rules |
| Fresh UX Research | 42 | 22 | keep: output path + template, the five admission bullets at ≤ 2 lines each (ethics floor whole). Delete: anchoring justification, the rule-checklist narrative |
| Executed Assumptions | 18 | 8 | keep the bold rule; point at `/spec:plan § Micro-spikes` |
| Enforcement Handoff | 21 | 12 | keep: decide-vs-implement split, HANDOFF mechanics line, the `design` block contract bullet |
| Day-Zero Skeleton | 31 | 20 | keep the five deliverable bullets at ≤ 3 lines each and the "wireframe is not the skeleton" refusal line |
| Conventions Probe Suite | 21 | 14 | keep: conventions.json shape, probe rule, binding subset's ≤150 lines and literal names |
| State Machine | 51 | 30 | keep: state order line, checkpoint line, the status-field bullets, the no-enum roadmap rule, BRIEF derivation rule in two lines, re-entry rule |
| Design Stage | 96 | 45 | keep: when it derives / skips, the three artifacts each mark verifies as a list, the kit/journeys/approval states' one-line contracts, the approval record's frozen rule, the picture-round line. Delete: session/model narrative, beats-file justification, Storybook probe explanation beyond the index rule |
| Roadmap Decomposition | 73 | 40 | keep: templates line, briefs-stable rule, the four numbered steps at ≤ 4 lines each, first-light brief rule, journey-placement refusal rule, parking-lot refusal rule |
| On-disk Handoff | 83 | 50 | keep every artifact bullet at ≤ 2 lines (path + owner + one clause); delete history parentheticals |

### Fate table — mocks.md (215 → ≤ 200), design.md (82 → ≤ 65), stage files

- **mocks.md**: Checkpoint contract 19 → 10 (D1 pointer at `mocks-driver.js`; keep the checkpoint
  line and `--state` rule); Product-Stage Exemption 13 → 8 (D1 pointer at `question-style-gate.js`;
  keep the two window definitions). Every other section is a grammar the driver parses — keep whole.
- **design.md**: Design Canon 42 → 32 (drop the "design contract is code, twice over" justification
  sentences; keep every rule line); Design Authoring Contracts 20 → 18; Workflows Encode Shape 14 → 9
  (delete the On-disk handoff paragraph — it restates core § On-Disk Handoff verbatim).
- **stage-build.md** 104 → ≤ 85: Report (16) → 6 (D1 pointer at `report-render.js`, keep the slot
  names); Worker Contract's git/MCP bullet → one line citing core; the preamble's "see run.md" clause stays.
- **stage-review.md** 110 → ≤ 95: the DONE report paragraph + block (20) → 8 (slot names only);
  "evidence standard" bullet keeps its two rules in three lines; the CLOSE bullet keeps the three
  eviction fates **as the literal words delete / merge / mechanize in that order** (doctrine-pins.test.js).

### What the session does at build

1. Apply the fate tables file by file (one doctrine worker, `doctrine-author`), deleting only.
2. Run `node spec/scripts/citations-check.js --root .` — MISS must stay 0 (A2).
3. Measure every file and every command's read-load; write the measured numbers into
   `DOCTRINE_BUDGET` and `BUDGET`; delete `CAP`.
4. Run the suite; for each red test on the spike list, apply its File Plan fate (re-target or delete).

## Acceptance Criteria

- **AC-20261008-01-1**: WHEN `spec-paths shared-for connect` runs THE SYSTEM SHALL print exactly the
  four `## ` sections Host Grounding, Question Style, Console Output Style, Session Execution in that
  order and nothing from design.md (e.g. `spec-paths shared-for connect | grep -c '^## '` → `4`),
  the pinned SHARED_FOR table carries that row with every other row unchanged, and the scoped
  roster counts 14 → rewrites tests/consistency/read-load.test.js :: AC-20260908-06-3
- **AC-20261008-01-2**: WHEN the read-load test runs THE SYSTEM SHALL hold every one of the fourteen
  commands to its own `BUDGET` entry, `connect` included, with no flat `CAP` fallback left in the
  file (e.g. `/spec:connect` loads ≤ 130 lines: 22 own + ≤ 108 shared) → rewrites
  tests/consistency/read-load.test.js :: every /spec command has a read-load budget entry [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]
- **AC-20261008-01-3**: WHEN each of the six doctrine files is measured THE SYSTEM SHALL find it at or
  under its `DOCTRINE_BUDGET` entry (e.g. `wc -l spec/doctrine/core.md` → ≤ 230;
  `spec/doctrine/genesis.md` → ≤ 450), the entries being the values measured at build → writes
  tests/consistency/doctrine-budget.test.js [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]
- **AC-20261008-01-4**: WHEN the `## ` lines of each of the six doctrine files are collected THE SYSTEM
  SHALL CONTINUE TO match the Contracts § Frozen headings list exactly, in order (e.g. core.md's 14th heading is
  `## Question Style (every \`AskUserQuestion\`, every stage)`) → writes tests/consistency/doctrine-headings.test.js [retired: specs/20261024/04-scripts-drop-their-inline-changelog.md]
- **AC-20261008-01-5**: WHEN `spec-paths shared-for <cmd>` runs for each of the thirteen previously
  scoped commands THE SYSTEM SHALL CONTINUE TO print the section list the SHARED_FOR table pinned
  before this spec, unchanged → reuses tests/spec-paths.test.js :: shared-for: scoped output carries its sections
- **AC-20261008-01-6**: WHEN `citations-check.js --root .` runs after the cut THE SYSTEM SHALL CONTINUE TO
  report `MISS=0` (the pre-image prints `TOTAL=154 CHECKED=117 SKIP=37 MISS=0`; the totals may fall,
  the miss count may not rise) → reuses tests/consistency/design-stage-doctrine.test.js :: AC-20260914-02-10 / AC-20260926-01-8

## Assumptions (escalation triggers)

- A1: Every section's ceiling in the fate tables is reachable by deletion alone under D2. —
  **if false:** the worker returns `blocked` naming the section and the lines it cannot delete;
  the session raises that one section's ceiling in Behavior and the file total by the same
  amount, recorded as a deviation — never by rewriting prose to fit.
- A2: `citations-check.js` reports MISS=0 on the pre-image (executed at lock:
  `TOTAL=154 CHECKED=117 SKIP=37 MISS=0`) and no deleted line is itself the only home of a heading
  another file cites. — **if false:** the citing line is re-pointed at the surviving heading;
  headings never change (D4).
- A3: The lock-time blanking spike (all six bodies blanked, headings kept, suite run) enumerates
  the superset of phrase pins this cut can redden; the classified list is in Rationale and its
  test files are File Plan rows. — **if false** (a pin reddens that the spike did not list): the
  build adds the file as a File Plan row with the same two fates and records the deviation; the
  pin is never weakened.
- A4: Adding a `connect)` arm leaves the fail-open behaviour for unknown commands intact
  (`tests/spec-paths.test.js` pins it with `no-such-command`, not `connect`; verified by grep at
  lock — zero hits for `connect` in that file). — **if false:** the pin's fixture key is changed to
  a name no arm will ever claim.
- A5: The contract hash is unaffected: `init-gen.js computeContractHash` reads only
  `spec/templates/grounding-contract.md` (verified at lock by the blast-radius pass). — **if false:**
  STOP; a hash change makes every host owe a re-stamp and needs the user's yes.

## Rationale

This spec is the first of two from the 2026-10-08 subtraction pass (memory
`project-20261008-subtraction-proposal`; research `research-20261008-ai-first-coding-practice`). The
audit classified ~775 of 1,878 doctrine lines as behavioural prose with no mechanism and ~500 more as
restating an enforcer; a spike that deleted 267 lines of command prose turned no test red. The research
behind it is thin but consistent: a 288-trial ablation across two coding agents found context-file prose
made no measurable difference to correctness, while deterministic gates did. Doctrine therefore keeps
what only prose can carry — grammars, keys, state orders, tables, refusal lists — and points at the
script for everything else.

**Why ceilings, not phrase bans.** pipeline rules § Test Rules forbids regexes over prose as tests;
`read-load.test.js` already holds commands to a measured number, so the same instrument extends to
doctrine files. The ceilings are sums of per-section fates, not round numbers, and the build writes
the measured value so the ratchet starts true.

**Why genesis.md keeps its method skeleton.** The driver cites four genesis sections by name at its
judgment steps; those sections are the only home of the method. The cut removes posture, justification
and history from them and keeps the lines a driver or a later session parses. A4 of the audit noted
the research measured advice layered over gates, not procedure with no gate; genesis is the latter,
so the ceiling there is 450 rather than the audit's 360 and the per-section table says which lines
survive.

**Rejected.** (1) Rewriting sections into tighter prose — the rule is deletion only; rewriting is where
contradictions enter and it defeats the review's "no new prose" check. (2) Deleting `Incident Policy`'s
admission bar — it is the contract this session applies when proposing a guard; it stays whole.
(3) Folding spec 02's command cuts into this spec — 19 doctrine-layer rows exceeds core § Decomposition's
cap; spec 02 depends on this one so both rewrite the same `BUDGET` table in sequence.

**Fragile.** The eviction-fates pin in `doctrine-pins.test.js` bounds its window on two literal
anchors in stage-review.md ("Close (the CLOSE step)" and "Merge strategy is derived"); the cut keeps
both anchors and the three fate words in order. `spec-paths.test.js` hard-codes the roster size (13);
D6 makes it 14.

### Pin inventory (A3) — the lock-time blanking spike

All six bodies blanked with headings kept: 1232 tests, 14 red, every one anchored on a line D2
keeps. No structural test reddened. The anchors, each a keep-line for the worker:

| Test | Anchor line that must survive (file) |
|---|---|
| tests/consistency/base-derivation.test.js :: the review command documents the pin before the ref | `diff_base` → `build_base` → merge-base order (stage-review.md § Protocol) |
| tests/consistency/entrypoints.test.js :: AC-20260820-04-6 … zero violations | every `spec-paths <key>` / script invocation literal in core, genesis, stage-build, stage-review (14 manifest rows: fleet-reader, memory-sweep, pictures, prose-cap, report-render, spec-build-driver, spec-queue, spec-review-driver, spec-status) |
| tests/consistency/genesis-doctrine.test.js :: AC-20260825-01-3 | the Archetype Registry table, whole |
| tests/consistency/genesis-doctrine.test.js :: AC-20260825-02-1 | the ten coverage keys and the derived-dimension keys (Discovery Interview, Hard-to-Reverse table) |
| tests/consistency/genesis-doctrine.test.js :: AC-20260902-08-10 and AC-20260907-05-9 | On-disk Handoff roster bullets: `genesis-brief.md` as brief.md's template; the `design/mocks/` workspace bullet |
| tests/consistency/genesis-doctrine.test.js :: AC-20260825-03-9 | the literal `registry-check` (Discovery Interview) |
| tests/prose-debt/doctrine-pins.test.js :: AC-20260823-06-4 | stage-review.md: `**Close (the CLOSE step).**` … delete / merge / mechanize in order … `**Merge strategy is derived` |
| tests/review/reviewer-seat.test.js :: core.md § Model Placement names the reviewer seat | `reviewer seat is Fable at \`effort: low\`` |
| tests/run-ledger.test.js :: AC-20260820-07-13 / AC-20260823-01-20 | `.claude/spec-runs.jsonl` named in stage-build.md |
| tests/run-ledger.test.js :: AC-20260820-07-13: review never hand-writes the verdict word | stage-review.md's "verdict word is derived by `verdict.js`" bullet |
| tests/run-ledger.test.js :: AC-20260821-02-9 / AC-20260913-09-10 | core § Feedback Loop cadence lines (see fate table) |
| tests/run-ledger.test.js :: AC-20260821-02-10 / AC-20260823-06-9 | `.claude/agent-memory/` in stage-review.md's CLOSE bullet and core § Feedback Loop |
| tests/spec-status.test.js :: consumers are wired to the one derivation | stage-review.md's "`spec-status --next` … verbatim" line |

Because every anchor is kept, the File Plan's test rows carry only the ceiling tightenings and
the two new budget/heading tests; a pin that reddens anyway is handled under A3's remedy.

### Build deviations (folded at close, 2026-10-13)

Three lock-time AC errors surfaced at red-check, each already a pipeline-rules Gotchas class
(the `→` verb and CONTINUE-TO entry), so no new Gotchas entry:

- `design-stage-doctrine.test.js`'s `<=160` cap was not tightened: AC-20261008-01-6 `reuses` that
  case, so it must stay green on the 82-line pre-image (`broken-reuse`). It gains the AC-6 tag only;
  design.md's real ceiling is pinned by `doctrine-budget.test.js`.
- `read-load.test.js`'s named AC-2 case also asserts each command's measured load against its own
  BUDGET entry, so the rewrite is red on the pre-image (`gutted-rewrite`).
- AC-20261008-01-4 now reads SHALL CONTINUE TO by user ruling D11 (`unsanctioned-green`).

Doctrine cuts:

- Several per-section ceilings were unreachable by deletion without removing a pin-inventory or D2
  keep-line; the file totals fit instead (A1's file-total clause). Over their section ceiling: core
  preamble, Feedback Loop, Incident Policy, Question Style, Console Output Style; genesis Discovery
  Interview, Brief State, Tournament, Decision Record, Ops Conventions, Fresh UX, Design Stage, State
  Machine, Roadmap Decomposition, On-disk Handoff. Measured (`wc -l`): core 229, genesis 447, mocks
  199, design 64, stage-build 84, stage-review 92.
- To hold genesis.md's 450, whole paragraphs beyond the fate table's named deletions went: Brief
  State's ratification-by-archetype bullets (the Archetype Registry closing rule carries the split),
  the derived-dimensions intro, Decision Record's partitioned-evidence paragraph, three Design Stage
  paragraphs, the Roadmap ops-conventions facade rule, and the `init-gen.log` artifact bullet
  (`genesis-driver.js` names it in its own refusal). Review flagged the two keep-line deletions as
  soft: A1's remedy was raising the ceiling, not deleting keep-lines.

## Canonical Delta

None — this repo has no `docs/canonical/doctrine.md`; the doctrine files are their own canon.
