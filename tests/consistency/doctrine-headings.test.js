'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { ROOT, read } = require('../helpers')
// AC-20261008-01-4 (specs/20261008/01-doctrine-states-contracts-and-points-at-its-enforcers.md D4): the `## `
// heading list of each of the six doctrine files is frozen, byte for byte and in order.

const HEADINGS = {
  'spec/doctrine/core.md': [
    'Host Grounding', 'Grounding Drift', 'Rule Enforcement', 'Pipeline Entry', 'Tiers',
    'Runtime Verification', 'Release Stage', 'Feedback Loop', 'Incident Policy', 'Decomposition',
    'State Machine', 'Model Placement', 'Decisions', 'Question Style (every `AskUserQuestion`, every stage)',
    'Console Output Style (progress narration and end-of-run reports)', 'On-Disk Handoff',
    'Worker Git Ban', 'Read-Only Surfaces', 'MCP Policy', 'Canonical Docs Loop', 'Session Execution',
    'Doctrine Authoring',
  ],
  'spec/doctrine/genesis.md': [
    'Genesis: Discovery Interview (the intake posture)', 'Genesis: Brief State',
    'Genesis: Tournament of Scaffolds', 'Genesis: Decision Record (one proposer)',
    'Genesis: Ops Conventions ADR', 'Genesis: Hard-to-Reverse Dimensions (always escalate via AskUserQuestion)',
    'Genesis: Archetype Registry (the master variable)', 'Genesis: Fresh UX Research (method fixed, content researched)',
    'Genesis: Executed Assumptions (dependency-adjudicated claims never lock by argument)',
    'Genesis: Enforcement Handoff to the spec pipeline', 'Genesis: Day-Zero Skeleton',
    'Genesis: Conventions Probe Suite', 'Genesis: State Machine', 'Genesis: Design Stage',
    'Genesis: Roadmap Decomposition', 'Genesis: On-disk Handoff (the genesis artifacts)',
  ],
  'spec/doctrine/mocks.md': [
    'Provenance Ledger', 'Mocks: State Machine', 'Mocks: Seed', 'Mocks: Checkpoint contract',
    'Mocks: Authoring Rules', 'Mocks: Rounds and Notes', 'Mocks: Confirmation',
    'Product-Stage Exemption (question-style-gate.js)',
  ],
  'spec/doctrine/design.md': [
    'Design Canon (the wireframe is gray screen files the service renders)',
    'Design Authoring Contracts', 'Workflows Encode Shape, Not Judgment',
  ],
  'spec/doctrine/stages/stage-build.md': [
    'Input', 'Build stage — the build driver owns this part of the state machine', 'Prototype specs',
    'Worker Contract — every dispatch this session makes', '`blocked` returns', 'Report', 'Rules',
  ],
  'spec/doctrine/stages/stage-review.md': [
    'Input', 'Protocol — the driver owns the state machine', 'Rules — the judgments this session holds',
  ],
}

for (const [rel, expected] of Object.entries(HEADINGS)) {
  test(`AC-20261008-01-4: ${rel} carries exactly its frozen \`## \` heading list, in order`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' is missing — every heading-sliced reader (shared-for, --section, § citations) serves nothing')
    const got = read(rel).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3))
    assert.deepStrictEqual(got, expected,
      rel + ' headings changed — shared-for, --section and the drivers\' "Doctrine: § <heading>" pointers slice by heading, ' +
      'so a renamed, added, removed or re-ordered heading silently serves nothing')
  })
}
