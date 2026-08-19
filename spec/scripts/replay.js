#!/usr/bin/env node
'use strict'
// replay.js --due
//         | --select
//         | --setup --commit <sha> --dir <path>
//         | --apply --dir <path> --patch <file> --class <id>
//         | --score --workflow <file> --file <path> --line N
//         | --record --spec <path> --review-run-id <id> --class <id> --file <path>
//                     --legs green|red:<leg> --outcome caught|missed|leg-caught
//                     [--patch <file>] [--workflow <file>] [--tokens N]
//         | --stats
//         | --teardown --dir <path>
//
// Incident (2026-08-18, specs/20260819/01-review-evidence-retention.md's Fable retainer pass):
// a known defect was hand-dropped into a just-CLEANed spec's tree and the standard reviewer was
// dispatched blind against it — a one-off consult, not a repeatable measurement. spec
// specs/20260819/02-mutation-replay.md turns that eval into a scheduled, deterministic harness:
// this script owns every mechanical step (dueness, priority selection, scratch-worktree setup/
// mutation-apply/teardown, deterministic scoring, ledger recording, catch-rate stats) as flag
// modes, so /spec:replay's session supplies only the two judgment steps this file deliberately
// leaves alone — authoring the mutation patch from a corpus recipe, and adjudicating an
// `ambiguous` score. review-legs.js is the sole leg deriver; this script never re-implements it
// (D6) — the orchestrating session runs legs itself and passes the verdict in via --record
// --legs.
//
// What this deliberately does NOT do: derive review-legs verdicts, touch the main working tree
// (--setup/--apply/--teardown only ever act on a --dir the caller supplies; --setup refuses one
// that resolves inside the repo root, and --teardown refuses one carrying no .replay-worktree
// marker — the marker guard means teardown can only ever delete a directory THIS harness
// created), or retry/poll anything.
//
// Root resolution: every ledger/git-reading mode (--select/--setup/--teardown use git; --due/
// --record/--stats read the ledger) resolves against `process.cwd()` — there is no --root flag,
// matching spec-status.js's own cwd-default shape. --apply and --score take their target as an
// explicit --dir/--workflow flag and never consult cwd at all.
//
// Exit codes: 0 = mode succeeded (--due: due; --select: printed a selection; --score: printed a
// score) · 1 = --due not due, or --select found no eligible CLEAN review row in the window ·
// 2 = usage error / missing required flag / unreadable or unparseable input · 3 = safety
// refusal (--setup --dir resolves inside the repo root; --teardown --dir carries no
// .replay-worktree marker) · 4 = a git operation (worktree add/remove, apply, commit, log)
// failed.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')

function usage() {
  console.error('usage: replay.js --due | --select | --setup --commit <sha> --dir <path> | ' +
    '--apply --dir <path> --patch <file> --class <id> | --score --workflow <file> --file <path> --line N | ' +
    '--record --spec <path> --review-run-id <id> --class <id> --file <path> --legs green|red:<leg> ' +
    '--outcome caught|missed|leg-caught [--patch <file>] [--workflow <file>] [--tokens N] | --stats | ' +
    '--teardown --dir <path>')
}

const MODE_FLAGS = {
  '--due': 'due', '--select': 'select', '--setup': 'setup', '--apply': 'apply',
  '--score': 'score', '--record': 'record', '--stats': 'stats', '--teardown': 'teardown',
}

let mode = null
let commit = null, dir = null, patch = null, cls = null, workflowPath = null, file = null, lineArg = null
let specArg = null, reviewRunId = null, legs = null, outcome = null, tokensArg = null

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (MODE_FLAGS[a]) {
    if (mode) { usage(); process.exit(2) }
    mode = MODE_FLAGS[a]
  }
  else if (a === '--commit') commit = argv[++i]
  else if (a === '--dir') dir = argv[++i]
  else if (a === '--patch') patch = argv[++i]
  else if (a === '--class') cls = argv[++i]
  else if (a === '--workflow') workflowPath = argv[++i]
  else if (a === '--file') file = argv[++i]
  else if (a === '--line') lineArg = argv[++i]
  else if (a === '--spec') specArg = argv[++i]
  else if (a === '--review-run-id') reviewRunId = argv[++i]
  else if (a === '--legs') legs = argv[++i]
  else if (a === '--outcome') outcome = argv[++i]
  else if (a === '--tokens') tokensArg = argv[++i]
  else { usage(); process.exit(2) }
}
if (!mode) { usage(); process.exit(2) }

