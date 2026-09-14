'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// Owner: specs/20260912/10-seeded-data-names-its-source.md D1-D4.
// AC-20260912-10-1, AC-20260912-10-2, AC-20260912-10-3, AC-20260912-10-4.
// spec/scripts/lib/mock-seed-checks.js is a pure module (no fs) — required directly, the same
// pattern tests/mocks/kit-layers.test.js already uses for a plugin lib with no disk dependency.

test('AC-20260912-10-1: resolveRecordRef refuses an out-of-range index naming the reference and the record count, and a misspelled field naming the missing field', () => {
  const { resolveRecordRef } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [
      { name: 'Ada Lovelace', city: 'London' },
      { name: 'Bo Diallo', city: 'Dakar' },
      { name: 'Cleo Reyes', city: 'Lima' },
    ],
  }
  const outOfRange = resolveRecordRef(recordsByEntity, 'customers[9].name')
  assert.ok(outOfRange && typeof outOfRange.error === 'string',
    'an index past the end of a 3-record array must resolve to {error}, never {value:undefined} or a thrown exception, or a typo\'d index would silently bind nothing: ' + JSON.stringify(outOfRange))
  assert.match(outOfRange.error, /customers\[9\]\.name/,
    'the refusal must name the exact reference that failed, or a session cannot tell which of several bindings on a screen is broken: ' + outOfRange.error)
  assert.match(outOfRange.error, /3 record/,
    'the refusal must name the record count so the author knows the valid index range: ' + outOfRange.error)

  const missingField = resolveRecordRef(recordsByEntity, 'customers[0].nmae')
  assert.ok(missingField && typeof missingField.error === 'string',
    'a misspelled field name must resolve to {error}, not silently return undefined: ' + JSON.stringify(missingField))
  assert.match(missingField.error, /no field "nmae"/,
    'the refusal must name the first failing segment ("nmae") so the typo is findable, never a generic "does not resolve": ' + missingField.error)
})

test('AC-20260912-10-1: recordBindingViolations reports one violation per unresolvable data-record binding, each carrying the label and the same resolveRecordRef reasoning', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [
      { name: 'Ada Lovelace', city: 'London' },
      { name: 'Bo Diallo', city: 'Dakar' },
      { name: 'Cleo Reyes', city: 'Lima' },
    ],
  }
  const html = '<span data-record="customers[9].name">Nope</span>' +
    '<span data-record="customers[0].nmae">Nope</span>'
  const { violations } = recordBindingViolations(html, 'checkout', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('checkout') && v.includes('customers[9].name') && /3 record/.test(v)),
    'a screen carrying an out-of-range data-record reference must be refused naming the screen, the reference, and the record count: ' + JSON.stringify(violations))
  assert.ok(violations.some((v) => v.includes('checkout') && v.includes('customers[0].nmae') && v.includes('nmae')),
    'a screen carrying a data-record reference to a nonexistent field must be refused naming the screen, the reference, and the missing field: ' + JSON.stringify(violations))
})

test('AC-20260912-10-2: recordBindingViolations refuses a bound element whose text does not equal the resolved value, printing both strings, and reports nothing once tags are stripped and whitespace collapsed', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = { customers: [{ name: 'Ada Lovelace' }] }

  const mismatchHtml = '<span data-record="customers[0].name">Ada Lovelance</span>'
  const { violations } = recordBindingViolations(mismatchHtml, 'profile', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('Ada Lovelance') && v.includes('Ada Lovelace')),
    'a retyped copy that drifts from the record ("Lovelance" vs "Lovelace") must be refused printing BOTH strings — this is the misspelled-ninth-copy defect the spec exists to catch, and a message naming only one string leaves the author guessing which is right: ' + JSON.stringify(violations))

  const taggedHtml = '<span data-record="customers[0].name"><b>Ada</b> Lovelace</span>'
  const { violations: v2 } = recordBindingViolations(taggedHtml, 'profile', recordsByEntity)
  assert.strictEqual(v2.length, 0,
    'inner tags must be stripped and whitespace collapsed before the comparison — "<b>Ada</b> Lovelace" is the same visible text as "Ada Lovelace" and must report nothing: ' + JSON.stringify(v2))
})

test('AC-20260912-10-3: recordBindingViolations refuses a distinctive seed value occurring outside every bound element, naming the value and the screen, and reports nothing once it is correctly bound', () => {
  const { recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = { customers: [{ name: 'Ada Lovelace' }, { name: 'Bo Diallo' }] }

  const strayHtml = '<p>Ada Lovelace signed in today</p>'
  const { violations } = recordBindingViolations(strayHtml, 'dashboard', recordsByEntity)
  assert.ok(violations.some((v) => v.includes('Ada Lovelace') && v.includes('dashboard')),
    '"Ada Lovelace" occurs in exactly one record and is 10+ characters, so a stray copy outside any data-record element must be refused naming the value and the screen\'s label ("dashboard") — otherwise a retyped, unbound copy can reach approval unnoticed: ' + JSON.stringify(violations))

  const boundHtml = '<span data-record="customers[0].name">Ada Lovelace</span>'
  const { violations: v2 } = recordBindingViolations(boundHtml, 'dashboard', recordsByEntity)
  assert.strictEqual(v2.length, 0,
    'a value that appears ONLY inside a correctly bound data-record element is not a stray occurrence and must report nothing: ' + JSON.stringify(v2))
})

test('AC-20260912-10-4: distinctiveValues returns only the value that is 8+ characters or spaced AND unique across every record file, and a stray non-distinctive value warns rather than violates', () => {
  const { distinctiveValues, recordBindingViolations } = require('../../spec/scripts/lib/mock-seed-checks')
  const recordsByEntity = {
    customers: [{ name: 'Ada Lovelace', status: 'open' }],
    venues: [{ city: 'Reykjavík' }],
    orders: [{ city: 'Reykjavík' }],
  }
  const set = distinctiveValues(recordsByEntity)
  assert.ok(set.has('Ada Lovelace'),
    '"Ada Lovelace" contains a space and occurs in exactly one record, so it must be in the distinctive set — otherwise a retyped copy of it would only ever warn, never refuse: ' + JSON.stringify([...set]))
  assert.ok(!set.has('open'),
    '"open" is a bare word under eight characters with no space — it fails the distinctiveness test and refusing it would make the rule unusable on a product\'s own chrome vocabulary: ' + JSON.stringify([...set]))
  assert.ok(!set.has('Reykjavík'),
    '"Reykjavík" occurs in two different record files, so it is not distinctive to any one record and must stay out of the refusal set: ' + JSON.stringify([...set]))

  const html = '<p>open for business</p>'
  const { violations, warns } = recordBindingViolations(html, 'billing', recordsByEntity)
  assert.strictEqual(violations.length, 0,
    'a stray occurrence of a non-distinctive value ("open") must never be a violation: ' + JSON.stringify(violations))
  assert.ok(warns.some((w) => w.includes('⚠️') && w.includes('open') && w.includes('billing')),
    'a stray occurrence of a non-distinctive value must still produce a ⚠️ warn naming the value and the screen, so it stays visible without blocking the mark: ' + JSON.stringify(warns))
})
