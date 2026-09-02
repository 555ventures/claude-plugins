'use strict'
// lib/driver-io.js — the four private I/O helpers spec-review-driver.js and spec-build-driver.js
// both need, extracted so two drivers never carry two copies (specs/20260901/01-build-driver.md
// D11). spec-review-driver.js (specs/20260820/07) grew runChild (the fail-closed spawnSync
// wrapper), appendLedger, and a load/save pair for its own <spec>.review/ sidecar; the build
// driver (this spec) needs the identical shapes for its own <spec>.build/ sidecar and ledger row,
// plus a synchronous stdout writer neither driver had a shared copy of. A second, paraphrased copy
// of any of these in the new driver is the exact drift seam ci-query.js was unified over on
// (specs/20260805/02-review-evidence-manifest.md D4) and lib/gate-resolve.js closed for the two gate resolvers (specs/20260830/02-close-gate-rerun.md D3).
//
// runChild deliberately takes no caller identity (no __filename/specPath) — those lived in
// spec-review-driver.js's die() remedy text before this extraction, and a shared library cannot
// name a caller-specific re-run command without threading it through every call site. The `what`
// label (optional 4th arg) still names WHICH child died; the remedy is the generic "re-run the
// driver" rather than a copy-pastable command line. Callers that want a sharper remedy print one
// themselves before calling process.exit in their own code paths — this function's only job is
// the fail-closed refusal on a genuinely dead child (signal-killed, never spawned, or
// maxBuffer-overflowed spawnSync, whose `.status` is null).
//
// What this deliberately does NOT do: retry a dead child, classify a non-zero-but-alive exit as
// anything but the caller's own normal branch (a legitimate red gate, a merge conflict, a
// RED_BLOCKING leg all come back as ordinary results), or read/write the ledger's own schema —
// callers build the JSON line, this module only appends it.
//
// Exit codes: n/a (library, not an entrypoint) — runChild/loadSidecar call process.exit(2) on a
// fail-closed condition (a dead child, or an unparseable sidecar file), same as every other
// precondition refusal in this repo's drivers.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// R9 (spec-review-driver.js's own comment, carried forward): spawnSync's `status` is null when
// the child dies by signal, fails to spawn, or overflows maxBuffer — every caller that reads
// `.status`/`.code` or trusts `.stdout` without checking either would otherwise tolerate that null
// silently. This is the ONE place death is handled: every spawnSync call in both drivers routes
// through here, and only a genuine no-exit-code death is fatal — a legitimate non-zero exit (a
// red gate, RED_BLOCKING, a merge conflict) still comes back as a normal result for the caller's
// own branch to read.
function runChild(cmd, args, opts, what) {
  const r = spawnSync(cmd, args, opts)
  if (r.error || r.status === null) {
    const reason = r.error ? r.error.message
      : r.signal ? 'killed by signal ' + r.signal
      : 'exited with no status (spawn failure)'
    const label = what || (cmd + ' ' + args.join(' '))
    process.stderr.write('driver-io: ' + label + ' died without an exit code (' + reason +
      ') — nothing it was meant to produce can be trusted; fix the cause and re-run the driver\n')
    process.exit(2)
  }
  return r
}

// The synchronous, EAGAIN-retrying writer this repo's other large-payload scripts already carry
// (spec-status.js, red-check.js, fleet-reader.js, genesis-driver.js, registry-check.js,
// render-*.js): `console.log(...)` immediately followed by `process.exit(0)` silently truncates at
// the 64 KiB pipe buffer while still exiting 0 — stdout's write to a pipe is async, and
// process.exit tears the process down mid-flush (.claude/rules/spec-pipeline.md [plugin] gotcha,
// spec-status.js's own ~75 KB dashboard truncation). Neither driver's own final print had grown
// past that ceiling yet, but both drivers print-then-exit on every terminal branch, so both route
// through this rather than wait to be the next host that measures the truncation the hard way.
function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

// <root>/.claude/spec-runs.jsonl, sync — the one run ledger both drivers append their stage row
// to. mkdir -p first: a fresh host may not have .claude/ yet at a driver's very first ledger
// write.
function appendLedger(root, jsonLine) {
  const ledgerPath = path.join(root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.appendFileSync(ledgerPath, jsonLine + '\n')
}

// object | {} — absent sidecar file reads as {} (a fresh run), same as both drivers' own
// pre-extraction load. Malformed JSON is NOT swallowed the same way: it dies loudly (exit 2)
// rather than silently resetting to {}, which would otherwise let a corrupt sidecar quietly restart a run
// from cold with no trace of why. Neither driver's existing test suite ever wrote unparseable
// JSON into a sidecar expecting the old silent-reset behavior (checked against both suites before
// this landed), so this is a strict hardening, not an observed behavior change.
function loadSidecar(dir, file) {
  const p = path.join(dir, file)
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch {
    return {}
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    process.stderr.write('driver-io: ' + p + ' is not valid JSON (' + e.message + ') — the ' +
      'sidecar is corrupt; delete ' + dir + ' to restart this run cold\n')
    process.exit(2)
  }
}

// mkdir -p, pretty JSON + trailing newline — identical shape to both drivers' own pre-extraction
// saveSidecar closures.
function saveSidecar(dir, file, obj) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, file), JSON.stringify(obj, null, 2) + '\n')
}

module.exports = { runChild, writeOut, appendLedger, loadSidecar, saveSidecar }
