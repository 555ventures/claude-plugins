'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, tmpdir, gitRepo } = require('../helpers')

// specs/20261103/12-one-suite-run-per-tree.md D1, D2: AC-20261103-12-1..4 pin lib/run-cache.js
// (treeSha/cacheTree, the shared cacheDir, record's green-only rule, keyFor's verbatim key).

const load = () => require(path.join(SPEC, 'scripts/lib/run-cache.js'))
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim()

// A fixture repo with one committed tracked file; a fixture-local commit, never the host repo.
function fixture() {
  const main = tmpdir('run-cache-')
  gitRepo(main)
  fs.writeFileSync(path.join(main, 'tracked.txt'), 'one\n')
  git(main, 'add', '-A')
  git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'tracked')
  return main
}

// The independent oracle: a HEAD-seeded scratch index, add -A, then the tree object.
function oracleTree(root) {
  const idx = path.join(tmpdir('run-cache-idx-'), 'index')
  const env = { ...process.env, GIT_INDEX_FILE: idx }
  execFileSync('git', ['-C', root, 'read-tree', 'HEAD'], { env })
  execFileSync('git', ['-C', root, 'add', '-A'], { env })
  return execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8' }).trim()
}

test('AC-20261103-12-1: treeSha equals the scratch-index tree across a linked worktree, cacheTree ignores a ledger append, and a tracked edit changes it', () => {
  const rc = load()
  const main = fixture()
  fs.writeFileSync(path.join(main, 'untracked.txt'), 'u\n')
  const wt = path.join(tmpdir('run-cache-wt-'), 'wt')
  git(main, 'worktree', 'add', '-q', '--detach', wt)
  fs.writeFileSync(path.join(wt, 'untracked.txt'), 'u\n')

  const t = rc.treeSha(main, { exclude: [] })
  assert.match(t, /^[0-9a-f]{40}$/, 'treeSha must print a 40-hex sha — every cache key derives from it')
  assert.strictEqual(t, oracleTree(main), 'treeSha must equal the tree of tracked+untracked content — a different derivation splits the cache')
  assert.strictEqual(rc.treeSha(wt, { exclude: [] }), t, 'a linked worktree with identical files must share the tree sha — otherwise worktrees never reuse each other')

  const before = rc.cacheTree(main)
  fs.mkdirSync(path.join(main, '.claude'), { recursive: true })
  fs.appendFileSync(path.join(main, '.claude', 'spec-runs.jsonl'), '{"row":1}\n')
  assert.strictEqual(rc.cacheTree(main), before, 'a ledger append must not move the cache tree — every build-to-review handoff would miss')

  fs.writeFileSync(path.join(main, 'tracked.txt'), 'two\n')
  assert.notStrictEqual(rc.cacheTree(main), before, 'editing a tracked file must change the cache tree — a stale green would vouch for changed code')
})

test('AC-20261103-12-2: record from a linked worktree writes under the main .git/spec-run-cache and lookup from main returns it', () => {
  const rc = load()
  const main = fixture()
  const wt = path.join(tmpdir('run-cache-wt-'), 'wt')
  git(main, 'worktree', 'add', '-q', '--detach', wt)
  const tree = rc.treeSha(main, { exclude: [] })

  assert.ok(rc.cacheDir(wt).endsWith('/.git/spec-run-cache'), 'cacheDir must resolve to the common git dir — got ' + rc.cacheDir(wt))
  assert.strictEqual(fs.realpathSync(path.dirname(rc.cacheDir(wt))), fs.realpathSync(path.join(main, '.git')), 'cacheDir from a worktree must sit in the main repo .git — a per-worktree store defeats sharing')
  assert.strictEqual(rc.record(wt, 'npm test', tree, { exit: 0, observed: { testsExecuted: 3, skips: 0 } }), true, 'a green counted run must record — otherwise nothing is ever reused')
  const key = rc.keyFor('npm test', tree, [])
  assert.ok(fs.existsSync(path.join(main, '.git', 'spec-run-cache', key + '.json')), 'the entry file <key>.json must exist in the main checkout cache dir')
  const e = rc.lookup(main, 'npm test', tree)
  assert.ok(e, 'lookup from the main checkout must find the worktree-recorded entry — the cross-worktree reuse is the point')
  assert.strictEqual(e.observed.testsExecuted, 3, 'the entry must carry observed.testsExecuted — the consumer re-checks the count')
})

test('AC-20261103-12-3: record refuses exit 1 and a count-less green, writes no file, and lookup returns null', () => {
  const rc = load()
  const main = fixture()
  const tree = rc.treeSha(main, { exclude: [] })
  assert.strictEqual(rc.record(main, 'npm test', tree, { exit: 1, observed: { testsExecuted: 3 } }), false, 'a red run must not record — a cached red would vouch for nothing')
  assert.strictEqual(rc.record(main, 'npm test', tree, { exit: 0, observed: { testsExecuted: { unavailable: 'pattern-no-match' } } }), false, 'a green whose count is unavailable must not record — it may have run zero tests')
  const dir = rc.cacheDir(main)
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []
  assert.deepStrictEqual(files, [], 'no entry file may be written for a refused record — a later lookup would reuse it')
  assert.strictEqual(rc.lookup(main, 'npm test', tree), null, 'lookup must miss after refused records — the consumer must spawn')
})

test('AC-20261103-12-4: the key misses on a changed command string and on added testEnv names', () => {
  const rc = load()
  const main = fixture()
  const tree = rc.treeSha(main, { exclude: [] })
  assert.strictEqual(rc.record(main, 'npm test', tree, { exit: 0, observed: { testsExecuted: 5 } }), true, 'setup: the green entry must record')
  assert.ok(rc.lookup(main, 'npm test', tree), 'the verbatim command must hit — control for the misses below')
  assert.strictEqual(rc.lookup(main, 'npm test ', tree), null, 'a command with a trailing space is another command — reusing would vouch for an unrun command')
  assert.notStrictEqual(rc.keyFor('npm test', tree, []), rc.keyFor('npm test', tree, ['TEST_DATABASE_URL']), 'a gained testEnv name must change the key — the test env differs')
  assert.strictEqual(rc.keyFor('npm test', tree, ['B', 'A']), rc.keyFor('npm test', tree, ['A', 'B']), 'envNames order must not matter — the key sorts them')
  assert.match(rc.keyFor('npm test', tree, []), /^[0-9a-f]{64}$/, 'the key must be a sha256 hex — it names the entry file')
})
