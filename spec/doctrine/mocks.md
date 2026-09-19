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
- `step` — `^[A-Z][A-Z-]*$` (`SEED`, `SHAPES`, `KIT`, `WIREFRAMES`, `CLIENT`, `SKETCH`,
  `GENESIS`, …); rows written under retired step names (`SKIN`, `REVIEW`, `THEME`, `SIGNOFF`)
  still match the pattern and keep parsing.
- `kind` — one fixed word: `product`, `process`, or `exclusion`.
- `claim` — free text; the assumption itself.
- `tag` — one fixed word: `said-by-user`, `ratified-doc`, `inferred`, or `invented`.
- `status` — one fixed word `open | confirmed | overridden | decided`, with an optional
  trailing ISO date (`confirmed YYYY-MM-DD`); `decided` is process-only — a `decided`
  `product` row does not parse.
- `rejected`, `dependents`, `note` — free text; `-` means empty.

An `exclusion` row is written by `--mark approved` from each deferred note (`note` =
`deferred: <id>`); a hand-typed row passes through `ledger add`. Its `tag` is always `said-by-user`; its `note` grammar is fixed —
`deferred: <id>` | `non-goal: <brief line>` | `answer: <noteId>` | `withdrawn: <noteId>` — naming
the deferred note or journey, discovery non-goal, invented-row answer, or withdrawn client note
it derives from. It never blocks the
gate and counts separately in the counts line's ` · <E> exclusions` tail.

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

**Counts line.** Every mark prints one fixed line:

```
📒 ledger: {S} said-by-user · {R} ratified-doc · {I} inferred ({Io} open) · {V} invented ({Vo} open) · {P} process · {C} catches · {E} exclusions
```

counting product rows per tag, every process row in one bucket, misunderstanding rows as
catches, and exclusion rows last. The shape is fixed so a reader learns it once — change it
only under the spec that owns it.

## Mocks: State Machine

`mocks-driver.js` derives the current state on every invocation from
`design/mocks/status.json` (schemaVersion 2) plus the artifacts on disk — a recorded mark is
never trusted alone; if its governing artifact no longer supports it (a journey removed from
the seed, `check --json` reporting a finding the mark should have caught) the derivation lands
earlier and demands the mark again. The order is fixed:

**SEED → SHELL → SCREENS → THEME → APPROVED**

SEED authors `design/mocks/seed.md`, runs the printed scaffold, lands the template files, and
writes every declared `## Records` entity as a typed source file. SHELL closes once `check
--json` reports `ok: true` and at least one shell with a non-empty `examples` export — there is
no separate human stop; the first journey's approval is the shell's. SCREENS closes once every
journey the seed declares is drawn and approved, in seed order — the client walks the served app
during SCREENS, journey by journey, so there is no separate state whose only step is "walk the
client role". THEME closes once the user authors color candidates and one `mock.config.ts` line
adopts one; its own close block then waits on every journey's client verdict and records
`approved`. APPROVED is terminal. A `status.json` carrying `schemaVersion: 1` refuses (exit 2,
`remedy: rm design/mocks/status.json` — ADR-0028) rather than being silently reinterpreted; no
host holds data on the old shape.

