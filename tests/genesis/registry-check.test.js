'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { SPEC, tmpdir, runNode, runBash } = require('../helpers')

// specs/20260825/03-genesis-currency-executed.md (2026-08-25): the Haiku "still current?" pass in
// wf-research.js was an opinion, never told to pin to release pages, in a year when blog roundups
// assert Bun 2.0/Deno 3.0/Storybook 11 — none of which exist (spec Rationale, executed A1/A3).
// spec/scripts/registry-check.js replaces it: one GET per option package against the registry's own
// per-version JSON endpoint (npm, PyPI, crates.io) or endoflife.date's cycle list, dropping options
// that 404 and stamping survivors. None of AC-1..AC-6 can pass yet — spec/scripts/registry-check.js
// does not exist (TDD red, 2026-08-26).
//
// Route choice (deviations record, this spec): the reachable-registry cases run the script through
// a local async `spawn` wrapper, not helpers.js's `runNode` (spawnSync) — spawnSync blocks the
// parent event loop for the child's whole lifetime, so a same-process `http.createServer` fixture
// can never service the child's request (confirmed empirically; same mechanism
// tests/release-legs/release-legs.test.js already documents). AC-4's closed-port case still uses
// the synchronous `runNode` helper: the fixture server is bound, its port read, then closed before
// the run, so there is no live server left to deadlock against.

const SCRIPT = 'scripts/registry-check.js'

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function closedPort() {
  const server = await startServer((req, res) => res.end())
  const port = server.address().port
  await closeServer(server)
  return port
}

// Async runner for the reachable-registry cases — see the header comment above for why this
// cannot be helpers.js's spawnSync-based runNode.
function runScriptAsync(argv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(SPEC, SCRIPT), ...argv])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.on('error', (err) => resolve({ status: null, stdout, stderr: stderr + String(err) }))
  })
}

function writeMenu(dir, name, menu) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, JSON.stringify(menu, null, 2))
  return p
}

// ---------------------------------------------------------------------------
// AC-20260825-03-1
// ---------------------------------------------------------------------------

