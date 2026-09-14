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

const reviewPageLib = require(path.join(SPEC, 'scripts/lib/review-page.js'))
const { buildReviewPage } = reviewPageLib
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
function runReviewBrowser(html, pathname) {
  const { document } = parseFlatDom(html)
  const fetchCalls = []
  const sandbox = {
    location: { pathname: pathname || '/review/j1.html', search: '' },
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

// specs/20260913/05-a-note-is-a-conversation.md D6 — AC-20260913-05-3, -10. review.browser.js
// carries no reply/accept/reject wiring today (its rows only ever post to /__notes/add and
// /__notes/resolve|reopen through the old addressed-only card, never from the row itself), so
// every selector below is unreachable in the pre-image.

function twoRowFixtureHtml() {
  const seed = {
    product: 'Product', viewportWidth: 1280, viewportHeight: 800,
    journeys: [{ name: 'j1', title: 'J1', screens: [{ label: 'a', states: [] }] }],
  }
  const notes = [
    { id: 'n1', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'open', text: 'open on a', reason: 'other' },
    { id: 'n2', kind: 'note', scope: 'mock', screen: 'a', state: null, status: 'addressed', addressed: { change: 'did it' }, text: 'addr on a', reason: 'other' },
  ]
  return buildReviewPage({ journey: 'j1', seed, notes, ledger: [], stops: [], prefix: '' })
}

test('AC-20260913-05-3: clicking a row\'s Reply control then sending non-empty text posts to /__notes/reopen exactly once with that text, and sending an empty box posts nothing', () => {
  const html = twoRowFixtureHtml()
  const { document, fetchCalls } = runReviewBrowser(html)

  const replyBtn = document.querySelector('[data-rv="row"][data-id="n1"] [data-rv="reply"]')
  assert.ok(replyBtn, 'the row must render a [data-rv="reply"] control that unhides the reply box — none found: D6\'s row-level Reply is not built yet')
  replyBtn._handlers.click[0]({ preventDefault() {} })

  const textEl = document.querySelector('[data-rv="row"][data-id="n1"] [data-rv="reply-text"]')
  assert.ok(textEl, 'the row must carry a [data-rv="reply-text"] textarea once unhidden')
  const sendBtn = document.querySelector('[data-rv="row"][data-id="n1"] [data-rv="reply-send"]')
  assert.ok(sendBtn, 'the row must carry a [data-rv="reply-send"] button')

  textEl.value = 'still wrong'
  sendBtn._handlers.click[0]({ preventDefault() {} })
  const reopenCalls = fetchCalls.filter((c) => c.url === '/__notes/reopen')
  assert.strictEqual(reopenCalls.length, 1,
    'clicking reply-send with non-empty text must POST to /__notes/reopen exactly once: got ' + reopenCalls.length)
  const body = JSON.parse(reopenCalls[0].opts.body)
  assert.strictEqual(body.text, 'still wrong', 'the posted body\'s text must be the box\'s own text: got ' + JSON.stringify(body))

  textEl.value = ''
  sendBtn._handlers.click[0]({ preventDefault() {} })
  assert.strictEqual(fetchCalls.filter((c) => c.url === '/__notes/reopen').length, 1,
    'clicking reply-send with an empty box must post nothing — the count must stay at 1: got ' +
    fetchCalls.filter((c) => c.url === '/__notes/reopen').length)
})

test('AC-20260913-05-10: clicking one row\'s accept control and another row\'s reject control post to /__notes/resolve with verdict accepted and withdrawn respectively', () => {
  const html = twoRowFixtureHtml()
  const { document, fetchCalls } = runReviewBrowser(html)

  const acceptBtn = document.querySelector('[data-rv="row"][data-id="n1"] [data-rv="accept"]')
  assert.ok(acceptBtn, 'the n1 row must carry a [data-rv="accept"] control (Approve): none found')
  acceptBtn._handlers.click[0]({ preventDefault() {} })

  const rejectBtn = document.querySelector('[data-rv="row"][data-id="n2"] [data-rv="reject"]')
  assert.ok(rejectBtn, 'the n2 row must carry a [data-rv="reject"] control (Reject): none found')
  rejectBtn._handlers.click[0]({ preventDefault() {} })

  const resolveCalls = fetchCalls.filter((c) => c.url === '/__notes/resolve')
  assert.strictEqual(resolveCalls.length, 2, 'both clicks must post to /__notes/resolve, exactly twice: got ' + resolveCalls.length)
  const bodies = resolveCalls.map((c) => JSON.parse(c.opts.body))
  assert.strictEqual(bodies[0].verdict, 'accepted', 'the accept control must post verdict:"accepted": got ' + JSON.stringify(bodies[0]))
  assert.strictEqual(bodies[1].verdict, 'withdrawn', 'the reject control must post verdict:"withdrawn": got ' + JSON.stringify(bodies[1]))
})

// specs/20260913/06-every-mock-has-a-page-you-can-mark.md D2, AC-20260913-06-8: review.browser.js
// runs unmodified on lib/review-page.js's new buildScreenPage output (A3: no journey rail, no
// approve control) — the one board it renders carries data-focus (D2: focused true), so send()'s
// existing focusedLabel()/scopeLabel logic files the composer's note as scope "mock" against that
// screen with no code path change at all. buildScreenPage does not exist on the pre-image
// (review-page.js exports only buildReviewPage/statesOf/viewportOf), so this throws red.
test('AC-20260913-06-8: on the screen page for a, typing hi into the composer and clicking Send posts to /__notes/add exactly once with scope "mock", screen "a", text "hi"', () => {
  assert.strictEqual(typeof reviewPageLib.buildScreenPage, 'function',
    'lib/review-page.js must export buildScreenPage({label, src, states, product, viewportWidth, viewportHeight, notes, prefix}) — D1/D2')
  const html = reviewPageLib.buildScreenPage({
    label: 'a', src: 'mocks/a.html', states: [], product: 'Product',
    viewportWidth: 1280, viewportHeight: 800, notes: [], prefix: '',
  })
  const { document, fetchCalls } = runReviewBrowser(html, '/screen/a.html')

  const ta = document.querySelector('[data-rv="text"]')
  assert.ok(ta, 'the screen page\'s composer must render a [data-rv="text"] textarea')
  ta.value = 'hi'
  const sendBtn = document.querySelector('[data-rv="send"]')
  assert.ok(sendBtn, 'the screen page\'s composer must render a [data-rv="send"] button')
  sendBtn._handlers.click[0]({ preventDefault() {} })

  const addCalls = fetchCalls.filter((c) => c.url === '/__notes/add')
  assert.strictEqual(addCalls.length, 1, 'Send must POST exactly once to /__notes/add: got ' + addCalls.length)
  const body = JSON.parse(addCalls[0].opts.body)
  assert.strictEqual(body.scope, 'mock', 'the screen page has one focused board, so the posted note must file scope "mock": got ' + JSON.stringify(body))
  assert.strictEqual(body.screen, 'a', 'the posted note must file against screen "a": got ' + JSON.stringify(body))
  assert.strictEqual(body.text, 'hi', 'the posted note must carry the composer\'s own text: got ' + JSON.stringify(body))
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
