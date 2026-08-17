'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, SPEC } = require('../helpers')

// specs/20260816/03-file-plan-table-scoped-parsing.md — `parseFilePlanRows` resolves its
// Action/Layer column indices section-wide after its walk, so the LAST header row anywhere in
// a `## File Plan` section wins for every accumulated row, not the header of the table each
// row actually belongs to. Escaped from specs/20260814/01-ac-matrix-script.md's review (which
// only exercised single-table fixtures); host-reported by Salon OS 2026-08-17
// (specs/20260816/02) — a second `| Path | ... |` table under a `### Landed at design stage`
// subheading clobbered the section-wide binding, nulled every row's layer, and made
// `ac-matrix.js` hard-block review on false `uncovered-ac` findings with no host-side
// workaround. AC-1/2/3/6 pin the fix and are expected RED against pre-fix code (the walker
// binds indices per-table, resetting at every table boundary, with first-row-only header
// recognition per Decision D2); AC-4/5 are "SHALL CONTINUE TO" regression pins already GREEN
// pre-fix (reordered single-table columns, no-Layer-column rows, and `parseFilePlan`'s
// multi-table path union), included so a fix cannot silently break them.

const { parseFilePlanRows, parseFilePlan } = require('../../spec/scripts/lib/file-plan')

// The literal two-table fixture AC-1/AC-2/AC-5 all key off: a normal File/Action/Layer table
// followed by a `### Landed at design stage` subheading and a headerless-for-this-purpose
// Path/State table (its first cell "Path" is a recognized header for ITS OWN table, but that
// table carries no Action/Layer columns at all).
const TWO_TABLE_SECTION = '## File Plan\n\n' +
  '| File | Action | Layer | Summary |\n' +
  '|------|--------|-------|---------|\n' +
  '| tests/a.test.js | CREATE | tests | pin |\n' +
  '\n' +
  '### Landed at design stage\n' +
  '\n' +
  '| Path | State | Summary |\n' +
  '|------|-------|---------|\n' +
  '| src/x.js | landed | note |\n'

test('AC-20260816-03-1: parseFilePlanRows binds each row\'s action/layer from that row\'s OWN table header instead of the last header seen in the section', () => {
  const rows = parseFilePlanRows(TWO_TABLE_SECTION)
  const firstTableRow = rows.find(r => r.paths.includes('tests/a.test.js'))
  const secondTableRow = rows.find(r => r.paths.includes('src/x.js'))
  assert.ok(firstTableRow,
    'the first-table row for tests/a.test.js must survive parsing at all — if this is missing the fixture itself is broken, not the invariant under test')
  assert.deepStrictEqual(
    { paths: firstTableRow.paths, action: firstTableRow.action, layer: firstTableRow.layer },
    { paths: ['tests/a.test.js'], action: 'CREATE', layer: 'tests' },
    'the first table\'s own File/Action/Layer header must bind this row — a section-wide-clobbered ' +
    'index would instead be overwritten by the second table\'s headerless-for-Action/Layer scan by the ' +
    'time this row is read, producing action:null/layer:null and silently dropping it from every ' +
    '`layer === \'tests\'` consumer (ac-matrix.js, scope-reconcile.js)')
  assert.ok(secondTableRow,
    'the second-table row for src/x.js must survive parsing at all — if this is missing the fixture itself is broken, not the invariant under test')
  assert.deepStrictEqual(
    { paths: secondTableRow.paths, action: secondTableRow.action, layer: secondTableRow.layer },
    { paths: ['src/x.js'], action: null, layer: null },
    'the second table (Path/State/Summary — no Action or Layer column) must yield null/null for its ' +
    'own rows, per D3\'s per-table semantics — a clobbering walker that carried the FIRST table\'s ' +
    'Action/Layer indices forward would instead misread this row\'s State/Summary cells as action/layer')
})

