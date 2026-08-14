'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// Spec 20260813/08 (question contract, D5/D6/D7): four doctrine sites instruct the opposite
// of what the wired question-style-gate.js hook enforces at ask time, and two irreversible-ish
// actions fire with no confirm step. This file pins the doctrine-side half of that spec — the
// wording flips (banned phrase gone, replacement literal present) and the consumer-site field
// names (D4) that make the newly-required schema fields (spec 08's schema-contract.test.js)
// actually get read into the question the command builds. Regex pins over read() content, per
// this repo's doctrine-alignment test mode (.claude/rules/conventions/tests.md).

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

// AC-20260813-08-5: review.md and doctor.md no longer instruct against recommending or against
// batching approvals, and both name an explicit ≤4-per-call batch bound (B1/B2).
test('review.md recommends the evidence-implied disposition instead of "recommend nothing" (AC-20260813-08-5)', () => {
  assert.ok(exists('spec/commands/review.md'), 'missing spec/commands/review.md — cannot pin B1 wording fix')
  const doc = read('spec/commands/review.md')
  assert.doesNotMatch(doc, /recommend nothing/,
    'review.md still tells the session to recommend nothing, which the wired question-style-gate.js hook bounces at ask time')
  assert.match(doc, /(≤\s?4|up to 4)/i,
    'review.md must state an explicit ≤4-per-call batch bound for finding-group AskUserQuestion calls (B1)')
})

test('doctor.md batches patch approvals up to a stated bound instead of forbidding batching outright (AC-20260813-08-5)', () => {
  assert.ok(exists('spec/commands/doctor.md'), 'missing spec/commands/doctor.md — cannot pin B2 wording fix')
  const doc = read('spec/commands/doctor.md')
  assert.doesNotMatch(doc, /Never batch-approve/,
    'doctor.md still forbids batching patch approvals outright, which the wired question-style-gate.js hook treats as a formatting defect, not a scoping rule')
  assert.match(doc, /(≤\s?4|up to 4)/i,
    'doctor.md must state an explicit ≤4-per-call (or "up to 4") batch bound for per-patch AskUserQuestion approvals (B2)')
})

// AC-20260813-08-6: genesis-architect.md drops the blanket "neutrally worded" clause for a
// scoped carve-out; build.md's optional "(Recommended)" gloss becomes mandatory (B3/B4).
test('genesis-architect.md scopes neutral phrasing to vision/taste dimensions instead of a blanket rule (AC-20260813-08-6)', () => {
  assert.ok(exists('spec/commands/genesis-architect.md'), 'missing spec/commands/genesis-architect.md — cannot pin B4 wording fix')
  const doc = read('spec/commands/genesis-architect.md')
  assert.doesNotMatch(doc, /neutrally worded/,
    'genesis-architect.md still carries the blanket "neutrally worded" clause, which contradicts the later recommended-first rule and teaches the style the wired hook blocks')
  assert.match(doc, /vision\/taste dimensions may stay neutral/,
    'genesis-architect.md must carry the literal carve-out sentence scoping neutral phrasing to vision/taste dimensions (B4)')
})

test('build.md marks a supported pick "(Recommended)" instead of leaving it optional (AC-20260813-08-6)', () => {
  assert.ok(exists('spec/commands/build.md'), 'missing spec/commands/build.md — cannot pin B3 wording fix')
  const doc = read('spec/commands/build.md')
  assert.doesNotMatch(doc, /may be marked "\(Recommended\)"/,
    'build.md still describes the "(Recommended)" gloss as optional, contradicting the mandatory-recommendation rule spec 09 keys off')
  assert.match(doc, /is marked "\(Recommended\)"/,
    'build.md must state the supported pick "is marked" (not "may be marked") "(Recommended)" (B3)')
})

// AC-20260813-08-7: enforce.md and audit.md gain a confirm step before an irreversible-ish
// write, anchored on the spec's literal sentence (D6/B7).
test('enforce.md confirms before its repo-wide format write-mode pass rewrites files (AC-20260813-08-7)', () => {
  assert.ok(exists('spec/commands/enforce.md'), 'missing spec/commands/enforce.md — cannot pin B7 confirm-before-write fix')
  const doc = read('spec/commands/enforce.md')
  assert.match(doc, /Confirm before writing:/,
    'enforce.md must gain a batched confirm before the repo-wide format write-mode pass, anchored on the literal sentence "Confirm before writing: {N} files will be rewritten" — without it the pass fires with zero decision point')
})

test('audit.md previews the brief before writing it (AC-20260813-08-7)', () => {
  assert.ok(exists('spec/commands/audit.md'), 'missing spec/commands/audit.md — cannot pin B7 confirm-before-write fix')
  const doc = read('spec/commands/audit.md')
  assert.match(doc, /preview the brief before it is written/,
    'audit.md\'s brief-writing fate must preview the brief before it is written, matching its sibling rule-row fate\'s existing preview step')
})

// AC-20260813-08-8: D4 consumer sites name the new schema fields so the question actually built
// from the payload renders them — a required field nobody reads is the same defect this wave
// kills in spec 06 (GATE.summary).
test('genesis-architect.md\'s fork-question step names consequence when building the AskUserQuestion from hard_fork_list (AC-20260813-08-8)', () => {
  assert.ok(exists('spec/commands/genesis-architect.md'), 'missing spec/commands/genesis-architect.md — cannot pin D4 consumption fix')
  const doc = read('spec/commands/genesis-architect.md')
  const anchor = doc.indexOf('hard_fork_list')
  assert.notStrictEqual(anchor, -1,
    'genesis-architect.md no longer references hard_fork_list — the fork-question step this AC pins may have moved or been deleted')
  const step = doc.slice(anchor, anchor + 500)
  assert.match(step, /consequence/,
    'genesis-architect.md\'s fork-question step must name `consequence` so it is rendered into each option\'s description — a schema field nobody reads repeats the GATE.summary defect')
})

test('genesis-architect.md\'s menu-question step names why_recommended when building the AskUserQuestion from a research-backed menu (AC-20260813-08-8)', () => {
  assert.ok(exists('spec/commands/genesis-architect.md'), 'missing spec/commands/genesis-architect.md — cannot pin D4 consumption fix')
  const doc = read('spec/commands/genesis-architect.md')
  const anchor = doc.indexOf('AskUserQuestion` built')
  assert.notStrictEqual(anchor, -1,
    'genesis-architect.md no longer has a "AskUserQuestion built from the menu" step — the menu-question step this AC pins may have moved or been deleted')
  const step = doc.slice(anchor, anchor + 500)
  assert.match(step, /why_recommended/,
    'genesis-architect.md\'s menu-question step must name `why_recommended` as the stated reason for the recommended-first option — a schema field nobody reads repeats the GATE.summary defect')
})

test('genesis.md\'s wf-research field-shape description lists why_recommended (AC-20260813-08-8)', () => {
  assert.ok(exists('spec/doctrine/genesis.md'), 'missing spec/doctrine/genesis.md — cannot pin D4 field-shape description fix')
  const doc = read('spec/doctrine/genesis.md')
  assert.match(doc, /why_recommended/,
    'genesis.md must describe the wf-research option-menu field shape including `why_recommended` (why rank 1 wins for this project) — the field spec D2 adds to OPTION_SET_SCHEMA must be documented where the loop is described, not just implemented')
})
