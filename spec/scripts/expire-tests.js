#!/usr/bin/env node
'use strict'
// expire-tests.js --root <r> --spec <spec path>  [--apply] [--json]
// expire-tests.js --root <r> --all-done          [--apply] [--json]
// expire-tests.js --root <r> --invariants        [--json]
//
// specs/20260911/03-tests-expire-at-close.md D3/D4: a spec's tests die when the spec does. This
// script is the ONE place D3's classification runs — spec-review-driver.js's doCloseWork() calls
// it (D5) and /spec:doctor's check 20 calls it (D7), so a close and a doctor dry run can never
// disagree about what is retirable.
//
// Named `expire-tests.js`, never `test-expiry.js` — `node --test`'s default file discovery
// matches `**/test-*.js` anywhere under the repo root (see spec/scripts/count-tests.js's own
// header, renamed for the identical reason), so a `test-expiry.js` this repo ships gets
// DISCOVERED AND EXECUTED as a test file by the post-gate's path-less `node --test` run — its own
// argv handling exiting non-zero under the runner reported as a spurious test failure (this
// spec's own forcing incident, D8). The `spec-paths` KEY stays `test-expiry`; only the file this
// key resolves to changed.
//
// A test is *tagged* when an AC-ID occurs in its title or the contiguous comment block directly
// above the call (lib/scan-test-calls.js's own shape, D2); an untagged test is never read for
// anything else. `--spec` scans only tests that cite one of the given spec's own AC-IDs (its own
// status counts as done, even while its frontmatter still literally says otherwise mid-close);
// `--all-done` scans every tagged test in the host. A tagged, in-scope test is *retired* only
// when every AC-ID it cites belongs to a spec that is done AND none of three keep clauses fire:
// (a) its own call text names a ledger escape class (`.claude/spec-runs.jsonl`'s `class` keys,
// top-level or nested in `incidents[]`); (b) its FILE's text names the basename of a script in
// lib/invariants.js's derived set (a script the pipeline itself runs); (c) a cited AC bullet
// (normalized whitespace, code spans stripped) contains `SHALL CONTINUE TO` and its own spec is
// dated on or after the 20260911 floor. An AC-ID whose owning spec cannot be found, or whose
// spec is not done, keeps the test open rather than retiring it — every unknown fails safe.
//
// `--apply` removes each retired test's span (its comment block through the call's closing paren,
// trailing `;` and newline all included — lib/scan-test-calls.js's own `start`/`end`, widened here
// by one more character when a trailing newline follows), collapses a run of three-or-more blank
// lines down to one, deletes a file left with zero remaining test() calls, and climbs to delete
// any directory the deletion leaves empty. A dry run mutates nothing on disk.
//
// What this deliberately does NOT do: re-derive what a test case is (lib/scan-test-calls.js owns
// that), re-derive the AC-ID grammar or bullet parsing (lib/spec-sections.js owns both), or apply
// any sanction to a malformed AC bullet — a malformed bullet contributes no AC-ID to the ownership
// map and so keeps every test that cites it (unresolved, fail-safe).
//
// Exit codes: 0 = derived (dry run or applied), regardless of how many tests were retirable ·
//             2 = usage error, --root not a readable directory, or (in --spec mode) the named
//                 spec file cannot be read

const fs = require('fs')
const path = require('path')
const { listTestFiles, scanCalls } = require('./lib/scan-test-calls')
const { deriveInvariants } = require('./lib/invariants')
const { extractSection, parseAcBullets, AC_ID_RE_GLOBAL, normalizeForPinCheck } = require('./lib/spec-sections')
const { fmValue } = require('./lib/frontmatter')
const { readConfig } = require('./lib/host-config')

const USAGE = 'expire-tests.js --root <r> (--spec <path> | --all-done | --invariants) [--apply] [--json]'
const EXPIRY_APPLIES_FROM = '20260911'

// A script that prints a payload and exits routes through a synchronous writer — the 64 KiB pipe
// truncation this avoids is spelled out at spec/scripts/lib/driver-io.js's writeOut.
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
  writeOut(2, 'expire-tests: ' + msg)
  process.exit(2)
}

