'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Escape class contract (specs/20260901/07-escape-class-contract.md, brief 19): D4/
// D5/D12 teach fleet-reader.js to join `stage:"escape-class"` amendment rows onto the escape
// rows they repair (latest amendment per escapeTs+spec+file key wins) before counting classes,
// list rows still needing a class as `escapes.unclassedRows`, route both stages through the D1
// validator for the drift census, and render two new lines in query 3's human output. None of
// this exists on the current tree — fleet-reader.js has no escape-class join, no unclassedRows
// key, and no amendments key — so every assertion below fails today (TDD red phase), not on a
// stub that merely exits non-zero.

const SCRIPT = 'scripts/fleet-reader.js'

function mkRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  if (rows) fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

function escRow(overrides = {}) {
  return {
    stage: 'escape', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null,
    unclassedReason: null, preventedBy: 'none', via: 'manual', ...overrides,
  }
}

function amendRow(overrides = {}) {
  return { stage: 'escape-class', unclassedReason: null, via: 'manual', ...overrides }
}

function runJson(root) {
  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

// AC-20260901-07-8
test('AC-20260901-07-8: byClass counts on the effective (latest-amendment-wins) class and recurrentUnguarded sees native + amended rows of the same class together', () => {
  const root = tmpdir('fleet-escape-class-8')
  mkRepo(root, 'repo-a', [
    // Part 1: a null-class row amended once to silent-fallback must count under silent-fallback, not unclassed.
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/p1.md', file: 'p1.js', class: null }),
    amendRow({ ts: '2026-09-01T00:00:00Z', spec: 'specs/p1.md', file: 'p1.js', escapeTs: '2026-08-01T00:00:00Z', class: 'silent-fallback' }),
    // Part 2: two amendments on the same key — later ts (c-d) wins over the earlier one (a-b).
    escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/p2.md', file: 'p2.js', class: null }),
    amendRow({ ts: '2026-09-02T00:00:00Z', spec: 'specs/p2.md', file: 'p2.js', escapeTs: '2026-08-02T00:00:00Z', class: 'a-b' }),
    amendRow({ ts: '2026-09-03T00:00:00Z', spec: 'specs/p2.md', file: 'p2.js', escapeTs: '2026-08-02T00:00:00Z', class: 'c-d' }),
    // Part 3: one native x-y escape plus two rows amended to x-y must recur 3 times.
    escRow({ ts: '2026-08-10T00:00:00Z', spec: 'specs/p3a.md', file: 'p3a.js', class: 'x-y' }),
    escRow({ ts: '2026-08-11T00:00:00Z', spec: 'specs/p3b.md', file: 'p3b.js', class: null }),
    amendRow({ ts: '2026-09-04T00:00:00Z', spec: 'specs/p3b.md', file: 'p3b.js', escapeTs: '2026-08-11T00:00:00Z', class: 'x-y' }),
    escRow({ ts: '2026-08-12T00:00:00Z', spec: 'specs/p3c.md', file: 'p3c.js', class: null }),
    amendRow({ ts: '2026-09-05T00:00:00Z', spec: 'specs/p3c.md', file: 'p3c.js', escapeTs: '2026-08-12T00:00:00Z', class: 'x-y' }),
  ])
  const out = runJson(root)
  assert.strictEqual(out.escapes.byClass['silent-fallback'], 1,
    'D4: the row amended from null to silent-fallback must count under byClass["silent-fallback"], not under "unclassed" — the effective class is the amendment\'s, not the row\'s own null')
  assert.strictEqual(out.escapes.byClass['c-d'], 1,
    'D4: joinAmendments latest-wins by ts — the 2026-09-03 amendment (c-d) must be the effective class, not the earlier 2026-09-02 one')
  assert.strictEqual(out.escapes.byClass['a-b'] || 0, 0,
    'D4: the superseded earlier amendment (a-b) must contribute zero to byClass — only the latest amendment per key counts')
  assert.strictEqual(out.escapes.byClass['x-y'], 3,
    'D4: one native x-y row plus two rows amended to x-y must all count under the same effective class')
  const entry = out.escapes.recurrentUnguarded.find(e => e.class === 'x-y')
  assert.ok(entry, 'D9/D4: x-y recurred 3 times fleet-wide (on the joined count) and must appear in recurrentUnguarded, not sit invisible in byClass alone')
  assert.strictEqual(entry.count, 3, 'the recurrentUnguarded entry must carry the joined recurrence count (3), not the native-only count (1)')
})

