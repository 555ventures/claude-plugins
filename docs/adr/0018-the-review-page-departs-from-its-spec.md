# 0018. The review page departs from its spec

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/06-the-review-page-answers-to-a-design.md D7)
- Applies to: specs/20260906/04-journey-review-page.md — two clauses and no others: (a) D5's
  breadcrumb literal `<product> / Mocks / <n> · <journey title>`, which becomes
  `<product> / <n> · <journey title>` (the product name a link to the atlas index); (b)
  AC-20260906-04-6's final clause, asserting that `Send` with scope `Whole project` posts
  `{scope:"project", screen:null …}` from the review page's own composer.
- Amended by: —

## Context

A full day of UI work on the journey review page on 2026-09-12 left it with no test carrying
either promise, and both are now text the shipped code disagrees with:

- The breadcrumb no longer carries a `Mocks` segment. The page's own header comment and every
  screenshot the owner approved that day show `<product> / <n> · <journey title>`, with the
  product name linking to the atlas index — the intermediate segment was dropped in the same
  session that added the link.
- The composer's scope toggle — `Whole project` vs `This screen` — is gone from the rendered
  markup. `renderComposer` in `spec/scripts/lib/review-page.js` emits no `[data-rv="scope"]`
  (verified by grep, zero occurrences), so a note filed from this page's composer always carries
  the focused screen; a project-scope note is raised from the notes layer's own composer instead,
  which keeps its own `Whole project` toggle untouched (specs/20260906/03 D5).

specs/20260912/06 closes the coverage gap this left behind (D6: every surviving criterion on the
page becomes an opt-in `SHALL CONTINUE TO` pin), and these two clauses are the ones no pin can
carry honestly, because the code they describe no longer exists. Rather than rewrite
specs/20260906/04 in place — which would misstate what the 2026-09-06 session actually decided
and built — this record narrows it, the way ADR-0015 narrowed specs/20260901/01 D12.

## Options considered

- **A. Rewrite specs/20260906/04 D5 and AC-6 in place** to match the shipped page. Rejected: a
  locked spec's Decisions table is a record of what was decided when, not a living description of
  current behavior; silently editing it erases the account of why the breadcrumb and the composer
  changed.
- **B. Leave both promises standing as text the code contradicts**, relying on their tests having
  already expired. Rejected: that is the exact failure specs/20260912/06 exists to end — a
  document nobody can trust because nothing checks it against the code.
- **C. Retire both clauses via an amendment record**, narrowing specs/20260906/04 with a single
  `Amended by:` backlink and carrying the account here. Adopted.

## Decision

**Option C.** specs/20260906/04-journey-review-page.md D5's breadcrumb literal and
AC-20260906-04-6's final composer-scope clause are retired, narrowed as follows:

- D5's breadcrumb is no longer `<product> / Mocks / <n> · <journey title>`. It is
  `<product> / <n> · <journey title>`, with the product name a link (`a.rv-home`) to the atlas
  index at `<prefix>/`. No intermediate segment. specs/20260912/06 AC-20260912-06-4 pins this.
- AC-20260906-04-6's assertion that the review page's composer can send a `Whole project`-scoped
  note is retired. The composer always files against the focused screen (`{scope: "mock", screen:
  <label>, …}`); a project-scope note comes from the notes layer's composer, whose own
  `Whole project` toggle (specs/20260906/03 D5, `allowProjectToggle`) is unchanged and unaffected
  by this record. specs/20260912/06 AC-20260912-06-11 pins the screen-scoped send that remains;
  D10 of the same spec deletes the now-dead `scopeMode` state machine and `[data-rv="scope"]`
  wiring `renderComposer` never populated.

specs/20260906/04 gains a single `Amended by: ADR-0018` line and is not otherwise rewritten. Every
other clause of D5 and every other AC-20260906-04-6 assertion (row shape, filter controls,
keyboard map, fold behavior) stands untouched.

## Consequences

- specs/20260906/04's breadcrumb and composer-scope promises are no longer text the code
  contradicts; a future reader follows the `Amended by:` line here rather than trusting a locked
  Decision that has quietly gone stale.
- No script in this repo adjudicates ADR shape or dangling `Applies to:` references — the standing
  "ADR Applies-to integrity: watch, not work" ruling (0/41 dangling measured 2026-09-08; build the
  checker at dangling-reference:3) governs this record the same as every other ADR here.
- `design/chrome-mocks/review.html` (specs/20260912/06 D1) renders the narrowed breadcrumb and the
  screen-only composer as the approved look, not the retired ones — a design source that repeated
  the retired shapes would itself be wrong against the code on day one.
