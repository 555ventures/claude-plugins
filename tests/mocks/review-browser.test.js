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
