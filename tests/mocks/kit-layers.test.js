'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// Owner: specs/20260912/09-a-mock-may-not-invent.md D7, AC-20260912-09-6.
// spec/scripts/lib/kit-layers.js is a pure module (no fs) — required directly, the same
// pattern tests/parse-selection/parse-selection.test.js and tests/frontmatter/frontmatter.test.js
// already use for a plugin lib with no disk or process dependency of its own.

test('AC-20260912-09-6: layoutShare counts a rule as layout only when every one of its declarations names a layout property, and returns zeroes for an empty stylesheet', () => {
  const { layoutShare } = require('../../spec/scripts/lib/kit-layers')
  const css = '.a{display:flex;gap:8px}\n.b{padding:12px}\n.c{color:var(--foreground)}\n' +
    '.d{gap:8px;color:var(--foreground)}\n'
  assert.deepStrictEqual(layoutShare(css), { rules: 4, layoutRules: 2, percent: 50 },
    'two of the four rules (.a, .b) declare only layout/spacing properties; .c is pure styling and .d mixes gap with color, so it counts as styling too — layoutShare must return {rules:4, layoutRules:2, percent:50}, not count the mixed rule as layout')
  assert.deepStrictEqual(layoutShare(''), { rules: 0, layoutRules: 0, percent: 0 },
    'an empty stylesheet has no rules to measure, so layoutShare must return {rules:0, layoutRules:0, percent:0}, never divide by zero into NaN or a nonzero percent')
})
