#!/usr/bin/env node
'use strict'
// observe-ci.js [--root <dir>] — the post-review red alarm: nothing owned the time
// between /spec:review flipping a spec to `done` and CI proving the landed code broke, and the
// confirmed 2026-08 escape lived undetected in exactly that gap for days
// (specs/20260805/03-done-unobserved-observation.md). specs/20260807/01-observation-red-alarm.md
// (D3) retired that spec's per-spec pending-or-red candidate loop and per-spec `build_base`
// branch resolution in favor of ONE branch-level check per invocation: resolve the default
// branch once, query ci-query.js once, and react only to a completed run. A completed **red**
// run is attributed by ancestry (D4 plumbing kept) to the latest-closing done spec whose close
// commit it contains — one row, never one per contained spec; a spec already red never loses the
// alarm to a later-closing spec on a fresh red run, it just gets its evidence (sha/url/runAt)
// refreshed. A completed **green** run appends a clearing row for every currently-red done spec
// whose close commit it contains (an out-of-order green re-run of an older commit clears
// nothing). Anything else — unavailable CI (structural or transient), a run still in progress —
// is silent: no append, no ⚠️ nag (retry is free at the next invocation).
//
// What this deliberately does NOT do: write `ci:"none"` rows (the retired certification state —
// historical `none` rows stay in the ledger, inert, but this script never writes a new one);
// retry a transient gh failure in-process; consult a per-spec `build_base` (one branch, once);
// interpret WHICH of several implicated specs "really" caused a red run beyond the latest-close
// heuristic (`/spec:escape`'s no-escape-if-unimplicated stop is the sanctioned corrector); run
// from inside a worktree (exit 4 — observation writes happen at the repo root only, the
// merge-back exit-4 precedent for the same divergent-worktree double-write class).
//
// 2026-08-13 (specs/20260813/10-host-capabilities.md D2): a host with no forge adapter was
// silently probed every invocation via ci-query.js's dynamic `gh` fallback. When the host config
// declares `capabilities.forge:"none"`, this script now reads that declaration itself (D2: both
// CI consumers gate independently — ci-query.js's own JSON contract can't carry the plain
// canonical line without breaking observe-ci's `JSON.parse` of its output) and short-circuits
// BEFORE resolving a branch or spawning ci-query.js: prints the canonical line
// `unavailable — no supported forge adapter` and exits 0, no ledger append. `forge:"github"` or
// an absent `capabilities` block (legacy mode) fall through to the unchanged dynamic probe.
//
// Exit codes: 0 = ran (silence is a normal outcome, not a failure) · 2 = usage ·
// 4 = refused — CWD is inside .claude/worktrees/...; relocate to the repo root and re-run.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readLedgerRows, qualifyingObservation } = require('./lib/observation')
const { declaredForge } = require('./lib/host-config')

let root = '.'
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else {
    console.error('usage: observe-ci.js [--root <dir>]')
    process.exit(2)
  }
}

// D2: capabilities.forge:"none" is a declared, not probed, fact — read it before resolving a
// branch or spawning ci-query.js. A missing/unreadable/unparsable config is legacy mode;
// lib/host-config.js is the sole reader of that declaration for both CI scripts.
if (declaredForge(root) === 'none') {
  console.log('unavailable — no supported forge adapter')
  process.exit(0)
}

// Refuse before touching anything: observation writes happen at the repo root only — a session
// standing inside a build worktree observing "done" specs would append rows the root checkout
// (and every other worktree) never sees, the same divergent-worktree double-write class
// merge-back's exit 4 already guards.
{
  const cwdParts = process.cwd().split(path.sep)
  const idx = cwdParts.indexOf('.claude')
  if (idx !== -1 && cwdParts[idx + 1] === 'worktrees') {
    console.error('observe-ci: REFUSING — session CWD is inside a worktree (.claude/worktrees/...).')
    console.error('Relocate to the repo root first (ExitWorktree if this session entered it, else `cd` in the main session), then re-run.')
    process.exit(4)
  }
}

// ---- specs/** frontmatter (done specs only) -----------------------------------------------

