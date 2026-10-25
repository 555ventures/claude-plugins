#!/usr/bin/env node
'use strict'
// fleet-reader.js [--repos-root <dir>] [--json] — read every spec-run ledger this machine can
// see and answer eight fixed questions: leg red-recency, the brief-08 adoption gate, escape
// aggregates (total, byClass, recurrentUnguarded, byRepo, incidents, registry),
// CLEAN-contradicted-by-escape (with its false-CLEAN rate), a schema-drift census, and
// escapes-per-CLEAN by via (loop vs. direct vs. unknown).
//
// Why: pipeline questions were being answered from whichever repo happened to be open on this
// machine. A stored repo list rots the moment a checkout moves or a new one clones, so this
// script re-derives the fleet on every run instead.
// Owner: specs/20260820/05-fleet-evidence-reader.md; specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md.
//
// What this deliberately does NOT do: it never stores a repo list, a cache, or any derived
// number between runs (read-only, stateless); it never regexes a ledger row's packed legacy
// status-string field (structured fields only: leg name + exit, verdict, stage, ts, escape
// shape, replay outcomes); it takes no query flags — the eight questions are fixed, a new
// query still needs a spec, not a flag; it never coerces an out-of-enum or missing value to
// zero or drops a parseable row silently — every such row renders verbatim in its query AND
// increments a named drift-census reason bucket; a row's class is its own `class` field, so
// legacy amendment rows are read for ts and spec only and count toward nothing else.
//
// Exit codes: 0 = derived (0 repos scanned is still a derived answer — the population block
//                 carries the absence, never an error)
//             2 = usage error: unknown flag, missing --repos-root value, --repos-root not a
//                 directory, or --repos-root not a readable directory; usage line printed to
//                 stderr

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { configExists } = require('./lib/host-config')
const { validateEscapeRow } = require('./lib/escape-row')

const USAGE = 'Usage: node fleet-reader.js [--repos-root <dir>] [--json]'

function printUsage(message) {
  if (message) console.error(`fleet-reader.js: ${message}`)
  console.error(USAGE)
}

// ---- arg parsing (hand-rolled, no library) ----------------------------------------------------

// The fleet is the checkouts that sit beside the one this run was invoked from, so the default
// repos-root is derived from the invoking repository — `git rev-parse --show-toplevel`'s parent —
// never a hardcoded directory name. A hardcoded `~/Projects` is wrong on any host that spells the
// directory differently, and wrong SILENTLY where a same-named empty directory happens to exist:
// discovery finds no repo, every query answers zero, and the run still exits 0 because zero repos
// is a legitimate derived answer (see Exit codes). `~/Projects` survives only as the fallback for
// a run started outside any repository, where there is nothing to derive from.
function defaultReposRoot() {
  try {
    const git = (args) => execFileSync('git', ['rev-parse', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const top = git(['--show-toplevel'])
    // A linked worktree's top level sits inside its main checkout (`<repo>/.claude/worktrees/
    // <name>`), so its parent holds no checkout at all — the same silent zero as above, on every
    // run a spec's own worktree starts. The common git dir is shared by every worktree of one
    // repository, so its parent is the main checkout whichever worktree the run started in.
    const common = git(['--git-common-dir'])
    if (common) {
      const commonAbs = fs.realpathSync(path.resolve(process.cwd(), common))
      if (path.basename(commonAbs) === '.git') return path.dirname(path.dirname(commonAbs))
    }
    if (top) return path.dirname(top)
  } catch {
    // Not a repository, or git unavailable — fall through to the homedir default.
  }
  return path.join(os.homedir(), 'Projects')
}

let reposRoot = defaultReposRoot()
let json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--repos-root') {
    if (i + 1 >= argv.length) {
      printUsage('--repos-root needs a directory argument — pass an existing directory, e.g. --repos-root ~/Projects')
      process.exit(2)
    }
    reposRoot = argv[++i]
  } else if (a === '--json') {
    json = true
  } else {
    printUsage(`unknown flag ${a} — the only flags are --repos-root <dir> and --json (the eight queries are fixed, no query flags)`)
    process.exit(2)
  }
}

