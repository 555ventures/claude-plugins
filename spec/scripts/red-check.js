#!/usr/bin/env node
'use strict'
// red-check.js --spec <path> --root <dir> --base <sha-or-ref> [--expect-green <path>]... [--json]
//
// specs/20260821/01-red-check.md: build.md Phase 0 step 2 (classify every
// tests-layer file's expected pre-image colour) and Phase 1's red-check paragraph (execute each
// file, reconcile observed against expected) were hand-run from prose every build — a leg that
// drifts per session and per model. Worse, the recurring failure class this reconciliation exists
// to catch — an AC that structurally cannot go red before implementation (a pre-existing generic
// fallback already rejects it, an absence invariant an inert stub already satisfies, a predicate
// that IS the deliverable inside a test file) — lived only in a thrice-amended Gotchas paragraph
// in .claude/rules/spec-pipeline.md, all 16 recorded instances benign. This script IS the
// reconciliation: it derives each tests-layer File Plan file's expected colour from the spec's AC
// vocabulary (a `SHALL CONTINUE TO` pin, or a closed-enum `[pre-green: <reason>]` tag — the tag
// grammar/enum live in lib/spec-sections.js, the single authority, D1), executes `{testCommand}`
// (+ `{typecheckCommand}` when declared) once per file against the untouched pre-image, and
// reports every mismatch as a named finding. build.md's classification prose and red-check
// paragraph shrink to this invocation line.
//
// What this deliberately does NOT do: parse or attribute runner OUTPUT (exit codes only — a
// crash-red vs assert-red distinction stays orchestrator judgment, per build.md's disposition
// rules); render a review report or compute a verdict (this is a build-Phase-1 gate, never a
// review leg); snapshot or restore the tree (the working tree AT INVOCATION TIME is the
// pre-image — the purity refusal below exists precisely because no snapshot is taken); validate
// `[pre-green:]` reasons anywhere but here and in ac-matrix.js (lib/spec-sections.js's
// `parseAcBullets` returns the raw tag unvalidated by design, D1); or expand a File Plan glob
// through any matcher but the shared lib/glob-match.js.
//
// Exit codes: 0 = every resolved tests-layer file matches its expected pre-image colour ·
//             1 = findings emitted (unsanctioned-green | broken-pin | missing-test-file |
//                 invalid-pre-green | rejected-trailing-tag) — rides the normal build Phase 1
//                 disposition flow, never a script failure · 2 = usage error, unreadable --spec,
//                 no ## Acceptance Criteria section, host config declares no testCommand, or a
//                 pre-image purity refusal (a non-tests File Plan path already differs from
//                 --base — tracked or untracked)
//
// specs/20260821/03-cross-spec-skip-mapping.md D7: the carried-AC
// classifier below (content.includes(b.id)) was a bare substring test — a tests-layer file
// citing only a longer AC-ID that shares a shorter red-expected AC's prefix (AC-...-12 sharing
// AC-...-1's prefix) phantom-carried the shorter id in too, forcing a false red expectation onto
// a file that never mentions it (observed: a false unsanctioned-green, the live hit that stopped
// specs/20260822/02's build). Fixed by replacing the bare .includes with
// lib/spec-sections.js's exported acIdOccurs, a full-token occurrence check — the same authority
// ac-matrix.js's coverage grep also uses.
//
// specs/20260823/03-silent-drop-hardening.md D1 (the
// silent-drop incident): a carried AC's `[pre-green:]` tag, when it ends the bullet backticked,
// is refused as a declaration by lib/spec-sections.js's bare-only trailing rule (rv_640c582f4902)
// — that refusal otherwise misreports as a plain `unsanctioned-green` with no hint the refusal is
// the actual cause. Loud-when-it-bites, never unconditional: when a red-expected file is observed
// green AND a carried AC's bullet has a refused trailing tag naming `[pre-green:`, the new hard
// finding `rejected-trailing-tag` REPLACES `unsanctioned-green` for that file — never both. A
// carried AC whose refused tag never changes the file's expected colour (e.g. the AC is already
// sanctioned another way) stays silent.

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { readConfig } = require('./lib/host-config')
const {
  extractSection, parseAcBullets, PRE_GREEN_REASONS, acIdOccurs, rejectedTrailingTagDetail,
} = require('./lib/spec-sections')

function usage() {
  console.error('usage: red-check.js --spec <path> --root <dir> --base <sha-or-ref> ' +
    '[--expect-green <path>]... [--json]')
}

let specPath = null, root = null, base = null, jsonOut = false
const expectGreenPaths = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--expect-green') expectGreenPaths.push(argv[++i])
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

