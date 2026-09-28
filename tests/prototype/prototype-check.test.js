'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { setupHost, patchConfig, bare } = require('./fixture')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D8, AC-20260928-01-10 — the
// `check [--json]` subcommand (doctor check 23, advisory) does not exist yet: every case below
// is genuinely RED against spec/scripts/prototype-driver.js's absence.

function check(dir, extra = []) {
  return bare(dir, ['check', ...extra])
}

test('AC-20260928-01-10: check exits 0 and prints nothing on a clean fixture host', () => {
  const dir = setupHost()
  const r = check(dir)
  assert.strictEqual(r.status, 0, 'a fixture host whose prototype block matches every rule must pass clean: ' + JSON.stringify(r))
  assert.strictEqual(r.stdout.trim(), '', 'a clean run must print nothing (advisory, silent on success): ' + JSON.stringify(r.stdout))
})

test('AC-20260928-01-10: check exits 1 naming the export glob that matches no tracked file', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.export.push('nope/never/**') })
  const r = check(dir)
  assert.strictEqual(r.status, 1, 'an export glob matching zero tracked files must fail the check: ' + JSON.stringify(r))
  assert.match(r.stdout + r.stderr, /nope\/never\/\*\*/,
    'the finding must name the exact offending glob so the remedy is discoverable: ' + JSON.stringify(r))
})

test('AC-20260928-01-10: check exits 1 naming prototype.overlay when the overlay path sits inside an export glob', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.overlay = 'src/db/proto-overlay.js' }) // inside src/db/**
  const r = check(dir)
  assert.strictEqual(r.status, 1, 'an overlay path matched by an export glob must fail the check — it would ship the dev-only overlay into the frozen data/API layer (D8): ' + JSON.stringify(r))
  assert.match(r.stdout + r.stderr, /prototype\.overlay/,
    'the finding must name prototype.overlay specifically: ' + JSON.stringify(r))
})

test('AC-20260928-01-10: check exits 1 naming prototype.e2eFile when it lacks the {brief} token', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => { cfg.prototype.e2eFile = 'e2e/proto.smoke.spec.ts' })
  const r = check(dir)
  assert.strictEqual(r.status, 1, 'an e2eFile template with no {brief} placeholder can never be derived per-brief and must fail the check: ' + JSON.stringify(r))
  assert.match(r.stdout + r.stderr, /prototype\.e2eFile/,
    'the finding must name prototype.e2eFile specifically: ' + JSON.stringify(r))
})

test('AC-20260928-01-10: check --json prints one findings entry per triggered rule', () => {
  const dir = setupHost()
  patchConfig(dir, (cfg) => {
    cfg.prototype.export.push('nope/never/**')
    cfg.prototype.e2eFile = 'e2e/proto.smoke.spec.ts' // no {brief}
  })
  const r = check(dir, ['--json'])
  assert.strictEqual(r.status, 1, JSON.stringify(r))
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch (e) {
    assert.fail('--json must print a single parseable JSON object on stdout: ' + JSON.stringify(r.stdout) + ' (' + e.message + ')')
  }
  assert.ok(Array.isArray(parsed.findings), '--json must carry a top-level "findings" array: ' + JSON.stringify(parsed))
  assert.strictEqual(parsed.findings.length, 2,
    'two rules were violated (the export glob and the e2eFile token) — findings must carry one entry per triggered rule, not a single combined line: ' + JSON.stringify(parsed.findings))
})
