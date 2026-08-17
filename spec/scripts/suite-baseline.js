#!/usr/bin/env node
'use strict'
// suite-baseline.js — the sanctioned-red suite-failure set as a checked-in, checked artifact.
//
// specs/20260814/03-suite-baseline.md: the repo's expected-failing-test set used to be
// folklore (prose plus a stale count in Test Rules), so a full-suite run was unjudgeable and
// a Decision that broke five out-of-scope pins shipped through a green scoped gate and a
// qualified-CLEAN review (the 2026-08-14 escape on specs/20260813/10-host-capabilities.md).
// This script is the sole derivation of expected-vs-observed suite-failure comparison — never
// a second failing-set differ anywhere, and never a hand-run base-worktree name-diff again.
//
// Usage:
//   suite-baseline.js --check [--pre <file>] --root <dir>
//   suite-baseline.js --update --root <dir>
//   suite-baseline.js --snapshot --out <file> --root <dir>
//   suite-baseline.js --gate "<command>" --root <dir>
//   suite-baseline.js --gate-file <path> --root <dir>    # command read verbatim from <path>,
//                                                         # for commands containing '"' or '$'
//
// What it deliberately does NOT do: create or consult a second (base-commit) worktree, compare
// counts instead of names, attribute a drift to a cause beyond the pre-image axis, add a
// capabilities key to the grounding contract, or (--gate/--gate-file) compute fixedNotRemoved —
// a scoped gate run doesn't execute most baseline files, so absence proves nothing; that stays
// --check's job (specs/20260816/01-gate-baseline-reconcile.md D3).
//
// Incident (2026-08-16, spec gate-baseline-reconcile): the scoped gate exits red on a spec's
// sanctioned always-red intake pins for reasons unrelated to the spec, and a session hand-
// verified the red names against the baseline and overrode it — judgment substituting for
// derivation, the third recurrence of the class. --gate/--gate-file (D1) run the wrapped
// command through this same failing-set differ and subtract the baseline by name on the way
// out, so a red gate whose only failures are sanctioned pins now exits 0 by derivation.
//
// Exit codes:
//   0  --check: observed failing set exactly matches the baseline (flaky-exempt) ·
//      --update: baseline rewritten · --snapshot: file written ·
//      --gate/--gate-file: child exited 0, OR child exited non-zero and every parsed failure is
//      sanctioned (residual=0)
//   1  --check only: drift (NEW-FAILING / FIXED-NOT-REMOVED lines printed) ·
//      --gate/--gate-file: residual>0 (NEW-FAILING lines + sentinel printed), OR the child died
//      without an exit code at all (killed by a signal, failed to spawn, or its output overflowed
//      maxBuffer) — there is nothing to pass through and no complete trailer to trust, so this
//      fails closed rather than exiting 0 by absence of evidence (D2)
//   2  usage · unreadable/corrupt baseline or --pre JSON · config has no testCommand
//   4  --check/--update/--snapshot only: the suite exited non-zero but no `✖ failing tests:`
//      trailer was parseable; --snapshot writes NO file in this case
//   <child's exit code>  --gate/--gate-file only: child exited non-zero WITH an exit code but no
//      parseable trailer — passthrough (a note line is printed; never exit 4, since the gate must
//      report the real failure, not a fixed sentinel). A child that exits with no code at all
//      (status null) is not passthrough-eligible — see exit 1 above.
//
// The observed failing set: suite exit 0 → empty, by definition, zero output parsing. Suite
// exit non-zero (with a real exit code) → parse the node:test spec-reporter trailer from the
// `✖ failing tests:` marker, pairing each `test at <file>:<line>:<col>` line with its following
// `✖ <name> (<duration>)` line; unparseable → exit 4 (--check/--update/--snapshot) or passthrough
// (--gate/--gate-file), never a guess. Suite exit code null (signal/spawn-failure/maxBuffer
// overflow) → fail closed, exit 4 (--check/--update/--snapshot) or exit 1 (--gate/--gate-file);
// there is no output left to trust, so this is never treated as passthrough-eligible.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfig } = require('./lib/host-config')

