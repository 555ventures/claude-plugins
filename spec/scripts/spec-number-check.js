#!/usr/bin/env node
'use strict'
// spec-number-check.js --root <dir> [--json] — report every `specs/YYYYMMDD/` directory in which
// two or more live specs share one `NN[a]-` number prefix.
//
// WHY: the `NN` prefix is the AC-ID namespace. Two specs numbered `04-` in one date directory both mint
// `AC-YYYYMMDD-04-*`, so ac-matrix.js's coverage grep cannot tell whose test it found. Callers:
// /spec:plan's lock step (exit 1 refuses the lock) and /spec:doctor check 18.
//
// Scope: a `superseded` spec is excluded on BOTH sides of a pair. Files outside `specs/YYYYMMDD/`, files not
// ending `.md`, and any dotted or hyphenated sidecar (`<spec>.deviations.md`, `<spec>.<kind>.md`) are skipped.
//
// Usage: spec-number-check.js --root <dir> [--json]
// Exit codes:
//   0  clean — no directory holds a live duplicate (also the `inapplicable — no specs/` sentinel)
//   1  findings — one line per colliding number on stdout (plain), or one JSON object with --json
//   2  usage — unknown flag, --root missing its value, or --root is not an existing directory
const fs = require('fs')
const { writeOut: syncWrite } = require('./lib/sync-write')
const path = require('path')
const { fmValue } = require('./lib/frontmatter')

const USAGE = 'usage: spec-number-check.js --root <dir> [--json]'

// Routes through lib/sync-write.js — see its header for why a bare write + exit truncates.
function writeOut(fd, text) {
  syncWrite(fd, text)
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
    if (/[.-]deviations\.md$/.test(name) || /\.[^.]+\.md$/.test(name)) continue
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
