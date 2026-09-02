'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// Fleet evidence reader (specs/20260820/05-fleet-evidence-reader.md, 2026-08-20): the five
// fixed queries this file pins (legRecency, gate08, escapes, replayDebt, cleanContradicted)
// are what brief 17 exists for — the dead-leg smell (at-risk exits 0-only in some repos while
// red in others), the brief-08 adoption gate (clause 1: >=5 host CLEANs; clause 2: self-repair
// share <20%, per docs/roadmap/17-fleet-evidence-reader.md), and CLEAN verdicts a later escape
// contradicts. spec/scripts/fleet-reader.js does not exist yet (TDD red phase) — every runNode
// call below fails until D1 ships it.

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

// AC-20260820-05-3
test('AC-20260820-05-3: legRecency reports totalRuns/runsSinceRed/lastRedTs/neverRed per leg name across review rows, fleet-wide', () => {
  const root = tmpdir('fleet-legrecency')
  mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', legs: [{ leg: 'x', exit: 1 }] },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN', legs: [{ leg: 'x', exit: 0 }] },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN', legs: [{ leg: 'x', exit: 0 }] },
      { ts: '2026-08-04T00:00:00Z', stage: 'review', spec: 'specs/4.md', verdict: 'CLEAN', legs: [{ leg: 'x', exit: 0 }] },
      { ts: '2026-08-05T00:00:00Z', stage: 'review', spec: 'specs/5.md', verdict: 'CLEAN', legs: [{ leg: 'y', exit: 0 }] },
      { ts: '2026-08-06T00:00:00Z', stage: 'review', spec: 'specs/6.md', verdict: 'CLEAN', legs: [{ leg: 'y', exit: 0 }] },
    ],
  })
  const out = runJson(root)
  const byLeg = Object.fromEntries(out.legRecency.fleet.map(l => [l.leg, l]))
  assert.strictEqual(byLeg.x.totalRuns, 4, 'leg x ran in 4 review rows fleet-wide')
  assert.strictEqual(byLeg.x.runsSinceRed, 3, 'D-query1: runsSinceRed counts rows with that leg strictly after the last red row — rows 2,3,4 follow row 1\'s red, so it must be 3, not 4 or 0')
  assert.strictEqual(byLeg.x.neverRed, false, 'leg x went red at row 1 — neverRed must be false')
  assert.strictEqual(byLeg.x.lastRedTs, '2026-08-01T00:00:00Z', 'lastRedTs must be the first row\'s ts, the only exit!=0 among leg x\'s runs')
  assert.strictEqual(byLeg.y.totalRuns, 2, 'leg y ran in 2 review rows fleet-wide')
  assert.strictEqual(byLeg.y.runsSinceRed, 2, 'leg y has never gone red — runsSinceRed must equal totalRuns, not 0, so a never-red leg does not read as "just went red"')
  assert.strictEqual(byLeg.y.neverRed, true, 'leg y exits are 0-only across both its runs')
  assert.strictEqual(byLeg.y.lastRedTs, null, 'a leg that has never gone red must report lastRedTs: null, never a stale or fabricated timestamp')
})

