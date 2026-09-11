---
description: Mocks-stage supplement to the spec pipeline's shared invariants — the provenance ledger grammar and gate, read by the mocks driver and question-style-gate.js, not a workflow entry point
---

# Spec Pipeline: Mocks-Stage Supplement

Mocks-stage supplement — read by the mocks driver (spec 07) in addition to `core.md`.

## Provenance Ledger

The ledger is one markdown file, `design/mocks/ledger.md`, two tables in fixed columns,
parsed and written by `spec/scripts/lib/mocks-ledger.js` (`parseLedger`, `gateVerdict`,
`countsLine`, `appendAssumption`, `appendCatch`, `setStatus`) — that library is the **one
writer**: a session (or a script outside it) hand-typing a row is the class that put malformed
rows into the escape ledger, and every row it writes leaves every other byte in the file
identical.

**Assumptions** table — `id · step · kind · claim · tag · status · rejected · dependents ·
note`:

- `id` — `^[A-Z]+\d+[a-z]?$`, unique across the table.
- `step` — `^[A-Z][A-Z-]*$` (`SEED`, `SHAPES`, `KIT`, `WIREFRAMES`, `WALK`, `CLIENT`, `SKETCH`,
  `GENESIS`, …); rows written under retired step names (`SKIN`, `REVIEW`, `THEME`, `SIGNOFF`)
  still match the pattern and keep parsing.
- `kind` — one fixed word: `product` or `process`.
- `claim` — free text; the assumption itself.
- `tag` — one fixed word: `said-by-user`, `ratified-doc`, `inferred`, or `invented`.
- `status` — one fixed word `open | confirmed | overridden | decided`, with an optional
  trailing ISO date (`confirmed YYYY-MM-DD`); `decided` is process-only — a `decided`
  `product` row does not parse.
- `rejected`, `dependents`, `note` — free text; `-` means empty.

**Misunderstandings** table — `id · what · step · cost · note`: `id` is `^M\d+$`, unique;
`note` names an originating note id or `-`.

Free text lives only in `claim`, `rejected`, and `note`. A literal pipe inside any cell is
written escaped (`\|`) and read back unescaped — every other cell is one fixed word, never
prose, so a script can gate on it without parsing English.

**Gate rule.** A ledger is **blocked** when any `product` row carries tag `invented` with
status other than `overridden`, or tag `inferred` with status `open`. `ratified-doc` rows and
every `process` row never block — a fact the user ratified as prose stays counted separately
and is re-tested on the screen that renders it, never re-asked as a question. A ledger that
fails to parse never opens a gate (parse errors are reported, not silently passed).

A row pinned as a question (§ Mocks: Page Notes, **Questions**) is answered on the page; the
answer writes the row's status.

**Counts line.** Every mark prints one fixed line:

```
📒 ledger: {S} said-by-user · {R} ratified-doc · {I} inferred ({Io} open) · {V} invented ({Vo} open) · {P} process · {C} catches
```

counting product rows per tag, every process row in one bucket, and misunderstanding rows as
catches. The shape is fixed so a reader learns it once — change it only under the spec that
owns it.

## Mocks: State Machine

`mocks-driver.js` derives the current state on every invocation from
`design/mocks/status.json` plus the artifacts on disk — a recorded mark is never trusted
alone; if its artifact vanished (a journey's screen deleted, a direction's tokens file
removed) the derivation lands earlier and demands the mark again. The order is fixed: **SEED**
(the 13 facts, journeys, dense screen, research brief) → **SHAPES** (one shape kebab picked
from 2–3 candidates) → **KIT** (the shared-primitive canon named and signed off, before any
screen) → **WIREFRAMES** (canon written, then every seed journey drawn and
approved) → **WALK** (one fresh-context critic walks each declared journey once, flow breaks
only) → **CLIENT** (the served journey pages, exposed by the user, where product questions
are answered and client notes raised; closes when every client-visible question is
answered-or-waived and every client note resolved-or-waived) → **APPROVED** (terminal).
WIREFRAMES carries a sub-mark per
journey so no single conversation ever has to hold more than one journey's state —
a seed journey added mid-WIREFRAMES reappears as `0/N drawn` and reopens the state rather than
silently completing; a journey added after WALK already ran on the others reopens WALK the same
way.