**Marks.** `seed-done` records once every declared records file exists and `mock.config.ts` is
present (§ Mocks: Seed), refusing (exit 2) a `malformed` beat line or a journey with zero beats,
naming the journey, the first offending line, and `remedy: rewrite the block as numbered
"sentence" -> screen[@state] lines (§ Mocks: Seed)`. `shell-drawn` records once `check --json`
reports no `error`-severity finding and at least one shell entry with a non-empty `examples`
list; a warn-only finding never refuses. `journey-drawn --journey <j>` records once `check
--json` lists `<j>` with `resolved: true` and its `steps` equal the seed's own beats — same
length, and at every index the same `beat`, `screen` and `state` (an absent state on either side
equals `null`) — refusing on an unknown id, an out-of-seed id, an unresolved edge (named `step
<from> → <to>: <reason>`), or the first differing beat (`beat <n>: seed "<sentence>" ->
<screen>[@<state>], journeys.ts "<sentence>" -> <screen>[@<state>] — remedy: copy the seed's
beats verbatim into src/journeys.ts`) — no ledger gate runs here, drawing is how an assumption
gets pinned, not resolved. `journey-approved --journey <j>` records once: `<j>` is declared in
the seed; `check --json` lists it `resolved: true`; its steps still equal the seed's beats;
`notes.journeys[<j>].status` is not `open`; and `approval.journeys[<j>].client` is `ok` or
`waived` with `approval.journeys[<j>].beats` equal to `beatHash` of the seed's current beats for
`<j>` (§ Mocks: Client Player) — a missing verdict names `remedy: client open (send the link; the
client confirms the journey) or client waive --journey <j> --reason <r>`, a stale hash names both
hashes — then runs the ledger's `gateVerdict` (§ Provenance Ledger) before recording
`status.journeys[<j>].beats = <hash>`. A journey whose stored hash no longer matches the seed's
current beats is derived as not approved, landing back on SCREENS ("approve journey `<j>`") —
editing the seed is how a journey's own conversation note gets answered, since the edit changes
the hash and reopens the confirmation mechanically. `theme-picked` records once `check
--json`'s `config.theme` is a non-empty string listed under `themes`; a null theme names
`remedy: set theme: "<k>" in mock.config.ts, naming an authored src/themes/<k>.css`. `approved`
refuses any note in `notes.notes` whose status is `open` or `answered` (`remedy: the client
approves or defers it on the link`) and any `project: true` note whose status is neither
`approved` nor `deferred`; the per-journey client-verdict refusal stays. Before recording, every
note and journey conversation with status `deferred` and no ledger row yet gets one exclusion row
(§ Provenance Ledger) appended; a row whose `note` already names that id is never written twice.
It then records once every journey's `approval.journeys[j].client` is `ok` or `waived`, running
`gateVerdict` first. Process rows never surface as something to resolve; they are counted, not
asked.

**Reopening never deletes.** `--reopen journey:<j>` clears that journey's own `approved` mark
and the terminal `approved`; `--reopen shell` clears `shellDrawn`, `themePicked`, `approved`,
and every journey's own `approved` — every screen renders inside the shell, so its reopening
cascades; `--reopen theme` clears `themePicked` and `approved`. Every reopen appends
`{at, target, cleared: [...]}` to `status.reopens` and leaves every other file on disk
byte-identical — the next derivation lands on the earliest state whose marks are now missing.
`--reopen shapes` and `--reopen kit` are refused, naming the retirement (ADR-0028) — the two
states behind them no longer exist.

## Mocks: Seed

SEED is the one state where the host app doesn't exist yet. `design/mocks/seed.md` (template
`spec/templates/mocks-seed.md`) names the product in three sentences, one `## Records` entity
per kind of data the product handles, and one `### <journey-kebab>` block per journey — a
persona line followed by numbered **beats**, one per line: `N. "client sentence" ->
screen[@state]`. Quotes are mandatory, `N` runs contiguously from 1, `screen` and `state` match
`^[\w][\w-]*$`, and `@state` is optional; alternates ("if X then Y") are separate journey
blocks, and the same sentence or the same screen may appear in any number of journeys. Journeys
exist before the first screen because no roadmap exists yet to derive them from;
`lib/surfaces.js`'s `parseSeedJourneys` returns `beats` in seed order — the order SCREENS draws
them in — plus `malformed` (every non-blank body line after the persona that is not a beat, and
one `numbering: expected <k>, got <n>` entry per gap) and, derived from the beats, `labels`
(screen targets deduplicated in beat order) and `edges` (every consecutive beat pair whose
screens differ). `beatHash(beats)` is the one hash of a journey's story — the first 12 hex of
sha256 over its canonical `<beat> -> <screen>[@<state>]` lines — shared by the driver and the
client page (§ Mocks: Client Player).

