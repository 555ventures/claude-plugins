'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, SPEC, read } = require('../helpers')

// specs/20261029/01-model-placement-refresh.md (AC-20261029-01-7, -8, -9, -10): model seats are
// aliases with an explicit effort, review independence is a fresh context, no family rule.

test('AC-20261029-01-7: fix.md step 4 dispatches the spec:reviewer seat unconditionally, with no session-model switch and no family rule', () => {
  const fix = read('spec/commands/fix.md')
  const start = fix.indexOf('4. **Fresh review.**')
  assert.ok(start !== -1, 'fix.md lost its step 4 "Fresh review" paragraph, so the reviewer dispatch is unpinned')
  const rest = fix.slice(start)
  const end = rest.search(/\n5\. /)
  const step = end === -1 ? rest : rest.slice(0, end)
  assert.ok(step.includes("Agent {subagent_type: 'spec:reviewer'}"),
    'step 4 must dispatch the reviewer agent so its own opus/high seat applies')
  assert.ok(!step.includes('when this session runs Fable'),
    'step 4 still switches the reviewer by session model, inverting the seat in a Fable session')
  assert.ok(!step.includes('a different family'),
    'step 4 still teaches the retired family rule that nothing in the plugin can enforce')
})

test('AC-20261029-01-8: the build driver wave step names the sonnet/medium worker seat and no doctrine claims "Orchestrator and workers: Sonnet"', () => {
  const drv = read('spec/scripts/spec-build-driver.js')
  assert.ok(drv.includes('Agent {model: sonnet, effort: medium}'),
    'the wave step must print the worker seat with its effort, or workers run at the session default effort')
  assert.ok(!drv.includes('Agent {model: sonnet} per layer'),
    'the wave step still prints the effortless worker seat')
  for (const f of ['spec/commands/run.md', 'spec/doctrine/stages/stage-build.md', 'spec/doctrine/stages/stage-review.md']) {
    assert.ok(!read(f).includes('Orchestrator and workers: Sonnet'),
      f + ' still claims the orchestrator is Sonnet, a seat that is the invoking session and cannot be enforced')
  }
})

test('AC-20261029-01-9: README states the thesis as a fresh-context reviewer and no longer names an uncorrelated model', () => {
  const readme = read('README.md')
  assert.ok(readme.includes('fresh-context reviewer'),
    'README must state the fresh-context mechanism, or the public thesis contradicts core § Model Placement')
  assert.ok(!readme.includes('uncorrelated model'),
    'README still teaches the retired uncorrelated-model mechanism')
})

test('AC-20261029-01-10: no regular file under spec/ outside spec/evals names a versioned model id', () => {
  const banned = /claude-(fable|opus|sonnet|haiku)-[0-9]/
  const hits = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      const rel = path.relative(ROOT, p)
      if (rel === path.join('spec', 'evals')) continue
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && banned.test(fs.readFileSync(p, 'utf8'))) hits.push(rel)
    }
  }
  walk(SPEC)
  assert.deepStrictEqual(hits, [],
    'a dated model id retires silently and the seat then fails with no message; seats must use aliases: ' + hits.join(', '))
})
