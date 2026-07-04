'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC, read } = require('./helpers')
const { execFileSync } = require('node:child_process')

const BIN = path.join(SPEC, 'bin/spec-paths')
const run = (...a) => execFileSync('bash', [BIN, ...a], { encoding: 'utf8' })

test('every documented key resolves to an existing path', () => {
  const fs = require('node:fs')
  for (const key of ['root', 'workflows', 'wf-build', 'wf-design', 'wf-review', 'wf-enforce',
    'wf-panel', 'wf-research', 'dc-extract', 'skeletons-check', 'merge-back', 'shared',
    'shared-genesis', 'template', 'templates', 'contract']) {
    const p = run(key).trim()
    assert.ok(fs.existsSync(p), key + ' -> ' + p)
  }
  assert.match(run('version').trim(), /^\d+\.\d+\.\d+$/)
  assert.match(run('contract-hash').trim(), /^[0-9a-f]{12}$/)
})

test('shared-for: every mapped section name still exists as a shared.md heading', () => {
  const src = read('spec/bin/spec-paths')
  const doc = read('spec/doctrine/shared.md')
  const headings = [...doc.matchAll(/^## (.+)$/gm)].map(m => m[1])
  const maps = [...src.matchAll(/SECTIONS="([^"]+)"/g)].map(m => m[1])
  assert.ok(maps.length >= 6, 'expected a SECTIONS map per scoped command')
  for (const map of maps) {
    for (const name of map.split('|')) {
      assert.ok(headings.some(h => h.startsWith(name)),
        `section "${name}" in a shared-for map no longer matches any shared.md heading — ` +
        'renaming a heading must update the spec-paths maps')
    }
  }
})

test('shared-for: scoped output carries its sections and is smaller than the full doc', () => {
  const full = run('shared-for', 'no-such-command')
  for (const cmd of ['plan', 'design', 'build', 'review', 'enforce', 'import-design']) {
    const out = run('shared-for', cmd)
    assert.ok(out.length < full.length, cmd + ' output should be a strict subset')
    assert.match(out, /## Host Grounding/, cmd + ' must keep Host Grounding')
  }
  assert.match(run('shared-for', 'design'), /## Design Stage/)
  assert.match(run('shared-for', 'build'), /## Escalation Contract/)
  assert.ok(!/## Design Stage/.test(run('shared-for', 'review')), 'review must not pay for Design Stage')
})
