'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, ROOT, tmpdir } = require('../helpers')
const { run, stateOf, returnFileWith, makeReplayHost, ledgerRows, CLEAN_RETURN } = require('./review-driver.fixtures')

// specs/20261013/01-review-closes-its-own-softs.md D1-D8 — spec-review-driver.js's CLOSE-step soft
// sweep, `--mark soft-swept --file`, the unswept-soft and ceiling refusals at `--mark closed`, the
// close-row re-stamp, the DISPOSITIONS sentence, and the doctrine wording.
// AC-20261013-01-1 .. AC-20261013-01-7, AC-20261013-01-9.

const TWO_SOFT_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'y', file: 'src/bar.js', line: 7, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

const HARD_AND_SOFT_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'hard', claim: 'h', file: 'a.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 's', file: 'b.js', line: 2, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

let seq = 0
// A fresh host driven to CLOSE off a green-legs reviewer return. Soft-only and zero-survivor
// returns both self-disposition at the reviewer-returned mark and land CLOSE directly.
function hostAtClose(body, label) {
  seq += 1
  const host = makeReplayHost('softsweep' + seq + label, { acId: 'AC-20260820-99-' + (40 + seq) })
  run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: a green-legs fixture must reach REVIEWER before any sweep AC can be exercised')
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('softsweep-ret' + seq, body))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: a soft-only or empty return must land CLOSE off the reviewer-returned mark: ' + r.stdout + r.stderr)
  return host
}

const stateFile = (host) => path.join(host.sidecar, 'review-state.json')
const readState = (host) => JSON.parse(fs.readFileSync(stateFile(host), 'utf8'))
const writeSweep = (host, body, name = 'sweep.json') => {
  const dir = fs.realpathSync(tmpdir('sweepfile'))
  const f = path.join(dir, name)
  fs.writeFileSync(f, typeof body === 'string' ? body : JSON.stringify(body))
  return f
}
const mark = (host, file) => run(host.root, host.spec, '--mark', 'soft-swept', ...(file ? ['--file', file] : []))
const closeRowOf = (host) => ledgerRows(host.root).find((r) => r.runId === readState(host).closeRunId)

const FIXED_AND_DEBT = { sweep: [{ ref: 'a0', outcome: 'fixed' }, { ref: 'a1', outcome: 'debt', reason: 'needs a decision' }] }
const ALL_DEBT = { sweep: [{ ref: 'a0', outcome: 'debt', reason: 'r0' }, { ref: 'a1', outcome: 'debt', reason: 'r1' }] }

function commitClose(host, extraPaths = []) {
  host.g('add', host.specRel, ...extraPaths)
  host.g('commit', '-q', '-m', 'close')
}

test('AC-20261013-01-1: WHEN the CLOSE step prints for a return of two softs THE SYSTEM SHALL print a 0. Soft sweep block before step 1 listing a0 then a1 and the --mark soft-swept --file <sweep.json> line, and for a zero-soft return SHALL print neither Soft sweep nor soft-swept', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'p1')
  const step = run(host.root, host.spec).stdout
  const sweepIdx = step.indexOf('0. Soft sweep')
  assert.notStrictEqual(sweepIdx, -1,
    'AC-20261013-01-1: the CLOSE step must print a "0. Soft sweep" block when the return carries softs — without it the session never learns a sweep is due and the soft is hand-queued again: ' + step)
  const oneIdx = step.indexOf('1. Apply the spec')
  assert.ok(oneIdx > sweepIdx,
    'AC-20261013-01-1: the sweep block must precede step 1 (Canonical Delta) — the sweep is step 0 of CLOSE: ' + step)
  const a0 = step.indexOf('a0 [soft] src/foo.js:1 — x')
  const a1 = step.indexOf('a1 [soft] src/bar.js:7 — y')
  assert.ok(a0 > sweepIdx && a1 > a0 && a1 < oneIdx,
    'AC-20261013-01-1: the block must list a0 then a1 in printed order inside step 0 — the refs are what the sweep file must cover: ' + step)
  assert.ok(step.includes('--mark soft-swept --file <sweep.json>'),
    'AC-20261013-01-1: the block must print the mark line the session runs after the workers return: ' + step)

  const clean = hostAtClose(CLEAN_RETURN, 'p1z')
  const zero = run(clean.root, clean.spec).stdout
  assert.ok(!zero.includes('Soft sweep') && !zero.includes('soft-swept'),
    'AC-20261013-01-1: a zero-soft CLOSE step must carry no sweep mention — in-flight zero-soft hosts must not notice the sweep: ' + zero)
})

