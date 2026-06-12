---
description: Optional UI design stage — a Fable designer session builds the design inside the host's design doctrine, the user iterates in the component catalog, spec reconciled to the approved design
argument-hint: <spec path>
---

# Spec Design: Designer Session + Catalog Iteration

For UI-bearing specs (`design: true`) in hosts whose `.claude/spec.config.json` declares a
`design` block — a component catalog such as Storybook (web) or Widgetbook (Flutter); see
shared invariants § Design Stage for the block's shape and the legacy-key mapping. Sits
between `/spec:plan` and `/spec:build`: builds the foundation files and **real, kept**
stateless components + catalog entries, lets the user actively iterate on the design in the
running catalog, then reconciles the spec to the approved design and sets
`designed: YYYY-MM-DD`. Build later treats these components as done inputs — UI rendering is
gated here by the catalog + the user's eyes, not by TDD.

**Intended model: Fable.** This is the pipeline's stated exception to "Sonnet works" (shared
invariants § Model Placement): in this stage taste IS the work, so the designer session reads
and writes component files itself — the build-stage rule that the orchestrator never holds
file contents does not apply here. Sonnet is dispatched only for plumbing: foundation files,
catalog entries, the Phase 4 spec reconcile. Coherence beats parallelism: components are
authored in groups that share visual context, never maximally fanned out.

**Setup:** run `spec-paths shared` and Read that file (shared invariants). Read the host's
`.claude/spec.config.json` and its pipeline rules file. If the host config declares no
`design` block (nor legacy `storybook: true`), STOP — this stage does not apply to this repo.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced). If `design: false`,
confirm intent before proceeding.

**Re-entrant:** all state lives on disk (foundation files, components, catalog entries, the
doctrine, the spec). A session can stop after any approved round; re-invoking inventories
what exists and continues.

## Phase 0 — Preflight

1. Frontmatter gate: `status: hardened`. `designed:` already set → this is a re-design;
   confirm with the user, then proceed (the same reconcile rules apply).
2. Read the binding canon, in precedence order:
   - **Token/theme files** (paths named in the doctrine doc) — the design language as code.
   - **The design doctrine doc** (config `design.doctrine`) — taste rulings tokens can't
     encode. Binding like a locked Decision. Missing (pre-doctrine host)? Bootstrap it now
     per `/spec:init` § Design foundation before continuing, and add the config key.
   - **The spec**: UI section (component inventory + embedded Component API References),
     Contracts, Decisions, File Plan `foundation` + UI-layer rows.
3. Inventory the existing catalog. **Reuse gate:** for each component the spec plans, check
   whether an existing component (or a variant of it) serves; prefer extending over creating.
   A reuse that changes the spec's component inventory is reconciled in Phase 4.
4. Inventory what already exists on disk; skip done work.

## Phase 1 — Foundation (only missing files)

Dispatch Sonnet workers in dependency order, parallel where independent — types/constants →
schemas ∥ mock data — using the host's `agentMap` kinds (e.g. `types`, `forms`, `mocks`).
Mock data must cover **every UI state the spec lists** — empty, loading, error, and edge
content (long strings, extreme values in the host's domain types). Tokens a planned surface
needs are added to the token files by the **designer** (not a worker) — extend the scale,
never fork it.

Gate: the host's typecheck (first segment of `gateCommand`, or as pipeline rules § Build
defines). Checkpoint-commit when green.

## Phase 2 — Design

The designer authors the components — directly for small inventories, or as Fable dispatches
per **coherence group** (surfaces that must agree visually, e.g. all table-adjacent
components together) with the doctrine + relevant tokens + spec excerpts inlined.

- **Stateless discipline:** props + mock data only — no data-layer imports, no
  state-management/store imports, no router/navigation access. Wiring is `/spec:build`'s job.
- **Catalog entries:** Sonnet `stories`-kind workers write entries in the host's story format
  (config `design.storyFormat`), rendering every state the spec lists. Also extend the
  **living showcase entry** (path named in the doctrine doc) so the new surfaces sit next to
  existing ones — it is the cross-spec drift detector, reviewed first in Phase 3.
- New third-party UI primitives are added by the **designer** via the host's sanctioned tool
  (pipeline rules § Worker Rules), never by workers editing managed surfaces.
- Workers inherit the pipeline hard rules (read-only surfaces, git ban, blocked protocol —
  shared invariants + pipeline rules § Worker Rules).

Gate: host typecheck + lint. Checkpoint-commit when green.

## Phase 2.5 — Self-review (only if `design.screenshot` is configured)

If the config's `design` block declares a `screenshot` command (renders catalog entries to
image files), run it, Read the renders, and do **one** self-critique round before involving
the user: alignment, contrast, spacing rhythm, the empty/error/long-string states, showcase
coherence. Fix, re-gate, checkpoint-commit. One round — the user's eyes are the real gate;
this only raises the floor they start from. No `screenshot` key → skip silently.

## Phase 3 — Iteration loop (user-driven)

1. Tell the user: run the host's catalog command (`design.command` in config), and list the
   catalog entry paths to review — the showcase entry first.
2. `AskUserQuestion`: **Approve** / **Iterate** (notes via Other). Dismissed → STOP — state is
   safely on disk; re-invoke to continue.
3. **Iterate:** the designer translates the notes itself — it holds the design language and
   the components — and applies them directly, or via dispatches: Sonnet for concrete,
   mechanical changes; Fable (doctrine inlined) for judgment-bearing ones. Gate +
   checkpoint-commit per round. No round cap; every round ends green.
4. A note that demands a **data-shape change**, or contradicts a locked Decision **or the
   design doctrine**, is not a visual tweak — resolve it now via `AskUserQuestion`. For
   doctrine conflicts, ask whether this is a **local exception** (recorded in the spec's
   Decisions) or a **doctrine change** (doctrine doc updated; older surfaces are now
   inconsistent — record that as a known gap, do not migrate them in this spec). Apply the
   ruling to foundation + components in the same round.

## Phase 4 — Reconcile & promote

1. One Sonnet worker updates the spec to match approved reality: **UI** section (final
   component APIs and states), **File Plan** (actual component/entry files; CREATE rows that
   landed here stay listed — build will see them on disk and skip), **Contracts** for any
   shape changes, with new **Decisions** rows for rulings made in Phase 3.
2. **Promote:** the designer writes generalizable outcomes upward — new tokens stay in the
   token files; taste rulings future specs should inherit go into the doctrine doc. Local
   one-offs stay in the spec's Decisions. The doctrine stays one page — prune as you promote.
3. Set `designed: YYYY-MM-DD` in frontmatter. `status` stays `hardened`.
4. Final checkpoint-commit. Report: components/entries landed (paths), reuse-gate hits,
   iteration + self-review rounds, spec deltas, decisions added, doctrine promotions. Next:
   `/spec:build $ARGUMENTS`.

## Rules

- Components built here are **real and kept** — never throwaway. `/spec:build` skips their
  creation and only wires them.
- Tokens and doctrine are binding canon. Extending them is normal; contradicting them is a
  fork — Phase 3 step 4, never a silent override.
- Design changes propagate **forward into the spec now** — never left for build to discover.
- The designer session reads and writes component files (the design-stage exception); workers
  still never run git — the session owns checkpoint-commits after each green round.
- `AskUserQuestion` dismissed → STOP.