function usage(msg) {
  console.error(`suite-baseline: ${msg}`)
  console.error('usage: suite-baseline.js (--check [--pre <file>] | --update | --snapshot --out <file> | ' +
    '--gate "<command>" | --gate-file <path>) --root <dir>')
  process.exit(2)
}

function fail2(msg) {
  console.error(`suite-baseline: ${msg}`)
  process.exit(2)
}

let mode = null
let root = '.'
let pre = null
let out = null
let gateCommand = null
let gateFile = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--check' || a === '--update' || a === '--snapshot') {
    if (mode) usage(`--check, --update, --snapshot, --gate, and --gate-file are mutually exclusive`)
    mode = a.slice(2)
  } else if (a === '--gate') {
    if (mode) usage(`--check, --update, --snapshot, --gate, and --gate-file are mutually exclusive`)
    mode = 'gate'
    gateCommand = argv[++i]
  } else if (a === '--gate-file') {
    if (mode) usage(`--check, --update, --snapshot, --gate, and --gate-file are mutually exclusive`)
    mode = 'gate'
    gateFile = argv[++i]
  } else if (a === '--root') root = argv[++i]
  else if (a === '--pre') pre = argv[++i]
  else if (a === '--out') out = argv[++i]
  else usage(`unrecognized flag '${a}'`)
}
if (!mode) usage('one of --check, --update, --snapshot, --gate, or --gate-file is required')
if (mode === 'snapshot' && !out) usage('--snapshot requires --out <file>')
if (out && mode !== 'snapshot') usage('--out is only valid with --snapshot')
if (pre && mode !== 'check') usage('--pre is only valid with --check')
if (mode === 'gate' && !gateCommand && !gateFile) usage('--gate requires a command or --gate-file requires a path')

// ---- shared helpers -----------------------------------------------------------------------

const keyOf = row => row.file + '\0' + row.name

function sortRows(rows) {
  return [...rows].sort((a, b) => a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file))
}

// The baseline itself is absent-tolerant (D2: no artifact = empty set, the common clean-suite
// host). A --pre file is NOT — a missing pre-image must exit 2, never silently degrade to a
// baseline-only comparison (AC-20260814-03-17), so callers pass allowMissing accordingly.
function readBaselineFile(p, label, allowMissing) {
  if (!fs.existsSync(p)) {
    if (allowMissing) return []
    fail2(`${label} ${p} does not exist`)
  }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    fail2(`${label} ${p} is not valid JSON — fix or delete it${allowMissing ? ', or run --update to regenerate it' : ''}`)
  }
  if (!parsed || !Array.isArray(parsed.failing)) {
    fail2(`${label} ${p} does not match the {"failing":[...]} shape — fix or delete it${allowMissing ? ', or run --update to regenerate it' : ''}`)
  }
  return parsed.failing
}

function normalizeFile(rootDir, file) {
  const f = String(file).trim()
  return path.isAbsolute(f) ? path.relative(rootDir, f) : f
}

// Parse the node:test spec-reporter trailer. Returns null when no `✖ failing tests:` marker,
// or a non-empty pair, is found — the caller turns null into exit 4, never a guess. The header
// line itself (`✖ failing tests:`) carries no trailing `(<duration>)`, so it never matches the
// name pattern and needs no special-case skip.
function extractFailing(rootDir, combinedOutput) {
  const idx = combinedOutput.indexOf('✖ failing tests:')
  if (idx === -1) return null
  const lines = combinedOutput.slice(idx).split('\n')
  const pairs = []
  for (let i = 0; i < lines.length - 1; i++) {
    const at = lines[i].match(/^test at (.+):\d+:\d+$/)
    if (!at) continue
    const name = lines[i + 1].match(/^✖ (.+) \([^)]*\)$/)
    if (name) pairs.push({ file: normalizeFile(rootDir, at[1]), name: name[1] })
  }
  return pairs.length ? pairs : null
}

