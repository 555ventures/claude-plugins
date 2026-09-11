---
date: 2026-09-11
status: hardened
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: [specs/20260910/03-client-journey-player.md, specs/20260910/04-theme-before-the-client-walk.md]
depended_on_by: []
brief: n/a
open_markers: 0
spiked: 2026-09-11
---

# The client player speaks English and waits for the server

## Goal

Two defects escaped `specs/20260910/03-client-journey-player.md` (done, review CLEAN, neither
defect among its five killed claims). The client pages declare `<html lang="en">` while rendering
the Japanese string table; and the player never checks whether any of its saves worked — it hides a
guess, drops the open count, clears a typed note and reports nothing on a sign-off, all before the
server has answered. A `no` with an empty reason is refused server-side, but the browser never sees
the refusal, so the count still reaches zero, sign-off unlocks, and `POST /client/__walk/confirm`
validates only the journey name: a journey is recorded client-confirmed with a question still open.

The first defect is fixed by deletion, not by plumbing. The player's own chrome becomes
English-only — the two-language `STRINGS` table and the `lang` role spec 03 D2 introduced are
retired — so the declared language and the rendered language can no longer disagree. The language
of the *mocks* is untouched and stays whatever the client's product is; only the player's own
buttons and labels are in question here.

Done means: no Japanese survives in the player's chrome; every save on the page acts on the
server's answer and says so when it fails; and the server refuses a sign-off while a guess is
unanswered, so the record cannot be wrong even from a stale tab.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/walk-page.js` retires the two-language chrome, superseding spec 03 D2: `STRINGS` loses its `ja` sub-table and becomes a single flat object of the English strings (the former `STRINGS.en`), `stringsFor` is deleted, and the `lang` parameter is removed from `buildClientIndex`, `buildWalkPage` and the module's header contract. `head(title, prefix)` keeps its literal `<html lang="en">`, which is now truthful by construction. `STRINGS` stays exported (AC-20260911-01-1, AC-20260911-01-2) | The declared language and the rendered language cannot disagree when there is only one; deleting the fork is smaller than threading `lang` through a third builder |
| D2 | `design-atlas.js`'s `clientRoute` block drops the `targetsForLang`/`lang` locals and passes no `lang` to either builder. `design/targets.json`'s optional `"lang"` becomes unread — it is not rejected, validated or swept, it simply has no consumer (AC-20260911-01-2) | The field was read nowhere else and declared in no doctrine; removing its one reader retires it without a migration |
| D3 | `buildWalkPage` renders exactly one status slot in the side panel, `<p class="wk-msg" data-wk="msg" role="status" aria-live="polite" data-why="Please say what should be different first." data-failed="That did not save. Please try again." hidden></p>` — empty text at build time, both sentences carried as attributes for `walk.browser.js` to read (AC-20260911-01-3) | One slot, one mechanism; a hidden empty slot keeps the builder byte-deterministic |
| D4 | `lib/walk.browser.js`: `post()` keeps returning the fetch promise and every caller now acts only on the answer. A mark's `no` with an empty `[data-wk="why"]` posts NOTHING and shows `data-why` in the slot. Every other save posts and, on a response with `ok === true`, performs its local effect: a mark hides and decrements `[data-wk="left"]`; the note form clears its textarea; a `to` event appends `from`/`to` to `reachedSoFar` and re-runs the unlock check. On a non-ok response or a rejected fetch the local effect does NOT happen (the mark stays visible, the count is unchanged, the note keeps its text, `reachedSoFar` is untouched so approve stays hidden) and the slot shows `data-failed`. The frame still moves on a `to` message regardless of the save — navigation stays local, as spec 03 D3 locked it (AC-20260911-01-4, AC-20260911-01-5, AC-20260911-01-6, AC-20260911-01-8) | One uniform rule — local state follows the server's answer, never precedes it — is smaller to state, write and test than a per-route exception list |
| D5 | `design-atlas.js`'s `POST /client/__walk/confirm` counts the journey's own open questions before calling `confirmJourney` — a note with `kind === 'question'`, `answer == null` and `scope === 'mock'` whose `screen` is one of the journey's declared labels, the identical rule `buildWalkPage` applies — and on a count above zero answers `409 {error: 'journey "<j>" still has <n> unanswered guess(es) — answer them on /client/walk/<j>.html before confirming'}`, writing nothing. A waived question carries `answer.verdict: 'waived'`, so it is answered and never counts (AC-20260911-01-7, AC-20260911-01-9, AC-20260911-01-10) | `mocks.md` already promises confirmation happens "with every guess answered"; only the browser enforced it, which is what let the escape through |
| D6 | `spec/doctrine/mocks.md` § Mocks: Client Player: the `A client's no promotes` paragraph names the mark's English control instead of `違う`, and the section gains no language claim of any kind (AC-20260911-01-11) | Doctrine binding home for the retirement; the section is the only doctrine that ever named a player control |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D8 | `size-baseline.json` is reconciled by `node scripts/size-ratchet.js --root . --reconcile --cite specs/20260911/01-the-page-waits-for-the-server.md`, which tightens the files this spec shrinks and raises any it grows, in one pass [no-ac: the ratchet's live pin is the oracle] | D1's deletion may pay for D3/D4's additions outright; `--reconcile` measures rather than predicts, and `--cite direct` is refused for runtime code (A1) |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/walk-page.js | MODIFY | scripts | D1 retire the `ja` table, `stringsFor` and the `lang` parameter; D3 the `[data-wk="msg"]` slot |
| spec/scripts/design-atlas.js | MODIFY | scripts | D2 stop reading and passing `lang`; D5 confirm refuses 409 while a guess is unanswered |
| spec/scripts/lib/walk.browser.js | MODIFY | scripts | D4 every save acts on the server's answer; the local empty-reason pre-check |
| spec/doctrine/mocks.md | MODIFY | doctrine | D6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7 bump |
| size-baseline.json | MODIFY | other | D8 reconcile |
| tests/mocks/walk-page.test.js | MODIFY | tests | AC-20260911-01-1, AC-20260911-01-2, AC-20260911-01-3, AC-20260911-01-4, AC-20260911-01-5, AC-20260911-01-6, AC-20260911-01-8, AC-20260911-01-10; also drop the now-unread `lang: 'en'` key from the five existing builder call sites (lines 64, 109, 144, 297, 337) — they pass today and would keep passing, but the key names a retired parameter |
| tests/mocks/client-walk-route.test.js | MODIFY | tests | AC-20260911-01-7, AC-20260911-01-9 |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260911-01-11 |

Orchestrator duty (outside the table): `specs/20260910/05-what-the-journey-does-not-do.md` D5 is
amended at this spec's lock — its new exclusion button loses its Japanese half — so no worker
touches that file. Recorded in Rationale.

## Contracts

```js
// lib/walk-page.js — D1: both builders lose `lang`; STRINGS flattens to one English object
function buildClientIndex({ seed, notes, ledger, walk, prefix })          // was { …, lang }
function buildWalkPage({ seed, journey, notes, ledger, walk, prefix, theme }) // was { …, lang, theme }
module.exports = { buildClientIndex, buildWalkPage, STRINGS }             // STRINGS: flat, English
// `stringsFor` is deleted; every `s.<key>` read becomes `STRINGS.<key>`.
```

```html
<!-- D3: one status slot per player page, in the side panel, hidden and empty at build time -->
<p class="wk-msg" data-wk="msg" role="status" aria-live="polite"
   data-why="Please say what should be different first."
   data-failed="That did not save. Please try again." hidden></p>
```

```
POST /client/__walk/confirm {journey, sentence}
  409 {"error": "journey \"onboarding\" still has 1 unanswered guess(es) — answer them on
       /client/walk/onboarding.html before confirming"}      ← D5, new; nothing written
  400 {"error": …}   empty sentence / unknown journey        ← unchanged
  409 {"error": "…already confirmed"}                        ← unchanged
  200 {reached, misses, confirmedAt, sentence, waived}       ← unchanged
```

## Behavior

The one rule for D4: **local state follows the server's answer, it never precedes it.**

| The client does | Posted | On `ok` | On non-ok or a rejected fetch |
|---|---|---|---|
| presses `no`, reason box empty | nothing | — | slot shows `data-why`; mark stays; count unchanged |
| presses `yes`, or `no` with a reason | `/client/__notes/answer` | mark hides, count drops, confirm re-gated, unlock re-checked | mark stays; count unchanged; slot shows `data-failed` |
| sends a free note | `/client/__notes/add` | textarea clears | textarea keeps its text; slot shows `data-failed` |
| signs off | `/client/__walk/confirm` | nothing on screen changes (the confirmed view is server-rendered on the next load) | slot shows `data-failed` |
| clicks a real control in the mock | `/client/__walk/event` `to` | `from`/`to` enter `reachedSoFar`; unlock re-checked | `reachedSoFar` untouched, so approve stays hidden; slot shows `data-failed` |
| clicks a dead control in the mock | `/client/__walk/event` `miss` | — | slot shows `data-failed` |

The frame moves on a `to` message either way: navigating the prototype is local, and spec 03 D3
locked the rail, back/next and arrow keys as POST-free. What the save gates is the *unlock*, which
`mocks.md` already calls a server record rather than a page state.

D5 is the backstop under all of it. The browser fix alone leaves the sign-off record only as
trustworthy as the page that sent it — a stale tab, a player script that failed to load, or a
hand-made request still records an approval over an open question, and nothing reports it.

**What stays Japanese.** The mocks themselves, and everything the client writes: confirmation
sentences, note text, answer reasons, ledger claims. Five test fixtures carry Japanese content for
exactly this reason (`tests/mocks/walk-page.test.js`, `client-walk-route.test.js`,
`mocks-walk.test.js`, `mocks-driver-client-3.test.js`, `tests/render/render-compare.test.js`) and
none of them is touched by D1 — a test asserting that a Japanese sentence round-trips through
`walk.json` is asserting content, not chrome. Only the player's own buttons and labels retire.

## Acceptance Criteria

- **AC-20260911-01-1**: WHEN `lib/walk-page.js` is loaded THE SYSTEM SHALL export a `STRINGS`
  object with no `ja` key and no `en` key, holding the English strings at its top level
  (`STRINGS.confirm` → `'Confirm this journey'`), and SHALL export no `stringsFor` →
  `AC-20260911-01-1` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-2**: WHEN either client page is built for a project whose
  `design/targets.json` declares `"lang": "ja"` THE SYSTEM SHALL emit HTML containing no character
  in the ranges `぀-ヿ` or `一-龯`, and SHALL open `<html lang="en">` →
  `AC-20260911-01-2` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-3**: WHEN `buildWalkPage` renders a journey THE SYSTEM SHALL emit exactly one
  `[data-wk="msg"]` element, `hidden`, with empty text content and both `data-why` and
  `data-failed` non-empty → `AC-20260911-01-3` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-4**: WHEN the client presses a mark's `no` control while that mark's
  `[data-wk="why"]` holds only whitespace THE SYSTEM SHALL issue no request at all, leave the mark
  visible, leave `[data-wk="left"]`'s `data-count` unchanged, leave `[data-wk="confirm"]`
  `disabled`, and set `[data-wk="msg"]`'s text to its own `data-why` value with `hidden` removed →
  `AC-20260911-01-4` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-5**: WHEN a mark's answer request resolves with `ok: false` (or its fetch
  rejects) THE SYSTEM SHALL leave the mark visible, leave `[data-wk="left"]`'s `data-count`
  unchanged (`data-count="2"` → `data-count="2"`), leave `[data-wk="confirm"]` `disabled`, and set
  `[data-wk="msg"]`'s text to its own `data-failed` value → `AC-20260911-01-5` in
  `tests/mocks/walk-page.test.js`
