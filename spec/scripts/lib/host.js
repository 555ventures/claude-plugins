'use strict'
// lib/host.js — run host commands, the test gate with its green-run cache, and test-command
// detection for init. No CLI.
//
// run(cmd, {cwd, env, timeoutMs})  → {status, stdout, stderr, tail}; timeout → status 124
// gate(root, config)               → {status, cached, runId, tail, tree, failing, lockWaitMs}; green runs
//                                    cached by tree hash; at most config.gateConcurrency gates run at once
//                                    on the host (pid files under <git common dir>/spec-gate.lock/)
// copyLaneFiles(main, wt, files)   copies untracked root files into a fresh worktree
// treeSha(root)                    git tree of the working tree (tracked edits + untracked, not ignored)
// detectTestCommand(root)          → command string or null
// firstRedLine(tail)               the line of a red tail worth reading first
// freePort()                       a port nothing is bound to on 127.0.0.1 (bind 0, read it, close)
// resolveUrl(url, port)            `{port}` in url replaced
// listening(url)                   true when anything answers an HTTP request at url within 2 s
// allocApp(url)                    {appPort, url}: a free port for a `{port}` url; a fixed url must be unanswered (else exit 2)

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

function commonDir(root) {
  const r = git(root, ['rev-parse', '--git-common-dir'])
  if (r.status !== 0) throw new Error(`host: ${root} is not a git checkout — run inside a git repository`)
  return path.resolve(root, r.stdout.trim())
}

const cacheDir = (root) => path.join(commonDir(root), 'spec-run-cache')

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

// The repo-relative files a red tail names: path-shaped tokens that exist under root, deduplicated.
const FILE_TOKEN = /(^|[\s'"(])((?:[\w.@-]+\/)+[\w.@-]+\.[a-z]{1,5})(?=[\s:'")(]|$)/gm

function failingFiles(root, tail) {
  const out = []
  for (const m of String(tail || '').matchAll(FILE_TOKEN)) {
    const rel = path.normalize(m[2]).split(path.sep).join('/')
    if (rel.startsWith('..') || out.includes(rel)) continue
    try { if (fs.statSync(path.join(root, rel)).isFile()) out.push(rel) } catch { /* not a file under root */ }
  }
  return out
}

// ---- gate slots: a pid file per running gate, shared by every worktree through the common dir ----

function slots(config) {
  const raw = config && config.gateConcurrency
  if (raw === undefined || raw === null) return 2
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.max(1, n) : 2
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// Live holders other than `self`; holder files naming a dead pid are deleted on sight.
function holders(dir, self) {
  const live = []
  let names = []
  try { names = fs.readdirSync(dir) } catch { /* no directory yet */ }
  for (const n of names) {
    const pid = Number(n)
    if (!Number.isInteger(pid) || pid <= 0 || String(pid) !== n || pid === self) continue
    if (alive(pid)) live.push(pid); else fs.rmSync(path.join(dir, n), { force: true })
  }
  return live
}

// Takes a slot (blocking, polling every 2 s) and returns {release, waitedMs}.
function takeSlot(root, config) {
  const dir = path.join(commonDir(root), 'spec-gate.lock')
  fs.mkdirSync(dir, { recursive: true })
  const limit = slots(config)
  const mine = path.join(dir, String(process.pid))
  const t0 = Date.now()
  let told = false
  for (;;) {
    fs.writeFileSync(mine, `${process.pid} ${new Date().toISOString()} ${root}\n`)
    const others = holders(dir, process.pid)
    // Symmetric check after writing: of two racing gates both see the other and both back off.
    if (others.length + 1 <= limit) return { release: () => fs.rmSync(mine, { force: true }), waitedMs: told ? Date.now() - t0 : 0 }
    fs.rmSync(mine, { force: true })
    if (!told) { process.stderr.write(`gate: waiting for a slot (${others.length} running) …\n`); told = true }
    sleepMs(2000 + Math.floor(Math.random() * 200))
  }
}

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
  if (hit) return { status: 0, cached: true, runId: hit.runId, tail: hit.tail || '', tree, failing: [], lockWaitMs: 0 }
  const runId = newRunId()
  const slot = takeSlot(root, config)
  try {
    const t0 = Date.now()
    const r = run(cmd, { cwd: root, timeoutMs })
    if (r.status === 0) record(root, cmd, tree, { runId, tail: r.tail, ms: Date.now() - t0 })
    return { status: r.status, cached: false, runId, tail: r.tail, tree, failing: r.status === 0 ? [] : failingFiles(root, r.tail), lockWaitMs: slot.waitedMs }
  } finally { slot.release() }
}

// Each named file that exists in the main checkout and is untracked is copied into the same path in
// the worktree. A tracked or missing entry is skipped with a stderr line.
function copyLaneFiles(main, wt, files) {
  for (const p of Array.isArray(files) ? files : []) {
    const src = path.resolve(main, p)
    const rel = path.relative(main, src)
    let why = null
    if (rel.startsWith('..') || path.isAbsolute(rel)) why = 'missing'
    else if (!fs.existsSync(src) || !fs.statSync(src).isFile()) why = 'missing'
    else if (git(main, ['ls-files', '--error-unmatch', '--', rel]).status === 0) why = 'tracked'
    if (why) { process.stderr.write(`laneFiles: skipped ${p} (${why})\n`); continue }
    const dst = path.join(wt, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
  }
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

// Binds port 0 in a child, reads the port it was given, closes. Sync: drivers allocate inside a step.
function freePort() {
  const r = spawnSync(process.execPath, ['-e',
    "const s = require('net').createServer(); s.listen(0, '127.0.0.1', () => { process.stdout.write(String(s.address().port)); s.close() })"],
  { encoding: 'utf8', timeout: 10000 })
  const port = Number(r.stdout)
  if (r.status !== 0 || !Number.isInteger(port) || port <= 0) throw new Error('host: could not find a free port')
  return port
}

const resolveUrl = (url, port) => String(url).replace(/\{port\}/g, port == null ? '{port}' : String(port))

// Any HTTP answer within 2 s counts as listening.
const listening = (url) => spawnSync(process.execPath, ['-e',
  'fetch(process.argv[1], { signal: AbortSignal.timeout(2000) }).then(() => process.exit(0), () => process.exit(1))', url],
{ timeout: 5000 }).status === 0

// One port per app: a url with {port} gets a free one; a fixed url keeps appPort null and must not be answered already.
function allocApp(urlTemplate) {
  if (/\{port\}/.test(urlTemplate)) {
    const port = freePort()
    return { appPort: port, url: resolveUrl(urlTemplate, port) }
  }
  if (listening(urlTemplate)) {
    const e = new Error(`something already answers at ${urlTemplate} and it is not this app — stop it, or put {port} in prototype.url`)
    e.exit = 2
    throw e
  }
  return { appPort: null, url: urlTemplate }
}

module.exports = { freePort, resolveUrl, listening, allocApp, run, gate, treeSha, cacheDir, commonDir, copyLaneFiles, failingFiles, lookup, record, keyFor, detectTestCommand, tailOf, firstRedLine }
