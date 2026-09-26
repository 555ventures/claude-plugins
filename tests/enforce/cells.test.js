'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, evalFns, ROOT } = require('../helpers')

// specs/20260926/03-gates-per-workspace.md D2/D3/D4: validateCells (lifted from
// spec/workflows/wf-enforce.js) gains the workspace/layer grammar — a missing workspace
// defaults to ".", a layer on a non-naming cell is refused, an unknown layer is refused — and
// the grounding contract's § Rule enforcement states the new (workspace × stack × category)
// entry shape and id grammar. AC-20260926-03-5, AC-20260926-03-6, AC-20260926-03-7.

const WF_ENFORCE_REL = 'spec/workflows/wf-enforce.js'
const CONTRACT_REL = 'spec/templates/grounding-contract.md'

// Same fallback as tests/enforce/taxonomy.test.js (A2): CATEGORIES is a top-level `const` array
// literal, unreachable by extractFn/evalFns (which only lift named top-level functions) — parse
// it out of the source directly rather than require()ing the workflow.
function extractCategoriesArray(src) {
  const m = src.match(/const CATEGORIES = \[([\s\S]*?)\]/)
  assert.ok(m, 'no `const CATEGORIES = [...]` literal found in ' + WF_ENFORCE_REL + ' — this pin has nothing to compare against')
  // eslint-disable-next-line no-new-func
  return new Function('return [' + m[1] + ']')()
}

test('AC-20260926-03-5: WHEN validateCells receives a nested-workspace naming/schema cell and a root cell with no workspace field THE SYSTEM SHALL accept both, defaulting the second cell\'s workspace to ".", with skipped empty', () => {
  const src = read(WF_ENFORCE_REL)
  const categories = extractCategoriesArray(src)
  const { validateCells } = evalFns(src, ['validateCells'])
  const logged = []
  const cells = [
    { id: 'api:python:naming/schema', workspace: 'api', stack: 'python', category: 'naming', layer: 'schema', ruleRefs: [] },
    { id: 'python:module-boundary', stack: 'python', category: 'module-boundary', ruleRefs: [] },
  ]
  const result = validateCells(cells, categories, (msg) => logged.push(msg))
  assert.deepStrictEqual(result.skipped, [],
    'D2: neither cell is malformed — a non-empty skipped list here means a legitimate nested-workspace ' +
    'naming cell or a legitimate root-workspace cell with no workspace field is being wrongly refused: ' +
    JSON.stringify(result))
  assert.strictEqual(result.accepted.length, 2,
    'both cells must come back accepted, not dropped: ' + JSON.stringify(result))
  assert.strictEqual(result.accepted[1].workspace, '.',
    'D2: a cell with no `workspace` field must default to "." (the root workspace) — a cell whose ' +
    'workspace stays undefined breaks every downstream consumer that keys off it (Phase 4 wiring, the ' +
    'manifest entry): ' + JSON.stringify(result.accepted[1]))
})

test('AC-20260926-03-6: WHEN validateCells receives a layer on a non-naming cell and an unknown layer on a naming cell THE SYSTEM SHALL accept neither, returning skipped entries reason "layer-on-non-naming" and "unknown-layer" respectively, each carrying the cell\'s id', () => {
  const src = read(WF_ENFORCE_REL)
  const categories = extractCategoriesArray(src)
  const { validateCells } = evalFns(src, ['validateCells'])
  const logged = []
  const cells = [
    { id: 'api:python:module-boundary/schema', workspace: 'api', stack: 'python', category: 'module-boundary', layer: 'schema', ruleRefs: [] },
    { id: 'api:python:naming/db', workspace: 'api', stack: 'python', category: 'naming', layer: 'db', ruleRefs: [] },
  ]
  const result = validateCells(cells, categories, (msg) => logged.push(msg))
  assert.strictEqual(result.accepted.length, 0,
    'D2: neither malformed cell may be accepted — a layer on a non-naming category and an unknown ' +
    'layer are both refusals, not warnings: ' + JSON.stringify(result))
  const byNonNaming = result.skipped.find(s => s.id === 'api:python:module-boundary/schema')
  assert.ok(byNonNaming,
    'the module-boundary cell carrying a `layer` field must appear in skipped by its id: ' + JSON.stringify(result.skipped))
  assert.strictEqual(byNonNaming.reason, 'layer-on-non-naming',
    'D2: a `layer` on a non-naming cell must be refused with reason "layer-on-non-naming": ' + JSON.stringify(byNonNaming))
  const byUnknownLayer = result.skipped.find(s => s.id === 'api:python:naming/db')
  assert.ok(byUnknownLayer,
    'the naming cell carrying an unrecognized layer ("db") must appear in skipped by its id: ' + JSON.stringify(result.skipped))
  assert.strictEqual(byUnknownLayer.reason, 'unknown-layer',
    'D2: a naming cell whose layer is not one of code|schema|routes|wire must be refused with reason "unknown-layer": ' +
    JSON.stringify(byUnknownLayer))
})

test('AC-20260926-03-7: WHEN spec/templates/grounding-contract.md § Rule enforcement is read THE SYSTEM SHALL state entries per (workspace × stack × category), name the workspace field with "." as the root value, name the four naming layers code/schema/routes/wire, and carry the id example api:python:naming/schema', () => {
  assert.ok(fs.existsSync(path.join(ROOT, CONTRACT_REL)), CONTRACT_REL + ' must exist for this pin to mean anything')
  const text = read(CONTRACT_REL)
  const sectionMatch = text.match(/## Rule enforcement[\s\S]*?(?=\n## )/)
  assert.ok(sectionMatch, '§ Rule enforcement heading must exist in ' + CONTRACT_REL + ' for this pin to mean anything: ' + text.slice(0, 200))
  const section = sectionMatch[0]

  assert.match(section, /workspace\s+×\s+stack\s+×\s+category/,
    'D4: § Rule enforcement must state one manifest entry per (workspace × stack × category) cell ' +
    '— the old (stack × category) grammar left the enforce workflow with no per-workspace cell shape ' +
    'a host reading only the contract could discover: ' + section)
  assert.match(section, /`workspace`/,
    'D4: § Rule enforcement must name the `workspace` field on each manifest entry: ' + section)
  assert.match(section, /`\.`/,
    'D4: § Rule enforcement must give `.` as the workspace value for the root, or a host reading the ' +
    'contract has no way to know what a single-package repo\'s entries look like: ' + section)
  for (const layer of ['code', 'schema', 'routes', 'wire']) {
    assert.match(section, new RegExp('`' + layer + '`'),
      'D4: § Rule enforcement must name the naming layer `' + layer + '` — a missing layer name means ' +
      'a host reading only the contract cannot discover the full naming layer enum: ' + section)
  }
  assert.match(section, /api:python:naming\/schema/,
    'D4: § Rule enforcement must carry the id example api:python:naming/schema, showing the nested-' +
    'workspace id grammar (`<workspace>:<stack>:<category>[/<layer>]`): ' + section)
})
