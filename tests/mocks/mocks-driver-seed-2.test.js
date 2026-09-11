'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('../helpers')
const {
  FACT_KEYS, JOURNEY, LABELS, DENSE,
  bare, mark, ledgerCmd, decideLook, writeFile, statusJson,
  writeTargets, writeResearchBrief, confirmFacts, writeSeed, writeCustomerRecords,
  advanceToCanonWritten, advanceToJourneyApproved, advanceToShapePicked,
} = require('./mocks-driver-fixtures')

// specs/20260910/06-real-records-and-two-dense-screens.md D1/D2/D3/D5, AC-20260910-06-1,2,3,5,6,7:
// `mocks-driver.js` does not yet parse `## Dense screens` (plural), does not yet require
// `## Records`, and `lib/mock-seed-checks.js` does not yet export recordValues/recordHits — every
// assertion below (except the legacy-continuity ACs 5/7, which pin behavior that must survive
// unchanged) is red until D1-D3 land.

function customWireframe(dir, label, { to, withRecord = false } = {}) {
  const toHtml = to ? '<a data-to="' + to + '" data-bespoke="sheet: synthetic edge control for tests" href="#">Next</a>' : ''
  const stateBtnsHtml = '<div data-contract="none"><button data-state-btn="empty">empty</button>' +
    '<button data-state-btn="loading">loading</button><button data-state-btn="error">error</button></div>'
  const record = withRecord ? ' Aoi Tanaka' : ''
  writeFile(path.join(dir, 'design/mocks', label + '.html'),
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="stylesheet" href="../wire/tokens.css">\n' +
    '<link rel="stylesheet" href="../wire/wire.css">\n' +
    '<style>* { box-sizing: border-box; }</style>\n' +
    '<main data-screen-label="' + label + '" data-status="sketch">' + label + record + toHtml + stateBtnsHtml + '</main>\n')
}

function buildDenseSeed(dir, denseSection) {
  writeCustomerRecords(dir)
  const factLines = FACT_KEYS.map((k, i) => `- ${k}: P${i + 1}`).join('\n')
  writeFile(path.join(dir, 'design/mocks/seed.md'), `# Seed — Test Product

## Product
It is a synthetic dispatch product for tests.
Built for QA engineers running the driver's test suite.
It must let a user complete a short onboarding.

## Facts
${factLines}

## References
- none

## Records
- customer: records/customer.json

## Journeys
### ${JOURNEY}
Mika (dispatch lead) signs in, sends an invite, gathers consent, and reaches the live session.
\`\`\`surfaces
${LABELS[0]} -> ${LABELS[1]}
${LABELS[1]} -> ${LABELS[2]}
${LABELS[2]} -> ${LABELS[3]}
\`\`\`

### shift-roster
Priya (shift lead) reviews the roster for the day.
\`\`\`surfaces
roster
\`\`\`

## Dense screens
${denseSection}
`)
}

test('AC-20260910-06-1: seed-done accepts ## Dense screens naming two declared labels, refuses three lines or an undeclared label naming the section and the offending count/label, and shape-picked accepts a shape labeled with the second dense screen', () => {
  const dir = tmpdir('mocks-driver-seed-2')
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)

  buildDenseSeed(dir, '- ' + DENSE + '\n- roster\n- signin')
  let r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse three ## Dense screens lines: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /## Dense screens/, 'the refusal must name "## Dense screens": ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /3|three/, 'the refusal must name the offending count (3): ' + r.stdout + r.stderr)

  buildDenseSeed(dir, '- nowhere')
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse an undeclared ## Dense screens label: ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /## Dense screens/, 'the refusal must name "## Dense screens": ' + r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /nowhere/, 'the refusal must name the offending label "nowhere": ' + r.stdout + r.stderr)

  buildDenseSeed(dir, '- ' + DENSE + '\n- roster')
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'seed-done must accept ## Dense screens naming two already-declared labels: ' + r.stdout + r.stderr)

  writeFile(path.join(dir, 'design/shapes/calm.html'), '<main data-screen-label="roster" data-shape="calm">calm</main>\n')
  writeFile(path.join(dir, 'design/shapes/bold.html'), '<main data-screen-label="roster" data-shape="bold">bold</main>\n')
  const ledgerR = ledgerCmd(dir, 'add', [
    '--id', 'P14', '--step', 'SHAPES', '--kind', 'product', '--claim', 'shape: calm',
    '--tag', 'said-by-user', '--status', 'confirmed', '--rejected', 'bold',
  ])
  assert.strictEqual(ledgerR.status, 0, 'test setup requires the shape ledger row to be accepted: ' + ledgerR.stderr)
  decideLook(dir, 'shape-picked', 'pick', { pick: 'calm', others: ['bold'], by: 'jj' })
  const shapeR = mark(dir, 'shape-picked', ['--shape', 'calm'])
  assert.strictEqual(shapeR.status, 0,
    'shape-picked must accept a shape file labeled "roster" — the second dense screen: ' + shapeR.stdout + shapeR.stderr)
})

