#!/usr/bin/env node
'use strict'
// fleet-reader.js [--repos-root <dir>] [--json] [--owed] — read every spec-run ledger this
// machine can see and answer nine fixed questions: leg red-recency, the brief-08 adoption gate,
// escape aggregates, replay debt, CLEAN-contradicted-by-escape, a schema-drift census,
// escapes-per-CLEAN by via (loop vs. direct vs. unknown), and — the ninth,
// specs/20260903/01-owed-query-and-row-handoff.md D1 — `owed`: every plugin-blaming row across
// this machine's checkouts (escape rows whose preventedBy is review-check|runtime-leg, missed
// replay rows, and unstamped docs/spec-feedback/ findings), grouped by class with the joined
// recurrence count and a derived fixed/in-flight/uncited/unknown citation status.
//
// Why: pipeline questions were being answered from whichever repo
// happened to be open on this machine — ~14% of the fleet's ~1,100 evidence rows at the time
// (11 checkouts under ~Projects; this repo alone held 176 of 1,077 rows). A stored repo list
// rots the moment a checkout moves or a new one clones, so this script re-derives the fleet on
// every run instead (spec/scripts/fleet-reader.js, specs/20260820/05-fleet-evidence-reader.md).
//
// --owed (D1) is a RENDER SELECTOR only, never a new machine format: the bare human render (no
// flag) stays byte-identical to the pre-owed render — population then queries 1-6 plus
// cleanByVia; `--owed` instead prints population then the owed render (population, then class
// groups/ambiguous/spec-feedback/hidden/excluded — the other eight queries are omitted from
// this render, still readable via --json or a bare run); `--json` always carries `owed` as a
// top-level key regardless of whether --owed rode along, so a `jq` reader never needs the flag.
//
// What this deliberately does NOT do: it never stores a repo list, a cache, or any derived
// number between runs (read-only, stateless — D12); it never regexes a ledger row's packed
// legacy status-string field (D10 — structured fields only: leg name + exit, verdict, stage,
// ts, escape enums, replay outcomes); it takes no query flags beyond --owed's render selection —
// the nine questions are fixed (D5; the seventh, cleanByVia, added by
// specs/20260901/03-unified-build-loop.md D9; the ninth, owed, added by this spec's D1), a new
// query still needs a spec, not a flag; it never coerces an out-of-enum or missing value to zero
// or drops a parseable row silently (D11) — every such row renders verbatim in its query AND
// increments a named drift-census reason bucket; and the owed query's citation scan (D5) never
// reads `docs/` — a roadmap or feedback-brief mention of a row's key is a plan, not a fix, so
// only `specs/`, `spec/`, and `tests/` are scanned (docs/spec-feedback/ is read separately, by
// D6's own frontmatter parser, purely to find UNSTAMPED findings — never as a citation surface).
//
// specs/20260901/08-corpus-derivation-and-kill-match.md D6: the escapes
// query gains corpusGaps (classes at or past CORPUS_BAR fleet recurrences with no replay-corpus
// entry) and registry (every classified class, with its inCorpus flag) — both derived fresh each
// run from lib/replay-corpus.js's parser against the plugin's own shipped corpus, never stored.
//
// Exit codes: 0 = derived (0 repos scanned is still a derived answer — the population block
//                 carries the absence, never an error)
//             2 = usage error: unknown flag, missing --repos-root value, --repos-root not a
//                 directory, or --repos-root not a readable directory; usage line printed to
//                 stderr

const fs = require('fs')
const path = require('path')
const os = require('os')
const { configExists } = require('./lib/host-config')
const { validateEscapeRow, validateAmendmentRow, joinAmendments, escapeKey } = require('./lib/escape-row')
const { CORPUS_BAR, corpusPath, parseCorpus } = require('./lib/replay-corpus')
const { fmBlock } = require('./lib/frontmatter')

const USAGE = 'Usage: node fleet-reader.js [--repos-root <dir>] [--json] [--owed]'

function printUsage(message) {
  if (message) console.error(`fleet-reader.js: ${message}`)
  console.error(USAGE)
}

// ---- arg parsing (hand-rolled, no library) ----------------------------------------------------

