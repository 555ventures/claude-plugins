---
date: 2026-09-10
status: implementing
build_base: main
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md, specs/20260910/06-real-records-and-two-dense-screens.md]
depended_on_by: []
brief: 22a
open_markers: 0
diff_base: 7fd991183eddfd79dc37d99789fca2afeca3a52c
---

# The theme is picked by the client before the walk: candidates on the two dense screens, the user's shortlist, one client pick, every walked screen served in the picked roles

## Goal

ADR-0013 returns the theme pick to `/spec:mocks`, between `WALK` and `CLIENT`, and gives the
pick to the client from a shortlist the user composed. Today the theme is authored at the first
`/spec:sketch` (after genesis and the roadmap) as the gray kit re-rendered per direction, picked
by the user on the atlas, and wireframes are never themed. This spec adds a `THEME` state:
the user authors directions under `design/theme/<kebab>/` as today, `theme shortlist` opens a
client pick stop whose candidates are the seed's two dense screens served in each direction's
roles, the client picks on `/client/theme.html`, `--mark theme-picked` adopts it (tokens copied,
ledger row, the same discipline `theme adopt` has), and from then on every mock the client walks
is served with `?theme=<kebab>`, which swaps the wire register's token file for the direction's.
The session's own pages stay neutral. Done means the client walks every journey in a look they
chose, and `/spec:sketch` finds the theme already picked.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `GET /mocks/<label>.html?theme=<kebab>` rewrites, in the served HTML only, every stylesheet target that `linksWireRegister` recognizes as `wire/tokens.css` to `theme/<kebab>/tokens.css` (path-relative as the original was); `kebab` must be `[a-z0-9-]+` and `design/theme/<kebab>/tokens.css` must exist, else the param is ignored (advisory tooling, as `?state`). `?theme` composes with `?clean`, `?walk`, `?state=` (AC-20260910-04-1) | The register's eleven roles are the whole theme surface (ADR-0013); one link swap themes any screen with no redraw |
| D2 | `composeViolations(kebab)` additionally refuses a direction whose `tokens.css` does not declare every role `wire-tokens.css` declares under `:root` (the eleven, read from the template at run time — never a hard-coded list), naming the missing roles: `design/theme/<k>/tokens.css: missing role(s) --ring, --shadow — every wire role must be re-valued` (AC-20260910-04-2) | A direction missing a role renders that role unset on the swap; the check keeps the swap total |
| D3 | The mocks chain becomes `SEED → SHAPES → KIT → WIREFRAMES → WALK → THEME → CLIENT → APPROVED`: `deriveState` returns `THEME` when every journey is walked and `status.marks.themePicked` is unset. `AUTHORING_STATES` gains `THEME` (the look probe runs). `--reopen theme` clears `themePicked`, `marks.approved` and `decider`. A host already past WALK with `design/tokens.css` present and non-wire derives `THEME` once and `--mark theme-picked --direction <k>` accepts a direction whose `tokens.css` is byte-equal to `design/tokens.css` without a stop (the legacy path) (AC-20260910-04-3, AC-20260910-04-9) | ADR-0013's placement; the legacy path keeps a host that picked at sketch from re-picking |
| D4 | `theme shortlist --directions <a,b[,c]> [--port <n>]`: every named direction must compose (D2), at least two; opens a `pick` stop `{key:'theme-picked', title:'pick the theme', candidates}` with one candidate per (direction × dense screen): `{group:<k>, label:<dense>, path:'mocks/<dense>.html?theme=<k>'}` in seed dense-screen order, `--page /client/theme.html`, and prints the two look-stop lines with the url. `theme open` (the atlas kit pick) is retired: it exits 2 naming `theme shortlist`. A direction on disk but not named is simply not shown (AC-20260910-04-4) | The user's shortlist is the `--directions` list; the client sees only what the user put in front of them |
| D5 | `GET /client/theme.html` (design-atlas.js, `lib/walk-page.js` `buildThemePage({ stop, seed, prefix, lang })`) renders the open or decided `theme-picked` stop as a compare table: one row per dense screen, one column per direction, each cell a frame of `<prefix>/mocks/<dense>.html?clean&theme=<k>` at the first viewport, a `<button data-th="pick" data-group="<k>">` per column, the picked column marked once decided; the button posts `POST <prefix>/client/__picks/decide {id, verdict:'pick', pick:<k>, by:'client'}`. `/client/__picks/decide` is the picks decide route mounted on the client route with `by` forced to `client` and refused for any stop whose key is not `theme-picked` (400). With no such stop the page renders the D2 `lang` string for "nothing to pick yet" (AC-20260910-04-5) | The existing compare-table semantics, the client route's origin rule, one key admitted |
| D6 | `--mark theme-picked [--direction <k>]`: requires the decided `theme-picked` stop (`requireStopDecision`, remedy `theme shortlist`), a `--direction` that disagrees refuses; then the `theme adopt` body verbatim (compose check, supersede other `theme:` rows, append the confirmed said-by-user `theme: <k>` row with the rejected siblings, copy `tokens.css`, consume the stop) and sets `status.marks.themePicked` and `status.theme = <k>`. `theme adopt` is retired: it exits 2 naming `--mark theme-picked` (AC-20260910-04-6) | One mark, the adopt discipline unchanged, recorded in the state machine |
| D7 | `buildWalkPage` receives `theme: status.theme` and the player appends `&theme=<k>` to every frame `src` when set; `buildThemePage` and the index link the theme page while the stop is open. The atlas index, the session's review page and every non-client route serve no `?theme` (AC-20260910-04-7) | The client walks themed; the session keeps the neutral register for its own audit |
| D8 | `design-atlas.js check`'s "still linking `wire/` once `design/tokens.css` exists" rule prints no `⚠️` for a `data-status="sketch"` mock when `design/mocks/status.json` carries `marks.themePicked` — the wireframes are themed by the swap, never by relinking (AC-20260910-04-8, AC-20260910-04-11) | Otherwise every check during CLIENT prints one warning per screen for a condition that is now by design |
| D9 | `/spec:sketch` step 3 (`spec/commands/sketch.md`): `theme state` returning `picked` is the normal path once mocks picked it; the interview/`theme open`/`theme adopt` prose is replaced by "the theme was picked in `/spec:mocks` (THEME); when `design/tokens.css` is absent on a host that skipped mocks, author directions and pick through `theme shortlist` + `--mark theme-picked`". `spec/doctrine/mocks.md` § Mocks: State Machine gains the THEME sentence; § Mocks: Look and Serve names `?theme`; `spec/doctrine/design.md` line "the theme itself is picked on `/spec:sketch`'s first run" becomes "picked in `/spec:mocks`'s THEME state by the client on the two dense screens"; `spec/commands/mocks.md` gains `## Theme (THEME state)` (AC-20260910-04-10) | Doctrine binding homes; sketch keeps its kit-authoring role |
| D10 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D11 | `size-baseline.json` is raised for `design-atlas.js`, `mocks-driver.js` and the `spec/scripts` tree by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260910/04-theme-before-the-client-walk.md` [no-ac: the ratchet's live test is the oracle] | Both entry points sit at their ceilings |
| D12 | Sibling test files outside the File Plan that assert the pre-ADR-0013 flow are **cleaned up, not retagged** (JJ ruling, 2026-09-11, mid-build): a test whose whole contract this spec retires (`--reopen theme` refused, `never THEME`, `theme-picked` an unknown mark, no top-level `theme` key, CLIENT derived straight from WALK) is **deleted**, never rewritten to assert the new shape — the new shape already has its own executed tests in this spec's own File Plan rows. A test whose contract survives and only fails because its fixture no longer reaches the state it walks to is fixed **once, in the shared fixture**, never per test file. Affected files admitted to scope: `tests/mocks/mocks-driver-2.test.js`, `tests/mocks/mocks-driver-client.test.js`, `tests/mocks/mocks-driver-look-stops-4.test.js`, `tests/mocks/mocks-driver-walk.test.js`, `tests/mocks/mocks-driver.test.js` [no-ac: the gate is the oracle] | The suite is already large; a retired contract earns a deletion, and one fixture fix beats thirteen hand edits |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1 `?theme` swap; D5 `/client/theme.html` + client picks decide; D8 warn suppression |
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D5 `buildThemePage`; D7 theme on frame src and index link |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D7 `&theme=` on every frame src |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2 role check; D3 THEME state, reopen, legacy path; D4 `theme shortlist`; D6 `--mark theme-picked`; `theme open`/`adopt` retired |
| spec/doctrine/mocks.md | MODIFY | doctrine | D9 |
| spec/doctrine/design.md | MODIFY | doctrine | D9 |
| spec/commands/mocks.md | MODIFY | doctrine | D9 |
| spec/commands/sketch.md | MODIFY | doctrine | D9 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 bump |
| size-baseline.json | MODIFY | other | D11 raise |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | `advanceToJourneyWalked` gains a helper `advanceToThemePicked` (two composed directions, a decided client stop, the mark); `advanceToApproved` goes through it |
| tests/mocks/theme-serve.test.js | CREATE | tests | AC-20260910-04-1, AC-20260910-04-5, AC-20260910-04-7, AC-20260910-04-8, AC-20260910-04-11 |
| tests/mocks/mocks-driver-theme-2.test.js | CREATE | tests | AC-20260910-04-2, AC-20260910-04-3, AC-20260910-04-4, AC-20260910-04-6, AC-20260910-04-9 |
| tests/mocks/mocks-driver-theme.test.js | MODIFY | tests | the `theme open`/`theme adopt` pins retagged to the retired-command refusals (AC-20260910-04-4, AC-20260910-04-6); the "no THEME state" derivations (AC-20260907-10-1's `never THEME` clause, AC-20260907-07-2's `theme-picked` unknown-mark clause) retired by ADR-0013 and re-pinned to D3 |
| tests/mocks/mocks-driver-3.test.js | MODIFY | tests | AC-20260907-10-1's `never THEME` derivation clause retired by ADR-0013 and retagged to AC-20260910-04-3 (the derivation now lands on THEME between WALK and CLIENT) |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260910-04-10 |

## Contracts

```
GET /mocks/<label>.html?theme=<kebab>          # <link href="../wire/tokens.css"> → "../theme/<kebab>/tokens.css"
GET /client/theme.html                          # compare table: rows = dense screens, columns = directions
POST /client/__picks/decide {id, verdict:'pick', pick:<kebab>}   # by forced to 'client'; key must be theme-picked

