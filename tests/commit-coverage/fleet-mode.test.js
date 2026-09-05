'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { tmpdir, runNode, gitRepo } = require('../helpers')
const { writeSpec, appendLedger, commitAt } = require('./commit-coverage.fixtures')

// specs/20260904/01-commit-time-escape-coverage.md — fleet mode: AC-20260904-01-8, -10.
// spec/scripts/commit-coverage.js does not exist yet (TDD red) — every runNode call below fails
// (non-zero exit or unparseable stdout) until D1/D7 ship it. Population comes from
// fleet-reader.js --json --repos-root, spawned as spec/scripts/fleet-reader.js.

const SCRIPT = 'scripts/commit-coverage.js'
const FLEET_READER = 'scripts/fleet-reader.js'

function writeConfig(dir) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), '{}')
}

// host-a: the same commit/spec/ledger history as window-mode.test.js's AC-20260904-01-6
// fixture (fixShaped 3, landedPostClose 1, inFlightOnly 1, noSpecFile 1, rows commit1/manual1/
// unknown1, share 1) — reproduced here so this file stands alone (per-file fixtures, § Test
// Rules).
function buildHostA(root) {
  const dir = path.join(root, 'host-a')
  fs.mkdirSync(dir, { recursive: true })
  writeConfig(dir)
  gitRepo(dir, { empty: true })
  writeSpec(dir, 'specs/20260801/01-a.md', ['src/a.js'])
  writeSpec(dir, 'specs/20260801/02-b.md', ['src/b.js'])
  appendLedger(dir, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/20260801/01-a.md', runId: 'rv_a1', verdict: 'CLEAN' },
    { ts: '2026-08-30T00:00:00Z', stage: 'review', spec: 'specs/20260801/02-b.md', runId: 'rv_b1', verdict: 'CLEAN' },
    { ts: '2026-08-18T00:00:00Z', stage: 'escape', via: 'commit' },
    { ts: '2026-08-18T00:00:00Z', stage: 'escape', via: 'manual' },
    { ts: '2026-08-18T00:00:00Z', stage: 'escape' },
    { ts: '2026-08-16T00:00:00Z', stage: 'escape', via: 'commit' },
  ])
  commitAt(dir, 'src/a.js', 'a1\n', '2026-08-16T23:59:59Z', 'fix(a): one')
  commitAt(dir, 'src/a.js', 'a2\n', '2026-08-17T00:00:00Z', 'fix(b): two')
  commitAt(dir, 'src/b.js', 'b1\n', '2026-08-18T00:00:00Z', 'fix(c): three')
  commitAt(dir, 'src/zzz.js', 'z1\n', '2026-08-19T00:00:00Z', 'fix(d): four')
  commitAt(dir, 'src/feat.js', 'f1\n', '2026-08-20T00:00:00Z', 'feat: five')
  commitAt(dir, 'CHANGELOG.md', 'c1\n', '2026-08-01T00:00:00Z', 'chore: six')
  return dir
}

// plug: self-repair repo (marketplace.json), one landed fix commit, one commit-via escape row.
function buildPlug(root) {
  const dir = path.join(root, 'plug')
  fs.mkdirSync(dir, { recursive: true })
  writeConfig(dir)
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), '{}')
  gitRepo(dir, { empty: true })
  writeSpec(dir, 'specs/20260801/01-p.md', ['lib/p.js'])
  appendLedger(dir, [
    { ts: '2026-08-10T00:00:00Z', stage: 'review', spec: 'specs/20260801/01-p.md', runId: 'rv_p1', verdict: 'CLEAN' },
    { ts: '2026-08-19T00:00:00Z', stage: 'escape', via: 'commit' },
  ])
  commitAt(dir, 'lib/p.js', 'p\n', '2026-08-18T00:00:00Z', 'fix: p')
  return dir
}

function buildNogit(root) {
  const dir = path.join(root, 'nogit')
  fs.mkdirSync(dir, { recursive: true })
  writeConfig(dir)
  return dir
}

function buildEmpty(root) {
  const dir = path.join(root, 'empty')
  fs.mkdirSync(dir, { recursive: true })
  writeConfig(dir)
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@test'], { encoding: 'utf8' })
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'test'], { encoding: 'utf8' })
  return dir
}

function snapshot(dir) {
  const files = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else files.push(p)
    }
  })(dir)
  files.sort()
  const h = crypto.createHash('sha256')
  for (const f of files) { h.update(path.relative(dir, f)); h.update(fs.readFileSync(f)) }
  return { files, hash: h.digest('hex') }
}

