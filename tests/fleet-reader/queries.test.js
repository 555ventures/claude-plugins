'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260820/05-fleet-evidence-reader.md: the five fixed queries this file pins
// (legRecency, gate08, escapes, replayDebt, cleanContradicted) are what brief 17 exists for —
// the dead-leg smell (at-risk exits 0-only in some repos while red in others), the brief-08
// adoption gate (clause 1: >=5 host CLEANs; clause 2: self-repair share <20%, per
// docs/roadmap/17-fleet-evidence-reader.md), and CLEAN verdicts a later escape contradicts.

const SCRIPT = 'scripts/fleet-reader.js'

function mkRepo(root, name, { config = true, git = 'dir', selfRepair = false, rows = [] } = {}) {
  const dir = path.join(root, name)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  if (config) fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
  if (git === 'dir') fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
  else if (git === 'file') fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../.git/worktrees/' + name + '\n')
  if (selfRepair) {
    fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), '{}')
  }
  if (rows.length) {
    fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

function runJson(root) {
  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

// AC-20260820-05-5 / AC-20260901-07-11 (tagged, no assertion change): specs/20260901/07-escape-
// class-contract.md D4 teaches byClass to count on the effective (amendment-joined) class; this
// test's fixture carries zero escape-class rows, so it is the CONTINUE-TO oracle that the
// unamended path (fold null/missing into "unclassed", recur at 3+) still behaves exactly as
// before once the join exists.
test('AC-20260820-05-5 / AC-20260901-07-11: escapes byClass counts explicit class values and folds null/missing class into unclassed, feeding recurrentUnguarded at 3+ recurrences', () => {
  const root = tmpdir('fleet-escapes')
  const base = { stage: 'escape', file: 'x.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' }
  mkRepo(root, 'repo-a', {
    rows: [
      { ...base, ts: '2026-08-01T00:00:00Z', spec: 'specs/1.md', class: 'silent-fallback' },
      { ...base, ts: '2026-08-02T00:00:00Z', spec: 'specs/2.md', class: 'silent-fallback' },
      { ...base, ts: '2026-08-03T00:00:00Z', spec: 'specs/3.md', class: 'silent-fallback' },
      { ...base, ts: '2026-08-04T00:00:00Z', spec: 'specs/4.md', class: null },
      { ts: '2026-08-05T00:00:00Z', spec: 'specs/5.md', stage: 'escape', file: 'y.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.escapes.total, 5, 'all 5 escape rows must be counted')
  assert.deepStrictEqual(out.escapes.byClass, { 'silent-fallback': 3, unclassed: 2 },
    'D8/D11: class:null and a missing class key must both fold into "unclassed" — neither may be dropped or coerced to a third bucket')
  const entry = out.escapes.recurrentUnguarded.find(e => JSON.stringify(e).includes('silent-fallback'))
  assert.ok(entry, 'D9: recurrent-unguarded = a class with >=3 fleet-wide escape recurrences — silent-fallback recurred exactly 3 times and must appear here, not sit invisible in byClass alone')
  assert.match(JSON.stringify(entry), /3/, 'the recurrentUnguarded entry must carry its recurrence count (3)')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /silent-fallback/, 'Behavior: recurrentUnguarded renders each qualifying class with its count and latest ts in the human render')
})

// Direct fix, no spec: query 5 already carried both halves of the fleet's
// false-CLEAN rate and every reader was dividing them by eye. The division is a render/field
// addition to the FIFTH question, never a tenth question, so D5's fixed question set holds.
test('cleanContradicted carries falseCleanRate per repo and a fleet roll-up, renders it as a percent, and reports n/a — never 0% — for a repo with no CLEAN rows', () => {
  const root = tmpdir('fleet-falseclean')
  mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', runId: 'wf_a1' },
      { ts: '2026-08-02T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'x.js', reviewRunId: 'wf_a1', foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-03T00:00:00Z', stage: 'escape', spec: 'specs/2.md', file: 'y.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  mkRepo(root, 'repo-b', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', runId: 'wf_b1' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN', runId: 'wf_b2' },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN', runId: 'wf_b3' },
      { ts: '2026-08-04T00:00:00Z', stage: 'review', spec: 'specs/4.md', verdict: 'CLEAN', runId: 'wf_b4' },
      { ts: '2026-08-05T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'z.js', reviewRunId: 'wf_b1', foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  mkRepo(root, 'no-cleans-repo', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'ESCALATED', runId: 'wf_c1' },
    ],
  })

  const out = runJson(root)
  const byName = Object.fromEntries(out.cleanContradicted.byRepo.map(r => [r.name, r]))
  assert.strictEqual(byName['repo-a'].falseCleanRate, 1, 'repo-a: 1 contradicted / 1 CLEAN is a rate of 1 — the unjoined escape must stay OUT of the numerator, so the rate is a floor, not an exact figure')
  assert.strictEqual(byName['repo-b'].falseCleanRate, 0.25, 'repo-b: 1 contradicted / 4 CLEANs is 0.25')
  assert.strictEqual(byName['no-cleans-repo'].falseCleanRate, null, 'a repo with no CLEAN rows has NO rate — 0 would read as "never wrong" when the truth is "never measured"')

  assert.deepStrictEqual(
    out.cleanContradicted.fleet,
    { cleans: 5, contradicted: 2, escapesUnjoined: 1, falseCleanRate: 0.4 },
    'the fleet roll-up sums the per-repo counts and divides once — the single number the scoreboard exists to print'
  )

  const human = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(human.status, 0, human.stderr)
  assert.match(human.stdout, /repo-a: cleans=1 contradicted=1 escapesUnjoined=1 falseClean=100\.0%/, 'the per-repo line carries the percent alongside the counts it was already printing')
  assert.match(human.stdout, /repo-b: cleans=4 contradicted=1 escapesUnjoined=0 falseClean=25\.0%/)
  assert.match(human.stdout, /no-cleans-repo: cleans=0 contradicted=0 escapesUnjoined=0 falseClean=n\/a/, 'no denominator renders n/a, never 0%')
  assert.match(human.stdout, /fleet: cleans=5 contradicted=2 escapesUnjoined=1 falseClean=40\.0%/, 'query 5 ends with one fleet line — the number a reader quotes')
  assert.doesNotMatch(human.stdout, /NaN|Infinity/, 'no divide-by-zero artefact ever reaches the render')
})

// core § Incident Policy (materiality): build rows' `incidents` entries (spec-build-driver
// `--mark incident`) join byClass with escape rows — two escapes plus one build incident of
// the same class reaches the guard-earning count. `total` stays escape rows only; `incidents`
// is the build-incident count. Without the join a build-time-only class scores 0 forever
// (host spec 20260905/07 D16).
test('Incident Policy: build-row incidents join escapes.byClass and reach recurrentUnguarded; total stays escape-only', () => {
  const root = tmpdir('fleet-incidents')
  const base = { stage: 'escape', file: 'x.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' }
  mkRepo(root, 'repo-a', {
    rows: [
      { ...base, ts: '2026-08-01T00:00:00Z', spec: 'specs/1.md', class: 'test-isolation' },
      { ts: '2026-08-02T00:00:00Z', stage: 'build', spec: 'specs/2.md', runId: 'bd_000000000001', incidents: [
        { ts: '2026-08-02T01:00:00Z', class: 'test-isolation', exit: 124 },
        { ts: '2026-08-02T02:00:00Z', class: 'cpu-pin', exit: null },
        { ts: '2026-08-02T03:00:00Z', class: null, exit: null },
      ] },
      { ts: '2026-08-03T00:00:00Z', stage: 'build', spec: 'specs/3.md', runId: 'bd_000000000002', incidents: [] },
      { ts: '2026-08-04T00:00:00Z', stage: 'build', spec: 'specs/4.md', runId: 'bd_000000000003' },
    ],
  })
  mkRepo(root, 'repo-b', {
    rows: [
      { ...base, ts: '2026-08-05T00:00:00Z', spec: 'specs/9.md', class: 'test-isolation' },
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.escapes.total, 2, 'total counts escape rows only — build incidents never inflate it')
  assert.strictEqual(out.escapes.incidents, 2, 'incidents counts every classed build-row entry fleet-wide; a null-class entry is not a count')
  assert.strictEqual(out.escapes.byClass['test-isolation'], 3, 'two escapes + one build incident of the same class = 3 on the joined count')
  assert.strictEqual(out.escapes.byClass['cpu-pin'], 1, 'a build-only class appears in byClass at all — the whole point')
  assert.strictEqual(out.escapes.byClass.unclassed, undefined, 'a null-class incident entry is skipped, never folded into unclassed (that bucket is escape rows\' work list)')
  const entry = out.escapes.recurrentUnguarded.find((e) => e.class === 'test-isolation')
  assert.ok(entry, 'the joined third recurrence must surface in recurrentUnguarded')
  assert.strictEqual(entry.count, 3)
  assert.strictEqual(entry.latestTs, '2026-08-05T00:00:00Z', 'latestTs spans escape rows and incident entries')
  assert.ok(out.escapes.registry.some((r) => r.class === 'cpu-pin'), 'the registry (escape.md\'s class vocabulary) lists build-only classes too')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /buildIncidents: 2/, 'the human render names the build-incident count')
  assert.match(bare.stdout, /byClass \(escapes \+ build incidents\)/, 'the human render says byClass is the joined count')
})
