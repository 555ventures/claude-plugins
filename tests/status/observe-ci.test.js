'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260807/01-observation-red-alarm.md (2026-08-07): D3 rewrites observe-ci.js from a
// per-spec pending-or-red candidate loop into one branch-level check per run — the certification
// half (spec 03) is retired, only the red alarm survives. Genuinely new behavior pinned here:
// multi-done-spec red attribution picks exactly ONE spec (latest close commit, lex-last path on
// a timestamp tie — AC-3), an unimplicated red run is a total no-op (AC-4), a red run on an
// already-red spec never re-attributes to a later-closing spec (sticky, AC-12), and unavailable/
// transient/in-progress outcomes are now silent — no more ci:"none" writes, no more per-run ⚠️
// nag (AC-6). AC-8/AC-9 pin unchanged worktree-refusal and idempotency invariants (retagged from
// specs/20260805/03's AC-9/AC-10) — sanctioned pin exceptions, green pre-change, per this repo's
// AC-20260805-01-7/AC-20260805-03-7 precedent: the behavior they pin is explicitly unchanged by
// this spec, only relocated/retagged.

const SCRIPT = 'scripts/observe-ci.js'
const LEDGER = '.claude/spec-runs.jsonl'

function writeSpecFile(dir, rel, frontmatter) {
  const p = path.join(dir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '---\n' + frontmatter + '\n---\n\n# spec\n')
}

// One done spec, closed at `closeSha`; `extraCommit` adds a descendant commit on top so the
// green/red ancestry fixtures have somewhere valid to point.
function buildHost({ specRel = 'specs/20260701/01-x.md', extraCommit = true } = {}) {
  const dir = tmpdir('observe-ci')
  const g = gitRepo(dir)
  const initSha = g('rev-parse', 'HEAD').trim()
  writeSpecFile(dir, specRel, 'date: 2026-07-01\nstatus: done\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'close ' + specRel)
  const closeSha = g('rev-parse', 'HEAD').trim()
  let descendantSha = closeSha
  if (extraCommit) {
    fs.writeFileSync(path.join(dir, 'later.txt'), 'x\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'later commit')
    descendantSha = g('rev-parse', 'HEAD').trim()
  }
  return { dir, g, initSha, closeSha, descendantSha, specRel }
}

// Commit with an explicit author/committer date, for deterministic close-commit-timestamp
// ordering (AC-3's later-closing-spec pick and its tie-break both depend on real commit times).
function commitAt(dir, msg, isoDate) {
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate }),
  })
}

