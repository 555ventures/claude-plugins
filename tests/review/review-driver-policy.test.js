'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { tmpdir, runBash, gitRepo } = require('../helpers')
const {
  makeHost, run, stateOf, toReviewer, returnFileWith, CLEAN_RETURN, SURVIVOR_RETURN, ledgerRows,
} = require('./review-driver.fixtures')

// specs/20261029/09-the-commands-read-the-policy-block.md (AC-20261029-09-3, -5, -9): the review
// driver's MERGE, CLOSE and dispatch lines read the host's policy block.

function setPolicy(root, block) {
  if (!block) return
  const cfgPath = path.join(root, '.claude/spec.config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.policy = block
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
}

// ---- AC-20261029-09-9: dispatch lines ---------------------------------------------------------

function reviewerAndDispositionsOut(block) {
  const host = makeHost()
  setPolicy(host.root, block)
  const first = run(host.root, host.spec)
  assert.strictEqual(stateOf(host.root, host.spec), 'REVIEWER',
    'setup precondition: green legs must reach REVIEWER: ' + first.stdout + first.stderr)
  const reviewerOut = first.stdout
  const mark = run(host.root, host.spec, '--mark', 'reviewer-returned',
    '--file', returnFileWith('rvpol-surv', SURVIVOR_RETURN))
  assert.strictEqual(stateOf(host.root, host.spec), 'DISPOSITIONS',
    'setup precondition: a survivor return must reach DISPOSITIONS: ' + mark.stdout + mark.stderr)
  return { reviewerOut, dispOut: run(host.root, host.spec).stdout }
}

test('AC-20261029-09-9: WHEN policy.models sets reviewer opus/high and disposer sonnet/high THE SYSTEM prints those seats on the REVIEWER and DISPOSITIONS dispatch lines', () => {
  const { reviewerOut, dispOut } = reviewerAndDispositionsOut({
    models: { reviewer: { model: 'opus', effort: 'high' }, disposer: { model: 'sonnet', effort: 'high' } },
  })
  assert.ok(reviewerOut.includes('Agent {subagent_type: "spec:reviewer", model: opus, effort: high}'),
    'the reviewer dispatch ignores the host policy seat, so an override can never act: ' + reviewerOut)
  assert.ok(dispOut.includes('Agent {subagent_type: "spec:disposer", model: sonnet, effort: high}'),
    'the disposer dispatch ignores the host policy seat: ' + dispOut)
})

test('AC-20261029-09-9: WHEN there is no policy block THE SYSTEM prints fable/low for the reviewer and opus/medium for the disposer', () => {
  const { reviewerOut, dispOut } = reviewerAndDispositionsOut(null)
  assert.ok(reviewerOut.includes('Agent {subagent_type: "spec:reviewer", model: fable, effort: low}'),
    'the default reviewer dispatch line does not spell the seat table model and effort: ' + reviewerOut)
  assert.ok(dispOut.includes('Agent {subagent_type: "spec:disposer", model: opus, effort: medium}'),
    'the default disposer dispatch line does not spell the seat table model and effort: ' + dispOut)
})

// ---- AC-20261029-09-5: CLOSE and testExpiry ---------------------------------------------------

function expiryHostSpec(diffBase) {
  return `---
status: implementing
tier: standard
diff_base: ${diffBase}
---
# Driver Expiry Policy Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (AC-20260911-88-1) | why |
| D2 | bar() keeps returning true (AC-20260911-88-2) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20260911-88-1**: foo() returns 42.
- **AC-20260911-88-2**: WHEN a caller invokes bar() THE SYSTEM SHALL CONTINUE TO return true.
`
}

const EXPIRY_TESTS = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('AC-20260911-88-1: foo() returns 42', () => { assert.strictEqual(require('../src/foo.js')(), 42) })
test('AC-20260911-88-2: bar keeps returning true', () => { assert.ok(true) })
`

function closeFor(expiryPolicy) {
  const root = fs.realpathSync(tmpdir('rvpol-expiry'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }
  if (expiryPolicy) cfg.policy = { testExpiry: expiryPolicy }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, '.gitignore'), 'specs/**/*.review/\nspecs/**/*.build/\n')
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const diffBase = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(root, 'specs/20260911'), { recursive: true })
  const spec = path.join(root, 'specs/20260911/88-drv-expiry-policy.md')
  fs.writeFileSync(spec, expiryHostSpec(diffBase))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.writeFileSync(path.join(root, 'tests/foo.test.js'), EXPIRY_TESTS)
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  const host = { root, spec }
  toReviewer(host)
  const r = run(root, spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvpol-expiry-clean', CLEAN_RETURN))
  assert.strictEqual(stateOf(root, spec), 'CLOSE', 'setup precondition: a clean return must reach CLOSE: ' + r.stdout + r.stderr)
  return { root, spec, out: r.stdout, testText: fs.readFileSync(path.join(root, 'tests/foo.test.js'), 'utf8') }
}

test('AC-20261029-09-5: WHEN policy.testExpiry is "off" THE SYSTEM prints "test expiry: off by policy", no 🧹 line, leaves tests byte-identical, writes a ledger row with no tests key, and still flips status: done', () => {
  const c = closeFor('off')
  assert.ok(c.out.includes('test expiry: off by policy'),
    'the CLOSE step does not say expiry is off, so the session cannot tell a skipped classification from a failed one: ' + c.out)
  assert.doesNotMatch(c.out, /🧹/,
    'the CLOSE step still prints the retirable-count line on a host that never retires tests: ' + c.out)
  assert.strictEqual(fs.readFileSync(path.join(c.root, 'tests/foo.test.js'), 'utf8'), c.testText,
    'a test file changed at CLOSE on an expiry-off host')
  const rows = ledgerRows(c.root)
  const row = rows[rows.length - 1]
  assert.ok(row && !('tests' in row),
    'the close row carries a tests key on an expiry-off host, so fleet readers sum an invented classification: ' + JSON.stringify(row))
  assert.match(fs.readFileSync(c.spec, 'utf8'), /status:\s*done/,
    'CLOSE must still flip the spec to done when expiry is off')
  const sidecar = JSON.parse(fs.readFileSync(path.join(c.spec.replace(/\.md$/, '.review'), 'review-state.json'), 'utf8'))
  assert.deepStrictEqual(sidecar.testsExpiry, { off: 'policy' },
    'marks.testsExpiry must record {off: "policy"} so a re-run reprints the same CLOSE line: ' + JSON.stringify(sidecar))
})

test('AC-20261029-09-5: WHEN policy.testExpiry is "classify" THE SYSTEM prints the 🧹 line naming 1 retirable test as today', () => {
  const c = closeFor('classify')
  assert.match(c.out, /🧹 1 tests are retirable/,
    'the classify arm stopped reporting the retirable count: ' + c.out)
  assert.ok(!c.out.includes('off by policy'), 'the classify arm printed the off-by-policy line: ' + c.out)
})

// ---- AC-20261029-09-3: MERGE and mergeStrategy -----------------------------------------------

function mergeStepFor(mergeStrategy) {
  const root = fs.realpathSync(tmpdir('rvpol-merge'))
  const g = gitRepo(root)
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  const cfg = {
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }
  if (mergeStrategy) cfg.policy = { mergeStrategy }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(cfg))
  fs.writeFileSync(path.join(root, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const baseSha = g('rev-parse', 'HEAD').trim()
  const created = runBash('scripts/merge-back.sh', ['create', '--source', 'spec/99-rvpol-merge', '--root', root])
  assert.strictEqual(created.status, 0, 'setup: worktree creation must succeed: ' + created.stderr)
  const wt = created.stdout.trim().split('\n').pop()
  const acId = 'AC-20261029-99-1'
  fs.mkdirSync(path.join(wt, 'specs/20261029'), { recursive: true })
  const specRel = 'specs/20261029/99-rvpol-merge.md'
  const spec = path.join(wt, specRel)
  fs.writeFileSync(spec, `---
status: implementing
tier: standard
build_base: ${baseSha}
---
# Merge Policy Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | foo() returns 42 (${acId}) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **${acId}**: foo() returns 42.
`)
  fs.writeFileSync(path.join(wt, 'src/foo.js'), 'module.exports = () => 42\n')
  fs.mkdirSync(path.join(wt, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(wt, 'tests/foo.test.js'),
    `'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\ntest('${acId}: foo() returns 42', () => { assert.strictEqual(require('../src/foo.js')(), 42) })\n`)
  const gw = (...a) => execFileSync('git', ['-C', wt, ...a], { encoding: 'utf8' })
  gw('add', '-A'); gw('commit', '-q', '-m', 'implement')
  run(wt, spec)
  assert.strictEqual(stateOf(wt, spec), 'REVIEWER', 'setup: the two-branch fixture must reach REVIEWER')
  run(wt, spec, '--mark', 'reviewer-returned', '--file', returnFileWith('rvpol-merge-clean', CLEAN_RETURN))
  run(wt, spec, '--mark', 'dispositions', '--waived', '0', '--rejected', '0', '--fix-dispatched', '0')
  assert.strictEqual(stateOf(wt, spec), 'CLOSE', 'setup: a clean pass must reach CLOSE')
  gw('add', specRel, 'tests/foo.test.js')
  gw('commit', '-q', '-m', 'close')
  const closed = run(wt, spec, '--mark', 'closed')
  assert.strictEqual(closed.status, 0, 'setup: closed must succeed: ' + closed.stdout + closed.stderr)
  assert.strictEqual(stateOf(wt, spec), 'MERGE', 'setup: a closed spec must land MERGE')
  const step = run(wt, spec)
  return { out: step.stdout, specPath: spec }
}

