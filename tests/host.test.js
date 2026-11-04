'use strict'
// Pins lib/host.js: command runner, cached gate, test-command detection.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
const H = require(path.join(SPEC, 'scripts/lib/host.js'))

test('run reports status, output and a tail; a timeout is status 124', () => {
  const r = H.run('echo out; echo err >&2; exit 3', { cwd: tmpdir('run') })
  assert.strictEqual(r.status, 3, 'the exit code is the verdict')
  assert.strictEqual(r.stdout, 'out\n', 'stdout must be captured')
  assert.ok(r.tail.includes('out') && r.tail.includes('err'), 'the tail shown on REPAIR needs both streams')
  assert.strictEqual(H.run('echo $FOO', { env: { FOO: 'bar' } }).stdout, 'bar\n', 'env must reach the command')
  assert.strictEqual(H.run('sleep 5', { timeoutMs: 200 }).status, 124, 'a hung suite must not hang the driver')
})

test('gate caches a green run by tree and re-runs when the tree changes', () => {
  const root = tmpdir('gate')
  gitRepo(root)
  const counter = path.join(tmpdir('count'), 'n')
  const config = { testCommand: `echo x >> ${counter}; test ! -f fail` }
  const ran = () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length
  const a = H.gate(root, config)
  assert.deepStrictEqual([a.status, a.cached], [0, false], 'the first run executes the suite')
  const b = H.gate(root, config)
  assert.deepStrictEqual([b.status, b.cached, b.runId], [0, true, a.runId], 'an unchanged tree must hit the cache')
  assert.strictEqual(ran(), 1, 'a cache hit must not run the suite again')
  fs.mkdirSync(path.join(root, 'specs/x.run'), { recursive: true })
  fs.writeFileSync(path.join(root, 'specs/x.run/state.json'), '{}')
  assert.ok(H.gate(root, config).cached, 'run sidecars must not invalidate the cache')
  fs.writeFileSync(path.join(root, 'fail'), '')
  const c = H.gate(root, config)
  assert.deepStrictEqual([c.status, c.cached], [1, false], 'an untracked file changes the tree and the gate runs')
  assert.ok(!H.gate(root, config).cached, 'a red run must never be cached')
  fs.rmSync(path.join(root, 'fail'))
  assert.ok(H.gate(root, config).cached, 'returning to a green tree hits the old entry')
})

test('the cache is shared by worktrees with the same content', () => {
  const root = tmpdir('share')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'w')
  g('worktree', 'add', '-q', '-b', 'w', wt)
  const config = { testCommand: 'true' }
  assert.ok(!H.gate(wt, config).cached, 'first run in the lane executes')
  assert.ok(H.gate(root, config).cached, 'merging an unchanged tree to trunk must not re-run the suite')
})

test('gate without a testCommand is a refusal naming /spec:init', () => {
  const root = tmpdir('nocmd')
  gitRepo(root)
  assert.throws(() => H.gate(root, {}), (e) => e.exit === 2 && /spec:init/.test(e.message), 'the remedy must be named')
})

test('detectTestCommand reads package.json, pytest, go and cargo markers', () => {
  const host = (files) => {
    const d = tmpdir('detect')
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(d, f), c)
    return H.detectTestCommand(d)
  }
  assert.strictEqual(host({ 'package.json': '{"scripts":{"test":"vitest"}}' }), 'npm test', 'npm hosts')
  assert.strictEqual(host({ 'package.json': '{"scripts":{"test":"vitest"}}', 'pnpm-lock.yaml': '' }), 'pnpm test', 'pnpm hosts')
  assert.strictEqual(host({ 'package.json': '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' }), null, 'the npm placeholder is not a suite')
  assert.strictEqual(host({ 'pyproject.toml': '[tool.pytest.ini_options]\n' }), 'pytest', 'pytest hosts')
  assert.strictEqual(host({ 'go.mod': 'module x\n' }), 'go test ./...', 'go hosts')
  assert.strictEqual(host({ 'Cargo.toml': '[package]\n' }), 'cargo test', 'cargo hosts')
  assert.strictEqual(host({ 'README.md': '' }), null, 'unknown stacks must be asked, not guessed')
})
