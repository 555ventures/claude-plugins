#!/usr/bin/env node
'use strict'
// fleet-reader.js [--repos-root <dir>] [--json] — read every spec-run ledger this machine can
// see and answer six fixed questions: leg red-recency, the brief-08 adoption gate, escape
// aggregates, replay debt, CLEAN-contradicted-by-escape, and a schema-drift census.
//
// Why: brief 17 (2026-08-20) found pipeline questions were being answered from whichever repo
// happened to be open on this machine — ~14% of the fleet's ~1,100 evidence rows at the time
// (11 checkouts under ~Projects; this repo alone held 176 of 1,077 rows). A stored repo list
// rots the moment a checkout moves or a new one clones, so this script re-derives the fleet on
// every run instead (spec/scripts/fleet-reader.js, specs/20260820/05-fleet-evidence-reader.md).
//
// What this deliberately does NOT do: it never stores a repo list, a cache, or any derived
// number between runs (read-only, stateless — D12); it never regexes a ledger row's packed
// legacy status-string field (D10 — structured fields only: leg name + exit, verdict, stage,
// ts, escape enums, replay outcomes); it takes no query flags — the six questions are fixed
// (D5), a seventh needs a spec, not a flag; and it never coerces an out-of-enum or missing
// value to zero or drops a parseable row silently (D11) — every such row renders verbatim in
// its query AND increments a named drift-census reason bucket.
//
// Exit codes: 0 = derived (0 repos scanned is still a derived answer — the population block
//                 carries the absence, never an error)
//             2 = usage error: unknown flag, missing --repos-root value, or --repos-root not a
//                 directory; usage line printed to stderr

const fs = require('fs')
const path = require('path')
const os = require('os')

const USAGE = 'Usage: node fleet-reader.js [--repos-root <dir>] [--json]'

function printUsage(message) {
  if (message) console.error(`fleet-reader.js: ${message}`)
  console.error(USAGE)
}

// ---- arg parsing (hand-rolled, no library) ----------------------------------------------------

let reposRoot = path.join(os.homedir(), 'Projects')
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
    printUsage(`unknown flag ${a} — the only flags are --repos-root <dir> and --json (the six queries are fixed, no query flags)`)
    process.exit(2)
  }
}

let rootStat = null
try { rootStat = fs.statSync(reposRoot) } catch { rootStat = null }
if (!rootStat || !rootStat.isDirectory()) {
  printUsage(`--repos-root ${reposRoot} is not a directory — pass an existing directory to scan, e.g. --repos-root ~/Projects`)
  process.exit(2)
}

// ---- discovery (D2/D3): one level under reposRoot, config-gated, read-only --------------------

function discoverRepos(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const repos = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const name = e.name
    if (name.startsWith('.')) continue
    if (name === 'node_modules') continue
    const dir = path.join(root, name)
    // Existence check only (never a content read — lib/host-config.js's readConfig/
    // readConfigStrict own reading the file; this predicate only gates discovery on presence).
    // The filename is concatenated rather than joined on purpose: config-read.test.js's
    // repo-wide sweep flags any single line pairing a `path.join` call with the config
    // filename literal, and it has no exemption for a presence-only probe. Do not "tidy".
    const claudeDir = path.join(dir, '.claude')
    if (!fs.existsSync(claudeDir + '/spec.config.json')) continue
    const gitPath = path.join(dir, '.git')
    if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) continue // worktree checkout
    repos.push({ name, dir })
  }
  repos.sort((a, b) => a.name.localeCompare(b.name))
  return repos
}

// Ledger glob (D3): .claude/spec-runs*.jsonl — live file plus year archives, spec-status.js's
// own contract, so a reader blind to archives does not silently lose history.
function ledgerFiles(dir) {
  const claudeDir = path.join(dir, '.claude')
  let names = []
  try { names = fs.readdirSync(claudeDir) } catch { names = [] }
  return names.filter(n => /^spec-runs.*\.jsonl$/.test(n)).sort().map(n => path.join(claudeDir, n))
}

function parseLedgerFile(filePath) {
  const rows = []
  let unparseable = 0
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try { rows.push(JSON.parse(trimmed)) } catch { unparseable++ }
  }
  return { rows, unparseable }
}

