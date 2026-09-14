# 0025. A note is a conversation

- Status: accepted
- Date: 2026-09-13
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260913/05-a-note-is-a-conversation.md)
- Applies to: (a) specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D17 — narrowed to
  the box half only; the row and `.rv-pin` half is reversed. (b)
  specs/20260902/10-page-notes-review-loop.md D4 — narrowed: the `notes reply` verb and the
  `reply` field it introduced are retired. (c)
  specs/20260912/06-the-review-page-answers-to-a-design.md — narrowed: its row controls
  (`Looks good` / `Still not right`) and its fixed-orange row border / `.rv-pin` are both
  replaced.
- Amended by: —

## Context

A note already stored a conversation — every reply landed in its `thread` — but the owner had
no way to hold one. The review page's `Still not right` control posted `{id, by}` with no
`text`; the session mount's `/__notes/reopen` refused empty text with a 400 the page's own
`.catch()` silently swallowed, so that control had never worked on a served page. The note
card rendered only the person's half of the exchange, never the session's own words back. A
person could reply at all only once the session had marked a note `addressed` — a plain `open`
note took no second word, so an owner who was not satisfied with the first answer had nothing
to press. Approve and Reject wrote identical records on the owner's own route (neither ever set
`resolution`), so a rejected note could not be told apart from an approved one, let alone
hidden. And every per-note surface — the mock's own box and its badge, the note card's header
badge, the review row's left border, and the row's `.rv-pin` — coloured a note by a different
rule than its neighbors, because each had been built at a different lock against a different
partial reading of `status`.

specs/20260913/05 replaces all of it with one derivation, `turnOf(n)` in
`lib/mocks-notes.js`: `session` (the session owes a word), `you` (the owner owes a word),
`done` (resolved, accepted or waived alike), or `dropped` (resolved, withdrawn — hidden from
every page, kept on disk). Every per-note surface above now reads that one function instead of
carrying its own rule, `POST /__notes/reopen` accepts a reply on any note that is not resolved
(as many times as the owner likes), `POST /__notes/resolve` requires an explicit `verdict` so
Approve and Reject are finally told apart, and `notes open` lists only what still waits on the
session.

Three prior decisions said something this spec now overturns in part, and none of the three is
rewritten in place — the amendment convention this repo already uses (ADR-0018, ADR-0019,
ADR-0024) applies here too.

## Options considered

- **A. Rewrite the three affected documents in place** to read the turn register, the deleted
  `reply` verb and the new row controls directly. Rejected: two of the three are locked specs
  and the third is a standing ADR; silently editing them erases the record of what each session
  actually ruled — specs/20260912/12 D17 in particular was an explicit owner ruling at a
  disposition step, not an oversight, and erasing it would erase the reasoning that was correct
  for its own moment (an open box and an addressed one had gone visually identical, and D17 was
  the fix).
- **B. Leave the three documents standing as text the code now disagrees with.** Rejected: a
  locked Decision or ADR clause a reader can no longer trust against the running code is the
  exact failure the roadmap-amendment convention exists to prevent, and D17 in particular is
  pinned by an executed test (`AC-20260912-12-22`) whose own assertion this spec rewrites —
  leaving D17's prose unmarked would have it contradict the test that once proved it.
- **C. One amendment ADR narrowing or reversing all three in a single record**, each document
  gaining a single `Amended by: ADR-0025` line and none otherwise rewritten. Adopted, for the
  same reason ADR-0024 gives: the documents trace to one change (turnOf's turn register) landed
  by one spec, so one record carries all three.

## Decision

**Option C.** Three documents, and no others, are affected:

- **specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D17** is narrowed. D17 ruled
  that "a box keeps its state colour; the orange register is the review page's chrome only" —
  the box tint and its badge track `colorFor`'s four roles, while `.rv-pin`, `.rv-badge`,
  `.rv-tabpin` and the rail counts stay a fixed orange. specs/20260913/05 D5 reverses the row
  and `.rv-pin` half of that ruling: the review row's left border and its own `.rv-pin` now
  track `turnOf`'s turn colour exactly as the box does — `session` red, `you` amber, `done`
  green — because the owner's original complaint (the same note reading two different colours
  on two surfaces) is exactly what a fixed-orange row/pin still produced once the box itself
  was corrected. The count chips D17 also named (`.rv-badge`, `.rv-tabpin`, the rail counts,
  plus `.nl-card-count`) are **not** reversed: a count is not a single note and has no one
  turn, so D17's reasoning for those five stands untouched.
