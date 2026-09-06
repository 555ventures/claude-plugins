#!/usr/bin/env node
'use strict'
// ac-drift.js --root <dir> [--json]
//
// WHY: specs/20260906/01-ac-drift-doctor-check.md D1 — the AC↔test coverage matrix
// (ac-matrix.js) runs once, at review, against the spec under review; nothing re-derives it after
// a spec closes, so a later test split, a fix-cap waive, or a retired surface silently leaves a
// done spec's acceptance criteria with no test citing them. This script re-derives that matrix
// repo-wide and statelessly: for every spec whose frontmatter `status:` is `done` and whose dated
// directory is on or after the v7 floor (lib/spec-sections.js's `V7_APPLIES_FROM`), it parses
// `## Acceptance Criteria` (lib/spec-sections.js's `extractSection`/`parseAcBullets`) and reports
// each well-formed AC that no test-classified file cites (full-token, `acIdOccurs`) and that
// carries no sanction — `SHALL CONTINUE TO`, a bare `[oracle:]`, a bare `[pre-green:]`, or a
// `[retired: <citation>]` tag whose value names a `specs/*.md` or `docs/adr/` path. `/spec:doctor`
// runs this as check 17, advisory.
//
// What this deliberately does NOT do: write a manifest row, mutate any spec file, verify a
// `[retired:]` citation's target actually exists (the citation is provenance, not a live link), or
// apply any sanction/coverage rule to a malformed AC bullet (ac-matrix.js's own `malformed-ac`
// finding is a review-time contract, not a hygiene one — this script counts only well-formed
// bullets toward `criteria` and never reports one that fails the AC-ID grammar).
//
// Exit codes: 0 = derived, no findings (incl. the `inapplicable — no specs/` sentinel) ·
//             1 = derived, findings printed (advisory in doctor — never a script failure) ·
//             2 = usage error (unknown flag, --root without a value)

const fs = require('fs')
const path = require('path')
const { fmValue } = require('./lib/frontmatter')
const { extractSection, parseAcBullets, acIdOccurs, extractTag, V7_APPLIES_FROM } = require('./lib/spec-sections')
const { readConfig, DEFAULT_TEST_GLOBS } = require('./lib/host-config')
const { globMatch } = require('./lib/glob-match')

const USAGE = 'ac-drift.js --root <dir> [--json]'

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

const specsDir = path.join(root, 'specs')
if (!fs.existsSync(specsDir)) {
  writeOut(1, 'inapplicable — no specs/')
  process.exit(0)
}

// ---- repo walk (D4): skips .git/node_modules/fixtures/__fixtures__ — a fixture is input data for
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
const relPosix = (abs) => path.relative(root, abs).split(path.sep).join('/')

const allFiles = []
walk(root, allFiles)

const specFiles = allFiles
  .filter((f) => { const rel = relPosix(f); return rel.startsWith('specs/') && rel.endsWith('.md') })
  .sort()

// ---- test classification (D4): host config's testGlobs when it is an array, else the shared
// DEFAULT_TEST_GLOBS. Files read once into a joined haystack. ------------------------------------
const configTestGlobs = readConfig(root).testGlobs
const testGlobs = Array.isArray(configTestGlobs) ? configTestGlobs : DEFAULT_TEST_GLOBS
const isTestClassified = (p) => testGlobs.some((g) => globMatch(g, p))
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

    if (acIdOccurs(getHaystack(), bullet.id)) continue // covered — never reported, sanctioned or not

    const normalized = bullet.raw.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ')
    if (/SHALL CONTINUE TO/.test(normalized)) continue
    if (bullet.oracle !== null) continue
    if (bullet.preGreen !== null) continue

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

    findings.push({ spec: rel, ac: bullet.id, class: 'uncovered-ac', detail: 'no test cites it' })
  }
}

const exitCode = findings.length ? 1 : 0

// D5's Contracts note stderr carries every per-row finding regardless of --json (--json's own
// findings array is the machine mirror of the same facts, printed to stdout).
if (findings.length) {
  const lines = findings.map((f) => (
    f.class === 'retired-uncited'
      ? 'ac-drift: ' + f.spec + ' ' + f.ac + ' — ' + f.detail
      : 'ac-drift: ' + f.spec + ' ' + f.ac + ' — ' + f.detail + '; remedy: tag the covering test ' +
        'with the id, or mark the bullet [retired: <spec path or docs/adr path that retired it>]'
  ))
  writeOut(2, lines.join('\n'))
}

if (asJson) {
  writeOut(1, JSON.stringify({ floor: V7_APPLIES_FROM, scanned, criteria, skippedPreFloor, findings }, null, 2))
  process.exit(exitCode)
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
