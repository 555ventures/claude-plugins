# 0010. The kit is named before screens, the theme leaves mocks, and every journey is walked then client-reviewed before approval

- Status: accepted
- Date: 2026-09-07
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (brief 22a, amended in place)
- Amended by: ADR-0012 (client review closes on captured evidence — the CLIENT paragraph's
  "frame diff between the note's timestamp and the resolution commit" closure is replaced by a
  capture taken when the client note is raised; session resolve refused; dated waiver)
- Applies to: ADR-0008's order (`SEED → SHAPES → WIREFRAMES → THEME → SIGNOFF → APPROVED`)
  and its enumerated D-rows on specs/20260906/02 and specs/20260906/06:
  - specs/20260906/02 — D1 narrowed (the chain gains `KIT` between `SHAPES` and
    `WIREFRAMES`, and `WALK` then `CLIENT` between `WIREFRAMES` and `APPROVED`; `THEME` and
    `SIGNOFF` leave the driver); D3 superseded (`direction-composed`'s dense-screen
    composition moves to `/spec:sketch`, composed on the kit page in candidate themes, never
    on product screens); D7 narrowed (`--reopen theme` retired with the state; `--reopen
    kit`, `--reopen walk:<j>` take its place); D8 narrowed (`AUTHORING_STATES` gains `KIT`;
    the `SIGNOFF` disjunction in the look-probe precondition dies with the state).
  - specs/20260906/06 — D3 superseded (the fixed critique pass is no longer four
    single-screen heuristics; it is the journey walk of this ADR, run on themed surfaces at
    sketch); D5 narrowed (`design-critic.md`'s prompt becomes the walk's allow/forbid list).
## Context

Brief 22a made `/spec:mocks` a gray comprehension check and moved fidelity into
`/spec:sketch`. It left three things unresolved, all of which surfaced within a day of 22a
closing.

**The content slot has no canon.** The shell canon governs chrome — header, tab bar, toast
host, content slot — and it holds. Measured 2026-09-07 across three shipped hosts: salon-os's
shell canon names 28 classes, every one of them chrome, and names no sheet, empty state,
table row, card, form field or option group. The result is 90 components for ~24 screens, 28
of them used in one mock region or fewer, with 18 sheet-family components beside a generic
`Sheet`, four option-group variants, and three empty-state variants. prax carries 37
components with 8 whole screens registered as components; upwell 66 with seven overlapping
badge-family entries. Screen-prefixed names (`RosterEmptyState`, `MemberDetailNoteSheet`) are
the signature of **absence**, not drift — drift from a named primitive looks like `SheetV2`.
The one thing that was named held; everything unnamed was invented once per screen. The
derived component manifest is therefore a receipt, not a constraint: it launders redundancy
into something that reads as a design system.

**The theme pick sits in a structure stage.** `THEME` composes candidate directions on the
seed's dense screen and produces `design/tokens.css`. It is a taste decision squeezed between
structure and sign-off, it delays the one sign-off, and it is re-litigated at the first
`/spec:sketch` anyway — which is where a real brief exists to judge a theme against.

**Nothing walks a journey.** 22a's critique pass reads one screen at a time against four
usability heuristics. The June 2026 literature is direct about the limit: screenshot-scoped
evaluation cannot see multi-step problems (arXiv 2606.05697), and critics without
coverage-gated exploration produce fluent but weakly grounded criticism, with measured repair
lift of only +0.14–0.22 on a 1–5 scale and human agreement of ρ≈0.635 (arXiv 2606.16262).
Meanwhile JJ's clients click through the journey page and approve it — so the flow already
has an outside human reader, and the defects that reach them are exactly the multi-step ones:
a dead end after an error, a back button that eats a form, state carried wrong across three
screens.

## Options

**A. Leave the chain; add a lint for component reuse at authoring time.** Rejected. A lint
firing at wireframe speed across ~24 screens is a tax paid ten times a session; JJ rejected it
explicitly. It also has no support in the field: every enforcement finding in the 2026
sources concerns values with a finite legal set (raw hex, invented token names), never
structural reuse, which is a judgment.

**B. Leave the chain; write the shared-component opportunities as prose in the canon doc.**
Rejected. Prose is not read at the moment a dense screen is being drawn. The measured
evidence is that a *rendered, checked* canon held and an unwritten one did not.

**C. Name the primitives as a canon family, bind at journey approval, move the theme to
sketch, and add a journey walk and a client stop.** Accepted.

## Decision

**The chain becomes `SEED → SHAPES → KIT → WIREFRAMES → WALK → CLIENT → APPROVED`.**

