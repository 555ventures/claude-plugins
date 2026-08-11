'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { ROOT, tmpdir } = require('../helpers')

// spec: specs/20260810/03-repo-discovery.md — pins AC-20260810-03-1, -2, -3, -4, -5, -6, -7,
// -8, -12 for the new `autopilot discover` subcommand (autopilot/bin/autopilot) and its pure
// scan library (autopilot/daemon/discover.js). Neither the `discover` subcommand nor
// discover.js exists yet — both are CREATE/MODIFY File Plan rows — so the top-level require of
// discover.js below crashes this whole file at load time, exactly mirroring
// tests/autopilot/enroll.test.js's established red-phase pattern (config.test.js precedent).
//
// CLI-level cases (AC-4..8) reuse enroll.test.js's stub-hub + async-spawn shape: the stub hub
// server lives in THIS process, so `spawn` (never `spawnSync`) is required or the child's
// requests can never reach it (specs/20260808/01-autopilot-enroll.md repair round 1 gotcha,
// § Gotchas in .claude/rules/spec-pipeline.md). Several assertions are deliberately stricter
// than "status only" so they cannot pass by coincidence against the CURRENT code's fallback
// "unknown subcommand" handler, which also exits 2/reuses the enroll USAGE string.

const AUTOPILOT_BIN = path.join(ROOT, 'autopilot', 'bin', 'autopilot')
const DISCOVER_PATH = path.join(ROOT, 'autopilot', 'daemon', 'discover.js')
const { discoverRepos, DiscoverError } = require(DISCOVER_PATH)

function runAutopilot(args, opts = {}) {
  const { env, home = tmpdir('autopilot-home'), ...rest } = opts
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AUTOPILOT_BIN, ...args], {
      ...rest,
      env: { ...process.env, HOME: home, USERPROFILE: home, ...(env || {}) },
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, 5000)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ status: null, signal: null, stdout, stderr, home, error })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ status: timedOut ? null : code, signal, stdout, stderr, home })
    })
  })
}

function hubJsonPath(home) {
  return path.join(home, '.config', 'autopilot', 'hub.json')
}

function writeHubJson(home, overrides = {}) {
  const dir = path.join(home, '.config', 'autopilot')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const cfgPath = path.join(dir, 'hub.json')
  const base = {
    hubUrl: 'http://placeholder.invalid', spokeId: 'sp_1', token: 'tok_1', machineName: 'box',
    projects: [], contractVersion: 1, enrolledAt: '2020-01-01T00:00:00Z',
  }
  fs.writeFileSync(cfgPath, JSON.stringify({ ...base, ...overrides }), { mode: 0o600 })
  return cfgPath
}

function makeRepo(root, name, { grounded = true, worktree = false } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  if (grounded) {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'spec.config.json'), '{}')
  }
  if (worktree) {
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n')
  }
  return dir
}

function startStub(handler) {
  return new Promise((resolve) => {
    const requests = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, headers: req.headers, body })
        handler(req, res, body)
      })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, requests }))
  })
}

function stopStub(server) {
  return new Promise((resolve) => server.close(resolve))
}

// --- discoverRepos: pure scan unit tests (D1-D3, D2 symlink rule) ---

test('AC-20260810-03-1: discoverRepos returns only the .claude/spec.config.json-grounded directory, skipping a non-grounded dir, a plain file, and a dot-directory', () => {
  const root = tmpdir('discover-root')
  makeRepo(root, 'alpha', { grounded: true })
  fs.mkdirSync(path.join(root, 'beta'))
  fs.writeFileSync(path.join(root, 'beta', 'README.md'), '# beta\n')
  fs.writeFileSync(path.join(root, 'notes.txt'), 'hi\n')
  fs.mkdirSync(path.join(root, '.cache'))
  const result = discoverRepos({ reposRoot: root })
  assert.deepStrictEqual(result, [{ name: 'alpha', root: path.join(root, 'alpha') }],
    `only the spec-grounded directory (.claude/spec.config.json present) must be discovered — a non-grounded dir, a file, and a dot-directory registering as hub projects would corrupt the fleet's project list; got ${JSON.stringify(result)}`)
})

test('AC-20260810-03-2: discoverRepos skips a spec-grounded candidate whose .git is a regular file (a git-worktree checkout)', () => {
  const root = tmpdir('discover-root')
  makeRepo(root, 'wt', { grounded: true, worktree: true })
  const result = discoverRepos({ reposRoot: root })
  assert.deepStrictEqual(result, [],
    `a git-worktree checkout (regular-file .git) must never be discovered — registering it would create a phantom hub project for a pipeline worktree, not a real repo; got ${JSON.stringify(result)}`)
})

