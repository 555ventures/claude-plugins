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

// The secrets scan (v7 secrets-scan.js, tag spec-v7-final, rules byte for byte): a closed list, no host patterns.
// A path rule matches the basename and short-circuits that file's content scan; the content scan reads the
// first 1 MiB, skips a file whose first 8 KiB holds a NUL byte and any line holding `secrets-scan:allow`.
const PATH_RULES = [
  [/^\.env$/, '.env'],
  [/^\.env\..+$/, '.env.*', (b) => !['.env.example', '.env.sample', '.env.template'].includes(b)],
  [/\.pem$/, '*.pem'], [/\.key$/, '*.key'], [/\.p12$/, '*.p12'], [/\.pfx$/, '*.pfx'], [/\.jks$/, '*.jks'],
  [/^id_rsa$/, 'id_rsa'], [/^id_rsa\..+$/, 'id_rsa.*'],
  [/^id_ed25519$/, 'id_ed25519'], [/^id_ed25519\..+$/, 'id_ed25519.*'],
  [/^credentials\.json$/, 'credentials.json'], [/^service-account.*\.json$/, 'service-account*.json'],
  [/^secrets\.json$/, 'secrets.json'], [/^secrets\.yml$/, 'secrets.yml'], [/^secrets\.yaml$/, 'secrets.yaml'],
  [/^\.netrc$/, '.netrc'], [/^\.pgpass$/, '.pgpass'],
]
const CONTENT_RULES = [
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'gh[pousr]_[A-Za-z0-9]{36}',
  'github_pat_[A-Za-z0-9_]{22,}',
  'sk-[A-Za-z0-9_-]{20,}',
  'xox[baprs]-[A-Za-z0-9-]{10,}',
  '(sk|rk)_live_[A-Za-z0-9]{20,}',
  'AIza[0-9A-Za-z_-]{35}',
  '_authToken\\s*=\\s*\\S+',
].map((src) => [new RegExp(src), src])
const ALLOW = 'secrets-scan:allow'

function scanFile(cwd, rel) {
  const abs = path.join(cwd, rel)
  let stat
  try { stat = fs.statSync(abs) } catch { return [] }
  if (!stat.isFile()) return []
  const base = path.basename(rel)
  const pr = PATH_RULES.find(([re, , ok]) => re.test(base) && (!ok || ok(base)))
  if (pr) return [{ path: rel, reason: 'path:' + pr[1], line: null }]
  let buf
  try {
    const fd = fs.openSync(abs, 'r')
    buf = Buffer.alloc(Math.min(stat.size, 1048576))
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    buf = buf.subarray(0, n)
  } catch { return [] }
  if (buf.subarray(0, 8192).includes(0)) return []
  const hits = []
  buf.toString('utf8').split('\n').forEach((l, i) => {
    if (l.includes(ALLOW)) return
    const cr = CONTENT_RULES.find(([re]) => re.test(l))
    if (cr) hits.push({ path: rel, reason: 'content:' + cr[1], line: i + 1 })
  })
  return hits
}

// Stages everything and commits; returns the new sha, or null when there was nothing to commit.
// `exclude` paths are unstaged after `add -A` (they stay on disk, out of this commit). Unless `noVerify`, the
// staged names pass the secrets scan; hits commit nothing and come back as {hits: [{path, reason, line}]}.
function commitAll(cwd, message, { noVerify, exclude = [] } = {}) {
  sh(['add', '-A'], cwd)
  if (exclude.length) sh(['--literal-pathspecs', 'reset', '-q', '--', ...exclude], cwd)
  if (raw(['diff', '--cached', '--quiet'], cwd).status === 0) return null
  if (!noVerify) {
    const hits = sh(['diff', '--cached', '--name-only', '-z', '--diff-filter=d'], cwd).split('\0').filter(Boolean).flatMap((f) => scanFile(cwd, f))
    if (hits.length) return { hits }
  }
  sh(['commit', '-q', ...(noVerify ? ['--no-verify'] : []), '-m', message], cwd)
  return headSha(cwd)
}

// A lane's safety-net commit: everything but the relay file, hooks skipped. Returns the sha, or null
// when nothing was staged or a rebase is in progress (a commit would land inside the rebase).
function commitWip(wt, message) {
  if (rebasing(wt)) return null
  // Not an :(exclude) pathspec: when a host gitignores the relay file, git add refuses the
  // pathspec itself ("paths are ignored") and nothing is staged.
  sh(['add', '-A', '--', '.'], wt)
  raw(['rm', '--cached', '-q', '--ignore-unmatch', '--', '.claude/pending-question.json'], wt)
  if (raw(['diff', '--cached', '--quiet'], wt).status === 0) return null
  sh(['commit', '-q', '--no-verify', '-m', message], wt)
  return headSha(wt)
}

// `git ls-files <args> -z` as paths; a failing call is a refusal.
function lsFiles(cwd, args) {
  const r = raw(['ls-files', ...args, '-z'], cwd)
  if (r.status !== 0) throw Object.assign(new Error(`git ls-files failed in ${cwd}: ${(r.stderr || r.stdout).trim()}`), { exit: 2 })
  return r.stdout.split('\0').filter(Boolean)
}

// Puts files back as they were at base; a file base lacks is removed.
function restore(cwd, base, files) {
  for (const f of files) {
    if (raw(['cat-file', '-e', `${base}:${f}`], cwd).status === 0) sh(['checkout', base, '--', f], cwd)
    else { raw(['rm', '-q', '-f', '--cached', '--ignore-unmatch', '--', f], cwd); fs.rmSync(path.join(cwd, f), { force: true }) }
  }
}

const dirtyMessage = (root) => `${root} has uncommitted tracked changes — commit or stash them, then re-run`

const conflictsIn = (root) => sh(['diff', '--name-only', '--diff-filter=U'], root).split('\n').filter(Boolean)

// Merges branch into the branch checked out at root. Any failure (a conflict, a hook, ff-only divergence)
// is backed out with `reset --merge`, so root is never left mid-merge: {merged: false, reason}. A dirty
// root (tracked changes) or an unknown strategy is refused.
const MERGE = { 'merge-commit': (b, m) => ['merge', '--no-ff', '--no-edit', ...(m ? ['-m', m] : []), b], 'ff-only': (b) => ['merge', '--ff-only', b], squash: (b) => ['merge', '--squash', b] }
function mergeBack(root, branch, strategy = 'merge-commit', { message } = {}) {
  if (!MERGE[strategy]) throw Object.assign(new Error(`unknown merge strategy '${strategy}' (merge-commit | ff-only | squash)`), { exit: 2 })
  if (sh(['status', '--porcelain', '--untracked-files=no'], root)) throw Object.assign(new Error(dirtyMessage(root)), { exit: 2 })
  let r = raw(MERGE[strategy](branch, message), root)
  if (r.status === 0 && strategy === 'squash') {
    if (raw(['diff', '--cached', '--quiet'], root).status === 0) return { merged: true, sha: headSha(root), empty: true }
    r = raw(['commit', '-q', '-m', message || `chore(spec): squash ${branch} into ${currentBranch(root)}`], root)
  }
  if (r.status === 0) return { merged: true, sha: headSha(root) }
  raw(['reset', '-q', '--merge'], root)
  return { merged: false, reason: (r.stderr || r.stdout).trim() }
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
  commitAll, commitWip, lsFiles, restore, mergeBack, conflictsIn, rebaseOnto, rebasing, diff, changedFiles,
}
