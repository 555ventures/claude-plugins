#!/usr/bin/env node
'use strict'
// ac-drift.js --root <dir> [--json]
//
// Owner: specs/20260906/01-ac-drift-doctor-check.md.
// WHY: ac-matrix.js runs once, at review; nothing re-derives AC↔test coverage after a spec closes. For every
// `done` spec dated on or after `V7_APPLIES_FROM`, this reports a `[retired: <citation>]` tag naming no
// `specs/*.md` or `docs/adr/` path, and a `SHALL CONTINUE TO` pin (spec dated on or after EXPIRY_APPLIES_FROM)
// that no test-classified file cites and whose `→ reuses <file> :: <title>` pointer, when present, does not
// name exactly one case. Every other criterion of a done spec has expired. `/spec:doctor` check 17, advisory.
//
// What this deliberately does NOT do: write a manifest row, mutate any spec file, verify a
// `[retired:]` citation's target actually exists (the citation is provenance, not a live link), or
// apply any sanction/coverage rule to a malformed AC bullet (ac-matrix.js's own `malformed-ac`
// finding is a review-time contract, not a hygiene one — this script counts only well-formed
// bullets toward `criteria` and never reports one that fails the AC-ID grammar).
//
// Exit codes: 0 = derived, no findings (incl. the `inapplicable — no specs/` sentinel) ·
//             1 = derived, findings printed (advisory in doctor — never a script failure) ·
//             2 = usage error (unknown flag, --root without a value, --root not a directory)

const fs = require('fs')
const path = require('path')
const { relPosix: relPosixFrom } = require('./lib/util')
const { fmValue } = require('./lib/frontmatter')
const {
  extractSection, parseAcBullets, acIdOccurs, extractTag, V7_APPLIES_FROM, normalizeForPinCheck,
  parseDisposition,
} = require('./lib/spec-sections')
const { resolveReference } = require('./lib/scan-test-calls')
const { readConfig } = require('./lib/host-config')
const { fileShapes, isTestClassified: shapeIsTest } = require('./lib/file-shapes')

const USAGE = 'ac-drift.js --root <dir> [--json]'

// Specs dated on or after this may opt a criterion into permanence with `SHALL CONTINUE TO`; a
// pin without a citing test is drift. Earlier pins were never opt-in and expired retroactively.
const EXPIRY_APPLIES_FROM = '20260911'

const { writeLine: writeOut } = require('./lib/sync-write')

function die(code, msg) {
  writeOut(2, 'ac-drift: ' + msg)
  process.exit(code)
}

// ---- args ------------------------------------------------------------------------------------
let root = null
let asJson = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--json') asJson = true
  else die(2, 'usage: ' + USAGE)
}
if (!root) die(2, 'usage: ' + USAGE)
root = path.resolve(root)

let rootStat = null
try {
  rootStat = fs.statSync(root)
} catch {
  rootStat = null
}
if (!rootStat || !rootStat.isDirectory()) {
  die(2, 'usage: ' + USAGE + ' — --root must name an existing directory')
}

const specsDir = path.join(root, 'specs')
if (!fs.existsSync(specsDir)) {
  writeOut(1, 'inapplicable — no specs/')
  process.exit(0)
}

// ---- repo walk: skips .git/node_modules/fixtures/__fixtures__ — a fixture is input data for
// some OTHER test, never a citation of its own. ------------------------------------------------
const SKIP_DIRS = new Set(['.git', 'node_modules', 'fixtures', '__fixtures__'])
function walk(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile()) out.push(full)
  }
}
const relPosix = (abs) => relPosixFrom(root, abs)

const allFiles = []
walk(root, allFiles)

const specFiles = allFiles
  .filter((f) => { const rel = relPosix(f); return rel.startsWith('specs/') && rel.endsWith('.md') })
  .sort()

// ---- test classification: lib/file-shapes.js over the host's fileShapes.testGlobs or its defaults. Files read once into a joined haystack. ------------------------------------
const shapes = fileShapes(readConfig(root))
const isTestClassified = (p) => shapeIsTest(p, shapes)
const testFiles = allFiles.filter((f) => isTestClassified(relPosix(f)))