// ---- args --------------------------------------------------------------------------------------
let root = null
let specArg = null
let allDone = false
let invariantsMode = false
let apply = false
let asJson = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--all-done') allDone = true
  else if (a === '--invariants') invariantsMode = true
  else if (a === '--apply') apply = true
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

const modeCount = (specArg !== null ? 1 : 0) + (allDone ? 1 : 0) + (invariantsMode ? 1 : 0)
if (modeCount !== 1) die('usage: ' + USAGE + ' — exactly one of --spec/--all-done/--invariants is required')

const config = readConfig(root)
const relPosix = (abs) => path.relative(root, abs).split(path.sep).join('/')

// ---- --invariants --------------------------------------------------------------------------------
if (invariantsMode) {
  const inv = deriveInvariants(root, config)
  if (asJson) {
    writeOut(1, JSON.stringify(inv))
  } else {
    for (const s of inv.scripts) writeOut(1, s)
  }
  process.exit(0)
}

// ---- --spec: resolve + validate the closing spec -------------------------------------------------
let closingSpecRel = null
if (specArg !== null) {
  const abs = path.resolve(root, specArg)
  let text
  try {
    text = fs.readFileSync(abs, 'utf8')
  } catch {
    die('cannot read spec ' + specArg + ' — pass a --spec path that exists under --root')
  }
  closingSpecRel = relPosix(abs)
  void text // read only to validate readability; the AC-owner walk below re-reads it uniformly
}

