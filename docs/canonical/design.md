# Design — canonical decisions

## Design Canon: one artifact (specs/20260914/01, specs/20260914/02)

There is no second artifact: the mock app `/spec:mocks` authors and approves **is** the
product's frontend, never a catalog a build stage renders against separately.

**Three import layers, one direction.** A screen (`src/screens/<label>.tsx`, under
`design.app`) composes from exactly three layers and nothing else: `@/components/ui` (the
shadcn primitives), `@/components` + `@/shells` (project components and shells built on top of
them), and `@/records` (`src/records` under `design.app` — typed data, the only source a screen
may read; never a hand-typed literal standing in for what a record should supply). An import
outside these is a `layer`-kind error finding (`mock-review check`).

**Screens carry `meta` and named states.** A screen's `meta` export names its states; each
state renders exactly what the seed or the journey's step demands — states are the AC matrix, no
unbound branch, no paraphrase. A project component or shell carries one `/** … */` doc line
above its export and a named `examples` export; a screen missing either is a `doc`-kind error
finding, and a component with neither is invisible to `mock-review sweep`'s own worklist.

**Records are the only data.** `src/records` under `design.app` holds the typed fixtures every
screen state reads from; nothing else on a screen stands in for what a record should supply.

**`design/approval.json` is the canon.** `approval.screens[<label>]` carries `approvedAt` and a
`hash`, written only by `mock-review approve --screen <name>` on the user's literal `approve` —
never by a control on the served page, and never by a script in this repo.

**Look stops are never questions.** Every look this doctrine governs prints
`🎨 ready for review — <check.serve.url>/#/<screen>`, one line per surface, then the fixed reply
line, then ends the turn; only the literal `approve` accepts. The reviewer page (the mock app's
own served UI) is the one viewer; a session never screenshots a screen to judge it in this
doctrine's place.

## The mock stage's actors and chain (specs/20260917/01)

On the served page there are only two actors: the **client** and the AI session. The person
running `/spec:mocks` works from files and the CLI; the one page surface they still reach is the
owner-only one — the conversation closers and the Components page — as the loopback human at the
machine running `serve`. Screen approve and theme pick are not page controls at all. The chain is
`SEED → SHELL → SCREENS → THEME → APPROVED`. A seed journey is a numbered list of the client's
own sentences (`N. "sentence" -> screen[@state]`), copied verbatim into the app; a journey is
approved by the client's confirm against the hash of those exact sentences, so editing a beat
voids the confirmation and reopens the journey. Note statuses are `open`, `answered`,
`approved` and `deferred`; every deferred item becomes a ledger exclusion row at `--mark
approved` and surfaces in genesis's parking lot.

**Contract 3: the package is the only writer.** The host↔`mock-review` handshake is
`contractVersion: 3`, compared on every driver entry and refused on any difference. It retires
`design/decisions.json` and `approval.theme` — the theme a host renders is the one its
`mock.config.ts` declares. `client waive` calls the package's `waive` verb rather than writing
`design/approval.json` itself, so no script in this repo writes a design document and every write
goes through the package's cross-process lock.

## Genesis and the mock app (specs/20260914/02)

The mock app pre-empts genesis's tournament and scaffold race. When `<status.app>/mock.config.ts`
exists at `MENUS`, `framework`, `language`, and `packageManager` are already fixed by the app the
user approved in `/spec:mocks` — each auto-picked (`vite-react` / `typescript` / `npm`) and
recorded decided, printed once per run while its dimension stays open; every other dimension
(`testRunner`, …) stays open and priced the ordinary way. The tournament is recorded
`tournament: { skipped: "mock-app" }` at `MENUS` itself, never reaching `FINALISTS`, `RACE`,
`PROBE`, or `PICK`; `DECIDE` proceeds straight on the derived dimensions. A host with no
`<status.app>/mock.config.ts` runs the tournament exactly as before — no behavior change on
brownfield hosts, which never reach genesis anyway.

The mock app is the day-zero skeleton: `SCAFFOLD` runs no `scaffoldCommand` against it, recording
`status.scaffold = { skipped: "mock-app" }`. `--mark skeleton-landed` then refuses unless
`mock-review check --json` reports `ok: true` and the zero-day gate is green — the precondition
that replaces every shell-extraction and component-manifest check that used to run here.

BRIEF's derivation sources are `design/approval.json` (the seed journey count, from its
`journeys` keys) and `design/notes.json` (the open-note count, `status === "open"` across notes
and journey conversations alike) — read directly through `fs` + JSON, never a notes module —
printed as `seed journeys: N · notes open: N`.

## The design contract is code (specs/20260926/02)

A host with a UI stack carries a `design` block of three repo-relative paths — `kit` (a
directory of intent-named composite components), `tokens` (one token file), and `rules` (one
auto-loaded rule file) — plus an optional `app` for the mock app. All three paths are required
once the block exists; a block missing one reports that path as missing, naming the key to add.

The rules file holds two tables. `## Intent to pattern` maps each intent to a pattern and the
composite that implements it (`Intent | Pattern | Composite`). `## Naming` has one subsection per
layer — `### code`, `### schema`, `### routes`, `### wire` — each a `Kind | Convention | Example`
table. A composite is present when a file under the kit directory is named after it (PascalCase
or kebab-case, extension stripped) or exports it by name; a pattern row without its composite is
a finding. `design-contract-check.js` checks presence only and never judges whether a rule is
right.

The rules those tables imply are enforced under the `kit-discipline` category, not by prose:
raw colours, arbitrary values, restyles of kit components, primitive imports from outside the
kit, and a declared state with no story. `/spec:enforce` gives each stack whose host has a
`design` block one `kit-discipline` cell, and the genesis design enum folds `color | typography |
density` into it.
