#!/usr/bin/env node
'use strict'
// red-check.js --spec <path> --root <dir> --base <sha-or-ref> [--json]
//
// Owner: specs/20260821/01-red-check.md
//
// Derives each tests-layer File Plan file's expected pre-image colour from the spec's AC
// vocabulary (a `SHALL CONTINUE TO` pin, or a closed-enum `[pre-green: <reason>]` tag — grammar and
// enum in lib/spec-sections.js; an AC ending `→ rewrites` is never sanctioned), executes
// `{testCommand}` (+ `{typecheckCommand}` when declared; `{file}` substituted via lib/host-run.js
// withFiles, else appended) once per file against the untouched pre-image, and reports every
// mismatch as a named finding. Carried AC-IDs are full-token matches (acIdOccurs).
//
// An `[env: VAR]` tag on EVERY AC a green red-expected file carries (and a file that mentions VAR)
// downgrades unsanctioned-green to a warning naming each withheld variable; `expected` stays red.
// A carried AC whose pinShape is 'mixed' gets one hard `mixed-pin` for the file and no colour
// verdict (the run still executes and is logged). A refused backticked trailing `[pre-green:`
// tag on a green red-expected file is hard `rejected-trailing-tag` instead of unsanctioned-green.
//
// `rewrites`/`reuses` dispositions get one additional TARGETED run per AC when the host declares
// `testNameFilter` (a fragment carrying `{name}`): `rewrites` observed green is hard
// `gutted-rewrite`, `reuses` observed red is hard `broken-reuse`. Without the key, or when a
// reference resolves to other than one pre-image test or is absent from the filtered run's own
// output, it degrades to the whole-file arms with one warning. `--json` carries `dispositions`.
//
// Wildcard tests rows expand through lib/ignored-paths.js (ignored paths pruned, only regular
// files pushed); a wildcard row that expands to zero files adds one warning with the pruned
// count. A literal row is never walked and still reports `missing-test-file` when absent.
//
// What this deliberately does NOT do: attribute runner OUTPUT to individual tests (output is read
// only to count executed tests via capabilities.testCountPattern, and to confirm a filtered run
// selected its title); render a review report or compute a verdict (a build-Phase-1 gate, never a
// review leg); snapshot or restore the tree (the working tree AT INVOCATION TIME is the
// pre-image — hence the purity refusal); validate `[pre-green:]` reasons anywhere but here and in
// ac-matrix.js; or expand a File Plan glob through any matcher but lib/glob-match.js.
//
// Exit codes: 0 = every resolved tests-layer file matches its expected pre-image colour ·
//             1 = findings emitted (unsanctioned-green | broken-pin | missing-test-file |
//                 invalid-pre-green | rejected-trailing-tag | mixed-pin | gutted-rewrite |
//                 broken-reuse | vacuous-green) — rides the normal build Phase 1 disposition flow, never a script
//                 failure · 2 = usage error, unreadable --spec, no ## Acceptance Criteria section,
//                 host config declares no testCommand, or a pre-image purity refusal (a non-tests
//                 File Plan path already differs from --base — tracked or untracked)

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const hostRun = require('./lib/host-run')
const { computeTestsExecuted, isUnobserved } = require('./lib/count-observation')
const { quote } = hostRun
const { parseFilePlanRows, isTestsRow } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { readConfig } = require('./lib/host-config')
const { scanCases } = require('./lib/scan-test-calls')
const { getIgnoredPaths } = require('./lib/ignored-paths')
const {
  extractSection, parseAcBullets, PRE_GREEN_REASONS, acIdOccurs, rejectedTrailingTagDetail,
  normalizeForPinCheck, pinShape, parseDisposition,
} = require('./lib/spec-sections')

function usage() {
  console.error('usage: red-check.js --spec <path> --root <dir> --base <sha-or-ref> [--json]')
}

