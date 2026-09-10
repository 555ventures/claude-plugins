---
date: 2026-09-08
status: superseded
superseded_by: "ADR-0013 — the client rehearses one journey at a time in a player; the flow pick is retired, D3a player mechanics carried forward"
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260907/07-mocks-retires-theme.md, specs/20260907/08-walk-critic.md]
depended_on_by: []
brief: n/a
spiked: 2026-09-08
open_markers: 0
---

# Candidate flows on the walk chain: a journey that declares a fork is drawn 2–3 ways, picked as a whole on the atlas, and walked as the winner only

## Goal

specs/20260905/03 (superseded 2026-09-07 by ADR-0010) established that a journey, like a shape,
may be drawn as candidate flows and picked as a set on the page; its mechanics targeted a chain
that no longer exists. This spec re-plans those mechanics against `SEED → SHAPES → KIT →
WIREFRAMES → WALK → SIGNOFF → APPROVED` and narrows the premise to the journeys that earn it: a
journey whose seed entry **declares a structural fork** (a form as a page vs a sheet, a gate
before vs after the content, a list vs a single featured item) may be drawn 2–3 ways under
`design/variants/`; the driver opens a pick stop for it, promotes the winner into
`design/mocks/`, records the losers, counts the pick as the journey's approval so no second look
is asked, and hands the winner alone to WALK. A journey with no declared fork is drawn once,
exactly as today. Done means: a forked journey has a candidate home no existing walk mistakes
for its screens, one pick promotes and approves, the walk critic never sees a loser, and every
unforked journey behaves byte-identically to the pre-image.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Candidate flows live at `design/variants/<journey>/<kebab>/<label>.html` — one directory per flow holding **every** label the journey declares in `seed.md`, each file in the wireframe register (root `data-screen-label="<label>"`, `data-status="sketch"`, `data-variant="<kebab>"`, links `../../../wire/tokens.css` and `../../../wire/wire.css`). `design/variants/` is never walked by `buildAtlas`'s mock scan, never judged by `journey-drawn`, never counted by `check`'s unabsorbed total unless a candidate path is passed to `check` explicitly, and never enters the derived component manifest (AC-20260908-05-1) | Same posture as `design/shapes/`: a candidate that is not yet the screen lives outside `design/mocks/`, so every reader keyed on that directory (atlas, `journey-drawn`, the kit count, the walk critic's screen resolution) sees only a promoted winner. Brief 22a's out-of-scope line fixes the manifest/unabsorbed exclusion. |
| D2 | The seed grammar gains one optional line per journey: `fork: <one line naming the structural choice>` anywhere in the `### <journey>` body before its surfaces block; `parseJourneysSeed` returns `fork: <string>|null` beside `persona`/`labels`. Only a forked journey may take the candidate path: `stop open variants:<j>` on an unforked journey exits 2 with `journey "<j>" declares no fork — add a \`fork: <one line>\` line under ### <j> in design/mocks/seed.md, or draw it once (--mark journey-drawn)`; the seed template's Journeys comment documents the line (AC-20260908-05-2, AC-20260908-05-8) | JJ's 2026-09-08 ruling: candidates only where a real structural choice exists, never on every journey. A declared line is checkable and readable cold; "the session felt unsure" is neither. The seed is the one place journeys are already declared. |
| D3 | `mocks-driver.js stop open variants:<j>` joins the step set: requires `canon-written`, `<j>` declared with a fork (D2), `journeys[j].drawn` null (a drawn journey exits 2 naming `--reopen journey:<j>`), and 2–3 directories under `design/variants/<j>/` each complete — every declared label present and `design-atlas.js check --states <dir>` exit 0 — refusing (exit 2) naming the count, the first missing `<kebab>/<label>.html`, or the failing check line. It opens a `pick` stop through `design-atlas.js stop open` with key `variants:<j>`, title `pick a flow for <j>`, groups = the kebabs in sorted order, candidates = every (kebab, label) in seed label order with path `variants/<j>/<k>/<label>.html`, no `--page` (the atlas index renders the compare table; specs/20260906/04 D6 keeps the review page for the single-flow look), and prints the two fixed lines with the pick reply variant (AC-20260908-05-3, AC-20260908-05-4) | The driver already knows the journey's labels; the session never types candidates. Completeness is checked before the user looks, so a hole in a flow is a refusal, not a blank cell. The kit rule is not enforced here — `check` at the sketch tier only warns on an unmarked region (executed, A6) and `journey-approved` (D5) enforces it on the winner. |
| D3a | **A `variants:<j>` stop renders as a walk-through player, not as the compare grid.** The atlas's journey section shows one card per flow (its kebab, its one-line gist, a first-screen thumbnail, the screen count) and each card opens a player over the journey's screens in seed-arrow order: one screen at a time, `← Back` / `Next →` (arrow keys and `Esc` bound), a position readout `screen <i> of <n> · <label>`, the screen's own `data-state-btn` states reachable inside the player, and one `Pick this flow` control that posts the existing `POST /__picks/decide` body unchanged. The compare grid stays reachable from the same section as a secondary `compare side by side` toggle, rendered by today's `renderCompareTable` with no change. Every other pick stop kind (`shape-picked`, `kit-signed`) keeps the grid as its primary surface (AC-20260908-05-13, AC-20260908-05-14) | JJ 2026-09-08, on the spike's own grid: "very confusing … why not show 3 candidates, and user can click and move to next screen". A flow is experienced in time, so the surface that judges it must advance in time; a grid of fifteen artboards is read as a spreadsheet and never conveys where a sheet opens or a page turns — the same limit ADR-0010 cites for screenshot-scoped review. The grid survives as the secondary view because it is the right surface for the narrower question "how do these two differ at step 3", and because shapes and kit are single-screen candidates a player would only slow down. |
| D4 | New mark `variant-picked --journey <j> [--variant <k>]`: reads the newest non-superseded `variants:<j>` stop exactly as `journey-approved` reads its stop (none → `no look stop for variants:<j> — run \`stop open variants:<j>\` first`; `open` → `waiting on <url>`; decided `change` → `change requested by <by>: "<note>"`; a `--variant` disagreeing with the pick → `--variant <k> disagrees with the page pick "<pick>" (stop <id>)`); runs `requireNotesResolved` over the journey's labels (an unanswered question or unresolved note refuses, copying nothing) and **no ledger gate** (it is a drawing-stage mark like `journey-drawn`; `journey-approved` gates the ledger); copies every `variants/<j>/<pick>/<label>.html` to `design/mocks/<label>.html` byte-identical except the two wire links rewritten `../../../wire/` → `../wire/` (overwriting a stale copy); runs `journey-drawn`'s per-label checks and `check --states` on the copies; records `journeys[j].variant = {picked, rejected:[…], by, at, fork}` and `journeys[j].drawn = now`; consumes the stop in the same write; appends, when `ledger.md` has no confirmed said-by-user product row with claim `variants: <j> = <k>`, one assumptions row via `appendAssumption` (step `WIREFRAMES`, kind `product`, tag `said-by-user`, status `confirmed <today>`, rejected = the other kebabs comma-joined, note = the why-line or `picked on the page`); prints the counts line and the checkpoint line; losers stay on disk untouched (AC-20260908-05-5, AC-20260908-05-6) | The copy is the promotion (`shape-picked` and the retired theme pick promoted by copying too); the link rewrite is the one byte a nested candidate needs to become a top-level mock; rejected flows are provenance, not garbage. Dropping the ledger gate from the old D3 removes a double gate the approval mark already owns. |
| D5 | A picked flow is an approved flow: `journey-approved --journey <j>` accepts, when no live `journey-approved:<j>` stop exists, a `journeys[j].variant` record whose `at` is newer than the journey's last `journey:<j>` reopen as its verdict — every other check (notes gate, ledger gate, `check --states`, the kit `--matrix` gate, the render gate) still runs, and nothing is consumed. `--reopen journey:<j>` clears `variant` and `drawn` beside `approved` and `walked` (specs/20260907/08 D6) and lists `variant`, `drawn` in `invalidated`. WALK then reads only `design/mocks/<label>.html` by specs/20260907/08 D4's own resolution — the promoted winner, never a loser (AC-20260908-05-7) | The pick was the look; asking the user to approve the flow they picked seconds earlier is the interview the page exists to remove. The reopen rule keeps a stale pick from re-approving a redrawn journey. The walk-on-winner-only rule is ADR-0010's; it holds by construction and is pinned, not re-implemented. |
| D6 | The WIREFRAMES "draw journey <j>" step: for a forked journey its `Then:` block lists both paths — `--mark journey-drawn --journey <j>` and `stop open variants:<j>` (2–3 candidate flows under `design/variants/<j>/<k>/`) — plus a `fork: <text>` line; for an unforked journey the block is byte-identical to today. Its `look:` line derives from `lookLineAndThen('variants:<j>', 'variants:<j>', …)` with the `variant-picked` mark line as the accept command, prefixed by `variants: <k1>, <k2> — \`stop open variants:<j>\` next` when candidate directories exist and no stop is live; after `variant-picked` the approve step prints `look: ✅ picked "<k>" by <by> at <ISO>` and `Then:` the `journey-approved` mark line, never a `stop open` (AC-20260908-05-8) | The checkpoint contract: the driver prints the one next action; the session never discovers the candidate path from doctrine memory, and never sees it on a journey that did not declare a fork. |
| D7 | `buildAtlas`: after `variant-picked`, the `<j>` journey section's meta line carries `flow: <k> · rejected: <others>` read from `status.json`'s `journeys[j].variant` (nothing when absent); the `variants:<j>` stop itself renders inside that section through the existing key grammar (`stopHome`, specs/20260905/01 D3), as D3a's player (AC-20260908-05-9, AC-20260908-05-12) | The page shows what was decided where it was decided; the rendering rule already exists and is pinned here. |
| D8 | Doctrine, one home each: `spec/doctrine/mocks.md` § Mocks: State Machine gains a **Candidate flows** paragraph (the `design/variants/` home, the fork line, completeness, `stop open variants:<j>`, `variant-picked` promotes and records, picked flow is an approved flow, reopen clears, the walk runs on the winner only) and § Mocks: Seed names the optional `fork:` line; `spec/commands/mocks.md`'s driver-loop section gains one sentence naming the two paths for a forked journey; `spec/doctrine/design.md` § Design Canon's "one responsive mock per surface" bullet gains the clause "candidate flows live under `design/variants/` until picked" on the same line (the file stays ≤160 lines, AC-20260824-05-2); `spec/templates/mocks-seed.md`'s Journeys comment documents `fork:`; `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: review's version-bump check is the oracle]` (AC-20260908-05-10) | New-surface checklist; the doctrine paragraph is what `spec-paths shared-mocks` hands the next session. |
| D9 | Additive only: on a root with no `design/variants/` directory and no `fork:` line, `journey-drawn` on files authored into `design/mocks/`, `journey-approved` with a decided `journey-approved:<j>` stop, the draw step's `Then:` block, and every reopen keep their contracts byte-for-byte, the reopen `invalidated` list gaining only the two entries D5 names (AC-20260908-05-11) | Regression pin — the single-flow path is the common case and must not change under the candidate path. |
| D10 | The escape class `design-flow-choice` is the Materiality signal for this premise: when an owner rejects an approved flow after it is built, the escape is recorded through `/spec:escape` with `class: "design-flow-choice"` (a free-form kebab class the escape-row schema already admits — no code, no registry row); the ledger count of that class is the only admissible evidence for widening this feature (every journey) or retiring it (core § Incident Policy admission bar). No doctrine paragraph records this — the Canonical Delta carries one sentence `[no-ac: a ledger naming convention with no code surface]` | Doctrine is for invariants, not incident memory; a class name in the ledger is countable and needs nothing built. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2: `parseJourneysSeed` returns `fork`; D3: `buildVariantsStopSpec` + the `variants:<j>` branch of `buildStopSpec` and the unknown-step literal; D4: `handleVariantPicked` (verdict, notes gate, copy + link rewrite, per-label checks extracted from `handleJourneyDrawn` into one shared helper, record, consume, ledger row), the `doMark` case and the unknown-mark literal; D5: `handleJourneyApproved`'s variant-record verdict fallback, `doReopen`'s `journey:<j>` branch; D6: `printWireframesStep`'s draw-step `Then:`/`look:` lines and the approve step's picked line; header comment updated |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3a: `renderStop` routes a `variants:` key to the new player renderer and emits the `compare side by side` toggle; D7: journey section meta line `flow: <k> · rejected: <others>` from `status.json`; header comment updated |
| spec/scripts/lib/flow-player.js | CREATE | scripts | D3a: the flow-card grid, the player markup, and its inline advance/pick script (the `stop-block.js` pattern — one renderer, one script copy, `?clean` strips it) |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8: **Candidate flows** paragraph under § Mocks: State Machine; the `fork:` line under § Mocks: Seed |
| spec/doctrine/design.md | MODIFY | doctrine | D8: one clause appended to the "one responsive mock per surface" bullet, same line |
| spec/commands/mocks.md | MODIFY | doctrine | D8: one sentence in the driver-loop section naming the two WIREFRAMES paths for a forked journey |
| spec/templates/mocks-seed.md | MODIFY | doctrine | D8: the Journeys comment documents the optional `fork:` line |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8: version bump + changelog entry via `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | helper only, no AC-ID: `writeVariants(dir, journey, kebab, labels, opts)` writing the three state buttons by default like `writeWireframe`, and a `fork` option on `writeSeed` that emits the `fork:` line |
| tests/mocks/mocks-driver-variants.test.js | CREATE | tests | AC-20260908-05-2, AC-20260908-05-3, AC-20260908-05-4, AC-20260908-05-5, AC-20260908-05-6, AC-20260908-05-7, AC-20260908-05-8, AC-20260908-05-11 — its own file under the 45s per-file guard (specs/20260903/07) |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260908-05-1, AC-20260908-05-9, AC-20260908-05-12, AC-20260908-05-13, AC-20260908-05-14 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260908-05-10 (doctrine, command, and template literals) |

