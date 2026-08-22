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
//
// Defect fixed (2026-08-20, D13, specs/20260820/04-entrypoint-conformance.md): the
// missing-test-file check asserted existence for EVERY tests-layer File Plan row regardless of
// its Action column, so a spec that plans a test file's deletion raised a HARD finding by
// construction — the check punished a correctly-classified DELETE row for the absence it
// itself planned. Fixed to read each row's Action (lib/file-plan.js's parseFilePlanRows already
// exposes it) and skip the existence check ONLY on an explicit, case-insensitive `DELETE`. Fails
// closed: a row whose table bound no Action column (action === null) keeps the existence
// requirement — a missing Action is never treated as an implicit DELETE.
//
// specs/20260820/06-typed-evidence-manifest.md D2/D8 (2026-08-20, brief 16's second move): the
// two manifest rows this script appends — leg "ac-matrix" ({"uncovered":N,"oracle":N}) and leg
// "skip-reconcile" ({"skipped":N,"sanctioned":N}) — carry typed JSON objects, not packed
// "uncovered=N oracle=M"/"skipped=N sanctioned=S" strings; `--json`'s own `observed` field
// mirrors those same objects exactly. The plain-mode stdout summary line stays byte-unchanged
// (D8) — only the manifest rows and --json's observed field take the typed shape.
//
// specs/20260821/01-red-check.md D1/D6 (2026-08-21): the acMatrix row extends in place to
// {"uncovered":N,"oracle":N,"preGreen":N} — `preGreen` counts well-formed AC bullets carrying a
// VALID `[pre-green: <reason>]` tag (validated here against lib/spec-sections.js's
// PRE_GREEN_REASONS, the single enum authority; the parser itself does no enum validation, D1).
// An out-of-enum reason is hard finding `invalid-pre-green` (added to ACM_FINDING_CLASSES) and
// does NOT count toward preGreen. The tag NEVER sanctions a skip out of `uncovered` — a tagged AC
// with zero test hits still counts uncovered (AC-20260821-01-12). The plain-mode summary line
// gains a `preGreen=N` segment (D6: "yours to extend sensibly" — not pinned byte-unchanged like
// D8's uncovered/oracle/skipped/sanctioned segments).
//
// specs/20260821/03-cross-spec-skip-mapping.md D1/D2 (2026-08-21, UpWell defect 1): step 6's
// skip reconciliation only mapped a skip line via an AC-ID embedded in the line itself (route 1)
// or a content-match against the spec-under-review's own File Plan test files (route 2) - a
// skip owned by an EARLIER spec, reported by a runner that qualifies its line with the file's own
// path (<relpath>::<name>, e.g. pytest), fell to unmapped-skip unless that file happened to be
// in THIS spec's File Plan (observed: the same env-gated tests were sanctioned=4 under their
// owning spec, sanctioned=0 under every other). Route 3 (new): tried ONLY when routes 1/2 both
// miss and the line contains "::" - resolve the prefix against --root, and if it stays strictly
// inside root and the file exists, read its full-token AC-ID citations (dedup in file order,
// via the existing readTestFile cache) as mappedIds, feeding the SAME acById/owning-spec logic
// below untouched. Every edge (no "::", outside-root, missing file, zero citations) fails closed
// to today's unmapped-skip, byte-identical detail - monotonic widening only (D2): a bare-name
// line never enters route 3, and an already-mapped line never re-resolves through it.
//
// D7 (2026-08-22 amendment, same spec): the coverage grep at step 6 (readTestFile(f).includes
// (b.id)) was a bare substring test - a well-formed AC whose ID is a PREFIX of another declared
// AC's ID (AC-...-1 inside AC-...-12) read as covered by a test citing only the LONGER id,
// silently laundering uncovered-ac. Fixed by replacing the bare .includes with
// lib/spec-sections.js's exported acIdOccurs, a full-token occurrence check - the single
// authority also used by red-check.js's carried-AC classifier.

const fs = require('fs')
const path = require('path')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { AC_ID_RE, AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, extractSection, parseAcBullets, acIdOccurs } = require('./lib/spec-sections')

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

