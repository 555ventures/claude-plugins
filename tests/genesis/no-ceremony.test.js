'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { bare, mark, writeFile, writeJSON, statusOf, writeBrief } = require('./tournament.fixtures')

// specs/20261103/02-ceremony-nothing-reads.md — AC-20261103-02-6 (BRIEF reads no ledger, no
// ## Journeys, and gates nothing on ## Non-UI Coverage).

const NON_UI = ['jobs', 'notifications', 'retention', 'integrations', 'admin', 'pricing']

test('AC-20261103-02-6: the BRIEF step on a visual run names no ledger.md and prints seed journeys, and --mark brief-written records design ratified with no ## Journeys and an all-dark ## Non-UI Coverage', () => {
  const dir = tmpdir('no-ceremony-brief')
  bare(dir)
  writeBrief(dir, {
    picks: ['- archetype: web-app'],
    extraSections: '## Non-UI Coverage\n' + NON_UI.map((k) => '- ' + k + ': dark').join('\n'),
  })
  const disco = mark(dir, 'discovery-done')
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted for web-app: ' + disco.stderr)

  writeJSON(path.join(dir, 'design/mocks/status.json'), {
    schemaVersion: 3, state: 'APPROVED', marks: { seedDone: '2026-10-01T00:00:00Z', approved: '2026-10-02T00:00:00Z' },
    journeys: {}, pushed: null, reopens: [], lastUpdated: '2026-10-02T00:00:00Z',
  })
  writeFile(path.join(dir, 'design/mocks/seed.md'),
    '# Seed — test\n\n## Product\n\nA tool.\n\n## Journeys\n\n### owner-onboarding\nMika opens an invite.\n1. "I open the invitation" -> owner-intro\n')
  writeFile(path.join(dir, 'design/mocks/ledger.md'), [
    '# Provenance ledger — test', '', '## Assumptions', '',
    '| id | step | kind | claim | tag | status | rejected | dependents | note |',
    '| - | - | - | - | - | - | - | - | - |',
    '| A1 | SCREENS | product | x | invented | open | - | - | - |',
    '', '## Misunderstandings', '', '| id | what | step | cost | note |', '| - | - | - | - | - |', '',
  ].join('\n'))
  writeFile(path.join(dir, 'design/tokens.css'), ':root { --brand: #123; }\n')

  const step = bare(dir)
  assert.strictEqual(step.status, 0, 'the BRIEF step must print for an approved visual run: ' + step.stderr)
  const readLine = (step.stdout.split('\n').find((l) => l.startsWith('Read only:')) || '')
  assert.ok(readLine.includes('design/mocks/seed.md'), 'the BRIEF step must still name the seed in its Read only line: ' + step.stdout)
  assert.ok(!readLine.includes('ledger.md'), 'the BRIEF step\'s Read only line must not name ledger.md - the retired ledger is still a BRIEF input: ' + readLine)
  assert.match(step.stdout, /seed journeys: 1 · notes open: 0/, 'the BRIEF step must print the seed journey count and open notes: ' + step.stdout)
  assert.doesNotMatch(step.stdout, /derived from/, 'the BRIEF step must print no "derived from" line - the brief is not generated from ledger rows: ' + step.stdout)
  assert.doesNotMatch(step.stdout, /## Journeys/, 'the BRIEF step must not ask for a ## Journeys section - the seed already carries it: ' + step.stdout)

  const m = mark(dir, 'brief-written')
  assert.strictEqual(m.status, 0, '--mark brief-written must accept an approved set with an open ledger row, no ## Journeys and an all-dark ## Non-UI Coverage: ' + m.stderr)
  assert.strictEqual(statusOf(dir).design, 'ratified', 'brief-written must record design: "ratified" for a visual run, or DESIGN_BRIEF never derives')
})
