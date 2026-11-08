'use strict'
// Pins lib/report.js: the fixed report order in architecture §8.
const test = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { SPEC } = require('./helpers')
const { render } = require(path.join(SPEC, 'scripts/lib/report.js'))

test('sections render in the fixed order with their markers', () => {
  const out = render({
    next: '/spec:run specs/x.md', queued: 'q1', artifacts: ['a.md'], blocks: ['b'], warns: ['w'],
    pins: ['📌 Auto-picked merge-commit'], bullets: ['one', 'two'], outcome: '✅ merged',
  })
  const lines = out.trim().split('\n').filter(Boolean)
  assert.deepStrictEqual(lines, [
    '**✅ merged**', '- one', '- two', '📌 Auto-picked merge-commit', '⚠️ w', '🚫 b', '📦 a.md', '📋 q1',
    'Next: /spec:run specs/x.md',
  ], 'a reordered or double-marked report breaks the shared reporting style')
})

test('empty sections are omitted and Next never ends in a question mark', () => {
  const out = render({ outcome: '⚠️ partial', next: 'run it?' })
  assert.strictEqual(out, '**⚠️ partial**\n\nNext: run it\n', 'empty sections must not print and Next must not ask')
  for (const next of [undefined, null, '', '  ', '?']) {
    assert.throws(() => render({ outcome: '✅ x', next }), /next is required/, `a missing next (${next}) is a bug in the driver, not "all done"`)
  }
  const quoted = '/spec:fix status prints null — TypeError: cannot read properties of undefined'
  assert.ok(render({ outcome: '✅ x', next: quoted }).endsWith(`\nNext: ${quoted}\n`), 'a Next that quotes a real error is the fact, printed as it is')
  assert.throws(() => render({}), /outcome/, 'a report without an outcome has no verdict')
})

test('the --slots CLI prints the rendered report and refuses a bad slots file', () => {
  const fs = require('fs')
  const { tmpdir, runNode } = require('./helpers')
  const dir = tmpdir('report-cli')
  const slots = { outcome: '✅ done', bullets: ['one'], next: '/spec:run x' }
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify(slots))
  const r = runNode('scripts/lib/report.js', ['--slots', path.join(dir, 's.json')])
  assert.strictEqual(r.status, 0, r.stderr)
  assert.strictEqual(r.stdout, render(slots), 'command prose relies on the CLI matching render()')
  fs.writeFileSync(path.join(dir, 'bad.json'), '{}')
  assert.strictEqual(runNode('scripts/lib/report.js', ['--slots', path.join(dir, 'bad.json')]).status, 2, 'a slots file without outcome is a refusal')
  assert.strictEqual(runNode('scripts/lib/report.js', ['--slots', path.join(dir, 'missing.json')]).status, 2, 'a missing slots file is a refusal')
})
