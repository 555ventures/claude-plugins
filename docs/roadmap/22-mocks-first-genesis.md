# 22 — Mocks-first genesis: a standalone design command, then brief, then architecture

Phase: P2 · Depends on: 10, 10a, 20 · Primary workspaces:
spec/commands/{mocks,genesis,atlas,sketch}.md, spec/doctrine/genesis.md, spec/doctrine/design.md,
spec/scripts/{mocks-driver,genesis-driver,design-atlas,question-style-gate}.js,
spec/templates (viewer tokens, canon, ledger, notes layer), tests · Risk: T2 (genesis loses its
design states to a new command; every step keeps its on-disk checkpoint, so a half-migrated run
resumes, never restarts) · Design stage: yes (the brief is about the design stage) ·
Expected specs: 5

## Result

The product is shown, corrected on screens, and approved **before** the brief is written and
before any stack, scaffold or roadmap exists. The design stage moves out of `/spec:genesis` into
its own command — working name **`/spec:mocks`**, final name at plan — with its own small driver
whose state is the files on disk. Genesis shrinks to what comes after an approved set: brief from
the set → stack menus → tournament → decide → scaffold → skeleton → roadmap → handoff.

The design command's order: **seed** (three sentences plus the irreversible *product* facts —
primary surface and what comes in 12–24 months, tenancy, offline, realtime, AI in the loop,
residency, payer, day-one integrations, scale and outage cost, vendor limits, audio retention,
emotion-inference check — and pointed-at references) → **shapes** (2–3 deliberately different
gray-box shapes of the core screen; the user picks) → **wireframes** of every journey, one
author, canon first, one screen at a time with state variants and a persona story per journey →
**theme** (≥2 directions *recomposed* on ≥3 approved screens, one of them dense; references
explored via the Mobbin MCP) → **skin** → **review** (page notes, two scopes, batch triage,
author resolves) → **approved**. Each journey, each theme direction and each reviewed journey is
its own clear-safe checkpoint, so no conversation ever has to hold more than one journey, and
research, iteration and re-looks happen without regard to the next step's context window.

Every claim about the product carries provenance — `said-by-user`, `ratified-doc`, `inferred`,
`invented` — and a kind, `product` or `process`. The driver refuses to advance while a
product-kind row is invented or unconfirmed; process rows are decided and listed, never asked.
Mock authorship never leaves the session: no `Agent` dispatch authors or edits a mock at any
stage. The host's `docs/design/research-brief.md` is a required, driver-checked read before the
first screen. Theme is a recomposition of each approved wireframe at production fidelity, never a
stylesheet over wireframe markup. Everything works over SSH: static HTML on disk, a preview
server that prints its port-forward line, the session's own look through headless Playwright,
references as a directory or Mobbin. Feedback is written on the pages themselves and stored
beside the mocks as ledger input, never in chat and never in the mock markup. The tool chrome
and the wireframes share one token set (shadcn defaults, plain CSS) in two registers, so the
viewer, the atlas, the sketch workbench and the notes layer stop looking like four products. The
shell canon and component inventory are *extracted* from the composed set and feed the
skeleton, reversing ADR-0003's bootstrap order. A misunderstandings ledger — what the session
got wrong, at which step it was caught, what it would have cost — becomes a standing pipeline
record alongside the escape ledger.

## Current state

The Hearwell run of the current flow (2026-08-30 → 09-01) produced sixteen sketch-tier mocks
after the framework (Next.js), scaffold, roadmap and design lock were all committed; the user
judged them unattractive and the product "somewhat very different" from the one in their head,
and the framework choice had never asked whether a native app was coming (it is, within 12–24
months — seed fact P1b of the dry run). The current order is DISCOVERY → MENUS (framework
picked here) → EXPLORE (6–8 theme tiles of *one* signature screen, built by parallel Sonnet
agents) → tournament → DECIDE → SCAFFOLD → SKELETON → ROADMAP → DESIGN lock → `/spec:atlas`
sketch sweep (session ≤5 surfaces + one Fable dispatch for the rest). The whole-product picture
is the last artifact produced, and `/spec:genesis` already opens at roughly half a context window
because every turn carries the whole state machine's doctrine, the tournament rules and the
driver output — the wrong host for open-ended, many-turn design iteration.

