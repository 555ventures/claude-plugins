'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')
const { makeReviewLegsHost, reviewLegsSpecBody } = require('./review-legs.fixtures')

// specs/20261101/06-a-rerun-re-runs-only-what-went-red.md D2: AC-20261101-06-2, -3, -4, -5.

const SCRIPT = 'scripts/review-legs.js'
const SPEC_REL = 'specs/20260817/99-test.md'
const GREEN_TEST = `'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const foo = require('../src/foo.js')
test('AC-20260817-99-1: foo() returns 42', () => { assert.strictEqual(foo(), 42) })
`

// The counter lives outside the fixture repo: an untracked file inside it would reconcile as
// out-of-plan. The stub appends one line per invocation, so line count = runner invocations.
function makeHost() {
  const counter = path.join(tmpdir('reuse-from-counter'), 'counter')
  const host = makeReviewLegsHost('reuse-from', {
    specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1',
    config: {
      gateCommand: 'bash lint.sh && bash test.sh', testCommand: 'bash test.sh', runtime: { inert: 'fixture' },
      patternsScript: 'patterns.sh',
      capabilities: { forge: 'none', skipReportPattern: 'ℹ skipped (\\d+)', testCountPattern: 'ℹ tests (\\d+)' },
    },
    testBody: GREEN_TEST,
    extraFiles: {
      [SPEC_REL]: reviewLegsSpecBody({ specDate: '20260817', ordinal: '99', acId: 'AC-20260817-99-1' })
        .replace('| tests/foo.test.js | create | tests |\n', '| tests/foo.test.js | create | tests |\n| lint.sh | create | scripts |\n| test.sh | create | scripts |\n| patterns.sh | create | scripts |\n'),
      'lint.sh': '#!/usr/bin/env bash\nexit 0\n',
      'patterns.sh': '#!/usr/bin/env bash\nexit 0\n',
      'test.sh': `#!/usr/bin/env bash\necho x >> '${counter}'\necho "ℹ tests 3"\necho "ℹ skipped 0"\nexit 0\n`,
    },
  })
  return { ...host, counter }
}

const lines = counter => fs.existsSync(counter) ? fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0
const readRows = m => fs.existsSync(m) ? fs.readFileSync(m, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)) : []

function run(host, extra = [], name = 'manifest.jsonl') {
  const manifest = path.join(tmpdir('reuse-from-manifest'), name)
  const r = runNode(SCRIPT, ['--root', host.dir, '--spec', SPEC_REL, '--base', host.base,
    '--manifest', manifest, '--out-dir', tmpdir('reuse-from-out'), ...extra])
  const rows = readRows(manifest)
  return { r, rows, byLeg: new Map(rows.map(x => [x.leg, x])), manifest }
}

const REUSABLE = ['gate', 'suite', 'at-risk', 'patterns', 'smoke']

test('AC-20261101-06-2: --reuse-from over an all-green same-scope manifest appends the five REUSABLE rows stamped reusedFrom, spawns no runner, and derives CLEAN', () => {
  const host = makeHost()
  const first = run(host, [], 'manifest-a.jsonl')
  assert.strictEqual(first.r.status, 0, 'setup precondition: a green host must exit 0: ' + first.r.stdout + first.r.stderr)
  const before = lines(host.counter)
  assert.strictEqual(before, 1, 'setup precondition: the first run must spawn the runner exactly once: ' + first.r.stdout)

  const second = run(host, ['--reuse-from', first.manifest])
  assert.strictEqual(second.r.status, 0, '--reuse-from must be an accepted flag and the run must exit 0: ' + second.r.stdout + second.r.stderr)
  assert.strictEqual(lines(host.counter), before,
    'a reused gate/suite must spawn no runner — a counter bump means the expensive legs re-ran despite an unchanged tree: ' + second.r.stdout)
  for (const leg of REUSABLE) {
    const row = second.byLeg.get(leg)
    assert.ok(row, `the ${leg} row must still be appended — a missing row starves verdict.js: ` + JSON.stringify(second.rows))
    assert.strictEqual(row.observed.reusedFrom, 'manifest-a.jsonl',
      `the ${leg} row must carry observed.reusedFrom = basename of the prior manifest — without provenance a copied row is indistinguishable from a fresh one: ` + JSON.stringify(row))
    const prior = first.byLeg.get(leg)
    assert.deepStrictEqual({ ...row.observed, reusedFrom: undefined }, { ...prior.observed, reusedFrom: undefined },
      `the ${leg} row must copy the prior observed verbatim apart from reusedFrom: ` + JSON.stringify(row))
    assert.strictEqual(row.exit, prior.exit, `the ${leg} row must keep the prior exit: ` + JSON.stringify(row))
  }
  for (const leg of ['reconcile', 'ac-matrix']) {
    const row = second.byLeg.get(leg)
    assert.ok(row && !('reusedFrom' in row.observed),
      `${leg} is not REUSABLE and must run for real, never carry reusedFrom: ` + JSON.stringify(row))
  }
  const wf = path.join(tmpdir('reuse-from-wf'), 'workflow.json')
  fs.writeFileSync(wf, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0, reviewerCount: 1, scope: 'full' }))
  const v = runNode('scripts/verdict.js', ['--manifest', second.manifest, '--workflow', wf])
  assert.strictEqual(v.stdout.split('\n')[0], 'CLEAN',
    'verdict.js must derive CLEAN over a manifest with reused rows — otherwise a reused review can never close: ' + v.stdout + v.stderr)
})

