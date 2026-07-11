---
description: Author and harden a spec in one Fable session — explore, draft, adversarial check, lock
argument-hint: <feature description | spec path> [--spike]
---

# Spec Plan: Author + Harden (Fable)

One session: explore → draft → adversarial check → lock. Produces a hardened spec at
`specs/YYYYMMDD/##-{name}.md`.

**Intended model: Fable** (Opus fallback if unavailable — see shared § Model Placement). This is the pipeline's judgment concentration point; spec quality
determines all downstream spend. Execution and review never use Fable as the primary model.

**Setup (before Phase 0):** run `spec-paths shared-for plan` and read its output — the shared invariants scoped to this command
(tier rubric, state machine, MCP policy). Then read the host's `.claude/spec.config.json` and
the pipeline rules file it points to (`pipelineRules`). If either is missing, STOP: tell the
user to run `/spec:init` first.

## Input

`$ARGUMENTS` — a feature description, or a path to an existing draft spec to re-open.
`--spike` forces the worktree spike in Phase 1.5.

## Phase 0 — Context check & tier

1. **Harvest or discover.** If this conversation already contains a design discussion of the
   target: summarize what has converged (scope, key decisions, open questions), confirm the
   summary with the user, and skip to Phase 1.5/2. If invoked cold: run Phase 1 discovery. If a
   `claude.ai/design` mockup URL surfaces here (or anywhere in planning), note it — it is
   recorded into the spec's `design_source:` frontmatter at the Set-`design:` step below.
2. **Apply the tier rubric** (shared invariants § Risk Tiers; concrete T3 triggers in the
   host's pipeline rules § Risk Tiers).
   - **T1** → STOP: "This is T1-shaped — no spec needed. Just ask me to do it; the host's
     gate command gates it and the change diffs against the host's standards docs." Do not
     write a spec file.
   - **T2/T3** → state the tier and the one-line rubric justification, proceed.

## Phase 1 — Discovery (cold start only)

- Launch parallel `Explore` agents (`model: haiku`, `sonnet` for multi-file reasoning) over the
  affected areas and `docs/canonical/{area}.md` if present. Ground every claim in current code —
  including any generated contract surfaces the host's pipeline rules name.
- Run the pre-emptive lookups the host's pipeline rules § Planning declares (UI registry
  searches, Context7 for every third-party API the spec will rely on). Workers return digests;
  the excerpts that matter get embedded into the spec's UI/Contracts sections. Downstream
  workers never query MCPs.
- UI-bearing spec in a design-capable host: read the design doctrine doc (config
  `design.doctrine` — shared invariants § Design Stage) before writing the UI section; the
  component inventory must fit the canon, and reusing existing catalog components beats
  speccing new ones.
- Then interview the user via `AskUserQuestion` with informed options — never ask in a vacuum,
  never ask what the codebase can answer. Batch questions, and weight them toward whatever
  would reshape the architecture — data models, type interfaces, UX flows — over what only
  tunes a detail: an unasked detail costs a small edit later, an unasked architecture question
  costs a rebuild.

## Phase 1.5 — Spike (when `--spike`, or judged necessary)

Run whenever the interview or drafting surfaces a genuinely high-unknown area — an unfamiliar
API, an unclear data model, a risky integration surface, blast radius that's genuinely unclear
in brownfield code, or a complex migration. Skip for greenfield and well-understood changes.
Reason: a throwaway prototype is the cheapest way to find out what you didn't know, before it
gets expensive — cheap now, versus a wrong assumption baked into a locked spec, versus a
surprise mid-build. In design-capable hosts (config `design` block), if the unknown is
**visual** (layout, interaction feel), don't spike — set `design: true` and let `/spec:design`
iterate on real components in the catalog instead.

- One `Agent`: `subagent_type: general-purpose`, `model: sonnet`, `isolation: worktree`
  (REQUIRED — without it the spike pollutes the working tree).
- Prompt: a throwaway implementation scoped to the specific unknown question — answer it
  empirically, don't build the feature. No tests, no polish. First action: the host's
  `setupCommand` (from config). Report back: files touched, unexpected discoveries, design
  forks hit, cross-area impact, state/data migration needed, typecheck/lint output — plus any
  report items the host's pipeline rules § Planning adds. Never merge, never push; the
  worktree is discarded — only the findings survive.
- Fold findings into the spec's **Assumptions**, **Decisions**, and **Acceptance Criteria**
  sections as evidence (what was actually observed, not just a conclusion). Set
  `spiked: YYYY-MM-DD` in frontmatter.

## Phase 2 — Draft

Write the spec per the plugin template (run `spec-paths template` and Read it) at
`specs/{YYYYMMDD}/{##}-{kebab-name}.md` (today's date dir, next free `##`; create the dir if
needed). `status: draft`.

While drafting:

- **Blind-spot pass:** somewhere before lock, deliberately hunt the territory the spec's
  current framing doesn't cover — codebase conventions, runtime constraints, adjacent call
  sites or surfaces it hasn't mentioned. This is not the Phase 3 adversarial check, which
  attacks what's already written; this hunts what isn't written yet. A single `Explore`
  dispatch framed as "what does this spec's current scope miss?", or a focused self-pass over
  the affected areas, is cheap — far cheaper than the surprise that shows up mid-build.
