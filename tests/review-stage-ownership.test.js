'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// v6.4.1: reviewers reported review-stage-owned deliverables as missing from the diff —
// the Canonical Delta (applied to docs/canonical/ by /spec:review on CLEAN) and the
// frontmatter status flip run AFTER the reviewer's verdict, so their absence is the
// expected precondition of the review, never a finding. Pinned on every reviewer surface:
// the agent doctrine, the workflow src, and the generated workflow (which must carry the
// clause too — build:workflows output is what actually ships to the reviewer prompt).

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

test('reviewer.md carries the stage-ownership carve-out', () => {
  const doc = read('agents/reviewer.md')
  assert.match(doc, /Stage ownership/i)
  assert.match(doc, /Canonical Delta/)
  assert.match(doc, /never a finding/i)
})

for (const p of ['workflows/src/wf-review.body.js', 'workflows/wf-review.js']) {
  test(`${p} tells reviewers not to report review-stage-owned artifacts as missing`, () => {
    const src = read(p)
    assert.match(src, /Canonical Delta/)
    assert.match(src, /AFTER your verdict/)
    assert.match(src, /never a finding/i)
  })
}
