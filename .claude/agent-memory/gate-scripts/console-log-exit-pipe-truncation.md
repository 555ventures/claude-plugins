---
name: console-log-exit-pipe-truncation
description: console.log immediately followed by process.exit(0) silently truncates large stdout to 64KiB when a caller pipes/spawnSync's the script, exit code still reads 0
metadata:
  type: feedback
  reviewed: 2026-11-04
---

`console.log(bigString)` followed on the next line by `process.exit(0)` is unsafe in any
script whose stdout may be a PIPE (any programmatic caller via `spawnSync`/`exec`). Node's
write to a pipe is asynchronous; `process.exit()` tears the process down before the write
drains, silently truncating at the 64 KiB pipe buffer while the exit status still reports 0.
Writing to a FILE (`> out.json`) is synchronous, so this never reproduces via shell
redirection — only via a real pipe consumer. Reproduce with `spawnSync` + check
`stdout.length`, not `>`.

**Why:** found 2026-08-23 in `spec/scripts/spec-status.js` — latent since the file was
written (confirmed present at commit `89978d3a...`), surfaced only when `spec-queue.js`
became the first programmatic `--json` consumer post-autopilot-deletion. This repo's live
dashboard JSON is ~75 KB, so real hosts hit it immediately once any script pipes
spec-status's output instead of redirecting it to a file.

**How to apply:** any gate script whose payload can be large (JSON dumps especially) routes
stdout through the ONE shared writer, `spec/scripts/lib/sync-write.js`'s `writeOut` (looped for
partial writes, EAGAIN retried, EPIPE treated as done) — imported as
`const { writeOut: syncWrite } = require('./lib/sync-write')`, with any local wrapper keeping only
the framing. Never hand-roll an `fs.writeSync` loop: since specs/20261101/10-one-writer-and-no-copies-left.md
a standing sweep in `tests/ceiling/sync-write-callers.test.js` fails if `writeSync(` appears in any
file under `spec/scripts/` other than that library.
