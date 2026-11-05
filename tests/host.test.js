'use strict'
// Pins lib/host.js: command runner, cached gate, test-command detection.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
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

// ---- spec 20261105/08: failing files, the gate lock ---------------------------------------------

const { spawn } = require('child_process')
const HOST_JS = path.join(SPEC, 'scripts/lib/host.js')

// Runs host.gate in `cwd` as its own process (a second gate on the host); resolves {json, stderr}.
function gateProc(cwd, config) {
  const code = `const H = require(${JSON.stringify(HOST_JS)}); const g = H.gate(process.cwd(), ${JSON.stringify(config)}); process.stdout.write(JSON.stringify({ status: g.status, lockWaitMs: g.lockWaitMs, cached: g.cached }))`
  const p = spawn(process.execPath, ['-e', code], { cwd })
  let out = ''; let err = ''
  p.stdout.on('data', (d) => { out += d }); p.stderr.on('data', (d) => { err += d })
  const done = new Promise((resolve) => p.on('close', () => resolve({ json: out ? JSON.parse(out) : null, stderr: err })))
  return { p, done }
}

const lockDir = (root) => path.join(root, '.git', 'spec-gate.lock')
const until = async (cond, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 25)) } }

test('the gate returns the tree it keyed on and the existing files its red tail names, deduplicated', () => {
  const root = tmpdir('failing')
  gitRepo(root)
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tests/a.test.js'), '')
  fs.writeFileSync(path.join(root, 'tests/b.spec.ts'), '')
  const cmd = `echo "FAIL tests/a.test.js > slow"; echo "  at (tests/b.spec.ts:10:5)"; echo "not tests/ghost.test.js:3"; echo "tests/a.test.js"; echo "plain words only"; exit 1`
  const g = H.gate(root, { testCommand: cmd })
  assert.strictEqual(g.status, 1)
  assert.strictEqual(g.tree, H.treeSha(root), 'tree is the sha the gate keyed on')
  assert.deepStrictEqual(g.failing, ['tests/a.test.js', 'tests/b.spec.ts'], 'only files that exist under root, once each')
  assert.strictEqual(H.gate(root, { testCommand: 'echo "no file named here"; exit 1' }).failing.length, 0, 'a tail naming no file names none')
  const ok = H.gate(root, { testCommand: 'true' })
  assert.deepStrictEqual([ok.status, ok.failing, ok.tree], [0, [], H.treeSha(root)])
  assert.strictEqual(H.gate(root, { testCommand: 'true' }).tree, ok.tree, 'a cache hit carries the tree too')
})

test('a holder file naming a dead pid is deleted and the slot is taken without waiting', () => {
  const root = tmpdir('deadpid')
  gitRepo(root)
  const dir = lockDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const dead = spawnSync('true').pid // a pid that has exited
  fs.writeFileSync(path.join(dir, String(dead)), `${dead} 2026-01-01T00:00:00.000Z /nowhere\n`)
  const t0 = Date.now()
  const g = H.gate(root, { testCommand: 'true', gateConcurrency: 1 })
  assert.strictEqual(g.status, 0)
  assert.ok(Date.now() - t0 < 1500 && g.lockWaitMs < 500, `no wait for a dead holder (waited ${g.lockWaitMs}ms)`)
  assert.deepStrictEqual(fs.readdirSync(dir), [], 'the dead holder file is gone and our own is released')
})

test('two gates in two worktrees with gateConcurrency 1: the second starts after the first holder file is gone and waits at least the first run time', async () => {
  const root = tmpdir('contend')
  const g = gitRepo(root)
  const wt1 = path.join(root, '.claude', 'worktrees', 'one'); const wt2 = path.join(root, '.claude', 'worktrees', 'two')
  g('worktree', 'add', '-q', '-b', 'one', wt1); g('worktree', 'add', '-q', '-b', 'two', wt2)
  fs.writeFileSync(path.join(wt2, 'only-in-two.txt'), 'x\n') // a different tree: a cache miss
  const log = path.join(tmpdir('log'), 'order.log')
  const config = { testCommand: `echo start $(basename $PWD) >> ${log}; sleep 1.2; echo end $(basename $PWD) >> ${log}`, gateConcurrency: 1 }
  const first = gateProc(wt1, config)
  await until(() => fs.existsSync(lockDir(root)) && fs.readdirSync(lockDir(root)).length === 1)
  const second = gateProc(wt2, config)
  const [a, b] = await Promise.all([first.done, second.done])
  assert.deepStrictEqual([a.json.status, b.json.status], [0, 0])
  assert.deepStrictEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['start one', 'end one', 'start two', 'end two'], 'the second gate started only after the first finished')
  assert.ok(b.json.lockWaitMs >= 1000, `the second waited for the first run (${b.json.lockWaitMs}ms)`)
  assert.ok(a.json.lockWaitMs < 500, 'the first did not wait')
  assert.match(b.stderr, /gate: waiting for a slot \(1 running\)/, 'a waiting lane says so on stderr')
  assert.strictEqual(fs.readdirSync(lockDir(root)).length, 0, 'every holder file is removed when the gate ends')
})

test('gateConcurrency defaults to 2 when absent and to 1 when 0 or negative', async () => {
  const root = tmpdir('conc')
  gitRepo(root)
  const dir = lockDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const sleeper = spawn('sleep', ['30']) // a live process standing in for a running gate
  const holder = path.join(dir, String(sleeper.pid))
  fs.writeFileSync(holder, `${sleeper.pid} now ${root}\n`)
  try {
    const free = H.gate(root, { testCommand: 'true' })
    assert.ok(free.lockWaitMs < 500, 'one live holder and no gateConcurrency: the default 2 leaves a slot')
    for (const n of [0, -3]) {
      const p = gateProc(root, { testCommand: `true # cap ${n}`, gateConcurrency: n })
      await new Promise((r) => setTimeout(r, 700))
      assert.strictEqual(p.p.exitCode, null, `gateConcurrency ${n} counts as 1: the live holder blocks the gate`)
      fs.rmSync(holder) // frees the slot; the waiter takes it at its next poll
      const r = await p.done
      assert.ok(r.json.lockWaitMs >= 700 && /waiting for a slot \(1 running\)/.test(r.stderr), r.stderr)
      fs.writeFileSync(holder, `${sleeper.pid} now ${root}\n`)
    }
  } finally { fs.rmSync(holder, { force: true }); sleeper.kill() }
})