**KIT.** After shapes, before any screen: a `design/kit/` canon family, a sibling of
`design/shell/` under the same marks, the same checker and the same verbs — not a third
parallel concept. It names every shared primitive once, in every state, with a when-to-use
line: page header, table row, list row, sheet, empty/loading/error, option group, card, pill,
form field. Gray, never skinned, signed off like a wireframe, and part of what a client sees.
`shell sync|adopt` generalise to `canon sync|adopt <family>`; the marks vocabulary is reused
verbatim. Sync rewrites only non-content slots — chrome inside a primitive — because a
primitive is instantiated with different content each time; structural conformance is
check-only.

**The kit binds at journey approval, not at authoring.** A journey cannot be approved while
any of its screens carries a region that is neither a kit instance nor an explicit bespoke
mark. The bespoke mark must name the primitive the region is *not* and the one structural
difference preventing reuse; it lands in the derived manifest as an unabsorbed entry that
persists until absorbed or deleted; the count prints at sign-off and again at sketch. The
approver chooses against a growing number, never a checkbox. **The kit is also the authoring
seed** — every wireframe authoring prompt opens with the kit page and "instantiate, do not
invent" — which is what keeps the residue small enough for the count to stay honest.

**The manifest derives.** `design/components.json` stops being session-authored: it is
derived from the kit and shell families, one entry per canon primitive, and
`components-check.js` becomes the drift check between the derived manifest and any hand
edits. Nothing enters the manifest without a canon file behind it, which is what structurally
prevents 90 entries where 15 belong. `canon.md ## Primitives` dies as a source of truth; the
kit directory is the list, and the genesis gate that read those bullets re-points at it.

**THEME and SIGNOFF leave the driver.** `SIGNOFF` was only ever "APPROVED with a human in
it". The theme pick moves to `/spec:sketch`'s first run: candidates are the gray kit
re-rendered per candidate theme, the pick becomes the themed kit canon — the design system's
first page, from which every later sketch surface is built — and writes `design/tokens.css`
plus the extracted shell canon. Sketch's current refusal when `tokens.css` is missing becomes
**author if missing, refuse only if present-and-gray**, which is what lets the producer and
its new location move in one landing unit. Sketch additionally refuses to theme a surface
whose unabsorbed count is above zero unless the kit was amended first — the kit's real teeth,
tolerable because it fires once per brief at the moment redundancy would otherwise become
code.

**WALK.** One fresh-context critic per journey, read-only, with no authoring memory, walking
the journey in declared order with the gray empty/loading/error states as branches at the step
where they occur. It may report only flow breaks: no path back, no path forward, a state with
no exit, a step requiring data no earlier step collected, a control meaning two different
things across screens, an error state with no recovery. Every finding cites journey, step and
state or is refused. Naming, hierarchy, density and "consider…" are forbidden — if it cannot
name the step where the walk breaks, it is not a finding. Findings land in a `walk` note scope
separate from the client's and must reach zero before `CLIENT` opens. The same critic replaces
22a's four-heuristic pass at sketch, run on themed surfaces.

**CLIENT.** The served journey page, exposed by JJ himself; clients see product-kind questions
only, and their notes live in their own scope — clean, because the walk reached zero first.
Each resolved note owes a **derived** closure signal back to the client: the diff of the
wireframe frame between the note's timestamp and the resolution commit, rendered before/after
on the page. A closure line typed by the session is refused; it drifts to "fixed, thanks" and
the loop loses the only thing that made it trustworthy. `APPROVED` means every journey walked
clean and every client note closed.

**One pipeline, whatever the platform.** When a host first targets a native platform, that platform is declared in `design/targets.json` and **both** canon families — shell and kit — are written in its idiom, with a canon → native component mapping table the build worker follows for each, and simulator/emulator capture replacing Chrome as the built-check source. One atlas, one mock format. A second design pipeline is refused: the families, the marks and the checker are the same ones this ADR names, rendered differently.

## Consequences

The design stage gains two states and loses two. A host checkpointed under `THEME` or
`SIGNOFF` derives the new chain from its existing marks and continues; ledger rows written
under the retired step names keep parsing, since the step column is a regex and not an
enumeration.

The kit's binding point is grounded in this repo's own measurement, not in the field: the
2026 sources support naming primitives upfront and locking the frame while leaving the content
zone editable, but they lint values, never structural reuse. The salon-os inventory is a local
experiment with a control — named-and-checked chrome held, unnamed content drifted eighteen
fold, same author, same session discipline — and it is the stated justification. If the
bespoke count proves useless in the first host run, the gate is the thing to remove, not the
kit.

Two accepted costs. The theme is picked later, so the whole-product gray pass now completes
with no product tokens anywhere — the atlas stays gray until the first brief is sketched.
And candidate flows (specs/20260905/03, hardened after a prototype ruling) cannot be built as
written; its premise survives, its mechanics are re-planned against this chain, and the walk
runs after the flow pick on the winner only.