- **AC-20260911-01-6**: WHEN the free-note request, the confirm request or a walk-event request
  resolves with `ok: false` THE SYSTEM SHALL set `[data-wk="msg"]`'s text to its own `data-failed`
  value, SHALL leave the note textarea's text in place, and SHALL — for a failed `to` event — leave
  `[data-wk="approve"]` hidden even when that message named the journey's last label →
  `AC-20260911-01-6` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-7**: WHEN `POST /client/__walk/confirm` names a declared journey carrying at
  least one unanswered `question` note scoped to one of its declared screen labels THE SYSTEM SHALL
  answer `409` with an error naming the journey and the count (one open question on `onboarding` →
  `journey "onboarding" still has 1 unanswered guess(es) — answer them on
  /client/walk/onboarding.html before confirming`) and SHALL leave `design/mocks/walk.json`
  unwritten → `AC-20260911-01-7` in `tests/mocks/client-walk-route.test.js`
- **AC-20260911-01-8**: WHEN a mark's answer request resolves with `ok: true` THE SYSTEM SHALL
  CONTINUE TO hide that mark, SHALL CONTINUE TO decrement `[data-wk="left"]`'s `data-count`, and
  SHALL CONTINUE TO remove `disabled` from `[data-wk="confirm"]` once the count reaches zero →
  `AC-20260911-01-8` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-9**: WHEN `POST /client/__walk/confirm` names a declared journey with no
  unanswered question on its screens THE SYSTEM SHALL CONTINUE TO answer `400` on an empty
  sentence, SHALL CONTINUE TO answer `200` recording `confirmedAt` and the sentence verbatim on a
  real one — including a Japanese sentence, which is client content and unaffected by D1 — and
  SHALL CONTINUE TO answer `409` on an already-confirmed journey → `AC-20260911-01-9` in
  `tests/mocks/client-walk-route.test.js`
