'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { DIM, bare, mark, writeFile, writeBrief, advanceToMenusReady } = require('./tournament.fixtures')

// specs/20261029/06-the-genesis-question-diet.md — AC-20261029-06-1 (D1 fifteen keys in
// rounds of four), AC-20261029-06-2 (D2 archetype is a printed pick), AC-20261029-06-6 (D5
// DECIDE conventions auto-pick and success-metric line).

const COVERAGE = ['payer', 'tenancy', 'data-sensitivity', 'residency', 'ai-use', 'unattended',
  'integrations', 'scale-outage', 'vendor-budget', 'offline-mobile']
const NON_UI = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']

function darkBrief(dir) {
  writeFile(path.join(dir, '.claude/genesis/brief.md'), `# Discovery brief — test project

## What I think you're building
A synthetic project for discovery-rounds.test.js.

## Coverage
${COVERAGE.map((k) => `- ${k}: dark`).join('\n')}

## Non-goals
none

## Open Dimensions
- ${DIM}: open

## Research Angles
none

## Picks

## Journeys
none

## Non-UI Coverage
${NON_UI.map((k) => `- ${k}: dark`).join('\n')}
`)
}

function roundBlock(out, n) {
  const m = out.match(new RegExp('round ' + n + ' of 4[^\\n]*\\n((?:\\s*- [^\\n]*\\n?)*)'))
  return m ? m[0] : ''
}

test('AC-20261029-06-1: the DISCOVERY step groups exactly fifteen keys under round 1 of 4 to round 4 of 4 in Contracts order, each as a dark guess line, and never lists pricing', () => {
  const dir = tmpdir('disc-rounds-ac1')
  bare(dir)
  darkBrief(dir)
  const r = bare(dir)
  assert.strictEqual(r.status, 0, 'a bare run on a dark brief must print the DISCOVERY step: ' + r.stderr)
  const expected = [
    ['payer', 'tenancy', 'data-sensitivity', 'residency'],
    ['ai-use', 'unattended', 'integrations', 'scale-outage'],
    ['vendor-budget', 'offline-mobile', 'jobs', 'notifications'],
    ['retention', 'admin', 'success-metric'],
  ]
  let all = []
  expected.forEach((keys, i) => {
    const block = roundBlock(r.stdout, i + 1)
    assert.ok(block, 'round ' + (i + 1) + ' of 4 heading is missing, so the owner is never shown the rounds-of-four confirmation list: ' + r.stdout)
    const found = [...block.matchAll(/^\s*- ([a-z-]+): dark · guess:/gm)].map((m) => m[1])
    assert.deepStrictEqual(found, keys, 'round ' + (i + 1) + ' must list exactly its Contracts keys in order, or the owner is asked a different set than D1 locks')
    all = all.concat(found)
  })
  assert.strictEqual(all.length, 15, 'the merged list must carry exactly fifteen keys — a different count means a coverage key is asked twice or never')
  assert.doesNotMatch(r.stdout, /^\s*- pricing:/m, 'pricing must be copied from payer, never listed as its own asked key')
  assert.match(r.stdout, /- payer: dark · guess:/, 'the payer line must sit in the round list in the key: value · guess: form the session fills')
})

test('AC-20261029-06-2: discovery-done refuses a covered brief with no archetype by naming the Auto-picked archetype rule, the DISCOVERY print carries the same instruction, and a present archetype is accepted', () => {
  const dir = tmpdir('disc-rounds-ac2')
  bare(dir)
  writeBrief(dir, {})
  const r = mark(dir, 'discovery-done')
  assert.strictEqual(r.status, 2, 'a covered brief with no archetype line must be refused so the master variable is never silently chosen: ' + r.stdout)
  assert.match(r.stderr, /## Picks is missing a/, 'the refusal must keep naming the missing Picks line so the session knows which brief section to fix')
  assert.match(r.stderr, /📌 Auto-picked archetype/, 'the refusal must name the printed-pick rule, or the session writes the archetype without showing the owner a veto surface')

  const step = bare(dir)
  assert.match(step.stdout, /📌 Auto-picked archetype <key>/, 'the DISCOVERY step must instruct the printed pick, or the archetype stays an unannounced choice')
  assert.doesNotMatch(step.stdout, /missing ## Picks line:/, 'the bare missing-line hint must be replaced by the printed-pick instruction, or two competing instructions are shown')

  writeBrief(dir, { picks: ['- archetype: data-ml'] })
  const ok = mark(dir, 'discovery-done')
  assert.strictEqual(ok.status, 0, 'a brief that names a registry archetype must still be accepted: ' + ok.stderr)
})

test('AC-20261029-06-6: the DECIDE step prints the eight-row conventions auto-pick line without success-metric and reads success-metric from ## Picks', () => {
  const absent = tmpdir('disc-rounds-ac6-absent')
  advanceToMenusReady(absent, 'data-ml')
  writeBrief(absent, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS'] })
  assert.strictEqual(mark(absent, 'menus-done').status, 0, 'test setup requires menus-done to be accepted')
  const a = bare(absent)
  assert.match(a.stdout, /state: DECIDE/, 'test setup requires the run to be at DECIDE')
  const line = a.stdout.split('\n').find((l) => l.startsWith('conventions auto-pick (8): error-taxonomy, logging, naming-identifiers, wire-representations, cross-plane-constants, env-config, ci, background-async'))
  assert.ok(line, 'DECIDE must print the conventions auto-pick line, or the eight derivable rows are asked instead of printed picks: ' + a.stdout)
  assert.doesNotMatch(line, /success-metric/, 'success-metric is a discovery product fact and must not be derived with the conventions')
  assert.match(a.stdout, /^success-metric: not in ## Picks — ask it, in the user's words$/m, 'a missing success-metric pick must be reported as owed to the owner')

  const present = tmpdir('disc-rounds-ac6-present')
  advanceToMenusReady(present, 'data-ml')
  writeBrief(present, { picks: ['- archetype: data-ml', '- ' + DIM + ': AWS', '- success-metric: weekly active teams'] })
  assert.strictEqual(mark(present, 'menus-done').status, 0, 'test setup requires menus-done to be accepted with a success-metric pick')
  const p = bare(present)
  assert.match(p.stdout, /^success-metric: weekly active teams \(from ## Picks\)$/m, 'a recorded success-metric must be echoed from ## Picks, or DECIDE asks the owner again')
})