// AC-20260820-05-4
test('AC-20260820-05-4: gate08 derives hostSpecsCleaned, clause1Met, inWindowAuthored, selfRepairAuthored, selfRepairShare, and clause2Met per D6\'s pinned definitions', () => {
  const root = tmpdir('fleet-gate08')
  mkRepo(root, 'self-repair-repo', {
    selfRepair: true,
    rows: [
      { ts: '2026-08-18T00:00:00Z', stage: 'plan', spec: 'specs/s1.md' },
      { ts: '2026-08-18T00:00:00Z', stage: 'build', spec: 'specs/s2.md' },
      { ts: '2026-08-19T00:00:00Z', stage: 'plan', spec: 'specs/s3.md' },
    ],
  })
  mkRepo(root, 'host-repo', {
    rows: [
      { ts: '2026-08-18T00:00:00Z', stage: 'plan', spec: 'specs/h1.md' },
      { ts: '2026-08-18T00:00:00Z', stage: 'plan', spec: 'specs/h2.md' },
      { ts: '2026-08-19T00:00:00Z', stage: 'build', spec: 'specs/h3.md' },
      { ts: '2026-08-19T00:00:00Z', stage: 'build', spec: 'specs/h4.md' },
      { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/c1.md', verdict: 'CLEAN', runId: 'wf_c1' },
      { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/c2.md', verdict: 'CLEAN', runId: 'wf_c2' },
      { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/c3.md', verdict: 'CLEAN', runId: 'wf_c3' },
      { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/c4.md', verdict: 'CLEAN', runId: 'wf_c4' },
      { ts: '2026-08-20T00:00:00Z', stage: 'review', spec: 'specs/c5.md', verdict: 'CLEAN', runId: 'wf_c5' },
    ],
  })
  const out = runJson(root)
  assert.strictEqual(out.gate08.cutover, '2026-08-17', 'D6: the cutover is the pinned v7.0.0 ship-date literal, never re-derived')
  assert.strictEqual(out.gate08.hostSpecsCleaned, 5, 'D6: 5 distinct CLEAN specs post-cutover in the non-self-repair repo')
  assert.strictEqual(out.gate08.clause1Met, true, 'clause 1 (>=5 host CLEANs, docs/roadmap/17) is met at exactly 5')
  assert.strictEqual(out.gate08.inWindowAuthored, 7, 'D6: in-window authored = distinct specs with a plan|build row ts>=cutover, summed across both repos (3 self-repair + 4 host)')
  assert.strictEqual(out.gate08.selfRepairAuthored, 3, 'the self-repair repo authored 3 distinct in-window specs')
  assert.strictEqual(out.gate08.selfRepairShare, 0.4286, 'D6/Contracts: selfRepairShare is 3/7 rounded to 4 decimal places, round-half-up (0.428571... -> 0.4286)')
  assert.strictEqual(out.gate08.clause2Met, false, 'clause 2 (self-repair share <20%, docs/roadmap/17) fails at ~42.86% — a self-repair-dominated fleet must not read as adoption')

  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /43%/, 'Contracts: the human render shows an integer percent, round-half-up — 42.857...% must display as 43%, not 42%')
})

// AC-20260820-05-5
test('AC-20260820-05-5: escapes byClass counts explicit class values and folds null/missing class into unclassed, feeding recurrentUnguarded at 3+ recurrences', () => {
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

// AC-20260820-05-6
test('AC-20260820-05-6: replayDebt counts review rows after the latest replay row per repo, and marks a repo with no replay rows neverReplayed', () => {
  const root = tmpdir('fleet-replaydebt')
  mkRepo(root, 'replayed-repo', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN' },
      { ts: '2026-08-02T12:00:00Z', stage: 'replay', spec: 'specs/2.md' },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN' },
      { ts: '2026-08-04T00:00:00Z', stage: 'review', spec: 'specs/4.md', verdict: 'CLEAN' },
      { ts: '2026-08-05T00:00:00Z', stage: 'review', spec: 'specs/5.md', verdict: 'CLEAN' },
    ],
  })
  mkRepo(root, 'never-replayed-repo', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN' },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN' },
    ],
  })
  const out = runJson(root)
  const byName = Object.fromEntries(out.replayDebt.byRepo.map(r => [r.name, r]))
  assert.strictEqual(byName['replayed-repo'].replays, 1, 'exactly one replay row landed in replayed-repo')
  assert.strictEqual(byName['replayed-repo'].reviewsSinceLastReplay, 3, 'the replay ts falls after the 2nd review — only reviews 3,4,5 come after it')
  assert.strictEqual(byName['replayed-repo'].neverReplayed, false)
  assert.strictEqual(byName['never-replayed-repo'].replays, 0, 'never-replayed-repo has no replay rows at all')
  assert.strictEqual(byName['never-replayed-repo'].reviewsSinceLastReplay, 3, 'with no replay rows, reviewsSinceLastReplay must equal the total review count, not 0')
  assert.strictEqual(byName['never-replayed-repo'].neverReplayed, true)
})

