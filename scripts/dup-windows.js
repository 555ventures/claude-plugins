#!/usr/bin/env node
'use strict'
// dup-windows.js --root <dir> [--baseline <file>] [--json] [--window N]
// dup-windows.js --root <dir> --update
// dup-windows.js --root <dir> --raise <path> --to <n> --cite <spec path>
//
// Keeps dup-baseline.json (repo root) a TIGHT ceiling on copy-paste: 8 consecutive
// non-blank normalized lines repeated anywhere across the tracked `.js` files under
// spec/scripts, scripts, and tests. Owner: specs/20260908/04-duplicate-window-ratchet.md
// D1-D6 (AC-20260908-04-1..7); the live standing pin is
// tests/consistency/dup-windows-live.test.js (AC-20260908-04-7).
//
// Inventory is `git ls-files` over the three roots (D1) — never an fs walk. A line is
// normalized by stripping a trailing `//…` comment and collapsing whitespace; a window
// spanning any empty normalized line is skipped. A window's identity is the SHA-1 of its
// eight normalized lines; it is a duplicate when that hash occurs at more than one
// (file, offset). A file with zero duplicate windows needs no baseline entry (D2).
//
// Deliberately does NOT: token/AST-level clone detection (a renamed variable defeats the
// hash on purpose — this is copy-paste detection, not clone detection), write the baseline
// except via --update/--raise, allow --update against an EXISTING baseline to lift an
// `over`/`new-dup` finding (only --raise --cite can raise a ceiling), or accept a free-form
// raise reason.
//
// Seed carve-out (D2/D3 incorporate the size ratchet's own model by reference — see
// scripts/size-ratchet.js's D8/D13 comment): when no baseline file exists yet, --update is
// the SEEDING command, not the check — every tracked file's actual score is written as-is
// and `new-dup` cannot refuse it, because "new" means absent from an EXISTING baseline and
// there is no existing baseline to be absent from. `over`/`stale` are structurally
// impossible against an empty baseline either way. Once a baseline file exists, --update
// reverts to the tighten-only refusal below.
//
// Exit codes: 0 tight & clean (check), refusal-free write (update against an existing
//               baseline / raise), or a from-scratch seed write (update with no baseline
//               file present) ·
//             1 findings (check) or refused (update against an existing baseline: any file
//               over or new-dup) ·
//             2 bad invocation (missing --root, unreadable/malformed baseline, --update and
//               --raise combined, --json with --update/--raise, --raise without --to/--cite,
//               non-integer --to, bad/missing/nonexistent --cite, unknown flag)
//
// D9: the synchronous fd writer is imported from spec/scripts/lib/driver-io.js rather than
// carried locally, so this script and scripts/size-ratchet.js stop duplicating it.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const io = require(path.join(__dirname, '..', 'spec', 'scripts', 'lib', 'driver-io.js'))

const TREES = ['spec/scripts', 'scripts', 'tests']
const CITE_RE = /^specs\/\d{8}\/\d{2}-/
const DEFAULT_WINDOW = 8

function writeOut(str) { io.writeOut(1, str) }
function writeErr(str) { io.writeOut(2, str) }

function fail(msg) {
  writeErr('dup-windows: ' + msg + '\n')
  process.exit(2)
}

