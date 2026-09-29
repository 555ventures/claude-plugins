'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// comment-narration.js --rules-mode scans each enforcement.json entry's notes field. The manifest
// /spec:enforce writes is an object ({schemaVersion, generatedBy, entries}), so the reader must
// walk entries — reading only a top-level array made the notes scan a silent no-op on every host.

const SCRIPT = 'scripts/comment-narration.js'

function hostWith(manifest) {
  const dir = tmpdir('narration-ef')
  fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/rules/enforcement.json'), JSON.stringify(manifest))
  return dir
}

test('rules mode scans notes in the object-shaped manifest /spec:enforce writes', () => {
  const dir = hostWith({
    schemaVersion: 1,
    generatedBy: 'spec:enforce',
    entries: [
      { id: 'web:clean', notes: 'Enforced by the lint config.' },
      { id: 'web:dated', notes: 'Approved on 2026-08-14 after an incident.' },
      { notes: 'Retired in v1.2.3.' },
    ],
  })
  const r = runNode(SCRIPT, ['--rules-mode', dir, '--json'])
  const out = JSON.parse(r.stdout)
  const ef = out.findings.filter(f => f.file.startsWith('.claude/rules/enforcement.json#'))
  assert.deepStrictEqual(ef.map(f => [f.file, f.classes]), [
    ['.claude/rules/enforcement.json#2', ['version']],
    ['.claude/rules/enforcement.json#web:dated', ['date']],
  ], 'every narrating entry must be reported, an id-less entry keyed by its index: ' + r.stdout)
  assert.strictEqual(out.files['.claude/rules/enforcement.json#web:clean'], 0,
    'a clean entry is still counted as scanned: ' + r.stdout)
  assert.strictEqual(r.status, 1, r.stderr)
})

test('rules mode exits cleanly on a manifest with no entries array', () => {
  for (const manifest of [{ schemaVersion: 1 }, null, 'text', [{ id: 'x', notes: '2026-08-14' }]]) {
    const dir = hostWith(manifest)
    const r = runNode(SCRIPT, ['--rules-mode', dir, '--json'])
    assert.strictEqual(r.status, 0, `manifest ${JSON.stringify(manifest)}: ${r.stderr}`)
    assert.deepStrictEqual(JSON.parse(r.stdout).findings, [])
  }
})
