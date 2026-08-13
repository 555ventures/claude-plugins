'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns, extractFn } = require('../helpers')

// PRAX-20260813-01 / spec 20260813/01-review-self-report-integrity.md D2: the wf-review
// verify loop only feeds the structured `result` enum into verdict.js — a killed[] entry
// whose own quoted evidence contradicts its killedBy label (prax wf_5a730ede-0f8:
// killedBy:"sanction", evidence "Not actually sanctioned — correcting: the claim stands
// unrefuted") rides to CLEAN invisibly. auditKilled(killed) is the mechanical, deterministic
// (no agent) post-verify audit that resurrects such entries as survivors flagged
// 'kill-contradicted', failing toward survival whenever evidence is missing or matches the
// closed contradiction-marker lists.

const src = read('spec/workflows/src/wf-review.body.js')

test('AC-20260813-01-2: auditKilled resurrects a kill whose evidence denies its own sanction label', () => {
  const { auditKilled } = evalFns(src, ['auditKilled'])
  const killed = [{
    file: 'a.js', line: 1, severity: 'hard', killedBy: 'sanction',
    evidence: 'Not actually sanctioned — correcting: the claim stands unrefuted',
  }]
  const audited = auditKilled(killed)
  assert.strictEqual(audited.resurrected.length, 1,
    'a killedBy:"sanction" entry whose own evidence text denies the sanction (prax ' +
    'wf_5a730ede-0f8) must be resurrected as a survivor — trusting the structured result ' +
    'label alone let this exact contradiction ride to a CLEAN verdict')
  assert.strictEqual(audited.kept.length, 0,
    'the self-contradicting entry must not remain in kept — it belongs only in resurrected')
})

test('AC-20260813-01-2: auditKilled resurrects any kill carrying empty or whitespace-only evidence', () => {
  const { auditKilled } = evalFns(src, ['auditKilled'])
  const killed = [
    { file: 'a.js', line: 1, severity: 'hard', killedBy: 'sanction', evidence: '' },
    { file: 'b.js', line: 2, severity: 'hard', killedBy: 'miscitation', evidence: '   ' },
  ]
  const audited = auditKilled(killed)
  assert.strictEqual(audited.resurrected.length, 2,
    'a kill with missing or whitespace-only evidence carries no proof at all for its label — ' +
    'the audit must fail toward survival for both entries regardless of killedBy value, not ' +
    'trust an unsupported kill through')
  assert.strictEqual(audited.kept.length, 0,
    'neither empty-evidence entry may remain kept once the audit runs')
})

test('AC-20260813-01-2: auditKilled keeps a kill whose evidence quotes an actual sanctioning row verbatim', () => {
  const { auditKilled } = evalFns(src, ['auditKilled'])
  const killed = [{
    file: 'a.js', line: 1, severity: 'hard', killedBy: 'sanction',
    evidence: 'Decisions D4: "workers may skip the retry wrapper" — quoted verbatim',
  }]
  const audited = auditKilled(killed)
  assert.strictEqual(audited.resurrected.length, 0,
    'a kill whose evidence genuinely quotes a sanctioning Decision row must NOT be resurrected ' +
    '— the audit only catches self-contradicting or unsupported kills, never legitimate ones')
  assert.strictEqual(audited.kept.length, 1,
    'the legitimately-sanctioned entry must remain in kept, unchanged')
})

test('AC-20260813-01-8: auditKilled is a pure function over killed[] alone, and the verifier-failed fail-closed branch stays wired outside it', () => {
  const body = extractFn(src, 'auditKilled')
  assert.doesNotMatch(body, /\bsurvivors\b/,
    'auditKilled must be a pure function over the killed[] array alone — if its own source ' +
    'body references `survivors` directly, the wiring contract (resurrection happens at the ' +
    'call site: survivors.push(...resurrected)) has been violated, and a verifier-failed ' +
    'survivor could be silently reclassified by the audit instead of passing through untouched')
  assert.match(src, /if \(!v\) \{ verify\.failed\+\+; survivors\.push\(\{ \.\.\.f, verification: 'verifier-failed' \}\); return \}/,
    'a crashed verifier (no structured verdict) must keep surviving as `verifier-failed` — the ' +
    'audit layer only ever operates on killed[] entries, so this fail-closed branch must remain ' +
    'byte-identical and must never be routed through auditKilled')
})