function parseArgs(argv) {
  const args = { root: null, baseline: null, json: false, window: null, update: false, raise: null, to: null, cite: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--root': args.root = argv[++i]; break
      case '--baseline': args.baseline = argv[++i]; break
      case '--json': args.json = true; break
      case '--window': args.window = argv[++i]; break
      case '--update': args.update = true; break
      case '--raise': args.raise = argv[++i]; break
      case '--to': args.to = argv[++i]; break
      case '--cite': args.cite = argv[++i]; break
      default: fail('unknown flag ' + a + ' — usage: dup-windows.js --root <dir> [--baseline <file>] [--json] [--window N] | --update | --raise <path> --to <n> --cite <spec path>')
    }
  }
  if (!args.root) fail('missing --root — usage: dup-windows.js --root <dir> [--baseline <file>] [--json] [--window N]')
  if (args.update && args.raise !== null) fail('--update and --raise are mutually exclusive')
  if ((args.update || args.raise !== null) && args.json) fail('--json is not compatible with --update or --raise')
  if (args.raise === null && (args.to !== null || args.cite !== null)) {
    fail('--to/--cite require --raise — usage: dup-windows.js --root <dir> --raise <path> --to <n> --cite <spec path>')
  }
  if (args.window !== null) {
    const w = Number(args.window)
    if (!Number.isFinite(w) || !Number.isInteger(w) || w < 1) fail('--window must be a positive integer, got ' + args.window)
    args.window = w
  }
  return args
}

function validateCiteShapeAndExistence(root, cite) {
  if (!CITE_RE.test(cite)) fail('--cite must match ^specs/\\d{8}/\\d{2}- , got ' + cite)
  if (!fs.existsSync(path.join(root, cite))) fail('--cite names a file that does not exist: ' + cite)
}

function treeFor(rel) {
  for (const t of TREES) {
    if (rel === t || rel.startsWith(t + '/')) return t
  }
  return null
}

function listTrackedJs(root) {
  let out
  try {
    out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', 'spec/scripts', 'scripts', 'tests'],
      { encoding: 'utf8' })
  } catch (e) {
    fail('git ls-files failed under --root ' + root + ' — is it a git repo? (' + (e.message || e) + ')')
  }
  return out.split('\0').filter((rel) => rel.endsWith('.js') && treeFor(rel) !== null)
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readBaseline(baselinePath) {
  let raw
  try {
    raw = fs.readFileSync(baselinePath, 'utf8')
  } catch (e) {
    fail('cannot read baseline ' + baselinePath + ' — seed it with: node scripts/dup-windows.js --root <dir> --update (' + (e.message || e) + ')')
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    fail('baseline ' + baselinePath + ' is not valid JSON — ' + (e.message || e))
  }
  if (!isPlainObject(parsed)) fail('baseline ' + baselinePath + ' must be a JSON object')
  if (typeof parsed.window !== 'number') {
    fail('baseline ' + baselinePath + ' is missing a numeric window — seed it with: node scripts/dup-windows.js --root <dir> --update')
  }
  if (!isPlainObject(parsed.files)) {
    fail('baseline ' + baselinePath + ' is missing a files object — seed it with: node scripts/dup-windows.js --root <dir> --update')
  }
  return parsed
}

function writeBaseline(baselinePath, baseline) {
  const sorted = {
    window: baseline.window,
    files: sortKeys(baseline.files || {}),
    raises: baseline.raises || []
  }
  fs.writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + '\n')
}

function sortKeys(obj) {
  const out = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out
}

function normalizeLine(line) {
  return line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim()
}

function readNormalizedLines(root, rel) {
  const raw = fs.readFileSync(path.join(root, rel), 'utf8')
  const lines = raw.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.map(normalizeLine)
}

// Slides an 8-line (default) window one line at a time over every tracked file, skipping any
// window that spans an empty normalized line, and groups (file, offset) occurrences by the
// SHA-1 of their joined normalized text — the duplicate-window inventory the rest of the
// script scores against.
function buildWindows(root, files, window) {
  const byHash = new Map()
  for (const rel of files) {
    const lines = readNormalizedLines(root, rel)
    for (let offset = 0; offset + window <= lines.length; offset++) {
      const slice = lines.slice(offset, offset + window)
      if (slice.some((l) => l === '')) continue
      const hash = crypto.createHash('sha1').update(slice.join('\n')).digest('hex')
      let arr = byHash.get(hash)
      if (!arr) { arr = []; byHash.set(hash, arr) }
      arr.push({ file: rel, offset })
    }
  }
  return byHash
}