let rootStat = null
try { rootStat = fs.statSync(reposRoot) } catch { rootStat = null }
if (!rootStat || !rootStat.isDirectory()) {
  printUsage(`--repos-root ${reposRoot} is not a directory — pass an existing directory to scan, e.g. --repos-root ~/Projects`)
  process.exit(2)
}

// ---- discovery: one level under reposRoot, config-gated, read-only --------------------

function discoverRepos(root) {
  let entries
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch (e) {
    printUsage(`--repos-root ${root} could not be listed (${e.code || e.message}) — pass a readable directory, e.g. chmod u+r ${root} or --repos-root ~/Projects`)
    process.exit(2)
  }
  const repos = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const name = e.name
    if (name.startsWith('.')) continue
    if (name === 'node_modules') continue
    const dir = path.join(root, name)
    // Discovery gates on config presence only; lib/host-config.js owns the read.
    if (!configExists(dir)) continue
    const gitPath = path.join(dir, '.git')
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) continue // worktree checkout
    repos.push({ name, dir })
  }
  repos.sort((a, b) => a.name.localeCompare(b.name))
  return repos
}

// Ledger glob: .claude/spec-runs*.jsonl — live file plus year archives, spec-status.js's
// own contract, so a reader blind to archives does not silently lose history.
// A readdir failure here means ".claude provably exists (discovery's config check already
// passed) but its listing could not be read" — that is never the same fact as "listed fine,
// no ledger files present", so it is reported via unreadablePaths rather than folded into an
// empty file list (the silent-absence lie-risk).
function ledgerFiles(claudeDir) {
  let names
  try {
    names = fs.readdirSync(claudeDir)
  } catch {
    return { files: [], unreadablePaths: [claudeDir] }
  }
  return {
    files: names.filter(n => /^spec-runs.*\.jsonl$/.test(n)).sort().map(n => path.join(claudeDir, n)),
    unreadablePaths: [],
  }
}

// Returns null when the file exists but could not be read (EISDIR, EACCES, ...) — the caller
// counts that as unreadable rather than crashing the whole fleet run over one bad path.
function parseLedgerFile(filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  const rows = []
  let unparseable = 0
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try { rows.push(JSON.parse(trimmed)) } catch { unparseable++ }
  }
  return { rows, unparseable }
}

function loadRepo(repo) {
  let rawRows = []
  let unparseable = 0
  let unreadable = 0
  const unreadablePaths = []
  const claudeDir = path.join(repo.dir, '.claude')
  const listing = ledgerFiles(claudeDir)
  unreadable += listing.unreadablePaths.length
  unreadablePaths.push(...listing.unreadablePaths)
  for (const f of listing.files) {
    const parsed = parseLedgerFile(f)
    if (!parsed) {
      unreadable++
      unreadablePaths.push(f)
      continue
    }
    rawRows = rawRows.concat(parsed.rows)
    unparseable += parsed.unparseable
  }
  const tsList = rawRows.map(r => r.ts).filter(t => typeof t === 'string').sort()
  const selfRepair = fs.existsSync(path.join(repo.dir, '.claude-plugin', 'marketplace.json'))
  return {
    name: repo.name,
    dir: repo.dir,
    rawRows,
    unparseable,
    unreadable,
    unreadablePaths,
    oldest: tsList.length ? tsList[0] : null,
    newest: tsList.length ? tsList[tsList.length - 1] : null,
    selfRepair,
  }
}

const repos = discoverRepos(reposRoot)
const reposData = repos.map(loadRepo)

const population = {
  reposRoot,
  scanned: reposData.length,
  repos: reposData.map(r => ({
    name: r.name, rows: r.rawRows.length, unparseable: r.unparseable,
    unreadable: r.unreadable, unreadablePaths: r.unreadablePaths,
    oldest: r.oldest, newest: r.newest, selfRepair: r.selfRepair,
  })),
}

