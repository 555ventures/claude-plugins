---
name: synthetic-gate-command-async-stdout-truncates-before-runshell
description: a synthetic gateCommand/scaffoldCommand written as `node -e "process.stdout.write(...); process.exit(1)"` truncates its own log before the driver ever sees it — use coreutils (head/tr) for large-single-line repro fixtures instead
metadata:
  type: feedback
  reviewed: 2026-08-29
---

When building a repro fixture that must write N raw bytes with no newline to a file (e.g. to
trigger a `logTail`-style bug in `genesis-driver.js`), do NOT synthesize the writer as
`node -e "process.stdout.write('x'.repeat(N)); process.exit(1)"`. Node's stdout write is
asynchronous even when the fd is a real file (not a pipe) if it exceeds the internal highWaterMark
in one call, and the immediate `process.exit()` tears the stream down mid-flush — the exact
64 KiB-class truncation bug already documented in this repo's own header comments
([[console-log-exit-pipe-truncation]]). This silently caps the "3,000,000-byte" fixture at 65536
bytes on disk, which can hide the real target bug if the buggy code path also has an unrelated
byte ceiling nearby (a coincidence that cost real debugging time — the truncated size and a
default 1 MiB caller maxBuffer are unrelated numbers that can both look plausible).

**Why:** verified 2026-08-26/27 while reproducing genesis-driver.js's F7 (`logTail` bounding by
line count only): `bash -c "head -c 3000000 /dev/zero | tr '\\0' 'x'; exit 1"` run directly via
`spawnSync(..., { stdio: ['ignore', fd, fd] })` writes the full byte count reliably, confirmed over
5 repeated runs; the `node -e ...write();exit()` equivalent did not.

**How to apply:** for any repro needing a large single write to a real fd (not a pipe) followed by
a nonzero exit, drive it through coreutils (`head -c N /dev/zero | tr '\0' 'x'; exit 1`) or another
non-Node child, never through a Node one-liner with `process.exit()` immediately after
`process.stdout.write()` of a large payload.