let reposRoot = path.join(os.homedir(), 'Projects')
let json = false
let owedFlag = false
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
  } else if (a === '--owed') {
    owedFlag = true
  } else {
    printUsage(`unknown flag ${a} — the only flags are --repos-root <dir>, --json, and --owed (the nine queries are fixed, no query flags)`)
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

// Ledger glob (D3): .claude/spec-runs*.jsonl — live file plus year archives, spec-status.js's
// own contract, so a reader blind to archives does not silently lose history.
// A readdir failure here means ".claude provably exists (discovery's config check already
// passed) but its listing could not be read" — that is never the same fact as "listed fine,
// no ledger files present", so it is reported via unreadablePaths rather than folded into an
// empty file list (FIX 3 / the D4 silent-absence lie-risk).
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
//
// D4 (specs/20260901/07-escape-class-contract.md): byClass/classLatest/recurrentUnguarded now
// count on the EFFECTIVE class — joinAmendments(repo.rawRows) gives the latest escape-class
// amendment per key; an escape row's effective class is the amendment's when one exists, else
// its own. escapes.unclassedRows lists rows whose effective class AND effective reason are both
// null (the backfill's own work list); escapes.amendments counts every escape-class row
// fleet-wide.

function effectiveClassReason(row, amendments) {
  const amendment = amendments.get(escapeKey(row))
  if (amendment) return { class: amendment.class, unclassedReason: amendment.unclassedReason }
  return { class: (row.class !== undefined ? row.class : null), unclassedReason: (row.unclassedReason !== undefined ? row.unclassedReason : null) }
}

function computeEscapes(reposList) {
  let total = 0
  let killedMatchNull = 0
  let amendmentsCount = 0
  const preventedBy = {}
  const byClass = {}
  const classLatest = {}
  const byRepo = {}
  const unclassedRows = []
  for (const repo of reposList) {
    let repoCount = 0
    const amendments = joinAmendments(repo.rawRows)
    for (const r of repo.rawRows) {
      if (r.stage === 'escape-class') amendmentsCount++
      if (r.stage !== 'escape') continue
      total++
      repoCount++
      if (r.killedMatch === null) killedMatchNull++
      const pv = r.preventedBy === undefined ? 'missing' : String(r.preventedBy)
      preventedBy[pv] = (preventedBy[pv] || 0) + 1
      const effective = effectiveClassReason(r, amendments)
      const cls = (typeof effective.class === 'string' && effective.class) ? effective.class : 'unclassed'
      byClass[cls] = (byClass[cls] || 0) + 1
      if (typeof r.ts === 'string' && (!classLatest[cls] || r.ts > classLatest[cls])) classLatest[cls] = r.ts
      if (effective.class === null && effective.unclassedReason === null) {
        unclassedRows.push({ repo: repo.name, ts: r.ts, spec: r.spec, file: r.file, reviewRunId: r.reviewRunId, preventedBy: r.preventedBy })
      }
    }
    if (repoCount) byRepo[repo.name] = repoCount
  }
  unclassedRows.sort((a, b) => a.repo.localeCompare(b.repo) || String(a.ts).localeCompare(String(b.ts)))
  // D9: recurrent-unguarded = a class (excluding the unclassed bucket, which is a
  // missing-data bucket, not a defect class) with >=3 fleet-wide recurrences.
  const recurrentUnguarded = []
  for (const [cls, count] of Object.entries(byClass)) {
    if (cls === 'unclassed' || count < 3) continue
    recurrentUnguarded.push({ class: cls, count, latestTs: classLatest[cls] || null })
  }
  recurrentUnguarded.sort((a, b) => a.class.localeCompare(b.class))
  return { total, killedMatchNull, preventedBy, byClass, recurrentUnguarded, byRepo, amendments: amendmentsCount, unclassedRows }
}

// D6: cross the joined byClass count against the plugin's own shipped corpus — corpusGaps names
// every non-unclassed class at or past CORPUS_BAR with no corpus id (class asc); registry lists
// every non-unclassed class with its inCorpus flag (count desc, then class asc). Read fresh every
// run — this script never stores a derived value between runs (D12).
function computeCorpusCrossing(byClass) {
  const ids = new Set(parseCorpus(fs.readFileSync(corpusPath(), 'utf8')).map((c) => c.id))
  const corpusGaps = []
  const registry = []
  for (const [cls, count] of Object.entries(byClass)) {
    if (cls === 'unclassed') continue
    const inCorpus = ids.has(cls)
    registry.push({ class: cls, count, inCorpus })
    if (!inCorpus && count >= CORPUS_BAR) corpusGaps.push({ class: cls, count })
  }
  corpusGaps.sort((a, b) => a.class.localeCompare(b.class))
  registry.sort((a, b) => b.count - a.count || a.class.localeCompare(b.class))
  return { corpusGaps, registry }
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

// ---- query 7: cleanByVia ---------------------------------------------------------------------
// specs/20260901/03-unified-build-loop.md D9: per repo and fleet-total, for each via bucket
// (loop / direct / unknown — review rows carrying no via at all, pre-sibling-02 rows), the same
// {cleans, contradicted} shape query 5 (computeCleanContradicted) already derives, using the
// EXACT reviewRunId<->runId join that query uses. A4: this is a sibling function, never a
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
// Current-shape classifier (D14): a row is in-shape iff every applicable rule holds; each
// failure increments a named reason bucket. Unparseable lines are counted separately (per
// repo, at parse time) and never reach this classifier.

const STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay', 'observe', 'release'])
const SPEC_STAGES = new Set(['plan', 'build', 'review', 'escape', 'escape-class', 'replay'])
const TIERS = new Set(['standard', 'critical'])

// D5 (specs/20260901/07-escape-class-contract.md): the drift census routes every escape and
// escape-class row through lib/escape-row.js's validator. `escapeKeys` is the set of every
// escape row's own key in this repo — an escape-class row whose key matches none of them is an
// orphan amendment (amendment-unmatched), never `stage-unknown` (escape-class IS a known
// stage). `amendments` is this repo's joinAmendments() map — an escape row whose key is
// amended is validated with {amended:true} so its own missing class does not double-count as
// class-missing; the amendment row itself is validated unconditionally.
function classifyRow(r, { amendments, escapeKeys }) {
  const reasons = []
  if (typeof r.ts !== 'string') reasons.push('missing-ts')
  const stageOk = typeof r.stage === 'string' && STAGES.has(r.stage)
  if (!stageOk) reasons.push('stage-unknown')
  if (stageOk && SPEC_STAGES.has(r.stage) && typeof r.spec !== 'string') reasons.push('missing-spec')
  if (r.tier !== undefined && !TIERS.has(r.tier)) reasons.push('pre-v7-tier')
  if (r.stage === 'review' && typeof r.verdict !== 'string') reasons.push('review-missing-verdict')
  if (r.stage === 'escape') {
    const amended = amendments.has(escapeKey(r))
    reasons.push(...validateEscapeRow(r, { amended }))
  }
  if (r.stage === 'escape-class') {
    reasons.push(...validateAmendmentRow(r))
    if (!escapeKeys.has(escapeKey(r))) reasons.push('amendment-unmatched')
  }
  return reasons
}

function computeDriftCensus(reposList) {
  const byRepo = []
  for (const repo of reposList) {
    let inShape = 0
    const drift = {}
    const amendments = joinAmendments(repo.rawRows)
    const escapeKeys = new Set(repo.rawRows.filter(r => r.stage === 'escape').map(r => escapeKey(r)))
    for (const r of repo.rawRows) {
      const reasons = classifyRow(r, { amendments, escapeKeys })
      if (!reasons.length) inShape++
      else for (const reason of reasons) drift[reason] = (drift[reason] || 0) + 1
    }
    byRepo.push({ name: repo.name, inShape, drift, unparseable: repo.unparseable, unreadable: repo.unreadable })
  }
  return { byRepo }
}

// ---- query 9: owed ----------------------------------------------------------------------------
// specs/20260903/01-owed-query-and-row-handoff.md D1-D7: every plugin-blaming row across this
// machine's checkouts, grouped by effective class with a derived fixed/in-flight/uncited/unknown
// citation status. Owner rule (D2): preventedBy review-check|runtime-leg -> owed item;
// enforcer|test -> hostOwned (never listed); anything else (doctrine|none|missing|out-of-enum)
// -> ambiguous (listed, never grouped). D3: a self-repair repo's plugin-blaming escape rows are
// never listed (selfRepairExcluded counts them; their class's recurrences, read from
// escapes.byClass, still counts them) — a self-repair repo's OWN missed replay rows ARE listed
// (a reviewer measurement is fleet evidence regardless of whose repo it ran in).

const CITATION_SURFACES = ['specs', 'spec', 'tests']

function ownerBucket(preventedBy) {
  if (preventedBy === 'review-check' || preventedBy === 'runtime-leg') return 'item'
  if (preventedBy === 'enforcer' || preventedBy === 'test') return 'hostOwned'
  return 'ambiguous'
}

// D5: walk specs/, spec/, tests/ recursively under every self-repair repo; a missing surface
// directory scans as zero files (readdirSync's ENOENT is caught, never thrown onward); an
// unreadable file inside a scanned surface is skipped and contributes nothing to `files` — never
// a crash, since this scan is read-only advisory. `null` (never an empty-but-present shape) when
// the population holds no self-repair repo at all, so a caller can tell "scanned, found nothing"
// apart from "never scanned".
function scanCitationSurfaces(selfRepairRepos) {
  if (!selfRepairRepos.length) return null
  const roots = selfRepairRepos.map(r => path.resolve(r.dir))
  const records = []
  let filesScanned = 0
  for (const repo of selfRepairRepos) {
    for (const surface of CITATION_SURFACES) {
      const surfaceDir = path.join(repo.dir, surface)
      let entries
      try {
        entries = fs.readdirSync(surfaceDir, { recursive: true, withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        if (!e.isFile()) continue
        const parentPath = e.parentPath !== undefined ? e.parentPath : e.path
        const fullPath = path.join(parentPath, e.name)
        let text
        try {
          text = fs.readFileSync(fullPath, 'utf8')
        } catch {
          continue
        }
        filesScanned++
        const relPath = path.relative(repo.dir, fullPath).split(path.sep).join('/')
        // Spec frontmatter status (D5 Contracts): the first `^status:\s*(\S+)` line inside the
        // leading `---` block — a narrower grammar than lib/frontmatter's general fmValue, pinned
        // by this spec directly rather than reused.
        let status = null
        if (surface === 'specs') {
          const m = /^status:\s*(\S+)/m.exec(fmBlock(text))
          status = m ? m[1] : null
        }
        records.push({ relPath, surface, status, text })
      }
    }
  }
  return { roots, files: filesScanned, records }
}

// D5/D7: derive {cited, next} for one item key against the citation scan (or the citationScan:
// null case). A hit under spec/ or tests/, or under specs/ in a status:done spec, marks fixed
// (by lists every such hit, path asc); a hit only under specs/ in a non-done spec marks
// in-flight (by lists those hits; next names the first one's path and its own status); no hit at
// all marks uncited; no self-repair repo in the population marks every item unknown.
function citeItem(key, scan, reposRoot) {
  if (!scan) {
    return {
      cited: { status: 'unknown', by: [] },
      next: `no plugin checkout under ${reposRoot} — fixed-status unknown`,
    }
  }
  const fixedHits = []
  const inFlightHits = []
  for (const rec of scan.records) {
    if (!rec.text.includes(key)) continue
    if (rec.surface === 'spec' || rec.surface === 'tests') { fixedHits.push(rec.relPath); continue }
    // surface === 'specs'
    if (rec.status === 'done') fixedHits.push(rec.relPath)
    else inFlightHits.push({ path: rec.relPath, status: rec.status || 'unknown' })
  }
  if (fixedHits.length) {
    fixedHits.sort()
    return { cited: { status: 'fixed', by: fixedHits }, next: `cited by ${fixedHits[0]}` }
  }
  if (inFlightHits.length) {
    inFlightHits.sort((a, b) => a.path.localeCompare(b.path))
    const first = inFlightHits[0]
    return {
      cited: { status: 'in-flight', by: inFlightHits.map(h => h.path) },
      next: `cited by ${first.path} (${first.status}) — lands when that spec closes`,
    }
  }
  return {
    cited: { status: 'uncited', by: [] },
    next: `reproduce in tests/fixtures/ before claiming; cite ${key} in the fixing spec (Rationale or Decisions) or the fixing test header`,
  }
}

// D6: the docs/spec-feedback/*.md hand-rolled frontmatter parser. Returns null when the file
// carries no leading `---\n…\n---` block at all (parsed:false); otherwise an array (possibly
// empty) of { id, category, stage, severity, intake } entries read from the `findings:` list —
// which opens at a `findings:` line and ends at the next non-indented line. No YAML library, no
// multi-line values, no other keys read.
function parseSpecFeedback(text) {
  const block = fmBlock(text)
  if (!block) return null
  const lines = block.split('\n')
  const startIdx = lines.findIndex(l => /^findings:\s*$/.test(l))
  const findings = []
  if (startIdx !== -1) {
    let current = null
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^\S/.test(line)) break // next non-indented line ends the list
      const idMatch = /^\s*-\s*id:\s*(\S+)/.exec(line)
      if (idMatch) {
        if (current) findings.push(current)
        current = { id: idMatch[1], category: null, stage: null, severity: null, intake: false }
        continue
      }
      if (!current) continue
      const catMatch = /^\s*category:\s*(\S+)/.exec(line)
      if (catMatch) { current.category = catMatch[1]; continue }
      const stageMatch = /^\s*stage:\s*(\S+)/.exec(line)
      if (stageMatch) { current.stage = stageMatch[1]; continue }
      const sevMatch = /^\s*severity:\s*(\S+)/.exec(line)
      if (sevMatch) { current.severity = sevMatch[1]; continue }
      if (/^\s*intake:/.test(line)) { current.intake = true; continue }
    }
    if (current) findings.push(current)
  }
  return findings
}

function computeOwed(reposList, reposRoot, escapesByClass) {
  const selfRepairRepos = reposList.filter(r => r.selfRepair)
  const scan = scanCitationSurfaces(selfRepairRepos)
  let selfRepairExcluded = 0
  let hostOwned = 0
  const groupsMap = new Map()
  const ambiguous = []

  function pushGroup(cls, item) {
    const key = cls || 'unclassed'
    if (!groupsMap.has(key)) groupsMap.set(key, [])
    groupsMap.get(key).push(item)
  }

  for (const repo of reposList) {
    const amendments = joinAmendments(repo.rawRows)
    for (const r of repo.rawRows) {
      if (r.stage === 'escape') {
        const bucket = ownerBucket(r.preventedBy)
        if (bucket === 'hostOwned') { hostOwned++; continue }
        if (bucket === 'item' && repo.selfRepair) { selfRepairExcluded++; continue }
        const effective = effectiveClassReason(r, amendments)
        const itemClass = (typeof effective.class === 'string' && effective.class) ? effective.class : null
        const key = `escape:${repo.name}:${r.ts}:${r.file}`
        const { cited, next } = citeItem(key, scan, reposRoot)
        const item = {
          kind: 'escape', key, repo: repo.name, ts: r.ts, spec: r.spec, file: r.file,
          class: itemClass, preventedBy: r.preventedBy,
          reviewRunId: r.reviewRunId !== undefined ? r.reviewRunId : null,
          cited, next,
        }
        if (bucket === 'ambiguous') { ambiguous.push(item); continue }
        pushGroup(itemClass, item)
      } else if (r.stage === 'replay' && r.outcome === 'missed') {
        const itemClass = (typeof r.class === 'string' && r.class) ? r.class : null
        const key = r.runId
        const { cited, next } = citeItem(key, scan, reposRoot)
        const item = {
          kind: 'replay', key, repo: repo.name, ts: r.ts, spec: r.spec, runId: r.runId,
          class: itemClass, outcome: 'missed',
          reviewRunId: r.reviewRunId !== undefined ? r.reviewRunId : null,
          cited, next,
        }
        pushGroup(itemClass, item)
      }
    }
  }

  const sortItems = (items) => items.sort((a, b) => a.repo.localeCompare(b.repo) || String(a.ts).localeCompare(String(b.ts)))
  const groups = Array.from(groupsMap.entries()).map(([cls, items]) => {
    sortItems(items)
    const recurrences = escapesByClass[cls] || 0
    return {
      class: cls, recurrences,
      policy: `core § Incident Policy (recurrences ${recurrences}; guard bar 3)`,
      items,
    }
  })
  groups.sort((a, b) => a.class.localeCompare(b.class))
  sortItems(ambiguous)

  // D6: docs/spec-feedback/*.md — a flat glob of that one directory per repo (never nested); a
  // repo with no such directory contributes no files entry at all.
  const feedbackFiles = []
  const feedbackUnstamped = []
  for (const repo of reposList) {
    const dir = path.join(repo.dir, 'docs', 'spec-feedback')
    let names
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const name of names.filter(n => n.endsWith('.md')).sort()) {
      const filePath = path.join(dir, name)
      let text
      try { text = fs.readFileSync(filePath, 'utf8') } catch { continue }
      const relPath = `docs/spec-feedback/${name}`
      const findings = parseSpecFeedback(text)
      if (findings === null) {
        feedbackFiles.push({ path: relPath, parsed: false, findings: 0, unstamped: 0 })
        continue
      }
      const unstamped = findings.filter(f => !f.intake)
      feedbackFiles.push({ path: relPath, parsed: true, findings: findings.length, unstamped: unstamped.length })
      for (const f of unstamped) {
        const { cited, next } = citeItem(f.id, scan, reposRoot)
        feedbackUnstamped.push({
          kind: 'feedback', key: f.id, repo: repo.name, path: relPath,
          id: f.id, category: f.category, stage: f.stage, severity: f.severity,
          cited, next,
        })
      }
    }
  }
  feedbackFiles.sort((a, b) => a.path.localeCompare(b.path))
  feedbackUnstamped.sort((a, b) => a.key.localeCompare(b.key))

  return {
    citationScan: scan ? { roots: scan.roots, surfaces: CITATION_SURFACES, files: scan.files } : null,
    selfRepairExcluded,
    hostOwned,
    groups,
    ambiguous,
    feedback: { files: feedbackFiles, unstamped: feedbackUnstamped },
  }
}

const legRecency = computeLegRecency(reposData)
const gate08 = computeGate08(reposData)
const escapes = computeEscapes(reposData)
Object.assign(escapes, computeCorpusCrossing(escapes.byClass))
const replayDebt = computeReplayDebt(reposData)
const cleanContradicted = computeCleanContradicted(reposData)
const cleanByVia = computeCleanByVia(reposData)
const driftCensus = computeDriftCensus(reposData)
const owed = computeOwed(reposData, reposRoot, escapes.byClass)

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
    population, legRecency, gate08, escapes, replayDebt, cleanContradicted, driftCensus, cleanByVia, owed,
  }, null, 2) + '\n'))
}