- **AC-20260911-01-10**: WHEN a `question` note carries `answer.verdict: "waived"` THE SYSTEM SHALL
  CONTINUE TO exclude it from the open count `buildClientIndex` and `buildWalkPage` render →
  `AC-20260911-01-10` in `tests/mocks/walk-page.test.js`
- **AC-20260911-01-11**: WHEN `spec/doctrine/mocks.md` § Mocks: Client Player is read THE SYSTEM
  SHALL contain no character in the ranges `぀-ヿ` or `一-龯` →
  `AC-20260911-01-11` in `tests/consistency/design-doctrine.test.js`

## Assumptions (escalation triggers)

- A1: the size ratchet refuses to fund runtime growth without a spec cite. **Executed 2026-09-11**:
  `node scripts/size-ratchet.js --root . --raise spec/scripts/lib/walk-page.js --to 12500 --cite
  direct` → exit 2, `--cite direct is accepted on --reconcile only`; and with one comment line
  appended to `walk-page.js`, `node scripts/size-ratchet.js --root . --reconcile --cite direct` →
  exit 2, `--cite direct admits growth only in shell gates (*.sh) and tests/ —
  spec/scripts/lib/walk-page.js is neither`. Both runs wrote nothing; the appended line was
  reverted and the baseline restored. — **if false:** D8 drops to `--reconcile --cite direct`;
  nothing else changes.
