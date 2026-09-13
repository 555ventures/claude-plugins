# 0020. A note can mark an area

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/11-a-note-can-mark-an-area.md D1/D11)
- Applies to: specs/20260902/10-page-notes-review-loop.md D3's one-line rationale clause
  "Per-state, per-project, never per-element (spike rulings)" — narrowed to "Per-state,
  per-project, and optionally an area within a state" — and the spec's own Rationale section
  sentence "Rejected: element anchors (brittle across redraws, and the dry run never needed
  one)", which no longer holds as written now that an anchor scheme exists that degrades to a
  visible `outdated` state instead of floating to a wrong spot.
- Amended by: —

## Context

`specs/20260902/10-page-notes-review-loop.md` locked a note down to two scopes — screen+state or
whole-product — and rejected an element anchor outright: "brittle across redraws, and the dry run
never needed one." That was correct for the note shapes the spike exercised, all of them
state-level. It stopped being correct once the owner asked for feedback on part of a screen —
"the button in the header is wrong" — where a state-level note forces the reader to re-find the
spot in prose every time, and a plain pixel box or element selector fails the moment the layout
reflows to a different viewport.

`specs/20260912/11-a-note-can-mark-an-area.md` D1 proved a hybrid scheme in the field
(`design/chrome-mocks/notes.html`, Playwright Chromium, 2026-09-12): the drawn rectangle is stored
as fractions of the smallest DOM element that fully contains it, plus the set of that element's
children the rectangle touched. Resolving the region re-checks the anchor element's layout
signature (its arrangement — single/row/col/grid — and aspect ratio); an unchanged signature
replays the exact fractional box, a changed one falls back to the union of the resolved touched
children, and a resolution that finds neither returns `null` — rendered as `outdated`, never moved
and never guessed. This is exactly the failure mode specs/20260902/10 D3 rejected an element
anchor over ("brittle across redraws"), answered by making the failure visible and re-placeable
instead of eliminating the capability.

## Options considered

- **A. Rewrite specs/20260902/10 D3 and its Rationale section in place** to read the new rule.
  Rejected: D3 is a locked Decision in a closed spec; silently editing it erases the record of why
  an element anchor was rejected in 2026-09-02 and why that rejection no longer stands as written.
- **B. Leave D3 and the Rationale sentence standing as text the code now disagrees with**, relying
  on the new region feature being correct in practice. Rejected: a reader of specs/20260902/10 who
  wants to know whether a note can mark part of a screen would be told no, against running code
  that says yes — the exact failure the roadmap-amendment convention exists to prevent.
- **C. Narrow both clauses via one amendment record**, specs/20260902/10 gaining a single
  `Amended by: docs/adr/0020-a-note-can-mark-an-area.md` line and neither clause rewritten.
  Adopted.

## Decision

**Option C.** Two clauses in specs/20260902/10, and no others, are narrowed:

- D3's one-line rationale — "Per-state, per-project, never per-element (spike rulings)" — is
  narrowed to "Per-state, per-project, and optionally an area within a state." D3's own Decision
  text (the layer's toolbar, active-state tracking, author-name prompt, `viewer.css` roles) is
  unchanged; only the "never per-element" half of its rationale is superseded.
- The Rationale section's "Rejected: element anchors (brittle across redraws, and the dry run
  never needed one)" sentence is superseded by specs/20260912/11 D1's hybrid anchor: a fraction-
  of-anchor box with a covered-children reflow fallback, degrading to a visible `outdated` state
  rather than a brittle or wrong-floating one.

`spec/doctrine/mocks.md` § Mocks: Page Notes carries the executable half of this reversal — its
`**Two scopes, never an element.**` paragraph is replaced by `**Two scopes, and a note may mark an
area.**`, describing the region field, the anchor/fallback scheme, and the `outdated` display
state. `specs/20260902/10-page-notes-review-loop.md` gains a single
`Amended by: docs/adr/0020-a-note-can-mark-an-area.md` line and is not otherwise rewritten.

## Consequences

- A reader of specs/20260902/10 who wants to know whether a note can mark part of a screen now
  finds the `Amended by` line and follows it here, rather than trusting a 2026-09-02 rejection the
  code no longer honors.
- No other decision in specs/20260902/10 is reopened: the note shape (D1), the served endpoints
  (D2), the layer's state-tracking and toolbar (D3's own Decision text), the driver subcommands
  (D4), the read-notes gating on the four marks (D5), the triage bins (D6), or the client-review
  wording (D7) all stand exactly as that spec left them — `region` is additive on top of D1's note
  shape, never a replacement of it.
- `design/chrome-mocks/notes.html` (specs/20260912/11 D10) renders the region overlay, the
  composer, and the `outdated` display state as the approved look — a design source that still
  showed only screen+state notes would be wrong against the code on day one.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the
  standing "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured
  2026-09-08; build the checker at dangling-reference:3) governs this record the same as every
  other ADR here.

## Dissents

None recorded — the amendment narrows one Decision's rationale and one Rationale-section sentence
to match an explicit 2026-09-12 owner ask ("sometimes the area is not a single element"), proven
against a working prototype before this spec locked.
