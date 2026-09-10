---
date: 2026-09-09
status: implementing
build_base: main
tier: standard
area: design-atlas
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260909/07-hang-bound-and-port-check.md]
brief: n/a
spiked: 2026-09-09
open_markers: 0
diff_base: 29cb1f457090582d4e4bf7f0fafdf00a039d8a2a
---

# Every test-bound port is ephemeral

## Goal

No test in this repo chooses a port number. `design-atlas.js serve --port 0` binds an ephemeral
port and prints the bound one in its banner; `tests/helpers.js` exports one `freePort()` and one
`serveAtlas()` that spawns the real serve child on `--port 0` and resolves with the port it
announced; the three private `freePort` copies and the three private serve harnesses are
re-pointed to those two helpers; every pid-derived or random port literal in tests is deleted.
Done means: `grep -rnE "[0-9]{4,5} *\+ *\(?(process\.pid|Math\.random)" tests/` returns nothing,
and two serve-backed test files run concurrently without sharing a port window.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `design-atlas.js serve --port 0` binds an ephemeral port; the banner's URL and the `ssh -L` hint use `server.address().port`, so a `--port 0` caller reads the real port from the first stdout line; the default stays `4173` and the EADDRINUSE "already serving" probe is unchanged (AC-20260909-06-1, AC-20260909-06-2) | Spiked: `parseInt('0',10)` is 0 and `listen(0)` reports the real port via `address()`; the banner currently interpolates the parsed value, which would print `:0` |
| D2 | `tests/helpers.js` exports `freePort()` (bind 0 on 127.0.0.1, read, close, resolve the number) and `serveAtlas(root, {port, script} = {})` (`script` is a test seam defaulting to `spec/scripts/design-atlas.js`) → `Promise<{port, url, child, stop()}>` that spawns `design-atlas.js serve --root <root> --port <port ?? 0>` with the real script and argv, resolves on the first stdout line by parsing `http://localhost:(\d+)/`, rejects after 5 s with the child's stderr, and whose `stop()` sends SIGTERM then SIGKILL after 5 s (AC-20260909-06-3, AC-20260909-06-4) | One helper, one readiness contract, one kill ladder — today's three copies drift (one window overlaps another's) |
| D3 | The private helpers are replaced, not wrapped: `freePort` in tests/design-atlas.test.js, tests/mocks/mocks-driver-fixtures.js and tests/consistency/retired-flags.test.js import from helpers; `withServe` (design-atlas.test.js), `startServe`/`stopServe` (mocks-driver-fixtures.js) and `serve()` (tests/mocks/chrome-harness.js) become thin calls to `serveAtlas` keeping their current signatures minus any port argument; `mocks-driver-fixtures.js` keeps re-exporting `freePort` for its 8 look-stop callers (AC-20260909-06-5) | Callers change one line each; the fixtures module stays the mocks tests' import surface |
| D4 | Every serve-backed test that passed a computed port (`41230 + (pid%300)`, `41830 + ((pid+k)%300)`, `42230…`, `42530…42590`, `43570…`, `43000 + random`) passes nothing and reads `port` from `serveAtlas`; the reuse-branch test (design-atlas.test.js ~1925) takes one `freePort()` and starts two serves on it — the second must print `already serving` (AC-20260909-06-6, AC-20260909-06-7) | The pid windows overlap each other and the random window contains one of them; under `--test-concurrency=3` a collision silently serves another test's fixture tree (the probe is identity-blind) |
| D5 | `tests/mocks/mocks-driver-look-stops-3.test.js`'s literal `'4599'` becomes `'0'` [no-ac: the run refuses on `--state` before any socket; AC-20260909-06-8's grep is the observable] | The literal is harmless today and a false positive for spec 07's check tomorrow |
| D6 | `docs/canonical/design.md`'s serve line records `--port 0` [no-ac: applied by Canonical Delta] | Canon names the flag hosts may rely on |
| D7 | `spec/.claude-plugin/plugin.json` bumps via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` [no-ac: `plugin-bump.js --check` is the oracle] | Version discipline |
| D8 | D1's banner mechanism (`server.address().port` in both the URL and the `ssh -L` hint) already landed on `main` via specs/20260909/03-atlas-test-port-and-deadlines.md (commit `e03f23a`), so this spec's `design-atlas.js` row narrows to documenting `--port 0` in the usage block, and AC-20260909-06-1 / AC-20260909-06-2 are re-cast as `SHALL CONTINUE TO` pins on that landed behavior (user ruling, 2026-09-10, at the build's RED_FINDINGS step) | The promises are still this spec's to hold — a sibling landing them first makes them continuation pins, not laundered new promises; `[pre-green:]` has no reason covering "a sibling shipped it", so the honest carrier is the pin |
| D9 | AC-20260909-06-3 / AC-20260909-06-4 carry `[pre-green: predicate-in-test]` and AC-20260909-06-8 carries `[pre-green: absence-invariant]`: `serveAtlas`/`freePort` ARE the deliverable and live in `tests/helpers.js`, and AC-8 asserts the absence of a literal from the tests tree — neither can be red against a pre-image whose only implementation layer is already shipped (user ruling, 2026-09-10) | Both reasons are exactly the enum cases the template names; the sanction stays in the spec where red-check and ac-matrix both read it |
| D10 | `tests/mocks/chrome-harness.js`'s `serve(dir, port = 0)` keeps its port parameter, and `startServe`/`stopServe` (mocks-driver-fixtures.js) plus the file-local `withServeAt` helpers keep theirs, contrary to D3's literal "minus any port argument" — only `withServe` (design-atlas.test.js) drops it [no-ac: AC-20260909-06-5's CONTINUE-TO pin is the observable] | Out-of-batch callers hand the SAME port to a second CLI invocation (`stop open --port <p>`, `look --port <p>`), and chrome-harness.test.js's AC-20260909-03-2 forces a deliberate collision on an explicit port; dropping the parameter would strand live pins this spec's File Plan does not own |
| D11 | The File Plan drops its `tests/design-atlas-index.test.js`, `tests/mocks/notes-layer-isolation.test.js` and `tests/mocks/notes-layer-navigation.test.js` rows (specs/20260909/03 already removed every computed port there — verified: zero call sites pass a port) and its `tests/mocks/chrome-harness.js` row (D10); `tests/design-atlas-serve-port.test.js` is a MODIFY, not a CREATE (specs/20260909/03 authored it for AC-20260909-03-6, whose coverage is widened in place, never deleted); `size-baseline.json` is added as a row [no-ac: `size-ratchet.js --reconcile` is the oracle] | The plan must name what this build actually changes, or reconcile reports a phantom scope in both directions |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/design-atlas.js | MODIFY | scripts | D1: banner reads the bound port; `--port 0` documented in the usage block |
| tests/helpers.js | MODIFY | tests | D2: `freePort`, `serveAtlas` exported (AC-20260909-06-3, AC-20260909-06-4 exercised from tests/design-atlas-serve-port.test.js) |
| tests/design-atlas-serve-port.test.js | MODIFY | tests | AC-20260909-06-1, AC-20260909-06-2, AC-20260909-06-3, AC-20260909-06-4, AC-20260909-06-8 |
| tests/design-atlas.test.js | MODIFY | tests | D3/D4: `withServe` over `serveAtlas`, local `freePort` deleted, every computed port removed; AC-20260909-06-6, AC-20260909-06-7 |
| tests/mocks/mocks-driver-fixtures.js | MODIFY | tests | D3: `startServe`/`stopServe` over `serveAtlas`; `freePort` re-exported from helpers; AC-20260909-06-5 |
| tests/consistency/retired-flags.test.js | MODIFY | tests | D3: local `freePort` deleted, import from helpers |
| tests/mocks/mocks-driver-look-stops-3.test.js | MODIFY | tests | D5: `'4599'` → `'0'` |
| spec/.claude-plugin/plugin.json | MODIFY | other | D7 bump |
| size-baseline.json | MODIFY | other | D11: ratchet raises/updates for the files this spec grows and shrinks, cited to this spec |

## Contracts

```text
design-atlas.js serve [--root <r>] [--port <n>]      n = 0 → ephemeral; banner names the bound port
  first stdout line: "serving http://localhost:<bound>/atlas/index.html — remote: ssh -L <bound>:localhost:<bound> <host>"

