'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeHost, run } = require('./build-driver.fixtures')

// salon-os 2026-09-29: env-preflight ran only on the hardened -> implementing flip, so a resumed
// build in a worktree with the wrong env was never checked. Preflight now runs on every invocation.
const VAR = 'SPEC_TEST_RESUME_PREFLIGHT_VAR'
const DRIVER = path.join(__dirname, '..', '..', 'spec', 'scripts', 'spec-build-driver.js')

function runWith(root, spec, extraEnv) {
  const env = { ...process.env }
  delete env[VAR]
  return spawnSync(process.execPath, [DRIVER, spec], { cwd: root, encoding: 'utf8', env: { ...env, ...extraEnv } })
}

function snapshot(dir) {
  if (!fs.existsSync(dir)) return null
  return fs.readdirSync(dir).sort().map((f) => f + '\0' + fs.readFileSync(path.join(dir, f), 'utf8'))
}

test('an implementing resume runs env-preflight: a declared test env var that is unset stops the driver before any state changes, and setting it lets the resume proceed', () => {
  const host = makeHost({})
  const first = run(host.root, host.spec)
  assert.match(fs.readFileSync(host.spec, 'utf8'), /^status:\s*implementing$/m,
    'setup: the first run must flip the spec to implementing: ' + first.stdout + first.stderr)

  const cfgPath = path.join(host.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.testEnv = [{ var: VAR, provision: 'direnv allow' }]
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))

  const specBefore = fs.readFileSync(host.spec, 'utf8')
  const sidecarBefore = snapshot(host.sidecar)
  const r = runWith(host.root, host.spec, {})
  assert.strictEqual(r.status, 2, 'a resume with an unset declared var must stop with exit 2: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, new RegExp(VAR + ' unset — provision:'),
    'the stop must carry env-preflight\'s own miss line: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), specBefore, 'the spec must be untouched by a failed resume preflight')
  assert.deepStrictEqual(snapshot(host.sidecar), sidecarBefore, 'the build sidecar must be untouched by a failed resume preflight')

  const ok = runWith(host.root, host.spec, { [VAR]: 'set' })
  assert.doesNotMatch(ok.stdout + ok.stderr, /unset — provision:/,
    'with the var set the resume must pass preflight: ' + ok.stdout + ok.stderr)
})
