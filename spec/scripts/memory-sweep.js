#!/usr/bin/env node
'use strict'
// memory-sweep.js — surfaces agent-memory notes owed a disposition at review close.
//
// specs/20260823/06-prose-debt-pruning.md (2026-08-23, D5/D6/D7/D13): the disposition trigger
// used to be "the diff happened to touch the note FILE itself" — the wrong subject. A
// gate-scripts note was falsified by the same diff that shipped it and was caught only because
// that diff happened to touch the note's own file (specs/20260823/03); a note about the same
// defect living anywhere else would have ridden through undetected. This script surfaces a note
// for disposition when the diff touches what the note is ABOUT (diff-hit: a path-shaped token in
// the note's body matches a changed path or its basename) or when the note has outlived 10
// undisposed review closes (ttl-expired, oldest-first, capped at 3 per run — diff-hits are never
// capped). It deliberately does NOT dispose anything itself, does NOT read or require any
// frontmatter `subjects:` field (relevance is derived by grepping note bodies, per D6 — no
// note-writing contract change), and NEVER feeds `verdict.js` (D13: a disposition-trigger
// widener, not a gate) — it exits 0 whenever the sweep ran, findings or not.
//
// Usage: node memory-sweep.js --root <repo root> --diff <file with one changed path per line>
//        [--ledger <path>]   (default: <root>/.claude/spec-runs.jsonl)
// Scope: <root>/.claude/agent-memory/*/*.md, excluding MEMORY.md index files.
// diff-hit:    a path-shaped token in the note body ([A-Za-z0-9_./-]+\.(js|mjs|cjs|sh|md|json))
//              equals a changed path, or its basename equals a changed path's basename.
// ttl-expired: count of ledger rows with "stage":"review" whose ts postdates the note's last
//              git commit date (git log -1 --format=%cI -- <note>, run with cwd=<root>) is >= 10.
//              At most 3 ttl-expired notes per run, oldest git date first. A note already
//              surfaced as diff-hit is never also surfaced as ttl-expired.
// stdout (always, sole output): {"notes":[{"path":"...","reason":"diff-hit"|"ttl-expired",
//   "matched":"<token or ISO date>"}]}
//
// Exit codes:
//   0  sweep ran — with or without findings (NEVER a verdict input; nothing but the close-step
//      session reads this exit)
//   2  bad invocation: missing/unreadable --root or --diff, an explicitly-given --ledger that is
//      unreadable, or git not answering in --root (stderr names the remedy). A --ledger left at
//      its default and simply absent (a fresh repo with no review closes yet) is NOT an error —
//      it is read as zero rows, since D13 makes this sweep fail-open by design.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

let root = null
let diffPath = null
let ledgerPath = null
let ledgerExplicit = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--root') root = argv[++i]
  else if (argv[i] === '--diff') diffPath = argv[++i]
  else if (argv[i] === '--ledger') { ledgerPath = argv[++i]; ledgerExplicit = true }
}

function fail(code, msg) {
  console.error(`memory-sweep: ${msg}`)
  process.exit(code)
}

if (!root) fail(2, 'missing --root — usage: node memory-sweep.js --root <repo root> --diff <file>')
let rootStat
try {
  rootStat = fs.statSync(root)
} catch (e) {
  fail(2, `--root ${root} does not exist or is unreadable — pass the repo root the notes and git history live under`)
}
if (!rootStat.isDirectory()) fail(2, `--root ${root} is not a directory — pass the repo root`)
root = path.resolve(root)

if (!diffPath) fail(2, 'missing --diff — usage: node memory-sweep.js --root <repo root> --diff <file with one changed path per line>')
const resolvedDiffPath = path.isAbsolute(diffPath) ? diffPath : path.resolve(root, diffPath)
let diffText
try {
  diffText = fs.readFileSync(resolvedDiffPath, 'utf8')
} catch (e) {
  fail(2, `--diff ${diffPath} does not exist or is unreadable — pass a file with one changed repo-relative path per line`)
}
const changedPaths = diffText.split('\n').map((l) => l.trim()).filter(Boolean)

const resolvedLedgerPath = ledgerPath
  ? (path.isAbsolute(ledgerPath) ? ledgerPath : path.resolve(root, ledgerPath))
  : path.join(root, '.claude/spec-runs.jsonl')
