#!/usr/bin/env node
'use strict'
// ac-matrix.js --spec <path> --root <dir> --manifest <path> [--skips <file>]
//   [--has-drift-script] [--json]
//
// Incident (2026-08-14, spec ac-matrix-script): review.md Phase 0 steps 5–6 (AC-line lint +
// AC↔test coverage matrix + [oracle:] handling, skipped-test reconciliation + [env:] handling)
// were hand-executed from prose every review — a leg that drifts per session and per model.
// This is the sole derivation of both legs: it lints the spec's `## Acceptance Criteria`
// bullets, greps the File Plan's tests-layer rows for AC-ID coverage, reconciles reported
// skips against declared [env:]/[oracle:] tags, and appends its own JSONL rows to --manifest
// so a hand-transcribed observed string can never go stale. review.md's steps 5–6 shrink to
// an invocation line.
//
// What this deliberately does NOT do: render a report (report-render.js is the sole render
// authority), compute the review verdict (verdict.js reads this script's manifest rows, never
// the reverse), parse runner output to discover skipped-test names (the orchestrator extracts
// names per the host's declared format and passes them via --skips — no universal name format
// exists, only the skip *count* format is host-declared), expand a File Plan glob through any
// matcher but the shared lib/glob-match.js, or own the AC-ID grammar / `## ` section extraction
// / AC-bullet parsing — those are lifted verbatim into lib/spec-sections.js (2026-08-17, spec
// promise-sweep-leg D3), the single authority a sibling script (promise-sweep.js) also imports;
// no test named `ac-id-lint.test.js` lifts the regex from this file's source (that test does
// not exist — grep evidence, 2026-08-17).
//
// Exit codes: 0 = executed, no findings · 1 = executed, findings emitted (rides the normal
// Phase 2 disposition flow — not a script failure) · 2 = usage error, unreadable --spec, or a
// spec with no `## Acceptance Criteria` section.

const fs = require('fs')
const path = require('path')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { AC_ID_RE, AC_ID_RE_GLOBAL, extractSection, parseAcBullets } = require('./lib/spec-sections')

function usage() {
  console.error('usage: ac-matrix.js --spec <path> --root <dir> --manifest <path> ' +
    '[--skips <file>] [--has-drift-script] [--json]')
}

let specPath = null, root = null, manifestPath = null, skipsFile = null
let hasDriftScript = false, jsonOut = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--skips') skipsFile = argv[++i]
  else if (a === '--has-drift-script') hasDriftScript = true
  else if (a === '--json') jsonOut = true
  else { usage(); process.exit(2) }
}
if (!specPath || !root || !manifestPath) { usage(); process.exit(2) }

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`ac-matrix: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

// ---- ## Acceptance Criteria section extraction + bullet parsing: both lifted verbatim into
// ---- lib/spec-sections.js (D3) — extractSection/parseAcBullets imported above -----------------

const acSection = extractSection(specText, 'Acceptance Criteria')
if (acSection === null) {
  console.error(`ac-matrix: ${specPath} has no ## Acceptance Criteria section — nothing to lint/cover`)
  process.exit(2)
}

const bullets = parseAcBullets(acSection)
const wellFormed = bullets.filter(b => !b.malformed)
const acById = new Map(wellFormed.map(b => [b.id, b]))

const findings = []
const warnings = []

// D1: unparseable = unknown = uncovered. `uncovered` is declared here (before both the
// malformed loop below and step 5's well-formed coverage loop) so a malformed bullet
// increments the same denominator step 5 uses, in BOTH drift modes — a driftScript can't
// parse a malformed bullet either, so exempting drift-mode hosts would reopen the hole
// exactly where the host can't see it.
let uncovered = 0

for (const b of bullets) {
  if (b.malformed) {
    uncovered++
    findings.push({
      severity: 'hard', class: 'malformed-ac', ac: b.token || '',
      detail: `malformed AC-ID "${b.token}" — leading bold token must fully match AC-\\d{8}-\\d{2}[a-z]?-\\d+`,
    })
  }
}