// A file's score is its count of duplicate-window occurrences (D1) — every occurrence in a
// hash group of size >= 2 counts toward its own file, so a file repeating one block twice
// scores 2, not 1.
function scoreFiles(byHash) {
  const scores = {}
  const dupOccurrencesByFile = {}
  for (const [hash, arr] of byHash) {
    if (arr.length < 2) continue
    for (const occ of arr) {
      scores[occ.file] = (scores[occ.file] || 0) + 1
      if (!dupOccurrencesByFile[occ.file]) dupOccurrencesByFile[occ.file] = []
      dupOccurrencesByFile[occ.file].push({ offset: occ.offset, hash })
    }
  }
  for (const f of Object.keys(dupOccurrencesByFile)) {
    dupOccurrencesByFile[f].sort((a, b) => a.offset - b.offset)
  }
  return { scores, dupOccurrencesByFile }
}

// D4: the text finding names the duplicate's first partner. "First" means the file's
// lowest-offset duplicate window, and its partner is the next occurrence in that window's
// hash group under a stable (file, offset) order, excluding itself.
function findPartner(file, dupOccurrencesByFile, byHash) {
  const occs = dupOccurrencesByFile[file]
  if (!occs || occs.length === 0) return null
  const first = occs[0]
  const group = (byHash.get(first.hash) || []).slice().sort((a, b) =>
    a.file === b.file ? a.offset - b.offset : (a.file < b.file ? -1 : 1))
  const partner = group.find((o) => !(o.file === file && o.offset === first.offset))
  if (!partner) return null
  return { selfLine: first.offset + 1, partnerFile: partner.file, partnerLine: partner.offset + 1 }
}

// Compute findings against a live tracked inventory. Never mutates.
function evaluate(root, baseline, windowOverride) {
  const window = windowOverride != null ? windowOverride : baseline.window
  const tracked = listTrackedJs(root)
  const byHash = buildWindows(root, tracked, window)
  const { scores, dupOccurrencesByFile } = scoreFiles(byHash)
  const trackedSet = new Set(tracked)
  const files = baseline.files || {}

  const findings = []
  for (const rel of Object.keys(files)) {
    const ceiling = files[rel]
    if (!trackedSet.has(rel)) {
      findings.push({ kind: 'stale', path: rel, actual: 0, ceiling })
      continue
    }
    const actual = scores[rel] || 0
    if (actual > ceiling) findings.push({ kind: 'over', path: rel, actual, ceiling })
    else if (actual < ceiling) findings.push({ kind: 'stale', path: rel, actual, ceiling })
  }
  for (const rel of Object.keys(scores)) {
    if (Object.prototype.hasOwnProperty.call(files, rel)) continue
    const actual = scores[rel]
    if (actual > 0) findings.push({ kind: 'new-dup', path: rel, actual, ceiling: 0 })
  }

  return { window, tracked, scores, dupOccurrencesByFile, byHash, findings }
}

function remedyFor(finding) {
  if (finding.kind === 'stale') return '--update'
  return '--raise ' + finding.path + ' --to ' + finding.actual + ' --cite <spec>'
}