## Contracts

```
design/mocks/seed.md — ## Journeys (additive)
  ### <journey-kebab>
  <persona line>
  fork: <one line naming the structural choice>        optional; absent = the journey is drawn once
  ```surfaces … ```
  parseJourneysSeed(text).get(j) → { persona, labels, fork: string|null }

design/variants/<journey>/<kebab>/<label>.html      one dir per candidate flow, every declared label present
  <link rel="stylesheet" href="../../../wire/tokens.css">
  <link rel="stylesheet" href="../../../wire/wire.css">
  <main data-screen-label="<label>" data-status="sketch" data-variant="<kebab>">…</main>

mocks-driver.js --root <dir> stop open variants:<j> [--port <n>]
  stdout (exactly two lines):
    🎨 ready for review — http://localhost:<port>/atlas/index.html#stop-P<nnn>
    Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>
  stop written: {kind:'pick', key:'variants:<j>', title:'pick a flow for <j>',
                 candidates:[{group:'<k>', label:'<label>', path:'variants/<j>/<k>/<label>.html'}, …]}
                 groups in sorted kebab order, labels in seed order within a group; no page override
  exit 2 (stderr, one of):
    mocks-driver: journey "<j>" declares no fork — add a `fork: <one line>` line under ### <j> in design/mocks/seed.md, or draw it once (--mark journey-drawn)
    mocks-driver: journey "<j>" is already drawn — `--reopen journey:<j>` first, then stop open variants:<j>
    mocks-driver: design/variants/<j>/ has <n> flow(s) — 2-3 are required
    mocks-driver: design/variants/<j>/<k>/<label>.html does not exist — every flow holds every label of "<j>"
    mocks-driver: design-atlas.js check --states design/variants/<j>/<k> failed: <line>

mocks-driver.js --root <dir> --mark variant-picked --journey <j> [--variant <k>]
  verdict source: newest non-superseded stop with key variants:<j> (the journey-approved refusals verbatim, plus)
    mocks-driver: --variant <k> disagrees with the page pick "<pick>" (stop <id>)
  effects: design/mocks/<label>.html ← variants/<j>/<pick>/<label>.html (links rewritten ../../../wire/ → ../wire/)
           status.journeys[j].variant = {picked, rejected:[…], by, at, fork};  status.journeys[j].drawn = <now>
           stop → consumed (same write as status.json);  ledger row (when absent):
           | <next id> | WIREFRAMES | product | variants: <j> = <k> | said-by-user | confirmed <date> | <others> | - | <why or "picked on the page"> |
  tail: the 📒 counts line, then ✅ checkpoint — mocks state saved (WIREFRAMES → WIREFRAMES); safe to /clear and re-run /spec:mocks

--mark journey-approved --journey <j>   verdict = live journey-approved:<j> stop, else journeys[j].variant
                                         with variant.at > the newest reopens[].at whose target is journey:<j>
--reopen journey:<j>                     invalidated: approved, approved(all), walk:<j>, variant, drawn

status.json (schemaVersion 1, additive field)
  "journeys": { "<j>": { "drawn", "approved", "walked",
                         "variant": null | {"picked":"<k>","rejected":["<k2>"],"by":"<who>","at":"<ISO>","fork":"<text>"} } }

WIREFRAMES step text (draw journey <j>), forked journey — Then: carries:
  node … --mark journey-drawn --journey <j>            (one flow, drawn into design/mocks/)
  node … stop open variants:<j>                        (2-3 candidate flows under design/variants/<j>/<k>/)
  fork: <text>
  look: variants: <k1>, <k2> — `stop open variants:<j>` next     (candidate dirs exist, no live stop)
  look: ⏳ waiting — <url>                                        (stop open)
  look: ✏️ change requested by <by>: <note>                       (stop decided change)
  look: ✅ picked "<k>" by <by> at <ISO>                           (stop decided pick; Then: the variant-picked mark line)
unforked journey — Then: byte-identical to the pre-image

atlas journey section meta line (after variant-picked): flow: <k> · rejected: <k2>, <k3>
```

