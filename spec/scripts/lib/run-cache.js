'use strict'
// lib/run-cache.js — the one tree derivation, key and store for "this command already ran green
// over this tree". Required by spec-build-driver.js, spec-review-driver.js, review-legs.js and
// fanout-driver.js. No CLI.
// Owner: specs/20261103/12-one-suite-run-per-tree.md (D1, D2).
//
// treeSha(repoRoot, {exclude})  40-hex git tree of the working tree (tracked edits + untracked) via a
//                               HEAD-seeded scratch index under cacheDir; each repo-relative `exclude`
//                               path rides as `:(exclude)<p>` unless git already ignores it
// cacheTree(repoRoot, extra)    treeSha with PIPELINE_OVERLAY + extra excluded — the CACHE KEY tree
// cacheDir(repoRoot)            <git common dir>/spec-run-cache, shared by every worktree of the repo
// keyFor(cmd, tree, envNames)   sha256 of cmd \0 tree \0 sorted env names
// lookup(repoRoot, cmd, tree)   the stored entry or null
// record(repoRoot, cmd, tree, {exit, observed})  writes only a green run whose observed.testsExecuted
//                               is a number; true when written, false otherwise
//
// What this deliberately does NOT do: decide a verdict, cache a red or count-less green, read env
// VALUES (only the `var` names of the host config's testEnv rows), or expire entries.
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { readConfig } = require('./host-config')

const PIPELINE_OVERLAY = ['.claude/spec-runs.jsonl', '.claude/spec-runs.stopped.jsonl', '.claude/spec-runs/', '.claude/agent-memory/']
const SHA40_RE = /^[0-9a-f]{40}$/

function git(repoRoot, args, env) {
  return spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', env: env || process.env, maxBuffer: 64 * 1024 * 1024 })
}

function cacheDir(repoRoot) {
  const r = git(repoRoot, ['rev-parse', '--git-common-dir'])
  const out = (r.stdout || '').trim()
  if (r.status !== 0 || !out) {
    throw new Error('run-cache: git rev-parse --git-common-dir failed in ' + repoRoot + ' — run inside a git checkout: ' + (r.stderr || '').trim())
  }
  return path.join(path.resolve(repoRoot, out), 'spec-run-cache')
}

function treeSha(repoRoot, { exclude = [] } = {}) {
  const dir = cacheDir(repoRoot)
  fs.mkdirSync(dir, { recursive: true })
  const indexFile = path.join(dir, 'snap-index-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'))
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: indexFile })
  try {
    // Seeded from HEAD: against an empty index a tracked-but-gitignored file reads as untracked and
    // ignored, so `add -A` would drop it and every diff against the snapshot count it as deleted.
    const seed = git(repoRoot, ['read-tree', 'HEAD'], env)
    if (seed.status !== 0) {
      throw new Error('run-cache: git read-tree HEAD into a scratch index failed (exit ' + seed.status + '): ' + (seed.stderr || seed.stdout).trim())
    }
    const addArgs = ['add', '-A', '--', '.']
    for (const p of exclude) {
      // An excluded path already gitignored makes the negative pathspec an ignored path, which
      // `git add` refuses — the exclusion is carried only when git does not already ignore it. A
      // path committed in HEAD rides in on the seed, so it is dropped from the scratch index too.
      const ignored = git(repoRoot, ['check-ignore', '-q', p]).status === 0
      git(repoRoot, ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', p], env)
      if (!ignored) addArgs.push(':(exclude)' + p)
    }
    const add = git(repoRoot, addArgs, env)
    if (add.status !== 0) {
      throw new Error('run-cache: git add -A into a scratch index failed (exit ' + add.status + '): ' + (add.stderr || add.stdout).trim())
    }
    const wt = git(repoRoot, ['write-tree'], env)
    const sha = (wt.stdout || '').trim()
    if (wt.status !== 0 || !SHA40_RE.test(sha)) {
      throw new Error('run-cache: git write-tree did not print a 40-hex tree sha (exit ' + wt.status + '): ' + (wt.stderr || wt.stdout).trim())
    }
    return sha
  } finally {
    fs.rmSync(indexFile, { force: true })
    fs.rmSync(indexFile + '.lock', { force: true })
  }
}

function cacheTree(repoRoot, extraExcludes = []) {
  return treeSha(repoRoot, { exclude: [...PIPELINE_OVERLAY, ...extraExcludes] })
}

function keyFor(cmd, tree, envNames) {
  return crypto.createHash('sha256').update(cmd + '\0' + tree + '\0' + envNames.slice().sort().join(',')).digest('hex')
}

// The var NAMES of the host config's testEnv rows — never values.
function envNamesFor(repoRoot) {
  const rows = readConfig(repoRoot).testEnv
  if (!Array.isArray(rows)) return []
  return rows.map((r) => r && r.var).filter((v) => typeof v === 'string' && v)
}

function lookup(repoRoot, cmd, tree) {
  try {
    const file = path.join(cacheDir(repoRoot), keyFor(cmd, tree, envNamesFor(repoRoot)) + '.json')
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
    return entry && typeof entry === 'object' ? entry : null
  } catch {
    return null
  }
}

function record(repoRoot, cmd, tree, { exit, observed } = {}) {
  if (exit !== 0 || !observed || typeof observed.testsExecuted !== 'number') return false
  const envNames = envNamesFor(repoRoot)
  const dir = cacheDir(repoRoot)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, keyFor(cmd, tree, envNames) + '.json')
  const tmp = file + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ cmd, tree, envNames, observed, ts: new Date().toISOString() }) + '\n')
  fs.renameSync(tmp, file)
  return true
}

module.exports = { treeSha, cacheTree, cacheDir, keyFor, lookup, record, envNamesFor, PIPELINE_OVERLAY }
