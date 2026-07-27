'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260726-01 (corroborated by hearwell): the red-check's sanctioned-green carve-out
// is a single literal phrase ("SHALL CONTINUE TO"), but the class is any AC whose carrier
// is a legitimately-green test: negative-invariant/absence pins (prax spec 20260725/01,
// two resume attempts looped on tdd-red-check), tag-only ACs re-tagging existing passing
// coverage (prax spec 20260725/08), and tests against components pre-landed at the DESIGN
// stage (hearwell spec 20260724/01). Every instance forces abandoning the workflow for
// fastPath — losing batching and the gate/repair loop for the whole spec. Fix contract:
// the red-check exempts the full sanctioned-green class, not one phrase.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')

const start = src.indexOf("phase('RedCheck')")
assert.ok(start !== -1, 'RedCheck phase missing from wf-build source')
const redBlock = src.slice(start, src.indexOf('FAIL CLOSED', start))

test('red-check exempts invariant pins and tag-only ACs, not just "SHALL CONTINUE TO"', () => {
  assert.match(redBlock, /invariant|absen|tag-only|re-?tag|existing[- ](passing[- ])?test/i,
    'only the literal "SHALL CONTINUE TO" phrase is exempt: a negative-invariant pin ' +
    '(construct ABSENT from a locked file) or a tag-only AC (AC-ID added to existing ' +
    'coverage, no assertion change) is legitimately green before implementation, and the ' +
    'red-check loops the build into fastPath abandonment')
})

test('red-check exempts tests against components pre-landed at the design stage', () => {
  assert.match(redBlock, /design/i,
    '/spec:design ships fully interactive components, so AC tests against them pass on ' +
    'first run; the red-check must recognize design-landed carriers instead of reporting ' +
    'a vacuous-test defect or forcing an orchestrator override')
})
