---
date: { YYYY-MM-DD }
status: draft            # draft → hardened → implementing → done (hook-enforced); to retire a preserved spec: superseded (terminal — drops out of /spec:status silently; optional superseded_by: <what replaced it> is free-form provenance)
risk: T2                 # T2 | T3 per tier rubric (plugin shared invariants + host pipeline rules). T1 work gets no spec.
area: { area-name }      # primary feature/domain/module; "cross-cutting" if none
design: false            # design-capable hosts only (config design block): true → /spec:design gates before /spec:build
breaking: false
depends_on: []
depended_on_by: []
# brief: NN              # roadmap-planned specs only: the docs/roadmap/NN-*.md brief this spec hydrates; /spec:status (and /spec:doctor check 14) derive roadmap status from this stamp
# spiked: YYYY-MM-DD     # only if a spike ran during /spec:plan
# designed: YYYY-MM-DD   # set by /spec:design on user approval (design-capable hosts)
# design_source: https://claude.ai/design/p/<id>?file=<Name>.dc.html  # optional, single path/URL: Claude Design mockup or local bundle dir, made read-first binding canon by /spec:design
# build_base: <branch>   # set by /git:enter-worktree; read by /spec:review as the merge-back target
# diff_base: <sha>       # set by /spec:build for in-place builds; read by /spec:review as the diff base when build_base is absent
# The host's pipeline rules may declare extra flags (e.g. migration: true) — include them when they apply.
# While drafting: never guess — write [NEEDS CLARIFICATION: question] inline where information
# is missing. Lock requires zero markers; the state gate blocks downstream commands on any survivor.
# open_markers: 0          # written at lock by /spec:plan — the count of LIVE markers after
#                          # adjudication (quoted narration doesn't count). When present, the
#                          # state gate reads THIS, not a prose grep — so describing the marker
#                          # syntax in Rationale can't false-trip the gate.
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
| { test path } | CREATE | tests | AC-{YYYYMMDD-NN}-1, AC-{YYYYMMDD-NN}-2 |

## Contracts

{ New/changed types, schemas, commands/events, store shapes, query keys, public DTOs — as
  code blocks. Source of truth for the foundation batch. Where the repo has generated
  contract surfaces, cite the generated names used. Omit section if no contract changes. }

## UI

{ Screens, components, dialogs; their props and states (empty / loading / error / edge).
  Embed Component API References here — registry + library excerpts gathered at plan time.
  In /spec:design this section is the component inventory the skeleton-author reads; the
  authoring plan itself is ALWAYS the on-disk skeletons.json (mockup path and no-mockup path
  alike), and Phase 4 reconciles this section to the approved design (final APIs + states).
  Sonnet workers (and /spec:build) build from the spec + skeletons and never query MCPs.
  Omit section if no UI changes (then design: false). }

## Data Model

{ Persistence changes: tables/columns, constraints, indexes, state shapes, migrations. State
  explicitly whether existing rows/persisted state are affected. Omit if none. }

## Behavior

{ Interaction flows, handler/store transitions, edge cases. Free-form — prose, tables,
  whatever the problem needs. This is the one deliberately unstructured section. }

## Acceptance Criteria

<!-- Every AC maps to a test. AC-IDs are NAMESPACED with the spec id — AC-{YYYYMMDD-NN}-1
     where YYYYMMDD is the date dir and NN the spec number — so the review grep matrix never
     collides across two specs touching one test file. Reference the AC-ID per the host's
     convention (test name, comment, or docstring — pipeline rules § Test Rules). Hosts with
     a driftScript get it checked mechanically; hosts without get /spec:review's mechanical
     grep matrix (an AC-ID with no test hit is a hard finding — and the matrix counts
     EXECUTED tests: a skipped test is a hard finding too, unless the AC carries an explicit
     env gate). An AC whose test legitimately needs an environment declares it inline:
     `[env: TEST_DATABASE_URL]` — then a skip reports as a warning naming that environment
     instead of a hard finding; never leave an env dependency undeclared. An AC whose honest
     oracle is a non-test gate leg (e.g. the typecheck/gate leg itself) declares
     `[oracle: <manifest leg>]` — a leg name from the evidence manifest's closed set (`gate`,
     `smoke`, `drift`, `ci`, …), sibling syntax to `[env:]`, never free-form command text (no
     manifest row means no mechanical redness check, which would make the tag a coverage-
     laundering route). A declared oracle covers the AC by declaration in review's matrix; a
     red or absent oracle leg is a hard finding, identical in standing to an uncovered AC. One
     oracle per AC; an AC never carries both a test mapping and an `[oracle:]` tag. A Decision that
     promises a user-observable surface owes at least one AC whose test asserts on the
     observable itself, reached through the real in-repo route, fed by a fixture that is
     **produced** — the test executes the spec's own producer chain (view-model, assembler,
     defer-derivation) on realistic wire data, never a hand-authored props object (naming the
     anti-pattern: **invented-fixture liveness** — a terminal fed hand-typed props proves the
     component works, never that the product reaches it). In design-capable hosts, pure-UI
     **appearance** is exempt from TDD (the component catalog covers it) — **reachability is
     never exempt**: a prop or field whose absence collapses a promised observable is behavior
     and owes an AC per the terminal-observable rule. ACs here are behavior, not pixels.
     Shape: WHEN {trigger/state} THE SYSTEM SHALL {observable response}. Wherever a term can
     be read two ways (rounding mode, ordering, inclusive/exclusive bounds, timezone, null vs
     empty), pin it with a literal input → output example — test authors derive tests from
     this spec alone, and a concrete pair is the only wording they cannot misread. T3 ACs
     always carry at least one literal example. Defect-fix/behavior-change specs carry a
     regression pin per behavior that must survive: WHEN {trigger} THE SYSTEM SHALL
     CONTINUE TO {existing behavior} — literal marker, never paraphrased. Pin tests are
     expected GREEN against pre-change code (the sanctioned exception to red-first);
     prefer tagging the existing covering test with the AC-ID over duplicating it. -->

- **AC-{YYYYMMDD-NN}-1**: WHEN { trigger/state } THE SYSTEM SHALL { observable response }
  (e.g. `{ literal input }` → `{ literal output }`) → { test reference } in { test file }
- **AC-{YYYYMMDD-NN}-2** `[env: { VAR }]` (only when the test is environment-gated): …
- **AC-{YYYYMMDD-NN}-3** `[oracle: { manifest leg, e.g. gate }]` (only when no test is the
  right oracle — the named leg is): …

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and the retainer starts HERE. Pair every assumption with its fallback. -->

- A1: { assumption } — **if false:** { pre-thought fallback, or "STOP, ask the user" }

## Rationale

{ Why each D-decision fell the way it did; alternatives rejected and why; what is
  fragile and what to watch during execution. Written for a cold-start consultant
  who was not in the planning conversation. ~150–300 words. Adversarial-check
  findings that were rejected (not fixed) are recorded here with the rejection reason. }

## Canonical Delta

{ What sections of docs/canonical/{area}.md change when this lands. Applied
  verbatim by /spec:review on CLEAN. Written as ready-to-merge prose, not a diff. }
