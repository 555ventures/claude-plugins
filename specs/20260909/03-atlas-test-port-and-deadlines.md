---
date: 2026-09-09
status: done
build_base: main
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: daf4177e91f6442677b7e3ccba127005f661f9a4
---

# The browser-driven atlas tests stop sharing ports and stop waiting forever

## Goal

Two test runs in this repo at the same time — two sessions, or a review leg while the user runs
the suite — can hang one of them indefinitely at zero CPU. The Chrome-driving atlas tests derive
a port from their process id; when a sibling run already serves that port, `design-atlas.js
serve` answers `already serving` and exits 0, the shared harness reads that line as "ready", the
test drives the *other* run's server, and its cleanup then waits for an exit event on a child
that has already exited — which never fires. This spec makes the harness ask the server for a
free port (so two runs can never collide), refuse to proceed on any answer other than its own
`serving` line, bound every wait it holds with a named deadline, and never hang on a child that
is already gone. Done means: the three Chrome-driving test files carry no `process.pid` port
arithmetic, every wait in the harness rejects with a message inside a fixed time, and `serve
--port 0` announces the port it actually bound.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. An empty reason ([no-ac: ]) does not count as a sanction. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js serve --port 0` binds an OS-chosen port and prints the **bound** port in its first stdout line (`serving http://localhost:<bound>/atlas/index.html — remote: ssh -L <bound>:localhost:<bound> <host>`), read from `server.address().port` inside the `listen` callback; an explicit `--port N` prints `N` exactly as today, and the busy-port branch (`already serving`, exit 0; foreign occupant, `die`) is untouched (AC-20260909-03-6, AC-20260909-03-7, AC-20260909-03-9) | Executed 2026-09-09: `--port 0` already binds a free port but prints `localhost:0` — the one line a caller can read the port back from is the line that lies. Rejected: a `--port auto` alias — `0` is what `listen` already means. |
| D2 | `tests/mocks/chrome-harness.js`'s `serve(dir, port = 0)` returns `{ child, ready, stop }` where `ready` resolves to `{ port }` parsed from a first line that starts with `serving http://localhost:`; it **rejects** when the first line starts with anything else (message names the verb and the port and says another run holds it: `serve on port N answered "already serving" — another run holds it; pass no port so the server chooses`), when the child exits before printing a line (message carries the exit code and captured stderr), or after 5000 ms (unchanged) (AC-20260909-03-1, AC-20260909-03-2) | Executed 2026-09-09: a second serve on a held port resolved the current `ready` in 67 ms with `already serving`, exit 0 — the harness then drives a server it does not own. Resolving to the parsed port is what lets callers stop naming one. |
| D3 | `stop()` is the only cleanup callers run: when `child.exitCode === null && child.signalCode === null` it attaches the exit listener **before** sending `SIGTERM`, waits at most 5000 ms, then sends `SIGKILL`; when the child has already exited it resolves immediately. It never rejects and never waits on a listener attached after the event (AC-20260909-03-3) | Executed 2026-09-09: `child.kill('SIGTERM')` then `new Promise(r => child.on('exit', r))` on an exited child never settled within 2000 ms (`exitCode` 0) — this is the 2 h 45 m hang. `tests/design-atlas.test.js`'s inline `withServe` already guards exactly this way; the harness adopts it. |
| D4 | `chrome-harness.js` exports `withDeadline(promise, ms, label)` — resolves/rejects with the wrapped promise, or rejects with `new Error(label + ' did not settle within ' + ms + 'ms')` first — and `withChrome(chrome, fn, opts = {})` routes **every** DevTools `send` and `navigate`'s `Page.loadEventFired` wait through it with `opts.deadlineMs` (default 15000); the label names the method or the URL. The launch waits (15 s DevTools endpoint) and the 2 s `Browser.close` race are unchanged (AC-20260909-03-4, AC-20260909-03-5) | A DevTools socket that dies mid-test leaves every pending `send` unsettled forever; a page whose load event never fires holds `navigate` the same way. A per-call deadline turns both into a named failure the runner can report. Rejected: relying on `node --test`'s per-test timeout — the gate runs `--test-timeout=0` by design, and a hang inside `finally` outlives any test timeout anyway. |
| D5 | `tests/design-atlas-index.test.js`, `tests/mocks/notes-layer-isolation.test.js` and `tests/mocks/notes-layer-navigation.test.js` call `serve(dir)` with **no port**, take the port from `await ready`, and clean up with `await stop()`; no `process.pid` expression and no inline `child.on('exit')` wait survives in any file that requires `chrome-harness` (AC-20260909-03-8) | A harness that hands out ports is only safe when nobody derives one beside it. The sweep in AC-8 is an absence pin over the harness's own requirers, so the next Chrome-driving test cannot quietly reintroduce the arithmetic. |
| D6 | `tests/design-atlas.test.js`'s four inline `serve` spawns (lines 1635, 1697, 1930, 2000 at the pre-image) keep their own ports and their own bounded waits; this spec only tags two of its existing pins with this spec's CONTINUE-TO AC-IDs and moves nothing else `[no-ac: an explicit scope boundary; the two tag edits are carried by AC-20260909-03-7 and AC-20260909-03-9]` | Those sites bound every wait to 5 s and guard the exit wait on `exitCode` already, so a collision there fails in seconds with the wrong banner named — never a hang. Migrating them to port 0 would rewrite the server's own banner pins in a 217 KB file to buy nothing this spec needs. Recorded so the boundary is a ruling, not an oversight. |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor via `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` with a last-3-versions changelog entry naming `serve --port 0` `[no-ac: review's version-bump check is the oracle]` | § Planning version discipline; concurrent sessions in this repo race the same semver (§ Gotchas), so the build resolves the minor rather than the spec naming one. |
| D8 | `size-baseline.json` rows for every file this spec grows are raised with `node scripts/size-ratchet.js --root . --raise <path> --to <bytes> --cite specs/20260909/03-atlas-test-port-and-deadlines.md`, never by hand `[no-ac: the ratchet in the gate is the oracle]` | `tests/mocks/chrome-harness.js` sits exactly on its ceiling (6375 bytes); a mechanism pays its own size. |
| D9 | `.claude/rules/spec-pipeline.md` § Test Rules' env-gate sentence names the `chrome-harness` requirers as the other sanctioned `[env: CHROME_BIN]` skips, in one clause, no other wording changed `[no-ac: grounding prose; review's doctrine leg reads it]` | The sentence already understates the truth (specs/20260907/09 shipped five `[env: CHROME_BIN]` ACs); this spec adds a sixth, so the grounding is corrected at the touch rather than left one further step stale. |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: the `listen` callback prints the banner with `server.address().port`; the busy-port branch keeps printing the requested port |
| tests/mocks/chrome-harness.js | MODIFY | tests | D2–D4: `serve(dir, port = 0)` → `{ child, ready, stop }` with a verb-checked, port-parsing `ready`; `stop()`; `withDeadline`; deadlines on `send`/`navigate` via `opts.deadlineMs` |
| tests/mocks/chrome-harness.test.js | CREATE | tests | AC-20260909-03-1, AC-20260909-03-2, AC-20260909-03-3, AC-20260909-03-4, AC-20260909-03-5, AC-20260909-03-8 |
| tests/design-atlas-serve-port.test.js | CREATE | tests | AC-20260909-03-6 |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260909-03-7, AC-20260909-03-9 — tag the two existing explicit-port pins (the `serving` banner test at the pre-image's line 1635, the `already serving` test at 1925) in place; no other edit |
| tests/design-atlas-index.test.js | MODIFY | tests | D5: four sites drop `process.pid` ports, read the port from `ready`, clean up with `stop()` |
| tests/mocks/notes-layer-isolation.test.js | MODIFY | tests | D5: same migration, one site |
| tests/mocks/notes-layer-navigation.test.js | MODIFY | tests | D5: same migration, one site |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| size-baseline.json | MODIFY | other | D8: `size-ratchet.js --raise … --cite` this spec for every grown file and the `tests` tree |
| .claude/rules/spec-pipeline.md | MODIFY | other | D9: one clause in § Test Rules' env-gate sentence |

## Contracts

`tests/mocks/chrome-harness.js` (the only consumers are the three Chrome-driving test files):

```js
// serve(dir, port = 0) → { child, ready, stop }
//   ready: Promise<{ port: number }>
//     resolves when the child's first stdout line starts with 'serving http://localhost:'
//     rejects: first line has another verb           → Error('serve on port N answered "<verb>" — another run holds it; pass no port so the server chooses')
//              child exits before any line           → Error('serve exited (code C) before announcing a port: <stderr>')
//              nothing within 5000 ms                → Error('serve did not start: <captured output>')   (unchanged)
//   stop(): Promise<void> — SIGTERM with the exit listener attached first, ≤5000 ms, then SIGKILL;
//           resolves at once when exitCode/signalCode is already set; never rejects
//
// withDeadline(promise, ms, label) → Promise
//   rejects with Error(label + ' did not settle within ' + ms + 'ms') when the deadline wins
//
// withChrome(chrome, fn, opts = {}) — opts.deadlineMs (default 15000) bounds every DevTools send
//   (label: 'DevTools <method>') and navigate()'s load wait (label: 'load of <url>')
```

`spec/scripts/design-atlas.js serve --port 0`: the first stdout line is the existing banner with
the **bound** port substituted in all three places; every other `serve` line is unchanged.

## Behavior

- A test that wants a served atlas: `const srv = serve(dir); const { port } = await srv.ready;
  … finally { await srv.stop() }`. No port is chosen by the test.
- Collision path (only reachable when a caller still passes an explicit port): `ready` rejects
  in well under a second with the `already serving` message; `stop()` sees `exitCode === 0` and
  resolves without waiting.
- Dead-socket path: Chrome dies mid-test → the next `send` rejects within `deadlineMs`, naming
  the method; `withChrome`'s `finally` still races `Browser.close` for 2 s and SIGKILLs.
- Stuck-page path: a server that accepts the connection and never answers → `navigate` rejects
  within `deadlineMs`, naming the URL.
- `serve` on an explicit port behaves exactly as today for humans running it by hand — the
  `already serving` reuse contract specs/20260905/04 D2 set is untouched.

## Acceptance Criteria

- **AC-20260909-03-1**: WHEN `serve(dir)` is called with no port THE SYSTEM SHALL resolve
  `ready` to `{ port }` with `port > 0`, and `GET http://127.0.0.1:<port>/atlas/index.html` on
  that port SHALL answer 200 from the child this call spawned (the child's own stdout banner
  names the same port) → test in `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-2**: WHEN `serve(dir, N)` is called while another `design-atlas.js serve`
  already holds port `N` THE SYSTEM SHALL reject `ready` within 5000 ms with an Error whose
  message contains `port N`, `already serving` and `another run holds it`, and SHALL never
  resolve it → test in `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-3**: WHEN `stop()` is called on a serve child that has already exited
  (`exitCode !== null`) THE SYSTEM SHALL resolve within 1000 ms; and WHEN it is called on a
  live child THE SYSTEM SHALL resolve within 6000 ms with the child no longer running → test in
  `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-4**: WHEN `withDeadline(p, 50, 'x')` is given a promise that never settles
  THE SYSTEM SHALL reject with message `x did not settle within 50ms`; and WHEN `p` resolves
  to `7` first THE SYSTEM SHALL resolve to `7` → test in `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-5** `[env: CHROME_BIN]`: WHEN `withChrome(chrome, fn, { deadlineMs: 1500 })`
  navigates to a URL served by a socket that accepts and never replies THE SYSTEM SHALL reject
  `navigate` within 4000 ms with a message containing `did not settle within 1500ms` and the
  URL, and Chrome SHALL be gone after `withChrome` returns (no live child) → test in
  `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-6**: WHEN `design-atlas.js serve --root <dir> --port 0` runs THE SYSTEM
  SHALL print as its first stdout line
  `serving http://localhost:<P>/atlas/index.html — remote: ssh -L <P>:localhost:<P> <host>`
  with one integer `P > 0` in all three places, and `GET /atlas/index.html` on `P` SHALL answer
  200 → test in `tests/design-atlas-serve-port.test.js`
- **AC-20260909-03-7**: WHEN `serve --port N` runs with an explicit free port THE SYSTEM SHALL
  CONTINUE TO print `serving http://localhost:N/atlas/index.html — remote: ssh -L
  N:localhost:N <host>` as its first line → the existing AC-20260905-01-11 banner test in
  `tests/design-atlas.test.js`, tagged
- **AC-20260909-03-8**: WHEN every file under `tests/` that requires `chrome-harness` is read
  THE SYSTEM SHALL find no `process.pid` token and no `child.on('exit'` token in any of them
  (`design-atlas-index`, `notes-layer-isolation`, `notes-layer-navigation` at the pre-image
  each carry both → after: zero hits across the set, and the set is non-empty) → test in
  `tests/mocks/chrome-harness.test.js`
- **AC-20260909-03-9**: WHEN a second `serve --port N` runs against a port an atlas already
  holds THE SYSTEM SHALL CONTINUE TO print the `already serving` banner for `N` and exit 0 →
  the existing AC-20260905-01-11 derived-index test in `tests/design-atlas.test.js`, tagged

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and adjudication starts HERE. Pair every assumption with its fallback. -->

- A1: `--port 0` binds but the banner prints the requested `0`. **Executed 2026-09-09:**
  `serve --port 0` first line → `serving http://localhost:0/atlas/index.html — remote: ssh -L
  0:localhost:0 <host>` (child alive, killed by SIGTERM). — **if false** (banner already
  prints the bound port): D1's server edit is a no-op; keep AC-6 as the pin.
- A2: a second serve on a held port makes the current harness `ready` resolve. **Executed
  2026-09-09:** first line `already serving http://localhost:42999/…`, child exit 0, current
  `ready` resolved after 67 ms. — **if false:** STOP, ask the user — the hang mechanism would
  need re-deriving.
- A3: an exit listener attached after the child exited never fires. **Executed 2026-09-09:**
  `child.kill('SIGTERM')` on an exited child then `new Promise(r => child.on('exit', r))` →
  `NEVER fired within 2000ms`, `exitCode` 0. — **if false:** D3 still stands (the guard is
  harmless); AC-3's first clause is the pin either way.
- A4: a Chromium binary resolves on the build machine (`/usr/bin/chromium` on PATH, 2026-09-09;
  `findChrome()` finds it) so AC-5 executes rather than skips. — **if false:** AC-5 skips with
  its named reason; review's matrix reports a warning, not a hard finding — but the worker
  still writes the test red-first against a stub and leaves the skip reason exact.
- A5: `http.Server#close` on Node 24 closes idle keep-alive connections, so SIGTERM ends the
  serve child promptly once Chrome is gone (unverified, reasoning from Node ≥19 semantics). —
  **if false:** `stop()`'s 5 s SIGKILL fallback covers it; AC-3's second clause pins the bound.
- A6: no file outside the three named requires `chrome-harness` (`grep -rln chrome-harness
  tests/` on 2026-09-09 → exactly those three plus the harness). — **if false:** the extra
  file joins D5's migration as its own File Plan row; the worker returns `blocked` naming it.

## Rationale

The hang cost one review leg 2 h 45 m at zero CPU on 2026-09-09 (`wchan do_epoll_wait`,
child `tests/design-atlas-index.test.js`). Reading the harness against `design-atlas.js`
found three defects stacked: the readiness check cannot tell "I bound the port" from "someone
else already serves it" (the busy-port branch prints a banner that also ends in `\n` and exits
0 — a deliberate human-facing reuse contract from specs/20260905/04 that a test harness must
not inherit); the cleanup attaches its exit listener after the kill, on a child that may have
exited long ago; and every DevTools wait is unbounded. The port arithmetic is the trigger, not
the defect — it is fixed anyway because JJ chose (2026-09-09) that concurrent runs should never
collide rather than fail fast, and `listen(0)` is the standard answer.

Which pids collided is unverified: the two session pids on record (`882769`, `1612057`) map to
`169` and `157`, so the collision came from one of the many respawned runs an orphaned driver
kept launching — pids the session never recorded. That is exactly why "fail fast" was
rejected: with respawning runs the 1-in-300 odds are per pair, not per session.

`tests/design-atlas.test.js`'s inline serve sites (D6) are left alone on purpose: they bound
every wait and guard the exit wait already, and they exist to pin the server's banner on an
explicit port. The one at the pre-image's line 1961 waits on `child.on('exit')` unguarded, but
only after a path where nothing has killed the child, so it cannot hit A3's race.

Why a spec at all: `tests/mocks/chrome-harness.js` sits at its size ceiling to the byte and the
ratchet accepts a raise only against a spec path (`size-ratchet.js --raise … --cite`); a direct
fix could not pass the gate.

Pipeline rules § Test Rules still says the two `render-capture` pins are the only env-gated
tests; specs/20260907/09 made that false and this spec adds one more, so D9 corrects the
clause rather than growing the debt.

AC-8 is a sweep over test source, which § Test Rules calls "regexes over prose" when aimed at
doctrine; here it is aimed at code the harness owns, and the repo's `tests/consistency/`
retired-flag sweeps are the precedent. It is the only way a fourth Chrome-driving test cannot
quietly bring the arithmetic back.

## Canonical Delta

`docs/canonical/design.md`, the **Look server** paragraph: after "serve answers `already
serving`)" add one sentence — `serve --port 0` binds an OS-chosen port and prints the bound
port in its banner; the test harness (`tests/mocks/chrome-harness.js`) uses that form so
concurrent runs never share a port, treats any first line other than `serving` as a refusal,
and bounds every DevTools wait with a deadline.
