# 0016. A screen appears on the atlas once

- Status: accepted
- Date: 2026-09-12
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (specs/20260912/05-the-atlas-answers-to-a-design.md)
- Applies to: specs/20260902/07-mocks-command-driver.md — two clauses:
  - D15's "each mock card renders one frame per `data-state-btn` state (activated on load when
    served, same-origin)" becomes "each mock card renders one frame per screen, with the declared
    state count in the card's meta line."
  - AC-20260902-07-14's "two frames for `a` (`data-state="busy"`, `data-state="empty"`) and one
    for `b`" becomes "one frame each for `a` and `b`, `a`'s card meta carrying `2 states`."

  Every other clause of D15 stands — the seed-journey grouping, the persona line, the `shapes`
  section, the `references/` skip — and this record touches neither.
- Amended by: —

## Context

specs/20260902/07 D15 gave the atlas one full-size `<iframe>` per `data-state-btn` state a mock
declares: a nine-state screen rendered nine full-height copies of the same document, stacked in
its card. That shape shipped, and on 2026-09-12 the owner called the resulting page unusable — a
single dense screen made the grid nine screen-heights tall before the next screen appeared. The
same day's repair changed the renderer to one frame per screen, the state count moved into the
card's meta line instead, but no spec ever recorded the change: specs/20260902/07 D15 and its
AC-20260902-07-14 kept asserting the old per-state shape, text the code had already stopped
agreeing with — a promise no test was watching for six days.

## Options considered

- **A. Rewrite D15 and AC-20260902-07-14 in place.** Rejected: specs/20260902/07 is `done`, and
  this repo's amendment convention (ADR-0015) records a locked spec's contradicted clause as a
  backlinked record rather than a silent rewrite of shipped text.
- **B. Leave D15 as written and let the atlas's own rendering tests carry the true behavior with
  no doctrine acknowledgment of the reversal.** Rejected: a laundered AC that keeps reading as a
  live promise sends a future reader to code that disagrees with it, the exact defect this record
  exists to close.
- **C. Record the reversal as an amendment ADR, narrowing the two contradicted clauses and leaving
  every other clause of D15 untouched.** Adopted.

## Decision

**Option C.** D15's frame-per-state clause is narrowed from "each mock card renders one frame per
`data-state-btn` state (activated on load when served, same-origin)" to "each mock card renders
one frame per screen, with the declared state count in the card's meta line." AC-20260902-07-14's
worked example is narrowed to match: for a root whose `a.html` declares states `busy` and `empty`
and `b.html` declares none, `design-atlas.js build` emits one frame each for `a` and `b`, with
`a`'s card meta line carrying `2 states` and `b`'s carrying no state clause at all.

The per-state frames are not restored under any flag. Every other clause of D15 stands: the
seed-journey grouping with the persona line, the `shapes` section for `design/shapes/*.html`, and
the `references/` skip.

## Consequences

- specs/20260902/07-mocks-command-driver.md is not rewritten in place — it gains only the one
  `Amended by: ADR-0016` backlink line, and this record is the durable account of what changed and
  why.
- The true behavior — one frame per screen, state count in the meta line — is the one
  specs/20260912/05-the-atlas-answers-to-a-design.md tests and ships; this record and that spec's
  own Decisions describe the same reversal from two sides.
- A future reader of specs/20260902/07 D15 sees the `Amended by:` line and follows it here rather
  than trusting the superseded per-state clause.
