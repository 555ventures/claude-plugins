---
description: Per-brief design workbench — mock one roadmap brief's surfaces and brainstorm on them BEFORE /spec:plan, with every change triaged back into its binding home (mock, surfaces block, Scope, or ADR question) so the brief never lies to planning
argument-hint: "<roadmap brief path | mock path | surface label> [optional first change instruction]"
---

# Spec Sketch: Design One Brief Before Planning It

The pre-plan seat for roadmap-level design iteration. Scoped **by construction to one brief**:
its surfaces get mocks, the user brainstorms on them — add, remove, change radically — and every
applied change lands in its binding home *in the same round*, so `/spec:plan` on that brief later
reads files that are already true. Sits between the roadmap (genesis-authored or hand-authored)
and `/spec:plan`; owns no spec state and never edits `specs/**`. `/spec:atlas` remains the
whole-product map; this command is the per-brief workbench — the atlas's annotation triage
(shared § Design Atlas) applies here verbatim, plus the architecture route below.

**Never required.** Plan warns on an unratified UI brief and offers this command; it never blocks.

**Intended model: the session model.** This IS the roadmap-level taste seat (shared § Model
Placement — direction is judged here so `/spec:design` later inherits it): recommend Fable/Opus
for brainstorm rounds. All mock authoring and mock edits dispatch **Sonnet agents**
(`Agent {model: "sonnet"}`) under the harness check — the session holds the brief, the triage,
and the conversation, never mock file contents.

**Fresh-window contract:** every invocation cold-starts from disk — brief + mocks are re-read,
state is derived (which surfaces have mocks, at what `data-status`), and each applied round is
written to disk before the next. There is no state file and no dependency on prior chat context;
re-invoking with the same brief resumes exactly where the files say you are.

**Setup:** run `spec-paths shared-for sketch` and read its output. Run `spec-paths design-atlas`
once and keep the path — `{atlas}` below. Read `.claude/spec.config.json` if present.

## Input resolution

`$ARGUMENTS` = one target + an optional free-text first instruction. Resolve the target to
exactly one owning brief:

- **Roadmap brief path** (`docs/roadmap/NN-*.md`) — direct; the whole brief is in scope.
- **Mock path** (`design/mocks/<label>.html`) — read its root `data-screen-label`, grep the
  label across `docs/roadmap/*.md` ` ```surfaces ` blocks; the declaring brief is the owner and
  the round starts scoped to that surface. **No declaring brief** (orphan) → `AskUserQuestion`:
  which brief owns it (add the label to its `surfaces` block) or delete the mock. **Two briefs
  declare the label** → a roadmap defect; surface it for the user to fix, never pick silently.
- **Bare surface label** — same grep, same rules.
- **No argument** — derive per-brief status from disk (surfaces × mocks × `data-status`), list
  UI-bearing briefs with their gap/sketch/ratified counts, `AskUserQuestion` which to open.

Any trailing instruction ("change 1a to have a liked feature") seeds round 1 of the loop below.

## The run

1. **Ground.** Read the owning brief, `docs/roadmap/00-overview.md`, every delta the brief
   cites, the design doctrine, and `design/tokens.css`. Scan `design/mocks/` for the brief's
   declared surfaces; derive gaps and statuses.
2. **Bound check.** Surfaces already `bound`/`built` (coverage ledger claim) are contracts —
   changes to them route through `/spec:design`'s drift handling, never through this command.
   If the requested change targets one, STOP and say so; sketch is pre-plan only.
3. **Scoped sweep.** For each **gap surface of this brief only**: one Sonnet agent authors
   `design/mocks/<label>.html` at sketch tier under the harness check — the identical contract
   to the atlas sweep (shared § Design Atlas: sketch `data-status`, real copy register, token
   roles, grounded in the brief + research brief + doctrine + tokens; parallel dispatch, paths
   not prose). Existing mocks are never re-authored.
4. **Serve.** `node {atlas} build`, then serve from the repo root and give the user the atlas
   URL — the map shows everything, but this session's iteration scope stays the one brief.
5. **The loop.** Take changes in chat against screen labels, or via a local annotation MCP
   (discover via ToolSearch, never assume). Group notes by surface, present the plan, then
   **triage every change by root cause before touching anything** — the shared triage (shared
   § Design Atlas) plus the architecture route:
   - **Mock-detail** (spacing, copy, emphasis, pure-UI state) → Sonnet mock edit, `{atlas} check`,
     rebuild, refresh.
   - **Structure** (surface added/removed, journey edge changed) → the brief's `surfaces` block
     FIRST, then the mock follows (create/delete/edit as implied).
   - **Intent/scope** (a capability added or dropped — "users can favorite items") → the brief's
     Scope / Out of scope, or a `docs/roadmap/deltas/` row for amendments that cross briefs;
     then the mock.
   - **Architecture-impacting** — before applying any scope/structure change, ask: *does this
     alter what the ADRs decided or assume* (new persistence, endpoint shape, auth surface,
     real-time requirement)? If yes, never silently absorb it: name the affected or missing
     ADR; small → write a delta and a line in the brief's **Open questions for planning** so
     the plan interview must resolve it; contradicts an accepted ADR → recommend the ADR
     amendment happen before this brief is planned. The brief never smuggles an unratified
     architecture decision past `/spec:plan`.

   Every applied round hits disk immediately — brief edit first, mock second — so stopping
   mid-session (or losing the window) loses nothing. This detection is judgment, not a grep:
   the per-change ADR question plus the exit readout is what makes it reliably *asked*.
6. **Exit — ratification.** When the user says done (or asks "where are we"): produce the
   **coherence readout** — one line per declared surface: what the mock shows vs what
   Scope/`surfaces` claim, plus any unresolved architecture flags. Fix what the readout catches
   (same triage). Then `AskUserQuestion`: ratify? On yes, set `data-status="ratified"` on each
   of the brief's `sketch` mocks (`approved`+ mocks are untouched) and rebuild the atlas.
   **Ratified** = direction approved at roadmap level, brief and mocks agree; the matrix and
   polish are still owed later at `/spec:design` promotion. On no — state is on disk; re-invoke
   to continue. `AskUserQuestion` dismissed → STOP.
7. **Report:** brief path, surfaces ratified/still-sketch, brief sections edited, deltas/open
   questions written, and the next command: `/spec:plan <brief>`.

## Rules

- **The brief is a write target of this session** — Scope, Out of scope, `surfaces`, Open
  questions all evolve here. One binding home per fact still holds: pixels never in the brief,
  structure never only in the mock.
- **`ratified` is set only by the user's exit confirmation** — never by the sweep, never
  implicitly. Sketches stay honest sketches until then.
- Never edits `specs/**`, the coverage ledger, or `design/atlas/` (derived); never touches
  surfaces another brief owns (Out of scope fences are binding here too).
- Bound mocks are contracts; the fork ruling lives in `/spec:design`, not here.
- `AskUserQuestion` dismissed → STOP.