// D10 (specs/20260823/03-silent-drop-hardening.md): `rejectedTrailingTagDetail` — the `rejected-trailing-tag`
// remedy-text builder — is imported from lib/spec-sections.js, the one authority, rather than
// defined here. The first implementation landed a byte-identical local copy in both this file and
// ac-matrix.js — the exact two-identical-copies shape D4 (this spec) exists to eliminate. See
// that module's own comment above the function for why it lives beside the refusal predicate (D2)
// it explains; message bytes are unchanged (pinned by the AC-20260823-03-3 detail assertions).

const filePlanRows = parseFilePlanRows(specText)

// ---- D5: host config read ONLY through lib/host-config.js readConfig (name-ban) --------

const config = readConfig(root)
if (!config.testCommand) {
  console.error('red-check: host config declares no "testCommand" — add it to the host config, ' +
    'or run /spec:init to regenerate the grounding layer')
  process.exit(2)
}

// ---- D4: pre-image purity refusal — BEFORE any test file is resolved or executed ----------------
// Derived as the union of `git diff --name-only <base>` (tracked edits; A2: blind to untracked
// paths) and untracked paths from `git status --porcelain --untracked-files=all` (A2's fix for
// that blindness), intersected with the File Plan's NON-tests paths. Tests-layer paths are always
// exempt — the tests themselves are expected to differ from --base; that is what red-check exists
// to reconcile.

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
  .filter(r => (r.layer || '').trim().toLowerCase() !== 'tests')
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

// ---- D2/D3: resolve tests-layer File Plan rows (DELETE rows skipped, per ac-matrix D13) --------

const testsRowEntries = filePlanRows
  .filter(r => (r.layer || '').trim().toLowerCase() === 'tests')
  .flatMap(r => {
    const isDelete = (r.action || '').trim().toLowerCase() === 'delete'
    return r.paths.map(p => ({ p, isDelete }))
  })

function walkAll(dir, rootDir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(full, rootDir, out)
    else out.push(path.relative(rootDir, full).split(path.sep).join('/'))
  }
  return out
}

const testFiles = new Set()
let allFilesCache = null
for (const { p, isDelete } of testsRowEntries) {
  if (isDelete) continue // D2: a DELETE row is satisfied by the file's planned absence
  if (p.includes('*')) {
    if (allFilesCache === null) allFilesCache = walkAll(root, root)
    for (const f of allFilesCache) if (globMatch(p, f)) testFiles.add(f)
  } else {
    testFiles.add(p)
  }
}

// ---- D1: per-AC sanctioning — `SHALL CONTINUE TO` in the bullet's raw text, or a VALID
// `[pre-green:]` reason (validated here against PRE_GREEN_REASONS; the parser itself does no
// enum validation, D1) — plus the invalid-pre-green fail-closed classification -------------------
//
// Hardened (escape rv_640c582f4902, unanchored-marker-match — the same defect class
// the review just fixed for [oracle:]/[env:]/[pre-green:], left in place for this sibling
// marker): a literal `SHALL CONTINUE TO` search over the bullet's whole raw text fails OPEN in
// both directions. A quoted mention inside a backticked code span (an AC discussing the marker,
// not declaring one — specs/20260821/01-red-check.md AC-20260821-01-4) self-sanctions with no
// real pin. Conversely a genuine pin hard-wrapped mid-phrase across a continuation line
// (`…AND SHALL\n  CONTINUE TO require…` — specs/20260810/02-terminal-observable-acs.md
// AC-20260810-02-4, the Gotchas' recorded hard-wrap-blindness hazard) can miss the literal regex
// entirely and only "pass" by accident when the bullet ALSO happens to quote the phrase
// elsewhere. `normalizeForPinCheck` fixes both at once: inline code spans are stripped first (a
// quoted marker is never a declaration), then whitespace runs — including the newline a
// hard-wrap introduces — collapse to a single space (a wrapped genuine pin still reads as one
// phrase). The regex then runs on that normalized text, never on `b.raw` directly.

