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

**Intended model: the session model, plus the planning seat for scoped-sweep authorship**
(shared § Model Placement — direction is judged here so `/spec:design` later inherits it):
recommend the best available model for brainstorm rounds. Scoped-sweep mock authorship follows
the shared authorship + grounding rule in full (shared § Design Atlas's authorship paragraph,
ADR-0003) — one hand, in-session, for every edit; no `Agent` dispatch ever writes a mock
(subagents run judgment-free checks only).

**Fresh-window contract:** every invocation cold-starts from disk — brief + mocks are re-read,
state is derived (which surfaces have mocks, at what `data-status`), and each applied round is
written to disk before the next. There is no state file and no dependency on prior chat context;
re-invoking with the same brief resumes exactly where the files say you are.

**Setup:** run `spec-paths shared-for sketch` and read its output. Run `spec-paths design-atlas`
once and keep the path — `{atlas}` below. Run `spec-paths mocks-driver` once and keep the path —
`{driver}` below (owns the `notes` subcommands the loop reads). Read `.claude/spec.config.json`
if present.

## Input resolution

`$ARGUMENTS` = one target + an optional free-text first instruction. Resolve the target to
exactly one owning brief:

- **Roadmap brief path** (`docs/roadmap/NN-*.md`) — direct; the whole brief is in scope.
- **Mock path** (`design/mocks/<label>.html`) — read its root `data-screen-label`, grep the
  label across `docs/roadmap/*.md` ` ```surfaces ` blocks; the declaring brief is the owner and
  the round starts scoped to that surface. **No declaring brief** (orphan) → `AskUserQuestion`,
  glossed in plain English with a consequence per option: "this mock has no brief claiming it —
  assign it to a brief (Recommended: keeps the surface reachable from the roadmap; adds one line
  to that brief's `surfaces` block) or delete the mock (the design work is lost, but nothing in
  the roadmap referenced it anyway)." **Two briefs
  declare the label** → a roadmap defect; surface it for the user to fix, never pick silently.
- **Bare surface label** — same grep, same rules.
- **No argument** — derive per-brief status from disk (surfaces × mocks × `data-status`), list
  UI-bearing briefs with their gap/sketch/ratified counts, `AskUserQuestion` which to open.

Any trailing instruction ("change 1a to have a liked feature") seeds round 1 of the loop below.

## The run

1. **Ground.** Read the owning brief, `docs/roadmap/00-overview.md`, every ADR its Grounding
   cites (including `Amended by ADR-NNNN` lines), the design doctrine, and `design/tokens.css`. Scan `design/mocks/` for the brief's
   declared surfaces; derive gaps and statuses.
2. **Bound check.** Surfaces already `bound`/`built` (coverage ledger claim) are contracts —
   changes to them route through `/spec:design`'s drift handling, never through this command.
   If the requested change targets one, STOP with the shared shape (shared § Console Output
   Style): `🚫 **{surface} is bound — sketch is pre-plan only.**` then `Next: /spec:design —
   reopen the spec that bound this surface.`
3. **Scoped sweep — single pass, over this brief's gap surfaces only.** Every gap surface of
   this brief is authored in-session by one hand, following the shared authorship + grounding
   rule in full (shared § Design Atlas's authorship paragraph) — no `Agent` dispatch ever
   writes a mock; no shell canon yet → author `design/shell/app.html` in-session first.
   Existing mocks are never re-authored. When a surface carries capability an out-of-scope
   brief owns, give that capability its own region rather than folding it into a region the
   current brief must bind — an unbound region is inherited for free, while future-brief
   content entangled inside a bound region costs an evidence-gated delta row.
4. **Build & report.** `node {atlas} build`, then report the output path
   (`design/atlas/index.html`) — the user opens the file themselves (e.g. from VS Code); do
   **not** start a server or open a browser. Serve (`node "$(spec-paths design-atlas)" serve`)
   from the repo root only if the user asks or wants to leave notes — serving injects the notes
   layer. The map shows everything, but this session's iteration scope stays the one brief.
5. **The loop.** Take changes in chat against screen labels, or read them back from the served
   page with `node {driver} notes open` (spec/doctrine/mocks.md § Mocks: Page Notes owns the
   note shape and mark refusals). Group notes by surface, present the plan, then **triage every
   change by root cause before touching anything** — the shared triage (shared § Design Atlas)
   plus the two loop bins plus the architecture route:
   - **Mock-detail** (spacing, copy, emphasis, pure-UI state) → edited in-session — copy swaps
     and reorders too, the cost that justified dispatching them is gone at sketch tier;
     `{atlas} check`, rebuild, refresh, then `notes address --id <id> --change "<what changed>"`
     for a page note.
   - **Structure** (surface added/removed, journey edge changed) → the brief's `surfaces` block
     FIRST, then the mock follows (create/delete/edit as implied); `notes address` with
     `--ledger <rowId>` when a page note drove it.
   - **Intent/scope** (a capability added or dropped — "users can favorite items") → the brief's
     Scope / Out of scope; a change that crosses briefs is an amendment ADR (`Applies to` every
     touched brief, effects edited into each in this session — adr.md template); then the mock.
   - **Question back** (the note needs the user, not a change) → `notes reply --id <id> --text
     "<question>"`, status stays open. **Propose to decline** → never declined by this session,
     print it for the user; a canon-primitive note edits canon.md first, every dependent screen
     after. Resolve happens only on the page — this session never resolves a note.
   - **Architecture-impacting** — before applying any scope/structure change, ask: *does this
     alter what the ADRs decided or assume* (new persistence, endpoint shape, auth surface,
     real-time requirement)? If yes, never silently absorb it: name the affected or missing
     ADR; small → write the amendment ADR (this brief in its `Applies to`) and a line in the
     brief's **Open questions for planning** so the plan interview must resolve it;
     contradicts an accepted ADR → recommend the ADR amendment happen before this brief is
     planned. The brief never smuggles an unratified architecture decision past `/spec:plan`.

   Every applied round hits disk immediately — brief edit first, mock second — so stopping
   mid-session (or losing the window) loses nothing. This detection is judgment, not a grep:
   the per-change ADR question plus the exit readout is what makes it reliably *asked*.
6. **Exit — ratification.** When the user says done (or asks "where are we"): produce the
   **coherence readout** — one line per declared surface: what the mock shows vs what
   Scope/`surfaces` claim, plus any unresolved architecture flags. Fix what the readout catches
   (same triage). The marks a mock declares — `data-screen-label`, `data-status`,
   `data-state-btn`, `data-contract="none"`, `data-positioned` — are documented in shared
   § Design Canon; this is where they get checked, not where they get defined. Then run the
   **expansion pass** (shared § Design Canon: media queries + the
   tokens dark block, one responsive file, no new taste) on each of the brief's `sketch` mocks,
   run `{atlas} shell sync` on those mocks (a canon change since authoring never blocks
   ratification for a mechanical reason — a drift finding that survives sync is real), then
   run `node {atlas} check --matrix`, and render the matrix screenshots — each declared viewport, each
   theme at minimum on the draft framing — they are confirmed at this step's single stop below. Then run
   `node "$(spec-paths render-gate)" --mocks <the brief's sketch mocks>` — this replaces the
   Sonnet rule-checklist pass with the design rules genesis wrote as `renderCheck` entries,
   executed as a script (shared § Design Canon: a rule a script can check is never checked by an
   LLM at runtime). A rule finding blocks ratification until the mock is fixed or the rule is
   amended — never excused per surface; a `severity: "warn"` rule prints its finding prefixed
   `⚠️` and does not block. Only then the look stop — printed, then **end the turn**, never
   `AskUserQuestion` (shared § Design Atlas: look stops are never questions):

     🎨 **ready for review** — open design/atlas/index.html (step 4's build), matrix shots in
        <the render directory>

     🆕 design/mocks/<label>.html — one line per `sketch` mock of this brief

     Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

   The user opens the atlas themselves (step 4: never start a server). Only the literal
   `approve` ratifies; every other reply is a change round, an ambiguous one re-prints the
   block with one clarifying line. On `approve`, set `data-status="ratified"` on each
   of the brief's `sketch` mocks (`approved`+ mocks are untouched) and rebuild the atlas.
   **Ratified = approved, one stamp:** direction confirmed at roadmap level, brief and mocks
   agree, matrix already confirmed in this step — `ratified` carries the same check enforcement
   `approved` does from here on (shared § Design Canon). On `change …` — one more round of
   step 5's triage, then this step again. No reply — state is on disk; re-invoke to continue.
7. **Report.** Assemble the slots (rationale: shared § Console Output Style) — `outcome`:
   ✅ `ratified {N} of {M} surfaces — {brief}`; `bullets`: the `🎨 authored {N} in-session · {K}
   check-only dispatches` line (shared § Design Atlas) when this round authored any mocks; `warns`: one line per un-ratified surface
   or open question written (drop when none); `artifacts`: the brief path (edited-section
   inventories stay in the brief file — print its path, not the sections); `next`:
   `{kind: 'command', text: '/spec:plan {brief}'}`. Run
   `node "$(spec-paths report-render)" --slots <file>` and print its output verbatim.

   ```report
   ✅ **ratified 3 of 4 surfaces — docs/roadmap/09-checkout.md**
   🎨 authored 4 in-session · 0 check-only dispatches
   ⚠️ checkout-confirm still sketch — open question: refund flow ownership
   📦 docs/roadmap/09-checkout.md

   Next: /spec:plan docs/roadmap/09-checkout.md
   ```

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