let specPath = null, root = null, base = null, jsonOut = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--json') jsonOut = true
  else { usage(); process.exit(2) }
}
if (!specPath || !root || !base) { usage(); process.exit(2) }

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`red-check: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

const acSection = extractSection(specText, 'Acceptance Criteria')
if (acSection === null) {
  console.error(`red-check: ${specPath} has no ## Acceptance Criteria section — nothing to classify`)
  process.exit(2)
}
const bullets = parseAcBullets(acSection)
const wellFormed = bullets.filter(b => !b.malformed)
const bulletById = new Map(wellFormed.map(b => [b.id, b]))


const filePlanRows = parseFilePlanRows(specText)

// ---- host config read ONLY through lib/host-config.js readConfig (name-ban) --------

const config = readConfig(root)
if (!config.testCommand) {
  console.error('red-check: host config declares no "testCommand" — add it to the host config, ' +
    'or run /spec:init to regenerate the grounding layer')
  process.exit(2)
}

// ---- pre-image purity refusal — BEFORE any test file is resolved or executed ----------------
// (`git diff --name-only <base>` ∪ untracked paths) ∩ the File Plan's NON-tests paths; tests-layer
// paths are exempt — differing from --base is what red-check reconciles.

function gitLines(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
  } catch (e) {
    console.error(`red-check: \`git ${args.join(' ')}\` failed under --root ${root} — confirm ` +
      `--root is a git repository and --base ${base} resolves (git rev-parse --verify ${base}): ${e.message}`)
    process.exit(2)
  }
}

const trackedDiff = gitLines(['diff', '--name-only', base])
const untracked = gitLines(['status', '--porcelain', '--untracked-files=all'])
  .filter(l => l.startsWith('??'))
  .map(l => l.replace(/^\?\?\s+/, ''))
const changedPaths = new Set([...trackedDiff, ...untracked])

const nonTestsPatterns = filePlanRows
  .filter(r => !isTestsRow(r))
  .flatMap(r => r.paths)

function matchesNonTests(p) {
  return nonTestsPatterns.some(pat => (pat.includes('*') ? globMatch(pat, p) : pat === p))
}

const offending = [...changedPaths].filter(matchesNonTests)
if (offending.length) {
  console.error(`red-check: pre-image is not pure — non-tests File Plan path(s) already differ ` +
    `from --base ${base}: ${offending.join(', ')} — reconcile the working tree to match --base ` +
    `before running red-check (a post-image run proves nothing about vacuity)`)
  process.exit(2)
}

// ---- resolve tests-layer File Plan rows (DELETE rows skipped, per ac-matrix) --------

const testsRowEntries = filePlanRows
  .filter(r => isTestsRow(r))
  .flatMap(r => {
    const isDelete = (r.action || '').trim().toLowerCase() === 'delete'
    return r.paths.map(p => ({ p, isDelete }))
  })

// Prunes through getIgnoredPaths; `prunedCounter` is a shared one-field object across the recursion.
function walkAll(dir, rootDir, out = [], ignored, prunedCounter) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git') continue
    const full = path.join(dir, e.name)
    const rel = path.relative(rootDir, full).split(path.sep).join('/')
    // Only regular files are pushed (a socket, FIFO or directory link would throw EISDIR at
    // readFileSync); a symlink is resolved with statSync, never descended. Every skip counts as
    // pruned so the zero-expansion warning stays truthful.
    if (e.isDirectory()) {
      if (ignored.has(`${rel}/`)) { prunedCounter.count++; continue }
      walkAll(full, rootDir, out, ignored, prunedCounter)
    } else if (e.isFile()) {
      if (ignored.has(rel)) { prunedCounter.count++; continue }
      out.push(rel)
    } else if (e.isSymbolicLink()) {
      let target
      try {
        target = fs.statSync(full)
      } catch {
        prunedCounter.count++
        continue
      }
      if (!target.isFile() || ignored.has(rel)) { prunedCounter.count++; continue }
      out.push(rel)
    }
  }
  return out
}

