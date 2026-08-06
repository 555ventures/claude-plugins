'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260805/03-done-unobserved-observation.md (2026-08-05): nothing owned the window
// between /spec:review flipping a spec to `done` and the first CI run on the landed code — the
// window the confirmed 2026-08 escape lived in undetected for days. observe-ci.js is the new
// script that closes it: per done-and-pending-or-red spec, resolve a branch, query ci-query.js
// (spec 02) at most once per branch, and append a `stage:"observe"` row to
// `.claude/spec-runs.jsonl` ONLY when the observed run's commit provably contains the spec's
// close commit (D4 ancestry gate — the false-green a refuter found). Pins AC-20260805-03-1
// through -4, -8, -9, -10. observe-ci.js does not exist yet, so every exec here fails at
// runNode's spawn (non-zero/garbage status) until spec 03's build lands it.

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
// in the suite. `counterFile` (when given) records one line per invocation for the per-branch
// cache assertion.
function fakeGh({ json = '[]', exit = 0, stderr = '', counterFile = null } = {}) {
  const bin = tmpdir('observe-ci-ghbin')
  const lines = ['#!/usr/bin/env bash']
  if (counterFile) lines.push(`echo x >> '${counterFile}'`)
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

test('AC-20260805-03-1: a completed successful run whose commit descends from the close commit appends ci:"green" with the run\'s sha/url/runAt', () => {
  const { dir, descendantSha, specRel } = buildHost()
  const bin = fakeGh({ json: ghRun({ headSha: descendantSha, url: 'https://github.com/x/y/actions/runs/42', updatedAt: '2026-08-06T01:00:00Z' }) })
  const r = runObserve(dir, ['--json'], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, 'observe-ci.js must run to completion on a clean green candidate: ' + r.stderr)
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.ok(row, 'no observe row was appended for the pending done spec — CI ground truth never landed in the ledger: ' + r.stdout + r.stderr)
  assert.strictEqual(row.ci, 'green', 'a completed successful run whose commit contains the close commit must observe green')
  assert.strictEqual(row.sha, descendantSha, 'the row must carry the observed RUN sha, not the close sha, or the evidence is unverifiable')
  assert.strictEqual(row.url, 'https://github.com/x/y/actions/runs/42', 'the run url must be recorded — it is what makes the row self-evidencing (D1)')
  assert.strictEqual(row.runAt, '2026-08-06T01:00:00Z', 'runAt must be recorded — D2\'s latest-row rule is runAt-max, not append order')
  const out = JSON.parse(r.stdout)
  assert.ok(out.observed.some((o) => o.spec === specRel && o.ci === 'green'),
    '--json observed[] must report the green outcome for this spec (Contracts)')
})

test('AC-20260805-03-2: a completed failed run whose commit descends from the close commit appends ci:"red"', () => {
  const { dir, descendantSha, specRel } = buildHost()
  const bin = fakeGh({ json: ghRun({ conclusion: 'failure', headSha: descendantSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.ok(row, 'a completed failing run must still be recorded — silence on red is the exact incident this spec answers')
  assert.strictEqual(row.ci, 'red', 'conclusion:"failure" on a valid-ancestry run must observe red')
})

test('AC-20260805-03-2: a run that has not completed yet appends nothing, leaving the spec pending', () => {
  const { dir, descendantSha, specRel } = buildHost()
  const bin = fakeGh({ json: ghRun({ status: 'in_progress', conclusion: null, headSha: descendantSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(row, undefined,
    'an in-progress run is not evidence of anything yet — appending a row here would stamp the spec on an unfinished run')
})

test('AC-20260805-03-3: structural CI unavailability (no runs recorded for the branch) appends ci:"none" with null sha', () => {
  const { dir, specRel } = buildHost()
  const bin = fakeGh({ json: '[]' })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.ok(row, 'a CI-less host must still resolve the observation (structural unavailability completes it) or every CI-less repo nags forever')
  assert.strictEqual(row.ci, 'none', 'no runs recorded is structural unavailability, not a transient blip')
  assert.strictEqual(row.sha, null, 'ci:"none" must carry a null sha — there is no run to cite')
})

test('AC-20260805-03-3: gh executing and exiting non-zero (transient failure) appends nothing and prints a ⚠️ line naming the spec', () => {
  const { dir, specRel } = buildHost()
  const bin = fakeGh({ exit: 1, stderr: 'gh: authentication required (token expired)' })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(row, undefined,
    'a transient auth/network blip must never resolve the observation — appending here would permanently silence a real red run behind a token expiry')
  assert.match(r.stdout + r.stderr, /⚠️/, 'a transient skip must print a warning line (Behavior) or the operator has no signal observation stalled')
  assert.match(r.stdout + r.stderr, new RegExp(specRel.replace(/[/.]/g, '\\$&')),
    'the ⚠️ line must name the spec it failed to observe, or a multi-spec run gives no way to tell which one stalled')
})

test('AC-20260805-03-4: an observed run whose commit does NOT descend from the close commit appends nothing (stays pending)', () => {
  const { dir, initSha, specRel } = buildHost({ extraCommit: false })
  // initSha predates the close commit — it is an ANCESTOR of closeSha, not a descendant, so the
  // run never actually tested the landed spec.
  const bin = fakeGh({ json: ghRun({ headSha: initSha }) })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  const row = readLedger(dir).find((x) => x.stage === 'observe' && x.spec === specRel)
  assert.strictEqual(row, undefined,
    'a run predating the close commit must never be accepted as evidence — D4\'s ancestry gate exists precisely to kill this false-green')
})

test('AC-20260805-03-8: two pending done specs sharing a branch invoke the ci query exactly once, but append one row each', () => {
  const { dir, latestSha } = buildTwoSpecHost()
  const counterFile = path.join(tmpdir('observe-ci-counter'), 'calls.txt')
  const bin = fakeGh({ json: ghRun({ headSha: latestSha }), counterFile })
  const r = runObserve(dir, [], { env: envWithGh(bin) })
  assert.strictEqual(r.status, 0, r.stderr)
  assert.ok(fs.existsSync(counterFile), 'the fake gh was never invoked — test fixture bug or the run never reached the ci query')
  const calls = fs.readFileSync(counterFile, 'utf8').trim().split('\n').filter(Boolean)
  assert.strictEqual(calls.length, 1,
    'two pending specs on the same branch must share ONE cached ci-query result per run (D3) — a second call means the cache was not honored')
  const rows = readLedger(dir).filter((x) => x.stage === 'observe')
  assert.strictEqual(rows.length, 2, 'the shared query must still produce one observe row PER spec, not one row total')
  assert.deepStrictEqual(rows.map((x) => x.spec).sort(),
    ['specs/20260701/01-a.md', 'specs/20260701/02-b.md'], 'both specs must be individually observed')
})

test('AC-20260805-03-9: running with CWD inside .claude/worktrees/... exits 4, writes nothing, and names the repo-root remedy', () => {
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

test('AC-20260805-03-10: a red spec stays a candidate every run, but observing the identical failing run twice appends no duplicate row', () => {
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
    'a red spec is re-queried every run (red stays under watch, D3) — observing the identical sha+conclusion again must not append a second row (D3 idempotency)')
})