// D6 (specs/20260821/01-red-check.md): [pre-green:] validation — unconditional, independent of
// --has-drift-script (coverage suppression under drift mode is orthogonal to tag validity), and
// independent of the AC's own coverage standing (D6: the tag never launders coverage — a valid
// tag on a zero-hit AC still counts uncovered via the loop below, AND still counts preGreen here).
let preGreen = 0
for (const b of wellFormed) {
  if (b.preGreen === null) continue
  if (PRE_GREEN_REASONS.includes(b.preGreen)) {
    preGreen++
  } else {
    findings.push({
      severity: 'hard', class: 'invalid-pre-green', ac: b.id,
      detail: `${b.id}: [pre-green: ${b.preGreen}] is not in PRE_GREEN_REASONS (${PRE_GREEN_REASONS.join(' | ')})`,
    })
  }
}

// ---- File Plan tests-layer rows: resolve to real files (globs expanded via lib/glob-match) --

const filePlanRows = parseFilePlanRows(specText)
// D13: each path carries its own row's Action (normalized trim+lowercase, mirroring the
// existing layer normalization) so a DELETE row's missing file is a satisfied plan, not a
// finding — while a null/absent Action (no Action column bound in that row's table) keeps
// isDelete false and the existence requirement stays enforced.
const testsRowPaths = filePlanRows
  .filter(r => (r.layer || '').trim().toLowerCase() === 'tests')
  .flatMap(r => r.paths.map(p => ({ p, isDelete: (r.action || '').trim().toLowerCase() === 'delete' })))

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
for (const { p, isDelete } of testsRowPaths) {
  if (p.includes('*')) {
    if (allFilesCache === null) allFilesCache = walkAll(root, root)
    for (const f of allFilesCache) if (globMatch(p, f)) testFiles.add(f)
  } else if (fs.existsSync(path.join(root, p))) {
    testFiles.add(p)
  } else if (!isDelete) {
    findings.push({
      severity: 'hard', class: 'missing-test-file', ac: '',
      detail: `File Plan tests row ${p} does not exist under --root ${root}`,
    })
  }
  // D13: an Action=DELETE row naming a missing file is correctly absent — no finding, and the
  // path stays out of testFiles (it can't be grepped for AC-ID coverage if it doesn't exist).
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
    if (acIdOccurs(readTestFile(f), b.id)) {
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

// D1: route 3's fail-closed containment check — the resolved path must land strictly inside
// --root, never merely start with the same string prefix (a sibling directory sharing a name
// prefix with root must not pass).
function resolveInsideRoot(rootDir, rel) {
  const rootResolved = path.resolve(rootDir)
  const resolved = path.resolve(rootDir, rel)
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep) ? resolved : null
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
  // D1/D2: route 3 — only after routes 1/2 both miss AND the line carries a runner-style file
  // qualifier. Fails closed at every edge (no "::", outside --root, missing file, zero
  // citations) straight through to the unmapped-skip fallthrough below, byte-identical detail.
  if (!mappedIds.length && line.includes('::')) {
    const rel = line.slice(0, line.indexOf('::'))
    const resolved = resolveInsideRoot(root, rel)
    if (resolved && fs.existsSync(resolved)) {
      const relForCache = path.relative(root, resolved).split(path.sep).join('/')
      const cited = [...readTestFile(relForCache).matchAll(AC_ID_RE_GLOBAL)].map(m => m[0])
      const deduped = [...new Set(cited)]
      if (deduped.length) mappedIds = deduped
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

// ---- observed objects + manifest append (this script is the sole writer of its two rows) -----
// specs/20260820/06-typed-evidence-manifest.md D2/D8: both rows' `observed` are typed JSON
// objects, never packed strings — `--json`'s own `observed` field (below) mirrors these same
// objects exactly, byte-identical to what gets appended to --manifest.

const acMatrixObserved = { uncovered, oracle: oracleCovered, preGreen }
const skipReconcileObserved = { skipped: skipLines.length, sanctioned }

const ACM_FINDING_CLASSES = new Set(['malformed-ac', 'uncovered-ac', 'oracle-red-or-absent', 'missing-test-file', 'invalid-pre-green'])
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
  // D8: the plain-mode stdout summary line stays byte-unchanged for the uncovered/oracle/
  // skipped/sanctioned segments — D6 extends it with a preGreen segment ("yours to extend
  // sensibly", not pinned byte-unchanged like D8's four).
  console.log(`ac-matrix: uncovered=${acMatrixObserved.uncovered} oracle=${acMatrixObserved.oracle} ` +
    `preGreen=${acMatrixObserved.preGreen} · ` +
    `skipped=${skipReconcileObserved.skipped} sanctioned=${skipReconcileObserved.sanctioned} · ` +
    `${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exit(findings.length ? 1 : 0)
