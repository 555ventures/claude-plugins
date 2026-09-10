'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { ROOT, runNode } = require('../helpers')

// Pins specs/20260909/07-hang-bound-and-port-check.md D5, AC-20260909-07-8 — this repository's
// own tests/ tree holds zero fixed/computed port literals now that specs/20260909/06 removed
// the pid- and random-derived windows and this spec's own D9 flip retires the last two
// port-flag literals. Executed against this repo's real tree via port-check.js.

test('AC-20260909-07-8: port-check.js --root <this repo> exits 0 with no findings', () => {
  const r = runNode('scripts/port-check.js', ['--root', ROOT])
  assert.strictEqual(r.status, 0,
    `this repository must carry zero fixed or computed port literals under tests/ — a nonzero exit here means a pid- or random-derived window (or a literal --port <n>) crept back in: stdout=${r.stdout} stderr=${r.stderr}`)
  assert.strictEqual(r.stdout.trim(), '',
    `a clean run must print nothing on stdout — any line here names a real finding this repo is supposed to hold at zero: ${JSON.stringify(r.stdout)}`)
})

test('AC-20260909-07-8: port-check.js --root <this repo> --json exits 0 with an empty findings array', () => {
  const r = runNode('scripts/port-check.js', ['--root', ROOT, '--json'])
  assert.strictEqual(r.status, 0,
    `--json must agree with the plain render's exit code on this repo: stdout=${r.stdout} stderr=${r.stderr}`)
  let parsed
  try {
    parsed = JSON.parse(r.stdout)
  } catch (e) {
    assert.fail(`--json must print parseable JSON even on a clean tree, or nothing downstream can consume this check's result: ${e.message} (stdout: ${JSON.stringify(r.stdout)})`)
  }
  assert.deepStrictEqual(parsed.findings, [],
    `this repository's findings array must be empty — a nonempty array here is exactly the drift /spec:doctor check 18 exists to catch: ${JSON.stringify(parsed.findings)}`)
})
