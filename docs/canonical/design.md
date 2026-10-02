# Design — canonical decisions

## The wireframe (specs/20261002/01)

The wireframe is a picture, not the product: gray screens drawn by the walkthrough service from
one json-render file per screen and state under `design/mocks/screens/`, named as the seed's
beats name them and checked offline against the catalog before anything is sent. There is no
mock app and no screen-approval record. The chain is `SEED → SCREENS → APPROVED`. A seed
journey is a numbered list of the client's own sentences; a journey is approved by the client's
confirm on the service against the hash of those sentences, so editing a beat voids the
confirmation and reopens the journey. A project with no `walkthrough` config block draws
nothing and confirms each story in the terminal; with the block, a journey may also be waived
with a written reason. Rounds, notes and confirmations land under `design/rounds/<n>/`; a round
is always a full snapshot. The stage finishes when every story is confirmed and no note waits
for an answer — an answered note does not block — and the last round is then closed. A look
prints the service's project page and ends the turn.

## Genesis and the wireframe (specs/20261002/01)

Genesis always picks the stack and scaffolds the real app; the wireframe never pre-empts either.
BRIEF prints `seed journeys: N · notes open: N` from the seed's journey count and the latest
round's waiting notes. The design brief's step lists `design/mocks/screens/` among its reads when
it exists.

## The design contract is code (specs/20260926/02)

A host with a UI stack carries a `design` block of three repo-relative paths — `kit` (a
directory of intent-named composite components), `tokens` (one token file), and `rules` (one
auto-loaded rule file) — plus an `app` that is optional — carried only by a host approved under the retired mock-app flow. All three paths are required
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
