'use strict'
// lib/driver-io.js — the I/O helpers spec-review-driver.js and spec-build-driver.js share: runChild (the
// fail-closed spawnSync wrapper), appendLedger, the sidecar load/save pair, and writeOut.
// Owner: specs/20260901/01-build-driver.md.
//
// runChild takes no caller identity: the optional 4th arg `what` names WHICH child died and the remedy is
// the generic "re-run the driver". Fatal only on a genuinely dead child (`.status` null).
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
const hostRun = require('./host-run')

// spawnSync's `status` is null when the child dies by signal, fails to spawn or overflows maxBuffer. This is
// the ONE place death is handled; a legitimate non-zero exit comes back as a normal result.
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

// runChild's no-status die for a host command string: hostRun.run (bash -c, env additions,
// NODE_TEST_CONTEXT scrubbed) with the same fail-closed refusal.
function runHost(command, opts, what) {
  const r = hostRun.run(command, opts)
  if (r.error || r.status === null) {
    const reason = r.error ? r.error.message
      : r.signal ? 'killed by signal ' + r.signal
      : 'exited with no status (spawn failure)'
    process.stderr.write('driver-io: ' + (what || command) + ' died without an exit code (' + reason +
      ') — nothing it was meant to produce can be trusted; fix the cause and re-run the driver\n')
    process.exit(2)
  }
  return r
}

// writeOut is lib/sync-write.js's, re-exported so the drivers keep one import: print-then-exit
// on every terminal branch must never truncate at the 64 KiB pipe buffer, and a reader that
// closed early (EPIPE) is done, not a crash. The rationale lives once, in that module's header.
const { writeOut } = require('./sync-write')

// <root>/.claude/spec-runs.jsonl, sync — the one run ledger both drivers append their stage row
// to. mkdir -p first: a fresh host may not have .claude/ yet at a driver's very first ledger
// write.
function appendLedger(root, jsonLine) {
  const ledgerPath = path.join(root, '.claude/spec-runs.jsonl')
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.appendFileSync(ledgerPath, jsonLine + '\n')
}

// object | {} — an absent sidecar reads as {} (a fresh run); malformed JSON dies loudly (exit 2) rather than
// silently restarting the run from cold.
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

module.exports = { runChild, runHost, writeOut, appendLedger, loadSidecar, saveSidecar }
