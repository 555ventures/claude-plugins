# 0026. Every mock has a page you can mark

- Status: accepted
- Date: 2026-09-13
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260913/06-every-mock-has-a-page-you-can-mark.md)
- Applies to: (a) specs/20260912/05-the-atlas-answers-to-a-design.md D4 — narrowed: the
  journey-owned/other card split it drew, and the lightbox it kept for the screens no journey
  claims, are both retired. (b) specs/20260905/01-picks-on-the-atlas-page.md D3 — narrowed: the
  compare-table candidate card's own `open ↗` link is deleted, and the lightbox bar's `Pick this`
  copy the compare table's cards once opened into no longer exists.
- Amended by: —

## Context

The atlas's own click model split a screen into three destinations depending on who had claimed
it: a journey-owned mock opened that journey's review page at the screen's own board; a mock no
journey claimed, and every shape, opened a same-page lightbox with a static frame and no way to
mark anything; and every card, journey-owned or not, also carried an `open ↗` link straight to
the raw mock file — a third surface the owner could look at but never write on. Two of those
three destinations could not be marked at all, and clicking a card first meant remembering which
of the three it would do.

specs/20260913/06 gives every card, screen or shape, the same one destination: a screen page at
`/screen/<label>.html`, built from `lib/review-page.js`'s existing board/inspector parts
(`buildScreenPage`), served by a new route that resolves a label to a mock or a shape file. The
lightbox, its keyboard and click handlers, `__full`, and every `open ↗` anchor — client-rendered
and server-rendered alike — are deleted outright, in `design-atlas.js`, `lib/stop-block.js` and
`lib/notes-layer.browser.js`. The project panel's jump pill, which used to gate on
`window.__lbOpen` to decide whether it could open anything, now renders a plain link to the
screen's page whenever the screen is drawn on the served atlas.

Two prior decisions describe the arrangement this spec removes, and neither is rewritten in
place — the amendment convention this repo already uses (ADR-0018, ADR-0019, ADR-0024, ADR-0025)
applies here too.

## Options considered

- **A. Rewrite the two affected Decisions in place** to describe the screen-page route and the
  deleted lightbox directly. Rejected: both are locked specs, and silently editing a locked
  Decision erases the record of what each session actually ruled, including the reasoning that
  was correct for its own moment (specs/20260912/05 D4's split was the fix for a lightbox that
  showed the same static frame bigger and a review page reachable only by guessing its URL;
  specs/20260905/01 D3's `open ↗` link was the only way to reach a candidate's raw file at all,
  before this spec gave every candidate a page instead).
- **B. Leave the two documents standing as text the code now disagrees with.** Rejected: a locked
  Decision a reader can no longer trust against the running code is the exact failure the
  roadmap-amendment convention exists to prevent — both Decisions are pinned by executed tests
  (`AC-20260912-05-2`, `AC-20260905-01-9`) this spec's own build rewrites.
- **C. One amendment ADR narrowing both in a single record**, each document gaining a single
  `Amended by: ADR-0026 — <one line>` header line and neither otherwise rewritten. Adopted, for
  the same reason ADR-0024 and ADR-0025 give: both documents trace to one change (every card
  opens a markable screen page instead of a lightbox or a raw-file link) landed by one spec, so
  one record carries both.

## Decision

**Option C.** Two documents, and no others, are affected:

- **specs/20260912/05-the-atlas-answers-to-a-design.md D4** is narrowed. D4 ruled that a
  journey-owned mock card wraps its frame in a shotlink to that journey's review page, while a
  mock with no declaring journey — shapes, compare candidates — "keeps the lightbox and gets no
  link." specs/20260913/06 D3 reverses the second half: every mock card and every shape card,
  claimed or not, now wraps its frame in a shotlink to `/screen/<label>.html`; D6 deletes the
  lightbox itself, so nothing is left for an unclaimed card to fall back to. D4's own first half —
  a card's job is recognition, the decision happens on a review-style page — stands; only the
  destination for the unclaimed case changes.
- **specs/20260905/01-picks-on-the-atlas-page.md D3** is narrowed. D3's compare-table card
  rendered `open ↗`, a link to the candidate's raw un-`?clean` file, alongside its frame; the
  same spec's D4 let a lightbox opened from inside that compare table flip between candidates and
  carry its own `Pick this` button. specs/20260913/06 D3 wraps a compare-table cell whose
  candidate path starts `mocks/` or `shapes/` in the same shotlink every other card gets, to
  `/screen/<label>.html`; D4 deletes the `open ↗` anchor and the lightbox (and the `Pick this`
  bar copy it carried) outright. The column header's own `data-decide="pick"` button — a
  separate control from the lightbox bar's copy — is untouched and still decides the pick.

Each of the two gains a single `Amended by: ADR-0026 — <one line>` header line (an orchestrator
edit, per the amendment convention, not a worker's file-contract edit); neither is otherwise
rewritten.

## Applies to

The two documents this record amends, restated plainly for reference:

1. `specs/20260912/05-the-atlas-answers-to-a-design.md` D4 — narrowed: the journey-owned/other
   card split is retired; every card, claimed or not, now links to its own screen page, and the
   lightbox it kept for the unclaimed case no longer exists.
2. `specs/20260905/01-picks-on-the-atlas-page.md` D3 — narrowed: the compare-table candidate
   card's own `open ↗` link is deleted, and the lightbox bar's `Pick this` copy those cards used
   to open into is gone along with the lightbox itself; the column header's own `Pick this`
   button is untouched.

## Consequences

- A reader of either document who wants to know whether an unclaimed card still opens a
  lightbox, or whether a compare-table card still links to a raw file, finds the `Amended by`
  line and follows it here rather than trusting a control or a link the code no longer renders.
- The compare table's own `data-decide="pick"` button, and the whole pick-decision flow
  (`POST /__picks/decide`, the stop record, re-pick until consumed) described by
  specs/20260905/01 D3/D4/D5, are untouched by this record — only the candidate card's frame
  link and the lightbox's own `Pick this` copy are retired.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the
  standing "ADR Applies-to integrity: watch, not work" ruling (ADR-0019's own citation, restated
  by ADR-0024 and ADR-0025) governs this record the same as every other ADR here.

## Dissents

None recorded. Deleting the lightbox outright, rather than keeping it as a fallback for some
future card shape with nowhere else to go, was weighed at lock and rejected in the spec's own
Rationale: the owner chose, when asked, that shape cards open a markable page too, which is why
every card — screen or shape — now has one, leaving no case the lightbox was still needed for.
