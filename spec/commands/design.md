---
description: Optional UI design stage — stateless components + catalog entries, user iterates in the host's component catalog (Storybook, Widgetbook, …), spec reconciled to the approved design
argument-hint: <spec path>
---

# Spec Design: Component-Catalog Iteration

For UI-bearing specs (`design: true`) in hosts whose `.claude/spec.config.json` declares a
`design` block — a component catalog such as Storybook (web) or Widgetbook (Flutter); see
shared invariants § Design Stage for the block's shape and the legacy-key mapping. Sits
between `/spec:plan` and `/spec:build`: builds the foundation files and **real, kept**
stateless components + catalog entries, lets the user actively iterate on the design in the
running catalog, then reconciles the spec to the approved design and sets
`designed: YYYY-MM-DD`. Build later treats these components as done inputs — UI rendering is
gated here by the catalog + the user's eyes, not by TDD.

**Orchestrator: Opus (Sonnet acceptable for small specs). Workers: Sonnet.** This command is
interactive by design — the user drives the iteration loop.

**Setup:** run `spec-paths shared` and Read that file (shared invariants). Read the host's
`.claude/spec.config.json` and its pipeline rules file. If the host config declares no
`design` block (nor legacy `storybook: true`), STOP — this stage does not apply to this repo.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced). If `design: false`,
confirm intent before proceeding.

**Re-entrant:** all state lives on disk (foundation files, components, stories, the spec). A
session can stop after any approved round; re-invoking inventories what exists and continues.

## Phase 0 — Preflight

1. Frontmatter gate: `status: hardened`. `designed:` already set → this is a re-design; confirm
   with the user, then proceed (the same reconcile rules apply).
2. Read the spec once: **UI** section (component inventory + embedded Component API
   References), **Contracts**, **Decisions**, File Plan `foundation` + UI-layer rows. Inline
   excerpts into worker prompts — workers don't re-read the spec.
3. Inventory what already exists on disk; skip done work.

## Phase 1 — Foundation (only missing files)

Dispatch in dependency order, parallel where independent — types/constants → schemas ∥ mock
data — using the host's `agentMap` kinds (e.g. `types`, `forms`, `mocks`), all
`model: sonnet`. Mock data must cover **every UI state the spec lists** — empty, loading,
error, and edge content (long strings, extreme values in the host's domain types).

Gate: the host's typecheck (first segment of `gateCommand`, or as pipeline rules § Build
defines). Checkpoint-commit when green.

## Phase 2 — Components + stories

- One worker per component cluster from the spec's UI section, routed via the host's
  `agentMap` (e.g. `forms` for form dialogs, `tables` for tables, `components` for the rest);
  `stories`-kind workers write catalog entries per cluster in the host's story format
  (config `design.storyFormat` — e.g. CSF3 stories for Storybook, `@UseCase` builders for
  Widgetbook; same dispatch message where independent). All `model: sonnet`, spec excerpts
  inlined.
- **Stateless discipline:** props + mock data only — no data-layer imports, no
  state-management/store imports, no router/navigation access. Wiring is `/spec:build`'s job.
  Catalog entries must render every state the spec lists.
- Workers inherit the pipeline hard rules (read-only surfaces, git ban, blocked protocol —
  shared invariants + pipeline rules § Worker Rules). New third-party UI primitives are added
  by the **orchestrator** via the host's sanctioned tool (pipeline rules § Worker Rules),
  never by workers editing managed surfaces.
- Gate: host typecheck + lint. Checkpoint-commit when green.

## Phase 3 — Iteration loop (user-driven)

1. Tell the user: run the host's catalog command (`design.command` in config), and list the
   catalog entry paths (stories / use-cases) to review.
2. `AskUserQuestion`: **Approve** / **Iterate** (notes via Other). Dismissed → STOP — state is
   safely on disk; re-invoke to continue.
3. **Iterate:** translate the notes into per-cluster change lists; dispatch fresh Sonnet
   workers (the orchestrator holds notes + receipts only — component file contents never enter
   its context). Gate + checkpoint-commit per round. No round cap; every round ends green.
4. A note that demands a **data-shape change** or contradicts a locked Decision is not a
   visual tweak — resolve it now via `AskUserQuestion`, record the ruling in **Decisions**,
   then apply it to foundation + components in the same round.

## Phase 4 — Reconcile & mark

1. One Sonnet worker updates the spec to match approved reality: **UI** section (final
   component APIs and states), **File Plan** (actual component/story files; CREATE rows that
   landed here stay listed — build will see them on disk and skip), **Contracts** for any
   shape changes, with new **Decisions** rows for rulings made in Phase 3.
2. Set `designed: YYYY-MM-DD` in frontmatter. `status` stays `hardened`.
3. Final checkpoint-commit. Report: components/stories landed (paths), iteration rounds, spec
   deltas, decisions added. Next: `/spec:build $ARGUMENTS`.

## Rules

- Components built here are **real and kept** — never throwaway. `/spec:build` skips their
  creation and only wires them.
- Design changes propagate **forward into the spec now** — never left for build to discover.
- The orchestrator never reads component files; it routes notes and validates receipts.
- Workers never run git; the orchestrator owns checkpoint-commits after each green round.
- `AskUserQuestion` dismissed → STOP.
