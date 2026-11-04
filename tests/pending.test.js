'use strict'
// Pins lib/pending.js: the lane question relay and lane marker.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')
const P = require(path.join(SPEC, 'scripts/lib/pending.js'))

const Q = { lane: 'spec-01-x', question: 'Gate red twice — what now?', options: [{ label: 'retry on opus', description: 'one more build' }, 'park'] }

test('a written question is never overwritten and consume removes it', () => {
  const root = tmpdir('pq')
  const first = P.writePending(root, Q)
  assert.ok(first.written, 'the first question must be written')
  assert.deepStrictEqual(first.doc.options[1], { label: 'park' }, 'string options normalize to {label}')
  const second = P.writePending(root, { ...Q, question: 'other' })
  assert.ok(!second.written, 'a second question would silently drop the first')
  assert.strictEqual(P.readPending(root).question, Q.question, 'the pending file must still hold the first question')
  assert.match(P.stopLine(root), /^PENDING_QUESTION — /, 'fanout detects a stopped lane by this token')
  const doc = P.consumePending(root)
  assert.strictEqual(doc.question, Q.question, 'consume returns what it removed')
  assert.strictEqual(P.readPending(root), null, 'a consumed question must not be relayed again')
})

test('answer CLI accepts only a listed option and show exits 1 when nothing is pending', () => {
  const root = tmpdir('pqcli')
  const script = 'scripts/lib/pending.js'
  assert.strictEqual(runNode(script, ['show', '--root', root]).status, 1, 'show must signal nothing pending')
  P.writePending(root, Q)
  const bad = runNode(script, ['answer', '--root', root, '--label', 'nope'])
  assert.strictEqual(bad.status, 2, 'an unknown label must be refused')
  assert.match(bad.stderr, /retry on opus/, 'the refusal names the valid options')
  assert.strictEqual(runNode(script, ['answer', '--root', root, '--label', 'park']).status, 0, 'a listed label must be accepted')
  assert.strictEqual(P.readPending(root).answer.label, 'park', 'the answer must be on disk for the lane to resume')
  assert.strictEqual(runNode(script, ['consume', '--root', root]).status, 0, 'consume must succeed')
  assert.ok(!fs.existsSync(P.pendingPath(root)), 'consume must delete the file')
})

test('the lane marker lives in the private git dir of the worktree only', () => {
  const root = tmpdir('lane')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'l1')
  g('worktree', 'add', '-q', '-b', 'l1', wt)
  assert.ok(!P.isLane(wt), 'a fresh worktree is not a lane until marked')
  const r = runNode('scripts/lib/pending.js', ['mark', '--root', wt])
  assert.strictEqual(r.status, 0, 'mark must succeed in a worktree')
  assert.ok(P.isLane(wt), 'a marked worktree is a lane')
  assert.ok(!P.isLane(root), 'marking a lane must not make the main session a lane')
  P.unmarkLane(wt)
  assert.ok(!P.isLane(wt), 'unmark must clear the marker')
})
