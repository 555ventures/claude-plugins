'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read, writePolicy } = require('../helpers')
const { makeNoTestsHost, run } = require('../build/build-driver.fixtures')

// specs/20261029/01-model-placement-refresh.md (AC-20261029-01-7, -8, -9, -10): model seats are
// aliases with an explicit effort, review independence is a fresh context, no family rule.


test('AC-20261029-01-8 / AC-20261029-09-8: the build driver wave step prints the sonnet/medium worker seat from the policy defaults and no doctrine claims "Orchestrator and workers: Sonnet"', () => {
  const h = makeNoTestsHost()
  const r = run(h.root, h.spec)
  assert.strictEqual(r.status, 0, 'setup precondition: the driver must print the first wave: ' + r.stdout + r.stderr)
  assert.ok(r.stdout.includes('Agent {model: sonnet, effort: medium} per layer above and KEEP it'),
    'the printed wave step must carry the worker seat with its effort, or workers run at the session default effort: ' + r.stdout)
  assert.ok(!r.stdout.includes('Agent {model: sonnet} per layer'),
    'the printed wave step still shows the effortless worker seat')
  const o = makeNoTestsHost()
  writePolicy(o.root, { models: { workers: { model: 'opus', effort: 'medium' } } })
  o.g('add', '-A'); o.g('commit', '-q', '-m', 'policy')
  const ro = run(o.root, o.spec)
  assert.ok(ro.stdout.includes('Agent {model: opus, effort: medium} per layer above and KEEP it'),
    'the wave step seat is hard-coded, so a host policy override of the worker seat never reaches the dispatch: ' + ro.stdout + ro.stderr)
  for (const f of ['spec/commands/run.md', 'spec/doctrine/stages/stage-build.md', 'spec/doctrine/stages/stage-review.md']) {
    assert.ok(!read(f).includes('Orchestrator and workers: Sonnet'),
      f + ' still claims the orchestrator is Sonnet, a seat that is the invoking session and cannot be enforced')
  }
})

