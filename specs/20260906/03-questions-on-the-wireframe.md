---
date: 2026-09-06
status: hardened
tier: standard
area: design-mocks
design: false
breaking: false
depends_on: [specs/20260906/02-mocks-ends-at-wireframes.md]
depended_on_by: [specs/20260906/04-journey-review-page.md, specs/20260906/06-sketch-high-fidelity-and-critique.md]
brief: 22a
open_markers: 0
spiked: 2026-09-06
---

# Questions on the wireframe: the session's assumptions pinned to the screen, answered inline, gating approval; free-form messages with a reason; catch provenance derived

## Goal

Every inferred or invented product assumption the session writes while drawing a journey is pinned as a **question** on the screen it belongs to. The served page shows it as "I assumed … I rejected …" with Yes / No, it's… / Later; an answer writes the ledger row's status and resolves the note, and `journey-approved` refuses while a question on the journey is unanswered. The client (or JJ) sends free-form messages at two scopes with a reason (missing screen, wrong direction, wrong words, other); each blocks approval until the session addresses it. Catch provenance (question · note · unlinked) is derived from the notes store and printed by `ledger counts`. One store for status (the ledger), one store for placement (notes.json), no new ledger column.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `lib/mocks-notes.js`: a note record gains optional `kind: "note" \| "question"` (absent = `note`), optional `reason` ∈ `missing-screen \| wrong-direction \| wrong-words \| other` (notes only), and for questions `ledgerId` (`^[A-Z]+\d+[a-z]?$`) and `answer: null \| {verdict: "yes" \| "no", text, by, at}`; `validateNotes` refuses a question without `ledgerId`, a `reason` on a question, an unknown `reason`, an `answer.verdict` outside the pair, and a `no` answer with empty `text`; `addNote` accepts `kind`/`ledgerId`/`reason`; new `answerQuestion(notes, id, {verdict, text, by}) → {notes, note}` sets `answer` and `status: "resolved"`; `resolveNote` on a question throws `question <id> is answered, never resolved` (AC-20260906-03-1) | The record already anchors to screen + state; a question is a note whose text is a ledger claim and whose resolution is an answer. Rejected: a new ledger column — the parser matches the header cell for cell (executed spike, brief 22a). |
| D2 | `mocks-driver.js ledger add … --screen <label> [--state <s>]` appends the assumption row as today and, in the same invocation, adds a question note (`scope: "mock"`, `screen`, `state` or `null`, `kind: "question"`, `ledgerId: <id>`, `text: <claim>`, `by: "session"`); it refuses (exit 2) `--screen` on a `kind: process` row (`a process row is never a question for the user`), on a `said-by-user`/`ratified-doc` tag (`nothing to ask — the user already said it`), and on a label that is not a declared journey screen (`unknown screen "<label>"`); new verb `ledger ask --id <rowId> --screen <label> [--state <s>]` pins an existing open `inferred`/`invented` product row with the same checks and refuses a row already pinned (`<id> is already a question on <screen>`) (AC-20260906-03-2) | The session names the screen when it writes the doubt — that is the moment it knows where the doubt lives; the driver, not the session, decides what is askable. |
| D3 | `design-atlas.js` serve: `GET /__notes/list` returns every note as stored and, for `kind: "question"`, joins `claim`, `rejected`, `tag`, `status` from the ledger row read from `design/mocks/ledger.md` on each request (a question whose row is missing carries `ledgerMissing: true`); new `POST /__notes/answer` body `{id, verdict, text?, by}` → validates (`no` requires non-empty `text`), rewrites `design/mocks/ledger.md` via `setStatus(id, "confirmed <today>")` for `yes` or `setStatus(id, "overridden <today>")` for `no`, then `answerQuestion` and writes `notes.json`; 200 with the note; 404 unknown id; 409 already answered; 400 malformed or not a question; `POST /__notes/resolve` on a question → 400 `answer it (/__notes/answer)`; `POST /__notes/add` accepts `reason` (validated) and rejects any body carrying `kind` or `ledgerId` with 400 (`questions are session-authored`); the ledger write happens before the notes write so a crash between the two leaves an answered row with an open note (re-answer is idempotent on the row) (AC-20260906-03-3, AC-20260906-03-4) | The page is the only place a human answers; the ledger stays the truth for status; the order of the two writes makes the failure mode a harmless re-ask, never a resolved note over an open row. |
| D4 | The gate is the existing one: `requireNotesResolved` (called by `journey-approved`, `approved`, and specs/20260905/03's `variant-picked`) refuses on an open question exactly as on an open note, but names them in their own line first: `unanswered question(s) on <j>: W7 (signin), W9 (invite) — answer them on the page`; `gateVerdict` is unchanged (an answered `no` makes the row `overridden`, which it accepts; an answered `yes` makes it `confirmed`) (AC-20260906-03-5) | JJ's rule: journey-approved gates on every assumption answered — the mechanism already exists; the wording is what tells the session what to do. |
| D5 | `lib/notes-layer.browser.js` renders a question row distinctly on the mock page's strip panel and in the project panel's journey groups: id badge, `I assumed`, the claim, `I rejected: <rejected>` when present, and three controls — `Yes, that's right` (POST answer yes), `No, it's…` (reveals a one-line textarea, then POST answer no with the text), `Later` (closes) — an answered question shows `You confirmed` or `You corrected: <text>` and no controls; the composer on both scopes gains a reason chip row (`Missing screen`, `Wrong direction`, `Wrong words`, `Other`; default `Other`) and the mock-page composer gains a scope toggle `This screen \| Whole project` so a project note can be sent from a screen; all chrome stays inside the existing shadow roots on `viewer.css`'s register (AC-20260906-03-6) | The minimal honest surface for the answer flow; specs/20260906/04 replaces the whole page but reuses these endpoints unchanged. |
| D6 | `mocks-driver.js notes open` prints questions in their own block before the notes: `❓ questions: N open` then per journey → screen → `<id> [<ledgerId>] <claim>` (answered questions print under `answered:` with `yes` or `no → "<text>"`); `notes address --id <noteId> --change <text> [--ledger <rowId>]` is unchanged and also accepts a question id (the session's follow-up after a `no`); `ledger counts` gains one line `📎 catches: <n> — question <q> · note <m> · unlinked <u>` where a catch row `M<k>` counts as `question` when some note with `kind: "question"` has `addressed.ledgerRow === "M<k>"`, `note` when a non-question note does, `unlinked` otherwise (AC-20260906-03-7) | Catch provenance is derived, never attested: the only way the next dry run can say whether questions catch anything. |
| D7 | The WIREFRAMES step block's per-journey progress line gains `· questions: <open>/<total>` for that journey; the "draw journey <j>" step's `Then:` gains one line: `pin every inferred/invented product assumption you write while drawing: ledger add … --screen <label>` (AC-20260906-03-8) | The checkpoint contract: the driver prints the next action; the session never discovers pinning from memory. |
| D8 | Doctrine: `spec/doctrine/mocks.md` § Mocks: Page Notes gains the paragraph **Questions** (what a question is, who authors it, how it is answered, that it gates like a note, that provenance is derived) and § Provenance Ledger gains one sentence ("a row pinned as a question is answered on the page; the answer writes the row's status"); `spec/commands/mocks.md` § The driver loop gains one sentence pointing at it; `docs/canonical/design.md` via Canonical Delta `[no-ac: review's citations-check and doctrine legs are the oracle; the driver lines are pinned by AC-20260906-03-7 and AC-20260906-03-8]` | One binding home (core § Doctrine Authoring). |
| D9 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.94.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D1: `kind`, `reason`, `ledgerId`, `answer`; `answerQuestion`; validation; `resolveNote` refusal on questions; header comment |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D2 `ledger add --screen/--state`, `ledger ask`; D4 gate wording; D6 `notes open` questions block, `ledger counts` provenance line; D7 step lines; header updated |
| spec/scripts/design-atlas.js | MODIFY | scripts | D3: `/__notes/list` join, `/__notes/answer`, `resolve` refusal, `add` reason + kind rejection; usage header routes |
| spec/scripts/lib/notes-layer.browser.js | MODIFY | scripts | D5: question rows + answer controls, reason chips, scope toggle |
| spec/templates/mocks/viewer.css | MODIFY | doctrine | D5: `.nl-q*` question row and chip styles on the existing register (no new token) |
| spec/doctrine/mocks.md | MODIFY | doctrine | D8: § Mocks: Page Notes **Questions** paragraph; § Provenance Ledger sentence |
| spec/commands/mocks.md | MODIFY | doctrine | D8: one pointer sentence in § The driver loop |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | AC-20260906-03-1, AC-20260906-03-5, AC-20260906-03-7 |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260906-03-2, AC-20260906-03-8 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260906-03-3, AC-20260906-03-4, AC-20260906-03-6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9 version bump + changelog entry |

## Contracts

```
notes.json record (additions in bold; every existing field unchanged):
  { id, scope, screen, state, text, by, at, status, addressed, reply, resolvedBy, resolvedAt,
    **kind**: "note" | "question"            # absent = "note"
    **reason**: "missing-screen" | "wrong-direction" | "wrong-words" | "other"   # notes only, optional
    **ledgerId**: "W7"                       # questions only, required
    **answer**: null | { verdict: "yes" | "no", text: string, by: string, at: ISO } }

mocks-driver.js --root <dir> ledger add --id W7 --step WIREFRAMES --kind product --claim "…" --tag inferred --status open [--rejected "…"] [--note "…"] --screen signin [--state default]
mocks-driver.js --root <dir> ledger ask --id W7 --screen signin [--state <s>]
mocks-driver.js --root <dir> ledger counts        # + "📎 catches: 13 — question 4 · note 6 · unlinked 3"
mocks-driver.js --root <dir> notes open            # "❓ questions: 2 open" block first

GET  /__notes/list?screen=<label>|*   → [ …notes, question rows carry claim, rejected, tag, status (ledgerMissing: true when the row is gone) ]
POST /__notes/answer  {id:"N012", verdict:"no", text:"Owner sets modality", by:"Ren"}  → 200 note | 400 | 404 | 409
POST /__notes/add     {scope, screen, state, text, by, reason?}                          → 201 | 400 (kind/ledgerId in body → 400)
POST /__notes/resolve {id, by}                                                           → 400 on a question
Exit codes (driver): unchanged. HTTP: as listed.
```

Ledger write on answer: `yes` → `setStatus(id, 'confirmed <YYYY-MM-DD>')`; `no` → `setStatus(id, 'overridden <YYYY-MM-DD>')`. The correction text lives on the note's `answer.text`; the session folds it into the row's `note`/`rejected` cells (or a catch row) when it addresses the question — never the server.

## Behavior

**Drawing a journey.** The session draws `signin.html`, realises it assumed the invite link is single-use, and writes `ledger add --id W7 … --tag inferred --status open --screen signin`. The row lands in the ledger; a question note lands on `signin`. The step block now reads `journeys: 1/5 drawn · 0/5 approved · questions: 1/1 open on onboarding`.

**Answering.** JJ opens `signin.html` on the served page: the strip panel shows W7 as a question with three controls. `Yes` → ledger row `confirmed 2026-09-06`, note resolved, controls gone. `No, it's…` + text → row `overridden 2026-09-06`, `answer.text` kept; `notes open` shows it under `answered:` so the session records the catch (`ledger catch --id M15 …`, then `notes address --id N012 --change … --ledger M15`) and redraws. `Later` → nothing written.

**Free-form.** From the mock page JJ toggles `Whole project`, picks `Missing screen`, writes "there is no screen for cancelling a session" → a project note with `reason: missing-screen`; every advancing mark refuses until the session addresses it, as today.

**Gate.** `journey-approved --journey onboarding` with W7 unanswered → exit 2, first stderr line `unanswered question(s) on onboarding: W7 (signin) — answer them on the page`.

## Acceptance Criteria

- **AC-20260906-03-1**: WHEN `validateNotes` reads a question note `{kind:"question", ledgerId:"W7", scope:"mock", screen:"signin", …}` THE SYSTEM SHALL return no errors; WHEN it reads a question without `ledgerId`, a question carrying `reason`, a note with `reason:"typo"`, or an answer `{verdict:"no", text:""}` it SHALL return one error each naming the field; WHEN `answerQuestion(notes, "N012", {verdict:"no", text:"Owner sets modality", by:"Ren"})` runs it SHALL set `answer` and `status:"resolved"`; WHEN `resolveNote` runs on a question it SHALL throw a message containing `answered, never resolved` → `tests/mocks/mocks-notes.test.js`
- **AC-20260906-03-2**: WHEN `ledger add --id W7 --step WIREFRAMES --kind product --claim "single-use link" --tag inferred --status open --screen signin` runs on a root whose seed declares `signin` THE SYSTEM SHALL exit 0, append the ledger row, and append a `notes.json` record `{kind:"question", ledgerId:"W7", scope:"mock", screen:"signin", state:null, text:"single-use link", by:"session", status:"open"}`; WHEN the same runs with `--kind process` it SHALL exit 2 containing `never a question`; with `--tag said-by-user` exit 2 containing `nothing to ask`; with `--screen nowhere` exit 2 containing `unknown screen "nowhere"`; WHEN `ledger ask --id W7 --screen signin` runs a second time it SHALL exit 2 containing `already a question on signin` → `tests/mocks/mocks-driver.test.js`
- **AC-20260906-03-3**: WHEN `GET /__notes/list?screen=signin` runs against a root whose ledger holds `W7` (`claim` "single-use link", `rejected` "durable link", `tag` inferred, `status` open) and whose notes hold the question THE SYSTEM SHALL return that record with `claim:"single-use link"`, `rejected:"durable link"`, `tag:"inferred"`, `status:"open"`; WHEN the row is absent it SHALL return the record with `ledgerMissing:true`; WHEN `POST /__notes/add` carries `{…, reason:"missing-screen"}` it SHALL store `reason`; with `reason:"typo"` → 400; with `kind:"question"` in the body → 400 containing `session-authored` → `tests/design-atlas.test.js`
- **AC-20260906-03-4**: WHEN `POST /__notes/answer {id:"N012", verdict:"yes", by:"Ren"}` runs THE SYSTEM SHALL respond 200, rewrite exactly the `W7` line of `design/mocks/ledger.md` to status `confirmed <today>` (every other byte unchanged), and set the note `answer.verdict:"yes"`, `status:"resolved"`; WHEN `{verdict:"no", text:"Owner sets modality", by:"Ren"}` runs on another question it SHALL set the row `overridden <today>` and `answer.text`; WHEN `{verdict:"no", by:"Ren"}` (no text) → 400; unknown id → 404; a second answer → 409; `POST /__notes/resolve {id:"N012"}` → 400 containing `answer it` → `tests/design-atlas.test.js`
- **AC-20260906-03-5**: WHEN `--mark journey-approved --journey onboarding` runs with a decided stop and an unanswered question on `signin` THE SYSTEM SHALL exit 2 with the first stderr line `unanswered question(s) on onboarding: W7 (signin) — answer them on the page`; WHEN the question is answered `yes` through `answerQuestion` and the ledger row set `confirmed` THE SYSTEM SHALL CONTINUE TO accept the mark; WHEN a project note with `reason:"missing-screen"` is open THE SYSTEM SHALL CONTINUE TO refuse every advancing mark naming that note first → `tests/mocks/mocks-notes.test.js`
- **AC-20260906-03-6**: WHEN the notes layer runs under `vm` against a served mock page whose `/__notes/list` returns one question and one note THE SYSTEM SHALL render inside the strip panel's shadow root a question row containing `I assumed`, the claim, `I rejected:`, and three buttons whose labels are `Yes, that's right`, `No, it's…`, `Later`; clicking `Yes, that's right` SHALL issue `POST /__notes/answer` with `{id, verdict:"yes", by}`; the composer SHALL render four reason chips and a scope toggle whose `Whole project` state posts `scope:"project"`; an answered question SHALL render `You confirmed` and no buttons; the document-level style SHALL CONTINUE TO be the single `body.lb-open .nl-host{display:none}` rule → `tests/design-atlas.test.js`
- **AC-20260906-03-7**: WHEN `notes open` runs with one open question on `signin` and one answered `no` THE SYSTEM SHALL print `❓ questions: 1 open` first, then `W7` with its claim under the journey → screen, then `answered:` with `no → "Owner sets modality"`; WHEN `ledger counts` runs with catches `M1..M3` where a question note is addressed → `M1` and a plain note → `M2` THE SYSTEM SHALL print `📎 catches: 3 — question 1 · note 1 · unlinked 1` after the existing `📒 ledger:` line → `tests/mocks/mocks-notes.test.js`
- **AC-20260906-03-8**: WHEN the bare driver prints the WIREFRAMES step for a journey with two questions, one answered THE SYSTEM SHALL print a progress line containing `questions: 1/2 open on onboarding` and the draw step's `Then:` SHALL contain `ledger add` and `--screen` → `tests/mocks/mocks-driver.test.js`

## Assumptions (escalation triggers)

- A1: Adding a ledger column breaks parsing — **executed 2026-09-06**: `parseLedger` over a table with an extra trailing `screen` column → `errors: [no Assumptions table header found]`; over the unchanged header → 0 errors. Hence placement lives in notes.json. **if false:** irrelevant — the notes store is the better home anyway.
- A2: `setStatus(text, id, status)` accepts `confirmed 2026-09-06` (status word + date) and rewrites one line — **executed 2026-09-06**: `setStatus(t,"W1","overridden")` returned the row with only the status cell changed; `STATUS_RE` accepts an optional trailing ISO date (lib/mocks-ledger.js :33). **if false:** write the date into the note only.
- A3: `unresolvedFor(notes, labels)` filters `scope:"mock"` + `status !== "resolved"` and does not inspect `kind` — **verified by reading** (lib/mocks-notes.js :178-181), so questions block without a code change and D4 only adds the wording. **if false:** extend the filter, same AC.
- A4: The notes layer is exercised under `vm` today (AC-20260905-01-10) with a fake `fetch` — **verified by reading** tests/design-atlas.test.js. **if false:** AC-6 runs the layer in headless Chrome under `[env: CHROME_BIN]` like notes-layer-isolation.test.js.
- A5: specs/20260905/03 `variant-picked` calls `requireNotesResolved` (its D3 says so) — so questions gate that path too with no extra row. **if false:** one line in that mark, folded into this spec's driver row.

## Rationale

**Why the answer writes the ledger from the server.** The alternative — the page marks the note resolved and the session later copies the verdict into the ledger — leaves a window where the gate (which reads the ledger) says "confirmed" only after a session step. With the server writing `setStatus` first, the ledger is true the moment the human clicks; the notes write second is the placement catching up. A crash between them re-asks a question whose row is already answered, and the second answer is idempotent on the row (409 on the note, the row is already right).

**Why questions are session-authored only.** A client typing a "question" would be a free-form note with a different label; the distinction that matters is "this text is a ledger claim with a row behind it". Only the driver can guarantee that.

**Why provenance is derived from `addressed.ledgerRow`.** The session already links a note to the row it produced when it addresses it. Counting over that link costs nothing and never asks anyone to attest a source. The three buckets are all the next dry run needs: did the catch come from a pinned doubt, from the user's free-form look, or from neither.

**Fragile spots for build.** `viewer.css` is byte-linked to `wire-tokens.css` per role (viewer-tokens.test.js) — add classes, never values. The `vm` harness for the layer stubs `fetch`; the answer POST must go through the same stub. The `notes open` block ordering (questions first) is asserted verbatim.

## Canonical Delta

`docs/canonical/design.md` § Page notes: append "Questions (specs/20260906/03): a note with `kind: "question"` is a ledger assumption row pinned to a screen by the session (`ledger add … --screen`, `ledger ask`); the page answers it (`/__notes/answer` yes/no + text), the answer writes the row's status (`confirmed`/`overridden` + date) before resolving the note; `journey-approved` (and `variant-picked`, `approved`) refuse while a question on the journey is unanswered, naming the ledger ids. Free-form notes carry an optional `reason` (missing-screen · wrong-direction · wrong-words · other). Catch provenance is derived from `addressed.ledgerRow` and printed by `ledger counts` as question · note · unlinked — never a ledger column."
