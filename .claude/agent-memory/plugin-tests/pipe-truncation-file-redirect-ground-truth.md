---
name: pipe-truncation-file-redirect-ground-truth
description: Pinning a console.log()-then-process.exit() async-pipe truncation fix — build the fixture large via File Plan table padding, get ground truth via a synchronous file-redirect run, compare byte-for-byte against a real piped run.
metadata:
  type: feedback
  reviewed: 2026-09-03
---

Pinning "does `--json` output survive a pipe intact" needs TWO runs of the same invocation, not
one: `runNode(SCRIPT, argv, { stdio: ['ignore', fd, 'ignore'] })` writing to a real fd (synchronous
— ground truth for the full emitted byte count) vs a normal `runNode(SCRIPT, argv, { encoding: null })`
piped run (Buffer stdout, so byte length is exact — a `'utf8'`-decoded JS string's `.length` counts
UTF-16 units, not bytes, and is the wrong thing to compare against a byte threshold). Assert
`fullBytes.length > 65536` first (vacuousness guard on the ground truth, not the piped run — a piped
run under the bug is ALWAYS ≤ 65536, so gating vacuousness on it is backwards), then
`pipeRun.stdout.length === fullBytes.length` (the real pin), then `JSON.parse`.

**Why:** [[../gate-scripts/console-log-exit-pipe-truncation.md]] (if it exists) is the gate-scripts
agent's record of the underlying fix in spec-status.js (specs/20260823/08-derived-session-queue.md
repair round, 2026-08-23) — `console.log()` to a pipe is async in Node, so an immediately-following
`process.exit()` tears the process down before the pipe drains, truncating stdout at exactly the
64 KiB pipe buffer while the exit code still reads 0. A fixture must be proven >64 KiB via the
ground-truth leg or the pin is vacuous and would stay green even if the bug came back.

To build a fixture that big cheaply: pad File Plan tables (6 rows/spec of `| path | MODIFY | long
note |`) across ~300+ synthetic specs/briefs in one `tmpdir()` host — the dashboard `--json` path
inflates fast (filePlan rows ride straight into the JSON), but `--next --json` only carries one
entry per spec with no filePlan, so it needs roughly 4x the spec count to clear the same threshold.
Measure both emission paths' actual sizes empirically before picking N — don't guess.

**How to apply:** Any future "does X script's piped output survive at scale" pin. Also the technique
for proving a regression pin discriminates: reconstruct the pre-fix script via `git show <sha>:<path>`
PLUS its `lib/*.js` siblings at the same commit into a sibling directory (a script requiring
`./lib/foo` fails MODULE_NOT_FOUND if you copy only the top-level file elsewhere) — see
[[regression-pin-prove-against-reconstructed-old-code]]. When swapping the real implementation file
temporarily to prove a test fails pre-fix, `cp -R` it to scratch first and diff after restoring to
confirm the restore was byte-exact, not just "looks right."