A manual, no-plugin dry run of the proposed order was executed on Hearwell on 2026-09-02
(`~/Projects/hearwell/design/wireframes/`: `LEDGER.md`, `00-canon.md`, `00-seed.md`, five
journeys / 27 screens, `visual/`, seven theme directions, `RESUME.md`). It caught fourteen
misunderstandings (M1–M14 in the ledger) before any brief or architecture existed, among them:
provenance-less defaults laundering an old brief into the new run (M1); the question-style
gate's `derive` verdict auto-picking a product fact because a document *cited* the subject (M4);
a linear "session N of 3" model where the product needs a per-person queue (M6); a mobile
sign-in that broke device memory (M7); the owner asked for staff's language secondhand (M8); a
translation-confirmation step lifted verbatim from the brief the user had ratified as prose and
rejected in five seconds once rendered (M9); a yen-priced billing page for a USD-only product
(M10); the research brief never read (M12, six rule violations); the product's core object, the
living model, never drawn (M13); theme delivered as five re-skins the user called unprofessional
(M14). Every catch came from the user looking at a screen and asking a one-line question; none
came from the session feeling unsure — which is why the provenance gate, not "ask when unsure",
is the mechanism. Both the plugin session and the Hearwell session compacted several times
during the run and resumed from files, not scrollback: the canon on disk, not one session's
memory, is what kept the screens consistent.

