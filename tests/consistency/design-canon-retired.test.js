'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')

// specs/20260926/01-the-approval-file-is-not-a-gate.md AC-20260926-01-3 (D10): the design-stage
// retirement sweep. Every literal is assembled by concatenation so this file's own source never
// matches itself; this file's own path is also excluded from the walk as a second guard.

const SELF = path.relative(ROOT, __filename).split(path.sep).join('/')

const LITERALS = [
  'design' + '_source',
  'design' + 'ed:',
  'stage-' + 'design',
  'spec:' + 'sketch',
  'inverts' + ' to built',
  'run-' + 'design',
]

const SCAN_DIRS = ['spec', 'git', 'scripts', 'tests', 'docs/canonical', '.claude/rules']
const SCAN_FILES = ['README.md']

function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules') continue
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, acc)
    else if (ent.isFile()) acc.push(abs)
  }
  return acc
}

function scanFiles() {
  const out = []
  for (const rel of SCAN_DIRS) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) walk(abs, out)
  }
  for (const rel of SCAN_FILES) {
    const abs = path.join(ROOT, rel)
    if (fs.existsSync(abs)) out.push(abs)
  }
  return out
}

test('AC-20260926-01-3: the design-stage retirement sweep finds zero occurrences of design_source, designed:, stage-design, spec:sketch, "inverts to built" and run-design across spec/, git/, scripts/, tests/, README.md, docs/canonical/ and .claude/rules/', () => {
  const offenders = []
  for (const abs of scanFiles()) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (rel === SELF) continue
    const content = fs.readFileSync(abs, 'utf8')
    for (const literal of LITERALS) {
      if (content.includes(literal)) offenders.push(rel + ' :: ' + literal)
    }
  }
  assert.deepStrictEqual(offenders, [],
    'D10: every retired literal must occur zero times across the sweep\'s live surfaces once the ' +
    'design-stage retirement lands — a surviving hit means some file still documents, invokes, or ' +
    'reads the retired command, stage, or frontmatter field this spec deletes: ' + offenders.join(', '))
})

test('AC-20260926-01-3: spec/commands/sketch.md and spec/doctrine/stages/stage-design.md no longer exist on disk', () => {
  for (const rel of ['spec/commands/sketch.md', 'spec/doctrine/stages/stage-design.md']) {
    assert.strictEqual(fs.existsSync(path.join(ROOT, rel)), false,
      'D1: ' + rel + ' must be deleted outright — its continued presence means the retired ' +
      'command or stage file is still reachable even though the literal sweep above finds no ' +
      'remaining reference to it')
  }
})
