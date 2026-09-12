---
description: Per-brief design workbench — mock one roadmap brief's surfaces and brainstorm on them BEFORE /spec:plan, with every change triaged back into its binding home (mock, surfaces block, Scope, or ADR question) so the brief never lies to planning
argument-hint: "<roadmap brief path | mock path | surface label> [optional first change instruction]"
---

# Spec Sketch: Design One Brief Before Planning It

The pre-plan seat for roadmap-level design iteration. Scoped **by construction to one brief**:
its surfaces get mocks, the user brainstorms on them — add, remove, change radically — and every
applied change lands in its binding home *in the same round*, so `/spec:plan` on that brief later
reads files that are already true. Sits between the roadmap (genesis-authored or hand-authored)
and `/spec:plan`; owns no spec state and never edits `specs/**`. Every mock this command
authors or reworks is authored under the `frontend-design` skill (§ Mocks: Authoring Rules):
at setup run `node {driver} skill-check`, print its line verbatim, and act on it before the
first edit. `/spec:atlas` remains the
whole-product map; this command is the per-brief workbench — the atlas's annotation triage
(shared § Design Atlas) applies here verbatim, plus the architecture route below.

**Never required.** Plan warns on an unratified UI brief and offers this command; it never blocks.

**Intended model: the session model, plus the planning seat for scoped-sweep authorship**
(shared § Model Placement — direction is judged here so the design stage later inherits it):
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
   changes to them route through the design stage's drift handling, never through this command.
   If the requested change targets one, STOP with the shared shape (shared § Console Output
   Style): `🚫 **{surface} is bound — sketch is pre-plan only.**` then `Next: /spec:run <the spec
   that bound this surface> — its design stage handles the drift.`
3. **Theme (first run only).** Run `node {driver} theme state`. A refusal (exit code 2) → STOP,
   printing the driver's stderr verbatim. `picked` → skip straight to the sweep — the theme was
   picked in `/spec:mocks` (THEME), by the client on the two dense screens, and every mock this
   command draws is served in the picked roles already. `absent` with **no** `design/kit/`
   resolving → print
   `⚠️ no design/kit/ and no theme — sketching gray, structure only (run /spec:mocks to KIT first)`
   and continue gray. `absent` **with** a kit family → the host skipped mocks' THEME state, so
   this command authors the directions itself: read the gray kit, the seed, `design/mocks/references/`,
   and `docs/design/research-brief.md`; derive 2–3 candidate directions from the brief's product,
   audience, and references and `AskUserQuestion` which to compose — never a stock pair (warm/
   cool, playful/serious). Record each picked direction as a confirmed `theme-directions: <k>`
   row via `node {driver} ledger add --step SKETCH`. Per direction, author
   `design/theme/<k>/tokens.css` (light plus a `[data-theme="dark"]` block whenever
   `design/targets.json` declares `dark`) and re-render every kit primitive at production
   fidelity into `design/theme/<k>/kit.html`, primitive keys and structure kept, under the
   `frontend-design` skill, verifying each with `node {driver} theme compose --direction <k>`.
   Start the served atlas as a tracked background task, run
   `node {driver} theme shortlist --directions <k1,k2[,k3]>`, print its two lines, and **end the
   turn** — never `AskUserQuestion`. On the next invocation, run
   `node {driver} --mark theme-picked`; a `decided change` is one more compose round then a fresh
   `theme shortlist`. After the mark, when no shell canon exists, `design/shell/app.html` is
   extracted from the picked direction's kit page rather than authored freehand.
