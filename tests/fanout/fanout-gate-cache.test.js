'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { tmpdir } = require('../helpers')
const { fanoutHost, specRel } = require('./fixture')

// specs/20261103/12-one-suite-run-per-tree.md AC-20261103-12-24 (D1, D2, D9): the post-merge gate of --mark merged consults and fills the run cache.

const S03 = specRel('03-x')
const GATE = 'bash ./gate.sh'
const OVERLAY = ['.claude/spec-runs.jsonl', '.claude/spec-runs.stopped.jsonl', '.claude/spec-runs/', '.claude/agent-memory/']

// A lane merged into main with a counting gate: gate.sh bumps a counter that lives outside the repo and prints an `ℹ tests` line.
function mergedHost() {
  const h = fanoutHost()
  const counter = path.join(fs.realpathSync(tmpdir('gate-counter')), 'runs')
  fs.writeFileSync(path.join(h.root, 'gate.sh'),
    '#!/usr/bin/env bash\n[ -e .gate-red ] && exit 1\npwd > .gate-cwd\necho x >> ' + JSON.stringify(counter) + '\necho "ℹ tests 5"\nexit 0\n')
  const cfgPath = path.join(h.root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.capabilities = { ...(cfg.capabilities || {}), testCountPattern: 'ℹ tests (\\d+)' }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
  h.git('add', '-A')
  h.git('commit', '-q', '-m', 'counting gate')
  h.plan(['--spec', S03])
  h.dispatch('L1', 'lane-one')
  h.startLane('03-x')
  h.commitInLane('03-x', 'x.txt', 'x\n')
  h.sidecar('03-x', 'review', { closed: true })
  h.must(['--mark', 'returned', '--lane', 'L1'])
  h.mergeLane('03-x', { markDone: true })
  return { h, runs: () => (fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0) }
}

// D1/D2 derivation, written out independently of lib/run-cache.js: HEAD-seeded scratch index, add -A, write-tree, overlay excluded.
function cacheTreeOf(root) {
  const idx = path.join(fs.realpathSync(tmpdir('scratch-index')), 'index')
  const env = { ...process.env, GIT_INDEX_FILE: idx }
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env }).trim()
  git('read-tree', 'HEAD')
  git('add', '-A', '--', '.', ...OVERLAY.map((p) => ':(exclude)' + p))
  return git('write-tree')
}
const keyOf = (cmd, tree) => crypto.createHash('sha256').update(cmd + '\0' + tree + '\0' + '').digest('hex')

test('AC-20261103-12-24: a green cache entry for the resolved gate over main\'s tree makes --mark merged reuse it: second log line is `== reused cache:<tree7>`, the gate spawns zero times and the lane records green', () => {
  const { h, runs } = mergedHost()
  const tree = cacheTreeOf(h.root)
  const dir = path.join(h.common, 'spec-run-cache')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, keyOf(GATE, tree) + '.json'), JSON.stringify({
    cmd: GATE, tree, envNames: [], observed: { skips: 0, todos: 0, testsExecuted: 5 }, ts: '2026-11-03T10:00:00.000Z',
  }) + '\n')
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(runs(), 0, 'a cache hit must spawn no gate, or every merge re-pays a suite run the review already judged green')
  const lines = fs.readFileSync(path.join(h.common, 'spec-fanout', 'L1.gate.log'), 'utf8').split('\n')
  assert.strictEqual(lines[0], '$ ' + GATE, 'the log keeps its `$ <gate>` first line, or the report cannot name the gate that was vouched for: ' + lines.join('|'))
  assert.strictEqual(lines[1], '== reused cache:' + tree.slice(0, 7), 'the second log line must name the reused tree, or a reader cannot tell a reuse from a run: ' + lines.join('|'))
  assert.deepStrictEqual([h.lane('L1').gate, h.lane('L1').state], ['green', 'merged'], 'a reused green must land the lane as merged with gate green, or the queue stalls on a vouched tree')
})

test('AC-20261103-12-24: a green spawned post-merge gate writes the cache entry for main\'s tree so an identical later gate hits', () => {
  const { h, runs } = mergedHost()
  const tree = cacheTreeOf(h.root)
  h.must(['--mark', 'merged', '--lane', 'L1'])
  assert.strictEqual(runs(), 1, 'with an empty cache the gate must spawn exactly once, or the test is not measuring a miss')
  const file = path.join(h.common, 'spec-run-cache', keyOf(GATE, tree) + '.json')
  assert.ok(fs.existsSync(file), 'a green spawned gate must record its entry under the D1 key for main\'s cacheTree, or a second identical merge re-runs the suite: ' + file)
  const entry = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepStrictEqual([entry.cmd, entry.tree, entry.observed.testsExecuted], [GATE, tree, 5], 'the entry must carry the gate, the tree and the observed test count, or a later lookup vouches for the wrong run: ' + JSON.stringify(entry))
})
