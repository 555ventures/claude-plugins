'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/05-tests-that-earn-their-keep.md D1: AC-20261103-05-1, AC-20261103-05-2,
// AC-20261103-05-3 — `[oracle: literals]` is evaluated in-process by ac-matrix.js over the
// File Plan's non-tests, non-DELETE files; it appends no manifest row.

const AC = 'AC-20261103-05-1'
const PLAN_HEAD = '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n'

function literalsSpec(rows) {
  return '# Literals Spec\n\n## Acceptance Criteria\n\n' +
    '- **' + AC + '** `[oracle: literals]`: WHEN review runs THE SYSTEM SHALL find none of ' +
    '`gone phrase`, `other gone` in the doctrine files\n\n' + PLAN_HEAD + rows.join('\n') + '\n'
}

function host(prefix, { aMd, testBody, deleteBody }) {
  const dir = tmpdir(prefix)
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/a.md'), aMd)
  fs.writeFileSync(path.join(dir, 'docs/old.md'), deleteBody)
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'), testBody)
  const specPath = path.join(dir, 'spec.md')
  fs.writeFileSync(specPath, literalsSpec([
    '| docs/a.md | MODIFY | doctrine | prose |',
    '| tests/x.test.js | CREATE | tests | a tests row |',
    '| docs/old.md | DELETE | doctrine | removed |',
  ]))
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, '')
  return { dir, specPath, manifest }
}

function full(h) {
  return runNode('scripts/ac-matrix.js',
    ['--spec', h.specPath, '--root', h.dir, '--manifest', h.manifest, '--json'])
}

