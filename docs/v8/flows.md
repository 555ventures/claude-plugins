# Old-plugin user-visible flows: genesis, mocks, prototype

Source: `/home/jj/projects/claude-plugins/spec` (main). All three commands are "driver-stepped": the
session runs `node {driver} --root .`, the driver derives state from a status.json plus disk, prints one
`## Step:` with a `Read only:` list, the session does it, then runs the printed `--mark ...`. Every accepted
mark ends with `✅ checkpoint — <cmd> state saved (<prev> → <next>); safe to /clear and re-run`. State is
re-derived from artifacts every run (a mark whose artifact vanished is demanded again). Sizes: genesis-driver
2679 LOC, mocks-driver 584, prototype-driver 1082, plus doctrine/genesis.md 405, mocks.md 142, design.md 67.

---------------------------------------------------------------------------------------------------

## 1. /spec:genesis

### 1.1 Start
`/spec:genesis <idea: what to build, for whom>`. Greenfield only: if real source exists the command stops and
says run `/spec:init`. Intended model Opus. Setup reads `spec-paths shared-for genesis`, locates driver and
`wf-research.js`.

### 1.2 States in order (user's chair)

**DISCOVERY** (interview). Driver prints the brief template (first time) or the current `## Coverage`, plus
the 15 keys in 4 rounds with current value and a blank `guess:`:
- Round 1: payer, tenancy, data-sensitivity, residency
- Round 2: ai-use, unattended, integrations, scale-outage
- Round 3: vendor-budget, offline-mobile, jobs, notifications
- Round 4: retention, admin, success-metric
Session derives a guess per key from the idea, then asks ONE `AskUserQuestion` per round (up to 4 questions,
each names its key in parens: "Who pays for the product (payer) — …?"), options
`confirm: <guess> (Recommended)` / `correct it` / `not applicable` (+ free-text "Other"). Answers go to
`.claude/genesis/brief.md` `## Coverage` as `- <key>: covered|dark|n/a — <user's words>`; success-metric is
`- success-metric: <label>` under `## Picks`; `integrations` and `pricing` Non-UI lines are copied, not asked.
Non-goals are appended whenever the user rules something out (In / Later / Won't-this-time). Discovery is
product/user/business/legal only; never team/ops-staffing questions. Session also prints
`📌 Auto-picked archetype <key> — reason (veto anytime)` and writes `- archetype: <key>` (one of web-app,
mobile-app, conversational-bot, backend-api, realtime-trading, cli-devtool, data-ml, desktop-app). Before
marking it prints `## What I think you're building` and `## Coverage` in full once. Mark: `--mark discovery-done`
(refuses unparsed/missing/dark keys or missing archetype).

Brief example (`.claude/genesis/brief.md`, six `##` sections: What I think you're building, Coverage,
Non-goals, Open Dimensions, Research Angles, Picks; plus Non-UI Coverage):
```
## Coverage
- payer: covered — clinics pay per seat
- residency: covered — EU only
## Open Dimensions
- persistence: open
- auth: constrained — must use Okta
## Picks
- archetype: web-app
- success-metric: weekly active clinics
```

**BRIEF.** Archetypes backend-api, data-ml, conversational-bot, cli-devtool owe nothing: `--mark brief-written`
(records design: skipped). Visual archetypes (web-app, mobile-app, realtime-trading, desktop-app) are bounced:
"run /spec:mocks until APPROVED, then --mark brief-written". Otherwise prints
`seed journeys: N · notes open: N` and ratifies. Writes: status only.

**MENUS** (research). Open dimensions = archetype floor (language-runtime, framework, persistence, auth,
component-library, hosting, monorepo-topology as applicable) plus derived ones from coverage (tenancy-model,
data-residency, llm-provider/vector-store/eval-harness, data-in-training, background-jobs, observability,
api-versioning). Session invokes the `wf-research` workflow (by script path, never read) with
`{stage, dimensionKeys, briefPath, contextPaths}` (paths/keys only, no prose). It runs one Sonnet
(`model:'sonnet', effort:'medium'`, general-purpose) web-research agent per dimension in parallel. Each returns
a menu: `dimension`, `why_recommended`, `version_bearing`, `watch_outs[]`, and 2-4 `options[]` each with
`label, tradeoff, recency, rank (1=recommended), sources[], is_minority, because` (coverage keys that drove
rank), `priced` (consequence at brief scale or "n/a — no number in the brief"), `packages[{registry:npm|pypi|crates|endoflife,name,version}]`.
Session writes each to `.claude/genesis/interview-research/<dim>.json`; `--mark menu-written --file <f>` runs
`registry-check.js` (resolves packages against registries, drops stale options into `droppedForCurrency`).
Classification: auto-pick when exactly one rank-1, not minority, priced begins "n/a" → prints
`📌 Auto-picked <dim>: <label> — <why> (veto anytime)` and session writes `- <dim>: <label>` under `## Picks`.
Everything else (tie, minority leader, priced leader — paid is always asked) is asked, batched 4 per
`AskUserQuestion`, options recommended-first, description `tradeoff · because · priced · current as of <date>`,
rank 1 labelled "(Recommended)". Mark: `--mark menus-done`.

**FINALISTS / RACE / PROBE / PICK** (tournament; web-app, realtime-trading, backend-api, mobile-app, desktop-app
only). FINALISTS prints an auto-picked skip ("race costs one mini-build per finalist"); `--mark finalists-skipped`
is the default. If not skipped: session writes `finalists.json` (2-3 stack combos, one equal to incumbent
Picks); driver scaffolds+gates+boots each (RACE, no session action); PROBE: session builds one probe slice per
finalist, writes `tournament/evidence/<n>/probe.json` `{tasks:[{task,passed,retries,tokens,screenshot}]}`;
driver writes benchmark.json/.md + gallery.html; PICK: user picks by rewriting Picks; `--mark picked`.

**DECIDE.** Session is the sole proposer. Writes: (a) `.claude/genesis/stack-descriptor.json`; (b) one ADR per
hard-to-reverse dimension in `docs/adr/NNNN-*.md` with `## Options considered` (copied from menu), `## Decision`,
`## Dissents` (non-empty; every non-picked ranked option, is_minority, user-rejected); (c) one ops-conventions
ADR (error taxonomy, logging, naming/ids, wire representations, cross-plane constants, env/config, CI,
background work, success-metric instrumentation) — the 8 convention keys are auto-picked with
`📌 Auto-picked <key> — reason (veto anytime)`; (d) `.claude/genesis/conventions.json` rows
(DECIDED|DEFERRED, `enforceable`, `probe` path). Hard forks (persistence, framework, auth, deploy, …) are
mandatory `AskUserQuestion`s. Executed-assumption rule: dependency-adjudicated claims are run once against the
pinned dep before the ADR cites them. `--mark decided` refuses missing descriptor keys, missing ADR, empty
Dissents, or an open dimension not named (in backticks) in some ADR.

Stack descriptor (`.claude/genesis/stack-descriptor.json`):
```
{ "schemaVersion":1, "archetype":"web-app", "localeScope":{...}, "language":"typescript",
  "framework":"next", "packageManager":"bun", "testRunner":"bun test", "linter":"eslint",
  "typechecker":"tsc", "componentLibrary":"shadcn", "designCatalog":"storybook",
  "enforceEngines":["eslint"], "gateCommand":"bun typecheck && bun lint && bun test",
  "scaffoldCommand":"bunx create-next-app@latest . --typescript --app",
  "decisionRecords":["docs/adr/0001-stack-selection.md"] }
```

**SCAFFOLD** (driver only, no session action). Driver runs `scaffoldCommand` in the project root, logs to
`.claude/genesis/scaffold.log`; SCAFFOLD_RED prints log tail if it fails (fix descriptor, re-run).

**SKELETON.** Session lands the day-zero skeleton: one example test per declared layer, e2e stub (web/mobile/
desktop), CI workflow for the forge (no remote → ask user: connect or record CI-inert), health route / seed stub /
compose file, one executable probe test per enforceable DECIDED convention row, and the binding subset
`CLAUDE.md`/`AGENTS.md` (<=150 lines naming gateCommand, testTree, probes). `--mark skeleton-landed` checks
probes + binding subset, then the driver runs the zero-day gate (GATE_RED on fail; fix scaffold-level only).

**DESIGN_BRIEF / DESIGN_KIT / DESIGN_JOURNEYS / AWAITING_DESIGN_APPROVAL** (only visual archetype AND
`designCatalog==='storybook'`; else recorded skipped). Ceremony stack:
- DESIGN_BRIEF: a "direction round" (one AskUserQuestion: navigation shell sidebar|top-nav|tabs, layout system,
  color schemes light|dark|system, a11y baseline, token tiers). Then `Agent {model:"fable", effort:"high"}` with
  skill `design-brief` writes `docs/design/brief.md` (Users and context, Direction, Journeys with `JTBD: When…`,
  Navigation table, Catalog Used/Excluded, Composites table, Contract) plus `## Intent to pattern` and
  `## Naming` (code/schema/routes/wire) tables in `.claude/rules/design.md`, and `design-paths.json`.
  Driver auto-generates `docs/design/catalog.md` (shadcn inventory). `--mark design-brief-written` runs
  `design-contract-check.js`.
- DESIGN_KIT: Fable agent authors tokens, shell, composites, Storybook init, stories; `--mark kit-landed`.
- DESIGN_JOURNEYS: Fable agent rebuilds every approved mocks journey as a Storybook journey story (tags
  `journey`,`play-fn`) from driver-written `<journey>.beats.json`; primitive-import ban; `--mark journeys-drawn`
  rebuilds Storybook index to prove.
- AWAITING_DESIGN_APPROVAL: driver probes Storybook, prints `🎨 ready for review` + one URL per journey; user
  replies literal `approve` → `--mark design-approved` writes `docs/design/approval.json`.

**ROADMAP.** Session decomposes into briefs. Prints "proceeding unless vetoed: brief order and dependencies"
(a veto window, not a question) and asks ONE `AskUserQuestion` for milestone gates (product commitments). Rules:
slice by landing unit (never by layer), DAG `depends_on`, phases P0..., brief 01 is the first-light brief (one
real record through the deployed production path, header line `First light: …`), no status column. Writes
`docs/roadmap/00-overview.md` (Sequence table `# | Brief | Phase | Depends on | Workspaces | Risk | Design |
Est. specs`, milestone gates, ops track, parking lot from Later/Won't answers) and `docs/roadmap/NN-<kebab>.md`
per brief. Brief file shape:
```
# 01 — Title
Phase: P0 · Depends on: — · Primary workspaces: api
First light: <one record, where observed>
Journeys: - <j>: When …, I want …, so I can ….
## Result  ## Current state  ## Scope (numbered, ADR constraints inline)
## Surfaces (UI briefs: ```surfaces fenced block, label / label -> label)  ## Out of scope
## Grounding (ADR paths)  ## Open questions for planning
```
`--mark roadmap-written` checks headers, acyclic deps, and (if approval.json) that every approved screen label
appears in exactly one brief's Surfaces. Self-check: each ADR carried by >=1 brief, no duplicate scope.

**HANDOFF.** Session authors `.claude/genesis/init-profile.json` (init.md Phase 4 shape: stack-descriptor ref,
design block, manifestExtras for skeleton + probes); `--mark profile-written --file …` makes the driver run
`init-gen.js generate` (writes `.claude/spec.config.json`, rules, agents).

**GROUNDED** (terminal). Report block via `report-render`: `✅ architected + grounded — scaffold green, N ADRs,
P convention probes, roadmap of M briefs`, bullets (archetype/audience, gate, one line per ADR, designed set,
Chain), `⚠️ dissent recorded: …`, `Next: /spec:enforce`.

### 1.3 End state
Green scaffold + CI + probes + CLAUDE.md, ADRs with dissents, `.claude/spec.config.json`, and a roadmap of
briefs in `docs/roadmap/`. Next: `/spec:enforce` then `/spec:plan docs/roadmap/01-*.md`.

### 1.4 Trim verdict (genesis)
Essential to the outcome: (1) discovery of product facts + coverage (but 15 keys is a lot; the ones that
change architecture are payer, tenancy, data-sensitivity, residency, ai-use, scale-outage, success-metric),
(2) archetype pick, (3) research-backed option menus for the few hard-to-reverse dimensions with auto-pick of
unambiguous ones, (4) decision: stack-descriptor + ADRs with dissents, (5) scaffold + gate, (6) roadmap of
briefs with first-light brief, (7) handoff writing the config.
Ceremony: tournament (FINALISTS/RACE/PROBE/PICK; already auto-skipped), registry-check currency pass,
conventions.json ledger + per-row probe tests + 150-line binding-subset check, ops-conventions ADR as a table
of 9 rows, Executed-Assumptions rule, the whole Storybook design stage (DESIGN_BRIEF/KIT/JOURNEYS/APPROVAL with
three Fable dispatches, design-paths.json, catalog.md, beats.json, approval.json, design-contract-check),
derived-dimension table, the `📌` print per convention key, surface-label placement check, 4-round
interview with 15 keys, and GATE_RED/SCAFFOLD_RED split states.
Minimal state list: `DISCOVERY -> MENUS -> DECIDE -> SCAFFOLD(+GATE) -> ROADMAP -> HANDOFF -> DONE`
(7 states; BRIEF/SKELETON/design folded: skeleton = "scaffold + CI + one test" checked by the gate itself;
design stage deleted, UI fidelity belongs to /spec:mocks and /spec:prototype). Minimal driver estimate:
**~400-550 LOC** (state derivation from brief.md/descriptor/ADR/roadmap files ~120, mark handlers with
refusals ~200, scaffold/gate runner ~60, step printers ~100) vs 2679 today.

---------------------------------------------------------------------------------------------------

## 2. /spec:mocks

### 2.1 Start
`/spec:mocks` (no arguments). Intended model Sonnet. Creates `design/mocks/status.json` (schemaVersion 3) on
first run. Reads the idea from `.claude/genesis/brief.md` `## What I think you're building` when present,
else asks the user for the product idea (the only user question in the whole command). Never asks for sample
data: it invents it, awkward cases included.

Two modes: **service mode** if `.claude/spec.config.json` has a non-null `walkthrough` object (baseUrl,
project, tokenEnv; set up by `/spec:connect`); else **terminal mode**.

### 2.2 States: SEED -> SCREENS -> APPROVED

**SEED.** Session writes `design/mocks/seed.md` (template `mocks-seed.md`): `## Product` (3 sentences: what, for
whom, the one job) and `## Journeys` with one block per journey:
```
### invite-teammate
When I just signed up, I want to add my team, so I can start sharing results.
1. "I open the app" -> home
2. "I see nothing here yet" -> roster@first-run
3. "I send the invite" -> invite-sent
```
Rules: quoted sentence mandatory, N contiguous from 1, `screen[@state]` matches `^[\w][\w-]*$`, every journey
opens with a job-story line and has one off-path beat (`@first-run` or `@empty`); alternates are separate
journeys. Mark: `--mark seed-done` (refuses missing job story, missing off-path beat, malformed lines).

**SCREENS.** Skill `mock-authoring` loaded first. For each journey in seed order the session writes one file per
beat target: `design/mocks/screens/<screen>.json` or `<screen>@<state>.json`, a json-render spec:
```
{ "root":"page",
  "elements":{
   "page":{"type":"Stack","props":{"gap":16,"padding":24},"children":["title","start"]},
   "title":{"type":"Heading","props":{"text":"You are invited to Hearwell","level":1},"children":[]},
   "start":{"type":"Button","props":{"label":"Check my team"},"children":[],
            "on":{"press":{"action":"navigate","params":{"to":"roster-confirm"}}}} } }
```
Only catalog components (Stack, Row, Grid, Card, Divider, Heading, Text, Badge, Alert, Button, Field, Select,
Checkbox, Tabs, Nav, List, Table, Image, Avatar; containers Stack/Row/Grid/Card/List/Nav/Tabs; one action
`navigate`) from `templates/walkthrough/catalog.json`. Every move between two screens is a control whose
`on.press` navigates there; sample values consistent across screens; element keys are stable names (notes pin
to them). Per journey: `--mark journey-drawn --journey <j>` runs offline checks (missing files, catalog
violations, `bad-screen-file`, `bad-journey`, `no-control`), sends nothing.

*Service mode:* after all journeys drawn, `round push` sends a full snapshot (every journey, every screen) via
`walkthrough.js push` (the service numbers rounds; unchanged rounds are not resent) and prints a link. Session
prints `🎨 ready for review — <link>` and ENDS THE TURN. The service renders the screens as gray wireframes
for the client, who can add notes pinned to elements/journeys and press a confirm control per journey. On the
next run `round pull` prints a worklist (waiting notes by last entry, per-journey confirmed / confirmed on older
story / not confirmed). For each item the session edits the screen file (design/field note) or the seed beats
(missing/wrong step), replies with `walkthrough reply --note <id> --text-file <f>`, pushes again. Pulled data
lands in `design/rounds/<n>/{round.json,notes.json,approvals.json}`. Approval = the client's confirm recorded
against the journey's **story hash** (`beatHash`: first 12 hex of sha256 over canonical
`<beat> -> <screen>[@state]` lines); editing the seed changes the hash and reopens the journey automatically.
`--mark journey-approved --journey <j>` checks drawn, pushed, approval carries current hash (an open note never
blocks); `--waive --reason <r>` for an absent client.

