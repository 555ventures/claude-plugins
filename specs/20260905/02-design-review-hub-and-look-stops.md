---
date: 2026-09-05
status: implementing
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: [specs/20260905/01-picks-on-the-atlas-page.md]
depended_on_by: [specs/20260905/03-candidate-flows-in-a-journey.md]
brief: n/a
diff_base: 411b8d9defb16afbed8125051912dba9b8511d1a
---

# Design review hub and look stops: one URL per machine, the driver reads every verdict from disk

## Goal

With picks taken on the atlas page (spec 01), the remaining defect is how the user reaches
the page: today's look stop prints a `node "$(spec-paths design-atlas)" serve` line plus file
paths, `spec-paths` does not exist outside a session, the fixed port collides across projects,
and the served page is per project — the user runs ~10 projects and reviews from a phone or a
desktop browser (ruling 2026-09-04: a look stop prints one verified link, never a command).
Done means: one long-lived hub per machine at one bookmarkable address mounts every registered
project's atlas and mocks under `/p/<name>/`, its front page is an inbox of open look stops
newest first across projects; the mocks driver opens a stop for every look (`shapes`,
`journey:<j>`, `theme`, `review:<j>`, `signoff`), prints exactly the verified link and the
fixed reply line, and every advancing mark that needs a human verdict refuses unless that
verdict is in `picks.json` (written by the page or by `stop decide --by chat`), deriving the
ledger's `rejected` cell from the picked group; `/spec:sketch` and `/spec:atlas` route their
looks through the same hub; the Storybook catalog stop of `/spec:design` is untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/design-hub.js` (`spec-paths design-hub`) with subcommands `serve`, `ensure`, `register --root <r> [--name <n>]`, `config [--base <url>]`, `status`, `stop open`, `stop decide`, `stop list`; per-machine state under `$SPEC_DESIGN_HUB_HOME` (default `~/.claude/design-hub/`): `registry.json` `{schemaVersion:1, port, base, projects:[{name, root, registeredAt}]}`, `hub.pid`, `hub.log`; port = `SPEC_DESIGN_HUB_PORT` > `registry.port` > 4600; `register` stores `fs.realpathSync(root)`, `name` = `--name` or `basename(root)`, is idempotent for the same root, refuses (exit 2) a second root under a used name unless `--name` is given; registry writes are temp-file + rename (AC-20260905-02-1) | One machine-wide process is the only shape that yields one bookmark across projects. Rejected: a launchd/systemd unit (platform-specific second install step) — `ensure` from any session is enough and cheaper to reverse. |
| D2 | `ensure` probes `GET http://127.0.0.1:<port>/__hub/health`; a hub (`{hub:true}`) answers → print `base`; `ECONNREFUSED` → spawn `design-hub.js serve` detached (`stdio` → `hub.log`, `unref()`, pid to `hub.pid`), poll health up to 5 s, then print; any other occupant → exit 2 naming the port and `SPEC_DESIGN_HUB_PORT`; no health within 5 s → exit 3 naming `hub.log`. stdout is exactly one line: `base` (AC-20260905-02-2, AC-20260905-02-3) | Callers splice stdout into a link; a session never hands the user the server command. Spike A1: a detached child outlives its parent. |
| D3 | Hub routes: `GET /` inbox; `GET /__hub/health` → `200 {"hub":true,"projects":N,"port":P}`; `* /p/<name>/…` → spec 01's `createRequestHandler(<root>, {prefix:'/p/<name>'})` (so `/p/<name>/__picks/decide` and `/p/<name>/__notes/*` work per project); unknown `<name>` → 404 naming it; a project whose root vanished → 404 naming the root; listener binds `127.0.0.1` only; every response `cache-control: no-store` (AC-20260905-02-4, AC-20260905-02-5, AC-20260905-02-6) | Loopback-only keeps the spec-10 review ruling (writable endpoints never on an open interface); the phone reaches it through the tunnel the machine already has, configured once as `base` (D4). |
| D4 | The inbox is built with spec 01's `page()`: section 1 every registered project's `open` stops merged and sorted by `openedAt` descending, one row `project · title · kind · opened` linking to `<base>/p/<name>/atlas/index.html#stop-<id>`; section 2 `decided` stops (waiting for the session) same shape; section 3 one line per project with nothing pending linking to its atlas; a project whose root no longer exists renders as one row badged `unreachable`; `<meta http-equiv="refresh" content="30">`. `base` defaults to `http://localhost:<port>`; `config --base <url>` stores an absolute origin (trailing slash stripped) and every printed or rendered link uses it (AC-20260905-02-4, AC-20260905-02-3) | Newest-first is the user's ask; the phone's address is known only to the user and is configured once, never derived per stop (2026-09-03 ruling). |
| D5 | `design-hub.js stop open --root <r> --kind pick\|approve --key <k> --title <t> --candidates <[group/]label=path,…> [--question <q>]` registers the root, ensures the hub, writes the stop through spec 01's `mocks-picks.js` with `url` = `<base>/p/<name>/atlas/index.html#stop-<id>`, GETs `<base-as-loopback>/p/<name>/atlas/index.html` expecting 200 and a body containing `id="stop-<id>"`, then prints exactly one stdout line: that URL (exit 2 usage · 3 hub unreachable or probe failed, `hub.log` named). `stop decide --root <r> --id <P…> --verdict pick\|approve\|change [--pick <group>] [--note <n>] --by <who>` (re-decidable until consumed, spec 01 D1) and `stop list --root <r>` are the chat channel and the readback (AC-20260905-02-7, AC-20260905-02-8) | A caller's output is "one verified link" only when the script that prints it has just seen the page answer with that stop on it. |
| D6 | `mocks-driver.js stop open <step>`, `<step>` ∈ `shapes` \| `journey:<j>` \| `theme` \| `review:<j>` \| `signoff`, derives the stop from disk and delegates to `design-hub.js` (sibling path, never `spec-paths`): `shapes` → `pick`, key `shape-picked`, groups `<k>` → `shapes/<k>.html` (2–3 required); `journey:<j>` → `approve`, key `journey-approved:<j>`, the journey's seed labels → `mocks/<label>.html` (each must exist); `theme` → `pick`, key `theme-picked`, groups per composed direction with that direction's screens → `theme/<k>/<label>.html` (≥2 required); `review:<j>` → `approve`, key `journey-reviewed:<j>`, same screens as the journey (skinned required); `signoff` → `approve`, key `approved`, every declared label; the driver prints exactly two lines — `🎨 ready for review — <url>` and `Reply  ✅ approve  — or —  ✏️ change <what looks wrong>` (for a pick stop the second line reads `Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>`) — and nothing else; `stop decide <P…> …` passes through to the hub script (AC-20260905-02-9, AC-20260905-02-10) | The driver already knows every candidate set; the session must never type candidates or print anything beyond the link and the fixed reply line (the 2026-09-05 item keeps the reply line). |
| D7 | The marks `shape-picked`, `journey-approved`, `theme-picked`, `journey-reviewed`, `approved` read their verdict from the newest non-superseded stop with the mark's key: none → refuse `no look stop for <key> — run stop open <step> first`; `open` → refuse `waiting on <url>`; decided `change` → refuse `change requested by <by>: "<note>"`; decided `approve`/`pick` → accept and `consumeStop` in the same write as `status.json`; `--shape`/`--direction` may be omitted (the pick is the value) and a given flag that disagrees with the pick refuses. For `shape-picked`/`theme-picked`, when `ledger.md` has no confirmed said-by-user `shape: <k>`/`theme: <k>` row, the driver appends one through `mocks-ledger.appendAssumption` — kind `product`, tag `said-by-user`, status `confirmed <YYYY-MM-DD>`, `rejected` = the other groups comma-joined, `note` = the why-line or `picked on the page` — so the existing rejected-cell check passes by construction; a pre-existing row is still checked as today. Every other precondition (gate, drawn/skinned/reviewed, `data-status`, notes resolved, matrix) stays (AC-20260905-02-11, AC-20260905-02-12, AC-20260905-02-13, AC-20260905-02-14, AC-20260905-02-18) | Approval is a disk record the page or `stop decide --by chat` wrote, never a chat reply the session interprets; the radio's exclusivity is the rejected cell, so the driver derives it rather than asking the session to type it. |
| D8 | The bare step at a look (SHAPES pick, `approve journey <j>`, THEME pick, `review journey <j>`, `sign off`) prints a `look:` progress line and derives its `Then:` line from the stop state: none → `stop open <step>`; `open` → `look: ⏳ waiting — <url>` and `Then:` `end the turn; re-run after the decision`; decided `change` → `look: ✏️ change requested by <by>: <note>` and `Then:` address it, then `stop open <step>`; decided `approve`/`pick` → `look: ✅ approved by <by>` (or `✅ picked "<k>" by <by>`) and `Then:` the mark line with the picked value filled in. SHAPES and THEME pick steps exist as printed steps (the THEME step's `AskUserQuestion` remains only for which directions to *compose*) (AC-20260905-02-15) | The session never derives "what now" from `picks.json` — the driver prints the one next action, per the checkpoint contract. |
| D9 | `spec/commands/mocks.md`: `## SSH / look rule` becomes `## Look rule` — the driver's `stop open <step>` output is the whole hand-off (the 🎨 link line + the fixed reply line), then **end the turn**; no server command, no file paths, no 🆕 lines; a chat reply is recorded with `node {driver} stop decide … --by chat`, never interpreted; the THEME interview drops its pick question; the retired literals `design-atlas)" serve` and `🆕 /mocks/<label>.html` no longer appear. `spec/commands/sketch.md` step 5 opens `sketch:<brief>` on the hub script directly (`--kind approve --key sketch:<brief>` over the brief's `sketch` mocks), prints the same two lines, ends the turn, and reads `stop list` on the next invocation (`decided approve` ratifies, `decided change` is the change round); step 4 no longer tells the user to open the atlas file. `spec/commands/atlas.md` step 3 prints `🎨 <base>/p/<name>/atlas/index.html` after `register` + `ensure`, never a file path or a serve command. `spec/doctrine/design.md` § Design Atlas splits the look-stop rule: **catalog stops** (Storybook) keep today's block verbatim; **mock stops** print the 🎨 link line and the fixed reply line only. `spec/doctrine/mocks.md` § Mocks: Look and Serve says the user's path is the hub link (the serve command is the session's own tool, never printed to the user) and gains `## Mocks: Review Hub` (registry, `ensure`, `/p/<name>/`, inbox, `stop open`, loopback + `base`) (AC-20260905-02-16, AC-20260905-02-17) | Two viewers, two shapes; the doctrine names both so `design-look-handoff.test.js` pins them separately. |
| D10 | `spec/bin/spec-paths` gains `design-hub`; `spec/entrypoints.json` gains a row for `design-hub.js` (entry points `mocks-driver.js`, `sketch.md`, `atlas.md`, `doctrine/mocks.md`); bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.83.0) with the changelog entry `[no-ac: review's version-bump check is the oracle]` (AC-20260905-02-19) | New-surface checklist; the number is a target (§ Gotchas). |
| D11 | Test fixture repair: `tests/mocks/mocks-driver.test.js` gains `decideLook(dir, key, verdict, extra)` writing the decided stop through `lib/mocks-picks.js` (never by hand), called before every existing acceptance of the five marks (including the shared fixture builder); `tests/mocks/mocks-notes.test.js` and `tests/consistency/design-doctrine.test.js` — which mark `shape-picked`/`theme-picked`/`journey-approved` in their setup — get the same seeding; no existing assertion is weakened (AC-20260905-02-18) | Collision closure `executes` leg: D7 reddens every existing acceptance of those marks; the fix is seeding, never a weakened pin. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-hub.js | CREATE | scripts | D1–D5: hub CLI + server; header lists subcommands, state dir, routes, what it does NOT do (never writes status/ledger/notes/mocks; writes `picks.json` only via `mocks-picks.js`), `Exit codes:` 0 · 2 usage/occupied port/name collision/refused decide · 3 hub unreachable or probe failed |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D6/D7/D8: `stop open <step>` + `stop decide` pass-through (sibling-path spawn), verdict-from-disk in the five mark handlers (+ `consumeStop`, ledger-row derivation for picks), `look:` progress lines and `Then:` derivation in the look steps; header updated |
| spec/bin/spec-paths | MODIFY | scripts | D10: `design-hub` key + usage-line entry |
| spec/entrypoints.json | MODIFY | scripts | D10: row for `spec/scripts/design-hub.js` |
| spec/commands/mocks.md | MODIFY | doctrine | D9: `## Look rule`, THEME pick moved to the page, SHAPES gains `stop open shapes`; retired literals removed |
| spec/commands/sketch.md | MODIFY | doctrine | D9: step 4 drops the open-the-file line; step 5 = `design-hub stop open` + the two lines; ratify/change from `stop list` |
| spec/commands/atlas.md | MODIFY | doctrine | D9: step 3 prints the hub atlas link after register + ensure |
| spec/doctrine/design.md | MODIFY | doctrine | D9: look-stop rule split into catalog stops (unchanged block) and mock stops |
| spec/doctrine/mocks.md | MODIFY | doctrine | D9: § Look and Serve reworded; new `## Mocks: Review Hub` |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: version bump + changelog entry |
| tests/design-hub.test.js | CREATE | tests | AC-20260905-02-1, AC-20260905-02-2, AC-20260905-02-3, AC-20260905-02-4, AC-20260905-02-5, AC-20260905-02-6, AC-20260905-02-7, AC-20260905-02-8, AC-20260905-02-19 |
| tests/mocks/mocks-driver.test.js | MODIFY | tests | AC-20260905-02-9, AC-20260905-02-10, AC-20260905-02-11, AC-20260905-02-12, AC-20260905-02-13, AC-20260905-02-14, AC-20260905-02-15, AC-20260905-02-18 — `decideLook` helper (D11) + retagged existing mark tests |
| tests/mocks/mocks-notes.test.js | MODIFY | tests | D11: setup seeds decided stops before `shape-picked`/`theme-picked`/`journey-approved` marks (fixture repair, no AC of its own) |
| tests/consistency/design-doctrine.test.js | MODIFY | tests | D11: the doc-walk fixture seeds decided stops before its marks (fixture repair, no AC of its own) |
| tests/design-look-handoff.test.js | MODIFY | tests | AC-20260905-02-16, AC-20260905-02-17 — mocks/sketch/atlas/doctrine assertions rewritten for the link + reply-line stop; the Step 5 catalog assertions untouched |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260905-02-19 — `design-hub` joins the exhaustive key list |

