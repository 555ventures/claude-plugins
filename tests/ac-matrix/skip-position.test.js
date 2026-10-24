'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { specMd, writeManifest, run, findings } = require('./ac-matrix.fixtures.js')

// specs/20261024/01-review-driver-reads-recorded-facts.md D6: ac-matrix.js step-6 routes 2 and 3
// map a skipped test to the first AC-ID cited at or after the test's own position in its file,
// falling back to the file's first cited AC-ID only when none follows.

// Spec under review: AC-1 carries no [env:] (a skip mapped to it is unsanctioned); AC-8 carries
// [env:] (a skip mapped to it is sanctioned). Which one the finding names exposes the mapping.
function host(dir, testBody) {
  fs.mkdirSync(path.join(dir, 'tests', 'unit'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests', 'unit', 'test_x.py'), testBody)
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, specMd(
    ['- **AC-20261024-01-1**: WHEN X THE SYSTEM SHALL Y → tests/unit/test_x.py',
      '- **AC-20261024-01-8** `[env: SOME_VAR]`: WHEN X THE SYSTEM SHALL Z → tests/unit/test_x.py'],
    ['| tests/unit/test_x.py | CREATE | tests | covers ACs |']))
  return { spec, manifest: writeManifest(dir, []) }
}

function runSkip(dir, spec, manifest, line) {
  const skips = path.join(dir, 'skips.txt')
  fs.writeFileSync(skips, line + '\n')
  return findings(run(spec, dir, manifest, ['--skips', skips, '--json']))
}

const POSITIONED = [
  '"""Module docstring. Covers AC-20261024-01-1."""',
  '',
  'def test_other():',
  '    pass',
  '',
  'def test_round_trip():',
  '    """Covers AC-20261024-01-8."""',
  '    pass',
  '',
].join('\n')

test('AC-20261024-01-11: a qualified skip line maps to the AC cited in the test body after its name, not the module docstring AC, so the [env:] sanction is read from the right bullet', () => {
  const dir = tmpdir('acm-skip-pos-qualified')
  const { spec, manifest } = host(dir, POSITIONED)
  const out = runSkip(dir, spec, manifest, 'tests/unit/test_x.py::test_round_trip')
  assert.ok(!out.findings.some(f => f.ac === 'AC-20261024-01-1'),
    'the skip was mapped to the module docstring AC-20261024-01-1 (no [env:]) instead of the AC cited ' +
    'after test_round_trip, so an env-gated skip is hard-failed against the wrong bullet; findings: ' +
    JSON.stringify(out.findings))
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 1 },
    'the skip must resolve to AC-20261024-01-8 and be sanctioned by its [env: SOME_VAR]; got ' +
    JSON.stringify(out.observed.skipReconcile))
})

test('AC-20261024-01-12: a bare-name skip line found inside a test file maps to the first AC cited after that position, not the file-level first AC', () => {
  const dir = tmpdir('acm-skip-pos-bare')
  const { spec, manifest } = host(dir, POSITIONED)
  const out = runSkip(dir, spec, manifest, 'def test_round_trip')
  assert.ok(!out.findings.some(f => f.ac === 'AC-20261024-01-1'),
    'the bare-name skip was mapped to the file-level first AC-20261024-01-1 instead of the AC cited ' +
    'after the test, so its [env:] sanction is read from the wrong bullet; findings: ' +
    JSON.stringify(out.findings))
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 1 },
    'the skip must resolve to AC-20261024-01-8 and be sanctioned; got ' +
    JSON.stringify(out.observed.skipReconcile))
})

test('a bare-name skip line with no AC cited after its position falls back to the file first cited AC (specs/20261024/01 D6 fallback)', () => {
  const dir = tmpdir('acm-skip-pos-fallback')
  const body = [
    '"""Module docstring. Covers AC-20261024-01-1."""',
    '',
    'def test_late():',
    '    pass',
    '',
  ].join('\n')
  const { spec, manifest } = host(dir, body)
  const out = runSkip(dir, spec, manifest, 'def test_late')
  const f = out.findings.find(x => x.class === 'unsanctioned-skip' && x.ac === 'AC-20261024-01-1')
  assert.ok(f,
    'with no AC cited after the test, the skip must fall back to the file-level first AC (-01-1, no ' +
    'env) and fail as unsanctioned-skip; without the fallback the skip becomes unmapped; findings: ' +
    JSON.stringify(out.findings))
})

test('a class-qualified skip id maps to the AC cited after its method, not the module docstring AC (specs/20261024/01 D6 last-segment name)', () => {
  const dir = tmpdir('acm-skip-pos-class')
  const body = POSITIONED.replace('def test_round_trip', 'class TestA:\n  def test_round_trip')
  const { spec, manifest } = host(dir, body)
  const out = runSkip(dir, spec, manifest, 'tests/unit/test_x.py::TestA::test_round_trip')
  assert.ok(!out.findings.some(f => f.ac === 'AC-20261024-01-1'),
    'the class-qualified id was looked up as "TestA::test_round_trip", missed in source, and fell back to the module docstring AC; findings: ' +
    JSON.stringify(out.findings))
  assert.deepStrictEqual(out.observed.skipReconcile, { skipped: 1, sanctioned: 1 },
    'the skip must resolve to the AC cited after the method and be sanctioned; got ' +
    JSON.stringify(out.observed.skipReconcile))
})
