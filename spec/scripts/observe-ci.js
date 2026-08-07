#!/usr/bin/env node
'use strict'
// observe-ci.js [--root <dir>] [--json] — closes the post-review observation window: nothing
// owned the time between /spec:review flipping a spec to `done` and the first CI run on the
// landed code, and the confirmed 2026-08 escape lived undetected in exactly that gap for days
// (specs/20260805/03-done-unobserved-observation.md). For every done spec that is pending
// (no qualifying observe row yet) or currently red (stays under watch until it clears), this
// resolves a branch, queries ci-query.js (spec 02) at most once per distinct branch per run,
// validates the observed run's commit against the spec's close commit (D4 ancestry — a
// branch's latest run routinely predates an unpushed close, and without this check the
// mechanism stamps specs green on code the run never tested), and appends one `stage:"observe"`
// row per spec to `.claude/spec-runs.jsonl`.
//
// What this deliberately does NOT do: interpret WHICH spec on a shared branch caused a red run
// (that's attribution — /spec:escape's job, reading the run with full context); retry a
// transient gh failure (it prints one ⚠️ and leaves the spec pending for the next invocation);
// run from inside a worktree (exit 4 — observation writes happen at the repo root only, the
// merge-back exit-4 precedent for the same divergent-worktree double-write class).
//
// Exit codes: 0 = ran (per-candidate skips are report lines, not failures) · 2 = usage ·
// 4 = refused — CWD is inside .claude/worktrees/...; relocate to the repo root and re-run.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readLedgerRows, qualifyingObservation } = require('./lib/observation')

let root = '.'
let json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--json') json = true
  else {
    console.error('usage: observe-ci.js [--root <dir>] [--json]')
    process.exit(2)
  }
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
  doneSpecs.push({ path: path.relative(root, file).split(path.sep).join('/'), buildBase: fm.build_base || null })
}

// ---- ledger reads (live + archives, filename order then line order — D2/A6) ----------------
// readLedgerRows/qualifyingObservation (D2 algorithm) now live in lib/observation.js — shared
// with spec-status.js instead of a second derivation drifting apart (2026-08-06 review of
// specs/20260805/03-done-unobserved-observation.md). CLI behavior here is byte-identical.
function observationState(rows, specPath) {
  const latest = qualifyingObservation(rows, specPath)
  return latest ? { pending: false, latest } : { pending: true, latest: null }
}

const ledgerRows = readLedgerRows(root)

const candidates = []
for (const s of doneSpecs) {
  const state = observationState(ledgerRows, s.path)
  if (state.pending || state.latest.ci === 'red') candidates.push({ spec: s, state })
}

// ---- branch resolution -----------------------------------------------------------------------

function resolveBranch(spec) {
  if (spec.buildBase) return spec.buildBase
  const symref = spawnSync('git', ['-C', root, 'symbolic-ref', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' })
  if (symref.status === 0) return symref.stdout.trim().replace(/^refs\/remotes\/origin\//, '')
  const cur = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
  return cur.status === 0 ? cur.stdout.trim() : 'HEAD'
}

// ---- ci-query.js — at most once per distinct branch per run (in-run cache) ------------------

const CI_QUERY = path.join(__dirname, 'ci-query.js')
const queryCache = new Map()
function queryBranch(branch) {
  if (queryCache.has(branch)) return queryCache.get(branch)
  const r = spawnSync(process.execPath, [CI_QUERY, '--branch', branch, '--root', root], { encoding: 'utf8' })
  let result
  try {
    result = JSON.parse(r.stdout)
  } catch {
    result = { available: false, transient: true }
  }
  queryCache.set(branch, result)
  return result
}

// ---- D4 ancestry validity: run.sha must descend from the spec's close commit ----------------

function closeSha(specPath) {
  const r = spawnSync('git', ['-C', root, 'log', '-1', '--format=%H', '--', specPath], { encoding: 'utf8' })
  const sha = r.status === 0 ? r.stdout.trim() : ''
  return sha || null
}

function isAncestor(ancestor, descendant) {
  const r = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', ancestor, descendant], { encoding: 'utf8' })
  return r.status === 0
}

function shaKnownLocally(sha) {
  const r = spawnSync('git', ['-C', root, 'cat-file', '-e', sha], { encoding: 'utf8' })
  return r.status === 0
}

// ---- run -----------------------------------------------------------------------------------

const observed = []
const pending = []
const skipped = []
const outLines = []
const ledgerPath = path.join(root, '.claude', 'spec-runs.jsonl')
const appendRows = []

for (const { spec, state } of candidates) {
  const branch = resolveBranch(spec)
  const q = queryBranch(branch)

  if (!q.available && !q.transient) {
    // Structural unavailability: no gh, no remote, no runs on this branch — nothing to observe,
    // ever, on a CI-less host. Observation completes with ci:"none" so it never nags again.
    const already = state.latest && state.latest.ci === 'none'
    if (!already) {
      appendRows.push({ ts: new Date().toISOString(), stage: 'observe', spec: spec.path, branch, ci: 'none', sha: null, url: null, runAt: null })
      observed.push({ spec: spec.path, ci: 'none' })
      outLines.push(`📡 observed ${spec.path}: none`)
    }
    continue
  }
  if (!q.available && q.transient) {
    // A token blip must not permanently silence observation — append nothing, stay pending.
    skipped.push({ spec: spec.path, why: 'transient ci-query failure' })
    outLines.push(`⚠️ ${spec.path}: transient CI query failure — staying pending, retry next run`)
    pending.push(spec.path)
    continue
  }
  if (q.status !== 'completed') {
    // Run not finished — not evidence of anything yet.
    pending.push(spec.path)
    continue
  }

  const close = closeSha(spec.path)
  if (!close) {
    skipped.push({ spec: spec.path, why: 'no close commit found for spec file' })
    pending.push(spec.path)
    continue
  }
  if (!shaKnownLocally(q.sha)) {
    spawnSync('git', ['-C', root, 'fetch', 'origin', branch], { encoding: 'utf8' })
  }
  if (!shaKnownLocally(q.sha) || !isAncestor(close, q.sha)) {
    // Run predates (or is unrelated to) the close commit — never accepted as evidence.
    pending.push(spec.path)
    continue
  }

  const ci = q.conclusion === 'success' ? 'green' : 'red'
  // Idempotent: never append a row identical (same sha + ci) to the current latest qualifying row.
  if (state.latest && state.latest.sha === q.sha && state.latest.ci === ci) {
    observed.push({ spec: spec.path, ci })
    continue
  }
  appendRows.push({ ts: new Date().toISOString(), stage: 'observe', spec: spec.path, branch, ci, sha: q.sha, url: q.url, runAt: q.runAt })
  observed.push({ spec: spec.path, ci })
  outLines.push(`📡 observed ${spec.path}: ${ci}`)
}

if (appendRows.length) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.appendFileSync(ledgerPath, appendRows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

if (json) {
  console.log(JSON.stringify({ observed, pending, skipped }, null, 2))
} else if (outLines.length) {
  console.log(outLines.join('\n'))
}
process.exit(0)