// ---- query 1: legRecency ------------------------------------------------------------------
// Over review rows carrying a legs array, ordered by ts: per leg name, totalRuns,
// runsSinceRed (rows with that leg strictly after the last row where its exit != 0),
// lastRedTs (null when never red), neverRed. Fleet-wide and per repo.

function reviewLegRows(reposList) {
  const rows = []
  for (const repo of reposList) {
    for (const r of repo.rawRows) {
      if (r.stage === 'review' && Array.isArray(r.legs)) rows.push(r)
    }
  }
  return rows
}

function aggregateLegs(reviewRows) {
  const byLeg = new Map()
  for (const r of reviewRows) {
    for (const leg of r.legs) {
      if (!leg || typeof leg.leg !== 'string') continue
      if (!byLeg.has(leg.leg)) byLeg.set(leg.leg, [])
      byLeg.get(leg.leg).push({ ts: r.ts, exit: leg.exit })
    }
  }
  const out = []
  for (const [legName, entries] of byLeg) {
    const sorted = entries.slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    let lastRedIdx = -1
    for (let i = 0; i < sorted.length; i++) if (sorted[i].exit !== 0) lastRedIdx = i
    const totalRuns = sorted.length
    const neverRed = lastRedIdx === -1
    out.push({
      leg: legName,
      totalRuns,
      runsSinceRed: neverRed ? totalRuns : totalRuns - lastRedIdx - 1,
      lastRedTs: neverRed ? null : sorted[lastRedIdx].ts,
      neverRed,
    })
  }
  out.sort((a, b) => a.leg.localeCompare(b.leg))
  return out
}

function computeLegRecency(reposList) {
  const fleet = aggregateLegs(reviewLegRows(reposList))
  const byRepo = {}
  for (const repo of reposList) {
    const rows = reviewLegRows([repo])
    if (rows.length) byRepo[repo.name] = aggregateLegs(rows)
  }
  return { fleet, byRepo }
}

// ---- query 2: gate08 ------------------------------------------------------------------------

const CUTOVER = '2026-08-17'

function round4(x) {
  return Math.round((x + Number.EPSILON) * 10000) / 10000
}

function computeGate08(reposList) {
  let hostSpecsCleaned = 0
  let inWindowAuthored = 0
  let selfRepairAuthored = 0
  const byRepo = {}
  for (const repo of reposList) {
    if (!repo.selfRepair) {
      const cleaned = new Set()
      for (const r of repo.rawRows) {
        if (r.stage === 'review' && r.verdict === 'CLEAN' && typeof r.ts === 'string'
          && r.ts >= CUTOVER && typeof r.spec === 'string') cleaned.add(r.spec)
      }
      if (cleaned.size) byRepo[repo.name] = cleaned.size
      hostSpecsCleaned += cleaned.size
    }
    const authored = new Set()
    for (const r of repo.rawRows) {
      if ((r.stage === 'plan' || r.stage === 'build') && typeof r.ts === 'string'
        && r.ts >= CUTOVER && typeof r.spec === 'string') authored.add(r.spec)
    }
    inWindowAuthored += authored.size
    if (repo.selfRepair) selfRepairAuthored += authored.size
  }
  const selfRepairShare = round4(inWindowAuthored > 0 ? selfRepairAuthored / inWindowAuthored : 0)
  return {
    cutover: CUTOVER,
    hostSpecsCleaned,
    byRepo,
    clause1Met: hostSpecsCleaned >= 5,
    inWindowAuthored,
    selfRepairAuthored,
    selfRepairShare,
    clause2Met: selfRepairShare < 0.20,
  }
}

// ---- query 3: escapes -----------------------------------------------------------------------
// total, byClass (rows without a class -> unclassed; build-row incidents join), recurrentUnguarded,
// per-repo totals, incident count, class registry.

