'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { run, stateOf, returnFileWith, oneFixReturnFile, makeReplayHost, makeHost, ledgerRows, CLEAN_RETURN, SURVIVOR_RETURN } = require('./review-driver.fixtures')

// specs/20261024/06-close-tree-equals-judged-tree.md D1/D3/D4/D5 — spec-review-driver.js's
// unconditional close-tree drift refusal, advisory CLOSE block, debt written by the CLOSE verdict,
// and the DISPOSITIONS/FIX ride-along sentence.

const TWO_SOFT_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'y', file: 'src/bar.js', line: 7, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

const HARD_AND_TWO_SOFT_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'hard', claim: 'h', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'x', file: 'src/foo.js', line: 2, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'y', file: 'src/bar.js', line: 7, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

const RIDE_ALONG = 'softs may ride this fix round (same workers, same files); the fix-delta pass re-reviews whatever changed'
const DIRECT_LANE = 'A soft worth fixing is a Direct-lane commit through the host gate after merge-back, or rides the next fix round; never a change before --mark closed.'

let seq = 0
// A fresh host driven to CLOSE off a green-legs reviewer return; a soft-only or empty return
// self-dispositions at the reviewer-returned mark and lands CLOSE directly.
function hostAtClose(body, label, prep) {
  seq += 1
  const host = makeReplayHost('closedrift' + seq + label, { acId: 'AC-20260820-99-' + (60 + seq) })
  if (prep) prep(host)
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a green-legs fixture must reach REVIEWER before any close-tree AC can be exercised')
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('closedrift-ret' + seq, body))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a soft-only or empty return must land CLOSE off the reviewer-returned mark: ' + r.stdout + r.stderr)
  return host
}

const readState = (host) => JSON.parse(fs.readFileSync(path.join(host.sidecar, 'review-state.json'), 'utf8'))
const ledgerPath = (host) => path.join(host.root, '.claude/spec-runs.jsonl')
const commentLines = (n) => Array.from({ length: n }, (_, i) => '// line ' + i).join('\n') + '\n'
const prependTo = (host, rel, n) => {
  const p = path.join(host.root, rel)
  fs.writeFileSync(p, commentLines(n) + fs.readFileSync(p, 'utf8'))
}
const commitClose = (host, extra = []) => {
  host.g('add', host.specRel, 'tests/foo.test.js', ...extra)
  host.g('commit', '-q', '-m', 'close')
}

test('AC-20261024-06-1: WHEN --mark closed runs with no soft in the return and the close commit changed 3 lines of a tracked file THE SYSTEM SHALL exit 2 with close tree drifted from the judged tree, name the file and the git checkout remedy, and leave the ledger, the spec and review-state.json byte-identical', () => {
  const host = hostAtClose(CLEAN_RETURN, 'drift3')
  const judged = readState(host).judgedTree
  assert.match(String(judged), /^[0-9a-f]{40}$/, 'setup precondition: the close-row append must pin the judged tree sha')
  prependTo(host, 'src/foo.js', 3)
  commitClose(host, ['src/foo.js'])
  const before = [ledgerPath(host), host.spec, path.join(host.sidecar, 'review-state.json')].map((f) => fs.readFileSync(f, 'utf8'))

  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'a close commit that changed reviewed code after the verdict must be refused even with no soft in play — otherwise anything can land unreviewed: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /close tree drifted from the judged tree: 3 changed line\(s\)/,
    'the refusal must carry the fixed phrase and the measured count so the session knows how far the tree moved: ' + r.stderr)
  assert.ok(r.stderr.includes('git checkout ' + judged + ' -- src/foo.js'),
    'the refusal must name the file and the revert command against the judged tree, or the session cannot recover: ' + r.stderr)
  const after = [ledgerPath(host), host.spec, path.join(host.sidecar, 'review-state.json')].map((f) => fs.readFileSync(f, 'utf8'))
  assert.deepStrictEqual(after, before,
    'a refused close must leave the ledger, the spec file and review-state.json byte-identical — a partial write would let a re-run pass on a half-recorded close')
})