The SEED step block prints, in order: `Read only: design/mocks/seed.md`; the scaffold command
verbatim — `npx shadcn@4.21.0 init -t vite -b radix -p nova -n app -y -s` (the scaffold creates
`app/`, so `status.app` is the literal `"app"`, written once on the cold-root create; every
later host-app path — `mock.config.ts`, `src/`, `design/*.json` — resolves through
`path.join(root, status.app)`, while `design/mocks/` itself stays at the root); then `cd app &&
npm i -D @555-ventures/mock-review`; then one `cp "$(spec-paths templates)"/mock/<file> app/<dest>` line
per template file (`mock.config.ts`, `src/journeys.ts`, and the two examples under
`design/examples/`, outside every contract host glob so the reviewer never lists them as a real
screen or records file).

Records are typed source, not seeded JSON: each `## Records` entity in the seed maps to
`app/src/records/<entity>.ts`, a file the session writes by hand from the seed's own Product
sentence and any references under `design/mocks/references/` — inventing the awkward cases (the
customer with no surname) a client would have supplied, since this is a mock and nobody is
asked for data. `--mark seed-done` refuses a `seed.md` with no `## Records` section, any
declared entity missing its `src/records/<entity>.ts` file (naming the exact missing path and
`remedy: write <path>`), a missing `app/mock.config.ts`, or a `contractOrDie` refusal — never
anything about the file's contents, and never a question back to the user.

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