*Terminal mode:* nothing drawn or sent. Driver prints each pending journey's job story and sentences in one
block; session ends turn on `approve all, or name the ones to change`; user's literal `approve` runs one
`--mark journey-approved --journey <j>` per journey (`by:"terminal"`); a named change edits the seed.

Then `round pull` and `--mark approved` (refuses any unconfirmed journey or waiting note; closes the round on
the service).

**APPROVED** (terminal). Report: `✅ wireframe approved — N journeys`, per-journey screen counts, chain
`/spec:mocks -> /spec:genesis -> /spec:enforce -> /spec:plan`, `Next: /spec:genesis`.

### 2.3 End state
Approved seed (journeys as stories + beats) and gray screen files; "approved" means structure only (screen set,
navigating controls, content order) - never layout, visuals, label wording or sample data.

### 2.4 Trim verdict (mocks)
Essential: SEED (journeys as job stories + beats incl. an empty/first-run beat), draw screens (json), review loop,
approval bound to a story hash. Ceremony: json-render catalog check granularity, `bad-screen-file/no-control`
finding taxonomy, reopens ledger, `--waive`, two parallel modes (terminal mode is the cheap path; service mode
exists only because a hosted service exists), per-journey marks (`journey-drawn`+`journey-approved` per
journey), checkpoint prints. Minimal states: `SEED -> SCREENS -> APPROVED` (already minimal at 3);
trim marks to `seed-done`, `approved`, with per-journey approval derived from the hash. Minimal driver:
**~200-250 LOC** (584 today); service client stays a separate script.

