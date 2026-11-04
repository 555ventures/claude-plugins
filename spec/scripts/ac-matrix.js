#!/usr/bin/env node
'use strict'
// ac-matrix.js --spec <path> --root <dir> --manifest <path> [--skips <file>]
//   [--has-drift-script] [--json]
// ac-matrix.js --spec <path> --lint [--json]   (spec-only: no --root/--manifest/--skips/
//   --has-drift-script — the AC-line lint alone, no File Plan read, no manifest append)
//
// Owner: specs/20260814/01-ac-matrix-script.md
//
// The sole derivation of two review legs: it lints the spec's `## Acceptance Criteria` bullets,
// greps the File Plan's tests-layer rows for AC-ID coverage (full-token, via lib/spec-sections.js's
// acIdOccurs), reconciles reported skips against declared [env:]/[oracle:] tags, and appends its
// own rows to --manifest: leg "ac-matrix" {"uncovered":N,"oracle":N,"preGreen":N} and leg
// "skip-reconcile" {"skipped":N,"sanctioned":N}; --json's `observed` mirrors them exactly.
//
// `--lint` runs ONLY the AC-line lint (`malformed-ac`, `invalid-pre-green`, `mixed-pin`, and the
// dated disposition/literal arms) and returns before the full mode's --root/--manifest check;
// `/spec:plan` lock runs it. In full mode a mixed bullet is a WARNING only — full mode also runs
// against already-CLEANed specs.
//
// `[oracle: literals]` is evaluated in process: its stems are the backtick spans after the tag run
// and before any `→` tail; a stem found in a File Plan file (Layer not tests, Action not DELETE,
// existing under --root) is hard `literal-survives`; a stemless bullet is `literals-no-stem`.
// `[pre-green:]` reasons are validated against PRE_GREEN_REASONS (out-of-enum = hard
// `invalid-pre-green`); the tag never sanctions an AC out of `uncovered`.
// Critical tier: a skip mapped to THIS spec's own AC declaring [env: VAR] on a `tier: critical`
// spec is hard `critical-env-skip`; --lint gains hard `missing-literal` for a critical spec dated
// on or after CRITICAL_LINT_APPLIES_FROM.
// A tests-layer File Plan row with Action DELETE skips the existence check; a row with no Action
// column keeps it.
//
// Skip mapping: route 1 = an AC-ID in the skip line; route 2 = a content match against this
// spec's File Plan test files; route 3 (only when both miss and the line carries `<relpath>::`) =
// the AC citations of that file under --root. Routes 2/3 take the first AC cited at or after the
// test name's position, else the file-level citations. Every route-3 edge fails closed to
// unmapped-skip.
//
// `rejected-trailing-tag` replaces the generic uncovered-ac/unsanctioned-skip finding for an AC
// whose refused trailing tag names `[oracle:`/`[env:]` — loud only where the refusal changes the
// verdict. It is emitted from both loops, so each leg's exit reads its own emission-site Set.
//
// What this deliberately does NOT do: render a report (report-render.js), compute the review
// verdict (verdict.js), parse runner output for skipped-test names (passed via --skips), expand a
// File Plan glob outside lib/glob-match.js, own the AC-ID grammar / section extraction / bullet
// parsing (lib/spec-sections.js), or read a `→ reuses` pointer itself (lib/scan-test-calls.js's
// resolveReference).
//
// Exit codes: 0 = executed, no findings · 1 = executed, findings emitted (rides the normal
// Phase 2 disposition flow — not a script failure) · 2 = usage error, unreadable --spec, a spec
// with no `## Acceptance Criteria` section, or `--lint` combined with `--root`/`--manifest`/
// `--skips`/`--has-drift-script` (usage: `--lint` is spec-only).

const fs = require('fs')
const path = require('path')
const { parseFilePlanRows, isTestsRow } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const {
  AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, extractSection, parseAcBullets, acIdOccurs,
  rejectedTrailingTagDetail, pinShape, parseDisposition, DISPOSITION_APPLIES_FROM,
  CRITICAL_LINT_APPLIES_FROM, slotRun, trailingRun,
} = require('./lib/spec-sections')
const { fmValue } = require('./lib/frontmatter')
const { resolveReference } = require('./lib/scan-test-calls')
const { writeOut } = require('./lib/driver-io')

