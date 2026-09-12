'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, ROOT } = require('../helpers')

// Direct fix, 2026-09-12: close-time expiry (specs/20260911/03) deletes a done spec's tests, and a
// host gate that demands a test carrier for EVERY acceptance criterion of a done spec then calls
// those criteria uncovered and refuses the close forever (prax scripts/check-ac-execution.mjs).
// The grounding contract's § Test expiry now carries the host obligation; coverage-scope.js is its
// conformance probe for hosts initialized before that section existed, run as /spec:doctor check
// 20(b). The signature is deliberately narrow — a file that PARSES acceptance-criterion ids next to
// a `done` status and never names the pin phrase — because a check honoring the obligation must
// name `SHALL CONTINUE TO` to implement its exemption.

const OFFENDER = `#!/usr/bin/env node
// Host AC-coverage gate.
const AC_RE = /AC-\\d{8}-\\d{2}-\\d+/g
for (const spec of specs) {
  const status = frontmatter(spec).status
  if (status !== "implementing" && status !== "done") continue
  requireCarrierForEveryAc(spec.match(AC_RE))
}
`

function makeHost(prefix, files) {
  const root = fs.realpathSync(tmpdir(prefix))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify({ gateCommand: 'true' }))
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
  return root
}

function scan(root) {
  const r = runNode('scripts/coverage-scope.js', ['--root', root, '--json'])
  assert.notStrictEqual(r.status, 2, 'the scan must not exit on usage: ' + r.stdout + r.stderr)
  return { ...JSON.parse(r.stdout), status: r.status }
}

test('a host check parsing AC-IDs beside a done status with no pin exemption is named, exit 1', () => {
  const out = scan(makeHost('covscope-hit', { 'scripts/check-ac.mjs': OFFENDER }))
  assert.deepStrictEqual(out.findings, ['scripts/check-ac.mjs'],
    'the one host file that would deadlock every close must be named — an unnamed offender is exactly the ' +
    'silence this check exists to end: ' + JSON.stringify(out))
  assert.strictEqual(out.status, 1,
    'findings must exit 1 so doctor reports the check as advisory-with-findings rather than clean')
})

test('the same check naming SHALL CONTINUE TO is exempt — that phrase is how the exemption is implemented', () => {
  const body = OFFENDER.replace('continue\n', 'continue\n  // a done spec owes a carrier only for a SHALL CONTINUE TO criterion\n')
  const out = scan(makeHost('covscope-exempt', { 'scripts/check-ac.mjs': body }))
  assert.deepStrictEqual(out.findings, [],
    'a check that names the pin phrase has implemented the exemption and must never be reported — flagging it ' +
    'would train hosts to ignore the finding: ' + JSON.stringify(out))
  assert.strictEqual(out.status, 0, 'a clean scan must exit 0')
})

test('a test file carrying the identical text is never a finding — an AC-tagged test is the normal shape', () => {
  const out = scan(makeHost('covscope-testfile', { 'tests/ac-coverage.test.js': OFFENDER }))
  assert.deepStrictEqual(out.findings, [],
    'test-classified files are the population expiry DELETES, never the population that enforces coverage: ' +
    JSON.stringify(out))
})

test('a script merely citing a literal AC-ID as its owner citation is never a finding', () => {
  const cite = `'use strict'\n// WHY: specs/20260824/02-receipt.md AC-20260824-02-1 — derive the queue.\nconst DONE = "done"\nmodule.exports = { DONE }\n`
  const out = scan(makeHost('covscope-citation', { 'scripts/queue.js': cite }))
  assert.deepStrictEqual(out.findings, [],
    'every script in the grounding layer carries an owner citation beside ordinary status handling — matching on ' +
    'a cited id rather than an extraction pattern would report the whole layer: ' + JSON.stringify(out))
})

test('a spec declaring criteria and statuses is never a finding — specs declare, they do not enforce', () => {
  const specBody = `---\nstatus: done\n---\n# S\n\n## Acceptance Criteria\n\n- **AC-20260912-09-1**: WHEN x THE SYSTEM SHALL y\n`
  const out = scan(makeHost('covscope-spec', {
    'specs/20260912/09-s.md': specBody,
    'scripts/read-specs.js': `const AC_RE = /AC-\\d{8}/\nconst s = "done"\n`,
  }))
  assert.deepStrictEqual(out.findings, ['scripts/read-specs.js'],
    'the specs/ tree must be excluded by construction while a real parser outside it still reports: ' +
    JSON.stringify(out))
})

test('this repository reports no findings — the live pin every future drift turns red', () => {
  const out = scan(ROOT)
  assert.deepStrictEqual(out.findings, [],
    'the plugin\'s own AC-parsing scripts (expire-tests.js, ac-drift.js) all implement the pin exemption, so a ' +
    'finding here means either the signature drifted or a script lost its exemption: ' + JSON.stringify(out))
  assert.ok(out.scanned > 50,
    'the live scan must actually walk this repo\'s sources — a near-zero scanned count means the walk broke and ' +
    'the empty findings list proves nothing: ' + JSON.stringify(out))
})
