'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, tmpdir, runNode, laneMarkerPath, gitRepo } = require('../helpers')

// specs/20261102/02-a-delegated-driver-stops-on-disk.md D1/D9 — pending-question.js is the one
// writer and reader of .claude/pending-question.json, and the helpers strip the child marker.
// specs/20261103/04-predictable-stops-become-host-policy.md D3/D10: AC-20261103-04-3 (user-only answers, the
// closed kinds, stopPolicy and policyPick), AC-20261103-04-14 (bareRun records laneExit on a stop answer).

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
  assert.match(robot.stdout + robot.stderr, /\buser\b/, 'the refusal must name the enum: ' + robot.stdout + robot.stderr)
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

// Regression (fix, this commit's body is the root cause): the parent session and its sub-agents
// share one environment, so CLAUDE_CODE_CHILD_SESSION marked the orchestrator as a worker and the
// merge step from the main root printed MERGE_READY. Delegation is read from the lane's git dir
// marker or the fan-out table — never from the environment.
test('isDelegated (AC-20261103-03-11) is false with the child env var set and no lane signal, true with the git-dir marker, true when the fan-out table lists the branch', () => {
  const root = fs.realpathSync(tmpdir('pq-delegated'))
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'seed')
  const probe = path.join(root, 'probe.js')
  fs.writeFileSync(probe, `console.log(String(require(${JSON.stringify(path.join(SPEC, SCRIPT))}).isDelegated(process.argv[2])))\n`)
  // The wave-open marker (specs/20261103/03) sits beside the lane marker in the private git dir; it is no lane signal.
  fs.writeFileSync(path.join(root, '.git', 'spec-wave-open'), JSON.stringify({ spec: 'specs/x.md', state: 'WAVE:scripts' }))
  const ask = () => runNode(path.relative(SPEC, probe), [root], { env: { CLAUDE_CODE_CHILD_SESSION: '1' } }).stdout.trim()
  assert.strictEqual(ask(), 'false',
    'the parent carries the child env var too — reading it marks the orchestrator as a worker and its merge step prints MERGE_READY')
  const marked = runNode(SCRIPT, ['mark', '--root', root])
  assert.strictEqual(marked.status, 0, 'mark must succeed inside a git repo: ' + marked.stderr)
  const mp = marked.stdout.trim()
  assert.strictEqual(mp, laneMarkerPath(root),
    'the marker must live in the private git dir, outside the working tree, or a review leg sees it as an out-of-plan file')
  assert.strictEqual(ask(), 'true', 'the marker is the manual-fork signal; without it a lane prints in-session asks it cannot make')
  const q = runNode(SCRIPT, ['is-delegated', '--root', root])
  assert.strictEqual(q.status + ':' + q.stdout.trim(), '0:true', 'the query form must say a marked lane is a lane, or prose commands re-derive the rule by hand')
  fs.unlinkSync(mp)
  assert.strictEqual(ask(), 'false', 'removing the marker must restore the in-session form')
  git('switch', '-q', '-c', 'spec/lane-x')
  fs.writeFileSync(path.join(root, '.git', 'spec-fanout.json'), JSON.stringify({ version: 1, lanes: [{ id: 'L1', branch: 'spec/lane-x' }] }))
  assert.strictEqual(ask(), 'true', 'a fan-out lane must be delegated even when the worker forgot to mark — the table is the forget-proof signal')
  git('switch', '-q', 'main')
  assert.strictEqual(ask(), 'false', 'the parent on main is never a lane, whatever the table holds')
  const nq = runNode(SCRIPT, ['is-delegated', '--root', root])
  assert.strictEqual(nq.status + ':' + nq.stdout.trim(), '1:false', 'the query form must exit 1 for the parent, so a shell test reads it as not-a-lane')
  const outside = runNode(SCRIPT, ['mark', '--root', fs.realpathSync(tmpdir('pq-nogit'))])
  assert.strictEqual(outside.status, 2, 'mark outside a git repo must refuse with the remedy: ' + outside.stdout)
})

const pq = () => require(path.join(SPEC, SCRIPT))

