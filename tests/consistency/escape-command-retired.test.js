'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read } = require('../helpers')

// specs/20261025/02-readers-keep-only-the-surviving-escape-fields.md D6, D7 (retired escape
// command and dead-field names leave the plugin tree; three doctrine passages describe the
// slim ledger).

const SCOPES = ['spec', 'git', 'docs/canonical', 'README.md']
const ZERO = [
  '/spec:escape', 'spec:escape', 'escape.md', 'killedMatch', 'softMatch', 'preventedBy',
  'unclassedReason', '--owed', '--amend', 'joinAmendments', 'validateAmendmentRow', 'escapeKey',
  'computeOwed',
]
const READER = 'spec/scripts/fleet-reader.js'

function walk(rel, acc) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return acc
  if (fs.statSync(abs).isFile()) { acc.push(rel); return acc }
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue
    walk(rel + '/' + ent.name, acc)
  }
  return acc
}

test('AC-20261025-02-7: no retired escape-command or dead-field name survives under spec/, git/, docs/canonical/ or README.md, and escape-class lives only in the fleet reader', () => {
  const files = SCOPES.flatMap(s => walk(s, []))
  assert.ok(files.length > 50, 'the sweep must actually walk the plugin tree (saw ' + files.length + ' files) — an empty walk passes vacuously')
  const hits = []
  const classHits = []
  for (const rel of files) {
    let text
    try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { continue }
    for (const lit of ZERO) if (text.includes(lit)) hits.push(lit + ' @ ' + rel)
    if (text.includes('escape-class') && rel !== READER) classHits.push(rel)
  }
  assert.deepStrictEqual(hits, [],
    'a retired identifier that survives in prose or comments is the next dangling reference: ' + hits.join('; '))
  assert.deepStrictEqual(classHits, [],
    'escape-class may appear only in the fleet reader\'s legacy drift-census stage set: ' + classHits.join('; '))
  assert.ok(read(READER).includes('escape-class'),
    'the drift census must keep escape-class as a known legacy stage, or three ledger rows fleet-wide read as unknown-stage drift')
})

test('AC-20261025-02-8: doctor, release and core describe the slim escape ledger and name no retired field or command', () => {
  const doctor = read('spec/commands/doctor.md')
  const at = doctor.indexOf('**Escapes**')
  assert.ok(at >= 0, 'doctor.md must keep its Escapes paragraph')
  const end = doctor.indexOf('**Plugin-defect', at)
  const para = doctor.slice(at, end === -1 ? undefined : end)
  assert.match(para, /contradicted\s+CLEAN/, 'the contradicted-CLEAN correlation is the reviewer-quality measurement and must stay')
  assert.match(para, /zero\s+escape\s+rows/, 'the recording-absent bullet must stay')
  for (const dead of [/open\s+repair/, /backfill/, /enforce`\s+is\s+due/]) {
    assert.doesNotMatch(para, dead, 'doctor would instruct on a field or command that no longer exists: ' + dead)
  }

  assert.match(read('spec/commands/release.md'), /\/spec:fix\s+for\s+a\s+repair\s+\(its\s+commit\s+records\s+the\s+escape\s+row\)/,
    'the Phase 2 STOP next text must route repairs to /spec:fix, not a retired command')

  const core = read('spec/doctrine/core.md')
  const m = core.indexOf('- **Materiality**')
  assert.ok(m >= 0, 'core.md must keep the Materiality bullet')
  const bullet = core.slice(m, core.indexOf('- **Falsifiability**', m))
  assert.match(bullet, /escape\s+rows\s+and\s+build-row\s+`incidents`/, 'Materiality counts escape rows and build-row incidents')
  assert.doesNotMatch(bullet, /amendment/, 'the amendment join is deleted — Materiality must not describe it')
})
