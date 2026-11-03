'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, tmpdir, runNode } = require('../helpers')

// specs/20261102/02-a-delegated-driver-stops-on-disk.md D1/D9 — pending-question.js is the one
// writer and reader of .claude/pending-question.json, and the helpers strip the child marker.

const SCRIPT = 'scripts/pending-question.js'
const pending = (root) => path.join(root, '.claude', 'pending-question.json')

function doc() {
  return {
    schemaVersion: 1,
    kind: 'repair-round',
    stage: 'review',
    state: 'STOPPED',
    spec: 'specs/20261102/02-x.md',
    writtenAt: '2026-11-02T10:00:00Z',
    questions: [{
      id: 'q1',
      header: 'Review stop',
      question: 'A blocking review leg went red. What should the lane do?',
      options: [
        { label: 'run one in-session repair round (Recommended)',
          description: 'The lane fixes the failing leg through the review fix seat and re-runs the legs; red again lands here with the round spent',
          resume: 'node /abs/spec-review-driver.js specs/20261102/02-x.md --mark repair-round' },
        { label: 'queue /spec:fix and stop',
          description: 'The review ends; the repair becomes the queue\'s top item',
          resume: 'stop',
          then: 'node "$(spec-paths spec-queue)" add "specs/20261102/02-x.md: review stopped, blocking leg red" --lane fix --top' },
      ],
    }],
  }
}

function host(name, document = doc()) {
  const root = fs.realpathSync(tmpdir(name))
  const file = path.join(root, 'doc.json')
  fs.writeFileSync(file, JSON.stringify(document))
  return { root, file }
}

const write = (h) => runNode(SCRIPT, ['write', '--root', h.root, '--file', h.file])

test('AC-20261102-02-1: write stores the document plus null answers and dismissed at the root, prints the path, and a second write exits 2 naming the pending file', () => {
  const h = host('pq-write')
  const r = write(h)
  assert.strictEqual(r.status, 0, 'a valid document must be written or no driver can hand a question up: ' + r.stdout + r.stderr)
  assert.strictEqual(r.stdout.trim(), pending(h.root), 'the printed path is how the lane tells the parent where the question is: ' + r.stdout)
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(pending(h.root), 'utf8')), { ...doc(), answers: null, dismissed: null },
    'the file must be the document verbatim plus the two null fields, or the parent relays a mangled question')
  const again = write(h)
  assert.strictEqual(again.status, 2, 'a second write must be refused or an unanswered question is silently overwritten: ' + again.stdout + again.stderr)
  assert.ok(again.stderr.includes('pending-question: a question is already pending: ' + pending(h.root)),
    'the refusal must name the pending file so the lane knows what to answer or consume: ' + again.stderr)
})

test('AC-20261102-02-2: write rejects a kind outside the closed set, a too-short option description and a duplicate question id, one finding per line, and writes nothing', () => {
  const badKind = { ...doc(), kind: 'coffee' }
  const shortDesc = doc()
  shortDesc.questions[0].options[1].description = 'ok'
  const dup = doc()
  dup.questions.push({ ...dup.questions[0] })
  const cases = [
    [badKind, 'kind "coffee" is not in the closed set'],
    [shortDesc, 'option "queue /spec:fix and stop": description must state the consequence of picking it'],
    [dup, 'question q1: duplicate id'],
  ]
  for (const [document, finding] of cases) {
    const h = host('pq-invalid', document)
    const r = write(h)
    assert.strictEqual(r.status, 2, 'an invalid document must exit 2 or a malformed question reaches the parent: ' + r.stdout + r.stderr)
    assert.ok((r.stdout + r.stderr).includes(finding), 'the finding "' + finding + '" must be printed so the author can fix it: ' + r.stdout + r.stderr)
    assert.ok(!fs.existsSync(pending(h.root)), 'a rejected document must leave no pending file, or the driver waits on an unanswerable question')
  }
})