## Contracts

```
spec/scripts/design-hub.js <subcommand> …        (spec-paths design-hub)

  state dir   $SPEC_DESIGN_HUB_HOME  (default ~/.claude/design-hub/)
              registry.json  {"schemaVersion":1,"port":4600,"base":"http://localhost:4600",
                              "projects":[{"name":"hearwell","root":"/abs/real/path","registeredAt":"<ISO>"}]}
              hub.pid · hub.log
  port        $SPEC_DESIGN_HUB_PORT > registry.port > 4600

  serve                      foreground server on 127.0.0.1:<port>; first stdout line `hub serving <base>`;
                             exit 0 on SIGINT/SIGTERM
  ensure                     stdout: exactly one line, <base>; exit 0 up (already or just spawned);
                             2 port held by a non-hub; 3 spawned but no health within 5 s
  register --root <r> [--name <n>]
                             stdout `registered <name> → <realpath>` | `already registered <name> → <realpath>`;
                             exit 2 root missing / name taken by another root (both roots named, --name remedy)
  config [--base <url>]      prints port/base/project count; --base stores the origin (exit 2 bad URL)
  status                     `hub <base> — up|down · N project(s) · M open stop(s)`
  stop open  --root <r> --kind pick|approve --key <k> --title <t>
             --candidates <[group/]label=path>[,…] [--question <q>]
                             e.g. --candidates ocean/signin=theme/ocean/signin.html,ocean/home=theme/ocean/home.html,ember/signin=theme/ember/signin.html
                             pick: every candidate needs a group · approve: none may have one
                             stdout: exactly one line: <base>/p/<name>/atlas/index.html#stop-<id>
                             exit 2 usage · 3 hub unreachable / probe not 200 / block absent (hub.log named)
  stop decide --root <r> --id <P…> --verdict pick|approve|change [--pick <group>] [--note <n>] --by <who>
                             stdout `decided <id> <verdict>`; exit 2 refused (lib's message)
  stop list  --root <r>      one line per non-superseded stop: `<id> <status> <kind> <key> — <title>`

HTTP (127.0.0.1 only; cache-control: no-store everywhere)
  GET /                      inbox (D4)
  GET /__hub/health          200 {"hub":true,"projects":N,"port":P}
  *   /p/<name>/…            spec 01's createRequestHandler(root, {prefix:'/p/<name>'})
  *   /p/<unknown>/…         404 text naming the project; vanished root → 404 naming the root

mocks-driver.js --root <dir> stop open <step>      <step> shapes | journey:<j> | theme | review:<j> | signoff
  stdout (exactly two lines):
    🎨 ready for review — <url>
    Reply  ✅ approve  — or —  ✏️ change <what looks wrong>          (approve stops)
    Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>      (pick stops)
  exit 0 · 2 precondition (unknown step; journey not declared/drawn; <2 shapes/directions; not skinned
  for review:<j>; not every journey reviewed for signoff) · 3 hub failure (design-hub stderr forwarded)
mocks-driver.js --root <dir> stop decide <P…> --verdict … [--pick …] [--note …] --by <who>   pass-through

mark verdict source (D7)  key per mark:
  shape-picked → shape-picked · journey-approved --journey j → journey-approved:j · theme-picked → theme-picked
  journey-reviewed --journey j → journey-reviewed:j · approved → approved
  refusals (exit 2, stderr):
    mocks-driver: no look stop for <key> — run `stop open <step>` first
    mocks-driver: waiting on <url> — the decision has not been taken yet
    mocks-driver: change requested by <by>: "<note>" — address it, then `stop open <step>`
    mocks-driver: --shape <k> disagrees with the page pick "<pick>" (stop <id>)
  ledger row appended when absent (shape/theme picks):
    | <next id> | SHAPES|THEME | product | shape: <k> | said-by-user | confirmed <date> | <others, comma-joined> | | <why-line or "picked on the page"> |

bare-step `look:` line (D8), one of:
  look: none — `stop open <step>` next
  look: ⏳ waiting — <url>
  look: ✏️ change requested by <by>: <note>
  look: ✅ approved by <by> at <ISO>     |     look: ✅ picked "<k>" by <by> at <ISO>
```

