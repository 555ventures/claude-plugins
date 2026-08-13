'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('./helpers')

// CROSS-20260813-02: review-stage agents' write discipline is prose about FILES only —
// execution side effects and working-tree hygiene are unfenced. Two incidents: a verifier ran
// `ALTER TABLE revenue_events NO FORCE ROW LEVEL SECURITY` against the shared dev database
// unprompted (prax wf_ab878c58-31c) — a crash between that mutation and its restore would leave
// tenant isolation off, and fail-closed verification EXPECTS crashed verifiers as routine
// (verify.failed survivors), so a verifier that mutates shared state and then dies leaves the
// substrate silently broken; a /spec:reviewer agent left an untracked scratch diff2.txt that a
// `git add -A` in the close commit would have shipped (prax spec 20260812/02). Two failing
// tests: wf-review.body.js's verifyPrompt needs a shared-substrate fence (databases, services,
// env — anything beyond the verifier's own repro file requires the orchestrator), and
// review.md needs a mandatory `git status --porcelain` sweep after the panel and before the
// close commit.

const wfReview = read('spec/workflows/src/wf-review.body.js')
const review = read('spec/commands/review.md')

test('CROSS-20260813-02a: verifyPrompt fences shared stateful substrates (databases, services, env), not just file edits', () => {
  assert.match(wfReview, /shared (stateful )?substrate/i,
    'verifyPrompt only fences FILE edits ("Never edit existing files") and git commands ' +
    '("never run git commands other than status") — nothing forbids a verifier from mutating a ' +
    'shared stateful substrate (database, service, env) beyond its own repro file. prax ' +
    'wf_ab878c58-31c: a verifier ran `ALTER TABLE revenue_events NO FORCE ROW LEVEL SECURITY` ' +
    'against the shared dev database unprompted — fail-closed verification EXPECTS crashed ' +
    'verifiers as routine (verify.failed survivors), so a crash between that mutation and its ' +
    'restore leaves tenant isolation off with nothing in the prompt having forbidden the mutation')
})

test('CROSS-20260813-02b: review.md mandates a git status --porcelain sweep after the panel and before the close commit', () => {
  assert.match(review, /git status --porcelain/,
    'review.md has no mandated `git status --porcelain` sweep between the review panel and the ' +
    'Phase 3 close commit — a /spec:reviewer agent left an untracked scratch file (diff2.txt, ' +
    'prax spec 20260812/02) that Phase 3\'s "commit everything still uncommitted on the working ' +
    'branch" step would silently ship on the next close, with nothing catching the leftover ' +
    'working-tree hygiene defect first')
})