- **Decomposition gate:** a spec must fit one `/spec:build` run — roughly ≤15 File Plan rows,
  one primary area, plus any host-declared caps (pipeline rules § Planning). Bigger work is
  not a bigger spec: split into `##-` siblings in the same date dir, sliced by **landing
  unit** (each spec leaves the system green and shippable on its own), never by layer. Wire
  `depends_on`/`depended_on_by` and harden each; one planning session may produce the whole series.
- **Set `design:`** — only in hosts whose config declares a `design` block (component
  catalog — shared invariants § Design Stage). There: `true` for any spec with a UI section
  whose look/feel the user should approve before build; `false` for logic-only or
  trivially-styled changes; confirm with the user when borderline. In hosts without a
  catalog, never set the flag (omit it or leave `false`). **If the planning conversation
  surfaced a `claude.ai/design` mockup URL** for this spec, also record it into frontmatter as
  `design_source: <url>` alongside `design: true` — plan only records the pointer (it never
  fetches); `/spec:design` makes it read-first canon (shared § "Claude Design as a source").
- **Never guess — mark it.** Where the draft needs information you don't have (an unconfirmed
  behavior, an unknown constraint, a fork you haven't put to the user yet), write
  `[NEEDS CLARIFICATION: <the question>]` inline at that spot instead of writing something
  plausible. Markers are resolved in Phase 4 via `AskUserQuestion` or further exploration;
  the state-gate hook blocks `/spec:design`, `/spec:build`, and `/spec:review` while any
  marker survives in the file.
- **AC shape:** write every AC as `WHEN {trigger/state} THE SYSTEM SHALL {observable
  response}`, and pin every ambiguity-prone term (rounding mode, ordering,
  inclusive/exclusive bounds, timezone, null vs empty) with a literal input → output example.
  T3 ACs always carry at least one literal example. Test authors derive tests from the spec
  alone — a concrete pair is the only wording they cannot misread.
- Run your own pre-mortem (plausible failure modes worked backwards) and over-engineering check
  (counterfactual test + broken-vs-ugly test) — these are part of drafting, not separate passes.
- Every genuine design fork → `AskUserQuestion` **now**, with options grounded in exploration.
  Record the outcome in the **Decisions** table. The spec must leave this session with zero
  open forks.
- Fill **Assumptions** with every load-bearing assumption paired with its `if false →` fallback.
  This section is the consultant's cold-start map during `/spec:build` — it is the cheapest
  place to buy execution robustness.
- File Plan `Layer` values: the host's `layerGroups` (flattened, in order) plus `tests` and
  `other`.

### New product surfaces

A new feature/domain/module is a normal spec — usually a decomposed `depends_on` series —
with no separate pipeline. The planning session must additionally run the host's new-surface
checklist (pipeline rules § Planning): requirements interview, data-shape design, cross-area
contract mapping, UI inventory where applicable, and the registration/wiring rows the host's
structure demands in the File Plan.

## Phase 3 — Adversarial check

Dispatch N independent refuters (T2: 1, T3: 2) in a single message, blind to each other:

- `subagent_type: general-purpose`, `model: sonnet`
- Prompt: the spec content inlined cold (the document only — no drafting rationale beyond what
  it contains) and the path to the host's pipeline rules file, plus: *"Try to break this spec
  against the live codebase: stale file/symbol references, wrong types/signatures or
  nullability vs the actual code and generated contracts, missed call sites,
  architectural-boundary violations, persisted-state or migration coexistence problems, stale
  embedded library references vs installed versions, edge cases at boundaries, and conflicts
  with the host's pipeline rules (Read the rules file; cite the section). Read the code; cite
  file:line. Report every genuine defect, ordered by severity. Do not pad with style or
  speculative nits — an empty list is a valid outcome."*

Fix each finding in the spec, or explicitly reject it with the reason recorded in **Rationale**.
Never silently drop a finding.

## Phase 4 — Lock

1. **Marker sweep (mechanical):** `grep -n "NEEDS CLARIFICATION" {spec path}`. Each hit is
   either an unresolved gap — resolve it (`AskUserQuestion` or targeted exploration), edit the
   spec, re-grep — or prose narrating history, which is fine. Resolving a marker means
   **deleting it** and recording the ruling in Decisions; never quote the full
   `[NEEDS CLARIFICATION: …]` colon form in prose — that exact syntax is the open-marker
   sentinel the downstream state-gate hook greps for.
2. Confirm: zero open forks, **Rationale** and **Canonical Delta** written, ACs mapped to test files.
3. Flip frontmatter `status: draft → hardened`.
4. Report: spec path, tier, `design:` value (design-capable hosts), `design_source` if recorded,
   decision count, assumption count, spike run or skipped, refuter findings fixed/rejected. Next:
   `/spec:design {path}` if `design: true`, else `/spec:build {path}`.

## Rules

- Genuine forks go to the user — never silently decided, at any phase.
- The spec must be executable by an orchestrator that was not in this conversation. If a
  section relies on unstated context, write it down (that's what Rationale is for).
- T1 work never gets a spec file.
- `AskUserQuestion` dismissed → STOP the run; never invent the answer.
