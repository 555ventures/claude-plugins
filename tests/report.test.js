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
  assert.match(render({ outcome: '✅ x' }), /Next: nothing needs you — /, 'a missing next must still say nothing needs you')
  assert.throws(() => render({}), /outcome/, 'a report without an outcome has no verdict')
})