test('AC-20260910-06-2: seed-done refuses a missing ## Records section, a "- none" line, and a records file that is missing, non-array, or holds fewer than three objects — naming "customer" and the three-real-records remedy — and accepts once the file holds three objects', () => {
  const dir = tmpdir('mocks-driver-seed-2')
  bare(dir)
  writeTargets(dir)
  writeResearchBrief(dir)
  confirmFacts(dir)
  writeSeed(dir)
  const seedPath = path.join(dir, 'design/mocks/seed.md')
  const baseline = fs.readFileSync(seedPath, 'utf8')
  const recordsFile = path.join(dir, 'design/mocks/records/customer.json')
  const REMEDY = 'ask the client for three real customer records'

  fs.writeFileSync(seedPath, baseline.replace('## Records\n- customer: records/customer.json\n\n', ''))
  let r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse a missing ## Records section: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('customer') && (r.stderr + r.stdout).includes(REMEDY),
    'the refusal must name "customer" and the remedy "' + REMEDY + '": ' + r.stdout + r.stderr)

  fs.writeFileSync(seedPath, baseline.replace('- customer: records/customer.json', '- none'))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse a "- none" ## Records line: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('customer') && (r.stderr + r.stdout).includes(REMEDY),
    'the refusal must name "customer" and the remedy "' + REMEDY + '": ' + r.stdout + r.stderr)

  fs.writeFileSync(seedPath, baseline)
  fs.rmSync(recordsFile)
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when records/customer.json does not exist: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('customer') && (r.stderr + r.stdout).includes(REMEDY),
    'the refusal must name "customer" and the remedy "' + REMEDY + '": ' + r.stdout + r.stderr)

  fs.writeFileSync(recordsFile, JSON.stringify({ name: 'Aoi Tanaka' }))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when records/customer.json does not parse as a JSON array: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('customer') && (r.stderr + r.stdout).includes(REMEDY),
    'the refusal must name "customer" and the remedy "' + REMEDY + '": ' + r.stdout + r.stderr)

  fs.writeFileSync(recordsFile, JSON.stringify([{ name: 'Aoi Tanaka' }, { name: 'Ren' }]))
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 2, 'seed-done must refuse when records/customer.json holds only two objects: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('customer') && (r.stderr + r.stdout).includes(REMEDY),
    'the refusal must name "customer" and the remedy "' + REMEDY + '": ' + r.stdout + r.stderr)

  writeCustomerRecords(dir)
  r = mark(dir, 'seed-done')
  assert.strictEqual(r.status, 0, 'seed-done must accept once records/customer.json holds three objects: ' + r.stdout + r.stderr)
})

