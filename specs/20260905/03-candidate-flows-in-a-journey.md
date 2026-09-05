---
date: 2026-09-05
status: hardened
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: [specs/20260905/02-design-review-hub-and-look-stops.md, specs/20260905/04-per-project-look-server.md]
depended_on_by: []
brief: n/a
---

# Candidate flows in a journey: draw a journey 2–3 ways, pick the whole flow on the page

## Goal

Shapes and theme directions are candidate groups; a journey is not — today a journey is drawn
once and approved. The user's 2026-09-05 ruling (confirmed on a clickable prototype) adds the
third group: a journey may be drawn as 2–3 **candidate flows**, each a complete set of the
journey's screens, compared step by step on the atlas, and picked as a whole — one pick
chooses the set, a single screen disliked inside the winner becomes a note on that screen,
never a second pick. Done means: candidate flows have a home on disk that no existing walk
mistakes for the journey's mocks, the driver opens a pick stop for them and promotes the
winner into `design/mocks/` while recording the losers, the picked flow counts as the journey's
approval so no second look is asked, and the WIREFRAMES step tells the session both paths exist.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | Candidate flows live at `design/variants/<journey>/<kebab>/<label>.html` — one directory per flow, holding **every** label the journey declares in `seed.md`, each file in the wireframe register (root `data-screen-label="<label>"`, `data-status="sketch"`, `data-variant="<kebab>"`, links `../../../wire/tokens.css` and `../../../wire/wire.css`); `design/variants/` is never walked by `buildAtlas`'s mock scan nor by `journey-drawn` (it renders only through a stop, spec 01 D3) (AC-20260905-03-1) | Same posture as `design/shapes/` and `design/theme/<k>/`: candidates outside `design/mocks/` so the atlas walk, `journey-drawn`, and `approved`'s matrix check never see a loser as a screen. A whole set per flow is what "one pick chooses the flow" means. |
| D2 | `mocks-driver.js stop open variants:<j>` joins spec 02 D6's step set: requires `canon-written`, `<j>` declared, `journeys[j].drawn` null (a drawn journey is reopened first), and 2–3 directories under `design/variants/<j>/` each complete (every declared label present, `design-atlas.js check <dir>` green) — refusing (exit 2) naming the drawn journey, the count, the first missing `<kebab>/<label>.html`, or the failing check line; opens a `pick` stop, key `variants:<j>`, title `pick a flow for <j>`, groups = the kebabs in sorted order, candidates = every (kebab, label) in seed label order with path `variants/<j>/<k>/<label>.html`; prints spec 02's two lines with the pick reply variant (AC-20260905-03-2, AC-20260905-03-3) | The driver already knows the journey's labels; the session never types candidates. The completeness rule is checked here, before the user looks, so a hole in a flow is a refusal, not a blank cell on the page. |
| D3 | New mark `variant-picked --journey <j> [--variant <k>]`: reads the newest non-superseded `variants:<j>` stop exactly as spec 02 D7 reads a pick (none → `no look stop for variants:<j> — run stop open variants:<j> first`; `open` → `waiting on <url>`; decided `change` → `change requested by <by>: "<note>"`; a `--variant` that disagrees with the pick refuses naming both); runs the ledger gate and `requireNotesResolved` for the journey's labels; copies every `variants/<j>/<pick>/<label>.html` to `design/mocks/<label>.html` byte-identical (overwriting a stale copy) and rewrites the two `../../../wire/` links to `../wire/` in the copy; runs `journey-drawn`'s own per-label checks on the copies (label, `sketch` status, both wire links, `design-atlas.js check`); records `journeys[j].variant = {picked:<k>, rejected:[<others>], by, at}` and `journeys[j].drawn = now`; consumes the stop; when `ledger.md` has no confirmed said-by-user product row with claim `variants: <j> = <k>` it appends one via `mocks-ledger.appendAssumption` (step `WIREFRAMES`, rejected = the other kebabs comma-joined, note = the why-line or `picked on the page`); prints the counts line and the checkpoint line; losers stay on disk untouched (AC-20260905-03-4, AC-20260905-03-5) | The copy is the promotion (`theme-picked` copies `tokens.css` the same way); the link rewrite is the one byte-level difference a nested candidate needs to become a top-level mock; rejected flows are provenance, not garbage. |
| D4 | A picked flow is an approved flow: `journey-approved --journey <j>` accepts, when no `journey-approved:<j>` stop exists, a `journeys[j].variant` record whose `at` is newer than the journey's last reopen as its verdict (gate and notes-resolved still apply; `--reopen journey:<j>` clears `variant` and `drawn` and lists `variant`, `drawn` in `invalidated`); the WIREFRAMES bare step after `variant-picked` prints `look: ✅ picked "<k>" by <by> at <ISO>` and `Then:` the `journey-approved` mark line, never a second `stop open` (AC-20260905-03-6, AC-20260905-03-7) | The pick was the look; asking the user to approve the screens they just chose is the interview the page exists to remove. Reopen must clear the record or a stale pick would re-approve a redrawn journey. |
| D5 | The WIREFRAMES "draw journey <j>" step's `Then:` lists both paths — `--mark journey-drawn --journey <j>` (one flow drawn straight into `design/mocks/`) and `stop open variants:<j>` (2–3 candidate flows under `design/variants/<j>/<k>/`) — and when `design/variants/<j>/` holds directories and no `variants:<j>` stop is open or decided its `look:` line reads `variants: <k1>, <k2> — stop open variants:<j> next`; spec 02 D8's `look:` derivation covers the open/change/decided cases with the `variant-picked` mark line filled in (AC-20260905-03-8) | The checkpoint contract: the driver prints the one next action; the session must not discover the variants path from doctrine memory. |
| D6 | `buildAtlas`: after `variant-picked`, the `<j>` journey section's meta line carries `flow: <k> · rejected: <others>` read from `status.json`'s `journeys[j].variant` (nothing when absent); the open/decided `variants:<j>` stop itself renders in that section through spec 01 D3's key grammar with no code of its own here (AC-20260905-03-9) | The page shows what was decided where it was decided; the rendering rule already exists. |
| D7 | Doctrine: `spec/doctrine/mocks.md` § Mocks: State Machine gains a paragraph **Candidate flows** (the `design/variants/` home, completeness, `stop open variants:<j>`, `variant-picked` promotes and records, picked = approved, reopen clears); `spec/commands/mocks.md`'s driver-loop section gains one sentence naming the two WIREFRAMES paths; `spec/doctrine/design.md` § Design Canon's "one responsive mock per surface" bullet gains "candidate flows live under `design/variants/` until picked"; bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.84.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` (AC-20260905-03-10) | New-surface checklist; the doctrine paragraph is what `spec-paths shared-mocks` hands the next session. |
| D8 | Additive only: `journey-drawn` on files authored straight into `design/mocks/`, `journey-approved` with a `journey-approved:<j>` stop, and every other mark keep their contracts; a root with no `design/variants/` directory behaves byte-identically to today (AC-20260905-03-11) | Regression pin — the single-flow path is the common case and must not change under the candidate path. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2/D3/D4/D5: `stop open variants:<j>`, `variant-picked` mark (copy + link rewrite + checks + record + consume + ledger row), `journey-approved` verdict fallback, reopen clearing `variant`, WIREFRAMES step text and `look:` line; header updated |
| spec/scripts/design-atlas.js | MODIFY | scripts | D1/D6: `design/variants/` excluded from the mock walk; journey meta line `flow: <k> · rejected: …` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D7: **Candidate flows** paragraph under § Mocks: State Machine |
| spec/doctrine/design.md | MODIFY | doctrine | D7: one clause on the "one responsive mock per surface" bullet |
| spec/commands/mocks.md | MODIFY | doctrine | D7: the two WIREFRAMES paths, one sentence in the driver loop |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version bump + changelog entry |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260905-03-2, AC-20260905-03-3, AC-20260905-03-4, AC-20260905-03-5, AC-20260905-03-6, AC-20260905-03-7, AC-20260905-03-8, AC-20260905-03-11 — `writeVariants(dir, journey, kebab, labels)` helper |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260905-03-1, AC-20260905-03-9 |
| tests/design-look-handoff.test.js | MODIFY | tests | AC-20260905-03-10 (doctrine literals) |

## Contracts

```
design/variants/<journey>/<kebab>/<label>.html      one dir per candidate flow, every declared label present
  <link rel="stylesheet" href="../../../wire/tokens.css">
  <link rel="stylesheet" href="../../../wire/wire.css">
  <main data-screen-label="<label>" data-status="sketch" data-variant="<kebab>">…</main>

