# 0019. A whole-product note blocks the sign-off, not every journey

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/07-a-whole-product-note-blocks-the-sign-off.md D5)
- Applies to: (a) specs/20260902/10-page-notes-review-loop.md D5 and AC-20260902-10-6 — the
  clause "`journey-approved` … refuse while any project note is not `resolved` (naming it
  first)" is narrowed to "`approved` refuses while any project note is not `resolved`";
  `approved`'s own rule and the per-journey unresolved-note rule are unchanged. (b)
  specs/20260906/04-journey-review-page.md D5 — the clause "disabled with title `<k> open
  item(s) block approval` while any question is unanswered or any note unresolved" is narrowed
  to "…while any question or note on this journey's screens is unanswered or unresolved". (c)
  specs/20260912/06-the-review-page-answers-to-a-design.md AC-20260912-06-2 — its second clause,
  "the header's approve-block title SHALL CONTINUE TO name the same total it counts (`3 open
  items block approval`)", is narrowed to name the same **journey-scoped** total it counts
  (`2 open items block approval` on that fixture); the invariant that the title names the total
  the page computed is unchanged, and the AC's rail-row half is untouched.
- Amended by: ADR-0023 (`approved`'s and `journey-approved`'s refusals both lose their
  "question or" clause — a screen or the whole product is blocked by an unresolved note alone —
  see the ADR's Applies to)

## Context

On a real project (Hearwell, 2026-09-12) a note filed against the whole product — "the
navigation is wrong everywhere," raised from the notes layer's own composer — blocked the
approval of every journey, on the page and at the command line alike. Four such notes made all
five journeys unapprovable regardless of whether any of them had anything to do with the note,
and the only way forward was to resolve a product-wide question before any per-journey review
could close.

That behavior was exactly what specs/20260902/10 D5 and specs/20260906/04 D5 locked down: a
project-scope note blocked every mark that read notes, journey marks included, and the review
page disabled its `Approve journey` button on the same combined count. The owner ruled on
2026-09-12 that a whole-product note should block the product's own sign-off — the `approved`
mark — and nothing else; a journey approves on its own screens' notes alone.
specs/20260912/07-a-whole-product-note-blocks-the-sign-off.md closes that gap: the page's gate
and the driver's `journey-approved` refusal both narrow to this journey's screen-scoped items,
the driver's project-note sweep moves to `handleApproved()` alone, and the page states the
remaining product-wide count when a journey is otherwise clean. The build surfaced a third
locked promise the same narrowing overturns: specs/20260912/06's own AC-20260912-06-2 pinned the
approve-block title as naming the combined mock-and-project total (`3 open items block
approval` on its fixture) — the exact count D1 replaces with a journey-scoped one. All three
narrowed clauses are locked decisions in closed specs — one of them (specs/20260902/10 D5)
carrying its own AC, one of them (specs/20260912/06 AC-20260912-06-2) a `SHALL CONTINUE TO` pin
— so they are narrowed by an accepted record rather than a silent edit, the precedent set by
ADR-0015, ADR-0017 and ADR-0018.

## Options considered

- **A. Rewrite specs/20260902/10 D5, specs/20260906/04 D5 and specs/20260912/06
  AC-20260912-06-2 in place** to read the narrowed rule. Rejected: all three are locked in closed
  specs (one a Decision, one a `SHALL CONTINUE TO` pin); silently editing them erases the account
  of what each session actually ruled or asserted and why a later owner ruling overturned part of
  it.
- **B. Leave all three clauses standing as text the code now disagrees with**, relying on the new
  behavior being correct in practice. Rejected: a locked Decision — or a pinned AC whose test
  would otherwise assert a count the page no longer computes — that a reader can no longer trust
  against the running code is the exact failure the roadmap-amendment convention exists to
  prevent.
- **C. Narrow all three clauses via one amendment record**, each amended spec gaining a single
  `Amended by: ADR-0019` line and none rewritten. Adopted.

## Decision

**Option C.** Three clauses, and no others, are narrowed:

- specs/20260902/10-page-notes-review-loop.md D5's project-note clause — "`journey-approved` …
  refuse while any project note is not `resolved` (naming it first)" — is narrowed to "`approved`
  refuses while any project note is not `resolved`." AC-20260902-10-6's matching assertion
  narrows the same way. `approved`'s own product-wide rule and D5's per-journey
  unresolved-note rule (every note on that journey's screens must be `resolved`) are unchanged.
- specs/20260906/04-journey-review-page.md D5's disabled-title clause — "disabled with title `<k>
  open item(s) block approval` while any question is unanswered or any note unresolved" — is
  narrowed to "…while any question or note **on this journey's screens** is unanswered or
  unresolved." Every other clause of D5 (breadcrumb, stage pill, progress line, stop-control
  wiring) stands untouched, including the breadcrumb narrowing ADR-0018 already recorded against
  the same spec.
- specs/20260912/06-the-review-page-answers-to-a-design.md AC-20260912-06-2's title clause —
  "the header's approve-block title SHALL CONTINUE TO name the same total it counts (`3 open
  items block approval`)" — is narrowed to name the same **journey-scoped** total it counts
  (`2 open items block approval` on that fixture). The invariant the AC actually asserts — the
  title names the total the page computed — is unchanged; only the total itself changed, by D1.
  The AC's rail-row half (`[data-rv="count"][data-screen="__project"]` reading `1`, then `0` once
  resolved) is untouched.

specs/20260902/10, specs/20260906/04 and specs/20260912/06 each gain a single
`Amended by: ADR-0019` line and are not otherwise rewritten. specs/20260906/04 carries two
`Amended by` lines after this record (ADR-0018 from specs/20260912/06, ADR-0019 from here) — the
precedent for more than one backlink on a single spec is ADR-0010's own backlink set.

specs/20260912/07's own D1–D4 carry the executable half of this ruling — the page's `openAll`
scoping, `review.browser.js`'s `openScoped` counter, the `rv-projwait` line, and the driver's
`requireProjectNotesResolved()` split — this record narrows only the three locked-spec sentences
that described the old, wider rule.

## Consequences

- A reader of specs/20260902/10, specs/20260906/04 or specs/20260912/06 who wants to know what
  blocks a journey's approval, or what its approve-block title names, now finds the `Amended by`
  line and follows it here, rather than trusting a project-note rule or a title count the code no
  longer applies at that mark.
- No other decision or pinned criterion in any of the three amended specs is reopened:
  specs/20260902/10's note shape, layer contract, driver subcommands, triage bins and
  client-review wording; specs/20260906/04's breadcrumb, artboard, and inspector rulings (the
  breadcrumb already narrowed once, by ADR-0018); and specs/20260912/06's every other
  `SHALL CONTINUE TO` pin, including AC-20260912-06-2's own rail-row half — all stand exactly as
  those specs left them.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the
  standing "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured
  2026-09-08; build the checker at dangling-reference:3) governs this record the same as every
  other ADR here.
- `design/chrome-mocks/review.html` (specs/20260912/06 D1) renders the narrowed approve gate and
  the new `rv-projwait` line as the approved look, per specs/20260912/07 D6 — a design source
  that still showed the old combined-count gate would be wrong against the code on day one.

## Dissents

None recorded — the amendment narrows three locked clauses to match an explicit 2026-09-12 owner
ruling, and no dissent was raised against specs/20260912/07's Decisions at lock.