function computeEscapes(reposList) {
  let total = 0
  const byClass = {}
  const classLatest = {}
  const byRepo = {}
  let incidents = 0
  for (const repo of reposList) {
    let repoCount = 0
    for (const r of repo.rawRows) {
      // core § Incident Policy (materiality): a build row's `incidents` entries (spec-build-driver
      // `--mark incident --class <id>`) join byClass/classLatest with escape rows, so a class that
      // only ever costs build time can still reach the guard-earning count. They never count toward
      // `total` (escape rows only) — `incidents` carries their own fleet-wide count.
      if (r.stage === 'build' && Array.isArray(r.incidents)) {
        for (const inc of r.incidents) {
          if (!inc || typeof inc.class !== 'string' || !inc.class) continue
          incidents++
          byClass[inc.class] = (byClass[inc.class] || 0) + 1
          const ts = typeof inc.ts === 'string' ? inc.ts : r.ts
          if (typeof ts === 'string' && (!classLatest[inc.class] || ts > classLatest[inc.class])) classLatest[inc.class] = ts
        }
        continue
      }
      if (r.stage !== 'escape') continue
      total++
      repoCount++
      const cls = (typeof r.class === 'string' && r.class) ? r.class : 'unclassed'
      byClass[cls] = (byClass[cls] || 0) + 1
      if (typeof r.ts === 'string' && (!classLatest[cls] || r.ts > classLatest[cls])) classLatest[cls] = r.ts
    }
    if (repoCount) byRepo[repo.name] = repoCount
  }
  // recurrent-unguarded = a class (excluding the unclassed bucket, which is a
  // missing-data bucket, not a defect class) with >=3 fleet-wide recurrences.
  const recurrentUnguarded = []
  for (const [cls, count] of Object.entries(byClass)) {
    if (cls === 'unclassed' || count < 3) continue
    recurrentUnguarded.push({ class: cls, count, latestTs: classLatest[cls] || null })
  }
  recurrentUnguarded.sort((a, b) => a.class.localeCompare(b.class))
  // registry: every non-unclassed class with its count (count desc, then class asc) — the class
  // vocabulary the build driver's `--mark incident --class` read.
  const registry = Object.entries(byClass)
    .filter(([cls]) => cls !== 'unclassed')
    .map(([cls, count]) => ({ class: cls, count }))
    .sort((a, b) => b.count - a.count || a.class.localeCompare(b.class))
  return { total, byClass, recurrentUnguarded, byRepo, incidents, registry }
}

// ---- query 5: cleanContradicted -------------------------------------------------------------
// Per repo: CLEAN review-row count; escapes whose reviewRunId equals the runId of a CLEAN
// review row in the same repo -> contradicted; escapes with reviewRunId null or matching
// nothing -> escapesUnjoined (counted, never folded into either side).
//
// falseCleanRate (contradicted / cleans, null when a repo has no CLEAN rows at all) and the
// `fleet` roll-up are the DIVISION of the two counts this query already derives, not a ninth
// question — the reader's fixed question set stays at eight. Why the division belongs
// here: the per-repo counts were already the catch-rate scoreboard, and every reader was
// doing the arithmetic by eye. The rate is a FLOOR, never an exact miscalibration figure:
// escapesUnjoined stays out of the numerator by the rule that an unjoined escape is never
// folded into either side, so a repo carrying unjoined escapes is at least this miscalibrated
// and possibly more. Deliberately NOT here: any trend, history, or per-window bucketing of
// this rate — the fleet carries ~25 contradicted rows in total, so a weekly line moves several
// points on a single escape, and storing a number between runs would break the stateless
// contract outright. A trend needs its own spec, and enough rows to survive one escape.

