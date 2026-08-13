'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// CROSS-20260727-01: every recorded escape through a CLEAN review across three hosts
// went through a fix-delta iteration-2 CLEAN (zubu wf_e717bc0b-a06; prax
// wf_1d2110d7-d3c and wf_f988caea-506; upwell wf_cce37245-ec1) or a CLEAN whose test
// leg was a cache replay (upwell wf_e260acd3-1da, dataplane:test turbo-cached against
// a widened model). The fix-delta re-review scopes one reviewer to the fix diff and
// prior findings — it INHERITS the full diff's gate/smoke state from iteration 1
// instead of re-asserting it, so the CLEAN verdict certifies executed state nobody
// re-executed. ZUBU-20260716-01's recorded reopen condition ("a second-host escape
// through a fix-delta CLEAN reopens") has fired. Fix contract: a fix-delta CLEAN
// re-runs the full gate (cache-defeated) before the verdict stands, even though the
// reviewer's attention stays scoped to the fix.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-review.body.js'), 'utf8')

test('AC-20260813-01-5: a fix-delta CLEAN re-asserts the full gate state instead of inheriting it', () => {
  const i = src.indexOf("'fix-delta'")
  assert.ok(i !== -1, 'fix-delta scope missing from wf-review source')
  assert.match(src, /fix-?delta[\s\S]{0,2000}?(full (diff'?s? )?gate|re-?run.{0,40}gate|gate.{0,40}re-?run)/i,
    'the fix-delta pass reviews only the fix diff + prior findings: the full diff\'s ' +
    'gate and smoke state ride in from the previous iteration, and every cross-host ' +
    'contradicted CLEAN on record went through exactly this channel')
})