// ---- AC-ID ownership map: every well-formed AC bullet in every specs/**/*.md file --------------
const SKIP_DIR_NAMES = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])
function walkSpecs(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkSpecs(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
}

const specsDir = path.join(root, 'specs')
const specFiles = []
if (fs.existsSync(specsDir)) walkSpecs(specsDir, specFiles)

// acId -> [{ specRel, status, raw, dateStr }, ...]. An AC-ID is many-to-many: spec-number-check.js
// polices collisions at the gate (this script is not the place for that — see header), so an ID
// defined by more than one spec keeps every one of those owner records rather than the first
// walked. D3's fail-safe rule then reads as "done only when EVERY owner is done" (allCitedDone
// below) instead of picking a single winner by directory walk order.
const acOwners = new Map()
for (const f of specFiles) {
  const rel = relPosix(f)
  let text
  try {
    text = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  const status = fmValue(text, 'status')
  const dateMatch = /specs\/(\d{8})\//.exec(rel)
  const dateStr = dateMatch ? dateMatch[1] : null
  const acSection = extractSection(text, 'Acceptance Criteria')
  if (acSection === null) continue
  for (const bullet of parseAcBullets(acSection)) {
    if (bullet.malformed) continue
    if (!acOwners.has(bullet.id)) acOwners.set(bullet.id, [])
    acOwners.get(bullet.id).push({ specRel: rel, status, raw: bullet.raw, dateStr })
  }
}

const closingSpecAcIds = new Set()
if (closingSpecRel !== null) {
  for (const [id, owners] of acOwners) {
    if (owners.some((o) => o.specRel === closingSpecRel)) closingSpecAcIds.add(id)
  }
}

// ---- invariants set + escape-class ids -----------------------------------------------------------
const invariantBasenames = new Set(
  deriveInvariants(root, config).scripts.map((s) => path.posix.basename(s)),
)

function collectEscapeClasses() {
  const classes = new Set()
  let text
  try {
    text = fs.readFileSync(path.join(root, '.claude/spec-runs.jsonl'), 'utf8')
  } catch {
    return classes
  }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let row
    try {
      row = JSON.parse(t)
    } catch {
      continue
    }
    if (typeof row.class === 'string' && row.class) classes.add(row.class)
    if (Array.isArray(row.incidents)) {
      for (const inc of row.incidents) {
        if (inc && typeof inc.class === 'string' && inc.class) classes.add(inc.class)
      }
    }
  }
  return classes
}
const escapeClasses = collectEscapeClasses()

// ---- walk the host's test-classified files, scan every call ------------------------------------
const testFiles = listTestFiles(root, config).map(relPosix).sort()

function citedAcIds(call) {
  const hay = (call.title || '') + '\n' + (call.commentAbove || '')
  return Array.from(new Set(hay.match(AC_ID_RE_GLOBAL) || []))
}

// allDone(ids): every cited AC-ID resolves to a done spec — the closing spec itself (--spec mode)
// counts as done regardless of its literal on-disk status (D3, D5: this runs before the status
// flip). An unresolved AC-ID is never "done". A collided AC-ID (defined by more than one spec) is
// done only when EVERY defining spec is done — any single open owner keeps the test (D3's
// fail-safe rule extended to the many-to-many case; see the acOwners comment above).
function allCitedDone(ids) {
  return ids.every((id) => {
    const owners = acOwners.get(id)
    if (!owners || owners.length === 0) return false
    return owners.every((owner) => {
      if (closingSpecRel !== null && owner.specRel === closingSpecRel) return true
      return owner.status === 'done'
    })
  })
}

function classify(call, ids, fileText) {
  if (!allCitedDone(ids)) return 'open'
  for (const cls of escapeClasses) {
    if (call.callText.includes(cls)) return 'class'
  }
  for (const base of invariantBasenames) {
    if (fileText.includes(base)) return 'invariant'
  }
  for (const id of ids) {
    const owners = acOwners.get(id) || []
    for (const owner of owners) {
      if (!owner.dateStr || owner.dateStr < EXPIRY_APPLIES_FROM) continue
      if (/SHALL CONTINUE TO/.test(normalizeForPinCheck(owner.raw))) return 'pin'
    }
  }
  return 'retired'
}

let scanned = 0
const kept = { class: 0, invariant: 0, pin: 0, open: 0 }
const retiredByFile = new Map() // file -> [{ call, ids }]
const retired = []

for (const file of testFiles) {
  let src
  try {
    src = fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    continue
  }
  const calls = scanCalls(src)
  scanned += calls.length
  for (const call of calls) {
    const ids = citedAcIds(call)
    if (ids.length === 0) continue // untagged — never read for anything else
    const inScope = closingSpecRel !== null
      ? ids.some((id) => closingSpecAcIds.has(id))
      : true // --all-done: every tagged test is in scope
    if (!inScope) continue
    const cls = classify(call, ids, src)
    if (cls === 'retired') {
      retired.push({ file, acIds: ids, title: call.title })
      if (!retiredByFile.has(file)) retiredByFile.set(file, [])
      retiredByFile.get(file).push(call)
    } else {
      kept[cls]++
    }
  }
}
const tagged = retired.length + kept.class + kept.invariant + kept.pin + kept.open

// ---- --apply: remove retired spans, collapse blank runs, delete emptied files/dirs -------------
const emptied = []
if (apply) {
  for (const [file, calls] of retiredByFile) {
    const abs = path.join(root, file)
    let src
    try {
      src = fs.readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const spans = calls
      .map((c) => ({ start: c.start, end: src[c.end] === '\n' ? c.end + 1 : c.end }))
      .sort((a, b) => b.start - a.start)
    for (const { start, end } of spans) {
      src = src.slice(0, start) + src.slice(end)
    }
    // Collapse a run of three-or-more blank lines down to one.
    const lines = src.split('\n')
    const collapsed = []
    let blankRun = 0
    for (const line of lines) {
      if (line.trim() === '') {
        blankRun++
        if (blankRun <= 2) collapsed.push(line)
      } else {
        blankRun = 0
        collapsed.push(line)
      }
    }
    src = collapsed.join('\n')

    if (scanCalls(src).length === 0) {
      fs.unlinkSync(abs)
      emptied.push(file)
      let dir = path.dirname(abs)
      while (dir !== root && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir)
        dir = path.dirname(dir)
      }
    } else {
      fs.writeFileSync(abs, src)
    }
  }
}

// ---- render --------------------------------------------------------------------------------------
const scope = closingSpecRel !== null ? 'spec:' + closingSpecRel : 'all-done'
const result = { scope, scanned, tagged, kept, retired, emptied, applied: apply }

if (asJson) {
  writeOut(1, JSON.stringify(result))
  process.exit(0)
}

const lines = retired.map((r) => 'retire ' + r.file + ' — ' + r.title)
const keptTotal = kept.class + kept.invariant + kept.pin + kept.open
lines.push('expiry: scanned ' + scanned + ' tagged ' + tagged + ' kept ' + keptTotal +
  ' retired ' + retired.length + ' (' + (apply ? 'applied' : 'dry run') + ')')
writeOut(1, lines.join('\n'))
process.exit(0)
