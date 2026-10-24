'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tmpdir, gitRepo, SPEC } = require('./helpers')

// The review driver's soft-sweep ceiling diffs the committed close tree against a snapshot of the
// working tree taken when the close row lands. That snapshot carries untracked files on purpose
// (an uncommitted fix's new file must count) — and so also carries whatever the reviewer's legs
// left behind (build output a host never ignored). Cleaning that output before `--mark closed`
// must never read as sweep lines: a path counts only when it is tracked in the judged commit or
// in HEAD.

const { measureSweep } = require(path.join(SPEC, 'scripts/lib/sweep-ceiling.js'))

const run = (cmd, args, opts) => spawnSync(cmd, args, opts)

// The driver's own snapshot recipe: seed a scratch index from HEAD, `add -A`, `write-tree`.
function snapshotWorkingTree(dir) {
  const indexFile = path.join(tmpdir('sweep-ceiling-index'), 'index') // outside the repo: its lock file must not enter the snapshot
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: indexFile })
  for (const args of [['read-tree', 'HEAD'], ['add', '-A', '--', '.']]) {
    const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env })
    assert.strictEqual(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stderr)
  }
  const wt = spawnSync('git', ['-C', dir, 'write-tree'], { encoding: 'utf8', env })
  fs.rmSync(indexFile, { force: true })
  return wt.stdout.trim()
}

function lines(n, tag) { return Array.from({ length: n }, (_, i) => tag + ' ' + i).join('\n') + '\n' }

// One repo, one judged state, one close commit — every case below reads the same measurement.
function scenario() {
  const dir = tmpdir('sweep-ceiling')
  const g = gitRepo(dir, { empty: true })
  fs.writeFileSync(path.join(dir, 'src.js'), lines(5, 'src'))
  fs.writeFileSync(path.join(dir, 'retired.js'), lines(4, 'retired'))
  g('add', '-A'); g('commit', '-q', '-m', 'judged')
  const judgedCommit = g('rev-parse', 'HEAD').trim()

  // What the legs saw: an uncommitted hard fix (an edit plus a brand-new test file — both ride in
  // the snapshot and later commit as a zero-line sweep) and the reviewer's own untracked build
  // output, a many-file shape trimmed down, that the host never gitignored.
  fs.writeFileSync(path.join(dir, 'src.js'), lines(5, 'src') + 'hard fix\n')
  fs.writeFileSync(path.join(dir, 'hard.test.js'), lines(3, 'test'))
  fs.mkdirSync(path.join(dir, 'build-out/assets'), { recursive: true })
  for (let i = 0; i < 6; i++) fs.writeFileSync(path.join(dir, 'build-out/assets/chunk-' + i + '.js'), lines(200, 'chunk' + i))
  fs.writeFileSync(path.join(dir, 'build-out/index.html'), lines(50, 'html'))
  const judgedTree = snapshotWorkingTree(dir)

  // The soft sweep, after the snapshot: delete a tracked file, edit one line, add a new test file
  // (all count), then clean the build output so the dirty-tree check passes (must NOT count).
  fs.rmSync(path.join(dir, 'retired.js'))
  fs.appendFileSync(path.join(dir, 'src.js'), 'soft fix\n')
  fs.writeFileSync(path.join(dir, 'sweep.test.js'), lines(3, 'sweep'))
  fs.rmSync(path.join(dir, 'build-out'), { recursive: true })
  g('add', '-A'); g('commit', '-q', '-m', 'close')
  return { dir, judgedTree, judgedCommit }
}

test('cleaning the reviewer\'s untracked build output never counts as sweep lines; the real sweep still does', () => {
  const { dir, judgedTree, judgedCommit } = scenario()
  // The plain diff the ceiling used to trust sees the cleaned output as 1,250 deleted lines.
  const raw = spawnSync('git', ['-C', dir, 'diff', '--numstat', judgedTree, 'HEAD'], { encoding: 'utf8' }).stdout
  assert.match(raw, /build-out\/index\.html/, 'precondition: the snapshot did capture the untracked output')

  const m = measureSweep({ repoRoot: dir, judgedTree, judgedCommit, excludes: [], run })
  assert.deepStrictEqual(m.files.sort(), ['retired.js', 'src.js', 'sweep.test.js'],
    'counted paths are exactly the committed sweep: a deleted tracked file (in the judged commit), an edit, a new file (in HEAD)')
  assert.strictEqual(m.total, 4 + 1 + 3, 'retired.js 4 deleted, src.js 1 added, sweep.test.js 3 added — the hard fix already in the snapshot adds nothing')
  assert.strictEqual(m.binary, false, 'no binary flag on a text-only sweep')
  assert.strictEqual(m.skipped.length, 7, 'every cleaned build-output file is reported, none counted: ' + m.skipped.join(', '))
  assert.ok(m.skipped.every((p) => p.startsWith('build-out/')), m.skipped.join(', '))
})