// ---- File Plan tests-layer rows: resolve to real files (globs expanded via lib/glob-match) --

const filePlanRows = parseFilePlanRows(specText)
const testsRowPaths = filePlanRows
  .filter(r => (r.layer || '').trim().toLowerCase() === 'tests')
  .flatMap(r => r.paths)

function walkAll(dir, base, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(full, base, out)
    else out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

const testFiles = new Set()
let allFilesCache = null
for (const p of testsRowPaths) {
  if (p.includes('*')) {
    if (allFilesCache === null) allFilesCache = walkAll(root, root)
    for (const f of allFilesCache) if (globMatch(p, f)) testFiles.add(f)
  } else if (fs.existsSync(path.join(root, p))) {
    testFiles.add(p)
  } else {
    findings.push({
      severity: 'hard', class: 'missing-test-file', ac: '',
      detail: `File Plan tests row ${p} does not exist under --root ${root}`,
    })
  }
}

// ---- coverage grep: literal AC-ID per resolved test file, always computed (step 6's file->AC
// mapping needs it in both drift modes even when the coverage-matrix FINDINGS are suppressed) --

const fileContent = new Map()
function readTestFile(rel) {
  if (!fileContent.has(rel)) {
    try {
      fileContent.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'))
    } catch {
      fileContent.set(rel, '')
    }
  }
  return fileContent.get(rel)
}

const fileAcMap = new Map() // test file -> Set(acId) it was grepped a hit for
const acHits = new Map() // acId -> hit count
for (const b of wellFormed) {
  let hits = 0
  for (const f of testFiles) {
    if (readTestFile(f).includes(b.id)) {
      hits++
      if (!fileAcMap.has(f)) fileAcMap.set(f, new Set())
      fileAcMap.get(f).add(b.id)
    }
  }
  acHits.set(b.id, hits)
}

// ---- manifest read (oracle-leg standing check) — before this script appends its own rows ----

function readManifestRows(p) {
  let raw = ''
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch {
    raw = ''
  }
  const rows = new Map()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      if (row.leg) rows.set(row.leg, row)
    } catch {
      // malformed manifest lines are ignored here — verdict.js's manifestValid check is the
      // authority on manifest well-formedness; this script only reads oracle-leg standing.
    }
  }
  return rows
}

const manifestRows = readManifestRows(manifestPath)

// ---- step 5: coverage matrix (skipped entirely in --has-drift-script mode: host owns it) ----

let oracleCovered = 0
if (!hasDriftScript) {
  for (const b of wellFormed) {
    if (acHits.get(b.id) > 0) continue
    if (b.oracle) {
      const row = manifestRows.get(b.oracle)
      if (row && row.exit === 0) {
        oracleCovered++
        warnings.push(`${b.id}: oracle = \`${b.oracle}\` leg`)
      } else {
        findings.push({
          severity: 'hard', class: 'oracle-red-or-absent', ac: b.id,
          detail: `${b.id}: declared oracle leg '${b.oracle}' is ${row ? 'red (exit ' + row.exit + ')' : 'absent from the manifest'}`,
        })
      }
    } else {
      uncovered++
      findings.push({
        severity: 'hard', class: 'uncovered-ac', ac: b.id,
        detail: `${b.id}: zero hits across File Plan tests rows`,
      })
    }
  }
}

// ---- D2: owning-spec [env:] lookup — consulted ONLY on an acById MISS (a current-spec hit,
// with or without [env:], is final and never falls through here). The AC-ID grammar itself
// encodes the owner: AC-{YYYYMMDD}-{NN[a-z]?}-{k} -> the single file matching
// ^{NN[a-z]?}-.*\.md$ under {root}/specs/{YYYYMMDD}/. Fails closed (returns an `error` string,
// never a partial/guessed match) on: date dir absent, zero or >=2 filename matches, file
// unreadable, no AC section, or the AC not found in it — the caller treats every edge as
// unsanctioned-skip.
//
// Caching seam (bug fixed 2026-08-16, spec 20260815/03): only the owning FILE's resolved
// state — its relative path plus every parsed AC bullet, or a file-level error (date dir
// absent / ambiguous or missing filename match / unreadable / no AC section) — is cached per
// date+ordinal. Two different AC-IDs owned by the same file share that one read. The
// per-AC-ID step — finding the bullet whose id equals the AC-ID, and the "no AC bullet
// matching X" error when it's absent — is NOT part of the cached value: it runs fresh on
// every call so each AC-ID gets its own answer instead of inheriting whichever AC-ID happened
// to resolve the file first.
const AC_ID_PARTS_RE = /^AC-(\d{8})-(\d{2}[a-z]?)-\d+$/
const owningSpecFileCache = new Map()