const warnings = []

const testFiles = new Set()
let allFilesCache = null
let prunedCount = 0
for (const { p, isDelete } of testsRowEntries) {
  if (isDelete) continue // D2: a DELETE row is satisfied by the file's planned absence
  // A row naming a directory (trailing `/`, or an existing dir) expands like `<dir>/**`: read as
  // one file it crashed the whole run on EISDIR.
  const isDirRow = p.endsWith('/') || (fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isDirectory())
  if (p.includes('*') || isDirRow) {
    if (allFilesCache === null) {
      const ignored = getIgnoredPaths(root)
      const prunedCounter = { count: 0 }
      allFilesCache = walkAll(root, root, [], ignored, prunedCounter)
      prunedCount = prunedCounter.count
    }
    const dirPrefix = p.endsWith('/') ? p : p + '/'
    const matches = allFilesCache.filter(f => isDirRow ? f.startsWith(dirPrefix) : globMatch(p, f))
    for (const f of matches) testFiles.add(f)
    // A wildcard row that resolves nothing pushes one warning with the pruned-path count.
    if (matches.length === 0) {
      warnings.push(`${p}: File Plan tests row expanded to 0 files (${prunedCount} ` +
        `path(s) pruned from the repo walk: git-ignored, or not a regular file)`)
    }
  } else {
    testFiles.add(p)
  }
}

// ---- per-AC sanctioning — `SHALL CONTINUE TO` in the bullet's normalized text, or a VALID
// `[pre-green:]` reason — plus the invalid-pre-green fail-closed classification -------------------
// normalizeForPinCheck strips inline code spans (a quoted marker is no declaration) and collapses
// whitespace (a hard-wrapped pin still reads as one phrase); the regex never runs on `b.raw`.

const preGreenValidity = new Map() // AC-ID -> 'valid' | 'invalid' (only set when tagged)
for (const b of wellFormed) {
  if (b.preGreen === null) continue
  preGreenValidity.set(b.id, PRE_GREEN_REASONS.includes(b.preGreen) ? 'valid' : 'invalid')
}

// A `rewrites` disposition is never sanctioned green, whatever else the bullet says: its per-test
// arm expects the rewritten case RED, and a green-expected file would be unpassable in both colours.
function isSanctioned(b) {
  const disposition = parseDisposition(b.raw)
  if (disposition && disposition.kind === 'rewrites') return false
  if (/SHALL CONTINUE TO/.test(normalizeForPinCheck(b.raw))) return true
  return preGreenValidity.get(b.id) === 'valid'
}

const sanctionedById = new Map(wellFormed.map(b => [b.id, isSanctioned(b)]))

// ---- `{testCommand} <file>` (+ `{typecheckCommand} <file>` when declared) — the exit code is the
// verdict; output is captured only for the executed-test count. NODE_TEST_CONTEXT is scrubbed so a
// nested `node --test` behaves as a fresh top-level runner. `relPath` is single-quoted via `quote`
// (a `$` in a route file name must not expand); maxBuffer lifts spawnSync's 1 MiB default.
const MAX_BUFFER = 16 * 1024 * 1024
function runLeg(cmd, relPath) {
  const res = hostRun.run(hostRun.withFiles(cmd, [relPath]), { cwd: root, encoding: 'utf8', stdio: 'pipe', maxBuffer: MAX_BUFFER })
  return { status: res.status === null ? 1 : res.status, output: (res.stdout || '') + (res.stderr || '') }
}

// capabilities.testCountPattern: absent or "none" means red-check reads exit codes only.
const countPattern = (config.capabilities && config.capabilities.testCountPattern) || null
const patternDeclared = !!countPattern && countPattern !== 'none'
if (!patternDeclared) {
  warnings.push('testCountPattern is not declared in the host config — red-check reads exit codes only ' +
    'and cannot see a run that executed no test')
}

const files = []
const findings = []