test('with no judged commit at hand, HEAD alone decides what is tracked — a deleted tracked file then goes uncounted, nothing else changes', () => {
  const { dir, judgedTree } = scenario()
  const m = measureSweep({ repoRoot: dir, judgedTree, judgedCommit: null, excludes: [], run })
  assert.deepStrictEqual(m.files.sort(), ['src.js', 'sweep.test.js'], 'without the judged commit only HEAD-tracked paths can count')
  assert.strictEqual(m.total, 4, 'src.js 1 added, sweep.test.js 3 added')
  assert.ok(m.skipped.includes('retired.js') && m.skipped.length === 8,
    'the deleted tracked file joins the seven cleaned build files under skipped: ' + m.skipped.join(', '))
})

test('build output the session COMMITTED is in HEAD and counts — the ceiling still catches it', () => {
  const dir = tmpdir('sweep-ceiling-committed')
  const g = gitRepo(dir, { empty: true })
  fs.writeFileSync(path.join(dir, 'src.js'), lines(5, 'src'))
  g('add', '-A'); g('commit', '-q', '-m', 'judged')
  const judgedCommit = g('rev-parse', 'HEAD').trim()
  const judgedTree = snapshotWorkingTree(dir)
  fs.mkdirSync(path.join(dir, 'build-out'))
  fs.writeFileSync(path.join(dir, 'build-out/bundle.js'), lines(100, 'bundle'))
  g('add', '-A'); g('commit', '-q', '-m', 'close with junk')
  const m = measureSweep({ repoRoot: dir, judgedTree, judgedCommit, excludes: [], run })
  assert.deepStrictEqual(m.files, ['build-out/bundle.js'], 'a committed junk file is tracked in HEAD and must be counted')
  assert.strictEqual(m.total, 100, 'all 100 committed junk lines count toward the ceiling')
  assert.deepStrictEqual(m.skipped, [], 'nothing is skipped when every diffed path is committed')
})

test('a new file an uncommitted hard fix created is in neither commit, yet deleting it in the sweep counts when the fix-delta list names it', () => {
  const { dir, judgedTree, judgedCommit } = scenario()
  // In scenario() hard.test.js rode in the snapshot uncommitted and was then committed at close, so
  // it is in HEAD. Rebuild the close commit without it: the sweep deleted the hard fix's file.
  const g = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  fs.rmSync(path.join(dir, 'hard.test.js')); g('add', '-A'); g('commit', '-q', '-m', 'close minus the hard fix file')
  const blind = measureSweep({ repoRoot: dir, judgedTree, judgedCommit, excludes: [], run })
  assert.ok(blind.skipped.includes('hard.test.js'), 'precondition: with no fix-delta list the deletion is skipped as junk — the gap this test closes')
  const m = measureSweep({ repoRoot: dir, judgedTree, judgedCommit, alsoTracked: ['hard.test.js'], excludes: [], run })
  assert.ok(m.files.includes('hard.test.js') && !m.skipped.includes('hard.test.js'),
    'reviewed code a sweep removed must be counted, never skipped as reviewer junk: ' + JSON.stringify(m))
  assert.strictEqual(m.total, 4 + 1 + 3 + 3, 'the three deleted lines of hard.test.js join the sweep tally')
})

test('excludes become pathspecs and a failing diff throws instead of returning a tally', () => {
  const { dir, judgedTree, judgedCommit } = scenario()
  const m = measureSweep({ repoRoot: dir, judgedTree, judgedCommit, excludes: ['sweep.test.js'], run })
  assert.deepStrictEqual(m.files.sort(), ['retired.js', 'src.js'], 'an excluded overlay path leaves the tally entirely')
  assert.throws(() => measureSweep({ repoRoot: dir, judgedTree: '0'.repeat(40), judgedCommit, excludes: [], run }),
    /git diff --numstat .* failed/, 'a bogus judged tree must throw, never return a zero tally that lets the mark through')
})