function resolveOwningSpecFile(date, ordinal) {
  const cacheKey = `${date}/${ordinal}`
  if (owningSpecFileCache.has(cacheKey)) return owningSpecFileCache.get(cacheKey)

  const dateDir = path.join(root, 'specs', date)
  let entries
  try {
    entries = fs.readdirSync(dateDir)
  } catch {
    const result = { errorKind: 'no-date-dir' }
    owningSpecFileCache.set(cacheKey, result)
    return result
  }
  const nameRe = new RegExp(`^${ordinal}-.*\\.md$`)
  const matches = entries.filter(f => nameRe.test(f)).sort()
  if (matches.length !== 1) {
    const result = { errorKind: 'name-match', matches }
    owningSpecFileCache.set(cacheKey, result)
    return result
  }
  const owningRelPath = `specs/${date}/${matches[0]}`
  let ownerText
  try {
    ownerText = fs.readFileSync(path.join(root, owningRelPath), 'utf8')
  } catch (e) {
    const result = { errorKind: 'unreadable', owningRelPath, message: e.message }
    owningSpecFileCache.set(cacheKey, result)
    return result
  }
  const ownerSection = extractSection(ownerText, 'Acceptance Criteria')
  if (ownerSection === null) {
    const result = { errorKind: 'no-ac-section', owningRelPath }
    owningSpecFileCache.set(cacheKey, result)
    return result
  }
  const result = { path: owningRelPath, bullets: parseAcBullets(ownerSection) }
  owningSpecFileCache.set(cacheKey, result)
  return result
}

function resolveOwningBullet(acId) {
  const parts = acId.match(AC_ID_PARTS_RE)
  if (!parts) return { error: `AC-ID "${acId}" does not match the owning-spec grammar` }
  const [, date, ordinal] = parts
  const file = resolveOwningSpecFile(date, ordinal)

  if (file.errorKind === 'no-date-dir') {
    return { error: `owning spec date dir specs/${date}/ not found for ${acId}` }
  }
  if (file.errorKind === 'name-match') {
    return {
      error: `owning spec file matching ^${ordinal}-.*\\.md$ under specs/${date}/ is ` +
        `${file.matches.length === 0 ? 'missing' : `ambiguous (${file.matches.length} matches: ${file.matches.join(', ')})`} for ${acId}`,
    }
  }
  if (file.errorKind === 'unreadable') {
    return { error: `owning spec ${file.owningRelPath} unreadable for ${acId}: ${file.message}` }
  }
  if (file.errorKind === 'no-ac-section') {
    return { error: `owning spec ${file.owningRelPath} has no ## Acceptance Criteria section for ${acId}` }
  }
  // File-level resolution succeeded (and may be shared with other AC-IDs via the cache above):
  // the specific-bullet lookup and its "not found" error are per-AC-ID and run every call.
  const ownerBullet = file.bullets.find(b => b.id === acId)
  if (!ownerBullet) {
    return { error: `owning spec ${file.path} has no AC bullet matching ${acId}` }
  }
  return { path: file.path, bullet: ownerBullet }
}

// ---- step 6: skipped-test reconciliation (both drift modes) ---------------------------------

let skipLines = []
if (skipsFile) {
  let raw = ''
  try {
    raw = fs.readFileSync(skipsFile, 'utf8')
  } catch {
    raw = ''
  }
  skipLines = raw.split('\n').map(l => l.trim()).filter(Boolean)
}