function policyHost(name, stops, fanout) {
  const root = fs.realpathSync(tmpdir(name))
  gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'), JSON.stringify({ policy: { stops } }))
  if (fanout) fs.writeFileSync(path.join(root, '.git', 'spec-fanout.json'), JSON.stringify(fanout))
  return root
}

const REPAIR = { repair: 'run one in-session repair round' }

test('AC-20261103-04-3: answer --by standing exits 2 naming user, and write refuses kind fix-dirty-tree as outside the closed set', () => {
  const h = host('pq-user-only')
  assert.strictEqual(write(h).status, 0, 'setup: the valid document must be written')
  const r = runNode(SCRIPT, ['answer', '--root', h.root, '--id', 'q1', '--label', 'queue /spec:fix and stop', '--by', 'standing'])
  assert.strictEqual(r.status, 2, 'a standing answer must be refused or a retired writer can still masquerade as the user: ' + r.stdout + r.stderr)
  assert.match(r.stdout + r.stderr, /\buser\b/, 'the refusal must name user as the only accepted value: ' + r.stdout + r.stderr)
  const dirty = host('pq-dirty-kind', { ...doc(), kind: 'fix-dirty-tree' })
  const w = write(dirty)
  assert.strictEqual(w.status, 2, 'the retired kind must be refused or fix.md can still write a question it no longer asks: ' + w.stdout + w.stderr)
  assert.ok((w.stdout + w.stderr).includes('kind "fix-dirty-tree" is not in the closed set'), 'the finding must name the kind: ' + w.stdout + w.stderr)
})

test('AC-20261103-04-3: stopPolicy overlays the fan-out table ask list so policyPick returns null, and without it policyPick returns the 📌 line and records the pick', () => {
  const m = pq()
  assert.strictEqual(typeof m.stopPolicy, 'function', 'pending-question.js must export stopPolicy, or no driver has one reader of the per-run override')
  assert.strictEqual(typeof m.policyPick, 'function', 'pending-question.js must export policyPick, or every driver re-derives the auto-pick line')
  const asked = policyHost('pq-stops-ask', { repairRound: 'repair' }, { version: 1, lanes: [], ask: ['repairRound'] })
  assert.strictEqual(m.stopPolicy(asked).repairRound, 'ask', 'a key in the table ask list must read as ask, or --ask relays nothing')
  const marks = {}
  assert.strictEqual(m.policyPick(asked, 'repairRound', REPAIR, marks), null, 'an ask stop must return null so the driver asks')
  assert.ok(!('policyPicks' in marks), 'a null pick must record nothing, or the report lists a pick that was never made')
  const all = policyHost('pq-stops-all', {}, { version: 1, lanes: [], ask: ['all'] })
  const keys = Object.keys(require(path.join(SPEC, 'scripts/lib/host-config')).POLICY_DEFAULTS.stops)
  assert.deepStrictEqual(m.stopPolicy(all), Object.fromEntries(keys.map((k) => [k, 'ask'])), 'the word all must turn every stops key to ask')
  const plain = policyHost('pq-stops-plain', { repairRound: 'repair' }, { version: 1, lanes: [] })
  const pm = {}
  const pick = m.policyPick(plain, 'repairRound', REPAIR, pm)
  assert.deepStrictEqual(pick, { value: 'repair', label: 'run one in-session repair round',
    line: '📌 Auto-picked run one in-session repair round — host policy stops.repairRound: repair (veto anytime)' },
    'the pick must carry the byte-exact veto line, or the user cannot recognise or veto it: ' + JSON.stringify(pick))
  const rec = pm.policyPicks && pm.policyPicks[0]
  assert.ok(rec, 'the pick must be appended to marks.policyPicks, or the fan-out report has no trail')
  assert.deepStrictEqual({ key: rec.key, value: rec.value, label: rec.label }, { key: 'repairRound', value: 'repair', label: 'run one in-session repair round' }, 'the record names key, value and label')
  assert.ok(!Number.isNaN(Date.parse(rec.at)), 'the record needs an ISO time: ' + rec.at)
  assert.strictEqual(m.policyPick(plain, 'repairRound', {}, {}), null, 'a value with no label must return null so the driver asks')
})