// Synchronous writer (lib/driver-io.js writeOut, no trailing newline of its own) for --lint's
// short-circuit exit — see lib/sync-write.js for the pipe truncation it avoids.

function usage() {
  console.error('usage: ac-matrix.js --spec <path> --root <dir> --manifest <path> ' +
    '[--skips <file>] [--has-drift-script] [--json]\n' +
    '       ac-matrix.js --spec <path> --lint [--resolve-root <dir>] [--json]        ' +
    '(spec-only: no --root/--manifest/--skips/--has-drift-script)')
}

let specPath = null, root = null, manifestPath = null, skipsFile = null, resolveRoot = null
let hasDriftScript = false, jsonOut = false, lintMode = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--manifest') manifestPath = argv[++i]
  else if (a === '--skips') skipsFile = argv[++i]
  else if (a === '--has-drift-script') hasDriftScript = true
  else if (a === '--resolve-root') resolveRoot = argv[++i]
  else if (a === '--json') jsonOut = true
  else if (a === '--lint') lintMode = true
  else { usage(); process.exit(2) }
}
if (!specPath) { usage(); process.exit(2) }
if (lintMode) {
  // --lint is spec-only — combining it with any full-mode flag is a usage error.
  // --resolve-root is the ONE tree-reading companion --lint accepts.
  if (root !== null || manifestPath !== null || skipsFile !== null || hasDriftScript) {
    usage(); process.exit(2)
  }
} else if (!root || !manifestPath) {
  usage(); process.exit(2)
}

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`ac-matrix: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

// ---- ## Acceptance Criteria section extraction + bullet parsing: both lifted verbatim into
// ---- lib/spec-sections.js — extractSection/parseAcBullets imported above -----------------

const acSection = extractSection(specText, 'Acceptance Criteria')
if (acSection === null) {
  console.error(`ac-matrix: ${specPath} has no ## Acceptance Criteria section — nothing to lint/cover`)
  process.exit(2)
}

const bullets = parseAcBullets(acSection)
const wellFormed = bullets.filter(b => !b.malformed)

const specDateMatch = /specs\/(\d{8})\//.exec(specPath)
const dispositionApplies = !!(specDateMatch && specDateMatch[1] >= DISPOSITION_APPLIES_FROM)
const isCritical = String(fmValue(specText, 'tier') || '').trim() === 'critical'
const literalApplies = isCritical && !!(specDateMatch && specDateMatch[1] >= CRITICAL_LINT_APPLIES_FROM)

// Literal detection:the bullet's raw minus the declaration-slot run, the trailing bare-tag
// run and the disposition tail from its `→`; any backtick span left counts.
function literalText(raw) {
  let text = raw
  const slot = slotRun(raw.split('\n')[0])
  if (slot) text = text.replace(slot, '')
  text = text.replace(/\s+$/, '')
  const trail = trailingRun(text)
  if (trail) text = text.slice(0, text.length - trail.replace(/\s+$/, '').length)
  const arrows = []
  for (let i = text.indexOf('\u2192'); i !== -1; i = text.indexOf('\u2192', i + 1)) arrows.push(i)
  for (let i = arrows.length - 1; i >= 0; i--) {
    if (parseDisposition('\u2192' + text.slice(arrows[i] + 1)) !== null) { text = text.slice(0, arrows[i]); break }
  }
  return text
}
function hasLiteral(raw) {
  return /`[^`\n]+`/.test(literalText(raw))
}
// `[oracle: literals]` stems: every backtick span in the bullet after the tag run and before
// any `→` tail.
function literalStems(raw) {
  return Array.from(new Set((literalText(raw).match(/`[^`\n]+`/g) || []).map(t => t.slice(1, -1))))
}

