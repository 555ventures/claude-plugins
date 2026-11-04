'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, read, section, phrase, runNode } = require('../helpers')

// specs/20261103/01-the-user-reaches-build.md AC-20261103-01-6..8: the doctrine carries the job
// story, the Users block and the cold walk, the wireframe binds structure only, and the dead
// UX research brief is gone.

const NEXT_H2 = /^## /

function files(dir) {
  const out = []
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name
    if (e.isDirectory()) out.push(...files(rel))
    else out.push(rel)
  }
  return out
}


test('AC-20261103-01-8: the UX research brief template and genesis section are gone, nothing under spec/ names them, and citations-check.js reports MISS=0', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'spec/templates/ux-research-brief.md')), 'the dead template still ships to every host')
  assert.doesNotMatch(read('spec/doctrine/genesis.md'), /^## Genesis: Fresh UX Research/m, 'the section promises an artifact nothing produces')
  for (const rel of files('spec')) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    assert.ok(!text.includes('ux-research-brief') && !text.includes('research-brief.md'), rel + ' still names the deleted research brief')
  }
  const check = runNode('scripts/citations-check.js', [], { cwd: ROOT })
  assert.strictEqual(check.status, 0, 'citations-check.js must complete: ' + check.stderr)
  assert.match(check.stdout, /\bMISS=0\b/, 'deleting the section orphaned a § citation that now points nowhere: ' + check.stdout)
})