- A2: D1's deletion is larger than D3/D4's additions, so `walk-page.js` ends BELOW its 12132-byte
  ceiling and `--reconcile` tightens it rather than raising it. The `ja` sub-table alone is 21
  lines. **Not executed** — this is a prediction, not an inventory, and `walk.browser.js` (10413,
  at ceiling) still grows on its own. — **if false:** D8's single `--reconcile` covers both
  directions in one pass and needs no amendment; this assumption changes no Decision, only the
  expectation of which way the numbers move.
- A3: the only test that drives `POST /client/__walk/confirm` is
  `tests/mocks/client-walk-route.test.js` (five hits, one test), whose setup is
  `advanceToSeedDone` — which writes no `design/mocks/notes.json` at all, so the journey carries
  zero questions and D5's new refusal leaves its existing `200` assertion green. The other two
  `confirmJourney` callers in `tests/` (`mocks-driver-fixtures.js:491`, `mocks-walk.test.js`) call
  the pure lib, which D5 does not touch. **Executed 2026-09-11**: `grep -rn "__walk/confirm"
  tests/` and `grep -rn "confirmJourney" tests/`. — **if false:** the stale fixture answers or
  waives its question in the same batch; never weaken the refusal, never relax the assertion.
- A4: no test asserts any Japanese chrome string, so D1 reddens nothing by removal. Every Japanese
  literal under `tests/` is client CONTENT — a confirmation sentence, a claim, a note — in five
  files, none of which reads `STRINGS` or passes `lang`. **Executed 2026-09-11**: `grep -rc
  '[ぁ-んァ-ヶ一-龠]' spec/ tests/ scripts/` → 9 files; each inspected, and the only chrome hits
  are `spec/scripts/lib/walk-page.js` (21, the table itself) and `spec/doctrine/mocks.md:308` (the
  `違う` control name), both planned. `spec/commands/design.md:159` is a story-export example and
  `spec/.claude-plugin/plugin.json:4` is changelog prose, neither a player control. — **if false:**
  the asserting test is retagged to this spec's AC and updated in place, never weakened.
