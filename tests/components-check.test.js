'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, runBash } = require('./helpers')

// specs/20260810/01-design-path-model-placement.md — D2/D3: components-check.js is the new
// deterministic schema authority for design/components.json (D1's vocabulary extension).
// Pinned here BEFORE the script exists (TDD red phase): exit-code alphabet (0 valid / 1
// findings / 2 usage-or-missing), the legacy-wrapper tolerance, and the spec-paths key that
// every command resolves the script through.

const writeManifest = (dir, data) => {
  const p = path.join(dir, 'components.json')
  fs.writeFileSync(p, JSON.stringify(data))
  return p
}

test('AC-20260810-01-1: a valid top-level-array manifest exits 0', () => {
  const dir = tmpdir('cc')
  const p = writeManifest(dir, [{ name: 'Chip', purpose: 'status' }])
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 0, 'a spec-valid manifest must pass: ' + r.stderr + r.stdout)
})

test('AC-20260810-01-1: an entry missing purpose exits 1 with a finding naming the entry and field', () => {
  const dir = tmpdir('cc')
  const p = writeManifest(dir, [{ name: 'Chip' }])
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 1, 'a manifest entry missing the required purpose field must be a validation finding, not a pass')
  assert.match(r.stdout + r.stderr, /Chip/, 'the finding must name the offending entry')
  assert.match(r.stdout + r.stderr, /purpose/, 'the finding must name the offending field')
})

test('AC-20260810-01-1: a duplicate name exits 1', () => {
  const dir = tmpdir('cc')
  const p = writeManifest(dir, [
    { name: 'Chip', purpose: 'status one' },
    { name: 'Chip', purpose: 'status two' },
  ])
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 1, 'duplicate names silently shadow one binding home per component; must be a hard finding')
  assert.match(r.stdout + r.stderr, /Chip/, 'the finding must name the duplicated entry')
})

test('AC-20260810-01-1: a non-array boundaries field exits 1', () => {
  const dir = tmpdir('cc')
  const p = writeManifest(dir, [{ name: 'Chip', purpose: 'status', boundaries: 'not an array' }])
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 1, 'boundaries must be an array of strings per D2 — a scalar value must be a finding')
  assert.match(r.stdout + r.stderr, /Chip/, 'the finding must name the offending entry')
  assert.match(r.stdout + r.stderr, /boundaries/, 'the finding must name the offending field')
})

test('AC-20260810-01-2: a missing manifest path exits 2 with stderr naming the remedy', () => {
  const dir = tmpdir('cc')
  const p = path.join(dir, 'nope.json')
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 2, 'a missing manifest is a usage/precondition error, not a validation finding (exit 1) or a silent pass')
  assert.ok(r.stderr.trim().length > 0, 'stderr must name the remedy per the gate-script header convention')
})

test('AC-20260810-01-2: an unparseable manifest exits 2', () => {
  const dir = tmpdir('cc')
  const p = path.join(dir, 'components.json')
  fs.writeFileSync(p, '{ this is not json')
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 2, 'invalid JSON must exit 2 (usage/precondition), never crash uncaught or exit 0/1')
})

test('AC-20260810-01-2: the legacy {components:[...]} wrapper warns naming the canonical array form and still validates (valid entries exit 0)', () => {
  const dir = tmpdir('cc')
  const p = writeManifest(dir, { components: [{ name: 'Chip', purpose: 'status' }] })
  const r = runNode('scripts/components-check.js', [p])
  assert.strictEqual(r.status, 0, 'a valid legacy-wrapper manifest must still validate and pass — brownfield files predate D2 and must not be broken by this checker')
  assert.match(r.stdout + r.stderr, /array/i, 'the legacy wrapper must draw a warning naming the canonical top-level array form, not a silent accept')
})

test('AC-20260810-01-3: spec-paths components-check prints the script\'s absolute path', () => {
  const r = runBash('bin/spec-paths', ['components-check'])
  assert.strictEqual(r.status, 0, 'spec-paths must resolve the components-check key: ' + r.stderr)
  const p = r.stdout.trim()
  assert.match(p, /components-check\.js$/, 'the key must resolve to components-check.js')
  assert.ok(fs.existsSync(p), `components-check → ${p} does not exist`)
})

test('AC-20260810-01-3: spec-paths usage line lists the components-check key', () => {
  const r = runBash('bin/spec-paths', ['bogus-key-xyz'])
  assert.strictEqual(r.status, 1, 'an unknown key must fall through to the usage line')
  assert.match(r.stderr, /components-check/, 'the usage line must list the components-check key so a caller can discover it')
})
