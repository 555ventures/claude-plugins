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

test('wf-review: hard findings die only on 2/2 of DISPATCHED refuters, not surviving ones', () => {
  const src = read('spec/workflows/wf-review.js')
  assert.ok(!/refutes\.length === valid\.length/.test(src),
    'kill rule must compare against the dispatched refuter count k, not the null-filtered count')
  assert.match(src, /refutes\.length === k/, 'kill rule should be refutes.length === k (all dispatched refuters)')
})

test('wf-review: dedup key includes the claim, not just file:line:severity', () => {
  const src = read('spec/workflows/wf-review.js')
  assert.match(src, /f\.claim/, 'dedup key must incorporate the claim text')
})

test('wf-build: null red-check fails closed', () => {
  const src = read('spec/workflows/wf-build.js')
  assert.ok(!/if \(red && !red\.allRed\)/.test(src),
    'a null red-check result must be treated as a failed red check, not as all-red')
})

test('gate sentinel: gate command is subshell-wrapped so `;` cannot false-green', () => {
  for (const wf of ['spec/workflows/wf-build.js', 'spec/workflows/wf-design.js']) {
    const src = read(wf)
    assert.match(src, /\( \$\{gateCmd\} \) && echo/,
      wf + ': sentinel must chain off a subshell of the whole gate command')
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