A second spike the same day (`docs/spikes/22-notes-layer/`) put a notes layer over the untouched
Hearwell wireframes: the preview server injects one script at serve time, every state frame gets
a note strip, every page gets a project-notes box, and notes persist to a JSON file beside the
server. The user used it live from a browser (resolved two seeded notes, wrote a real catch on
the read-back state's four-button row) and the session read the result from the file without
the screen entering the conversation. Rulings from that spike: notes are per mock state and per
project, never per element; a project note ("the direction is wrong") is handled before any
mock note; the author resolves, the session only marks "addressed"; the tool chrome uses shadcn
default tokens and the wireframes share them in a flat register.

Research (three post-July-2026 sweeps, digest in the plugin memory
`research-20260902-mocks-first-genesis`): canon-before-screens is the field consensus
(DESIGN.md, three-layer AGENTS/SKILL/DESIGN stack, Claude Design's design-system import);
single-agent authoring for write-heavy shared state; review queues capture edit/rejection
reasons as data; passkey-first with tap-to-consume magic links and an OTP fallback; Granola's
black-said / gray-inferred provenance convention; client review needs curation, one decider, an
explicit approval state; the primary-surface question decides Expo vs Next.js. Nobody in the
field names whole-product-mocks-before-stack as a practice, and one dated essay (2026-07-14)
warns polished prototypes pre-commit scope — hence the written brief, not the pixels, remains
the scope baseline and client sign-off is on understanding.

Reusable shape: `genesis-driver.js` (state derived from `status.json` + artifacts, marks with
checkpoint lines — the template for the new driver), `design-atlas.js` (`build`/`check`/`serve`/
`shell sync`; `serve` grows the notes endpoints), `question-style-gate.js`, `spec-queue.js` (a
ledger-with-predicates), the escape ledger's row grammar, `report-render.js`, the render gate's
headless Playwright capture (brief 08).

## Scope

Order is binding: the ledger and gate land first so every later stage is already gated.

1. **Provenance ledger + advance gate + question-gate exemption** — a `design/mocks/LEDGER`
   (markdown table or JSON with a rendered view — see open questions) owned by the design
   driver and read by genesis: assumptions table (id, step, kind, claim, tag, status, rejected
   alternative, dependents) and misunderstandings table (what, step caught, cost avoided,
   originating note id when one exists). The driver prints counts at every mark and refuses
   any advance while a product-kind row is `invented` or `inferred/open`; process rows are
   listed under "calls I made" and never block. `question-style-gate.js` gains a product-fact
   exemption: a question tagged product-kind is never given the `derive` verdict, and the judge
   prompt states that a document citing a subject is not the user deciding it. The
   `ratified-doc` tag is distinct from `inferred` and from `said-by-user`.
2. **The design command + genesis shrink** — `/spec:mocks` with `mocks-driver.js`: states
   SEED → SHAPES → WIREFRAMES → THEME → SKIN → REVIEW → APPROVED, state derived from
   `design/mocks/status.json` plus artifacts, the genesis checkpoint contract verbatim
   (`✅ checkpoint … safe to /clear and re-run`), and **sub-checkpoints**: every approved journey
   in WIREFRAMES, every direction in THEME, every skinned journey in SKIN and every reviewed
   journey in REVIEW is its own mark. Non-linear moves are allowed and recorded (re-open a
   journey after THEME, redo SHAPES after a project note) — the driver prints what the reopen
   invalidates. The seed step asks the full irreversible-product-facts list above, with
   `primary surface + 12–24-month platforms` and `payer` before any screen; reference pointing
   accepts a `design/mocks/references/` directory (dropped by scp or shared folder) or Mobbin
   via the MCP, attributes extracted never content, each reference recorded in the ledger.
   **SSH rule:** every artifact is static HTML on disk; `serve` prints the exact
   `ssh -L <port>:localhost:<port> <host>` line on start; the session's own look is headless
   Playwright to a file, with a browser MCP as an optional convenience; the driver refuses to
   start a screen-producing state when neither look path is reachable. `/spec:genesis` becomes
   DISCOVERY (seed hand-off: run `/spec:mocks`, or point at an existing approved set) → BRIEF
   (precondition: `status.json` state APPROVED and zero open product-kind rows) → MENUS →
   [FINALISTS → RACE → PROBE → PICK] → DECIDE → SCAFFOLD → SKELETON → GATE → ROADMAP → HANDOFF →
   GROUNDED; EXPLORE's one-screen tile funnel and the separate DESIGN-lock state are retired
   (tokens exist from THEME; the lock is a ratification inside BRIEF). A legacy genesis
   `status.json` past MENUS resumes at BRIEF with its existing artifacts, no re-run forced.
   `/spec:atlas` stays the derived, never-required view over the same workspace (memory ruling
   2026-08-31 unchanged); `/spec:sketch` stays the per-brief entry and writes into the same
   workspace under the same gates.
3. **One-hand, canon-first wireframes, theme-as-recomposition, one token set** — `design.md`
   § Design Atlas's authorship paragraph is replaced: every mock is authored and edited
   in-session; no `Agent` for mock authorship in mocks, atlas or sketch (subagents only for
   judgment-free checks). The driver refuses the first WIREFRAMES mark unless
   `docs/design/research-brief.md` exists and `00-canon.md` cites it as binding, and refuses a
   second screen until the canon (shells, primitives inventory, seed rules) exists. Rules
   carried from the dry run: wireframes are gray but carry every graphic that *is* structure
   (state is shown as the product's map or a slice of it; text is for what someone said); one
   honest wireframe or the full theme, never a half-styled middle; theme = recompose each
   approved screen at production fidelity on its structure and facts, ≥3 screens per direction
   including the densest, ≥2 directions, judged on the dense screen first; AI-reworded text
   gray until confirmed; persistent recording indicator; equal-weight verdicts survive every
   theme. **Tokens:** one plugin-shipped `viewer.css` with shadcn's default tokens (zinc scale,
   system sans, 6px radius, 1px borders, spacing steps) as plain CSS, no build; the tool chrome
   (atlas index, journey/theme/shapes indexes, preview toolbar, notes layer, sketch workbench)
   uses the full register (cards, shadows, filled primary buttons, badges); `wire.css` becomes a
   thin flat register on the same tokens (no shadow, gray fills, dashed placeholders, frame
   border + state label); product tokens exist only from THEME onward, and the chrome never
   adopts them.
4. **Review loop: page notes, two scopes, batch triage** — `design-atlas.js serve` injects the
   notes layer at serve time (mock markup untouched; `?clean` removes the layer for capture) and
   exposes add/list/resolve endpoints writing `design/mocks/notes.json`. A note is anchored to
   journey + screen + state (mock scope) or to the project (project scope, written from the
   toolbar on any page, shown on every page); never to an element. Loop: notes accumulate in a
   sitting, nothing happens live → the user says go → the driver prints open notes grouped by
   scope, journey, screen, state → the session triages each into four bins and prints the list:
   *mock detail* (redraw), *product understanding* (ledger row first, one-line confirm if
   product-kind), *question back* (replied under the note on the page), *propose to decline*
   (client notes are never declined, only proposed; the named decider decides) → the user says
   go or overrides a bin → the session redraws (a note that hits a canon primitive changes the
   canon first and every dependent screen after), writes under each note what changed and which
   ledger row, and marks it *addressed* → the **author** resolves after a re-look; the session
   never resolves. Any open project note blocks mock-note work: its answer is a canon change or
   2–3 recomposed directions, not edited screens. Zero open notes on a journey is that
   journey's approval mark. Client review is the same loop with one named decider recorded and
   the sign-off wording stating it is understanding, not scope.
5. **Brief-from-set + downstream derivation** — genesis BRIEF is generated from the approved
   set and the ledger (journeys, surfaces, personas, states) plus a non-UI coverage checklist
   run as a checklist (jobs, notifications, retention, integrations, admin, pricing) so
   screen-less facts are not dropped; ROADMAP decomposition derives from the journeys;
   SCAFFOLD extracts the shell canon and component inventory from the composed set (brief 20's
   `shell sync` and drift check remain the mechanism, now fed from extraction rather than
   bootstrap); the framework menu's consequences are priced against the seed's primary-surface
   answer. The misunderstandings table is promoted to a pipeline record with a `/spec:status`
   count line.

## Out of scope

- Rewriting `/spec:design` (per-brief component authoring behind the render gate) — it
  consumes the approved set as `design_source` unchanged.
- Any change to the build/review loop (`/spec:run`), the tournament mechanics, or `init-gen`.
- Accounts, auth or hosting for client review — the served preview plus a forwarded port or a
  static export is the surface; the named decider is recorded, not authenticated.
- Dark theme, the theme×viewport matrix, and illustration authoring — they stay
  matrix-at-approval per design canon; THEME judges light, most-constrained viewport.
- Shrinking `/spec:genesis`'s remaining context load beyond what removing the design states
  buys — a separate measurement and, if warranted, a separate brief.
- Hearwell's own continuation (skin, review, BRIEF v4, Expo-vs-Next re-open) — it runs in that
  repo from its `RESUME.md`, by hand, until this brief ships.

## Grounding

- `~/Projects/hearwell/design/wireframes/LEDGER.md` — the executed evidence: seed rows P1–P13,
  journey rows W/O/R/D/V, theme rows T1–T6, process rows A2–A8, catches M1–M14, and the six
  standing rules the run converged on. Spec 1's fixtures derive from it.
- `docs/spikes/22-notes-layer/` — the notes-layer spike (`server.js`, `notes.js`,
  `notes.sample.json` with the user's real notes, `screenshot.png`). Spec 4 starts from it;
  spec 3's `viewer.css` starts from the tokens block in `notes.js`.
- `docs/adr/0006-mocks-first-genesis.md` — the amendment: what it supersedes in briefs 10, 10a,
  02 (D8 via ADR-0003) and 20, and why the reorder is a product-understanding fix, not a
  design-quality fix.
- `spec/doctrine/genesis.md` § Discovery Interview, § Explore State, § State Machine, § Design
  State, § Checkpoint contract; `spec/doctrine/design.md` § Design Atlas (authorship
  paragraph), § Design Canon; `spec/commands/atlas.md` § The run, § The sweep;
  `spec/commands/sketch.md` § The run; `spec/scripts/question-style-gate.js` (the `derive`
  verdict).
- `spec/doctrine/core.md` § Question Style ("derive before asking" applies to repo/session
  facts; product facts are never derivable — memory `feedback-derive-dont-interview` boundary,
  2026-09-02) and § Model Placement.
- Plugin memory: `feedback-no-subagents-for-design-authorship`,
  `feedback-references-via-mobbin-mcp`, `feedback-atlas-habit-not-enforced`,
  `research-20260902-mocks-first-genesis`, `project-20260902-hearwell-mocks-first-dry-run`.

## Open questions for planning

- Ledger storage: markdown table (human-editable, what the dry run used) vs JSON with a
  rendered view (driver-parseable, what the gate needs). Planning should spike parsing the
  dry-run ledger as-is before deciding.
- The command's final name (`/spec:mocks` is the working name) and whether `/spec:sketch`
  survives as a separate entry or becomes `/spec:mocks <brief>`.
- The D-numbers in specs 20260825/01–04 and 20260827/01–04 that the reorder supersedes must be
  enumerated at plan time and listed in ADR-0006's "Applies to"; this brief cites sections, not
  D-numbers, deliberately.
- Client access: forwarded port (works for JJ, not a client) vs a static export with the notes
  layer posting to a small hosted endpoint — the spike proves the layer, not the hosting.
- Theme directions count: the dry run needed seven attempts (five re-skins rejected, one bold
  rejected, one picked); the rule "≥2 recomposed directions" is a floor, and planning should
  decide whether the first two directions are always "quiet" and "reference-derived".
- Note author identity: the spike hard-codes the author; the real layer needs at least a
  name prompt per browser (no accounts) so client and decider notes are distinguishable.