test('AC-20260904-01-8: fleet mode takes its population and cutover default from fleet-reader.js, reports git:false/nulls for a repo with no .git, marks a marketplace repo selfRepair and excludes it from fleet totals, sums only host repos, and honors an explicit --since override', () => {
  const root = tmpdir('commit-coverage-fleet')
  buildHostA(root)
  buildPlug(root)
  buildNogit(root)
  buildEmpty(root)

  const fr = runNode(FLEET_READER, ['--repos-root', root, '--json'])
  assert.strictEqual(fr.status, 0, 'fleet-reader.js must derive cleanly over this synthetic fleet for the cutover default to mean anything: ' + fr.stderr)
  const cutover = JSON.parse(fr.stdout).gate08.cutover

  const r = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r.status, 0, 'D7: a valid --repos-root over a mixed fleet must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.since, cutover,
    'D7: with no --since, the default must be fleet-reader\'s own gate08.cutover literal, read fresh rather than re-hardcoded — a drifted duplicate would silently diverge from the one cutover fleet-reader owns')

  const names = out.repos.map(x => x.name)
  assert.deepStrictEqual(names, ['empty', 'host-a', 'nogit', 'plug'],
    'D7: repos must appear in fleet-reader\'s own population order (alphabetical) — a different order means a second, independent discovery pass')

  const byName = Object.fromEntries(out.repos.map(x => [x.name, x]))
  assert.strictEqual(byName.nogit.git, false, 'D7: a population entry with no .git directory must report git:false')
  for (const key of ['commits', 'fixShaped', 'landedPostClose', 'inFlightOnly', 'noSpecFile', 'rows', 'share']) {
    assert.strictEqual(byName.nogit[key], null,
      'D7: every counter on a git:false repo must be null, not 0 or omitted — key ' + key + ' was ' + JSON.stringify(byName.nogit[key]))
  }
  assert.strictEqual(byName.empty.commits, 0, 'D7: a git repo with zero commits reachable from HEAD must report commits:0, never null or a crash')
  assert.strictEqual(byName.plug.selfRepair, true, 'D7: the repo carrying .claude-plugin/marketplace.json must be marked selfRepair:true')
  assert.strictEqual(byName['host-a'].commits, 4, 'host-a must reproduce the window-mode AC-6 fixture\'s own commits:4 count')

  assert.deepStrictEqual(out.fleet, {
    repos: 2, commits: 4, fixShaped: 3, landedPostClose: 1, inFlightOnly: 1, noSpecFile: 1,
    rows: { commit: 1, manual: 1, unknown: 1 }, share: 1,
  }, 'D7: fleet totals must sum ONLY host-a and empty (selfRepair:false, git:true) — plug\'s selfRepair row and nogit\'s null row must both be excluded from these sums')
  assert.deepStrictEqual(out.excluded, { selfRepair: ['plug'], noGit: ['nogit'] },
    'D7: excluded must name plug under selfRepair and nogit under noGit — the two exclusion reasons must never be merged or dropped')

  const r2 = runNode(SCRIPT, ['--repos-root', root, '--since', '2026-08-19', '--json'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.strictEqual(JSON.parse(r2.stdout).since, '2026-08-19',
    'D7: an explicit --since must override the fleet-reader cutover default')
})

test('AC-20260904-01-10: fleet mode leaves every file under the repos-root byte-identical and creates no new file', () => {
  const root = tmpdir('commit-coverage-fleet-readonly')
  buildHostA(root)
  buildPlug(root)
  buildNogit(root)
  buildEmpty(root)

  const before = snapshot(root)
  const r1 = runNode(SCRIPT, ['--repos-root', root])
  assert.strictEqual(r1.status, 0, r1.stderr)
  const r2 = runNode(SCRIPT, ['--repos-root', root, '--json'])
  assert.strictEqual(r2.status, 0, r2.stderr)
  const after = snapshot(root)

  assert.deepStrictEqual(after.files, before.files,
    'D7/AC-10: fleet mode must create no new file anywhere under the repos-root (a walk including .git) — a changed file list means it wrote a cache or artifact it has no authority to write')
  assert.strictEqual(after.hash, before.hash,
    'D7/AC-10: fleet mode is read-only — a changed recursive content hash means it modified an existing file, not just refrained from creating one')
})
