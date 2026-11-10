'use strict'
// lib/git.js — thin git wrappers for drivers. No CLI. sh(args, cwd) → stdout (trimmed), throws with git's stderr.
// diff/changedFiles compare the WORKING TREE to base through a scratch index (builder work visible, real index
// untouched).

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

const gitDir = (cwd) => {
  const r = raw(['rev-parse', '--absolute-git-dir'], cwd); return r.status === 0 ? r.stdout.trim() : null
}
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

// Where the user's queue items live (lib/queue-files.js); a run never changes a path under it.
const QUEUE_DIR = 'specs/queue'
const isQueue = (f) => f === QUEUE_DIR || f.startsWith(QUEUE_DIR + '/')

// The main checkout of the repo `root` belongs to, root's own sub-path kept.
const mains = new Map()
function mainRoot(root) {
  if (!mains.has(root)) {
    const pre = raw(['rev-parse', '--show-prefix'], root)
    if (pre.status !== 0) throw new Error(`git: ${root} is not inside a git repository — run git init`)
    mains.set(root, path.resolve(worktreeList(root)[0], pre.stdout.trim()))
  }
  return mains.get(root)
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

// No --force by default: untracked work is never thrown away; a refusal is returned, not thrown.
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

// The secrets scan (v7 secrets-scan.js, rules byte for byte): a path rule matches the basename; content reads the first
// 1 MiB, skips a file with a NUL in its first 8 KiB and any line holding `secrets-scan:allow`.
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

// The secrets scan over the staged names (deleted ones have nothing to scan).
const stagedHits = (cwd) => sh(['diff', '--cached', '--name-only', '-z', '--diff-filter=d'], cwd)
  .split('\0').filter(Boolean).flatMap((f) => scanFile(cwd, f))

// Unstages `keep` and every staged file the secrets scan flags: they stay on disk, out of the next commit.
function unstageKept(cwd, keep) {
  const out = [...new Set([...keep, ...stagedHits(cwd).map((h) => h.path)])]
  if (out.length) sh(['--literal-pathspecs', 'reset', '-q', '--', ...out], cwd)
}

// Stages everything and commits; → the new sha, or null when nothing was staged. `exclude` paths stay on disk, out of
// the commit. Unless `noVerify`, staged names pass the secrets scan; hits commit nothing: {hits: [{path, reason,
// line}]}.
function commitAll(cwd, message, { noVerify, exclude = [] } = {}) {
  sh(['add', '-A'], cwd)
  raw(['reset', '-q', '--', QUEUE_DIR], cwd) // queue items are the owner's commits, never a run's
  if (exclude.length) sh(['--literal-pathspecs', 'reset', '-q', '--', ...exclude], cwd)
  if (raw(['diff', '--cached', '--quiet'], cwd).status === 0) return null
  if (!noVerify) {
    const hits = stagedHits(cwd)
    if (hits.length) return { hits }
  }
  sh(['commit', '-q', ...(noVerify ? ['--no-verify'] : []), '-m', message], cwd)
  return headSha(cwd)
}

// A lane's safety-net commit: all but the relay file and queue edits, hooks skipped; → the sha, or null (nothing
// staged, or mid-rebase). `keep` paths and what the secrets scan flags stay on disk, out of the commit.
function commitWip(wt, message, keep) {
  if (rebasing(wt)) return null
  // Not an :(exclude) pathspec: a host that gitignores the relay file makes git add refuse the pathspec.
  sh(['add', '-A', '--', '.'], wt)
  raw(['rm', '--cached', '-q', '--ignore-unmatch', '--', '.claude/pending-question.json'], wt)
  if (keep) unstageKept(wt, keep)
  dropQueueEdits(wt) // back to HEAD, not just unstaged: a dirty tracked file would stop the resume's rebase
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

// Puts specs/queue/ back as HEAD has it: a lane's copy is never read, so a stray edit must not stop its rebase.
function dropQueueEdits(cwd) {
  const out = raw(['status', '--porcelain', '-z', '--untracked-files=all', '--', QUEUE_DIR], cwd).stdout
  const files = out.split('\0').filter(Boolean).map((e) => e.slice(3))
  if (files.length) restore(cwd, 'HEAD', files)
}

const dirtyMessage = (root) => `${root} has uncommitted tracked changes — commit or stash them, then re-run`

const conflictsIn = (root) => sh(['diff', '--name-only', '--diff-filter=U'], root).split('\n').filter(Boolean)

// Merges branch into the checkout at root; any failure is backed out with `reset --merge`: {merged: false, reason}. A
// dirty root or an unknown strategy is refused.
const MERGE = { 'merge-commit': (b, m) => ['merge', '--no-ff', '--no-edit', ...(m ? ['-m', m] : []), b], 'ff-only': (b) => ['merge', '--ff-only', b], squash: (b) => ['merge', '--squash', b] }
function mergeBack(root, branch, strategy = 'merge-commit', { message } = {}) {
  if (!MERGE[strategy]) throw Object.assign(new Error(`unknown merge strategy '${strategy}' (merge-commit | ff-only | squash)`), { exit: 2 })
  if (sh(['status', '--porcelain', '--untracked-files=no'], root)) throw Object.assign(new Error(dirtyMessage(root)), { exit: 2 })
  // A squash drops the branch's commits, so their `Queue: <id>` trailers travel in its message.
  const log = () => raw(['log', '--format=%(trailers:key=Queue,valueonly)', `HEAD..${branch}`], root).stdout
  const queued = strategy === 'squash' ? log().split('\n').map((l) => l.trim()).filter(Boolean) : []
  let r = raw(MERGE[strategy](branch, message), root)
  if (r.status === 0 && strategy === 'squash') {
    if (raw(['diff', '--cached', '--quiet'], root).status === 0) return { merged: true, sha: headSha(root), empty: true }
    const say = message || `chore(spec): squash ${branch} into ${currentBranch(root)}`
    const trailers = queued.length ? '\n\n' + queued.map((id) => `Queue: ${id}`).join('\n') : ''
    r = raw(['commit', '-q', '-m', say + trailers], root)
  }
  if (r.status === 0) return { merged: true, sha: headSha(root) }
  raw(['reset', '-q', '--merge'], root)
  return { merged: false, reason: (r.stderr || r.stdout).trim() }
}

// Rebases the worktree's branch onto trunk; a conflict leaves the rebase in progress and lists the files. `autostash`
// (the amend resume only, never a landing) brings back tracked edits left out of every commit.
const rebasing = (wt) => ['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(sh(['rev-parse', '--absolute-git-dir'], wt), d)))
function rebaseOnto(worktree, trunk, { autostash } = {}) {
  const r = raw(['-c', 'core.editor=true', 'rebase', ...(autostash ? ['--autostash'] : []), trunk], worktree)
  if (r.status === 0) return { ok: true, conflicts: [] }
  const conflicts = conflictsIn(worktree)
  if (conflicts.length) return { ok: false, conflicts }
  if (rebasing(worktree)) raw(['rebase', '--abort'], worktree)
  throw new Error(`rebase of ${worktree} onto ${trunk} failed without conflicts: ${(r.stderr || r.stdout).trim()}`)
}
// Takes the resolved files and continues; `keep` and what the secrets scan flags stay out (unstageKept).
function continueRebase(wt, keep = []) {
  dropQueueEdits(wt) // a lane's queue copy is never read: it must not ride into the replayed commit
  sh(['add', '-A'], wt)
  unstageKept(wt, keep)
  return raw(['-c', 'core.editor=true', 'rebase', '--continue'], wt)
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

// What a run changed: queue items are the owner's commits, so neither the patch nor the file list holds them.
const diff = (base, cwd) => withWorkingIndex(cwd, (env) =>
  sh(['diff', '--cached', '--no-color', base, '--', '.', ':(exclude)' + QUEUE_DIR], cwd, env))
const changedFiles = (base, cwd) =>
  withWorkingIndex(cwd, (env) => sh(['diff', '--cached', '--name-only', base], cwd, env))
    .split('\n').filter((f) => f && !isQueue(f))

module.exports = {
  repoRoot, dirtyMessage, real, gitDir, QUEUE_DIR, mainRoot, scanFile, dropQueueEdits,
  sh, raw, currentBranch, trunk, headSha, branchExists, worktreeList, worktreeAdd, worktreeRemove,
  commitAll, commitWip, lsFiles, restore, mergeBack, conflictsIn, rebaseOnto, continueRebase, rebasing,
  diff, changedFiles,
}
