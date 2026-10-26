'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const { specMd, writeManifest, run, findings } = require('./ac-matrix.fixtures')

// specs/20261026/02-one-tests-row-check-and-host-shape-hints.md AC-20261026-02-3 (D1).

function missingFindings(layer) {
  const dir = tmpdir('amls')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20261026-94-1\n')
  const specPath = path.join(dir, 'spec.md')
  fs.writeFileSync(specPath, specMd(
    ['- **AC-20261026-94-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |',
      `| tests/missing.test.js | CREATE | ${layer} | AC-20261026-94-1 |`]))
  const res = run(specPath, dir, writeManifest(dir, []), ['--json'])
  return findings(res).findings.filter((f) => f.class === 'missing-test-file')
}

test('AC-20261026-02-3: ac-matrix raises the same missing-test-file finding for a CREATE row spelled Test as for the identical row spelled tests', () => {
  const ref = missingFindings('tests')
  assert.strictEqual(ref.length, 1, `control row spelled tests must raise one missing-test-file — the fixture is broken: ${JSON.stringify(ref)}`)
  const got = missingFindings('Test')
  assert.strictEqual(got.length, ref.length,
    `a Test-spelled tests row naming a missing file must raise the same count as tests (${ref.length}); got ${got.length} — a missing test file would ship unreported`)
  assert.strictEqual(got[0].severity, ref[0].severity,
    'the Test-spelled finding must carry the same severity as the tests-spelled one — a downgrade silently softens the gate')
})
