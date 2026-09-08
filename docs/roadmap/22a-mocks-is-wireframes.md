# 22a — Mocks is wireframes: a gray comprehension check with the session's doubt on the screen, the shared primitives named before any screen, the theme picked in sketch, and every journey walked then client-reviewed before approval

Phase: P2 · Depends on: 22 · Amends: 22 (the SEED → … → SKIN → REVIEW → APPROVED order ratified by ADR-0006 — via ADR-0008); **amended in place 2026-09-07 via ADR-0010** (KIT before screens, THEME and SIGNOFF out of the driver, WALK and CLIENT before approval) · Primary workspaces:
spec/scripts/{mocks-driver,design-atlas,components-check,genesis-driver}.js, spec/scripts/lib/{mocks-notes,notes-layer.browser,review-page,review.browser,shell-region,mocks-picks}.js,
spec/doctrine/{mocks,design,genesis}.md, spec/commands/{mocks,sketch}.md, spec/agents/design-critic.md, spec/templates/{mocks-canon.md,mocks/viewer.css}, tests ·
Risk: T2 (the mocks state machine loses two states and gains three; every mark keeps its on-disk checkpoint, a host mid-SKIN, mid-THEME or mid-SIGNOFF derives the current chain from its existing marks and continues) ·
Design stage: yes · Expected specs: 11 (5 shipped, 6 planned)

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

### Amended 2026-09-07 (ADR-0010) — three gaps the first five specs left

**The content slot has no canon.** Measured across three shipped hosts: salon-os's shell canon
names 28 classes and every one is chrome — header, tab bar, toast host, content slot, screen
frame. It names no sheet, no empty state, no table row, no card, no form field, no option
group. The result is 90 components for ~24 screens, 28 of them used in one mock region or
fewer, 18 sheet-family components beside a generic `Sheet`, four option-group variants, three
empty-state variants. prax carries 37 components with 8 whole screens registered as components;
upwell 66 with seven overlapping badge-family entries. This is not drift — drift from a named
primitive looks like `SheetV2`. Screen-prefixed names (`RosterEmptyState`,
`MemberDetailNoteSheet`) are the signature of **absence**: each screen was the first to need the
thing, every time. The one thing that was named held. The derived manifest therefore documents
the redundancy instead of preventing it, which is worse than no manifest — it reads as a design
system and is not one.

**The theme pick sits in a structure stage.** THEME composes directions on the seed's dense
screen and produces `design/tokens.css`. It is a taste decision squeezed between structure and
sign-off, it delays the one sign-off, and it is re-litigated at the first `/spec:sketch` anyway
— which is where a real brief finally exists to judge a theme against.

**Nothing walks a journey.** Spec 06's critique pass reads one screen at a time against four
usability heuristics. The June 2026 literature is explicit that screenshot-scoped evaluation
cannot see multi-step problems (arXiv 2606.05697) and that ungated critics produce weakly
grounded criticism at a measured repair lift of +0.14–0.22 on a 1–5 scale, human agreement
ρ≈0.635 (arXiv 2606.16262). JJ's clients click the journey page and approve it, so an outside
human reader already exists — and the defects that reach them are exactly the multi-step ones a
per-screen pass cannot see.

**One deliberate non-goal, ruled 2026-09-07.** No synthetic-user or task-completion pass. The
client review supplies the outside reader; clients share the domain knowledge a newcomer lacks,
so they confirm the product is right without revealing whether a first-timer can finish a job
unaided. That gap is knowingly accepted.

## Result

`/spec:mocks` is **`SEED → SHAPES → KIT → WIREFRAMES → WALK → CLIENT → APPROVED`**. Every
journey is a gray wireframe carrying its empty, loading and error states as gray boxes; SKIN,
REVIEW, THEME, SIGNOFF, `journey-skinned`, `review-opened`, `journey-reviewed` and `--decider`
are gone.

**KIT** writes a `design/kit/` canon family — a sibling of `design/shell/` under the same marks,
checker and verbs, never a third parallel concept. It names every shared primitive once, in
every state, with a when-to-use line. Gray, never skinned, signed off like a wireframe, and the
first artifact a client could see. `shell sync|adopt` generalise to `canon sync|adopt <family>`;
sync rewrites only non-content slots, since a primitive is instantiated with different content
each time, and structural conformance is check-only. The kit is handed to every wireframe
authoring prompt first, with "instantiate, do not invent".

**The kit binds at journey approval.** A journey cannot be approved while any screen carries a
region that is neither a kit instance nor an explicit bespoke mark naming the primitive it is
*not* and the one structural difference preventing reuse. Bespoke marks land in the manifest as
unabsorbed entries that persist until absorbed or deleted, and the count prints at sign-off and
again at sketch, so the approver chooses against a growing number rather than a checkbox.
`design/components.json` stops being session-authored and derives from the kit and shell
families; `components-check.js` becomes the drift check; `canon.md ## Primitives` dies as a
source of truth and the genesis gate re-points at the kit directory.

**WIREFRAMES** is unchanged from the first five specs. While drawing a journey the session pins
every inferred or invented product assumption as a **question on the screen** it belongs to; the
served page shows it as "I assumed … rejected …" with Yes / No, it's… / Later, an answer writes
the ledger row's status and resolves the note, and `journey-approved` refuses while a question
is unanswered. A three-pane review page per journey (screens rail · artboards with state tabs ·
question inspector with keyboard flow) is the look surface `stop open journey:<j>` points at,
authored under the frontend-design skill on the viewer's zinc register. Catch provenance
(question · note · unlinked) is derived from the notes store and printed by `ledger counts`.

