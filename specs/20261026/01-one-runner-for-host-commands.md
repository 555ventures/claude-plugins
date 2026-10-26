---
date: 2026-10-26
status: hardened
tier: critical
area: cross-cutting
breaking: false
depends_on: []
brief: n/a
open_markers: 0
spiked: 2026-10-26
---

# One runner for host commands

## Goal

The plugin runs a host's own command strings (gate, test, e2e, boot, db, picture, scaffold) from
thirteen places, and each place builds the shell line its own way: some scrub the test-runner
context and some do not, values are spliced with three different quoting styles, and environment
values reach the command either as spawn env, a bare `VAR=x` prefix, or an `export` line. Every
host-shape defect since 2026-10-01 was found by a real host, never by this repo's suite, because
the suite runs one host shape and never executes a line a driver prints. This spec adds one
library — `lib/host-run.js` — that is the only place a host command is run or printed, moves every
site onto it, bans shell spawns anywhere else, and adds one workspace-shaped fixture host whose
printed boot line is actually executed. Done means a consistency test finds zero shell spawns
outside the library, the release e2e leg's `BASE_URL` reaches every command of a compound
`e2eCommand`, and a printed boot line of the form `cd apps/web && exec node server.mjs` answers
on its allocated port when run from a symlinked root.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/host-run.js` is the one module that runs or prints a host command string. It exports exactly `quote`, `printable`, `run`, `runAsync` (Contracts). (AC-20261026-01-1, AC-20261026-01-2, AC-20261026-01-3, AC-20261026-01-4) | One seam instead of thirteen; rejected: a contract change making hosts declare `{cwd, run}` (8 of 11 hosts are already stale on `contractHash`). |
| D2 | `run`/`runAsync` take `env` as ADDITIONS over `process.env`, and always delete `NODE_TEST_CONTEXT` from the final env, whatever the caller passed. Sites that did not scrub before (prototype db/e2e/picture, pictures.js, genesis runShell, init-gen probe, expire-tests) now do. (AC-20261026-01-3, AC-20261026-01-4) | A host command is never a child of this repo's test runner; inheriting the context degrades a nested `node --test` to exit 0 over failing tests. |
| D3 | `printable(command, env)` returns `export K=V[ K2=V2…]; <command>` with every value through `quote`, `null`/`undefined` entries dropped, and `command` unchanged when no entry remains. `bootLine` is retired from `lib/app-port.js`; its three print sites (build REPLAY, prototype ROUND, prototype TESTS) call `printable(boot, { PORT: port })`. (AC-20261026-01-2, AC-20261026-01-7, AC-20261026-01-9) | Keeps 7.274.0's compound-safe export form and gives it one home; a bare `PORT=n cmd` prefix reaches only the first simple command. |
| D4 | The release e2e leg passes `BASE_URL` as spawn env (`runAsync(release.e2eCommand, { cwd, env: { BASE_URL } })`); the `BASE_URL=… <e2eCommand>` prefix is deleted. (AC-20261026-01-6, AC-20261026-01-10) | Same defect class as the PORT prefix: `BASE_URL=x cd e2e && run` gives BASE_URL to `cd` only. |
| D5 | Every value spliced into a host command — red-check's file path and name filter, init-gen's probe path, gate-resolve's `{testDirs}` globs and `{scopeDirs}` dirs — goes through `quote`. red-check's `shellQuoteSingle` is deleted; init-gen's `JSON.stringify` splice and gate-resolve's hand-written `'…'` wrap are replaced. (AC-20261026-01-1, AC-20261026-01-8, AC-20261026-01-9) | Double quotes still expand `$` and backticks; one single-quote helper is the only form with no special characters inside. |
| D6 | `expire-tests.js`'s post-sweep gate moves from `spawnSync(command, { shell: true })` (`/bin/sh`) to `run` (`bash -c`), keeping its `encoding`, `stdio` and `maxBuffer`. (AC-20261026-01-8) | Every other gate run in the pipeline is `bash -c`; a host gate that passes in review must not fail in the sweep for interpreter reasons. |
| D7 | Drivers keep their die-on-no-exit-code discipline through a new `driver-io.runHost(command, opts, what)` that calls `hostRun.run` and applies the same no-status check `runChild` applies; `runChild` stays for non-shell spawns (git, node, `bash <file>`). (AC-20261026-01-8) | The library stays pure (no `process.exit`); drivers keep today's failure message shape. |
| D8 | A consistency test fails on any `['-c'` / `["-c"` argv, `shell: true`, or `exec(`/`execSync(` call not preceded by `.` or a word character (so `regex.exec(` never matches) in `spec/scripts/**/*.js` outside `lib/host-run.js` — the pre-image has exactly 17 hits across the 13 planned script files, and on any live hit of the retired identifiers `bootLine` and `shellQuoteSingle` under `spec/scripts/` and `tests/`. (AC-20261026-01-8, AC-20261026-01-9) | Deterministic enforcement over prose; a new site cannot quietly reintroduce a fourth quoting style. |
| D9 | One fixture host shape is added: `tests/fixtures/workspace-host/` (root `package.json`, `pnpm-workspace.yaml`, `apps/web/package.json`, `apps/web/server.mjs` that listens on `process.env.PORT` and answers `workspace-host ok`). The test overlays it on the prototype fixture host, sets `runtime.bootCommand` to `cd apps/web && exec node server.mjs`, reaches ROUND through a symlinked path to the host, runs the printed `Session:` boot line with `sh -c` in the prototype worktree, and fetches the resolved address. No pnpm binary is needed — the shape, not the tool, is under test. (AC-20261026-01-7) | Zero tests executed a driver-printed line before this; the PORT bug shipped because the only fixture was single-root. |
| D10 | Out of scope, derived from evidence: the PORT allocation rule is unchanged. smoke allocates when `readyCheck` reads `$PORT`; the drivers allocate when the address they probe carries `{port}` — each path allocates exactly when its own probed address has a slot. Switching drivers to `readsPort(readyCheck)` would allocate a port for expense-tracking (fixed `prototype.url` `:3000`, PORT-reading readyCheck) and then probe `:3000` while the app binds the new port. [no-ac: no code change; recorded so the queue item's step (4) is not re-opened] | Verified against expense-tracking and salon-os configs: both are self-consistent on each path today. |
| D11 | Out of scope, derived from evidence: no config key is deleted. `replay` has no reader anywhere in the plugin (only stale data in two host configs, which is host work); `pictures` is a live block declared in the grounding contract and read by `pictures.js` and genesis. `grounding-contract.md` is not edited. [no-ac: no code change] | The queue item's step (5) assumed both were dead; deleting `pictures` would be a contract change, which this spec's non-goal forbids. |
| D12 | Also out of scope: `smoke.sh` (a shell script, not a JS spawn site — its `bash -c "$READY"` is already the same interpreter) and prototype-driver's `shellQuote`, which quotes the plugin's own printed `node <driver> "<idea>"` argument, never a host command. [no-ac: unchanged surfaces] | The ban is for JS sites that run host strings; widening it would sweep in non-host printing. |
| D13 | `spec/.claude-plugin/plugin.json` is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: the gate's `plugin-bump.js --check` is the oracle] | Repo version discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/host-run.js | CREATE | scripts | `quote`, `printable`, `run`, `runAsync` per Contracts (D1–D3). |
| spec/scripts/lib/app-port.js | MODIFY | scripts | Delete `bootLine` and its export/header mention (D3). |
| spec/scripts/lib/driver-io.js | MODIFY | scripts | Add `runHost(command, opts, what)` over `hostRun.run` with `runChild`'s no-status die (D7). |
| spec/scripts/lib/contract.js | MODIFY | scripts | picture run and `runDbDestroy` call `hostRun.run` with env additions (D1, D2). |
| spec/scripts/lib/gate-resolve.js | MODIFY | scripts | `{testDirs}` globs and `{scopeDirs}` dirs through `quote` (D5). |
| spec/scripts/spec-build-driver.js | MODIFY | scripts | Gate run and prototype e2eRun via `driverIo.runHost`; REPLAY boot line via `printable` (D3, D7). |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | Close-time gate and whole-suite re-runs via `driverIo.runHost` (D7). |
| spec/scripts/review-legs.js | MODIFY | scripts | `sh()` becomes a thin call to `runAsync(cmd, { cwd: root, env: { ...opts.env, SPEC_REVIEW_BASE: base } })` (D1, D2). |
| spec/scripts/release-legs.js | MODIFY | scripts | `sh()` over `runAsync`; e2e leg passes `BASE_URL` as env, prefix and its comment deleted (D4). |
| spec/scripts/expire-tests.js | MODIFY | scripts | Post-sweep gate via `run` instead of `shell: true` (D6). |
| spec/scripts/init-gen.js | MODIFY | scripts | `probeTestCommand` via `run(cmd + ' ' + quote(nonexistent), { cwd })` (D5). |
| spec/scripts/prototype-driver.js | MODIFY | scripts | dbCreate, e2eList, e2eRun via `run`; ROUND and TESTS boot lines via `printable` (D2, D3). |
| spec/scripts/genesis-driver.js | MODIFY | scripts | `runShell` opens its log fd and calls `driverIo.runHost` (D7). |
| spec/scripts/pictures.js | MODIFY | scripts | `runCommand` via `run` with `SPEC_PICTURES_*` as env additions (D2). |
| spec/scripts/red-check.js | MODIFY | scripts | `runLeg`/`runFilteredLeg` via `run` + `quote`; delete `shellQuoteSingle` (D5). |
| spec/.claude-plugin/plugin.json | MODIFY | other | Version bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` (D13). |
| tests/host-run/host-run.test.js | CREATE | tests | AC-20261026-01-1, AC-20261026-01-2, AC-20261026-01-3, AC-20261026-01-4 |
| tests/consistency/one-host-runner.test.js | CREATE | tests | AC-20261026-01-8, AC-20261026-01-9 |
| tests/fixtures/workspace-host/package.json | CREATE | tests | Workspace root manifest (D9). |
| tests/fixtures/workspace-host/pnpm-workspace.yaml | CREATE | tests | `packages: ['apps/*']` (D9). |
| tests/fixtures/workspace-host/apps/web/package.json | CREATE | tests | Package manifest for the web app (D9). |
| tests/fixtures/workspace-host/apps/web/server.mjs | CREATE | tests | HTTP server on `process.env.PORT` answering `workspace-host ok` (D9). |
| tests/prototype/workspace-host-boot.test.js | CREATE | tests | AC-20261026-01-7 |
| tests/release-legs/compound-base-url.test.js | CREATE | tests | AC-20261026-01-6 |
| tests/release-legs/release-legs.test.js | MODIFY | tests | AC-20261026-01-10 — append the ID to the existing BASE_URL test's title after its resolving prefix; assertions unchanged. |
| tests/app-port.test.js | MODIFY | tests | Delete the `bootLine:` test — its behaviour moves to the host-run printable test (D3). |
| tests/disposition/red-check-per-test.test.js | MODIFY | tests | Its header comment names the retired helper; reword to "the single-quote helper in lib/host-run.js" (D5, D8 ban). |

## Contracts

```js
// spec/scripts/lib/host-run.js
// quote(value) -> string
//   String(value) when it matches /^[A-Za-z0-9_@%+=:,.\/-]+$/, else POSIX single-quoted with each
//   embedded ' written as '\''. Empty string -> ''.
// printable(command, env = {}) -> string
//   entries = Object.entries(env).filter(([, v]) => v !== null && v !== undefined)
//   entries.length === 0 -> command
//   else -> 'export ' + entries.map(([k, v]) => k + '=' + quote(v)).join(' ') + '; ' + command
// run(command, opts = {}) -> spawnSync result
//   spawnSync('bash', ['-c', command], { ...opts, env }) where
//   env = { ...process.env, ...(opts.env || {}) } with NODE_TEST_CONTEXT deleted.
//   Every other opts key (cwd, stdio, encoding, maxBuffer, timeout) passes through unchanged.
// runAsync(command, { cwd, env } = {}) -> Promise<{ code, out, err }>
//   spawn('bash', ['-c', command], { cwd, env }) with the same env rule; stdout/stderr captured;
//   spawn 'error' -> code 127; close with null code (signal) -> code 1.
module.exports = { quote, printable, run, runAsync }

// spec/scripts/lib/driver-io.js (added)
// runHost(command, opts, what) -> spawnSync result; on r.error or r.status === null writes
// 'driver-io: <what> died without an exit code (<reason>) — …' and exits 2, exactly as runChild.
```

## Behavior

- review-legs `sh()` and release-legs `sh()` keep their signatures and resolve shapes; only their
  bodies delegate. review-legs still sets `SPEC_REVIEW_BASE` last, so no leg override wins.
- The REPLAY/ROUND/TESTS lines read `… (tracked): export PORT=<n>; <bootCommand>` when a port
  is allocated and `… (tracked): <bootCommand>` for a fixed address — byte-identical to 7.274.0.
- gate-resolve output is byte-identical for every path made of `[A-Za-z0-9_@%+=:,./-]` plus the
  glob `*`: a glob still carries `*`, so it is still single-quoted exactly as before.
- The prototype-driver's no-bootCommand case keeps printing whatever 7.274.0 printed; it is not
  in scope.

## Acceptance Criteria

- **AC-20261026-01-1**: WHEN `quote` is given a value THE SYSTEM SHALL return it bare when safe and
  single-quoted otherwise, and `bash -c 'printf %s <quoted>'` SHALL print the original value
  (`tests/a.test.js` → `tests/a.test.js`; `customers.$memberId.test.tsx` →
  `'customers.$memberId.test.tsx'`; `` it's `x` `` → `'it'\''s `x`'`; `` (empty) → `''`)
  → writes tests/host-run/host-run.test.js
- **AC-20261026-01-2**: WHEN `printable` is given a compound command and an env THE SYSTEM SHALL
  return an export line whose every command sees the values when run with `sh -c`
  (`printable('echo "a=$PORT" && cd / && exec sh -c \'echo "b=$PORT"\'', { PORT: 4321 })` run
  through `sh -c` prints `a=4321\nb=4321\n`; `printable('pnpm dev', { PORT: undefined })` →
  `pnpm dev`; `printable('x', { BASE_URL: 'http://h/?a=1&b=2' })` →
  `export BASE_URL='http://h/?a=1&b=2'; x`) → writes tests/host-run/host-run.test.js
- **AC-20261026-01-3**: WHEN `run` executes a compound command with env additions while
  `NODE_TEST_CONTEXT` is set in the parent THE SYSTEM SHALL give every command the additions,
  keep the parent's `PATH`, and give the child no `NODE_TEST_CONTEXT`
  (`run('echo "$X" && cd / && sh -c \'echo "$X-${NODE_TEST_CONTEXT:-none}"\'', { env: { X: 'v' }, encoding: 'utf8' }).stdout`
  → `v\nv-none\n`) → writes tests/host-run/host-run.test.js
- **AC-20261026-01-4**: WHEN `runAsync` runs a command THE SYSTEM SHALL resolve
  `{ code, out, err }` with the child's exit code, `127` when bash cannot be spawned, and `1` when
  the child is killed by a signal (`runAsync('echo o; echo e >&2; exit 3')` →
  `{ code: 3, out: 'o\n', err: 'e\n' }`; `runAsync('kill -9 $$')` → `code: 1`)
  → writes tests/host-run/host-run.test.js
- **AC-20261026-01-6**: WHEN the release e2e leg runs a compound `e2eCommand` THE SYSTEM SHALL
  give `BASE_URL` to every command of it (`e2eCommand` `cd . && echo "BASE_URL=$BASE_URL"` with
  `stagingUrl` `https://staging.example.test` → `e2e.txt` contains
  `BASE_URL=https://staging.example.test`) → writes tests/release-legs/compound-base-url.test.js
- **AC-20261026-01-7**: WHEN the prototype driver prints its ROUND boot line for a workspace host
  whose `runtime.bootCommand` is `cd apps/web && exec node server.mjs`, reached through a
  symlinked path to the host THE SYSTEM SHALL print a line that, run with `sh -c` in the
  prototype worktree, serves the resolved `prototype.url` (GET `http://127.0.0.1:<appPort>` →
  body `workspace-host ok`) → writes tests/prototype/workspace-host-boot.test.js
- **AC-20261026-01-8**: WHEN `spec/scripts/**/*.js` is scanned THE SYSTEM SHALL find zero shell
  spawns outside `spec/scripts/lib/host-run.js` (patterns `['-c'`, `["-c"`, `shell: true`,
  and a bare `exec(`/`execSync(` call — `re.exec(` excluded; a planted `spawnSync('bash', ['-c', x])` in a scanned copy → one finding
  naming its file) → writes tests/consistency/one-host-runner.test.js
- **AC-20261026-01-9**: WHEN `spec/scripts/` and `tests/` are scanned THE SYSTEM SHALL find zero
  live hits of the retired identifiers `bootLine` and `shellQuoteSingle` (assembled from fragments
  in the test so it never matches itself; expected hits → `[]`)
  → writes tests/consistency/one-host-runner.test.js
- **AC-20261026-01-10**: WHEN the release e2e leg runs a single-command `e2eCommand` script THE
  SYSTEM SHALL CONTINUE TO export `BASE_URL={stagingUrl}` into the child's environment
  (`e2e.txt` matches `BASE_URL=<stagingUrl>`) → reuses tests/release-legs/release-legs.test.js :: AC-20260908-05-6

## Assumptions (escalation triggers)

- A1: `export K=V; <compound>` run by `sh -c` gives K to every command of the compound line,
  including one reached through `cd dir && exec …`. Spiked 2026-10-26 (scratch `spike.js`):
  `printable('echo "a=$PORT $BASE_URL" && cd web && exec sh -c …', { PORT: 5123, BASE_URL: "http://x/?a=1&b='2'" })`
  through `sh -c` printed `a=5123 http://x/?a=1&b='2'\nb=5123 http://x/?a=1&b='2'\n`.
  — **if false:** STOP, ask the user.
- A2: spawn env reaches every command of a compound `bash -c` line. Spiked 2026-10-26:
  `spawnSync('bash', ['-c', 'echo "a=$BASE_URL" && cd web && exec sh -c …'], { env: { BASE_URL: 'http://s' } })`
  printed `a=http://s\nb=http://s\n`. — **if false:** keep the D4 prefix in `export` form via `printable`.
- A3: the D-Contracts `quote` round-trips through `bash -c printf %s`. Spiked 2026-10-26:
  `tests/a.test.js`, `customers.$memberId.test.tsx`, `` it's `x` ``, `tests/*.test.js` and `` ``
  each printed back unchanged. — **if false:** STOP, ask the user.
- A4: a symlinked cwd resolves `cd apps/web` normally. Spiked 2026-10-26: `sh -c 'cd web && pwd -P'`
  with cwd = a symlink printed the real `…/spike/web`. — **if false:** drop the symlink from
  AC-20261026-01-7 and record it.
- A5: the prototype fixture host's worktree contains files committed to `main` before
  `--mark opened`, so overlaying the workspace fixture before `gitRepo()` puts `apps/web/` in the
  worktree. Read from `tests/prototype/fixture.js` `setupHost()`. — **if false:** commit the
  overlay on `main` in the test before `--mark opened`.
- A6: no caller of `review-legs.js`/`release-legs.js`'s `sh()` depends on bash being spawned
  with an env that still holds `NODE_TEST_CONTEXT` — both already delete it. Read from source.
  — **if false:** STOP, ask the user.

## Rationale

The 2026-10-26 audit (five agents plus two Fable reads) found no single seam where the plugin
turns a host's command string into a process or a printed line. Thirteen JS sites each picked
cwd, env, scrubbing and quoting for themselves, so each host-shape bug was fixed at one site and
left at its siblings (the PORT prefix was fixed in 7.274.0; the same prefix lived on as
`BASE_URL=` in release-legs, with a comment claiming the opposite). The first Fable read
prescribed a grounding-contract change (hosts declare `{cwd, run}`); the second, unanchored read
rejected it because 8 of 11 hosts are already stale on `contractHash` and hosts that needed
wrappers wrote them anyway. This spec takes the second path: one library, one ban, one new
fixture shape, no contract edit and no host re-stamp.

Two steps of the original queue item are dropped on evidence (D10, D11). The PORT "split" turned
out to be two coherent rules keyed on two different probed addresses; unifying on the readyCheck
would break expense-tracking's prototype flow. The "dead" keys were half wrong: `replay` has no
plugin reader at all, and `pictures` is a live contract block.

The File Plan carries 15 source rows, over the ~12 split line. It is not split because the
landing unit is the ban (D8): a first half that moved some sites could not land the consistency
test green, and without the test the move has no guard. Most rows are two-line swaps.

Fragile points: `expire-tests` changes interpreter from `/bin/sh` to bash (D6) — a host gate
using bash-only syntax was already required by every other leg. Scrubbing `NODE_TEST_CONTEXT` at
sites that did not scrub before (D2) changes behaviour only when the plugin itself runs inside
`node --test`, which is exactly this repo's suite.

Collision closure at lock (`--literal bootLine --literal shellQuoteSingle`): all six literal hits
are File Plan rows (three scripts, `tests/app-port.test.js`, and the comment in
`tests/disposition/red-check-per-test.test.js`). The paths leg lists the existing suites that
execute each changed script; none asserts the retired forms, and the build's whole-suite run
adjudicates them.

## Canonical Delta

None — this repo has no `docs/canonical/`.