test('AC-20260816-03-2: ac-matrix.js resolves the tests-layer row correctly through a two-table File Plan and exits 0 with zero uncovered-ac findings', () => {
  const dir = tmpdir('acm-two-table')
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/t.test.js'), '// covers AC-20260101-01-1\n')
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Test Spec\n\n' +
    '## Acceptance Criteria\n\n' +
    '- **AC-20260101-01-1**: WHEN x THE SYSTEM SHALL y → tests/t.test.js\n\n' +
    '## File Plan\n\n' +
    '| File | Action | Layer | Summary |\n' +
    '|------|--------|-------|---------|\n' +
    '| tests/t.test.js | CREATE | tests | AC-20260101-01-1 |\n' +
    '\n' +
    '### Landed at design stage\n' +
    '\n' +
    '| Path | State | Summary |\n' +
    '|------|-------|---------|\n' +
    '| src/x.js | landed | note |\n')
  const manifest = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(manifest, '')
  const res = runNode('scripts/ac-matrix.js',
    ['--spec', spec, '--root', dir, '--manifest', manifest, '--json'])
  let out
  try { out = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`ac-matrix.js --json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  assert.ok(!out.findings.some(f => f.class === 'uncovered-ac'),
    'AC-20260101-01-1 has a real File Plan tests-layer row (tests/t.test.js) whose file exists and ' +
    'contains the AC-ID literal — a per-table-clobbered layer index nulls that row\'s layer, ac-matrix.js ' +
    'never finds it as a tests row, and the AC reads as zero-hits uncovered even though it is fully ' +
    `covered; findings: ${JSON.stringify(out.findings)}`)
  assert.strictEqual(res.status, 0,
    `the terminal observable of the escaped defect's real chain (real ac-matrix.js CLI, production ` +
    `parseFilePlanRows route, real spec file on disk) must exit 0 once the second table stops clobbering ` +
    `the first table's Layer binding — got ${res.status} (stdout: ${res.stdout}, stderr: ${res.stderr})`)
})

test('AC-20260816-03-3: a second table with no recognized header row gets action:null/layer:null on its own data rows instead of inheriting the previous table\'s indices', () => {
  const section = '## File Plan\n\n' +
    '| File | Action | Layer | Summary |\n' +
    '|------|--------|-------|---------|\n' +
    '| tests/a.test.js | CREATE | tests | pin |\n' +
    '\n' +
    '| Module | Owner |\n' +
    '| lib/z.js | core |\n'
  const rows = parseFilePlanRows(section)
  const firstTableRow = rows.find(r => r.paths.includes('tests/a.test.js'))
  const secondTableRow = rows.find(r => r.paths.includes('lib/z.js'))
  assert.ok(firstTableRow && secondTableRow,
    'both the first table\'s tests/a.test.js row and the second table\'s lib/z.js row must survive ' +
    'parsing — if either is missing the fixture itself is broken, not the invariant under test')
  assert.deepStrictEqual(
    { action: firstTableRow.action, layer: firstTableRow.layer },
    { action: 'CREATE', layer: 'tests' },
    'the first table\'s own rows must keep their own header binding untouched by the second, headerless ' +
    'table that follows them')
  assert.deepStrictEqual(
    { action: secondTableRow.action, layer: secondTableRow.layer },
    { action: null, layer: null },
    'a table boundary (the blank line) must reset actionIdx/layerIdx to unbound before this table is ' +
    'walked, and "Module"/"Owner" is not a recognized `/^(file|path)s?$/i` header — a walker that instead ' +
    'carries the first table\'s Action=column-1/Layer=column-2 indices forward would misread this row\'s ' +
    '"Owner" cell (core) as an action and report action:\'core\' instead of null')
})

test('AC-20260816-03-4: parseFilePlanRows SHALL CONTINUE TO resolve reordered single-table columns from the header and yield layer:null on every row of a table with no Layer column', () => {
  const reordered = '## File Plan\n\n' +
    '| File | Layer | Action |\n' +
    '|------|-------|--------|\n' +
    '| src/a.js | scripts | MODIFY |\n'
  const reorderedRows = parseFilePlanRows(reordered)
  assert.strictEqual(reorderedRows.length, 1,
    `the reordered single-table fixture must parse exactly one data row — got ${reorderedRows.length}`)
  assert.deepStrictEqual(
    { action: reorderedRows[0].action, layer: reorderedRows[0].layer },
    { action: 'MODIFY', layer: 'scripts' },
    'header-position-independent column resolution (Layer before Action here) is existing, pinned ' +
    'behavior — a regression here would break every host whose File Plan orders columns differently ' +
    'from the canonical File/Action/Layer/Summary order')

  const noLayerCol = '## File Plan\n\n' +
    '| File | Action | Summary |\n' +
    '|------|--------|---------|\n' +
    '| src/a.js | MODIFY | note |\n'
  const noLayerRows = parseFilePlanRows(noLayerCol)
  assert.strictEqual(noLayerRows.length, 1,
    `the no-Layer-column single-table fixture must parse exactly one data row — got ${noLayerRows.length}`)
  assert.strictEqual(noLayerRows[0].layer, null,
    'a table with no Layer column must keep yielding layer:null (never misreading the Summary column as ' +
    'the layer) — this is existing, pinned behavior a per-table rewrite must not disturb')
})

