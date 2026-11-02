'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { failCount } = require('../../spec/scripts/lib/gate-fail-count')

// specs/20261102/01-the-host-names-its-runner-grammar.md D3 — a declared failCountPattern is authoritative.

test('AC-20261102-01-5: a declared pattern returns group 1 of its first match and consults no built-in shape', () => {
  assert.strictEqual(failCount('Failed: 2\n', 'Failed:\\s+(\\d+)'), 2,
    'a declared pattern must be read, or a runner outside the built-in shapes gets "not derivable" for every log')
  assert.strictEqual(failCount('ℹ fail 4\n', 'Failed:\\s+(\\d+)'), null,
    'a declared pattern that misses must not fall back to the built-ins, or declared-but-drifted reads as a count')
  assert.doesNotThrow(() => failCount('x', '(unclosed'),
    'an invalid regex must never throw, or the ESCALATE step crashes the driver')
  assert.strictEqual(failCount('x', '(unclosed'), null,
    'an invalid regex must read as not derivable, or a guess stands in for a count')
})

test('AC-20261102-01-6: failCount with no pattern CONTINUEs to read the two built-in shapes and null otherwise', () => {
  assert.strictEqual(failCount('ℹ fail 4\n'), 4, 'the node:test shape must keep reading, or every default host loses its ESCALATE trend')
  assert.strictEqual(failCount('# fail 5\n'), 5, 'the TAP shape must keep reading, or TAP hosts lose their trend')
  assert.strictEqual(failCount('3 failed\n'), 3, 'the generic failed shape must keep reading, or jest/pytest hosts lose their trend')
  assert.ok(typeof failCount('nothing') !== 'number', 'text with neither shape must stay non-numeric, or a guess reads as zero')
})

test('the "none" pattern declines the count: failCount returns null even for text a built-in shape would read', () => {
  assert.strictEqual(failCount('ℹ fail 4\n', 'none'), null,
    'a host declaring "none" has said its runner prints no count; reading a built-in shape anyway recommends on a guess')
})