// --lint returns HERE, before the full mode's --root/--manifest requirement check.
if (lintMode) {
  const lintFindings = []
  let malformedCount = 0, invalidPreGreenCount = 0, mixedCount = 0
  for (const b of bullets) {
    if (b.malformed) {
      malformedCount++
      lintFindings.push({
        severity: 'hard', class: 'malformed-ac', ac: b.token || '',
        detail: `malformed AC-ID "${b.token}" — leading bold token must fully match AC-\\d{8}-\\d{2}[a-z]?-\\d+`,
      })
    }
  }
  for (const b of wellFormed) {
    if (b.preGreen !== null && !PRE_GREEN_REASONS.includes(b.preGreen)) {
      invalidPreGreenCount++
      lintFindings.push({
        severity: 'hard', class: 'invalid-pre-green', ac: b.id,
        detail: `${b.id}: [pre-green: ${b.preGreen}] is not in PRE_GREEN_REASONS (${PRE_GREEN_REASONS.join(' | ')})`,
      })
    }
    if (pinShape(b.raw) === 'mixed') {
      mixedCount++
      lintFindings.push({
        severity: 'hard', class: 'mixed-pin', ac: b.id,
        detail: `${b.id} mixes a new promise with a SHALL CONTINUE TO pin — split the SHALL ` +
          `CONTINUE TO clause into its own AC`,
      })
    }
  }

  // The disposition grammar's lint arms apply only to a spec dated on or after
  // DISPOSITION_APPLIES_FROM (its specs/<YYYYMMDD>/ segment); otherwise neither counter is computed.
  for (const b of wellFormed) {
    if (b.oracle === 'literals' && literalStems(b.raw).length === 0) {
      lintFindings.push({
        severity: 'hard', class: 'literals-no-stem', ac: b.id,
        detail: `${b.id}: [oracle: literals] declares no stem`,
      })
    }
  }

  let missingDispositionCount = 0
  let unresolvedDispositionCount = 0
  if (dispositionApplies) {
    for (const b of wellFormed) {
      if (b.oracle === 'literals') continue // its oracle has no test by construction (D1)
      const disposition = parseDisposition(b.raw)
      if (disposition === null) {
        missingDispositionCount++
        lintFindings.push({
          severity: 'hard', class: 'missing-disposition', ac: b.id,
          detail: `${b.id}: no disposition — end the bullet with → writes <file>, → rewrites ` +
            `<file> :: <title>, or → reuses <file> :: <title>`,
        })
        continue
      }
      // Reference resolution is the SEPARATE opt-in --resolve-root flag — a `writes`
      // disposition names a file that does not exist yet, so only rewrites/reuses resolve.
      if (resolveRoot && (disposition.kind === 'rewrites' || disposition.kind === 'reuses')) {
        const matches = resolveReference(resolveRoot, disposition.file, disposition.prefix).length
        if (matches !== 1) {
          unresolvedDispositionCount++
          lintFindings.push({
            severity: 'hard', class: 'unresolved-disposition', ac: b.id,
            detail: `${b.id}: ${disposition.kind} reference "${disposition.file} :: ` +
              `${disposition.prefix}" resolved to ${matches} matches (need exactly 1) — use ` +
              `\`count-tests.js --titles --file ${disposition.file}\` to find a unique reference`,
          })
        }
      }
    }
  }

  let missingLiteralCount = 0
  if (literalApplies) {
    for (const b of wellFormed) {
      if (!hasLiteral(b.raw)) {
        missingLiteralCount++
        lintFindings.push({
          severity: 'hard', class: 'missing-literal', ac: b.id,
          detail: `${b.id}: critical-tier AC carries no literal example — add one backticked input → output pair`,
        })
      }
    }
  }

  const lintObserved = { malformed: malformedCount, invalidPreGreen: invalidPreGreenCount, mixed: mixedCount }
  if (dispositionApplies) {
    lintObserved.missingDisposition = missingDispositionCount
    lintObserved.unresolvedDisposition = unresolvedDispositionCount
  }
  if (literalApplies) lintObserved.missingLiteral = missingLiteralCount
  if (jsonOut) {
    writeOut(1, JSON.stringify({ findings: lintFindings, warnings: [], observed: { lint: lintObserved } }, null, 2) + '\n')
  } else {
    for (const f of lintFindings) writeOut(1, `HARD  ${f.class.padEnd(20)} ${f.detail}\n`)
    writeOut(1, `ac-matrix: lint malformed=${lintObserved.malformed} ` +
      `invalidPreGreen=${lintObserved.invalidPreGreen} mixed=${lintObserved.mixed} ` +
      `missingDisposition=${missingDispositionCount} unresolvedDisposition=${unresolvedDispositionCount} · ` +
      `${lintFindings.length} finding(s)\n`)
  }
  process.exit(lintFindings.length ? 1 : 0)
}

