#!/usr/bin/env node
'use strict'
// commit-coverage.js — commit-time escape coverage, three modes:
//   --commit <sha> [--root <dir>] [--json]         one commit's landing/offer answer
//   --since <YYYY-MM-DD> [--root <dir>] [--json]   one repo's window share
//   --repos-root <dir> [--since <date>] [--json]   this machine's fleet share
// Owner: specs/20260904/01-commit-time-escape-coverage.md D1-D7 — the derivation `/git:commit`
// step 3 runs as its offer oracle, and the number `/spec:status`/ad-hoc reads print cold.
//
// A file is LANDED for a reference commit iff a spec's `## File Plan` (lib/file-plan) lists it
// (exact path or glob, lib/glob-match) AND that spec's repo ledger (lib/observation) holds a
// stage:"review" row whose ts parses to an epoch strictly before the reference commit's
// committer epoch; the file is IN-FLIGHT when a listing spec exists but none qualifies yet.
// Fix-shaped = the subject's conventional type token is fix/hotfix only (D2) — never a broader
// substring match.
//
// What this deliberately does NOT do: block a commit, record a decline, mutate anything on
// disk, or re-implement fleet discovery — fleet mode spawns fleet-reader.js for population and
// the escape cutover default rather than owning a second copy of either.
//
// Exit codes: 0 = derived (a zero-commit window, a missing ledger, and offer:false are all
//                 derived answers, never errors)
//             2 = usage error (no mode flag, unknown flag, missing flag value); --root not a
//                 git repository (remedy names --root <repo dir>); an unresolvable --commit sha
//                 (remedy names the sha and `git log --oneline -5`); an unparseable --since
//                 (remedy names --since YYYY-MM-DD); --repos-root not a directory; or the
//                 fleet-reader.js spawn exiting non-zero (its stderr is forwarded verbatim)

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { parseFilePlan } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { readLedgerRows } = require('./lib/observation')
const { writeOut } = require('./lib/driver-io')

const USAGE = 'Usage: node commit-coverage.js --commit <sha> [--root <dir>] [--json] | ' +
  '--since <YYYY-MM-DD> [--root <dir>] [--json] | --repos-root <dir> [--since <YYYY-MM-DD>] [--json]'

function die(message) {
  process.stderr.write('commit-coverage: ' + message + '\n')
  process.stderr.write(USAGE + '\n')
  process.exit(2)
}

// ---- arg parsing (hand-rolled) ---------------------------------------------------------------

let commitArg = null
let sinceArg = null
let reposRootArg = null
let rootArg = null
let json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--commit' || a === '--since' || a === '--repos-root' || a === '--root') {
    if (i + 1 >= argv.length) die(a + ' needs a value')
    const v = argv[++i]
    if (a === '--commit') commitArg = v
    else if (a === '--since') sinceArg = v
    else if (a === '--repos-root') reposRootArg = v
    else rootArg = v
  } else if (a === '--json') {
    json = true
  } else {
    die('unknown flag ' + a)
  }
}

const mode = reposRootArg !== null ? 'fleet' : commitArg !== null ? 'commit' : sinceArg !== null ? 'window' : null
if (!mode) die('one of --commit, --since, or --repos-root is required')

// ---- shared derivation --------------------------------------------------------------------

const FIX_SHAPED_RE = /^(fix|hotfix)(\([^)]*\))?!?:/i
function isFixShaped(subject) { return FIX_SHAPED_RE.test(subject) }

function round4(x) { return Math.round((x + Number.EPSILON) * 10000) / 10000 }

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

// D3: landed/inFlight/none for one touched file against one reference epoch.
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

function parseLogLine(line) {
  const i1 = line.indexOf('\x1f')
  const i2 = line.indexOf('\x1f', i1 + 1)
  return { sha: line.slice(0, i1), ts: line.slice(i1 + 1, i2), subject: line.slice(i2 + 1) }
}