let haystack = null
function getHaystack() {
  if (haystack === null) {
    haystack = testFiles.map((f) => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
  }
  return haystack
}

// ---- per-spec derivation -----------------------------------------------------------------------
let scanned = 0
let criteria = 0
let skippedPreFloor = 0
const findings = []

for (const specFile of specFiles) {
  const rel = relPosix(specFile)
  let text
  try {
    text = fs.readFileSync(specFile, 'utf8')
  } catch {
    continue
  }
  if (fmValue(text, 'status') !== 'done') continue

  // Contracts: the date is the 8-digit directory segment matched on the repo-relative path — a
  // spec outside a dated directory is skipped and counted nowhere (neither scanned nor floor-skipped).
  const dateMatch = /specs\/(\d{8})\//.exec(rel)
  if (!dateMatch) continue
  if (dateMatch[1] < V7_APPLIES_FROM) { skippedPreFloor++; continue }

  scanned++
  const acSection = extractSection(text, 'Acceptance Criteria')
  if (acSection === null) continue // a done spec with no AC section contributes zero criteria, no finding

  for (const bullet of parseAcBullets(acSection)) {
    if (bullet.malformed) continue
    criteria++

    if (acIdOccurs(getHaystack(), bullet.id)) continue // covered — never reported

    // normalizeForPinCheck is lib/spec-sections.js's; this predicate only asks whether the bullet contains a
    // `SHALL CONTINUE TO` phrase at all.
    const pinned = /SHALL CONTINUE TO/.test(normalizeForPinCheck(bullet.raw))

    const firstLine = bullet.raw.split('\n')[0]
    const retired = extractTag('retired', firstLine, bullet.raw)
    if (retired !== null) {
      const cited = /(^|\s)specs\/\S+\.md/.test(retired) || /(^|\s)docs\/adr\//.test(retired)
      if (cited) continue
      findings.push({
        spec: rel, ac: bullet.id, class: 'retired-uncited',
        detail: '[retired:] must cite the specs/ or docs/adr/ path that retired it',
      })
      continue
    }

    if (!pinned || dateMatch[1] < EXPIRY_APPLIES_FROM) continue // expired at close — not drift
    // A reused test keeps the tag of the spec that wrote it — the pin's own pointer is the link.
    const disposition = parseDisposition(bullet.raw)
    if (disposition && disposition.kind === 'reuses') {
      const matches = resolveReference(root, disposition.file, disposition.prefix).length
      if (matches === 1) continue
      findings.push({
        spec: rel, ac: bullet.id, class: 'uncovered-ac',
        detail: 'no test cites it, and its reuses reference "' + disposition.file + ' :: ' +
          disposition.prefix + '" names ' + matches + ' tests (need exactly 1)',
      })
      continue
    }
    findings.push({ spec: rel, ac: bullet.id, class: 'uncovered-ac', detail: 'no test cites it' })
  }
}

const exitCode = findings.length ? 1 : 0

// --json is a single stdout object and nothing else; the human render puts per-row findings on stderr and
// the summary/sentinel on stdout.
if (asJson) {
  writeOut(1, JSON.stringify({ floor: V7_APPLIES_FROM, scanned, criteria, skippedPreFloor, findings }, null, 2))
  process.exit(exitCode)
}

if (findings.length) {
  const lines = findings.map((f) => (
    f.class === 'retired-uncited'
      ? 'ac-drift: ' + f.spec + ' ' + f.ac + ' — ' + f.detail
      : 'ac-drift: ' + f.spec + ' ' + f.ac + ' — ' + f.detail + '; remedy: tag the covering test ' +
        'with the id, or drop the SHALL CONTINUE TO pin so the criterion expires'
  ))
  writeOut(2, lines.join('\n'))
}

const summaryLines = []
if (skippedPreFloor > 0) {
  summaryLines.push('ac-drift: skipped ' + skippedPreFloor + ' pre-v7 specs (dated before ' + V7_APPLIES_FROM + ')')
}
if (findings.length) {
  const distinctSpecs = new Set(findings.map((f) => f.spec)).size
  summaryLines.push('ac-drift: ' + findings.length + ' finding(s) across ' + distinctSpecs +
    ' done spec(s) — ' + scanned + ' specs, ' + criteria + ' criteria scanned')
} else {
  summaryLines.push('ac-drift: clean — ' + scanned + ' specs, ' + criteria + ' criteria')
}
writeOut(1, summaryLines.join('\n'))
process.exit(exitCode)