const acById = new Map(wellFormed.map(b => [b.id, b]))

const findings = []
const warnings = []

// Which loop emitted each `rejected-trailing-tag` finding, by object reference — internal only,
// never a key on the finding; the exit derivation partitions by it.
const acMatrixOrigin = new Set()
const skipOrigin = new Set()


// Unparseable = unknown = uncovered: a malformed bullet counts in the same denominator as step 5,
// in both drift modes.
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

// [pre-green:] validation — independent of --has-drift-script and of coverage.
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

// A mixed carried AC is a WARNING here, never a finding (--lint is where it is refused).
for (const b of wellFormed) {
  if (pinShape(b.raw) === 'mixed') {
    warnings.push(`mixed-pin ${b.id} — split the SHALL CONTINUE TO clause into its own AC`)
  }
}

// ---- File Plan tests-layer rows: resolve to real files (globs expanded via lib/glob-match) --

const filePlanRows = parseFilePlanRows(specText)
// A DELETE row's missing file is a satisfied plan; a null Action keeps the existence requirement.
const testsRowPaths = filePlanRows
  .filter(r => isTestsRow(r))
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
  // An Action=DELETE row naming a missing file is correctly absent — no finding, and the
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
  // A `→ reuses` pointer naming exactly one case is that criterion's cover: a reused test keeps
  // the tag of the spec that wrote it, so the id grep above can never find it. The file stays out
  // of fileAcMap — a skip in it still maps through the id the test itself carries.
  if (hits === 0 && dispositionApplies) {
    const disposition = parseDisposition(b.raw)
    if (disposition && disposition.kind === 'reuses' &&
      resolveReference(root, disposition.file, disposition.prefix).length === 1) hits = 1
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

// ---- [oracle: literals]: evaluated in-process over the File Plan's non-tests, non-DELETE
// files that exist under --root; no manifest row is read or written for it.
const literalsBullets = wellFormed.filter(b => b.oracle === 'literals')
if (literalsBullets.length > 0) {
  const scoped = new Set()
  for (const r of filePlanRows) {
    if (isTestsRow(r) || (r.action || '').trim().toLowerCase() === 'delete') continue
    for (const p of r.paths) {
      if (p.includes('*')) {
        if (allFilesCache === null) allFilesCache = walkAll(root, root)
        for (const f of allFilesCache) if (globMatch(p, f)) scoped.add(f)
      } else if (fs.existsSync(path.join(root, p))) {
        scoped.add(p)
      }
    }
  }
  const scopedText = new Map()
  for (const f of scoped) {
    try { scopedText.set(f, fs.readFileSync(path.join(root, f), 'utf8')) } catch { /* unreadable: not searched */ }
  }
  for (const b of literalsBullets) {
    const stems = literalStems(b.raw)
    if (stems.length === 0) {
      findings.push({
        severity: 'hard', class: 'literals-no-stem', ac: b.id,
        detail: `${b.id}: [oracle: literals] declares no stem`,
      })
      continue
    }
    let survived = false
    for (const stem of stems) {
      for (const [f, text] of scopedText) {
        if (!text.includes(stem)) continue
        survived = true
        findings.push({
          severity: 'hard', class: 'literal-survives', ac: b.id,
          detail: `${b.id}: literal \`${stem}\` survives in ${f}`,
        })
      }
    }
    if (!survived) {
      oracleCovered++
      warnings.push(`${b.id}: oracle = literals (${stems.length} stems, ${scopedText.size} files)`)
    }
  }
}

if (!hasDriftScript) {
  for (const b of wellFormed) {
    if (b.oracle === 'literals') continue
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
      // A refused trailing [oracle:] tag replaces uncovered-ac — the refusal is causally
      // relevant (zero coverage plus a would-be oracle declaration that never registered).
      if (b.trailingRejected && b.trailingRejected.includes('[oracle:')) {
        const f = {
          severity: 'hard', class: 'rejected-trailing-tag', ac: b.id,
          detail: rejectedTrailingTagDetail(b.id, b.trailingRejected, b.trailingRejectedCause,
            'no executed coverage for this AC'),
        }
        findings.push(f)
        acMatrixOrigin.add(f) // D9: this loop is the ac-matrix leg
      } else {
        findings.push({
          severity: 'hard', class: 'uncovered-ac', ac: b.id,
          detail: `${b.id}: zero hits across File Plan tests rows`,
        })
      }
    }
  }
}

