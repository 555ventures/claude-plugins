'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode, freePort } = require('../helpers')
const { DRIVER, makeHost, implementScriptsWave, toIntegration } =require('./build-driver.fixtures')

// specs/20261005/03-one-port-per-launch.md D8 — AC-20261005-03-14, AC-20261005-03-15.

function runB(host, ...args) {
  return runNode(DRIVER, [host.spec, ...args], { cwd: host.root, env: { ...process.env, ...host.captureEnv } })
}

function createHardenBranch(host) {
  host.g('checkout', '-b', 'harden/' + host.stem)
  fs.writeFileSync(path.join(host.root, 'harden-marker.txt'), 'exported data/API layer\n')
  host.g('add', 'harden-marker.txt')
  host.g('commit', '-q', '-m', 'harden: marker')
  host.g('checkout', 'main')
}

// A behaviour-lane host whose prototype.url carries {port}, driven to the CAPTURE state. The config
// edit is committed before the first driver run so it is part of the build's pre-image.
function slottedHostAtCapture(contract) {
  const host = makeHost({ lane: 'behaviour', brief: 28, contract })
  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.prototype.url = 'http://localhost:{port}'
  cfg.runtime.bootCommand = 'pnpm dev'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  host.g('add', '.claude/spec.config.json')
  host.g('commit', '-q', '-m', 'declare a {port} prototype url')

  runB(host) // admission
  createHardenBranch(host)
  host.g('merge', '--no-ff', '--no-edit', 'harden/' + host.stem)
  runB(host, '--mark', 'harden-merged')
  toIntegration(host)
  implementScriptsWave(host)
  runB(host, '--mark', 'wave-done', '--wave', 'doctrine+scripts', '--workers', '2')
  runB(host, '--mark', 'wave-done', '--wave', 'other', '--workers', '1')
  const integrated = runB(host, '--mark', 'integrated')
  assert.strictEqual(integrated.status, 0,
    'test setup requires a green gate to be accepted at integrated before CAPTURE is reachable: ' + integrated.stdout + integrated.stderr)
  return host
}

test('AC-20261005-03-14: the CAPTURE step on a {port} host allocates one capture port, writes it to capture-port.json, prints it in the boot line and address, and prints the same port on a second run', () => {
  const host = slottedHostAtCapture()
  const first = runB(host)
  assert.match(first.stdout, /state: CAPTURE/, 'test setup requires the build to sit at CAPTURE: ' + first.stdout)
  const portFile = path.join(host.sidecar, 'capture-port.json')
  assert.ok(fs.existsSync(portFile),
    'the CAPTURE step must persist its port in <spec>.build/capture-port.json — otherwise each run prints a different address and the session boots the wrong one: ' + portFile)
  const doc = JSON.parse(fs.readFileSync(portFile, 'utf8'))
  assert.deepStrictEqual(Object.keys(doc), ['port'],
    'capture-port.json carries exactly {"port": n} — capture-state.json and build-state.json shapes are pinned, so no extra keys: ' + JSON.stringify(doc))
  const n = doc.port
  assert.ok(Number.isInteger(n) && n >= 1024 && n <= 65535,
    'the capture port must be an unprivileged integer port: ' + JSON.stringify(doc))
  assert.ok(first.stdout.includes('so it answers at http://localhost:' + n + ': PORT=' + n + ' pnpm dev'),
    'the CAPTURE step must print the resolved address and the PORT-prefixed boot command, never the {port} placeholder: ' + first.stdout)
  assert.ok(!first.stdout.includes('{port}'),
    'the literal {port} placeholder must never reach the session: ' + first.stdout)
  const second = runB(host)
  assert.ok(second.stdout.includes('so it answers at http://localhost:' + n + ': PORT=' + n + ' pnpm dev'),
    'a second run must print the same port — re-allocating strands the app the session already started: ' + second.stdout)
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(portFile, 'utf8')), { port: n },
    'capture-port.json must not be rewritten with a new port by a later run: ' + fs.readFileSync(portFile, 'utf8'))
})

test('AC-20261005-03-15: --mark captured on a {port} host joins each relative contract url onto the resolved address and passes an absolute contract url through unchanged', async () => {
  const contract = {
    schemaVersion: 1, brief: '28', stem: '28-functional-prototype',
    viewport: { width: 1280, height: 800 }, composites: ['WomenList'],
    routes: {
      '/women': { default: { url: '/women', capture: 'captures/women--default.json' } },
      '/men': { default: { url: 'http://localhost:3000/men', capture: 'captures/men--default.json' } },
    },
  }
  const host = slottedHostAtCapture(contract)
  const n = await freePort()
  fs.mkdirSync(host.sidecar, { recursive: true })
  fs.writeFileSync(path.join(host.sidecar, 'capture-port.json'), JSON.stringify({ port: n }) + '\n')

  const r = runB(host, '--mark', 'captured')
  assert.strictEqual(r.status, 0,
    'a {port} host with a recorded capture port must capture, not die on the placeholder: ' + r.stdout + r.stderr)
  const sent = (file) => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'captures', file), 'utf8')).url
  assert.strictEqual(sent('women--default.json'), 'http://localhost:' + n + '/women',
    'a relative contract url must be joined onto the resolved capture address, not the literal {port} placeholder: ' + sent('women--default.json'))
  assert.strictEqual(sent('men--default.json'), 'http://localhost:3000/men',
    'an absolute contract url must pass through unchanged, exactly as before this spec: ' + sent('men--default.json'))
})
