'use strict'
// lib/sync-write.js — the one synchronous writer a script that prints a payload and exits routes
// through. `console.log(...)` immediately followed by `process.exit(...)` silently truncates at the
// 64 KiB pipe buffer while still exiting 0: stdout's write to a pipe is async, and process.exit
// tears the process down mid-flush (.claude/rules/spec-pipeline.md [plugin] gotcha). fs.writeSync
// looped for partial writes cannot be torn down mid-flush.
//
// Error handling, per errno:
// - EAGAIN — a non-blocking fd is momentarily full; retry the same write.
// - EPIPE — the reader is gone (`script | head` after head exits). Nothing left to deliver, so
//   the write is done: return silently, never throw, never exit. The caller's own exit code
//   (0 on the normal path, a die() code on stderr) stays the script's verdict. Node ignores
//   SIGPIPE, so without this the EPIPE surfaces as an uncaught exception and exit 1, masking
//   that code. Per call, not sticky: a later write to the same dead fd hits EPIPE again and
//   returns again, and a closed stdout never silences a still-live stderr.
// - anything else (ENOSPC, EIO, EBADF on a `> file` redirect) — thrown; a lost write to a real
//   destination is a failure, not a closed reader.
//
// What this deliberately does NOT do: buffer, or pick the fd — every caller names fd 1 or 2.
// writeOut never appends a newline; writeLine always appends exactly one.
//
// Exit codes: n/a (library, not an entrypoint) — never exits.

const fs = require('fs')

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      if (e.code === 'EPIPE') return
      throw e
    }
  }
}

// writeLine: writeOut plus one trailing newline — the framing most print-and-exit callers want.
function writeLine(fd, text) {
  writeOut(fd, text + '\n')
}

module.exports = { writeOut, writeLine }
