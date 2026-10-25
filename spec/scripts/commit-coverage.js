#!/usr/bin/env node
'use strict'
// commit-coverage.js --commit <sha> [--root <dir>] [--json] — one commit's landing/offer
// answer: which touched files a reviewed spec landed, and whether /git:commit step 3 offers
// the fix row.
// Owner: specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D5
//
// A file is LANDED for a reference commit iff a spec's `## File Plan` (lib/file-plan) lists it
// (exact path or glob, lib/glob-match) AND that spec's repo ledger (lib/observation) holds a
// stage:"review" row whose ts parses to an epoch strictly before the reference commit's
// committer epoch; the file is IN-FLIGHT when a listing spec exists but none qualifies yet.
// Fix-shaped = the subject's conventional type token is fix/hotfix only — never a broader
// substring match.
//
// What this deliberately does NOT do: block a commit, record a decline, mutate anything on
// disk, or measure a share over a window or the fleet (the commit writes its own escape row,
// so that share is 1 by construction).
//
// Exit codes: 0 = derived (a missing ledger and offer:false are derived answers, never errors)
//             2 = usage error (no --commit, unknown flag, missing flag value); --since or
//                 --repos-root given (remedy names --commit); --root not a git repository
//                 (remedy names --root <repo dir>); an unresolvable --commit sha (remedy
//                 names the sha and `git log --oneline -5`)

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { parseFilePlan } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { readLedgerRows } = require('./lib/observation')
const { writeOut } = require('./lib/driver-io')

const USAGE = 'Usage: node commit-coverage.js --commit <sha> [--root <dir>] [--json]'

function die(message) {
  process.stderr.write('commit-coverage: ' + message + '\n')
  process.stderr.write(USAGE + '\n')
  process.exit(2)
}

// ---- arg parsing (hand-rolled) ---------------------------------------------------------------

let commitArg = null
let rootArg = null
let json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--since' || a === '--repos-root') {
    die(a + ' is not accepted — only --commit remains: the window and fleet shares retired with specs/20261025/02; pass --commit <sha>')
  } else if (a === '--commit' || a === '--root') {
    if (i + 1 >= argv.length) die(a + ' needs a value')
    const v = argv[++i]
    if (a === '--commit') commitArg = v
    else rootArg = v
  } else if (a === '--json') {
    json = true
  } else {
    die('unknown flag ' + a)
  }
}

if (commitArg === null) die('--commit is required — pass --commit <sha>')

// ---- shared derivation --------------------------------------------------------------------

const FIX_SHAPED_RE = /^(fix|hotfix)(\([^)]*\))?!?:/i
function isFixShaped(subject) { return FIX_SHAPED_RE.test(subject) }

function ledgerExists(root) {
  const dir = path.join(root, '.claude')
  if (!fs.existsSync(dir)) return false
  let names
  try { names = fs.readdirSync(dir) } catch { return false }
  return names.some(n => /^spec-runs.*\.jsonl$/.test(n))
}

