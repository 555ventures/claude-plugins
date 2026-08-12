#!/usr/bin/env node
'use strict'
// hotspot.js --root <dir> [--since <days>] [--top <n>] [--json] — ranks host files by
// churn × complexity to target /spec:audit's fan-out at the highest-risk surface, computed
// from git alone (no static-analysis tooling — dependency-free).
//
// Why (dated 2026-08-10 research session, brief 05 / specs/20260812/02-hotspot-audit.md): this
// repo's own audit-tooling research ratified churn×complexity — the CodeScene/Tornhill
// whitespace-complexity lineage — as the one empirically backed, dependency-free debt
// prioritizer. This is proactive tooling, not an incident fix.
//
// score = commits * (1 + complexity). complexity = sum over non-blank lines of
// ceil(leadingWhitespaceColumns / 4), tab = 4 columns, measured at HEAD (via `git show
// HEAD:<path>`, never the working tree — uncommitted edits must not skew the score). Churn =
// distinct commits touching the path in the --since window, from `git log --no-renames
// --numstat` (--no-renames is REQUIRED: git's default rename detection emits combined
// `{old => new}` numstat rows that a naive parser silently drops — verified against this
// repo's own history, 15 such rows). Excluded from ranking: binary paths (numstat `-`
// columns), paths absent at HEAD (deleted since their last touch), and paths matching
// `pipelineOwnedPaths` (config optional, absent config/field skips this exclusion silently)
// via the shared `lib/glob-match.js` matcher plus its additive pipeline-noise baseline —
// /spec:audit's targeting must never rank a host's own generated surfaces as false hotspots.
//
// What it deliberately does NOT do: judge content, run from any second consumer besides
// /spec:audit (spec-paths hotspot is the sole call site), auto-fix anything, or follow
// renames across the window (--no-renames is deliberate — see above).
//
// Exit codes: 0 = success (including an empty ranking); 2 = usage error, --root is not a git
// repository or is unreadable, or a numstat row fails the `<added>\t<deleted>\t<path>` shape
// (message quotes the offending line — never silently dropped or skipped).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { globMatch, BASELINE_GLOBS } = require('./lib/glob-match')

function usage() {
  console.error('usage: hotspot.js --root <dir> [--since <days>] [--top <n>] [--json]')
}

let root = null, sinceDays = 90, top = 10, json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--since') sinceDays = Number(argv[++i])
  else if (a === '--top') top = Number(argv[++i])
  else if (a === '--json') json = true
  else { usage(); process.exit(2) }
}
if (!root || !Number.isFinite(sinceDays) || !Number.isFinite(top)) { usage(); process.exit(2) }

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' })
} catch {
  console.error(`hotspot: ${root} is not a git repository — run inside a git repo or pass --root <repo root>`)
  process.exit(2)
}

// ---- churn: git log --no-renames --numstat over the window (D5) ----------------------------

let logOut
try {
  logOut = execFileSync('git',
    ['log', '--no-renames', `--since=${sinceDays} days ago`, '--numstat', '--pretty=format:%H'],
    { cwd: root, encoding: 'utf8' })
} catch (e) {
  console.error(`hotspot: git log failed in ${root} — confirm --root is a readable git repo: ${e.message}`)
  process.exit(2)
}

const HASH_RE = /^[0-9a-f]{40}$/
const commitHashesByPath = new Map() // path -> Set<commit hash> (distinct commits touching it)
let currentHash = null
for (const line of logOut.split('\n')) {
  if (!line) continue
  if (HASH_RE.test(line)) { currentHash = line; continue }
  const parts = line.split('\t')
  if (parts.length !== 3) {
    console.error(`hotspot: unparseable git numstat row (expected "<added>\\t<deleted>\\t<path>"): ${JSON.stringify(line)}`)
    process.exit(2)
  }
  const [added, deleted, filePath] = parts
  if (added === '-' && deleted === '-') continue // binary path — excluded from ranking (D5)
  if (!commitHashesByPath.has(filePath)) commitHashesByPath.set(filePath, new Set())
  commitHashesByPath.get(filePath).add(currentHash)
}

// ---- pipeline-owned exclusions (D5): built-in baseline + additive config globs -------------

function loadConfig() {
  const p = path.join(root, '.claude/spec.config.json')
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return {} }
}
const config = loadConfig()
const pipelineOwned = BASELINE_GLOBS
  .concat(Array.isArray(config.pipelineOwnedPaths) ? config.pipelineOwnedPaths : [])

// ---- complexity: indentation sum at HEAD (D4) ------------------------------------------------

function fileComplexityAtHead(filePath) {
  let text
  try {
    text = execFileSync('git', ['show', `HEAD:${filePath}`],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null // absent at HEAD (deleted since its last touch) — excluded from ranking (D5)
  }
  let complexity = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let cols = 0
    for (const ch of line) {
      if (ch === ' ') cols += 1
      else if (ch === '\t') cols += 4
      else break
    }
    complexity += Math.ceil(cols / 4)
  }
  return complexity
}

const hotspots = []
for (const [filePath, hashes] of commitHashesByPath) {
  if (pipelineOwned.some(g => globMatch(g, filePath))) continue
  const complexity = fileComplexityAtHead(filePath)
  if (complexity === null) continue
  const commits = hashes.size
  hotspots.push({ path: filePath, commits, complexity, score: commits * (1 + complexity) })
}
hotspots.sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
const ranked = hotspots.slice(0, top)

if (json) {
  console.log(JSON.stringify({ window: { sinceDays }, hotspots: ranked }, null, 2))
} else {
  console.log(`hotspot ranking — window: last ${sinceDays} day(s), top ${ranked.length}`)
  console.log('score      commits  complexity  path')
  for (const h of ranked) {
    console.log(`${String(h.score).padStart(6)}  ${String(h.commits).padStart(7)}  ${String(h.complexity).padStart(10)}  ${h.path}`)
  }
}
process.exit(0)
