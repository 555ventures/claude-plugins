---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: mocks-driver
design: false
breaking: false
depends_on: [specs/20260907/08-walk-critic.md]
depended_on_by: [specs/20260907/11-client-view.md]
brief: 22a
spiked: 2026-09-09
open_markers: 0
diff_base: 0bdf532e547c4a1a67f1001c634aae7248fde9ab
---

# CLIENT replaces SIGNOFF: a client note captures its screen when raised, closes only on a re-capture that differs, and a silent client is released by a dated waiver

## Goal

`/spec:mocks`'s last human gate becomes the **CLIENT** state (ADR-0012): the served journey
pages, exposed by the user, where a client answers product questions and leaves notes. A note's
origin (`walk | client | session`) is decided by the route it arrived on, never by the typed
name; a client's mock-scope note captures its screen at raise, a fix is recorded only when the
re-captured screen differs, the session can never resolve a client note, and a client who goes
silent for seven days is released only by a dated waiver that prints at approval. Done means
the driver derives `CLIENT` where it derived `SIGNOFF`, the client route exists and enforces
every rule above on the notes file, and `--mark approved` prints the waived count and reasons.
The served client *view* (whole-project entry, product-only filtering) is
specs/20260907/11-client-view.md — the second half of the same brief, not deferrable, locked
after one real client is observed on the existing review page.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `deriveState()`'s last non-terminal step becomes `if (!status.marks.approved) return 'CLIENT'`; the `SIGNOFF` literal leaves `mocks-driver.js` entirely (doBareStep's look-probe disjunct reads `state === 'CLIENT'`, `printClientStep()` replaces `printSignoffStep()`); `AUTHORING_STATES`, every `--reopen` target and what each clears are byte-identical (AC-20260907-10-1, AC-20260907-10-13) | One state renamed in place, same mark-derived condition — no host mid-SIGNOFF loses a mark; `status.json`'s stamped `state` is re-derived on the next run |
| D2 | New subcommand `client open --address <url>`: refused (exit 2) unless the derived state is `CLIENT` (naming the current state), unless `--address` is given, or unless `GET <url without trailing slash>/client/__notes/list` answers 200 with a JSON array within 3 s (refusal names the serve command and "expose it yourself — the plugin never opens a tunnel"); on success writes `status.client = { address, openedAt }` and prints `client: open — <address>/client/index.html` (AC-20260907-10-2) | ADR-0012: "CLIENT opens only when the walk scope is at zero and the exposed address answers" — the state derivation is the walk-zero half, this probe is the address half; the plugin never exposes anything itself (memory: hub base is optional, never ask for Tailscale) |
| D3 | `lib/mocks-notes.js` gains `ORIGINS = ['walk','client','session']` and `originOf(n)` (`n.origin`, else `'walk'` when `n.kind === 'walk'`, else `'session'`); `addNote` stamps `origin` from `input.origin` when given, else by that same rule; `validateNotes` accepts an absent `origin` (legacy) and rejects any value outside the enum (AC-20260907-10-3) | Notes written before this spec default to `session` (ADR-0012), a walk finding is a walk finding by construction; the enum is the only new validation, additive |
| D4 | `createRequestHandler`: a request whose stripped path begins `/client/` is re-dispatched with `clientRoute = true` and `/client` removed. On the client route: `POST /__notes/add` refuses (400) a body carrying `origin`, `kind` or `ledgerId` and stamps `origin: 'client'`; `POST /__notes/resolve` succeeds only on a client-origin note (400 otherwise, naming the origin) — `open → resolved` records `resolution: 'withdrawn'`, `addressed → resolved` records `resolution: 'accepted'`; `GET /__notes/list` returns questions plus client-origin notes only (walk and session-origin plain notes never appear); `POST /__notes/answer` is unchanged; every other `/client/…` path answers 404 until spec 11 fills it. On the non-client route: `POST /__notes/add` refuses a body carrying `origin` (400) and stamps `origin: 'session'`; `POST /__notes/resolve` on a client-origin note answers 403 naming the client route and `notes waive`. Every client-route write on a note sets `lastClientAt` (AC-20260907-10-4, AC-20260907-10-5, AC-20260907-10-6, AC-20260907-10-7, AC-20260907-10-21) | Origin is decided by the write path, never the typed name (ADR-0012); a withdrawal versus an acceptance is derived from the prior status, never typed |
| D5 | New `lib/client-capture.js` exporting `captureScreen({ port, label, state, viewport, out }) → Promise<{ hash }>`: async-spawns `npx --no-install playwright screenshot --viewport-size=<w>,<h> http://127.0.0.1:<port>/mocks/<label>.html?clean[&state=<s>] <out>`, then sha256-hex of the PNG; rejects naming `npx playwright install chromium` when the exit is non-zero or no file lands. Viewport is `review-page.js`'s `viewportOf(loadTargets(root))` (first declared `design/targets.json` viewport, 1280×800 when none). Always `spawn`, never `spawnSync` — the serve process calls this against its own port (AC-20260907-10-8) | The same URL form, viewport and `?clean` as the look command, so a before and an after are comparable; `spawnSync` inside the serving process would deadlock on its own request (gotcha class: in-process fixture under spawnSync) |
| D6 | On the client route a mock-scope `POST /__notes/add` captures FIRST (to `design/mocks/captures/.pending-<ts>.png`), then reads notes, adds the note, renames the file to `captures/<id>.before.png`, and writes — no `await` between the read and the write; the note carries `capture: { before: { hash, file: 'captures/<id>.before.png' }, after: null }`. A capture failure answers 503 with the lib's message and writes no note. A project-scope client note carries `capture: null` (AC-20260907-10-9) | ADR-0012: the before-frame must exist at raise or closure can never be derived; project-scope notes close by acceptance or waiver only |
| D7 | `notes address --id <id> --change <c> [--ledger <row>] [--port <n>]`: on a client-origin **mock-scope** note it requires `--port` (refusal names the serve command), re-captures through D5 to `captures/<id>.after.png`, refuses (exit 2, file removed) when the new hash equals `capture.before.hash` — `the screen has not changed — a client note closes on a visible change, a reply (notes reply), a client withdrawal, or a waiver (notes waive)` — and otherwise stores `capture.after = { hash, file }` before setting `addressed`; on a client-origin **project-scope** note it refuses outright naming acceptance or waiver; on every other note it is byte-identical to today (AC-20260907-10-10, AC-20260907-10-11, AC-20260907-10-22) | Closure is derived from the capture, and the session cannot complete it (ADR-0012) |
| D8 | `notes waive --id <id> --reason <r> [--by <who>]` (default `by` `session`): refused (exit 2) on a note that is neither client-origin nor a question, on an already-resolved note, or while fewer than seven days (`7 × 86 400 000` ms) have passed since the note's silence clock — a client note's `lastClientAt`, a question's later of its `at` and `status.client.openedAt` (no `openedAt` → refuse naming `client open --address`); the refusal prints the days elapsed and the earliest date it would succeed. On success: `waived: { at, reason, by }`, `status: 'resolved'`, `resolvedBy: 'waiver'`; a question additionally gets `answer: { verdict: 'waived', text: <reason>, by, at }` and its ledger row's status is set to `waived <today>` before the note write; `validateNotes`' verdict enum gains `waived` (text required); `lib/mocks-ledger.js`'s `STATUS_RE` gains `waived` and `gateVerdict` treats a `waived` row as non-blocking (AC-20260907-10-12, AC-20260907-10-14) | A dated waiver is the only release for a silent client (ADR-0012); a waived question carries a non-null `answer` so every existing "unanswered" derivation (`unresolvedFor`, the review page, the notes layer) closes it with zero edits, and the ledger stays truthful — `waived`, never `confirmed` |
| D9 | `--mark approved` keeps every existing precondition (every journey approved, `requireNotesResolved(allDeclaredLabels())`, the ledger gate, a decided `approved` stop from `stop open signoff`, the viewport meta, `check --matrix`, `render-gate --mocks`) and does NOT require `status.client` — the close condition is the ledger and the notes, which D7/D8 make resolved-or-waived by construction. The accepted mark prints, before the checkpoint line, `waived: N` and one `  <id> — <reason>` line per waived note (`waived: 0` when none). The `signoff` step name of `stop open` and the stop key `approved` are unchanged (AC-20260907-10-15, AC-20260907-10-16) | ADR-0012: "its close condition is the ledger"; a project with no client approves on the decider ceremony alone (📌 auto-picked — the cheaper reading to reverse; a required `client open` would put a probe of a live address into every test fixture that reaches APPROVED); the stop name stays so AC-20260907-08-12's pin and the `stop open` enumeration keep passing |
| D10 | `printClientStep()` prints state `CLIENT`, heading `## Step: client review — the product I understand`, `Read only: design/atlas/index.html, design/mocks/notes.json`, `Doctrine: … § Mocks: State Machine`, a `client:` line (`client: not opened — expose the served atlas yourself, then: <driver> client open --address <url>`, or `client: open since <YYYY-MM-DD> — <address>/client/index.html · client notes: A open · B addressed · C waived · questions: Q unanswered`), the fixed line `Approval means "this is the product I understand" — the written brief, not these screens, holds scope.`, the `look:` line for the `approved` stop, and `Then: <driver> --mark approved`; no skill line (AC-20260907-10-17) | One block, same shape as every other look-gated step; the counts are the approver's number, never a checkbox |
| D11 | `writeNotes` writes `notes.json.tmp-<pid>` in the same directory and `renameSync`s it over `notes.json`; every serve-side mutation re-reads immediately before its write with no `await` in between (D6's ordering). No lock file (AC-20260907-10-18) | Two writers by design (ADR-0012); a rename is atomic on one filesystem so a reader never sees a torn file; the residual cross-process read-modify-write window is milliseconds and accepted (Rationale) |
| D12 | `spec/doctrine/mocks.md`: § Mocks: State Machine's order sentence names **CLIENT** (the served journey pages, exposed by the user, where product questions are answered and client notes raised; closes when every client-visible question is answered-or-waived and every client note resolved-or-waived) in SIGNOFF's slot; § Provenance Ledger's step vocabulary lists `CLIENT` live and moves `SIGNOFF` to the retired-but-still-parsing clause beside SKIN/REVIEW/THEME; § Mocks: Look and Serve's "or SIGNOFF" reads "or CLIENT"; § Mocks: Page Notes' ADR-0012 paragraph gains the waiver command and the withdraw/accept derivation. `spec/commands/mocks.md`: `## Sign-off (SIGNOFF state)` becomes `## Client review (CLIENT state)` (expose, `client open`, triage with `notes address --port`, `notes reply`, `notes waive` after seven days, `stop open signoff`, `--mark approved`); the look rule names CLIENT; the `stop open` enumeration keeps `signoff` (AC-20260907-10-19, AC-20260907-10-20) | Doctrine is the one binding home for the chain; the command names the moves |
| D13 | Test retags, one edit each: `tests/consistency/design-doctrine.test.js` (order tokens `…WIREFRAMES, CLIENT, APPROVED`; the AC-20260902-10-8 step-literal test reaches CLIENT), `tests/mocks/mocks-driver-3.test.js` and `tests/mocks/mocks-driver-walk.test.js` (derived state `CLIENT`), `tests/mocks/mocks-driver-look-stops-4.test.js` (`state: CLIENT`, heading `## Step: client review`), `tests/genesis/brief-state.test.js` (the AC-20260902-08-4/AC-20260906-02-9 fixture state `THEME` → `CLIENT` and its chain sentence rewritten to `SEED → SHAPES → KIT → WIREFRAMES → WALK → CLIENT → APPROVED`, one edit) — every pin retagged with its new AC, never weakened (AC-20260907-10-1, AC-20260907-10-13, AC-20260907-10-17) | Gotcha: a retired literal outside the File Plan leaves a red pin; the brief-state fixture is stale from two specs back (q127 fold-in) |
| D14 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D15 | `tests/genesis/brief-state.test.js` keeps its original `AC-20260902-08-4 / AC-20260906-02-9` tags and carries no `AC-20260907-10-13` token; its fixture still stamps `state: "CLIENT"` and still asserts the refusal names `CLIENT` [no-ac: `red-check.js` is the oracle — the file is edit-only currency, and AC-20260907-10-13 stays covered by `tests/consistency/design-doctrine.test.js`] | Build-time ruling: the genesis `brief-written` refusal echoes whatever `state` the fixture stamps, so the retag is green against the pre-image by construction and red-check refuses it as `unsanctioned-green`. The removal fix is the pipeline-rules gotcha's sanctioned one (name the file, not the ID); D13's own rationale already calls this row a staleness fix, so no promise changes and no AC is amended |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-notes.js | MODIFY | scripts | D3 `ORIGINS`/`originOf`/origin stamping; D4 `resolution` on resolve; D6/D7 `capture` shape; D8 `waiveNote` + verdict `waived`; D11 atomic `writeNotes`; `lastClientAt` |
| spec/scripts/lib/client-capture.js | CREATE | scripts | D5 `captureScreen` — async playwright screenshot + sha256, header cites this spec, exit codes: none (library) |
| spec/scripts/lib/mocks-ledger.js | MODIFY | scripts | D8 `STATUS_RE` gains `waived`; `gateVerdict` non-blocking on `waived` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D1 CLIENT derivation + probe disjunct; D2 `client open`; D7 `notes address --port` capture; D8 `notes waive`; D9 waived print at `approved`; D10 `printClientStep`; usage header + `notes` error list gain the new verbs |
| spec/scripts/design-atlas.js | MODIFY | scripts | D4 client-route dispatch, origin stamping, list filter, resolve rules; D6 capture-at-add; header usage block names `/client/__notes/*` |
| spec/doctrine/mocks.md | MODIFY | doctrine | D12 order sentence, ledger step vocabulary, look rule, page-notes waiver/withdraw sentences |
| spec/commands/mocks.md | MODIFY | doctrine | D12 `## Client review (CLIENT state)`, look rule |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D14 bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | AC-20260907-10-3, AC-20260907-10-12, AC-20260907-10-18 |
| tests/mocks/mocks-driver-client.test.js | CREATE | tests | AC-20260907-10-1, AC-20260907-10-2, AC-20260907-10-10, AC-20260907-10-11, AC-20260907-10-14, AC-20260907-10-15, AC-20260907-10-16, AC-20260907-10-17, AC-20260907-10-22 |
| tests/mocks/client-route.test.js | CREATE | tests | AC-20260907-10-4, AC-20260907-10-5, AC-20260907-10-6, AC-20260907-10-7, AC-20260907-10-8, AC-20260907-10-9, AC-20260907-10-21 — file-local async `spawn` runner for the serve child (Test Rules gotcha), PATH-stubbed `npx` that copies a fixture PNG to its last argv |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | AC-20260907-10-13, AC-20260907-10-19, AC-20260907-10-20 (retag of AC-20260907-07-10/-11 order + step pins; AC-20260902-10-8 literal test reaches CLIENT) |
| tests/mocks/mocks-driver-3.test.js | MODIFY | tests | AC-20260907-10-1 (retag of the AC-20260907-08-1 `SIGNOFF` derive assertions) |
| tests/mocks/mocks-driver-walk.test.js | MODIFY | tests | AC-20260907-10-1 (setup assertion reads `CLIENT`) |
| tests/mocks/mocks-driver-look-stops-4.test.js | MODIFY | tests | AC-20260907-10-17 (retag of AC-20260906-02-6 / AC-20260907-07-8 block pins: state, heading, no skill line, probe refusal) |
| tests/genesis/brief-state.test.js | MODIFY | tests | AC-20260907-10-13 (fixture state `CLIENT`, chain sentence rewritten — one edit, AC-20260902-08-4/AC-20260906-02-9 kept) |

Orchestrator duty (outside the table): `tests/mocks/mocks-driver-fixtures.js` is NOT edited —
`advanceToApproved` keeps working unchanged under D9; the two new test files carry their own
serve runner rather than widening the fixtures module.

## Contracts

```jsonc
// design/mocks/notes.json — one note (additive fields; every existing field unchanged)
{
  "id": "N007", "scope": "mock", "screen": "signin", "state": "error",
  "text": "…", "by": "Ana", "at": "2026-09-09T10:00:00.000Z",
  "status": "open" | "addressed" | "resolved",
  "origin": "walk" | "client" | "session",          // D3 — absent on legacy notes = originOf()
  "capture": { "before": { "hash": "<sha256 hex>", "file": "captures/N007.before.png" },
               "after":  null | { "hash": "…", "file": "captures/N007.after.png" } } | null,  // D6/D7, client mock-scope only
  "lastClientAt": "2026-09-09T10:00:00.000Z" | null, // D4 — every client-route write on the note
  "resolution": "withdrawn" | "accepted" | null,     // D4 — client-route resolve only
  "waived": { "at": "…", "reason": "…", "by": "session" } | null,   // D8
  "answer": { "verdict": "yes" | "no" | "waived", "text": "…", "by": "…", "at": "…" } | null
}
```

```jsonc
// design/mocks/status.json — one new top-level field (D2); absent on every existing host
"client": { "address": "https://hearwell.example", "openedAt": "2026-09-09T10:00:00.000Z" }
```

```
# design/mocks/ledger.md — status cell grammar (D8)
STATUS_RE = /^(open|confirmed|overridden|decided|waived)(?: (\d{4}-\d{2}-\d{2}))?$/
```

```
# mocks-driver.js — new/changed verbs
mocks-driver.js --root <dir> client open --address <url>
mocks-driver.js --root <dir> notes address --id <id> --change "<c>" [--ledger <rowId>] [--port <n>]
mocks-driver.js --root <dir> notes waive --id <id> --reason "<r>" [--by <who>]
```

```
# design-atlas.js serve — client route (D4); same handler, path prefix /client
GET  /client/__notes/list            → questions + client-origin notes only
POST /client/__notes/add             → origin "client"; mock scope captures first (D6)
POST /client/__notes/resolve         → client-origin only; resolution derived
POST /client/__notes/answer          → unchanged
GET  /client/<anything else>         → 404 (spec 11 serves the view)
```

```js
// spec/scripts/lib/client-capture.js (D5)
captureScreen({ port, label, state, viewport: { width, height }, out }) → Promise<{ hash }>
```

## Behavior

**State.** `SEED → SHAPES → KIT → WIREFRAMES → WALK → CLIENT → APPROVED`. A host whose
`status.json` still stamps `state: "SIGNOFF"` derives `CLIENT` on its next run from the same
marks; nothing is migrated.

**Opening the client.** The CLIENT step block tells the session to expose the running serve
itself, then `client open --address <url>`. The driver probes `<url>/client/__notes/list`;
a 200 JSON array records `status.client`. A wrong or dead address refuses naming the serve
command. The block's `client:` line shows the address and the live counts thereafter.

**A client raises a note** (through spec 11's page, or any POST to the client route). Mock
scope: the server captures the anchored screen at its anchored state through the look
command's own URL form and viewport, stores `captures/<id>.before.png`, records its hash on the
note, and stamps `origin: "client"`. Project scope: no capture. The session sees the note in
`notes open` with an `[client]` origin tag beside the status tag.

**The session works the note.** `notes reply` shows the client a reply, status unchanged.
`notes address --port <n>` re-captures; the same hash refuses; a different hash stores
`captures/<id>.after.png` and moves the note to `addressed`. The page (spec 11) renders before
and after under the note. `notes address` on a project-scope client note refuses.

**The client closes the note.** Accepting an `addressed` note resolves it with
`resolution: "accepted"`; withdrawing an `open` one resolves it with `resolution: "withdrawn"`.
A session-route resolve on a client note is a 403.

**Silence.** After seven days with no client action on the note (or, for a question, seven days
after the later of the question's creation and the client opening), `notes waive --id --reason`
resolves it as waived; a question's ledger row becomes `waived <today>`. Earlier, the refusal
prints how many days have elapsed and the first date the waiver would be accepted.

**Approval.** `--mark approved` runs every existing precondition; waived notes and waived rows
satisfy the notes and ledger gates by construction. The accepted mark prints `waived: N` plus
one reason line per waived note, then the checkpoint line.

## Acceptance Criteria

- **AC-20260907-10-1**: WHEN every declared journey carries `walked` and `marks.approved` is
  unset THE SYSTEM SHALL derive `CLIENT` (`--state` prints `CLIENT`; a legacy `status.json`
  stamped `state: "SIGNOFF"` with those marks derives `CLIENT`), and the string `SIGNOFF` SHALL
  not occur anywhere in `spec/scripts/mocks-driver.js`
  → `tests/mocks/mocks-driver-client.test.js`, `tests/mocks/mocks-driver-3.test.js`,
  `tests/mocks/mocks-driver-walk.test.js`
- **AC-20260907-10-2**: WHEN `client open --address <url>` runs in a state other than `CLIENT`,
  with no `--address`, or against an address whose `/client/__notes/list` does not answer 200
  with a JSON array THE SYSTEM SHALL exit 2 naming the cause (the current state, the flag, or
  the serve command plus "expose it yourself"); against a live serve it SHALL exit 0, write
  `status.client = { address, openedAt }` (trailing slash stripped:
  `--address http://127.0.0.1:<p>/` → `"address": "http://127.0.0.1:<p>"`) and print
  `client: open — http://127.0.0.1:<p>/client/index.html`
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-3**: WHEN `validateNotes` reads a note with `origin: "customer"` THE SYSTEM
  SHALL return one error naming the id and `(field "origin")`; a note with no `origin` SHALL
  validate; `originOf` SHALL return `walk` for `{kind:"walk"}` with no origin, `session` for a
  plain note with no origin, and the stored value otherwise
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-10-4**: WHEN `POST /client/__notes/add` carries `origin`, `kind` or `ledgerId`
  THE SYSTEM SHALL answer 400; a valid project-scope body SHALL answer 201 with
  `origin: "client"`, `capture: null`, `lastClientAt` set; WHEN `POST /__notes/add` (non-client
  route) carries `origin` THE SYSTEM SHALL answer 400, and a valid body SHALL land with
  `origin: "session"`
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-5**: WHEN `POST /client/__notes/resolve` targets an `open` client-origin note
  THE SYSTEM SHALL answer 200 with `status: "resolved"`, `resolution: "withdrawn"`; on an
  `addressed` client-origin note `resolution: "accepted"`; on a session-origin or walk note it
  SHALL answer 400 naming that origin; on a question 400 naming `/__notes/answer`
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-6**: WHEN `POST /__notes/resolve` (non-client route) targets a client-origin
  note THE SYSTEM SHALL answer 403 naming the client route and `notes waive`, leaving the note
  unchanged on disk
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-7**: WHEN `GET /client/__notes/list?screen=**` runs over a notes file holding
  one question, one client-origin note, one session-origin note and one walk note THE SYSTEM
  SHALL return exactly the question and the client-origin note
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-8**: WHEN `captureScreen` runs with a PATH whose `npx` copies a fixture PNG to
  its last argument THE SYSTEM SHALL resolve `{ hash }` equal to the fixture's sha256 hex and
  SHALL have invoked `npx` with `--no-install playwright screenshot --viewport-size=1280,800
  http://127.0.0.1:<port>/mocks/signin.html?clean&state=error <out>` (argv logged by the stub);
  with an `npx` that exits 1 it SHALL reject with a message naming `npx playwright install
  chromium`
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-9**: WHEN `POST /client/__notes/add` with `scope: "mock"` runs under the
  PNG-copying `npx` stub THE SYSTEM SHALL answer 201 with `capture.before.hash` equal to the
  fixture's sha256 and `capture.before.file` `captures/<id>.before.png`, and that file SHALL
  exist beside `notes.json` with no `.pending-*` file left; under an `npx` that exits 1 it SHALL
  answer 503 and `notes.json` SHALL be byte-identical to before
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-10**: WHEN `notes address --id <clientMockNote> --change "…"` runs without
  `--port` THE SYSTEM SHALL exit 2 naming the serve command; with `--port` and an `npx` stub
  that writes the SAME bytes as the before capture it SHALL exit 2 containing `the screen has
  not changed`, leave the note `open` and leave no `captures/<id>.after.png`; with a stub that
  writes DIFFERENT bytes it SHALL exit 0, set `status: "addressed"` and `capture.after.hash`
  to the new sha256 with `captures/<id>.after.png` on disk
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-11**: WHEN `notes address` targets a client-origin project-scope note THE
  SYSTEM SHALL exit 2 naming acceptance or waiver
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-12**: WHEN `waiveNote(notes, id, {reason, by, now})` runs on a client note
  whose `lastClientAt` is 6 days before `now` THE SYSTEM SHALL throw naming the days elapsed
  (`6`) and the first accepted date; at 7 days it SHALL return the note with `status:
  "resolved"`, `resolvedBy: "waiver"`, `waived: { at, reason, by }`; on a question it SHALL
  additionally set `answer.verdict: "waived"` with `text` = the reason, and `validateNotes` SHALL
  accept `verdict: "waived"` with text and reject it without
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-10-13**: WHEN `spec/doctrine/mocks.md` § Mocks: State Machine is read THE
  SYSTEM SHALL name **SEED**, **SHAPES**, **KIT**, **WIREFRAMES**, **WALK**, **CLIENT**,
  **APPROVED** bold in that order with no `SIGNOFF` outside § Provenance Ledger's
  retired-step-names clause, which SHALL name `SIGNOFF` beside `SKIN`, `REVIEW`, `THEME`; and
  `tests/genesis/brief-state.test.js`'s AC-20260902-08-4 / AC-20260906-02-9 fixture SHALL write
  `state: "CLIENT"` with a refusal that names `CLIENT`
  → `tests/consistency/design-doctrine.test.js`, `tests/genesis/brief-state.test.js`
- **AC-20260907-10-14**: WHEN `notes waive` runs on a question whose `at` and
  `status.client.openedAt` are both 8 days old THE SYSTEM SHALL exit 0, set the ledger row's
  status to `waived <today>` (row text `| waived 2026-09-17 |` for a run on that date), and
  `ledger check` SHALL exit 0 (a `waived` product row never blocks); on a question with no
  `status.client` it SHALL exit 2 naming `client open --address`; on a session-origin plain
  note it SHALL exit 2 naming client-origin notes and questions as the only waivable kinds
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-15**: WHEN `--mark approved` is accepted on a root holding two waived notes
  THE SYSTEM SHALL print `waived: 2` followed by one `  <id> — <reason>` line per waived note
  before the checkpoint line; with none it SHALL print `waived: 0`; and it SHALL exit 0 with no
  `status.client` present
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-16**: WHEN `--mark approved` runs THE SYSTEM SHALL CONTINUE TO refuse with
  no decided `approved` stop (naming `stop open signoff`), on an unresolved mock note anchored to
  any declared label, and on any journey whose `approved` is unset
  → `tests/mocks/mocks-driver-client.test.js`
- **AC-20260907-10-17**: WHEN the bare driver runs in `CLIENT` THE SYSTEM SHALL print
  `state: CLIENT`, `## Step: client review — the product I understand`, a `client:` line reading
  `client: not opened — expose the served atlas yourself, then:` with the `client open
  --address <url>` command when `status.client` is absent (or `client: open since <date> —
  <address>/client/index.html · client notes: A open · B addressed · C waived · questions: Q
  unanswered` when present), the literal `Approval means "this is the product I understand" —
  the written brief, not these screens, holds scope.`, a `look:` line naming `stop open
  signoff`, a `Then:` line naming `--mark approved`, and no line containing `frontend-design`;
  with a failing look probe it SHALL exit 2 naming `npx playwright install chromium`
  → `tests/mocks/mocks-driver-client.test.js`, `tests/mocks/mocks-driver-look-stops-4.test.js`
- **AC-20260907-10-18**: WHEN `writeNotes` runs in-process with `fs.renameSync` patched to
  throw THE SYSTEM SHALL leave an existing `notes.json` byte-identical (the write never touches
  the final path directly); unpatched, it SHALL leave no `notes.json.tmp-*` file beside
  `notes.json` and the file SHALL parse to the given array
  → `tests/mocks/mocks-notes.test.js`
- **AC-20260907-10-19**: WHEN `spec/commands/mocks.md` is read THE SYSTEM SHALL carry a
  `## Client review (CLIENT state)` heading naming `client open --address`, `notes address …
  --port`, `notes waive`, `seven days`, `stop open signoff` and `--mark approved`, no `##
  Sign-off` heading, a look rule naming `CLIENT`, and the `stop open` enumeration
  `shapes`|`kit`|`journey:<j>`|`signoff` unchanged
  → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-10-20**: WHEN `spec/doctrine/mocks.md` § Mocks: Look and Serve and § Mocks:
  Page Notes are read THE SYSTEM SHALL name `CLIENT` in the reachability sentence in SIGNOFF's
  place, and the Page Notes ADR-0012 paragraph SHALL name `notes waive`, `withdrawn` and
  `accepted`
  → `tests/consistency/design-doctrine.test.js`
- **AC-20260907-10-21**: WHEN `GET /__notes/list?screen=**` (non-client route) runs over the
  four-note file of AC-20260907-10-7 THE SYSTEM SHALL CONTINUE TO return all four notes
  → `tests/mocks/client-route.test.js`
- **AC-20260907-10-22**: WHEN `notes address` targets a session-origin or walk note without
  `--port` THE SYSTEM SHALL CONTINUE TO exit 0 and set `addressed` with no `capture` field
  → `tests/mocks/mocks-driver-client.test.js`

## Assumptions (escalation triggers)

- A1: Two Playwright screenshots of the same served mock at the same viewport hash identical,
  and an edited mock hashes differently — **executed 2026-09-09** against
  `design-atlas.js serve` on an ephemeral port with `npx --no-install playwright screenshot
  --viewport-size=1280,800 http://localhost:<p>/mocks/signin.html?clean[&state=error]`
  (Playwright 1.63.0, chromium-headless-shell v1243): happy twice →
  `1fa84c3200901fac…` both; error state twice → equal; error ≠ happy; after editing the `<h1>`
  → `808e63a4210533e9…`. `fs.writeFileSync(tmp)` + `fs.renameSync` left the target and no tmp.
  **If false** on a host (a mock with an animation or a clock): the note refuses `addressed`
  forever on that screen — the remedy is the `?clean` path's existing animation freeze; if a
  host still flaps, STOP and ask whether the after-hash rule becomes "differs from before OR
  the session attaches `--force-changed <reason>`".
- A2: The serving process can spawn `npx playwright screenshot` against its own port and keep
  answering — `spawn` (async) never blocks the event loop; the spike above ran the screenshot
  from a separate process, not from inside the server. **If false** (a handler-level hang):
  move the capture to a `child_process.fork`ed worker with the same argv; the URL form and
  hash rule stand.
- A3: `tests/mocks/mocks-driver-fixtures.js`'s `advanceToApproved` keeps passing without a
  client record (D9). **If false** (a reviewer or JJ rules that approval must require `client
  open`): add `--address` probing to the fixture through a real serve child and note the
  deviation; the state chain is unchanged.
- A4: No test outside D13's list asserts the `SIGNOFF` literal or the `## Step: sign off`
  heading — grepped 2026-09-09: `tests/mocks/mocks-driver-2.test.js` names only `stop open
  signoff` (kept), `mocks-driver-look-stops.test.js` and `-2` name only the `signoff` step
  literal (kept), `mocks-driver-fixtures.js` and `mocks-notes.test.js` name it in comments
  only. **If false**: the build's whole-suite check names the file; retag in place.
- A5: `spec-paths` needs no new key (both new files are a lib and tests). **If false**:
  add the key and its `spec-paths.test.js` row as a deviation.

## Rationale

The ADR closed the loop the previous wording could not build: no before-frame existed, and the
resolve handler let anyone close anyone's note. Every mechanism here is the smallest one that
makes each ADR sentence enforceable on disk. **Origin from the route** (D3/D4) is a prefix on
the same handler — no second server, no auth; identity remains a typed name, which the ADR
accepts. **Capture at raise** (D5/D6) reuses the look command's exact URL form so a before and
an after are comparable; the spike confirmed the render is byte-stable for a static mock and
changes when the mock changes. The capture must happen inside the serve process (the client's
request is the raise), which is why `client-capture.js` is async-only and why spec 11 is the
only way to observe it end to end. **Closure by hash** (D7) is the derived signal the ADR
demands; a typed line stays refused. **Waiver** (D8) is the one release; the seven-day clock is
per note, and a waived question keeps the ledger truthful by adding a `waived` status rather
than laundering it into `confirmed` — the gate treats it like `overridden`, the counts line is
unaffected. A waived question carries `answer.verdict: "waived"` so every existing
"unanswered" derivation closes it with no edit to the review page or the notes layer; that is
a deliberate reuse, not a new answer kind, and the ADR's "answered or waived" wording is
exactly that union.

**D9's reading.** "CLIENT opens only when … the exposed address answers" is enforced at
`client open`; approval does not re-check it. The alternative — refuse `--mark approved`
without `status.client` — would force a live-address probe into every fixture that reaches
APPROVED across five test files, for a rule the ADR itself says may shrink after the first
observed client. It is the cheaper reading to reverse: one precondition line later.

**Two writers, no lock.** The rename makes a torn read impossible; the remaining risk is a
lost update when the driver and the server each read-modify-write inside the same few
milliseconds. The driver runs when the session types a command; a client write is a human
click. A lock file would add a stale-lock story to every path for a window nobody will hit;
revisit only from an observed lost note.

**Retags.** Five test files pin `SIGNOFF` as a state string or the `## Step: sign off` heading;
each is retagged in place with its new AC, never weakened (pipeline rules: a weakened
assertion is hard). The `signoff` *stop step name* and the `approved` stop key are kept so the
spec 08 CONTINUE-TO pin and the `stop open` enumeration pins pass unmodified — a rename there
would be churn with no product consequence.

**Collision closure (lock, `--literal SIGNOFF --literal "sign off"`).** Literals-leg hits
outside the File Plan, each waived here: `tests/mocks/mocks-driver-2.test.js`,
`tests/mocks/mocks-driver-look-stops.test.js`, `tests/mocks/mocks-driver-look-stops-2.test.js`,
`tests/mocks/mocks-driver-fixtures.js`, `tests/mocks/mocks-notes.test.js` name `SIGNOFF` only in
comments or as the kept `stop open signoff` step literal; `tests/mocks/mocks-driver-4.test.js`
and `tests/design-atlas.test.js` hit "sign off" only as the kit stop's title `sign off the kit`
and a test's own `--title` argument — neither is the state name, nothing changes.
`docs/adr/*`, `docs/roadmap/*`, `docs/canonical/design.md` and `plugin.json` are prose the Delta
or the bump rewrites. Paths-leg `executes` hits on `design-atlas.js` and `mocks-ledger.js` run
scripts whose existing behaviour is unchanged (additive routes, an additive status word) — no
fixture repair is owed.

**Sixteen File Plan rows**, five of them one-line retags: over the soft cap by one, kept in one
spec because every row lands or none does — the state rename alone reddens the retag files.

**Build departures (folded from the deviations sidecar at close).** Twenty-one size-ratchet
entries were raised, every one citing this spec: the tests-layer edits, the D1–D11 implementation,
and both review repairs each grew their files past baseline, and `spec/scripts/lib` and `tests`
needed a second raise on the TREE totals — each wave raised its own per-file entries and its own
tree, but the two waves' growth compounded on the shared totals, which only the post-commit
whole-suite run observes. The new `lib/client-capture.js` landed under its own floor with no raise.
Nothing else was touched; `size-baseline.json` is the only file the reconcile leg reported
out-of-plan, waived on § Worker Rules' "a mechanism pays its own size".

**The review repairs.** Three findings were disposed `fix` on the first pass and one on the
second. The load-bearing one: `client open`'s probe called `http.get` unconditionally, which
throws `ERR_INVALID_PROTOCOL` synchronously on an `https:` URL and was swallowed into the generic
"did not answer" refusal — so the one command that opens CLIENT refused this spec's own Contracts
example address. The follow-up pass found the scheme handling was case-sensitive in two places at
once (the guard AND the transport selector), so relaxing only the visible guard would have turned
an honest scheme refusal into a misleading dead-server refusal; the fix normalizes the scheme once
via `new URL(address).protocol` ahead of both. The remaining two were an extraction of three
identical note-landing blocks into `addNoteAndRespond` (D6's capture-before-read ordering
preserved, verified live) and the header-usage line this file's File Plan row already promised.
One soft finding was WAIVED by the user: the probe collapses every transport error, TLS
certificate rejections included, into the same "did not answer" refusal. D2 fixes that wording and
AC-20260907-10-2's cause list is closed, so naming a certificate cause would need a D2 amendment
and a widened AC; the user chose to leave it. Reopen if a real client review is ever exposed
behind a self-signed tunnel and the wrong remedy costs a debugging session.

## Canonical Delta

`docs/canonical/design.md` § The mocks command: the derived chain reads `SEED → SHAPES → KIT →
WIREFRAMES → WALK → CLIENT → APPROVED` (specs/20260907/10, ADR-0012). CLIENT replaces the
one-look sign-off: the session exposes its own running serve and records the address with
`client open --address <url>` (refused unless `/client/__notes/list` answers); the terminal
`--mark approved` keeps the decided `approved` stop as the decider ceremony, prints `waived: N`
with every waived note's reason, and closes on the ledger and the notes alone — a waived note
or a `waived <date>` ledger row satisfies the same gates a resolved note or a confirmed row
does. § Page notes: a note carries `origin: walk|client|session`, set by the route it arrived
on (`/client/__notes/*` stamps `client`, `/__notes/*` stamps `session`, `notes add --kind walk`
stamps `walk`) and never accepted from a body. A client's mock-scope note captures its screen
at raise through `lib/client-capture.js` (the look command's URL form and first-declared
viewport; `captures/<id>.before.png` beside `notes.json`, sha256 on the note); `notes address
--port <n>` re-captures and refuses when the hash is unchanged, else stores the after image and
moves the note to `addressed`; only the client route resolves a client note — `withdrawn` from
`open`, `accepted` from `addressed` — and a session-route resolve is a 403. `notes waive --id
--reason` releases a client note or a question after seven days of client silence (a question's
ledger row becomes `waived <date>`; the note's `answer.verdict` is `waived`). `writeNotes` is a
tmp-file rename, never an in-place overwrite.