Doctrine block (mocks.md `## Look rule`, sketch.md step 5, design.md mock stops):

```
🎨 ready for review — <url>
Reply  ✅ approve  — or —  ✏️ change <what looks wrong>
```

## Behavior

**Ensure and registry.** `ensure` prints only `base`. A running hub is recognised by
`/__hub/health` returning `hub:true`; anything else on the port is a foreign occupant and
`ensure` refuses rather than guessing. Projects are never auto-removed; a vanished root is
`unreachable` in the inbox and 404 under its prefix. Re-registering the same realpath under the
same name is a no-op.

**Opening a stop.** `stop open journey:staff-session` reads the seed's labels, checks each
mock exists (the `journey-drawn` refusal), builds the candidate list, and delegates. The hub
script registers, ensures, writes the stop with its URL, fetches the project's atlas over
loopback and confirms the `stop-<id>` block is on it, and prints the URL. The driver prints the
🎨 line and the reply line, nothing else. A second `stop open` for the same key supersedes the
earlier stop, so a redraw after a change always yields a fresh block and link.

**Inbox ordering.** All projects' `open` stops are concatenated and sorted by `openedAt`
descending — a stop opened at 10:05 in project B lists above one opened at 10:00 in project A;
ties keep project-name order. Each row links to the stop's anchor on that project's atlas.