mocks-driver.js --root <dir> theme shortlist --directions <a,b[,c]> [--port <n>]
mocks-driver.js --root <dir> --mark theme-picked [--direction <k>]
mocks-driver.js --root <dir> --reopen theme
```

```jsonc
// picks.json stop opened by theme shortlist (two dense screens, three directions → six candidates)
{ "kind": "pick", "key": "theme-picked", "title": "pick the theme",
  "candidates": [
    { "group": "warm-paper", "label": "session-live", "path": "mocks/session-live.html?theme=warm-paper" },
    { "group": "warm-paper", "label": "roster",       "path": "mocks/roster.html?theme=warm-paper" },
    { "group": "ink",        "label": "session-live", "path": "mocks/session-live.html?theme=ink" },
    …
  ] }
```

```jsonc
// status.json additions
{ "marks": { "themePicked": "<ISO>" }, "theme": "warm-paper" }
```

## Behavior

After every journey is walked, the driver lands on THEME and prints the step: author two or
three directions under `design/theme/<k>/` (tokens re-valuing the eleven roles, plus the kit page
sketch will use), check each with `theme compose`, then `theme shortlist --directions a,b,c`.
The printed link is the client's theme page: the two dense screens, once per direction, side by
side; the client presses one. `--mark theme-picked` adopts it and the driver moves to CLIENT.
From here every screen the client opens in the player carries the picked roles. The session's
atlas and review page stay neutral. At the first `/spec:sketch`, `theme state` says `picked`
and the sketch builds on the picked direction's kit page as it does today.

## Acceptance Criteria

- **AC-20260910-04-1**: WHEN `GET /mocks/signin.html?clean&theme=warm-paper` is served with `design/theme/warm-paper/tokens.css` present THE SYSTEM SHALL respond 200 with `href="../theme/warm-paper/tokens.css"` in place of `href="../wire/tokens.css"` and `../wire/wire.css` unchanged; with `?theme=nope` (no such dir) or `?theme=../x` the body SHALL be byte-identical to the un-themed `?clean` body; `?clean&walk&theme=warm-paper&state=error` SHALL carry the swap, the walk script and the state script → `tests/mocks/theme-serve.test.js`
- **AC-20260910-04-2**: WHEN `theme compose --direction ink` runs over a `tokens.css` that omits `--ring` and `--shadow` THE SYSTEM SHALL exit 2 with stderr `design/theme/ink/tokens.css: missing role(s) --ring, --shadow`; with all eleven declared it SHALL exit 0 → `tests/mocks/mocks-driver-theme-2.test.js`
- **AC-20260910-04-3**: WHEN every journey is walked and `marks.themePicked` is unset THE SYSTEM SHALL derive `THEME` (`--state` prints `THEME`) and the bare step SHALL print `theme shortlist`; with `marks.themePicked` set it SHALL derive `CLIENT`; `--reopen theme` SHALL clear `themePicked`, `marks.approved` and `decider`, append a `reopens` row, and derive `THEME` again → `tests/mocks/mocks-driver-theme-2.test.js`
- **AC-20260910-04-4**: WHEN `theme shortlist --directions warm-paper,ink --port <p>` runs against a serving atlas with both directions composing and a seed naming dense screens `session-live` and `roster` THE SYSTEM SHALL write one open `theme-picked` stop with exactly four candidates in the D4 order and paths, print a url matching `^http://localhost:\d+/client/theme\.html#stop-P\d+$`, and exit 0; with one direction it SHALL exit 2 naming `at least 2`; `theme open` SHALL exit 2 naming `theme shortlist` → `tests/mocks/mocks-driver-theme-2.test.js`
- **AC-20260910-04-5**: WHEN `GET /client/theme.html` is served over that open stop THE SYSTEM SHALL render two rows (`session-live`, `roster`) × two columns with frame `src` `/mocks/session-live.html?clean&theme=warm-paper` etc. and one `[data-th="pick"][data-group]` per column; `POST /client/__picks/decide {id, verdict:'pick', pick:'ink', by:'me'}` SHALL answer 200 with `decision.by` `"client"` and `decision.pick` `"ink"`; the same POST against a `journey-approved:onboarding` stop SHALL answer 400; with no stop the page SHALL render no `[data-th="pick"]` → `tests/mocks/theme-serve.test.js`
- **AC-20260910-04-6**: WHEN `--mark theme-picked` runs with the stop decided `ink` THE SYSTEM SHALL copy `design/theme/ink/tokens.css` to `design/tokens.css` byte-for-byte, append a confirmed said-by-user `theme: ink` row whose `rejected` cell is `warm-paper`, set `marks.themePicked` and `theme: "ink"`, consume the stop and derive `CLIENT`; `--direction warm-paper` SHALL exit 2 naming the page pick; `theme adopt` SHALL exit 2 naming `--mark theme-picked` → `tests/mocks/mocks-driver-theme-2.test.js`
- **AC-20260910-04-7**: WHEN `buildWalkPage` runs with `theme: 'ink'` THE SYSTEM SHALL render `data-theme="ink"` on the player root and `walk.browser.js` SHALL set every frame `src` to end in `?clean&walk&theme=ink`; `GET /review/onboarding.html` and `GET /atlas/index.html` SHALL carry no `theme=` → `tests/mocks/theme-serve.test.js`
- **AC-20260910-04-8**: WHEN `design-atlas.js check design/mocks/signin.html` runs with `design/tokens.css` present, the mock `data-status="sketch"` linking `wire/`, and `status.json` carrying `marks.themePicked` THE SYSTEM SHALL print no `⚠️` line for the wire link and exit 0 → `tests/mocks/theme-serve.test.js`
- **AC-20260910-04-11**: WHEN `design-atlas.js check design/mocks/signin.html` runs with `design/tokens.css` present, the mock `data-status="sketch"` linking `wire/`, and no `marks.themePicked` in `status.json` THE SYSTEM SHALL CONTINUE TO print the `⚠️` wire-link warning → `tests/mocks/theme-serve.test.js`
- **AC-20260910-04-9**: WHEN a host is walked, has no `themePicked`, and `design/tokens.css` is byte-equal to `design/theme/legacy/tokens.css` THE SYSTEM SHALL accept `--mark theme-picked --direction legacy` with no stop and set the mark; with a `tokens.css` byte-equal to the wire template it SHALL refuse naming `theme shortlist` → `tests/mocks/mocks-driver-theme-2.test.js`
- **AC-20260910-04-10**: WHEN `spec/doctrine/mocks.md` is read THE SYSTEM SHALL carry `WALK` → `THEME` → `CLIENT` in § Mocks: State Machine's order sentence and the literal `?theme=`; `spec/doctrine/design.md` SHALL not carry `picked on `/spec:sketch`'s first run`; `spec/commands/sketch.md` step 3 SHALL carry `theme shortlist` and neither `theme open` nor `theme adopt` as a live command; `spec/commands/mocks.md` SHALL carry `## Theme (THEME state)` → `tests/consistency/design-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: The rewrite in D1 can reuse `stylesheetTargets`/`linksWireRegister`'s recognition (a `<link rel=stylesheet href>` or `@import` whose path has `wire/` as a segment) with a targeted string replace of the `tokens.css` target — **if false** (an `@import` form the replace cannot reach): D1 serves an additional `<link>` to the direction's tokens after the wire link instead of replacing; the later link wins the cascade.
- A2: The `theme-picked` key's existing atlas home (`stopHome` → `theme` section) is harmless when the stop's page is the client theme page — the atlas still renders the compare table in place — **if false:** `stopHome` maps `theme-picked` to `standalone` when its url is a client page.
- A3: `tests/mocks/mocks-driver-theme.test.js` pins `theme open`/`theme adopt` behavior (661 lines) — every pin whose subject is retired is retagged to the refusal, never deleted silently; the D2 role-count check needs the fixture directions to declare all eleven roles (`writeThemeKit` gains a full `tokens.css`) — **if false** (a pin cannot be retagged without asserting a different subject): record it as a deletion row with the ADR-0013 citation.
- A4: `genesis-driver.js`'s BRIEF step reads `design/tokens.css` only as a path list, not as a precondition (specs/20260907/05 dropped the theme gates) — **if false:** STOP, ask the user.

