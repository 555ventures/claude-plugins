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

## Prototypes (specs/20260928/01, specs/20261007/01-approve-writes-a-behaviour-contract.md, specs/20261007/02-the-prototype-opens-from-words-a-brief-or-a-stem.md)

`/spec:prototype <idea in words | brief path | stem>` runs a functional prototype on
`proto/<stem>` in `.claude/worktrees/proto-<stem>` (the stem is the brief's stem, a slug of the
words printed as an auto-pick and renamable once with `--stem` before `opened`, or the re-opened
stem; the idea and the input kind are written into `status.json` at `opened`). A brief's `Lane:`
field is advisory; running this command is choosing the behaviour lane, and no gate runs on the
prototype tree. The host declares a `prototype` config block (`url`, `overlay`,
`e2eFile` carrying `{stem}`, `e2eList`, `e2eRun`, `picture`, optional `dbCreate`/`dbDestroy`).
Rounds, pins and declared states live under `design/prototypes/<stem>/` on main. A pin is one
record with an optional anchor whose id is the keyed owner chain plus an ordinal
(`Row[w_01]<List<Screen#0`); the source location rides along as metadata only. The pin endpoint
runs only during a round.

On approve the driver writes the behaviour contract: one picture per route × state through the
host's own `picture` command (the driver checks only that each output is a PNG), then
`contract.json` with every pin as a record. The session then writes one test per behaviour pin in
the prototype worktree and commits it on `proto/<stem>`; the tests must be listed by `e2eList`
and green under `e2eRun` against the prototype. The driver then copies the test file into
`design/prototypes/<stem>/tests/`, appends one `stage: prototype` ledger row and queues the
`/spec:plan <contract>` paste at the top. No gate runs on the prototype tree, nothing is
exported, and no spec is generated. The worktree and branch stay until `--mark closed`, run by
the review driver when the last citing spec closes, or by hand to abandon the idea.
`/git:merge` refuses `proto/*` and names the contract.

`prototype.url` may carry `{port}`. The prototype driver then keeps one app port per prototype
(`appPort` in `status.json`) and the build driver one capture port per build
(`<spec>.build/capture-port.json`); each prints `PORT=<n> <bootCommand>` in its step and probes
and captures at the resolved address. The frozen contract's urls stay relative, so a baseline
never records a port. A saved sign-in follows the app across ports: cookies need nothing, and a
single saved browser-storage origin on the same host is re-pointed to the capture address at
load time. `/spec:doctor`'s fixed-ports check flags a loopback address with a literal port in
either `runtime.readyCheck` or `prototype.url`. (specs/20261005/03-one-port-per-launch.md)

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
approvals land under `design/rounds/<n>/`; the client reads the token from the project's
git-ignored settings file when connect stored it there, else from the named environment variable,
and never writes or prints it.

A project is connected with `/spec:connect` (`spec-paths walkthrough-connect`,
specs/20261005/01): run in the project with no arguments, it derives the project id from the
folder name, creates the project on the service with the public terminal tool `walkthrough-cli`
(`npx walkthrough-cli new`, or joins the id when the service already holds it, then mints a token
with `npx walkthrough-cli token`), so anyone signed in with the tool can connect, stores the token as `env.WALKTHROUGH_TOKEN` in the git-ignored
`.claude/settings.local.json`, proves the link with a call that needs the token, and only then
writes the `walkthrough` block. It is the one writer of that block and of the stored token;
the client still never edits the config and never writes or prints the token. The client
reads the stored token first and the environment variable second, so the session that ran
connect can send screens at once. A second run changes nothing; a block that points elsewhere
is never rewritten. Before creating it asks `walkthrough-cli whoami`: not signed in is refused
with `npx walkthrough-cli login` named, and a person not on the project's team is refused with the
team invite named. The tool never sees the plugin token: connect drops `WALKTHROUGH_TOKEN` and the
block's `tokenEnv` from its environment, since the tool reads `WALKTHROUGH_TOKEN` as a sign-in.
There is one hosted environment, production.

Connect can run first (specs/20261005/02). In a project with no config it creates
`.claude/spec.config.json` holding only the `walkthrough` block, and only after the link is
proved; a config file that is present but not a JSON object is refused and never overwritten.
Connect protects the token file itself (specs/20261005/04): when git does not ignore
`.claude/settings.local.json` it appends that line to the project's `.gitignore`, creating the
file when needed, in a git repository and in a plain folder alike, and never runs `git init`.
It refuses only when git already tracks the file, naming `git rm --cached` as the way out.
In an empty folder that nothing
has grounded yet, connect prints `next: /spec:genesis` under its line; otherwise the next step
is `/spec:mocks`. `init-gen.js generate` carries the block from disk on every run, with and
without `--refresh`, treats a config that holds only the block as not yet generated, and still
refuses any other hand-edit without `--refresh`. The state gate prints its grounding-drift
warning only for a config that carries a `generatedBy` stamp.

A project can send pictures of its real screens (specs/20261005/06). Its config's `pictures`
block names the command that makes them, the folder they land in and the widths; the plugin
names no tool for it. `spec-paths pictures` derives the wanted list from the seed's stories (one
picture per screen, state and width, named `<screen>[--<state>]--<width>.png`), cleans the
folder of pictures, runs the project's command with `SPEC_PICTURES_DIR` and
`SPEC_PICTURES_WANTED`, refuses a missing, empty, non-PNG or stray picture by name, writes the
round file with the seed's journeys, and sends it through `walkthrough.js` as a child process. A
round is always every story of the project. The worklist of `mocks-driver.js round pull` names
the spot of a note left on a picture.
