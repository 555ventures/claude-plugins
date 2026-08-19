#!/usr/bin/env node
'use strict'
// replay.js --due
//         | --select
//         | --setup --commit <sha> --dir <path>
//         | --apply --dir <path> --patch <file> --class <id> [--subject <text>]
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
// Incident (2026-08-19, independent review of specs/20260819/02-mutation-replay.md's own build):
// four defects let the harness leak its own presence into the material the blind reviewer reads.
// (1) --setup's untracked marker was swept into --apply's `git add -A`, so the reconcile leg
// flagged it out-of-plan on every run and no run could ever score `caught`/`missed`. An initial
// fix wrote the marker into the worktree's working tree and tried to exclude it via `git rev-parse
// --git-path info/exclude` — but info/exclude is NOT per-worktree: it resolves into the shared
// common git dir (the MAIN repo's `.git/info/exclude`), so every run permanently appended a
// duplicate line to the maintainer's real local git config and it survived teardown. Fixed for
// real by writing the marker into the worktree's own private git dir (`git -C <dir> rev-parse
// --git-dir`, which for a linked worktree resolves under `.git/worktrees/<name>` and is deleted by
// `git worktree remove`) instead of the working tree at all — this makes the original marker-leak
// defect structurally impossible rather than merely excluded: `git add -A` cannot sweep a file
// that was never in the working tree, and `git status` cannot show it.
// (2) --apply's commit subject named the harness and the defect class, readable via reviewer.md's
// own sanctioned `git log` — fixed with a --subject flag, structurally rejecting a `replay:`-style
// subject or any value containing the class id. (3) --select handed the reviewer a ~3-line needle-only
// diff (worktree stood up at the CLOSE commit) instead of review.md Phase 0's real base-to-HEAD
// diff — fixed by additionally resolving the close commit's PARENT and that revision's own
// diff_base/build_base, for the caller to stand the worktree up at. (4) --score classified a
// crashed or malformed reviewer return as `missed`, permanently deflating the catch rate with
// evidence that was never produced — fixed by requiring verdict:"CLEAN" plus a survivors array
// before scoring anything. What this harness must never do, going forward: sign its own work into
// the tree under review — no marker, message, or diff shape may tell the reviewer it is being
// tested.
//
// What this deliberately does NOT do: derive review-legs verdicts, touch the main working tree
// (--setup/--apply/--teardown only ever act on a --dir the caller supplies; --setup refuses one
// that resolves inside the repo root, and --teardown refuses one whose private git dir carries no
// replay-worktree marker — the marker guard means teardown can only ever delete a directory THIS
// harness created), write anything into a worktree's working tree (the marker lives in the
// worktree's private git dir, never in the tree under review), or retry/poll anything.
//
// Root resolution: every ledger/git-reading mode (--select/--setup/--teardown use git; --due/
// --record/--stats read the ledger) resolves against `process.cwd()` — there is no --root flag,
// matching spec-status.js's own cwd-default shape. --apply and --score take their target as an
// explicit --dir/--workflow flag and never consult cwd at all.
//
// Exit codes: 0 = mode succeeded (--due: due; --select: printed a selection; --score: printed a
// score) · 1 = --due not due, or --select found no eligible CLEAN review row in the window ·
// 2 = usage error / missing required flag / unreadable or unparseable input / --apply --subject
// names the harness, the defect class, or the mutation class value / --score --workflow is not a
// CLEAN verdict with a survivors array · 3 = safety refusal (--setup --dir resolves inside the
// repo root; --teardown --dir does not exist, is not a linked worktree, or its private git dir
// carries no replay-worktree marker) · 4 = a git operation (worktree add/remove, apply, commit,
// log, git-dir resolution) failed, --setup's --dir resolves to a git-dir with no `worktrees` path
// segment (not a linked worktree), or --select's target spec carries neither build_base nor
// diff_base at the close commit's parent.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { readLedgerRows } = require('./lib/observation')