mocks-driver.js --root <dir> stop open variants:<j>
  stdout (exactly two lines, spec 02 D6):
    🎨 ready for review — <url>
    Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>
  stop written: {kind:'pick', key:'variants:<j>', title:'pick a flow for <j>',
                 candidates:[{group:'<k>', label:'<label>', path:'variants/<j>/<k>/<label>.html'}, …]}
                 groups in sorted kebab order, labels in seed order within a group
  exit 2 (stderr, one of):
    mocks-driver: journey "<j>" is already drawn — `--reopen journey:<j>` first, then stop open variants:<j>
    mocks-driver: design/variants/<j>/ has <n> flow(s) — 2-3 are required
    mocks-driver: design/variants/<j>/<k>/<label>.html does not exist — every flow holds every label of "<j>"
    mocks-driver: design-atlas.js check design/variants/<j>/<k> failed: <line>

mocks-driver.js --root <dir> --mark variant-picked --journey <j> [--variant <k>]
  verdict source: newest non-superseded stop with key variants:<j> (spec 02 D7 refusals verbatim, plus)
    mocks-driver: --variant <k> disagrees with the page pick "<pick>" (stop <id>)
  effects: design/mocks/<label>.html ← variants/<j>/<pick>/<label>.html (links rewritten ../../../wire/ → ../wire/)
           status.journeys[j].variant = {picked, rejected:[…], by, at};  status.journeys[j].drawn = <now>
           stop → consumed;  ledger row (when absent):
           | <next id> | WIREFRAMES | product | variants: <j> = <k> | said-by-user | confirmed <date> | <others> | - | <why or "picked on the page"> |
  tail: the 📒 counts line, then ✅ checkpoint — mocks state saved (WIREFRAMES → WIREFRAMES); …

