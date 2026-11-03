'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeTwoSurvivorPoolHost, readState, readStateRaw, run, stateOf, returnFileWith } = require('./disposer-gate.fixtures')

// specs/20261103/09-an-executed-repro-answers-the-reject.md D3-D6: the disposer's repro-backed reject is
// accepted at the dispositions mark under policy.stops.rejectWithEvidence, in-session.

const PICK = '📌 Auto-picked accept reject on executed repro: s0 — host policy stops.rejectWithEvidence: accept (veto anytime)'
const VETO = 'To answer differently: set final to fix or waive on that entry in <file> with overriddenBy "user" and overrideReason, and re-run this mark before the next one.'
const COUNTS = ['--waived', '0', '--rejected', '1', '--fix-dispatched', '2']
const REPRO = { command: 'node --test tests/x.test.js', observed: 'ℹ pass 1' }

const returnBody = (s0 = {}) => ({
  verdict: 'DISPOSED', tokens: 5, dispositions: [
    { ref: 's0', recommended: 'reject', reason: 'executed: the pin passes', repro: REPRO, ...s0 },
    { ref: 's1', recommended: 'fix', reason: 'D1' },
    { ref: 'leg:drift', recommended: 'fix', reason: 'D2' },
  ],
})

function hostWith(name, stops) {
  const host = makeTwoSurvivorPoolHost(name)
  if (stops) {
    const cfgPath = path.join(host.root, '.claude/spec.config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.policy = { stops }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  }
  return host
}

const mark = (host, file, counts = COUNTS) => run(host.root, host.spec, '--mark', 'dispositions', '--file', file, ...counts)
const copy = (host) => path.join(host.sidecar, 'disposer-return-1.json')

test('AC-20261103-09-3: an in-session dispositions mark on a default host accepts a repro-backed reject itself, printing the pick and veto lines, stamping final and acceptedBy, recording the pick and deriving FIX', () => {
  const host = hostWith('rwe-accept')
  const r = mark(host, returnFileWith('rwe-accept-r', returnBody()))
  assert.strictEqual(r.status, 0, 'a repro-backed reject on a default host must be accepted at the mark, or the user is still asked what the disposer proved: ' + r.stderr + r.stdout)
  assert.ok(r.stdout.includes(PICK + '\n' + VETO) && r.stdout.indexOf(PICK) < r.stdout.indexOf('## Step'), 'stdout must carry the pick line then the veto line before the next step, or the user cannot see or veto the auto-pick: ' + r.stdout)
  const s0 = JSON.parse(fs.readFileSync(copy(host), 'utf8')).dispositions.find((d) => d.ref === 's0')
  assert.strictEqual(s0.final, 'reject', 'the written return must carry final reject on s0, or the tally has no answer: ' + JSON.stringify(s0))
  assert.strictEqual(s0.acceptedBy, 'policy', 'the stamp must name policy, or the veto and the report cannot tell it from a user answer: ' + JSON.stringify(s0))
  assert.ok(!('overriddenBy' in s0), 'a policy accept is not an override: ' + JSON.stringify(s0))
  const marks = readState(host.sidecar)
  const d = marks.dispositions
  assert.deepStrictEqual({ waived: d.waived, rejected: d.rejected, fixDispatched: d.fixDispatched }, { waived: 0, rejected: 1, fixDispatched: 2 }, 'the tally must count the accepted reject: ' + JSON.stringify(d))
  assert.ok(typeof d.word === 'string' && d.word, 'the verdict word must be recorded: ' + JSON.stringify(d))
  assert.strictEqual(marks.disposer.overrides, 0, 'a policy accept must not count as an override: ' + JSON.stringify(marks.disposer))
  const p = marks.policyPicks && marks.policyPicks[0]
  assert.ok(p, 'the pick must be recorded in marks.policyPicks or the report has no trail: ' + JSON.stringify(marks))
  assert.deepStrictEqual({ key: p.key, value: p.value, label: p.label }, { key: 'rejectWithEvidence', value: 'accept', label: 'accept reject on executed repro: s0' }, 'the pick record must name key, value and label, or the REPORT trail cannot say which policy auto-accepted which reject: ' + JSON.stringify(p))
  assert.ok(!Number.isNaN(Date.parse(p.at)), 'the record needs an ISO time: ' + p.at)
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'the run must advance to FIX without a question')
})

test('AC-20261103-09-4: a malformed repro or a disposer-supplied acceptedBy is refused with exit 2 naming the ref and key, leaving the sidecar byte-identical and writing no return copy', () => {
  const host = hostWith('rwe-refuse')
  const before = readStateRaw(host.sidecar)
  const cases = [
    ['string repro', { repro: 'ran it' }, /s0[\s\S]*repro[\s\S]*\{ command, observed \}|repro[\s\S]*s0[\s\S]*\{ command, observed \}/],
    ['blank observed', { repro: { command: 'x', observed: '' } }, /s0[\s\S]*repro[\s\S]*\{ command, observed \}|repro[\s\S]*s0[\s\S]*\{ command, observed \}/],
    ['acceptedBy on a waive', { recommended: 'waive', repro: undefined, acceptedBy: 'policy' }, /s0[\s\S]*acceptedBy|acceptedBy[\s\S]*s0/],
  ]
  for (const [name, patch, re] of cases) {
    const r = mark(host, returnFileWith('rwe-refuse-' + name.replace(/\W/g, ''), returnBody(patch)), ['--waived', '0', '--rejected', '1', '--fix-dispatched', '2'])
    assert.strictEqual(r.status, 2, name + ' must exit 2, or a malformed sanction passes the mark: ' + r.stdout + r.stderr)
    assert.match(r.stderr, re, name + ' refusal must name the ref and the key: ' + r.stderr)
    assert.ok(!fs.existsSync(copy(host)), name + ' must write no disposer-return-1.json')
    assert.strictEqual(readStateRaw(host.sidecar), before, name + ' must leave review-state.json byte-identical')
  }
})

test('AC-20261103-09-5 (SHALL CONTINUE TO): under stops.rejectWithEvidence ask the in-session mark exits 0 with no pick line, stamps nothing and records no policyPicks', () => {
  const host = hostWith('rwe-ask', { rejectWithEvidence: 'ask' })
  const r = mark(host, returnFileWith('rwe-ask-r', returnBody()))
  assert.strictEqual(r.status, 0, 'ask must leave today\'s mark working: ' + r.stderr + r.stdout)
  assert.ok(!r.stdout.includes('📌'), 'ask must print no pick line, or the user is told of a pick never made: ' + r.stdout)
  const s0 = JSON.parse(fs.readFileSync(copy(host), 'utf8')).dispositions.find((d) => d.ref === 's0')
  assert.ok(!('final' in s0) && !('acceptedBy' in s0), 'ask must leave s0 unstamped: ' + JSON.stringify(s0))
  const marks = readState(host.sidecar)
  assert.ok(!('policyPicks' in marks), 'ask must record no pick: ' + JSON.stringify(marks))
  assert.strictEqual(marks.dispositions.rejected, 1, 'the reject still tallies from the recommendation alone: ' + JSON.stringify(marks.dispositions))
})

test('AC-20261103-09-11: the in-session DISPOSITIONS step names the accept policy and "accepted at the mark" on a default host, and today\'s sentence with no rejectWithEvidence under ask', () => {
  const def = run(...(() => { const h = hostWith('rwe-step'); return [h.root, h.spec] })())
  assert.ok(def.stdout.includes('host policy stops.rejectWithEvidence: accept'), 'the accept step must name the policy, or the session asks about what the mark accepts: ' + def.stdout)
  assert.ok(def.stdout.includes('accepted at the mark'), 'the accept step must say the reject is accepted at the mark: ' + def.stdout)
  const h = hostWith('rwe-step-ask', { rejectWithEvidence: 'ask' })
  const ask = run(h.root, h.spec)
  assert.ok(ask.stdout.includes('waive/reject recommendations go to the user'), 'ask must keep today\'s sentence, or the question is not asked: ' + ask.stdout)
  assert.ok(!ask.stdout.includes('rejectWithEvidence'), 'ask must not name the policy: ' + ask.stdout)
})

test('AC-20261103-09-12: a user edit of the stamped s0 to final fix with an override and a re-run of the mark prints no pick, counts three fixes, one override and no reject, and clears acceptedBy', () => {
  const host = hostWith('rwe-veto')
  const first = mark(host, returnFileWith('rwe-veto-r', returnBody()))
  assert.strictEqual(first.status, 0, 'setup: the accepting mark must succeed: ' + first.stderr + first.stdout)
  const file = copy(host)
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const s0 = doc.dispositions.find((d) => d.ref === 's0')
  assert.strictEqual(s0.acceptedBy, 'policy', 'the veto starts from a policy-stamped s0, or there is no pick to veto: ' + JSON.stringify(s0))
  Object.assign(s0, { final: 'fix', overriddenBy: 'user', overrideReason: 'the repro ran against the wrong fixture' })
  fs.writeFileSync(file, JSON.stringify(doc))
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', file, '--waived', '0', '--rejected', '0', '--fix-dispatched', '3')
  assert.strictEqual(r.status, 0, 'the veto re-run must be accepted: ' + r.stderr + r.stdout)
  assert.ok(!r.stdout.includes('📌'), 'a vetoed pick must not print again: ' + r.stdout)
  const marks = readState(host.sidecar)
  assert.strictEqual(marks.dispositions.fixDispatched, 3, 'the vetoed reject now dispatches as a fix: ' + JSON.stringify(marks.dispositions))
  assert.strictEqual(marks.dispositions.rejected, 0, 'no reject remains: ' + JSON.stringify(marks.dispositions))
  assert.strictEqual(marks.disposer.overrides, 1, 'the veto is one user override: ' + JSON.stringify(marks.disposer))
  const after = JSON.parse(fs.readFileSync(file, 'utf8')).dispositions.find((d) => d.ref === 's0')
  assert.ok(!('acceptedBy' in after), 'a vetoed entry must not stay stamped as policy-accepted: ' + JSON.stringify(after))
})