test('AC-20261013-01-2: WHEN --mark soft-swept --file covers a0 fixed and a1 debt THE SYSTEM SHALL exit 0, write the softSweep tally to review-state.json, and append an Advisory debt block under ## Rationale with only the a1 line', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'p2')
  const before = fs.readFileSync(host.spec, 'utf8')
  fs.writeFileSync(host.spec, before + '\n## Rationale\n\nthe original why\n')
  const r = mark(host, writeSweep(host, FIXED_AND_DEBT))
  assert.strictEqual(r.status, 0,
    'AC-20261013-01-2: a sweep covering every printed soft exactly once must be accepted — otherwise no close can ever follow a soft: ' + r.stdout + r.stderr)

  const st = readState(host)
  assert.deepStrictEqual(st.softSweep, {
    fixed: 1, debt: 1,
    entries: [{ ref: 'a0', outcome: 'fixed', reason: '' }, { ref: 'a1', outcome: 'debt', reason: 'needs a decision' }],
  }, 'AC-20261013-01-2: review-state.json must record the tally and per-soft entries — the close mark and the close row read them: ' + JSON.stringify(st.softSweep))

  const lines = fs.readFileSync(host.spec, 'utf8').split('\n')
  const rationaleAt = lines.indexOf('## Rationale')
  const headAt = lines.indexOf('### Advisory debt (review ' + st.closeRunId + ')')
  assert.ok(rationaleAt !== -1 && headAt > rationaleAt,
    'AC-20261013-01-2: the debt block must land under the spec\'s existing ## Rationale — the spec is the durable home for an unfixed soft: ' + lines.join('\n'))
  assert.strictEqual(lines.indexOf('## Rationale', rationaleAt + 1), -1,
    'AC-20261013-01-2: an existing ## Rationale must be reused, never duplicated as a second heading')
  assert.strictEqual(lines[headAt + 1], '- a1 src/bar.js:7 — y — needs a decision',
    'AC-20261013-01-2: the line right after the block heading must be the a1 debt entry in the contract shape: ' + lines.slice(headAt).join('\n'))
  assert.ok(!lines.some((l) => /^- a0\b/.test(l)),
    'AC-20261013-01-2: a fixed soft is not debt — listing a0 would record a fixed finding as unresolved')
  assert.ok(lines.includes('the original why'),
    'AC-20261013-01-2: the append must preserve the existing Rationale text')

  // A spec with no ## Rationale heading gets one appended at the end.
  const bare = hostAtClose(TWO_SOFT_RETURN, 'p2b')
  const rb = mark(bare, writeSweep(bare, FIXED_AND_DEBT))
  assert.strictEqual(rb.status, 0, 'AC-20261013-01-2: a spec without a Rationale heading must still accept the sweep: ' + rb.stdout + rb.stderr)
  const bl = fs.readFileSync(bare.spec, 'utf8').split('\n')
  const rAt = bl.indexOf('## Rationale')
  const hAt = bl.indexOf('### Advisory debt (review ' + readState(bare).closeRunId + ')')
  assert.ok(rAt !== -1 && hAt > rAt && bl[hAt + 1] === '- a1 src/bar.js:7 — y — needs a decision',
    'AC-20261013-01-2: a missing ## Rationale heading must be appended so the debt has a home: ' + bl.join('\n'))
})

