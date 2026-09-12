'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  CUSTOMER_RECORDS,
  bare, mark, writeTargets, writeResearchBrief, confirmFacts, writeSeed,
} = require('./mocks-driver-fixtures')

// 2026-09-12 direct fix, amending specs/20260910/06-real-records-and-two-dense-screens.md D2:
// the seed's `## Records` gate asked for three of the client's REAL records, which a pre-launch
// product with no customers cannot supply — the driver exited 2 with a remedy no legitimate
// input could satisfy. The gate now asks for three records whose origin is declared in the file
// (`{ "provenance": "real" | "synthetic", "records": [...] }`), which is the part a script can
// actually check. These tests pin the greenfield path (a `synthetic` seed is accepted) and the
// refusals that keep the intent (fewer than three records, an undeclared origin, and the bare
// JSON array this shape replaces).

function recordsFileOf(dir) { return path.join(dir, 'design/mocks/records/customer.json') }

function seededHost(name) {
  const dir = tmpdir(name)
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  return dir
}

test('seed-done accepts a "synthetic" records file — a product with no customers can pass SEED — and the accepted mark discloses the provenance', () => {
  const dir = seededHost('mocks-seed-records-synthetic')
  fs.writeFileSync(recordsFileOf(dir),
    JSON.stringify({ provenance: 'synthetic', records: CUSTOMER_RECORDS }))

  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0,
    'seed-done must accept three records tagged "synthetic" — the whole point of the fix is ' +
    'that a greenfield product with no customers has no real records and must still be able to ' +
    'seed, which the real-only gate made impossible: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /records: customer 3 \(synthetic\)/,
    'the accepted mark must print the per-entity provenance — a journey later drawn on invented ' +
    'records is disclosed in the run output, not buried inside the JSON file: ' + r.stdout)
})

test('seed-done accepts a "real" records file and prints it as real', () => {
  const dir = seededHost('mocks-seed-records-real')
  fs.writeFileSync(recordsFileOf(dir),
    JSON.stringify({ provenance: 'real', records: CUSTOMER_RECORDS }))

  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0,
    'seed-done must accept three records tagged "real" — the client-supplied path stays the ' +
    'preferred one and must not have regressed while making "synthetic" legal: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /records: customer 3 \(real\)/,
    'a real seed must be disclosed as real, or the provenance line cannot be used to tell the ' +
    'two apart: ' + r.stdout)
})

test('seed-done refuses a bare JSON array, an undeclared provenance, and fewer than three records — naming "customer" and both provenance values', () => {
  const dir = seededHost('mocks-seed-records-refusals')
  const file = recordsFileOf(dir)

  fs.writeFileSync(file, JSON.stringify(CUSTOMER_RECORDS))
  let r = mark(dir, 'seed-done')
  let out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'a bare JSON array must be refused — an untagged array\'s origin is exactly what the gate ' +
    'asks for, so silently accepting it would leave the disclosure unenforced: ' + out)
  assert.ok(out.includes('customer') && out.includes('provenance'),
    'the refusal must name the entity and the missing provenance, or the session cannot tell ' +
    'which file to fix or how: ' + out)

  fs.writeFileSync(file, JSON.stringify({ provenance: 'invented', records: CUSTOMER_RECORDS }))
  r = mark(dir, 'seed-done')
  out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'a provenance outside real|synthetic must be refused, or the tag degrades into free text ' +
    'that no reader can rely on: ' + out)
  assert.ok(out.includes('"real"') && out.includes('"synthetic"'),
    'the refusal must name both accepted values — a remedy that does not spell out "synthetic" ' +
    'reproduces the original bug, where no legitimate input was discoverable: ' + out)

  fs.writeFileSync(file, JSON.stringify({ provenance: 'synthetic', records: CUSTOMER_RECORDS.slice(0, 2) }))
  r = mark(dir, 'seed-done')
  out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'fewer than three records must still be refused — the three-record floor is the part of the ' +
    'original intent this fix keeps: ' + out)
  assert.ok(out.includes('customer') && /2 record/.test(out),
    'the refusal must name the entity and the count it found, or the remedy is unactionable: ' + out)

  fs.writeFileSync(file, JSON.stringify({ provenance: 'synthetic', records: CUSTOMER_RECORDS }))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0,
    'the same host must accept once the file carries three records and a declared provenance — ' +
    'otherwise the refusals above are not reversible by following their own remedy: ' +
    r.stdout + r.stderr)
})