test('AC-20261024-06-2: WHEN a 70-line hard fix is left uncommitted through fix-applied and committed only with the close commit THE SYSTEM SHALL CONTINUE TO accept --mark closed against the judged tree snapshot', () => {
  const host = makeHost()
  const g = (...a) => execFileSync('git', ['-C', host.root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' })
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER', 'setup: a green-legs fixture must reach REVIEWER')
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('closedrift-judged1', SURVIVOR_RETURN))
  const dispR = run(host.root, host.spec, '--mark', 'dispositions', '--file', oneFixReturnFile('closedrift-disp', 's0'),
    '--waived', '0', '--rejected', '0', '--fix-dispatched', '1')
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup: dispatching a fix for the hard survivor must land FIX: ' + dispR.stdout + dispR.stderr)

  // The hard fix is written by workers and left uncommitted; the session commits it only at close.
  prependTo(host, 'src/foo.js', 70)
  const fixR = run(host.root, host.spec, '--mark', 'fix-applied')
  assert.strictEqual(fixR.status, 0, 'setup: fix-applied over the uncommitted fix must be accepted: ' + fixR.stdout + fixR.stderr)
  const r2 = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('closedrift-judged2', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE', 'setup: a clean fix-delta return must land CLOSE: ' + r2.stdout + r2.stderr)

  g('add', '-A')
  g('commit', '-q', '-m', 'close + hard fix')
  const closed = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0,
    'the 70 reviewed hard-fix lines are in the judged snapshot, so zero drift must be measured against it, not HEAD — counting them refuses every close that commits a fix late: ' + closed.stdout + closed.stderr)
})

test('AC-20261024-06-2: WHEN the host tracks a gitignored file over 60 lines THE SYSTEM SHALL CONTINUE TO keep it in the judged tree snapshot and accept --mark closed', () => {
  const host = hostAtClose(CLEAN_RETURN, 'tracked-ignored', (h) => {
    prependTo(h, 'src/foo.js', 80)
    h.g('add', '-A'); h.g('commit', '-q', '-m', 'pad')
    fs.appendFileSync(path.join(h.root, '.git/info/exclude'), 'src/foo.js\n')
  })
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a tracked file matching .gitignore dropped from the judged snapshot reads as 80+ drifted lines and would refuse every close on a host that tracks one: ' + r.stdout + r.stderr)
})

test('AC-20261024-06-2: WHEN the close commit deletes a committed deviations sidecar of 70 lines THE SYSTEM SHALL CONTINUE TO exclude that deletion from the drift tally and accept --mark closed', () => {
  const host = hostAtClose(CLEAN_RETURN, 'devsidecar', (h) => {
    const dev = h.spec.replace(/\.md$/, '.deviations.md')
    fs.writeFileSync(dev, '# Deviations — x\n' + Array.from({ length: 70 }, (_, i) => '- departure ' + i).join('\n') + '\n')
    h.g('add', '-A'); h.g('commit', '-q', '-m', 'sidecar')
  })
  const dev = host.spec.replace(/\.md$/, '.deviations.md')
  fs.rmSync(dev)
  commitClose(host, [path.relative(host.root, dev)])
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'CLOSE itself deletes the deviations sidecar, so counting its lines as drift makes close unreachable: ' + r.stdout + r.stderr)
})

test('AC-20261024-06-5: WHEN the CLOSE step prints for a return of two softs THE SYSTEM SHALL print the advisory recorded-as-debt heading, a0 then a1 and the Direct-lane sentence, and never --mark soft-swept, sweep.json or changed lines', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'close-print')
  const step = run(host.root, host.spec).stdout
  const head = step.indexOf('advisory — recorded as debt, none fixed here:')
  assert.notStrictEqual(head, -1,
    'the CLOSE step must print the advisory heading when the return carries softs — without it the session does not learn the softs were recorded: ' + step)
  const a0 = step.indexOf('a0 [soft] src/foo.js:1 — x')
  const a1 = step.indexOf('a1 [soft] src/bar.js:7 — y')
  assert.ok(a0 > head && a1 > a0,
    'a0 then a1 must print in order under the heading: ' + step)
  assert.ok(step.indexOf(DIRECT_LANE) > a1,
    'the Direct-lane sentence must follow the softs so the session knows the one sanctioned route for fixing one: ' + step)
  for (const banned of ['--mark soft-swept', 'sweep.json', 'changed lines']) {
    assert.ok(!step.includes(banned),
      'the CLOSE step must not mention "' + banned + '" — it points the session at a mark and a ceiling that no longer exist: ' + step)
  }
})