test('AC-20261013-01-3: WHEN --mark soft-swept carries a missing --file, non-JSON, an uncovered ref, a duplicate ref, an unknown ref, a bad outcome or a blank debt reason THE SYSTEM SHALL exit 2 naming the defect and leave review-state.json and the spec byte-identical', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'p3')
  const cases = [
    ['no --file', null, /--file/],
    ['not JSON', 'this is not json', /not valid JSON/],
    ['a1 uncovered', { sweep: [{ ref: 'a0', outcome: 'fixed' }] }, /uncovered a1/],
    ['a0 twice', { sweep: [{ ref: 'a0', outcome: 'fixed' }, { ref: 'a0', outcome: 'debt', reason: 'r' }, { ref: 'a1', outcome: 'fixed' }] }, /duplicate a0/],
    ['unknown a2', { sweep: [{ ref: 'a0', outcome: 'fixed' }, { ref: 'a1', outcome: 'fixed' }, { ref: 'a2', outcome: 'fixed' }] }, /unknown ref a2/],
    ['outcome waive', { sweep: [{ ref: 'a0', outcome: 'fixed' }, { ref: 'a1', outcome: 'waive' }] }, /outcome/],
    ['blank reason', { sweep: [{ ref: 'a0', outcome: 'fixed' }, { ref: 'a1', outcome: 'debt', reason: '  ' }] }, /blank reason/],
  ]
  for (const [label, body, pattern] of cases) {
    const stBefore = fs.readFileSync(stateFile(host), 'utf8')
    const specBefore = fs.readFileSync(host.spec, 'utf8')
    const r = mark(host, body === null ? null : writeSweep(host, body))
    assert.strictEqual(r.status, 2,
      'AC-20261013-01-3 (' + label + '): a malformed sweep must be refused at exit 2, never half-recorded: ' + r.stdout + r.stderr)
    assert.match(r.stderr, pattern,
      'AC-20261013-01-3 (' + label + '): the refusal must name its own defect so the session can fix the file: ' + r.stderr)
    assert.strictEqual(fs.readFileSync(stateFile(host), 'utf8'), stBefore,
      'AC-20261013-01-3 (' + label + '): a refused mark must leave review-state.json byte-identical — a partial write would let --mark closed pass on a bad sweep')
    assert.strictEqual(fs.readFileSync(host.spec, 'utf8'), specBefore,
      'AC-20261013-01-3 (' + label + '): a refused mark must leave the spec byte-identical — no debt block from a rejected sweep')
  }
})

test('AC-20261013-01-4: WHEN --mark closed runs with a soft in the return and no sweep mark THE SYSTEM SHALL exit 2 naming --mark soft-swept --file <sweep.json> before any deviations or dirty-tree message and leave review-state.json byte-identical', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'p4')
  // Trip the two refusals that would otherwise fire first: a lingering sidecar and a dirty tree.
  fs.writeFileSync(host.spec.replace(/\.md$/, '.deviations.md'), '# Deviations — x\n- a departure\n')
  fs.appendFileSync(path.join(host.root, 'src/foo.js'), '// dirty\n')
  const stBefore = fs.readFileSync(stateFile(host), 'utf8')
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 2,
    'AC-20261013-01-4: a close with an unswept soft must be refused — this is the hole hand-queuing filled: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes('--mark soft-swept --file <sweep.json>'),
    'AC-20261013-01-4: the refusal must name the sweep mark as the remedy, or the session is stuck: ' + r.stderr)
  assert.doesNotMatch(r.stderr, /deviations sidecar|dirty/,
    'AC-20261013-01-4: the unswept-soft check must run BEFORE the deviations and dirty-tree refusals, or the session fixes two unrelated things and meets this third: ' + r.stderr)
  assert.strictEqual(fs.readFileSync(stateFile(host), 'utf8'), stBefore,
    'AC-20261013-01-4: the refusal must leave review-state.json byte-identical')
})

