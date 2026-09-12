#!/usr/bin/env node
'use strict'
// coverage-scope.js --root <r> [--json]
//
// WHY: specs/20260911/03-tests-expire-at-close.md made a spec's tests die at close — expire-tests.js
// deletes every test tagged with the closing spec's own AC-IDs, then `--mark closed` re-runs the
// host's gate over that tree. That behavior places an obligation on the host that spec never
// stated: a check requiring a test carrier per acceptance criterion must scope its carriers to
// specs that are NOT done (a done spec owes a carrier only for a `SHALL CONTINUE TO` criterion —
// the plugin's own ac-drift.js applies exactly that rule). A host check that demands a carrier for
// EVERY AC of a done spec contradicts expiry and deadlocks every close: the close deletes the
// tests, the gate re-run reports the just-closed spec's criteria uncovered, and the close is
// refused with no path forward. The grounding contract's § Test expiry now carries the obligation
// and /spec:init names it while profiling; this script is that section's conformance probe for a
// host initialized BEFORE the section existed — /spec:doctor's check 20 runs it.
//
// Not a standing guard earned by recurrence (core § Incident Policy): the obligation is a logical
// consequence of the close-time deletion, true in a host that has never once deadlocked. Its
// population is finite and shrinking — hosts predating the contract section — so the kill
// condition is migration-shaped: when no readable host reports a finding across a full major
// pipeline version, delete the script and the check.
//
// Named `coverage-scope.js`, never `test-*` — `node --test`'s default discovery matches
// `**/test-*.js` anywhere under the root and would execute this file as a test (the rename
// incident is spelled out in expire-tests.js's own header).
//
// SIGNATURE (deterministic, language-neutral, deliberately narrow): a non-test source file that
// names an AC-ID — literally (`AC-20260824-02-1`) or as a pattern a scanner matches with
// (`AC-\d{8}`, `AC-[0-9]{8}`) — AND compares a status against a `done` literal, AND never mentions
// `SHALL CONTINUE TO`. The pin phrase is the exemption because a check that honors the obligation
// must name it: that is the only string by which a criterion opts out of expiry. Measured over the
// nine pipeline hosts on the author's machine (2026-09-12): one hit, the real offender
// (prax `scripts/check-ac-execution.mjs`, selecting `implementing` OR `done` with no pin clause),
// zero false positives elsewhere, and the plugin's own expire-tests.js correctly exempt.
//
// What this deliberately does NOT do: read the host's gateCommand, run anything, name a host tool,
// or judge whether a hit is truly a coverage check — it reports a file to read, at doctor's
// advisory tier, never a gate refusal. A host whose check reads spec status indirectly is a known
// false negative; the close-time refusal in spec-review-driver.js remains the backstop.
//
// Exit codes: 0 = scanned, no findings · 1 = scanned, findings printed (advisory in doctor) ·
//             2 = usage error or --root not a readable directory

const fs = require('fs')
const path = require('path')
const { readConfig } = require('./lib/host-config')
const { listTestFiles } = require('./lib/scan-test-calls')

const USAGE = 'coverage-scope.js --root <dir> [--json]'

// Same skip set as the expiry sweep, widened by the build/vendor directories no host authors a
// gate check inside. `specs/` and `docs/` are excluded by construction: a spec DECLARES criteria
// (every one of them names AC-IDs and statuses), it never enforces them.
const SKIP_DIR_NAMES = new Set([
  '.git', 'node_modules', 'fixtures', '__fixtures__', 'dist', 'build', 'coverage', 'vendor',
  '.next', '.venv', '__pycache__', 'specs', 'docs',
])
const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.sh', '.bash', '.py', '.rb', '.go', '.rs', '.java',
  '.kt', '.php', '.ex', '.exs', '.pl', '.ps1',
])
const MAX_BYTES = 512 * 1024

// An AC-ID EXTRACTION pattern, never a cited id: `AC-` followed by a digit-class token as a
// scanner's own regex spells it, or an AC-ID identifier. A file merely citing `AC-20260824-02-1`
// as its owner citation is the normal shape of every script in the layer and is never a finding —
// only a file that PARSES acceptance-criterion ids can be the check this scan is looking for.
const AC_REFERENCE_RE = /AC-(?:\\{1,2}d|\[0-9\]|%d|\{8\})|\bAC_ID|\bac_?[Ii]d\b/
// A status compared against a `done` literal, in any of the quoting styles the fleet's languages use.
const DONE_LITERAL_RE = /["'`]done["'`]/
const PIN_RE = /SHALL CONTINUE TO/

function writeOut(fd, str) {
  const buf = Buffer.from(str + '\n', 'utf8')
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

function die(msg) {
  writeOut(2, 'coverage-scope: ' + msg)
  process.exit(2)
}

let root = null
let asJson = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--json') asJson = true
  else die('usage: ' + USAGE)
}
if (!root) die('usage: ' + USAGE)
root = path.resolve(root)
let rootStat = null
try {
  rootStat = fs.statSync(root)
} catch {
  rootStat = null
}
if (!rootStat || !rootStat.isDirectory()) die('usage: ' + USAGE + ' — --root must name an existing directory')

const relPosix = (abs) => path.relative(root, abs).split(path.sep).join('/')

function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      if (relPosix(full) === '.claude/worktrees') continue
      walk(full, out)
    } else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
}

const config = readConfig(root)
// A test file naming AC-IDs is the normal, correct shape of a tagged test — never a finding.
const testFiles = new Set(listTestFiles(root, config).map(relPosix))

const all = []
walk(root, all)
const findings = []
let scanned = 0
for (const abs of all) {
  const rel = relPosix(abs)
  if (testFiles.has(rel)) continue
  let stat
  try {
    stat = fs.statSync(abs)
  } catch {
    continue
  }
  if (stat.size > MAX_BYTES) continue
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    continue
  }
  scanned++
  if (!AC_REFERENCE_RE.test(text)) continue
  if (!DONE_LITERAL_RE.test(text)) continue
  if (PIN_RE.test(text)) continue
  findings.push(rel)
}
findings.sort()

if (asJson) {
  writeOut(1, JSON.stringify({ scanned, findings }))
  process.exit(findings.length ? 1 : 0)
}

const lines = findings.map((f) => 'coverage check may not exempt done specs: ' + f +
  ' — it reads acceptance-criterion ids and a `done` status but never names `SHALL CONTINUE TO`')
lines.push('coverage-scope: scanned ' + scanned + ' source files, ' + findings.length + ' to read')
writeOut(1, lines.join('\n'))
process.exit(findings.length ? 1 : 0)
