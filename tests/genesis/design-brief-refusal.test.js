'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20261024/02-genesis-marks-and-the-no-stand-ins-test.md — AC-20261024-02-4 (D5): the
// design-brief-written handler is the verification point for design-paths.json.

const SCRIPT = 'scripts/genesis-driver.js'

test('AC-20261024-02-4: --mark design-brief-written with design-paths.json absent still refuses naming the file', () => {
  const dir = tmpdir('design-brief-refusal')
  assert.strictEqual(runNode(SCRIPT, ['--root', dir]).status, 0, 'setup requires the first bare run to create status.json')
  const sp = path.join(dir, '.claude/genesis/status.json')
  const st = JSON.parse(fs.readFileSync(sp, 'utf8'))
  st.archetype = 'web-app'
  fs.writeFileSync(sp, JSON.stringify(st, null, 2) + '\n')
  fs.writeFileSync(path.join(dir, '.claude/genesis/stack-descriptor.json'), JSON.stringify({ designCatalog: 'storybook' }))
  const r = runNode(SCRIPT, ['--root', dir, '--mark', 'design-brief-written'])
  assert.notStrictEqual(r.status, 0, 'the mark was accepted without design-paths.json, so the handler no longer verifies the artifact that deriveState will stop re-checking')
  assert.match(r.stderr, /design-paths\.json/, 'the refusal does not name design-paths.json, so the session cannot tell what to write: ' + r.stderr)
  const after = JSON.parse(fs.readFileSync(sp, 'utf8'))
  assert.notStrictEqual(after.marks.designBriefWritten, true, 'the refused mark was still recorded, so the run advances past an unverified design brief')
})
