'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20260901/01 review (rv_3dfefa4d3d9f): a review judged an EMPTY range and every
// diff-scoped leg reported zero and green — at-risk files:0/testsExecuted:0, reconcile listing all
// 27 planned files "unrealized", the reviewer handed nothing to review. Two independent defects
// combined:
//
//   1. resolveBase() preferred `build_base` (conventionally the moving ref `main`) over
//      `diff_base` (a 40-hex pin). /spec:build stamps the pin; /git:enter-worktree writes the ref,
//      with no ordering guard between the two writers — so a worktree entered AFTER a build layered
//      `build_base: main` on top of a correct pin. By review time `main` carried the build's own
//      commits and `main...HEAD` was empty. replay.js:374 had already inverted this order for
//      exactly this reason; the fix never came back to the producer.
//   2. Nothing anywhere asserted the judged range was non-degenerate. verdict.js validated sha
//      SHAPE only, so ledger row rv_31224a17550e recorded base === head and no leg, verdict pass,
//      or ledger append objected.
//
// Precedence alone only fixes the failure already seen; the invariant is what holds when the next
// base-derivation mistake is something nobody predicted. Both are tested here against the real
// binary, one fixture, via `--state` (base derivation is top-level, so `--state` executes it).

const DRIVER = 'scripts/spec-review-driver.js'

// Host shaped like the real defect: commit A (pre-image), commit B (the build's work), branch at B.
// `diff_base` pins A; `build_base` names `main`, which also sits at B — the exact overlap that
// makes `main...HEAD` empty.
function makeHost({ withPin = true, buildBase = 'main' } = {}) {
  const root = fs.realpathSync(tmpdir('rvbase'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'test host — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'pre-image')
  const preImage = g('rev-parse', 'HEAD').trim()

  // The build's own commit, made on main (the in-place flow this defect came from).
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(root, 'specs/20260901'), { recursive: true })
  const spec = path.join(root, 'specs/20260901/99-base-test.md')
  fs.writeFileSync(spec, [
    '---',
    'status: implementing',
    'tier: standard',
    ...(withPin ? ['diff_base: ' + preImage] : []),
    ...(buildBase ? ['build_base: ' + buildBase] : []),
    '---',
    '# Base Derivation Fixture',
    '',
    '## Decisions',
    '',
    '| ID | Decision | One-line rationale |',
    '|----|----------|--------------------|',
    '| D1 | foo() returns 42 (AC-20260901-99-1) | why |',
    '',
    '## File Plan',
    '',
    '| File | Action | Layer |',
    '|---|---|---|',
    '| src/foo.js | edit | scripts |',
    '| tests/foo.test.js | create | tests |',
    '',
    '## Acceptance Criteria',
    '',
    '- **AC-20260901-99-1**: foo() returns 42.',
  ].join('\n'))
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), [
    "'use strict'",
    "const { test } = require('node:test')",
    "const assert = require('node:assert')",
    "const foo = require('../src/foo.js')",
    "test('AC-20260901-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })",
    '',
  ].join('\n'))
  g('add', '-A'); g('commit', '-q', '-m', 'implement')

  // Branch at the same commit main points to — main has "caught up with HEAD".
  g('branch', 'spec/99-base-test')
  g('checkout', '-q', 'spec/99-base-test')
  return { root, spec, preImage, head: g('rev-parse', 'HEAD').trim() }
}

test('a pinned diff_base wins over a build_base naming a moving ref that has caught up with HEAD', () => {
  const h = makeHost({ withPin: true, buildBase: 'main' })
  const r = runNode(DRIVER, [h.spec, '--state'], { cwd: h.root })
  // The pin makes the range real, so derivation succeeds and the driver reports a live state.
  assert.strictEqual(r.status, 0,
    'expected the pinned diff_base to be preferred over build_base: main; got exit ' + r.status +
    '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /range is empty/,
    'the pin resolves to a non-empty range — the empty-range refusal must not fire')
})

test('an empty review range is refused, naming build_base and the diff_base remedy', () => {
  // No pin: derivation falls through to `build_base: main`, which sits at HEAD → empty range.
  const h = makeHost({ withPin: false, buildBase: 'main' })
  const r = runNode(DRIVER, [h.spec, '--state'], { cwd: h.root })
  assert.notStrictEqual(r.status, 0, 'an empty range must not be reviewable')
  const out = r.stdout + r.stderr
  assert.match(out, /range is empty/, 'the refusal names the empty range')
  assert.match(out, /diff_base/, 'the refusal names the remedy field')
  assert.match(out, /build_base/, 'the refusal names the field that caused it')
})

test('a base that is not an ancestor of HEAD is refused rather than diffed', () => {
  const h = makeHost({ withPin: false, buildBase: null })
  const g = (...a) => require('node:child_process')
    .execFileSync('git', ['-C', h.root, ...a], { encoding: 'utf8' })
  // Move main forward onto a commit the spec branch never made, then point the spec at it.
  g('checkout', '-q', 'main')
  fs.writeFileSync(path.join(h.root, 'src/other.js'), 'module.exports = 1\n')
  g('add', '-A'); g('commit', '-q', '-m', 'foreign work on main')
  const foreign = g('rev-parse', 'HEAD').trim()
  g('checkout', '-q', 'spec/99-base-test')
  const text = fs.readFileSync(h.spec, 'utf8').replace(/^---\n/, '---\ndiff_base: ' + foreign + '\n')
  fs.writeFileSync(h.spec, text)

  const r = runNode(DRIVER, [h.spec, '--state'], { cwd: h.root })
  assert.notStrictEqual(r.status, 0, 'a non-ancestor base must not be diffed against')
  assert.match(r.stdout + r.stderr, /not an ancestor of HEAD/,
    'the refusal explains that the base ref moved past the branch')
})

test('verdict.js refuses a row whose base and head are the same commit', () => {
  const sha = 'a'.repeat(40)
  const r = runNode('scripts/verdict.js', [
    '--base-sha', sha, '--head-sha', sha, '--manifest', '/dev/null',
  ])
  assert.strictEqual(r.status, 2, 'a degenerate range is a usage refusal (exit 2)')
  assert.match(r.stdout + r.stderr, /same commit/,
    'the refusal names the degenerate range rather than only validating sha shape')
})
