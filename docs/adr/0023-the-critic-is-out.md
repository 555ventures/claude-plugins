# 0023. The critic is out

- Status: accepted
- Date: 2026-09-13
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260913/07-the-critic-is-out.md, superseding
  specs/20260913/03-the-critic-stops-filing-notes.md and
  specs/20260913/04-only-a-person-starts-a-note.md)
- Applies to: (a) specs/20260907/08-walk-critic.md — superseded whole: the WALK state, its
  `journey-walked` mark, its `walk:<j>` reopen target and the `design-critic` agent it
  dispatches are all deleted. (b) specs/20260906/06-sketch-high-fidelity-and-critique.md D3/D5 —
  D3's fixed critique pass no longer dispatches `design-critic` or records a `--kind walk`
  finding; D5's `design-critic.md` authorship is moot, the file is deleted. (c)
  docs/adr/0010-kit-walk-and-client-review.md's WALK clause — "every journey is walked then
  client-reviewed before approval" narrows to "every journey is drawn, approved and
  client-reviewed before product approval"; the client-review half (`walk.json`,
  `walkLib.confirmJourney`/`unconfirmJourney`, `/client/walk/<j>.html`, `/__walk/*`) is
  untouched. (d) specs/20260906/03-questions-on-the-wireframe.md — superseded whole: `ledger
  ask`, `refuseUnaskable`, the answer route and every question-row surface it locked are
  deleted. (e) specs/20260906/04-journey-review-page.md D5 — its question-inspector clauses
  (the `rv-q` row, the `Yes, that's right`/`No, it's…`/`Later` controls, `rv-correct`) and its
  progress-bar clause (`rv-progress`/`rv-track`/`rv-fill`, "N of M answered") are both deleted;
  D5's note-row, breadcrumb, stage-pill and stop-control clauses stand. (f)
  specs/20260912/06-the-review-page-answers-to-a-design.md's question-row rendering — the
  design source it binds to (`design/chrome-mocks/review.html`) no longer carries a question
  row, a progress bar or composer chips; its note-row and stop-control clauses stand. (g)
  docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md's refusal wording — `approved`'s
  refusal and `journey-approved`'s per-journey refusal both lose their "question or" clause:
  a screen or the whole product is blocked by an unresolved note alone, never by an unanswered
  question, since nothing produces one anymore.
- Amended by: —

## Context

Two producers wrote into the same annotation queue with no person behind either write. At the
WALK state the mocks driver dispatched a `design-critic` agent per journey; every finding it
returned was filed as a `kind: "walk"` note the journey could not pass until a session closed
it. Separately, while drawing a journey, the session pinned each product assumption it inferred
to a screen as a `kind: "question"` note (`ledger ask`) the owner had to answer, yes/no/later,
before the journey could approve. Both were defensible on their own terms — a fresh critic
walking a journey with no memory of authoring it is a real stand-in for user testing, and
pinning an inferred assumption to the screen that provoked it is a reasonable place to surface
it — but the owner's rule for this queue is about authorship, not quality: the page-notes loop
exists so a **person** can point at what they do not like. Neither producer was a person.

specs/20260913/03 and specs/20260913/04 hardened independently and turned out to edit the same
six files and tell one story, so the owner chose to merge them into specs/20260913/07 rather
than land two specs that would each re-touch the same driver, store, doctrine and stylesheet.
The merged spec deletes both producers end to end and hides the notes they already wrote to
disk (thirteen question notes and zero walk notes on the one real host measured) without
touching them — an existing `kind: "question"`/`kind: "walk"` note stays exactly as it is,
stops being listed, grouped, counted or gated on, and a stored `no` answer still derives its
legacy exclusion row. The mocks chain now runs `WIREFRAMES → THEME` directly, with no state,
no mark, no agent dispatch and no `ledger ask` between them; the only writer of an assumption
row's status is the human-run `ledger set`.

## Options considered

- **A. Rewrite the seven affected documents in place** to read the narrowed chain, the deleted
  question producer and the deleted critic dispatch. Rejected: six of the seven are locked
  specs or standing ADRs; silently editing them erases the record of what each session actually
  ruled and why a later spec overturned part of it — the same reasoning ADR-0015, ADR-0017,
  ADR-0018 and ADR-0019 already established for this repo.
