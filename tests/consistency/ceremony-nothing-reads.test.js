'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, section, phrase } = require('../helpers')

// specs/20261103/02-ceremony-nothing-reads.md — AC-20261103-02-9, AC-20261103-02-10,
// AC-20261103-02-11 (the retired ceremony leaves no file, citation or template field behind).

const whole = (file) => section(file, /^/, /$(?!)/)
const exists = (rel) => fs.existsSync(path.join(ROOT, rel))

test('AC-20261103-02-9: the mocks ledger template, lib and fixture dir are gone and no entrypoint, mocks doctrine or mocks command still names the ledger', () => {
  for (const rel of ['spec/templates/mocks-ledger.md', 'spec/scripts/lib/mocks-ledger.js', 'tests/fixtures/mocks-ledger']) {
    assert.ok(!exists(rel), rel + ' must be deleted - a surviving ledger file keeps a reader or a writer of the retired ledger alive')
  }
  assert.ok(!read('spec/entrypoints.json').includes('mocks-ledger.md'), 'spec/entrypoints.json must name no mocks-ledger.md, or the bundle ships a template that no longer exists')
  const mocks = whole('spec/doctrine/mocks.md')
  assert.doesNotMatch(mocks, /^## Provenance Ledger$/m, 'mocks.md must carry no Provenance Ledger heading - the section documents a ledger nothing writes')
  assert.doesNotMatch(mocks, /ledger/i, 'mocks.md must mention no ledger anywhere - a leftover sentence tells the session to keep a record the driver no longer reads')
  assert.doesNotMatch(mocks, phrase('status.legacy.json'), 'mocks.md must not name status.legacy.json - the move-aside branch is deleted')
  assert.doesNotMatch(mocks, phrase('**Edges.**'), 'mocks.md must carry no Edges paragraph - the legacy edge forks have no driver branch')
  assert.doesNotMatch(whole('spec/commands/mocks.md'), /ledger/i, 'spec/commands/mocks.md must mention no ledger - the command would direct the session at a verb the driver rejects')
})

test('AC-20261103-02-10: genesis.md carries none of the retired ceremony phrases and the genesis brief template has exactly the seven headings in order', () => {
  const genesis = whole('spec/doctrine/genesis.md')
  for (const p of ['derive pass', 'coverage check', 'generating question', 'Provenance Ledger', 'gateVerdict', 'exclusion', '## Journeys']) {
    assert.doesNotMatch(genesis, phrase(p), 'genesis.md must not contain "' + p + '" - it documents ceremony the drivers no longer run')
  }
  const headings = [...read('spec/templates/genesis-brief.md').matchAll(/^## (.+)$/gm)].map((m) => m[1].trim())
  assert.deepStrictEqual(headings,
    ["What I think you're building", 'Coverage', 'Non-goals', 'Open Dimensions', 'Research Angles', 'Picks', 'Non-UI Coverage'],
    'the genesis brief template must have exactly these seven headings in order - a surviving ## Journeys duplicates the seed: ' + JSON.stringify(headings))
})

test('AC-20261103-02-11: the roadmap brief header keeps Phase, Depends on and Primary workspaces only and core Pipeline Entry no longer cites a brief Lane', () => {
  const brief = read('spec/templates/roadmap-brief.md')
  const idx = brief.search(/^## /m)
  const head = idx === -1 ? brief : brief.slice(0, idx)
  for (const p of ['Lane:', 'Risk:', 'Expected specs', 'Design stage']) {
    assert.ok(!head.includes(p), 'the roadmap brief header must not carry "' + p + '" - nothing reads the field, so authors fill it for no one')
  }
  assert.ok(head.split('\n').some((l) => /^Phase: .* · Depends on: .* · Primary workspaces: .*$/.test(l)),
    'the roadmap brief header must be one line "Phase: .. · Depends on: .. · Primary workspaces: ..", or spec-status.js and genesis-driver.js lose their readers\' anchor')
  assert.doesNotMatch(section('spec/doctrine/core.md', /^## Pipeline Entry/, /^## (?!Pipeline Entry)/), phrase('Lane:'),
    'core Pipeline Entry must not cite a brief Lane: field - the field no longer exists')
})
