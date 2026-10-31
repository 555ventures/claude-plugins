'use strict'
const { test } = require('node:test')
const assert = require('node:assert')

// specs/20261029/05-structural-triggers-at-plan-time.md AC-20261029-05-6: parseFilePlanRows
// rows carry a table-scoped `summary` field bound by header name.

const { parseFilePlanRows, parseFilePlan } = require('../../spec/scripts/lib/file-plan')

const WITH = '## File Plan\n\n| Path | Action | Layer | Summary |\n|---|---|---|---|\n' +
  '| package.json | MODIFY | other | adds `zod@3` |\n'
const WITHOUT = '## File Plan\n\n| Path | Action | Layer |\n|---|---|---|\n' +
  '| package.json | MODIFY | other |\n| src/a.js | CREATE | scripts |\n'
const REORDERED = '## File Plan\n\n| Summary | Path | Action | Layer |\n|---|---|---|---|\n' +
  '| adds `zod@3` | package.json | MODIFY | other |\n'

test('AC-20261029-05-6: parseFilePlanRows returns the Summary cell verbatim as `summary` for a Path/Action/Layer/Summary table', () => {
  const row = parseFilePlanRows(WITH).find(r => r.paths.includes('package.json'))
  assert.ok(row, 'the package.json row was not parsed at all, so no summary can be read from it')
  assert.strictEqual(row.summary, 'adds `zod@3`',
    'rows would carry no Summary text, so decision-lint cannot see the packages a manifest row names')
})

test('AC-20261029-05-6: a File Plan table with no Summary column yields summary null on every row, never undefined or a neighbouring cell', () => {
  const rows = parseFilePlanRows(WITHOUT)
  assert.strictEqual(rows.length, 2, 'both rows must still parse when the table binds no Summary column')
  for (const r of rows) {
    assert.strictEqual(r.summary, null,
      'an unbound Summary must be null so decision-lint can fail closed instead of reading a wrong cell')
  }
})

test('AC-20261029-05-6: a reordered header (Summary first) still binds summary by header name', () => {
  const row = parseFilePlanRows(REORDERED).find(r => r.paths.includes('package.json'))
  assert.ok(row, 'the reordered-table row was not parsed, so column binding cannot be checked')
  assert.strictEqual(row.summary, 'adds `zod@3`',
    'positional binding would read the Path cell as the Summary on a reordered table')
  assert.strictEqual(row.action, 'MODIFY', 'adding summary must not disturb Action binding')
  assert.strictEqual(row.layer, 'other', 'adding summary must not disturb Layer binding')
})

test('AC-20261029-05-6: parseFilePlan on the same text still returns the flat path list, and rows carry the summary key', () => {
  assert.deepStrictEqual(parseFilePlan(WITH), ['package.json'],
    'parseFilePlan callers (ac-matrix and others) would break if the summary field changed its return shape')
  assert.deepStrictEqual(parseFilePlan(WITHOUT), ['package.json', 'src/a.js'],
    'the flat path list must be unchanged for a table without a Summary column')
  assert.ok(parseFilePlanRows(WITH).every(r => 'summary' in r),
    'every row must carry the summary key so consumers can tell unbound (null) from absent')
})
