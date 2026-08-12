#!/usr/bin/env node
'use strict'
// scope-reconcile.js --base <ref> --spec <path> (--json | --dirs) [--root <dir>] — reconciles
// the WHOLE changed-file set (committed diff UNION untracked) against a spec's File Plan.
//
// Incident (confirmed 2026-08): /spec:review diffed only the File Plan's directories, so an
// out-of-plan `waitForExit` edit was structurally invisible to review and rode a CLEAN verdict
// into production. This script inverts the File Plan's role from scope-definer to
// prediction-under-test: every changed file is seen; the plan's misses (out-of-plan) and
// overshoots (unrealized) both surface, mechanically, never by reviewer diligence.
//
// What it deliberately does NOT do: review file CONTENT, resolve `pipelineOwnedPaths` beyond
// the additive glob list in .claude/spec.config.json, or re-derive the changed set anywhere
// else — /spec:review and /spec:build's Final gate both call this, once each.
//
// Changed set = `git diff --name-status -M <base>` (BOTH sides of R/C rows) UNION `??` paths
// from `git status --porcelain --untracked-files=all` (the `=all` flag is required — plain
// `--porcelain` reports a wholly-untracked directory as one `?? dir/` line, not its files).
// A rename whose old path was planned realizes that plan row — reported once in `renamed`,
// never as an out-of-plan + unrealized finding pair.
//
// Exit codes: 0 = outOfPlan empty · 3 = outOfPlan non-empty · 2 = usage error, spec unreadable,
// spec has no File Plan table, or the git ref/repo is unusable.

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { parseFilePlan } = require('./lib/file-plan')
const { globMatch, pipelineOwnedGlobs } = require('./lib/glob-match')

function usage() {
  console.error('usage: scope-reconcile.js [--root <dir>] --base <ref> --spec <path> (--json | --dirs)')
}

let root = '.', base = null, specPath = null, mode = null
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--spec') specPath = argv[++i]
  else if (a === '--json') mode = 'json'
  else if (a === '--dirs') mode = 'dirs'
  else { usage(); process.exit(2) }
}
if (!base || !specPath || !mode) { usage(); process.exit(2) }

const specFull = path.join(root, specPath)
let specText
try {
  specText = fs.readFileSync(specFull, 'utf8')
} catch {
  console.error(`scope-reconcile: cannot read spec at ${specFull} — pass --spec <path relative to --root>`)
  process.exit(2)
}
const filePlanPaths = new Set(parseFilePlan(specText))
if (filePlanPaths.size === 0) {
  console.error(`scope-reconcile: no File Plan table found in ${specPath} — nothing to reconcile against`)
  process.exit(2)
}

// ---- pipeline-owned exclusions (D4): built-in defaults + additive config globs -------------

const pipelineOwned = pipelineOwnedGlobs(root)

// ---- changed set: git diff --name-status (both sides of R/C) UNION untracked (D3) ----------

let diffOut, statusOut
try {
  diffOut = execFileSync('git', ['diff', '--name-status', '-M', base], { cwd: root, encoding: 'utf8' })
  statusOut = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
} catch (e) {
  console.error(`scope-reconcile: git failed against --base ${base} in ${root} — confirm the ref exists (git rev-parse ${base}): ${e.message}`)
  process.exit(2)
}

const changed = new Set()
const renamed = []
for (const line of diffOut.split('\n')) {
  if (!line.trim()) continue
  const parts = line.split('\t')
  const kind = parts[0][0]
  if (kind === 'R' || kind === 'C') {
    changed.add(parts[1]); changed.add(parts[2])
    if (kind === 'R') renamed.push({ from: parts[1], to: parts[2] })
  } else {
    changed.add(parts[1])
  }
}
for (const line of statusOut.split('\n')) {
  if (line.startsWith('?? ')) changed.add(line.slice(3).trim())
}

const renamedFrom = new Set(renamed.map(r => r.from))
const excluded = [...changed].filter(p => pipelineOwned.some(g => globMatch(g, p))).sort()
const excludedSet = new Set(excluded)
// A rename's new path is exempt from outOfPlan only when its old path realized a plan row (or was
// itself pipeline-owned) — an unplanned file's rename is an ordinary out-of-plan new path, not a
// free pass; it still appears in `renamed` either way (visibility).
const realizedRenamedTo = new Set(
  renamed.filter(r => filePlanPaths.has(r.from) || excludedSet.has(r.from)).map(r => r.to)
)

const outOfPlan = [...changed]
  .filter(p => !filePlanPaths.has(p) && !excludedSet.has(p) && !renamedFrom.has(p) && !realizedRenamedTo.has(p))
  .sort()
const unrealized = [...filePlanPaths].filter(p => !changed.has(p)).sort()

if (mode === 'dirs') {
  const dirs = [...new Set([...changed].map(p => path.posix.dirname(p)))].sort()
  console.log(dirs.join('\n'))
} else {
  console.log(JSON.stringify({ outOfPlan, unrealized, excluded, renamed }, null, 2))
}
process.exit(outOfPlan.length ? 3 : 0)