const root = process.cwd()

// ---- --due (D2): reviewsSince = count of stage:"review" rows in READ order after the last ----
// ---- stage:"replay" row (readLedgerRows already merges live+archives in that order) ----------

function cmdDue() {
  const rows = readLedgerRows(root)
  let lastReplayIdx = -1
  rows.forEach((r, i) => { if (r.stage === 'replay') lastReplayIdx = i })
  const reviewsSince = rows.filter((r, i) => i > lastReplayIdx && r.stage === 'review').length
  if (reviewsSince >= 5) {
    console.log(`due reviewsSince=${reviewsSince}`)
    process.exit(0)
  }
  console.log(`not due reviewsSince=${reviewsSince}`)
  process.exit(1)
}

// ---- --select (D3): among CLEAN review rows with a runId in the same window as --due, prefer --
// ---- tier:"critical", tie -> latest (read-order); target commit = the close commit for the ----
// ---- selected spec's OWN path. -----------------------------------------------------------------

function cmdSelect() {
  const rows = readLedgerRows(root)
  let lastReplayIdx = -1
  rows.forEach((r, i) => { if (r.stage === 'replay') lastReplayIdx = i })
  const candidates = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => i > lastReplayIdx && r.stage === 'review' && r.verdict === 'CLEAN' && r.runId)
  if (!candidates.length) {
    console.error('replay.js: no eligible CLEAN review row with a runId found in the window since the ' +
      'last replay row — run /spec:review first, or check replay.js --due to confirm one is expected')
    process.exit(1)
  }
  let best = null
  for (const c of candidates) {
    if (!best) { best = c; continue }
    const cCritical = c.r.tier === 'critical'
    const bestCritical = best.r.tier === 'critical'
    if (cCritical && !bestCritical) { best = c; continue }
    if (!cCritical && bestCritical) continue
    if (c.i >= best.i) best = c // same tier-class: later (read-order) wins the tie
  }
  const specPath = best.r.spec
  let commitSha
  try {
    commitSha = execFileSync('git', ['log', '-1', '--format=%H', '--', specPath],
      { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: git log failed for ${specPath} in ${root} — confirm ${root} is a git repo: ${e.message}`)
    process.exit(4)
  }
  if (!commitSha) {
    console.error(`replay.js: no commit touches ${specPath} in ${root} — confirm the spec path is correct ` +
      'and was actually committed')
    process.exit(4)
  }
  console.log(`spec=${specPath} reviewRunId=${best.r.runId} commit=${commitSha}`)
  process.exit(0)
}

// ---- --setup (D4): refuse a --dir that resolves inside the repo root (exit 3, creates ---------
// ---- nothing); otherwise `git worktree add --detach` and drop the .replay-worktree marker. ----

function cmdSetup() {
  if (!commit || !dir) { usage(); process.exit(2) }
  const resolvedRoot = path.resolve(root)
  const resolvedDir = path.resolve(dir)
  const rel = path.relative(resolvedRoot, resolvedDir)
  const isInsideRepo = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  if (isInsideRepo) {
    console.error(`replay.js: --dir ${dir} resolves inside the repo root ${root} — refusing to create a ` +
      'worktree there (the main tree must never be touched by this harness); pass a --dir outside the repo')
    process.exit(3)
  }
  try {
    execFileSync('git', ['worktree', 'add', '--detach', resolvedDir, commit], { cwd: root, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git worktree add --detach failed for ${resolvedDir} at ${commit} in ${root} — ` +
      `confirm the commit exists (git -C ${root} rev-parse ${commit}) and the --dir's parent is writable: ${e.message}`)
    process.exit(4)
  }
  fs.writeFileSync(path.join(resolvedDir, '.replay-worktree'), '')
  console.log(`setup dir=${resolvedDir} commit=${commit}`)
  process.exit(0)
}