function computeCleanContradicted(reposList) {
  const byRepo = []
  const fleet = { cleans: 0, contradicted: 0, escapesUnjoined: 0, falseCleanRate: null }
  for (const repo of reposList) {
    const cleanRows = repo.rawRows.filter(r => r.stage === 'review' && r.verdict === 'CLEAN')
    const cleanRunIds = new Set(cleanRows.filter(r => typeof r.runId === 'string').map(r => r.runId))
    let contradicted = 0
    let escapesUnjoined = 0
    for (const r of repo.rawRows) {
      if (r.stage !== 'escape') continue
      if (typeof r.reviewRunId === 'string' && cleanRunIds.has(r.reviewRunId)) contradicted++
      else escapesUnjoined++
    }
    const cleans = cleanRows.length
    byRepo.push({ name: repo.name, cleans, contradicted, escapesUnjoined, falseCleanRate: falseCleanRate(contradicted, cleans) })
    fleet.cleans += cleans
    fleet.contradicted += contradicted
    fleet.escapesUnjoined += escapesUnjoined
  }
  fleet.falseCleanRate = falseCleanRate(fleet.contradicted, fleet.cleans)
  return { byRepo, fleet }
}

// A repo with no CLEAN rows has no rate at all — 0 would read as "never wrong" when the truth
// is "never measured".
function falseCleanRate(contradicted, cleans) {
  return cleans === 0 ? null : contradicted / cleans
}

// ---- query 7: cleanByVia ---------------------------------------------------------------------
// Per repo and fleet-total, for each via bucket
// (loop / direct / unknown — review rows carrying no via at all, pre-sibling-02 rows), the same
// {cleans, contradicted} shape query 5 (computeCleanContradicted) already derives, using the
// EXACT reviewRunId<->runId join that query uses. This is a sibling function, never a
// reshape of computeCleanContradicted itself — that query's --json output stays byte-identical.
const VIA_BUCKETS = ['loop', 'direct', 'unknown']

function bucketOf(via) {
  return via === 'loop' || via === 'direct' ? via : 'unknown'
}

function emptyViaTotals() {
  return { loop: { cleans: 0, contradicted: 0 }, direct: { cleans: 0, contradicted: 0 }, unknown: { cleans: 0, contradicted: 0 } }
}

function computeCleanByVia(reposList) {
  const total = emptyViaTotals()
  const byRepo = []
  for (const repo of reposList) {
    const cleanRows = repo.rawRows.filter(r => r.stage === 'review' && r.verdict === 'CLEAN')
    // Same join as computeCleanContradicted, but keyed per bucket: a Map from runId to the
    // bucket its CLEAN row belongs in, so an escape's reviewRunId match increments the SAME
    // bucket as the CLEAN row it contradicts.
    const cleanBucketByRunId = new Map()
    const repoTotals = emptyViaTotals()
    for (const r of cleanRows) {
      const bucket = bucketOf(r.via)
      repoTotals[bucket].cleans++
      if (typeof r.runId === 'string') cleanBucketByRunId.set(r.runId, bucket)
    }
    for (const r of repo.rawRows) {
      if (r.stage !== 'escape') continue
      if (typeof r.reviewRunId !== 'string') continue
      const bucket = cleanBucketByRunId.get(r.reviewRunId)
      if (bucket) repoTotals[bucket].contradicted++
    }
    for (const b of VIA_BUCKETS) {
      total[b].cleans += repoTotals[b].cleans
      total[b].contradicted += repoTotals[b].contradicted
    }
    byRepo.push({ name: repo.name, ...repoTotals })
  }
  return { total, byRepo }
}

// ---- query 6: driftCensus -------------------------------------------------------------------
// Current-shape classifier: a row is in-shape iff every applicable rule holds; each
// failure increments a named reason bucket. Unparseable lines are counted separately (per
// repo, at parse time) and never reach this classifier.

const STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay', 'observe', 'release', 'prototype', 'fix'])
const SPEC_STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay'])
const TIERS = new Set(['standard', 'critical'])

