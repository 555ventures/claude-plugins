'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { writeBrief } = require('./tournament.fixtures.js')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md — AC-20261002-01-17 (D13):
// BRIEF's "seed journeys" count is the seed's own journey count and "notes open" is the waiting
// items of the latest round's notes.json; nothing in genesis reads a mock app's approval or notes.

const SCRIPT = 'scripts/genesis-driver.js'

function put(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content) }
function putJson(p, obj) { put(p, JSON.stringify(obj, null, 2) + '\n') }

const SEED = '# Seed — Hearwell\n\n## Journeys\n\n' +
  '### owner-onboarding\nMika (clinic owner) is invited, confirms her roster, and ends at the brief.\n' +
  '1. "I open the invitation" -> owner-intro\n2. "I check who is on my team" -> roster-confirm\n\n' +
  '### team-invite\nBen (front desk) accepts an invite and sees the team.\n' +
  '1. "I open my invite" -> owner-intro\n2. "I see my team" -> roster-confirm\n'

const note = (id, status) => ({
  id, round: 1, screen: 'roster-confirm', anchor: null, pickedText: null, status, text: 'text ' + id, author: 'client',
  thread: [{ by: 'client', text: 'text ' + id, at: '2026-10-02T05:00:00Z' }], at: '2026-10-02T05:00:00Z',
})

// A visual-archetype host past DISCOVERY whose bare run prints the BRIEF step.
function briefHost(statusOver) {
  const dir = tmpdir('brief-counts')
  runNode(SCRIPT, ['--root', dir])
  writeBrief(dir, { picks: ['- archetype: web-app'] })
  const disco = runNode(SCRIPT, ['--root', dir, '--mark', 'discovery-done'])
  assert.strictEqual(disco.status, 0, 'test setup requires discovery-done to be accepted: ' + disco.stderr)
  put(path.join(dir, 'design/mocks/seed.md'), SEED)
  put(path.join(dir, 'design/mocks/ledger.md'),
    '# Provenance ledger — test\n\n## Assumptions\n\n| id | step | kind | claim | tag | status | rejected | dependents | note |\n| - | - | - | - | - | - | - | - | - |\n\n' +
    '## Misunderstandings\n\n| id | what | step | cost | note |\n| - | - | - | - | - |\n')
  putJson(path.join(dir, 'design/mocks/status.json'), {
    schemaVersion: 3, state: 'APPROVED', marks: { seedDone: '2026-10-02T03:00:00.000Z', approved: '2026-10-02T06:00:00.000Z' },
    journeys: {
      'owner-onboarding': { drawn: null, approved: '2026-10-02T04:00:00.000Z', beats: '08363cd98ef8', by: 'terminal' },
      'team-invite': { drawn: null, approved: '2026-10-02T04:05:00.000Z', beats: '2e74ae02ca58', by: 'terminal' },
    },
    pushed: null, reopens: [], lastUpdated: '2026-10-02T06:00:00.000Z', ...statusOver,
  })
  return dir
}

function writeRoundFolder(dir, n, notes) {
  putJson(path.join(dir, 'design/rounds', String(n), 'round.json'), { apiVersion: 1, round: n, kind: 'wireframe', status: 'open', contentHash: '0'.repeat(64), journeys: [], screens: [] })
  putJson(path.join(dir, 'design/rounds', String(n), 'notes.json'), { apiVersion: 1, round: n, cursor: 'c-1', notes, journeys: [] })
}

function countsLine(dir) {
  const r = runNode(SCRIPT, ['--root', dir])
  assert.strictEqual(r.status, 0, 'a bare run at BRIEF must exit 0: ' + r.stderr)
  const m = /seed journeys: \d+ · notes open: \d+/.exec(r.stdout)
  assert.ok(m, 'the BRIEF step must print the "seed journeys: N · notes open: N" line: ' + r.stdout)
  return m[0]
}

test('AC-20261002-01-17: BRIEF counts the seed\'s journeys and only the latest round\'s waiting notes, prints notes open 0 with no rounds, and ignores a retired mock app\'s approval and notes files', () => {
  const dir = briefHost()
  writeRoundFolder(dir, 1, [1, 2, 3, 4, 5].map((i) => note('o' + i, 'open')))
  writeRoundFolder(dir, 2, [note('n1', 'open'), note('n2', 'open'), note('n3', 'answered')])
  assert.strictEqual(countsLine(dir), 'seed journeys: 2 · notes open: 2',
    'the count must be the seed\'s two journeys and the two open notes of round 2 — summing earlier rounds or counting answered notes would tell the brief\'s author a wrong backlog')

  const bare = briefHost()
  assert.strictEqual(countsLine(bare), 'seed journeys: 2 · notes open: 0',
    'with no design/rounds/ the count must still read the seed (2) and report 0 open notes — a count that needs a round hides every host that never pushed one')

  const old = briefHost({ schemaVersion: 2, app: 'app' })
  putJson(path.join(old, 'app/design/approval.json'), { contractVersion: 3, screens: {}, journeys: { a: {}, b: {}, c: {} } })
  putJson(path.join(old, 'app/design/notes.json'), { contractVersion: 3, notes: [1, 2, 3, 4].map((i) => ({ id: 'n' + i, status: 'open' })), journeys: {} })
  assert.strictEqual(countsLine(old), 'seed journeys: 2 · notes open: 0',
    'a host approved under the retired flow must get its seed\'s count and no waiting notes — reading the old approval or notes files would print 3 and 4 and send the brief\'s author to files nothing writes any more')
})
