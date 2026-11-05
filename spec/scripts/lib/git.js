'use strict'
// lib/git.js — thin git wrappers for drivers. No CLI.
//
// sh(args, cwd) → stdout (trimmed); throws with git's stderr on non-zero.
// diff/changedFiles compare the WORKING TREE (tracked edits + untracked, not ignored) to base,
// through a scratch index, so uncommitted builder work is visible without touching the real index.

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

function raw(args, cwd, env) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', env: env || process.env, maxBuffer: 256 * 1024 * 1024 })
}

function sh(args, cwd, env) {
  const r = raw(args, cwd, env)
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr || r.stdout).trim()}`)
  return r.stdout.replace(/\s+$/, '')
}

const currentBranch = (cwd) => sh(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
const trunk = (config) => (config && config.trunk) || 'main'
const headSha = (cwd) => sh(['rev-parse', 'HEAD'], cwd)
const branchExists = (cwd, b) => raw(['rev-parse', '-q', '--verify', 'refs/heads/' + b], cwd).status === 0

const real = (p) => { try { return fs.realpathSync(p) } catch { return path.resolve(p) } }
// The checkout's top level (specs/, docs/ and .claude/ live there), or dir itself outside a repo.
function repoRoot(dir) {
  const r = raw(['rev-parse', '--show-toplevel'], path.resolve(dir || process.cwd()))
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : path.resolve(dir || process.cwd())
}

function worktreeList(root) {
  return sh(['worktree', 'list', '--porcelain'], root).split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => real(l.slice(9)))
}

// Idempotent: an existing worktree at wtPath is returned as is; an existing branch is attached.
function worktreeAdd(root, wtPath, branch, base) {
  const abs = path.resolve(root, wtPath)
  if (worktreeList(root).includes(real(abs))) return abs
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (branchExists(root, branch)) sh(['worktree', 'add', abs, branch], root)
  else sh(['worktree', 'add', '-b', branch, abs, base || 'HEAD'], root)
  return abs
}

// No --force by default: untracked files or edits after the lane's commit are never thrown away
// silently. A refusal is returned, not thrown, so the caller can finish and say the worktree stays.
function worktreeRemove(root, wtPath, { deleteBranch, force } = {}) {
  const abs = path.resolve(root, wtPath)
  if (worktreeList(root).includes(real(abs))) {
    const r = raw(['worktree', 'remove', ...(force ? ['--force'] : []), abs], root)
    if (r.status !== 0) return { removed: false, reason: (r.stderr || r.stdout).trim().split('\n')[0] }
  }
  raw(['worktree', 'prune'], root)
  if (deleteBranch && branchExists(root, deleteBranch)) sh(['branch', '-D', deleteBranch], root)
  return { removed: true }
}

// Stages everything and commits; returns the new sha, or null when there was nothing to commit.
function commitAll(cwd, message, { noVerify } = {}) {
  sh(['add', '-A'], cwd)
  if (raw(['diff', '--cached', '--quiet'], cwd).status === 0) return null
  sh(['commit', '-q', ...(noVerify ? ['--no-verify'] : []), '-m', message], cwd)
  return headSha(cwd)
}

// A lane's safety-net commit: everything but the relay file, hooks skipped. Returns the sha, or null
// when nothing was staged or a rebase is in progress (a commit would land inside the rebase).
function commitWip(wt, message) {
  if (rebasing(wt)) return null
  sh(['add', '-A', '--', '.', ':(exclude).claude/pending-question.json'], wt)
  if (raw(['diff', '--cached', '--quiet'], wt).status === 0) return null
  sh(['commit', '-q', '--no-verify', '-m', message], wt)
  return headSha(wt)
}

// The right words for a dirty checkout: a merge another run left half-done is not "stash it".
function dirtyMessage(root) {
  if (raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], root).status === 0) return `${root} is mid-merge (another /spec:run at CONFLICTS?) — finish that run there, then re-run`
  return `${root} has uncommitted tracked changes — commit or stash them, then re-run`
}

const conflictsIn = (root) => sh(['diff', '--name-only', '--diff-filter=U'], root).split('\n').filter(Boolean)

// Merges branch into the branch checked out at root. Conflicts are left in the root tree for the
// session to resolve; the result lists them. A dirty root (tracked changes) is refused.
function mergeBack(root, branch, strategy = 'merge-commit', { message } = {}) {
  if (sh(['status', '--porcelain', '--untracked-files=no'], root)) {
    const e = new Error(dirtyMessage(root))
    e.exit = 2
    throw e
  }
  const target = currentBranch(root)
  let r
  if (strategy === 'merge-commit') r = raw(['merge', '--no-ff', '--no-edit', ...(message ? ['-m', message] : []), branch], root)
  else if (strategy === 'ff-only') {
    r = raw(['merge', '--ff-only', branch], root)
    if (r.status !== 0) return { merged: false, conflicts: [], reason: `${target} has diverged from ${branch} (${(r.stderr || r.stdout).trim()}); use merge-commit or squash` }
  } else if (strategy === 'squash') {
    r = raw(['merge', '--squash', branch], root)
    if (r.status === 0) {
      if (raw(['diff', '--cached', '--quiet'], root).status === 0) return { merged: true, conflicts: [], sha: headSha(root), empty: true }
      r = raw(['commit', '-q', '-m', message || `chore(spec): squash ${branch} into ${target}`], root)
      if (r.status !== 0) raw(['reset', '-q', '--merge'], root) // a hook rejected the squash commit: back it out
    }
  } else throw Object.assign(new Error(`unknown merge strategy '${strategy}' (merge-commit | ff-only | squash)`), { exit: 2 })
  if (r.status === 0) return { merged: true, conflicts: [], sha: headSha(root) }
  const conflicts = conflictsIn(root)
  if (conflicts.length) return { merged: false, conflicts }
  // A merge that a hook rejected is left half-done: back out so the tree is clean for the re-run.
  if (raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], root).status === 0) raw(['merge', '--abort'], root)
  throw new Error(`merge of ${branch} failed without conflicts: ${(r.stderr || r.stdout).trim()}`)
}

// Rebases the branch checked out in worktree onto trunk. A conflict leaves the rebase in progress
// in the worktree (for the lane to resolve) and lists the conflicted files.
const rebasing = (wt) => ['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(sh(['rev-parse', '--absolute-git-dir'], wt), d)))
function rebaseOnto(worktree, trunk) {
  const r = raw(['-c', 'core.editor=true', 'rebase', trunk], worktree)
  if (r.status === 0) return { ok: true, conflicts: [] }
  const conflicts = conflictsIn(worktree)
  if (conflicts.length) return { ok: false, conflicts }
  if (rebasing(worktree)) raw(['rebase', '--abort'], worktree)
  throw new Error(`rebase of ${worktree} onto ${trunk} failed without conflicts: ${(r.stderr || r.stdout).trim()}`)
}

// Runs fn(env) with GIT_INDEX_FILE pointing at a scratch index holding the working tree.
function withWorkingIndex(cwd, fn) {
  const idx = path.join(os.tmpdir(), 'spec-idx-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'))
  const env = { ...process.env, GIT_INDEX_FILE: idx }
  try {
    if (raw(['rev-parse', '-q', '--verify', 'HEAD'], cwd).status === 0) sh(['read-tree', 'HEAD'], cwd, env)
    sh(['add', '-A', '--', '.'], cwd, env)
    return fn(env)
  } finally {
    fs.rmSync(idx, { force: true })
    fs.rmSync(idx + '.lock', { force: true })
  }
}

const diff = (base, cwd) => withWorkingIndex(cwd, (env) => sh(['diff', '--cached', '--no-color', base], cwd, env))
const changedFiles = (base, cwd) =>
  withWorkingIndex(cwd, (env) => sh(['diff', '--cached', '--name-only', base], cwd, env)).split('\n').filter(Boolean)

module.exports = {
  repoRoot, dirtyMessage,
  sh, raw, currentBranch, trunk, headSha, branchExists, worktreeList, worktreeAdd, worktreeRemove,
  commitAll, commitWip, mergeBack, conflictsIn, rebaseOnto, rebasing, diff, changedFiles,
}
