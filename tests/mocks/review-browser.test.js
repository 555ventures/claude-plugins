'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')
const { SPEC, ROOT, read, parseFlatDom } = require('../helpers')

// specs/20260912/06-the-review-page-answers-to-a-design.md D5, D10 — AC-20260912-06-6, -10, -11.
// review.browser.js is a browser script (no require/module.exports — the file's own header), so
// it is run under vm over the flat-DOM shim, exactly as the spec's "AC-6 harness contract" build
// note requires.

const { buildReviewPage } = require(path.join(SPEC, 'scripts/lib/review-page.js'))
const REVIEW_BROWSER = path.join(SPEC, 'scripts/lib/review.browser.js')
const VIEWER_CSS = path.join(SPEC, 'templates/mocks/viewer.css')
const DESIGN_ATLAS_TEST = path.join(ROOT, 'tests/design-atlas.test.js')

// The AC-1 fixture, shared with tests/mocks/review-page.test.js: journey j1, screens a (states:
// empty) and b, one open mock note on a, one addressed mock note on b, one open project note.
function fixtureHtml() {
  const seed = {
    product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: ['empty'] }, { label: 'b', states: [] }] }],
  }
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'open on a', reason: 'other' },
    { id: 'n2', kind: 'note', scope: 'mock', screen: 'b', state: null, status: 'addressed', addressed: { change: 'did it' }, text: 'addr on b', reason: 'other' },
    { id: 'n3', kind: 'note', scope: 'project', screen: null, state: null, status: 'open', text: 'proj open', reason: 'other' },
  ]
  return buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [], prefix: '' })
}

