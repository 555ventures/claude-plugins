'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')
const { writeSpec, appendLedger, commitAt } = require('./commit-coverage.fixtures')

// specs/20260904/01-commit-time-escape-coverage.md — window mode: AC-20260904-01-6, -9.
// spec/scripts/commit-coverage.js does not exist yet (TDD red) — every runNode call below fails
// (non-zero exit or unparseable stdout) until D1/D6 ship it.

const SCRIPT = 'scripts/commit-coverage.js'

// The AC-20260904-01-6 fixture: six commits (one out-of-window boundary case, one landed,
// one inFlight, one noSpecFile, one non-fix, and one HEAD-tip commit with an OLDER committer
// date than everything before it — proving the filter is in-process, never `git log --since`,
// which would stop the walk at the first out-of-order commit, D4/A5). Also seeds four escape
// rows, one of which predates the window.
function buildAc6Repo() {
  const dir = tmpdir('commit-coverage-window-ac6')
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

test('AC-20260904-01-6: window mode counts non-merge commits with committer epoch >= since in-process, excludes an earlier landed commit that falls just before the cutoff, and buckets fix-shaped commits into landed/inFlight/noSpecFile', () => {
  const dir = buildAc6Repo()
  const r = runNode(SCRIPT, ['--since', '2026-08-17', '--root', dir, '--json'])
  assert.strictEqual(r.status, 0, 'D6: a valid --since window over a git repo with a ledger must exit 0: ' + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.repo.commits, 4,
    'D6: fix(a) @ 2026-08-16T23:59:59Z is committed BEFORE the 2026-08-17 midnight-UTC cutoff and must be excluded — only fix(b), fix(c), fix(d), and feat:five fall in-window, so commits must be 4, not 5 or 6')
  assert.strictEqual(out.repo.fixShaped, 3,
    'D6: of the 4 in-window commits only fix(b), fix(c), fix(d) are fix-typed — feat:five must not count')
  assert.strictEqual(out.repo.landedPostClose, 1,
    'D3/D6: only fix(b) touches src/a.js, which a spec reviewed CLEAN on 2026-08-10 (before fix(b)\'s own date) already landed')
  assert.strictEqual(out.repo.inFlightOnly, 1,
    'D6: fix(c) touches src/b.js, whose only listing spec\'s review row (08-30) comes AFTER fix(c)\'s date — it is inFlight, not landed')
  assert.strictEqual(out.repo.noSpecFile, 1,
    'D6: fix(d) touches src/zzz.js, which no spec File Plan lists at all')
  assert.deepStrictEqual(out.repo.rows, { commit: 1, manual: 1, unknown: 1 },
    'D6: only the three escape rows dated 2026-08-18 (>= since) count; the 2026-08-16 via:"commit" row must be excluded from the window — commit/manual/unknown must bucket exactly on the row\'s via value')
  assert.strictEqual(out.repo.share, 1,
    'D6: share = round4(rows.commit / landedPostClose) = 1/1 = 1 — a different value means the ratio was computed over the wrong counters')
})

test('AC-20260904-01-9: window mode\'s human render prints exactly the header line and one repo counts line with a percentage share, and renders share as n/a with zero counts when no fix-shaped commit falls in the window', () => {
  const dir = buildAc6Repo()
  const r = runNode(SCRIPT, ['--since', '2026-08-17', '--root', dir])
  assert.strictEqual(r.status, 0, 'D6/D5: the human render path must also exit 0: ' + r.stderr)
  const name = path.basename(dir)
  const lines = r.stdout.split('\n').filter(l => l.length > 0)
  assert.strictEqual(lines.length, 2,
    'D6: the window render must print EXACTLY two lines (header + one repo line), never a fleet or excluded block — got: ' + JSON.stringify(lines))
  assert.strictEqual(lines[0], 'Commit-time escape coverage since 2026-08-17 — ' + name + ' (' + dir + ')',
    'the header line must name the since date, the repo basename, and its absolute dir verbatim: ' + lines[0])
  assert.strictEqual(lines[1],
    '  ' + name + ': commits=4 fix=3 → landed-post-close=1 in-flight-only=1 no-spec-file=1 · rows via commit=1 manual=1 unknown=1 → share 1/1 (100.0%)',
    'the repo counts line must render every counter and the share as count/denominator (pct): ' + lines[1])

  const emptyDir = tmpdir('commit-coverage-window-nofix')
  gitRepo(emptyDir, { empty: true })
  commitAt(emptyDir, 'a.txt', 'a\n', '2026-08-18T00:00:00Z', 'feat: only')
  const r2 = runNode(SCRIPT, ['--since', '2026-08-17', '--root', emptyDir])
  assert.strictEqual(r2.status, 0, r2.stderr)
  assert.match(r2.stdout, /share 0\/0 \(n\/a\)$/m,
    'D6: a window with no fix-shaped commit (landedPostClose 0) must render "share 0/0 (n/a)", never a divide-by-zero or a false 0.0%: ' + r2.stdout)
})
