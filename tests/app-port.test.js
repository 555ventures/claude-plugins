'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { SPEC, runNode } = require('./helpers')

// specs/20261005/03-one-port-per-launch.md D4/D12 — AC-20261005-03-7, AC-20261005-03-8, AC-20261005-03-21.

const MODULE_REL = 'scripts/lib/app-port.js'
const MODULE_ABS = path.join(SPEC, MODULE_REL)

// Loaded per test, never at file top: a missing module must fail each case with its own consequence
// message, not crash the whole file before any case can name what it pins.
function loadModule() {
  assert.ok(fs.existsSync(MODULE_ABS),
    'spec/scripts/lib/app-port.js is the one allocator and the one definition of "reads PORT" (D4) — ' +
    'without it smoke, both drivers, doctor and the template test each grow their own predicate and drift: missing ' + MODULE_ABS)
  return require(MODULE_ABS)
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(port, '127.0.0.1', () => srv.close((err) => (err ? reject(err) : resolve())))
  })
}

test('AC-20261005-03-7: app-port.js --if-reads prints exactly one bindable port line and exits 0 for each command that reads PORT', async () => {
  for (const command of ['curl -sf localhost:$PORT/h', 'curl localhost:${PORT}/', 'curl localhost:${PORT:-3000}/']) {
    const r = runNode(MODULE_REL, ['--if-reads', command])
    assert.strictEqual(r.status, 0,
      'a PORT-reading command must exit 0 with a port, or smoke.sh cannot export one and the host boots on a port nothing checks: ' + command + ' -> ' + JSON.stringify(r))
    assert.match(r.stdout, /^\d+\n$/,
      'stdout must be exactly one integer line — smoke.sh captures it as the port, so any extra text becomes part of PORT: ' + command + ' -> ' + JSON.stringify(r.stdout))
    const port = Number(r.stdout.trim())
    assert.ok(port >= 1024 && port <= 65535,
      'the allocated port must be an unprivileged TCP port the host can bind: ' + command + ' -> ' + port)
    await assert.doesNotReject(listenOn(port),
      'the printed port must actually be free to listen on at 127.0.0.1, or the host boot fails on the very port smoke handed it: ' + command + ' -> ' + port)
  }
})

test('AC-20261005-03-7: app-port.js --if-reads prints nothing and exits 0 for commands that do not read PORT, and exits 2 with usage when called with no arguments', () => {
  for (const command of ['curl -sf localhost:3000/h', 'curl localhost:${DEV_PORT:-3000}/', 'curl localhost:$PORTAL/', 'test -f .ready']) {
    const r = runNode(MODULE_REL, ['--if-reads', command])
    assert.strictEqual(r.status, 0,
      'a command that does not read PORT is a valid input, not an error — smoke.sh keeps today\'s path on it: ' + command + ' -> ' + JSON.stringify(r))
    assert.strictEqual(r.stdout, '',
      'a fixed-address host must get no port — printing one would make smoke.sh export PORT to a host that never opted in: ' + command + ' -> ' + JSON.stringify(r.stdout))
  }
  const bare = runNode(MODULE_REL, [])
  assert.strictEqual(bare.status, 2,
    'no arguments is a usage error, exit 2, so a mis-wired caller fails loudly instead of reading silence as "fixed host": ' + JSON.stringify(bare))
  assert.match(bare.stderr, /usage/i,
    'the usage error must print a usage line on stderr naming how to call it: ' + JSON.stringify(bare.stderr))
})

test('AC-20261005-03-7: readsPort is true exactly for $PORT, ${PORT} and ${PORT:-…} references and false for look-alikes, empty and non-string input', () => {
  const { readsPort } = loadModule()
  for (const yes of ['curl -sf localhost:$PORT/h', 'curl localhost:${PORT}/', 'curl localhost:${PORT:-3000}/']) {
    assert.strictEqual(readsPort(yes), true,
      'a command that references PORT must be recognised or its host never gets a port and boots on a fixed address: ' + yes)
  }
  for (const no of ['curl -sf localhost:3000/h', 'curl localhost:${DEV_PORT:-3000}/', 'curl localhost:$PORTAL/', 'test -f .ready', '', undefined, null, 42]) {
    assert.strictEqual(readsPort(no), false,
      'a look-alike or non-string must not opt a host in — the host would be probed on a port nothing serves: ' + String(no))
  }
})

test('AC-20261005-03-8: resolveUrl substitutes every {port} and leaves a slot-less address alone, and hasPortSlot reports true then false', () => {
  const { resolveUrl, hasPortSlot } = loadModule()
  assert.strictEqual(resolveUrl('http://localhost:{port}', 4123), 'http://localhost:4123',
    'the placeholder must become the allocated port, or the drivers print and probe a literal {port}')
  assert.strictEqual(resolveUrl('http://localhost:3000', 4123), 'http://localhost:3000',
    'a fixed address must come back unchanged — D5 promises a host without the slot behaves exactly as today')
  assert.strictEqual(resolveUrl('http://localhost:{port}/x?p={port}', 4123), 'http://localhost:4123/x?p=4123',
    'every occurrence must be replaced, not only the first, or a second slot reaches the browser as a literal')
  assert.strictEqual(hasPortSlot('http://localhost:{port}'), true,
    'an address carrying {port} must be reported as slotted, or the drivers never allocate for it')
  assert.strictEqual(hasPortSlot('http://localhost:3000'), false,
    'a fixed address must be reported slot-less, or the drivers allocate a port nothing uses')
})

test('AC-20261005-03-21: every shipped finalist carries a PORT-reading readyCheck with no :3000, and tanstack-node boots with npm run dev -- --port $PORT', () => {
  const { readsPort } = loadModule()
  const doc = JSON.parse(fs.readFileSync(path.join(SPEC, 'templates/finalists.json'), 'utf8'))
  assert.ok(Array.isArray(doc.finalists) && doc.finalists.length > 0,
    'finalists.json must still list finalists — the genesis race has nothing to run without them')
  for (const f of doc.finalists) {
    assert.strictEqual(readsPort(f.readyCheck), true,
      'a finalist whose readyCheck does not read PORT shares one fixed port with every other finalist the race smokes: ' + f.name + ' -> ' + f.readyCheck)
    assert.ok(!f.readyCheck.includes(':3000'),
      'a finalist readyCheck naming :3000 collides with every other launch of the repo (the stale-ready failure this spec removes): ' + f.name + ' -> ' + f.readyCheck)
  }
  const tanstack = doc.finalists.find((f) => f.name === 'tanstack-node')
  assert.ok(tanstack, 'the tanstack-node finalist must still exist: ' + JSON.stringify(doc.finalists.map((f) => f.name)))
  assert.strictEqual(tanstack.bootCommand, 'npm run dev -- --port $PORT',
    'Vite does not read PORT, so tanstack-node must pass it as a flag or its dev server serves on 5173 and the race smoke goes not-ready')
})