function usage() {
  console.error('usage: replay.js --due | --select | --setup --commit <sha> --dir <path> | ' +
    '--apply --dir <path> --patch <file> --class <id> [--subject <text>] | ' +
    '--score --workflow <file> --file <path> --line N | ' +
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
let specArg = null, reviewRunId = null, legs = null, outcome = null, tokensArg = null, subjectArg = null

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
  else if (a === '--subject') subjectArg = argv[++i]
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

// ---- frontmatter: minimal YAML key: value scan between --- fences, matching spec-status.js's ----
// ---- own parser — no YAML dependency, this repo never needs nested/list frontmatter values. ----

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
  // F3 (2026-08-19): the worktree must stand up at the CLOSE commit's PARENT, on the spec's
  // pre-review base — not the close commit itself, which reads status: done and would leak
  // "already reviewed" into the diff the blind reviewer is handed.
  let parent
  try {
    parent = execFileSync('git', ['rev-parse', `${commitSha}^`], { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    console.error(`replay.js: git rev-parse ${commitSha}^ failed in ${root} — confirm ${commitSha} has a ` +
      `parent commit: ${e.message}`)
    process.exit(4)
  }
  let specAtParent
  try {
    specAtParent = execFileSync('git', ['show', `${parent}:${specPath}`], { cwd: root, encoding: 'utf8' })
  } catch (e) {
    console.error(`replay.js: git show ${parent}:${specPath} failed in ${root} — confirm the spec existed ` +
      `at the close commit's parent: ${e.message}`)
    process.exit(4)
  }
  const fm = frontmatter(specAtParent) || {}
  const diffBase = (fm.build_base && fm.build_base.trim()) ? fm.build_base.trim() :
    ((fm.diff_base && fm.diff_base.trim()) ? fm.diff_base.trim() : null)
  if (!diffBase) {
    console.error(`replay.js: ${specPath} at ${parent} carries neither build_base nor diff_base in its ` +
      'frontmatter — confirm the spec was planned with a recorded base commit')
    process.exit(4)
  }
  console.log(`spec=${specPath} reviewRunId=${best.r.runId} commit=${commitSha} parent=${parent} diffBase=${diffBase}`)
  process.exit(0)
}

// ---- --setup (D4): refuse a --dir that resolves inside the repo root (exit 3, creates ---------
// ---- nothing); otherwise `git worktree add --detach` and drop a replay-worktree marker into ----
// ---- the new worktree's own private git dir — never into its working tree. -------------------

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
  // F1 (2026-08-19, corrected): the marker must never touch the worktree's WORKING tree — write
  // it into the worktree's own private git dir instead, which `git worktree remove` deletes for
  // free. `git -C <dir> rev-parse --git-dir` for a linked worktree resolves under
  // .git/worktrees/<name> in the shared common git dir; info/exclude does NOT have this property
  // (it resolves into the MAIN repo's .git/info/exclude) and must never be used for this again.
  let gitDirAbs
  try {
    const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: resolvedDir, encoding: 'utf8' }).trim()
    gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(resolvedDir, gitDirRaw)
  } catch (e) {
    console.error(`replay.js: git rev-parse --git-dir failed in ${resolvedDir} right after worktree add — the ` +
      `worktree is registered but unusable; remove it with git -C ${root} worktree remove --force ${resolvedDir}: ${e.message}`)
    process.exit(4)
  }
  if (!gitDirAbs.split(path.sep).includes('worktrees')) {
    console.error(`replay.js: resolved git-dir ${gitDirAbs} for ${resolvedDir} carries no 'worktrees' path ` +
      'segment — this is not a linked worktree, so no private git dir exists to hold the marker; remove it ' +
      `with git -C ${root} worktree remove --force ${resolvedDir}`)
    process.exit(4)
  }
  try {
    fs.writeFileSync(path.join(gitDirAbs, 'replay-worktree'), '')
  } catch (e) {
    console.error(`replay.js: failed to write the replay-worktree marker in ${gitDirAbs} — the worktree is ` +
      `registered but unusable; remove it with git -C ${root} worktree remove --force ${resolvedDir}: ${e.message}`)
    process.exit(4)
  }
  console.log(`setup dir=${resolvedDir} commit=${commit}`)
  process.exit(0)
}

