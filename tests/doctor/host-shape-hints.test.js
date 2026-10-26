'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261026/02-one-tests-row-check-and-host-shape-hints.md AC-20261026-02-5, -6, -7 (D3, D4):
// port-check's advisory host-shape classes.

function portCheck(config, extra = []) {
  const dir = tmpdir('hsh')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config, null, 2))
  return runNode('scripts/port-check.js', ['--root', dir, ...extra])
}

const lines = (r, cls) => r.stdout.split('\n').filter((l) => l.includes(cls))

test('AC-20261026-02-5: port-check prints one config-compound-boot line and exits 1 for a compound bootCommand, and none for pnpm start', () => {
  const bad = portCheck({ runtime: { bootCommand: 'pnpm build && cd apps/web && exec node server.mjs' },
    capabilities: { testCountPattern: 'x (\\d+)' } })
  assert.strictEqual(lines(bad, 'config-compound-boot runtime.bootCommand').length, 1,
    `a compound boot line must produce exactly one hint — otherwise doctor never nudges the host toward a script (stdout: ${bad.stdout})`)
  assert.strictEqual(bad.status, 1, `a finding must exit 1 (stderr: ${bad.stderr})`)
  const ok = portCheck({ runtime: { bootCommand: 'pnpm start' }, capabilities: { testCountPattern: 'x (\\d+)' } })
  assert.strictEqual(lines(ok, 'config-compound-boot').length, 0,
    `a simple boot command must get no hint — false positives train hosts to ignore doctor (stdout: ${ok.stdout})`)
})

test('AC-20261026-02-6: port-check prints one config-no-test-count line for a host with a testCommand and no testCountPattern, and none when it is declared', () => {
  const bad = portCheck({ testCommand: 'npm test' })
  assert.strictEqual(lines(bad, 'config-no-test-count capabilities.testCountPattern').length, 1,
    `a host without testCountPattern must be hinted — otherwise a zero-test run reads as a passing suite (stdout: ${bad.stdout})`)
  const ok = portCheck({ testCommand: 'npm test', capabilities: { testCountPattern: 'ℹ tests (\\d+)' } })
  assert.strictEqual(lines(ok, 'config-no-test-count').length, 0,
    `a declared pattern must silence the hint (stdout: ${ok.stdout})`)
})

test('AC-20261026-02-7: port-check prints neither new class for an inert runtime with testCountPattern declared, and --json is {"findings":[]}', () => {
  const r = portCheck({ runtime: { inert: 'x', bootCommand: 'a && b' }, testCommand: 'npm test',
    capabilities: { testCountPattern: 'ℹ tests (\\d+)' } }, ['--json'])
  assert.strictEqual(r.status, 0, `an inert, fully declared host must exit 0 (stdout: ${r.stdout}, stderr: ${r.stderr})`)
  assert.deepStrictEqual(JSON.parse(r.stdout), { findings: [] },
    'an inert runtime must never be hinted about its boot command — doctor would nag hosts that boot nothing')
})