for (const relPath of [...testFiles].sort()) {
  const fullPath = path.join(root, relPath)

  // Existence probed BEFORE any execution — `node --test <missing-file>` exits 1,
  // which would fake a satisfied red expectation if the runner were invoked on it.
  if (!fs.existsSync(fullPath)) {
    findings.push({
      class: 'missing-test-file', path: relPath, acs: [],
      detail: `File Plan tests row ${relPath} does not exist under --root ${root}`,
    })
    continue
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  const carriedAcs = wellFormed.filter(b => acIdOccurs(content, b.id)).map(b => b.id)

  // Zero carried AC-IDs → unclassified, a warning, and NEVER executed.
  if (carriedAcs.length === 0) {
    files.push({ path: relPath, expected: 'unclassified', observed: 'absent', carriedAcs: [] })
    warnings.push(`${relPath}: carries zero AC-IDs — unclassified, never executed`)
    continue
  }

  // A mixed carried AC: exactly one hard finding naming every mixed AC-ID, no colour verdict; the
  // run still executes and is logged.
  const mixedAcs = carriedAcs.filter(id => pinShape(bulletById.get(id).raw) === 'mixed')
  if (mixedAcs.length) {
    findings.push({
      severity: 'hard', class: 'mixed-pin', path: relPath, acs: mixedAcs,
      detail: `${relPath}: ${mixedAcs.join(', ')} mixes a new promise with a SHALL CONTINUE TO pin ` +
        `— split the SHALL CONTINUE TO clause into its own AC, then re-run`,
    })
    const mixedRun = runLeg(config.testCommand, relPath)
    let observed = mixedRun.status === 0 ? 'green' : 'red'
    if (observed === 'green' && config.typecheckCommand) {
      observed = runLeg(config.typecheckCommand, relPath).status === 0 ? 'green' : 'red'
    }
    files.push({ path: relPath, expected: 'unclassified', observed, carriedAcs })
    continue
  }

  const invalidAcs = carriedAcs.filter(id => preGreenValidity.get(id) === 'invalid')
  if (invalidAcs.length) {
    const reasons = [...new Set(invalidAcs.map(id => bulletById.get(id).preGreen))]
    findings.push({
      class: 'invalid-pre-green', path: relPath, acs: invalidAcs,
      detail: `${relPath}: [pre-green: ${reasons.join(', ')}] for ${invalidAcs.join(', ')} is not one ` +
        `of the valid reasons (${PRE_GREEN_REASONS.join(', ')}) — stays red-expected (fail closed)`,
    })
  }

  const expected = carriedAcs.every(id => sanctionedById.get(id)) ? 'green' : 'red'

  // Exit 124 (the host's `timeout` watchdog) classifies as red but is surfaced by name so the build
  // driver can record the incident on its build row.
  const testRun = runLeg(config.testCommand, relPath)
  const testExit = testRun.status
  if (testExit === 124) warnings.push(`watchdog-trip ${relPath} (exit 124) — the test run was killed by the host timeout, not a failing assertion`)
  let observed = testExit === 0 ? 'green' : 'red'
  let testsExecuted
  if (observed === 'green' && patternDeclared) {
    testsExecuted = computeTestsExecuted(testRun.output, countPattern)
    if (isUnobserved(testsExecuted)) observed = 'unobserved'
  }
  if (observed === 'green' && config.typecheckCommand) {
    observed = runLeg(config.typecheckCommand, relPath).status === 0 ? 'green' : 'red'
  }

  if (expected === 'green' && observed === 'unobserved') {
    findings.push({
      severity: 'hard', class: 'vacuous-green', path: relPath, acs: carriedAcs,
      detail: `${relPath}: the runner exited ${testExit} but executed no test per its output ` +
        `(testCountPattern ${countPattern}) — the sanctioned-green file proved nothing`,
    })
  } else if (expected === 'green' && observed === 'red') {
    findings.push({
      class: 'broken-pin', path: relPath, acs: carriedAcs,
      detail: `${relPath}: sanctioned-green file failed its run`,
    })
  } else if (expected === 'red' && observed === 'green') {
    // a refused trailing [pre-green:] tag on a carried AC's bullet replaces unsanctioned-green
    // — the refusal is causally relevant (it would have been this file's only sanction).
    const rejectedAc = carriedAcs.find((id) => {
      const b = bulletById.get(id)
      return b && b.trailingRejected && b.trailingRejected.includes('[pre-green:')
    })
    // The file must MENTION the variable it claims to be gated on — a substring anchor, since
    // red-check cannot evaluate the host's skip predicate.
    const envGatedAcs = carriedAcs.filter((id) => {
      const b = bulletById.get(id)
      return !!(b && b.env && content.includes(b.env))
    })
    const ungatedAcs = carriedAcs.filter((id) => !envGatedAcs.includes(id))
    if (rejectedAc) {
      const b = bulletById.get(rejectedAc)
      findings.push({
        class: 'rejected-trailing-tag', path: relPath, acs: carriedAcs,
        detail: rejectedTrailingTagDetail(rejectedAc, b.trailingRejected, b.trailingRejectedCause,
          `${relPath} is a green expected-red file`),
      })
    } else if (envGatedAcs.length === carriedAcs.length && carriedAcs.length > 0) {
      // An `[env: VAR]` AC whose variable this process lacks makes the suite skip, so its redness is
      // unobservable here: a warning (parity with ac-matrix.js's skip sanction), not a hard finding.
      // `expected` stays red so a provisioned run's genuine red still matches. EVERY carried AC must
      // be env-tagged — an ungated sibling still owes a real red.
      warnings.push(`${relPath}: red-expected file passed against the pre-image, sanctioned by ` +
        `[env:] on ${envGatedAcs.map((id) => `${id} (${bulletById.get(id).env})`).join(', ')} — ` +
        `the suite skips when the variable is withheld, so redness is unobservable from this run`)
    } else {
      // The finding names only the ACs that owe a red; gated siblings are named as sanctioned.
      const owing = ungatedAcs.length ? ungatedAcs : carriedAcs
      const sanctionedNote = envGatedAcs.length
        ? ` — sanctioned by [env:] and not owing a red: ${envGatedAcs.map((id) => `${id} (${bulletById.get(id).env})`).join(', ')}`
        : ''
      findings.push({
        class: 'unsanctioned-green', path: relPath, acs: owing,
        detail: `${relPath}: red-expected file passed against the pre-image — carried ${owing.join(', ')}` +
          sanctionedNote,
      })
    }
  }

  const fileRow = { path: relPath, expected, observed, carriedAcs }
  if (testsExecuted !== undefined) fileRow.testsExecuted = testsExecuted
  files.push(fileRow)
}

// ---- per-test verification for rewrites/reuses dispositions — on top of the whole-file arms.

// The regex-escaped, anchored title substituted for the host config's `{name}` placeholder —
// `\ ^ $ . | ? * + ( ) [ ] { }` are the only characters escaped, per the Decision's own list.
function escapeTitleForRegex(title) {
  return title.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')
}

// `{testCommand} {testNameFilter←escaped ^title$} <file>` — output is captured because selection
// proof needs the run's own stdout (a pattern matching nothing still exits 0). The substituted
// filter/path fragments are single-quoted via `quote`, so a backtick or `$` in a title stays literal.
function runFilteredLeg(cmd, filterTemplate, title, relPath) {
  const pattern = `^${escapeTitleForRegex(title)}$`
  const filterArg = filterTemplate.replace('{name}', pattern)
  const res = hostRun.run(cmd.includes('{file}') ? hostRun.withFiles(cmd, [relPath]) + ' ' + quote(filterArg) : `${cmd} ${quote(filterArg)} ${quote(relPath)}`, { cwd: root, encoding: 'utf8', maxBuffer: MAX_BUFFER })
  return { code: res.status === null ? 1 : res.status, output: (res.stdout || '') + (res.stderr || '') }
}

const dispositions = []
const dispositionCandidates = []
for (const b of wellFormed) {
  const disposition = parseDisposition(b.raw)
  if (disposition && (disposition.kind === 'rewrites' || disposition.kind === 'reuses')) {
    dispositionCandidates.push({ b, disposition })
  }
}

if (dispositionCandidates.length) {
  if (!config.testNameFilter) {
    // absent testNameFilter degrades every rewrites/reuses AC to today's whole-file
    // behaviour, ONE warning naming the key (never one per AC), and spawns no per-test run at all.
    warnings.push(`testNameFilter is not declared in the host config — no per-test verification ` +
      `runs for any rewrites/reuses disposition (${dispositionCandidates.length} declared here); ` +
      `every file keeps its whole-file classification`)
  } else {
    for (const { b, disposition } of dispositionCandidates) {
      const expected = disposition.kind === 'rewrites' ? 'red' : 'green'
      let src = null
      try { src = fs.readFileSync(path.join(root, disposition.file), 'utf8') } catch { src = null }
      const matches = src === null ? [] : scanCases(root, config, disposition.file, src).filter(c => c.title.startsWith(disposition.prefix))
      // not resolvable to exactly one pre-image test — fall back to the file's whole-file
      // colour, WARN naming the file/prefix/cause, never a finding on this path alone.
      if (matches.length !== 1) {
        warnings.push(`${b.id}: ${disposition.kind} reference "${disposition.file} :: ` +
          `${disposition.prefix}" is unresolved (${matches.length} matches) — falling back to ` +
          `${disposition.file}'s whole-file colour (cause: unresolved)`)
        dispositions.push({
          ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix,
          expected, observed: null, fallback: 'unresolved',
        })
        continue
      }
      const title = matches[0].title
      const { code, output } = runFilteredLeg(config.testCommand, config.testNameFilter, title, disposition.file)
      // selection proof — the run's OWN OUTPUT must name the selected title; a pattern
      // matching nothing still exits 0, so the exit code alone proves nothing.
      if (!output.includes(title)) {
        warnings.push(`${b.id}: ${disposition.kind} reference "${disposition.file} :: ${title}" ` +
          `was not selected by the filtered run's own output — falling back to ` +
          `${disposition.file}'s whole-file colour (cause: unselected)`)
        dispositions.push({
          ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix,
          expected, observed: null, fallback: 'unselected',
        })
        continue
      }
      const observed = code === 0 ? 'green' : 'red'
      dispositions.push({ ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix, expected, observed })
      if (disposition.kind === 'rewrites' && observed === 'green') {
        findings.push({
          class: 'gutted-rewrite', path: disposition.file, acs: [b.id],
          detail: `${b.id}: rewrites reference "${disposition.file} :: ${title}" already passes ` +
            `against the pre-image — a gutted rewrite (a failing sibling case never satisfies it)`,
        })
      } else if (disposition.kind === 'reuses' && observed === 'red') {
        findings.push({
          class: 'broken-reuse', path: disposition.file, acs: [b.id],
          detail: `${b.id}: reuses reference "${disposition.file} :: ${title}" fails against the ` +
            `pre-image — a broken reuse`,
        })
      }
    }
  }
}

// ---- output -------------------------------------------------------------------------------------
const { writeOut: writeAll } = require('./lib/sync-write')
// Local to this script: process.exitCode is set instead of calling process.exit(), so Node drains
// stdout naturally before exiting.


if (jsonOut) {
  writeAll(1, Buffer.from(JSON.stringify({ files, findings, warnings, dispositions }, null, 2) + '\n'))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.path}  ${f.detail}`)
  for (const w of warnings) console.log(`WARN  ${w}`)
  console.log(`red-check: ${files.length} file(s) classified · ${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exitCode = findings.length ? 1 : 0