// Every stage:"escape" row goes through lib/escape-row.js's validateEscapeRow; a legacy
// amendment-stage row is a known stage validated for ts and spec only.
function classifyRow(r) {
  const reasons = []
  if (typeof r.ts !== 'string') reasons.push('missing-ts')
  const stageOk = typeof r.stage === 'string' && STAGES.has(r.stage)
  if (!stageOk) reasons.push('stage-unknown')
  if (stageOk && SPEC_STAGES.has(r.stage) && typeof r.spec !== 'string') reasons.push('missing-spec')
  if (r.tier !== undefined && !TIERS.has(r.tier)) reasons.push('pre-v7-tier')
  if (r.stage === 'review' && typeof r.verdict !== 'string') reasons.push('review-missing-verdict')
  // A fix row (written by /git:commit step 3 for a Direct-lane repair) points at its commit, never
  // at a spec: the sha is the only thing a later escape on the same files can join against.
  if (r.stage === 'fix' && !(typeof r.sha === 'string' && /^[0-9a-f]{40}$/.test(r.sha))) reasons.push('fix-missing-sha')
  if (r.stage === 'escape') reasons.push(...validateEscapeRow(r))
  return reasons
}

function computeDriftCensus(reposList) {
  const byRepo = []
  for (const repo of reposList) {
    let inShape = 0
    const drift = {}
    for (const r of repo.rawRows) {
      const reasons = classifyRow(r)
      if (!reasons.length) inShape++
      else for (const reason of reasons) drift[reason] = (drift[reason] || 0) + 1
    }
    byRepo.push({ name: repo.name, inShape, drift, unparseable: repo.unparseable, unreadable: repo.unreadable })
  }
  return { byRepo }
}

const legRecency = computeLegRecency(reposData)
const gate08 = computeGate08(reposData)
const escapes = computeEscapes(reposData)
const cleanContradicted = computeCleanContradicted(reposData)
const cleanByVia = computeCleanByVia(reposData)
const driftCensus = computeDriftCensus(reposData)

// The 64 KiB process.exit stdout truncation this synchronous writer avoids is explained in full
// at spec/scripts/lib/driver-io.js's writeOut.
// Local to this script: falling off the end with nothing else keeping the event loop alive exits
// 0 on its own, so neither branch below calls process.exit(0).
function writeAll(fd, buf) {
  let written = 0
  while (written < buf.length) written += fs.writeSync(fd, buf, written)
}

if (json) {
  writeAll(1, Buffer.from(JSON.stringify({
    population, legRecency, gate08, escapes, cleanContradicted, driftCensus, cleanByVia,
  }, null, 2) + '\n'))
}

// ---- human render : population first, then queries 1-6 numbered, each
// with a one-line takeaway heading. This reader owns its render like spec-status.js does —
// never routed through report-render.js. Never a claim of fleet completeness: the population
// block is scoped to "this machine's checkouts" wording only.

function renderPopulation(pop) {
  const lines = [`Fleet population — scoped to this machine's checkouts under ${pop.reposRoot} (scanned: ${pop.scanned})`]
  if (!pop.repos.length) lines.push('  (no repos found)')
  for (const r of pop.repos) {
    // A readdir/read failure is never "no ledger"  — that marker is reserved for a
    // directory that listed cleanly and simply held no ledger files.
    const marker = r.unreadable > 0
      ? ` — UNREADABLE: ${r.unreadablePaths.join(', ')} (fix permissions, e.g. chmod, or remove the blocking path; rows below undercount)`
      : (r.rows === 0 ? ' — no ledger' : '')
    lines.push(`  ${r.name}: rows=${r.rows} unparseable=${r.unparseable} unreadable=${r.unreadable} oldest=${r.oldest || 'n/a'} newest=${r.newest || 'n/a'} selfRepair=${r.selfRepair}${marker}`)
  }
  return lines.join('\n')
}

function renderLegRecency(lr) {
  const lines = ["1. Leg recency — fleet-wide run streaks since each leg's last red"]
  if (!lr.fleet.length) lines.push('  no review rows carrying a legs array were found')
  for (const leg of lr.fleet) {
    lines.push(`  ${leg.leg}: totalRuns=${leg.totalRuns} runsSinceRed=${leg.runsSinceRed} lastRedTs=${leg.lastRedTs || 'never'} neverRed=${leg.neverRed}`)
  }
  return lines.join('\n')
}

