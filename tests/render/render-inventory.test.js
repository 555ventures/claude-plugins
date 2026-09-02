'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260824/01-render-gate.md (D2/D3/D11, Assumptions A1/A2): render-inventory
// .browser.js is a JS expression evaluating to `(opts) => inventory` — the in-page measuring
// script the host's capture command evaluates inside a real page. It cannot be require()d (zero
// Node APIs, ambient `document`/`getComputedStyle` globals). This test evaluates the file's own
// source with `new Function`, installs a stub DOM as A1's spike measured (painted text under
// text-transform, aria-hidden/data-contract="none" pruning, outOfFlow/fixed/dataPositioned
// flagging, the data-state-btn click switch, data-theme), and calls the resulting function
// directly — proving the real shipped artifact's branching (A2: browser-rendering claims are
// A1's executed evidence, not this stub's job). AC-20260824-01-13.

const SCRIPT = 'spec/scripts/render-inventory.browser.js'

// ---- minimal duck-typed DOM stub -----------------------------------------------------------
let nodeCounter = 0
function textNode(str) {
  return { nodeType: 3, textContent: str, data: str, nodeValue: str }
}
function el(tag, attrs = {}, style = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    _id: ++nodeCounter,
    _attrs: { ...attrs },
    _children: [],
    _style: { display: 'block', visibility: 'visible', position: 'static', textTransform: 'none', ...style },
    _clicked: false,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, name) },
    setAttribute(name, val) { this._attrs[name] = String(val) },
    removeAttribute(name) { delete this._attrs[name] },
    click() { this._clicked = true },
    get children() { return this._children.filter((c) => c.nodeType === 1) },
    get childNodes() { return this._children },
    get innerText() {
      const walk = (n) => (n.nodeType === 3 ? n.textContent : n._children.map(walk).join(''))
      return walk(this)
    },
    getBoundingClientRect() {
      return this._rect || { x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 }
    },
  }
  return node
}
function append(parent, child) {
  parent._children.push(child)
  if (child.nodeType === 1) { child.parentElement = child.parentNode = parent }
  return child
}
function matchesSelector(node, selector) {
  const m = selector.match(/^\[([a-zA-Z0-9-]+)(="([^"]*)")?\]$/)
  if (!m) return false
  const [, attr, hasVal, val] = m
  if (!node.hasAttribute(attr)) return false
  return hasVal === undefined || node.getAttribute(attr) === val
}
function queryAll(root, selector) {
  const out = []
  const walk = (n) => {
    if (n.nodeType === 1 && matchesSelector(n, selector)) out.push(n)
    for (const c of n._children) walk(c)
  }
  walk(root)
  return out
}

// Builds one fresh document exercising every branch the AC pins: an uppercase text-transform
// node, an aria-hidden="true" subtree, a data-contract="none" subtree, a position:absolute chip,
// a position:fixed docked control, a data-positioned ancestor wrapping an unmarked child, and two
// data-state-btn controls.
function buildDom() {
  const root = el('div', { 'data-screen-label': 'Screen' })

  const upper = el('div')
  upper._style.textTransform = 'uppercase'
  append(upper, textNode('4h candles'))
  append(root, upper)

  const hiddenAria = el('div', { 'aria-hidden': 'true' })
  append(hiddenAria, textNode('Hidden A'))
  append(root, hiddenAria)

  const hiddenContract = el('div', { 'data-contract': 'none' })
  append(hiddenContract, textNode('Hidden B'))
  append(root, hiddenContract)

  const oof = el('div', {}, { position: 'absolute' })
  append(oof, textNode('Chip'))
  append(root, oof)

  const fixed = el('div', {}, { position: 'fixed' })
  append(fixed, textNode('Docked'))
  append(root, fixed)

  const positionedWrap = el('div', { 'data-positioned': 'true' })
  const chip2 = el('div')
  append(chip2, textNode('Chip2'))
  append(positionedWrap, chip2)
  append(root, positionedWrap)

  const emptyBtn = el('button', { 'data-state-btn': 'empty' })
  append(emptyBtn, textNode('Empty'))
  append(root, emptyBtn)

  const otherBtn = el('button', { 'data-state-btn': 'other' })
  append(otherBtn, textNode('Other'))
  append(root, otherBtn)

  const documentElement = el('html')
  const document = {
    documentElement,
    body: root,
    querySelector(sel) { return queryAll(root, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(root, sel) },
  }
  return { document, documentElement, root, upper, hiddenAria, hiddenContract, oof, fixed, chip2, emptyBtn, otherBtn }
}

function loadWalker() {
  const src = read(SCRIPT)
  // eslint-disable-next-line no-new-func
  return new Function('return (' + src + ')')()
}

function withGlobals(dom, fn) {
  const prevDocument = global.document
  const prevGCS = global.getComputedStyle
  const prevWindow = global.window
  global.document = dom.document
  global.getComputedStyle = (node) => node._style || {}
  global.window = { scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0, getComputedStyle: global.getComputedStyle }
  try {
    return fn()
  } finally {
    global.document = prevDocument
    global.getComputedStyle = prevGCS
    global.window = prevWindow
  }
}

test('AC-20260824-01-13: the shipped in-page walker uppercases painted text via computed text-transform, prunes aria-hidden/data-contract=none subtrees, flags outOfFlow/fixed/dataPositioned by position/ancestor, clicks only the matching data-state-btn control (or none for "-"), and sets data-theme on the document element', () => {
  const walk = loadWalker()
  assert.strictEqual(typeof walk, 'function',
    'render-inventory.browser.js must evaluate to a callable (opts) => inventory function — the exact shape the capture contract evaluates: got ' + typeof walk)

  const domA = buildDom()
  const invA = withGlobals(domA, () => walk({ theme: 'dark', state: '-' }))
  assert.ok(invA && Array.isArray(invA.entries), 'the walker must return a document with an entries array: ' + JSON.stringify(invA))

  const byText = (t) => invA.entries.find((e) => e.text === t)

  const upperEntry = byText('4H CANDLES')
  assert.ok(upperEntry,
    'A1 (executed 2026-08-24 spike): a text-transform:uppercase element\'s own text must be painted-cased in the returned entry ("4h candles" -> "4H CANDLES"), never the raw textContent — the exact prax `4h`->`4H` false-positive class D2 exists to close: ' + JSON.stringify(invA.entries.map((e) => e.text)))

  assert.ok(!byText('Hidden A'),
    'D3: a subtree under aria-hidden="true" must never enter the inventory — an entry surviving here means the pruning regressed: ' + JSON.stringify(invA.entries.map((e) => e.text)))
  assert.ok(!byText('Hidden B'),
    'D3: a subtree under data-contract="none" must never enter the inventory (the "Device clock" A1 exclusion class): ' + JSON.stringify(invA.entries.map((e) => e.text)))

  const chipEntry = byText('Chip')
  assert.ok(chipEntry, 'a position:absolute element with its own text must still enter the inventory (flagged, not pruned): ' + JSON.stringify(invA.entries))
  assert.strictEqual(chipEntry.outOfFlow, true,
    'D2: an element under position:absolute must be flagged outOfFlow:true — render-compare relies on this flag to exclude it from ORDER (D3): ' + JSON.stringify(chipEntry))

  const dockedEntry = byText('Docked')
  assert.ok(dockedEntry, 'a position:fixed element with its own text must still enter the inventory: ' + JSON.stringify(invA.entries))
  assert.strictEqual(dockedEntry.fixed, true,
    'D2: an element under position:fixed must be flagged fixed:true — render-compare\'s D5 positioning finding depends on this flag, and the salon-os docked-action regression is invisible without it: ' + JSON.stringify(dockedEntry))

  const chip2Entry = byText('Chip2')
  assert.ok(chip2Entry, 'a child of a data-positioned ancestor with its own text must still enter the inventory: ' + JSON.stringify(invA.entries))
  assert.strictEqual(chip2Entry.dataPositioned, true,
    'D2/D3: flags inherit downward — an element under a data-positioned ancestor (not itself marked) must still be flagged dataPositioned:true, or the GEOMETRY exclusion for data-positioned chart chips regresses: ' + JSON.stringify(chip2Entry))

  assert.strictEqual(domA.documentElement.getAttribute('data-theme'), 'dark',
    'the walker must set data-theme on the document element to opts.theme before walking, or theme-scoped computed styles never activate: ' + domA.documentElement.getAttribute('data-theme'))

  assert.strictEqual(domA.emptyBtn._clicked, false, 'state "-" must click nothing (D11: "-" means no switch): the "empty" control was clicked')
  assert.strictEqual(domA.otherBtn._clicked, false, 'state "-" must click nothing: the "other" control was clicked')

  const domB = buildDom()
  withGlobals(domB, () => walk({ theme: 'light', state: 'empty' }))
  assert.strictEqual(domB.emptyBtn._clicked, true,
    'D11: with {state:"empty"} the walker must click() the element whose data-state-btn is "empty" before walking, or the mock state switcher never fires')
  assert.strictEqual(domB.otherBtn._clicked, false,
    'D11: only the matching data-state-btn control is clicked — the "other" control must stay untouched')
})

// specs/20260824/04-render-rules.md (D4): render-inventory.browser.js gains
// effectiveBackground (the nearest ancestor-or-self computed background-color whose alpha is
// non-zero, else the document's) and fontWeight per entry — the render-rules.js contrast check
// (AC-20260824-04-4) has no denominator to compare against a fully transparent own background.
// Builds a small DOM apart from buildDom() above: a text element whose own backgroundColor is
// fully transparent, nested under an ancestor carrying an opaque backgroundColor.
function buildEffectiveBgDom() {
  const root = el('div', { 'data-screen-label': 'Screen' })
  const ancestor = el('div', {}, { backgroundColor: 'rgb(16, 16, 16)' })
  const inkText = el('div', {}, { backgroundColor: 'rgba(0, 0, 0, 0)', fontWeight: '700' })
  append(inkText, textNode('Ink'))
  append(ancestor, inkText)
  append(root, ancestor)

  const documentElement = el('html')
  const document = {
    documentElement,
    body: root,
    querySelector(sel) { return queryAll(root, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(root, sel) },
  }
  return { document, documentElement, root, ancestor, inkText }
}

test('AC-20260824-04-8: a text element whose own backgroundColor is rgba(0, 0, 0, 0) under an ancestor with rgb(16, 16, 16) records effectiveBackground "rgb(16, 16, 16)" and the element\'s own fontWeight', () => {
  const walk = loadWalker()
  const dom = buildEffectiveBgDom()
  const inv = withGlobals(dom, () => walk({ theme: 'light', state: '-' }))
  const entry = inv.entries.find((e) => e.text === 'Ink')
  assert.ok(entry, 'a text element under a fully transparent own background must still enter the inventory: ' + JSON.stringify(inv.entries))
  assert.strictEqual(entry.effectiveBackground, 'rgb(16, 16, 16)',
    'D4: when an element\'s own computed backgroundColor has zero alpha, effectiveBackground must walk up to the nearest ancestor-or-self opaque backgroundColor — without this, render-rules.js\'s contrast check (AC-20260824-04-4) has no real background to compare color against: got ' + JSON.stringify(entry))
  assert.strictEqual(entry.fontWeight, '700',
    'D4: the entry must also record its own computed fontWeight — render-rules.js\'s contrast check reads fontWeight>=700 (with fontSize>=18.66px) as an alternate minLarge trigger, and a missing field means that branch can never fire: got ' + JSON.stringify(entry))
})

// specs/20260831/02-viewport-adaptation-rules.md (D4): render-inventory.browser.js
// gains a top-level `page: { scrollWidth, clientWidth }` block, read guarded from
// `document.scrollingElement || document.documentElement`, null when unavailable —
// render-rules.js's new no-overflow check (specs/20260831/02) has no geometry to compare
// without it (spec 20260823/11: a phone-only mock ratified clean with no measurement
// tying it to the viewport). Extends this file's existing stub-DOM surface with
// `scrollingElement` rather than reaching for any API outside it — per the spec's own
// Rationale, "the stub-DOM test's surface is the contract".
function buildPageDom(scrollingElement) {
  const root = el('div', { 'data-screen-label': 'Screen' })
  const documentElement = el('html')
  const document = {
    documentElement,
    body: root,
    scrollingElement,
    querySelector(sel) { return queryAll(root, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(root, sel) },
  }
  return { document, documentElement, root }
}

test('AC-20260831-02-1: the walker returns page: { scrollWidth: 900, clientWidth: 390 } from a scrolling element reporting those metrics, and page: { scrollWidth: null, clientWidth: null } without throwing when no scrolling-element metrics are exposed', () => {
  const walk = loadWalker()

  const domNumeric = buildPageDom({ scrollWidth: 900, clientWidth: 390 })
  const invNumeric = withGlobals(domNumeric, () => walk({ theme: 'light', state: '-' }))
  assert.deepStrictEqual(invNumeric.page, { scrollWidth: 900, clientWidth: 390 },
    'D4: a scrollingElement reporting scrollWidth 900 / clientWidth 390 must surface verbatim at the document\'s top-level page block, or render-rules.js\'s no-overflow page leg has no geometry to compare: ' + JSON.stringify(invNumeric.page))

  const domUnavailable = buildPageDom(undefined)
  let invUnavailable
  assert.doesNotThrow(() => {
    invUnavailable = withGlobals(domUnavailable, () => walk({ theme: 'light', state: '-' }))
  }, 'D4: an evaluation context exposing no scrolling-element metrics must never throw — a captured page missing this surface would crash the whole capture run rather than degrade to a fail-closed finding')
  assert.deepStrictEqual(invUnavailable.page, { scrollWidth: null, clientWidth: null },
    'D4: with no document.scrollingElement and no numeric documentElement metrics, the guarded read must yield explicit nulls (the same discipline as every other optional lookup in this file) — anything else here means D5\'s fail-closed no-overflow finding can never trigger on a genuinely unmeasurable page: ' + JSON.stringify(invUnavailable.page))
})