**The gate rides every advancing mark.** `seed-done`, `shape-picked`, `kit-signed`,
`canon-written`, `journey-approved`, and `approved` each
run the provenance ledger's `gateVerdict` (§ Provenance Ledger) before recording; a blocked
gate refuses (exit 2) naming the offending rows and the remedy (`ledger set --id <id> --status
confirmed --tag said-by-user`, or `--status overridden`). `journey-approved` and `approved`
additionally run the rendered adaptation gate (§ Design Render Gate, `render-gate --mocks`),
falling back to the plugin's own capture when the host declares none, and refuse the mark on
any finding or on a machine with no browser. `journey-drawn` and `journey-walked`
run no gate — drawing and walking are how open questions get found, not
resolved. Process rows never surface as something to resolve; they are counted, not asked.

**Reopening never deletes.** `--reopen journey:<j>` clears that journey's `approved` mark
(and the terminal `approved`), and additionally clears that journey's `walked`, naming
`walk:<j>` among what it invalidated; `--reopen walk:<j>` clears that journey's `walked`, the
terminal `approved`, and the sign-off decider, leaving every journey's own `approved` untouched;
`--reopen shapes` clears the shape pick and every downstream mark, including every journey's
`walked`; `--reopen kit` clears the kit sign-off and `approved`, never a journey's own approval
or its `walked`. Every reopen appends one row to
`status.reopens` naming what it invalidated and leaves every file on disk byte-identical — the
next derivation lands on the earliest state whose marks are now missing.

## Mocks: Seed

SEED is the one state where facts are established, not drawn — screens exist only after
`primary-surface` and `platforms-horizon` (the framework lesson: know the surface and the
device horizon before a pixel). The seed closes on 13 keys, each naming a `confirmed` product
row in the ledger: `primary-surface platforms-horizon tenancy offline realtime ai-in-loop
residency payer day-one-integrations scale-outage vendor-limits retention legal-floor`.
`retention` and `legal-floor` generalize the two facts that caught real misunderstandings in
the dry run (audio-retention limits; a regulation constraining a core mechanic) — every product
has some data lifetime and some regulatory floor worth naming even when the answer is "none".

`design/mocks/seed.md` (template `spec/templates/mocks-seed.md`) carries six sections in
order: `## Product` (three sentences — what it is, who it is for, the one job), `## Facts`
(one `- <key>: <ledger id>` line per key above, each id `confirmed`), `## References` (a path,
URL, or `- none`; anything under `design/mocks/references/` is picked up automatically),
`## Records` (one `- <entity>: records/<entity>.json` line per entity the product handles, the
path relative to `design/mocks/`; each file a JSON array of at least three of the client's real
records — `seed-done` refuses a missing section, a `- none` line, a path that is missing, does
not parse as a JSON array, or holds fewer than three objects, naming the entity and the remedy
`ask the client for three real <entity> records and save them as
design/mocks/records/<entity>.json`), `## Journeys` (one `### <journey-kebab>` per journey, a
persona line, and one fenced ` ```surfaces ``` ` block in the roadmap-brief grammar — names and
arrows only, one line per edge, every label declared in exactly one journey), and
`## Dense screens` (one or two labels already declared in a journey — the screen(s) every
theme candidate is judged on; `seed-done` refuses zero lines, more than two, or an undeclared
label; the singular `## Dense screen` heading with one line still parses, for hosts seeded
before this grammar). `design/targets.json` must parse with non-empty `themes`/`viewports`;
`docs/design/research-brief.md` must exist and be non-empty (authored via genesis.md § Genesis:
Fresh UX Research — the method is fixed there, this command only names the step). Journeys
exist before the first screen because no roadmap exists yet to derive them from; the same
surfaces grammar lets the atlas render journeys today and a later spec derive roadmap briefs
from them.

## Mocks: Checkpoint contract