function renderGate08(g) {
  // Round-half-up on the two integer counts, never on the ratio: scaling a non-dyadic sub-1
  // ratio by 100 in floating point loses the half (23/40 * 100 === 57.49999999999999, so
  // Math.round gives 57 where round-half-up demands 58); 23*100/40 === 57.5 exactly, so the
  // integer arithmetic below is the fix, not a cosmetic reordering. The 4dp selfRepairShare
  // field stays untouched — this percent is derived independently, only for this render line.
  const pct = g.inWindowAuthored === 0 ? 0 : Math.round((g.selfRepairAuthored * 100) / g.inWindowAuthored)
  const lines = [
    `2. Brief-08 gate — cutover ${g.cutover}: hostSpecsCleaned=${g.hostSpecsCleaned} (clause1 ${g.clause1Met ? 'MET' : 'not met'}), selfRepairShare=${pct}% (clause2 ${g.clause2Met ? 'MET' : 'not met'})`,
    `  inWindowAuthored=${g.inWindowAuthored} selfRepairAuthored=${g.selfRepairAuthored}`,
  ]
  const byRepoEntries = Object.entries(g.byRepo)
  if (byRepoEntries.length) for (const [name, count] of byRepoEntries) lines.push(`  ${name}: ${count} CLEAN post-cutover`)
  return lines.join('\n')
}

function renderEscapes(esc) {
  const lines = [`3. Escapes — ${esc.total} total`]
  lines.push(`  byClass (escapes + build incidents): ${Object.entries(esc.byClass).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)
  lines.push(`  buildIncidents: ${esc.incidents}`)
  if (esc.recurrentUnguarded.length) {
    lines.push('  recurrentUnguarded:')
    for (const r of esc.recurrentUnguarded) lines.push(`    ${r.class}: ${r.count} recurrences, latest ${r.latestTs || 'n/a'}`)
  } else {
    lines.push('  recurrentUnguarded: none')
  }
  return lines.join('\n')
}

function renderCleanContradicted(cc) {
  const lines = ['5. CLEAN-contradicted-by-escape — CLEAN verdicts a later escape disproves (falseClean is a floor: unjoined escapes are excluded)']
  for (const r of cc.byRepo) lines.push(`  ${r.name}: cleans=${r.cleans} contradicted=${r.contradicted} escapesUnjoined=${r.escapesUnjoined} falseClean=${renderRate(r.falseCleanRate)}`)
  lines.push(`  fleet: cleans=${cc.fleet.cleans} contradicted=${cc.fleet.contradicted} escapesUnjoined=${cc.fleet.escapesUnjoined} falseClean=${renderRate(cc.fleet.falseCleanRate)}`)
  return lines.join('\n')
}

// n/a, never 0%, when there is no denominator — see falseCleanRate's own note.
function renderRate(rate) {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`
}

// One line, exact wording and middle-dot
// separators — the brief 18 kill condition is read straight off this line.
function renderCleanByVia(cbv) {
  const part = (b) => `${b} ${cbv.total[b].contradicted}/${cbv.total[b].cleans}`
  return `escapes-per-CLEAN by via: ${VIA_BUCKETS.map(part).join(' · ')}`
}

function renderDriftCensus(dc) {
  const lines = ['6. Drift census — ledger rows outside the current shape, per repo']
  for (const r of dc.byRepo) {
    const driftStr = Object.entries(r.drift).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'
    lines.push(`  ${r.name}: inShape=${r.inShape} unparseable=${r.unparseable} unreadable=${r.unreadable} drift: ${driftStr}`)
  }
  return lines.join('\n')
}

if (!json) {
  console.log([
    renderPopulation(population),
    renderLegRecency(legRecency),
    renderGate08(gate08),
    renderEscapes(escapes),
    renderCleanContradicted(cleanContradicted),
    renderDriftCensus(driftCensus),
    renderCleanByVia(cleanByVia),
  ].join('\n\n'))
}
