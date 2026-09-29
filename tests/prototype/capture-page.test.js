'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')
const { SPEC } = require('../helpers')

// specs/20260928/02-freeze-export-and-the-contract.md D1, AC-20260928-02-1 —
// spec/templates/proto-capture-page.js does not exist yet, so reading it throws ENOENT: every
// case below is genuinely RED.
//
// DOM SURFACE CONTRACT (this test's own fixture, per the AC's own worked example and D1's "owner
// chain (spec 01 D6)" citation): captureComposites(rootEl, composites, props) is a no-import
// browser script — it gets its ids the same way spec 01's overlay does, by calling
// globalThis.__protoStableId.stableIdFor(el) (the real spec/templates/proto-stable-id.js,
// imported here and wired onto the REAL process globalThis for the duration of the call, since
// that module's own stableIdFor closes over globalThis.document, not this file's vm context).
// rootEl exposes querySelectorAll('*') returning the flat element list; each element carries a
// __reactFiber$t fiber (D6 shape), a getBoundingClientRect() returning fractional numbers, a
// textContent string, a tagName, and (for the two qualifying elements) a getComputedStyle-visible
// style via the injected `getComputedStyle` global, called once per name in `props` and read
// through `.getPropertyValue(name)` (the standard CSSOM shape) — never a hardcoded internal
// property list, since D1's Contracts only fix the property COUNT (27), not their names.
//
// STYLE CONTRACT: props is exactly the PROPS array below (27 names); the returned entry's
// `styles` object must equal exactly `{ [name]: STYLE_VALUES[name] }` for each name in props —
// no more, no fewer keys.

const CAPTURE_PAGE_PATH = path.join(SPEC, 'templates/proto-capture-page.js')
const STABLE_ID_URL = pathToFileURL(path.join(SPEC, 'templates/proto-stable-id.js')).href

const PROPS = [
  'display', 'color', 'background-color',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'font-size', 'font-weight', 'line-height', 'text-align', 'opacity',
  'flex-direction', 'align-items', 'justify-content',
]
assert.strictEqual(PROPS.length, 27, 'this test file\'s own PROPS fixture must carry exactly 27 names — a miscount here would invalidate every "exactly 27 style keys" assertion below')

const STYLE_VALUES = {}
PROPS.forEach((name, i) => { STYLE_VALUES[name] = 'v' + i })

function computedStyleFor() {
  return { getPropertyValue: (name) => (Object.prototype.hasOwnProperty.call(STYLE_VALUES, name) ? STYLE_VALUES[name] : '') }
}

function ownerFiber(name, key, parent) {
  return { type: { name }, key: key === undefined ? null : key, _debugOwner: parent || null }
}

function makeEl(tagName, innermostOwner, rect, text, hidden) {
  return {
    __reactFiber$t: { _debugOwner: innermostOwner, _debugStack: null },
    tagName,
    getBoundingClientRect: () => rect,
    textContent: text,
    __hidden: !!hidden,
    __computedStyle: computedStyleFor(),
  }
}