test('AC-20260810-03-12: discoverRepos does not discover a symlink pointing at a real spec-grounded directory', () => {
  const real = tmpdir('discover-real')
  makeRepo(real, 'target', { grounded: true })
  const root = tmpdir('discover-root')
  fs.symlinkSync(path.join(real, 'target'), path.join(root, 'linked'), 'dir')
  const result = discoverRepos({ reposRoot: root })
  assert.deepStrictEqual(result, [],
    `a symlink to a spec-grounded directory must be skipped (Dirent.isDirectory() is false for a symlink, D2) — following it would let one repo register under two different names; got ${JSON.stringify(result)}`)
})

test('AC-20260810-03-3: discoverRepos throws DiscoverError naming the colliding absolute path(s) and registers nothing when two candidates share a basename', () => {
  const root = '/fake/discover-root'
  const dirA = path.join(root, 'alpha')
  const fakeFs = {
    readdirSync: (dir) => {
      if (dir === root) {
        return [
          { name: 'alpha', isDirectory: () => true, isSymbolicLink: () => false },
          { name: 'alpha', isDirectory: () => true, isSymbolicLink: () => false },
        ]
      }
      return []
    },
    existsSync: (p) => p === path.join(dirA, '.claude', 'spec.config.json'),
    statSync: () => ({ isFile: () => false, isDirectory: () => true }),
  }
  assert.throws(
    () => discoverRepos({ reposRoot: root, fsImpl: fakeFs }),
    (err) => {
      assert.ok(err instanceof DiscoverError,
        'a basename collision must throw the specific DiscoverError type or a caller cannot distinguish it from an ordinary I/O failure')
      assert.ok(err.message.includes(dirA),
        `the error message must name the colliding absolute path or an operator cannot tell which two directories collided; got ${err.message}`)
      return true
    },
    "a basename collision (two candidates named 'alpha') must throw, never silently keep one and drop the other — a soft merge would interleave two repos' narration into one hub topic (D3)"
  )
})

// --- autopilot discover: CLI-level tests (D4-D8) ---

test('AC-20260810-03-4: autopilot discover with no hub.json exits 2 naming "autopilot enroll" as the remedy', async () => {
  const res = await runAutopilot(['discover'])
  assert.strictEqual(res.status, 2, `missing hub.json must exit 2; got status=${res.status} stderr=${res.stderr}`)
  assert.match(res.stderr, /hub\.json/,
    `stderr must name the missing hub.json specifically, not a generic usage fallback, or an operator cannot tell what is wrong; got ${res.stderr}`)
  assert.match(res.stderr, /autopilot enroll/,
    `stderr must name "autopilot enroll" as the remedy or a fresh machine has no path forward; got ${res.stderr}`)
})

test('AC-20260810-03-5: autopilot discover registers two repos in basename order, one POST each, and rewrites hub.json with the returned project list, reposRoot, and preserved fields at mode 0600', async () => {
  const { server, port, requests } = await startStub((req, res, body) => {
    const parsed = JSON.parse(body)
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ projectId: `p_${parsed.name}`, name: parsed.name, created: true, contractVersion: 1 }))
  })
  try {
    const home = tmpdir('autopilot-home')
    const hubUrl = `http://127.0.0.1:${port}`
    const cfgPath = writeHubJson(home, { hubUrl })
    const reposRoot = tmpdir('discover-root')
    makeRepo(reposRoot, 'beta')
    makeRepo(reposRoot, 'alpha')
    const res = await runAutopilot(['discover', '--repos-root', reposRoot], { home })
    assert.strictEqual(res.status, 0, `a successful discover run must exit 0; got status=${res.status} stderr=${res.stderr}`)
    assert.strictEqual(requests.length, 2, `discover must POST exactly once per discovered repo; got ${requests.length} requests`)
    assert.strictEqual(JSON.parse(requests[0].body).name, 'alpha',
      'repos must register in basename order (alpha before beta) for deterministic output and unambiguous failure attribution (D4)')
    assert.strictEqual(JSON.parse(requests[1].body).name, 'beta',
      'repos must register in basename order (alpha before beta)')
    const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    assert.deepStrictEqual(saved.projects, [
      { projectId: 'p_alpha', name: 'alpha' },
      { projectId: 'p_beta', name: 'beta' },
    ], `hub.json's projects list must be rewritten with the hub's returned {projectId,name} pairs; got ${JSON.stringify(saved.projects)}`)
    assert.strictEqual(saved.reposRoot, reposRoot,
      'hub.json must persist the resolved reposRoot or a later run cannot rediscover the default root without the flag')
    assert.strictEqual(saved.hubUrl, hubUrl, 'unrelated fields (hubUrl) must survive the rewrite untouched')
    assert.strictEqual(saved.token, 'tok_1', 'unrelated fields (token) must survive the rewrite untouched')
    const stat = fs.statSync(cfgPath)
    assert.strictEqual(stat.mode & 0o777, 0o600,
      `hub.json must stay mode 0600 after rewrite (it carries a bearer token) or an unrelated local user can read it; got mode=${(stat.mode & 0o777).toString(8)}`)
    assert.match(res.stdout, /\+ registered.*alpha/,
      `stdout must render a newly-created registration as "+ registered" (D8) so an operator can see drift-healing worked; got ${res.stdout}`)
    assert.match(res.stdout, /\+ registered.*beta/,
      `stdout must render beta's new registration as "+ registered" too; got ${res.stdout}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260810-03-6: a non-2xx from the projects route for the second of two repos exits 1 naming that repo and the HTTP status, leaving hub.json unchanged', async () => {
  const { server, port } = await startStub((req, res, body) => {
    const parsed = JSON.parse(body)
    if (parsed.name === 'alpha') {
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ projectId: 'p_alpha', name: 'alpha', created: true, contractVersion: 1 }))
    } else {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 'internal_error', message: 'boom' }))
    }
  })
  try {
    const home = tmpdir('autopilot-home')
    const hubUrl = `http://127.0.0.1:${port}`
    const cfgPath = writeHubJson(home, { hubUrl })
    const before = fs.readFileSync(cfgPath, 'utf8')
    const reposRoot = tmpdir('discover-root')
    makeRepo(reposRoot, 'alpha')
    makeRepo(reposRoot, 'beta')
    const res = await runAutopilot(['discover', '--repos-root', reposRoot], { home })
    assert.strictEqual(res.status, 1, `a non-2xx registration must exit 1; got status=${res.status} stderr=${res.stderr}`)
    assert.match(res.stderr, /beta/,
      `stderr must name the failing repo (beta) or an operator cannot tell which registration failed; got ${res.stderr}`)
    assert.match(res.stderr, /500/,
      `stderr must name the failing HTTP status or an operator cannot tell what kind of failure occurred; got ${res.stderr}`)
    assert.strictEqual(fs.readFileSync(cfgPath, 'utf8'), before,
      'hub.json must be left byte-identical on a mid-run failure — the projects route is idempotent so the next run heals; a partial rewrite would lose the already-registered project')
  } finally {
    await stopStub(server)
  }
})

