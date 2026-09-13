'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

// spec/scripts/lib/notes-anchor.browser.js (CREATE) — specs/20260912/11-a-note-can-mark-an-area.md
// D1, AC-20260912-11-1/-2/-3. Feeds fake DOM objects over the module's own documented interface
// (el.children, el.parentNode, el.textContent, el.tagName, el.getBoundingClientRect(),
// root.querySelectorAll('*')) — no jsdom, no real browser; the AC's own fixture geometry is
// reproduced exactly so its stated numbers can be pinned. Does NOT touch notes-layer.browser.js,
// the served /__notes/* routes, or any Chrome-gated behavior — those belong to
// tests/mocks/notes-layer-region.test.js and tests/mocks/notes-region-store.test.js.

const ANCHOR_PATH = path.join(SPEC, 'scripts/lib/notes-anchor.browser.js')

function loadAnchor() {
  delete require.cache[ANCHOR_PATH]
  return require(ANCHOR_PATH)
}

function rect(x, y, w, h) {
  return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }
}

// Contracts' own truncation rule ("snippet = first 40 chars of textContent, whitespace-collapsed")
// applied to fixture text this file controls — never a re-derivation of capture's own
// arrangement/aspect/touched math, only the trivial substring rule used to compute an expected value.
function snippetOf(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40)
}

function makeNode(tagName, r, textContent) {
  const node = {
    tagName,
    children: [],
    parentNode: null,
    textContent: textContent || '',
    getBoundingClientRect() { return r },
  }
  node.querySelectorAll = function (sel) {
    if (sel !== '*') throw new Error('this fake DOM node implements querySelectorAll("*") only')
    const out = []
    const walk = (n) => { for (const c of n.children) { out.push(c); walk(c) } }
    walk(node)
    return out
  }
  return node
}

function attach(parent, child) {
  child.parentNode = parent
  parent.children.push(child)
}

function closeTo(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 1e-6, msg + ' (got ' + actual + ', want ' + expected + ')')
}

const SECTION_TEXT = 'Riverside clinic row of three cards'
const CHILD1_TEXT = 'Northgate clinic'
const CHILD2_TEXT = 'Home visit here'

// AC-1's own fixture: a data-screen-label root holding one section (rect 0,0,1000x300) with
// three same-size children side by side at x = 0/340/680, each 320 wide and 300 tall.
function buildOriginalDom() {
  const root = makeNode('DIV', rect(0, 0, 1000, 300), '')
  const section = makeNode('SECTION', rect(0, 0, 1000, 300), SECTION_TEXT)
  const child0 = makeNode('DIV', rect(0, 0, 320, 300), 'Riverside clinic')
  const child1 = makeNode('DIV', rect(340, 0, 320, 300), CHILD1_TEXT)
  const child2 = makeNode('DIV', rect(680, 0, 320, 300), CHILD2_TEXT)
  attach(root, section)
  attach(section, child0); attach(section, child1); attach(section, child2)
  return { root, section, child0, child1, child2 }
}

// AC-2(b)'s own fixture: the SAME section (same text, so its snippet still matches) reflowed to
// 360 wide with its three children stacked at y = 0/310/620, each 360x300.
function buildReflowedDom() {
  const root = makeNode('DIV', rect(0, 0, 360, 920), '')
  const section = makeNode('SECTION', rect(0, 0, 360, 920), SECTION_TEXT)
  const child0 = makeNode('DIV', rect(0, 0, 360, 300), 'Riverside clinic')
  const child1 = makeNode('DIV', rect(0, 310, 360, 300), CHILD1_TEXT)
  const child2 = makeNode('DIV', rect(0, 620, 360, 300), CHILD2_TEXT)
  attach(root, section)
  attach(section, child0); attach(section, child1); attach(section, child2)
  return { root, section, child0, child1, child2 }
}

