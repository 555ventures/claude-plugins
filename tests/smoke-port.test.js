'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { SPEC, tmpdir, runBash } = require('./helpers')

// specs/20261005/03-one-port-per-launch.md D1-D3 — AC-20261005-03-1, -2, -3, -4, -6.

function writeHost(dir, runtime) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ runtime }))
  return dir
}

const smoke = (dir, args = [], env = process.env) =>
  runBash('scripts/smoke.sh', args, { cwd: dir, timeout: 45000, env })

// Async runner: two real smoke.sh processes must overlap, which spawnSync cannot do.
function smokeAsync(dir, args = []) {
  return new Promise((resolve) => {
    const child = spawn('bash', [path.join(SPEC, 'scripts/smoke.sh'), ...args], { cwd: dir, env: process.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

// A boot that records the PORT it saw, signals ready through a PORT-named file, and exits 0 on SIGTERM.
const FILE_BOOT = 'echo "${PORT-unset}" > boot.port; touch "ready.${PORT-unset}"; trap "exit 0" TERM; while :; do sleep 0.2; done'
const readText = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8').trim()

test('AC-20261005-03-1: smoke.sh gives bootCommand, readyCheck and seedCommand one and the same integer PORT on a PORT-reading host and prints it in the pass line', () => {
  const dir = writeHost(tmpdir('smoke-port-one'), {
    bootCommand: FILE_BOOT,
    readyCheck: 'test -f "ready.$PORT"',
    seedCommand: 'echo "$PORT" > seed.port',
  })
  const r = smoke(dir, ['--seed', '--timeout', '8'])
  assert.strictEqual(r.status, 0,
    'a PORT-reading host whose boot, ready check and seed all use one port must pass — a split or empty PORT leaves the ready check probing a port the boot never used: ' + r.stdout + r.stderr)
  const bootPort = readText(dir, 'boot.port')
  assert.match(bootPort, /^\d+$/, 'bootCommand must see an integer PORT, not unset or empty: ' + JSON.stringify(bootPort))
  const n = Number(bootPort)
  assert.ok(n >= 1024 && n <= 65535, 'the allocated PORT must be an unprivileged TCP port: ' + n)
  assert.strictEqual(readText(dir, 'seed.port'), bootPort,
    'seedCommand must see the same PORT as bootCommand — a different value seeds an app that is not the one that booted: ' + readText(dir, 'seed.port'))
  assert.match(r.stdout, new RegExp('\\| port: ' + n + '\\)'),
    'the pass line must end with "| port: <n>)" naming the port the run used, so a reader can tell which launch passed: ' + r.stdout)
})

test('AC-20261005-03-2: two overlapping smoke.sh runs of one PORT-reading host each get their own port, both pass, and neither reports stale-ready', async () => {
  const boot = 'node -e "' +
    "const fs=require('fs');fs.writeFileSync('boot.start',String(Date.now()));" +
    "const s=require('http').createServer((q,r)=>r.end('ok')).listen(+process.env.PORT,'127.0.0.1');" +
    "process.on('SIGTERM',()=>{fs.writeFileSync('boot.end',String(Date.now()));process.exit(0)})" +
    '"'
  const runtime = { bootCommand: boot, readyCheck: 'curl -sf http://127.0.0.1:$PORT/ >/dev/null', readyTimeout: 20 }
  const a = writeHost(tmpdir('smoke-port-a'), runtime)
  const b = writeHost(tmpdir('smoke-port-b'), runtime)
  const [ra, rb] = await Promise.all([smokeAsync(a), smokeAsync(b)])
  for (const [name, r] of [['a', ra], ['b', rb]]) {
    assert.strictEqual(r.status, 0,
      'each of two simultaneous launches of a PORT-reading host must pass on its own port — a shared port makes the second one stale-ready or not-ready (run ' + name + '): ' + r.stdout + r.stderr)
    assert.doesNotMatch(r.stdout, /stale-ready/,
      'neither run may see the other as an already-running app on its address (run ' + name + '): ' + r.stdout)
  }
  const portOf = (r) => (/\| port: (\d+)\)/.exec(r.stdout) || [])[1]
  assert.ok(portOf(ra) && portOf(rb),
    'both pass lines must carry a port: segment so the two launches are distinguishable: ' + ra.stdout + rb.stdout)
  assert.notStrictEqual(portOf(ra), portOf(rb),
    'two overlapping launches must never share a port — that is the collision this spec removes: ' + portOf(ra))
  const t = (dir, f) => Number(readText(dir, f))
  assert.ok(t(a, 'boot.start') < t(b, 'boot.end') && t(b, 'boot.start') < t(a, 'boot.end'),
    'the two boots must have been alive at the same time, or the test proved nothing about concurrent launches: ' +
    JSON.stringify({ a: [t(a, 'boot.start'), t(a, 'boot.end')], b: [t(b, 'boot.start'), t(b, 'boot.end')] }))
})

test('AC-20261005-03-3: smoke.sh overrides a PORT already in the caller environment with its own allocation on a PORT-reading host', async () => {
  const held = net.createServer()
  await new Promise((resolve) => held.listen(0, '127.0.0.1', resolve))
  const p = held.address().port
  try {
    const dir = writeHost(tmpdir('smoke-port-override'), { bootCommand: FILE_BOOT, readyCheck: 'test -f "ready.$PORT"' })
    const r = smoke(dir, ['--timeout', '8'], { ...process.env, PORT: String(p) })
    assert.strictEqual(r.status, 0,
      'a caller that already exports PORT must not break the run: ' + r.stdout + r.stderr)
    const bootPort = readText(dir, 'boot.port')
    assert.match(bootPort, /^\d+$/, 'bootCommand must see an integer PORT: ' + JSON.stringify(bootPort))
    assert.notStrictEqual(bootPort, String(p),
      'an inherited PORT names a port this launch does not own (here one a listener already holds) — inheriting it recreates the collision: ' + bootPort)
  } finally {
    held.close()
  }
})

test('AC-20261005-03-4: smoke.sh sets no PORT for the host commands and prints no port segment when readyCheck does not read PORT', () => {
  const dir = writeHost(tmpdir('smoke-port-fixed'), {
    bootCommand: 'echo "${PORT-unset}" > boot.port; touch ready; trap "exit 0" TERM; while :; do sleep 0.2; done',
    readyCheck: 'test -f ready',
  })
  const env = { ...process.env }
  delete env.PORT
  const r = smoke(dir, [], env)
  assert.strictEqual(r.status, 0, 'a fixed-address host must pass exactly as before: ' + r.stdout + r.stderr)
  assert.strictEqual(readText(dir, 'boot.port'), 'unset',
    'a host that never opted in must not receive a PORT — exporting one to a boot that ignores it is the rejected design: ' + readText(dir, 'boot.port'))
  assert.doesNotMatch(r.stdout, /\| port: \d/,
    'the pass line of a fixed host is unchanged, no "| port:" segment: ' + r.stdout)
})

test('AC-20261005-03-6: smoke.sh exit 7 says another process is already answering on this address, names /spec:doctor, and no longer blames a previous run', () => {
  const dir = writeHost(tmpdir('smoke-port-stale'), { bootCommand: 'sleep 30', readyCheck: 'true' })
  const r = smoke(dir)
  assert.strictEqual(r.status, 7,
    'a readyCheck that already passes before boot must still exit 7 — the slug and code are a machine contract: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /__SMOKE_FAIL__ stale-ready/, 'the stale-ready slug must stay so callers can still tell this failure apart: ' + r.stdout)
  assert.match(r.stdout, /another process is already answering on this address/,
    'the sentence must say what is true of a live sibling launch, or the operator hunts for a previous run that does not exist: ' + r.stdout)
  assert.match(r.stdout, /\/spec:doctor/,
    'the sentence must name /spec:doctor, the command that names the fix (make the host read PORT): ' + r.stdout)
  assert.doesNotMatch(r.stdout, /previous run/,
    'the old "previous run" blame must be gone — it misdirects the operator when the holder is a live sibling launch: ' + r.stdout)
})
