'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

// PRAX-20260801-03 (OPEN — no fix landed, this pin stays RED after this pass): fidelity-check
// diffs copy, order, and layout primitives against the mock slice, but never the SEMANTIC element
// a string renders through. A mock authoring `<a href="/x">Go deeper</a>` — an interactive,
// keyboard-focusable, navigable element — and an implementation rendering the identical text
// inside a plain `<div>` passes clean today: the string, order, and (absent) layout all match.
// That is a real accessibility/behavior downgrade (no navigation, no focus stop, no semantics)
// that the current string-only diff cannot see. This test intentionally targets the still-open
// gap: it currently PASSES clean (no divergence reported) and must FAIL once fidelity-check gains
// interactive-element-semantics checking.

const SCRIPT = 'scripts/fidelity-check.js'

function fixture() {
  const root = tmpdir('fidsem')
  const sidecar = path.join(root, 'spec.design')
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'slice-s1.html'), '<div><a href="/x">Go deeper</a></div>')
  fs.writeFileSync(path.join(sidecar, 'extract.json'), JSON.stringify({
    schemaVersion: 2,
    surfaces: [{ id: 's1', sliceFile: 'slice-s1.html', strings: ['Go deeper'], layout: [] }],
  }))
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx', sliceRef: 'slice-s1.html',
      states: ['default'], tokens: ['surface'] }],
  }))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/S1.tsx'), '<div>Go deeper</div>')
  return { root, sidecar }
}

test('an interactive element (<a>) downgraded to a non-interactive <div> in the implementation is flagged', () => {
  const f = fixture()
  const res = runNode(SCRIPT, [f.sidecar, '--repo-root', f.root])
  assert.notStrictEqual(res.status, 0,
    'the mock authors "Go deeper" as a navigable <a href> and the implementation renders the ' +
    'identical text inside a plain <div> — no navigation, no focus stop, no link semantics — ' +
    'fidelity-check must report this as a divergence instead of passing clean on string match alone')
})