async function loadCaptureComposites() {
  let src
  try {
    src = fs.readFileSync(CAPTURE_PAGE_PATH, 'utf8')
  } catch (e) {
    assert.fail('spec/templates/proto-capture-page.js must exist — read failed: ' + e.message)
  }
  const stableId = await import(STABLE_ID_URL)

  const screenOwner = ownerFiber('Screen', null, null)
  const listOwner = ownerFiber('List', null, screenOwner) // chain from listOwner: "List<Screen"
  const rowOwner = ownerFiber('Row', 'w_01', listOwner) // chain from rowOwner: "Row[w_01]<List<Screen"
  const rowOwner2 = ownerFiber('Row', 'w_02', listOwner) // a distinct Row instance for the hidden element
  const wrapperOwner = ownerFiber('Wrapper', null, screenOwner) // chain "Wrapper<Screen" — no Row/List

  const elRow = makeEl('A', rowOwner, { x: 10.4, y: 20.6, width: 100.2, height: 50.8 }, '  A   B\n\tC  ')
  const elList = makeEl('DIV', listOwner, { x: 1.1, y: 2.9, width: 5.5, height: 6.4 }, 'list container')
  const elHidden = makeEl('SPAN', rowOwner2, { x: 0, y: 0, width: 1, height: 1 }, 'hidden row', true)
  const elWrapper = makeEl('DIV', wrapperOwner, { x: 0, y: 0, width: 1, height: 1 }, 'wrapper only')
  const allEls = [elRow, elList, elHidden, elWrapper]

  const fakeDocument = { querySelectorAll: (sel) => (sel === '*' ? allEls : []) }
  const fakeRoot = { querySelectorAll: (sel) => (sel === '*' ? allEls : []) }
  const getComputedStyleFn = (el) => {
    if (el.__hidden) return { getPropertyValue: (name) => (name === 'display' ? 'none' : '') }
    return el.__computedStyle
  }

  // proto-stable-id.js's own stableIdFor/locFor are imported real functions that close over the
  // REAL process globalThis.document, not this file's vm sandbox — wire it there for the
  // duration of the call, mirroring stable-id.test.js's own pattern.
  globalThis.document = fakeDocument

  const context = {}
  context.globalThis = context
  context.document = fakeDocument
  context.getComputedStyle = getComputedStyleFn
  context.__protoStableId = { stableIdFor: stableId.stableIdFor, locFor: stableId.locFor }
  context.console = console
  vm.createContext(context)
  try {
    vm.runInContext(src, context, { filename: CAPTURE_PAGE_PATH })
  } catch (e) {
    delete globalThis.document
    assert.fail('spec/templates/proto-capture-page.js must evaluate as a plain script with no imports — it threw: ' + e.message)
  }

  const api = (context.__protoCapture && context.__protoCapture.captureComposites)
    ? context.__protoCapture
    : context
  assert.strictEqual(typeof api.captureComposites, 'function',
    'proto-capture-page.js must expose a captureComposites(rootEl, composites, props) function, either as globalThis.__protoCapture.captureComposites or globalThis.captureComposites (D1)')

  return { captureComposites: api.captureComposites, rootEl: fakeRoot, cleanup: () => { delete globalThis.document } }
}

test('AC-20260928-02-1: captureComposites returns one entry per visible element whose owner chain contains a declared composite name, skipping the hidden and non-matching elements', async () => {
  const { captureComposites, rootEl, cleanup } = await loadCaptureComposites()
  let entries
  try {
    entries = captureComposites(rootEl, ['Row', 'List'], PROPS)
  } finally {
    cleanup()
  }

  assert.ok(Array.isArray(entries), 'captureComposites must return an array of entries: ' + JSON.stringify(entries))
  assert.strictEqual(entries.length, 2,
    'only the Row-owned and the List-owned visible elements qualify — the hidden Row instance and the Wrapper-only element must be excluded: ' + JSON.stringify(entries))

  const rowEntry = entries.find((e) => e.id === 'Row[w_01]<List<Screen#0')
  assert.ok(rowEntry, 'an entry for the Row[w_01]<List<Screen#0 owner chain must be present — its absence means the Row-composite element was dropped: ' + JSON.stringify(entries))
  const listEntry = entries.find((e) => e.id === 'List<Screen#0')
  assert.ok(listEntry, 'an entry for the List<Screen#0 owner chain must be present — its absence means an element identified only by the List composite (no Row wrapper) was dropped: ' + JSON.stringify(entries))

  assert.ok(!entries.some((e) => e.id === 'Row[w_02]<List<Screen#0'),
    'the hidden element (display: none) must be excluded even though its own owner chain also names Row: ' + JSON.stringify(entries))
  assert.ok(!entries.some((e) => e.id && e.id.startsWith('Wrapper')),
    'the Wrapper<Screen element must be excluded — its owner chain names neither Row nor List: ' + JSON.stringify(entries))

  assert.strictEqual(rowEntry.tag.toLowerCase(), 'a', 'the Row entry\'s tag must reflect the element\'s own tagName ("a"), lowercase or not: ' + JSON.stringify(rowEntry))
  assert.deepStrictEqual(rowEntry.box, [10, 21, 100, 51],
    'box must be the element\'s getBoundingClientRect fields [x, y, width, height], each rounded to the nearest integer: ' + JSON.stringify(rowEntry.box))
  assert.strictEqual(rowEntry.text, 'A B C',
    'text must collapse internal whitespace runs (spaces, tabs, newlines) to single spaces and trim the ends: got ' + JSON.stringify(rowEntry.text))
  assert.ok(rowEntry.text.length <= 80, 'text must never exceed 80 characters: ' + JSON.stringify(rowEntry.text))
  assert.strictEqual(Object.keys(rowEntry.styles).length, 27,
    'styles must carry exactly 27 keys — the props array\'s own length, never more or fewer: ' + JSON.stringify(rowEntry.styles))
  assert.deepStrictEqual(rowEntry.styles, STYLE_VALUES,
    'styles must equal exactly the getComputedStyle().getPropertyValue(name) result for every name in props, copied verbatim: ' + JSON.stringify(rowEntry.styles))
})