- **specs/20260902/10-page-notes-review-loop.md D4** is narrowed. D4 gave the session two
  verbs — `notes address` (sets `addressed`) and `notes reply` (sets `reply`, "status stays
  open") — for the two things a session's answer could be: a fix, or a question back. Both
  verbs wrote to the same conceptual place ("the session said something"), so
  specs/20260913/05 D3 deletes `notes reply` and its `replyNote` writer outright: the session
  now always answers with `notes address --id --change`, whether the change is a fix or a
  question, and the note becomes the author's turn either way. A stored `reply` field from
  before this spec is still read (folded into the thread on the next owner reply, D2) but is
  never written again. D4's own remaining clauses — `notes open`'s grouping, `notes address`
  setting `addressed`, the session never holding a resolve subcommand — all stand.
- **specs/20260912/06-the-review-page-answers-to-a-design.md**'s row controls and
  fixed-orange row/pin are both replaced. The `Looks good` / `Still not right` pair D1
  described on an addressed project note (`AC-20260912-06-1`) is retired along with the row
  templates that rendered nothing at all on a plain open note; every `session`- or `you`-turn
  row now carries `Reply`, `Approve` and `Reject` instead (specs/20260913/05 D6). The row's
  left border and `.rv-pin`, fixed orange since D1 authored `design/chrome-mocks/review.html`
  from the then-shipped page, are recoloured by turn as specs/20260912/12 D17's narrowing above
  describes. D1's remaining scope — the file as a reference-only artifact binding via
  `design_source`, never served, never shipped — is untouched; the file is edited again under
  this spec's own File Plan, not superseded.

Each of the three gains a single `Amended by: ADR-0025 — <one line>` header line (an
orchestrator edit, per the amendment convention, not a worker's file-contract edit); none is
otherwise rewritten.

## Applies to

The three documents this record amends, restated plainly for reference:

1. `specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md` D17 — narrowed to the box half
   only; the row and `.rv-pin` half is reversed.
2. `specs/20260902/10-page-notes-review-loop.md` D4 — narrowed: `notes reply` and `reply` are
   retired as a writer, though a legacy `reply` value is still read.
3. `specs/20260912/06-the-review-page-answers-to-a-design.md` — narrowed: its row controls and
   fixed-orange row/pin are both replaced.

## Consequences

- A reader of any of the three documents who wants to know whether the row still shows `Looks
  good`, whether `notes reply` is still a subcommand, or why an open box and its row now share
  one colour, finds the `Amended by` line and follows it here rather than trusting a control,
  a subcommand list, or a colour rule the code no longer runs.
- `design/mocks/notes.json` is untouched by this record: a note already carrying a `reply`
  value keeps it on disk exactly as it was written; `turnOf` and `reopenNote`'s fold are the
  only readers, and neither rewrites `reply` except the fold itself nulling it once its text has
  moved into the thread (specs/20260913/05 D2).
- `lib/walk-page.js`'s client-facing rows and their own colours are untouched: this record, like
  the spec it carries, touches the session-facing chrome only.
- Count chips (`.rv-count`, `.rv-badge`, `.rv-tabpin`, `.nl-card-count`) keep the colours
  specs/20260912/12 D17 gave them; nothing in this record reopens that half of D17.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the
  standing "ADR Applies-to integrity: watch, not work" ruling (ADR-0019's own citation, restated
  by ADR-0024) governs this record the same as every other ADR here.

## Dissents

None recorded. Deleting `notes reply` rather than keeping it as a synonym for `notes address`
was weighed at lock and rejected in the spec's own Rationale: two verbs for "the session said
something" was the duplication this spec exists to remove, and no reader outside this repo's
own tests referenced the verb by name (measured: zero occurrences outside `spec/` and this
plugin's own tests). Giving Reject a way back was also weighed and rejected — the owner's own
words, restated in the spec's Rationale, are that a rejected note is "not wanted," and a new
undo-after-the-fact path would be new machinery nobody asked for.