test('AC-20261103-09-9: stopPolicy reads rejectWithEvidence as ask when the fan-out table lists it and policyPick returns null, and without it policyPick returns the accept pick line', () => {
  const m = pq()
  const REJ = { accept: 'accept reject on executed repro: s0' }
  const asked = policyHost('pq-rwe-ask', undefined, { version: 1, lanes: [], ask: ['rejectWithEvidence'] })
  assert.strictEqual(m.stopPolicy(asked).rejectWithEvidence, 'ask', 'a rejectWithEvidence entry in the table ask list must read as ask, or --ask relays nothing')
  const marks = {}
  assert.strictEqual(m.policyPick(asked, 'rejectWithEvidence', REJ, marks), null, 'an ask stop must return null so the driver asks')
  assert.ok(!('policyPicks' in marks), 'a null pick must record nothing')
  const plain = policyHost('pq-rwe-plain', undefined, { version: 1, lanes: [] })
  assert.deepStrictEqual(m.policyPick(plain, 'rejectWithEvidence', REJ, {}), { value: 'accept', label: 'accept reject on executed repro: s0',
    line: '📌 Auto-picked accept reject on executed repro: s0 — host policy stops.rejectWithEvidence: accept (veto anytime)' },
  'the pick must carry the byte-exact veto line, or the user cannot recognise or veto it')
})

test('AC-20261103-04-14: bareRun sets marks.laneExit.reason to the chosen label when an answered file resumes with stop', () => {
  const h = host('pq-laneexit')
  assert.strictEqual(write(h).status, 0, 'setup: the valid document must be written')
  const label = 'queue /spec:fix and stop'
  assert.strictEqual(runNode(SCRIPT, ['answer', '--root', h.root, '--id', 'q1', '--label', label, '--by', 'user']).status, 0, 'setup: the answer must be recorded')
  const marks = {}
  const r = pq().bareRun(h.root, marks)
  assert.ok(r && r.changed, 'an answered file must be consumed and the sidecar marked changed')
  assert.ok(marks.laneExit && marks.laneExit.reason === label,
    'a stop answer must be recorded as the lane exit, or the parent returns the lane without a recognised stop: ' + JSON.stringify(marks.laneExit))
  assert.ok(!Number.isNaN(Date.parse(marks.laneExit.at)), 'the lane exit needs an ISO time')
})

// queue item q29 (/spec:fix): stop-policy is the prose commands' query form of stopPolicy.
test('stop-policy prints a stops key\'s effective value — the host default, the host\'s own value, ask under the fan-out table — and refuses an unknown key', () => {
  const val = (root, key) => runNode(SCRIPT, ['stop-policy', '--root', root, '--key', key])
  const def = val(policyHost('pq-sp-default', {}), 'rejectWithEvidence')
  assert.strictEqual(def.status + ':' + def.stdout.trim(), '0:accept', 'an unset key must print its default, or /spec:fix asks about a reject the review driver accepts: ' + def.stderr)
  const own = val(policyHost('pq-sp-ask', { rejectWithEvidence: 'ask' }), 'rejectWithEvidence')
  assert.strictEqual(own.stdout.trim(), 'ask', 'the host value must win, or a host that wants the question back never gets it')
  const lane = val(policyHost('pq-sp-lane', { rejectWithEvidence: 'accept' }, { version: 1, lanes: [], ask: ['rejectWithEvidence'] }), 'rejectWithEvidence')
  assert.strictEqual(lane.stdout.trim(), 'ask', 'the fan-out --ask overlay must apply, or a fix lane auto-accepts what the run asked to relay')
  const bad = val(policyHost('pq-sp-bad', {}), 'noSuchStop')
  assert.strictEqual(bad.status, 2, 'an unknown key must exit 2, or a typo in a prose reader reads as a value: ' + bad.stdout)
  assert.ok(bad.stderr.includes('rejectWithEvidence'), 'the refusal must list the valid keys: ' + bad.stderr)
})
