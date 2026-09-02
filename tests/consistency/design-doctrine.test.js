'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, read } = require('../helpers')

// specs/20260824/05-design-doctrine-cut.md D1/D2/D5: spec/doctrine/design.md holds five
// sections (contracts a script enforces or a worker applies only) capped at 160 lines;
// dc-extract.js and fidelity-check.js are deleted, the scripts the old "## Design Binding
// Pipeline" section documented. These tests pin the rewritten shape (AC-1), the size cap and
// literal ban that is the reopen condition for every retired seat/artifact (AC-2), and the
// spec-paths refusal plus on-disk deletion of both retired scripts (AC-4).

test('AC-20260824-05-1: spec/doctrine/design.md contains exactly the five D1 headings, in that order, and no other top-level heading', () => {
  const src = read('spec/doctrine/design.md')
  const headings = [...src.matchAll(/^## (.+)$/gm)].map((m) => m[1])
  assert.deepStrictEqual(headings, [
    'Design Canon (mocks, tokens, harness)',
    'Design Authoring Contracts',
    'Design Render Gate',
    'Design Atlas',
    'Workflows Encode Shape, Not Judgment'
  ], 'D1 fixes design.md to exactly these five headings in this order — a missing, reordered, ' +
    'renamed, or extra heading means shared-for section maps and every § citation resolve ' +
    'against a doctrine file whose actual sections no longer match what they name: got ' +
    JSON.stringify(headings))
})

test('AC-20260824-05-2: spec/doctrine/design.md is at most 160 lines and names none of the retired mechanism/seat literals', () => {
  const src = read('spec/doctrine/design.md')
  const lineCount = src.split('\n').length
  assert.ok(lineCount <= 160,
    'D1/D2 caps the rewritten doctrine at 160 lines — the cap IS the enforcement (a doctrine ' +
    'this short cannot also carry a retired mechanism\'s history or rationale): got ' +
    lineCount + ' lines')
  for (const literal of ['dc-extract', 'fidelity-check', 'skeletons', 'deltas.json', 'retainer',
    'vision consult', 'FIDELITY_REVIEW', 'ITERATE', 'wf-design']) {
    assert.ok(!src.includes(literal),
      'AC-2 bans the literal "' + literal + '" from design.md — its presence means a retired ' +
      'mechanism, seat, or artifact this series deleted is still documented as though it exists, ' +
      'and per this spec\'s Rationale the literal ban is the reopen condition for every seat and ' +
      'artifact the series retired: a future edit that reintroduces it must redden this suite')
  }
})

test('AC-20260824-05-4: spec-paths dc-extract and spec-paths fidelity-check are refused now that D5 retires both keys, and neither script exists on disk', () => {
  const BIN = path.join(SPEC, 'bin/spec-paths')
  const run = (...a) => execFileSync('bash', [BIN, ...a], { encoding: 'utf8' })

  for (const key of ['dc-extract', 'fidelity-check']) {
    let threw = false
    let output = ''
    try {
      run(key)
    } catch (e) {
      threw = true
      output = String(e.stdout || '') + String(e.stderr || '')
    }
    assert.ok(threw,
      'D5: `spec-paths ' + key + '` must exit non-zero now that the key is retired (its script ' +
      'is deleted along with the source-grep fidelity gate it served) — a still-resolving key ' +
      'means a caller gets a path to a file that is no longer there instead of a discoverable error')
    assert.match(output, /usage: spec-paths/,
      '`spec-paths ' + key + '` must print the usage line on refusal, the same way any other ' +
      'unknown key does, so a caller relying on the old key gets a discoverable error: ' + output)
  }

  for (const rel of ['scripts/dc-extract.js', 'scripts/fidelity-check.js']) {
    const p = path.join(SPEC, rel)
    assert.ok(!fs.existsSync(p),
      'D5: ' + rel + ' must be deleted with the source-grep fidelity gate it belonged to — its ' +
      'continued presence means the retired mechanism is still reachable even though its ' +
      'spec-paths key is gone: ' + p)
  }
})
