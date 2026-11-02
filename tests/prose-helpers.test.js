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

test('AC-20261101-04-2: sliceSection() cuts by heading and throws naming label and regex; section() fails once on a missing file', () => {
  const t = '## A\nx\n## B\ny'
  assert.strictEqual(sliceSection(t, /^## A$/, /^## /, 'f'), '## A\nx', 'slice must stop before the next heading')
  assert.strictEqual(sliceSection(t, /^## B$/, /^## /, 'f'), '## B\ny', 'no later heading must run to the end')
  assert.throws(() => sliceSection(t, /^## C$/, /^## /, 'f'), (e) =>
    e instanceof assert.AssertionError && e.message.includes('f') && e.message.includes(String(/^## C$/)),
  'a missing heading must fail naming the file label and the regex')
  assert.ok(section('spec/doctrine/core.md', /^## Doctrine Authoring$/, /^## /).startsWith('## Doctrine Authoring'),
    'section must return the slice starting at the heading')
  assert.throws(() => section('spec/doctrine/nope.md', /^## X$/, /^## /), (e) =>
    e instanceof assert.AssertionError && e.message.includes('spec/doctrine/nope.md') && e.message.includes('must exist'),
  'a missing file must fail once with the remedy, never a TypeError')
})
