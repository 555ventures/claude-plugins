# 22a — Mocks is wireframes: a gray comprehension check with the session's doubt on the screen, theme picked on the dense screens, high fidelity per brief in sketch

Phase: P2 · Depends on: 22 · Amends: 22 (the SEED → … → SKIN → REVIEW → APPROVED order ratified by ADR-0006 — via ADR-0008) · Primary workspaces:
spec/scripts/{mocks-driver,design-atlas}.js, spec/scripts/lib/{mocks-notes,notes-layer.browser,review-page,review.browser}.js,
spec/doctrine/{mocks,design}.md, spec/commands/{mocks,sketch}.md, spec/agents/design-critic.md, spec/templates/mocks/viewer.css, tests ·
Risk: T2 (the mocks state machine loses two states; every mark keeps its on-disk checkpoint, a host mid-SKIN derives THEME or SIGNOFF from disk and continues) ·
Design stage: yes · Expected specs: 5

## Why this brief

Successor to brief 22, minted 2026-09-06 from JJ's ruling on the atlas index session. Brief 22
ratified (ADR-0006) that genesis shows the product before deciding anything, and its dry run on
Hearwell recorded fourteen misunderstandings — every one caught by the user looking at screens,
none by the session noticing its own uncertainty. The plugin then built the whole ladder to
production fidelity inside `/spec:mocks`: theme directions recomposed across ≥3 screens, every
journey skinned, a REVIEW state with a named decider. That was the session's extrapolation, not
the ruling. JJ (2026-09-06): "spec:mocks whole purpose is to check if you understand what I need
visually" — a gray, structurally honest, whole-product pass, and nothing more. Polish before the
brief pre-commits scope (ADR-0006 already warns of it); the 2026 field reads the same way
(whole-product high fidelity up front has no defender; MVP-scoped, whole-product-shallow is the
reported practice).

Three further facts shape the work. The provenance ledger already records every assumption the
session made, and its gate already blocks unconfirmed rows — but the rows sit in a markdown file
the user never opens. The page-notes store already anchors a note to a screen and a state, and
`journey-approved` already refuses on an unresolved note. And the ledger's grammar matches its
header cell for cell (executed 2026-09-06: a table with one added column parses as "no header
found"), so provenance must be derived from the notes store, never added as a column.

## Result

`/spec:mocks` is SEED → SHAPES → WIREFRAMES → THEME → SIGNOFF → APPROVED. Every journey is a gray
wireframe carrying its empty, loading and error states as gray boxes; SKIN, REVIEW, `journey-skinned`,
`review-opened`, `journey-reviewed` and `--decider` are gone. THEME composes each direction on the
seed's dense screen (a second screen at most) and picks one; `design/tokens.css` is its output and the
shell canon is extracted from the picked dense screen as before. While drawing a journey the session
pins every inferred or invented product assumption as a **question on the screen** it belongs to; the
served page shows it as "I assumed … rejected …" with Yes / No, it's… / Later, an answer writes the
ledger row's status and resolves the note, and `journey-approved` refuses while a question is
unanswered. The client sends free-form messages at two scopes (whole project | this screen) with a
reason (missing screen, wrong direction, wrong words, other); each blocks approval until the session
addresses it. A three-pane review page per journey (screens rail · artboards with state tabs ·
question inspector with keyboard flow) is the look surface `stop open journey:<j>` points at, authored
under the frontend-design skill on the viewer's zinc register. Catch provenance (question · note ·
unlinked) is derived from the notes store and printed by `ledger counts`, so the next dry run measures
whether the questions earn their place. `/spec:sketch` owns high fidelity per brief in the picked
theme, argues each surface's UX individually, and closes with a fixed critique pass — the render
rules, the states check, and one fresh-context critic naming the four blind spots (error prevention,
error recovery, help, efficiency of use) whose findings land as page notes the existing loop resolves.

## Current state

- `spec/scripts/mocks-driver.js` — seven states, eleven marks; `handleJourneySkinned`,
  `handleReviewOpened`, `handleJourneyReviewed`; `handleDirectionComposed` requires ≥3 screens;
  `AUTHORING_STATES` duplicated as a literal list in the look-probe precondition.
- `spec/scripts/lib/mocks-notes.js` — notes carry `scope|screen|state|text|by|status|addressed|reply`,
  no kind, no reason; `unresolvedFor` is the mark gate.
- `spec/scripts/design-atlas.js` — `serve` on 127.0.0.1 only; `/__notes/list|add|resolve`,
  `/__picks/*`; the atlas index is the only look surface; `check` has no states rule.
- `spec/commands/sketch.md` — prose-only; the scoped sweep authors at "whatever fidelity the tokens
  already carry"; no critique pass; the coherence readout is the only self-review.
- Hearwell dry-run ledger (`tests/fixtures/mocks-ledger/dry-run.md`): 74 assumption rows, 13 catches.

## Out of scope

- Client transport and wake-up (queued: served page over Tailscale by the user, a harness poll loop
  whose exit wakes the open session) — no artifact, no plugin-owned tunnel, no daemon.
- The fresh-context doubt pass at journey end (queued behind this brief).
- Atlas index navigation (TOC drawer, project ↔ mock note links) — its own queued item.
- Native hosts (`design/targets.json` platform, canon → component mapping) — queued.
- Synthetic user testing of any kind.
- Semantic UX judgments by script (whether a destructive control "names recovery") — the states
  check is presence only; judgment stays with the critic and the user.

## Specs

specs/20260906/02–06 (planned 2026-09-06, this session): 02 state machine, 03 questions on the
wireframe, 04 the journey review page, 05 gray states, 06 sketch high fidelity + critique.