tests/helpers.js
  freePort(): Promise<number>
  serveAtlas(root: string, opts?: { port?: number, script?: string }): Promise<{
    port: number, url: string /* http://localhost:<port> */, child: ChildProcess,
    stop(): Promise<void>  /* SIGTERM, SIGKILL after 5000 ms, resolves on exit */
  }>
  rejects: Error('serveAtlas: no banner within 5000 ms\n' + stderr)
```

## Behavior

- `serveAtlas(dir)` spawns the real script with `--port 0`; the child's first line names e.g.
  `http://localhost:61255/…`; the helper resolves `{port: 61255, url: 'http://localhost:61255'}`.
- Two test files each call `serveAtlas` under `--test-concurrency=3`: the kernel hands out two
  different ports; neither can observe the other's tree.
- The reuse-branch test: `p = await freePort()`; `serveAtlas(dirA, {port: p})` then
  `serveAtlas(dirB, {port: p})` — the second child prints `already serving http://localhost:<p>/…`
  and exits 0; the helper resolves with the same port (the banner verb is not part of the parse).

## Acceptance Criteria

- **AC-20260909-06-1**: WHEN `design-atlas.js serve --root <dir> --port 0` starts THE SYSTEM SHALL
  CONTINUE TO print a first stdout line matching `^serving http://localhost:(\d+)/atlas/index\.html`
  with a port ≥ 1024 (never `:0`), and SHALL CONTINUE TO answer
  `GET http://127.0.0.1:<that port>/__notes/notes.js` with 200 → test in
  tests/design-atlas-serve-port.test.js
