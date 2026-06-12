---
date: { YYYY-MM-DD }
status: draft            # draft → hardened → implementing → done (hook-enforced)
risk: T2                 # T2 | T3 per tier rubric (plugin shared invariants + host pipeline rules). T1 work gets no spec.
area: { area-name }      # primary feature/domain/module; "cross-cutting" if none
storybook: false         # Storybook hosts only: true → /spec:design gates before /spec:build
breaking: false
depends_on: []
depended_on_by: []
# spiked: YYYY-MM-DD     # only if a spike ran during /spec:plan
# designed: YYYY-MM-DD   # set by /spec:design on user approval (Storybook hosts)
# The host's pipeline rules may declare extra flags (e.g. migration: true) — include them when they apply.
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
  /spec:design and /spec:build workers build from THIS section and never query MCPs.
  Omit section if no UI changes (then storybook: false). }

## Data Model

{ Persistence changes: tables/columns, constraints, indexes, state shapes, migrations. State
  explicitly whether existing rows/persisted state are affected. Omit if none. }

## Behavior

{ Interaction flows, handler/store transitions, edge cases. Free-form — prose, tables,
  whatever the problem needs. This is the one deliberately unstructured section. }

## Acceptance Criteria

<!-- Every AC maps to a test. Reference the AC-ID per the host's convention (test name,
     comment, or docstring — pipeline rules § Test Rules). Hosts with a driftScript get it
     checked mechanically; hosts without rely on /spec:review's coverage check (a missing
     test is a hard finding). In Storybook hosts, pure-UI rendering is exempt from TDD
     (Storybook covers it) — ACs here are behavior, not pixels. -->

- **AC-1**: { observable behavior } → { test reference } in { test file }
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