test('AC-20261103-05-1: WHEN a [oracle: literals] bullet\'s two stems are absent from the one scoped non-tests, non-DELETE file THE SYSTEM exits 0, counts oracle=1 uncovered=0, warns "oracle = literals (2 stems, 1 files)" and appends no manifest row whose leg is literals', () => {
  const h = host('lit-green', {
    aMd: 'clean prose\n', testBody: '// asserts `gone phrase` is gone\n', deleteBody: 'gone phrase and other gone\n',
  })
  const res = full(h)
  assert.strictEqual(res.status, 0,
    'a retirement whose stems survive in no scoped file must pass review with no finding, or every ' +
    'retirement AC reds its own review: ' + res.stdout + res.stderr)
  const out = JSON.parse(res.stdout)
  assert.deepStrictEqual(out.observed.acMatrix, { uncovered: 0, oracle: 1, preGreen: 0 },
    'a literals bullet counts under the existing oracle counter and keeps the observed shape: ' + res.stdout)
  assert.ok(out.warnings.includes(AC + ': oracle = literals (2 stems, 1 files)'),
    'the warning line must state stems and files scanned so review can see the oracle ran: ' + JSON.stringify(out.warnings))
  const rows = fs.readFileSync(h.manifest, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.ok(!rows.some(r => r.leg === 'literals'),
    'D1 appends no manifest row for literals — a row would be a new leg verdict.js must read: ' + JSON.stringify(rows))
})

test('AC-20261103-05-2: WHEN a stem survives in the scoped docs/a.md while a tests-layer row\'s file and a DELETE row\'s file also contain it THE SYSTEM exits 1 with exactly one hard literal-survives finding naming docs/a.md and no oracle-red-or-absent finding', () => {
  const h = host('lit-red', {
    aMd: 'still says gone phrase here\n', testBody: '// asserts `gone phrase` is gone\n', deleteBody: 'gone phrase and other gone\n',
  })
  const res = full(h)
  assert.strictEqual(res.status, 1,
    'a retired phrase that survives in a scoped file must fail review, or the retirement is unchecked: ' + res.stdout + res.stderr)
  const out = JSON.parse(res.stdout)
  const survives = out.findings.filter(f => f.class === 'literal-survives')
  assert.strictEqual(survives.length, 1,
    'exactly one finding per stem x file — the tests row and the DELETE row are never searched: ' + JSON.stringify(out.findings))
  assert.strictEqual(survives[0].severity, 'hard', 'literal-survives is a hard finding: ' + JSON.stringify(survives[0]))
  assert.strictEqual(survives[0].detail, AC + ': literal `gone phrase` survives in docs/a.md',
    'the detail must name the AC, the stem and the file so the disposition flow can act: ' + JSON.stringify(survives[0]))
  assert.ok(!out.findings.some(f => f.class === 'oracle-red-or-absent'),
    'literals is never a manifest leg, so oracle-red-or-absent must not fire for it: ' + JSON.stringify(out.findings))
})

test('AC-20261103-05-3: WHEN a [oracle: literals] bullet carries no backtick stem THE SYSTEM emits literals-no-stem from --lint (exit 1) and from full mode', () => {
  const dir = tmpdir('lit-nostem')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs/a.md'), 'prose\n')
  fs.writeFileSync(path.join(dir, 'tests/x.test.js'), '// none\n')
  const specPath = path.join(dir, 'spec.md')
  fs.writeFileSync(specPath, '# S\n\n## Acceptance Criteria\n\n' +
    '- **' + AC + '** `[oracle: literals]`: WHEN review runs THE SYSTEM SHALL find no retired phrase\n\n' + PLAN_HEAD +
    '| docs/a.md | MODIFY | doctrine | prose |\n| tests/x.test.js | CREATE | tests | t |\n')
  const lint = runNode('scripts/ac-matrix.js', ['--spec', specPath, '--lint', '--json'])
  assert.strictEqual(lint.status, 1, '--lint must refuse a literals bullet that declares nothing to search for: ' + lint.stdout + lint.stderr)
  assert.ok(JSON.parse(lint.stdout).findings.some(f => f.class === 'literals-no-stem'),
    'a stemless literals oracle would vacuously pass every review: ' + lint.stdout)
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, '')
  const fullRes = runNode('scripts/ac-matrix.js', ['--spec', specPath, '--root', dir, '--manifest', manifest, '--json'])
  assert.strictEqual(fullRes.status, 1, 'full mode must refuse it too: ' + fullRes.stdout + fullRes.stderr)
  assert.ok(JSON.parse(fullRes.stdout).findings.some(f => f.class === 'literals-no-stem'),
    'full mode must name literals-no-stem, not fall through to oracle-red-or-absent: ' + fullRes.stdout)
})

test('AC-20261103-05-3: WHEN a spec dated after the disposition floor holds a [oracle: literals] bullet with one stem and no arrow disposition beside a [oracle: gate] bullet without one THE SYSTEM passes the literals bullet in --lint and still raises missing-disposition for the gate bullet only', () => {
  const dir = tmpdir('lit-disp')
  const specPath = path.join(dir, 'specs/20261103/90-x.md')
  fs.mkdirSync(path.dirname(specPath), { recursive: true })
  fs.writeFileSync(specPath, '# S\n\n## Acceptance Criteria\n\n' +
    '- **AC-20261103-90-1** `[oracle: literals]`: WHEN review runs THE SYSTEM SHALL find none of `gone phrase` in the docs\n' +
    '- **AC-20261103-90-2** `[oracle: gate]`: WHEN the gate runs THE SYSTEM SHALL pass\n')
  const res = runNode('scripts/ac-matrix.js', ['--spec', specPath, '--lint', '--json'])
  assert.strictEqual(res.status, 1, 'the gate bullet without a disposition keeps the lint red: ' + res.stdout + res.stderr)
  const missing = JSON.parse(res.stdout).findings.filter(f => f.class === 'missing-disposition').map(f => f.ac)
  assert.deepStrictEqual(missing, ['AC-20261103-90-2'],
    'a literals oracle has no test by construction, so demanding a disposition forces a prose test; every other oracle keeps the requirement: ' + res.stdout)
})