// Drives a host through sweep + close commit with `body` as the sweep and the given tree edit.
function closeWith(label, sweep, edit) {
  const host = hostAtClose(TWO_SOFT_RETURN, label)
  const judged = closeRowOf(host).diff.head
  const m = mark(host, writeSweep(host, sweep))
  assert.strictEqual(m.status, 0,
    'setup precondition: the sweep mark must be accepted before the ceiling can be measured: ' + m.stdout + m.stderr)
  const extra = edit(host)
  commitClose(host, extra)
  return { host, judged, r: run(host.root, host.spec, '--mark', 'closed') }
}

const commentLines = (n) => Array.from({ length: n }, (_, i) => '// line ' + i).join('\n') + '\n'
const prependFoo = (n) => (host) => {
  const p = path.join(host.root, 'src/foo.js')
  fs.writeFileSync(p, commentLines(n) + fs.readFileSync(p, 'utf8'))
  return ['src/foo.js']
}

test('AC-20261013-01-5: WHEN --mark closed follows a sweep with a fixed soft THE SYSTEM SHALL refuse 61 changed lines as soft sweep over ceiling with the count, the ceiling and the revert command, accept 60, refuse a binary row, and not measure a sweep with fixed = 0', () => {
  const over = closeWith('c61', FIXED_AND_DEBT, prependFoo(61))
  assert.strictEqual(over.r.status, 2,
    'AC-20261013-01-5: 61 changed lines against a ceiling of 60 must be refused — an unbounded unreviewed close-tree change defeats the ceiling: ' + over.r.stdout + over.r.stderr)
  assert.match(over.r.stderr, /soft sweep over ceiling/, 'AC-20261013-01-5: the refusal must carry the fixed phrase the doctrine and session key on: ' + over.r.stderr)
  assert.match(over.r.stderr, /\b61\b/, 'AC-20261013-01-5: the refusal must state the measured count: ' + over.r.stderr)
  assert.match(over.r.stderr, /\b60\b/, 'AC-20261013-01-5: the refusal must state the ceiling: ' + over.r.stderr)
  assert.ok(over.r.stderr.includes('git checkout ' + over.judged.slice(0, 7)) && /-- src\/foo\.js/.test(over.r.stderr),
    'AC-20261013-01-5: the refusal must name the revert command for the oversized file so the session can recover: ' + over.r.stderr)

  const at = closeWith('c60', FIXED_AND_DEBT, prependFoo(60))
  assert.strictEqual(at.r.status, 0,
    'AC-20261013-01-5: exactly 60 changed lines is within the ceiling and must close — an off-by-one here refuses every honest max-size sweep: ' + at.r.stdout + at.r.stderr)

  const bin = closeWith('cbin', FIXED_AND_DEBT, (host) => {
    fs.writeFileSync(path.join(host.root, 'src/blob.bin'), Buffer.from([0, 1, 2, 0, 255, 0]))
    return ['src/blob.bin']
  })
  assert.strictEqual(bin.r.status, 2,
    'AC-20261013-01-5: a binary change cannot be line-counted and must be refused, or a fix could smuggle any size past the ceiling: ' + bin.r.stdout + bin.r.stderr)
  assert.match(bin.r.stderr, /soft sweep over ceiling/, 'AC-20261013-01-5: the binary refusal must use the same phrase: ' + bin.r.stderr)

  const none = closeWith('c0', ALL_DEBT, prependFoo(61))
  assert.strictEqual(none.r.status, 0,
    'AC-20261013-01-5: a sweep that fixed nothing runs no measurement — the ceiling bounds fixes, not unrelated close-commit content: ' + none.r.stdout + none.r.stderr)
})

