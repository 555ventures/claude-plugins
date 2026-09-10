---
date: 2026-09-09
status: superseded
superseded_by: "ADR-0013 — the client route serves a journey player, never the artboard grid in client mode"
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260907/10-client-review.md]
depended_on_by: []
brief: 22a
---

# The served client view: a whole-project entry, product-only rows, and before/after under every fixed note

## Goal

Spec 10 makes the client route enforce origin, capture, closure and waiver on the notes file,
but nothing renders on it. This spec serves the client's pages: `/client/index.html` — the
whole-project entry (every journey, its open questions and client notes) — and
`/client/review/<j>.html`, the existing journey review page in client mode: product-kind
questions and the client's own notes only, the walk lane and the session's internal notes
hidden, no approve/change control (the client is never the decider), a before/after strip
under every `addressed` client note, Withdraw on an open note and Accept on an addressed one,
and the composer posting to the client route. Framing follows the project's own first declared
viewport; the template `design/targets.json` becomes desktop-first for new projects, and a
responsive project's client can switch viewports with the same buttons the atlas toolbar has.
Done means a client with the exposed address can read, answer, note and close without ever
seeing a walk finding, a session note, or a control that belongs to the approver.

**Lock precondition (ADR-0012, brief 22a):** one real client is observed on the existing
review page of a real host before this spec locks. The seven-day waiver window and the
withdraw-not-decline rule are the first things that observation may change, and the client
page's shape follows what that client actually did (memory: prototype before plan for
UI-bearing specs — read the forks from reactions).

[NEEDS CLARIFICATION: observe one real client on a real host's existing review page — what
they clicked, whether they left notes at all or only answered questions, and whether the
seven-day window and withdraw-not-decline held; fold the result into D2/D4 before locking]

## Decisions (draft — every row re-read against the observation before lock)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js` serves `GET /client/index.html` from a new pure builder `lib/client-page.js` `buildClientIndex({ seed, notes, ledger, prefix })`: product name, one row per journey in seed order with `<n> questions open · <m> notes open` counts derived from the spec 10 client-route filter, each linking `/client/review/<j>.html`; `<meta name="notes-scope" content="project">` and the notes layer in client mode (D5) | The whole-project entry the ADR names; counts are derived, never stored |
| D2 | `lib/review-page.js`'s `buildReviewPage` gains `client: true`: the inspector lists questions and client-origin notes only (`originOf`), the approve/change stop block is omitted, an `addressed` client note renders `<figure data-rv="before-after">` with the two capture images (`/mocks/captures/<id>.before.png` and `.after.png`) side by side under the row, an `open` client note renders a Withdraw button and an `addressed` one an Accept button, a reply renders under the note, and the rail's screen counts use the same filter; served at `GET /client/review/<j>.html` | ADR-0012: "the served page renders before and after side by side under the note"; the client is never the decider |
| D3 | `lib/review.browser.js` posts to `<prefix>/client/__notes/*` when the page's `<meta name="notes-route" content="client">` is present, wires Withdraw/Accept to `POST /client/__notes/resolve`, and never renders the stop control in client mode | One script, one meta flag — no second browser file |
| D4 | The client page frames artboards at the project's first declared viewport (spec 10 D5's rule) and, when `design/targets.json` declares more than one viewport, renders the atlas toolbar's viewport buttons so a responsive project's client can re-frame every artboard; `spec/templates/design-targets.json` reorders to desktop, tablet, mobile (q94 option c). No `/spec:doctor` line-item for hosts whose first viewport is narrower than their widest (ruled 2026-09-09: the flow is unused so far; framing depends on the project — some are responsive and need both) | The first viewport is the project's own primary device; the buttons cover responsive projects without a second rule |
| D5 | `lib/notes-layer.browser.js` in client mode (`<meta name="notes-route" content="client">`) hides the Resolve button on every non-client note, shows Withdraw/Accept on client-origin rows, and the composer posts to the client route | The mock pages a client may open from the index carry the same rules as the review page |
| D6 | `spec/doctrine/mocks.md` § Mocks: Look and Serve gains the client route paragraph (the address is exposed by the user, the page set is `/client/index.html` + `/client/review/<j>.html`, what the client sees and never sees); `spec/commands/mocks.md` § Client review names the index URL the driver prints | Doctrine binding home |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |

Orchestrator duty: load the `frontend-design` skill before authoring `lib/client-page.js` or
any review-page markup (memory: the skill binds our own UI; the review page's zinc register is
the base). Authoring of the client page is in-session, never a subagent.

## File Plan (draft)

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/client-page.js | CREATE | scripts | D1 `buildClientIndex` — pure, byte-deterministic |
| spec/scripts/lib/review-page.js | MODIFY | scripts | D2 client mode: filter, before/after figure, Withdraw/Accept, no stop block, notes-route meta |
| spec/scripts/lib/review.browser.js | MODIFY | scripts | D3 client route posting + Withdraw/Accept |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5 client mode |
| spec/scripts/design-atlas.js | MODIFY | scripts | D1/D2 routes `/client/index.html`, `/client/review/<j>.html`; D4 viewport buttons on the client page |
| spec/templates/design-targets.json | MODIFY | doctrine | D4 desktop-first order |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6 client route paragraph |
| spec/commands/mocks.md | MODIFY | doctrine | D6 index URL |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump |
| tests/mocks/client-page.test.js | CREATE | tests | AC-20260907-11-1 … AC-20260907-11-6 |
| tests/design-atlas.test.js | MODIFY | tests | the template-order pin, if one exists, retagged AC-20260907-11-7 |

## Behavior (draft)

A client opens `<address>/client/index.html`: the product name, a list of journeys with what is
still open in each, one link per journey. On a journey page they see each screen at the
project's primary viewport with its state tabs, and an inspector holding only what concerns
them: the session's "I assumed …" questions with Yes / No, it's… / Later, and their own notes
with the session's replies, a before/after image pair once a note is fixed, Withdraw on a note
they no longer need, Accept on a fixed one. Nothing the walk critic found and nothing the
session wrote to itself is on the page. There is no approve button anywhere on the client
route.

## Acceptance Criteria (draft — numbered on lock)

- **AC-20260907-11-1**: WHEN `GET /client/index.html` is served over a seed with two journeys
  THE SYSTEM SHALL render one `<a data-cl="journey" href="/client/review/<j>.html">` per
  journey in seed order with `data-questions="<n>"` and `data-notes="<m>"` counts that exclude
  walk and session-origin notes
- **AC-20260907-11-2**: WHEN `GET /client/review/<j>.html` is served THE SYSTEM SHALL render no
  `data-rv="row"` for a walk or session-origin plain note, no stop block, and one
  `data-rv="before-after"` figure under each `addressed` client note carrying both image paths
- **AC-20260907-11-3**: WHEN `GET /client/review/<j>.html` is served THE SYSTEM SHALL carry
  `<meta name="notes-route" content="client">` and the served `review.js` SHALL post to
  `/client/__notes/…` (executed in the Chrome harness: a Withdraw click lands
  `resolution: "withdrawn"` on disk)
- **AC-20260907-11-4**: WHEN `design/targets.json` declares more than one viewport THE SYSTEM
  SHALL render the viewport buttons on the client page; with one viewport it SHALL render none
- **AC-20260907-11-5**: WHEN `spec/templates/design-targets.json` is read THE SYSTEM SHALL list
  `desktop` first, `tablet` second, `mobile` third
- **AC-20260907-11-6**: WHEN `GET /review/<j>.html` (the session's page) is served THE SYSTEM
  SHALL CONTINUE TO render every note and the stop block

## Assumptions (escalation triggers)

- A1: The observed client's behaviour does not contradict the ADR's note machinery — **if
  false** (clients only answer questions): D2/D3/D5 shrink to the question inspector and the
  before/after figure is dropped; the question close condition becomes the whole gate (ADR-0012
  Consequences).
- A2: `review-page.js` stays under its size-ratchet ceiling with the client branch — **if
  false**: the client-mode renderers move into `lib/client-page.js` and `review-page.js`
  imports them.

## Rationale

Deliberately a draft. ADR-0012 orders the observation before this lock, and the queue item for
this brief carries the same rule. Everything above is the smallest page set that makes spec 10
observable; the observation decides whether the note half of it survives at its current size.

## Canonical Delta

(written at lock)