4. **Scoped sweep — single pass, over this brief's gap surfaces and its existing gray mocks.**
   Every gap surface of this brief is authored in-session by one hand, following the shared
   authorship + grounding rule in full (shared § Design Atlas's authorship paragraph) — no
   `Agent` dispatch ever writes a mock. When `design/tokens.css` exists, every mock this step
   touches is authored at production fidelity in the picked theme — links `../tokens.css` and
   the shell canon, never `wire/` — and the brief's existing gray mocks are reworked into it:
   the only time an existing mock is re-authored, structure and facts kept, only the fidelity
   changes. No shell canon yet → author `design/shell/app.html` in-session first. After step 3,
   `design/tokens.css` can only be absent on the no-kit gray floor. When a surface carries
   capability an out-of-scope brief owns, give that capability its own region rather than
   folding it into a region the current brief must bind — an unbound region is inherited for
   free, while future-brief content entangled inside a bound region costs an evidence-gated
   delta row.
5. **Build & report.** `node {atlas} build`, then report the output path
   (`design/atlas/index.html`); this session never opens a browser itself — the served atlas
   page (§ 8's look stop starts it as a tracked background task) is the one viewer, for the
   atlas and for leaving notes alike. The map shows everything, but this session's iteration
   scope stays the one brief.
6. **The loop.** Take changes in chat against screen labels, or read them back from the served
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
   - **The UX argument** (every surface this round touched) → after the triage above resolves,
     write three lines into that surface's entry in the brief's `surfaces` block: `job:` what
     the person is doing, `risk:` what goes wrong if the screen is wrong, `choice:` the one UI
     decision made and the alternative rejected. This is where each surface's UI/UX is argued
     individually, not left implicit in the pixels — the brief is already this session's write
     target (Rules).

   Every applied round hits disk immediately — brief edit first, mock second — so stopping
   mid-session (or losing the window) loses nothing. This detection is judgment, not a grep:
   the per-change ADR question plus the exit readout is what makes it reliably *asked*.
7. **Critique (fixed) — before the exit stop, every round.** Run `node {atlas} check --states`
   over the brief's mocks — the states-presence check (spec/doctrine/mocks.md § Mocks:
   Authoring Rules). Then run `node "$(spec-paths render-gate)" --mocks <the brief's sketch
   mocks>` (spec/doctrine/design.md § Design Render Gate). Then dispatch `Agent {subagent_type:
   'design-critic'}` once — the brief's `surfaces` **in declared order** as the journey, that
   journey's mock paths, and `design/tokens.css`, never file contents (shared § Model
   Placement) — read-only, fresh context; it walks the journey and returns findings
   `{screen, state, break, finding, severity}`, flow breaks only, and edits nothing. Record every
   returned finding as a page note: `node {driver} notes add --scope mock --screen <label>
   --state <s> --kind walk --reason <break> --by walk-critic --text "<finding>"`; an empty
   findings list is recorded as nothing — the critic found no break. Fix what the session can
   (step 6's triage) and leave the rest open for the user — the look stop below is where any note
   still open surfaces to them. This pass runs on every exit, never skipped for a small brief,
   and never run by the session standing in for the critic — the fresh-context dispatch is the
   whole point (Rules).
8. **Exit — ratification.** When the user says done (or asks "where are we"): produce the
   **coherence readout** — one line per declared surface: what the mock shows vs what
   Scope/`surfaces` claim, plus any unresolved architecture flags. Fix what the readout catches
   (same triage). The marks a mock declares — `data-screen-label`, `data-status`,
   `data-state-btn`, `data-contract="none"`, `data-positioned`, `data-narrow` — are documented
   in shared § Design Canon; this is where they get checked, not where they get defined. Then run the
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
   `⚠️` and does not block. Before the first `stop open`, start
   `node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a
   **tracked background task** (`already serving` means a previous session's server is still
   up — reuse it); this is the session's own tool and is never printed to the user. Only then
   the look stop: run `node "$(spec-paths
   design-atlas)" stop open --root . --kind approve --key sketch:<brief> --title "ratify
   <brief>" --candidates <label>=mocks/<label>.html[,…]` over the brief's `sketch` mocks — its
   stdout is the whole hand-off, the same two lines every look stop prints, then **end the
   turn**, never `AskUserQuestion` (shared § Design Atlas: look stops are never questions):

     🎨 ready for review — <url>
     Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

   On the next invocation, read `node "$(spec-paths design-atlas)" stop list --root .` for the
   decision rather than asking again. `decided approve` ratifies: set `data-status="ratified"`
   on each of the brief's `sketch` mocks (`approved`+ mocks are untouched) and rebuild the
   atlas. **Ratified = approved, one stamp:** direction confirmed at roadmap level, brief and
   mocks agree, matrix already confirmed in this step — `ratified` carries the same check
   enforcement `approved` does from here on (shared § Design Canon). `decided change` is one
   more round of step 6's triage, then a fresh `stop open` for the same key. No decision yet —
   end the turn again; re-run to re-read `stop list`.
9. **Report.** Assemble the slots (rationale: shared § Console Output Style) — `outcome`:
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
- Bound mocks are contracts; the fork ruling lives in the design stage, not here.
- Theme direction authoring (step 3) follows the same in-session authorship + grounding rule as
  the sweep — no `Agent` dispatch ever writes a candidate direction's tokens or kit page.
- The critique pass is never skipped and never self-run — a small brief still gets the states
  check, the render rules, and the fresh-context critic before its exit stop.