// `NODE_TEST_CONTEXT` (set by node:test on itself, inherited by every child process) makes a
// spawned `node --test` treat itself as a recursive nested run and silently skip executing any
// files — exit 0, no trailer, no warning on stdout — which this script would misread as a clean
// suite. Stripped here so this script behaves identically whether invoked directly or (as its
// own test suite does) from inside another `node --test` run.
function runSuite(rootDir, testCommand) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  // Node's spawnSync default maxBuffer is 1MB; a verbose runner's stdout blows past that on a
  // suite this size, and the `✖ failing tests:` trailer prints LAST — so a truncation drops
  // exactly the evidence this script exists to read. Raised well past any observed suite output.
  return spawnSync('bash', ['-c', testCommand], { cwd: rootDir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
}

// Suite exit 0 → empty failing set, zero parsing (D4). Suite exit non-zero → parse the trailer;
// unparseable → exit 4, printed and never a guess.
function observedFailing(rootDir, testCommand) {
  const r = runSuite(rootDir, testCommand)
  if (r.status === 0) return []
  const combined = (r.stdout || '') + '\n' + (r.stderr || '')
  const pairs = extractFailing(rootDir, combined)
  if (pairs === null) {
    console.log('unavailable — cannot extract failing test names from runner output')
    process.exit(4)
  }
  return pairs
}

function testCommandOrFail(rootDir) {
  const cfg = readConfig(rootDir)
  const cmd = cfg.testCommand
  if (typeof cmd !== 'string' || !cmd.trim()) {
    fail2(`no testCommand in ${path.join(rootDir, '.claude', 'spec.config.json')} — set testCommand to the bare command that runs the whole suite`)
  }
  return cmd
}

// ---- --check ---------------------------------------------------------------------------------

function doCheck() {
  const testCommand = testCommandOrFail(root)
  const baselineRows = readBaselineFile(path.join(root, '.claude', 'suite-baseline.json'), 'baseline', true)
  // Read --pre BEFORE running the suite: a missing/corrupt pre-image must exit 2 without ever
  // producing a baseline-only comparison (AC-20260814-03-17).
  const preRows = pre ? readBaselineFile(pre, '--pre file', false) : null

  const observed = observedFailing(root, testCommand)

  const flakyKeys = new Set(baselineRows.filter(r => r.flaky).map(keyOf))
  const nonFlaky = baselineRows.filter(r => !r.flaky)
  const baselineKeys = new Set(nonFlaky.map(keyOf))
  const observedKeys = new Set(observed.map(keyOf))

  const newFailing = sortRows(observed.filter(o => !baselineKeys.has(keyOf(o)) && !flakyKeys.has(keyOf(o))))
  const fixedNotRemoved = sortRows(nonFlaky.filter(b => !observedKeys.has(keyOf(b))))

  for (const r of newFailing) console.log(`NEW-FAILING ${r.file} :: ${r.name}`)
  for (const r of fixedNotRemoved) console.log(`FIXED-NOT-REMOVED ${r.file} :: ${r.name}`)
  console.log(`newFailing=${newFailing.length} fixedNotRemoved=${fixedNotRemoved.length}`)

  if (preRows) {
    const preKeys = new Set(preRows.map(keyOf))
    const preNewFailing = sortRows(observed.filter(o => !preKeys.has(keyOf(o)) && !flakyKeys.has(keyOf(o))))
    const preFixed = sortRows(preRows.filter(p => !observedKeys.has(keyOf(p)) && !flakyKeys.has(keyOf(p))))
    for (const r of preNewFailing) console.log(`PRE-NEW-FAILING ${r.file} :: ${r.name}`)
    console.log(`preNewFailing=${preNewFailing.length} preFixed=${preFixed.length}`)
  }

  const drift = newFailing.length > 0 || fixedNotRemoved.length > 0
  if (drift) console.log(`remedy: node "$(spec-paths suite-baseline)" --update --root ${root}`)
  process.exit(drift ? 1 : 0)
}

// ---- --update ----------------------------------------------------------------------------------

function doUpdate() {
  const testCommand = testCommandOrFail(root)
  const baselinePath = path.join(root, '.claude', 'suite-baseline.json')
  const existing = readBaselineFile(baselinePath, 'baseline', true)
  const existingFlaky = new Set(existing.filter(r => r.flaky).map(keyOf))

  const observed = observedFailing(root, testCommand)
  const rows = sortRows(observed.map(o => existingFlaky.has(keyOf(o)) ? { ...o, flaky: true } : { ...o }))

  fs.mkdirSync(path.dirname(baselinePath), { recursive: true })
  fs.writeFileSync(baselinePath, JSON.stringify({ failing: rows }, null, 2) + '\n')
  console.log(`suite-baseline: wrote ${rows.length} failing row(s) to ${baselinePath}`)
  process.exit(0)
}

// ---- --snapshot --------------------------------------------------------------------------------

function doSnapshot() {
  const testCommand = testCommandOrFail(root)
  const observed = observedFailing(root, testCommand)
  const rows = sortRows(observed.map(o => ({ ...o })))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ failing: rows }, null, 2) + '\n')
  console.log(`suite-baseline: snapshot of ${rows.length} failing row(s) written to ${out}`)
  process.exit(0)
}

