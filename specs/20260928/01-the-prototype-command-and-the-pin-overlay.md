---
date: 2026-09-28
status: hardened
tier: critical
area: prototype
breaking: false
depends_on: []
depended_on_by: [specs/20260928/02-freeze-export-and-the-contract.md, specs/20260928/03-the-build-reads-the-freeze.md]
brief: 28
spiked: 2026-09-28
open_markers: 0
---

# The prototype command and the pin overlay

## Goal

`/spec:prototype <brief>` opens a throwaway worktree on `proto/<brief stem>` from the host's
main branch, wires a dev-only pin overlay into the host app, and iterates with the user across
as many sessions as the brief needs: every round cold-starts from `design/prototypes/<stem>/`
on disk, JJ taps elements in the running app and leaves numbered pins that land in
`pins.json` through a local endpoint the driver runs only while a round is open, and the session
applies the changes on the prototype branch. The host declares how a prototype's database and
dev server come up; the plugin carries no Neon-specific code. Done means: on a fixture host the
driver opens the worktree, refuses to open twice, serves pins into the file with the contract's
shape, records rounds, and reaches `APPROVED` on the user's literal `approve` — the freeze itself
is spec 02.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New host config block `prototype` (Contracts), added to `spec/templates/grounding-contract.md` § Required config keys as an optional block: `url` (the dev server's base URL), `overlay` (the worktree-relative file the driver writes the overlay to; the host's dev entry imports it behind its dev flag), `e2eFile` (a path template carrying `{brief}`, where spec 02's derived tests land), `e2eList` (a shell string carrying `{file}` that lists the tests in one file and exits 0), `export` (a non-empty array of git pathspec globs naming the data and API layer), optional `dbCreate` / `dbDestroy` (shell strings run with cwd = the prototype worktree and env `PROTO_BRANCH`, `PROTO_WORKTREE`, `PROTO_BRIEF`), optional `gate` (the command spec 02's freeze runs on the prototype tree when the host `gateCommand` carries a `{testDirs}`/`{scopeDirs}` placeholder). Absent block = the host has never declared a prototype path: the driver exits 2 naming the block and the doctor check. (AC-20260928-01-1) | Brief 28 open question 1 and 4, defaults taken: a host-declared script, no Neon code in the plugin; export globs in the config, verified by doctor. One contract edit for the whole series (pipeline rules § Planning cap). |
| D2 | `spec/scripts/prototype-driver.js` (key `prototype-driver`, `spec-paths` case line + usage; `spec/entrypoints.json` row naming `spec/commands/prototype.md` and `spec/commands/doctor.md`). CLI: `prototype-driver <brief path> [--root <dir>] [--state] [--mark <mark> [args]] [serve --port N] [check [--json]]`, hand-rolled argv. The brief stem is the brief file's basename without extension (`28-functional-prototype`); branch `proto/<stem>`; worktree `.claude/worktrees/proto-<stem>` (created through `merge-back.sh create --source proto/<stem> --root <root>`, which owns the worktree path and the include manifest); status at `design/prototypes/<stem>/status.json`, pins at `design/prototypes/<stem>/pins.json`, declared routes and states at `design/prototypes/<stem>/states.json` — all three in the main working tree, never on the prototype branch. Exit codes: `0` step printed / state / accepted mark; `2` precondition failure or refused mark (stderr names artifact and remedy); `serve` runs until SIGTERM and exits 0. (AC-20260928-01-2, AC-20260928-01-3) | The files the build reads after the branch is gone must live on main (ADR-0030 h). Reusing `merge-back.sh create` keeps one worktree convention. |
| D3 | States, derived from status + disk in this order: `OPEN` while `!marks.opened` or the worktree is absent from `git worktree list --porcelain`; `ROUND` while opened and `!marks.approved`; `APPROVED` once `marks.approved`; the states after `APPROVED` (`FROZEN`, `CLOSED`) are spec 02's — this spec's `APPROVED` step prints `## Step: freeze — not available in this version` and no `Then:` line. Marks: `opened`, `round-done`, `approved`; every accepted mark ends with `✅ checkpoint — prototype state saved (<prev> → <next>); safe to /clear and re-run /spec:prototype <brief>`. `--mark opened` is driver-executed: it refuses when `git branch --list proto/<stem>` is non-empty and `status.json` is absent (`stale prototype branch proto/<stem> — delete it or restore design/prototypes/<stem>/status.json`), creates the worktree (recording `base` = the branch checked out in the main tree at that moment and `pinsPort` = a free port probed from 4711 upward), writes the overlay and the stable-id module into the worktree at `prototype.overlay`'s directory with the pins port baked in (Contracts), runs `dbCreate` when declared (non-zero exit = refusal, stdout/stderr forwarded), then verifies `states.json` parses with at least one route carrying at least one state and that some tracked file in the worktree imports the overlay's basename (`grep -rl` over the worktree minus `node_modules`) — a missing import is a refusal naming `prototype.overlay`. (AC-20260928-01-3, AC-20260928-01-4) | Driver-stepped like genesis and mocks; the driver executes what is deterministic and prints what needs the session. |
| D4 | The `ROUND` step (Contracts) prints `Read only:` (`pins.json`, `states.json`), the round number, the session lines — start the host's `runtime.bootCommand` in the worktree in the background, start `node <driver> <brief> serve --port <pinsPort>` in the background, both tracked and stopped before the turn ends — then probes `prototype.url` with `curl -sf -m 3` and prints `🎨 ready for pins — <url>` plus one `route: <path> (<states>)` line per `states.json` entry only when the probe succeeds; on failure it prints `dev server is not answering on <url>` and the boot line, never a URL. It prints the optional line `Share (only when someone else must see it): tailscale serve --bg <port>` and the fixed reply line `Reply \`approve\` to freeze; anything else is a change for this session to apply on proto/<stem>, then --mark round-done`. `--mark round-done` appends `{ n, startedAt, endedAt, pins: [ids added this round] }` to `status.rounds`; a round with zero new pins is accepted (it is how "nothing more to change" is recorded). `--mark approved` requires `rounds.length ≥ 1` and sets `marks.approved`. (AC-20260928-01-5, AC-20260928-01-6) | Variants are routes in one worktree (brief default): nothing here is per variant. The Tailscale line is printed, never run (standing rule: the plugin runs no resident process, and exposure is the user's call). One verified URL per look stop. |
| D5 | `serve --port N` is a `node:http` server bound to `127.0.0.1` that runs only during a round: `POST /pins` takes a JSON array of pins (Contracts), assigns ids `p<n>` continuing from the file, stamps `round` = `status.rounds.length + 1` and `at`, appends to `pins.json` atomically (write temp + rename), and answers `{ "accepted": [ids] }`; `GET /pins` returns the file; every response carries `Access-Control-Allow-Origin: *` and `OPTIONS` answers 204 with the CORS headers. A pin failing the shape check (no `note`, `kind` outside `behaviour|look`, `anchor` present without `id`) is refused 400 naming the field, and nothing in the batch is written. (AC-20260928-01-7, AC-20260928-01-8) | Brief scope 1: batch send to a local endpoint the driver runs only during a round; no resident process. |
| D6 | The overlay `spec/templates/proto-overlay.js` (copied, never imported by the plugin) and the stable-id module `spec/templates/proto-stable-id.js` (one source, copied beside the overlay and injected by spec 02's capture through `page.addScriptTag`). Stable id grammar (Contracts): the element's nearest named function-component owners, up to three, innermost first, each with its React key when the owner fiber carries one, joined by `<`, then `#<ordinal>` — the element's 0-based index among document elements sharing that chain. Owners named `hookified`, `unboundStoryFn`, `ErrorBoundary` and names starting with `Storybook` are skipped. `loc` is a second field — `<path>:<line>` of the first stack frame outside `node_modules`, `/@vite/`, `/@fs/`, `/@id/` and `sb-vite/deps`, taken from the element's own `_debugStack`, then its owners' — carried on a pin for the session, never part of the stable id. Both are computed from React's dev-only fiber fields (`__reactFiber$*`, `_debugOwner`, `_debugStack`); on a DOM node with no fiber the overlay records a screen note and `stableIdFor` returns `null`. (AC-20260928-01-9) | Spiked 2026-09-28 on salon-os (React 19.2.8, Storybook 10.5.8 dev): 154/154 elements carry a fiber, 108 distinct chains, the 14 duplicates all unkeyed repeats resolved by ordinal, 139/154 have an app-source frame, 0 differing rows across two loads. Source locations do not survive a from-scratch rebuild, so they are pin metadata only. |
| D7 | Overlay behaviour: Alt+click on any element outlines it, shows a numbered badge and a panel (note textarea, `who` remembered in `localStorage`, a `behaviour | look` toggle defaulting to `behaviour`, a `screen note` button for a pin with no anchor); pins queue locally and `Send N pins` POSTs the batch to the baked pins URL, clearing the queue on `2xx` and keeping it with the server's message on any other answer. `screen` = `location.pathname`; `state` = the `proto` query parameter or `default`. The overlay renders inside a closed shadow root and adds no attribute to the host's elements. (AC-20260928-01-9 covers the id; the overlay's rendering is exempt from TDD as pure UI; the send path is pinned by AC-20260928-01-8's server shape) | ADR-0030 (e): one note model, optional anchor; a pin that names a behaviour becomes a test by default and the user unmarks. Acting on the server's answer, never the request (Gotchas). |
| D8 | `check [--json]` (doctor check 23, advisory): with a `prototype` block present, every `export` glob matches at least one tracked file (`git ls-files -- ':(glob)<g>'`), `overlay`'s path is matched by no export glob, `e2eFile` contains `{brief}` and `e2eList` contains `{file}`; exit 1 with one line per finding naming the key, 0 when clean or when the block is absent. `spec/commands/doctor.md` gains the check under the next free ordinal (23 at lock; take the next free number at build and amend every mention). (AC-20260928-01-10) | Brief open question 4: globs verified by doctor. An overlay inside the export set would reach `harden/` (ADR-0030 h). |
| D9 | `spec/commands/prototype.md` (driver-stepped; read-load ≤ 500 with a `shared-for prototype` arm in `spec-paths` listing `Host Grounding\|Pipeline Entry\|Model Placement\|Decisions\|Question Style\|Console Output Style\|Worker Git Ban\|MCP Policy\|On-Disk Handoff\|Session Execution`); `spec/templates/roadmap-brief.md`'s header line gains `Lane: { behaviour | structural }` (absent = structural); `spec/commands/plan.md` § Entry, roadmap-brief bullet: a brief whose header carries `Lane: behaviour` STOPs with `run /spec:prototype <brief> — a behaviour-lane brief carries no plan document; the freeze writes its spec`; `spec/doctrine/design.md` § Design Canon gains one paragraph naming the prototype as a branch of the product on the kit, its files under `design/prototypes/`, and that nothing on `proto/*` is read after close (≤ 160 lines, AC-20260926-01-8 literals kept). [no-ac: prose; `read-load`, `citations-check`, the design.md line pin and `entrypoints` are the oracles] | ADR-0030 (d) and (h); the lane is declared on the brief because "the shape of the ask" is known when the brief is minted. |
| D10 | `spec/scripts/fleet-reader.js`: `STAGES` and `SPEC_STAGES` gain `prototype` (spec 02 writes the row, carrying `spec` = the generated spec path). (AC-20260928-01-11) | A row with an unknown stage is `stage-unknown` in the drift census; the writer lands one spec later, the reader must already admit it. |
| D11 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: bump — `plugin-bump.js --check` is the oracle] | Version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/prototype-driver.js | CREATE | scripts | D2 CLI + exit codes; D3 states and marks; D4 ROUND print + probe; D5 `serve`; D8 `check`; header comment with owner citation |
| spec/templates/proto-overlay.js | CREATE | doctrine | D6/D7 — the copied overlay; `__PROTO_PINS_URL__` token replaced at OPEN |
| spec/templates/proto-stable-id.js | CREATE | doctrine | D6 — `stableIdFor(el)` and `locFor(el)`; ESM + `globalThis.__protoStableId` for `addScriptTag`; no imports |
| spec/templates/grounding-contract.md | MODIFY | doctrine | D1 — the `prototype` block row (the series' one contract edit) |
| spec/bin/spec-paths | MODIFY | scripts | D2 key `prototype-driver`; D9 `shared-for prototype` arm; usage string |
| spec/entrypoints.json | MODIFY | other | D2 — row for prototype-driver.js |
| spec/commands/prototype.md | CREATE | doctrine | D9 — frontmatter, setup, the loop, one `##` per state, report, rules (≤ 8 bullets) |
| spec/commands/plan.md | MODIFY | doctrine | D9 — behaviour-lane STOP in § Entry |
| spec/commands/doctor.md | MODIFY | doctrine | D8 — check 23 (next free ordinal at build) |
| spec/templates/roadmap-brief.md | MODIFY | doctrine | D9 — `Lane:` header field |
| spec/doctrine/design.md | MODIFY | doctrine | D9 — prototype paragraph in § Design Canon |
| spec/scripts/fleet-reader.js | MODIFY | scripts | D10 — `prototype` in `STAGES` and `SPEC_STAGES` |
| spec/.claude-plugin/plugin.json | MODIFY | other | D11 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| .claude/spec.config.json | MODIFY | other | D1 — this repo's own `contractHash` re-stamped over the edited contract (`spec-paths contract-hash`); `tests/consistency/contract-stamp.test.js`'s restamp pin is the oracle |
| tests/spec-paths.test.js | MODIFY | tests | key list gains `prototype-driver` (in place, per its own comment); AC-20260928-01-2 |
| tests/prototype/prototype-driver.test.js | CREATE | tests | AC-20260928-01-1, AC-20260928-01-3, AC-20260928-01-4, AC-20260928-01-5, AC-20260928-01-6 |
| tests/prototype/pins-server.test.js | CREATE | tests | AC-20260928-01-7, AC-20260928-01-8 |
| tests/prototype/stable-id.test.js | CREATE | tests | AC-20260928-01-9 |
| tests/prototype/prototype-check.test.js | CREATE | tests | AC-20260928-01-10 |
| tests/prototype/ledger-stage.test.js | CREATE | tests | AC-20260928-01-11 |
| tests/fixtures/prototype/host/ | CREATE | tests | a synthetic host: `.claude/spec.config.json` with `prototype` + `runtime`, `src/main.js` importing `./proto-overlay.js`, one tracked file per export glob, `dbCreate` = a script that writes `db-created` into the worktree |

Note (outside the table): `tests/consistency/entrypoints.test.js` and `read-load.test.js` are
not edited — the new command and script satisfy them through the rows above. A `prototype`
entry is not added to `read-load`'s `BUDGET`; the flat cap of 500 applies.

## Contracts

The `prototype` config block (D1), the grounding-contract row:

```jsonc
"prototype": {
  "url": "http://localhost:3000",                       // base URL runtime.bootCommand answers on
  "overlay": "src/proto-overlay.js",                    // worktree-relative; the dev entry imports it behind its dev flag
  "e2eFile": "e2e/proto-{brief}.smoke.spec.ts",         // {brief} = NN; must match the host runner's own file pattern
  "e2eList": "pnpm exec playwright test --list {file}", // exits 0 and prints the tests in {file}
  "export": ["src/db/**", "drizzle/**", "src/routes/api/**"], // git pathspec globs: the data and API layer
  "dbCreate": "node scripts/worktree-db.ts create",     // optional; cwd = worktree; PROTO_BRANCH/PROTO_WORKTREE/PROTO_BRIEF in env
  "dbDestroy": "node scripts/worktree-db.ts drop",      // optional; same cwd and env
  "gate": "pnpm lint && pnpm test"                      // optional; the freeze's gate when gateCommand carries {testDirs}
}
```

`design/prototypes/<stem>/status.json` (D3, D4):

```json
{ "schemaVersion": 1, "brief": "28", "stem": "28-functional-prototype",
  "branch": "proto/28-functional-prototype", "worktree": ".claude/worktrees/proto-28-functional-prototype",
  "base": "main", "pinsPort": 4711, "marks": { "opened": "2026-09-28T09:00:00.000Z", "approved": null },
  "rounds": [ { "n": 1, "startedAt": "…", "endedAt": "…", "pins": ["p1", "p2", "p3"] } ],
  "lastUpdated": "…" }
```

`design/prototypes/<stem>/states.json` (D3), authored by the session at OPEN from the template
the step prints — a route's state is a URL the app renders it in:

```json
{ "schemaVersion": 1, "viewport": { "width": 1280, "height": 800 },
  "routes": { "/women": { "default": "/women", "empty": "/women?proto=empty" },
              "/women/new": { "default": "/women/new", "error": "/women/new?proto=error" } } }
```

`design/prototypes/<stem>/pins.json` (D5) — one record, optional anchor:

```json
{ "schemaVersion": 1, "pins": [
  { "id": "p1", "round": 1, "screen": "/women", "state": "default",
    "anchor": { "id": "WomanRow[w_01]<WomenList<WomenScreen#0", "loc": "src/routes/_authed/women.index.tsx:41" },
    "note": "保存すると行が緑になる", "who": "JJ", "kind": "behaviour", "at": "2026-09-28T09:10:00.000Z" },
  { "id": "p2", "round": 1, "screen": "/women", "state": "empty", "anchor": null,
    "note": "空のときは案内文だけ", "who": "JJ", "kind": "look", "at": "…" } ] }
```

`POST /pins` body = the array above without `id`, `round`, `at`; answer `{ "accepted": ["p1","p2"] }`.

The `ROUND` step (D4), rendered on a serving host:

```
[prototype-driver] state: ROUND  brief: docs/roadmap/28-functional-prototype.md  round: 2
## Step: pin round 2 on proto/28-functional-prototype
Read only: design/prototypes/28-functional-prototype/pins.json, design/prototypes/28-functional-prototype/states.json
Session: in .claude/worktrees/proto-28-functional-prototype, start the dev server in the background (tracked): pnpm dev
Session: start the pin endpoint in the background (tracked): node <driver> docs/roadmap/28-functional-prototype.md serve --port 4711
🎨 ready for pins — http://localhost:3000
route: /women (default, empty)
route: /women/new (default, error)
Share (only when someone else must see it): tailscale serve --bg 3000
Reply `approve` to freeze; anything else is a change for this session to apply on proto/28-functional-prototype, then:
  node <driver> docs/roadmap/28-functional-prototype.md --mark round-done
Then (only on the literal `approve`):
  node <driver> docs/roadmap/28-functional-prototype.md --mark approved
```

Stable id (D6): `WomanRow[w_01]<WomenList<WomenScreen#0` — innermost owner first, `[key]` only
when the owner fiber has a key, `#0` the ordinal among elements sharing the chain.

`proto-stable-id.js` exports `stableIdFor(el) → string | null` and `locFor(el) → string | null`
and assigns both to `globalThis.__protoStableId` so an injected copy is reachable from
`page.evaluate`.

## Behavior

A session runs `/spec:prototype docs/roadmap/NN-x.md`, reads the printed step and does it. At
`OPEN` it fills `states.json`, wires the overlay import into the host's dev entry inside the
worktree (a one-line `if (import.meta.env.DEV) import('./proto-overlay.js')` or the stack's
equivalent) and marks; the driver creates the branch and worktree, provisions the database
through the host's own script, and verifies the wiring. At `ROUND` the session boots the app and
the pin endpoint, prints the look stop verbatim and ends its turn. JJ pins; the session applies
the pins on the prototype branch (ordinary commits there), marks the round, and re-runs. On
`approve` the driver moves to `APPROVED`, where spec 02's freeze takes over. Every file the
build will read later sits under `design/prototypes/<stem>/` on main and is committed on main
through the direct lane; the prototype branch is never merged anywhere.

## Acceptance Criteria

- **AC-20260928-01-1**: WHEN the driver runs against a host whose config has no `prototype` block THE SYSTEM SHALL exit 2 with stderr naming `prototype` and `spec:doctor`; WHEN the block lacks `export` or `export` is `[]` THE SYSTEM SHALL exit 2 naming `prototype.export` → writes tests/prototype/prototype-driver.test.js
- **AC-20260928-01-2**: WHEN `spec-paths prototype-driver` runs THE SYSTEM SHALL print an existing path ending `scripts/prototype-driver.js`, and `spec-paths shared-for prototype` SHALL print a section-scoped header containing `/spec:prototype` and fewer than 400 lines → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every documented key resolves to an existing path
- **AC-20260928-01-3**: WHEN the bare run executes on the fixture host with no `design/prototypes/<stem>/` THE SYSTEM SHALL print `state: OPEN`, a `## Step:` line, and a `states.json` template block; WHEN `--mark opened` runs with a valid `states.json` and the overlay import in place THE SYSTEM SHALL exit 0, create branch `proto/<stem>` and `.claude/worktrees/proto-<stem>`, write `<worktree>/src/proto-overlay.js` containing `http://127.0.0.1:<pinsPort>` and `<worktree>/src/proto-stable-id.js`, run `dbCreate` (the fixture's `db-created` file exists in the worktree), set `marks.opened`, and print `(OPEN → ROUND)`; a second bare run SHALL print `state: ROUND` → writes tests/prototype/prototype-driver.test.js
- **AC-20260928-01-4**: WHEN `--mark opened` runs while `states.json` has zero routes THE SYSTEM SHALL exit 2 naming `states.json` and create no branch; WHEN the fixture's `src/main.js` does not import `proto-overlay.js` THE SYSTEM SHALL exit 2 naming `prototype.overlay`; WHEN branch `proto/<stem>` exists and `status.json` is absent THE SYSTEM SHALL exit 2 with stderr containing `stale prototype branch proto/<stem>` → writes tests/prototype/prototype-driver.test.js
- **AC-20260928-01-5**: WHEN the bare run prints `ROUND` with `prototype.url` pointing at a closed port THE SYSTEM SHALL print `dev server is not answering on <url>`, a `Session:` line containing the host's `runtime.bootCommand`, a `Session:` line containing `serve --port <pinsPort>`, and no line containing `🎨`; WHEN `url` is a `file:` URL to an existing file THE SYSTEM SHALL print `🎨 ready for pins — <url>`, one `route:` line per `states.json` route listing its states in declaration order, a line containing `tailscale serve --bg`, and the `approve` reply line → writes tests/prototype/prototype-driver.test.js
- **AC-20260928-01-6**: WHEN `--mark round-done` runs after two pins were appended since the last round THE SYSTEM SHALL append `{ n: 1, pins: ["p1","p2"] }` with ISO `startedAt`/`endedAt` and print `(ROUND → ROUND)`; WHEN it runs with zero new pins THE SYSTEM SHALL still append round 2 with `pins: []`; WHEN `--mark approved` runs with `rounds: []` THE SYSTEM SHALL exit 2 naming `round-done`; WHEN it runs after a round THE SYSTEM SHALL set `marks.approved`, print `(ROUND → APPROVED)`, and the next bare run SHALL print `state: APPROVED` and `## Step: freeze — not available in this version` → writes tests/prototype/prototype-driver.test.js
- **AC-20260928-01-7**: WHEN `serve --port <free port>` is running and a client POSTs `[{screen:"/women",state:"default",anchor:{id:"A#0",loc:"x.tsx:1"},note:"n",who:"JJ",kind:"behaviour"},{screen:"/women",state:"empty",anchor:null,note:"m",who:"JJ",kind:"look"}]` to `/pins` THE SYSTEM SHALL answer 200 with `{"accepted":["p1","p2"]}` and `Access-Control-Allow-Origin: *`, and `pins.json` SHALL hold both pins with `round: 1` and ISO `at`; a second batch SHALL continue at `p3`; `OPTIONS /pins` SHALL answer 204 with the CORS headers; SIGTERM SHALL end the process with exit 0 → writes tests/prototype/pins-server.test.js
- **AC-20260928-01-8**: WHEN a batch holds one valid pin and one with `kind: "urgent"` THE SYSTEM SHALL answer 400 with a body naming `kind` and write nothing (the file's pin count is unchanged); WHEN a pin has `anchor: {loc:"x"}` without `id` THE SYSTEM SHALL answer 400 naming `anchor.id` → writes tests/prototype/pins-server.test.js
- **AC-20260928-01-9**: WHEN `stableIdFor` runs over a hand-built fiber graph (plain objects: a `div` whose `__reactFiber$t` has `_debugOwner` chain `Row (key "w_01") → List → Screen → hookified → ErrorBoundary`, and a sibling `div` with the same chain) THE SYSTEM SHALL return `Row[w_01]<List<Screen#0` and `Row[w_01]<List<Screen#1`; WHEN the element has no `__reactFiber$*` key THE SYSTEM SHALL return `null`; WHEN `_debugStack.stack` lists a `node_modules` frame before `http://localhost:3000/src/a.tsx:41:7` THE SYSTEM SHALL make `locFor` return `src/a.tsx:41` → writes tests/prototype/stable-id.test.js
- **AC-20260928-01-10**: WHEN `check` runs on the fixture host THE SYSTEM SHALL exit 0 and print nothing; WHEN `export` gains a glob matching no tracked file THE SYSTEM SHALL exit 1 printing one line naming that glob; WHEN `overlay` is set to a path inside an export glob THE SYSTEM SHALL exit 1 naming `prototype.overlay`; WHEN `e2eFile` lacks `{brief}` THE SYSTEM SHALL exit 1 naming `prototype.e2eFile`; `--json` SHALL print `{ "findings": [...] }` with one entry per line → writes tests/prototype/prototype-check.test.js
- **AC-20260928-01-11**: WHEN `fleet-reader.js --json` reads a ledger holding `{"ts":"…","stage":"prototype","spec":"specs/20260928/09-x.md","brief":"28","rounds":2}` THE SYSTEM SHALL not list that row under the drift census's `stage-unknown` or `missing-spec` reasons, and a `prototype` row without `spec` SHALL be listed under `missing-spec` → writes tests/prototype/ledger-stage.test.js

## Assumptions (escalation triggers)

- A1 (executed 2026-09-28, salon-os, React 19.2.8 dev build served by Storybook 10.5.8 `dev`; `fiber-spike3.mjs` in the session scratch): every element under the story root carries a `__reactFiber$*` key (154/154); `_debugOwner` chains resolve to component names; `_debugStack.stack` holds an app-source frame for 139/154 elements once `node_modules` / `sb-vite/deps` / `@vite` / `@fs` frames are skipped; keyed owner chains give 108 distinct ids with 14 duplicates, all unkeyed list repeats; two loads produce 0 differing rows over id + box + colour + padding. — **if false** on a host (a production build, or a stack without React dev fibers): `stableIdFor` returns `null` for every element, every pin is a screen note, and spec 02's capture refuses with `no fibers — the dev server must run a development build`; never fall back to tree position.
- A2 (executed 2026-09-28): a script outside the host loads the host's Playwright through `createRequire(<host>/package.json)('@playwright/test')` and drives Chromium (the spike ran from the session scratch against salon-os). — **if false:** the capture (spec 02) is spawned with `cwd` = the host root and a relative `require`; record the deviation.
- A3 (executed 2026-09-28): `merge-back.sh create --source proto/<stem>` yields `.claude/worktrees/proto-<stem>` (the `/`→`-` rule) and `git branch --list 'proto/28-*'` is empty after `git worktree remove` + `git branch -D` (git 2.x on this Mac). — **if false:** STOP, ask the user.
- A4 (executed 2026-09-28): `tailscale serve --help` documents `tailscale serve --bg <port>`. — **if false:** print `tailscale serve <port>` and record the deviation.
- A5: `curl` is on PATH (the genesis look stop already relies on it) and `curl -sf` reads `file:` URLs, which is how the tests serve a reachable `prototype.url`. — **if false:** the probe falls back to `node -e` with the global `fetch`; tests use a bound `node:http` server instead of `file:`.
- A6: `tests/consistency/read-load.test.js`'s flat cap (500) holds for `prototype.md` + the `shared-for prototype` arm listed in D9 (the arm is scoped to the sections named there; measured at build, never raised). — **if false:** cut sections from the arm before cutting command prose.
- A7: no test outside this File Plan pins the exact `STAGES` set of `fleet-reader.js` or the exact `spec-paths` usage string (grep at lock: none found). — **if false:** the hit is a fix row here, never a weakened pin.

## Rationale

The driver mirrors genesis and mocks: status plus disk derives one step, the deterministic
half runs inside a mark, the session does only what needs judgment. Everything the build will
read later — states, pins, later the captures and contract — lives under
`design/prototypes/<stem>/` in the main working tree, because ADR-0030 (h) says nothing on
`proto/*` is read after close and the branch is deleted; the prototype branch carries only
product code and the overlay copy. The overlay is copied rather than served so the host's
bundler treats it like any dev-only module and the worktree's deletion removes it; the doctor
check keeps it out of the export globs so it can never reach `harden/`. Stable ids come from
React's own dev fibers because the spike showed them complete and deterministic on the real
host, and because the alternative — a build plugin stamping attributes — is host-side code the
plugin cannot own. The source location is deliberately kept off the id: a rebuilt UI has
different lines, and the id must name the same composite instance on both sides. RefDiff was
checked on 2026-09-28 and rejected by JJ for this series (no app-versus-app mode, git checkout
only, geometric matching); it stays a watch. The `Lane:` header on briefs is the smallest place
to declare the behaviour lane: `spec-status.js` is untouched (its action strings are a frozen
API), so `--next` still prints `/spec:plan` for such a brief and plan's Entry redirects — a
follow-up may teach `spec-status` the lane once a second behaviour brief exists. No
`SHALL CONTINUE TO` pin: this spec adds surfaces and changes no existing behaviour.

## Canonical Delta

`docs/canonical/design.md` gains a section **Prototypes**: `/spec:prototype <brief>` runs a
functional prototype on `proto/<stem>` in `.claude/worktrees/proto-<stem>`; the host declares
`prototype` (`url`, `overlay`, `e2eFile`, `e2eList`, `export`, optional `dbCreate`/`dbDestroy`)
in its config; rounds, pins and declared states live under `design/prototypes/<stem>/` on main;
pins are one record with an optional anchor whose id is the keyed owner chain plus ordinal; the
pin endpoint runs only during a round; a brief header `Lane: behaviour` sends the brief to this
command instead of `/spec:plan`.
