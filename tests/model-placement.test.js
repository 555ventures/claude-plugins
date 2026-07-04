'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

const read = (p) => fs.readFileSync(path.join(SPEC, p), 'utf8')

// Model policy: Fable drafts and judges at plan/design only. Build-time adjudication
// (the retainer) and T3 checkpoints are Opus seats, with the role brief transferring
// the plan-author's frame. Pinned here so a future doctrine edit can't drift Fable
// back into the build loop.

test('build.md: retainer and T3 checkpoints are Opus, never Fable', () => {
  const build = read('commands/build.md')
  assert.match(build, /Agent \{model: "opus"\}/)
  assert.doesNotMatch(build, /Agent \{model: "fable"\}/)
  assert.doesNotMatch(build, /Fable retainer/)
  assert.doesNotMatch(build, /Fable checkpoints?/i)
})

test('build.md: retainer role brief present with its binding clauses', () => {
  const build = read('commands/build.md')
  assert.match(build, /spec author's proxy/)
  assert.match(build, /never from implementation convenience/)
  assert.match(build, /ESCALATE:/)
  assert.match(build, /PASS/)
  assert.match(build, /BLOCK/)
})

test('shared.md: Fable row excludes build time; Opus row owns retainer + T3', () => {
  const shared = read('doctrine/shared.md')
  const fableRow = shared.split('\n').find(l => l.startsWith('| Fable |'))
  const opusRow = shared.split('\n').find(l => l.startsWith('| Opus |'))
  assert.ok(fableRow && opusRow, 'Model Placement table rows exist')
  assert.match(fableRow, /Never at build time/)
  assert.doesNotMatch(fableRow, /retainer|T3/i)
  assert.match(opusRow, /retainer/)
  assert.match(opusRow, /T3 checkpoints/)
  assert.doesNotMatch(shared, /mandatory Fable checkpoints/)
})

test('no stray Fable-retainer references anywhere in the plugin', () => {
  const roots = ['commands', 'doctrine', 'templates']
  for (const dir of roots) {
    for (const f of fs.readdirSync(path.join(SPEC, dir))) {
      if (!f.endsWith('.md')) continue
      const text = read(path.join(dir, f))
      assert.doesNotMatch(text, /Fable (retainer|consultant)/,
        `${dir}/${f} still references the Fable retainer/consultant`)
    }
  }
  assert.doesNotMatch(read('README.md'), /Fable (retainer|consultant)/)
})