**WALK** runs one fresh-context critic per journey, read-only, no authoring memory, in declared
order, with the gray states as branches at the step where they occur. Flow breaks only — no path
back, no path forward, a state with no exit, a step requiring data no earlier step collected, a
control meaning two things across screens, an error state with no recovery. Every finding cites
journey, step and state or is refused; naming, hierarchy, density and "consider…" are forbidden.
Findings land in a `walk` scope separate from the client's and must reach zero before CLIENT
opens.

**CLIENT** serves the journey page, exposed by JJ himself, for product-kind questions only
(the ledger's existing kind column decides); client notes live in their own scope, clean because
the walk reached zero first; the client sends free-form messages at two scopes (whole project |
this screen) with a reason, each blocking approval until addressed. Each resolved note owes a
**derived** closure signal — the wireframe frame diff between the note and its resolution,
rendered before/after on the page; a typed line is refused. `APPROVED` means every journey
walked clean and every client note closed.

**Theme and fidelity live in `/spec:sketch`.** The theme pick is sketch's first run: candidates
are the gray kit re-rendered per candidate theme, the pick becomes the themed kit canon — the
design system's first page — and writes `design/tokens.css` plus the extracted shell canon.
Sketch's refusal on a missing `tokens.css` becomes author-if-missing, refuse-only-if-
present-and-gray, and sketch refuses to theme a surface whose unabsorbed count is above zero
unless the kit was amended first. Sketch then authors each brief's surfaces at production
fidelity, argues each surface's UX individually, and closes with the same walk critic run on
themed surfaces.

## Current state

- `spec/scripts/mocks-driver.js` — `deriveState()` is a six-step linear chain ending
  `THEME (!status.theme) → SIGNOFF (!marks.approved) → APPROVED`; `AUTHORING_STATES` is
  `{SHAPES, WIREFRAMES, THEME}` with `SIGNOFF` bolted onto the look-probe precondition as a
  separate disjunct; `handleThemePicked` is the only writer of `design/tokens.css`; `--reopen`
  accepts `journey:<j> | shapes | theme`.
- `spec/scripts/design-atlas.js` — `check` binds one canon family (shell) via `shell-region`,
  warn at `sketch`, violation at `ratified`/`approved`/`--matrix`; `stopHome()` routes
  `theme-picked` and `approved` to named page sections; `--states` and the wire-register and
  unresolved-note rules landed with specs 05 and 06.
- `spec/scripts/components-check.js` — validates a session-authored manifest (name/purpose
  required, duplicate names an error); resolves nothing on the filesystem. **No derivation
  script exists anywhere.**
- `spec/scripts/genesis-driver.js` — `handleSkeletonLanded` requires every
  `canon.md ## Primitives` bullet to appear in the manifest; `brief-written` refuses without
  `design/tokens.css`.
- `spec/commands/sketch.md` — § The run step 3 authors at production fidelity when
  `design/tokens.css` exists and prints `⚠️ no theme picked yet (/spec:mocks THEME)` when it
  does not; step 5b is the four-heuristic critique pass.
- Measured inventories (2026-09-07): salon-os 90 / prax 37 / upwell 66 components; salon-os
  shell canon 28 classes, all chrome. 45.9% of a themed mock's bytes are styling.
- Hearwell dry-run ledger (`tests/fixtures/mocks-ledger/dry-run.md`): 74 assumption rows, 13
  catches.

## Out of scope

- Synthetic user testing and task-completion passes of any kind (ruled 2026-09-07 — the client
  review is the outside reader).
- A blanket authoring lint on wireframes (ruled 2026-09-07 — it fires at wireframe speed across
  ~24 screens; the bind is at journey approval).
- Candidate flows (specs/20260905/03, superseded 2026-09-07) — its premise stands, its mechanics
  are re-planned against this chain afterwards; the walk runs after the flow pick on the winner
  only, and `design/variants/` stays outside the manifest derivation and the unabsorbed count.
- Atlas index navigation (TOC drawer, project ↔ mock note links) — its own queued item.
- Native hosts (`design/targets.json` platform, canon → component mapping) — queued; when it
  lands, both canon families are written in the platform's idiom and the mapping covers both.
- Semantic UX judgments by script (whether a destructive control "names recovery") — the states
  check is presence only; the walk's list is structural presence; judgment stays with the critic
  and the user.

## Specs

specs/20260906/02–06 (planned 2026-09-06, all shipped): 02 state machine, 03 questions on the
wireframe, 04 the journey review page, 05 gray states, 06 sketch high fidelity + critique.

specs/20260907/04–09 (planned 2026-09-07 under ADR-0010): 04 kit, 05 genesis drops the theme
gates, 06 the theme pick moves to sketch, 07 mocks retires THEME, 08 walk-critic, 09
client-review. Slicing is by landing unit and the order is load-bearing — 04 leaves THEME
untouched so the tokens producer stays put; 05 is a pure loosening that removes genesis's
unsatisfiable-after-the-move preconditions *before* the move, so no spec in the series ever
leaves genesis unable to ratify; then 06 and 07 are the two halves of a standard expand/contract
migration, because the whole theme move measured a third over the decomposition cap with nine of
its test files rippling from one fixture chain. 06 adds the new producer — a `theme` subcommand
family outside the mocks state machine plus sketch's theme run — and leaves `/spec:mocks` THEME
working byte-identically; 07 is the pure deletion. SIGNOFF survives both and is replaced by
CLIENT in 09 — retiring it earlier would leave no human gate between wireframes and approval.
