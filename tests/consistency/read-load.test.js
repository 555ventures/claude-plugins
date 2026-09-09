'use strict'
// Read-load budget: what a /spec command actually loads into the session before it acts —
// its own command file plus the doctrine sections `spec-paths shared-for <cmd>` prints.
// Generalizes the three ad-hoc line caps that already exist (design.md ≤160 in
// design-doctrine.test.js, genesis.md ≤120 in genesis-doctrine.test.js) into one budget per
// command, measured through the real binary so the number is the load, not a guess — this
// pins that procedure growth cannot happen silently; a grandfathered ratchet may only shrink.
// AC-20260908-06-1 (specs/20260908/06-command-prose-states-contracts.md D7): the flat
// CAP/RATCHET pair is replaced by per-command BUDGET entries for the eight commands D1/D2/D8
// trimmed — build, review, run, mocks, replay, design, plan, init — measured with this same
// formula; the table may only shrink.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const COMMANDS = path.join(ROOT, 'spec', 'commands')
const SPEC_PATHS = path.join(ROOT, 'spec', 'bin', 'spec-paths')
const PROSE_CAP = path.join(ROOT, 'spec', 'scripts', 'prose-cap.js')

const CAP = 500
// design is 510, not D7's 490: assumption A4 measured it at 500, but HEAD's ratchet already
// carried 510, granted by the recorded review-gate ruling in
// specs/20260907/09-atlas-index-and-note-navigation.md D13 (the added lines are contracts, not
// procedure). A4's own trigger fires — re-measure at build, never raise above the true
// ceiling — so the entry restores that ceiling rather than cutting prose D13 protects and
// spec 06's File Plan never named. Owner: specs/20260908/06-command-prose-states-contracts.md D12.
const BUDGET = { build: 300, review: 340, run: 310, mocks: 325, replay: 450, design: 510, plan: 328, init: 735 }

function lines(text) { return text.split('\n').length }

function readLoad(cmd) {
  const own = lines(fs.readFileSync(path.join(COMMANDS, cmd + '.md'), 'utf8'))
  const shared = lines(execFileSync(SPEC_PATHS, ['shared-for', cmd], { encoding: 'utf8' }))
  return { own, shared, total: own + shared }
}

const commands = fs.readdirSync(COMMANDS).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))

test('every /spec command has a read-load budget entry (a per-command BUDGET or the flat CAP)', () => {
  assert.ok(commands.length >= 10, 'expected the command roster, got ' + commands.length)
  for (const extra of Object.keys(BUDGET)) {
    assert.ok(commands.includes(extra), 'BUDGET names a command that no longer exists: ' + extra)
  }
})

for (const cmd of commands) {
  const limit = BUDGET[cmd] || CAP
  test(`AC-20260908-06-1: read-load budget: /spec:${cmd} loads ≤ ${limit} lines (command file + shared-for sections)`, () => {
    const { own, shared, total } = readLoad(cmd)
    assert.ok(total <= limit,
      `/spec:${cmd} loads ${total} lines (own ${own} + shared ${shared}) > ${limit}. ` +
      'Procedure belongs in a driver script that prints one step; prose states contracts ' +
      '(core § Doctrine Authoring). Shrink the command or move the mechanism into spec/scripts/.')
  })
}

test('shared-for prints only sections for a known command (an unknown command falls open to both files)', () => {
  const known = lines(execFileSync(SPEC_PATHS, ['shared-for', 'status'], { encoding: 'utf8' }))
  const unknown = lines(execFileSync(SPEC_PATHS, ['shared-for', 'no-such-command'], { encoding: 'utf8' }))
  assert.ok(known < unknown, 'the section filter should load less than the fail-open whole-file fallback')
})

// AC-20260908-06-2 (D5): every spec/commands/*.md's `## Rules…` section holds at most 8
// top-level bullets; a file with no Rules heading passes via prose-cap's own exit-2 usage
// error, never a hand-rolled "does this file have Rules" check that could drift from the
// script's real no-heading message.
test('AC-20260908-06-2: every spec/commands/*.md Rules section holds at most 8 bullets (prose-cap --section Rules --cap 8 exits 0, or exits 2 with the no-heading message when the file has no Rules section)', () => {
  const offenders = []
  for (const cmd of commands) {
    const file = path.join(COMMANDS, cmd + '.md')
    const r = spawnSync(process.execPath, [PROSE_CAP, '--file', file, '--section', 'Rules', '--cap', '8'], { encoding: 'utf8' })
    const noRulesSection = r.status === 2 && /no "## " heading containing/.test(r.stderr)
    if (r.status !== 0 && !noRulesSection) offenders.push(cmd + '.md: ' + r.stderr.trim())
  }
  assert.deepStrictEqual(offenders, [],
    'a Rules section over 8 bullets (or a prose-cap failure other than "no Rules section") means the ' +
    'command restates procedure the driver already prints — evict before appending, never move the bullet ' +
    'elsewhere: ' + offenders.join(' | '))
})

