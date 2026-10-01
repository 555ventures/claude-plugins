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

## Genesis and the mock app (specs/20260914/02, specs/20260926/04)

The mock app is a gray wireframe, never the product (specs/20260926/04 D9, ADR-0030 (j)).
Genesis always picks the stack and scaffolds the real app: `MENUS` auto-picks nothing and records
no skipped tournament on the mock app's account, a tournament archetype reaches `FINALISTS` like
any other, `SCAFFOLD` runs the winner's `scaffoldCommand`, and `--mark skeleton-landed` runs the
probe, binding-subset and zero-day gate checks only — it never spawns `mock-review`. (From
specs/20260914/02 until this spec, the mock app pre-empted the tournament and the scaffold and
gated the skeleton on its own review check.)

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

Genesis's design stage authors the intent-to-pattern and naming tables at `DESIGN_BRIEF`, before
any `design` block exists; `design-contract-check` therefore accepts `--rules --kit --tokens`
overrides (all three together, else exit 2) that bypass the config and run the same findings
over the named paths. At that mark only `table-missing`, `table-empty` and
`naming-section-missing` refuse; `kit-missing`, `tokens-missing` and `composite-missing` are
tolerated until the kit lands. (specs/20260926/04-the-design-brief.md D7)

Composites' state stories are the living showcase, gated by `kit-discipline`; journey stories
are a genesis artifact that walks the seed's beats against the real kit and router.
(specs/20260926/05-the-kit-and-the-journey-stories.md D10)

JJ approves the designed set in Storybook; there is no client gate. Journey stories are frozen at
approval and never gated later. (specs/20260926/06-the-approval-stop-and-the-roadmap.md D7)

## Prototypes (specs/20260928/01, specs/20260928/02, specs/20261001/01)

`/spec:prototype <brief>` runs a functional prototype on `proto/<stem>` in
`.claude/worktrees/proto-<stem>`. The host declares a `prototype` config block (`url`,
`overlay`, `e2eFile`, `e2eList`, `export`, optional `dbCreate`/`dbDestroy`/`gate`/`storageState`).
`storageState` is one saved Playwright sign-in that every capture loads — at the freeze and at the
build's capture gate; a missing, unreadable or stale one is a refusal naming the file, and
`/spec:doctor` flags it when git tracks it. Rounds, pins
and declared states live under `design/prototypes/<stem>/` on main; nothing on `proto/*` is read
after close. A pin is one record with an optional anchor whose id is the keyed owner chain plus an
ordinal (`Row[w_01]<List<Screen#0`); the source location rides along as metadata only. The pin
endpoint runs only during a round. A brief whose header says `Lane: behaviour` goes to this
command instead of `/spec:plan`.

Freeze, on approve: the kit gates run green on the prototype tree → one capture per route × state
keyed by kit-composite instance → `contract.json` → the session writes one derived e2e test per
behaviour pin on main, and the host runner must list every reserved AC id → `harden/<stem>` is
created from `git diff base...proto -- <export globs>` → the generated behaviour-lane spec,
whose tier is derived: every generated File Plan path is matched against the paths the host's
pipeline rules § Risk Tiers spells as code; a match stops the mark until the user confirms the
lock (`--tier critical`) or rules it not a risk change (`--tier standard`), and the spec's
Rationale opens with the basis →
`dbDestroy`, then the worktree and branch are deleted → one `stage: prototype` ledger row. The
brief carries a `## Data/API sub-plan` block. `proto-capture.js --diff` is the one comparison.

## The walkthrough client (specs/20260929/01)

A project opts into the hosted review service with a `walkthrough` config block (`baseUrl`,
`project`, `tokenEnv`); a project without it sends nothing and exits 0. `spec-paths walkthrough`
is the one script that talks to the service, with the verbs `self-check`, `validate`, `check`,
`hello`, `push`, `pull-notes`, `pull-approvals`, `reply` and `mark`, and the exit codes 0 done or
not configured, 1 refused, 2 usage or config, 3 no answer. The contract is `spec-paths
walkthrough-contract` (seven calls, one error shape, limits, the version rule) and the wireframe
vocabulary is `spec-paths walkthrough-catalog` (19 gray components, one action); both are plain
JSON in a fixed subset of JSON Schema, read by `lib/json-shape.js`. The plugin owns the round
number; every round, wireframe or picture, passes the offline round check before anything is
sent; every answer is checked against the contract before it is written; rounds, notes and
approvals land under `design/rounds/<n>/`; the token is read from the named environment variable
and never written or printed.