- **B. Leave the seven documents standing as text the code now disagrees with**, trusting the
  new behavior to be self-evidently correct. Rejected: a locked Decision or ADR clause a reader
  can no longer trust against the running code is the exact failure the roadmap-amendment
  convention exists to prevent, and two of the seven (specs/20260907/08,
  specs/20260906/03) are whole specs whose entire subject is retired — leaving them unmarked
  reads as if the pipeline still dispatches a critic and still asks a question.
- **C. One amendment ADR narrowing or superseding all seven in a single record**, each document
  gaining a single `Amended by: ADR-0023` line and none otherwise rewritten. Adopted — the
  precedent this repo's amendment convention already sets (ADR-0018's own account: the amended
  document "gains a single `Amended by:` line and is not otherwise rewritten"), extended here
  to cover two whole-spec supersessions alongside five narrowings in one record because all
  seven trace to the same two Decisions (D1–D6) of one spec.

## Decision

**Option C.** Seven documents, and no others, are affected:

- **specs/20260907/08-walk-critic.md** is superseded whole. Its entire subject — the WALK
  state, `allJourneysWalked`, `--mark journey-walked`, `--reopen walk:<j>`, the
  `design-critic` agent and both of its dispatch sites (`/spec:mocks`'s WALK state,
  `/spec:sketch`'s Critique step) — is deleted by specs/20260913/07 D1–D4. The mocks chain
  becomes `SEED → SHAPES → KIT → WIREFRAMES → THEME → CLIENT → APPROVED`; `doMark`'s accepted
  marks are exactly `seed-done, shape-picked, canon-written, kit-signed, journey-drawn,
  journey-approved, theme-picked, approved`; `doReopen`'s accepted targets are exactly
  `journey:<j>, shapes, kit, theme`.
- **specs/20260906/06-sketch-high-fidelity-and-critique.md** D3 and D5 are narrowed.
  `/spec:sketch`'s step 7 (Critique) keeps its position before the Exit step and keeps
  `check --states` and `render-gate --mocks`; it no longer dispatches `design-critic` or
  records a `notes add --kind walk` finding. D5's authorship of `spec/agents/design-critic.md`
  is moot: the file is deleted outright.
- **docs/adr/0010-kit-walk-and-client-review.md**'s WALK clause is narrowed. "Every journey is
  walked then client-reviewed before approval" becomes "every journey is drawn, approved and
  client-reviewed before product approval." The client-review half this ADR also locked —
  `walk.json`, `walkLib.confirmJourney`/`unconfirmJourney`, the `/client/walk/<j>.html` player
  and the `/__walk/*` routes — is untouched; specs/20260913/07 D3's Rationale is explicit that
  the `unconfirmJourney` write on a redraw "stays exactly as it is."
- **specs/20260906/03-questions-on-the-wireframe.md** is superseded whole. Its entire subject
  — `ledger ask`, `refuseUnaskable`, the answer route (`POST /__notes/answer` and
  `POST /client/__notes/answer`, both now falling through to the shared `/__notes/` 404), and
  every surface that rendered or counted a question (`joinQuestions`, `renderQuestionRow`,
  `isOpenQuestion`, `claimOf`, `renderMark`, the client walk page's guesses card) — is deleted
  by specs/20260913/07 D5–D6. `ledger`'s accepted subcommands are exactly `add, set, catch,
  check, counts, derive`.
- **specs/20260906/04-journey-review-page.md** D5 is narrowed in two clauses and no others.
  The question-inspector clause — the `rv-q` row, its `I assumed` lead, its `Yes, that's
  right`/`No, it's…`/`Later` controls and its `rv-correct` correction box — is deleted; the
  note row (`rv-row rv-note`, `rv-claim`, `rv-answered`) is the one row template that remains.
  The progress-bar clause — `rv-progress`/`rv-track`/`rv-fill`, "N of M answered" — is deleted
  with no replacement. D5's breadcrumb, stage-pill and stop-control clauses (the latter already
  narrowed once by ADR-0019) stand exactly as they were.
- **specs/20260912/06-the-review-page-answers-to-a-design.md**'s question-row rendering is
  retired. The design source it binds `design/chrome-mocks/review.html` to no longer carries a
  question row, a progress bar, or the composer's reason-chip row (`Missing screen / Wrong
  direction / Wrong words / Other`) — the freed composer height goes to the textarea (`rows="5"`,
  `min-height: 104px`). The note row's own `.rv-claim`, `.rv-answered` and `.rv-chip` (an
  existing note's stored `reason`, still rendered as a badge) are untouched.
- **docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md**'s refusal wording is narrowed.
  Both refusals it locked — `approved`'s product-wide sweep and `journey-approved`'s
  per-journey, screen-scoped sweep — lose their "question or" clause: a screen or the whole
  product is blocked by an unresolved **note** alone. Nothing else in that ADR (its three
  narrowed clauses on specs/20260902/10, specs/20260906/04 and specs/20260912/06, all
  concerning project-note scope) is reopened.

Each of the seven gains a single `Amended by: ADR-0023 — <one line>` header line (an
orchestrator edit, per the amendment convention, not a worker's file-contract edit); none is
otherwise rewritten.

## Applies to

The seven documents this record amends, restated plainly for reference:

1. `specs/20260907/08-walk-critic.md` — superseded whole.
2. `specs/20260906/06-sketch-high-fidelity-and-critique.md` — D3/D5 narrowed.
3. `docs/adr/0010-kit-walk-and-client-review.md` — its WALK clause narrowed.
4. `specs/20260906/03-questions-on-the-wireframe.md` — superseded whole.
5. `specs/20260906/04-journey-review-page.md` — D5's question-inspector and progress clauses
   narrowed.
6. `specs/20260912/06-the-review-page-answers-to-a-design.md` — its question-row rendering
   narrowed.
7. `docs/adr/0019-a-whole-product-note-blocks-the-sign-off.md` — its refusal wording narrowed
   (loses the "question or" clause).

## Consequences

- A reader of any of the seven documents who wants to know whether a critic still walks a
  journey, whether a question still gets pinned to a screen, or what still blocks a sign-off,
  finds the `Amended by` line and follows it here rather than trusting a producer or a refusal
  wording the code no longer runs.
- `design/mocks/notes.json` is untouched by this record: an existing `kind: "question"` or
  `kind: "walk"` note is neither deleted nor rewritten, stays on disk exactly as it is, and
  stops being listed, grouped, counted or gated on. `authoredByPerson(n)` — true when
  `n.kind !== 'question' && n.kind !== 'walk'` — is the one predicate every reader applies.
- `.claude/mocks.status.json`'s `journeys[<j>].walked` key stops being written or read; an
  existing key on a host that carries one is inert data, never migrated or stripped.
- No other decision or pinned criterion in any of the seven documents is reopened:
  specs/20260907/08's non-critic content (there is none — its whole subject is the critic);
  specs/20260906/06's kit, canon and theme Decisions; docs/adr/0010's KIT-before-WIREFRAMES
  ordering and its client-review surfaces; specs/20260906/03's non-question content (there is
  none); specs/20260906/04's breadcrumb, artboard and stop-control rulings; specs/20260912/06's
  every other `SHALL CONTINUE TO` pin; and docs/adr/0019's three project-note-scope narrowings
  — all stand exactly as those documents left them.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the
  standing "ADR Applies-to integrity: watch, not work" ruling (ADR-0019's own citation)
  governs this record the same as every other ADR here.
- `design/chrome-mocks/review.html` (specs/20260912/06 D1) and `design/atlas/index.html`
  (regenerated by `spec/scripts/design-atlas.js build`, never hand-edited) both render the
  narrowed inspector — one row template, no progress bar, no composer chips — as the approved
  look; a design source that still showed a question row or a chip row would be wrong against
  the code on day one.

## Dissents

None recorded. The critic walk was weighed at lock as the more defensible of the two retired
producers — a fresh reader with no memory of authoring is a real substitute for user testing —
and building it back in as a no-op or a migration path was considered and rejected at the same
lock (specs/20260913/07's own Rationale: keeping WALK as a pass-through state prints a step
nobody can act on; migrating a question note into a reply thread turns a question into a note
the retired producer would still have authored). No dissent was raised against
specs/20260913/07's Decisions, nor against either of its superseded siblings
(specs/20260913/03, specs/20260913/04) at their own locks.