--reopen journey:<j>   invalidated now lists: approved, skinned, reviewed, approved(all), variant, drawn

status.json (schemaVersion 1, additive field)
  "journeys": { "<j>": { "drawn", "approved", "skinned", "reviewed",
                         "variant": null | {"picked":"<k>","rejected":["<k2>"],"by":"<who>","at":"<ISO>"} } }

WIREFRAMES step text (draw journey <j>) — Then: carries both lines:
  node … --mark journey-drawn --journey <j>            (one flow, drawn into design/mocks/)
  node … stop open variants:<j>                        (2-3 candidate flows under design/variants/<j>/<k>/)
  look: variants: <k1>, <k2> — `stop open variants:<j>` next     (when variant dirs exist and no stop)

atlas journey section meta line (after variant-picked): flow: <k> · rejected: <k2>, <k3>
```

## Behavior

**Drawing candidate flows.** At WIREFRAMES the session either draws the journey once into
`design/mocks/` (today's path) or draws it 2–3 ways under `design/variants/<j>/<k>/`, each a
complete set. The driver refuses to open the stop while a flow is missing a label, so the page
never shows a half flow.

**The look.** `stop open variants:<j>` writes the stop and prints the link; spec 01's atlas
renders it inside the journey's section as the compare table (rows = the journey's steps,
columns = flows). The user picks a column; a screen they dislike inside the winner gets a
mock note on that screen, which `variant-picked` then refuses on until resolved, exactly as
`journey-approved` does today.

**Promotion.** `variant-picked` copies the winner's files to `design/mocks/`, rewriting only
the two wire links (a nested candidate links `../../../wire/`, a top-level mock `../wire/`),
runs the same checks `journey-drawn` runs, and records the pick with the rejected kebabs and the
why-line. The rejected directories stay; they are never rendered again once the stop is
consumed, and a later `--reopen journey:<j>` lets the session open a fresh stop over them or
over new ones.

**No second look.** After promotion the journey is `drawn` and its `variant` record is newer
than any reopen, so the next bare run prints `look: ✅ picked "<k>" …` and the
`journey-approved` mark line; that mark accepts on the variant record (gate and notes still
apply). A journey drawn the single-flow way still needs spec 02's `journey-approved:<j>` stop.

**Reopen.** `--reopen journey:<j>` clears `variant` and `drawn` with the other marks. The
promoted copies stay in `design/mocks/` (reopen never deletes); the next `stop open
variants:<j>` requires `drawn` null, which reopen provides.

## Acceptance Criteria

- **AC-20260905-03-1**: WHEN `buildAtlas` runs over a root holding `design/mocks/a.html` (label `a`) and `design/variants/j1/x/a.html` (label `a`, `data-variant="x"`) with no stop THE SYSTEM SHALL render exactly one `<iframe` whose `src` ends `mocks/a.html?clean`, none ending `variants/j1/x/a.html?clean`, and no `x` badge or card; and `--mark journey-drawn --journey j1` on that root SHALL judge only `design/mocks/a.html` (a broken `design/variants/j1/x/a.html` with no wire links does not make it refuse) → `tests/design-atlas.test.js` (render), `tests/mocks/mocks-driver.test.js` (mark)
- **AC-20260905-03-2**: WHEN `stop open variants:onboarding` runs after `canon-written` with `design/variants/onboarding/{a-linear,b-sheet}/` each holding `signin.html`, `invite.html`, `consent.html`, `session-live.html` in the wireframe register, with a `design-atlas.js serve` child up on a free `--port` (specs/20260905/04 D4) THE SYSTEM SHALL exit 0, print exactly two lines — the first matching `^🎨 ready for review — http://localhost:\d+/atlas/index\.html#stop-P\d{3}$`, the second exactly `Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>` — and leave `picks.json` with one open stop `{kind:'pick', key:'variants:onboarding', title:'pick a flow for onboarding'}` whose candidates are, in order, `a-linear/signin`, `a-linear/invite`, `a-linear/consent`, `a-linear/session-live`, `b-sheet/signin`, … with paths `variants/onboarding/<k>/<label>.html` → `tests/mocks/mocks-driver.test.js` (stops the serve child in `finally`)
- **AC-20260905-03-3**: WHEN `stop open variants:onboarding` runs with one flow directory THE SYSTEM SHALL exit 2 with stderr containing `has 1 flow(s) — 2-3 are required` and write no stop; with two directories where `b-sheet/consent.html` is missing it exits 2 naming `design/variants/onboarding/b-sheet/consent.html`; after `--mark journey-drawn --journey onboarding` was accepted it exits 2 with stderr containing `already drawn` and `--reopen journey:onboarding`; with a flow file that fails `design-atlas.js check` (a literal `#ff0000` color) it exits 2 with stderr containing `design-atlas.js check design/variants/onboarding/` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-4**: WHEN the `variants:onboarding` stop is decided `{verdict:'pick', pick:'b-sheet', note:'sheets keep her in the conversation', by:'jj'}` through `lib/mocks-picks.js` and `ledger.md` has no `variants:` row THE SYSTEM SHALL accept `--mark variant-picked --journey onboarding` with no `--variant` flag: exit 0, `design/mocks/signin.html` … `session-live.html` byte-equal to `design/variants/onboarding/b-sheet/<label>.html` except that `../../../wire/tokens.css` → `../wire/tokens.css` and `../../../wire/wire.css` → `../wire/wire.css`, `design/variants/onboarding/a-linear/` untouched (same bytes), `status.journeys.onboarding.variant` = `{picked:'b-sheet', rejected:['a-linear'], by:'jj', at:<ISO>}`, `status.journeys.onboarding.drawn` set, the stop `status:"consumed"`, the ledger gaining one assumptions row with claim `variants: onboarding = b-sheet`, kind `product`, tag `said-by-user`, status `confirmed <today>`, rejected `a-linear`, note `sheets keep her in the conversation`, and the last two non-blank stdout lines the `📒 ledger:` counts line and `✅ checkpoint — mocks state saved (WIREFRAMES → WIREFRAMES); safe to /clear and re-run /spec:mocks` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-5**: WHEN `--mark variant-picked --journey onboarding` runs with no `variants:onboarding` stop THE SYSTEM SHALL exit 2 with stderr containing `no look stop for variants:onboarding` and `stop open variants:onboarding`, copying nothing into `design/mocks/`; with the stop `open` (url `U`) it exits 2 containing `waiting on U`; decided `change` by `jj` note `too dense` it exits 2 containing `change requested by jj: "too dense"`; decided pick `b-sheet` with `--variant a-linear` it exits 2 containing `disagrees with the page pick "b-sheet"`; decided pick `b-sheet` while a mock note on `consent` is unresolved it exits 2 naming that note id and copies nothing → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-6**: WHEN `variant-picked` was accepted for `onboarding` and no `journey-approved:onboarding` stop exists THE SYSTEM SHALL accept `--mark journey-approved --journey onboarding` (exit 0, `journeys.onboarding.approved` set); WHEN `--reopen journey:onboarding` then runs THE SYSTEM SHALL print `invalidated:` containing `variant` and `drawn`, set `journeys.onboarding.variant` null and `drawn` null, derive `WIREFRAMES`, and a following `--mark journey-approved --journey onboarding` (after `journey-drawn` is re-marked on the promoted copies) exits 2 containing `no look stop for journey-approved:onboarding` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-7**: WHEN the bare driver runs right after `variant-picked` for `onboarding` THE SYSTEM SHALL print `look: ✅ picked "b-sheet" by jj at <ISO>` and a `Then:` line containing `--mark journey-approved --journey onboarding`, and no line containing `stop open` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-8**: WHEN the bare driver runs at the `draw journey onboarding` step THE SYSTEM SHALL print a `Then:` block containing both `--mark journey-drawn --journey onboarding` and `stop open variants:onboarding`; WHEN `design/variants/onboarding/{a-linear,b-sheet}/` exist and no `variants:onboarding` stop exists THE SYSTEM SHALL also print `look: variants: a-linear, b-sheet — \`stop open variants:onboarding\` next`; while that stop is `open` (url `U`) it prints `look: ⏳ waiting — U` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-03-9**: WHEN `buildAtlas` runs over a root whose `status.json` holds `journeys.j1.variant = {picked:'x', rejected:['y','z']}` and a seed journey `j1` THE SYSTEM SHALL render, inside the `j1` section, the text `flow: x · rejected: y, z`; with `variant` null or absent the section carries no `flow:` text → `tests/design-atlas.test.js`
- **AC-20260905-03-10**: WHEN `spec/doctrine/mocks.md`, `spec/doctrine/design.md`, and `spec/commands/mocks.md` are read THE SYSTEM SHALL show in mocks.md, under `## Mocks: State Machine`, a paragraph containing `Candidate flows`, `design/variants/`, `stop open variants:`, `variant-picked`, and `picked flow is an approved flow`; in design.md § Design Canon the words `candidate flows live under` and `design/variants/`; in commands/mocks.md both `journey-drawn` and `stop open variants:` in the driver-loop section → `tests/design-look-handoff.test.js`
- **AC-20260905-03-11**: WHEN a root has no `design/variants/` directory THE SYSTEM SHALL CONTINUE TO accept `journey-drawn` on files authored into `design/mocks/`, refuse `journey-approved` without a `journey-approved:<j>` stop and accept it with one decided `approve`, and print the existing `--reopen journey:<j>` invalidated list plus the two new entries → the existing `journey-drawn` / `journey-approved` / reopen tests in `tests/mocks/mocks-driver.test.js`, retagged

