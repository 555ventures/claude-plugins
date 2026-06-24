---
date: { YYYY-MM-DD }
status: draft            # draft → hardened → implementing → done (hook-enforced)
risk: T2                 # T2 | T3 per tier rubric (plugin shared invariants + host pipeline rules). T1 work gets no spec.
area: { area-name }      # primary feature/domain/module; "cross-cutting" if none
design: false            # design-capable hosts only (config design block): true → /spec:design gates before /spec:build
breaking: false
depends_on: []
depended_on_by: []
# spiked: YYYY-MM-DD     # only if a spike ran during /spec:plan
# designed: YYYY-MM-DD   # set by /spec:design on user approval (design-capable hosts)
# design_source: https://claude.ai/design/p/<id>?file=<Name>.dc.html  # optional: Claude Design mockup, made read-first binding canon by /spec:design
# build_base: <branch>   # set by /git:enter-worktree; read by /spec:review as the merge-back target
# The host's pipeline rules may declare extra flags (e.g. migration: true) — include them when they apply.
# While drafting: never guess — write [NEEDS CLARIFICATION: question] inline where information
# is missing. Lock requires zero markers; the state gate blocks downstream commands on any survivor.
---

# { Title }

## Goal

{ 2–4 sentences: what changes, why, and what "done" means. No implementation detail. }

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | { choice } | { why; rejected alternative named — full story in Rationale } |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| { path } | MODIFY | foundation | { what } |
| { test path } | CREATE | tests | AC-1, AC-2 |

## Contracts

{ New/changed types, schemas, commands/events, store shapes, query keys, public DTOs — as
  code blocks. Source of truth for the foundation batch. Where the repo has generated
  contract surfaces, cite the generated names used. Omit section if no contract changes. }

## UI

{ Screens, components, dialogs; their props and states (empty / loading / error / edge).
  Embed Component API References here — registry + library excerpts gathered at plan time.
  /spec:design enriches this section before build into the authoring plan: per surface a
  prop-type table, per-surface token assignments (role names; new roles flagged), the states to
  render, and one-line interaction/voice notes. Sonnet workers (and /spec:build) build from THIS
  enriched section and never query MCPs. (On the mockup path — design_source set — the design
  digest is the plan instead; this section is reconciled to match.) Omit section if no UI
  changes (then design: false). }

## Data Model

{ Persistence changes: tables/columns, constraints, indexes, state shapes, migrations. State
  explicitly whether existing rows/persisted state are affected. Omit if none. }

## Behavior

{ Interaction flows, handler/store transitions, edge cases. Free-form — prose, tables,
  whatever the problem needs. This is the one deliberately unstructured section. }

## Acceptance Criteria

<!-- Every AC maps to a test. Reference the AC-ID per the host's convention (test name,
     comment, or docstring — pipeline rules § Test Rules). Hosts with a driftScript get it
     checked mechanically; hosts without get /spec:review's mechanical grep matrix (an AC-ID
     with no test hit is a hard finding). In design-capable hosts, pure-UI rendering is exempt
     from TDD (the component catalog covers it) — ACs here are behavior, not pixels.
     Shape: WHEN {trigger/state} THE SYSTEM SHALL {observable response}. Wherever a term can
     be read two ways (rounding mode, ordering, inclusive/exclusive bounds, timezone, null vs
     empty), pin it with a literal input → output example — test authors derive tests from
     this spec alone, and a concrete pair is the only wording they cannot misread. T3 ACs
     always carry at least one literal example. -->

- **AC-1**: WHEN { trigger/state } THE SYSTEM SHALL { observable response }
  (e.g. `{ literal input }` → `{ literal output }`) → { test reference } in { test file }
- **AC-2**: …

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and the Fable consultant starts HERE. Pair every assumption with its fallback. -->

- A1: { assumption } — **if false:** { pre-thought fallback, or "STOP, ask the user" }

## Rationale

{ Why each D-decision fell the way it did; alternatives rejected and why; what is
  fragile and what to watch during execution. Written for a cold-start consultant
  who was not in the planning conversation. ~150–300 words. Adversarial-check
  findings that were rejected (not fixed) are recorded here with the rejection reason. }

## Canonical Delta

{ What sections of docs/canonical/{area}.md change when this lands. Applied
  verbatim by /spec:review on CLEAN. Written as ready-to-merge prose, not a diff. }