test('AC-20261024-06-7: WHEN the CLOSE verdict flips a spec to done with two softs THE SYSTEM SHALL write the Advisory debt block in that same spec write, leave the spec byte-identical across the accepted --mark closed, and carry no softSweep key on the close row', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'debt')
  const runId = readState(host).closeRunId
  const text = fs.readFileSync(host.spec, 'utf8')
  assert.match(text, /status:\s*done/, 'setup precondition: the CLOSE verdict must have flipped the status')
  const lines = text.split('\n')
  const rat = lines.indexOf('## Rationale')
  const head = lines.indexOf('### Advisory debt (review ' + runId + ')')
  assert.ok(rat !== -1 && head > rat,
    'the verdict write must carry the debt block under ## Rationale — a debt written after the close commit never reaches main: ' + text)
  assert.strictEqual(lines[head + 1], '- a0 src/foo.js:1 — x',
    'the first debt line must be the a0 soft in the contract shape: ' + lines.slice(head).join('\n'))
  assert.strictEqual(lines[head + 2], '- a1 src/bar.js:7 — y',
    'the second debt line must be the a1 soft: ' + lines.slice(head).join('\n'))
  assert.ok(!(lines[head + 3] || '').startsWith('- a'), 'exactly two debt lines must be written, one per soft')

  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0,
    'a close commit carrying the debt block, with nothing else changed, must be accepted: ' + r.stdout + r.stderr)
  assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), text,
    '--mark closed must never write the spec file — a write after the close commit leaves a dirty worktree and strands the debt')
  const row = ledgerRows(host.root).find((x) => x.runId === runId)
  assert.ok(row && !('softSweep' in row),
    'the close row must carry no softSweep key and is never re-stamped: ' + JSON.stringify(row))
})

test('AC-20261024-06-9: WHEN the DISPOSITIONS step and then the FIX step print for one hard and two softs THE SYSTEM SHALL print the two softs under the ride-along sentence at each, keep the advisory (2, ...) heading at DISPOSITIONS, and print Softs are swept at CLOSE at neither', () => {
  seq += 1
  const host = makeReplayHost('closedrift' + seq + 'ride', { acId: 'AC-20260820-99-' + (60 + seq) })
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('closedrift-ride' + seq, HARD_AND_TWO_SOFT_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a hard survivor must land DISPOSITIONS')

  const disp = run(host.root, host.spec).stdout
  const head = disp.indexOf('advisory (2, recorded, not dispositioned):')
  assert.notStrictEqual(head, -1, 'the advisory heading must stay byte-identical at DISPOSITIONS: ' + disp)
  assert.ok(disp.includes('src/foo.js:2 — x') && disp.includes('src/bar.js:7 — y'),
    'both softs must print at DISPOSITIONS: ' + disp)
  assert.ok(disp.indexOf(RIDE_ALONG) > head,
    'the ride-along sentence must follow the advisory block, telling the session softs may join the fix round: ' + disp)
  assert.ok(!disp.includes('Softs are swept at CLOSE'),
    'the retired sweep sentence would send the session to a CLOSE sweep that no longer exists: ' + disp)

  const m = run(host.root, host.spec, '--mark', 'dispositions', '--file', oneFixReturnFile('closedrift-ride-disp', 's0'))
  assert.strictEqual(stateOf(host.root, host.spec), 'FIX', 'setup precondition: a fix disposition must land FIX: ' + m.stdout + m.stderr)
  const fix = run(host.root, host.spec).stdout
  const dispatchAt = fix.indexOf('dispatch fix workers')
  assert.ok(fix.indexOf(RIDE_ALONG) > dispatchAt && dispatchAt !== -1,
    'the FIX step must print the ride-along sentence after its dispatch line: ' + fix)
  assert.ok(fix.includes('src/foo.js:2 — x') && fix.includes('src/bar.js:7 — y'),
    'the FIX step must print the current softs so the workers can fold them into the round: ' + fix)
  assert.ok(!fix.includes('Softs are swept at CLOSE'), 'the retired sweep sentence must not print at FIX either: ' + fix)
})

test('AC-20261024-06-11: WHEN a disposer return names a0 against a return of one hard and two softs THE SYSTEM SHALL CONTINUE TO refuse it as matching nothing in the pools', () => {
  seq += 1
  const host = makeReplayHost('closedrift' + seq + 'a0', { acId: 'AC-20260820-99-' + (60 + seq) })
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('closedrift-a0-' + seq, HARD_AND_TWO_SOFT_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS', 'setup precondition: a hard survivor must land DISPOSITIONS')
  const bad = returnFileWith('closedrift-a0-bad' + seq, {
    verdict: 'DISPOSED',
    dispositions: [
      { ref: 's0', recommended: 'waive', reason: 'sanctioned hard survivor' },
      { ref: 'a0', recommended: 'fix', reason: 'a soft never enters the pool' },
    ],
    tokens: 1,
  })
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', bad)
  assert.strictEqual(r.status, 2,
    'a disposer entry naming a soft must be refused — letting softs into dispositions changes the verdict pool arithmetic: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /a0, which matches nothing in the survivor or leg-finding pools/,
    'the refusal must name a0 as matching nothing in the pools: ' + r.stderr)
})