Every state opens with exactly one step, `Read only:` naming the files this step needs and
nothing else, and a `Doctrine:` line naming the `## ` section of this file governing the
judgment — the genesis checkpoint contract verbatim (specs/20260825/04 D9), because a driver
loop across many `/clear`s only survives if the session never has to hold more state in
context than the current step. An accepted `--mark` prints, as its last two non-blank lines,
the ledger's counts line (§ Provenance Ledger) and:

```
✅ checkpoint — mocks state saved (<prev> → <next>); safe to /clear and re-run /spec:mocks
```

`<prev>`/`<next>` are the derived state names, identical when a sub-mark (a journey, a
direction) advances without changing the top-level state. This line is the sole signal that
disk, not chat context, is now the source of truth — a session may `/clear` immediately after
reading it and re-invoke `/spec:mocks` cold with nothing lost. `--state` is a read-only peek:
it prints only the derived state name, never writes `status.json` beyond first-run creation,
and never runs the look-reachability probe (§ Mocks: Look and Serve) — it exists so a session
recovering from a `/clear` can check where it left off before doing anything.

## Mocks: Look and Serve

Every mock is a static file; nothing requires a running app. `design-atlas.js serve [--root
<r>] [--port <n>]` serves `<root>/design/` read-only with no cache (`cache-control: no-store`,
path traversal outside the root answers 404) and exits cleanly on SIGINT/SIGTERM; its busy-port
branch answers `already serving` when a previous session's server is still up on that port, so
starting it is idempotent. This makes `serve` the session's own tool: before the first look
stop of a `/spec:mocks`, `/spec:sketch`, or `/spec:atlas` run, the session starts
`node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a
**tracked background task** (D4, specs/20260905/04), leaves it running across that run's look
stops, and stops the task at sign-off or when the session ends — no script ever spawns a
detached server, writes a pid file, or runs a registry; the serve command itself is
never printed to the user. **The user's path is the look link**: a look stop's `🎨 ready for review —
<url>` line is that project's own served atlas page, `http://localhost:<port>/atlas/index.html
#stop-<id>` — never a per-project port the user forwards by hand, and never a machine-wide
address shared across projects.

**The journey look surface is the review page.** `stop open journey:<j>` points the stop's URL
at `/review/<j>.html`, served by `design-atlas.js` alongside the atlas index — screens rail,
per-screen artboards with state tabs, and a question/note inspector answered in place. Its
chrome follows the plugin-chrome rule, one binding home: design.md § Design Canon.

