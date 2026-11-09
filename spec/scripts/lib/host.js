'use strict'
// lib/host.js — host commands, the test gate with its green-run cache, the app, test-command detection. No CLI.
// run(cmd, {cwd, env, timeoutMs}) → {status, stdout, stderr, tail}; timeout → 124. gate(root, config) → {status, cached,
// runId, tail, tree, failing, lockWaitMs}: green runs cached by tree, at most gateConcurrency at once on the host;
// testsExecuted(output, pattern) reads a test count.
// copyIncluded(main, wt) copies the .worktreeinclude matches into a fresh worktree; treeSha(root) is the working tree's
// git tree; provision(root, {rel, branch, from, config}) → {wt, fresh, setup} makes a worktree as every driver does
// (the .worktreeinclude files and setupCommand on a fresh one; prepare is that second half); detectTestCommand,
// firstRedLine, freePort, resolveUrl, listening. The host's app is lib/app.js.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const G = require('./git')
const { spawnSync } = require('child_process')

const TAIL_LINES = 40
// Pipeline files that never count toward the tree a gate ran over.
const OVERLAY = [':(glob)**/*.run/**', '.claude/pending-question.json']

const tailOf = (text, n = TAIL_LINES) => String(text || '').replace(/\s+$/, '').split('\n').slice(-n).join('\n')

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

const git = (root, args, env) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: env || process.env, maxBuffer: 64 * 1024 * 1024 })

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

const must = (r, what) => { if (r.status !== 0) throw new Error(`host: git ${what} failed: ${(r.stderr || r.stdout).trim()}`); return r }

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

const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }

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

// Port of v7 computeTestsExecuted: the LAST match of the pattern (a decoy test name can quote the summary phrase
// before the real one) read as a count; null when the pattern is absent or `none`, or matches nothing.
function testsExecuted(output, pattern) {
  if (!pattern || pattern === 'none') return null
  let last = null
  for (const m of output.matchAll(new RegExp(pattern, 'g'))) last = m
  return last ? Number(last[1]) || 0 : null
}

// Known runner summaries, one capture group each: node --test TAP and spec reporter, jest, vitest, pytest. init sets
// the first that counts more than 0 in its probe's output as config.testCountPattern.
const COUNT_PATTERNS = ['# tests (\\d+)', 'ℹ tests (\\d+)', 'Tests:\\s+(\\d+) passed', 'Tests\\s+(\\d+) passed',
  '(\\d+) passed[^\\n]* in [\\d.]+s']

// Runs config.testCommand in root unless this exact tree already ran green under it. With config.testCountPattern
// set (not `none`), an exit 0 that counts 0 tests or matches nothing is red.
function gate(root, config, { timeoutMs } = {}) {
  const cmd = config && config.testCommand
  if (!cmd) throw Object.assign(new Error('no testCommand in .claude/spec.config.json — run /spec:init'), { exit: 2 })
  const tree = treeSha(root)
  const hit = lookup(root, cmd, tree)
  if (hit) return { status: 0, cached: true, runId: hit.runId, tail: hit.tail || '', tree, failing: [], lockWaitMs: 0 }
  const runId = newRunId()
  const slot = takeSlot(root, config)
  try {
    const t0 = Date.now()
    const r = run(cmd, { cwd: root, timeoutMs })
    const pat = r.status === 0 && config.testCountPattern
    if (pat && pat !== 'none' && !testsExecuted(r.stdout + r.stderr, pat)) {
      Object.assign(r, { status: 1, tail: `exited 0 but ran no tests (testCountPattern ${pat}):\n${r.tail}` })
    }
    if (r.status === 0) record(root, cmd, tree, { runId, tail: r.tail, ms: Date.now() - t0 })
    return { status: r.status, cached: false, runId, tail: r.tail, tree, failing: r.status === 0 ? [] : failingFiles(root, r.tail), lockWaitMs: slot.waitedMs }
  } finally { slot.release() }
}

// The files .worktreeinclude selects, a port of v7's worktree-include.sh: untracked files its patterns
// match (git's own exclude grammar, `!` negation included), minus .claude/worktrees/, that git also
// ignores. No manifest gives [].
function worktreeIncluded(root) {
  if (!fs.existsSync(path.join(root, '.worktreeinclude'))) return []
  const ls = git(root, ['ls-files', '-z', '-oi', '--exclude-from=.worktreeinclude'])
  if (ls.status !== 0) return []
  const cand = ls.stdout.split('\0').filter((f) => f && !f.startsWith('.claude/worktrees/'))
  if (!cand.length) return []
  const r = spawnSync('git', ['-C', root, 'check-ignore', '-z', '--stdin'], { encoding: 'utf8', input: cand.join('\0') + '\0', maxBuffer: 64 * 1024 * 1024 })
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : []
}

// The .worktreeinclude matches of the main checkout, copied to the same path in a fresh worktree.
function copyIncluded(main, wt) {
  for (const rel of worktreeIncluded(main)) {
    if (!fs.statSync(path.join(main, rel), { throwIfNoEntry: false })?.isFile()) continue
    fs.mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true })
    fs.copyFileSync(path.join(main, rel), path.join(wt, rel))
  }
}

// What a fresh worktree gets before anything runs in it: the .worktreeinclude files of the main checkout, then the
// host's setupCommand. Returns the setupCommand's result ({status: 0} when there is none or the worktree is not fresh);
// a non-zero status is for the caller to refuse.
function prepare(main, wt, config, fresh) {
  if (!fresh) return { status: 0 }
  copyIncluded(main, wt)
  return config && config.setupCommand ? run(config.setupCommand, { cwd: wt }) : { status: 0 }
}

// The one way a driver makes a worktree at `rel` on `branch`: git.worktreeAdd, then prepare on a fresh one.
function provision(root, { rel, branch, from, config }) {
  const fresh = !fs.existsSync(path.resolve(root, rel))
  const wt = G.worktreeAdd(root, rel, branch, from)
  return { wt, fresh, setup: prepare(G.worktreeList(root)[0], wt, config, fresh) }
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

module.exports = { freePort, resolveUrl, listening, provision, prepare, run, gate, treeSha, cacheDir, commonDir,
  copyIncluded, worktreeIncluded, failingFiles, lookup, record, keyFor, detectTestCommand, tailOf, firstRedLine,
  testsExecuted, COUNT_PATTERNS }