// AC-20260820-05-7
test('AC-20260820-05-7: cleanContradicted joins an escape\'s reviewRunId to a CLEAN review row\'s runId, and counts a null-reviewRunId escape as unjoined, never folded into either side', () => {
  const root = tmpdir('fleet-cleancontra')
  mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', runId: 'wf_clean1' },
      { ts: '2026-08-02T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'x.js', reviewRunId: 'wf_clean1', foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-03T00:00:00Z', stage: 'escape', spec: 'specs/2.md', file: 'y.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  const out = runJson(root)
  const entry = out.cleanContradicted.byRepo.find(r => r.name === 'repo-a')
  assert.ok(entry, 'repo-a must appear in cleanContradicted.byRepo')
  assert.strictEqual(entry.cleans, 1, 'exactly one CLEAN review row exists in repo-a')
  assert.strictEqual(entry.contradicted, 1, 'the escape whose reviewRunId matches the CLEAN row\'s runId is a contradiction — a CLEAN verdict a later escape disproves')
  assert.strictEqual(entry.escapesUnjoined, 1, 'the escape with reviewRunId:null must count as unjoined — it must NEVER be folded into contradicted (a false miscalibration signal) or silently dropped (a lost escape)')
})

// specs/20260901/03-unified-build-loop.md D9 (2026-09-01, brief 18): the seventh fixed query,
// cleanByVia, buckets CLEAN review rows by their via field (loop/direct/unknown for rows
// carrying no via at all — pre-sibling-02 rows) and joins escape.reviewRunId to a bucket's CLEAN
// runIds using the EXACT reviewRunId<->runId join computeCleanContradicted (query 5) already
// uses, per bucket. This is the reader's answer to the brief 18 kill condition: a loop rate
// higher than direct's over 30 fleet reviews reverts the loop. Written before fleet-reader.js
// gains cleanByVia (TDD red, 2026-09-01) — both tests below fail on a missing cleanByVia key /
// missing render line until D9 ships.
test('AC-20260901-03-6: cleanByVia buckets CLEAN review rows by via (loop/direct/unknown) and joins escape reviewRunId to each bucket\'s CLEAN runIds using cleanContradicted\'s own join', () => {
  const root = tmpdir('fleet-cleanbyvia')
  mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', runId: 'rv_a', via: 'loop' },
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN', runId: 'rv_b', via: 'loop' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN', runId: 'rv_c', via: 'direct' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/4.md', verdict: 'CLEAN', runId: 'rv_d', via: 'direct' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/5.md', verdict: 'CLEAN', runId: 'rv_e', via: 'direct' },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/6.md', verdict: 'CLEAN', runId: 'rv_f' },
      { ts: '2026-08-04T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'x.js', reviewRunId: 'rv_a', foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-05T00:00:00Z', stage: 'escape', spec: 'specs/6.md', file: 'y.js', reviewRunId: 'rv_f', foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-06T00:00:00Z', stage: 'escape', spec: 'specs/9.md', file: 'z.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  const out = runJson(root)
  assert.deepStrictEqual(out.cleanByVia.total, {
    loop: { cleans: 2, contradicted: 1 },
    direct: { cleans: 3, contradicted: 0 },
    unknown: { cleans: 1, contradicted: 1 },
  }, 'AC-20260901-03-6/D9: cleanByVia.total must bucket the 6 CLEAN rows loop=2/direct=3/unknown=1 by their via field (a missing via folds into unknown, never direct) and join the reviewRunId-matching escapes into the SAME bucket as the CLEAN row they contradict, leaving the null-reviewRunId escape joined to nothing: ' + JSON.stringify(out.cleanByVia))
  const repoEntry = out.cleanByVia.byRepo.find(r => r.name === 'repo-a')
  assert.ok(repoEntry, 'AC-20260901-03-6: repo-a must appear in cleanByVia.byRepo — a fleet-only total with no per-repo breakdown would hide which host is driving the kill condition')
  assert.deepStrictEqual({ loop: repoEntry.loop, direct: repoEntry.direct, unknown: repoEntry.unknown }, {
    loop: { cleans: 2, contradicted: 1 },
    direct: { cleans: 3, contradicted: 0 },
    unknown: { cleans: 1, contradicted: 1 },
  }, 'AC-20260901-03-6/D9: the byRepo entry for the only repo in this fixture must carry the exact same numbers as the fleet total: ' + JSON.stringify(repoEntry))
})

test('AC-20260901-03-7: the human render prints the exact line "escapes-per-CLEAN by via: loop 1/2 · direct 0/3 · unknown 1/1" over AC-20260901-03-6\'s fixture', () => {
  const root = tmpdir('fleet-cleanbyvia-render')
  mkRepo(root, 'repo-a', {
    rows: [
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/1.md', verdict: 'CLEAN', runId: 'rv_a', via: 'loop' },
      { ts: '2026-08-01T00:00:00Z', stage: 'review', spec: 'specs/2.md', verdict: 'CLEAN', runId: 'rv_b', via: 'loop' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/3.md', verdict: 'CLEAN', runId: 'rv_c', via: 'direct' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/4.md', verdict: 'CLEAN', runId: 'rv_d', via: 'direct' },
      { ts: '2026-08-02T00:00:00Z', stage: 'review', spec: 'specs/5.md', verdict: 'CLEAN', runId: 'rv_e', via: 'direct' },
      { ts: '2026-08-03T00:00:00Z', stage: 'review', spec: 'specs/6.md', verdict: 'CLEAN', runId: 'rv_f' },
      { ts: '2026-08-04T00:00:00Z', stage: 'escape', spec: 'specs/1.md', file: 'x.js', reviewRunId: 'rv_a', foundBy: 'user', severity: 'hard', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-05T00:00:00Z', stage: 'escape', spec: 'specs/6.md', file: 'y.js', reviewRunId: 'rv_f', foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
      { ts: '2026-08-06T00:00:00Z', stage: 'escape', spec: 'specs/9.md', file: 'z.js', reviewRunId: null, foundBy: 'user', severity: 'soft', killedMatch: null, preventedBy: 'none', via: 'manual' },
    ],
  })
  const bare = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /escapes-per-CLEAN by via: loop 1\/2 · direct 0\/3 · unknown 1\/1/,
    'AC-20260901-03-7/D9: the human render must print this exact line, middle-dot separators included — this is the literal Contracts render the brief 18 kill condition is read off of: ' + bare.stdout)
})
