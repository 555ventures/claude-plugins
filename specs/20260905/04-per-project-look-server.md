---
date: 2026-09-05
status: done
open_markers: 0
tier: standard
area: design
design: false
breaking: false
depends_on: [specs/20260905/02-design-review-hub-and-look-stops.md]
depended_on_by: [specs/20260905/03-candidate-flows-in-a-journey.md]
brief: n/a
diff_base: 08118416e214cfdaa2cb77aa65cf093a3a949aec
---

# Per-project look server: delete the machine-wide hub, serve only while a look needs it

## Goal

Spec 02 shipped a machine-wide daemon (`design-hub.js`: a registry under `~/.claude/design-hub/`,
a pid file, `ensure`, a cross-project inbox, `/p/<name>/` mounting, a phone `base`). The user
rejected that shape on 2026-09-05: "individual project should handle this, only run when needed,
I don't want something running 24/7 for no reasons, that's waste." Done means: nothing resident
on the machine; every look stop is served by that project's own `design-atlas.js serve`, started
by the session as a tracked background task at the first look of a run and stopped when the run
signs off or the session ends; `stop open` / `stop decide` / `stop list` live on the atlas script
(no status.json side effects, so `/spec:sketch` can use them) and the mocks driver's `stop open
<step>` delegates there; the link is `http://localhost:<port>/atlas/index.html#stop-<id>`; the
hub script, its `spec-paths` key, its entrypoints row, its tests, its doctrine section and its
canonical paragraph are gone; everything the user kept — picks on the page, the two-line
hand-off, marks that refuse without a decided stop, the derived `rejected` cell — is byte-identical.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | DELETE `spec/scripts/design-hub.js`, `tests/design-hub.test.js`, the `design-hub` key + usage entry in `spec/bin/spec-paths`, and the `spec/scripts/design-hub.js` row in `spec/entrypoints.json`; nothing under `~/.claude/design-hub/` is read or written by any script afterwards; no `SPEC_DESIGN_HUB_*` env var is read anywhere (AC-20260905-04-1, AC-20260905-04-8) | The user's ruling: no resident process, no registry. A stripped hub with `ensure` removed would be a second CLI over the same three `stop` verbs — delete it rather than keep a facade. |
| D2 | `design-atlas.js` gains `stop open --root <r> --kind pick\|approve --key <k> --title <t> --candidates <[group/]label=path,…> [--question <q>] [--port <n>]`, `stop decide --root <r> --id <P…> --verdict pick\|approve\|change [--pick <g>] [--note <n>] --by <who>`, `stop list --root <r>` — the three functions move from the hub script with the registry/ensure lines removed; `stop open` writes the stop through `lib/mocks-picks.js` with `url` = `http://localhost:<port>/atlas/index.html#stop-<id>` (port = `--port` else `4173`, serve's own default), then GETs `http://127.0.0.1:<port>/atlas/index.html` expecting 200 and a body containing `id="stop-<id>"`, and prints exactly one stdout line, that URL; the stop stays written when the probe fails (a re-run after serving it supersedes that stop and prints the fresh id's link — spec 01 D1); exit 2 usage/refused decide · 3 probe failed, the message naming the exact remedy `node "$(spec-paths design-atlas)" serve --root <r> [--port <n>]` and "start it as a tracked background task" (AC-20260905-04-2, AC-20260905-04-3, AC-20260905-04-4) | The atlas script already owns the served page and the `/__picks` routes, imports `mocks-picks.js`, and — unlike the mocks driver — creates no `status.json`/`ledger.md`/`seed.md` on a cold root, which `/spec:sketch`'s roadmap-first hosts must never grow. Rejected: putting the raw form on the mocks driver (its module-top `loadStatus()` seeds a cold root). |
| D3 | `mocks-driver.js stop open <step> [--port <n>]` and `stop decide <P…> …` keep their contracts (spec 02 D6: two lines, the pick reply variant, exit 2 preconditions, exit 3 with the child's stderr forwarded) and delegate to `design-atlas.js stop open|decide` by sibling path (`designAtlasBin`, already resolved) instead of `design-hub.js`; `--port` passes through; the `designHubBin` constant and every hub mention in the header go (AC-20260905-04-5, AC-20260905-04-9) | The driver already derives every candidate set; only the child it spawns changes. |
| D4 | Lifetime is the session's, never a script's: doctrine says the session starts `node "$(spec-paths design-atlas)" serve --root . [--port <n>]` as a **tracked background task** immediately before the first `stop open` of a `/spec:mocks`, `/spec:sketch` or `/spec:atlas` run (serve's busy-port branch answers `already serving` when a previous session's server is still up, so the start is idempotent), leaves it running across that run's look stops (the user reads the page after the turn ends), and stops it (the harness's task stop) when the run reaches sign-off / ratification, or when the session ends; no script ever spawns a detached server, writes a pid file, or probes for "is a hub up" beyond D2's page probe. `spec/commands/mocks.md` § Look rule, `spec/commands/sketch.md` step 5, and `spec/commands/atlas.md` step 3 carry this sentence; the serve command is the session's own tool and is never printed to the user (AC-20260905-04-6) | "Only run when needed" is exactly a session-scoped background task; the dev-servers rule (tracked, stopped before finishing) already governs it. A script-spawned detached server is the daemon again under another name. |
| D5 | Doctrine: `spec/doctrine/mocks.md` deletes `## Mocks: Review Hub`; § Mocks: Look and Serve says the user's path is **the look link** (`🎨 ready for review — <url>`, that project's served atlas), names D4's start/stop rule, and keeps "the serve command is never printed to the user"; `spec/doctrine/design.md` § Design Atlas's mock-stops sentence says "decided on the served atlas page or via `stop decide --by chat`" (no "hub"); `spec/commands/sketch.md` step 5 runs `node "$(spec-paths design-atlas)" stop open --root . --kind approve --key sketch:<brief> …` and reads `node "$(spec-paths design-atlas)" stop list --root .`; `spec/commands/atlas.md` step 3 starts serve per D4 and prints `🎨 http://localhost:<port>/atlas/index.html` (the URL from serve's own first stdout line), never a file path; the literals `design-hub`, `spec-paths design-hub`, `SPEC_DESIGN_HUB`, `/p/<name>/`, `Mocks: Review Hub`, `hub page`, `hub link` appear in no command, doctrine, or canonical file (AC-20260905-04-6, AC-20260905-04-7) | Two viewers, two shapes stays (catalog stops untouched); only the mock stop's server changes. |
| D6 | `docs/canonical/design.md`: the **Design review hub (specs/20260905/02)** paragraph is replaced at close by **Look server (specs/20260905/04)** (Canonical Delta below); `spec/.claude-plugin/plugin.json` bumps to the next free minor (target 7.85.0 — a sibling session holds 7.84.0 uncommitted at plan time) with a changelog entry naming the deletion `[no-ac: review's version-bump check is the oracle]`; `spec/entrypoints.json`'s `design-atlas.js` row gains `spec/scripts/mocks-driver.js` and `spec/doctrine/mocks.md` as entry points (both now invoke it) (AC-20260905-04-8) | New-surface checklist in reverse; the number is a target (§ Gotchas). |
| D7 | Tests: `tests/design-atlas.test.js` gains the `stop open|decide|list` ACs (a serve child started with `child_process.spawn` on a free port, killed in `finally`); `tests/mocks/mocks-driver-look-stops.test.js` starts the same serve child in place of the hub (`SPEC_DESIGN_HUB_*` env gone) and asserts the new link shape; `tests/mocks/mocks-driver-fixtures.js` replaces `killHubIn(home)` with `startServe(root, port)` → child and `stopServe(child)`; `tests/spec-paths.test.js` drops `design-hub` from the exhaustive key list and its AC-19 resolution test (retagged as the AC-1 refusal pin); `tests/design-look-handoff.test.js` rewrites the AC-16/AC-17 assertions (hub literals become absence pins, the D4 sentence and the D5 wording become presence pins); the three Step 5 catalog assertions stay untouched; no assertion outside the hub's own surface is weakened (AC-20260905-04-9) | Collision closure: every `executes` hit is a File Plan row; the hub's tests die with the hub. |
| D8 | `specs/20260905/03-candidate-flows-in-a-journey.md` AC-20260905-03-2 is amended at this spec's lock (planning seat, not a worker): the link pattern becomes `^🎨 ready for review — http://localhost:\d+/atlas/index\.html#stop-P\d{3}$`, the env clause becomes "with a `design-atlas.js serve` child on a free `--port`", and "(kills the hub pid in `finally`)" becomes "(stops the serve child in `finally`)"; its `depends_on` adds this spec. `[no-ac: an edit to another spec's text, checked by that spec's own build]` | Spec 03 runs after this one and must not pin the deleted link shape. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D2: `stop open|decide|list` subcommands (moved from the hub script, registry/ensure removed), `--port` on `stop open`, probe + exit 3 remedy; header updated; dispatch + usage line gain `stop` |
| spec/scripts/mocks-driver.js | MODIFY | scripts | D3: `stop open <step> [--port <n>]` / `stop decide` delegate to `designAtlasBin`; `designHubBin` and hub wording removed from header |
| spec/scripts/design-hub.js | DELETE | scripts | D1 |
| spec/bin/spec-paths | MODIFY | scripts | D1: `design-hub` key + usage-line entry removed |
| spec/entrypoints.json | MODIFY | scripts | D1/D6: hub row removed; `design-atlas.js` row gains `spec/scripts/mocks-driver.js`, `spec/doctrine/mocks.md` |
| spec/commands/mocks.md | MODIFY | doctrine | D4/D5: § Look rule gains the serve-as-tracked-task sentence; "hub page" → "served atlas page"; no hub literal |
| spec/commands/sketch.md | MODIFY | doctrine | D4/D5: step 5 serve start + `design-atlas` stop open / stop list |
| spec/commands/atlas.md | MODIFY | doctrine | D4/D5: step 3 serve start + `🎨 http://localhost:<port>/atlas/index.html` |
| spec/doctrine/design.md | MODIFY | doctrine | D5: mock-stops sentence, no "hub" |
| spec/doctrine/mocks.md | MODIFY | doctrine | D5: `## Mocks: Review Hub` deleted; § Look and Serve reworded (look link, D4 lifetime) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6: version bump + changelog entry |
| docs/canonical/design.md | MODIFY | doctrine | D6: Canonical Delta applied in the build wave (deviation at build: AC-20260905-04-1's sweep greps `docs/canonical/`, so the paragraph must be replaced before the build gate can go green; review's CLOSE finds it already applied) |
| tests/design-hub.test.js | DELETE | tests | D1 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260905-04-2, AC-20260905-04-3, AC-20260905-04-4 |
| tests/mocks/mocks-driver-look-stops.test.js | MODIFY | tests | AC-20260905-04-5, AC-20260905-04-9 — serve child instead of hub env, new link pattern |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D7: `startServe`/`stopServe` replace `killHubIn` (fixture repair, no AC of its own) |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260905-04-1 — `design-hub` leaves the key list; refusal pin |
| tests/design-look-handoff.test.js | MODIFY | tests | AC-20260905-04-6, AC-20260905-04-7 |
| tests/consistency/entrypoints.test.js | — | tests | *(orchestrator note, no edit)* derives from `entrypoints.json` + disk; goes green by D1/D6 alone — AC-20260905-04-8 tags it |

Eighteen rows, one landing unit: eleven are deletions or one-line removals of the hub's surface;
the system is green only with all of them together (a deleted script with a live `spec-paths` key
reddens `tests/spec-paths.test.js`; a live hub with a rewritten doctrine reddens the handoff pins).

## Contracts

```
design-atlas.js stop open  --root <r> --kind pick|approve --key <k> --title <t>
                           --candidates <[group/]label=path>[,…] [--question <q>] [--port <n>]
                             pick: every candidate needs a group · approve: none may have one
                             writes the stop (lib/mocks-picks.js) with url = http://localhost:<port>/atlas/index.html#stop-<id>
                             probes GET http://127.0.0.1:<port>/atlas/index.html for 200 + id="stop-<id>"
                             stdout: exactly one line, the url
                             exit 2 usage · 3 probe failed:
                               design-atlas: stop open: nothing answered http://127.0.0.1:<port>/atlas/index.html with stop <id> —
                               start `node "$(spec-paths design-atlas)" serve --root <r> [--port <n>]` as a tracked background
                               task, then re-run stop open (the stop is already written; the re-run supersedes it and prints the fresh link)
design-atlas.js stop decide --root <r> --id <P…> --verdict pick|approve|change [--pick <g>] [--note <n>] --by <who>
                             stdout `decided <id> <verdict>` · exit 2 refused (lib's message)
design-atlas.js stop list  --root <r>     one line per non-superseded stop: `<id> <status> <kind> <key> — <title>`

mocks-driver.js --root <dir> stop open <step> [--port <n>]      unchanged two lines; link shape:
    🎨 ready for review — http://localhost:<port>/atlas/index.html#stop-<id>
    Reply  ✅ approve  — or —  ✏️ change <what looks wrong>        (Reply  ✅ pick <name> … for pick stops)
  exit 0 · 2 precondition (unchanged) · 3 the atlas child failed (its stderr forwarded verbatim)
mocks-driver.js --root <dir> stop decide <P…> --verdict … [--pick …] [--note …] --by <who>   pass-through

Session rule (D4, doctrine text in mocks.md § Look rule, sketch.md step 5, atlas.md step 3):
  before the first stop open of the run:   node "$(spec-paths design-atlas)" serve --root . [--port <n>]
                                           run as a tracked background task (its first stdout line carries the URL;
                                           `already serving` means a previous session's server is still up — reuse it)
  leave it running across the run's look stops; stop the task at sign-off / ratification, or when the session ends
  never printed to the user; the user gets the 🎨 line only

Retired everywhere (commands, doctrine, canonical, scripts, tests except absence pins):
  design-hub · spec-paths design-hub · SPEC_DESIGN_HUB · /p/<name>/ · Mocks: Review Hub · hub page · hub link · ~/.claude/design-hub
```

## Behavior

**A look, end to end.** The mocks driver reaches SHAPES. The session starts the project's
atlas server as a background task (one line of its output: `serving
http://localhost:4173/atlas/index.html …`), runs `stop open shapes`, prints the two lines, ends
the turn. The user opens the link, picks on the page. The next bare run reads the decided stop
and prints the mark line. At sign-off the session stops the task. Between runs nothing is
listening; between look stops of one run the server stays up because the user reads the page
after the turn ends.

**Server not up.** `stop open` writes the stop, probes the page, gets no answer, exits 3 naming
the serve command as a tracked-task remedy. The session starts it and re-runs `stop open`: the
key's newest stop is superseded by the fresh one (spec 01 D1), the printed link is the new id.
No stop is ever left half-written.

**Two projects, one port.** serve's busy-port branch reuses any answering atlas, so a second
project's `stop open` on the default port finds the first project's page and its probe fails
naming `--port`. Pass `--port <n>` to both serve and `stop open` for the second project. This is
the only multi-project story; there is no registry.

**Sketch.** `/spec:sketch` step 5 starts serve, opens `sketch:<brief>` on the atlas script (no
`design/mocks/status.json` is created on a roadmap-first host), prints the two lines, ends the
turn, and reads `stop list` on the next invocation exactly as before.

**Atlas.** `/spec:atlas` step 3 starts serve and prints the served atlas URL from serve's own
first line; notes are left on that page as today.

**Untouched.** `lib/mocks-picks.js`, the `/__picks` and `/__notes` routes, the compare table and
its one-click pick, the five marks' verdict-from-disk and refusals, the ledger `rejected`
derivation, the `look:`/`Then:` lines, and the Storybook catalog stop.

## Acceptance Criteria

- **AC-20260905-04-1**: WHEN `spec-paths design-hub` runs THE SYSTEM SHALL exit 1 printing the usage line on stderr, that line containing no `design-hub`; `spec/scripts/design-hub.js` and `tests/design-hub.test.js` SHALL not exist; and `grep -rn "SPEC_DESIGN_HUB\|design-hub" spec/ tests/ docs/canonical/ .claude/rules/` SHALL match nothing except absence-pin assertion strings inside `tests/` and the historical 7.83.0 changelog entry in `spec/.claude-plugin/plugin.json` (changelog entries are history, never rewritten) → `tests/spec-paths.test.js` (key), `tests/design-look-handoff.test.js` (sweep)
- **AC-20260905-04-2**: WHEN `design-atlas.js serve --root R --port <free>` is up and `design-atlas.js stop open --root R --kind approve --key journey-approved:j --title "approve journey j" --candidates a=mocks/a.html,b=mocks/b.html --port <free>` runs THE SYSTEM SHALL exit 0, print exactly one stdout line `http://localhost:<free>/atlas/index.html#stop-P001`, leave `R/design/mocks/picks.json` holding that open stop with `url` equal to the line and candidates `[{group:null,label:'a',path:'mocks/a.html'},{group:null,label:'b',path:'mocks/b.html'}]`, and `GET http://127.0.0.1:<free>/atlas/index.html` afterwards contains `id="stop-P001"`; `--kind pick --candidates ocean/signin=theme/ocean/signin.html,ember/signin=theme/ember/signin.html` writes groups `ocean`/`ember`; `--kind pick --candidates a=mocks/a.html` exits 2 naming `group`; `--candidates` missing exits 2 naming it and writes nothing → `tests/design-atlas.test.js` (spawns the serve child, kills it in `finally`)
- **AC-20260905-04-3**: WHEN nothing listens on `<free>` and `stop open … --port <free>` runs THE SYSTEM SHALL exit 3, print nothing on stdout, print on stderr a line containing `serve --root` and `tracked background task`, and leave the stop written in `picks.json` with its `url`; a second `stop open` for the same key after serve is started exits 0 printing `…#stop-P002` and leaves `P001` `superseded` → `tests/design-atlas.test.js`
- **AC-20260905-04-4**: WHEN `stop decide --root R --id P001 --verdict change --note "too dense" --by chat` runs on an open stop THE SYSTEM SHALL exit 0, print `decided P001 change`, and leave the stop `decided` with that note and `by:"chat"`; run again with `--verdict approve --by chat` it prints `decided P001 approve` (re-decide, spec 01 D1); after `consumeStop` it exits 2 with stderr containing `already consumed`; `stop list --root R` prints `P001 decided approve journey-approved:j — approve journey j`; `stop open` on a root with no `design/mocks/` SHALL create only `picks.json` there — no `status.json`, `ledger.md`, or `seed.md` → `tests/design-atlas.test.js`
- **AC-20260905-04-5**: WHEN `mocks-driver.js --root R stop open journey:onboarding --port <free>` runs on a drawn journey with a serve child up on `<free>` THE SYSTEM SHALL exit 0 and print exactly two lines — the first matching `^🎨 ready for review — http://localhost:\d+/atlas/index\.html#stop-P\d{3}$`, the second exactly `Reply  ✅ approve  — or —  ✏️ change <what looks wrong>` — with the stop's `url` equal to the first line's URL; with nothing on `<free>` it exits 3 with stderr containing `serve --root`; `stop decide P001 --verdict approve --by chat` prints `decided P001 approve` → `tests/mocks/mocks-driver-look-stops.test.js`
- **AC-20260905-04-6**: WHEN `spec/commands/mocks.md`, `spec/commands/sketch.md`, `spec/commands/atlas.md` are read THE SYSTEM SHALL show in each the words `tracked background task` and `spec-paths design-atlas)" serve`; in mocks.md § Look rule the fenced two-line block, `end the turn`, `stop decide` with `--by chat`, and `served atlas page`; in sketch.md step 5 `design-atlas)" stop open`, `--key sketch:`, `stop list`, and the same fenced block; in atlas.md step 3 `🎨 http://localhost:<port>/atlas/index.html` and no `open design/atlas/index.html`; and none of `design-hub`, `register`, `ensure`, `/p/<name>/`, `hub` in any of the three → `tests/design-look-handoff.test.js`
- **AC-20260905-04-7**: WHEN `spec/doctrine/design.md` and `spec/doctrine/mocks.md` are read THE SYSTEM SHALL show in design.md § Design Atlas `catalog stops`, `sidebar`, `restart it so the sidebar re-indexes`, `mock stops`, `🎨 ready for review — <url>`, `end the turn`, `served atlas page`, and no `hub`; in mocks.md no `## Mocks: Review Hub` heading and no `hub`, and § Mocks: Look and Serve containing `look link`, `tracked background task`, `never printed to the user`, and `already serving` → `tests/design-look-handoff.test.js`
- **AC-20260905-04-8**: WHEN `spec/entrypoints.json` is read THE SYSTEM SHALL carry no `spec/scripts/design-hub.js` row and SHALL list `spec/scripts/mocks-driver.js` and `spec/doctrine/mocks.md` under `spec/scripts/design-atlas.js`, and the repo-wide entrypoints sweep SHALL CONTINUE TO report zero violations → `tests/consistency/entrypoints.test.js` (existing sweep, retagged)
- **AC-20260905-04-9**: WHEN a decided-`approve`/`pick` stop exists for a mark's key THE SYSTEM SHALL CONTINUE TO accept the mark and consume the stop, refuse the mark with `no look stop for <key>` when none exists, `waiting on <url>` while it is open, and `change requested by <by>: "<note>"` after a change; `stop open shapes` SHALL CONTINUE TO print the pick reply line; and the bare step's `look:` lines SHALL CONTINUE TO derive from the stop state → the existing AC-20260905-02-10..15 tests in `tests/mocks/mocks-driver-look-stops.test.js`, retagged, running against the serve child

## Assumptions (escalation triggers)

- A1: `design-atlas.js serve`'s busy-port branch (`already serving` when `/__notes/notes.js` answers 200 on the port) exists and prints the URL line on stdout — read 2026-09-05, `cmdServe`. **if false:** D4's idempotent start needs it; add it under the serve row.
- A2: A background task started by the session survives the end of the turn and is stopped by the harness's task stop or the session's exit — harness behavior the dev-servers rule already relies on (specs/20260902/10 review: the orphaned-server hang was the tracked-task rule's origin). **if false:** the user reads the page after the turn ends, so the link would be dead; fall back to `stop open` printing the serve remedy every time and the user starting nothing — escalate, this is the ruling's load-bearing mechanism.
- A3: `lib/mocks-picks.js` `openStop` supersedes the key's previous non-consumed stop and `readPicks` on a root with no `design/mocks/picks.json` returns `[]` while `writePicks` creates the directory — read 2026-09-05, spec 01 D1. **if false:** `stop open` creates `design/mocks/` itself before writing.
- A4: No claim here is adjudicated by a third-party dependency (Node built-ins and this repo's own scripts only), so no micro-spike ran. **if false:** run the one-line check and record it before build.
- A5: 7.85.0 is the next free minor: `spec/.claude-plugin/plugin.json` reads 7.84.0 in a sibling session's uncommitted tree at plan time (2026-09-05) and spec 03 targets 7.84.0 too. **if false:** bump to the next free version and record the deviation (§ Gotchas).
- A6: `tests/consistency/entrypoints.test.js` enumerates executables from disk and rows from `entrypoints.json`, holding no literal list that names `design-hub.js` — read 2026-09-05. **if false:** the pin joins the File Plan as a MODIFY row at build (a deviation, one line).

## Rationale

**Why delete rather than shrink.** The hub minus its daemon is three `stop` verbs over
`mocks-picks.js`, which the atlas script can host with less code than a second CLI. A stripped
`design-hub.js` would be a facade with one consumer.

**Why the atlas script hosts `stop`, not the mocks driver.** The driver seeds a cold root with
`status.json`, `ledger.md` and `seed.md` on every invocation; `/spec:sketch` runs on roadmap-first
hosts that must not grow a mocks state machine as a side effect of a ratification look. The atlas
script already serves the page the stop renders on and owns the `/__picks` routes.

**Why the session owns the lifetime.** The ruling is "only run when needed". A tracked background
task is the one shape that starts when a look needs it, stays up while the user reads the page
after the turn ends, and dies with the run or the session — no pid file, no probe loop, no
`ensure`. The busy-port reuse from 7.78.0 makes a stale server from a crashed session harmless.

**Why `stop open` writes before it probes.** A failed probe is the common first-look case (the
session forgot to start serve). Writing first means no stop is ever half-written; the remedy is one
command and a re-run, which supersedes the unprobed stop and prints the fresh id (AC-20260905-04-3).

**Why spec 03 is amended here.** It is `hardened` and pins the hub link shape in AC-2; it runs
after this spec, so the amendment is a planning-seat edit recorded in D8, not build work.

**Collision closure** (run at lock: 24 literals hits, 2 waived — `docs/canonical/design.md`, rewritten by the Canonical Delta at review close, the only writer of that file; and the 7.83.0 changelog entry in `spec/.claude-plugin/plugin.json`, which is history): literals `design-hub`,
`SPEC_DESIGN_HUB`, `Mocks: Review Hub`, `/p/<name>/` — every `literals` hit is a File Plan row
(commands, doctrine, canonical, spec-paths, entrypoints, the five test files) or the D8 amendment;
`executes` hits are the files that spawn `mocks-driver.js` / `design-atlas.js`
(`tests/mocks/mocks-notes.test.js`, `tests/consistency/design-doctrine.test.js`,
`tests/spec-paths.test.js`, `tests/design-shell.test.js`) — none of them starts a hub or reads
`SPEC_DESIGN_HUB_*` (they never reach a look), so no fixture repair is owed; the build's
whole-suite check adjudicates.

**Fragile.** Two projects reviewed at once on the default port need `--port`; the atlas has no
notion of which root a running server serves. Acceptable: the user reviews one project at a time.

**Build deviations (folded at close, 2026-09-05 — all one-offs).** (1) AC-20260905-04-1's sweep greps
`docs/canonical/`, so the Canonical Delta was applied in the doctrine wave (File Plan row added)
rather than at review close; CLOSE found it in place. (2) A5 was false — 7.85.0 had shipped between
plan and build — so the bump is 7.86.0. (3) AC-6 makes `spec/commands/mocks.md` carry the literal
`spec-paths design-atlas)" serve` sentence, which the entrypoints sweep counts as an invocation, so
the `design-atlas.js` manifest row also names that command; `spec/doctrine/mocks.md` § Look and
Serve names the same call so its declared entry point is backed by a literal. (4) A pre-existing
"copy register" phrase in `spec/commands/atlas.md` collided with AC-6's `register` ban and became
"copy tone". (5) Red-phase tests isolated the pre-image's unconditional hub spawn behind a `HOME`
override and fragment-assembled literals; that scaffolding was removed once D3 landed, and the one
look-stops test that still relied on the hub's auto-spawn was wrapped in a serve child. (6) Two
transient in-build reds (the entrypoints sweep before the doctrine wave; the look-stops test before
its serve wrap) were resolved before the final gate.

## Canonical Delta

`docs/canonical/design.md`: replace the paragraph **Design review hub (specs/20260905/02)** with
**Look server (specs/20260905/04)**: there is no resident process. A mock look stop is served by
that project's own `design-atlas.js serve`, which the session starts as a tracked background task
before the first `stop open` of a run and stops at sign-off or when the session ends (a server a
previous session left up is reused — serve answers `already serving`). `design-atlas.js stop
open|decide|list` own the stop CLI (`stop open` writes the stop through `lib/mocks-picks.js`,
probes the served page for the stop's block and prints the one link
`http://localhost:<port>/atlas/index.html#stop-<id>`; exit 3 names the serve command as the
remedy); the mocks driver's `stop open <step>` delegates there. The user's path is the 🎨 link;
the serve command is never printed to them. Picks on the page, the two-line hand-off, marks
refusing without a decided stop, and the derived `rejected` cell are unchanged from specs
20260905/01–02.

**Review amendment (2026-09-05, review iteration 1, disposition s0 fix).** D2's "prints the same link" sentence, the Contracts remedy parenthetical and the Rationale's "stable across that re-run's supersede" line contradicted AC-20260905-04-3 and § Behavior; all three now state the supersede-and-fresh-link behavior the AC pins, and the script's remedy text was reworded to match.
