#!/usr/bin/env node
'use strict'
// spec-number-check.js --root <dir> [--json] — report every `specs/YYYYMMDD/` directory in which
// two or more live specs share one `NN[a]-` number prefix.
//
// WHY: the `NN` prefix is the AC-ID namespace. Two specs numbered `04-` in one date directory both
// mint `AC-YYYYMMDD-04-1`, `-2`, … — so ac-matrix.js's coverage grep, which asks only whether an
// AC-ID token appears anywhere under the test globs, cannot tell whose test it found. Either spec
// can pass its coverage leg on the other's tests, with a criterion that has no test anywhere. That
// is a silent fail-open in the one leg whose whole job is to refuse an untested criterion.
//
// Measured class (2026-09-11, this repo): five occurrences — 20260907/05 and 20260909/03 each
// renumbered by hand after the fact, and 20260908/01, 20260908/05, 20260911/04 all still colliding
// on disk, the last a live pair of hardened specs sharing eighteen AC-IDs. Past the third-
// recurrence bar for a standing guard (core § Incident Policy), which must be a deterministic
// script with an exit code rather than prose — this is that script. /spec:doctor is its caller.
//
// Scope: a `superseded` spec is excluded on BOTH sides of a pair — it is terminal, its ACs are
// never re-derived, and the two historical pairs here are each one live spec beside one retired
// one. A directory whose only duplicate is between two superseded specs is likewise clean. Files
// outside a `specs/YYYYMMDD/` directory, and files not ending `.md`, are not specs and are skipped;
// so is any deviations sidecar, which carries no ACs of its own — matched as either
// `*-deviations.md` or the build driver's own `<spec-stem>.deviations.md` (a DOT before
// `deviations`, e.g. `03-tests-expire-at-close.deviations.md`), since the dot form still matches
// SPEC_NAME below and, unskipped, reads as a second spec sharing its own spec's number.
//
// Usage: spec-number-check.js --root <dir> [--json]
// Exit codes:
//   0  clean — no directory holds a live duplicate (also the `inapplicable — no specs/` sentinel)
//   1  findings — one line per colliding number on stdout (plain), or one JSON object with --json
//   2  usage — unknown flag, --root missing its value, or --root is not an existing directory
const fs = require('fs')
const path = require('path')
const { fmValue } = require('./lib/frontmatter')

const USAGE = 'usage: spec-number-check.js --root <dir> [--json]'

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off)
}

function die(code, msg) {
  writeOut(2, 'spec-number-check: ' + msg + '\n')
  process.exit(code)
}

let root = null
let asJson = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') { root = argv[++i]; continue }
  if (a === '--json') { asJson = true; continue }
  die(2, USAGE)
}
if (!root) die(2, USAGE)
root = path.resolve(root)

let rootStat = null
try { rootStat = fs.statSync(root) } catch { rootStat = null }
if (!rootStat || !rootStat.isDirectory()) die(2, USAGE + ' — --root must name an existing directory')

const specsDir = path.join(root, 'specs')
if (!fs.existsSync(specsDir)) {
  writeOut(1, 'inapplicable — no specs/\n')
  process.exit(0)
}

// The number is the leading `NN` or `NNa` segment of the filename, matching the AC-ID's own middle
// field (`AC-<date>-<NN[a]>-<n>`) — `04a-` is its own namespace, never a duplicate of `04-`.
const SPEC_NAME = /^(\d{2}[a-z]?)-.+\.md$/

let dateDirs = []
try {
  dateDirs = fs.readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{8}$/.test(e.name))
    .map((e) => e.name)
    .sort()
} catch {
  dateDirs = []
}

let scannedDirs = 0
let scannedSpecs = 0
const findings = []

for (const dateDir of dateDirs) {
  scannedDirs++
  const dirPath = path.join(specsDir, dateDir)
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort()
  } catch {
    continue
  }
  const byNumber = new Map()
  for (const name of entries) {
    if (name.endsWith('-deviations.md') || name.endsWith('.deviations.md')) continue
    const m = SPEC_NAME.exec(name)
    if (!m) continue
    scannedSpecs++
    let status = null
    try { status = fmValue(fs.readFileSync(path.join(dirPath, name), 'utf8'), 'status') } catch { status = null }
    if (status === 'superseded') continue
    if (!byNumber.has(m[1])) byNumber.set(m[1], [])
    byNumber.get(m[1]).push('specs/' + dateDir + '/' + name)
  }
  for (const [number, specs] of [...byNumber.entries()].sort()) {
    if (specs.length < 2) continue
    findings.push({
      dir: 'specs/' + dateDir, number, specs,
      detail: specs.length + ' live specs share number ' + number + ' — every AC-' + dateDir + '-' +
        number + '-<n> id is minted twice, so the coverage grep cannot tell whose test it found',
    })
  }
}

const exitCode = findings.length ? 1 : 0

if (asJson) {
  writeOut(1, JSON.stringify({ scannedDirs, scannedSpecs, findings }, null, 2) + '\n')
  process.exit(exitCode)
}

if (findings.length) {
  const lines = findings.map((f) => (
    'spec-number-check: ' + f.dir + ' number ' + f.number + ' — ' + f.specs.join(' + ') +
    '; remedy: renumber the spec not yet built to the next free number in its directory, ' +
    'rewriting its AC-ids with it'
  ))
  writeOut(1, lines.join('\n') + '\n')
  writeOut(1, 'spec-number-check: ' + findings.length + ' colliding number(s) — ' + scannedSpecs +
    ' specs across ' + scannedDirs + ' date directories\n')
} else {
  writeOut(1, 'spec-number-check: clean — ' + scannedSpecs + ' specs across ' + scannedDirs +
    ' date directories\n')
}
process.exit(exitCode)
