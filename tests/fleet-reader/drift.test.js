'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir, runNode } = require('../helpers')

// specs/20260820/05-fleet-evidence-reader.md D10/D11: every parseable row renders verbatim,
// drift is counted in a named bucket alongside it, and nothing is ever coerced to zero or
// silently dropped — the reader must not reproduce the defect specs/20260820/03 fixed once
// already, against itself. D10 is the strongest form of the opacity boundary D14's classifier
// depends on: the reader's own source must never regex the packed strings the parser (brief 16)
// exists to structure.

const SCRIPT = 'scripts/fleet-reader.js'
const SCRIPT_PATH = path.join(ROOT, 'spec/scripts/fleet-reader.js')

function mkRepo(root, name, rows) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  if (rows) fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  return dir
}

// AC-20260820-05-8
test('AC-20260820-05-8: a pre-v7 tier and an out-of-enum preventedBy both land in driftCensus AND still render verbatim in escapes.preventedBy', () => {
  const root = tmpdir('fleet-drift-8')
  mkRepo(root, 'repo-a', [
    { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', tier: 'T3' },
    { ts: '2026-08-02T00:00:00Z', stage: 'escape', spec: 'specs/2.md', file: 'x.js', reviewRunId: null, foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'test', via: 'manual' },
  ])
  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  const drift = out.driftCensus.byRepo.find(x => x.name === 'repo-a')
  assert.ok(drift, 'repo-a must appear in driftCensus.byRepo')
  assert.strictEqual(drift.drift['pre-v7-tier'], 1, 'D14: tier "T3" is outside the current {standard,critical} shape — the classifier\'s per-reason bucket must count it, not silently accept a stale tier as in-shape')
  assert.strictEqual(drift.drift['preventedBy-out-of-enum'], 1, 'D14: preventedBy "test" is outside {doctrine,enforcer,review-check,runtime-leg,none} — must be counted as drift')
  assert.strictEqual(out.escapes.preventedBy.test, 1,
    'D11: an out-of-enum observed value must still render verbatim in the escapes distribution — drift-flagged, never dropped from the count the way specs/20260820/03 fixed once already')
})

// AC-20260820-05-9
test('AC-20260820-05-9: an unparseable line between two valid ledger rows is counted per repo, excluded from queries, and the run still exits 0', () => {
  const root = tmpdir('fleet-drift-9')
  const dir = mkRepo(root, 'repo-a', null)
  fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), [
    JSON.stringify({ ts: '2026-08-01T00:00:00Z', stage: 'plan', spec: 'specs/a.md' }),
    'this line is not valid JSON {{{',
    JSON.stringify({ ts: '2026-08-02T00:00:00Z', stage: 'plan', spec: 'specs/b.md' }),
  ].join('\n') + '\n')

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, 'D12/D11: an unparseable line is data, not a crash — the run must still exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  const pop = out.population.repos.find(x => x.name === 'repo-a')
  assert.ok(pop, 'repo-a must appear in population.repos')
  assert.strictEqual(pop.rows, 2, 'the two valid neighbor lines must still parse normally — the garbage line must not poison them')
  assert.strictEqual(pop.unparseable, 1, 'D11: the unparseable line must be counted in the population block, not silently skipped')
  const drift = out.driftCensus.byRepo.find(x => x.name === 'repo-a')
  assert.ok(drift, 'repo-a must appear in driftCensus.byRepo')
  assert.strictEqual(drift.unparseable, 1, 'D11: the unparseable count must also surface in driftCensus per repo — the two population/census renders must agree, never diverge on the same ledger')
})

// AC-20260820-05-10
test('AC-20260820-05-10: the reader source contains zero occurrences of the token "observed"', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH),
    'spec/scripts/fleet-reader.js does not exist yet — D1 ships the reader as this file; until it lands, this opacity pin can only fail')
  const src = fs.readFileSync(SCRIPT_PATH, 'utf8')
  assert.strictEqual(src.includes('observed'), false,
    'D10: the reader must never regex the packed observed-string blob — structured fields only (leg name + exit, verdict, stage, ts, escape enums, replay outcomes, typed promiseSweep). Any occurrence of the literal token "observed" means the reader reintroduced the parser brief 16 exists to delete')
})
