'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('../helpers')
const { CATALOG } = require('./fixture')

// specs/20260929/01-the-walkthrough-contract-and-the-client.md — AC-20260929-01-1 (D2): lib/json-shape.js
// is the one validator, a fixed subset of JSON Schema that fails closed on an unknown keyword.

const SHAPE_LIB = path.join(SPEC, 'scripts/lib/json-shape.js')

function load() {
  assert.ok(fs.existsSync(SHAPE_LIB), 'spec/scripts/lib/json-shape.js must exist — without it neither the contract self-check nor the run-time answer check has a validator: ' + SHAPE_LIB)
  assert.ok(fs.existsSync(CATALOG), 'spec/templates/walkthrough/catalog.json must exist — the ten prop cases run against its shapes: ' + CATALOG)
  const lib = require(SHAPE_LIB)
  return { lib, shapes: JSON.parse(fs.readFileSync(CATALOG, 'utf8')).shapes }
}

function only(findings, code, at, why) {
  assert.strictEqual(findings.length, 1, why + ' — expected exactly one finding, got ' + JSON.stringify(findings))
  assert.strictEqual(findings[0].code, code, why + ' — wrong code: ' + JSON.stringify(findings))
  assert.strictEqual(findings[0].at, at, why + ' — wrong path: ' + JSON.stringify(findings))
}

test('AC-20260929-01-1: validate returns no finding for valid Heading props and one unknown-field, missing or enum finding at the offending path for the three broken ones', () => {
  const { lib, shapes } = load()
  assert.deepStrictEqual(lib.validate(shapes, 'Heading', { text: 'You are invited to Hearwell', level: 1 }), [],
    'valid Heading props reported as broken — every valid wireframe round would be refused')
  only(lib.validate(shapes, 'Heading', { text: 'x', levle: 1 }), 'unknown-field', '.levle',
    'a mistyped prop name passing silently would put a typo on the client\'s screen')
  only(lib.validate(shapes, 'Heading', { level: 2 }), 'missing', '.text',
    'a Heading without its required text passing would push an empty heading')
  only(lib.validate(shapes, 'Heading', { text: 'x', level: 5 }), 'enum', '.level',
    'a Heading level outside 1-4 passing would send a level the renderer does not draw')
})

test('AC-20260929-01-1: validate accepts an expression object for a text prop and reports one-of at the prop when the expression key is not $-prefixed or a nested rows item is not a list', () => {
  const { lib, shapes } = load()
  assert.deepStrictEqual(lib.validate(shapes, 'Avatar', { name: { $item: 'name' } }), [],
    'an expression object for a text prop refused — propertyNames/oneOf are not judged, so every data-bound wireframe is refused')
  only(lib.validate(shapes, 'Avatar', { name: { item: 'name' } }), 'one-of', '.name',
    'an object without a $-prefixed key accepted as an expression would render the literal word "[object Object]"')
  only(lib.validate(shapes, 'Table', { columns: ['Q'], rows: ['a'] }), 'one-of', '.rows',
    'a flat rows array accepted would draw a table whose rows are not rows')
})

test('AC-20260929-01-1: a schema carrying a keyword outside the subset is itself one unknown-keyword finding naming it, whatever the value', () => {
  const { lib } = load()
  assert.ok(Array.isArray(lib.KEYWORDS) || lib.KEYWORDS instanceof Set, 'json-shape must export KEYWORDS — the contract self-check reads the subset from it')
  const has = (k) => (Array.isArray(lib.KEYWORDS) ? lib.KEYWORDS.includes(k) : lib.KEYWORDS.has(k))
  assert.ok(has('oneOf') && has('propertyNames') && has('minProperties'), 'KEYWORDS must list the D2 subset')
  assert.ok(!has('format'), 'KEYWORDS must not list "format" — it is outside D2\'s subset')
  const shapes = { x: { type: 'string', format: 'email' } }
  for (const value of ['a@b.c', 5, null]) {
    const unknown = lib.validate(shapes, 'x', value).filter((f) => f.code === 'unknown-keyword')
    assert.strictEqual(unknown.length, 1,
      'a shape with "format" must yield exactly one unknown-keyword finding for value ' + JSON.stringify(value) +
      ' — silently ignoring it would let the contract promise a check the plugin never runs')
    assert.match(JSON.stringify(unknown[0]), /format/,
      'the unknown-keyword finding must name "format" so the author can find it: ' + JSON.stringify(unknown[0]))
  }
})