// ---- --gate / --gate-file ------------------------------------------------------------------
//
// D1-D4: run the resolved gate command through the same failing-set differ, subtract the
// baseline by name, and turn a red gate whose only failures are sanctioned pins into an exit
// 0 — deterministically, never by a session hand-verifying names against the baseline. D3:
// asymmetric by design — only the residual (observed minus baseline) is computed, never
// fixedNotRemoved; a scoped gate run doesn't execute most baseline files, so absence proves
// nothing there.

function doGate() {
  let cmd = gateCommand
  if (gateFile) {
    try {
      cmd = fs.readFileSync(gateFile, 'utf8')
    } catch {
      fail2(`--gate-file ${gateFile} does not exist or is not readable`)
    }
  }
  const baselineRows = readBaselineFile(path.join(root, '.claude', 'suite-baseline.json'), 'baseline', true)
  const flakyKeys = new Set(baselineRows.filter(r => r.flaky).map(keyOf))
  const baselineKeys = new Set(baselineRows.filter(r => !r.flaky).map(keyOf))

  const r = runSuite(root, cmd)
  const combined = (r.stdout || '') + '\n' + (r.stderr || '')
  // fs.writeSync (not process.stdout.write) — when stdout is a pipe, process.stdout.write on a
  // multi-MB string is asynchronous, and the process.exit() calls below (needed for the gate's
  // exit-code contract) cut the pipe before the OS drains it, truncating exactly the trailer this
  // script depends on. writeSync blocks until the write completes, so process.exit() is safe
  // immediately after (found via AC-20260816-01-14, a >1MB combined-output gate).
  fs.writeSync(1, combined)

  if (r.status === 0) process.exit(0)

  // A null status means the child was killed by a signal, failed to spawn, or overflowed
  // spawnSync's maxBuffer — there is no exit code to pass through and no complete output to
  // trust. Fail closed (D2: never green by absence of evidence; INTAKE JJ-20260816-03 requires
  // fail-closed on any red without a parseable trailer). The sibling observedFailing() has
  // always done this; the review of specs/20260816/01 (2026-08-17) found doGate() had dropped it.
  if (r.status === null) {
    const cause = r.signal ? `terminated by ${r.signal}`
      : (r.error ? `spawn failed: ${r.error.code || r.error.message}` : 'no exit code')
    console.log(`suite-baseline: child ${cause} — failing closed with exit 1; re-run the gate command directly to observe the real failure`)
    process.exit(1)
  }

  const pairs = extractFailing(root, combined)
  if (pairs === null) {
    console.log(`suite-baseline: no failing-test trailer — exit ${r.status} passed through`)
    process.exit(r.status)
  }

  const residual = sortRows(pairs.filter(o => !baselineKeys.has(keyOf(o)) && !flakyKeys.has(keyOf(o))))
  for (const row of residual) console.log(`NEW-FAILING ${row.file} :: ${row.name}`)
  console.log(`__SUITE_BASELINE__ failing=${pairs.length} sanctioned=${pairs.length - residual.length} residual=${residual.length}`)
  process.exit(residual.length > 0 ? 1 : 0)
}

if (mode === 'check') doCheck()
else if (mode === 'update') doUpdate()
else if (mode === 'snapshot') doSnapshot()
else doGate()
