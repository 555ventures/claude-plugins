#!/usr/bin/env node
'use strict'
// coverage-scope.js --root <r> [--json]
//
// Owner: specs/20260912/15-the-close-stops-deleting-tests.md.
// WHY: a host check that demands a test carrier for EVERY AC of a done spec goes red once the expiry
// sweep retires that spec's tests (a done spec owes a carrier only for a `SHALL CONTINUE TO` criterion).
// The grounding contract's § Test expiry carries the obligation; this is its conformance probe for hosts
// initialized before that section existed — /spec:doctor's check 20 runs it.
//
// Kill condition: when no readable host reports a finding across a full major pipeline version,
// delete the script and the check.
//
// Named `coverage-scope.js`, never `test-*` — `node --test` would discover and execute it.
//
// SIGNATURE (deterministic, deliberately narrow): a non-test source file that names an AC-ID literally or
// as a scanner pattern (`AC-\d{8}`, `AC-[0-9]{8}`), compares a status against a `done` literal, and never
// mentions `SHALL CONTINUE TO` — the pin phrase is how a criterion opts out of expiry.
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
const { relPosix: relPosixFrom } = require('./lib/util')
const { readConfig } = require('./lib/host-config')
const { fileShapes, isCodeFile } = require('./lib/file-shapes')
const { listTestFiles } = require('./lib/scan-test-calls')

const USAGE = 'coverage-scope.js --root <dir> [--json]'

// Same skip set as the expiry sweep, widened by the build/vendor directories no host authors a
// gate check inside. `specs/` and `docs/` are excluded by construction: a spec DECLARES criteria
// (every one of them names AC-IDs and statuses), it never enforces them.
const SKIP_DIR_NAMES = new Set([
  '.git', 'node_modules', 'fixtures', '__fixtures__', 'dist', 'build', 'coverage', 'vendor',
  '.next', '.venv', '__pycache__', 'specs', 'docs',
])
const MAX_BYTES = 512 * 1024

// An AC-ID EXTRACTION pattern, never a cited id: only a file that PARSES acceptance-criterion ids can be
// the check this scan looks for.
const AC_REFERENCE_RE = /AC-(?:\\{1,2}d|\[0-9\]|%d|\{8\})|\bAC_ID|\bac_?[Ii]d\b/
// A status compared against a `done` literal, in any of the quoting styles the fleet's languages use.
const DONE_LITERAL_RE = /["'`]done["'`]/
const PIN_RE = /SHALL CONTINUE TO/

const { writeLine: writeOut } = require('./lib/sync-write')


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

const relPosix = (abs) => relPosixFrom(root, abs)
const shapes = fileShapes(readConfig(root))

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
    } else if (entry.isFile() && isCodeFile(entry.name, shapes)) {
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
