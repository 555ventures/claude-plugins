'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read, evalFns, extractFn, checkWorkflowSyntax } = require('./helpers')

const WORKFLOWS = [
  'spec/workflows/wf-build.js',
  'spec/workflows/wf-design.js',
  'spec/workflows/wf-review.js',
  'spec/workflows/wf-panel.js',
  'spec/workflows/wf-research.js',
  'spec/workflows/wf-enforce.js',
]

test('every workflow parses as a sandbox body', () => {
  for (const wf of WORKFLOWS) assert.doesNotThrow(() => checkWorkflowSyntax(wf), wf)
})

test('validateGroups + isBatch + typeOfArg are byte-identical in wf-build and wf-design', () => {
  const build = read('spec/workflows/wf-build.js')
  const design = read('spec/workflows/wf-design.js')
  for (const fn of ['validateGroups', 'isBatch', 'typeOfArg']) {
    assert.strictEqual(extractFn(build, fn), extractFn(design, fn), fn + ' drifted between wf-build and wf-design')
  }
})

test('normalizeArgs is identical across workflows modulo the workflow name', () => {
  const canon = extractFn(read('spec/workflows/wf-build.js'), 'normalizeArgs').replace(/wf-build/g, 'WF')
  for (const wf of WORKFLOWS.slice(1)) {
    const src = read(wf)
    if (!src.includes('function normalizeArgs')) continue
    const name = wf.match(/(wf-[a-z-]+)\.js$/)[1]
    assert.strictEqual(extractFn(src, 'normalizeArgs').replace(new RegExp(name, 'g'), 'WF'), canon,
      'normalizeArgs drifted in ' + wf)
  }
})

test('normalizeArgs: unwraps single and double encoding, rejects corruption', () => {
  const { normalizeArgs } = evalFns(read('spec/workflows/wf-build.js'), ['normalizeArgs'])
  const obj = { stage: 'author', groups: [[{ id: 'a', files: [] }]] }
  assert.deepStrictEqual(normalizeArgs(obj), obj)
  assert.deepStrictEqual(normalizeArgs(JSON.stringify(obj)), obj)
  assert.deepStrictEqual(normalizeArgs(JSON.stringify(JSON.stringify(obj))), obj)
  assert.throws(() => normalizeArgs('[object Object]'), /String\(\)-coerced/)
  assert.throws(() => normalizeArgs('{"a": free text "quoted"}'), /structural corruption/)
})

test('validateGroups: accepts waves-of-batches, rejects every flattening', () => {
  const { validateGroups } = evalFns(read('spec/workflows/wf-build.js'),
    ['isBatch', 'typeOfArg', 'validateGroups'])
  const ok = [[{ id: 'a', files: [] }], [{ id: 'b', files: [{ path: 'x', action: 'CREATE' }] }]]
  assert.strictEqual(validateGroups(ok, 'wf'), ok)
  assert.throws(() => validateGroups({ id: 'a' }, 'wf'), /not an array/)
  assert.throws(() => validateGroups([{ id: 'a', files: [] }], 'wf'), /not a wave/)
  assert.throws(() => validateGroups([[{ id: 'a' }]], 'wf'), /not a batch/)
  assert.throws(() => validateGroups([[null]], 'wf'), /not a batch/)
})

// ---- fail-closed invariants (source-level assertions on the decision logic) -------------------

test('wf-review: a null reviewer result must not produce CLEAN', () => {
  const src = read('spec/workflows/wf-review.js')
  // The panel loop must distinguish "reviewer died" from "reviewer found nothing".
  assert.match(src, /REVIEWER_FAILED/,
    'wf-review must fail loud when a reviewer agent returns null instead of returning CLEAN')
  assert.ok(src.indexOf('REVIEWER_FAILED') < src.indexOf('panels.filter') + 2000,
    'the failed-reviewer check must run before findings are filtered')
})

test('wf-review: no finding dies by argument — kills are grounded or they do not happen', () => {
  const src = read('spec/workflows/wf-review.js')
  // The v4 refutation layer is gone: no refuters, no vote-counting kill rule.
  assert.ok(!src.includes('refuterPrompt'), 'the claim-only refuter layer is retired in v5')
  assert.ok(!/refutes\.length/.test(src), 'no vote-counting kill rule may survive')
  // The only kill paths are the three grounded verdicts.
  for (const s of ["'SANCTIONED'", "'MISCITED'", "'NOT_DEMONSTRABLE'"]) {
    assert.ok(src.includes(s), `grounded kill verdict ${s} must exist`)
  }
  assert.match(src, /killedBy: 'execution'/)
  assert.match(src, /killedBy: 'sanction'/)
  assert.match(src, /killedBy: 'miscitation'/)
})

test('wf-review: dedup key includes the claim, not just file:line:severity', () => {
  const src = read('spec/workflows/wf-review.js')
  assert.match(src, /f\.claim/, 'dedup key must incorporate the claim text')
})