// Runs review.browser.js under vm over the fixture's own served markup (parsed by the shared
// flat-DOM shim), with a stubbed fetch, a localStorage already holding the reviewer's name (so no
// window.prompt is ever reached), and a fake IntersectionObserver whose registered callback is
// handed back so the caller can fire it directly (headless — no real intersection geometry exists
// in this shim).
function runReviewBrowser(html) {
  const { document } = parseFlatDom(html)
  const fetchCalls = []
  const sandbox = {
    location: { pathname: '/review/j1.html', search: '' },
    document,
    window: { prompt: () => 'jj', addEventListener() {} },
    localStorage: { getItem: (k) => (k === 'nl-author' ? 'jj' : null), setItem() {} },
    fetch(url, opts) {
      fetchCalls.push({ url, opts })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    },
    setTimeout, clearTimeout,
    IntersectionObserver: function (cb) {
      this.observe = function () {}
      this.unobserve = function () {}
      this.disconnect = function () {}
      sandbox.__ioCallback = cb
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(REVIEW_BROWSER, 'utf8'), sandbox)
  return {
    document,
    fetchCalls,
    fireIntersection(label, ratio) {
      const board = document.querySelector('[data-rv="board"][data-label="' + label + '"]')
      sandbox.__ioCallback([{ target: board, intersectionRatio: ratio }])
    },
  }
}

test('AC-20260912-06-6: the eye-tracking IntersectionObserver moves data-focus and narrows the inspector, Looks good posts /__notes/resolve, and the ten orphaned design-atlas.test.js helpers are gone', () => {
  const html = fixtureHtml()
  const { document, fetchCalls, fireIntersection } = runReviewBrowser(html)

  assert.strictEqual(document.querySelector('[data-rv="board"][data-label="a"]').hasAttribute('data-focus'), true,
    'before any intersection fires, the page\'s own server-rendered focus (screen a, the first open item) must stand')

  fireIntersection('b', 1)

  assert.strictEqual(document.querySelector('[data-rv="board"][data-label="a"]').hasAttribute('data-focus'), false,
    'once b reports full intersection ratio, focus must move OFF a\'s board')
  assert.strictEqual(document.querySelector('[data-rv="board"][data-label="b"]').hasAttribute('data-focus'), true,
    'once b reports full intersection ratio, focus must move ONTO b\'s board — the composer\'s scope follows the eye')
  assert.strictEqual(document.querySelector('[data-rv="row"][data-id="n1"]').hidden, true,
    'a\'s row (n1) must be hidden from the inspector once the reviewer\'s focus has moved to b — the ' +
    'inspector narrows to the focused screen, else a note typed here could be misfiled against the wrong one')
  assert.strictEqual(document.querySelector('[data-rv="row"][data-id="n2"]').hidden, false,
    'b\'s row (n2, the addressed note) must stay visible once b is focused')

  const acceptBtn = document.querySelector('[data-rv="row"][data-id="n2"] [data-rv="accept"]')
  assert.ok(acceptBtn, 'the addressed row must carry a [data-rv="accept"] button to click')
  acceptBtn._handlers.click[0]()
  const resolveCalls = fetchCalls.filter((c) => c.url === '/__notes/resolve')
  assert.strictEqual(resolveCalls.length, 1, 'clicking Looks good must POST exactly once to /__notes/resolve: got ' + resolveCalls.length + ' calls')
  const body = JSON.parse(resolveCalls[0].opts.body)
  assert.strictEqual(body.id, 'n2', 'the resolve POST body must name the accepted note\'s id')
  assert.strictEqual(body.by, 'jj', 'the resolve POST body must carry the reviewer\'s identity')

  const src = read('tests/design-atlas.test.js')
  for (const name of ['makeNotesLayerDom', 'evalNotesLayer', 'writeReviewSeed', 'writePicksJson',
    'hashTree', 'loadShellRegion', 'writeKitFile', 'writeKitMock', 'kitCanonHtml', 'cssRuleBody']) {
    const count = (src.match(new RegExp(name, 'g')) || []).length
    assert.strictEqual(count, 0,
      name + ' must have zero occurrences left in tests/design-atlas.test.js (D5) — it was orphaned ' +
      'scaffolding the 2026-09-11 expiry sweep deleted the test() body of but not the helper itself: got ' + count)
  }
})

test('AC-20260912-06-10: review.browser.js and viewer.css carry zero occurrences of the retired composer scope toggle (scopeMode, data-rv="scope", rv-scope-on, and .rv-scope as a complete class name)', () => {
  const browserSrc = read('spec/scripts/lib/review.browser.js')
  const viewerSrc = read('spec/templates/mocks/viewer.css')
  const combined = browserSrc + '\n' + viewerSrc
  // D10a: `.rv-scope` is banned as a COMPLETE class name, never as a substring — D4's
  // `.rv-scopeband` / `.rv-scopeband-label`, which this same spec adds and AC-20260912-06-3 pins,
  // carry it as a prefix. The negative lookahead is the whole difference.
  const patterns = [/scopeMode/, /data-rv="scope"/, /rv-scope-on/, /\.rv-scope(?![\w-])/]
  for (const pattern of patterns) {
    assert.doesNotMatch(combined, pattern,
      'D10 deletes the composer\'s vestigial scope machinery entirely — renderComposer emits no ' +
      '[data-rv="scope"], so scopeMode\'s ternary has one reachable arm and the CSS/wiring for it is ' +
      'dead weight a later reader could mistake for a live control: found the retired literal ' +
      String(pattern) + ' still present')
  }
})

test('AC-20260912-06-11: sending a note with screen b focused files it scope "mock" screen "b" — the focused-screen behavior D10 leaves unchanged', () => {
  const html = fixtureHtml()
  const { document, fetchCalls, fireIntersection } = runReviewBrowser(html)
  fireIntersection('b', 1)

  const ta = document.querySelector('[data-rv="text"]')
  assert.ok(ta, 'the composer must render a [data-rv="text"] textarea')
  ta.value = 'hi'
  const sendBtn = document.querySelector('[data-rv="send"]')
  assert.ok(sendBtn, 'the composer must render a [data-rv="send"] button')
  sendBtn._handlers.click[0]({ preventDefault() {} })

  const addCalls = fetchCalls.filter((c) => c.url === '/__notes/add')
  assert.strictEqual(addCalls.length, 1, 'Send must POST exactly once to /__notes/add: got ' + addCalls.length)
  const body = JSON.parse(addCalls[0].opts.body)
  assert.strictEqual(body.scope, 'mock', 'a note sent with a screen focused must file scope "mock" — D10 removes only the dead toggle, never this behavior')
  assert.strictEqual(body.screen, 'b', 'a note sent with b focused must file against screen "b"')
  assert.strictEqual(body.text, 'hi', 'the note body must carry the composer\'s own text')
})
