'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { SPEC } = require('../helpers')

// specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D6, AC-20260928-01-9 —
// spec/templates/proto-stable-id.js does not exist yet, so importing it below throws
// ERR_MODULE_NOT_FOUND: every case is genuinely RED.
//
// DOM SURFACE CONTRACT (this test's own fixture, stated per the dispatch's instruction):
// stableIdFor(el) computes an element's ordinal by reading `globalThis.document.
// querySelectorAll('*')` — this file's fake `document` exposes exactly that one method, nothing
// else, and only ever answers the literal selector `'*'`. The implementation must use this exact
// surface (no `el.ownerDocument`, no ancestor walk) to compute the ordinal.
//
// FIBER SHAPE CONTRACT (plain objects, per the AC's own worked example): an owner fiber is
// `{ type: { name: <string> }, key: <string|null>, _debugOwner: <ownerFiber|null> }`; an
// element's own fiber is `{ _debugOwner: <innermost owner fiber>, _debugStack: { stack: <string> } }`
// stored under the literal property name `__reactFiber$t` (D6/AC's own example key), the way
// React tags a real DOM node.

const MOD_PATH = path.join(SPEC, 'templates/proto-stable-id.js')
const MOD_URL = pathToFileURL(MOD_PATH).href

async function loadModule() {
  return import(MOD_URL)
}

function ownerFiber(name, key, parent) {
  return { type: { name }, key: key === undefined ? null : key, _debugOwner: parent || null }
}

function makeSharedChainOwners() {
  const errorBoundary = ownerFiber('ErrorBoundary', null, null)
  const hookified = ownerFiber('hookified', null, errorBoundary)
  const screen = ownerFiber('Screen', null, hookified)
  const list = ownerFiber('List', null, screen)
  const row = ownerFiber('Row', 'w_01', list)
  return row
}

function makeElWithFiber(innermostOwner, debugStack) {
  const el = {}
  el.__reactFiber$t = { _debugOwner: innermostOwner, _debugStack: debugStack || null }
  return el
}

test('AC-20260928-01-9: stableIdFor returns the keyed owner chain plus a 0-based ordinal for two document elements sharing the same chain', async () => {
  let mod
  try {
    mod = await loadModule()
  } catch (e) {
    assert.fail('spec/templates/proto-stable-id.js must exist and export stableIdFor — import failed: ' + e.message)
  }
  const { stableIdFor } = mod
  assert.strictEqual(typeof stableIdFor, 'function', 'proto-stable-id.js must export a stableIdFor function')

  const el0 = makeElWithFiber(makeSharedChainOwners())
  const el1 = makeElWithFiber(makeSharedChainOwners())
  globalThis.document = { querySelectorAll: (sel) => (sel === '*' ? [el0, el1] : []) }
  try {
    assert.strictEqual(stableIdFor(el0), 'Row[w_01]<List<Screen#0',
      'the first of two elements sharing the same owner chain must get ordinal 0, the chain must ' +
      'name only Row/List/Screen (up to three owners, innermost first), skip hookified and ' +
      'ErrorBoundary entirely, and carry the Row owner\'s key as [w_01] (D6)')
    assert.strictEqual(stableIdFor(el1), 'Row[w_01]<List<Screen#1',
      'the second element sharing the same chain must get ordinal 1 — the ordinal is the ' +
      'element\'s 0-based index among document elements sharing that chain, not a global counter (D6)')
  } finally {
    delete globalThis.document
  }
})

test('AC-20260928-01-9: stableIdFor returns null for a DOM node carrying no __reactFiber$* key', async () => {
  const mod = await loadModule().catch((e) => { assert.fail('import failed: ' + e.message) })
  const { stableIdFor } = mod
  globalThis.document = { querySelectorAll: () => [] }
  try {
    assert.strictEqual(stableIdFor({}), null,
      'a node with no fiber field must return null so the overlay records a screen note instead of a bogus id (D6)')
  } finally {
    delete globalThis.document
  }
})

test('AC-20260928-01-9: locFor skips node_modules frames and returns the first app-source frame as path:line', async () => {
  const mod = await loadModule().catch((e) => { assert.fail('import failed: ' + e.message) })
  const { locFor } = mod
  assert.strictEqual(typeof locFor, 'function', 'proto-stable-id.js must export a locFor function')

  const stack = [
    'Error',
    '    at Anonymous (http://localhost:3000/node_modules/react-dom/cjs/react-dom.development.js:123:4)',
    '    at Anonymous (http://localhost:3000/src/a.tsx:41:7)',
  ].join('\n')
  const el = makeElWithFiber(null, { stack })
  assert.strictEqual(locFor(el), 'src/a.tsx:41',
    'locFor must skip the node_modules frame and return the first app-source frame as ' +
    '<path>:<line> with the origin stripped and the column dropped (D6): stack was ' + JSON.stringify(stack))
})

test('AC-20260928-01-9: locFor returns null when every frame is outside app source', async () => {
  const mod = await loadModule().catch((e) => { assert.fail('import failed: ' + e.message) })
  const { locFor } = mod
  const stack = [
    'Error',
    '    at Anonymous (http://localhost:3000/node_modules/react-dom/cjs/react-dom.development.js:123:4)',
    '    at Anonymous (http://localhost:3000/@vite/client:1:1)',
  ].join('\n')
  const el = makeElWithFiber(null, { stack })
  assert.strictEqual(locFor(el), null,
    'when no frame survives the node_modules/@vite//@fs//@id//sb-vite/deps exclusion list, locFor ' +
    'must return null rather than pointing at a framework frame (D6): stack was ' + JSON.stringify(stack))
})