test('AC-20260825-03-1: registry-check.js prints exists for a 200 npm package and missing for a 404 one, then __REGISTRY_DROPPED__ n=1 and exit 1', async () => {
  const dir = tmpdir('regcheck-ac1')
  const server = await startServer((req, res) => {
    if (req.url === '/react/19.0.0') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('{"name":"react","version":"19.0.0"}')
    } else if (req.url === '/bun/2.0.0') {
      res.statusCode = 404
      res.end('{"error":"version not found: 2.0.0"}')
    } else {
      res.statusCode = 500
      res.end('unexpected request: ' + req.url)
    }
  })
  const port = server.address().port
  const menu = {
    dimension: 'runtime',
    options: [
      { label: 'React 19', rank: 1, packages: [{ registry: 'npm', name: 'react', version: '19.0.0' }] },
      { label: 'Bun 2.x', rank: 2, packages: [{ registry: 'npm', name: 'bun', version: '2.0.0' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = await runScriptAsync(['--menu', menuPath, '--base', `npm=http://127.0.0.1:${port}`])
  await closeServer(server)

  assert.match(r.stdout, /registry-check: runtime "React 19" npm:react@19\.0\.0 exists/,
    'D1/D4: a 200 response with a JSON body from the npm per-version endpoint must print an ' +
    '`exists` line for that package — its absence means a real, resolvable version could be ' +
    'silently mis-verdicted: ' + JSON.stringify(r))
  assert.match(r.stdout, /registry-check: runtime "Bun 2\.x" npm:bun@2\.0\.0 missing/,
    'D3/Rationale: a 404 from the npm per-version endpoint IS the slopsquat/fake-major signal — a ' +
    'missing `missing` line here means a version that does not exist on the registry could still ' +
    'ship in a genesis menu, exactly the defect this spec exists to close: ' + JSON.stringify(r))
  assert.match(r.stdout, /__REGISTRY_DROPPED__ n=1/,
    'D4: exactly one option (Bun 2.x) must be counted dropped in the sentinel line — a wrong count ' +
    'means a caller parsing the sentinel cannot tell how many options were removed: ' +
    JSON.stringify(r.stdout))
  assert.strictEqual(r.status, 1,
    'D4: exit 1 signals "options dropped" to the genesis command (D7) so it prints the 📌 dropped-' +
    'for-currency line — a different exit code means the command takes the wrong branch: ' + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260825-03-2
// ---------------------------------------------------------------------------

test('AC-20260825-03-2: --write removes the missing option into droppedForCurrency and stamps surviving options currency.status verified plus an ISO-8601 checkedAt', async () => {
  const dir = tmpdir('regcheck-ac2')
  const server = await startServer((req, res) => {
    if (req.url === '/react/19.0.0') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('{"name":"react","version":"19.0.0"}')
    } else if (req.url === '/bun/2.0.0') {
      res.statusCode = 404
      res.end('{"error":"version not found: 2.0.0"}')
    } else {
      res.statusCode = 500
      res.end('unexpected request: ' + req.url)
    }
  })
  const port = server.address().port
  const menu = {
    dimension: 'runtime',
    options: [
      { label: 'React 19', rank: 1, packages: [{ registry: 'npm', name: 'react', version: '19.0.0' }] },
      { label: 'Bun 2.x', rank: 2, packages: [{ registry: 'npm', name: 'bun', version: '2.0.0' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = await runScriptAsync(['--menu', menuPath, '--base', `npm=http://127.0.0.1:${port}`, '--write'])
  await closeServer(server)
  assert.strictEqual(r.status, 1,
    'AC-2 reuses the AC-1 drop scenario plus --write — the exit code must still be 1: ' + r.stderr)

  const rewritten = JSON.parse(fs.readFileSync(menuPath, 'utf8'))
  assert.strictEqual(rewritten.options.length, 1,
    'D5: --write must remove the missing (Bun 2.x) option from `options` — 2 options in, 1 must ' +
    'survive, or the AskUserQuestion the session builds from this file would still offer a version ' +
    'that 404s on its own registry: ' + JSON.stringify(rewritten.options))
  assert.strictEqual(rewritten.options[0].label, 'React 19',
    'D5: the survivor must be the option that resolved `exists`, not the dropped one: ' +
    JSON.stringify(rewritten.options))

  assert.ok(Array.isArray(rewritten.droppedForCurrency) && rewritten.droppedForCurrency.length === 1,
    'D5: the dropped option must be appended to `droppedForCurrency` — its absence means the ' +
    'command has no record of what was silently removed to show the user or log: ' +
    JSON.stringify(rewritten.droppedForCurrency))
  assert.strictEqual(rewritten.droppedForCurrency[0].label, 'Bun 2.x',
    'D5: droppedForCurrency\'s entry must carry the dropped option\'s label: ' +
    JSON.stringify(rewritten.droppedForCurrency))
  assert.ok(Array.isArray(rewritten.droppedForCurrency[0].packages),
    'D5: droppedForCurrency\'s entry must carry the dropped option\'s `packages` — without it a ' +
    'reader cannot see WHICH package 404d: ' + JSON.stringify(rewritten.droppedForCurrency[0]))

  const survivor = rewritten.options[0]
  assert.strictEqual(survivor.currency && survivor.currency.status, 'verified',
    'D5: a surviving option must carry currency.status === "verified" — a wrong or missing status ' +
    'means the menu file the command reads never actually records that this option checked out: ' +
    JSON.stringify(survivor.currency))
  assert.match((survivor.currency && survivor.currency.checkedAt) || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'D5: currency.checkedAt must be an ISO-8601 timestamp — a malformed or missing stamp means the ' +
    'menu carries no record of WHEN the check ran: ' + JSON.stringify(survivor.currency))
  assert.match(rewritten.currencyCheckedAt || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    'D5: the menu itself must carry `currencyCheckedAt` — its absence means the command has no ' +
    'menu-level signal that a currency pass ever ran: ' + JSON.stringify(rewritten.currencyCheckedAt))
})

// ---------------------------------------------------------------------------
// AC-20260825-03-3
// ---------------------------------------------------------------------------

test('AC-20260825-03-3: pypi, crates, and endoflife packages that all resolve 200 print exists, then __REGISTRY_OK__ and exit 0', async () => {
  const dir = tmpdir('regcheck-ac3a')
  const server = await startServer((req, res) => {
    if (req.url === '/pypi/pydantic/2.0.0/json') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('{"info":{"name":"pydantic"}}')
    } else if (req.url === '/api/v1/crates/serde/1.0.0') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('{"version":{"num":"1.0.0"}}')
    } else if (req.url === '/api/nodejs.json') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('[{"cycle":"26"},{"cycle":"25"}]')
    } else {
      res.statusCode = 500
      res.end('unexpected request: ' + req.url)
    }
  })
  const port = server.address().port
  const base = `http://127.0.0.1:${port}`
  const menu = {
    dimension: 'stack',
    options: [
      { label: 'Pydantic 2', rank: 1, packages: [{ registry: 'pypi', name: 'pydantic', version: '2.0.0' }] },
      { label: 'Serde 1', rank: 2, packages: [{ registry: 'crates', name: 'serde', version: '1.0.0' }] },
      { label: 'Node 26', rank: 3, packages: [{ registry: 'endoflife', name: 'nodejs', version: '26' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = await runScriptAsync(['--menu', menuPath,
    '--base', `pypi=${base}`, '--base', `crates=${base}`, '--base', `endoflife=${base}`])
  await closeServer(server)

  assert.match(r.stdout, /registry-check: stack "Pydantic 2" pypi:pydantic@2\.0\.0 exists/,
    'D2/D3: a 200 JSON body from PyPI\'s per-version endpoint must verdict `exists`: ' + JSON.stringify(r))
  assert.match(r.stdout, /registry-check: stack "Serde 1" crates:serde@1\.0\.0 exists/,
    'D2/D3: a 200 JSON body from crates.io\'s per-version endpoint must verdict `exists`: ' + JSON.stringify(r))
  assert.match(r.stdout, /registry-check: stack "Node 26" endoflife:nodejs@26 exists/,
    'D2/D3: an endoflife.date cycle list containing "26" must verdict `exists` for nodejs@26: ' + JSON.stringify(r))
  assert.match(r.stdout, /__REGISTRY_OK__/,
    'D4: with nothing missing the sentinel must be __REGISTRY_OK__: ' + JSON.stringify(r.stdout))
  assert.strictEqual(r.status, 0,
    'D4: exit 0 when no option is missing: ' + r.stderr)
})

test('AC-20260825-03-3: endoflife version matching resolves a cycle-prefixed version (nodejs@26.1.0) as exists and an off-cycle version (deno@3.0) as missing', async () => {
  const dir = tmpdir('regcheck-ac3b')
  const server = await startServer((req, res) => {
    if (req.url === '/api/nodejs.json') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('[{"cycle":"26"},{"cycle":"25"}]')
    } else if (req.url === '/api/deno.json') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end('[{"cycle":"2.9"}]')
    } else {
      res.statusCode = 500
      res.end('unexpected request: ' + req.url)
    }
  })
  const port = server.address().port
  const menu = {
    dimension: 'runtime2',
    options: [
      { label: 'Node 26.1', rank: 1, packages: [{ registry: 'endoflife', name: 'nodejs', version: '26.1.0' }] },
      { label: 'Deno 3.0', rank: 2, packages: [{ registry: 'endoflife', name: 'deno', version: '3.0' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = await runScriptAsync(['--menu', menuPath, '--base', `endoflife=http://127.0.0.1:${port}`])
  await closeServer(server)

  assert.match(r.stdout, /registry-check: runtime2 "Node 26\.1" endoflife:nodejs@26\.1\.0 exists/,
    'D2/Behavior: `nodejs@26.1.0` must match cycle "26" via the version-starts-with-cycle+"." rule ' +
    '— a wrong verdict here means a legitimate patch version would be dropped from every menu even ' +
    'though its major cycle is actively maintained: ' + JSON.stringify(r))
  assert.match(r.stdout, /registry-check: runtime2 "Deno 3\.0" endoflife:deno@3\.0 missing/,
    'D3/Rationale: `deno@3.0` against cycles ["2.9"] must resolve `missing` — this is the exact ' +
    'fake-major trap the spec names (Deno 3.0 does not exist); a wrong verdict here means the ' +
    'mechanical guarantee the spec promises does not actually hold: ' + JSON.stringify(r))
  assert.match(r.stdout, /__REGISTRY_DROPPED__ n=1/,
    'D4: exactly the Deno 3.0 option must be counted dropped: ' + JSON.stringify(r.stdout))
  assert.strictEqual(r.status, 1,
    'D4: one option missing means exit 1: ' + r.stderr)
})

// ---------------------------------------------------------------------------
// AC-20260825-03-4
// ---------------------------------------------------------------------------

test('AC-20260825-03-4: every --base pointing at a closed port prints unreachable for each package, then __REGISTRY_UNREACHABLE__ and exit 3, and --write stamps every option unverified while removing none', async () => {
  const dir = tmpdir('regcheck-ac4')
  const port = await closedPort()
  const base = `http://127.0.0.1:${port}`
  const menu = {
    dimension: 'stack',
    options: [
      { label: 'Option A', rank: 1, packages: [{ registry: 'npm', name: 'foo', version: '1.0.0' }] },
      { label: 'Option B', rank: 2, packages: [{ registry: 'pypi', name: 'bar', version: '1.0.0' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = runNode(SCRIPT, ['--menu', menuPath, '--base', `npm=${base}`, '--base', `pypi=${base}`, '--write'],
    { timeout: 20000 })

  assert.match(r.stdout, /registry-check: stack "Option A" npm:foo@1\.0\.0 unreachable/,
    'D3: a closed port (ECONNREFUSED) must verdict `unreachable` — never `missing`, since a ' +
    'network failure proves nothing about whether the version exists: ' + JSON.stringify(r))
  assert.match(r.stdout, /registry-check: stack "Option B" pypi:bar@1\.0\.0 unreachable/,
    'D3: every package in this run must independently verdict `unreachable`: ' + JSON.stringify(r))
  assert.match(r.stdout, /__REGISTRY_UNREACHABLE__/,
    'D4: with every probe unreachable and nothing verified, the sentinel must be ' +
    '__REGISTRY_UNREACHABLE__ — this is the never-block path the doctrine promises for a research ' +
    'call that returns nothing in good time: ' + JSON.stringify(r.stdout))
  assert.strictEqual(r.status, 3,
    'D4: exit 3 tells the genesis command (D7) to print the ⚠️ unreachable line and continue the ' +
    'interview rather than stopping it: ' + r.stderr)

  const rewritten = JSON.parse(fs.readFileSync(menuPath, 'utf8'))
  assert.strictEqual(rewritten.options.length, 2,
    'D5: on exit 3 none of the options may be removed — an unreachable registry must never be ' +
    'treated as evidence a version does not exist: ' + JSON.stringify(rewritten.options))
  for (const opt of rewritten.options) {
    assert.strictEqual(opt.currency && opt.currency.status, 'unverified',
      'D5: on exit 3 every option must be stamped currency.status === "unverified" — a status of ' +
      '"verified" or "missing" here would mean an unreachable registry silently became a false ' +
      'positive or a false drop: ' + JSON.stringify(opt))
  }
  assert.ok(!rewritten.droppedForCurrency || rewritten.droppedForCurrency.length === 0,
    'D5: exit 3 must not populate droppedForCurrency — nothing was actually confirmed missing: ' +
    JSON.stringify(rewritten.droppedForCurrency))
})

// ---------------------------------------------------------------------------
// AC-20260825-03-5
// ---------------------------------------------------------------------------

test('AC-20260825-03-5: a gem package prints unsupported with no exists sibling, and an unknown-product endoflife 404 prints unknown-product and never missing', async () => {
  const dir = tmpdir('regcheck-ac5')
  const server = await startServer((req, res) => {
    if (req.url === '/api/zzz.json') {
      res.statusCode = 404
      res.setHeader('content-type', 'text/html')
      res.end('<html><body>not found</body></html>')
    } else {
      res.statusCode = 500
      res.end('unexpected request: ' + req.url)
    }
  })
  const port = server.address().port
  const menu = {
    dimension: 'stack',
    options: [
      { label: 'Some Gem', rank: 1, packages: [{ registry: 'gem', name: 'foo', version: '1.0.0' }] },
      { label: 'Zzz Runtime', rank: 2, packages: [{ registry: 'endoflife', name: 'zzz', version: '1' }] }
    ]
  }
  const menuPath = writeMenu(dir, 'm.json', menu)

  const r = await runScriptAsync(['--menu', menuPath, '--base', `endoflife=http://127.0.0.1:${port}`, '--write'])
  await closeServer(server)

  assert.match(r.stdout, /registry-check: stack "Some Gem" gem:foo@1\.0\.0 unsupported/,
    'D3: a package naming a registry outside npm|pypi|crates|endoflife must verdict `unsupported` ' +
    '— never `exists` or `missing`, since the script never ran a check that could prove either: ' +
    JSON.stringify(r))
  assert.match(r.stdout, /registry-check: stack "Zzz Runtime" endoflife:zzz@1 unknown-product/,
    'D3/Rationale: an endoflife 404 means the curated cycle list has never heard of the product — ' +
    'it must verdict `unknown-product`, never `missing`, because a runtime slug the researcher ' +
    'spelled differently must not delete a real option: ' + JSON.stringify(r))
  assert.match(r.stdout, /__REGISTRY_OK__/,
    'D4: neither unsupported nor unknown-product is a `missing` verdict, so the sentinel must stay ' +
    '__REGISTRY_OK__: ' + JSON.stringify(r.stdout))
  assert.strictEqual(r.status, 0,
    'D4: exit 0 — nothing in this menu resolved missing: ' + r.stderr)

  const rewritten = JSON.parse(fs.readFileSync(menuPath, 'utf8'))
  const gemOpt = rewritten.options.find((o) => o.label === 'Some Gem')
  const zzzOpt = rewritten.options.find((o) => o.label === 'Zzz Runtime')
  assert.strictEqual(gemOpt && gemOpt.currency && gemOpt.currency.status, 'unsupported',
    'D3: the option status for a lone unsupported package (no exists sibling) must itself be ' +
    '"unsupported": ' + JSON.stringify(gemOpt && gemOpt.currency))
  assert.strictEqual(zzzOpt && zzzOpt.currency && zzzOpt.currency.status, 'unverified',
    'D3: the option status for an unknown-product package must be "unverified", never "missing" ' +
    '— a genesis menu must not silently drop an option just because the researcher\'s runtime slug ' +
    'does not match endoflife.date\'s curated list: ' + JSON.stringify(zzzOpt && zzzOpt.currency))
})

// ---------------------------------------------------------------------------
// AC-20260825-03-6
// ---------------------------------------------------------------------------

test('AC-20260825-03-6: a package missing packages[].version, no --menu, and an unknown --base registry all exit 2 without writing, and spec-paths registry-check resolves to an existing path', () => {
  const dir = tmpdir('regcheck-ac6')

  // a menu option's package lacks packages[].version (AC's own worked example)
  const badMenu = {
    dimension: 'stack',
    options: [{ label: 'No Version', rank: 1, packages: [{ registry: 'npm', name: 'react' }] }]
  }
  const badMenuPath = writeMenu(dir, 'bad.json', badMenu)
  const before = fs.readFileSync(badMenuPath, 'utf8')
  const r1 = runNode(SCRIPT, ['--menu', badMenuPath, '--write'])
  assert.strictEqual(r1.status, 2,
    'D4: a package lacking packages[].version is malformed input, not a network condition — it ' +
    'must exit 2, never crash or silently skip the field: ' + r1.stderr)
  assert.match(r1.stderr, /version/,
    'AC-6\'s own worked example ({registry:"npm",name:"react"} with no version) must produce a ' +
    'stderr line naming the missing field: ' + JSON.stringify(r1.stderr))
  assert.match(r1.stderr, /re-run the research round/,
    'D4: stderr must name the remedy verbatim ("re-run the research round") — its absence means a ' +
    'session hitting this exit code has no discoverable next step: ' + JSON.stringify(r1.stderr))
  assert.strictEqual(fs.readFileSync(badMenuPath, 'utf8'), before,
    'D5: on exit 2 nothing is written, even with --write — a mutated file here would mean a ' +
    'malformed menu could still get silently rewritten instead of refused')

  // no --menu given at all
  const r2 = runNode(SCRIPT, [])
  assert.strictEqual(r2.status, 2,
    'D4: no --menu at all is a usage error, not a 0-menu no-op — it must exit 2: ' + r2.stderr)
  assert.match(r2.stderr, /usage:/,
    'D4: the no-argument case must print a usage line, the same way every other bundled script ' +
    'refuses missing required flags: ' + JSON.stringify(r2.stderr))

  // --base gem=... (registry name outside npm|pypi|crates|endoflife)
  const okMenu = { dimension: 'taste', options: [{ label: 'A', rank: 1, packages: [] }] }
  const okMenuPath = writeMenu(dir, 'ok.json', okMenu)
  const r3 = runNode(SCRIPT, ['--menu', okMenuPath, '--base', 'gem=http://127.0.0.1:1'])
  assert.strictEqual(r3.status, 2,
    'Contracts: `--base` grammar restricts registry to npm|pypi|crates|endoflife — an unknown ' +
    'registry name in --base must exit 2, not be silently ignored or treated as a valid override: ' +
    r3.stderr)

  // spec-paths registry-check resolves to an existing path
  const r4 = runBash('bin/spec-paths', ['registry-check'])
  assert.strictEqual(r4.status, 0,
    'D9: `spec-paths registry-check` must resolve — a non-zero exit means the new key was never ' +
    'wired in, and every genesis command\'s D7 menu step resolves nothing (§ Risk Tiers, ' +
    'spec-paths: "a wrong key breaks commands silently"): ' + r4.stderr)
  assert.ok(fs.existsSync(r4.stdout.trim()),
    'the resolved registry-check.js path must actually exist on disk: ' + r4.stdout)
})