test('AC-20260912-11-1: capture(root, box) anchors to the smallest containing element and records its path, fraction box, layout signature, touched children and the root width at draw time', () => {
  const { capture } = loadAnchor()
  const { root } = buildOriginalDom()
  const region = capture(root, { x: 330, y: 4, w: 660, h: 290 })

  assert.deepStrictEqual(region.anchor.path, [0],
    'capture must anchor to the section (root.children[0]), the smallest descendant fully containing the drawn box — a wrong path points every future render at the wrong element')
  closeTo(region.frac.x, 0.33, 'frac.x must be the box\'s left edge as a fraction of the anchor rect\'s width')
  closeTo(region.frac.y, 4 / 300, 'frac.y must be the box\'s top edge as a fraction of the anchor rect\'s height')
  closeTo(region.frac.w, 0.66, 'frac.w must be the box\'s width as a fraction of the anchor rect\'s width')
  closeTo(region.frac.h, 290 / 300, 'frac.h must be the box\'s height as a fraction of the anchor rect\'s height')
  assert.strictEqual(region.layout.arrangement, 'row',
    'three children whose tops all sit within 4px of each other must be classified "row" — a wrong arrangement makes resolve() reject an unreflowed layout as changed')
  closeTo(region.layout.aspect, 1000 / 300, 'layout.aspect must be the anchor rect\'s own width/height ratio')
  assert.deepStrictEqual(region.touched.map((t) => t.i), [1, 2],
    'touched must list the indices of the two anchor children the drawn box actually intersects, and only those — a box that spans two of three 320-wide cards must never touch the third')
  assert.strictEqual(region.touched.find((t) => t.i === 1).snippet, snippetOf(CHILD1_TEXT),
    'a touched child\'s snippet must be its own textContent (truncated per the documented rule) — the reflow fallback needs it to confirm that child still exists')
  assert.strictEqual(region.touched.find((t) => t.i === 2).snippet, snippetOf(CHILD2_TEXT),
    'a touched child\'s snippet must be its own textContent (truncated per the documented rule) — the reflow fallback needs it to confirm that child still exists')
  assert.strictEqual(region.drawnAt.w, 1000,
    'drawnAt.w must be the mock root\'s own width at draw time — a wrong value would make every later re-render scale the box against the wrong reference width')
})

test('AC-20260912-11-2: resolve(root, region) reproduces the exact drawn box on an unchanged layout, and falls back to the padded union of the touched children once the anchor reflows', () => {
  const { capture, resolve } = loadAnchor()
  const original = buildOriginalDom()
  const region = capture(original.root, { x: 330, y: 4, w: 660, h: 290 })

  const exact = resolve(original.root, region)
  assert.ok(exact, 'resolving the just-captured region against its own unchanged DOM must not return null — nothing about this layout has changed')
  assert.strictEqual(exact.mode, 'exact',
    'an anchor whose arrangement and aspect are unchanged must resolve mode "exact" — falling back to "children" here would draw a padded approximation where the true box is still known')
  closeTo(exact.box.x, 330, 'the exact box\'s x must reproduce the originally drawn box')
  closeTo(exact.box.y, 4, 'the exact box\'s y must reproduce the originally drawn box')
  closeTo(exact.box.w, 660, 'the exact box\'s w must reproduce the originally drawn box')
  closeTo(exact.box.h, 290, 'the exact box\'s h must reproduce the originally drawn box')

  const reflowed = buildReflowedDom()
  const children = resolve(reflowed.root, region)
  assert.ok(children, 'resolving against the reflowed DOM must not return null — the touched children (index 1 and 2) still exist in the reflowed section')
  assert.strictEqual(children.mode, 'children',
    'a reflowed anchor (row -> col, aspect far outside 0.75..1.33 of the captured layout) whose touched children still resolve must fall back to mode "children", never "exact" and never null')
  closeTo(children.box.x, -4, 'the children box must be the union of touched children 1 and 2, padded 4px on every side')
  closeTo(children.box.y, 306, 'the children box must be the union of touched children 1 and 2, padded 4px on every side')
  closeTo(children.box.w, 368, 'the children box must be the union of touched children 1 and 2, padded 4px on every side')
  closeTo(children.box.h, 618, 'the children box must be the union of touched children 1 and 2, padded 4px on every side')
})

test('AC-20260912-11-3: resolve(root, region) returns null when the anchor path walks off the tree, its snippet no longer matches the found element, or its element has a zero-area rect', () => {
  const { capture, resolve } = loadAnchor()
  const original = buildOriginalDom()
  const region = capture(original.root, { x: 330, y: 4, w: 660, h: 290 })

  const offTree = Object.assign({}, region, { anchor: Object.assign({}, region.anchor, { path: [0, 9] }) })
  assert.strictEqual(resolve(original.root, offTree), null,
    'a path that walks off the tree (the section has only 3 children, never a 10th) must resolve null — walking off the tree must never throw or silently pick a nearby element')

  const wrongSnippet = Object.assign({}, region, { anchor: Object.assign({}, region.anchor, { snippet: 'this text never appeared anywhere in the section' }) })
  assert.strictEqual(resolve(original.root, wrongSnippet), null,
    'a snippet that no longer matches the found element\'s own text must resolve null — a same-shaped element that now holds different content is not the same anchor')

  const zeroRoot = makeNode('DIV', rect(0, 0, 100, 100), '')
  const zeroEl = makeNode('SECTION', rect(0, 0, 0, 50), '')
  attach(zeroRoot, zeroEl)
  const zeroRegion = Object.assign({}, region, { anchor: { path: [0], tag: 'section', snippet: '' } })
  assert.strictEqual(resolve(zeroRoot, zeroRegion), null,
    'an anchor element with a zero-area rect must resolve null — a box can never be drawn against an element that occupies no space')
})