// D6: the window computation, shared by window mode's single repo and fleet mode's per-repo
// entries. Assumes root IS a git repo (or the caller has already gated on that).
function computeWindow(root, sinceEpoch) {
  const ledger = ledgerExists(root)
  const specIndex = loadSpecIndex(root)
  const ledgerRows = readLedgerRows(root)
  const head = spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], { encoding: 'utf8' })
  let commits = 0
  let fixShapedCount = 0
  let landedPostClose = 0
  let inFlightOnly = 0
  let noSpecFile = 0
  if (head.status === 0) {
    const log = spawnSync('git', ['-C', root, 'log', '--no-merges', '--format=%H\x1f%cI\x1f%s'], { encoding: 'utf8' })
    const lines = (log.stdout || '').split('\n').filter(Boolean)
    for (const line of lines) {
      const { sha, ts, subject } = parseLogLine(line)
      const epoch = Date.parse(ts)
      if (Number.isNaN(epoch) || epoch < sinceEpoch) continue
      commits++
      if (!isFixShaped(subject)) continue
      fixShapedCount++
      const filesOut = spawnSync('git', ['-C', root, 'show', '--format=', '--name-only', sha], { encoding: 'utf8' })
      const touched = (filesOut.stdout || '').split('\n').filter(Boolean)
      let anyLanded = false
      let anyInflight = false
      for (const f of touched) {
        const cls = classifyFile(f, epoch, specIndex, ledgerRows)
        if (cls.status === 'landed') anyLanded = true
        else if (cls.status === 'inflight') anyInflight = true
      }
      if (anyLanded) landedPostClose++
      else if (anyInflight) inFlightOnly++
      else noSpecFile++
    }
  }
  const rows = { commit: 0, manual: 0, unknown: 0 }
  for (const r of ledgerRows) {
    if (r.stage !== 'escape' || typeof r.ts !== 'string') continue
    const e = Date.parse(r.ts)
    if (Number.isNaN(e) || e < sinceEpoch) continue
    const bucket = r.via === 'commit' ? 'commit' : r.via === 'manual' ? 'manual' : 'unknown'
    rows[bucket]++
  }
  const share = landedPostClose === 0 ? null : round4(rows.commit / landedPostClose)
  return { ledger, commits, fixShaped: fixShapedCount, landedPostClose, inFlightOnly, noSpecFile, rows, share }
}

function renderCounts(w) {
  if (w.git === false) {
    return 'commits=— fix=— → landed-post-close=— in-flight-only=— no-spec-file=— · ' +
      'rows via commit=— manual=— unknown=— → share n/a'
  }
  const pct = w.share === null ? 'n/a' : (w.share * 100).toFixed(1) + '%'
  return `commits=${w.commits} fix=${w.fixShaped} → landed-post-close=${w.landedPostClose} ` +
    `in-flight-only=${w.inFlightOnly} no-spec-file=${w.noSpecFile} · rows via commit=${w.rows.commit} ` +
    `manual=${w.rows.manual} unknown=${w.rows.unknown} → share ${w.rows.commit}/${w.landedPostClose} (${pct})`
}

// ---- mode: commit ----------------------------------------------------------------------------

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
  // D3/s1: classification runs regardless of ledger presence — with no ledger there are simply
  // no qualifying review rows, so every File-Plan-listed file falls out as inFlight (never
  // landed) via the SAME classifyFile window mode uses; one classification path, not two.
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

// ---- mode: window -----------------------------------------------------------------------------

function runWindowMode(rawRoot, since) {
  const root = path.resolve(rawRoot)
  checkGitRoot(root)
  const sinceEpoch = Date.parse(since)
  if (Number.isNaN(sinceEpoch)) die('--since ' + since + ' is not a parseable date — pass a date like --since 2026-08-17')
  const name = path.basename(root)
  const w = computeWindow(root, sinceEpoch)
  const repo = { name, dir: root, git: true, ...w }

  if (json) {
    writeOut(1, JSON.stringify({ mode: 'window', since, root, repo }) + '\n')
    return
  }

  console.log([
    `Commit-time escape coverage since ${since} — ${name} (${root})`,
    `  ${name}: ${renderCounts(repo)}`,
  ].join('\n'))
}