let ledgerRows = []
if (ledgerExplicit && !fs.existsSync(resolvedLedgerPath)) {
  fail(2, `--ledger ${ledgerPath} does not exist or is unreadable — pass the path to the spec-runs.jsonl ledger, or omit --ledger to use <root>/.claude/spec-runs.jsonl`)
}
if (fs.existsSync(resolvedLedgerPath)) {
  let ledgerText
  try {
    ledgerText = fs.readFileSync(resolvedLedgerPath, 'utf8')
  } catch (e) {
    fail(2, `ledger ${resolvedLedgerPath} exists but could not be read — check its permissions`)
  }
  for (const line of ledgerText.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed)
      if (row && row.stage === 'review' && row.ts) ledgerRows.push(row.ts)
    } catch (e) {
      // malformed ledger line — skip it, never a fatal sweep error
    }
  }
}

// git must be able to answer from --root, or every commit-date lookup below is meaningless.
const repoCheck = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' })
if (repoCheck.error || repoCheck.status === null || repoCheck.status !== 0) {
  fail(2, `git is not answering in --root ${root} — ensure git is installed and --root is a git repository (run \`git rev-parse --is-inside-work-tree\` there to diagnose)`)
}

function listNotes(repoRoot) {
  const base = path.join(repoRoot, '.claude/agent-memory')
  if (!fs.existsSync(base)) return []
  const out = []
  for (const agentDirent of fs.readdirSync(base, { withFileTypes: true })) {
    if (!agentDirent.isDirectory()) continue
    const agentDir = path.join(base, agentDirent.name)
    for (const fileDirent of fs.readdirSync(agentDir, { withFileTypes: true })) {
      if (!fileDirent.isFile()) continue
      if (!fileDirent.name.endsWith('.md')) continue
      if (fileDirent.name === 'MEMORY.md') continue
      out.push(path.join(agentDir, fileDirent.name))
    }
  }
  return out
}

function relPath(repoRoot, abs) {
  return path.relative(repoRoot, abs).split(path.sep).join('/')
}

const TOKEN_RE = /[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|sh|md|json)/g

function findDiffHit(body, diffLines) {
  const tokens = body.match(TOKEN_RE) || []
  for (const token of tokens) {
    for (const changed of diffLines) {
      if (token === changed || path.basename(token) === path.basename(changed)) {
        return token
      }
    }
  }
  return null
}

// git log's date lookup runs with cwd=root (never process.cwd()) so it always answers about
// THIS repo's history, per --root anchoring. spawnSync's `status` is null on signal kill, spawn
// failure, or maxBuffer overflow — that must be an explicit branch here, never handed to
// process.exit or treated as success.
function lastCommitDate(repoRoot, noteRel) {
  const r = spawnSync('git', ['log', '-1', '--format=%cI', '--', noteRel], { cwd: repoRoot, encoding: 'utf8' })
  if (r.error || r.status === null || r.status !== 0) return null
  const out = (r.stdout || '').trim()
  return out || null
}

const notePaths = listNotes(root)
const diffHits = []
const ttlCandidates = []

for (const abs of notePaths) {
  const rel = relPath(root, abs)
  let body
  try {
    body = fs.readFileSync(abs, 'utf8')
  } catch (e) {
    continue
  }
  const matchedToken = findDiffHit(body, changedPaths)
  if (matchedToken) {
    diffHits.push({ path: rel, reason: 'diff-hit', matched: matchedToken })
    continue
  }
  const commitDate = lastCommitDate(root, rel)
  if (!commitDate) continue
  const commitTime = Date.parse(commitDate)
  const postdatingCount = ledgerRows.reduce((n, ts) => {
    const t = Date.parse(ts)
    return (!Number.isNaN(t) && t > commitTime) ? n + 1 : n
  }, 0)
  if (postdatingCount >= 10) {
    ttlCandidates.push({ path: rel, reason: 'ttl-expired', matched: commitDate, commitTime })
  }
}

ttlCandidates.sort((a, b) => a.commitTime - b.commitTime)
const ttlSurfaced = ttlCandidates.slice(0, 3).map(({ path: p, reason, matched }) => ({ path: p, reason, matched }))

const notes = diffHits.concat(ttlSurfaced)
process.stdout.write(JSON.stringify({ notes }) + '\n')
process.exit(0)