test('wf-review: verification fails closed — crashes, caps, and unverifiables all survive', () => {
  const src = read('spec/workflows/wf-review.js')
  for (const s of ['DEMONSTRATED', 'NOT_DEMONSTRABLE', 'NOT_EXECUTABLE', 'MAX_VERIFIES']) {
    assert.ok(src.includes(s), `wf-review verification must include ${s}`)
  }
  // Soft findings skip verification and pass through flagged advisory.
  assert.match(src, /findings\.filter\(f => f\.severity !== 'soft'\)/)
  assert.match(src, /verification: 'advisory'/)
  // A crashed verifier is a missing verdict — the finding SURVIVES flagged, never dies silently.
  assert.match(src, /verify\.failed\+\+/)
  assert.match(src, /verification: 'verifier-failed'/)
  // A demonstrated defect survives with its repro evidence; unverifiable survives for the session.
  assert.match(src, /verification: 'demonstrated'/)
  assert.match(src, /verification: 'unverifiable'/)
  // No silent cap: findings past MAX_VERIFIES survive visibly flagged.
  assert.match(src, /verification: 'cap-skipped'/)
  assert.match(src, /capSkipped/)
})

test('wf-review: verify counts flow into the return and the review.md contract matches', () => {
  const src = read('spec/workflows/wf-review.js')
  assert.match(src, /verify,\n\s*reviewerCount/, 'return must carry the verify block')
  const doc = read('spec/commands/review.md')
  assert.match(doc, /verdict, survivors, killed, verify, reviewerCount, scope, tokens/,
    'review.md must document the v5 return shape')
  assert.match(doc, /scope: "fix-delta"/, 'review.md Phase 2 must use incremental re-review')
  assert.match(doc, /"verify":\{"verified":<n>/, 'ledger schema must record verify counts')
})

test('wf-build: null red-check fails closed', () => {
  const src = read('spec/workflows/wf-build.js')
  assert.ok(!/if \(red && !red\.allRed\)/.test(src),
    'a null red-check result must be treated as a failed red check, not as all-red')
})

test('workflow codegen: committed wf-*.js files match their fragments + bodies', () => {
  const { spawnSync } = require('node:child_process')
  const out = spawnSync('node', ['spec/scripts/build-workflows.js', '--check'],
    { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8' })
  assert.strictEqual(out.status, 0,
    'wf-*.js drifted from workflows/src + workflows/fragments — run `npm run build:workflows`\n' +
    out.stdout + out.stderr)
})

// 2026-08-13: this guard's NAME was true but its assertion was not — it pinned
// `( ${gateCmd} ) && echo <sentinel>`, which reports only the LAST statement of a `;`-joined gate,
// so a failing early leg still printed the sentinel. Tightened (never weakened) to the shape that
// actually delivers what the name promises: a standalone `set -e` subshell whose `$?` is tested on
// its own line. Folding it back onto `&&`, or into an `if` condition, re-breaks it silently —
// errexit is ignored for any non-final command of an AND-OR list, and bash applies that
// suppression inside the subshell too. Behavioral pins: tests/workflows/twin-parity.test.js
// AC-20260813-05-15.
test('gate sentinel: gate command is subshell-wrapped so `;` cannot false-green', () => {
  for (const wf of ['spec/workflows/wf-build.js', 'spec/workflows/wf-design.js']) {
    const src = read(wf)
    assert.match(src, /\( set -e; \$\{gateCmd\} \)\\n/,
      wf + ': the gate command must run as a STANDALONE `( set -e; ... )` subshell — without set -e ' +
      'a `;`-joined host gate false-greens on a failing early leg')
    assert.match(src, /if \[ \$\? -eq 0 \]; then echo \$\{GATE_SENTINEL\}; fi/,
      wf + ': the sentinel must print from a separate `$?` test, never chained off the subshell ' +
      'with `&&` — errexit is ignored for the non-final command of an AND-OR list, so `( set -e; ' +
      '... ) && echo` leaves the set -e completely inert')
    assert.doesNotMatch(src, /\( set -e; \$\{gateCmd\} \) &&/,
      wf + ': the probe must not chain the sentinel off the subshell with `&&` — that shape ' +
      'disables the set -e it appears to apply')
  }
})

test('wf-build: repair-wave blocked results are not discarded', () => {
  const src = read('spec/workflows/wf-build.js')
  const repairIdx = src.indexOf('label: `repair:')
  assert.ok(repairIdx > -1)
  // After the repair parallel(), the results must be inspected for blocked returns.
  const after = src.slice(repairIdx - 600, src.length)
  assert.match(after, /blocked/i, 'repair results must surface blocked returns')
  assert.match(src, /repairOut|repairResults|const repaired/,
    'repair parallel() results must be captured, not awaited into the void')
})