let sanctioned = 0
for (const line of skipLines) {
  const embedded = [...line.matchAll(AC_ID_RE_GLOBAL)].map(m => m[0])
  let mappedIds = embedded
  if (!mappedIds.length) {
    for (const [f, ids] of fileAcMap) {
      if (readTestFile(f).includes(line)) { mappedIds = [...ids]; break }
    }
  }
  if (!mappedIds.length) {
    findings.push({
      severity: 'hard', class: 'unmapped-skip', ac: '',
      detail: `skipped test with no AC mapping: ${line}`,
    })
    continue
  }
  const primary = mappedIds[0]
  const bullet = acById.get(primary)
  if (bullet) {
    // D2 branch (1): a current-spec hit is final, with or without [env:] — the owning spec is
    // never consulted here (a re-declared bullet that dropped its gate is authoritative).
    if (bullet.env) {
      sanctioned++
      warnings.push(`${primary}: skipped test sanctioned by [env: ${bullet.env}]`)
    } else {
      findings.push({
        severity: 'hard', class: 'unsanctioned-skip', ac: primary,
        detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line}`,
      })
    }
    continue
  }
  // D2 branch (2): acById MISS — derive the owning spec from the AC-ID grammar and read its
  // declaration there. Every edge (missing/ambiguous/unreadable/no-section/not-found/no-env)
  // fails closed to unsanctioned-skip, the detail naming the owning-spec edge that fired.
  const owning = resolveOwningBullet(primary)
  if (owning.error) {
    findings.push({
      severity: 'hard', class: 'unsanctioned-skip', ac: primary,
      detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line} (${owning.error})`,
    })
  } else if (owning.bullet.env) {
    // D3: an owning-spec sanction counts and reports like a same-spec sanction, naming the source.
    sanctioned++
    warnings.push(`${primary}: skipped test sanctioned by [env: ${owning.bullet.env}] (declared in ${owning.path})`)
  } else {
    findings.push({
      severity: 'hard', class: 'unsanctioned-skip', ac: primary,
      detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line} ` +
        `(owning spec ${owning.path} has no [env:] declaration on ${primary})`,
    })
  }
}

// ---- observed strings + manifest append (this script is the sole writer of its two rows) ----

const acMatrixObserved = `uncovered=${uncovered} oracle=${oracleCovered}`
const skipReconcileObserved = `skipped=${skipLines.length} sanctioned=${sanctioned}`

const ACM_FINDING_CLASSES = new Set(['malformed-ac', 'uncovered-ac', 'oracle-red-or-absent', 'missing-test-file'])
const SKIP_FINDING_CLASSES = new Set(['unsanctioned-skip', 'unmapped-skip'])
const acMatrixExit = findings.some(f => ACM_FINDING_CLASSES.has(f.class)) ? 1 : 0
const skipReconcileExit = findings.some(f => SKIP_FINDING_CLASSES.has(f.class)) ? 1 : 0

const manifestLines =
  JSON.stringify({ leg: 'ac-matrix', exit: acMatrixExit, observed: acMatrixObserved }) + '\n' +
  JSON.stringify({ leg: 'skip-reconcile', exit: skipReconcileExit, observed: skipReconcileObserved }) + '\n'
try {
  fs.appendFileSync(manifestPath, manifestLines)
} catch (e) {
  console.error(`ac-matrix: cannot append to --manifest ${manifestPath}: ${e.message}`)
  process.exit(2)
}

// ---- output -----------------------------------------------------------------------------------

if (jsonOut) {
  console.log(JSON.stringify({
    findings,
    warnings,
    observed: { acMatrix: acMatrixObserved, skipReconcile: skipReconcileObserved },
  }, null, 2))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.detail}`)
  for (const w of warnings) console.log(`WARN  ${''.padEnd(20)} ${w}`)
  console.log(`ac-matrix: ${acMatrixObserved} · ${skipReconcileObserved} · ${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exit(findings.length ? 1 : 0)