function printFindingLine(finding, ctx) {
  const remedyCmd = 'node scripts/dup-windows.js --root . ' + remedyFor(finding)
  let line
  switch (finding.kind) {
    case 'over':
      line = 'dup-windows: over    ' + finding.path + ' ' + finding.actual + ' > ' + finding.ceiling +
        ' — shrink the duplication, or: ' + remedyCmd
      break
    case 'stale':
      line = 'dup-windows: stale   ' + finding.path + ' ' + finding.actual + ' < ' + finding.ceiling +
        ' — run: ' + remedyCmd
      break
    case 'new-dup':
      line = 'dup-windows: new-dup ' + finding.path + ' ' + finding.actual + ' > ' + finding.ceiling +
        ' — extract the shared block, or: ' + remedyCmd
      break
    default:
      line = 'dup-windows: ' + finding.kind + ' ' + finding.path
  }
  const partner = findPartner(finding.path, ctx.dupOccurrencesByFile, ctx.byHash)
  if (partner) {
    line += ' — ' + finding.path + ':' + partner.selfLine + ' ≡ ' + partner.partnerFile + ':' + partner.partnerLine
  }
  writeErr(line + '\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args.root)
  const baselinePath = args.baseline ? path.resolve(args.baseline) : path.join(root, 'dup-baseline.json')

  // --update is the seeding command: an absent baseline under --update is the empty starting
  // point it fills in, not the unreadable-baseline usage error (reserved for check/--raise and
  // for a baseline file that exists but is malformed).
  if (args.update && !fs.existsSync(baselinePath)) {
    return doUpdate(root, baselinePath, { window: args.window != null ? args.window : DEFAULT_WINDOW, files: {}, raises: [] }, args, true)
  }

  const baseline = readBaseline(baselinePath)

  if (args.raise !== null) return doRaise(root, baselinePath, baseline, args)
  if (args.update) return doUpdate(root, baselinePath, baseline, args)
  return doCheck(root, baseline, args)
}

function doCheck(root, baseline, args) {
  const ctx = evaluate(root, baseline, args.window)
  if (ctx.findings.length === 0) {
    if (args.json) {
      writeOut(JSON.stringify({ ok: true, window: ctx.window, findings: [] }) + '\n')
    } else {
      writeOut('dup-windows: ' + Object.keys(baseline.files || {}).length + ' files with debt, all tight\n')
    }
    process.exit(0)
  }
  if (args.json) {
    writeOut(JSON.stringify({ ok: false, window: ctx.window, findings: ctx.findings }) + '\n')
  } else {
    for (const f of ctx.findings) printFindingLine(f, ctx)
  }
  process.exit(1)
}

function doUpdate(root, baselinePath, baseline, args, isSeed) {
  const ctx = evaluate(root, baseline, args && args.window)
  // A from-scratch seed (no baseline file present) has no existing entries to be `over` or
  // `stale` against, and its unrecorded-but-scoring files are exactly what it is seeding —
  // `new-dup` only means something once a baseline exists to be new against, so it is
  // excluded here rather than left to fall out of an empty baseline by construction alone.
  const blocking = ctx.findings.filter((f) =>
    f.kind === 'over' || (!isSeed && f.kind === 'new-dup'))
  if (blocking.length > 0) {
    for (const f of blocking) printFindingLine(f, ctx)
    writeErr('dup-windows: --update refused — shrink the above first, or --raise --cite a spec\n')
    process.exit(1)
  }

  const newFiles = {}
  for (const rel of Object.keys(ctx.scores)) {
    if (ctx.scores[rel] > 0) newFiles[rel] = ctx.scores[rel]
  }

  const updated = { window: ctx.window, files: newFiles, raises: baseline.raises || [] }
  writeBaseline(baselinePath, updated)
  process.exit(0)
}

function doRaise(root, baselinePath, baseline, args) {
  if (args.to === null) fail('--raise requires --to <n>')
  if (args.cite === null) fail('--raise requires --cite <spec path>')
  const toNum = Number(args.to)
  if (!Number.isFinite(toNum) || !Number.isInteger(toNum) || toNum < 0) {
    fail('--to must be a non-negative integer, got ' + args.to)
  }
  validateCiteShapeAndExistence(root, args.cite)

  const target = args.raise
  const files = baseline.files || {}
  const from = Object.prototype.hasOwnProperty.call(files, target) ? files[target] : 0
  files[target] = toNum

  const raises = (baseline.raises || []).slice()
  raises.push({ path: target, from, to: toNum, cite: args.cite })

  const updated = { window: baseline.window, files, raises }
  writeBaseline(baselinePath, updated)
  process.exit(0)
}

main()