test('AC-20261013-01-6: WHEN --mark closed is accepted after a sweep of one fixed and one debt THE SYSTEM SHALL re-stamp the close row in place with softSweep {fixed:1, debt:1}, adding no row and changing no other key', () => {
  const host = hostAtClose(TWO_SOFT_RETURN, 'p6')
  const runId = readState(host).closeRunId
  const rowBefore = closeRowOf(host)
  const reviewRowsBefore = ledgerRows(host.root).filter((r) => r.stage === 'review').length
  assert.ok(!('softSweep' in rowBefore),
    'setup precondition: verdict.js writes the close row before the sweep, so it carries no softSweep yet: ' + JSON.stringify(rowBefore))
  const m = mark(host, writeSweep(host, FIXED_AND_DEBT))
  assert.strictEqual(m.status, 0, 'setup precondition: the sweep mark must be accepted: ' + m.stdout + m.stderr)
  commitClose(host)
  const r = run(host.root, host.spec, '--mark', 'closed')
  assert.strictEqual(r.status, 0, 'AC-20261013-01-6: a swept close within the ceiling must be accepted: ' + r.stdout + r.stderr)

  const rows = ledgerRows(host.root)
  assert.strictEqual(rows.filter((x) => x.stage === 'review').length, reviewRowsBefore,
    'AC-20261013-01-6: the re-stamp is in place — a second review row would double-count the run')
  const after = rows.find((x) => x.runId === runId)
  assert.deepStrictEqual(after.softSweep, { fixed: 1, debt: 1 },
    'AC-20261013-01-6: the close row must carry the sweep tally so the ledger can answer how often softs are fixed vs recorded: ' + JSON.stringify(after))
  const { softSweep, ...rest } = after
  assert.strictEqual(JSON.stringify(rest), JSON.stringify(rowBefore),
    'AC-20261013-01-6: every other key of the close row must stay byte-identical — findings\' key order is pinned elsewhere')
})

test('AC-20261013-01-7: WHEN the DISPOSITIONS step prints for a hard plus a soft THE SYSTEM SHALL print the advisory heading followed by the swept-at-CLOSE sentence and never the substring spec-queue add', () => {
  seq += 1
  const host = makeReplayHost('softsweep' + seq + 'p7', { acId: 'AC-20260820-99-' + (40 + seq) })
  run(host.root, host.spec)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('softsweep-ret' + seq, HARD_AND_SOFT_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a hard survivor must land DISPOSITIONS')
  const step = run(host.root, host.spec).stdout
  const headAt = step.indexOf('advisory (1, recorded, not dispositioned):')
  assert.notStrictEqual(headAt, -1, 'AC-20261013-01-7: the advisory heading must survive byte-identical: ' + step)
  const sentence = 'Softs are swept at CLOSE (fixed under the ceiling or recorded as debt), never dispositioned here.'
  assert.ok(step.indexOf(sentence) > headAt,
    'AC-20261013-01-7: the step must state the sweep rule after the advisory block — the printed step is what the session follows: ' + step)
  assert.ok(!step.includes('spec-queue add'),
    'AC-20261013-01-7: the printed step must not tell the session to queue a soft — that instruction is the mechanism that filled the queue: ' + step)
})

test('AC-20261013-01-9: WHEN the review doctrine files are read THE SYSTEM SHALL carry the sweep rule and none of the retired queue wording, with stage-review.md within 93 lines', () => {
  const stage = 'spec/doctrine/stages/stage-review.md'
  const reviewer = 'spec/agents/reviewer.md'
  assert.ok(fs.existsSync(path.join(ROOT, stage)) && fs.existsSync(path.join(ROOT, reviewer)),
    'both doctrine files must exist for the sweep wording to be pinned')
  const s = read(stage)
  const rv = read(reviewer)
  assert.doesNotMatch(s, /one\s+worth\s+fixing/,
    'AC-20261013-01-9: stage-review.md still tells the session to queue a soft worth fixing — doctrine must state the enforced rule')
  assert.doesNotMatch(s, /wants\s+fixed/,
    'AC-20261013-01-9: stage-review.md still carries the retired queue wording')
  assert.doesNotMatch(rv, /never\s+fix-dispatched\s+inside\s+review/,
    'AC-20261013-01-9: reviewer.md still says softs are never fixed inside review, contradicting the CLOSE sweep')
  assert.match(s, /soft-swept/,
    'AC-20261013-01-9: stage-review.md must name the soft-swept mark or the CLOSE step\'s sweep is undocumented')
  assert.ok(s.replace(/\n$/, '').split('\n').length <= 93,
    'AC-20261013-01-9: stage-review.md must stay within the doctrine read-load budget of 93 lines')
})