test('AC-20260910-06-3: recordValues walks nested records deduping strings of length >= 3 (stringified numbers included, "14" excluded), recordHits returns only the values a page contains, and journey-drawn refuses a journey with no record hit on any screen while accepting and warning per screen for a journey with one hit', () => {
  const { recordValues, recordHits } = require('../../spec/scripts/lib/mock-seed-checks')
  const values = recordValues([{ name: 'Aoi Tanaka', tags: ['vip'], visits: 14, note: { by: 'Ren' } }])
  assert.deepStrictEqual(values, ['Aoi Tanaka', 'vip', 'Ren'],
    'recordValues must collect every string value of length >= 3 from nested arrays/objects, stringify numbers, and dedupe (never "14", which is two characters): got ' + JSON.stringify(values))
  const hits = recordHits(values, '<td>Aoi Tanaka</td><span>14</span>')
  assert.deepStrictEqual(hits, ['Aoi Tanaka'],
    'recordHits must return exactly the values the html actually contains: got ' + JSON.stringify(hits))

  const dir = tmpdir('mocks-driver-seed-2')
  advanceToCanonWritten(dir)
  for (let i = 0; i < LABELS.length; i++) customWireframe(dir, LABELS[i], { to: LABELS[i + 1], withRecord: false })
  let r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 2,
    'journey-drawn must refuse a journey whose screens carry no value from design/mocks/records/*.json: ' + r.stdout + r.stderr)
  assert.ok((r.stderr + r.stdout).includes('journey "' + JOURNEY + '": no screen carries a value from design/mocks/records/*.json'),
    'the refusal must carry the exact D3 message naming the journey: ' + r.stdout + r.stderr)
  const st = statusJson(dir)
  assert.ok(!st.journeys[JOURNEY] || !st.journeys[JOURNEY].drawn,
    'a refused journey-drawn must never record journeys.<j>.drawn: ' + JSON.stringify(st.journeys[JOURNEY]))

  customWireframe(dir, LABELS[0], { to: LABELS[1], withRecord: true })
  r = mark(dir, 'journey-drawn', ['--journey', JOURNEY])
  assert.strictEqual(r.status, 0,
    'journey-drawn must accept once at least one screen of the journey carries a record value: ' + r.stdout + r.stderr)
  assert.ok((r.stdout + r.stderr).includes('⚠️ ' + LABELS[1] + ': carries none of the client\'s records'),
    'journey-drawn must warn per screen carrying no record value: ' + r.stdout + r.stderr)
  assert.strictEqual(statusJson(dir).journeys[JOURNEY].drawn !== null, true,
    'an accepted journey-drawn (one screen hit) must record journeys.<j>.drawn')
})

test('AC-20260910-06-5: a legacy seed carrying the singular ## Dense screen with one declared label and a ## Records section CONTINUES TO accept seed-done and shape-picked for a shape labeled with that screen', () => {
  const dir = tmpdir('mocks-driver-seed-2')
  advanceToShapePicked(dir) // writeSeed's default seed is the singular "## Dense screen" + "## Records"
  const st = statusJson(dir)
  assert.ok(st.marks.seedDone,
    'seed-done must CONTINUE TO be accepted for a legacy singular ## Dense screen seed carrying ## Records: ' + JSON.stringify(st.marks))
  assert.ok(st.marks.shapePicked,
    'shape-picked must CONTINUE TO be accepted for a shape labeled with the legacy singular dense screen: ' + JSON.stringify(st.marks))
})

test('AC-20260910-06-6: writeSeed(dir) writes design/mocks/records/customer.json with three objects and a seed carrying "- customer: records/customer.json"', () => {
  const dir = tmpdir('mocks-driver-seed-2')
  writeSeed(dir)
  const recordsFile = path.join(dir, 'design/mocks/records/customer.json')
  assert.ok(fs.existsSync(recordsFile), 'writeSeed must write design/mocks/records/customer.json: ' + recordsFile)
  const records = JSON.parse(fs.readFileSync(recordsFile, 'utf8'))
  assert.strictEqual(Array.isArray(records) && records.length, 3,
    'writeSeed must write a three-object records/customer.json, the D2 floor seed-done will enforce: got ' + JSON.stringify(records))
  const seedText = fs.readFileSync(path.join(dir, 'design/mocks/seed.md'), 'utf8')
  assert.ok(seedText.includes('- customer: records/customer.json'),
    'writeSeed must declare "- customer: records/customer.json" under ## Records: got:\n' + seedText)
})

test('AC-20260910-06-7: advanceToJourneyApproved CONTINUES TO accept every mark on the way now that writeSeed and writeWireframe carry ## Records / a record value', () => {
  const dir = tmpdir('mocks-driver-seed-2')
  advanceToJourneyApproved(dir) // throws via its own internal asserts if any mark on the chain refuses
  const st = statusJson(dir)
  assert.strictEqual(st.journeys[JOURNEY].approved !== null, true,
    'advanceToJourneyApproved must record journeys.<j>.approved once every mark on the chain accepts: ' + JSON.stringify(st.journeys[JOURNEY]))
})