**The session's own look** is `mocks-driver.js look <label> [--state <s>] [--port <n>] [--out
<png>]`: with `--port` it captures the served `http://localhost:<port>/mocks/<label>.html?clean[&state=<s>]`
(`design-atlas.js`'s own `?state=` injection, § Mocks: Look and Serve) and writes no sibling file;
without `--port` it writes a sibling `.look-<label>.html` (the mock plus an inline script that
clicks `[data-state-btn="<s>"]` on load when `--state` is given), captures it with the Playwright
CLI at the first declared viewport in `design/targets.json`, and deletes the sibling in a
`finally` — the repo never accumulates look scratch files. `look-probe` exits 0 exactly when `npx
--no-install playwright --version` exits 0; this is the reachability signal because
`require.resolve('playwright')` does not resolve from a host repo even when the CLI works.

**Reachability is a precondition, not an afterthought.** Before printing SHAPES, WIREFRAMES,
or CLIENT — every state that asks the session to look at a screen — the driver runs the
look probe unless `status.look` is already `"browser"`; a failed probe refuses (exit 2) naming
`npx playwright install chromium` rather than silently proceeding into a state no one can
verify. `mocks-driver.js look-via <playwright|browser>` records the session's declared path:
`browser` means a browser MCP the command told the session to `ToolSearch` for, which cannot be
probed from a script and so is declared once and trusted thereafter.

**Walk mode is a query token, not a separate route.** `GET /mocks/<label>.html?walk` injects
`<script src="<prefix>/__walk/walk.js"></script>` before the last `</body>` (after the state
click script when `?state=` is also present), and `GET /__walk/walk.js` serves
`spec/scripts/lib/walk-mode.browser.js` verbatim, `no-store`. `?walk` composes with `?clean` and
`?state=`; `?clean` strips the notes layer but never the walk script. Inside the frame, a click
on the `[data-to]` control reports `{walk:'to', from, to}` to the parent; any other click reports
`{walk:'miss', from, target}` — the mechanism spec 03's journey player reads to know where a
client's click went (ADR-0013).

## Mocks: Page Notes

Feedback on served mocks is written on the page, never in chat and never in mock markup.
`design-atlas.js serve` injects a notes layer (`spec/scripts/lib/notes-layer.browser.js`) into
every served `.html` unless the request carries `?clean`; every write — HTTP or driver — goes
through `spec/scripts/lib/mocks-notes.js`, the one writer of `design/mocks/notes.json` (the
ledger's pattern, § Provenance Ledger).

**Two scopes, never an element.** A note is anchored to a screen + state (`scope: "mock"`,
`screen`, `state` set) or to the whole product (`scope: "project"`, `screen`/`state` null) — the
dry run's catches were all state-level; an element anchor is brittle across redraws and was
rejected.

**Status is a three-step queue, asymmetric by design.** `open` → `addressed` (driver-only:
`notes address --id <id> --change "<what changed>" [--ledger <rowId>]`, or a question-back reply
via `notes reply --id <id> --text "<question>"`, which leaves status unchanged) → `resolved`
(the page's `Resolve` button only, `by` = the browser's author name; an `open` note may also be
withdrawn straight to `resolved` by its author). Nothing but the page can set `resolved` — an
HTTP endpoint reachable on a forwarded port must not be able to mark the session's own work
done, and only the author who raised a note is positioned to judge that a re-look actually
answered it.

**Questions.** A question is a note whose text is a ledger claim: it exists only because a
`product` row in § Provenance Ledger was written `inferred` or `invented`, and only the session
can create one — `ledger add … --screen <label>` pins the assumption row and its question note
in one call as the row is written, and `ledger ask --id <rowId> --screen <label>` pins an
existing open row after the fact — both pin to a screen and refuse `--state`: a question never sits on
an empty/loading/error state, because a gray state is craft, not a client decision (ADR-0013). Neither
the client nor whoever signs off can author a question; a human free-form message is a note (optionally carrying `reason`), never a
question. A question is answered only on the served page — `Yes, that's right` or `No, it's…`
plus a one-line correction — never in chat and never through `notes resolve`; the answer writes the ledger
row's status (`confirmed` for yes, `overridden` for no, both dated today) before it resolves
the note, so the ledger is true the moment the human clicks and the note write is placement
catching up. An unanswered question gates `journey-approved` (and `approved`) exactly as an
unresolved note does, named on its own line first. Catch provenance — whether a fixed
misunderstanding traces back to a pinned question, a free-form note, or neither — is derived
from a catch row's `addressed.ledgerRow` link, never attested, and printed by `ledger counts`
as `question · note · unlinked`.

**Project notes block first.** Any note with `scope: "project"` not yet `resolved` refuses
every mock-note mark (`journey-approved`, `approved`), naming the note id — a direction-level
concern outranks any per-screen work until it is answered. Once no project note is open, a
mark still refuses while any note on its own screens is unresolved; `approved` refuses while
any note anywhere is unresolved. Zero open notes on a journey is that journey's approval mark.

**Client review is the same page and the same notes, served on the client route as the
`CLIENT` state (ADR-0012).** A note's origin — walk, client or session — is set by the server
from the route it arrived on, never from the typed name. A client-origin note captures its
screen when raised; a fix is recorded only when the re-captured screen differs. Only the client
resolves a client note — withdrawing an `open` one records `resolution: "withdrawn"`, accepting
an `addressed` one records `resolution: "accepted"` — or `notes waive --id --reason` releases it
after seven days of client silence, a question's ledger row becoming `waived <date>`. The
`CLIENT` step's printed text carries the fixed approval line: `Approval means "this is the
product I understand" — the written brief, not these screens, holds scope`.

**Walk findings.** A note with `kind: "walk"` is the journey critic's own lane (§ Mocks: State
Machine, WALK) — one of the six flow breaks (`no-path-back`, `no-path-forward`,
`dead-end-state`, `missing-data`, `ambiguous-control`, `unrecoverable-error`), always
`scope: "mock"`, always cited to a screen and one of that screen's declared states, never both
absent. The session closes one the same way it closes any other note — `notes address --id <id>
--change "<what changed>"` — but closing is not resolving: only the served page's `Resolve`
button, clicked by the human who looked, actually resolves it; `journey-walked` (§ Mocks: State
Machine) refuses while one anchored to its journey's labels is still `open`, and the terminal
`approved` mark still refuses while one anywhere is unresolved, `addressed` included.

**Picks.** A pick stage of the flow — shapes, theme directions, per-surface variants — is
recorded as a look stop in `design/mocks/picks.json`, written only by
`spec/scripts/lib/mocks-picks.js` (`openStop`, `decideStop`, `consumeStop`, `pending`; the
`picks.json` pattern mirrors the ledger's one-writer rule, § Provenance Ledger). A stop is one
of two kinds: `pick`, choosing among candidate groups — a group is one flow, its screens in
candidate order — or `approve`, a single-flow yes/note-and-change. The served atlas renders
every open or decided stop **in place**, in the section its own screens already live in, never
on a separate page. A `pick` stop renders as a **compare table**: one row per step, one column
per candidate group, full cards, with an exclusive one-click `Pick this` button per column;
picking a group auto-rejects the rest, and the decision stays re-pickable (`Pick this instead`)
until the mocks driver consumes it, so a second look that changes the user's mind is never
stuck behind a session round-trip. An `approve` stop offers `Approve` or `Change` with a note.
Every served page declares which notes bar it shows through the `notes-scope` meta tag the
server stamps on it — `project` on the atlas index, `mock` on a screen — so the notes layer
renders **one scope per page**, declared by the page, rather than guessing from document
structure.

## Mocks: Authoring Rules

The six rules the dry run converged on (LEDGER standing rules + M11/M13/M14 + A6/A7) — the
half the driver cannot check, carried here as contract prose the authoring session applies:

- **Every edge is a real control.** The element whose click leads to the next screen carries
  `data-to="<label>"` naming a screen declared in a seed journey — one screen may carry several
  (a menu screen with three exits). `journey-drawn` refuses, after the per-label checks and before
  `check --states`, any seed edge with no `data-to` control and any `data-to` naming an
  undeclared screen (`lib/mock-seed-checks.js`'s `edgeGaps`, ADR-0013). `data-to` is an
  attribute, not a link — a wireframe never carries an `href` to another mock.
- **Screens carry the client's records.** After the edge check, `journey-drawn` compares every
  drawn screen's HTML against the seed's `## Records` values (`lib/mock-seed-checks.js`'s
  `recordValues` — every string value of length ≥ 3 in any record object, nested objects and
  arrays walked, numbers stringified, deduplicated — and `recordHits`, the values a screen's
  HTML contains): a screen with zero hits prints `⚠️ <label>: carries none of the client's
  records`, and a journey where every screen has zero hits refuses, `journey "<j>": no screen
  carries a value from design/mocks/records/*.json — draw with the client's own data, then
  re-mark` (ADR-0013). A settings screen legitimately shows none; a whole journey drawn on
  placeholders does not.
- **Name the shared parts before the screens.** Once a kit family (`design/kit/`) resolves,
  every content region of a labeled mock carries `data-kit="<key>"` naming the primitive it
  instantiates, or `data-bespoke="<key>: <difference>"` naming the primitive it is *not* and
  the one structural difference preventing reuse — a bare flag with no difference is a rubber
  stamp, not an escape. `design-atlas.js check` prints the running count, `ⓘ <label>: <n> kit,
  <m> bespoke`, on every run, and `journey-approved` refuses on any region carrying neither
  mark.
- **Wireframes are neutral but carry every graphic that IS structure.** The register is shadcn's
  Neutral component look on the eleven wire roles (ADR-0013) — filled primary buttons, cards with
  a soft shadow, real tables — and a theme is the same roles re-valued, swapped in at serve time
  for the client route; no screen is ever redrawn to be themed. A state is shown as the
  product's map or a slice, never described in a caption; text is reserved for what someone
  actually said (copy, labels), never for narrating what a picture should be doing instead.
- **Every wireframe carries its states.** Behind `data-state-btn="<name>"` switches, drawn as
  gray boxes, a wireframe shows its `empty`, `loading`, and `error` states alongside the happy
  path — happy path alone is a finding, not a wireframe. A screen the product truly has no such
  state for declares it on the labeled root, `data-no-state="<name>[,<name>]"`, naming the
  states it lacks; the opt-out is visible in the source, and the product reason it stands on
  lives as a row in the ledger (§ Provenance Ledger), never asserted silently. `design-atlas.js
  check --states` is the presence check — it judges only that the states exist, never what they
  say — run by the mocks driver at `journey-drawn` and `journey-approved`.
- **One honest wireframe or the full theme, never a half-styled middle.** A screen is either
  the neutral register on `wire/` or the themed register at production fidelity on
  `design/tokens.css` — a screen linking product tokens while its neighbors stay on the wire
  register is neither register and misleads a reviewer about what has actually been judged. `design-atlas.js check`
  (`spec-paths design-atlas`) makes this mechanical at the stamp that matters: a labeled mock
  still linking `wire/` once `design/tokens.css` exists above it is a violation at
  `data-status="ratified"`, a `⚠️` warn at `sketch` — `approved` wireframes from `/spec:mocks`
  sign-off are exempt by design, because the theme is picked after sign-off now, in
  `/spec:sketch`: an approved gray wireframe is the mocks stage's finished artifact, never a
  half-dressed screen (specs/20260907/07).
- **Mocks are authored under the `frontend-design` skill.** Every mock — shape, wireframe,
  theme direction, and every `/spec:sketch` draft or rework — is authored with the skill
  loaded (Skill tool) before the first edit; the pipeline never composes a screen or a token from
  the session's unaided taste. The mocks driver prints the skill line on every authoring step
  and as `skill-check`: a probe result, never a guess — installed (load it), not installed or
  disabled (one `⚠️` line naming the install/enable remedy, then continue), unverifiable (the
  reason, then continue). Never a stop.
- **AI-reworded text stays gray until confirmed.** Copy the model rewrote or invented reads as
  visibly provisional (the gray/unconfirmed treatment) until a human confirms it — a themed
  screen never launders invented copy into something that reads as final.
- **A persistent recording indicator on any capture surface.** Any screen whose product
  purpose includes recording (audio, video, screen) shows a persistent, undismissable
  indicator while active — never a state a wireframe or theme omits as an implementation
  detail.
- **Equal-weight verdict controls survive every theme.** Where a screen offers a binary or
  multi-way verdict (approve/reject, accept/decline), every theme direction keeps the options
  visually equal-weight — no direction may imply an outcome by making one option louder than
  its alternatives.
- **A new primitive names the nearest existing one and why it fails.** Before authoring a
  primitive not already in the component vocabulary, the authoring pass names the nearest
  existing entry and states specifically why it does not fit — silence is a gate failure, the
  same bar § Design Authoring Contracts sets for the built-code side.

## Product-Stage Exemption (question-style-gate.js)

While a mocks run is live (`design/mocks/status.json` exists with `state` other than
`APPROVED`) or a genesis run is live (`.claude/genesis/status.json` exists with `handoff`
null), the question-style gate's tier-2 judge cannot return `derive` — that verdict is treated
as `pass` instead. Every question inside those windows is a user decision by construction
(coverage keys, menu picks, product facts), so `derive` has no legitimate target there;
`rewrite` verdicts and every tier-1 check are unchanged. The judge's prompt states the rule
that makes this exemption necessary: a document that cites, discusses, or recommends a
subject is never the user deciding it, and a product fact (who, what, platform, payer,
tenancy, what a screen does) is never `"derive"` — ask it. The exemption reads both status
files on every hook invocation and fails open toward the pre-exemption behavior — a missing or
unparsable status file counts as absent, never as a reason to block.