function normalizeForPinCheck(raw) {
  return raw.replace(/`[^`]*`/g, ' ').replace(/\s+/g, ' ').trim()
}

const preGreenValidity = new Map() // AC-ID -> 'valid' | 'invalid' (only set when tagged)
for (const b of wellFormed) {
  if (b.preGreen === null) continue
  preGreenValidity.set(b.id, PRE_GREEN_REASONS.includes(b.preGreen) ? 'valid' : 'invalid')
}

function isSanctioned(b) {
  if (/SHALL CONTINUE TO/.test(normalizeForPinCheck(b.raw))) return true
  return preGreenValidity.get(b.id) === 'valid'
}

const sanctionedById = new Map(wellFormed.map(b => [b.id, isSanctioned(b)]))

// ---- D2: `{testCommand} <file>` (+ `{typecheckCommand} <file>` when declared) — exit codes only,
// runner output is never parsed. NODE_TEST_CONTEXT is scrubbed so a nested `node --test` leg
// behaves as a fresh top-level runner even when red-check.js itself runs inside one.

function runLeg(cmd, relPath) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const res = spawnSync('bash', ['-c', `${cmd} ${JSON.stringify(relPath)}`], { cwd: root, env, stdio: 'ignore' })
  return res.status === null ? 1 : res.status
}

const expectGreenSet = new Set(expectGreenPaths)

const files = []
const findings = []
const warnings = []

for (const relPath of [...testFiles].sort()) {
  const fullPath = path.join(root, relPath)

  // D3/Spike A: existence probed BEFORE any execution — `node --test <missing-file>` exits 1,
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

  // D3: zero carried AC-IDs → unclassified, a warning, and NEVER executed.
  if (carriedAcs.length === 0) {
    files.push({ path: relPath, expected: 'unclassified', observed: 'absent', carriedAcs: [] })
    warnings.push(`${relPath}: carries zero AC-IDs — unclassified, never executed`)
    continue
  }

  const invalidAcs = carriedAcs.filter(id => preGreenValidity.get(id) === 'invalid')
  if (invalidAcs.length) {
    findings.push({
      class: 'invalid-pre-green', path: relPath, acs: invalidAcs,
      detail: `${relPath}: [pre-green:] reason outside PRE_GREEN_REASONS for ${invalidAcs.join(', ')} ` +
        `— stays red-expected (fail closed)`,
    })
  }

  let expected
  if (expectGreenSet.has(relPath)) {
    expected = 'green'
    warnings.push(`--expect-green ${relPath}: flipped to green-expected (orchestrator-derived sanction)`)
  } else {
    expected = carriedAcs.every(id => sanctionedById.get(id)) ? 'green' : 'red'
  }

  let observed = runLeg(config.testCommand, relPath) === 0 ? 'green' : 'red'
  if (observed === 'green' && config.typecheckCommand) {
    observed = runLeg(config.typecheckCommand, relPath) === 0 ? 'green' : 'red'
  }

  if (expected === 'green' && observed === 'red') {
    findings.push({
      class: 'broken-pin', path: relPath, acs: carriedAcs,
      detail: `${relPath}: sanctioned-green file failed its run`,
    })
  } else if (expected === 'red' && observed === 'green') {
    // D1: a refused trailing [pre-green:] tag on a carried AC's bullet replaces unsanctioned-green
    // — the refusal is causally relevant (it would have been this file's only sanction).
    const rejectedAc = carriedAcs.find((id) => {
      const b = bulletById.get(id)
      return b && b.trailingRejected && b.trailingRejected.includes('[pre-green:')
    })
    if (rejectedAc) {
      const b = bulletById.get(rejectedAc)
      findings.push({
        class: 'rejected-trailing-tag', path: relPath, acs: carriedAcs,
        detail: rejectedTrailingTagDetail(rejectedAc, b.trailingRejected, b.trailingRejectedCause,
          `${relPath} is a green expected-red file`),
      })
    } else {
      findings.push({
        class: 'unsanctioned-green', path: relPath, acs: carriedAcs,
        detail: `${relPath}: red-expected file passed against the pre-image — carried ${carriedAcs.join(', ')}`,
      })
    }
  }

  files.push({ path: relPath, expected, observed, carriedAcs })
}

// ---- output -------------------------------------------------------------------------------------
// fs.writeSync(fd, …), looped to absorb a partial write, rather than process.stdout.write()
// followed by process.exit(): stdout.write is async when stdout is a pipe, and process.exit cuts
// the internal buffer before it drains, silently truncating at 64KB while reporting exit 0
// (spec-pipeline.md [host] gotcha). process.exitCode is set instead of calling process.exit(), so
// Node drains stdout naturally before exiting.

function writeAll(fd, buf) {
  let written = 0
  while (written < buf.length) written += fs.writeSync(fd, buf, written)
}

if (jsonOut) {
  writeAll(1, Buffer.from(JSON.stringify({ files, findings, warnings }, null, 2) + '\n'))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.path}  ${f.detail}`)
  for (const w of warnings) console.log(`WARN  ${w}`)
  console.log(`red-check: ${files.length} file(s) classified · ${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exitCode = findings.length ? 1 : 0
