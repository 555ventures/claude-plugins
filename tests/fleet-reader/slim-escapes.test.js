'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode } = require('../helpers')

// specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D1-D4: the fleet reader
// answers over the slim escape row only — six keys under `escapes`, no owed query, no
// amendment join, and the row module exports exactly four names.

const SCRIPT = 'scripts/fleet-reader.js'
const ESCAPE_ROW_LIB = path.join(SPEC, 'scripts/lib/escape-row.js')

function mkRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

function slim(overrides = {}) {
  return {
    ts: '2026-10-25T00:00:00Z', stage: 'escape', spec: 'specs/a.md', files: ['a.js'],
    reviewRunId: null, class: null, sha: null, via: 'commit', ...overrides,
  }
}

function runJson(root) {
  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

test('AC-20261025-02-13: --json carries exactly six escapes keys and no owed key, and --owed is an unknown flag that exits 2 naming it', () => {
  const root = tmpdir('fleet-slim-keys')
  mkRepo(root, 'repo-a', [slim({ class: 'silent-fallback' })])
  const out = runJson(root)
  assert.deepStrictEqual(Object.keys(out.escapes).sort(),
    ['byClass', 'byRepo', 'incidents', 'recurrentUnguarded', 'registry', 'total'],
    'the escapes block still summarises fields the slim row no longer has (killedMatchNull, preventedBy, amendments, unclassedRows) — readers would trust counts no writer produces')
  assert.strictEqual('owed' in out, false,
    'an owed key means query 9 still runs over a preventedBy population no writer fills — it would return the same empty answer forever')

  const r = runNode(SCRIPT, ['--repos-root', root, '--owed'])
  assert.strictEqual(r.status, 2, '--owed must be an unknown flag (exit 2), else the deleted query keeps a live entry point: ' + r.stdout)
  assert.match(r.stderr, /--owed/, 'the usage error must name the rejected flag so the caller sees what to drop: ' + r.stderr)
})

test('AC-20261025-02-3: the drift census keeps a legacy escape row, a slim row and an escape-class row in shape, and reports class-malformed alone for a bad class', () => {
  const root = tmpdir('fleet-slim-census')
  mkRepo(root, 'legacy', [
    { ts: '2026-08-01T00:00:00Z', stage: 'escape', spec: 'specs/a.md', file: 'x.js', reviewRunId: null,
      foundBy: 'user', severity: 'soft', killedMatch: 'maybe', preventedBy: 'test', unclassedReason: 'no-fix-diff', class: null, via: 'manual' },
    slim({ ts: '2026-10-25T00:00:00Z' }),
    { ts: '2026-08-20T00:00:00Z', stage: 'escape-class', spec: 'specs/a.md', escapeTs: '2026-08-01T00:00:00Z', file: 'x.js', class: 'silent-fallback' },
  ])
  mkRepo(root, 'bad', [slim({ class: 'Bad Class' })])
  const census = runJson(root).driftCensus.byRepo
  const legacy = census.find(r => r.name === 'legacy')
  assert.strictEqual(legacy.inShape, 3,
    'all three legacy-family rows must be in shape — a drift report on rows the ledger keeps forever is noise that hides real drift: ' + JSON.stringify(legacy))
  assert.deepStrictEqual(legacy.drift, {}, 'no drift bucket may fire for legacy fields the slim validator ignores: ' + JSON.stringify(legacy))
  const bad = census.find(r => r.name === 'bad')
  assert.strictEqual(bad.drift['class-malformed'], 1, 'a malformed class on a slim row must still be reported: ' + JSON.stringify(bad))
  const buckets = JSON.stringify(census)
  assert.doesNotMatch(buckets, /amendment-unmatched|class-missing/,
    'amendment-unmatched and class-missing belong to the deleted amendment join — their presence means the old validator still judges rows: ' + buckets)
})

test('AC-20261025-02-4: the human query-3 block prints exactly the head, byClass, buildIncidents and recurrentUnguarded lines', () => {
  const root = tmpdir('fleet-slim-render')
  mkRepo(root, 'repo-a', [
    slim({ ts: '2026-10-01T00:00:00Z', spec: 'specs/1.md', class: 'silent-fallback' }),
    slim({ ts: '2026-10-02T00:00:00Z', spec: 'specs/2.md', class: null }),
    { ts: '2026-10-03T00:00:00Z', stage: 'build', spec: 'specs/3.md', runId: 'bd_000000000001',
      incidents: [{ ts: '2026-10-03T01:00:00Z', class: 'silent-fallback', exit: null }] },
  ])
  const r = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(r.status, 0, r.stderr)
  const start = r.stdout.indexOf('3. Escapes')
  assert.ok(start >= 0, 'the render must still carry query 3: ' + r.stdout)
  const rest = r.stdout.slice(start).split('\n')
  const end = rest.findIndex((l, i) => i > 0 && /^\S/.test(l))
  const block = rest.slice(0, end === -1 ? rest.length : end).filter(l => l.trim() !== '')
  assert.deepStrictEqual(block, [
    '3. Escapes — 2 total',
    '  byClass (escapes + build incidents): silent-fallback=2, unclassed=1',
    '  buildIncidents: 1',
    '  recurrentUnguarded: none',
  ], 'the block prints counters for fields the row no longer has, or a nudge toward a retired command: ' + block.join(' | '))
})

test('AC-20261025-02-6: lib/escape-row.js exports exactly CLASS_ID_RE, VIA, escapeFiles and validateEscapeRow', () => {
  assert.deepStrictEqual(Object.keys(require(ESCAPE_ROW_LIB)).sort(),
    ['CLASS_ID_RE', 'VIA', 'escapeFiles', 'validateEscapeRow'],
    'an extra export (amendment helpers, legacy enums) keeps a retired shape importable and invites the next reader to depend on it')
})