// ---- Owning-spec [env:] lookup — only on an acById MISS. AC-{YYYYMMDD}-{NN[a-z]?}-{k} names the
// single file ^{NN[a-z]?}-.*\.md$ under specs/{YYYYMMDD}/. Every edge (no date dir, zero or ≥2
// matches, unreadable, no AC section, AC absent) returns an `error` — the caller reads
// unsanctioned-skip. The owning FILE's parse is cached per date+ordinal; the per-AC-ID lookup
// runs fresh each call.
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

// Route 3 containment: the resolved path must land strictly inside --root (not a prefix match).
function resolveInsideRoot(rootDir, rel) {
  const rootResolved = path.resolve(rootDir)
  const resolved = path.resolve(rootDir, rel)
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep) ? resolved : null
}

// Map to the first AC cited at or after the test name's position; else the file-level ids.
function idsFromPosition(content, pos, fileLevelIds) {
  if (pos < 0) return fileLevelIds
  const after = [...new Set([...content.slice(pos).matchAll(AC_ID_RE_GLOBAL)].map(m => m[0]))]
  return after.length ? after : fileLevelIds
}

let sanctioned = 0
for (const line of skipLines) {
  const embedded = [...line.matchAll(AC_ID_RE_GLOBAL)].map(m => m[0])
  let mappedIds = embedded
  if (!mappedIds.length) {
    for (const [f, ids] of fileAcMap) {
      const content = readTestFile(f)
      if (content.includes(line)) { mappedIds = idsFromPosition(content, content.indexOf(line), [...ids]); break }
    }
  }
  // Route 3 — only after routes 1/2 miss and the line carries a `::` qualifier; fails closed.
  if (!mappedIds.length && line.includes('::')) {
    const rel = line.slice(0, line.indexOf('::'))
    const resolved = resolveInsideRoot(root, rel)
    if (resolved && fs.existsSync(resolved)) {
      const relForCache = path.relative(root, resolved).split(path.sep).join('/')
      const content = readTestFile(relForCache)
      const name = line.slice(line.lastIndexOf('::') + 2).split('[')[0]
      const cited = [...content.matchAll(AC_ID_RE_GLOBAL)].map(m => m[0])
      const deduped = [...new Set(cited)]
      if (deduped.length) mappedIds = idsFromPosition(content, name ? content.indexOf(name) : -1, deduped)
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
    // Branch (1): a current-spec hit is final, with or without [env:] — the owning spec is
    // never consulted here (a re-declared bullet that dropped its gate is authoritative).
    if (bullet.env && isCritical) {
      // a critical spec's own gated test must execute — the sanction is withdrawn.
      findings.push({
        severity: 'hard', class: 'critical-env-skip', ac: primary,
        detail: `${primary}: skipped test gated by [env: ${bullet.env}] on a tier: critical spec — ${line} — ` +
          `provision ${bullet.env} and re-run the review legs — a critical spec's own gated test must execute`,
      })
    } else if (bullet.env) {
      sanctioned++
      warnings.push(`${primary}: skipped test sanctioned by [env: ${bullet.env}]`)
    } else if (bullet.trailingRejected && bullet.trailingRejected.includes('[env:')) {
      // A refused trailing [env:] tag on the owning (here: current-spec) bullet replaces
      // unsanctioned-skip — the refusal is causally relevant (this skip's only sanction attempt).
      const f = {
        severity: 'hard', class: 'rejected-trailing-tag', ac: primary,
        detail: rejectedTrailingTagDetail(primary, bullet.trailingRejected, bullet.trailingRejectedCause,
          'an unsanctioned skip for this AC'),
      }
      findings.push(f)
      skipOrigin.add(f) // D9: this loop is the skip-reconcile leg
    } else {
      findings.push({
        severity: 'hard', class: 'unsanctioned-skip', ac: primary,
        detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line}`,
      })
    }
    continue
  }
  // Branch (2): acById MISS — read the owning spec's declaration; every edge fails closed to
  // unsanctioned-skip, the detail naming the edge.
  const owning = resolveOwningBullet(primary)
  if (owning.error) {
    findings.push({
      severity: 'hard', class: 'unsanctioned-skip', ac: primary,
      detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line} (${owning.error})`,
    })
  } else if (owning.bullet.env) {
    // An owning-spec sanction counts and reports like a same-spec sanction, naming the source.
    sanctioned++
    warnings.push(`${primary}: skipped test sanctioned by [env: ${owning.bullet.env}] (declared in ${owning.path})`)
  } else if (owning.bullet.trailingRejected && owning.bullet.trailingRejected.includes('[env:')) {
    // A refused trailing [env:] tag on the OWNING spec's bullet replaces unsanctioned-skip —
    // same relevance gate as the current-spec branch above, applied to the cross-spec lookup.
    const f = {
      severity: 'hard', class: 'rejected-trailing-tag', ac: primary,
      detail: rejectedTrailingTagDetail(primary, owning.bullet.trailingRejected, owning.bullet.trailingRejectedCause,
        `an unsanctioned skip for this AC (owning spec ${owning.path})`),
    }
    findings.push(f)
    skipOrigin.add(f) // D9: this loop is the skip-reconcile leg
  } else {
    findings.push({
      severity: 'hard', class: 'unsanctioned-skip', ac: primary,
      detail: `${primary}: skipped test with no [env:] declaration on its AC line — ${line} ` +
        `(owning spec ${owning.path} has no [env:] declaration on ${primary})`,
    })
  }
}

// ---- observed objects + manifest append (this script is the sole writer of its two rows) -----

const acMatrixObserved = { uncovered, oracle: oracleCovered, preGreen }
const skipReconcileObserved = { skipped: skipLines.length, sanctioned }

// rejected-trailing-tag is in neither set: the exits OR each class test with its origin Set.
const ACM_FINDING_CLASSES = new Set(['malformed-ac', 'uncovered-ac', 'oracle-red-or-absent', 'missing-test-file', 'invalid-pre-green', 'literal-survives', 'literals-no-stem'])
const SKIP_FINDING_CLASSES = new Set(['unsanctioned-skip', 'unmapped-skip', 'critical-env-skip'])
const acMatrixExit = findings.some(f => ACM_FINDING_CLASSES.has(f.class) || acMatrixOrigin.has(f)) ? 1 : 0
const skipReconcileExit = findings.some(f => SKIP_FINDING_CLASSES.has(f.class) || skipOrigin.has(f)) ? 1 : 0

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
  // The uncovered/oracle/skipped/sanctioned segments of this line are byte-stable.
  console.log(`ac-matrix: uncovered=${acMatrixObserved.uncovered} oracle=${acMatrixObserved.oracle} ` +
    `preGreen=${acMatrixObserved.preGreen} · ` +
    `skipped=${skipReconcileObserved.skipped} sanctioned=${skipReconcileObserved.sanctioned} · ` +
    `${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exit(findings.length ? 1 : 0)
