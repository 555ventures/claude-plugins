'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { SPEC, tmpdir, runNode, freePort } = require('../helpers')
const {
  setupHost, patchConfig, writeStates, writePins, statusOf, statusPath, designDir,
  DRIVER, BRIEF_REL, mark, bare,
} = require('./fixture')

// specs/20261005/03-one-port-per-launch.md D6/D7 — AC-20261005-03-9, -10, -11, -12.

// Opens a prototype whose url carries {port} (config patched BEFORE --mark opened, since the
// driver allocates appPort there) and returns the host dir.
function openSlotted(bootCommand = 'npm run dev') {
  const dir = setupHost()
  patchConfig(dir, (cfg) => {
    cfg.prototype.url = 'http://127.0.0.1:{port}'
    cfg.runtime.bootCommand = bootCommand
  })
  writeStates(dir)
  const opened = mark(dir, 'opened')
  assert.strictEqual(opened.status, 0,
    'test setup requires --mark opened to succeed on a {port} host — without it no AC below can reach ROUND: ' + opened.stdout + opened.stderr)
  return dir
}

function writeStatusPatch(dir, fn) {
  const status = statusOf(dir)
  fn(status)
  fs.writeFileSync(statusPath(dir), JSON.stringify(status, null, 2) + '\n')
}

// Async runner: the test's own listener must answer the driver's curl probe, which spawnSync cannot allow.
function driverAsync(dir, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SPEC, DRIVER), BRIEF_REL, '--root', dir, ...extra], { env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

test('AC-20261005-03-9: --mark opened records an integer appPort for a {port} url, and the bare ROUND run prints the boot line with it and the not-answering line at the resolved address', () => {
  const dir = openSlotted('npm run dev')
  const { appPort } = statusOf(dir)
  assert.ok(Number.isInteger(appPort) && appPort > 0,
    'status.json must carry an integer appPort after --mark opened on a {port} host — without it the round has no stable address for the person pinning: ' + JSON.stringify(statusOf(dir)))
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'the ROUND step is informational, never a refusal: ' + JSON.stringify(r))
  assert.ok(r.stdout.includes('(tracked): PORT=' + appPort + ' npm run dev'),
    'the session boot line must carry the allocated port, or the session starts the dev server on whatever port it likes: ' + r.stdout)
  assert.ok(r.stdout.includes('dev server is not answering on http://127.0.0.1:' + appPort + ' — the boot command must serve on $PORT'),
    'the not-answering line must name the resolved address and the fix: ' + r.stdout)
  assert.ok(!r.stdout.includes('{port}'),
    'the literal {port} placeholder must never reach the session — it is not an address anyone can boot or open: ' + r.stdout)
})

test('AC-20261005-03-10: the bare ROUND run prints the ready line and the tailscale share line with the recorded appPort when that port answers HTTP 200', async () => {
  const dir = openSlotted()
  const p = await freePort()
  writeStatusPatch(dir, (s) => { s.appPort = p })
  const server = http.createServer((q, res) => res.end('ok'))
  await new Promise((resolve) => server.listen(p, '127.0.0.1', resolve))
  try {
    const r = await driverAsync(dir)
    assert.strictEqual(r.status, 0, 'the ROUND step must exit 0: ' + JSON.stringify(r))
    assert.ok(r.stdout.includes('🎨 ready for pins — http://127.0.0.1:' + p),
      'when the recorded port answers, the pin-ready line must carry the resolved address — a literal or stale address sends the person to nothing: ' + r.stdout)
    assert.ok(r.stdout.includes('tailscale serve --bg ' + p),
      'the share line must carry the same port, or a shared prototype points at the wrong app: ' + r.stdout)
  } finally {
    server.close()
  }
})

test('AC-20261005-03-11: a {port} prototype with no appPort gets one on the bare ROUND run, written to status.json, and every later run prints the same port', () => {
  const dir = openSlotted()
  writeStatusPatch(dir, (s) => { delete s.appPort })
  const first = bare(dir)
  assert.strictEqual(first.status, 0, 'the first ROUND run must exit 0: ' + JSON.stringify(first))
  const written = statusOf(dir).appPort
  assert.ok(Number.isInteger(written) && written > 0,
    'a prototype opened before the port existed must have one allocated on first need and persisted, or its address changes every round: ' + JSON.stringify(statusOf(dir)))
  const portOf = (r) => (/\(tracked\): PORT=(\d+) /.exec(r.stdout) || [])[1]
  assert.strictEqual(portOf(first), String(written),
    'the first run must print the port it just wrote: ' + first.stdout)
  const second = bare(dir)
  assert.strictEqual(portOf(second), String(written),
    'a later run must print the same port — re-allocating strands the dev server the session already started: ' + second.stdout)
  assert.strictEqual(statusOf(dir).appPort, written,
    'appPort must never be re-allocated once recorded: ' + JSON.stringify(statusOf(dir)))
})

test('AC-20261005-03-12: --mark frozen sends every capture to the resolved address and the contract keeps the state urls relative', () => {
  const dir = openSlotted()
  const now = new Date().toISOString()
  writeStates(dir, { '/women': { default: '/women' } })
  writePins(dir, [{ id: 'p1', round: 1, screen: '/women', state: 'default', anchor: null, note: 'n1', who: 'JJ', kind: 'behaviour', at: now }])
  for (const m of ['round-done', 'approved']) {
    const r = mark(dir, m)
    assert.strictEqual(r.status, 0, 'test setup requires --mark ' + m + ' to succeed: ' + r.stdout + r.stderr)
  }
  const log = path.join(tmpdir('proto-port-rec'), 'argv.log')
  const recorder = path.join(path.dirname(log), 'recording-capture.js')
  fs.writeFileSync(recorder,
    "'use strict'\nrequire('fs').appendFileSync(" + JSON.stringify(log) + ', JSON.stringify(process.argv.slice(2)) + "\\n")\n' +
    'const target = ' + JSON.stringify(path.join(dir, 'capture-stub.js')) + '\nrequire(target)\n')
  const { appPort } = statusOf(dir)
  assert.ok(Number.isInteger(appPort), 'test setup requires an integer appPort on the opened prototype: ' + JSON.stringify(statusOf(dir)))

  const r = runNode(DRIVER, [BRIEF_REL, '--root', dir, '--mark', 'frozen'], { env: { ...process.env, PROTO_CAPTURE_BIN: recorder } })
  assert.strictEqual(r.status, 0, 'a {port} host must freeze: ' + r.stdout + r.stderr)
  const argvs = fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.ok(argvs.length >= 1, 'the capture tool must have been invoked at least once: ' + log)
  const urls = argvs.map((a) => a[a.indexOf('--url') + 1])
  assert.deepStrictEqual(urls, ['http://127.0.0.1:' + appPort + '/women'],
    'each capture must be sent to the resolved address, never the literal {port} placeholder: ' + JSON.stringify(urls))
  const contract = JSON.parse(fs.readFileSync(path.join(designDir(dir), 'contract.json'), 'utf8'))
  assert.strictEqual(contract.routes['/women'].default.url, '/women',
    'the contract url must stay relative — a recorded port would be wrong for every later launch: ' + JSON.stringify(contract.routes))
})
