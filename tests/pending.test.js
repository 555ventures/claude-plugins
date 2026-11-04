'use strict'
// Pins lib/pending.js: the lane question relay and lane marker.
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { tmpdir, gitRepo, SPEC } = require('./helpers')
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

test('answer accepts only a listed option', () => {
  const root = tmpdir('pqans')
  P.writePending(root, Q)
  assert.throws(() => P.answerPending(root, 'nope'), (e) => e.exit === 2 && /retry on opus/.test(e.message), 'an unknown label is refused, naming the valid options')
  P.answerPending(root, 'park')
  assert.strictEqual(P.readPending(root).answer.label, 'park', 'the answer must be on disk for the lane to resume')
})

test('the lane marker lives in the private git dir of the worktree only', () => {
  const root = tmpdir('lane')
  const g = gitRepo(root)
  const wt = path.join(root, '.claude', 'worktrees', 'l1')
  g('worktree', 'add', '-q', '-b', 'l1', wt)
  assert.ok(!P.isLane(wt), 'a fresh worktree is not a lane until marked')
  P.markLane(wt)
  assert.ok(P.isLane(wt), 'a marked worktree is a lane')
  assert.ok(!P.isLane(root), 'marking a lane must not make the main session a lane')
  P.unmarkLane(wt)
  assert.ok(!P.isLane(wt), 'unmark must clear the marker')
})
