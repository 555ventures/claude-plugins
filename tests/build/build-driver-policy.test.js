'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeNoTestsHost, run } = require('./build-driver.fixtures')

// specs/20261029/09-the-commands-read-the-policy-block.md (AC-20261029-09-8): the build driver's
// wave header prints the workers seat from policy.models.workers.

function waveOut(policyBlock) {
  const h = makeNoTestsHost()
  if (policyBlock) {
    const cfgPath = path.join(h.root, '.claude/spec.config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.policy = policyBlock
    fs.writeFileSync(cfgPath, JSON.stringify(cfg))
    h.g('add', '-A'); h.g('commit', '-q', '-m', 'policy')
  }
  const r = run(h.root, h.spec)
  assert.strictEqual(r.status, 0, 'setup precondition: the driver must print the first wave: ' + r.stdout + r.stderr)
  return r.stdout
}

test('AC-20261029-09-8: WHEN policy.models.workers is opus/medium THE SYSTEM prints that seat in the wave header', () => {
  const out = waveOut({ models: { workers: { model: 'opus', effort: 'medium' } } })
  assert.ok(out.includes('spawn one long-lived Agent {model: opus, effort: medium} per layer above and KEEP it'),
    'workers run on the hard-coded sonnet seat whatever the host policy says: ' + out)
})

test('AC-20261029-09-8: WHEN there is no policy block THE SYSTEM prints Agent {model: sonnet, effort: medium} in the wave header', () => {
  const out = waveOut(null)
  assert.ok(out.includes('spawn one long-lived Agent {model: sonnet, effort: medium} per layer above and KEEP it'),
    'the default wave header drifted from the seat table: ' + out)
})