- **AC-20260909-06-2**: WHEN two `serve --port 0` children start on the same root THE SYSTEM SHALL
  CONTINUE TO announce two different ports, and both SHALL CONTINUE TO answer
  `GET /__notes/notes.js` with 200 → test in tests/design-atlas-serve-port.test.js
- **AC-20260909-06-3** `[pre-green: predicate-in-test]`: WHEN `serveAtlas(dir)` resolves THE SYSTEM SHALL return `port` equal to the
  number in the child's banner and `url` equal to `http://localhost:<port>`, and `await stop()`
  SHALL leave `child.exitCode !== null || child.signalCode !== null` → test in
  tests/design-atlas-serve-port.test.js
- **AC-20260909-06-4** `[pre-green: predicate-in-test]`: WHEN `serveAtlas(dir, {script: <path to a stub that prints nothing and
  keeps a 1 s interval alive>})` runs THE SYSTEM SHALL reject within 6 s with a message containing
  `no banner within 5000 ms` and the stub child SHALL have `exitCode !== null || signalCode !== null`
  → test in tests/design-atlas-serve-port.test.js
- **AC-20260909-06-5**: WHEN a test calls `mocks-driver-fixtures.js`'s `freePort` THE SYSTEM SHALL
  CONTINUE TO return a number the caller can bind → the existing look-stop tests in
  tests/mocks/mocks-driver-look-stops*.test.js (retagged, no new test)
- **AC-20260909-06-6**: WHEN two serves are started on the same `freePort()` value THE SYSTEM SHALL
  CONTINUE TO print `already serving` from the second and exit 0 → test in
  tests/design-atlas.test.js (the reuse-branch test, re-pointed)
- **AC-20260909-06-7**: WHEN the design-atlas serve-backed tests run THE SYSTEM SHALL CONTINUE TO
  pass their existing assertions with `withServe(dir, fn)` taking no port argument → tests in
  tests/design-atlas.test.js (existing `withServe` callers, retagged)
- **AC-20260909-06-8** `[pre-green: absence-invariant]`: WHEN `grep -rnE "[0-9]{4,5} *\+ *\(?(process\.pid|Math\.random)" tests/`
  runs THE SYSTEM SHALL print nothing (exit 1) → test in tests/design-atlas-serve-port.test.js
  (executes the grep via `child_process` against `ROOT/tests`)

## Assumptions (escalation triggers)

- A1 (executed micro-spike, 2026-09-09, Node 26.0.0): `http.createServer().listen(0, '127.0.0.1')`
  reported `address().port` 61255; `parseInt('0', 10)` is `0` — **if false:** none.
- A2: the serve banner is the only readiness contract test harnesses wait on (report: every harness
  resolves on the first stdout line) — **if false:** a harness waiting on something else is
  re-pointed to `serveAtlas` as well; add its row.
- A3: `mocks-driver.js` forwards `--port` to serve and never binds (report: lines 737–1485 build
  URLs only) — **if false:** its bind site gets the same `--port 0` treatment; add the row.
- A4: no test asserts on the literal port number it chose (the windows were chosen to avoid
  collisions, not for content) — **if false:** the assertion is rewritten against the resolved
  `port`; no behavior changes.

## Rationale

The 3-hour loss on 2026-09-09 was a test wedged on a port collision. The explorer's map shows why
it was only a matter of time: seven pid-derived windows 300 wide with bases 10 apart, one random
window that contains another file's window, and a serve probe that answers "already serving" for
any atlas — so a collision does not fail loudly, it serves the wrong tree and the harness waits
for content that never comes. Under `--test-concurrency=3` those windows are reachable.

Ephemeral ports remove the class rather than widening the windows. The one place a specific port
is legitimately needed — the reuse-branch test — keeps `freePort()`; its TOCTOU is the same as
today's and is confined to one test. The identity-blind probe is left as is: with tests off fixed
ports it is only reachable by a human's second `serve`, and a root-identity handshake is a
product change the look-stop flow would have to carry too — if it recurs, that is its own spec.

Spec 07 adds the bound and the check that keep this true: a per-test timeout with force-exit so a
future hang is a two-minute red, and a doctor check that flags a port literal in tests.

## Canonical Delta

docs/canonical/design.md: add a paragraph, "`design-atlas.js serve --port 0` binds an
ephemeral port and announces the bound one in the banner; tests bind through
`tests/helpers.js`'s `serveAtlas`/`freePort` and never choose a port."
(specs/20260909/06-ephemeral-serve-ports.md)
