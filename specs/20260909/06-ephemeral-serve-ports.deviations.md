# Deviations — 20260909/06-ephemeral-serve-ports

- D1's own mechanism (the banner reads `server.address().port`, never the literal requested
  port) was already shipped by specs/20260909/03-atlas-test-port-and-deadlines.md (commit
  `e03f23a`, further adjusted since). AC-20260909-06-1 and AC-20260909-06-2 pass against the
  pre-image script itself — verified empirically (`node spec/scripts/design-atlas.js serve
  --port 0` already announces the real bound port and answers `/__notes/notes.js` with 200, and
  two concurrent `--port 0` children already get two different ports). Their tests are still
  authored per the File Plan; the genuinely-red part of this batch is AC-20260909-06-8's grep
  (which failed until every listed file's literal was removed) and the new `serveAtlas`/
  `freePort` contract itself (AC-3/-4), which did not exist in the pre-image `tests/helpers.js`.
- `tests/design-atlas-serve-port.test.js` already existed on disk (created by
  specs/20260909/03's build for AC-20260909-03-6, ancestor of this worktree's `main`) — the File
  Plan lists it as CREATE, but it was a MODIFY. Rewrote it to also cover AC-20260909-06-1/-2/-3/
  -4/-8, and retagged the original AC-20260909-03-6 test in place (widened, not weakened: it
  still asserts the original triple-port-identity banner match and the `/atlas/index.html` 200,
  plus the new >= 1024 bound and `/__notes/notes.js` 200 checks) rather than deleting its
  coverage. Confirmed via `tests/doctor/ac-drift-clean.test.js` before and after.
- D3's "keeping their current signatures minus any port argument" was not applied literally to
  `startServe`/`stopServe` (tests/mocks/mocks-driver-fixtures.js) or the file-local
  `withServeAt` helpers (tests/design-atlas.test.js, tests/consistency/retired-flags.test.js):
  all three keep an explicit `(dir, port, fn)`/`(root, port)` signature because their callers
  must hand the SAME port to a second, separate CLI invocation (`stop open --port <p>`,
  `look --port <p>`) — AC-20260909-06-5 itself is a CONTINUE-TO pin requiring
  `mocks-driver-fixtures.js`'s 8 out-of-batch look-stop callers (in
  tests/mocks/mocks-driver-look-stops*.test.js, not this batch) to keep working unchanged, and
  those callers pre-compute a port via `freePort()` for exactly this reason. Only `withServe`
  (design-atlas.test.js, no caller ever needed a specific port) dropped its port argument, as a
  thin call to `serveAtlas(dir)`.
- Left `tests/mocks/chrome-harness.js`'s `serve(dir, port = 0)` untouched: D3 says its port
  argument is dropped, but `tests/mocks/chrome-harness.test.js`'s AC-20260909-03-2 (out of this
  batch) deliberately passes an explicit port to `serve()` twice to force an
  "already serving" collision, and verb-checks the resulting rejection message — a contract
  `serveAtlas` does not expose (it is verb-blind by design, D4's own rationale). Dropping the
  parameter would strand that pin. Flagging as a collision rather than editing out-of-batch.
- `tests/design-atlas-index.test.js`, `tests/mocks/notes-layer-isolation.test.js`, and
  `tests/mocks/notes-layer-navigation.test.js` needed no edits: grepped for the D4 literal
  patterns and for any port argument to `chrome-harness.js`'s `serve()` and found none — all six
  call sites already call `serve(dir)` with no port, a state specs/20260909/03 already reached.
  The File Plan's "computed port(s) removed" summary for these three rows is stale.
- Size-ratchet raises cited to this spec: `tests/helpers.js`, `tests/design-atlas-serve-port.test.js`,
  `tests/mocks/mocks-driver-look-stops-3.test.js`, and the `tests` tree total (`node
  scripts/size-ratchet.js --raise <path> --to <n> --cite specs/20260909/06-ephemeral-serve-ports.md`),
  plus `--update` for files that shrank (design-atlas.test.js, mocks-driver-fixtures.js,
  retired-flags.test.js).