function walkMd(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkMd(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (!kv) continue
    fm[kv[1]] = kv[2].replace(/\s*#.*$/, '').trim()
  }
  return fm
}

const doneSpecs = []
for (const file of walkMd(path.join(root, 'specs'))) {
  const text = fs.readFileSync(file, 'utf8')
  const fm = frontmatter(text)
  if (!fm || fm.status !== 'done') continue
  doneSpecs.push({ path: path.relative(root, file).split(path.sep).join('/') })
}

// ---- ledger reads (live + archives, filename order then line order — D2/A6) ----------------
// readLedgerRows/qualifyingObservation (D2 algorithm) now live in lib/observation.js — shared
// with spec-status.js instead of a second derivation drifting apart (2026-08-06 review of
// specs/20260805/03-done-unobserved-observation.md). CLI behavior here is byte-identical.
const ledgerRows = readLedgerRows(root)

// The spec currently holding the alarm, if any — D3's "at most one spec holds the alarm at any
// time" invariant, read back from the ledger this script itself maintains.
const currentRed = doneSpecs
  .map(s => ({ spec: s, latest: qualifyingObservation(ledgerRows, s.path) }))
  .find(x => x.latest && x.latest.ci === 'red') || null

// ---- branch resolution — once, no per-spec build_base (D3) ----------------------------------

function resolveBranch() {
  const symref = spawnSync('git', ['-C', root, 'symbolic-ref', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' })
  if (symref.status === 0) return symref.stdout.trim().replace(/^refs\/remotes\/origin\//, '')
  const cur = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
  return cur.status === 0 ? cur.stdout.trim() : 'HEAD'
}

const branch = resolveBranch()

// ---- ci-query.js — once per invocation (D3) --------------------------------------------------

const CI_QUERY = path.join(__dirname, 'ci-query.js')
function queryBranch(b) {
  const r = spawnSync(process.execPath, [CI_QUERY, '--branch', b, '--root', root], { encoding: 'utf8' })
  try {
    return JSON.parse(r.stdout)
  } catch {
    return { available: false, transient: true }
  }
}

const q = queryBranch(branch)

// ---- D4 ancestry: run.sha must descend from a spec's close commit ---------------------------

function closeInfo(specPath) {
  const r = spawnSync('git', ['-C', root, 'log', '-1', '--format=%H%x09%cI', '--', specPath], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout.trim()) return null
  const [sha, ts] = r.stdout.trim().split('\t')
  return sha ? { sha, ts } : null
}

function isAncestor(ancestor, descendant) {
  const r = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant], { encoding: 'utf8' })
  return r.status === 0
}

function shaKnownLocally(sha) {
  const r = spawnSync('git', ['-C', root, 'cat-file', '-e', sha], { encoding: 'utf8' })
  return r.status === 0
}

// One fetch fallback for an unknown sha, then re-check — never more than once per invocation.
function ensureShaKnown(sha) {
  if (shaKnownLocally(sha)) return true
  spawnSync('git', ['-C', root, 'fetch', 'origin', branch], { encoding: 'utf8' })
  return shaKnownLocally(sha)
}

// ---- run -----------------------------------------------------------------------------------

const ledgerPath = path.join(root, '.claude', 'spec-runs.jsonl')
const appendRows = []
const outLines = []

function appendRow(specPath, ci) {
  appendRows.push({ ts: new Date().toISOString(), stage: 'observe', spec: specPath, branch, ci, sha: q.sha, url: q.url, runAt: q.runAt })
  outLines.push(`📡 observed ${specPath}: ${ci}`)
}

// Idempotence (D3, carried from spec 03): never append a row identical (same sha + ci) to the
// spec's current latest qualifying row.
function alreadyQualifies(specPath, ci) {
  const latest = qualifyingObservation(ledgerRows, specPath)
  return !!(latest && latest.sha === q.sha && latest.ci === ci)
}

if (q.available && q.status === 'completed') {
  const ci = q.conclusion === 'success' ? 'green' : 'red'

  if (ci === 'red') {
    if (currentRed) {
      // Sticky attribution: a spec already holding the alarm never loses it to a later-closing
      // spec on a fresh red run — only its evidence is refreshed (D3 refuter B finding 4).
      if (!alreadyQualifies(currentRed.spec.path, 'red')) {
        appendRow(currentRed.spec.path, 'red')
      }
    } else if (ensureShaKnown(q.sha)) {
      // Fresh attribution: among done specs whose close commit the run's sha descends from,
      // the latest-closing one takes the (sole) alarm; a timestamp tie breaks toward the
      // lexicographically last spec path.
      let winner = null
      for (const s of doneSpecs) {
        const info = closeInfo(s.path)
        if (!info || !isAncestor(info.sha, q.sha)) continue
        if (!winner || info.ts > winner.info.ts || (info.ts === winner.info.ts && s.path > winner.spec.path)) {
          winner = { spec: s, info }
        }
      }
      if (winner && !alreadyQualifies(winner.spec.path, 'red')) appendRow(winner.spec.path, 'red')
    }
  } else if (ensureShaKnown(q.sha)) {
    // Clearing: every currently-red done spec whose close commit the green run's sha descends
    // from gets a clearing row. A green run on a re-triggered older commit (ancestry miss)
    // clears nothing — run recency is completion order, not commit order (D3/A3).
    const redSpecs = doneSpecs
      .map(s => ({ spec: s, latest: qualifyingObservation(ledgerRows, s.path) }))
      .filter(x => x.latest && x.latest.ci === 'red')
    for (const { spec } of redSpecs) {
      const info = closeInfo(spec.path)
      if (info && isAncestor(info.sha, q.sha) && !alreadyQualifies(spec.path, 'green')) {
        appendRow(spec.path, 'green')
      }
    }
  }
}
// Unavailable (structural or transient) and not-completed runs fall through here: no append, no
// output — silence is the sanctioned outcome (D3).

if (appendRows.length) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.appendFileSync(ledgerPath, appendRows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

if (outLines.length) {
  console.log(outLines.join('\n'))
}
process.exit(0)