- A5: `tests/mocks/walk-page.test.js`'s existing `vm` sandbox already stubs `fetch` as
  `Promise.resolve({ ok: true, json: … })` and already drains microtasks between actions
  (`await Promise.resolve(); await Promise.resolve()`), so a stub returning `{ ok: false }` per
  route is enough to test every non-ok path with no new harness. — **if false:** add a file-local
  async runner in the same batch, as `tests/helpers.js`'s `runNode` gotcha prescribes; the subject
  stays the real script with real argv.
- A6: `specs/20260910/04-theme-before-the-client-walk.md` is **already `implementing`** in
  `.claude/worktrees/spec-04-theme-before-the-client-walk` (dirty tree, tests in flight) and carries
  MODIFY rows for `walk-page.js`, `walk.browser.js` and `size-baseline.json`; it is therefore a
  `depends_on` of this spec for ordering, not for feature content — nothing here consumes anything
  it adds, and 04 carries no Japanese of its own (A4's sweep). **Executed 2026-09-11**: `git
  worktree list`, the worktree's `status: implementing` stamp, `git status --porcelain`. — **if
  false**, i.e. 04 merges back before this builds: drop it from `depends_on` and build against the
  merged `main`; if it lands *mid*-build, correct `diff_base` to 04's review-close commit and record
  the departure, per the repo's own `diff_base` gotcha. Never build this spec concurrently with 04's
  worktree — a concurrent baseline write from either side invalidates the other's.
- A7: `spec/scripts/lib/review-page.js` also hardcodes `lang="en"`, correctly and permanently: that
  builder takes no `lang` and renders no Japanese. It stays out of the File Plan. **Executed
  2026-09-11**: `collision-closure.js --spec … --root . --literal 'lang="en"'` → literals leg names
  `review-page.js` and `walk-page.js` in the live tree (the three `.claude/worktrees/spec-04-…` hits
  are 04's checkout of the same two files plus spec 03's prose, not separate surfaces);
  `walk-page.js` is planned, `review-page.js` is this recorded waive. The paths leg's `executes`
  hits on `design-atlas.js` (`retired-flags`, `design-atlas-serve-port`, `design-atlas`,
  `design-shell`, `helpers`, `chrome-harness`, `client-route`, `walk-mode`) were adjudicated by A3's
  grep: none drives `POST /client/__walk/confirm`, so D5's refusal changes no behavior any of them
  observes. `likely`/`mentions` hits owe nothing (specs/20260814/05-collision-closure.md D6/D12).
- A8: D1 removes two public symbols (`stringsFor`, and the `lang` key on both builders' input
  objects), and the literals leg sweeps what a spec INHERITS rather than what it RETIRES, so both
  were grepped by hand per the plugin gotcha on that gap. **Executed 2026-09-11**: `grep -rn
  "stringsFor\|STRINGS\|lang:" tests/` → `stringsFor` and `STRINGS` appear in no test at all; `lang:`
  appears five times, all `lang: 'en'` arguments in `tests/mocks/walk-page.test.js` (64, 109, 144,
  297, 337), which is already a File Plan row and carries the cleanup in its Summary. Those five
  would pass either way — an unread key is inert — so none of them is a red risk; they are retired
  for accuracy, not for green. — **if false:** the missed caller is fixed in the same batch.

## Rationale

These two defects are escapes, not deferred findings: spec 03 closed `done` on a CLEAN review with
zero survivors, zero waived and zero soft, and neither defect appears among that review's five
killed claims. Two `/spec:escape` rows against `rv_6724926fb6bd` are owed independently of this
spec and are queued.

**Why a spec at all.** Core § Incident Policy and § Pipeline Entry both point at a direct fix — no
delegation, no durability, fix plus a behavioral test in one session. Two things override that.
The size ratchet: all three runtime files sit at byte-exact ceilings and D15 admits the `direct`
cite only for shell gates and tests, so runtime growth needs a spec path as its cite (A1 executed
both refusals). And D1 retires a locked Decision of a `done` spec and edits doctrine, which is
durability by definition. The alternative to the cite — golfing the files to self-fund the growth —
was rejected: queue item q147 records that editing under byte pressure in this repo has already
deleted a live line and reddened 16 tests once.

**Why deletion rather than plumbing.** The first defect looks like a missing parameter: thread
`lang` into the shared head builder and the pages tell the truth. The user's ruling is that the
player's own chrome is English for every client, so the fork has no reason to exist — and with one
language the declared and rendered language cannot disagree at all. This supersedes spec 03 D2
("JJ's clients read Japanese; the plugin is not Japan-only"), which is recorded here because a cold
reader will otherwise restore the table as a regression. The mock's language and the player
chrome's language were conflated by that decision and are now separated: the mocks are whatever the
client's product is — English, Japanese, Chinese, mixed — and the player's frame around them is
English. That separation is why A4's sweep keeps every Japanese test fixture: they are content.

**The other two scope calls were the user's.** The fix covers every save on the page rather than
only the guess answers (same class, same files, ceilings paid once instead of twice); and the
server gets the backstop (D5), because the sign-off record is the human approval gate and the
browser was its only guard. An earlier draft of D3 proposed the refusal copy as a two-language
`STRINGS` entry; it was argued twice from consistency and overruled twice, and D1 has since made
the point moot.

**Amended at this lock, outside the File Plan.**
`specs/20260910/05-what-the-journey-does-not-do.md` D5 (`hardened`, unstarted) specified its new
exclusion button as a Japanese/English pair; its Japanese half is struck at this lock so the
sibling cannot reintroduce the fork D1 retires. `specs/20260910/04-theme-before-the-client-walk.md`
needs no amendment — it carries no Japanese and passes no `lang`.

**Fragile during execution.** `walk.browser.js` is written against a `vm` shim with a deliberately
narrow DOM surface (no `innerHTML` on anything untrusted, no `getBoundingClientRect`). Setting the
slot's text uses `textContent` and `hidden`, both already in the shim's vocabulary — reach for
nothing else. And `answer()` becoming promise-driven must not become `async`/`await`: the file is a
browser script held to the same ES5-ish register as its siblings; chain `.then()`.

## Canonical Delta

`docs/canonical/design.md`, the **Client player (specs/20260910/03)** paragraph. Replace the
sentence "Approve unlocks only once the server's own record shows the journey's last screen
reached, stays disabled while any guess is open, and records one typed sentence." with:

> Approve unlocks only once the server's own record shows the journey's last screen reached, stays
> disabled while any guess is open, and records one typed sentence. Both halves are enforced twice:
> the page never advances its own state ahead of a save — a mark hides, the open count drops, a
> note clears and a reached label counts only on a response the server actually returned, and any
> refusal or network failure leaves the page as it was and says so in `[data-wk="msg"]` — and
> `POST /client/__walk/confirm` independently refuses with `409` while any question anchored to the
> journey's screens is unanswered, so a stale tab or a player script that failed to load cannot
> record an approval over an open question.

Append to the same paragraph: "The player's own chrome is English for every client; the mocks
inside the frame stay in whatever language the client's product is written in, and everything the
client types — sentences, notes, reasons — is stored and re-rendered verbatim."

§ Mocks: Client Player's promise that a journey is confirmed "once the client reaches the last
label with every guess answered and writes one sentence" was already correct — only the code
disagreed, and D5 makes the server enforce the sentence already written.
