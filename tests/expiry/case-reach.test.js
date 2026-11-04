'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261103/05-tests-that-earn-their-keep.md D4: AC-20261103-05-4, AC-20261103-05-5,
// AC-20261103-05-6 — expire-tests.js keep clause (b) judges each case by its reach (call text
// plus the declarations it names, one hop into relative requires), never by its whole file.

function put(root, rel, body) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, body)
}

const PREAMBLE = "'use strict'\nconst { test } = require('node:test')\nconst assert = require('node:assert')\nconst fs = require('node:fs')\n"

function makeHost(prefix, { gateRequires = '' } = {}) {
  const root = tmpdir(prefix)
  put(root, '.claude/spec.config.json', JSON.stringify({ gateCommand: 'node scripts/gate.js' }))
  put(root, 'scripts/gate.js', gateRequires + 'process.exit(0)\n')
  put(root, 'docs/a.md', 'the gate is documented here\n')
  put(root, 'specs/20260101/01-done.md', `---
status: done
tier: standard
diff_base: 0000000000000000000000000000000000000000
---
# Done Fixture

## Acceptance Criteria

- **AC-20260101-01-1**: THE SYSTEM does a first thing.
- **AC-20260101-01-2**: THE SYSTEM does a second thing.
`)
  return root
}

function expire(root) {
  const r = runNode('scripts/expire-tests.js', ['--root', root, '--all-done', '--json'])
  assert.strictEqual(r.status, 0, 'a dry run over a well-formed host must succeed: ' + r.stdout + r.stderr)
  return JSON.parse(r.stdout)
}