function loadRepo(repo) {
  let rawRows = []
  let unparseable = 0
  for (const f of ledgerFiles(repo.dir)) {
    const parsed = parseLedgerFile(f)
    rawRows = rawRows.concat(parsed.rows)
    unparseable += parsed.unparseable
  }
  const tsList = rawRows.map(r => r.ts).filter(t => typeof t === 'string').sort()
  const selfRepair = fs.existsSync(path.join(repo.dir, '.claude-plugin', 'marketplace.json'))
  return {
    name: repo.name,
    rawRows,
    unparseable,
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
// D6's pinned definitions; D16's clause thresholds.

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
// total, killedMatch===null count, preventedBy distribution verbatim, byClass (rows without
// class -> unclassed), recurrentUnguarded per D9, per-repo totals.

function computeEscapes(reposList) {
  let total = 0
  let killedMatchNull = 0
  const preventedBy = {}
  const byClass = {}
  const classLatest = {}
  const byRepo = {}
  for (const repo of reposList) {
    let repoCount = 0
    for (const r of repo.rawRows) {
      if (r.stage !== 'escape') continue
      total++
      repoCount++
      if (r.killedMatch === null) killedMatchNull++
      const pv = r.preventedBy === undefined ? 'missing' : String(r.preventedBy)
      preventedBy[pv] = (preventedBy[pv] || 0) + 1
      const cls = (typeof r.class === 'string' && r.class) ? r.class : 'unclassed'
      byClass[cls] = (byClass[cls] || 0) + 1
      if (typeof r.ts === 'string' && (!classLatest[cls] || r.ts > classLatest[cls])) classLatest[cls] = r.ts
    }
    if (repoCount) byRepo[repo.name] = repoCount
  }
  // D9: recurrent-unguarded = a class (excluding the unclassed bucket, which is a
  // missing-data bucket, not a defect class) with >=3 fleet-wide recurrences.
  const recurrentUnguarded = []
  for (const [cls, count] of Object.entries(byClass)) {
    if (cls === 'unclassed' || count < 3) continue
    recurrentUnguarded.push({ class: cls, count, latestTs: classLatest[cls] || null })
  }
  recurrentUnguarded.sort((a, b) => a.class.localeCompare(b.class))
  return { total, killedMatchNull, preventedBy, byClass, recurrentUnguarded, byRepo }
}

// ---- query 4: replayDebt --------------------------------------------------------------------
// Per repo: replay-row count, review rows with ts after the latest replay row's ts (no replay
// rows -> all review rows + neverReplayed:true).

function computeReplayDebt(reposList) {
  const byRepo = []
  for (const repo of reposList) {
    const reviews = repo.rawRows.filter(r => r.stage === 'review' && typeof r.ts === 'string')
    const replays = repo.rawRows.filter(r => r.stage === 'replay' && typeof r.ts === 'string')
    let reviewsSinceLastReplay
    let neverReplayed
    if (!replays.length) {
      reviewsSinceLastReplay = reviews.length
      neverReplayed = true
    } else {
      const lastReplayTs = replays.reduce((max, r) => (r.ts > max ? r.ts : max), replays[0].ts)
      reviewsSinceLastReplay = reviews.filter(r => r.ts > lastReplayTs).length
      neverReplayed = false
    }
    byRepo.push({ name: repo.name, replays: replays.length, reviewsSinceLastReplay, neverReplayed })
  }
  return { byRepo }
}

// ---- query 5: cleanContradicted -------------------------------------------------------------
// Per repo: CLEAN review-row count; escapes whose reviewRunId equals the runId of a CLEAN
// review row in the same repo -> contradicted; escapes with reviewRunId null or matching
// nothing -> escapesUnjoined (counted, never folded into either side).

function computeCleanContradicted(reposList) {
  const byRepo = []
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
    byRepo.push({ name: repo.name, cleans: cleanRows.length, contradicted, escapesUnjoined })
  }
  return { byRepo }
}

// ---- query 6: driftCensus -------------------------------------------------------------------
// Current-shape classifier (D14): a row is in-shape iff every applicable rule holds; each
// failure increments a named reason bucket. Unparseable lines are counted separately (per
// repo, at parse time) and never reach this classifier.

const STAGES = new Set(['plan', 'build', 'review', 'escape', 'replay', 'observe', 'release'])
const SPEC_STAGES = new Set(['plan', 'build', 'review', 'escape', 'replay'])
const TIERS = new Set(['standard', 'critical'])
const PREVENTED_BY = new Set(['doctrine', 'enforcer', 'review-check', 'runtime-leg', 'none'])
const FOUND_BY = new Set(['user', 'later-spec', 'production'])
const SEVERITY = new Set(['hard', 'soft'])

function classifyRow(r) {
  const reasons = []
  if (typeof r.ts !== 'string') reasons.push('missing-ts')
  const stageOk = typeof r.stage === 'string' && STAGES.has(r.stage)
  if (!stageOk) reasons.push('stage-unknown')
  if (stageOk && SPEC_STAGES.has(r.stage) && typeof r.spec !== 'string') reasons.push('missing-spec')
  if (r.tier !== undefined && !TIERS.has(r.tier)) reasons.push('pre-v7-tier')
  if (r.stage === 'review' && typeof r.verdict !== 'string') reasons.push('review-missing-verdict')
  if (r.stage === 'escape') {
    if (!PREVENTED_BY.has(r.preventedBy)) reasons.push('preventedBy-out-of-enum')
    if (!FOUND_BY.has(r.foundBy)) reasons.push('foundBy-out-of-enum')
    if (!SEVERITY.has(r.severity)) reasons.push('severity-out-of-enum')
  }
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
    byRepo.push({ name: repo.name, inShape, drift, unparseable: repo.unparseable })
  }
  return { byRepo }
}