**Waiting and deciding.** The session ends its turn after the two lines. On the next bare run
the look step's `look:` line says `⏳ waiting — <url>` and `Then:` says to end the turn. The
page's radio/Approve/Change (spec 01) or `stop decide --by chat` writes the decision; the next
bare run prints the mark line with the picked value filled in, or the change note and a fresh
`stop open`.

**Picks and the ledger.** On `shape-picked`/`theme-picked` the driver takes the picked group as
the value, appends the `shape:`/`theme:` ledger row when absent with `rejected` = the other
groups and `note` = the why-line, then runs today's checks (row present, rejected cell complete,
`data-shape`, direction composed). A session that wrote the row itself first is still accepted
if the row agrees with the pick.

**Sketch and atlas.** `/spec:sketch` step 5 calls the hub script directly (no mocks-driver
state is created — the hub script never touches `status.json`); `/spec:atlas` registers, ensures
and prints the project's atlas link; notes are left on the served pages under the hub.

**Catalog stops are untouched.** `/spec:design` Step 5's Storybook block keeps its shape;
`design-look-handoff.test.js`'s Step 5 assertions stay as they are.

## Acceptance Criteria

- **AC-20260905-02-1**: WHEN `design-hub.js register --root R` runs with `SPEC_DESIGN_HUB_HOME=T` (empty) THE SYSTEM SHALL exit 0, print `registered <basename(R)> → <realpath(R)>`, and leave `T/registry.json` = `{schemaVersion:1, port:4600, base:"http://localhost:4600", projects:[{name, root:realpath(R), registeredAt}]}`; a second identical run exits 0 printing `already registered …` with one project; `register --root R2` with `basename(R2) === basename(R)`, `R2 ≠ R` exits 2 naming both roots and `--name`; with `--name other` it exits 0 and registers a second project → `tests/design-hub.test.js`
- **AC-20260905-02-2**: WHEN `ensure` runs with `SPEC_DESIGN_HUB_PORT=<free port>` and no hub up THE SYSTEM SHALL exit 0, print exactly one stdout line `http://localhost:<port>`, and afterwards `GET http://127.0.0.1:<port>/__hub/health` answers 200 `{hub:true,…}` while the `ensure` process has exited (the child outlives it, pid in `T/hub.pid`); a second `ensure` exits 0 printing the same line without spawning (`hub.log` gains no second `hub serving` line) → `tests/design-hub.test.js` (kills the pid in `finally`)
- **AC-20260905-02-3**: WHEN the port is held by a plain HTTP server answering `200 text/plain ok` on every path THE SYSTEM SHALL make `ensure` exit 2 with stderr naming the port and `SPEC_DESIGN_HUB_PORT`; and WHEN `config --base https://mac.example.ts.net/` ran first THE SYSTEM SHALL make `ensure` (against a real hub) print `https://mac.example.ts.net` and `config` with no flag print a line containing `base https://mac.example.ts.net` → `tests/design-hub.test.js`
- **AC-20260905-02-4**: WHEN the hub serves registered projects `a` (one open stop `P001` opened `2026-09-05T10:00:00Z`), `b` (one open stop `P001` opened `2026-09-05T10:05:00Z` and one decided stop `P002`), and `c` whose root was deleted THE SYSTEM SHALL answer `GET /` 200 text/html in which the link `/p/b/atlas/index.html#stop-P001` appears before `/p/a/atlas/index.html#stop-P001`, `P002` appears in a later section than both, `c` appears with the text `unreachable`, the page contains `<meta http-equiv="refresh" content="30">`, and `GET /__hub/health` answers `{"hub":true,"projects":3,"port":<port>}` → `tests/design-hub.test.js`
- **AC-20260905-02-5**: WHEN `GET /p/a/atlas/index.html` is requested THE SYSTEM SHALL answer 200 text/html containing `id="stop-P001"` and a notes tag `<script src="/p/a/__notes/notes.js">`; `GET /p/a/mocks/x.html?clean` answers the exact file bytes; `POST /p/a/__picks/decide {"id":"P001","verdict":"approve","by":"jj"}` answers 200 and rewrites `<root a>/design/mocks/picks.json` only; `GET /p/nope/atlas/index.html` answers 404 naming `nope`; `GET /p/c/atlas/index.html` answers 404 naming the vanished root → `tests/design-hub.test.js`
- **AC-20260905-02-6**: WHEN the hub is up on `<port>` THE SYSTEM SHALL bind `127.0.0.1:<port>` only — `lsof -nP -iTCP:<port> -sTCP:LISTEN` lists `127.0.0.1:<port>` and no `*:<port>` / `0.0.0.0:<port>` — and `GET /`, `GET /__hub/health`, and `GET /p/a/atlas/index.html` all carry `cache-control: no-store` → `tests/design-hub.test.js`
- **AC-20260905-02-7**: WHEN `stop open --root R --kind approve --key journey-approved:j --title "approve journey j" --candidates a=mocks/a.html,b=mocks/b.html` runs with a free port and an empty state dir THE SYSTEM SHALL exit 0, print exactly one stdout line `http://localhost:<port>/p/<basename(R)>/atlas/index.html#stop-P001`, leave `R/design/mocks/picks.json` holding that open stop with `url` equal to the printed line and candidates `[{group:null,label:'a',path:'mocks/a.html'},{group:null,label:'b',path:'mocks/b.html'}]`, leave the registry holding `R`, and `GET http://127.0.0.1:<port>/p/<name>/atlas/index.html` afterwards contains `id="stop-P001"`; `--kind pick --candidates ocean/signin=theme/ocean/signin.html,ember/signin=theme/ember/signin.html` writes groups `ocean`/`ember`; `--kind pick --candidates a=mocks/a.html` (no group) exits 2 naming `group`; `--candidates` missing exits 2 naming it and writes nothing → `tests/design-hub.test.js`
- **AC-20260905-02-8**: WHEN `stop decide --root R --id P001 --verdict change --note "too dense" --by chat` runs on an open stop THE SYSTEM SHALL exit 0, print `decided P001 change`, and leave the stop `decided` with that note and `by:"chat"`; run again with `--verdict approve --by chat` it exits 0 printing `decided P001 approve` (a re-decide: the earlier `change` is kept under the stop's `previous`, spec 01 D1); after the driver consumed the stop it exits 2 with stderr containing `already consumed`; `stop list --root R` prints `P001 decided approve journey-approved:j — approve journey j` → `tests/design-hub.test.js`
- **AC-20260905-02-9**: WHEN `mocks-driver.js --root R stop open journey:onboarding` runs where journey `onboarding` (labels `signin`, `invite`) is drawn, with `SPEC_DESIGN_HUB_HOME=T` and a free `SPEC_DESIGN_HUB_PORT` THE SYSTEM SHALL exit 0, print exactly two stdout lines — the first matching `^🎨 ready for review — http://localhost:\d+/p/[^/]+/atlas/index\.html#stop-P\d{3}$`, the second exactly `Reply  ✅ approve  — or —  ✏️ change <what looks wrong>` — and leave `R/design/mocks/picks.json` with one open stop `{kind:'approve', key:'journey-approved:onboarding', candidates:[{group:null,label:'signin',path:'mocks/signin.html'},{group:null,label:'invite',path:'mocks/invite.html'}]}` whose `url` equals the first line's URL → `tests/mocks/mocks-driver.test.js` (kills the hub pid in `finally`)
- **AC-20260905-02-10**: WHEN `stop open shapes` runs with `design/shapes/{card-first,orb-hero}.html` THE SYSTEM SHALL write a `pick` stop, key `shape-picked`, candidates `[{group:'card-first',label:'card-first',path:'shapes/card-first.html'},{group:'orb-hero',…}]`, and print `Reply  ✅ pick <name>  — or —  ✏️ change <what looks wrong>` as its second line; `stop open theme` with directions `ocean` (screens `signin`, `home`) and `ember` (`signin`) composed writes a `pick` stop, key `theme-picked`, candidates `{group:'ocean',label:'signin',path:'theme/ocean/signin.html'}`, `{group:'ocean',label:'home',path:'theme/ocean/home.html'}`, `{group:'ember',label:'signin',path:'theme/ember/signin.html'}`; `stop open shapes` with one shape file exits 2 naming `2-3`; `stop open nope` exits 2 naming the five steps → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-11**: WHEN `--mark journey-approved --journey onboarding` runs on a drawn journey with an open ledger gate and NO stop for `journey-approved:onboarding` THE SYSTEM SHALL exit 2 with stderr containing `no look stop for journey-approved:onboarding` and `stop open journey:onboarding`, leaving `journeys.onboarding.approved` null; with an `open` stop (url `U`) it exits 2 with stderr containing `waiting on U`; with a stop decided `change` by `jj` note `too dense` it exits 2 with stderr containing `change requested by jj: "too dense"` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-12**: WHEN the `journey-approved:onboarding` stop is decided `approve` by `jj` THE SYSTEM SHALL accept `--mark journey-approved --journey onboarding` (exit 0, `journeys.onboarding.approved` set, checkpoint line printed) and rewrite that stop to `status:"consumed"`; a decided-approve stop superseded by a newer open stop with the same key makes the mark refuse `waiting on <newer url>` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-13**: WHEN the `shape-picked` stop (groups `card-first`, `orb-hero`) is decided `pick` `card-first` by `jj` with note `cards read faster` and `ledger.md` has no `shape:` row THE SYSTEM SHALL accept `--mark shape-picked` with no `--shape` flag, record `status.shape === "card-first"`, and append to `ledger.md` an assumptions row with claim `shape: card-first`, kind `product`, tag `said-by-user`, status `confirmed <today>`, rejected `orb-hero`, note `cards read faster`; `--mark shape-picked --shape orb-hero` exits 2 with stderr containing `disagrees with the page pick "card-first"`; the same for `theme-picked` on a `theme-picked` stop picked `ocean` (accept without the flag, append `theme: ocean` with rejected `ember`, refuse `--direction ember`) → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-14**: WHEN `--mark journey-reviewed --journey onboarding` runs with review opened and the journey skinned THE SYSTEM SHALL refuse without a decided `journey-reviewed:onboarding` stop and accept with one decided `approve`; WHEN `--mark approved` runs with every journey reviewed, every mock `data-status="approved"`, and the matrix check green THE SYSTEM SHALL refuse without a decided `approved` stop and accept with one → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-15**: WHEN the bare driver runs at the `approve journey onboarding` step THE SYSTEM SHALL print `look: none — \`stop open journey:onboarding\` next` and a `Then:` line containing `stop open journey:onboarding` when no stop exists; `look: ⏳ waiting — <url>` and a `Then:` line containing `end the turn` while the stop is open; `look: ✏️ change requested by jj: too dense` and a `Then:` line containing `stop open journey:onboarding` after a change; `look: ✅ approved by jj at <ISO>` and a `Then:` line containing `--mark journey-approved --journey onboarding` after an approve; at SHAPES with two shape files and no stop the `Then:` line contains `stop open shapes`, and after a pick of `card-first` it contains `--mark shape-picked --shape card-first` → `tests/mocks/mocks-driver.test.js`
- **AC-20260905-02-16**: WHEN `spec/commands/mocks.md`, `spec/commands/sketch.md`, `spec/commands/atlas.md` are read THE SYSTEM SHALL show in mocks.md a `## Look rule` section containing `stop open`, a fenced block whose two content lines are `🎨 ready for review — <url>` and `Reply  ✅ approve  — or —  ✏️ change <what looks wrong>`, the words `end the turn`, and `stop decide` with `--by chat`, and none of `design-atlas)" serve`, `🆕`; in sketch.md step 5 `design-hub`, `stop open`, `--key sketch:`, the same fenced block, `end the turn`, `stop list`, and no `open design/atlas/index.html`; in atlas.md step 3 `design-hub`, `register`, `ensure`, `/atlas/index.html`, and no `design-atlas)" serve` and no `opens the file themselves` → `tests/design-look-handoff.test.js`
- **AC-20260905-02-17**: WHEN `spec/doctrine/design.md` and `spec/doctrine/mocks.md` are read THE SYSTEM SHALL show in design.md § Design Atlas both `catalog stops` (with `sidebar` and `restart it so the sidebar re-indexes`) and `mock stops` (with `🎨 ready for review — <url>` and `end the turn`); in mocks.md a `## Mocks: Review Hub` heading whose section mentions `registry.json`, `ensure`, `/p/<name>/`, `127.0.0.1`, `base`, and `stop open`, and § Mocks: Look and Serve containing `hub link` and the sentence that the serve command is never printed to the user → `tests/design-look-handoff.test.js`
- **AC-20260905-02-18**: WHEN a decided-`approve`/`pick` stop is present for the mark's key THE SYSTEM SHALL CONTINUE TO refuse `journey-approved` before `journey-drawn`, refuse on a blocked ledger gate, refuse `shape-picked` when a pre-existing `shape: <k>` row's `rejected` cell misses a candidate, refuse `theme-picked` with fewer than two composed directions, and refuse `approved` while any mock is not `data-status="approved"` or any note is unresolved → the existing mark tests in `tests/mocks/mocks-driver.test.js`, retagged, each preceded by `decideLook`
- **AC-20260905-02-19**: WHEN `spec-paths design-hub` runs THE SYSTEM SHALL print one line ending in `spec/scripts/design-hub.js` naming an existing file, and `spec-paths nope` prints its usage line containing `design-hub` on stderr; `spec/entrypoints.json` carries a row for `spec/scripts/design-hub.js` → `tests/spec-paths.test.js` (key), `tests/design-hub.test.js` (entrypoints)

## Assumptions (escalation triggers)

- A1: A child spawned with `{detached:true, stdio:'ignore'}` and `unref()` outlives its parent and keeps answering HTTP — executed 2026-09-05 (`scratchpad/spike-detach.js`, Node v26.0.0): `parent exit 0 | child pid 71618 alive: true | GET -> 200 ok`. **if false:** `ensure` prints the `serve` command for the *session* to run as a tracked background task (never the user); the URL contract is unchanged.
- A2: A stopped hub yields `ECONNREFUSED` on the health probe — executed 2026-09-05: `http.get` to `127.0.0.1:4600` → `error code ECONNREFUSED`. **if false:** treat any connection error as "down"; the foreign-occupant refusal keys on a 200 without `hub:true`.
- A3: `mocks-ledger.appendAssumption(text, row)` exists and validates the row (read 2026-09-05, exports line) — D7's row derivation uses it. **if false:** the driver refuses naming the row to add, as today; the derivation is dropped with a recorded deviation.
- A4: The driver test file's shared setup marks `journey-approved`, and `mocks-notes.test.js` / `design-doctrine.test.js` mark `shape-picked`/`theme-picked` in their setup (read 2026-09-05: lines ~144/174/177/284) — D11's seeding must land in every builder, not only in individual tests. **if false:** fewer edits; proceed.
- A5: `design-look-handoff.test.js` asserts `mocks.md` and `sketch.md` contain `✅ approve` and that mocks.md says `ends the turn` (read 2026-09-05, last test) — both survive D9 (the reply line keeps `✅ approve`; the rule keeps `end the turn`); the assertions are retagged, never weakened. **if false:** rewrite in place under AC-16.
- A6: Spec 01 is built first and lands `mocks-picks.js`, `createRequestHandler`, the `#stop-<id>` block, and `/__picks/decide` (`depends_on`). **if false:** `blocked` — build 01 first.
- A7: 7.82.0 is spec 01's target; this spec bumps to the next free minor after it (target 7.83.0). **if false:** bump to the next free version and record the deviation.

## Rationale

The defect being closed is "review needs terminal work", not any one crash. The user runs
~10 projects and reviews on a phone or a desktop browser; every prior fix kept the shape that
fails cold: one server per project, started by a pasted command, addressed by a port. The hub
inverts that — one process per machine, started by whichever session first needs it, one
bookmark, every project under its own prefix, an inbox because "which project wants my look"
is the question the user has when they open the bookmark. The pipeline half makes the marks
take their verdict from the file the page writes, so a session can never mark past a look, and
`stop decide --by chat` keeps the keyboard path honest.

**Why the reply line stays.** The 2026-09-05 queue item says "one verified URL and the fixed
reply line"; the 🆕 name lines are dropped because the page carries the names.

**Why the driver writes the ledger row for picks.** The radio's exclusivity already is the
rejected cell; asking the session to re-type it is a second source of the same fact.

**Why loopback plus `base`.** Spec 10's review forced `serve` to loopback because a notes
endpoint writable from a forwarded port must not be reachable from an open interface; the hub
mounts the decide endpoint too, so the rule holds. The phone path is the tunnel the machine
already has, configured once. A LAN bind with a token was rejected: the remote hosts are reached
over SSH, where a LAN bind helps nobody.

**Why no launchd.** `ensure` from any session covers the after-reboot case the moment a session
runs, and is portable across the Mac and the SSH hosts. An installer can come later.

**Why sketch and atlas are in scope, and the catalog stop is not.** The user dismissed the
planning question on scope and said continue; the recommended default (every mock-based stop)
was applied and is vetoable — drop the sketch.md/atlas.md rows and their AC-16 clauses. Storybook
is a different viewer with its own start command the user runs; its 2026-09-03 block stays
verbatim, pinned by the untouched Step 5 assertions. Collision closure's literals leg (the four
retired strings) hit only `atlas.md`, `mocks.md`, `sketch.md` — every hit is a File Plan row;
its `executes` leg named the four test files that run `mocks-driver.js`, all in the File Plan.

