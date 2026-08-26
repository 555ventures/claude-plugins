# Deviations — specs/20260825/03-genesis-currency-executed.md

- tests/genesis/registry-check.test.js: reachable-registry fixtures (AC-1, AC-2, AC-3, AC-5) run
  registry-check.js through a local async `child_process.spawn` wrapper, not `tests/helpers.js`'s
  `runNode` (which is `spawnSync`), while an in-process `http.createServer` fixture is listening in
  the same test process. Empirically confirmed (scratch spike, 2026-08-26, deleted): `spawnSync`
  blocks the parent Node event loop for the child's whole lifetime, so a same-process
  `http.createServer` can never service the child's request — the request hangs until the
  `spawnSync` timeout fires (ETIMEDOUT), never the response Assumption A4 expects. This is the same
  mechanism `tests/release-legs/release-legs.test.js` already documents (dated comment: "spawnSync-
  ing release-legs.js against an in-process stub would deadlock the parent event loop for the
  child's whole lifetime"). A local `async spawn`-based runner keeps the parent event loop free to
  service the fixture server while the real `spec/scripts/registry-check.js` process runs — same
  script, same real argv, still exec-a-script per Test Rules — so this is a harness-level fix, not a
  change to A4's substantive claim (Node's `http`/`https` built-ins are sufficient, in-process is a
  valid registry stand-in). AC-4 (closed-port/unreachable) keeps using the synchronous `runNode`
  helper: the server is bound, its port read, then closed *before* the run, so no live in-process
  server needs servicing during that run and there is no event-loop contention.

- spec/entrypoints.json: D9 specifies the `spec/scripts/registry-check.js` row's entry points as the
  three genesis commands. The row as built also declares `spec/doctrine/genesis.md`, because D8
  mandates that genesis.md name the script through its resolver (`` `spec-paths registry-check` ``),
  which the exhaustive live entrypoints pin (`AC-20260820-04-6`,
  `tests/consistency/entrypoints.test.js`) reads as a fourth invocation site and reports as an
  undeclared entry point. D10 names that live pin as the oracle for the new row, so the manifest
  follows the oracle rather than D9's enumeration; the added member is a consequence of D8 inside
  this same spec, not a widening of scope. Orchestrator edit at build Phase 3 (shared wiring
  surface, never a parallel worker's).
