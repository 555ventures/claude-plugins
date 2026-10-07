'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md D5,
// AC-20261007-03-6: review-legs.js emits a `contract` manifest row for a `prototype:` spec from
// the LAST build row in the ledger, and ac-matrix.js reads that row as the pin criteria's oracle.

const SCRIPT = 'scripts/review-legs.js'
const ACM = 'scripts/ac-matrix.js'
const SPEC_REL = 'specs/20261007/99-proto-citer.md'
const STEM = '28-functional-prototype'
// The oracle tag is assembled at runtime so this file never spells the bracketed grammar in one
// literal that a repo-wide tag sweep could read as a declaration.
const ORACLE_TAG = '[' + 'oracle: contract' + ']'

function specBody({ prototype }) {
  return `---
status: implementing
tier: standard
${prototype ? `prototype: ${STEM}\n` : ''}---
# Contract Leg Fixture Spec

## Decisions

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | pin criteria are proven by the replay (AC-20261007-99-1) | why |

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/foo.test.js | create | tests |

## Acceptance Criteria

- **AC-20261007-99-1** ${ORACLE_TAG}: WHEN pin p1 is exercised against the production build THE SYSTEM SHALL pass its contract test
`
}

function buildRow(replay) {
  const row = { stage: 'build', spec: SPEC_REL, verdict: 'CLEAN', ts: '2026-10-07T00:00:00Z' }
  if (replay !== undefined) row.replay = replay
  return JSON.stringify(row)
}

function makeHost({ prototype, ledgerRows }) {
  const dir = tmpdir('contract-leg')
  const g = gitRepo(dir)
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({
    gateCommand: 'node --test {testDirs}',
    testCommand: 'node --test',
    runtime: { inert: 'plugin repo — nothing boots' },
    capabilities: { forge: 'none', skipReportPattern: 'none' },
  }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 41\n')
  g('add', '-A'); g('commit', '-q', '-m', 'base')
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, 'specs/20261007'), { recursive: true })
  fs.writeFileSync(path.join(dir, SPEC_REL), specBody({ prototype }))
  fs.writeFileSync(path.join(dir, 'src/foo.js'), 'module.exports = () => 42\n')
  // No AC-ID in the test name: a covered AC would skip the oracle branch ac-matrix is asked to judge.
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
test('foo returns 42', () => { assert.strictEqual(require('../src/foo.js')(), 42) })
`)
  if (ledgerRows) fs.writeFileSync(path.join(dir, '.claude/spec-runs.jsonl'), ledgerRows.join('\n') + '\n')
  g('add', '-A'); g('commit', '-q', '-m', 'implement')
  return { dir, base }
}

function legs({ dir, base }) {
  const out = tmpdir('contract-leg-out')
  const manifest = path.join(out, 'manifest.jsonl')
  const r = runNode(SCRIPT, ['--root', dir, '--spec', SPEC_REL, '--base', base,
    '--manifest', manifest, '--out-dir', path.join(out, 'o')])
  const rows = fs.existsSync(manifest)
    ? fs.readFileSync(manifest, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
    : []
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest }
}

function matrixFindings(dir, manifest) {
  const copy = path.join(tmpdir('contract-leg-m'), 'm.jsonl')
  fs.copyFileSync(manifest, copy)
  const r = runNode(ACM, ['--spec', SPEC_REL, '--root', dir, '--manifest', copy, '--json'], { cwd: dir })
  return { r, text: r.stdout + r.stderr }
}

test('AC-20261007-03-6: WHEN the last build row for a prototype: spec carries replay passed and looked THE SYSTEM appends the green contract row, and ac-matrix reports oracle=1', () => {
  const h = makeHost({ prototype: true, ledgerRows: [buildRow({ tests: 2, passed: true, looked: true })] })
  const { r, rows, byLeg, manifest } = legs(h)
  const row = byLeg.get('contract')
  assert.ok(row, 'no contract row means CLEAN is reachable for a pin criterion without the executed replay: ' + r.stdout + r.stderr)
  assert.deepStrictEqual(row, { leg: 'contract', exit: 0, observed: { tests: 2, passed: true }, scope: 'full' },
    'a green replay recorded on the build row must read as an exit-0 contract leg with that exact shape: ' + JSON.stringify(rows))
  const acm = byLeg.get('ac-matrix')
  assert.ok(acm && acm.observed && acm.observed.oracle === 1,
    'ac-matrix must see the contract row as the oracle standing, else every pin criterion reads oracle-red-or-absent even after a green replay: ' + JSON.stringify(acm))
  const m = matrixFindings(h.dir, manifest)
  assert.doesNotMatch(m.text, /oracle-red-or-absent/,
    'a green contract row must not raise a hard oracle finding on a direct ac-matrix run: ' + m.text)
})

test('AC-20261007-03-6: WHEN the only build row has replay.looked false THE SYSTEM appends the red contract row with unavailable no-replay and ac-matrix raises oracle-red-or-absent', () => {
  const h = makeHost({ prototype: true, ledgerRows: [buildRow({ tests: 2, passed: true, looked: false })] })
  const { rows, byLeg, manifest } = legs(h)
  assert.deepStrictEqual(byLeg.get('contract'),
    { leg: 'contract', exit: 1, observed: { unavailable: 'no-replay' }, scope: 'full' },
    'an unlooked replay must read as a red contract leg, or the user never judged the production screens yet review passes: ' + JSON.stringify(rows))
  const m = matrixFindings(h.dir, manifest)
  assert.match(m.text, /oracle-red-or-absent/,
    'a red contract leg must surface as the hard oracle-red-or-absent finding, or an unreplayed pin criterion reaches CLEAN: ' + m.text)
})

test('AC-20261007-03-6: WHEN no build row names the spec THE SYSTEM appends the red contract row, and only the LAST build row counts', () => {
  const none = legs(makeHost({ prototype: true, ledgerRows: [JSON.stringify({ stage: 'build', spec: 'specs/other.md', replay: { tests: 1, passed: true, looked: true } })] }))
  assert.deepStrictEqual(none.byLeg.get('contract'),
    { leg: 'contract', exit: 1, observed: { unavailable: 'no-replay' }, scope: 'full' },
    'another spec\'s replay must never vouch for this spec: ' + JSON.stringify(none.rows))
  const last = legs(makeHost({ prototype: true, ledgerRows: [
    buildRow({ tests: 2, passed: true, looked: true }),
    buildRow({ tests: 2, passed: false, looked: false }),
  ] }))
  assert.strictEqual(last.byLeg.get('contract') && last.byLeg.get('contract').exit, 1,
    'an older green replay must not outvote the latest red build row, or a rebuilt-and-broken spec reads green: ' + JSON.stringify(last.rows))
})

test('AC-20261007-03-6: WHEN the spec carries no prototype: frontmatter THE SYSTEM appends no contract row', () => {
  const { r, rows } = legs(makeHost({ prototype: false, ledgerRows: [buildRow({ tests: 2, passed: true, looked: true })] }))
  assert.ok(rows.length > 0, 'setup: review-legs must have produced a manifest for the no-prototype fixture: ' + r.stdout + r.stderr)
  assert.ok(!rows.some(x => x.leg === 'contract'),
    'a spec that cites no prototype must never gain a contract leg, or ordinary reviews grow a phantom oracle: ' + JSON.stringify(rows))
})