test('AC-20260810-03-7: --json prints exactly one JSON object {reposRoot, projects} on stdout and no other stdout output', async () => {
  const { server, port } = await startStub((req, res) => {
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ projectId: 'p_alpha', name: 'alpha', created: true, contractVersion: 1 }))
  })
  try {
    const home = tmpdir('autopilot-home')
    const hubUrl = `http://127.0.0.1:${port}`
    writeHubJson(home, { hubUrl })
    const reposRoot = tmpdir('discover-root')
    makeRepo(reposRoot, 'alpha')
    const res = await runAutopilot(['discover', '--repos-root', reposRoot, '--json'], { home })
    assert.strictEqual(res.status, 0, `expected exit 0; got stderr=${res.stderr}`)
    const lines = res.stdout.split('\n').filter((l) => l.length > 0)
    assert.strictEqual(lines.length, 1,
      `--json must print exactly one line of stdout (the JSON object) or a machine consumer's JSON.parse breaks on mixed human+machine output; got stdout=${JSON.stringify(res.stdout)}`)
    const parsed = JSON.parse(lines[0])
    assert.deepStrictEqual(parsed, {
      reposRoot,
      projects: [{ projectId: 'p_alpha', name: 'alpha', created: true, root: path.join(reposRoot, 'alpha') }],
    }, `--json output must deep-equal the contracted shape verbatim (D8); got ${lines[0]}`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260810-03-8: discover with no --repos-root uses hub.json.reposRoot when present', async () => {
  const { server, port, requests } = await startStub((req, res) => {
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ projectId: 'p_alpha', name: 'alpha', created: true, contractVersion: 1 }))
  })
  try {
    const home = tmpdir('autopilot-home')
    const hubUrl = `http://127.0.0.1:${port}`
    const reposRoot = tmpdir('discover-root')
    makeRepo(reposRoot, 'alpha')
    writeHubJson(home, { hubUrl, reposRoot })
    const res = await runAutopilot(['discover'], { home })
    assert.strictEqual(res.status, 0,
      `discover with no --repos-root must fall back to hub.json's persisted reposRoot (D5); got status=${res.status} stderr=${res.stderr}`)
    assert.strictEqual(requests.length, 1,
      `discover must scan hub.json's persisted reposRoot when --repos-root is omitted, or a configured machine needs the flag on every run; got ${requests.length} requests`)
  } finally {
    await stopStub(server)
  }
})

test('AC-20260810-03-8: discover with no --repos-root, no hub.json.reposRoot, and an absent ~/Projects exits 2 naming --repos-root', async () => {
  const home = tmpdir('autopilot-home')
  writeHubJson(home, { hubUrl: 'http://127.0.0.1:9' })
  const res = await runAutopilot(['discover'], { home })
  assert.strictEqual(res.status, 2,
    `no resolvable reposRoot (no flag, no persisted value, no ~/Projects) must exit 2; got status=${res.status} stderr=${res.stderr}`)
  assert.match(res.stderr, /--repos-root/,
    `stderr must name --repos-root as the remedy (D5) or an operator on a nonstandard layout has no path forward; got ${res.stderr}`)
})
