'use strict'
// Shared test helpers: tmpdir, gitRepo, runNode, runBash, freePort, SPEC.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SPEC = path.join(ROOT, 'spec')

// Every temp directory this test process (and every child it spawns) creates lands under one
// per-process root, removed exactly once when the process ends — normal exit, thrown error, or
// an interrupt signal. Without this each tmpdir() leaked a fixture tree on /tmp until the inode
// table filled. TMPDIR is set so scripts under test that call os.tmpdir() land under it too.
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tests-' + process.pid + '-'))
process.env.TMPDIR = RUN_ROOT

let swept = false

function removeRunRoot() {
  if (swept) return
  swept = true
  try { fs.rmSync(RUN_ROOT, { recursive: true, force: true, maxRetries: 3 }) } catch { /* best-effort: never fail a run on cleanup */ }
}

process.once('exit', removeRunRoot)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => {
    removeRunRoot()
    // Re-deliver the signal with default disposition so the exit status stays signal-shaped.
    process.kill(process.pid, sig)
  })
}

function tmpdir(prefix = 'tmp') {
  return fs.mkdtempSync(path.join(RUN_ROOT, prefix + '-'))
}

// The child-session marker is stripped from every spawned script unless opts.env sets it.
function childEnv(opts) {
  return { ...process.env, CLAUDE_CODE_CHILD_SESSION: undefined, ...(opts.env || {}) }
}

// script is relative to spec/ (e.g. 'scripts/run.js') or absolute.
function runNode(script, argv = [], opts = {}) {
  return spawnSync(process.execPath, [path.resolve(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts, env: childEnv(opts) })
}

function runBash(script, argv = [], opts = {}) {
  return spawnSync('bash', [path.resolve(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts, env: childEnv(opts) })
}

// Bind :0, read the port, close — for two cooperating processes that must agree on a port.
function freePort() {
  return new Promise((resolve, reject) => {
    const net = require('net')
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

// Git repo factory. Each shape (seeded | empty) is built once per process and later callers get
// a copy-on-write clone (COPYFILE_FICLONE degrades to a plain copy). A non-empty target dir is
// seeded from scratch instead so files the caller wrote first land in the base commit.
// Seeded shape: branch main, identity test@test, .gitignore (.claude/worktrees/), a.txt, one commit.
const gitTemplates = new Map()

function seedGitRepo(dir, opts) {
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' })
  g('config', 'user.email', 'test@test')
  g('config', 'user.name', 'test')
  g('config', 'commit.gpgsign', 'false')
  if (!opts.empty) {
    if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n')
    if (!fs.existsSync(path.join(dir, 'a.txt'))) fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'init')
  }
  return g
}

function gitTemplate(kind) {
  if (!gitTemplates.has(kind)) {
    const dir = fs.mkdtempSync(path.join(RUN_ROOT, 'git-template-' + kind + '-'))
    seedGitRepo(dir, { empty: kind === 'empty' })
    gitTemplates.set(kind, dir)
  }
  return gitTemplates.get(kind)
}

function isEmptyDir(dir) {
  try { return fs.readdirSync(dir).length === 0 } catch { return true }
}

// Returns g(...args) → git stdout in dir.
function gitRepo(dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (!isEmptyDir(dir)) return seedGitRepo(dir, opts)
  fs.cpSync(gitTemplate(opts.empty ? 'empty' : 'seeded'), dir,
    { recursive: true, mode: fs.constants.COPYFILE_FICLONE })
  return (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
}

module.exports = { ROOT, SPEC, RUN_ROOT, tmpdir, runNode, runBash, freePort, gitRepo }