// Two done specs closed at the given ISO dates, then one further commit descending from both —
// the AC-3 attribution-among-multiple-done-specs fixture. Paths match the spec's own worked
// example verbatim (specs/20260807/02-b.md over specs/20260805/03-a.md).
function buildTwoDoneSpecsHost(dates) {
  const dir = tmpdir('observe-ci-attr')
  const g = gitRepo(dir)
  const specs = [
    { rel: 'specs/20260805/03-a.md', date: dates[0] },
    { rel: 'specs/20260807/02-b.md', date: dates[1] },
  ]
  for (const s of specs) {
    writeSpecFile(dir, s.rel, 'date: 2026-08-01\nstatus: done\n')
    g('add', '-A')
    commitAt(dir, 'close ' + s.rel, s.date)
  }
  fs.writeFileSync(path.join(dir, 'later.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'later')
  const runSha = g('rev-parse', 'HEAD').trim()
  return { dir, runSha, specA: specs[0].rel, specB: specs[1].rel }
}

// One done spec, then a "red run" commit, then a further "green run" commit descending from
// both — the AC-5 clearing fixture: a red observation followed by a green run that either does
// or does not contain the close commit.
function buildHostTwoRuns() {
  const dir = tmpdir('observe-ci-clear')
  const g = gitRepo(dir)
  const initSha = g('rev-parse', 'HEAD').trim()
  const specRel = 'specs/20260701/01-x.md'
  writeSpecFile(dir, specRel, 'date: 2026-07-01\nstatus: done\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'close ' + specRel)
  const closeSha = g('rev-parse', 'HEAD').trim()
  fs.writeFileSync(path.join(dir, 'red.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'red run commit')
  const redSha = g('rev-parse', 'HEAD').trim()
  fs.writeFileSync(path.join(dir, 'green.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'green run commit')
  const greenSha = g('rev-parse', 'HEAD').trim()
  return { dir, initSha, closeSha, redSha, greenSha, specRel }
}

// Spec A closes, then run1 lands (implicating only A); spec B closes, then run2 lands
// (implicating both A and B) — the AC-12 sticky-attribution fixture.
function buildStickyHost() {
  const dir = tmpdir('observe-ci-sticky')
  const g = gitRepo(dir)
  const specA = 'specs/20260805/01-a.md'
  const specB = 'specs/20260807/02-b.md'
  writeSpecFile(dir, specA, 'date: 2026-08-05\nstatus: done\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'close a')
  fs.writeFileSync(path.join(dir, 'run1.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'run1 commit')
  const run1Sha = g('rev-parse', 'HEAD').trim()
  writeSpecFile(dir, specB, 'date: 2026-08-07\nstatus: done\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'close b')
  fs.writeFileSync(path.join(dir, 'run2.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'run2 commit')
  const run2Sha = g('rev-parse', 'HEAD').trim()
  return { dir, run1Sha, run2Sha, specA, specB }
}

function buildTwoSpecHost() {
  const dir = tmpdir('observe-ci-two')
  const g = gitRepo(dir)
  for (const rel of ['specs/20260701/01-a.md', 'specs/20260701/02-b.md']) {
    writeSpecFile(dir, rel, 'date: 2026-07-01\nstatus: done\n')
    g('add', '-A')
    g('commit', '-q', '-m', 'close ' + rel)
  }
  fs.writeFileSync(path.join(dir, 'later.txt'), 'x\n')
  g('add', '-A')
  g('commit', '-q', '-m', 'later')
  const latestSha = g('rev-parse', 'HEAD').trim()
  return { dir, latestSha }
}

// A fake `gh` on PATH ahead of the real one — the sanctioned test seam (Behavior): zero network
// in the suite.
function fakeGh({ json = '[]', exit = 0, stderr = '' } = {}) {
  const bin = tmpdir('observe-ci-ghbin')
  const lines = ['#!/usr/bin/env bash']
  if (stderr) lines.push(`echo '${stderr}' >&2`)
  lines.push('cat <<\'GHJSON\'', json, 'GHJSON')
  lines.push(`exit ${exit}`)
  fs.writeFileSync(path.join(bin, 'gh'), lines.join('\n') + '\n')
  fs.chmodSync(path.join(bin, 'gh'), 0o755)
  return bin
}

function envWithGh(binDir) {
  return Object.assign({}, process.env, { PATH: binDir + path.delimiter + process.env.PATH })
}

function readLedger(dir) {
  const p = path.join(dir, LEDGER)
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

function runObserve(dir, argv, opts = {}) {
  return runNode(SCRIPT, ['--root', dir, ...argv], opts)
}

function ghRun({ status = 'completed', conclusion = 'success', headSha, url = 'https://github.com/x/y/actions/runs/1', updatedAt = '2026-08-06T00:00:00Z' }) {
  return JSON.stringify([{ status, conclusion, headSha, url, updatedAt }])
}

test('AC-20260807-01-3: a completed red run whose sha contains the close commits of two done specs appends exactly one red row, for the later-closing spec', () => {
  const { dir, runSha, specA, specB } = buildTwoDoneSpecsHost(['2026-08-05T10:00:00+00:00', '2026-08-07T10:00:00+00:00'])
  const bin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: runSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const rows = readLedger(dir).filter((x) => x.stage === 'observe')
  assert.strictEqual(rows.length, 1,
    'a red run implicating two done specs must attribute one alarm total — one row per contained close would recreate the escape-entry noise wall D3 retires: ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].spec, specB, 'the spec with the LATEST close-commit timestamp must receive the red attribution, per D3')
  assert.strictEqual(rows[0].ci, 'red')
  assert.ok(!rows.some((x) => x.spec === specA), 'the earlier-closing spec must never also be attributed — one red run is one alarm')
})

test('AC-20260807-01-3: equal close-commit timestamps break the tie toward the lexicographically last spec path', () => {
  const { dir, runSha, specB } = buildTwoDoneSpecsHost(['2026-08-06T10:00:00+00:00', '2026-08-06T10:00:00+00:00'])
  const bin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: runSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const rows = readLedger(dir).filter((x) => x.stage === 'observe')
  assert.strictEqual(rows.length, 1, 'a tied timestamp must still resolve to exactly one attributed row: ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].spec, specB,
    'equal close-commit timestamps must break the tie toward the lexicographically LAST spec path (specs/20260807/02-b.md over specs/20260805/03-a.md, D3\'s worked example) — the highest ## in the newest date dir wins')
})

// (sanctioned pin exception, green pre-change): the D4 ancestry-miss no-op itself is unchanged
// by this spec — only the surrounding one-branch-check architecture changed (D3 rationale:
// "Ancestry survives demoted from green-certifier to red-attributor"). Relocated here because
// AC-20260807-01-4 is the new home for this invariant under the multi-spec attribution model.
test('AC-20260807-01-4: a completed red run whose sha contains no done spec\'s close commit appends nothing and prints nothing', () => {
  const { dir, initSha } = buildHost({ extraCommit: false })
  // initSha predates the close commit — it is an ANCESTOR of closeSha, not a descendant, so the
  // run never actually tested the landed spec.
  const bin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: initSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(readLedger(dir).filter((x) => x.stage === 'observe').length, 0,
    'a red run whose sha does not descend from any done spec\'s close commit must never attribute an alarm — CI redness the pipeline didn\'t cause is outside this mechanism\'s charter')
  assert.strictEqual(r.stdout.trim(), '', 'an unimplicated red run must print nothing, or the operator gets a false alarm signal for code the pipeline never landed')
})

test('AC-20260807-01-5: a completed green run whose sha contains the close commit of the currently-red spec appends a clearing green row', () => {
  const { dir, redSha, greenSha, specRel } = buildHostTwoRuns()
  const redBin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: redSha, url: 'https://github.com/x/y/actions/runs/1' }) })
  const first = runObserve(dir, [], { env: envWithGh(redBin) })
  assert.strictEqual(first.status, 0, first.stderr)
  assert.ok(readLedger(dir).some((r) => r.spec === specRel && r.ci === 'red'),
    'fixture bug: the red row was not seeded by the first run — ' + first.stdout + first.stderr)

  const greenBin = fakeGh({ json: ghRun({ conclusion: 'success', headSha: greenSha, url: 'https://github.com/x/y/actions/runs/2' }) })
  const second = runObserve(dir, [], { env: envWithGh(greenBin) })
  assert.strictEqual(second.status, 0, second.stderr)
  const rows = readLedger(dir).filter((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(rows.length, 2,
    'a green run whose sha descends from the red spec\'s close commit must append a clearing row: ' + JSON.stringify(rows))
  assert.strictEqual(rows[1].ci, 'green', 'the appended clearing row must carry ci:"green"')
})

test('AC-20260807-01-5: a green run on a re-triggered older commit (not containing the red spec\'s close) appends nothing and leaves the spec red', () => {
  const { dir, initSha, redSha, specRel } = buildHostTwoRuns()
  const redBin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: redSha }) })
  const first = runObserve(dir, [], { env: envWithGh(redBin) })
  assert.strictEqual(first.status, 0, first.stderr)

  // initSha predates the spec's close commit entirely — a green run reported at that sha is a
  // re-trigger of an older commit, "latest" only by run recency, not commit order.
  const greenBin = fakeGh({ json: ghRun({ conclusion: 'success', headSha: initSha }) })
  const second = runObserve(dir, [], { env: envWithGh(greenBin) })
  assert.strictEqual(second.status, 0, second.stderr)
  const rows = readLedger(dir).filter((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(rows.length, 1,
    'an out-of-order green run (older commit) must never clear a live break — run recency is completion order, not commit order (D3/A3): ' + JSON.stringify(rows))
  assert.strictEqual(rows[0].ci, 'red', 'the spec must stay red after an out-of-order green')
})

test('AC-20260807-01-6: ci-query reporting structural unavailability appends nothing and prints nothing', () => {
  const { dir } = buildHost()
  const bin = fakeGh({ json: '[]' })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(readLedger(dir).filter((x) => x.stage === 'observe').length, 0,
    'structural unavailability must never write a ci:"none" row — D3/D4 retire that write entirely; resurrecting it would bring back the retired certification state')
  assert.strictEqual(r.stdout.trim(), '', 'a CI-less host must produce zero output under the silent-unless-red contract')
})

test('AC-20260807-01-6: ci-query reporting a transient failure appends nothing, prints nothing, and exits 0', () => {
  const { dir } = buildHost()
  const bin = fakeGh({ exit: 1, stderr: 'gh: authentication required (token expired)' })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(readLedger(dir).filter((x) => x.stage === 'observe').length, 0,
    'a transient blip must append nothing — retry is free at the next invocation')
  assert.strictEqual(r.stdout.trim(), '',
    'D3 deliberately retires the per-invocation ⚠️ nag on transient failures — a nag on every offline run is the exact noise class this spec kills')
})

// (sanctioned pin exception, green pre-change): the not-completed no-op is unchanged by this
// spec (D3 groups it with unavailable outcomes but the observable effect — nothing appended,
// nothing printed — already held). Relocated to AC-6 as its new home.
test('AC-20260807-01-6: a run that has not completed yet appends nothing and prints nothing', () => {
  const { dir, descendantSha } = buildHost()
  const bin = fakeGh({ json: ghRun({ status: 'in_progress', conclusion: null, headSha: descendantSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(readLedger(dir).filter((x) => x.stage === 'observe').length, 0,
    'an in-progress run is not evidence of anything yet — appending here would stamp the spec on an unfinished run')
  assert.strictEqual(r.stdout.trim(), '', 'an in-progress run must print nothing')
})

// (sanctioned pin exception, green pre-change): the worktree-CWD refusal is explicitly
// unchanged by D3 ("Exit codes stay 0/2/4 with the worktree refusal (exit 4) verbatim") —
// retagged from specs/20260805/03's AC-9.
test('AC-20260807-01-8: running with CWD inside .claude/worktrees/... exits 4, writes nothing, and names the repo-root remedy', () => {
  const dir = tmpdir('observe-ci-wt')
  gitRepo(dir)
  const wt = path.join(dir, '.claude', 'worktrees', 'spec-x')
  fs.mkdirSync(wt, { recursive: true })
  const r = runObserve(dir, [], { cwd: wt })
  assert.strictEqual(r.status, 4,
    'a worktree-CWD invocation must refuse with exit 4, the merge-back exit-4 precedent for this exact class of divergent-worktree double-write')
  assert.match(r.stderr, /root/i, 'the refusal message must name the remedy (run from the repo root) or the operator has no idea how to unstick it')
  assert.ok(!fs.existsSync(path.join(dir, LEDGER)), 'a refused run must write nothing to the ledger')
})

// (sanctioned pin exception, green pre-change): D3's idempotence rule ("never append a row with
// the same sha+ci as the spec's current latest qualifying row") is carried over verbatim from
// specs/20260805/03's AC-10 — retagged as its new home.
test('AC-20260807-01-9: observing the identical failing run twice appends no duplicate row', () => {
  const { dir, descendantSha, specRel } = buildHost()
  const bin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: descendantSha, url: 'https://github.com/x/y/actions/runs/7' }) })
  const env = envWithGh(bin)
  const first = runObserve(dir, [], { env })
  assert.strictEqual(first.status, 0, first.stderr)
  const afterFirst = readLedger(dir).filter((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(afterFirst.length, 1, 'the first run must append exactly one red row: ' + JSON.stringify(afterFirst))
  const second = runObserve(dir, [], { env })
  assert.strictEqual(second.status, 0, second.stderr)
  const afterSecond = readLedger(dir).filter((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(afterSecond.length, 1,
    'observing the identical sha+conclusion again must not append a second row (D3 idempotency)')
})

test('AC-20260807-01-12: a new red run while a spec is already red appends a fresh row for that SAME spec, never attributing a later-closing spec even though its close commit is now also contained', () => {
  const { dir, run1Sha, run2Sha, specA, specB } = buildStickyHost()
  const bin1 = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: run1Sha, url: 'https://github.com/x/y/actions/runs/1' }) })
  const first = runObserve(dir, [], { env: envWithGh(bin1) })
  assert.strictEqual(first.status, 0, first.stderr)
  const afterFirst = readLedger(dir).filter((x) => x.stage === 'observe')
  assert.strictEqual(afterFirst.length, 1, 'fixture bug: first red run must attribute exactly one row: ' + JSON.stringify(afterFirst))
  assert.strictEqual(afterFirst[0].spec, specA, 'fixture bug: only spec A\'s close commit is contained in run1 — it must receive the first alarm')

  const bin2 = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: run2Sha, url: 'https://github.com/x/y/actions/runs/2' }) })
  const second = runObserve(dir, [], { env: envWithGh(bin2) })
  assert.strictEqual(second.status, 0, second.stderr)
  const rows = readLedger(dir).filter((x) => x.stage === 'observe')
  assert.strictEqual(rows.length, 2, 'a NEW red sha on an already-red spec must append a fresh evidence row: ' + JSON.stringify(rows))
  assert.strictEqual(rows[1].spec, specA,
    'a persistently broken branch under continued landings must not accumulate one alarm per newest close — the alarm must stay pinned to spec A, never jump to the later-closing spec B (D3 refuter B finding 4)')
  assert.strictEqual(rows[1].sha, run2Sha, 'the fresh row must carry the new run\'s sha as evidence-refresh')
  assert.ok(!rows.some((x) => x.spec === specB), 'spec B must never receive an alarm while spec A already holds it')
})