**Why 16 File Plan rows.** Two rows are fixture-only repairs that D7 forces (`executes` hits);
the hub and its consumer belong in one landing unit so the hub never ships as a facade.

**Fragile.** A stop's `url` is captured at open time; changing `base` afterwards leaves old
links stale until a re-open — acceptable, `base` is configured once. The inbox reads every
registered project's `picks.json` per request — fine at ten projects.

## Canonical Delta

`docs/canonical/design.md` gains **Design review hub (specs/20260905/02)** after "Picks":
one hub per machine (`design-hub.js`, `spec-paths design-hub`; state in `~/.claude/design-hub/`,
port 4600 by default, `base` configured once), every project registered under `/p/<name>/` and
served by the same request handler `design-atlas.js serve` uses, the front page an inbox of open
look stops newest first across projects, each linking to the stop's block on that project's
atlas. Every mock look stop — the mocks driver's five looks, `/spec:sketch` ratification,
`/spec:atlas` — opens a stop on the hub and prints the 🎨 link line plus the fixed reply line,
then ends the turn; the decision is taken on the page or recorded from chat with `stop decide
--by chat`, and the driver's marks refuse without it, deriving the ledger's `rejected` cell from
the picked group. The look-stop rule now names two shapes: catalog stops keep the Storybook
block; mock stops are the link. The "SSH rule" sentence is reworded: the serve command is the
session's own tool and is never printed to the user; on a hub machine `design-hub.js ensure`
mounts every registered project.