## Assumptions (escalation triggers)

- A1: Spec 02 lands `stop open <step>`, the verdict-from-disk mark handlers, `consumeStop`, the ledger-row derivation, and the `look:` line derivation (`depends_on`); this spec extends each with one step, one mark, one key. **if false:** `blocked` — build 02 first.
- A2: `buildAtlas`'s mock scan is `htmlFilesUnder(design/mocks)` and shapes/theme dirs are read by explicit path (read 2026-09-05) — `design/variants/` is outside the scan by construction, so D1's exclusion is an assertion, not new walking code. **if false:** add the prune to the walk; a build-time deviation.
- A3: `journey-drawn`'s per-label checks are one function over `design/mocks/<label>.html` (read 2026-09-05, `handleJourneyDrawn`) — D3 reuses it on the promoted copies. **if false:** extract the per-label loop first; a build-time refactor inside the File Plan row.
- A4: The wire links in a candidate are the two literal relative paths D1 names, so the promotion rewrite is two string replacements. **if false:** the copy refuses naming the unexpected link; the session fixes the candidate.
- A5: 7.84.0 is the target after spec 02's 7.83.0; concurrent sessions may take it — the build bumps to the next free version and records the deviation (§ Gotchas). **if false:** bump to the next free version.
- A6: No dependency-adjudicated claim is locked here (Node builtins and this repo's own scripts only), so no micro-spike ran. **if false:** run the one-line check and record it before build.

## Rationale

The user asked for candidates at every pick stage. Shapes and themes already had a home and a
mark; journeys did not, and the prototype settled the two open questions: a journey's
candidates are whole flows, picked as a set (mix-and-match per screen was rejected — a flow
stitched from directions never designed together), and the pick on the page is the approval.

**Why `design/variants/`.** Anything under `design/mocks/` is a screen to every existing
reader; a candidate that is not yet the screen must live elsewhere, as shapes and theme
directions do. One directory per flow with every label makes completeness checkable before the
look.

**Why copy, not reference.** `journey-drawn`, `journey-skinned`, the notes gate, the matrix
check, and the atlas all key on `design/mocks/<label>.html`; a winner that stays under
`variants/` would need every reader taught a second location. `theme-picked` already promotes
by copying `tokens.css`. The link rewrite is the only byte that differs by depth.

**Why picked = approved.** Spec 02 makes `journey-approved` demand a stop. Asking the user to
approve the flow they picked seconds earlier is the interview the page removes; the variant
record carries who picked and when, so the reopen rule (record older than the last reopen is
not a verdict) keeps a stale pick from approving a redrawn journey.

**Why no atlas code beyond a meta line.** Spec 01's key grammar names `variants:<j>` and
renders any pick stop as the compare table inside the owning journey section; this spec only
adds the "what was decided" line once the stop is consumed.

**Collision closure** (executed at lock 2026-09-05, `unplanned=11 likely=3`). `executes` hits
outside the File Plan — `tests/mocks/mocks-notes.test.js`,
`tests/consistency/design-doctrine.test.js`, `tests/spec-paths.test.js` (they spawn
`mocks-driver.js`) and `tests/design-shell.test.js` (spawns `design-atlas.js`) — are waived:
D8 keeps every existing mark, step, and CLI path byte-identical on a root without
`design/variants/`, so no fixture repair is owed here (spec 02 D11 already seeds the stops those
files need); the build's whole-suite check adjudicates. `likely`/`mentions` hits owe nothing. No
literal is retired, so the literals leg was not run.

**Fragile.** Seed label order defines row order in the compare table; a label added to the
journey mid-flow reopens the completeness check on every candidate directory.

**Amended 2026-09-05 at spec 04's lock (specs/20260905/04 D8).** AC-2's link pattern, env clause and
`finally` clause were rewritten for the per-project look server: no hub, no `SPEC_DESIGN_HUB_*`,
the test starts `design-atlas.js serve` on a free port; `depends_on` gained spec 04.

## Canonical Delta

`docs/canonical/design.md` "The mocks command" section gains a paragraph **Candidate flows
(specs/20260905/03)**: a journey may be drawn 2–3 ways under `design/variants/<journey>/<k>/`,
each directory a complete set of the journey's screens in the wireframe register; `stop open
variants:<j>` opens a pick stop (groups = flows) rendered by the atlas as the compare table
inside the journey's section; `--mark variant-picked --journey <j>` reads the page's pick,
copies the winner into `design/mocks/` (wire links rewritten to the top-level depth), records
`journeys[j].variant` with the rejected flows and the why-line, consumes the stop, and appends
the `variants: <j> = <k>` ledger row; a picked flow is an approved flow — `journey-approved`
accepts on the record — and `--reopen journey:<j>` clears it. `design/variants/` is never
walked as screens.