// ---- human render (D4/D13/D14 Behavior): population first, then queries 1-6 numbered, each
// with a one-line takeaway heading. This reader owns its render like spec-status.js does —
// never routed through report-render.js. Never a claim of fleet completeness: the population
// block is scoped to "this machine's checkouts" wording only.

function renderPopulation(pop) {
  const lines = [`Fleet population — scoped to this machine's checkouts under ${pop.reposRoot} (scanned: ${pop.scanned})`]
  if (!pop.repos.length) lines.push('  (no repos found)')
  for (const r of pop.repos) {
    // A readdir/read failure is never "no ledger" (D4) — that marker is reserved for a
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
  const lines = [`3. Escapes — ${esc.total} total, ${esc.killedMatchNull} with no kill match`]
  lines.push(`  preventedBy: ${Object.entries(esc.preventedBy).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)
  lines.push(`  byClass: ${Object.entries(esc.byClass).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`)
  // D12: the unclassed-rows line is the first carrier of D11's backfill obligation — printed
  // only when N > 0 so a clean fleet never shows a false-positive nudge; the amendments line
  // always prints so the joined count's other half is never invisible.
  if (esc.unclassedRows.length > 0) {
    lines.push(`  unclassed rows needing a class: ${esc.unclassedRows.length} — run /spec:escape --backfill`)
  }
  lines.push(`  amendments: ${esc.amendments}`)
  if (esc.recurrentUnguarded.length) {
    lines.push('  recurrentUnguarded:')
    for (const r of esc.recurrentUnguarded) lines.push(`    ${r.class}: ${r.count} recurrences, latest ${r.latestTs || 'n/a'}`)
  } else if (esc.byClass.unclassed > 0) {
    lines.push(`  recurrentUnguarded: unclassed: ${esc.byClass.unclassed} — class labels start accruing from escape.md's class field`)
  } else {
    lines.push('  recurrentUnguarded: none')
  }
  // D6: corpusGaps — one line per gap, naming the class and its exact fleet-wide count with the
  // authoring remedy verbatim; "corpusGaps: none" when there is no gap.
  if (esc.corpusGaps.length) {
    for (const g of esc.corpusGaps) {
      lines.push(`  corpusGaps: ${g.class} (${g.count} recurrences) — author its section under ## Derived classes in spec/doctrine/replay-corpus.md`)
    }
  } else {
    lines.push('  corpusGaps: none')
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

// specs/20260901/03-unified-build-loop.md D9/Contracts: one line, exact wording and middle-dot
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

// D7: the owed render — population first, then class groups (header + one line per non-fixed
// item), ambiguous owners, spec-feedback, then trailing hidden:/excluded: counts that keep every
// exclusion visible (never a silent drop). D1: --owed is a render SELECTOR — this replaces
// queries 1-6/cleanByVia in the printed output, never adds to them; the full nine-query --json
// stays the sole complete machine view.
function bracketStatus(cited, next) {
  if (cited.status === 'uncited') return `[uncited → ${next}]`
  return `[${cited.status}: ${next}]`
}

function renderOwedItemLine(item) {
  if (item.kind === 'escape') {
    return `${item.key}  preventedBy=${item.preventedBy} repo=${item.repo} spec=${item.spec}  ${bracketStatus(item.cited, item.next)}`
  }
  return `${item.key}  outcome=${item.outcome} repo=${item.repo} spec=${item.spec}  ${bracketStatus(item.cited, item.next)}`
}

function renderOwed(ow, reposRootValue) {
  const scanLabel = ow.citationScan
    ? `${ow.citationScan.roots.join(', ')} — ${ow.citationScan.files} files`
    : `no plugin checkout under ${reposRootValue} — fixed-status unknown`
  const lines = [`Owed — plugin-blaming rows across this machine's checkouts (citation scan: ${scanLabel})`]

  const allItems = []
  for (const g of ow.groups) allItems.push(...g.items)
  allItems.push(...ow.ambiguous)
  allItems.push(...ow.feedback.unstamped)
  const hidden = allItems.filter(i => i.cited.status === 'fixed').length

  const empty = ow.groups.length === 0 && ow.ambiguous.length === 0 && ow.feedback.unstamped.length === 0
  if (empty) {
    lines.push('owed: none — every plugin-blaming row on this machine is cited')
  } else {
    for (const g of ow.groups) {
      lines.push(`  ${g.class}: recurrences=${g.recurrences} → ${g.policy}`)
      for (const item of g.items) {
        if (item.cited.status === 'fixed') continue
        lines.push(`    ${renderOwedItemLine(item)}`)
      }
    }
    if (ow.ambiguous.length) {
      lines.push(`  ambiguous owner (preventedBy doctrine|none — no cited gotcha links a row): ${ow.ambiguous.length} rows`)
      for (const item of ow.ambiguous) {
        if (item.cited.status === 'fixed') continue
        lines.push(`    ${renderOwedItemLine(item)}`)
      }
    }
    if (ow.feedback.files.length || ow.feedback.unstamped.length) {
      lines.push(`  spec-feedback — files=${ow.feedback.files.length} unstamped=${ow.feedback.unstamped.length}`)
      for (const f of ow.feedback.unstamped) {
        if (f.cited.status === 'fixed') continue
        lines.push(`    ${f.repo}: ${f.path} ${f.id} category=${f.category} stage=${f.stage} severity=${f.severity}  ${bracketStatus(f.cited, f.next)}`)
      }
    }
  }
  lines.push(`  hidden: ${hidden} rows already cited by landed code or a done spec`)
  lines.push(`  excluded: selfRepair=${ow.selfRepairExcluded} hostOwned=${ow.hostOwned}`)
  return lines.join('\n')
}

if (!json) {
  if (owedFlag) {
    console.log([
      renderPopulation(population),
      renderOwed(owed, reposRoot),
    ].join('\n\n'))
  } else {
    console.log([
      renderPopulation(population),
      renderLegRecency(legRecency),
      renderGate08(gate08),
      renderEscapes(escapes),
      renderReplayDebt(replayDebt),
      renderCleanContradicted(cleanContradicted),
      renderDriftCensus(driftCensus),
      renderCleanByVia(cleanByVia),
    ].join('\n\n'))
  }
}