## Behavior

**Declaring the fork.** While writing the seed (or later, before drawing), the session adds one
`fork:` line to a journey whose structure has a real alternative — the Umezawa spike's five read
"segment picker + form as pages vs a sheet on Trading vs one contact page" and the like. A
journey without the line never sees the candidate path in its step text and cannot open the
stop.

**Drawing candidate flows.** At WIREFRAMES the session either draws a forked journey once into
`design/mocks/` (today's path) or draws it 2–3 ways under `design/variants/<j>/<k>/`, each a
complete set carrying its gray states. The driver refuses to open the stop while a flow is
missing a label or a state, so the page never shows a half flow.

**The look.** `stop open variants:<j>` writes the stop and prints the link; the atlas renders it
inside the journey's section as the compare table (rows = the journey's steps, columns =
flows). The user picks a column; a screen they dislike inside the winner gets a mock note on
that screen, which `variant-picked` then refuses on until resolved, exactly as
`journey-approved` does today.

**Promotion.** `variant-picked` copies the winner's files to `design/mocks/`, rewriting only the
two wire links, runs the same checks `journey-drawn` runs, and records the pick with the
rejected kebabs, the fork text, and the why-line. The rejected directories stay; they are never
rendered again once the stop is consumed, and a later `--reopen journey:<j>` lets the session
open a fresh stop over them or over new ones.

