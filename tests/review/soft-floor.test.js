'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { makeHost, readState, readStateRaw, run, stateOf, toReviewer, returnFileWith, disposerReturn, CLEAN_RETURN } = require('./disposer-gate.fixtures')

// specs/20260909/04-review-soft-floor.md D5-D9, D11 — spec-review-driver.js's DISPOSITIONS step
// and reviewer-returned/dispositions mark handlers against a synthetic host, exercised via a
// soft-only, a mixed hard+soft, and an empty return. AC-20260909-04-6, -7, -9, -11.

const THREE_SURVIVOR_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'hard', claim: 'c-a', file: 'a.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'c-b', file: 'b.js', line: 2, impact: 'x', evidence: 'x' },
    { severity: 'hard', claim: 'c-c', file: 'c.js', line: 3, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

const SOFT_ONLY_RETURN = {
  verdict: 'CLEAN',
  survivors: [{ severity: 'soft', claim: 'x', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' }],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

const HARD_AND_SOFT_RETURN = {
  verdict: 'CLEAN',
  survivors: [
    { severity: 'hard', claim: 'x0', file: 'src/foo.js', line: 1, impact: 'x', evidence: 'x' },
    { severity: 'soft', claim: 'x1', file: 'src/foo.js', line: 2, impact: 'x', evidence: 'x' },
  ],
  killed: [], reviewerCount: 1, scope: 'full', tokens: 10,
}

test('AC-20260909-04-6: WHEN the driver prints the DISPOSITIONS step for a reviewer return of [hard@a.js:1, soft@b.js:2, hard@c.js:3] THE SYSTEM SHALL print survivors (2): listing a.js:1 then c.js:3, an advisory (1, recorded, not dispositioned): block listing b.js:2, and a mark line reading --mark dispositions --file <return.json> with no --waived substring', () => {
  const host = makeHost('soft-floor-ac6')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('soft-floor-ac6-return', THREE_SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a return carrying 2 hard survivors must land DISPOSITIONS, not auto-close: ' +
    JSON.stringify(readState(host.sidecar)))

  const step = run(host.root, host.spec)
  assert.match(step.stdout, /survivors \(2\):/,
    'AC-20260909-04-6 (literal): the printed pool count must be the HARD-only count (2), never the whole ' +
    'survivors array length (3) — the soft survivor must never inflate the "survivors due" count: ' + step.stdout)
  const aIdx = step.stdout.indexOf('a.js:1')
  const cIdx = step.stdout.indexOf('c.js:3')
  assert.ok(aIdx !== -1 && cIdx !== -1 && aIdx < cIdx,
    'AC-20260909-04-6 (literal): the survivors block must list a.js:1 then c.js:3, in printed order — D9 ' +
    'indexes disposer refs (s0, s1, …) off this exact printed order: ' + step.stdout)
  const advisoryIdx = step.stdout.indexOf('advisory (1, recorded, not dispositioned):')
  assert.notStrictEqual(advisoryIdx, -1,
    'AC-20260909-04-6 (literal): the DISPOSITIONS step must print a separate advisory block naming the soft ' +
    'count (1) — softs must be visible, never silently dropped from the printed step: ' + step.stdout)
  const bIdx = step.stdout.indexOf('b.js:2')
  assert.ok(bIdx > advisoryIdx,
    'AC-20260909-04-6 (literal): b.js:2 (the soft survivor) must be listed under the advisory heading, never ' +
    'inside the survivors( ) block above it: ' + step.stdout)
  assert.strictEqual(step.stdout.slice(0, advisoryIdx).includes('b.js:2'), false,
    'the soft survivor must never appear inside the survivors block that precedes the advisory heading: ' + step.stdout)
  assert.match(step.stdout, /--mark dispositions --file <return\.json>/,
    'AC-20260909-04-6 (literal): the mark line must read exactly this form, naming the disposer return file: ' +
    step.stdout)
  assert.ok(!step.stdout.includes('--waived'),
    'AC-20260909-04-6 (literal): the mark line must contain no --waived substring anywhere — D7 retires the ' +
    'hand-typed count flags from the printed instruction now that the driver derives them from the file: ' +
    step.stdout)
})

test('AC-20260909-04-7: WHEN --mark reviewer-returned --file carries a soft-only return on green legs THE SYSTEM SHALL exit 0, write marks.dispositions = {waived:0, rejected:0, fixDispatched:0, word:"CLEAN"} to review-state.json, and the next bare invocation SHALL print the CLOSE step with no DISPOSITIONS step ever printed', () => {
  const host = makeHost('soft-floor-ac7')
  toReviewer(host)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('soft-floor-ac7-return', SOFT_ONLY_RETURN))
  assert.strictEqual(r.status, 0,
    'AC-20260909-04-7 (literal): marking a soft-only return on green legs must exit 0 — a soft-only pass must ' +
    'never demand a session dispatch the disposer for nothing to disposition: ' + r.stdout + ' / ' + r.stderr)

  const state = readState(host.sidecar)
  assert.deepStrictEqual(state.dispositions, { waived: 0, rejected: 0, fixDispatched: 0, word: 'CLEAN' },
    'AC-20260909-04-7 (literal): D6 — the driver itself must run the verdict pass with zero dispositions and ' +
    'record exactly this shape on the reviewer-returned mark, with no --mark dispositions ever typed by the ' +
    'session: ' + JSON.stringify(state.dispositions))

  const step = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'AC-20260909-04-7 (literal): the next bare invocation must land state CLOSE directly — a soft-only return ' +
    'must never surface a DISPOSITIONS step nobody can act on: ' + step.stdout + ' / ' + step.stderr)
  assert.doesNotMatch(step.stdout, /DISPOSITIONS/,
    'AC-20260909-04-7: the CLOSE step\'s own printed output must never mention DISPOSITIONS — the run must ' +
    'never have passed through that step for a soft-only return: ' + step.stdout)
})

test('AC-20260909-04-9: WHEN the hard pool is [s0] and the return also carries {ref:"s1"} for the soft THE SYSTEM SHALL exit 2 with stderr containing "matches nothing in the survivor or leg-finding pools" and write no disposer-return-1.json', () => {
  const host = makeHost('soft-floor-ac9')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('soft-floor-ac9-return', HARD_AND_SOFT_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: one hard survivor must keep the pool non-empty, landing DISPOSITIONS (the soft one ' +
    'never contributes): ' + JSON.stringify(readState(host.sidecar)))

  const badReturn = disposerReturn([
    { ref: 's0', recommended: 'waive', reason: 'D1 sanctions the hard survivor' },
    { ref: 's1', recommended: 'waive', reason: 'stale — s1 names nothing in the hard-only pool' },
  ])
  const r = run(host.root, host.spec, '--mark', 'dispositions', '--file', returnFileWith('soft-floor-ac9-file', badReturn))
  assert.strictEqual(r.status, 2,
    'AC-20260909-04-9 (literal): a return naming s1 must be refused — D9 indexes disposer refs off the ' +
    'HARD-only printed list (s0 alone here), so s1 names nothing at all, never the soft survivor by another ' +
    'name: ' + r.stdout + ' / ' + r.stderr)
  assert.match(r.stderr, /matches nothing in the survivor or leg-finding pools/,
    'AC-20260909-04-9 (literal): the refusal must reuse the existing unknown-ref message text verbatim: ' + r.stderr)
  assert.ok(!fs.existsSync(path.join(host.sidecar, 'disposer-return-1.json')),
    'AC-20260909-04-9: a refused mark must never write disposer-return-1.json — a partial write here would ' +
    'let a later --mark dispositions read a copy of the very return that was refused: ' + host.sidecar)
})

test('AC-20260909-04-11: WHEN the hard pool is empty THE SYSTEM SHALL CONTINUE TO accept --mark dispositions --waived 0 --rejected 0 --fix-dispatched 0 with exit 0', () => {
  const host = makeHost('soft-floor-ac11')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file', returnFileWith('soft-floor-ac11-return', SOFT_ONLY_RETURN))

  const r = run(host.root, host.spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(r.status, 0,
    'AC-20260909-04-11 (literal): an explicit all-zero mark against an empty hard pool (the lone survivor is ' +
    'soft) must SHALL CONTINUE TO be accepted with no --file needed — 17 existing test files and any host ' +
    'mid-run pass this exact form and must keep working: ' + r.stdout + ' / ' + r.stderr)
  const state = readState(host.sidecar)
  assert.deepStrictEqual(state.dispositions, { waived: 0, rejected: 0, fixDispatched: 0, word: 'CLEAN' },
    'AC-20260909-04-11: the explicit mark must record exactly {waived:0, rejected:0, fixDispatched:0, ' +
    'word:"CLEAN"}, the same shape D6\'s own auto-dispose derives: ' + JSON.stringify(state.dispositions))
})

// specs/20260909/04-review-soft-floor.md D6 (fix review, review disposition "fix" against the
// D6 auto-dispose path in handleReviewerReturned()): an empty hard pool's verdict pass can
// derive a non-CLEAN word (most often UNVERIFIED, from a manifest that disagrees with itself),
// and D6 sanctions writing marks.dispositions only for a CLEAN-shaped pass — a non-CLEAN word
// here must refuse immediately, never advance state to CLOSE and surface the refusal one
// round-trip later on the next bare invocation. Reproduced here by hand-appending a
// scope-disagreeing manifest row (the same technique
// AC-20260902-05-8 uses) BEFORE reviewer-returned, so the D6 auto-dispose pass itself derives
// UNVERIFIED against an empty (zero-survivor) return.
test('D6 (fix review): WHEN --mark reviewer-returned carries an empty-hard-pool return but the manifest disagrees with itself (verdict.js would derive UNVERIFIED, not CLEAN) THE SYSTEM SHALL exit 2, write no marks.dispositions, leave review-state.json byte-identical, and name the UNVERIFIED cause plus the cold-restart remedy in stderr', () => {
  const host = makeHost('soft-floor-d6-unverified')
  toReviewer(host)

  // Hand-edit the manifest to append a "gate" row stamped scope:"fix-delta" — once D1 stamps
  // every other row "full", this single override disagrees with the rest of the manifest, the
  // same fixture AC-20260902-05-8 (review-driver-fix-cycle.test.js) uses to force UNVERIFIED.
  const manifestPath = path.join(host.sidecar, 'manifest-1.jsonl')
  fs.appendFileSync(manifestPath,
    JSON.stringify({ leg: 'gate', exit: 0, observed: { skips: 0, todos: 0, testsExecuted: 1 }, scope: 'fix-delta' }) + '\n')

  const stateBefore = readStateRaw(host.sidecar)
  const r = run(host.root, host.spec, '--mark', 'reviewer-returned', '--file',
    returnFileWith('soft-floor-d6-unverified-return', CLEAN_RETURN))

  assert.strictEqual(r.status, 2,
    'D6 (fix review): the auto-dispose path must refuse a pass that derives UNVERIFIED against an empty hard ' +
    'pool, never write a non-CLEAN word into marks.dispositions and sail through to CLOSE: ' +
    r.stdout + ' / ' + r.stderr)
  assert.match(r.stderr, /verdict\.js: UNVERIFIED — manifest invalid: scope values disagree/,
    'D6 (fix review): stderr must carry verdict.js\'s own UNVERIFIED cause line verbatim, mirroring ' +
    'handleDispositions()\'s own UNVERIFIED pre-check text: ' + r.stderr)
  assert.match(r.stderr, /cold legs re-run/,
    'D6 (fix review): the refusal must name the same cold-legs-rerun remedy the UNVERIFIED pre-check ' +
    'gives at DISPOSITIONS, so the two paths agree on what to do next: ' + r.stderr)
  const stateAfter = readStateRaw(host.sidecar)
  assert.strictEqual(stateAfter, stateBefore,
    'D6 (fix review): the refusal must happen BEFORE saveSidecar() — review-state.json must be byte-identical ' +
    'to before the refused mark, never recording marks.dispositions = {…, word:"UNVERIFIED"}')
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'D6 (fix review): a refused reviewer-returned mark must leave state exactly where it was — never CLOSE, ' +
    'and never a state the next bare invocation refuses to act on')
})

// specs/20260909/04-review-soft-floor.md D6/D12 (fix review, DISPOSITIONS "nothing to
// disposition" branch): the empty-pool print still read the retired
// `--mark dispositions --waived 0 --rejected 0 --fix-dispatched 0` form after D7 dropped the
// count flags from every other DISPOSITIONS mark line. D6's own auto-dispose (above) now closes
// a genuinely empty pool before this branch can ever print during a normal run, so it is forced
// here by hand-resetting marks.dispositions after the auto-close — the same "reach an
// otherwise-unreachable branch via a hand-edited sidecar" technique
// AC-20260820-07-8's manifest-provable-cap test uses.
test('D6/D12 (fix review): WHEN the DISPOSITIONS step prints with a genuinely empty hard pool (0 survivors, 0 leg findings) THE SYSTEM SHALL print the mark line as --mark dispositions --file <return.json>, matching the main DISPOSITIONS step, never the retired --waived 0 --rejected 0 --fix-dispatched 0 form', () => {
  const host = makeHost('soft-floor-d6d12-empty-mark')
  toReviewer(host)
  run(host.root, host.spec, '--mark', 'reviewer-returned', '--file',
    returnFileWith('soft-floor-d6d12-return', CLEAN_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'CLOSE',
    'setup precondition: D6 auto-dispose must have already closed this zero-survivor, zero-leg-finding run')

  // Force the otherwise-unreachable DISPOSITIONS-with-empty-pool print by resetting the marks
  // D6 just wrote — the pools stay empty (same manifest, same zero-survivor return on file).
  const stateFile = path.join(host.sidecar, 'review-state.json')
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  state.dispositions = null
  state.dispositionsIteration = null
  fs.writeFileSync(stateFile, JSON.stringify(state))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'the hand-edit must land the run at DISPOSITIONS with an empty pool — the only way to exercise this ' +
    'branch now that D6 auto-closes every genuinely empty pool before it')

  const step = run(host.root, host.spec)
  assert.match(step.stdout, /nothing to disposition/,
    'sanity: this must be the empty-pool branch, not the populated-pool DISPOSITIONS print: ' + step.stdout)
  assert.match(step.stdout, /--mark dispositions --file <return\.json>/,
    'D6/D12 (literal): the empty-pool branch\'s mark line must match the main DISPOSITIONS step\'s own line — ' +
    'the count flags are retired everywhere, not just on the populated-pool path: ' + step.stdout)
  assert.ok(!step.stdout.includes('--waived'),
    'D6/D12 (literal): the empty-pool branch must never print the retired ' +
    '--waived 0 --rejected 0 --fix-dispatched 0 form: ' + step.stdout)
})
