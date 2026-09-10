'use strict'
// Shared helpers for the plugin's deterministic-layer tests.
//
// Workflow scripts (spec/workflows/*.js) run in the harness sandbox as an async function body
// (top-level `return` is legal there), so they cannot be require()d. extractFn() brace-matches a
// named top-level `function name(...) {...}` out of the source and evaluates it standalone, which
// is exactly the unit under test for the guard functions (normalizeArgs, validateGroups, isBatch).
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync, spawnSync, spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SPEC = path.join(ROOT, 'spec')

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function extractFn(src, name) {
  const sig = 'function ' + name + '('
  const at = src.indexOf(sig)
  if (at === -1) throw new Error('function ' + name + ' not found')
  // Preserve a leading `async ` keyword — dropping it silently turned every
  // await-bearing extraction into a SyntaxError under evalFns (spec 20260813/09 D7).
  const asyncPrefix = 'async '
  const start = at >= asyncPrefix.length && src.slice(at - asyncPrefix.length, at) === asyncPrefix
    ? at - asyncPrefix.length
    : at
  const open = src.indexOf('{', at)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error('unbalanced braces extracting ' + name)
}

// Evaluate one or more extracted functions and return the last one by name.
function evalFns(src, names) {
  const body = names.map(n => extractFn(src, n)).join('\n')
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn { ' + names.join(', ') + ' }')()
}

// Assert a workflow script is syntactically valid as an async sandbox body.
function checkWorkflowSyntax(rel) {
  const src = read(rel)
  // The sandbox strips the meta export before evaluation; mirror that.
  const body = src.replace(/^export const meta = \{[\s\S]*?\n\}\n/, '')
  // eslint-disable-next-line no-new-func
  new Function('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow',
    '"use strict"; return (async () => {' + body + '\n})()')
}

// Every temp directory this test process (and every child it spawns) creates lands under one
// per-process root that is removed exactly once when the process ends — normal exit, thrown
// error, or an interrupt signal. Without this, each tmpdir() call left a ~700-inode tree behind
// on /tmp; eight full-suite runs leaked enough fixture trees to fill a 7.8G tmpfs, exhaust the
// inode table, and stall unrelated tools with ENOSPC. TMPDIR is set here so scripts under test
// that call os.tmpdir() themselves (review-legs.js, release-legs.js, render-capture.js) land
// under the same root and are swept with it. Tests that already rmSync their own dirs keep
// working: removing a subtree twice is a no-op.
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
    // Re-deliver the signal with default disposition so the exit status stays signal-shaped
    // (the test runner and the shell see a real interrupt, not a clean exit).
    process.kill(process.pid, sig)
  })
}

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(RUN_ROOT, prefix + '-'))
}

function runNode(script, argv, opts = {}) {
  return spawnSync(process.execPath, [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

function runBash(script, argv, opts = {}) {
  return spawnSync('bash', [path.join(SPEC, script), ...argv],
    { encoding: 'utf8', ...opts })
}

// specs/20260909/06-ephemeral-serve-ports.md D2: the one port-binding pair every serve-backed
// test uses — no test in this repo chooses a port number itself. freePort() binds :0, reads the
// bound number, and closes so the caller can hand it to a process that will bind it for real
// (D4's one legitimate use: two cooperating processes — a serve child and a second CLI
// invocation, or a deliberate reuse probe — that must agree on the same port ahead of time).
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

// serveAtlas(root, {port, script} = {}): spawns design-atlas.js (or `script`, a test seam for
// AC-20260909-06-4's stub) `serve --root <root> --port <port ?? 0>` and resolves once the
// child's first stdout line names a bound port (`http://localhost:(\d+)/` — the banner verb is
// deliberately not part of the parse, D4/AC-20260909-06-6), or rejects after 5000 ms with the
// child's accumulated stderr, having already SIGKILLed the child and attached it to the
// rejection as `err.child` so a caller can assert the timed-out child actually exited
// (AC-20260909-06-4). `stop()` sends SIGTERM, then SIGKILL after 5000 ms if the child has not
// exited, and resolves once it has.
function serveAtlas(root, opts = {}) {
  const scriptPath = opts.script || path.join(SPEC, 'scripts/design-atlas.js')
  const port = opts.port
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      [scriptPath, 'serve', '--root', root, '--port', String(port == null ? 0 : port)])
    let stdoutBuf = ''
    let stderrBuf = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const rejectWithChild = () => {
        const err = new Error('serveAtlas: no banner within 5000 ms\n' + stderrBuf)
        err.child = child
        reject(err)
      }
      if (child.exitCode !== null || child.signalCode !== null) { rejectWithChild(); return }
      child.once('exit', rejectWithChild)
      child.kill('SIGKILL')
    }, 5000)
    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8')
      const m = stdoutBuf.match(/http:\/\/localhost:(\d+)\//)
      if (!m) return
      finish(() => {
        const boundPort = Number(m[1])
        resolve({
          port: boundPort,
          url: 'http://localhost:' + boundPort,
          child,
          stop() {
            return new Promise((res) => {
              if (child.exitCode !== null || child.signalCode !== null) { res(); return }
              const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } }, 5000)
              child.once('exit', () => { clearTimeout(killer); res() })
              child.kill('SIGTERM')
            })
          },
        })
      })
    })
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString('utf8') })
    child.on('error', (err) => finish(() => reject(err)))
  })
}

// Minimal git repo factory for merge-back / gate tests.
//
// Seeding from scratch costs 5 git subprocesses (init, config x2, add, commit), and every repo
// this helper makes starts from one of two fixed shapes. Each shape is therefore built once per
// test-runner process and later callers get a copy-on-write clone of it — a near-free reflink on
// APFS/btrfs. COPYFILE_FICLONE (not _FORCE) degrades to a normal recursive copy where reflinks
// are unavailable, so the helper stays portable.
//
// The clone path requires an EMPTY target directory. Callers may write files into the dir first
// and rely on `git add -A` sweeping them into the base commit; a clone would leave those files
// uncommitted and silently change what the test observes, so a non-empty target seeds from
// scratch instead. The branch is chosen by inspection at call time, never by the caller.
//
// Does NOT: change the returned `g` helper, the branch name, the committer identity, the seeded
// file set, or the base commit's content. Repos cloned from one template within a process share
// a base commit SHA — tests read that SHA at runtime (`g('rev-parse','HEAD')`) rather than
// pinning a literal, so sharing it is invisible to them.
const gitTemplates = new Map()

function seedGitRepo(dir, opts) {
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' })
  g('config', 'user.email', 'test@test')
  g('config', 'user.name', 'test')
  if (!opts.empty) {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
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

function gitRepo(dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true })
  if (!isEmptyDir(dir)) return seedGitRepo(dir, opts)
  fs.cpSync(gitTemplate(opts.empty ? 'empty' : 'seeded'), dir,
    { recursive: true, mode: fs.constants.COPYFILE_FICLONE })
  return (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
}

module.exports = {
  ROOT, SPEC, read, extractFn, evalFns, checkWorkflowSyntax, tmpdir, runNode, runBash, gitRepo,
  freePort, serveAtlas,
}
