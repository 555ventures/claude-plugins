'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// specs/20261103/12-one-suite-run-per-tree.md D4: AC-20261103-12-9, AC-20261103-12-10.

const { resolveGate, resolveGateForFiles, gateRunsSuite } = require(path.join(SPEC, 'scripts/lib/gate-resolve.js'))

const SPEC_TEXT = `---
status: implementing
tier: standard
---
# Gate placeholder spec

## File Plan

| File | Action | Layer |
|---|---|---|
| src/foo.js | edit | scripts |
| tests/a.test.js | create | tests |
| tests/review/b.test.js | create | tests |
| tests/fixtures/f.js | create | tests |

## Acceptance Criteria

- **AC-20260101-01-1**: x.
`

test('AC-20261103-12-9: {testFiles} resolves to the exact File Plan test files, fixtures dropped, in resolveGate and resolveGateForFiles, and a {testFiles} gate never counts as running the suite', () => {
  const r = resolveGate(SPEC_TEXT, { gateCommand: 'node --test {testFiles}' })
  assert.strictEqual(r.gate, 'node --test tests/a.test.js tests/review/b.test.js',
    'the gate must name the exact files, not a glob — a glob runs every sibling test to check three: ' + JSON.stringify(r))
  const f = resolveGateForFiles('node --test {testFiles}', ['tests/a.test.js', 'tests/review/b.test.js'])
  assert.strictEqual(f, 'node --test tests/a.test.js tests/review/b.test.js',
    'the explicit-list form must substitute the same files — the close-time re-run would otherwise hand the placeholder to the shell: ' + f)
  assert.strictEqual(gateRunsSuite('node --test {testFiles} && npm test', 'node --test tests/a.test.js && npm test', 'npm test'),
    false,
    'a scoped {testFiles} gate must not be reported as having run the suite — review would skip the suite leg on a partial run')
})

test('AC-20261103-12-10: a {testDirs} gate still resolves to the glob form byte-identically and a plain npm test gate still counts as running the suite', () => {
  const r = resolveGate(SPEC_TEXT, { gateCommand: 'node --test {testDirs}' })
  assert.strictEqual(r.gate, "node --test 'tests/*.test.js' 'tests/review/*.test.js'",
    'the glob derivation is the shipped behavior for runners that take globs — drifting it breaks every existing host gate: ' + JSON.stringify(r))
  assert.strictEqual(gateRunsSuite('npm test', 'npm test', 'npm test'), true,
    'a gate that is the test command itself must still reuse the suite leg — losing this re-runs the suite on every review')
})