// ---- --apply (D5): git apply then commit on the worktree's detached HEAD, so the mutation ----
// ---- lands inside base..HEAD — the diff surface review-legs.js and the reviewer both read. ----

function cmdApply() {
  if (!dir || !patch || !cls) { usage(); process.exit(2) }
  // F2 (2026-08-19): the commit subject must never let a reviewer's sanctioned `git log` reveal
  // this is a test, or which defect class to hunt — reject structurally, not by convention. The
  // rejected set is deliberately narrow: the --class value (which names the defect to hunt) and a
  // `replay:`-style subject (the harness announcing itself). A subject derived from the target
  // spec's own build commit is indistinguishable from the real thing BECAUSE it is the real thing
  // — even when that spec's title happens to contain 'replay' or 'mutation'. An earlier draft
  // rejected those words anywhere in the subject and thereby refused exactly the derived subject
  // replay.md mandates (this spec's own build subject is 'build(20260819/02): scheduled mutation
  // replay harness'); vocabulary is not a leak, provenance is.
  const subject = subjectArg === null ? 'build: follow-up' : subjectArg
  if (/^\s*replay\b/i.test(subject) || subject.includes(cls)) {
    console.error(`replay.js: --subject '${subject}' announces the harness or names the --class ` +
      `value '${cls}' — the commit message must be indistinguishable from a normal commit; pass a ` +
      'build-commit-shaped --subject that neither starts with "replay" nor contains the class id, ' +
      'or omit it to use the default')
    process.exit(2)
  }
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
    execFileSync('git', ['commit', '-q', '-m', subject], { cwd: dir, stdio: 'pipe' })
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
  // F4 (2026-08-19): a crashed or malformed reviewer return must never be scored as `missed` —
  // that converts "the reviewer never ran" into permanent, indistinguishable-from-real evidence.
  if (wf.verdict !== 'CLEAN' || !Array.isArray(wf.survivors)) {
    console.error(`replay.js: --workflow ${workflowPath} has verdict=${JSON.stringify(wf.verdict)} ` +
      `survivors=${Array.isArray(wf.survivors) ? 'array' : typeof wf.survivors} — a non-CLEAN or malformed ` +
      'reviewer return must never be scored; re-dispatch the reviewer and retry --score')
    process.exit(2)
  }
  const survivors = wf.survivors
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

// ---- --teardown (D4): refuse a --dir whose private git dir carries no replay-worktree marker ---
// ---- (exit 3, deletes nothing); otherwise `git worktree remove --force` so git's own registry ---
// ---- is pruned too, taking the marker with it. --------------------------------------------------

function cmdTeardown() {
  if (!dir) { usage(); process.exit(2) }
  const resolvedDir = path.resolve(dir)
  if (!fs.existsSync(resolvedDir)) {
    console.error(`replay.js: --dir ${dir} does not exist — refusing to remove nothing; if this really is a ` +
      `stale replay worktree, confirm the path with git -C ${root} worktree list`)
    process.exit(3)
  }
  let gitDirAbs
  try {
    const gitDirRaw = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: resolvedDir, encoding: 'utf8' }).trim()
    gitDirAbs = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(resolvedDir, gitDirRaw)
  } catch (e) {
    console.error(`replay.js: git rev-parse --git-dir failed in ${resolvedDir} — refusing to remove a ` +
      `directory that is not a git worktree; if this really is a stale replay worktree, remove it manually ` +
      `with rm -rf ${dir}: ${e.message}`)
    process.exit(3)
  }
  if (!gitDirAbs.split(path.sep).includes('worktrees')) {
    console.error(`replay.js: resolved git-dir ${gitDirAbs} for ${resolvedDir} carries no 'worktrees' path ` +
      'segment — refusing to remove a directory this harness did not create as a linked worktree; if this ' +
      `really is a stale replay worktree, remove it manually with git -C ${root} worktree remove --force ${dir}`)
    process.exit(3)
  }
  const marker = path.join(gitDirAbs, 'replay-worktree')
  if (!fs.existsSync(marker)) {
    console.error(`replay.js: ${gitDirAbs} carries no replay-worktree marker — refusing to remove a ` +
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
