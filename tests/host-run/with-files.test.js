'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const hostRun = require('../../spec/scripts/lib/host-run')

// specs/20261102/01-the-host-names-its-runner-grammar.md D2 — withFiles is the one {file} substitution.

function call(cmd, paths) {
  assert.strictEqual(typeof hostRun.withFiles, 'function',
    'lib/host-run.js exports no withFiles, so every consumer keeps its own append spelling and {file} is inexpressible')
  return hostRun.withFiles(cmd, paths)
}

test('AC-20261102-01-1: withFiles replaces every {file} with the quoted space-joined paths and appends nothing', () => {
  assert.strictEqual(call('go test ./pkg/... -run {file} -v', ['A', 'B']), 'go test ./pkg/... -run A B -v',
    'a placeholder command must substitute in place and append nothing, or go/cargo/dotnet runners get a stray trailing path')
  assert.strictEqual(call('cargo test --test {file} {file}', ['it']), 'cargo test --test it it',
    'every occurrence must be replaced, or a second placeholder reaches the shell as a literal brace word')
  assert.strictEqual(call('run {file}', ["it's"]), "run 'it'\\''s'",
    'a path needing quotes must go through quote(), or a metacharacter reaches the shell unquoted')
})

test('AC-20261102-01-2: withFiles with no {file} appends one space and each quoted path in order, never expanding $', () => {
  assert.strictEqual(call('node --test', ['tests/a.test.js']), 'node --test tests/a.test.js',
    'the no-placeholder form must reproduce the appended command byte-for-byte, or every existing host command string shifts')
  assert.strictEqual(call('node --test', ['tests/a.test.js', 'tests/b.test.js']), 'node --test tests/a.test.js tests/b.test.js',
    'paths must append in the given order, or the at-risk leg reorders the files it hands the runner')
  assert.strictEqual(call('vitest run', ['customers.$id.test.tsx']), "vitest run 'customers.$id.test.tsx'",
    'a $ in a path must stay single-quoted, or bash expands $id away and the runner sees a path that does not exist')
})