test('AC-20261102-02-3: answer records label, by and an ISO time; an unknown id, label or by exits 2; dismiss sets dismissed.at; consume is idempotent; show without a file exits 1', () => {
  const h = host('pq-answer')
  assert.strictEqual(write(h).status, 0, 'setup: the valid document must be written')
  const ans = (id, label, by) => runNode(SCRIPT, ['answer', '--root', h.root, '--id', id, '--label', label, '--by', by])
  const ok = ans('q1', 'queue /spec:fix and stop', 'user')
  assert.strictEqual(ok.status, 0, 'a known id and label must be recorded: ' + ok.stdout + ok.stderr)
  const a = JSON.parse(fs.readFileSync(pending(h.root), 'utf8')).answers.q1
  assert.deepStrictEqual({ label: a.label, by: a.by }, { label: 'queue /spec:fix and stop', by: 'user' },
    'the answer must carry the chosen label and who gave it, or the drivers cannot tell user from standing answers')
  assert.ok(!Number.isNaN(Date.parse(a.at)), 'the answer needs a parseable time: ' + a.at)
  const robot = ans('q1', 'queue /spec:fix and stop', 'robot')
  assert.strictEqual(robot.status, 2, 'a by outside the enum must be refused or any writer can masquerade: ' + robot.stdout + robot.stderr)
  assert.match(robot.stdout + robot.stderr, /standing/, 'the refusal must name the enum: ' + robot.stdout + robot.stderr)
  const unknownId = ans('q9', 'queue /spec:fix and stop', 'user')
  assert.strictEqual(unknownId.status, 2, 'an unknown id must be refused: ' + unknownId.stdout + unknownId.stderr)
  assert.ok((unknownId.stdout + unknownId.stderr).includes('unknown question id q9'), 'the refusal must name the id: ' + unknownId.stderr)
  const unknownLabel = ans('q1', 'no such option', 'user')
  assert.strictEqual(unknownLabel.status, 2, 'a label no option carries must be refused or the resume line is underivable: ' + unknownLabel.stdout + unknownLabel.stderr)
  const d = runNode(SCRIPT, ['dismiss', '--root', h.root])
  assert.strictEqual(d.status, 0, 'dismiss must succeed on a pending file: ' + d.stdout + d.stderr)
  assert.ok(!Number.isNaN(Date.parse(JSON.parse(fs.readFileSync(pending(h.root), 'utf8')).dismissed.at)),
    'a dismissal must be stamped, or the driver cannot record dismissedStop')
  const shown = runNode(SCRIPT, ['show', '--root', h.root])
  assert.strictEqual(shown.status, 0, 'show must print an existing file: ' + shown.stderr)
  assert.strictEqual(runNode(SCRIPT, ['consume', '--root', h.root]).status, 0, 'consume must remove the file')
  assert.ok(!fs.existsSync(pending(h.root)), 'a consumed question must be gone (terminal means gone)')
  assert.strictEqual(runNode(SCRIPT, ['consume', '--root', h.root]).status, 0, 'consume on an absent file must still exit 0')
  const none = runNode(SCRIPT, ['show', '--root', h.root])
  assert.strictEqual(none.status, 1, 'show with nothing pending must exit 1: ' + none.stdout + none.stderr)
  assert.ok((none.stdout + none.stderr).includes('no pending question'), 'show must say nothing is pending: ' + none.stderr)
})

test('AC-20261102-02-16: runNode starts the child without the child-session marker unless opts.env sets it', () => {
  const dir = fs.realpathSync(tmpdir('pq-env'))
  const probe = path.join(dir, 'probe.js')
  fs.writeFileSync(probe, 'console.log(String(process.env.CLAUDE_CODE_CHILD_SESSION))\n')
  const rel = path.relative(SPEC, probe)
  const prev = process.env.CLAUDE_CODE_CHILD_SESSION
  process.env.CLAUDE_CODE_CHILD_SESSION = '1'
  try {
    assert.strictEqual(runNode(rel, []).stdout.trim(), 'undefined',
      'a leaked marker makes every in-session driver pin red when the gate runs inside a lane worker')
    assert.strictEqual(runNode(rel, [], { env: { CLAUDE_CODE_CHILD_SESSION: '1' } }).stdout.trim(), '1',
      'a delegated test must be able to set the marker through opts.env')
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_CHILD_SESSION
    else process.env.CLAUDE_CODE_CHILD_SESSION = prev
  }
})