// AC-20260908-06-3 (D6) `[pre-green: predicate-in-test]`: the exact `## ` section list
// `spec-paths shared-for <cmd>` prints, parentheticals stripped, for all 17 command keys the
// script scopes plus `run-design`. Green on arrival by design — the spec changes no list;
// a silent addition/removal to spec-paths's own SECTIONS is what this catches.
const SHARED_FOR = {
  plan: ['Host Grounding', 'Pipeline Entry', 'Tiers', 'Decomposition', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'MCP Policy', 'Canonical Docs Loop', 'Session Execution'],
  design: ['Host Grounding', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Worker Git Ban', 'Read-Only Surfaces', 'MCP Policy', 'Session Execution', 'Design Canon', 'Design Authoring Contracts', 'Design Render Gate', 'Design Atlas'],
  atlas: ['Host Grounding', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Session Execution', 'Design Canon', 'Design Atlas'],
  sketch: ['Host Grounding', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Session Execution', 'Design Canon', 'Design Atlas'],
  build: ['Host Grounding', 'Tiers', 'Incident Policy', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'On-Disk Handoff', 'Worker Git Ban', 'Read-Only Surfaces', 'MCP Policy', 'Session Execution'],
  run: ['Host Grounding', 'Tiers', 'Runtime Verification', 'Incident Policy', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'On-Disk Handoff', 'Worker Git Ban', 'Read-Only Surfaces', 'MCP Policy', 'Canonical Docs Loop', 'Session Execution'],
  review: ['Host Grounding', 'Tiers', 'Runtime Verification', 'Incident Policy', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Worker Git Ban', 'Read-Only Surfaces', 'Canonical Docs Loop', 'Session Execution'],
  release: ['Host Grounding', 'Runtime Verification', 'Release Stage', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Canonical Docs Loop', 'Session Execution'],
  enforce: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Model Placement', 'Question Style', 'Console Output Style', 'Session Execution', 'Workflows Encode Shape, Not Judgment'],
  genesis: ['Host Grounding', 'Pipeline Entry', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Worker Git Ban', 'MCP Policy', 'Session Execution', 'Design Canon', 'Design Authoring Contracts', 'Design Atlas', 'Workflows Encode Shape, Not Judgment'],
  mocks: ['Host Grounding', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'MCP Policy', 'Session Execution', 'Design Canon', 'Design Atlas'],
  status: ['Host Grounding', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  queue: ['Host Grounding', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  escape: ['Host Grounding', 'Feedback Loop', 'Incident Policy', 'Question Style', 'Console Output Style', 'Session Execution'],
  doctor: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Tiers', 'Runtime Verification', 'Feedback Loop', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  replay: ['Host Grounding', 'Tiers', 'Feedback Loop', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Session Execution'],
  init: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Pipeline Entry', 'Tiers', 'Runtime Verification', 'Release Stage', 'Model Placement', 'Question Style', 'Console Output Style', 'Canonical Docs Loop', 'Session Execution', 'Design Canon'],
  'run-design': ['Design Canon', 'Design Authoring Contracts', 'Design Render Gate', 'Design Atlas'],
}

test('AC-20260908-06-3: spec-paths shared-for prints exactly the pinned `## ` section list, in order, for every scoped command plus run-design', () => {
  for (const [cmd, expected] of Object.entries(SHARED_FOR)) {
    const out = execFileSync(SPEC_PATHS, ['shared-for', cmd], { encoding: 'utf8' })
    const headings = out.split('\n').filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3).replace(/\s*\([^)]*\)\s*$/, '').trim())
    assert.deepStrictEqual(headings, expected,
      `spec-paths shared-for ${cmd} printed a different doctrine-section list than SHARED_FOR pins — a silent ` +
      'addition or removal changes what every /spec:' + cmd + ' session reads without a deliberate table edit')
  }
})
