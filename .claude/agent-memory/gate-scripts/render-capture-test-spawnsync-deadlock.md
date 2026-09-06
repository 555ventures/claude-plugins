---
name: render-capture-test-spawnsync-deadlock
description: tests/render/render-capture.test.js AC-1/AC-2 deadlock via the known runNode/spawnSync-vs-in-process-server gotcha — not a render-capture.js bug
metadata:
  type: project
---

tests/render/render-capture.test.js's AC-20260905-06-1 and AC-20260905-06-2 (both `[env:
CHROME_BIN]`, real-Chrome) start an `http.createServer` in the TEST's own process, then invoke
`render-capture.js` via `runNode` (tests/helpers.js, `child_process.spawnSync`) with a `--url`
pointing at that same in-process server. `spawnSync` blocks the parent's entire event loop for
the child's whole lifetime, so the server can never answer the child's navigation request —
verified by a minimal repro (`http.createServer` + `spawnSync('curl', ...)` in the same
process hangs for the full timeout). This is the exact documented gotcha in
`.claude/rules/spec-pipeline.md` § Gotchas (specs/20260825/03): "a test that stands up an
in-process http.createServer stub and then runNodes the script under test against it can never
service the child's request... needs a file-local async child_process.spawn runner." Also
demonstrated working correctly in tests/design-atlas.test.js's `withServe`/`withHandler`
helpers (async `spawn`, never `runNode`).

**How to apply:** render-capture.js's own implementation is correct — manually verified against
real Chrome standalone (separate processes) with correct `page.clientWidth`/`scrollWidth`. If a
future spec touches these two ACs, the fix is a test-file change (swap `runNode` for a
file-local async `spawn` runner, mirroring `withServe`), never a render-capture.js workaround.
Per worker rules, gate-scripts agents must not edit tests — report this precisely instead of
"fixing" it in the script under test. See [[render-gate-implementation-gotchas]] for the sibling
async-vs-spawnSync discipline already established in render-gate.js itself.
