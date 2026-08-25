---
date: 2026-08-25
diff_base: 47eb2cb54f66cfe7e97f2a2b05c2cbc30335fbfb
status: done
tier: critical           # removes a spec-paths key (key-set edit — critical trigger, precedent specs/20260823/01, specs/20260824/05)
area: genesis
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260825/02-genesis-consultant-discovery.md]
brief: 10
open_markers: 0
---

# Genesis panel collapse: one proposer over the research fan-out

## Goal

Delete the genesis MoA panel (`wf-panel.js`: three blind Sonnet proposers plus a Fable
aggregator) and replace it with one proposer — the planning session itself — that reads the
research menus on disk and writes the decision record and ADRs directly. The research fan-out
(`wf-research.js`) is retained; a second perspective on a hard fork is a *partitioned-evidence*
research leg (a different dimension slice), never a second reader of the same brief. The
archetype registry in `genesis.md` shrinks to archetype → dimension keys — no named stacks in
doctrine. Done means: `wf-panel.js`, its `spec-paths` key, and its entrypoints row are gone; no
plugin file names a proposer, aggregator, or panel role; `genesis.md`'s registry table names no
product; the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/workflows/wf-panel.js` is deleted; the `wf-panel` `spec-paths` key and its usage-line token go; the `spec/entrypoints.json` row for it goes (AC-20260825-01-1) | Brief 10 unit A; no shipping harness runs a proposer panel and panel verdicts are <50% reproducible run-to-run (arXiv 2607.27942) |
| D2 | `genesis.md` loses the sections `## Genesis: Session ↔ Workflow Loop (how interactivity mixes with the workflow)`, `## Genesis: The MoA Panel (research-backed; do not "improve" into a debate)`, and `## Genesis: Research-Angle & Role Menus`; one new section `## Genesis: Decision Record (one proposer)` replaces them, stating: the session is the proposer — it reads every `interview-research/{dimension}.json` (plus any partitioned second leg) and writes the decision matrix into the ADRs directly; a hard fork is an `AskUserQuestion` whose options are the menu's conflicting options verbatim with their `tradeoff` as consequence; `## Dissents` carries every non-picked ranked option, every `is_minority` option, and every user-rejected option; a second perspective on a hard fork is one more `wf-research` call over a *different* dimension slice, never a second reader (AC-20260825-01-2) | Deliberation over identical evidence herds (arXiv 2607.01661); partitioned evidence is the only shape that measured gains |
| D3 | The cross-cutting research-angle list (`scope-discipline`, `competitive-teardown`, `accessibility`, the locale bundle) moves into `## Genesis: Discovery Interview`'s woven-loop paragraph as one sentence; brief.md keeps `## Research Angles` and `## Open Dimensions`; `## Panel Roles` is retired from the artifact roster and `panel-results-{stage}.json` is removed from `## Genesis: On-disk Handoff` (AC-20260825-01-2) | wf-research reads `## Research Angles`; nothing reads roles once proposers are gone |
| D4 | `## Genesis: Archetype Registry (the master variable)` keeps its table with columns `Archetype | Hard-to-reverse dimension keys (floor) | Design stage`; the candidate-stacks column is deleted, `rendering strategy` leaves the architect floor (framework-coupled per the 2026-08-24 sweep), and no table cell names a framework, language, runtime, or catalog product — dimension keys are the only vocabulary (AC-20260825-01-3) | core § Rule Enforcement: no plugin file names a specific tool; named stacks in doctrine rot in months (`Remix` already dead) |
| D5 | `genesis-architect.md`: Setup drops `spec-paths wf-panel`; Phase 2 becomes "Derive the dimension set" (research-angle keys + `## Open Dimensions` constrained/open, no role keys, no `runProposers`); Phase 3 becomes "Decide (one proposer)" — the session writes the decision record per D2, asks hard forks, records dissents; Phase A/B/C/D unchanged except the report bullet `Chain:` line; Rules drop the "Never Read wf-panel.js" clause for the panel and keep it for `wf-research.js` (AC-20260825-01-4) | The command holds sequence, the doctrine holds the invariant |
| D6 | `genesis-design.md` legacy mode (no pick on disk) keeps its Phase 1 interview; its Phase 2/3 panel loop collapses to one paragraph: the session decides from the design menus per D2; Setup and Rules drop `wf-panel` (AC-20260825-01-4) | Same invariant, second command |
| D7 | `spec/templates/adr.md`: `Deciders: {user} + session (one proposer over live research)`; the Dissents literal becomes `None: no minority option surfaced for {dimension}.`; `/spec:doctor` check 9 (presence-only) is unchanged [no-ac: template wording; doctor's grep is presence-only and unaffected] | The Dissents section survives the panel — its sources are now menus and user rejections |
| D8 | `spec/doctrine/design.md` § Workflows Encode Shape, Not Judgment: the parenthetical becomes `(and genesis `wf-research.js`)`; `README.md`'s two genesis paragraphs are rewritten to "researches live, one proposer writes the record, every hard fork comes back as a question" — no "panel"/"proposer panel" wording (AC-20260825-01-5) | Every plugin file that names the deleted seat is a stale reference |
| D9 | Regression pins: `spec-paths wf-research` continues to resolve; `spec-paths shared-for genesis-architect` continues to serve `## Host Grounding`; `citations-check.js --root .` continues to print `MISS=0` (AC-20260825-01-6, AC-20260825-01-7) | The collapse must be observed to keep the retained fan-out and the citation surface |
| D10 | Tests: `tests/spec-paths.test.js`'s exhaustive resolve list drops `wf-panel` (in place); `tests/consistency/entrypoints.test.js`'s inventory-glob pin names `spec/workflows/wf-research.js` instead of `wf-panel.js` (the synthetic fixtures at its hooks-direction tests keep their `wf-panel.js` fixture literal — they name no live file); new `tests/consistency/genesis-doctrine.test.js` carries AC-1…AC-6 [no-ac: test-plumbing row; the ACs it carries are listed on their own rows] | Exhaustive live-file pins update in place, never weaken (rules § Gotchas) |
| D11 | New-surface checklist: `plugin.json` bump to next free 7.36.x with a changelog paragraph naming the deleted workflow and the one-proposer rule [no-ac: plugin-version guard] | — |
| D12 | Out of scope, ruled here so brief 08's open question closes: the `/spec:enforce` workflow inversion (`wf-enforce.js` → direct dispatch) is **not** adopted by this series — `wf-enforce.js` is frozen and defect-free; an inversion for symmetry is the accumulation reflex [no-ac: scope ruling] | feedback-holistic-not-additive: measure before mechanizing; no incident names wf-enforce |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/genesis.md | MODIFY | doctrine | D2 section deletions + `## Genesis: Decision Record (one proposer)`; D3 angle sentence + roster edits; D4 registry table |
| spec/commands/genesis-architect.md | MODIFY | doctrine | D5: Setup, Phase 2/3 rewrite, Rules |
| spec/commands/genesis-design.md | MODIFY | doctrine | D6: legacy-mode Phase 2/3 collapse, Setup, Rules |
| spec/templates/adr.md | MODIFY | doctrine | D7 Deciders line + Dissents literal |
| spec/doctrine/design.md | MODIFY | doctrine | D8 one parenthetical |
| spec/bin/spec-paths | MODIFY | scripts | D1: remove `wf-panel)` case + usage token |
| spec/entrypoints.json | MODIFY | scripts | D1: drop the `spec/workflows/wf-panel.js` row |
| README.md | MODIFY | other | D8 two paragraphs |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 version + changelog |
| tests/consistency/genesis-doctrine.test.js | CREATE | tests | AC-20260825-01-1, AC-20260825-01-2, AC-20260825-01-3, AC-20260825-01-4, AC-20260825-01-5, AC-20260825-01-6 |
| tests/spec-paths.test.js | MODIFY | tests | D10: drop `wf-panel` from the resolve-all list (in place) |
| tests/consistency/entrypoints.test.js | MODIFY | tests | D10: inventory-glob pin names `wf-research.js` |
| tests/consistency/citations-check.test.js | MODIFY | tests | AC-20260825-01-7 — tag the existing live-corpus `MISS=0` test |

Orchestrator duty outside the table: `git rm spec/workflows/wf-panel.js` before the scripts
batch runs.

## Contracts

`genesis.md` heading set after this spec (order preserved; `§` citations resolve against these):

```markdown
## Genesis: Discovery Interview (the intake posture)
## Genesis: Decision Record (one proposer)
## Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)
## Genesis: Archetype Registry (the master variable)
## Genesis: Fresh UX Research (method fixed, content researched)
## Genesis: Explore Stage (the taste funnel)
## Genesis: Executed Assumptions (dependency-adjudicated claims never lock by argument)
## Genesis: Enforcement Handoff to the spec pipeline
## Genesis: State Machine
## Genesis: On-disk Handoff (the genesis artifacts)
## Genesis: Dismissed Questions
```

Registry table shape (D4) — rows for the eight existing archetypes, e.g.:

```markdown
| Archetype | Hard-to-reverse dimension keys (floor) | Design stage |
|---|---|---|
| `web-app` | `language-runtime` `framework` `persistence` `auth` `component-library` `hosting` `monorepo-topology` | full |
| `backend-api` | `language-runtime` `framework` `persistence` `auth` `hosting` | skipped |
```

`## Genesis: Decision Record (one proposer)` — the binding sentences (prose may expand, never
contradict):

- The session is the proposer. Input: every `interview-research/{dimension}.json` on disk;
  output: one ADR per hard-to-reverse dimension, `## Options considered` copied from the
  menu's ranked options, `## Decision` the pick, `## Dissents` per D2.
- A hard fork (two menu options within one rank of each other, or a user hesitation signal) is
  an `AskUserQuestion` — options verbatim from the menu, `tradeoff` in each description,
  rank 1 first labeled "(Recommended)" with `why_recommended` as the reason.
- A second perspective is a second `wf-research` call with a **different** `dimensionKeys`
  slice (e.g. `hosting-cost-shape` beside `hosting`); never a second agent reading the same
  brief.

## Behavior

- `/spec:genesis-architect` Phase 3 no longer invokes any workflow; the only workflow the
  command calls is `wf-research` (Phase 1 woven loop, and Phase 3's partitioned second leg).
- A host with a legacy `.claude/genesis/panel-results-*.json` on disk is unaffected: nothing
  reads it; `/spec:doctor` does not audit it.
- `spec-paths wf-panel` exits non-zero with the usage line (same behavior as any unknown key).

## Acceptance Criteria

- **AC-20260825-01-1**: WHEN `spec-paths wf-panel` is invoked THE SYSTEM SHALL exit non-zero
  and print the usage line to stderr, and `spec/workflows/wf-panel.js` SHALL NOT exist, and
  `spec/entrypoints.json` SHALL contain no key `spec/workflows/wf-panel.js` (e.g. `spec-paths
  wf-panel` → exit `1`, stderr matches `/^usage: spec-paths/`) →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-2**: WHEN `spec/doctrine/genesis.md` is read THE SYSTEM SHALL contain the
  `## ` heading `Genesis: Decision Record (one proposer)` and SHALL contain none of the
  literals `wf-panel`, `proposer panel`, `MoA`, `aggregator`, `Panel Roles`, `panel-results`,
  `roleKeys`, `runProposers`, `Session ↔ Workflow Loop` (e.g. a file containing
  `runProposers: false` → red) → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-3**: WHEN the `## Genesis: Archetype Registry` section's table is parsed
  (rows between the section heading and the next `## `) THE SYSTEM SHALL have exactly three
  columns, and no cell SHALL match
  `/Next|Remix|Svelte|Flutter|Expo|Swift|Kotlin|Tauri|Electron|Storybook|Widgetbook|Python|Rust|TypeScript|\bGo\b|\bTS\b|\bRN\b/`
  (e.g. a cell `Next/Remix/SvelteKit + API, TS` → red; a cell `` `framework` `persistence` `` →
  green) → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-4**: WHEN `spec/commands/genesis-architect.md` and
  `spec/commands/genesis-design.md` are read THE SYSTEM SHALL contain none of `wf-panel`,
  `panel-results`, `Panel Roles`, `roleKeys`, `runProposers`, `aggregator`, and each SHALL still
  contain `wf-research` (e.g. architect.md containing `Workflow {scriptPath: <spec-paths
  wf-panel output>}` → red) → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-5**: WHEN `README.md` and `spec/doctrine/design.md` are read THE SYSTEM
  SHALL contain no `wf-panel` and no `proposer panel`/`blind proposer`/`blind-proposer` literal
  (e.g. README line `has a blind proposer panel argue the stack` → red) →
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-6**: WHEN `spec-paths wf-research` and `spec-paths shared-for
  genesis-architect` run THE SYSTEM SHALL CONTINUE TO print an existing path and to emit
  `## Host Grounding` respectively (e.g. `spec-paths wf-research` →
  `<root>/workflows/wf-research.js`, exists) → `tests/consistency/genesis-doctrine.test.js`
- **AC-20260825-01-7**: WHEN `citations-check.js --root .` runs over the live corpus THE
  SYSTEM SHALL CONTINUE TO print `MISS=0` (e.g. stdout matches `/MISS=0/`) →
  `tests/consistency/citations-check.test.js` (existing live-corpus test, tagged)

## Assumptions (escalation triggers)

- A1: No test extracts a function from `wf-panel.js` via `evalFns` (executed 2026-08-25:
  `grep -rn "wf-panel\|capOptions\|assertProposalSurvival" tests --include='*.js'` → only
  `tests/spec-paths.test.js:93` (resolve list) and `tests/consistency/entrypoints.test.js`
  lines 518, 967–989 (one live pin, one synthetic fixture)) — **if false** (another pin
  appears at build): update it in place, retag, never weaken.
- A2: `§ Genesis: Session ↔ Workflow Loop`, `§ Genesis: The MoA Panel`, `§ Genesis:
  Research-Angle & Role Menus` are cited only from the two genesis commands this spec rewrites
  (executed 2026-08-25: `grep -rn "Session ↔ Workflow\|MoA Panel\|Role Menus" spec/ README.md
  docs/canonical` → `genesis-architect.md:12` only besides genesis.md itself) — **if false**:
  `citations-check` (AC-7) names the survivor; edit it in the same build.
- A3: The registry cell regex in AC-3 has no false positive on the surviving vocabulary
  (dimension keys are lowercase-hyphenated; `Go` and `TS` are word-bounded) — **if false** at
  build (a legitimate key trips it): rename the key, never widen the regex.
- A4: Bash `case` matching for the usage refusal (AC-1) is the existing `*)` arm of
  `spec-paths` — unchanged code path, exit 1 with `usage:` on stderr (executed 2026-08-25 on
  the deleted keys from specs/20260824/05: `spec-paths dc-extract` → exit 1, `usage:` line) —
  **if false**: the AC's literal example is wrong; fix the example, not the script.
- A5: No dependency-adjudicated claim is locked by this spec — every mutation is to plugin
  files and tests (`spikes: 0` on the ledger row).

## Rationale

The panel was the last committee after v7 killed the review panel, and every post-July-2026
source the 2026-08-24 sweep found says the same thing: capable models outgrow collaboration,
panel verdicts don't reproduce, and identical-evidence deliberation herds. The one shape that
measured gains — partitioned evidence — is already what `wf-research` does (one agent per
dimension slice); so the collapse deletes the readers and keeps the slices. JJ ruled
2026-08-25 that the proposer is the session itself, not a fresh chat-blind agent: it holds the
user's own words and constraints, and adding a blind second reader later is a one-line change
if a record ever looks anchored by the conversation. The decision record therefore has no
machine artifact of its own — the ADRs *are* the record, and `## Dissents` inherits its
sources from the menus (`is_minority`, non-picked ranks) and the user's rejections.

The registry shrink lands here rather than in the brief's unit D because it is a deletion in
the same file this spec already cuts; the 2026 irreversible dimensions are *added* by the
next sibling as derivations from the coverage answers, not as registry rows — the registry is
the fixed floor, derivation is per-project.

Rejected: a fresh Opus proposer agent (JJ ruling above); keeping `wf-panel.js` with
`runProposers: false` as a "validator" (the aggregator seat reading identical evidence is the
herding shape); folding the `/spec:enforce` inversion into this series (D12 — no incident,
frozen script, symmetry is not a reason).

Retired-literal sweep at lock (by hand, per rules § Gotchas — the closure leg sweeps inherited
literals only): `wf-panel` across `tests/` → the two entrypoints pins (D10) and the resolve
list; `proposer` across `spec/` and `README.md` → genesis.md, both genesis commands, adr.md,
README (all in the File Plan); `panel-results` → genesis.md + both commands. `docs/roadmap/`,
`docs/audit/`, and `specs/` hits are history, waived by location.

Collision-closure at lock (2026-08-25, `--literal wf-panel --literal proposer --literal
panel-results --literal roleKeys`): paths leg `likely` = 3 — `tests/consistency/design-doctrine.test.js`
(reads `design.md` for its own literal ban; D8's one-word edit adds none of its banned words —
**waived**), `tests/consistency/red-fixture-coverage.test.js` and `tests/host-config/config-read.test.js`
(lexical hits on `spec-paths`/`README.md`; neither asserts the `wf-panel` key — **waived**;
the build's whole-suite check adjudicates); literals leg — `docs/adr/0001` (history, the word
"proposer" in a dated ADR), `docs/roadmap/`, `docs/audit/`, `specs/` waived by location;
`tests/consistency/entrypoints.test.js` synthetic fixtures waived (fixture literals, not
live-file assertions); every plugin-file hit is a File Plan row.

### Review dispositions (2026-08-25)

**Fixed — the retired-literal sweep's blind spot.** The lock-time sweep above claimed "every
plugin-file hit is a File Plan row". That was true only of the files the sweep can *see*:
`.claude/spec.config.json`'s `pipelineOwnedPaths` contains `spec/workflows/wf-*.js`, and
`pipelineOwnedGlobs` (`spec/scripts/lib/glob-match.js`) feeds both collision-closure's
`walkForLiterals` prune and scope-reconcile's exclusion set — so `spec/workflows/wf-research.js`
was structurally invisible to both legs despite carrying two of the four swept stems. It kept
`meta.description` = "…the light sibling of wf-panel" (user-visible: it is the `spec:wf-research`
skill description served in every host) and a comment attributing the `is_minority` flag to the
deleted panel. Both cleared. `spec/doctrine/genesis.md` § Genesis: Executed Assumptions likewise
kept live present-tense "panel scrutiny" and past-tense "panel-reviewed"; both re-worded. The
review-fix edit to `wf-research.js` is a **deviation**: the file is a frozen workflow script and
not a File Plan row — sanctioned because this spec's Goal, D2 and D5 name it, recorded here rather
than silently.

**Fixed — the ban list that could not see it.** AC-20260825-01-2's nine patterns all required
"panel" to be adjacent to another word (`proposer panel`, `Panel Roles`, `panel-results`), so a
bare "panel scrutiny" sentence passed a full review green. The list gains `/\bpanel\b/i`, and
AC-20260825-01-5's sweep is extended to `spec/workflows/wf-research.js` under a stricter list
(`wf-panel`, bare `panel`, `proposer`, `aggregator`) — README.md and design.md keep the looser
list because "one proposer" is this spec's intended new vocabulary. Both new checks were tripped
deliberately against mutated copies before landing. Per core § Rule Enforcement this enumerated-file
test is the *only* gate that can see `wf-research.js`; the comment above the block says so, so a
later reader does not simplify it away. The three duplicated banned-literal loops (§ Review Checks:
three near-identical blocks is a finding) collapse to one file-local helper — deliberately not
promoted to `tests/helpers.js`, which would widen the shared surface for a single consumer whose
only sibling (`design-doctrine.test.js`) uses a different assertion shape.

**Waived — scope-reconcile `outOfPlan` = 8 (JJ, 2026-08-25).** `docs/roadmap/00-overview.md`,
`docs/roadmap/10a-genesis-tournament-conventions.md`, `spec/commands/escape.md`,
`spec/commands/review.md`, `spec/scripts/prose-cap.js`, `spec/scripts/spec-review-driver.js`,
`tests/prose-debt/prose-cap.test.js`, `tests/review/review-driver.test.js`. All eight trace to two
commits that landed on `main` *after* this spec's build commit `9799365` — `c972c38` (the plan
commit for specs/20260825/02–04) and `89f1d41` (the prose-cap ratchet build); `git log
47eb2cb..HEAD` shows only those three commits, so `diff_base` is the true pre-image and needs no
correction. This spec's own commit touched exactly its File Plan. Narrowing the leg to the build
commit was considered and **rejected**: `scope-reconcile.js`'s header records the whole-changed-set
design as the fix for a confirmed escape (an out-of-plan edit rode a CLEAN because review diffed
only planned directories), so scoping to one commit reopens that hole. The real lesson is timing —
review promptly after build, or build in the worktree flow.

**Agent-memory disposal (close, 2026-08-25).** Sweep surfaced five notes; all **carried** with
`reviewed: 2026-08-25`, one corrected. Carried: `plugin-tests/banned-literal-loop-dedup-and-blind-spot-sweep`
(new this dispatch — the helper-locality bar and the `pipelineOwnedPaths` blind spot, both verified
here), `doctrine-author/repo_naming_shared_vs_core` (re-verified: `spec/doctrine/` holds
core/design/genesis/replay-corpus, no `shared.md`), `doctrine-author/feedback_pinned_sentence_hardwrap`,
`plugin-tests/git-committer-date-iso-z-roundtrips`. **Corrected:**
`plugin-tests/scope-reconcile-degenerate-stems` — its `gitRepo()` seed claim re-verified against
`tests/helpers.js`, but its mutation-proof recipe (copy the script to `<name>.mutant.js` *beside the
original* and sed-swap the tracked test's `SCRIPT` const) can strand a stray mutant or a swapped
pointer if the run dies mid-way; the note now leads with the scratchpad variant this review used
instead, and keeps the in-tree recipe only for tests whose `SCRIPT` indirection cannot be extracted.

**Not adopted (open question for JJ, not a finding).** `pipelineOwnedPaths`'s
`spec/workflows/wf-*.js` entry makes an out-of-plan edit to a frozen workflow script invisible to
review's reconcile leg as well as to collision-closure — which sits oddly beside the frozen-scripts
rule that such files are edited only under a spec that names them. Widening or splitting that glob
is a config-policy change with its own blast radius; it is recorded here and in
`docs/canonical/genesis.md` rather than patched inside this review.

## Canonical Delta

Create `docs/canonical/genesis.md` with a first section *Decision record (one proposer)*:
*Since specs/20260825/01 the genesis architect and design stages have no proposer panel.
`wf-research.js` (one Sonnet agent per dimension slice, web-enabled) builds ranked option
menus on disk; the planning session is the proposer — it reads the menus and writes the ADRs
directly. A second perspective on a hard fork is a second research call over a different
dimension slice, never a second reader of the same brief. `wf-panel.js`, its `spec-paths` key,
`## Panel Roles`, and `panel-results-*.json` are retired. The archetype registry names
dimension keys only — no framework, language, runtime, or catalog product appears in doctrine.*
