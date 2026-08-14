'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns } = require('../helpers')

// specs/20260813/06-report-renderer.md (2026-08-13): the report skeleton (spec 06's other pin,
// tests/report/report-render.test.js) is only as good as the data workflows hand it. The audit
// found the console report starved of the fields it needed: findings surfaced jargon instead of
// plain-English impact (E4), degraded runs (fewer proposers, a failed currency verifier, a
// thinned reviewer panel) went silent (E9), and the report's provenance id was never pinned
// (E11). This file pins the six workflow bodies' return-schema/assembly deltas (D5-D9) by
// source-shape regex and by executing wf-panel's proposal-survival guard directly.

test('AC-20260813-06-6: wf-review\'s finding schema requires `impact` (plain English, no code identifiers), and review.md\'s return-shape string names `runId`', () => {
  const wfReviewSrc = read('spec/workflows/src/wf-review.body.js')
  const findingsBlockMatch = wfReviewSrc.match(/const FINDINGS = \{[\s\S]*?\n\}\n/)
  assert.ok(findingsBlockMatch, 'the FINDINGS schema constant could not be located in wf-review.body.js — source moved, update the extraction')
  const findingsBlock = findingsBlockMatch[0]
  assert.match(findingsBlock, /required:\s*\[[^\]]*'impact'[^\]]*\]/,
    'a finding\'s required fields must include `impact` (D5) — findings today require only file/line/severity/claim/rule, with no plain-English consequence line the console report can display')
  assert.match(findingsBlock, /impact:\s*\{[^}]*description:[^}]*plain English/i,
    'the `impact` property\'s schema description must demand plain English (D5) — without an enforced description reviewers surface raw code identifiers into the report\'s display line')
  assert.match(findingsBlock, /impact:\s*\{[^}]*description:[^}]*(no|never|forbid).{0,25}(code )?identifiers/i,
    'the `impact` property\'s schema description must forbid code identifiers (D5) — this is the exact failure mode E4 recorded')

  const reviewMd = read('spec/commands/review.md')
  const rulesIdx = reviewMd.indexOf('## Rules')
  assert.ok(rulesIdx !== -1, 'review.md has no "## Rules" section — cannot locate the documented return shape to check it')
  const rulesSection = reviewMd.slice(rulesIdx)
  const shapeMatch = rulesSection.match(/return shape is\s*\n?\s*`(\{[^`]*\})`/)
  assert.ok(shapeMatch, 'review.md\'s "## Rules" section no longer states the documented return-shape string in the expected `return shape is` form')
  assert.match(shapeMatch[1], /runId/,
    'review.md\'s documented return-shape string must name `runId` (D5: synced in the same commit as the schema change) — an unsynced doc string is exactly the drift class the blind-spot pass flagged')
})

test('AC-20260813-06-7: wf-panel throws naming the degraded count when fewer than 3 proposals survive, and proceeds to aggregation at exactly 3', () => {
  const src = read('spec/workflows/src/wf-panel.body.js')
  // D6: "throws when fewer than 3 proposals survive (the arg-boundary invariant enforced at
  // runtime too; the throw sits inside the runProposers block)". Per this repo's established
  // pattern (wf-build's assertGateArgs/assertResolutions/crossCheckSentinels), the check is
  // hoisted into a named top-level function — `assertProposalSurvival(proposals)` — so this test
  // can execute it standalone via evalFns instead of only asserting on prompt text.
  const { assertProposalSurvival } = evalFns(src, ['assertProposalSurvival'])
  assert.throws(() => assertProposalSurvival([{ role: 'a' }, { role: 'b' }]),
    /2/,
    'fewer than 3 surviving proposals must throw, naming the degraded count — a silently-thinned MoA panel (2 proposers instead of 3) is exactly the silent-degradation class (E9) this spec closes; the throw must also name the count so the failure is diagnosable')
  assert.doesNotThrow(() => assertProposalSurvival([{ role: 'a' }, { role: 'b' }, { role: 'c' }]),
    'exactly 3 surviving proposals must SHALL CONTINUE TO proceed to aggregation, never be treated as degraded — the panel doctrine\'s own count, not a stricter one')
})

test('AC-20260813-06-8: each of the six workflow bodies pins `runId` and its body-specific degradation field in its return assembly', () => {
  const bodies = {
    'wf-build': ['runId', 'agentsFailed'],
    'wf-design': ['runId', 'agentsFailed'],
    'wf-panel': ['runId', 'agentsFailed'],
    'wf-research': ['runId', 'verifyFailed', 'alsoConsidered'],
    'wf-review': ['runId'],
    'wf-enforce': ['runId'],
  }
  for (const [name, fields] of Object.entries(bodies)) {
    const src = read(`spec/workflows/src/${name}.body.js`)
    for (const field of fields) {
      assert.match(src, new RegExp('\\b' + field + '\\s*:'),
        `${name}.body.js must pin \`${field}\` in its return assembly (D6/D9) — the envelope contract exists only by convention today; a run with no provenance id or a silently-reduced-assurance run with no data carrier is exactly what E9/E11 recorded`)
    }
  }
})

test('AC-20260813-06-9: wf-enforce requires `notes`, wf-build\'s GATE no longer requires `summary`, and RECEIPT.files[].summary stays required', () => {
  const enforceSrc = read('spec/workflows/src/wf-enforce.body.js')
  const candidateMatch = enforceSrc.match(/const CANDIDATE = \{[\s\S]*?\n\}\n/)
  assert.ok(candidateMatch, 'the CANDIDATE schema constant could not be located in wf-enforce.body.js — source moved, update the extraction')
  assert.match(candidateMatch[0], /required:\s*\['id',\s*'stack',\s*'category',\s*'candidates',\s*'fallback',\s*'notes'\]/,
    'CANDIDATE\'s required list must include `notes` (D7) — the report\'s mandatory ⚠️ fallback line has no data source without it (E6)')

  const buildSrc = read('spec/workflows/src/wf-build.body.js')
  const gateMatch = buildSrc.match(/const GATE = \{[\s\S]*?\n\}\n/)
  assert.ok(gateMatch, 'the GATE schema constant could not be located in wf-build.body.js — source moved, update the extraction')
  assert.ok(!/required:\s*\['pass',\s*'failures',\s*'summary'\]/.test(gateMatch[0]),
    'GATE.summary must be dropped from the required set (D7) — a repo-wide grep found zero readers of it; a required-but-consumed-by-nobody field is pure waste')

  const receiptMatch = buildSrc.match(/const RECEIPT = \{[\s\S]*?\n\}\n/)
  assert.ok(receiptMatch, 'the RECEIPT schema constant could not be located in wf-build.body.js — source moved, update the extraction')
  assert.match(receiptMatch[0], /required:\s*\['path',\s*'action',\s*'summary'\]/,
    'files[].summary SHALL CONTINUE TO be required (regression pin, D7) — it is actively consumed in repair prompts; un-requiring it would inject undefined into them')
})
