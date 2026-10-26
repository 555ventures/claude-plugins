'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261026/02-one-tests-row-check-and-host-shape-hints.md AC-20261026-02-2 (D1).

function host(layer) {
  const dir = tmpdir('rcl')
  const g = gitRepo(dir)
  const base = g('rev-parse', 'HEAD').trim()
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify({ testCommand: 'node --test' }))
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/a.test.js'),
    "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\n" +
    "test('AC-20261026-93-1: vacuously true', () => { assert.ok(true) })\n")
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\n## Acceptance Criteria\n\n' +
    '- **AC-20261026-93-1**: WHEN x THE SYSTEM SHALL y → tests/a.test.js\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    `| tests/a.test.js | CREATE | ${layer} | AC-20261026-93-1 |\n`)
  return runNode('scripts/red-check.js', ['--spec', spec, '--root', dir, '--base', base, '--json'])
}

function parse(res) {
  try { return JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
}

test('AC-20261026-02-2: red-check reports one unsanctioned-green for a passing test whose File Plan layer is spelled Test, exit 1, exactly as for tests', () => {
  const ref = host('tests')
  assert.strictEqual(ref.status, 1, `control row spelled tests must exit 1 (stderr: ${ref.stderr}) — the fixture itself is broken`)
  const res = host('Test')
  assert.strictEqual(res.status, 1,
    `a Test-layer row must be checked like a tests row; exit ${res.status} means the red-first check passed on zero files (stderr: ${res.stderr})`)
  const hits = parse(res).findings.filter((f) => f.class === 'unsanctioned-green' && f.path === 'tests/a.test.js')
  assert.strictEqual(hits.length, 1,
    `exactly one unsanctioned-green naming tests/a.test.js is required — a vacuous pin spelled Test would ship unseen; got ${res.stdout}`)
})