## Rationale

The pick moves earlier and to the client because JJ ruled it: the client sees a near-production
look from the first screen they walk, and the person who lives with the product's look chooses
it — from a shortlist the user made so taste stays curated. The mechanism is a token-link swap
because ADR-0013 made the register shadcn Neutral on eleven roles: a direction is a value set,
so theming is serving, not redrawing.

The state is called `THEME` and the mark `theme-picked` again, reusing the names specs 20260907/06
and /07 retired, because the ADR narrows those specs explicitly and a second name for the same
concept would outlive its reason. The pins that assert "never THEME" and "theme-picked is unknown"
are the collision this spec owns; they are retagged to the new derivation, never weakened.

`theme open`/`theme adopt` are retired rather than kept beside the new commands so there is one
way to pick. The legacy path (D3/AC-9) exists for the two hosts that already picked at sketch.

Collision closure at lock (literals `theme open`, `theme adopt`, `never THEME`, `theme-picked`):
`tests/mocks/mocks-driver-theme.test.js`, `tests/mocks/mocks-driver-3.test.js` and
`tests/consistency/design-doctrine.test.js` are File Plan rows; `tests/mocks/mocks-driver-look-stops-3.test.js`
names `theme open` only in a comment explaining a stop key (waived — no assertion);
`tests/mocks/mocks-driver-2.test.js`, `mocks-notes.test.js`, `tests/design-atlas.test.js` and
`tests/design-atlas-index.test.js` spell `theme-picked` as a stop key that this spec keeps
(mentions, nothing owed). Every `executes` hit on `design-atlas.js`/`mocks-driver.js` is additive
behind a new query param or state and alters no existing observable; the fixture row covers
the one path (`advanceToApproved`) whose precondition set grows.

Rejected: rendering the theme candidates on the kit page (the client does not read a kit); a
session-side pick with a client "preview" (the client's pick is the point); a THEME state before
WIREFRAMES (nothing to judge on).

## Canonical Delta

`docs/canonical/design.md` § Mocks: the chain is `SEED → SHAPES → KIT → WIREFRAMES → WALK → THEME →
CLIENT → APPROVED`; THEME opens a client pick on `/client/theme.html` over the two dense screens
served with `?theme=<kebab>` (a wire-tokens link swap); `--mark theme-picked` adopts (tokens
copied, ledger row); the player serves every frame themed; the session's pages stay neutral and
`check` no longer warns on wire links once the theme is picked. § Sketch: the theme is already
picked; `theme open`/`theme adopt` are retired in favor of `theme shortlist` + `--mark theme-picked`.
