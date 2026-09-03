---
name: console-log-exit-pipe-truncation
description: console.log immediately followed by process.exit(0) silently truncates large stdout to 64KiB when a caller pipes/spawnSync's the script, exit code still reads 0
metadata:
  type: feedback
  reviewed: 2026-09-02
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

**How to apply:** any gate script with `console.log(...); process.exit(...)` back-to-back
where the printed payload can be large (JSON dumps especially) needs a synchronous flush
before exit — a small `writeOut(str)` helper using `fs.writeSync(1, buf, off, len)` in a
loop (handles partial writes on a pipe) with EAGAIN retry, documented with the dated
incident per this repo's header-comment convention. Small/bounded prints (a one-line usage
error, a tiny status report) are not at risk — only apply the helper where it's load-bearing,
per [[gate-scripts-parallel-batch-corpus-landing]]-style scoping discipline (don't touch
exit sites outside what was asked). See specs/20260823/08's repair-round deviation entry for
the executed proof and fix shape.