**No second look; the walk sees one flow.** After promotion the journey is `drawn` and its
`variant` record is newer than any reopen, so the next bare run prints `look: ✅ picked "<k>" …`
and the `journey-approved` mark line; that mark accepts on the record after every gate it runs
today. WALK then dispatches the critic over `design/mocks/<label>.html` — the promoted winner —
and a walk finding names a screen that must exist there, so a loser can never be walked.

**Reopen.** `--reopen journey:<j>` clears `variant`, `drawn`, `approved`, `walked`. The promoted
copies stay in `design/mocks/` (reopen never deletes); the next `stop open variants:<j>` requires
`drawn` null, which reopen provides.

## Acceptance Criteria

- **AC-20260908-05-1**: WHEN `buildAtlas` runs over a root holding `design/mocks/a.html` (label `a`) and `design/variants/j1/x/a.html` (label `a`, `data-variant="x"`) with no stop THE SYSTEM SHALL render exactly one `<iframe` whose `src` ends `mocks/a.html?clean`, none ending `variants/j1/x/a.html?clean`, and no `x` badge or card; `--mark journey-drawn --journey j1` on that root SHALL judge only `design/mocks/a.html` (a broken `design/variants/j1/x/a.html` with no wire links does not make it refuse); and `design-atlas.js check design/mocks` on a root whose `design/variants/j1/x/a.html` carries an unmarked region while `design/mocks/a.html` is fully kit-tagged SHALL print no `unabsorbed total` line → `tests/design-atlas.test.js` (render, check), `tests/mocks/mocks-driver-variants.test.js` (mark)
- **AC-20260908-05-2**: WHEN `seed.md` declares `### onboarding` with the line `fork: form as a page vs a sheet` before its surfaces block THE SYSTEM SHALL parse `fork` as `form as a page vs a sheet` (observable through the draw step's `fork:` line and the `variant` record's `fork` field); WHEN the journey has no `fork:` line and `stop open variants:onboarding` runs after `canon-written` with two complete flow directories present THE SYSTEM SHALL exit 2 with stderr containing `declares no fork` and `fork: <one line>` and `--mark journey-drawn`, writing no stop → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-3**: WHEN `stop open variants:onboarding` runs after `canon-written` on a forked journey with `design/variants/onboarding/{a-linear,b-sheet}/` each holding `signin.html`, `invite.html`, `consent.html`, `session-live.html` in the wireframe register with the three gray states, with a `design-atlas.js serve` child up on a free `--port` THE SYSTEM SHALL exit 0, print exactly two lines — the first matching `^🎨 ready for review — http://localhost:\d+/atlas/index\.html#stop-P\d{3}$`, the second exactly `Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>` — and leave `picks.json` with one open stop `{kind:'pick', key:'variants:onboarding', title:'pick a flow for onboarding'}` whose candidates are, in order, `a-linear/signin`, `a-linear/invite`, `a-linear/consent`, `a-linear/session-live`, `b-sheet/signin`, … with paths `variants/onboarding/<k>/<label>.html` and whose url carries no `/review/` segment → `tests/mocks/mocks-driver-variants.test.js` (stops the serve child in `finally`)
- **AC-20260908-05-4**: WHEN `stop open variants:onboarding` runs on a forked journey with one flow directory THE SYSTEM SHALL exit 2 with stderr containing `has 1 flow(s) — 2-3 are required` and write no stop; with two directories where `b-sheet/consent.html` is missing it exits 2 naming `design/variants/onboarding/b-sheet/consent.html`; after `--mark journey-drawn --journey onboarding` was accepted it exits 2 with stderr containing `already drawn` and `--reopen journey:onboarding`; with a flow screen written with `states: []` it exits 2 with stderr containing `check --states design/variants/onboarding/` → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-5**: WHEN the `variants:onboarding` stop is decided `{verdict:'pick', pick:'b-sheet', note:'sheets keep her in the conversation', by:'jj'}` through `lib/mocks-picks.js` and `ledger.md` has no `variants:` row THE SYSTEM SHALL accept `--mark variant-picked --journey onboarding` with no `--variant` flag: exit 0, `design/mocks/signin.html` … `session-live.html` byte-equal to `design/variants/onboarding/b-sheet/<label>.html` except that `../../../wire/tokens.css` → `../wire/tokens.css` and `../../../wire/wire.css` → `../wire/wire.css`, `design/variants/onboarding/a-linear/` untouched (same bytes), `status.journeys.onboarding.variant` = `{picked:'b-sheet', rejected:['a-linear'], by:'jj', at:<ISO>, fork:'form as a page vs a sheet'}`, `status.journeys.onboarding.drawn` set, the stop `status:"consumed"`, the ledger gaining one assumptions row with claim `variants: onboarding = b-sheet`, kind `product`, tag `said-by-user`, status `confirmed <today>`, rejected `a-linear`, note `sheets keep her in the conversation`, and the last two non-blank stdout lines the `📒 ledger:` counts line and `✅ checkpoint — mocks state saved (WIREFRAMES → WIREFRAMES); safe to /clear and re-run /spec:mocks`; a second `variant-picked` after `--reopen journey:onboarding` and a fresh decided stop SHALL append no second `variants: onboarding = b-sheet` row → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-6**: WHEN `--mark variant-picked --journey onboarding` runs with no `variants:onboarding` stop THE SYSTEM SHALL exit 2 with stderr containing `no look stop for variants:onboarding` and `stop open variants:onboarding`, copying nothing into `design/mocks/`; with the stop `open` (url `U`) it exits 2 containing `waiting on U`; decided `change` by `jj` note `too dense` it exits 2 containing `change requested by jj: "too dense"`; decided pick `b-sheet` with `--variant a-linear` it exits 2 containing `disagrees with the page pick "b-sheet"`; decided pick `b-sheet` while a mock note on `consent` is unresolved it exits 2 naming that note id and copies nothing; decided pick `b-sheet` while the ledger holds an `inferred` `open` product row (gate blocked) it exits 0 — no ledger gate at this mark → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-7**: WHEN `variant-picked` was accepted for `onboarding` and no `journey-approved:onboarding` stop exists THE SYSTEM SHALL accept `--mark journey-approved --journey onboarding` (exit 0, `journeys.onboarding.approved` set, no stop consumed) and a following `notes add --scope mock --screen consent --state error --kind walk --reason no-path-back --by walk-critic --text "x"` SHALL be accepted (the screen resolves to the promoted `design/mocks/consent.html`); WHEN a root holds only `design/variants/onboarding/b-sheet/consent.html` and no `design/mocks/consent.html` THE SYSTEM SHALL refuse that same `notes add` naming `design/mocks/consent.html`; WHEN `--reopen journey:onboarding` runs after the pick THE SYSTEM SHALL print `invalidated:` containing `variant`, `drawn`, and `walk:onboarding`, set `journeys.onboarding.variant`, `drawn`, `walked` null, derive `WIREFRAMES`, and a following `--mark journey-approved --journey onboarding` (after `journey-drawn` is re-marked on the promoted copies) exits 2 containing `no look stop for journey-approved:onboarding` → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-8**: WHEN the bare driver runs at the `draw journey onboarding` step of a forked journey THE SYSTEM SHALL print a `Then:` block containing `--mark journey-drawn --journey onboarding`, `stop open variants:onboarding`, and `fork: form as a page vs a sheet`; at the same step of an unforked journey it prints `--mark journey-drawn --journey onboarding` and no line containing `stop open variants` or `fork:`; WHEN `design/variants/onboarding/{a-linear,b-sheet}/` exist on the forked journey and no `variants:onboarding` stop exists THE SYSTEM SHALL also print `look: variants: a-linear, b-sheet — \`stop open variants:onboarding\` next`; while that stop is `open` (url `U`) it prints `look: ⏳ waiting — U`; right after `variant-picked` it prints `look: ✅ picked "b-sheet" by jj at <ISO>` and a `Then:` line containing `--mark journey-approved --journey onboarding` and no line containing `stop open` → `tests/mocks/mocks-driver-variants.test.js`
- **AC-20260908-05-9**: WHEN `buildAtlas` runs over a root whose `status.json` holds `journeys.j1.variant = {picked:'x', rejected:['y','z']}` and a seed journey `j1` THE SYSTEM SHALL render, inside the `j1` section, the text `flow: x · rejected: y, z`; with `variant` null or absent the section carries no `flow:` text → `tests/design-atlas.test.js`
- **AC-20260908-05-13**: WHEN `buildAtlas` runs over a root whose `picks.json` holds an open `pick` stop with key `variants:j1` whose candidates are groups `a-linear` and `b-sheet` over labels `signin`, `invite`, `consent` THE SYSTEM SHALL render, inside the `j1` section, exactly two flow cards (one per group, each carrying its group name, its screen count `3`, and exactly one `<iframe` whose `src` ends `signin.html?clean`), a player element per card whose screen list is `signin`, `invite`, `consent` in that order, one `Pick this flow` control per card posting to `/__picks/decide` with that group, and one `compare side by side` toggle whose target is today's compare table (`class="cmp"`, one `class="chead"` per group); `?clean` SHALL strip the player's inline script exactly as it strips the picks script → `tests/design-atlas.test.js`
- **AC-20260908-05-14**: WHEN `buildAtlas` runs over a root whose `picks.json` holds an open `pick` stop with key `shape-picked` THE SYSTEM SHALL CONTINUE TO render it as the compare table with one `class="chead"` per group and no flow card or player element → the existing `shape-picked` compare-table test in `tests/design-atlas.test.js`, retagged
- **AC-20260908-05-12**: WHEN `picks.json` holds an open `pick` stop with key `variants:j1` and a seed journey `j1` THE SYSTEM SHALL CONTINUE TO render its compare table inside the `j1` section (one `class="chead"` per group, the stop listed under `#stops`) → `tests/design-atlas.test.js`, a `variants:j1` sibling of the existing `journey-approved:j1` journey-key case (a `pick` stop, so the compare table renders) — a pin, expected green against the pre-image
- **AC-20260908-05-10**: WHEN `spec/doctrine/mocks.md`, `spec/doctrine/design.md`, `spec/commands/mocks.md`, and `spec/templates/mocks-seed.md` are read THE SYSTEM SHALL show in mocks.md, under `## Mocks: State Machine`, a paragraph containing `Candidate flows`, `design/variants/`, `fork:`, `stop open variants:`, `variant-picked`, `picked flow is an approved flow`, and `winner`; under `## Mocks: Seed` the literal `fork:`; in design.md § Design Canon the words `candidate flows live under` and `design/variants/` with the file at most 160 lines; in commands/mocks.md both `journey-drawn` and `stop open variants:` in the driver-loop section; in the seed template's Journeys comment the literal `fork:`; and `citations-check.js` reports MISS=0 → `tests/consistency/design-doctrine.test.js`
- **AC-20260908-05-11**: WHEN a root has no `design/variants/` directory and no `fork:` line THE SYSTEM SHALL CONTINUE TO accept `journey-drawn` on files authored into `design/mocks/`, refuse `journey-approved` without a `journey-approved:<j>` stop and accept it with one decided `approve`, print the draw step's `Then:` block with no `stop open variants` line, and print the existing `--reopen journey:<j>` invalidated list plus the two new entries → the existing `journey-drawn` / `journey-approved` / reopen tests in `tests/mocks/mocks-driver.test.js` and `tests/mocks/mocks-driver-2.test.js`, retagged; the `Then:` clause in `tests/mocks/mocks-driver-variants.test.js`

