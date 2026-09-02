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

// AC-20260901-07-9
test('AC-20260901-07-9: escapes.unclassedRows lists exactly the rows with no effective class and no effective reason, and escapes.amendments counts every escape-class row', () => {
  const root = tmpdir('fleet-escape-class-9')
  const rowA = escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/a.md', file: 'a.js', class: null, unclassedReason: null, reviewRunId: 'rv_a', preventedBy: 'doctrine' })
  const rowB = escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/b.md', file: 'b.js', class: null, unclassedReason: 'no-fix-diff' })
  const rowC = escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/c.md', file: 'c.js', class: null, unclassedReason: null })
  const amendC = amendRow({ ts: '2026-09-01T00:00:00Z', spec: 'specs/c.md', file: 'c.js', escapeTs: rowC.ts, class: null, unclassedReason: 'deferred' })
  const rowD = escRow({ ts: '2026-08-04T00:00:00Z', spec: 'specs/d.md', file: 'd.js', class: 'a-b', unclassedReason: null })
  mkRepo(root, 'repo-a', [rowA, rowB, rowC, amendC, rowD])

  const out = runJson(root)
  assert.deepStrictEqual(out.escapes.unclassedRows, [
    { repo: 'repo-a', ts: rowA.ts, spec: rowA.spec, file: rowA.file, reviewRunId: rowA.reviewRunId, preventedBy: rowA.preventedBy },
  ], 'AC-9: unclassedRows must contain EXACTLY row (a) (no class, no reason, no amendment) — row (b) has its own reason, row (c) has a reason via its amendment, row (d) has a class, and none of those three may appear: ' + JSON.stringify(out.escapes.unclassedRows))
  assert.strictEqual(out.escapes.amendments, 1,
    'D4: escapes.amendments must count every stage:"escape-class" row fleet-wide — exactly one exists in this fixture (amendC)')
})

// AC-20260901-07-10
test('AC-20260901-07-10: the drift census counts class-missing only for an unamended unclassed row, amendment-unmatched for an orphan amendment (never stage-unknown), and still counts preventedBy-out-of-enum', () => {
  const root = tmpdir('fleet-escape-class-10')
  const rowUnclassed = escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/u.md', file: 'u.js', class: null, unclassedReason: null })
  const rowAmended = escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/m.md', file: 'm.js', class: null, unclassedReason: null })
  const amendForM = amendRow({ ts: '2026-09-01T00:00:00Z', spec: 'specs/m.md', file: 'm.js', escapeTs: rowAmended.ts, class: 'q-r' })
  const orphanAmendment = amendRow({ ts: '2026-09-02T00:00:00Z', spec: 'specs/nope.md', file: 'nope.js', escapeTs: '2099-01-01T00:00:00Z', class: 'x' })
  const rowBadPreventedBy = escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/pb.md', file: 'pb.js', class: 'a-b', preventedBy: 'test' })
  mkRepo(root, 'repo-a', [rowUnclassed, rowAmended, amendForM, orphanAmendment, rowBadPreventedBy])

  const out = runJson(root)
  const drift = out.driftCensus.byRepo.find(r => r.name === 'repo-a')
  assert.ok(drift, 'repo-a must appear in driftCensus.byRepo')
  assert.strictEqual(drift.drift['class-missing'], 1,
    'D5: only rowUnclassed (no class, no reason, no amendment) is class-missing — rowAmended is validated with {amended:true} once its key is joined, so it must NOT also count here')
  assert.strictEqual(drift.drift['amendment-unmatched'], 1,
    'D5: orphanAmendment\'s key (escapeTs 2099-01-01, specs/nope.md, nope.js) matches no escape row in this repo, so it must land in amendment-unmatched')
  assert.strictEqual(drift.drift['stage-unknown'] || 0, 0,
    'D5: an escape-class row is a known stage — an unmatched amendment must never be miscounted as stage-unknown, which would hide it from the amendment-specific bucket the backfill report reads')
  assert.strictEqual(drift.drift['preventedBy-out-of-enum'], 1,
    'D5: the join must not short-circuit the pre-existing per-field checks — rowBadPreventedBy\'s preventedBy:"test" must still be counted, same as AC-20260820-05-8 already pins for the non-joined case')
})

// AC-20260901-07-16
test('AC-20260901-07-16: the human render prints the unclassed-rows and amendments lines inside query 3, and omits the unclassed line when the count is zero', () => {
  const withUnclassed = tmpdir('fleet-escape-class-16a')
  mkRepo(withUnclassed, 'repo-a', [
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/u1.md', file: 'u1.js', class: null, unclassedReason: null }),
    escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/u2.md', file: 'u2.js', class: null, unclassedReason: null }),
    escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/m.md', file: 'm.js', class: null, unclassedReason: null }),
    amendRow({ ts: '2026-09-01T00:00:00Z', spec: 'specs/m.md', file: 'm.js', escapeTs: '2026-08-03T00:00:00Z', class: 'a-b' }),
  ])
  const bare1 = runNode(SCRIPT, ['--repos-root', withUnclassed])
  assert.strictEqual(bare1.status, 0, bare1.stderr)
  assert.match(bare1.stdout, /^ {2}unclassed rows needing a class: 2 — run \/spec:escape --backfill$/m,
    'D12: with 2 unclassedRows the render must print this exact line (two-space indent, em-dash, the literal remedy command) inside query 3: ' + bare1.stdout)
  assert.match(bare1.stdout, /^ {2}amendments: 1$/m,
    'D12: the amendments line must print the exact count of escape-class rows (1) regardless of the unclassed count: ' + bare1.stdout)

  const noneUnclassed = tmpdir('fleet-escape-class-16b')
  mkRepo(noneUnclassed, 'repo-a', [
    escRow({ ts: '2026-08-01T00:00:00Z', spec: 'specs/c1.md', file: 'c1.js', class: 'a-b', unclassedReason: null }),
    escRow({ ts: '2026-08-02T00:00:00Z', spec: 'specs/c2.md', file: 'c2.js', class: null, unclassedReason: 'no-fix-diff' }),
    escRow({ ts: '2026-08-03T00:00:00Z', spec: 'specs/m2.md', file: 'm2.js', class: null, unclassedReason: null }),
    amendRow({ ts: '2026-09-01T00:00:00Z', spec: 'specs/m2.md', file: 'm2.js', escapeTs: '2026-08-03T00:00:00Z', class: 'c-d' }),
  ])
  const bare2 = runNode(SCRIPT, ['--repos-root', noneUnclassed])
  assert.strictEqual(bare2.status, 0, bare2.stderr)
  assert.ok(!/unclassed rows needing a class/.test(bare2.stdout),
    'D12: "only when N > 0" — with 0 unclassedRows the entire line must be absent, not printed with a count of 0: ' + bare2.stdout)
  assert.match(bare2.stdout, /^ {2}amendments: 1$/m,
    'the amendments line must still print even when the unclassed line is suppressed: ' + bare2.stdout)
})
