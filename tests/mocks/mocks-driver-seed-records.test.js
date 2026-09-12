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

// specs/20260910/06-real-records-and-two-dense-screens.md D2, as amended: `design/mocks/
// records/<entity>.json` is a JSON array of at least three record objects the session derives.
// A mock's records are drawing material, not evidence, so the gate checks nothing about where
// they came from and its remedy points at deriving them rather than at a human.

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

test('seed-done accepts a JSON array of three derived records', () => {
  const dir = seededHost('mocks-seed-records-array')
  fs.writeFileSync(recordsFileOf(dir), JSON.stringify(CUSTOMER_RECORDS))

  const r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0,
    'seed-done must accept a plain array of three records — the session derives mock data from ' +
    'the brief and writes it, and any further required structure is a question aimed at the ' +
    'user: ' + r.stdout + r.stderr)
})

test('seed-done refuses a records file that is not an array of at least three records, with a remedy that derives instead of asking', () => {
  const dir = seededHost('mocks-seed-records-refusals')
  const file = recordsFileOf(dir)

  fs.writeFileSync(file, JSON.stringify(CUSTOMER_RECORDS.slice(0, 2)))
  let r = mark(dir, 'seed-done')
  let out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'fewer than three records must be refused — one record cannot show a list, a table, or a ' +
    'repeated row, which is the whole reason the floor exists: ' + out)
  assert.ok(out.includes('customer') && /2 record/.test(out),
    'the refusal must name the entity and the count it found, or the remedy is unactionable: ' + out)
  assert.match(out, /derive at least three customer records/,
    'the remedy must tell the session to derive the records itself: ' + out)
  assert.match(out, /never ask the user for data/,
    'the remedy must say so outright; one that merely omits the instruction still reads as ' +
    'permission to ask when a session cannot find the data on disk: ' + out)

  fs.writeFileSync(file, JSON.stringify({ records: CUSTOMER_RECORDS }))
  r = mark(dir, 'seed-done')
  out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'an object wrapping the records must be refused — one accepted shape means one thing to ' +
    'derive and one refusal to read: ' + out)
  assert.match(out, /derive at least three customer records/,
    'every records refusal shares the one derive-it remedy, or the asking instruction survives ' +
    'in a branch: ' + out)

  fs.writeFileSync(file, 'not json')
  r = mark(dir, 'seed-done')
  out = r.stderr + r.stdout
  assert.strictEqual(r.status, 2,
    'an unparseable records file must be refused — the screens are drawn from these values, so ' +
    'a file nothing can read is a missing file: ' + out)
  assert.match(out, /derive at least three customer records/,
    'every records refusal shares the one derive-it remedy: ' + out)

  fs.writeFileSync(file, JSON.stringify(CUSTOMER_RECORDS))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0,
    'the same host must accept once the file holds three records — otherwise the refusals above ' +
    'are not reversible by following their own remedy: ' + r.stdout + r.stderr)
})