// Every `*.md` under <root>/specs, recursively — {specPath (repo-relative, posix), filePlanPaths}.
function loadSpecIndex(root) {
  const specsDir = path.join(root, 'specs')
  let entries
  try {
    entries = fs.readdirSync(specsDir, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    const parentPath = e.parentPath !== undefined ? e.parentPath : e.path
    const fullPath = path.join(parentPath, e.name)
    let text
    try { text = fs.readFileSync(fullPath, 'utf8') } catch { continue }
    const relPath = path.relative(root, fullPath).split(path.sep).join('/')
    out.push({ specPath: relPath, filePlanPaths: parseFilePlan(text) })
  }
  return out
}

// landed/inFlight/none for one touched file against one reference epoch.
function classifyFile(file, refEpoch, specIndex, ledgerRows) {
  const listing = specIndex.filter(s => s.filePlanPaths.some(p => globMatch(p, file)))
  if (!listing.length) return { status: 'none' }
  const qualified = []
  for (const s of listing) {
    let best = null
    let bestEpoch = -Infinity
    for (const r of ledgerRows) {
      if (r.stage !== 'review' || r.spec !== s.specPath || typeof r.ts !== 'string') continue
      const e = Date.parse(r.ts)
      if (Number.isNaN(e) || !(e < refEpoch)) continue
      if (e > bestEpoch) { bestEpoch = e; best = r }
    }
    if (best) qualified.push({ spec: s.specPath, epoch: bestEpoch, row: best })
  }
  if (qualified.length) {
    qualified.sort((a, b) => b.epoch - a.epoch || a.spec.localeCompare(b.spec))
    return {
      status: 'landed',
      specs: qualified.map(q => ({
        spec: q.spec, reviewTs: q.row.ts,
        reviewRunId: q.row.runId !== undefined ? q.row.runId : null,
        verdict: q.row.verdict !== undefined ? q.row.verdict : null,
      })),
    }
  }
  return { status: 'inflight', specs: listing.map(s => s.specPath).sort() }
}

function checkGitRoot(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (r.status !== 0) die('--root ' + root + ' is not a git repository — pass an existing checkout, e.g. --root <repo dir>')
}

function runCommitMode(rawRoot, shaArg) {
  const root = path.resolve(rawRoot)
  checkGitRoot(root)
  const resolve = spawnSync('git', ['-C', root, 'rev-parse', shaArg], { encoding: 'utf8' })
  if (resolve.status !== 0) {
    die('unknown commit ' + shaArg + ' — verify it exists, e.g. git -C ' + root + ' log --oneline -5')
  }
  const sha = resolve.stdout.trim()
  const subject = spawnSync('git', ['-C', root, 'log', '-1', '--format=%s', sha], { encoding: 'utf8' }).stdout.trim()
  const committerTs = spawnSync('git', ['-C', root, 'log', '-1', '--format=%cI', sha], { encoding: 'utf8' }).stdout.trim()
  const filesOut = spawnSync('git', ['-C', root, 'show', '--format=', '--name-only', sha], { encoding: 'utf8' })
  const files = (filesOut.stdout || '').split('\n').filter(Boolean)

  const ledger = ledgerExists(root)
  const fixShaped = isFixShaped(subject)
  const landed = []
  const inFlight = []
  // Classification runs regardless of ledger presence — with no ledger there are simply
  // no qualifying review rows, so every File-Plan-listed file falls out as inFlight (never
  // landed) via the one classifyFile path.
  const specIndex = loadSpecIndex(root)
  const ledgerRows = readLedgerRows(root)
  const refEpoch = Date.parse(committerTs)
  for (const file of files) {
    const cls = classifyFile(file, refEpoch, specIndex, ledgerRows)
    if (cls.status === 'landed') landed.push({ file, specs: cls.specs })
    else if (cls.status === 'inflight') inFlight.push({ file, specs: cls.specs })
  }
  const offer = fixShaped && landed.length > 0

  const out = { mode: 'commit', root, sha, subject, committerTs, fixShaped, ledger, files, landed, inFlight, offer }

  if (json) {
    writeOut(1, JSON.stringify(out) + '\n')
    return
  }

  const lines = []
  lines.push('commit ' + sha.slice(0, 12) + ' — ' + subject)
  lines.push('  fix-shaped: ' + (fixShaped ? 'yes' : 'no') + ' · ledger: ' + (ledger ? 'yes' : 'no') + ' · files: ' + files.length)
  let offerLine
  if (!fixShaped) offerLine = 'offer: no — not fix-shaped'
  else if (!ledger) offerLine = 'offer: no — no ledger'
  else if (!landed.length) offerLine = 'offer: no — no reviewed spec landed a touched file'
  else {
    const distinct = new Set()
    for (const l of landed) for (const s of l.specs) distinct.add(s.spec)
    offerLine = `offer: yes — ${landed.length} files landed by reviewed specs (${distinct.size} distinct)`
  }
  lines.push('  ' + offerLine)
  for (const l of landed) {
    const specsStr = l.specs.map(s => `${s.spec} (review ${s.reviewRunId || 'none'} ${s.verdict || '?'} ${s.reviewTs})`).join('; ')
    lines.push(`    ${l.file} ← ${specsStr}`)
  }
  lines.push(`  in-flight: ${inFlight.length} files listed by specs not yet reviewed`)
  console.log(lines.join('\n'))
}

// ---- dispatch -----------------------------------------------------------------------------

runCommitMode(rootArg !== null ? rootArg : process.cwd(), commitArg)
