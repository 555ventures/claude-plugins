# 0006. Genesis shows the product before it decides anything: wireframes, theme and client review precede the brief, the stack and the roadmap

- Status: accepted
- Date: 2026-09-02
- Archetype: n/a (amendment ADR for this plugin repo) · Audience: n/a
- Deciders: JJ + session (executed dry run on Hearwell, three post-July-2026 research sweeps, no panel)
- Applies to: brief 10 (genesis single proposer: DISCOVERY → MENUS → EXPLORE order, one-screen
  tile funnel), brief 10a (tournament + conventions sequencing after MENUS), brief 02 D8 as
  amended by ADR-0003 (sketch authorship: session ≤5 surfaces + Fable dispatch; shell canon
  authored *before* mocks as bootstrap), brief 20 (shell-composed mocks: `shell sync` fed from
  a bootstrap canon), brief 08 (sketch tier as the atlas's fidelity). D-numbers are
  enumerated at plan time of brief 22.
- Amended by: —

## Context

The current genesis order commits the framework, scaffold, roadmap and design lock before
the user has seen more than one themed screen; the whole-product picture arrives last, at
sketch tier, partly authored by a subagent. On Hearwell this produced sixteen mocks the user
found unattractive and a product materially different from the one in their head, on a
framework (Next.js) chosen without asking whether a native app was coming — it is.

A manual dry run of the reversed order on 2026-09-02 (Hearwell, `design/wireframes/`,
`LEDGER.md`) caught fourteen misunderstandings before any brief or architecture existed,
including a rule lifted verbatim from a brief the user had ratified as prose and rejected the
moment it was rendered. The user's verdict: "this flow is much much better than existing
genesis flow." The catches were made by the user looking at screens; none by the session
noticing uncertainty. Research (post-July-2026) supports canon-before-screens, single-author
shared-state work, and curated client review; it does not name whole-product-mocks-first as a
practice, and one dated essay warns that polished prototypes pre-commit scope.

## Options considered

- **A. Keep the order; add reference-pointing and a longer interview** — leaves the
  whole-product picture last; every misunderstanding still surfaces after the stack is locked.
- **B. Reorder inside genesis: seed (product facts) → shapes → wireframes → theme → skin →
  client review → brief from the set → stack → scaffold → roadmap; provenance ledger as the
  advance gate; one hand for all mock authorship; theme as recomposition; shell and components
  extracted from the set** — the executed dry run. Cost: a longer design stage before any code,
  and every design turn carries genesis's fixed load (already ~half a context window at start).
- **D. B, with the design stage as its own command** — a standalone design command with its own
  file-derived driver and per-journey / per-direction checkpoints; genesis gates its BRIEF state
  on the command's approved set. Same order, same gates; the open-ended, many-turn design loop
  no longer pays genesis's context load, can revisit any stage in any order, and serves
  non-greenfield hosts through the same command. Feedback lives on the pages (per-state and
  per-project notes stored beside the mocks), the viewer chrome and wireframes share one shadcn
  token set in two registers, and everything works over SSH (static files, port-forward line,
  headless self-look).
- **C. B without the ledger gate** — relies on "ask when unsure", which the dry run showed
  never fires.

## Decision

D. The product is shown, corrected and approved in a standalone design command before genesis
decides anything; genesis starts its BRIEF state only from an approved set. The provenance ledger, not the
session's judgment, gates each advance: a product-kind claim that is invented or unconfirmed
blocks the step; process claims are listed, never asked. The host research brief is a
required, driver-checked read before the first screen. No subagent authors or edits a mock.
Theme is recomposition on the approved wireframe's structure and facts, never a stylesheet
over wireframe markup. The shell canon and component inventory are extracted from the
composed set and feed the skeleton; ADR-0003's bootstrap-before-mocks order and its Fable
dispatch authorship are superseded, its drift-check mechanism kept. Client sign-off is on
understanding; the written brief, generated from the set plus a non-UI coverage checklist,
holds scope. The polished-prototype risk is answered by that split, not by lowering fidelity.
Review feedback is written on the served pages at two scopes — a mock state or the project —
never per element and never in chat; a project note is answered with a canon change or new
directions before any per-screen work; the note's author resolves it, the session only marks
it addressed. One token set (shadcn defaults as plain CSS) styles the tool chrome in full and
the wireframes flat; product tokens exist only from theme onward. Every artifact is static
HTML on disk and every stage is reachable over SSH.

## Consequences

- Briefs 10, 10a, 20 and ADR-0003 carry an "Amended by: ADR-0006 (brief 22)" backlink; the
  EXPLORE tile funnel and the separate DESIGN-lock state are retired once brief 22 ships, and
  `/spec:genesis` loses its design states to the new command (working name `/spec:mocks`).
- `/spec:atlas` remains the derived, never-required view (2026-08-31 ruling); `/spec:sketch`
  remains the per-brief entry, writing into the same workspace under the same gates.
- `design-atlas.js serve` grows the notes endpoints; the notes layer is injected at serve time
  so no mock file ever carries feedback markup.
- The question-style gate's `derive` verdict gains a product-fact exemption (it auto-picked a
  product fact on Hearwell because a document cited the subject).
- A misunderstandings ledger joins the escape ledger as a pipeline record, so the next
  retool of genesis is data-driven rather than anecdotal.
- Hearwell continues by hand from its `RESUME.md` until the brief ships; nothing in the dry
  run is throwaway.