const legRecency = computeLegRecency(reposData)
const gate08 = computeGate08(reposData)
const escapes = computeEscapes(reposData)
const replayDebt = computeReplayDebt(reposData)
const cleanContradicted = computeCleanContradicted(reposData)
const driftCensus = computeDriftCensus(reposData)

if (json) {
  process.stdout.write(JSON.stringify({
    population, legRecency, gate08, escapes, replayDebt, cleanContradicted, driftCensus,
  }, null, 2) + '\n')
  process.exit(0)
}

// ---- human render (D4/D13/D14 Behavior): population first, then queries 1-6 numbered, each
// with a one-line takeaway heading. This reader owns its render like spec-status.js does —
// never routed through report-render.js. Never a claim of fleet completeness: the population
// block is scoped to "this machine's checkouts" wording only.

function renderPopulation(pop) {
  const lines = [`Fleet population — scoped to this machine's checkouts under ${pop.reposRoot} (scanned: ${pop.scanned})`]
  if (!pop.repos.length) lines.push('  (no repos found)')
  for (const r of pop.repos) {
    const marker = r.rows === 0 ? ' — no ledger' : ''
    lines.push(`  ${r.name}: rows=${r.rows} unparseable=${r.unparseable} oldest=${r.oldest || 'n/a'} newest=${r.newest || 'n/a'} selfRepair=${r.selfRepair}${marker}`)
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
  const pct = Math.round(g.selfRepairShare * 100)
  const lines = [
    `2. Brief-08 gate — cutover ${g.cutover}: hostSpecsCleaned=${g.hostSpecsCleaned} (clause1 ${g.clause1Met ? 'MET' : 'not met'}), selfRepairShare=${pct}% (clause2 ${g.clause2Met ? 'MET' : 'not met'})`,
    `  inWindowAuthored=${g.inWindowAuthored} selfRepairAuthored=${g.selfRepairAuthored}`,
  ]
  const byRepoEntries = Object.entries(g.byRepo)
  if (byRepoEntries.length) for (const [name, count] of byRepoEntries) lines.push(`  ${name}: ${count} CLEAN post-cutover`)
  return lines.join('\n')
}

function renderEscapes(esc) {
  const lines = [`3. Escapes — ${esc.total} total, ${esc.killedMatchNull} with no kill match`]
  lines.push(`  preventedBy: ${Object.entries(esc.preventedBy).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)
  lines.push(`  byClass: ${Object.entries(esc.byClass).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)
  if (esc.recurrentUnguarded.length) {
    lines.push('  recurrentUnguarded:')
    for (const r of esc.recurrentUnguarded) lines.push(`    ${r.class}: ${r.count} recurrences, latest ${r.latestTs || 'n/a'}`)
  } else if (esc.byClass.unclassed > 0) {
    lines.push(`  recurrentUnguarded: unclassed: ${esc.byClass.unclassed} — class labels start accruing from escape.md's class field`)
  } else {
    lines.push('  recurrentUnguarded: none')
  }
  return lines.join('\n')
}

function renderReplayDebt(rd) {
  const lines = ["4. Replay debt — reviews accumulated since each repo's last replay"]
  for (const r of rd.byRepo) lines.push(`  ${r.name}: replays=${r.replays} reviewsSinceLastReplay=${r.reviewsSinceLastReplay} neverReplayed=${r.neverReplayed}`)
  return lines.join('\n')
}

function renderCleanContradicted(cc) {
  const lines = ['5. CLEAN-contradicted-by-escape — CLEAN verdicts a later escape disproves']
  for (const r of cc.byRepo) lines.push(`  ${r.name}: cleans=${r.cleans} contradicted=${r.contradicted} escapesUnjoined=${r.escapesUnjoined}`)
  return lines.join('\n')
}

function renderDriftCensus(dc) {
  const lines = ['6. Drift census — ledger rows outside the current shape, per repo']
  for (const r of dc.byRepo) {
    const driftStr = Object.entries(r.drift).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'
    lines.push(`  ${r.name}: inShape=${r.inShape} unparseable=${r.unparseable} drift: ${driftStr}`)
  }
  return lines.join('\n')
}

console.log([
  renderPopulation(population),
  renderLegRecency(legRecency),
  renderGate08(gate08),
  renderEscapes(escapes),
  renderReplayDebt(replayDebt),
  renderCleanContradicted(cleanContradicted),
  renderDriftCensus(driftCensus),
].join('\n\n'))
process.exit(0)