test('AC-20261103-05-4: WHEN one test file holds a spawnSync-through-a-constant case and a doc-reading case that names gate.js THE SYSTEM keeps only the exec case as invariant and retires the doc-reading case', () => {
  const root = makeHost('reach-4')
  put(root, 'tests/mixed.test.js', PREAMBLE + "const { spawnSync } = require('node:child_process')\n" +
    "const run = () => spawnSync(process.execPath, ['scripts/gate.js'])\n\n" +
    "test('AC-20260101-01-1: run() exits 0', () => {\n  assert.strictEqual(run().status, 0, 'gate exits 0')\n})\n\n" +
    "test('AC-20260101-01-2: gate.js is documented', () => {\n" +
    "  const text = fs.readFileSync('docs/a.md', 'utf8')\n  assert.match(text, /gate/, 'gate documented')\n})\n")
  const out = expire(root)
  assert.strictEqual(out.kept.invariant, 1,
    'only the case that reaches a child-process call on a pipeline script is an invariant; the file-level clause keeps both and a prose one-off lives forever: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 1, 'the doc-reading case must retire: ' + JSON.stringify(out.retired))
  assert.match(out.retired[0].title, /AC-20260101-01-2/,
    'the retired case must be the prose one, not the exec case: ' + JSON.stringify(out.retired))
})

test('AC-20261103-05-5: WHEN the case calls h.run() and the file reaches the script only through a multi-line destructure of a fixture module whose export spawns a constant-named script THE SYSTEM keeps the case as invariant', () => {
  const root = makeHost('reach-5')
  put(root, 'tests/fixture.js', "const { spawnSync } = require('node:child_process')\nconst DRIVER = 'scripts/gate.js'\n" +
    'module.exports = { h: { run: () => spawnSync(process.execPath, [DRIVER]) } }\n')
  put(root, 'tests/viafix.test.js', PREAMBLE + "const {\n  h,\n} = require('./fixture')\n\n" +
    "test('AC-20260101-01-1: the fixture driver exits 0', () => {\n  assert.strictEqual(h.run().status, 0, 'exits 0')\n})\n")
  const out = expire(root)
  assert.strictEqual(out.kept.invariant, 1,
    'a case that executes a pipeline script through a fixture module is the regression net; retiring it deletes real script tests: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 0, 'nothing here may retire: ' + JSON.stringify(out.retired))
})

test('AC-20261103-05-6: WHEN a case requires a relative lib that is in the invariants set with no child-process call THE SYSTEM keeps it as invariant, and WHEN a case names gate.js only in a doc-reading assertion THE SYSTEM retires it', () => {
  const root = makeHost('reach-6', { gateRequires: "require('./lib/util')\n" })
  put(root, 'scripts/lib/util.js', 'module.exports = { id: (x) => x }\n')
  put(root, 'tests/unit.test.js', PREAMBLE + "\ntest('AC-20260101-01-1: util returns its input', () => {\n" +
    "  const u = require('../scripts/lib/util')\n  assert.strictEqual(u.id(3), 3, 'identity')\n})\n")
  put(root, 'tests/prose.test.js', PREAMBLE + "\ntest('AC-20260101-01-2: docs mention gate.js', () => {\n" +
    "  const text = fs.readFileSync('docs/a.md', 'utf8')\n  assert.ok(text.includes('gate.js') || text.length > 0, 'documented')\n})\n")
  const out = expire(root)
  assert.strictEqual(out.kept.invariant, 1,
    'a unit test of a lib the gate requires pins a script the pipeline runs and must stay: ' + JSON.stringify(out))
  assert.deepStrictEqual(out.retired.map(r => r.file), ['tests/prose.test.js'],
    'naming gate.js without executing it must not keep a prose case alive: ' + JSON.stringify(out.retired))
})

test('AC-20261103-05-6: WHEN a case reaches an invariant lib through a fixture in a different directory than the test, whose own require climbs to scripts/lib, THE SYSTEM keeps it as invariant, as it does for a fixture beside the test', () => {
  const root = makeHost('reach-6-deep', { gateRequires: "require('./lib/util')\n" })
  put(root, 'scripts/lib/util.js', 'module.exports = { id: (x) => x }\n')
  put(root, 'tests/helpers/fx.js', 'module.exports = { h: require("../../scripts/lib/util") }\n')
  put(root, 'tests/unit.test.js', PREAMBLE + "const { h } = require('./helpers/fx')\n\n" +
    "test('AC-20260101-01-1: util returns its input via a nested fixture', () => {\n  assert.strictEqual(h.id(3), 3, 'identity')\n})\n")
  put(root, 'tests/fx2.js', 'module.exports = { g: require("../scripts/lib/util") }\n')
  put(root, 'tests/beside.test.js', PREAMBLE + "const { g } = require('./fx2')\n\n" +
    "test('AC-20260101-01-2: util returns its input via a sibling fixture', () => {\n  assert.strictEqual(g.id(4), 4, 'identity')\n})\n")
  const out = expire(root)
  assert.strictEqual(out.kept.invariant, 2,
    'resolving a fixture\'s require against the test file\'s directory instead of the fixture\'s own retires unit tests of pipeline libs that the gate requires: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 0, 'nothing here may retire: ' + JSON.stringify(out.retired))
})

test('AC-20261103-05-5: WHEN the require of a child-process helper sits inside the case\'s own call text and the case calls it on scripts/gate.js THE SYSTEM keeps the case as invariant', () => {
  const root = makeHost('reach-5-calltext')
  put(root, 'tests/helpers.js', "const { spawnSync } = require('node:child_process')\n" +
    'const runIt = (p) => spawnSync(process.execPath, [p])\nmodule.exports = { runIt }\n')
  put(root, 'tests/inline.test.js', PREAMBLE + "\ntest('AC-20260101-01-1: the inline-required helper runs the gate', () => {\n" +
    "  const { runIt } = require('./helpers')\n  assert.strictEqual(runIt('scripts/gate.js').status, 0, 'exits 0')\n})\n")
  const out = expire(root)
  assert.strictEqual(out.kept.invariant, 1,
    'a require inside the call text that is not followed retires an exec test whose spawn lives in the helper: ' + JSON.stringify(out))
  assert.strictEqual(out.retired.length, 0, 'nothing here may retire: ' + JSON.stringify(out.retired))
})