## Assumptions (escalation triggers)

- A1 (**the premise spike — the lock gate**): drawing a forked journey 2–3 ways and letting the owner pick blind makes the first draw lose often enough to pay for the feature. Executed 2026-09-08 against the real host `umezawabussan-web` (five seed journeys, all APPROVED under the pre-ADR-0010 chain): for each journey the on-disk structure was re-transcribed gray as one column and two structurally different flows were drawn beside it (segment picker as pages / sheet / one page; checklist gate page / inline / read-first; case page + calendar / expand + slots sheet / readiness questions; form page / inline / two-step; list-then-post / post-first / digest); columns shuffled per journey, key sealed before the look; the owner walked each flow screen by screen in a click-through player (the spike's first grid surface was rejected as confusing — D3a) and picked one column per journey. **Result: the first draw lost 4 of 5** — `operator-order` picked one-page over the shipped pages flow, `maker-entry` read-first over the shipped gate-page, `early-partner` inline over the shipped form-page, `partner-intro` digest over the shipped list-then-post; only `brand-launch` re-picked the shipped story-page. The gate (≥2 of 5) is met and this spec locks; the picks and the sealed column key are the evidence. **if false** (a re-run lands N < 2): mark this spec `superseded` with `superseded_by: "premise not material — the first draw won ≥4 of 5 blind picks"`; nothing is built.
- A2: `buildAtlas`'s mock scan is `htmlFilesUnder(design/mocks)` and shapes/kit/theme dirs are read by explicit path (executed 2026-09-08: a root with `design/mocks/signin.html` and `design/variants/onboarding/a-linear/signin.html` builds exactly one `src="../mocks/signin.html?clean"` frame) — D1's exclusion is an assertion, not new walking code. **if false:** add the prune to the walk; a build-time deviation.
- A3: `journey-drawn`'s per-label checks are inline in `handleJourneyDrawn` (read 2026-09-08) — D4 extracts them into one helper both marks call, inside the driver's File Plan row. **if false:** `blocked`, ask.
- A4: The wire links in a candidate are the two literal relative paths D1 names, so the promotion rewrite is two string replacements. **if false:** the copy refuses naming the unexpected link; the session fixes the candidate.
- A5: specs/20260907/07 and /08 land first (`depends_on`): after them the chain is `… WIREFRAMES → WALK → SIGNOFF → APPROVED`, `journeys[j]` carries `walked`, `--reopen journey:<j>` already names `walk:<j>`, and the reopen refusal literal is `--reopen must be journey:<j>, shapes, kit, or walk:<j>` — this spec adds no reopen target and touches no literal those specs own. **if false:** `blocked` — build 07 and 08 first.
- A6: `design-atlas.js check` on a candidate directory binds the kit family by walk-up (executed 2026-09-08: `check design/variants/onboarding/a-linear` under a root with `design/kit/core.html` printed `⚠️ … region 1 carries neither data-kit nor data-bespoke`, `CHECK PASS (1 file(s))`, `ⓘ signin: 0 kit, 0 bespoke`, exit 0; `check --states` on the same file exit 0; `check --matrix` on it exit 1 with the kit violation) — so D3's completeness check warns but never refuses on an unmarked region, and D5's `--matrix` gate on the promoted copies is where the kit rule bites. **if false** (`check` refuses at the sketch tier): D3 passes `--states` per file, never the directory, and the kit rule stays with D5.
- A7: No third-party dependency adjudicates any claim locked here (Node builtins, `jq`, and this repo's own scripts only), so no dependency micro-spike beyond A2/A6 ran. **if false:** run the one-line check and record it before build.
- A8: The CLIENT state (brief 22a, ADR-0010 — not yet a spec) is due before this spec per JJ's 2026-09-08 ruling that the two cheaper specs go first; it is queued as a `depends_on` amendment (see Rationale) rather than named here, because a `depends_on` entry must be a spec path. **if false** (CLIENT is never planned): this spec builds after 08 alone.

## Rationale

**Why this spec exists again.** specs/20260905/03 was hardened on a clickable prototype and
superseded the day ADR-0010 redrew the chain; brief 22a keeps its premise ("re-planned against
this chain afterwards; the walk runs after the flow pick on the winner only") and JJ ruled on
2026-09-08 that the item leaves the queue now — `/spec:plan` with a kill gate, never back to the
queue. The gate is A1: the plan-time spike on a real host with the real owner. If the first
draw wins four or five of five blind picks, the feature is not material and the spec is retired
at lock with the evidence in it; if it loses two or more, the evidence locks with the spec.

**Why only forked journeys (D2).** JJ's ruling narrows the old "every journey may be drawn 2–3
ways" to journeys with a declared structural choice. The `fork:` line is the cheapest checkable
declaration: it lives where journeys are declared, it is read by the same parser, and its
absence is what keeps the unforked path byte-identical (D9). Rejected: a per-journey flag in
`status.json` (the driver derives state from disk, never from a hand-typed record) and a
count-based rule ("journeys with ≥3 screens") that would trigger on journeys with no real
alternative.

**Why the two cheaper specs go first (A5, A8).** The walk critic (08) and the client stop
(unplanned) each cost less than this and each catches flow defects on a single draw; JJ chose
to land them before spending on candidates so the spike's kill condition is judged against the
cheaper remedies already in place. The CLIENT spec does not exist yet, so the ordering is
queued as an amendment rather than faked as a `depends_on` path.

**Why no ledger gate at `variant-picked` (D4).** The old D3 ran both the notes gate and the
ledger gate at promotion; `journey-approved` (D5) runs the ledger gate anyway seconds later, and
a pick is itself a product row. Two gates on the same row for one user action is the interview
the page removes. The notes gate stays: a note on the winner's screen is the user saying "this
one, but fix that", and promotion must not erase it.

**Why picked = approved (D5), and why the walk needs no code.** Unchanged from the prototype
ruling. The walk critic resolves screens through `design/mocks/<label>.html` (08 D4) and
`journey-walked` requires `approved`; a candidate under `design/variants/` cannot satisfy either,
so "walk the winner only" is a structural fact pinned by AC-7's refusal clause, never a second
rule.

**Why a player, not the grid (D3a).** The 2026-09-05 prototype ruling chose the whole-flow compare grid; JJ's 2026-09-08 reaction to the spike's own grid overrides it. The grid is not deleted — it answers "how do these two differ at this step", which is a real question once a pick is close — but it stops being the first thing a picker meets. Rejected: keeping the grid alone (the confusion was reported on it directly) and replacing it entirely (the side-by-side read is what a torn picker asks for).

**Why the atlas, not the review page (D3).** specs/20260906/04 D6 keeps the review page for the
single-flow journey look; a compare table across flows is the atlas's pick renderer, already
keyed on `variants:<j>`. Moving it would build a second compare renderer for one stop kind.

**Why the escape class and no doctrine (D10).** core § Incident Policy admits a guard on a ledger
count, never on a claim; the class name is the count's key and costs nothing. A doctrine
paragraph would be incident memory in an invariants file.

**Collision closure** (executed at lock, see the ledger row). No literal is retired by any
Decision; the paths leg lists every test that spawns `mocks-driver.js` or `design-atlas.js`
outside the File Plan — waived: D9 keeps every existing mark, step, and CLI path byte-identical
on a root without `design/variants/` and without a `fork:` line; the build's whole-suite check
adjudicates.

**Fragile.** Seed label order defines row order in the compare table; a label added to the
journey mid-flow reopens the completeness check on every candidate directory. The spike's
blindness is partial — the owner knows their own site — so a first-draw win is weaker evidence
than a first-draw loss; the gate is written on losses for that reason.

## Canonical Delta

`docs/canonical/design.md` "The mocks command" section: replace the parenthetical
"`variant-picked` when candidate flows are used" with a paragraph **Candidate flows
(specs/20260908/05)**: a journey whose seed entry carries a `fork:` line may be drawn 2–3 ways
under `design/variants/<journey>/<k>/`, each directory a complete set of the journey's screens
in the wireframe register with their gray states; `stop open variants:<j>` opens a pick stop
(groups = flows) rendered by the atlas as the compare table inside the journey's section;
`--mark variant-picked --journey <j>` reads the page's pick, copies the winner into
`design/mocks/` (wire links rewritten to the top-level depth), records `journeys[j].variant`
with the rejected flows, the fork text and the why-line, consumes the stop, and appends the
`variants: <j> = <k>` ledger row; a picked flow is an approved flow — `journey-approved` accepts
on the record after every gate it runs today — and `--reopen journey:<j>` clears it; WALK reads
`design/mocks/` only, so the critic walks the winner and never a loser. `design/variants/` is
never walked as screens, never counted as unabsorbed, and never enters the derived manifest. An
owner rejecting an approved flow after it is built is recorded with `/spec:escape` as class
`design-flow-choice`; that ledger count is the only evidence that widens or retires the feature.
