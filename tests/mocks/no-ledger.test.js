'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261103/02-ceremony-nothing-reads.md — AC-20261103-02-1, AC-20261103-02-2,
// AC-20261103-02-3, AC-20261103-02-4 (the mocks driver keeps no provenance ledger).

function listAll(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...listAll(p)); else out.push(p)
  }
  return out.sort()
}

test('AC-20261103-02-1: a cold root gets seed.md and status.json and no ledger.md, and --mark seed-done ends on the checkpoint line with no 📒 anywhere', () => {
  const root = fx.makeRoot({ seed: false })
  const cold = fx.runDriver(root, [])
  assert.strictEqual(cold.status, 0, 'a cold root must print the SEED step: ' + cold.stderr)
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/seed.md')), 'the cold run must create design/mocks/seed.md, or SEED has nothing to fill')
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/status.json')), 'the cold run must create design/mocks/status.json, or no mark can be checkpointed')
  assert.ok(!fs.existsSync(path.join(root, 'design/mocks/ledger.md')), 'the cold run must not copy a ledger template - a ledger.md on a fresh root means the retired ledger is still seeded')

  const seeded = fx.makeRoot({ seed: false })
  fs.mkdirSync(path.join(seeded, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(seeded, 'design/mocks/seed.md'),
    '# Seed — Hearwell\n\n## Product\n\nA clinic roster tool.\n\n## Journeys\n\n### owner-onboarding\n' +
    'When I open the invitation for the first time, I want to see my roster, so I can confirm it.\n' +
    '1. "I open the invitation" -> owner-intro\n2. "I see nobody is listed yet" -> roster-confirm@empty\n')
  const r = fx.runDriver(seeded, ['--mark', 'seed-done'])
  assert.strictEqual(r.status, 0, '--mark seed-done on a valid job-story seed must exit 0: ' + r.stderr)
  const last = r.stdout.split('\n').filter((l) => l.trim() !== '').pop()
  assert.match(last, /^✅ checkpoint — mocks state saved \(SEED → SCREENS\)/, 'the last non-blank stdout line must be the checkpoint line, or a trailing counts line still follows every accepted mark: ' + r.stdout)
  assert.ok(!r.stdout.includes('📒'), 'no 📒 counts line may appear in stdout - it reports a ledger nothing writes: ' + r.stdout)
})

test('AC-20261103-02-3: an open invented ledger row prints no confirm block on a bare terminal run and journey-approved still exits 0 recording by terminal', () => {
  const root = fx.makeRoot({})
  fx.writeStatus(root)
  fs.writeFileSync(path.join(root, 'design/mocks/ledger.md'),
    '# Provenance ledger\n\n## Assumptions\n\n' +
    '| id | step | kind | claim | tag | status | rejected | dependents | note |\n| - | - | - | - | - | - | - | - | - |\n' +
    '| A1 | SCREENS | product | x | invented | open | - | - | - |\n\n' +
    '## Misunderstandings\n\n| id | what | step | cost | note |\n| - | - | - | - | - |\n')
  const bare = fx.runDriver(root, [])
  assert.strictEqual(bare.status, 0, 'a bare run must still print a step: ' + bare.stderr)
  assert.doesNotMatch(bare.stdout, /confirm these/, 'a leftover ledger row must print no confirm block - the driver still reads the retired ledger: ' + bare.stdout)
  const m = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'owner-onboarding'])
  assert.strictEqual(m.status, 0, 'an open blocking ledger row must not refuse journey-approved - the ledger gate survives: ' + m.stderr)
  assert.strictEqual(fx.readStatus(root).journeys['owner-onboarding'].by, 'terminal', 'the approval must record by: "terminal", or terminal approvals are mis-attributed')
})

test('AC-20261103-02-4: a schemaVersion 2 status.json answers --state SEED, stays byte-identical, and nothing is moved aside', () => {
  const root = fx.makeRoot({})
  const sp = fx.statusPath(root)
  fs.mkdirSync(path.dirname(sp), { recursive: true })
  fs.writeFileSync(sp, '{"schemaVersion":2,"state":"SCREENS","marks":{"seedDone":"2026-09-01T00:00:00Z"}}')
  const before = fs.readFileSync(sp)
  const r = fx.runDriver(root, ['--state'])
  assert.strictEqual(r.status, 0, '--state on a retired-flow file must exit 0: ' + r.stderr)
  assert.match(r.stdout, /\bSEED\b/, 'a retired-flow file derives SEED like any status with no seedDone mark: ' + r.stdout)
  assert.ok(Buffer.compare(fs.readFileSync(sp), before) === 0, '--state must leave status.json byte-identical, or a read-only peek rewrites the owner\'s file')
  assert.ok(!fs.existsSync(path.join(root, 'design/mocks/status.legacy.json')), 'no status.legacy.json may be created - the move-aside branch still exists')
  assert.doesNotMatch(r.stdout + r.stderr, /moved to|\brm\b/, 'no remedy may say "moved to" or name rm - the legacy branch still prints one: ' + r.stdout + r.stderr)
})
