---
date: 2026-08-27
status: implementing
diff_base: f5e393b5f6a4c60941f937ec54c72d0796e34a98
tier: standard           # driver + templates + doctrine; no hook, no frozen script, no contract edit
area: genesis
design: false
breaking: false
depends_on: [specs/20260825/04-genesis-driver.md]
depended_on_by: [specs/20260827/02-genesis-explore-state.md]
brief: 10a
spiked: 2026-08-27
open_markers: 0
---

# The tournament of scaffolds: decisions on executed evidence

## Goal

Between the picks and the decision record, `genesis-driver.js` gains a **tournament**: the
user may mark 2–3 finalist stacks to race; the driver scaffolds each one for real into an
ignored folder, runs its zero-day gate, boots it to readiness through `smoke.sh`'s contract,
and hands the session one **probe slice** per finalist to build with Sonnet workers under a
two-retry cap; the driver then re-runs gate + boot, assembles a **benchmark table** and a
screenshot gallery, and prints the PICK step. Executed evidence informs the user's pick; it
never makes it. The winner is **re-scaffolded clean** into the project root (JJ ruling
2026-08-27) and the raced copies are deleted once the decision record cites the benchmark.
Done means: the states run end-to-end against a synthetic host, a non-tournament archetype is
untouched, every step text names its doctrine, and the suite is green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New states between `MENUS` and `DECIDE`: `FINALISTS` → `RACE` (driver-only) → `PROBE` → `PICK`; entered only for **tournament archetypes** `web-app`, `realtime-trading`, `backend-api`, `mobile-app`, `desktop-app` — every other archetype derives `MENUS → DECIDE` unchanged and writes no `.claude/genesis/tournament/`; `--mark finalists-skipped` records `tournament: {skipped: true, at}` and advances to `DECIDE`; `spec/templates/status.json` gains `tournament: null` (AC-20260827-01-1) | Brief 10a § C: the tournament is opt-in per run and archetype-conditioned; a skipped race leaves one candidate + the boot check, as today |
| D2 | `--mark menus-done` additionally requires a `- archetype: <key>` line in `## Picks`, `<key>` ∈ the eight registry keys (`web-app` `mobile-app` `conversational-bot` `backend-api` `realtime-trading` `cli-devtool` `data-ml` `desktop-app`); missing → exit 2 naming `archetype` and the grammar; unknown → exit 2 naming the value and the eight keys; success stores `status.archetype`; `genesis-brief.md`'s `## Picks` comment states the line (AC-20260827-01-2) | The driver must know the archetype before the descriptor exists — it conditions the tournament (D1) and, in spec 02, the explore state; `status.archetype` was a template key nothing wrote |
| D3 | `--mark finalists-written --file <f>` (template `spec/templates/finalists.json`): `finalists` is an array of **2–3** entries, each `{name, picks, scaffoldCommand, gateCommand, bootCommand, readyCheck}` (+ optional `readyTimeout` int seconds, default 120); `name` matches `/^[a-z0-9-]+$/` and is unique; the four commands are non-empty strings; `picks` is an object whose keys ⊆ `## Open Dimensions` keys; **at least one finalist's `picks` equals the brief's current `## Picks` labels on every key it names** (the incumbent); fewer than 2 → `at least 2 finalists`, more than 3 → `at most 3 finalists`, any other failure names the finalist and field; success records `tournament.finalists` and advances to `RACE` (AC-20260827-01-3) | One finalist = a stack combination the session composes from the menus; the incumbent rule keeps the picks and the race consistent; 2–3 is the brief's cap |
| D4 | FINALISTS step text is the **go/no-go line**: the archetype's probe tasks (D6), the retry cap, `cost: roughly one mini-build per finalist (scaffold + gate + boot + probe slice)`, and `last measured: <n> tokens/finalist` read from an existing `tournament/benchmark.json`, else `last measured: no figure yet` (AC-20260827-01-3) | Brief 10a: cost is stated at kickoff and is a go/no-go line |
| D5 | RACE (driver-only, bare invocation): once, writes `.claude/genesis/tournament/.gitignore` = `finalists/\nlogs/\n`; then for each finalist with no `tournament.race[name]` yet, in file order: `mkdir -p tournament/finalists/<name>`; `runShell(scaffoldCommand, cwd: <finalistDir>, log: tournament/logs/<name>.scaffold.log)`; scaffold exit ≠ 0 → `race[name] = {scaffold: {exit}, at}` and **nothing further is spent** on it; else `runShell(gateCommand, cwd, tournament/logs/<name>.gate.log)`, then boot: writes `<finalistDir>/.genesis-smoke.json` = `{"runtime": {"bootCommand", "readyCheck", "readyTimeout", "stopExitCodes": [0, 143]}}` and runs `bash <smoke.sh> --config <abs path>` with `cwd: <finalistDir>`, output to `tournament/logs/<name>.boot.log`, recording `boot: {exit, sentinel}` (`sentinel` = the first `__SMOKE_` line of the log, or null); `race[name] = {scaffold, gate, boot, at}`; a finalist with a recorded race is never re-raced; then state `PROBE` (AC-20260827-01-4) | `runShell` gains a `cwd` parameter (default `root`); `smoke.sh` is reused unchanged — the boot contract is already its own (brief: "smoke.sh's contract"); `stopExitCodes` includes 143 because a dev server with no TERM handler exits 128+15 |
| D6 | `PROBE_TASKS` (driver table, printed in the step): `web-app`/`realtime-trading` → `authed-crud-screen`, `background-job`, `style-tile`; `backend-api` → `authed-crud-resource`, `background-job`; `mobile-app`/`desktop-app` → `authed-list-detail-screen`, `async-task`, `style-tile`. Tile source list (this spec): `.claude/genesis/sketch.html` when it exists, rendered with the finalist's real component library; when it does not exist the `style-tile` task is dropped from the expected set. PROBE step prints, per finalist with `scaffold.exit === 0`: the race results, the expected tasks, the tile sources, `retry cap: 2 per task`, the evidence dir `tournament/evidence/<name>/` and the `probe.json` shape (Contracts) (AC-20260827-01-5) | Brief 10a's probe slices confirmed at plan (desktop included — its design stage is `full`); the culled explore positions replace the sketch as tile source in spec 02 |
| D7 | `--mark probe-done`: for every finalist with `scaffold.exit === 0`, `tournament/evidence/<name>/probe.json` parses as `{tasks: [{task, passed, retries, tokens, screenshot}]}` covering exactly the expected task set (one entry per tile for `style-tile`, keyed `tile`), `passed` boolean, `retries` integer 0–2, `tokens` integer ≥ 0, `screenshot` null or an existing file; refusal names the finalist and the offender. On success the driver re-runs gate and boot per such finalist (logs `<name>.gate.post.log`, `<name>.boot.post.log`) into `tournament.post[name]`, writes `tournament/benchmark.json` and `benchmark.md` (columns: finalist · scaffold exit · gate pre/post · booted pre/post · probe passed x/y · retries · tokens · screenshots) and `tournament/gallery.html` (rows = tasks carrying a screenshot, columns = finalists, one `<img>` per cell, relative paths), and advances to `PICK`. `tokens` are summed from `probe.json` — the harness-reported `subagent_tokens` the session records — never estimated (AC-20260827-01-5, AC-20260827-01-6) | The benchmark is the decision record's evidence appendix; post-probe gate + boot are the executed facts that the probe slice left the finalist green and bootable |
| D8 | PICK step prints `benchmark.md` verbatim, the line `executed evidence informs the pick; it never makes it — two finalists that both pass are ranked by the coverage answers, stated`, and the mark; `--mark picked`: the brief's `## Picks` labels equal exactly one finalist's `picks` on every key that finalist names → `tournament.winner = <name>`; zero or several matches → exit 2 naming the count and the remedy (`rewrite ## Picks to the winner's labels`) (AC-20260827-01-6) | Memory `feedback-genesis-options-not-autopick`: executed evidence never picks; the pick is the brief's own `## Picks`, so the record stays one file |
| D9 | `--mark decided`, when `tournament.winner` is recorded: the descriptor's `scaffoldCommand` must equal the winner's; at least one listed ADR must contain the literal `.claude/genesis/tournament/benchmark.md`; either failure → exit 2 naming `scaffoldCommand` / `benchmark.md`; on success the driver deletes `tournament/finalists/` and `tournament/logs/` (`fs.rmSync` recursive), keeping `benchmark.json`, `benchmark.md`, `gallery.html`, `evidence/`; `SCAFFOLD` then runs the winner's `scaffoldCommand` in the project root exactly as today (AC-20260827-01-7) | JJ 2026-08-27: fresh scaffold — the probe slice was built under retry caps with no spec and no review and must not become the foundation; the benchmark survives as the ADR's cited evidence |
| D10 | Every state's step text carries a `Doctrine: spec/doctrine/genesis.md § Genesis: <section>` line (DISCOVERY → Discovery Interview; MENUS → Discovery Interview; FINALISTS/PROBE/PICK → Tournament of Scaffolds; DECIDE → Decision Record (one proposer); SKELETON → Day-Zero Skeleton; ROADMAP → Roadmap Decomposition; SCAFFOLD_RED/GATE_RED as their remedies already cite); `spec/commands/genesis.md`'s `## Per-state judgment pointers` section is **deleted** — the driver prints the pointer (AC-20260827-01-8) | The command sits at 119 of its 120-line pin (AC-20260825-04-9); three new states cannot be added as prose there, and a pointer the driver prints per step is one binding home instead of two |
| D11 | `spec/doctrine/genesis.md` gains `## Genesis: Tournament of Scaffolds` (the states, the probe-task table's home is the driver, evidence informs never decides, cost line, retry cap, re-scaffold clean, the `finalists.json`/`probe.json`/`benchmark.json` roster); `## Genesis: State Machine` and `## Genesis: On-disk Handoff` list the new states and `tournament/` (AC-20260827-01-8) | Doctrine = invariants; the driver = execution |
| D12 | Regression pins: `--mark menus-done` SHALL CONTINUE TO refuse a missing pick line; a second bare run in `SKELETON` SHALL CONTINUE TO not re-execute the root scaffold; a non-tournament archetype SHALL CONTINUE TO reach `DECIDE` straight from `MENUS` (AC-20260827-01-9) | A state-machine insertion must be observed to change only the states it names |
| D13 | Tests: `tests/genesis/tournament.test.js` drives the real driver against synthetic `tmpdir()` hosts with fake shell commands (`touch`, `exit N`, and the spike's boot line — Assumptions A1); `tests/genesis/genesis-driver.test.js`'s AC-20260825-04-3 fixture gains the archetype line and the AC-3/AC-5 tests gain the `AC-20260827-01-9` tag; `tests/consistency/genesis-doctrine.test.js` gains AC-8 [no-ac: test-plumbing row] | Behavioral tests over synthetic hosts (rules § Test Rules); pins tagged onto existing covering tests, never duplicated |
| D14 | `spec/.claude-plugin/plugin.json` bumps to the next free 7.40.x with a changelog paragraph naming the tournament states, the benchmark, the archetype line, and the re-scaffold rule [no-ac: plugin-version guard] | — |
| D15 (orchestrator ruling, 2026-08-27) | The archetype line added to `tests/genesis/genesis-driver.test.js`'s shared `writeBrief`/`advanceToDecide` fixture is `- archetype: data-ml`, not `web-app`: AC-20260827-01-9 pins the data-ml continuation onto the AC-20260825-04-3 and -5 tests, and those tests assert `DECIDE` straight after `menus-done` and then drive on into SCAFFOLD/GATE — a tournament archetype would stop them at `FINALISTS` and force the existing pins to be rewritten. The File Plan row's `web-app` is a slip; AC-9 is the terminal observable and governs [no-ac: covered by AC-20260827-01-9] | Never weaken an existing pin to satisfy a summary column; the AC text is the contract |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/genesis-driver.js | MODIFY | scripts | D1–D10 |
| spec/templates/finalists.json | CREATE | doctrine | D3 |
| spec/templates/status.json | MODIFY | doctrine | D1 `tournament: null` |
| spec/templates/genesis-brief.md | MODIFY | doctrine | D2 archetype line grammar in the `## Picks` comment only |
| spec/doctrine/genesis.md | MODIFY | doctrine | D11 |
| spec/commands/genesis.md | MODIFY | doctrine | D10 (delete the pointer section; Setup unchanged) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D14 |
| tests/genesis/tournament.test.js | CREATE | tests | AC-20260827-01-1, AC-20260827-01-2, AC-20260827-01-3, AC-20260827-01-4, AC-20260827-01-5, AC-20260827-01-6, AC-20260827-01-7, AC-20260827-01-8 (step texts) |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260827-01-9 (pins tagged onto the AC-20260825-04-3 and -5 tests; the AC-3 fixture's `## Picks` gains `- archetype: web-app`) |
| tests/consistency/genesis-doctrine.test.js | MODIFY | tests | AC-20260827-01-8 |

## Contracts

States (full enum after this spec): `DISCOVERY` → `MENUS` → [`FINALISTS` → `RACE` → `PROBE` →
`PICK`] → `DECIDE` → `SCAFFOLD` → `SKELETON` → `GATE` → `GATE_RED` | `ROADMAP` → `HANDOFF`.
Marks added (closed set): `finalists-written --file <f>` · `finalists-skipped` · `probe-done` ·
`picked`.

`spec/templates/finalists.json`:

```json
{
  "schemaVersion": 1,
  "finalists": [
    {
      "name": "next-bun",
      "picks": { "framework": "Next.js 15 (App Router)", "language-runtime": "Bun 1.x" },
      "scaffoldCommand": "bunx create-next-app@latest . --typescript --app --yes",
      "gateCommand": "bun run lint && bun run build",
      "bootCommand": "bun run dev",
      "readyCheck": "curl -sf http://127.0.0.1:3000/ >/dev/null",
      "readyTimeout": 120
    },
    {
      "name": "tanstack-node",
      "picks": { "framework": "TanStack Start", "language-runtime": "Node 24 LTS" },
      "scaffoldCommand": "npx create-tsrouter-app@latest . --template file-router",
      "gateCommand": "npm run lint && npm run build",
      "bootCommand": "npm run dev",
      "readyCheck": "curl -sf http://127.0.0.1:3000/ >/dev/null"
    }
  ]
}
```

`tournament/evidence/<name>/probe.json` (session-written):

```json
{
  "tasks": [
    { "task": "authed-crud-screen", "passed": true, "retries": 1, "tokens": 48211, "screenshot": ".claude/genesis/tournament/evidence/next-bun/authed-crud-screen.png" },
    { "task": "background-job", "passed": true, "retries": 0, "tokens": 30990, "screenshot": null },
    { "task": "style-tile", "tile": "sketch", "passed": true, "retries": 0, "tokens": 22040, "screenshot": ".claude/genesis/tournament/evidence/next-bun/style-tile.sketch.png" }
  ]
}
```

`status.tournament` (driver-written):

```json
{
  "finalists": ["next-bun", "tanstack-node"],
  "race": { "next-bun": { "scaffold": { "exit": 0 }, "gate": { "exit": 0 }, "boot": { "exit": 0, "sentinel": "__SMOKE_PASS__ ready after 6s, …" }, "at": "…" },
            "tanstack-node": { "scaffold": { "exit": 3 }, "at": "…" } },
  "post": { "next-bun": { "gate": { "exit": 0 }, "boot": { "exit": 0, "sentinel": "…" }, "at": "…" } },
  "winner": "next-bun",
  "skipped": false
}
```

`tournament/benchmark.json`: `{ "finalists": [{ "name", "scaffold": exit, "gatePre": exit|null,
"bootPre": exit|null, "gatePost": exit|null, "bootPost": exit|null, "probePassed": n,
"probeTotal": n, "retries": n, "tokens": n, "screenshots": [paths] }], "at" }` — `benchmark.md`
is the same table rendered; `gallery.html` is a static grid of `<img>` cells.

Step-text excerpts:

```
## Step: name the finalists to race (or skip the race)
Read only: .claude/genesis/brief.md (## Open Dimensions, ## Picks), .claude/genesis/interview-research/*.json
Doctrine: spec/doctrine/genesis.md § Genesis: Tournament of Scaffolds
probe tasks (web-app): authed-crud-screen, background-job, style-tile · retry cap: 2 per task
cost: roughly one mini-build per finalist (scaffold + gate + boot + probe slice) · last measured: no figure yet
Then:
  node …/genesis-driver.js --root <root> --mark finalists-written --file <finalists.json>
  node …/genesis-driver.js --root <root> --mark finalists-skipped
```

Exit codes unchanged: 0 step printed / mark accepted · 2 precondition or refused mark (remedy
named) · child dying with no status → 2 via `runChild`.

## Behavior

- A cold host that reaches `menus-done` with `- archetype: backend-api` prints `FINALISTS`;
  with `- archetype: data-ml` prints `DECIDE` and never creates `tournament/`.
- `RACE` runs only on a bare invocation in that state; `--state` reports `RACE` without racing
  (the F3 peek contract extends to the new driver-only state).
- A finalist whose scaffold fails is listed in PROBE as `failed at scaffold — spent no further`
  and owes no `probe.json`.
- `probe-done` on a finalist with zero expected tasks is impossible by construction (every
  tournament archetype has ≥2 tasks).
- The tile source is printed as a path the worker renders **inside** the finalist with its real
  component library; the driver never renders anything.
- After `decided`, `tournament/finalists/` is gone; `SCAFFOLD` runs the winner's
  `scaffoldCommand` in the root — the raced copy is never moved.

## Acceptance Criteria

- **AC-20260827-01-1**: WHEN `--mark menus-done` is accepted with `- archetype: data-ml` THE
  SYSTEM SHALL print `state: DECIDE` and `.claude/genesis/tournament/` SHALL NOT exist; WHEN
  the archetype is `backend-api` THE SYSTEM SHALL print `state: FINALISTS` with a line matching
  `/^cost: roughly one mini-build per finalist/m` and `/^last measured: no figure yet/m`; WHEN
  `--mark finalists-skipped` runs THE SYSTEM SHALL record `tournament.skipped === true`, print
  the checkpoint `(FINALISTS → DECIDE)`, and the next bare run SHALL print `state: DECIDE` →
  `tests/genesis/tournament.test.js`
- **AC-20260827-01-2**: WHEN `--mark menus-done` runs with every pick line present but no
  `- archetype:` line THE SYSTEM SHALL exit 2 with stderr naming `archetype`; WHEN the line is
  `- archetype: bogus` THE SYSTEM SHALL exit 2 naming `bogus` and `web-app`; WHEN it is
  `- archetype: web-app` THE SYSTEM SHALL exit 0 and `status.json` SHALL carry
  `archetype: "web-app"` → `tests/genesis/tournament.test.js`
- **AC-20260827-01-3**: WHEN `--mark finalists-written --file f` runs with one finalist THE
  SYSTEM SHALL exit 2 naming `at least 2 finalists`; with four → `at most 3 finalists`; with a
  finalist lacking `readyCheck` → naming that finalist and `readyCheck`; with no finalist whose
  `picks` equals the brief's `## Picks` → naming `## Picks`; WHEN two valid finalists include the
  incumbent THE SYSTEM SHALL exit 0, record `tournament.finalists` as their names in order, and
  print the checkpoint `(FINALISTS → RACE)` → `tests/genesis/tournament.test.js`
- **AC-20260827-01-4**: WHEN the bare run reaches `RACE` with finalist `a` (`scaffoldCommand:
  "touch scaffolded.txt"`, `gateCommand: "exit 0"`, `bootCommand: "touch booted; trap 'exit 0'
  TERM; while :; do sleep 1; done"`, `readyCheck: "test -f booted"`) and finalist `b`
  (`scaffoldCommand: "exit 3"`) THE SYSTEM SHALL create
  `tournament/finalists/a/scaffolded.txt`, record `race.a.scaffold.exit === 0`,
  `race.a.gate.exit === 0`, `race.a.boot.exit === 0` with `sentinel` matching
  `/^__SMOKE_PASS__/`, record `race.b.scaffold.exit === 3` with no `gate`/`boot` keys, write
  `tournament/.gitignore` equal to `finalists/\nlogs/\n`, write the three `a` logs, and print
  `state: PROBE`; a second bare run SHALL NOT re-run any command (delete `scaffolded.txt` →
  still absent) and `--state` SHALL print `PROBE` → `tests/genesis/tournament.test.js`
- **AC-20260827-01-5**: WHEN the PROBE step prints for archetype `web-app` with
  `.claude/genesis/sketch.html` present THE SYSTEM SHALL list `authed-crud-screen`,
  `background-job`, `style-tile` and the sketch path; without the sketch it SHALL list two tasks
  and no `style-tile`; WHEN `--mark probe-done` runs with `a`'s `probe.json` carrying
  `retries: 3` THE SYSTEM SHALL exit 2 naming `a` and `retries`; with `background-job` missing
  → naming `background-job`; WHEN it is valid (`tokens` 100 + 200 + 50) THE SYSTEM SHALL
  re-execute `a`'s gate (a `gateCommand` of `echo run >> gate-runs.txt` leaves two lines) and
  boot, write `benchmark.json` with `finalists[0].tokens === 350` and `probePassed`/`probeTotal`,
  write `benchmark.md`, write `gallery.html` containing each recorded screenshot path, and print
  `state: PICK` → `tests/genesis/tournament.test.js`
- **AC-20260827-01-6**: WHEN `--mark picked` runs with `## Picks` matching no finalist THE
  SYSTEM SHALL exit 2 naming `0` matches and `## Picks`; WHEN `## Picks` matches finalist `b`
  THE SYSTEM SHALL record `tournament.winner === "b"` and print the checkpoint `(PICK →
  DECIDE)`; the PICK step text SHALL contain the `benchmark.md` table and the line `executed
  evidence informs the pick; it never makes it` → `tests/genesis/tournament.test.js`
- **AC-20260827-01-7**: WHEN `--mark decided` runs after a race with a descriptor whose
  `scaffoldCommand` differs from the winner's THE SYSTEM SHALL exit 2 naming `scaffoldCommand`;
  WHEN it matches but no ADR names `.claude/genesis/tournament/benchmark.md` THE SYSTEM SHALL
  exit 2 naming `benchmark.md`; WHEN both hold THE SYSTEM SHALL exit 0, delete
  `tournament/finalists/` and `tournament/logs/`, keep `benchmark.json`, `benchmark.md`,
  `gallery.html`, and `evidence/`, and the next bare run SHALL execute the winner's
  `scaffoldCommand` in the root (`touch root-scaffolded.txt` exists in `--root`) →
  `tests/genesis/tournament.test.js`
- **AC-20260827-01-8**: WHEN the driver prints any of `DISCOVERY`, `MENUS`, `FINALISTS`,
  `PROBE`, `PICK`, `DECIDE`, `SKELETON`, `ROADMAP` THE SYSTEM SHALL include a line matching
  `/^Doctrine: spec\/doctrine\/genesis\.md § Genesis: /m`; `spec/commands/genesis.md` SHALL NOT
  contain `## Per-state judgment pointers` and SHALL stay ≤ 120 lines; `spec/doctrine/genesis.md`
  SHALL contain `## Genesis: Tournament of Scaffolds`; `spec/templates/status.json` SHALL carry
  the key `tournament`; `spec/templates/finalists.json` SHALL parse with exactly two finalists
  each carrying the four command keys → the step-text assertions in
  `tests/genesis/tournament.test.js` (synthetic host); the file assertions in
  `tests/consistency/genesis-doctrine.test.js`
- **AC-20260827-01-9**: WHEN `--mark menus-done` runs before a `- hosting: <label>` pick line
  exists THE SYSTEM SHALL CONTINUE TO exit 2 naming `hosting`; WHEN a second bare run follows a
  green root scaffold THE SYSTEM SHALL CONTINUE TO not re-execute `scaffoldCommand`; WHEN the
  archetype is `data-ml` THE SYSTEM SHALL CONTINUE TO print `DECIDE` directly after `menus-done`
  → `tests/genesis/genesis-driver.test.js` (tagged onto the AC-20260825-04-3 and -5 tests)

## Assumptions (escalation triggers)

- A1 (executed micro-spike 2026-08-27, S3): `smoke.sh --config <absolute path>` spawned with
  `cwd` = a scratch dir and `bootCommand: "touch booted; trap 'exit 0' TERM; while :; do sleep
  1; done"`, `readyCheck: "test -f booted"`, `stopExitCodes: [0, 143]` → status 0,
  `__SMOKE_PASS__ ready after 2s, stopped cleanly (exit 0)`, and `booted` created **inside the
  cwd** — the boot leg needs no smoke.sh change — **if false**: STOP, the finalist boot contract
  is wrong by construction.
- A2 (executed micro-spike 2026-08-27, S2/S2b): a `.gitignore` inside `tournament/` reading
  `*/` + `!evidence/` does NOT un-ignore `evidence/<name>/file.png` (git check-ignore exit 0 —
  the nested dir is re-excluded); `finalists/` as the only line ignores
  `finalists/<name>/package.json` (exit 0) and leaves `evidence/<name>/style-tile.png` and
  `benchmark.json` tracked (exit 1; `git add -A` stages both) — hence D5's layout — **if
  false**: STOP.
- A3 (executed 2026-08-27, S7): `fs.rmSync(dir, {recursive: true, force: true})` on
  `tournament/finalists` leaves `benchmark.json` and `evidence/` siblings intact — **if false**:
  the deletion moves to a `bash -c 'rm -rf'` through `runShell`; never a spared directory.
- A4: the harness reports `subagent_tokens` on every `Agent` completion (brief 10a, executed
  2026-08-25: a trivial Haiku call reported `21927`) — the session copies it into `probe.json`
  — **if false**: `tokens` is recorded `null` and the benchmark column prints `unreported`;
  never an estimate.
- A5: `runShell` accepts a `cwd` option (today it hardcodes `root`) — an additive parameter
  with `root` as default keeps AC-20260825-04-5/-6 byte-identical — **if false** (a worker finds
  the root scaffold path changed): the whole-suite check names it; fix the parameter, never the
  pin.
- A6: two finalists boot **sequentially** on the same default port; `smoke.sh` stops each one
  before the next starts, and its pre-boot stale-ready probe (exit 7) catches a lingering
  server as `boot.exit === 7` with the `__SMOKE_FAIL__ stale-ready` sentinel — recorded, never a
  pass — **if false**: the readyCheck the session authored is wrong; the log names it.
- A7: `design-atlas.js` is not needed here — the gallery is a static `<img>` grid the driver
  emits (no candidate dirs, no tokens check); spec 02 keeps `design-atlas.js gallery` for the
  Round-0 tiles — **if false** (a shared emitter is wanted): lift it in spec 02, never a
  cross-require between two entry points.

## Rationale

Brief 10 unit C, deferred to 10a so it could describe the real driver. The tournament is the
one place genesis decides on executed evidence rather than argument: today the only executed
check is that the winner's scaffold boots; after this spec every finalist has been scaffolded,
gated, booted, and made to carry one thin vertical slice by the same Sonnet workers the
pipeline will use, and the numbers sit side by side. The driver owns every executed step
(scaffold, gate, boot, post-probe re-run, the benchmark) and prints the judgment steps: which
finalists to race, the probe build, the pick.

**Re-scaffold clean** (JJ, 2026-08-27, recommended and taken): the probe slice is benchmark
code built under retry caps with no spec and no review; it must not become the foundation
everything later inherits. The cost is one more `create-*` run; the alternative was rejected
because the first roadmap brief would start from unreviewed code.

**The archetype line (D2)** is the smallest possible closure: the driver has to know the
archetype before the descriptor exists, and `status.archetype` was a template key nothing
wrote. Putting it in `## Picks` reuses the grammar the driver already parses; requiring it at
`menus-done` (not `discovery-done`) keeps AC-20260825-04-2's fixture untouched and changes only
the AC-3 fixture, updated in place and retagged.

**Per-step doctrine lines (D10)** are a net cut, not an addition: the command sits at 119 of
its 120-line pin, so three new states could not land as prose there; a `Doctrine:` line printed
by the driver per state is one binding home and lets the command's pointer list die.

**Rejected:** a `tiles` list in `finalists.json` (the driver derives tile sources — the sketch
here, the culled positions in spec 02 — so the session cannot hand the race a stale list);
extending `wf-research`'s option schema with scaffold/boot commands (finalists are stack
*combinations* the session composes, not single options); extending `design-atlas.js` for the
screenshot gallery (A7); a token *cap* per finalist (the brief's cap is retries; tokens are
observed and reported, never budgeted — a cap would make the session stop a build on a number
it cannot see mid-dispatch).

Collision-closure at lock (2026-08-27, `--literal "Per-state judgment pointers"`,
`unplanned=3 likely=0`): paths leg `likely` — `tests/consistency/genesis-doctrine.test.js`
(File Plan row) for four of the seven planned files; literals leg — the heading is named by
`spec/commands/genesis.md` only (row). Nothing waived. `SHALL CONTINUE TO` pins: AC-9.

## Canonical Delta

Append to `docs/canonical/genesis.md` § *Driver (architect stage)*: *Since specs/20260827/01
the driver races finalists between `MENUS` and `DECIDE` for tournament archetypes
(`web-app`, `realtime-trading`, `backend-api`, `mobile-app`, `desktop-app`): states `FINALISTS`
→ `RACE` (driver-only: scaffold into `.claude/genesis/tournament/finalists/<name>/`, zero-day
gate, boot through `smoke.sh` with a per-finalist `.genesis-smoke.json`) → `PROBE` (the session
builds one probe slice per finalist with Sonnet workers, two retries per task, recording
`tournament/evidence/<name>/probe.json` with harness-reported tokens) → `PICK` (the driver
re-runs gate + boot, writes `tournament/benchmark.json`/`.md` and `gallery.html`; the user
picks by rewriting `## Picks`). `--mark menus-done` requires `- archetype: <registry key>` in
`## Picks` and stores `status.archetype`. `decided` requires the descriptor's `scaffoldCommand`
to be the winner's and an ADR to cite `benchmark.md`, then deletes the raced copies; the winner
is re-scaffolded clean into the root. Every step text prints a `Doctrine:` pointer; the command
no longer carries per-state pointers.*
