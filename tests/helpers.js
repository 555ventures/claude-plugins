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
// Resolved to its real path: macOS reaches the temp dir through /var -> /private/var and Windows
// through 8.3 short names, and the scripts name state paths by their real path on every OS.
const RUN_ROOT = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tests-' + process.pid + '-')))
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

// The tagged v7 scripts, extracted once per process. A missing tag throws: the oracle fails, it never skips.
let v7Dir = null
function v7Scripts() {
  if (!v7Dir) {
    const dir = tmpdir('v7')
    const tar = execFileSync('git', ['-C', ROOT, 'archive', 'spec-v7-final', 'spec/scripts'], { maxBuffer: 256 * 1024 * 1024 })
    execFileSync('tar', ['-x', '-C', dir], { input: tar })
    v7Dir = path.join(dir, 'spec', 'scripts')
  }
  return v7Dir
}

// A copy of a fixture host beside it whose queue file is the v1 twin of the host's v2 file and whose
// specs read the state v8 derives (a live sidecar stamps `implementing`), so v7 can run on it.
function v1Queue(root) {
  const { normBrief } = require(path.join(SPEC, 'scripts/lib/work.js'))
  const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
  const st = require(path.join(SPEC, 'scripts/lib/state.js'))
  const twin = root + '-v1'
  fs.rmSync(twin, { recursive: true, force: true })
  fs.cpSync(root, twin, { recursive: true })
  const q = st.readJson(path.join(st.gitCommonDir(root), 'spec-queue.json'))
  if (q) {
    const items = q.items.map((i) => {
      const base = { id: i.id, kind: i.kind }
      const body = i.kind === 'brief' ? { brief: normBrief(i.payload) } : i.kind === 'spec' ? { spec: i.payload } : { payload: Q.text(i), lane: i.type }
      return { ...base, ...body, ...(i.after ? { after: i.after } : {}), ...(i.done ? { ticked: true } : {}), added: i.added }
    })
    st.writeJson(path.join(st.gitCommonDir(twin), 'spec-queue.json'), { version: 1, seq: q.seq, items })
  }
  const { readSpecs } = require(path.join(SPEC, 'scripts/lib/work.js'))
  for (const s of readSpecs(root)) {
    if (st.readSpec(path.join(twin, s.path)).frontmatter.status !== s.status) st.writeStatus(path.join(twin, s.path), s.status)
  }
  return twin
}

// Ends every process whose working directory is under dir: what a test's app leaves that a SPEC_APP read cannot see
// (a SIP-protected binary such as `sleep` shows ps no environment).
function killStrays(dir) {
  const reap = require(path.join(SPEC, 'scripts/lib/reap.js'))
  for (const pid of reap.cwdUnder(reap.procs().map((p) => p.pid).filter((p) => p !== process.pid), dir)) {
    try { process.kill(pid, 'SIGKILL') } catch { /* gone */ }
  }
}

module.exports = { ROOT, SPEC, RUN_ROOT, tmpdir, runNode, runBash, freePort, gitRepo, v7Scripts, v1Queue, killStrays }
