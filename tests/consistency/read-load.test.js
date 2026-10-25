'use strict'
// Owner: specs/20261024/04-scripts-drop-their-inline-changelog.md (shared-for section lists stay pinned; prose-size tests retired).
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const SPEC_PATHS = path.join(ROOT, 'spec', 'bin', 'spec-paths')

function lines(text) { return text.split('\n').length }

// The exact `## ` section list `spec-paths shared-for <cmd>` prints, parentheticals stripped,
// for every scoped command; a command without a row falls open to the whole doctrine.
const SHARED_FOR = {
  plan: ['Host Grounding', 'Pipeline Entry', 'Tiers', 'Decomposition', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'MCP Policy', 'Canonical Docs Loop', 'Session Execution'],
  run: ['Host Grounding', 'Tiers', 'Runtime Verification', 'Incident Policy', 'State Machine', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'On-Disk Handoff', 'Worker Git Ban', 'Read-Only Surfaces', 'MCP Policy', 'Canonical Docs Loop', 'Session Execution'],
  release: ['Host Grounding', 'Runtime Verification', 'Release Stage', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Canonical Docs Loop', 'Session Execution'],
  enforce: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Model Placement', 'Question Style', 'Console Output Style', 'Session Execution', 'Workflows Encode Shape, Not Judgment'],
  genesis: ['Host Grounding', 'Pipeline Entry', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'Worker Git Ban', 'MCP Policy', 'Session Execution', 'Design Canon', 'Design Authoring Contracts', 'Workflows Encode Shape, Not Judgment'],
  mocks: ['Host Grounding', 'Model Placement', 'Decisions', 'Question Style', 'Console Output Style', 'MCP Policy', 'Session Execution', 'Design Canon'],
  status: ['Host Grounding', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  queue: ['Host Grounding', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  doctor: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Tiers', 'Runtime Verification', 'Feedback Loop', 'State Machine', 'Question Style', 'Console Output Style', 'Session Execution'],
  connect: ['Host Grounding', 'Question Style', 'Console Output Style', 'Session Execution'],
  init: ['Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Pipeline Entry', 'Tiers', 'Runtime Verification', 'Release Stage', 'Model Placement', 'Question Style', 'Console Output Style', 'Canonical Docs Loop', 'Session Execution', 'Design Canon'],
}

test('shared-for prints only sections for a known command (an unknown command falls open to both files)', () => {
  const known = lines(execFileSync(SPEC_PATHS, ['shared-for', 'status'], { encoding: 'utf8' }))
  const unknown = lines(execFileSync(SPEC_PATHS, ['shared-for', 'no-such-command'], { encoding: 'utf8' }))
  assert.ok(known < unknown, 'the section filter should load less than the fail-open whole-file fallback')
})

test('AC-20260908-06-3 / AC-20261024-04-5: spec-paths shared-for prints exactly the pinned `## ` section list, in order, for every scoped command', () => {
  for (const [cmd, expected] of Object.entries(SHARED_FOR)) {
    const out = execFileSync(SPEC_PATHS, ['shared-for', cmd], { encoding: 'utf8' })
    const headings = out.split('\n').filter((l) => l.startsWith('## '))
      .map((l) => l.slice(3).replace(/\s*\([^)]*\)\s*$/, '').trim())
    assert.deepStrictEqual(headings, expected,
      `spec-paths shared-for ${cmd} printed a different doctrine-section list than SHARED_FOR pins — a silent ` +
      'addition or removal changes what every /spec:' + cmd + ' session reads without a deliberate table edit')
  }
})
