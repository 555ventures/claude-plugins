'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC, read, tmpdir, runNode } = require('./helpers')

// specs/20261104/01-the-legs-seal-the-manifest.md D1-D3 — AC-20261104-01-1, -2, -3, -4, -12.

const LIB = path.join(SPEC, 'scripts/lib/manifest.js')
const load = () => require(LIB)

function writeRows(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n')
  return p
}

const GATE = { leg: 'gate', exit: 0, observed: { skips: 0 } }
const MATRIX_RED = { leg: 'ac-matrix', exit: 1, observed: { uncovered: 1 } }
const SWEEP = { leg: 'promise-sweep', exit: 0, observed: { orphans: 0 } }

test('AC-20261104-01-1: WHEN readManifest reads three valid rows THE SYSTEM returns rows, byLeg, valid true, cause null and the sha256 of the bytes, and null for a missing path', () => {
  const dir = tmpdir('mr-ac1')
  const p = writeRows(dir, [GATE, MATRIX_RED, SWEEP])
  const m = load().readManifest(p)
  assert.strictEqual(m.rows.length, 3, 'every parseable row must be returned or a caller loses evidence')
  assert.strictEqual(m.byLeg.size, 3, 'three distinct legs must map to three entries')
  assert.strictEqual(m.valid, true, 'three well-formed distinct rows are valid evidence')
  assert.strictEqual(m.cause, null, 'a valid manifest has no cause')
  assert.strictEqual(m.digest, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),
    'the digest must be the sha256 of the file bytes or the driver seal compares nothing')
  assert.strictEqual(load().readManifest(path.join(dir, 'absent.jsonl')), null,
    'a missing manifest must read as absent, never as an empty green file')
})

test('AC-20261104-01-2: WHEN ac-matrix appears on lines 6 and 9 THE SYSTEM reports valid false, the duplicate cause, all 9 rows and the FIRST row in byLeg', () => {
  const dir = tmpdir('mr-ac2')
  const rows = [GATE, { leg: 'suite', exit: 0, observed: {} }, { leg: 'smoke', exit: 4, observed: {} },
    { leg: 'reconcile', exit: 0, observed: {} }, { leg: 'skip-reconcile', exit: 0, observed: {} },
    { leg: 'ac-matrix', exit: 1, observed: { uncovered: 0 } }, { leg: 'ci', exit: 0, observed: {} },
    { leg: 'at-risk', exit: 0, observed: {} }, { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0 } }]
  const m = load().readManifest(writeRows(dir, rows))
  assert.strictEqual(m.valid, false, 'a second run of a leg is not evidence')
  assert.strictEqual(m.cause, 'duplicate leg ac-matrix (rows 6, 9)', 'the cause must name the leg and both 1-based rows')
  assert.strictEqual(m.rows.length, 9, 'every row stays visible to callers that want the raw file')
  assert.strictEqual(m.byLeg.get('ac-matrix').exit, 1,
    'a later green row must never replace the first red row or a hand re-run erases a real red leg')
})

test('AC-20261104-01-3: WHEN a line does not parse or its observed is not an object THE SYSTEM reports the row-numbered cause and keeps the other rows', () => {
  const dir = tmpdir('mr-ac3')
  const bad = load().readManifest(writeRows(dir, [GATE, 'not json', SWEEP]))
  assert.strictEqual(bad.valid, false, 'an unparseable line invalidates the manifest')
  assert.strictEqual(bad.cause, 'row 2 unparseable', 'the cause must name the 1-based line')
  assert.strictEqual(bad.rows.length, 2, 'every other parsed row must still be returned')
  const str = load().readManifest(writeRows(dir, [SWEEP, { leg: 'gate', exit: 0, observed: 'skips=0' }]))
  assert.strictEqual(str.valid, false, 'a string observed invalidates the manifest')
  assert.strictEqual(str.cause, 'row 2 observed must be a non-null JSON object', 'the cause must name the row and the rule')
  assert.strictEqual(str.byLeg.has('gate'), true, 'a string-observed row still carries its leg, which callers like ac-matrix read')
})

test('AC-20261104-01-4: WHEN verdict.js reads a manifest whose ac-matrix is red on row 6 and green again on row 9 THE SYSTEM prints UNVERIFIED with the duplicate cause, exits 1, never CLEAN', () => {
  const dir = tmpdir('mr-ac4')
  const rows = [GATE, { leg: 'suite', exit: 0, observed: { skips: 0 } }, { leg: 'smoke', exit: 4, observed: { result: 'inert' } },
    { leg: 'reconcile', exit: 0, observed: { outOfPlan: 0 } }, { leg: 'skip-reconcile', exit: 0, observed: { skipped: 0 } },
    { leg: 'ac-matrix', exit: 1, observed: { uncovered: 1 } }, { leg: 'ci', exit: 0, observed: { conclusion: 'success' } },
    { leg: 'at-risk', exit: 0, observed: { files: 0 } }, { leg: 'ac-matrix', exit: 0, observed: { uncovered: 0 } },
    { leg: 'promise-sweep', exit: 0, observed: { orphans: 0 } }, { leg: 'tests', exit: 0, observed: { count: 1 } }]
  const manifest = writeRows(dir, rows)
  const workflow = path.join(dir, 'workflow.json')
  fs.writeFileSync(workflow, JSON.stringify({ verdict: 'CLEAN', survivors: [], killed: 0,
    verify: { verified: 0, demonstrated: 0, killedByExecution: 0, sanctioned: 0, miscited: 0, unverifiable: 0, failed: 0, capSkipped: 0 },
    reviewerCount: 1, scope: 'full', tokens: { workflow: 100 } }))
  const r = runNode('scripts/verdict.js', ['--manifest', manifest, '--workflow', workflow])
  assert.strictEqual(r.stdout.split('\n')[0], 'UNVERIFIED', 'a duplicated leg must fail closed, not derive from either row: ' + r.stdout + r.stderr)
  assert.strictEqual(r.status, 1, 'UNVERIFIED exits 1: ' + r.stderr)
  assert.match(r.stderr, /^verdict\.js: UNVERIFIED — manifest invalid: duplicate leg ac-matrix \(rows 6, 9\)$/m,
    'the stderr line must carry the duplicate cause so the operator sees why: ' + r.stderr)
})

test('AC-20261104-01-12: WHEN the five manifest-reading scripts are read THE SYSTEM routes each through lib/manifest.js and none keeps a private row reader', () => {
  for (const f of ['verdict.js', 'spec-review-driver.js', 'ac-matrix.js', 'release-legs.js', 'review-legs.js']) {
    const src = read(path.join('spec/scripts', f)).replace(/^\s*\/\/.*$/gm, '')
    assert.match(src, /require\(['"]\.\/lib\/manifest(\.js)?['"]\)/,
      `${f} must require the shared reader or the readers disagree again on the same file`)
    assert.doesNotMatch(src, /function (readManifestRows|manifestHasRows)\b/,
      `${f} must not keep a private reader that resolves rows its own way`)
  }
})
