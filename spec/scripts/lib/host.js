'use strict'
// lib/host.js — run host commands, the test gate with its green-run cache, and test-command
// detection for init. No CLI.
//
// run(cmd, {cwd, env, timeoutMs})  → {status, stdout, stderr, tail}; timeout → status 124
// gate(root, config)               → {status, cached, runId, tail}; green runs cached by tree hash
// treeSha(root)                    git tree of the working tree (tracked edits + untracked, not ignored)
// detectTestCommand(root)          → command string or null
// firstRedLine(tail)               the line of a red tail worth reading first

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const TAIL_LINES = 40
// Pipeline files that never count toward the tree a gate ran over.
const OVERLAY = [':(glob)**/*.run/**', '.claude/pending-question.json']

function tailOf(text, n = TAIL_LINES) {
  const lines = String(text || '').replace(/\s+$/, '').split('\n')
  return lines.slice(-n).join('\n')
}

function run(cmd, { cwd, env, timeoutMs } = {}) {
  const r = spawnSync(cmd, {
    cwd, shell: '/bin/bash', encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...(env || {}) }, timeout: timeoutMs || 0, killSignal: 'SIGKILL',
  })
  const timedOut = r.error && r.error.code === 'ETIMEDOUT'
  const status = timedOut ? 124 : (typeof r.status === 'number' ? r.status : 1)
  const stdout = r.stdout || ''
  const stderr = (r.stderr || '') + (timedOut ? `\nhost: timed out after ${timeoutMs}ms\n` : '') +
    (r.error && !timedOut ? `\nhost: ${r.error.message}\n` : '')
  return { status, stdout, stderr, tail: tailOf(stdout + (stderr ? '\n' + stderr : '')) }
}

function git(root, args, env) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: env || process.env, maxBuffer: 64 * 1024 * 1024 })
}

function cacheDir(root) {
  const r = git(root, ['rev-parse', '--git-common-dir'])
  if (r.status !== 0) throw new Error(`host: ${root} is not a git checkout — run inside a git repository`)
  return path.join(path.resolve(root, r.stdout.trim()), 'spec-run-cache')
}

// A HEAD-seeded scratch index (so tracked-but-ignored files stay in), `add -A`, overlay removed,
// write-tree. Identical content gives the identical sha in any worktree of the repo.
function treeSha(root) {
  const dir = cacheDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const indexFile = path.join(dir, 'idx-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'))
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  try {
    const hasHead = git(root, ['rev-parse', '-q', '--verify', 'HEAD']).status === 0
    if (hasHead) must(git(root, ['read-tree', 'HEAD'], env), 'read-tree HEAD')
    must(git(root, ['add', '-A', '--', '.'], env), 'add -A')
    git(root, ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...OVERLAY], env)
    const sha = must(git(root, ['write-tree'], env), 'write-tree').stdout.trim()
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error('host: git write-tree printed no tree sha')
    return sha
  } finally {
    fs.rmSync(indexFile, { force: true })
    fs.rmSync(indexFile + '.lock', { force: true })
  }
}

function must(r, what) {
  if (r.status !== 0) throw new Error(`host: git ${what} failed: ${(r.stderr || r.stdout).trim()}`)
  return r
}

const keyFor = (cmd, tree) => crypto.createHash('sha256').update(cmd + '\0' + tree).digest('hex')

function lookup(root, cmd, tree) {
  try { return JSON.parse(fs.readFileSync(path.join(cacheDir(root), keyFor(cmd, tree) + '.json'), 'utf8')) } catch { return null }
}

function record(root, cmd, tree, entry) {
  const dir = cacheDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, keyFor(cmd, tree) + '.json')
  const tmp = file + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ cmd, tree, ...entry, ts: new Date().toISOString() }) + '\n')
  fs.renameSync(tmp, file)
}

const newRunId = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex')

// Runs config.testCommand in root unless this exact tree already ran green under it.
function gate(root, config, { timeoutMs } = {}) {
  const cmd = config && config.testCommand
  if (!cmd) {
    const e = new Error('no testCommand in .claude/spec.config.json — run /spec:init')
    e.exit = 2
    throw e
  }
  const tree = treeSha(root)
  const hit = lookup(root, cmd, tree)
  if (hit) return { status: 0, cached: true, runId: hit.runId, tail: hit.tail || '' }
  const runId = newRunId()
  const r = run(cmd, { cwd: root, timeoutMs })
  if (r.status === 0) record(root, cmd, tree, { runId, tail: r.tail })
  return { status: r.status, cached: false, runId, tail: r.tail }
}

// The line of a red tail worth reading first: a failure marker, else an error word, else the first line.
const firstRedLine = (tail) => {
  const ls = (tail || '').split('\n').filter((l) => l.trim() && !/^\s*(✔|✓|ok\b|PASS\b)/.test(l))
  return ls.find((l) => /✖|not ok|^\s*FAIL\b/.test(l)) || ls.find((l) => /\bfail|error|rejected/i.test(l)) || ls[0] || 'gate red'
}

function detectTestCommand(root) {
  const has = (f) => fs.existsSync(path.join(root, f))
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return '' } }
  if (has('package.json')) {
    let pkg = {}
    try { pkg = JSON.parse(read('package.json')) } catch { /* unreadable package.json: fall through */ }
    const t = pkg.scripts && pkg.scripts.test
    if (t && !/no test specified/.test(t)) {
      if (has('pnpm-lock.yaml')) return 'pnpm test'
      if (has('yarn.lock')) return 'yarn test'
      if (has('bun.lockb') || has('bun.lock')) return 'bun run test'
      return 'npm test'
    }
  }
  if (has('pytest.ini') || /\[tool\.pytest/.test(read('pyproject.toml')) || /\[tool:pytest\]/.test(read('setup.cfg'))) return 'pytest'
  if (has('go.mod')) return 'go test ./...'
  if (has('Cargo.toml')) return 'cargo test'
  return null
}

module.exports = { run, gate, treeSha, cacheDir, lookup, record, keyFor, detectTestCommand, tailOf, firstRedLine }