---------------------------------------------------------------------------------------------------

## 3. /spec:prototype

### 3.1 Start
`/spec:prototype <idea in words | docs/roadmap/NN-*.md | existing stem>`. Driver classifies the argument in
order: brief path (stem = basename), existing stem (`design/prototypes/<stem>/status.json`), else words (stem =
slug of the text, <=48 chars; `📌 Auto-picked stem …`; veto with `--stem <name>` before `--mark opened`). Needs a
`prototype` block in `.claude/spec.config.json`: `url` (with `{port}`), `bootCommand` (no default: when unset, OPEN asks the user once for the app's start command and records it here), `overlay` (path
the overlay is written to), `e2eFile` (`{stem}`), `e2eList` / `e2eRun` (`{file}`), `picture` (`{url} {out}
{width} {height}`), optional `dbCreate`/`dbDestroy`. Absent block: refusal pointing at `/spec:doctor`. Model Sonnet.

### 3.2 States: OPEN -> ROUND (xN, across sessions) -> APPROVED -> TESTS -> CONTRACTED -> CLOSED

**OPEN.** Driver prints a template; session writes `design/prototypes/<stem>/states.json`:
```
{ "schemaVersion":1, "viewport":{"width":1280,"height":800},
  "routes":{ "/invoices":{"default":"/invoices","empty":"/invoices?proto=empty"} } }
```
(route -> named state -> URL path; the overlay's "state" = `?proto=<state>`). `--mark opened` refuses a stale
branch or empty routes, then: creates worktree `.claude/worktrees/proto-<stem>` on `proto/<stem>` from the
host's main branch (via `merge-back.sh create`), plants a scratch marker, picks a free pins port (from 4711),
copies `templates/proto-overlay.js` to `prototype.overlay` with the token `__PROTO_PINS_URL__` replaced by
`http://127.0.0.1:<pinsPort>`, copies `proto-stable-id.js` beside it, runs `dbCreate`.

**ROUND n.** Driver step lines: (1) first round only - Session: add the dev-only import to the host's dev entry
in the worktree and commit on `proto/<stem>`, e.g. `if (import.meta.env.DEV) import('./proto-overlay.js')`;
(2) Session: start the host's boot command in the worktree on `PORT` in background; (3) Session: start the pin
endpoint `node {driver} <arg> serve --port <pinsPort>` in background. Driver curls the app URL: if answering it
prints `🎨 ready for pins — <url>` and `route: /x (default, empty)` lines, else `dev server is not answering`.
Also a `tailscale serve --bg <port>` share hint, and the fixed reply line "Reply `approve` to write the
contract; anything else is a change for this session to apply". Session prints verbatim and ENDS THE TURN
(background processes stopped before turn end).

*The pin overlay.* It is an ES module the host's dev entry imports behind a dev flag - injected by source
import, not by proxy or extension. It mounts a host div with a **closed shadow root** (no attribute added to the
host's elements, no trace a build could read back). Holding **Alt and clicking** any element captures the click
(capture phase, preventDefault), outlines the element 1.5 s, and opens a panel with a note textarea, a "who"
field (remembered in localStorage) and a `behaviour | look` toggle (default behaviour). `stableIdFor(el)` derives
an id from React dev fiber owners (up to three named component owners, innermost first, joined with `<`, plus
`#ordinal`; no fiber -> `null` -> it becomes a **screen note** with no anchor and no badge). `locFor` adds the
first non-node_modules stack frame as metadata only. Added pins queue locally with a numbered badge on the
element; "Send N pins" POSTs the whole batch as a JSON array to the pins URL and clears the queue only on a 2xx
(on failure it keeps the queue and shows the server's text/JSON `{error}` message). Pin sent shape:
`{screen: location.pathname, state: ?proto value|'default', anchor:{id,loc}|null, note, who, kind}`.
The pin endpoint (`serve`) is a ~60-line `node:http` server on 127.0.0.1 with CORS `*`: `POST /pins` validates
(`note` non-empty, `kind` in behaviour|look, `anchor.id` if anchor present; one bad pin writes nothing), assigns
ids `p1, p2, ...`, stamps `round` (= rounds recorded + 1) and `at`, and atomically appends to
`design/prototypes/<stem>/pins.json`; `GET /pins` reads it. The user pins from their own browser, then comes
back to the chat.

*Round loop.* The user replies. Literal `approve` -> `--mark approved`. Anything else is feedback: the session
applies changes on `proto/<stem>` with ordinary commits, then `--mark round-done` (refuses until some file in
the worktree imports the overlay; a round with zero new pins still marks), appending `{n, startedAt, endedAt,
pins:[new ids]}` to status.rounds, and the loop re-prints ROUND n+1. Rounds persist across sessions (/clear-safe).

**APPROVED.** Driver prints "write the behaviour contract"; session runs `--mark contracted`, which refuses
when: not approved, no `behaviour` pin ("a prototype that changed no behaviour is the direct lane"), invalid
states.json/viewport, or `prototype.picture` undeclared. It takes one picture per route x state via the host's
`picture` command to `design/prototypes/<stem>/captures/<route-slug>--<state>.png`, computes `reconcile`
(ADRs/roadmap files changed on the base branch since opening; stray files in the prototype folder), stamps the
brief with a `Prototype:` line, and writes `contract.json`.

Contract format (`design/prototypes/<stem>/contract.json`, schemaVersion 2):
```
{ "stem":"invoices", "brief":"docs/roadmap/03-invoices.md", "idea":null, "approvedAt":"<iso>",
  "base":"main", "viewport":{"width":1280,"height":800},
  "routes":{ "/invoices":{ "default":"captures/invoices--default.png" } },
  "pins":[ {"id":"p3","kind":"behaviour","screen":"/invoices","state":"default",
            "anchor":"InvoiceTable<Row#2","note":"Delete asks confirmation","round":2} ],
  "tests":null,   // later { file:"tests/<name>", source, run, pins:[ids] }
  "reconcile":{ "since":"<iso>","docs":["docs/adr/0004-x.md"],"stray":[] }, "stampedBrief":"docs/roadmap/03-….md" }
```
Other files: `status.json` (marks, rounds, branch, worktree, pinsPort, appPort, openedCommit), `pins.json`
(raw pin records incl. who, look pins), `states.json`.

**TESTS.** Driver lists one line per behaviour pin: `pin p3 · /invoices (default) · InvoiceTable<Row#2 · "Delete
asks confirmation"`, plus target file `prototype.e2eFile` in the worktree. Session writes one end-to-end test per
line, title `pin <id>: <note>`, commits on `proto/<stem>`; each must pass against the prototype and fail against
base. `--mark tests-derived` checks: file committed on the branch (not main), clean, every behaviour pin title
present, `e2eList` lists it, `e2eRun` passes (with `PROTO_URL`); copies it to `design/prototypes/<stem>/tests/`,
appends one ledger row, runs `spec-queue add <contract> --lane plan --top`, prints `Next: /spec:plan
design/prototypes/<stem>/contract.json`.

**CONTRACTED** (resting). Prints Reconcile (ADRs the session must settle at plan time as Decisions rows) and
Stray lines, "Commit on main: design/prototypes/<stem>/ and the stamped brief" (session commits directly),
`Next: /spec:plan <contract>`, and a `Close (...)` line. Worktree/branch/db stay until every spec citing the
stem is done; `--mark closed` (accepted from ROUND onward) deletes the worktree, branch, db; then CLOSED prints
`spec-status --next`.

### 3.3 Handoff to /spec:plan
Only `design/prototypes/<stem>/` on main is read by later stages (contract.json, pins, pictures, tests);
nothing on `proto/<stem>` is. `/spec:plan <contract>` turns pins into spec Decisions/acceptance criteria and
settles Reconcile ADRs. Prototype is a reference, never source.

### 3.4 Trim verdict (prototype)
Essential: worktree on `proto/<stem>`; the pin overlay + pin endpoint (the actual UX); rounds with literal
`approve`; contract = pins as sentences with kind behaviour|look; one test per behaviour pin; handoff to
`/spec:plan`. Ceremony: `states.json` route x state declaration + one picture per route x state (`picture`
config key, captures dir, viewport), `reconcile`/`stray` detection and brief stamping, ledger row, spec-queue
add, DB create/destroy hooks, scratch marker, port allocation (pins and app), tailscale hint, `check` (doctor
check 22), three input shapes (keep words + brief), two-stage APPROVED->TESTS->CONTRACTED split,
tests-must-fail-against-base claim (not machine-verified; only title/list/run are).
Minimal states: `OPEN -> ROUND -> TESTED(approve + contract.json + tests) -> CLOSED` (4 states). Pictures
become optional; states.json becomes optional (default: pin's own `screen`+`?proto` are the identity). Minimal
driver: **~350-450 LOC** (pin server ~60, mark handlers ~150, step printers ~80, input/worktree ~80) +
overlay ~200 LOC (321 today with CSS) vs 1082 today.

---------------------------------------------------------------------------------------------------

## 4. Cross-cutting notes for the rewrite
- Question formats preserved by users: `AskUserQuestion` rounds of <=4 with `confirm: guess (Recommended)` /
  `correct it` / `not applicable`; literal-word gates (`approve`, `approve all, or name the ones to change`);
  `📌 Auto-picked … (veto anytime)` prints for derived choices; `🎨 ready for review/pins — <url>` then END TURN.
- Models: genesis Opus; research agents Sonnet (medium); design-stage authors Fable/high (ceremony);
  mocks and prototype Sonnet.
- Everything is /clear-safe because state is re-derived from files; keep that property (it is the actual UX
  win), drop the `schemaVersion`/ledger machinery.
- Chains: mocks -> genesis -> enforce -> plan briefs; prototype -> plan contract.