test('AC-20260816-03-5: parseFilePlan SHALL CONTINUE TO return the de-duped union of path-shaped column-1 cells from every table in the section, including compound-cell splitting', () => {
  const paths = parseFilePlan(TWO_TABLE_SECTION)
  assert.ok(paths.includes('tests/a.test.js'),
    `parseFilePlan must still collect column-1 path cells from the FIRST table in the section — got ${JSON.stringify(paths)}`)
  assert.ok(paths.includes('src/x.js'),
    `parseFilePlan must still collect column-1 path cells from every OTHER table in the section too ` +
    `(not just the first one it encounters) — a first-table-only rewrite of the shared walker would drop ` +
    `src/x.js from the returned path set even though D3 requires parseFilePlan's per-table collection to ` +
    `stay unchanged; got ${JSON.stringify(paths)}`)

  const compoundSection = '## File Plan\n\n' +
    '| File | Action | Layer | Summary |\n' +
    '|------|--------|-------|---------|\n' +
    '| a.js + b.js | CREATE | scripts | compound |\n'
  const compoundPaths = parseFilePlan(compoundSection)
  assert.ok(compoundPaths.includes('a.js') && compoundPaths.includes('b.js'),
    `compound-cell splitting (splitPlanCell's "a.js + b.js" -> both) must keep working after the shared ` +
    `walker lands — got ${JSON.stringify(compoundPaths)}`)
})

test('AC-20260816-03-6: a data row whose first cell is literally "file" between two path rows does not rebind the table\'s header, and the surrounding rows keep their binding', () => {
  const section = '## File Plan\n\n' +
    '| File | Action | Layer |\n' +
    '|------|--------|-------|\n' +
    '| src/a.js | MODIFY | scripts |\n' +
    '| file | CREATE | tests |\n' +
    '| src/b.js | MODIFY | scripts |\n'
  const rows = parseFilePlanRows(section)
  const aRow = rows.find(r => r.paths.includes('src/a.js'))
  const bRow = rows.find(r => r.paths.includes('src/b.js'))
  const bareFileRow = rows.find(r => r.paths.includes('file'))
  assert.ok(aRow && bRow,
    'both src/a.js and src/b.js — the rows surrounding the bare "file" cell — must survive parsing; if ' +
    'either is missing the fixture itself is broken, not the invariant under test')
  assert.deepStrictEqual(
    { action: aRow.action, layer: aRow.layer },
    { action: 'MODIFY', layer: 'scripts' },
    'src/a.js is the FIRST data row of the table and must stay bound to the table\'s one real header')
  assert.deepStrictEqual(
    { action: bRow.action, layer: bRow.layer },
    { action: 'MODIFY', layer: 'scripts' },
    'src/b.js follows the "file" row and must STILL be bound to the table\'s original header — D2\'s ' +
    'first-row-only header recognition means only the table\'s actual first row can bind actionIdx/' +
    'layerIdx; a rebind-anywhere rule (refuter-refuted in the spec\'s adversarial check) would instead ' +
    're-derive actionIdx/layerIdx from the "file"/"CREATE"/"tests" row itself — neither "CREATE" nor ' +
    '"tests" matches /^actions?$/i or /^layers?$/i, so that rebind would leave both indices at -1 and ' +
    'null out src/b.js')
  assert.ok(!bareFileRow,
    'the bare "file" row itself is not a data row under test here (dropped by the existing path-shape ' +
    'filter — "file" has neither a "/" nor a file extension) — if it appears in the output, the ' +
    'path-shape filter regressed, not this table-scoping invariant')
})