The mock is a real running app, not a static file — nothing about it can be judged from source
alone. `npx mock-review serve` (D2's contract verb) is started once, as a **tracked background
task** (specs/20260905/04 D4), the moment SEED lands `app/`; it stays up through SHELL, SCREENS
and THEME, kept running until `approved` — no script starts, stops, or probes it beyond THEME's
close block's own `client open`/`client waive` lines.

**The look is the human's, on the served app.** The session never screenshots a screen to judge
it — `mock-review check --json`'s structural read (screens, shells, journeys, themes, findings)
is the only signal a driver mark reads. Claude captures a screenshot in exactly two cases:
`mock-review check --look <screen> [--state <s>]` at `--mark journey-drawn`, to confirm a state
renders before recording the mark, and again whenever raising a layout note on the served page
— never as a substitute for the human's own look at the running app.

## Mocks: Page Notes

Feedback lives on the served reviewer page, never in chat and never in mock source. A note's
`status` is one of four colors: `open` (red — the session's turn), `answered` (yellow — the
session has spoken, the author's turn to look again), `approved` (blue — done), or `deferred`
(a valid point, not now — it blocks nothing and is never lost, since `--mark approved` turns
every newly deferred item into a ledger exclusion row, § Provenance Ledger). The session
answers red items with `npx mock-review answer (--note <id> | --journey <id>) --text <t>`, which
flips the item to `answered`; only the served page's own owner-only controls — approve, defer,
reject, delete — end a note or a journey conversation (§ Mocks: Client Player), never an HTTP
call the driver makes and never a hand-edit of `design/notes.json`. A journey's own conversation is
**workflow**: order, a missing or wrong step — answered by editing the seed's beats, which
changes the beat hash and reopens the journey (§ Mocks: State Machine), never by a driver-side
status write. A screen's own notes are **design and fields**: they never touch the seed.

**The sweep is the session's worklist, never the driver's.** `npx mock-review sweep` lists only
`open` (red) items, grouped by file, journey requests first, then component/screen notes — the
driver never reads it, only `check --json`, `notes.json` and `approval.json`, so a change to the
sweep's wording can never break a mark. The authoring loop inside SCREENS is: run `sweep`,
answer every item top to bottom, run `check`, re-sweep until it prints one line, then mark.

**Project notes outrank a single screen's.** A note with `project: true` blocks
`journey-approved` and `approved` alike while it is `open`, named ahead of any per-screen note
(ADR-0019) — a direction-level concern is never settled by clearing one journey's own notes. A
journey's own conversation thread (`notes.journeys[<j>].status`) blocks its own
`journey-approved` the same way a note does; `approved` refuses while any note anywhere,
project-scoped or not, is still `open`.

## Mocks: Client Player

The served page has two remote actors — the client and the AI session (as the reviewer role) —
plus one role that never leaves the machine: the loopback human at the terminal running `npx
mock-review serve` (ADR-0029), who alone reaches the page's owner-only surface: the conversation
closers (approve, defer, reject, delete on a note or a journey conversation) and the Components
page. Screen approve, journey approve and theme pick are retired from every actor's page controls
— per-screen approval is now `mock-review approve --screen <name>`, run by the session on the
user's literal `approve` reply (§ Design Canon), and the theme is set once by editing
`mock.config.ts` directly, never on the page. The client walks the same served app, never a
separate build. `mock-review serve`'s URL plus `?client=<config.client.token>` (`client open`,
requires at least one `status.journeys[*].drawn`, else `remedy: --mark journey-drawn --journey
<j>`) opens the client role: every drawn journey and every screen, the same controls a real user
has, a note box on each screen, and nothing else — no delete, no reject. A client-raised note is
the same `notes.json` row the session's own review writes, distinguished only by who raised it;
the loopback human ends notes — approve or defer them — from the owner-only surface, never the
client and never this driver.

**The confirm control is the one human gate in the whole mock stage.** SUCCESS: `Confirmed —
story <hash>` printed on the journey once the client's confirm writes
`approval.journeys[j] = {client: "ok", beats: <beatHash of the beats they read>, at}`. PATH BACK:
a workflow note on the journey — the session edits the seed's beats, the hash changes, the
confirmation is void, and the journey reopens (§ Mocks: State Machine) with no human re-typing
anything. ARTIFACT: `design/approval.json`, the farthest thing the click reaches. `client waive
--journey <j> --reason <r>` is the session's own escape hatch for an absent client: the driver
invokes `mock-review waive --journey <j> --reason <r> --beats <beatHash of the seed's current
beats>`, and the package writes `{client: "waived", reason, at, beats}` under its own lock — this
driver itself never writes `design/approval.json`; every write to it goes through the served
page's owner-only controls or the `waive` verb. `client log` is retired (ADR-0028) — the served
page is now the client's whole record.

## Mocks: Authoring Rules

Four rules the authoring session applies, carried here as contract prose the driver cannot
check by itself (the checkable half lives in `mock-review check`'s own findings):

- **A screen imports only from `react`, `@/components/ui`, `@/components`, `@/shells` and
  `@/records`.** Any other import is a `layer`-kind error finding — the shell and the components
  it composes are the only shared surface a screen may reach into.
- **Every project component and shell carries one `/** … */` doc line above its export and a
  named `examples` export.** A missing doc line or `examples` export is a `doc`-kind error
  finding; `mock-review sweep`'s inventory is built from these doc lines, so a component with
  neither is invisible to the session's own worklist.
- **Screens take their data from `src/records`, never literals.** A screen composes its content
  from the typed arrays under `src/records/`, the same files SEED demanded — never a hand-typed
  string standing in for what a record should supply.
- **Read the shadcn component's official example source before composing.** The two seeded
  files under `design/examples/` — `screen.example.tsx` and `records.example.ts` — are starting
  shapes to copy from, never to edit in place; they sit outside every contract host glob so the
  reviewer never mistakes them for a real screen or records file.

`mock-review check` also warns, never refuses, past two structural thresholds: `size` on a
screen past 150 lines, and `twin` on a component whose shadcn imports match another's closely
enough to suggest one should be reused instead of two nearly-identical ones.

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