test('AC-20261029-09-3: WHEN policy.mergeStrategy is "squash" THE SYSTEM prints the host-policy auto-pick and a squash mark line and no RECOMMEND: line', () => {
  const m = mergeStepFor('squash')
  assert.ok(m.out.includes('📌 Auto-picked squash — host policy (veto anytime)'),
    'a named policy strategy prints no auto-pick line, so the session derives its own: ' + m.out)
  assert.ok(m.out.includes('--mark merge-strategy squash'),
    'the mark line is not pre-filled with the policy strategy: ' + m.out)
  assert.doesNotMatch(m.out, /^RECOMMEND:/m,
    'the step still carries a RECOMMEND: line, so it states two answers: ' + m.out)
})

test('AC-20261029-09-3: WHEN policy.mergeStrategy is "derived" or absent THE SYSTEM prints the RECOMMEND: line and no host policy line', () => {
  for (const strategy of ['derived', null]) {
    const m = mergeStepFor(strategy)
    assert.match(m.out, /^RECOMMEND:/m,
      'the derived arm lost inspect\'s RECOMMEND: line (policy ' + strategy + '): ' + m.out)
    assert.ok(!m.out.includes('host policy'),
      'the derived arm printed a host-policy line (policy ' + strategy + '): ' + m.out)
  }
})
