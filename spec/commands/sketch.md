---
description: Per-brief design workbench — sweep one roadmap brief's open items on the mock app, triage every change back into its binding home (screen, surfaces block, Scope, or ADR question) so the brief never lies to planning
argument-hint: "<roadmap brief path | screen label> [optional first change instruction]"
---

# Spec Sketch: Sweep One Brief On The Mock App

The pre-plan seat for roadmap-level design iteration, scoped **by construction to one brief**.
The mock app (`/spec:mocks`'s own product) already exists; this command sweeps its open items
for the brief's labels, applies changes in-session, and ratifies each surface's approval —
every applied change lands in its binding home *in the same round*, so `/spec:plan` on that
brief later reads files that are already true. Sits between the roadmap (genesis-authored or
hand-authored) and `/spec:plan`; owns no spec state and never edits `specs/**`.

**Never required.** Plan warns on an unapproved UI brief and offers this command; it never
blocks.

**Intended model: the session model** (shared § Model Placement — direction is judged here so
the design stage later inherits it): recommend the best available model for brainstorm rounds.
Screen authorship follows the in-session authorship rule in full — one hand, no `Agent`
dispatch ever writes a screen.

**Fresh-window contract:** every invocation cold-starts from disk — the brief and
`design/approval.json` are re-read, state is derived (which surfaces are approved and current),
and each applied round is written to disk before the next.

**Setup:** run `spec-paths shared-for sketch` and read its output. Run `node
"$(spec-paths mocks-driver)" --root . --state` to confirm the mock app's contract (a refusal
here is the contract check — `lib/mock-cli.js`'s `contractOrDie`, package-version mismatch
named verbatim). Read `.claude/spec.config.json`.

## Input resolution

`$ARGUMENTS` = one target + an optional free-text first instruction. Resolve the target to
exactly one owning brief:

- **Roadmap brief path** (`docs/roadmap/NN-*.md`) — direct; the whole brief is in scope.
- **Screen label** (a `src/screens/<label>.tsx` under the mock app) — grep the label across
  `docs/roadmap/*.md` ` ```surfaces ` blocks; the declaring brief is the owner. **No declaring
  brief** (orphan) → `AskUserQuestion`, glossed in plain English with a consequence per option:
  "this screen has no brief claiming it — assign it to a brief (Recommended: keeps the surface
  reachable from the roadmap; adds one line to that brief's `surfaces` block) or leave it
  (the screen stays out of the roadmap)." **Two briefs declare the label** → a roadmap defect;
  surface it for the user to fix, never pick silently.
- **No argument** — derive per-brief status from disk (surfaces × `approval.json`), list
  UI-bearing briefs with their gap/open/approved counts, `AskUserQuestion` which to open.

Any trailing instruction ("change the confirm screen to show a total") seeds round 1 below.

## Ground

Read the owning brief, `docs/roadmap/00-overview.md`, every ADR its Grounding cites (including
`Amended by ADR-NNNN` lines), and the design doctrine. List the brief's declared surfaces
against `design/approval.json` to derive gaps and statuses.

## Bound check

A surface claimed by a `done` spec (a `done` spec whose `design_source` names it — the coverage
ledger is retired, so "claimed" means exactly this) is a contract; drift routes to `/spec:run`,
never this command. If the requested change targets one, STOP with the shared shape (shared
§ Console Output Style): `🚫 **{surface} is claimed by {spec} — sketch is pre-plan only.**` then
`Next: /spec:run {spec} — its design stage handles the drift.`

## The sweep loop

1. Run `npx mock-review sweep`. Act on the brief's labels only — a red item on a screen another
   brief owns is an Out-of-scope fence, reported not fixed.
2. **Triage every change by root cause before touching anything** — five bins:
   - **Mock-detail** (spacing, copy, emphasis, pure-UI state) → edited in-session, then
     `npx mock-review answer --note <id> --text "<what changed>"`.
   - **Structure** (surface added/removed, journey edge changed) → the brief's `surfaces` block
     first, then the screen follows (create/delete/edit as implied).
   - **Intent/scope** (a capability added or dropped) → the brief's Scope / Out of scope; a
     change that crosses briefs is an amendment ADR (`Applies to` every touched brief, effects
     edited into each in this session — adr.md template); then the screen.
   - **Question back** (the note needs the user, not a change) → `npx mock-review answer --note
     <id> --text "<question>"`, the note becomes the author's turn. **Propose to decline** →
     never declined by this session, print it for the user. Resolve happens only on the served
     page — this session never resolves a note.
   - **Architecture-impacting** — before applying any scope/structure change, ask: *does this
     alter what the ADRs decided or assume* (new persistence, endpoint shape, auth surface,
     real-time requirement)? If yes, never silently absorb it: name the affected or missing
     ADR; small → write the amendment ADR (this brief in its `Applies to`) and a line in the
     brief's **Open questions for planning**; contradicts an accepted ADR → recommend the ADR
     amendment happen before this brief is planned.
   - **The UX argument** (every surface this round touched) → after the triage above resolves,
     write three lines into that surface's entry in the brief's `surfaces` block: `# job:` what
     the person is doing, `# risk:` what goes wrong if the screen is wrong, `# choice:` the one
     UI decision made and the alternative rejected — kept verbatim, this is where each surface's
     UI/UX is argued individually, never left implicit in the pixels.

   Every applied round hits disk immediately — brief edit first, screen second — so stopping
   mid-session loses nothing.
3. **Critique.** Run `npx mock-review check`. A screen missing a state the seed requires is a
   `states` warn finding (spec 01's contract) — it never flips `ok`; the session fixes it or
   leaves it open for the user. Fix what the triage above catches and leave the rest for the
   look stop.
4. Re-sweep until `npx mock-review sweep` prints one line for the brief's labels, or every
   remaining item is an Out-of-scope fence or a question left for the user.

## Exit — the look

Exit when every brief label is approved and current in `design/approval.json`
(`approvedAt` set, `hash` matching `check --json`'s) and every journey through them
`approvedAt`. Print, one line per label:

  🎨 **ready for review — <check.serve.url>/#/<screen>**

  Reply  ✅ approve  — or —  ✏️ change <what looks wrong>

then **end the turn** — never `AskUserQuestion` (shared § Design Canon: look stops are never
questions). Only the literal `approve`, made on the served page, advances; a change reply is
one more round of the sweep loop, then a fresh look. There is no separate approval stamp, no
theme step, no whole-product build, no matrix expansion — approval on the served page is the
whole of it.

## Report

Assemble the slots (rationale: shared § Console Output Style) — `outcome`: ✅ `approved {N} of
{M} surfaces — {brief}`; `bullets`: one line per screen authored or reworked this round;
`warns`: one line per un-approved surface or open question written (drop when none);
`artifacts`: the brief path; `next`: `{kind: 'command', text: '/spec:plan {brief}'}`. Run
`node "$(spec-paths report-render)" --slots <file>` and print its output verbatim.

```report
✅ **approved 3 of 4 surfaces — docs/roadmap/09-checkout.md**
⚠️ checkout-confirm still open — open question: refund flow ownership
📦 docs/roadmap/09-checkout.md

Next: /spec:plan docs/roadmap/09-checkout.md
```

## Rules

- **The brief is a write target of this session** — Scope, Out of scope, `surfaces` all evolve
  here. One binding home per fact still holds: pixels never in the brief, structure never only
  in the screen.
- **Approval is set only by the served page** — never by this session, never implicitly.
- Never edits `specs/**`; never touches surfaces another brief owns (Out-of-scope fences are
  binding here too).
- Claimed surfaces are contracts; the fork ruling lives in the design stage, not here.