// ---- --apply (D5): git apply then commit on the worktree's detached HEAD, so the mutation ----
// ---- lands inside base..HEAD — the diff surface review-legs.js and the reviewer both read. ----

function cmdApply() {
  if (!dir || !patch || !cls) { usage(); process.exit(2) }
  const patchAbs = path.resolve(patch)
  try {
    execFileSync('git', ['apply', patchAbs], { cwd: dir, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git apply ${patch} failed in ${dir} — confirm the patch applies cleanly ` +
      `against the worktree's current HEAD (git -C ${dir} apply --check ${patch}): ${e.message}`)
    process.exit(4)
  }
  try {
    execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'pipe' })
    execFileSync('git', ['commit', '-q', '-m', `replay: ${cls}`], { cwd: dir, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git commit failed in ${dir} after applying the mutation — inspect with ` +
      `git -C ${dir} status: ${e.message}`)
    process.exit(4)
  }
  console.log(`applied class=${cls} dir=${dir}`)
  process.exit(0)
}

// ---- --score (D7): deterministic proxy — caught (same file, +/-5 lines), ambiguous ------------
// ---- (findings exist, none matching), missed (zero findings). Always exit 0 when parseable. ---

function cmdScore() {
  if (!workflowPath || !file || lineArg === null) { usage(); process.exit(2) }
  const targetLine = Number(lineArg)
  if (!Number.isFinite(targetLine)) {
    console.error(`replay.js: --line must be a number, got '${lineArg}'`)
    process.exit(2)
  }
  let wf
  try {
    wf = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
  } catch (e) {
    console.error(`replay.js: cannot read/parse --workflow ${workflowPath} — the reviewer's workflow ` +
      `return must be written to this path as JSON before scoring: ${e.message}`)
    process.exit(2)
  }
  const survivors = Array.isArray(wf.survivors) ? wf.survivors : []
  const hit = survivors.some(f => f && f.file === file && Number.isFinite(Number(f.line)) &&
    Math.abs(Number(f.line) - targetLine) <= 5)
  if (hit) { console.log('caught'); process.exit(0) }
  if (survivors.length > 0) { console.log('ambiguous'); process.exit(0) }
  console.log('missed')
  process.exit(0)
}

// ---- --record (D8): append one Contracts-shaped ledger row with a fresh rp_ runId, and --------
// ---- write the full-fidelity evidence artifact (patch verbatim, reviewer verbatim or null). ---

function cmdRecord() {
  if (!specArg || !reviewRunId || !cls || !file || !legs || !outcome) { usage(); process.exit(2) }
  if (!['caught', 'missed', 'leg-caught'].includes(outcome)) {
    console.error(`replay.js: --outcome must be caught|missed|leg-caught, got '${outcome}'`)
    process.exit(2)
  }
  if (legs !== 'green' && !/^red:.+/.test(legs)) {
    console.error(`replay.js: --legs must be 'green' or 'red:<leg>', got '${legs}'`)
    process.exit(2)
  }
  const tokens = tokensArg === null ? 0 : Number(tokensArg)
  if (!Number.isFinite(tokens)) {
    console.error(`replay.js: --tokens must be a number, got '${tokensArg}'`)
    process.exit(2)
  }
  let patchContent = ''
  if (patch) {
    try {
      patchContent = fs.readFileSync(patch, 'utf8')
    } catch (e) {
      console.error(`replay.js: cannot read --patch ${patch}: ${e.message}`)
      process.exit(2)
    }
  }
  let reviewer = null
  if (workflowPath) {
    try {
      reviewer = JSON.parse(fs.readFileSync(workflowPath, 'utf8'))
    } catch (e) {
      console.error(`replay.js: cannot read/parse --workflow ${workflowPath}: ${e.message}`)
      process.exit(2)
    }
  }
  const runId = 'rp_' + crypto.randomBytes(6).toString('hex')
  const ts = new Date().toISOString()
  const row = {
    ts, stage: 'replay', spec: specArg, runId, reviewRunId, class: cls, file, legs, outcome, tokens,
  }
  const claudeDir = path.join(root, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.appendFileSync(path.join(claudeDir, 'spec-runs.jsonl'), JSON.stringify(row) + '\n')
  const artifactDir = path.join(claudeDir, 'spec-runs')
  fs.mkdirSync(artifactDir, { recursive: true })
  const artifact = {
    runId, ts, spec: specArg, reviewRunId, class: cls, file, patch: patchContent, reviewer,
  }
  fs.writeFileSync(path.join(artifactDir, runId + '.json'), JSON.stringify(artifact, null, 2) + '\n')
  console.log(`recorded runId=${runId}`)
  process.exit(0)
}

// ---- --stats (D9): per-outcome totals, per-class counts, catch-rate = caught/(caught+missed) --
// ---- — leg-caught is corpus feedback (the class wasn't leg-invisible), never reviewer evidence.

function cmdStats() {
  const rows = readLedgerRows(root).filter(r => r.stage === 'replay')
  const total = rows.length
  const caught = rows.filter(r => r.outcome === 'caught').length
  const missed = rows.filter(r => r.outcome === 'missed').length
  const legCaught = rows.filter(r => r.outcome === 'leg-caught').length
  const byClass = new Map()
  for (const r of rows) {
    if (!byClass.has(r.class)) byClass.set(r.class, { caught: 0, missed: 0, 'leg-caught': 0 })
    const c = byClass.get(r.class)
    if (Object.prototype.hasOwnProperty.call(c, r.outcome)) c[r.outcome]++
  }
  console.log(`total ${total}`)
  console.log(`caught ${caught}`)
  console.log(`missed ${missed}`)
  console.log(`leg-caught ${legCaught}`)
  console.log(`catch-rate ${caught}/${caught + missed}`)
  console.log('per-class:')
  for (const [name, c] of byClass) {
    console.log(`  ${name} caught=${c.caught} missed=${c.missed} leg-caught=${c['leg-caught']}`)
  }
  process.exit(0)
}

// ---- --teardown (D4): refuse a --dir with no .replay-worktree marker (exit 3, deletes ---------
// ---- nothing); otherwise `git worktree remove --force` so git's own registry is pruned too. ---

function cmdTeardown() {
  if (!dir) { usage(); process.exit(2) }
  const resolvedDir = path.resolve(dir)
  const marker = path.join(resolvedDir, '.replay-worktree')
  if (!fs.existsSync(marker)) {
    console.error(`replay.js: --dir ${dir} carries no .replay-worktree marker — refusing to remove a ` +
      'directory this harness did not create; if this really is a stale replay worktree, remove it ' +
      `manually with git -C ${root} worktree remove --force ${dir}`)
    process.exit(3)
  }
  try {
    execFileSync('git', ['worktree', 'remove', '--force', resolvedDir], { cwd: root, stdio: 'pipe' })
  } catch (e) {
    console.error(`replay.js: git worktree remove --force failed for ${resolvedDir} — inspect with ` +
      `git -C ${root} worktree list: ${e.message}`)
    process.exit(4)
  }
  console.log(`torn down dir=${resolvedDir}`)
  process.exit(0)
}

switch (mode) {
  case 'due': cmdDue(); break
  case 'select': cmdSelect(); break
  case 'setup': cmdSetup(); break
  case 'apply': cmdApply(); break
  case 'score': cmdScore(); break
  case 'record': cmdRecord(); break
  case 'stats': cmdStats(); break
  case 'teardown': cmdTeardown(); break
  default: usage(); process.exit(2)
}
