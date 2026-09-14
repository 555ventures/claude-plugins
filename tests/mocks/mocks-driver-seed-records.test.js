'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  CUSTOMER_RECORDS, JOURNEY, LABELS,
  bare, mark, writeTargets, writeResearchBrief, confirmFacts, writeSeed,
  advanceToCanonWritten, writeWireframe, statusJson,
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

// specs/20260912/10-seeded-data-names-its-source.md D5/D7, AC-20260912-10-5 (corrected at build
// time per D7 — see the deviations sidecar): the journey-level record-hit check is UNCHANGED
// and stays on `journey-drawn` only; D4's new binding rules are what move to `journey-approved`,
// not this pre-existing placeholder check. Both cases below pin behaviour the pre-image already
// has — they are a `reuses` pointer, not new red pins.

test('journey-drawn refuses a journey whose every screen carries no seed record', () => {
  const dir = tmpdir('mocks-seed-records-drawn-refuses')
  advanceToCanonWritten(dir)
  // Overwrite the seed's records before drawing so none of these values appear anywhere in the
  // wireframes (which otherwise only ever mention "Aoi Tanaka") — every screen has zero hits.
  fs.writeFileSync(path.join(dir, 'design/mocks/records/customer.json'), JSON.stringify([
    { name: 'Zora Quill', phone: '555-1010-2020', visits: 5 },
    { name: 'Milo Fenn', phone: '', visits: 2 },
    { name: 'Iris Vale', phone: '555-3030-4040', visits: 9 },
  ]))
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  const out = drawn.stdout + drawn.stderr
  assert.strictEqual(drawn.status, 2,
    'a journey whose every screen carries no value from design/mocks/records/*.json must be ' +
    'refused at journey-drawn — a journey drawn entirely on placeholders binds nothing and would ' +
    'otherwise reach approval unnoticed: ' + out)
  assert.match(out, /journey "onboarding": no screen carries a value from design\/mocks\/records\/\*\.json — draw with the seed's own records, then re-mark/,
    'the refusal must keep this exact wording — this check is unchanged by the spec, so a ' +
    'drifted message here would mean the placeholder check was touched when it should not be: ' + out)
})

test('journey-drawn CONTINUES TO warn ⚠️ carries none of the seed\'s records for every screen but one, and completes the mark, once exactly one screen still carries a record value', () => {
  const dir = tmpdir('mocks-seed-records-drawn-warns')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) writeWireframe(dir, LABELS[i], { to: LABELS[i + 1] })
  // Strip the bound record mention from three of the four screens (leave LABELS[0] alone), so
  // exactly one screen carries a seed record value by the time journey-drawn checks.
  for (let i = 1; i < LABELS.length; i++) {
    const file = path.join(dir, 'design/mocks', LABELS[i] + '.html')
    const html = fs.readFileSync(file, 'utf8')
    const stripped = html.replace(
      '<span data-record="customer[0].name" data-bespoke="sheet: seeded record value">Aoi Tanaka</span>',
      '<span data-bespoke="sheet: no seed value here">placeholder text only</span>')
    assert.notStrictEqual(stripped, html,
      'test setup requires the record-bearing span to be present in ' + LABELS[i] + '.html so it can be stripped: ' + html)
    fs.writeFileSync(file, stripped)
  }
  const drawn = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  const out = drawn.stdout + drawn.stderr
  assert.strictEqual(drawn.status, 0,
    'a journey with at least one screen still carrying a seed record value must still complete ' +
    'the mark — the journey-level check only refuses when EVERY screen has zero hits: ' + out)
  for (let i = 1; i < LABELS.length; i++) {
    assert.match(out, new RegExp('⚠️ ' + LABELS[i] + ": carries none of the seed's records"),
      'each of the three screens that no longer carries any record value must be individually ' +
      'warned by label, or an author has no way to find which screens need a real record: ' + out)
  }
  assert.ok(!out.includes('⚠️ ' + LABELS[0] + ':'),
    'the one screen that still carries the seed\'s record value must not be warned alongside the ' +
    'others: ' + out)
  const st = statusJson(dir)
  assert.ok(st.journeys[JOURNEY] && st.journeys[JOURNEY].drawn,
    'the mark must actually complete (journeys.onboarding.drawn recorded) despite the warns — a ' +
    'warn is not a refusal: ' + JSON.stringify(st.journeys[JOURNEY]))
})