test('AC-20261101-06-3: a prior red gate row re-runs the gate with no reusedFrom while a prior green suite row is still reused', () => {
  const host = makeHost()
  const first = run(host, [], 'manifest-a.jsonl')
  assert.strictEqual(first.r.status, 0, 'setup precondition: a green host must exit 0: ' + first.r.stdout + first.r.stderr)
  const redPrior = path.join(tmpdir('reuse-from-red'), 'manifest-red.jsonl')
  fs.writeFileSync(redPrior, first.rows.map(x => JSON.stringify(x.leg === 'gate' ? { ...x, exit: 1 } : x)).join('\n') + '\n')
  const before = lines(host.counter)

  const second = run(host, ['--reuse-from', redPrior])
  assert.strictEqual(second.r.status, 0, '--reuse-from must be an accepted flag: ' + second.r.stdout + second.r.stderr)
  assert.strictEqual(lines(host.counter), before + 1,
    'a red prior gate must spawn the gate again — failures are never reused, so a missing bump hides a still-red gate: ' + second.r.stdout)
  const gate = second.byLeg.get('gate')
  assert.ok(gate && !('reusedFrom' in gate.observed), 'the re-run gate row must carry no reusedFrom: ' + JSON.stringify(gate))
  assert.strictEqual(gate.exit, 0, 'the re-run gate row reflects the fresh run: ' + JSON.stringify(gate))
  const suite = second.byLeg.get('suite')
  assert.strictEqual(suite && suite.observed.reusedFrom, 'manifest-red.jsonl',
    'the green prior suite row must still be reused independently of the gate: ' + JSON.stringify(suite))
})

test('AC-20261101-06-4: --reuse-from with --fix-delta over a scope:full manifest reuses nothing', () => {
  const host = makeHost()
  const first = run(host, [], 'manifest-a.jsonl')
  assert.ok(first.byLeg.get('gate').scope === 'full' && first.byLeg.get('suite').scope === 'full', 'setup precondition: the prior REUSABLE rows must be scope full: ' + JSON.stringify(first.rows))
  const second = run(host, ['--fix-delta', '--reuse-from', first.manifest])
  assert.ok(second.rows.length > 0, '--reuse-from must be an accepted flag and the run must append rows: ' + second.r.stdout + second.r.stderr)
  const reused = second.rows.filter(x => x.observed && typeof x.observed === 'object' && 'reusedFrom' in x.observed)
  assert.deepStrictEqual(reused, [],
    'a fix-delta run judges a different question than a full prior — a scope-mismatched row copied as evidence is a false green: ' + JSON.stringify(reused))
  const plain = run(host, ['--fix-delta'])
  assert.deepStrictEqual(second.rows.map(x => x.leg), plain.rows.map(x => x.leg),
    'every leg must run exactly as a plain --fix-delta run does: ' + second.r.stdout)
})

test('AC-20261101-06-5: --reuse-from naming a missing path exits 2 with the cannot-be-read stderr and appends no manifest row', () => {
  const host = makeHost()
  const missing = path.join(tmpdir('reuse-from-missing'), 'nope.jsonl')
  const { r, manifest } = run(host, ['--reuse-from', missing])
  assert.strictEqual(r.status, 2, 'an unreadable --reuse-from must be a usage failure (exit 2), never a silent full run: ' + r.stdout + r.stderr)
  assert.ok(r.stderr.includes(`review-legs.js: --reuse-from ${missing} cannot be read`),
    'stderr must name the offending path so the owner can fix it: ' + r.stderr)
  assert.deepStrictEqual(readRows(manifest), [], 'no manifest row may be appended on the refusal: ' + manifest)
})
