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

// q241 — recount()'s own show/hide/text branches for the whole-product waiting line. The served
// bytes and recount() build the same sentence, so a test that only renders and runs proves
// nothing: each pin below seeds the element into the WRONG state (hidden flipped, text replaced)
// before the script's start-up recount() runs, so only a recount that actually re-derives the
// branch can turn it green.

function scopedFixtureHtml(scopedOpen, openProjectCount) {
  const seed = {
    product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }, { label: 'b', states: [] }] }],
  }
  const notes = [
    { id: 'm1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: scopedOpen ? 'open' : 'resolved', text: 'on a', reason: 'other' },
  ]
  for (let i = 0; i < openProjectCount; i++) {
    notes.push({ id: 'p' + i, kind: 'note', scope: 'project', screen: null, state: null, status: 'open', text: 'proj ' + i, reason: 'other' })
  }
  const stop = {
    id: 'P001', kind: 'approve', key: 'journey-approved:j1', title: 'Approve j1', question: null,
    candidates: [], url: null, openedAt: new Date().toISOString(), status: 'open', decision: null, previous: [],
  }
  return buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [stop], prefix: '' })
}

// Replaces the served rv-projwait element with one in the given state, so the assertion after
// recount() discriminates a real re-derivation from the server's own bytes surviving untouched.
function seedProjwait(html, { hidden, text }) {
  const re = /<p class="rv-projwait" data-rv="projwait"[^>]*>[^<]*<\/p>/
  assert.match(html, re, 'the fixture must serve an rv-projwait element to seed')
  return html.replace(re, '<p class="rv-projwait" data-rv="projwait"' + (hidden ? ' hidden' : '') + '>SEEDED</p>')
}

test('q241: resolving the journey\'s last scoped note reveals the hidden waiting line in place — recount() unhides it and writes the live count, with no reload', () => {
  // Served state: journey clean, two project notes open → the element exists and is shown. Seed it
  // hidden with placeholder text, exactly as it arrives while a scoped note is still open.
  const html = seedProjwait(scopedFixtureHtml(false, 2), { hidden: true, text: 'SEEDED' })
  const { document } = runReviewBrowser(html)

  const projwait = document.querySelector('[data-rv="projwait"]')
  assert.ok(projwait, 'the element must survive into the parsed page')
  assert.strictEqual(projwait.hidden, false, 'with no scoped item open, recount() must unhide the waiting line rather than leave it as served')
  assert.strictEqual(projwait.textContent, '2 whole-product notes still block sign-off',
    'recount() must rewrite the text from the live row counts, not leave the seeded placeholder')
})

test('q241: while a scoped note is still open, recount() hides the waiting line and leaves its text alone', () => {
  // Served state: one scoped note open, one project note open → the element exists but hidden.
  // Seed it visible, so only a recount that re-derives the branch can hide it again.
  const html = seedProjwait(scopedFixtureHtml(true, 1), { hidden: false, text: 'SEEDED' })
  const { document } = runReviewBrowser(html)

  const projwait = document.querySelector('[data-rv="projwait"]')
  assert.ok(projwait, 'the element must be served (hidden) even while the journey has open items')
  assert.strictEqual(projwait.hidden, true, 'an open scoped item must keep the waiting line hidden — the approve button is what blocks there')
  // The flat-DOM shim carries no parsed text, so an untouched element has no textContent at all;
  // a hidden branch that wrongly wrote a count would leave a string here instead.
  assert.strictEqual(projwait.textContent, undefined,
    'the hidden branch must not rewrite the text — only the shown branch states a count')
})
