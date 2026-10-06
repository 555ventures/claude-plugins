'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Direct fix (7.241.0): a status.json of the retired mock-app flow is set aside by the driver
// itself, never handed back as an `rm` remedy — a printed deletion in the transcript gets the
// next driver run refused as a continuation of it. The APPROVED legacy file stays readable and
// untouched (specs/20261002/01 D10: genesis still reads it).

function seedRoot(name, status) {
  const root = tmpdir(name)
  fs.mkdirSync(path.join(root, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(root, 'design/mocks/status.json'), JSON.stringify(status, null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'design/mocks/seed.md'), '# seed\n')
  fs.writeFileSync(path.join(root, 'design/mocks/ledger.md'), '| id |\n')
  return root
}

test('a schemaVersion-2 SCREENS status is moved to status.legacy.json, a fresh SEED status is written, and the run continues — no `rm` printed', () => {
  const legacy = { schemaVersion: 2, state: 'SCREENS', marks: { seedDone: '2026-09-01T00:00:00Z' }, journeys: { a: { drawn: '2026-09-01T00:00:00Z' } } }
  const root = seedRoot('legacy-retire', legacy)
  const r = runNode('scripts/mocks-driver.js', ['--root', root, '--state'])
  assert.strictEqual(r.status, 0, 'a legacy status must no longer refuse — the driver retires it itself: ' + r.stderr)
  assert.strictEqual(r.stdout.trim(), 'SEED')
  assert.doesNotMatch(r.stderr + r.stdout, /\brm\b/, 'no rm remedy may reach the transcript')
  assert.match(r.stderr, /schemaVersion 2 .*moved to design\/mocks\/status\.legacy\.json/)
  const aside = JSON.parse(fs.readFileSync(path.join(root, 'design/mocks/status.legacy.json'), 'utf8'))
  assert.deepStrictEqual(aside, legacy, 'the legacy file is moved byte-for-byte, never deleted')
  const fresh = JSON.parse(fs.readFileSync(path.join(root, 'design/mocks/status.json'), 'utf8'))
  assert.strictEqual(fresh.schemaVersion, 3)
  assert.strictEqual(fresh.state, 'SEED')
  assert.strictEqual(fs.readFileSync(path.join(root, 'design/mocks/seed.md'), 'utf8'), '# seed\n', 'seed.md is kept')
  assert.strictEqual(fs.readFileSync(path.join(root, 'design/mocks/ledger.md'), 'utf8'), '| id |\n', 'ledger.md is kept')

  // A second legacy file never clobbers the first one set aside.
  fs.writeFileSync(path.join(root, 'design/mocks/status.json'), JSON.stringify({ schemaVersion: 1, state: 'WIREFRAMES' }) + '\n')
  const r2 = runNode('scripts/mocks-driver.js', ['--root', root, '--state'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.ok(fs.existsSync(path.join(root, 'design/mocks/status.legacy.2.json')), 'the second retirement lands beside the first')
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(root, 'design/mocks/status.legacy.json'), 'utf8')), legacy, 'the first set-aside file is untouched')
})

test('a schemaVersion-2 APPROVED status stays readable, is never moved, and its refusal names no `rm`', () => {
  const legacy = { schemaVersion: 2, state: 'APPROVED', marks: { approved: '2026-09-01T00:00:00Z' } }
  const root = seedRoot('legacy-approved', legacy)
  const before = fs.readFileSync(path.join(root, 'design/mocks/status.json'), 'utf8')
  const state = runNode('scripts/mocks-driver.js', ['--root', root, '--state'])
  assert.strictEqual(state.status, 0, state.stderr)
  assert.strictEqual(state.stdout.trim(), 'APPROVED')
  const bare = runNode('scripts/mocks-driver.js', ['--root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /approved under the retired mock-app flow/)
  const mark = runNode('scripts/mocks-driver.js', ['--root', root, '--mark', 'approved'])
  assert.strictEqual(mark.status, 2, 'a write against the approved legacy file still refuses')
  for (const r of [state, bare, mark]) assert.doesNotMatch(r.stdout + r.stderr, /\brm\b/, 'no rm remedy may reach the transcript: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(path.join(root, 'design/mocks/status.json'), 'utf8'), before, 'the approved legacy file is byte-identical')
  assert.ok(!fs.existsSync(path.join(root, 'design/mocks/status.legacy.json')), 'nothing is set aside for an approved legacy file')
})