// ---- mode: fleet ------------------------------------------------------------------------------

function runFleetMode(rawReposRoot, sinceOverride) {
  const reposRoot = path.resolve(rawReposRoot)
  let stat = null
  try { stat = fs.statSync(reposRoot) } catch { stat = null }
  if (!stat || !stat.isDirectory()) die('--repos-root ' + reposRoot + ' is not a directory')

  const fr = spawnSync(process.execPath, [path.join(__dirname, 'fleet-reader.js'), '--json', '--repos-root', reposRoot], { encoding: 'utf8' })
  if (fr.status !== 0) {
    process.stderr.write(fr.stderr || '')
    process.exit(2)
  }
  const frOut = JSON.parse(fr.stdout)
  const since = sinceOverride !== null ? sinceOverride : frOut.gate08.cutover
  const sinceEpoch = Date.parse(since)
  if (Number.isNaN(sinceEpoch)) die('--since ' + since + ' is not a parseable date — pass a date like --since 2026-08-17')

  const repos = []
  const excluded = { selfRepair: [], noGit: [] }
  const fleetTotals = { commits: 0, fixShaped: 0, landedPostClose: 0, inFlightOnly: 0, noSpecFile: 0, rows: { commit: 0, manual: 0, unknown: 0 } }

  for (const pr of frOut.population.repos) {
    const dir = path.join(reposRoot, pr.name)
    const hasGit = fs.existsSync(path.join(dir, '.git'))
    if (!hasGit) {
      repos.push({
        name: pr.name, dir, selfRepair: pr.selfRepair, git: false,
        ledger: null, commits: null, fixShaped: null, landedPostClose: null,
        inFlightOnly: null, noSpecFile: null, rows: null, share: null,
      })
      excluded.noGit.push(pr.name)
      continue
    }
    const w = computeWindow(dir, sinceEpoch)
    repos.push({ name: pr.name, dir, selfRepair: pr.selfRepair, git: true, ...w })
    if (pr.selfRepair) {
      excluded.selfRepair.push(pr.name)
    } else {
      fleetTotals.commits += w.commits
      fleetTotals.fixShaped += w.fixShaped
      fleetTotals.landedPostClose += w.landedPostClose
      fleetTotals.inFlightOnly += w.inFlightOnly
      fleetTotals.noSpecFile += w.noSpecFile
      fleetTotals.rows.commit += w.rows.commit
      fleetTotals.rows.manual += w.rows.manual
      fleetTotals.rows.unknown += w.rows.unknown
    }
  }
  const fleetShare = fleetTotals.landedPostClose === 0 ? null : round4(fleetTotals.rows.commit / fleetTotals.landedPostClose)
  const fleetRepoCount = repos.filter(r => !r.selfRepair && r.git).length
  const fleet = { repos: fleetRepoCount, ...fleetTotals, share: fleetShare }

  if (json) {
    writeOut(1, JSON.stringify({ mode: 'fleet', reposRoot, since, repos, fleet, excluded }) + '\n')
    return
  }

  const lines = [`Commit-time escape coverage since ${since} — this machine's checkouts under ${reposRoot} (${repos.length} repos)`]
  for (const r of repos) {
    let labels = ''
    if (r.selfRepair) labels += ' (self-repair, not in fleet totals)'
    if (r.git === false) labels += ' (no git checkout)'
    lines.push(`  ${r.name}${labels}: ${renderCounts(r)}`)
  }
  lines.push(`  fleet (hosts): ${renderCounts({ ...fleet, git: true })}`)
  lines.push(`  excluded: selfRepair=${excluded.selfRepair.length} noGit=${excluded.noGit.length}`)
  console.log(lines.join('\n'))
}

// ---- dispatch -----------------------------------------------------------------------------

if (mode === 'commit') runCommitMode(rootArg !== null ? rootArg : process.cwd(), commitArg)
else if (mode === 'window') runWindowMode(rootArg !== null ? rootArg : process.cwd(), sinceArg)
else runFleetMode(reposRootArg, sinceArg)
