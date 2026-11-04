'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { sliceSection, section, phrase } = require('./helpers')

// specs/20261101/04-the-suite-pins-references-not-wording.md — the reflow-safe prose-pin helpers.

test('AC-20261101-04-1: phrase() matches across any whitespace run, escapes metacharacters, and trims into \\s+', () => {
  const p = phrase('spec-paths worktree-include')
  assert.ok(p.test('spec-paths\n  worktree-include'), 'a hard-wrapped literal would red a pin on a reflow')
  assert.ok(p.test('spec-paths worktree-include'), 'the single-space form must still match')
  assert.ok(!p.test('spec-paths-worktree-include'), 'whitespace must not be optional or a pin matches a different token')
  const q = phrase('a.b (c) [d]')
  assert.ok(q.test('a.b (c) [d]'), 'escaped metacharacters must match themselves')
  assert.ok(!q.test('axb (c) [d]'), 'an unescaped dot would match any character and pass a stale pin')
  const r = phrase('  Hard  stop ', 'i')
  assert.strictEqual(r.source, 'Hard\\s+stop', 'edges are trimmed and the inner run becomes \\s+')
  assert.strictEqual(r.flags, 'i', 'flags pass through')
})

