'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { SPEC, read } = require('../helpers')

// specs/20260910/03-client-journey-player.md D1 (spec/scripts/lib/walk-page.js's
// buildClientIndex/buildWalkPage) and D3 (spec/scripts/lib/walk.browser.js) do not exist yet —
// every test below is red until they land. Gotcha (require() throwing at file-load time would
// abort every test in this file before node:test can report per-test failures): walk-page.js is
// require()d inside a try/catch, the same guard tests/mocks/client-route.test.js uses for
// lib/client-capture.js. AC-20260910-03-1, -2, -3.

let walkPageLib
try {
  // eslint-disable-next-line global-require
  walkPageLib = require('../../spec/scripts/lib/walk-page')
} catch (e) {
  const reason = 'spec/scripts/lib/walk-page.js does not exist yet (D1): ' + e.message
  walkPageLib = {
    buildClientIndex: () => { throw new Error(reason) },
    buildWalkPage: () => { throw new Error(reason) },
  }
}
const { buildClientIndex, buildWalkPage } = walkPageLib

const NOW = '2026-09-10T00:00:00.000Z'

function question(id, screen, ledgerId, extra) {
  return Object.assign({
    id, scope: 'mock', screen, state: null, text: 'a claim', by: 'session', at: NOW,
    status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    kind: 'question', ledgerId, answer: null,
  }, extra)
}
function ledgerRow(id, extra) {
  return Object.assign({
    id, step: 'WIREFRAMES', kind: 'product', claim: 'a claim', tag: 'inferred', status: 'open',
    rejected: null, dependents: null, note: null,
  }, extra)
}

// ---------------------------------------------------------------------------
// Minimal flat-DOM shim for walk.browser.js — tailored to the D3 contract's own surface
// (querySelector/querySelectorAll over compound attribute selectors, closest, getAttribute/
// setAttribute, a settable `src`, `hidden`, and per-node click/message-style event handlers).
// Same jsdom-free `vm` shim discipline as lib/review.browser.js's and lib/walk-mode.browser.js's
// own test harnesses — never innerHTML parsing or getBoundingClientRect.
// ---------------------------------------------------------------------------
function parseFlatDom(html) {
  function parseAttrs(str) {
    const attrs = {}
    const re = /([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g
    let m
    while ((m = re.exec(str))) attrs[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : '')
    return attrs
  }
  function matchesCompound(node, compound) {
    const tagM = compound.match(/^([a-zA-Z][\w-]*)/)
    const tag = tagM && tagM[1]
    if (tag && node.tagName !== tag.toUpperCase()) return false
    const rest = tag ? compound.slice(tag.length) : compound
    const attrRe = /\[([a-zA-Z_:][-\w:.]*)(?:="([^"]*)")?\]/g
    let m
    while ((m = attrRe.exec(rest))) {
      if (!node.hasAttribute(m[1])) return false
      if (m[2] !== undefined && node.getAttribute(m[1]) !== m[2]) return false
    }
    // D16 repair: walk.browser.js's own withdraw handler selects its status line by class
    // (`.wk-req-status`) — every prior test in this shim only ever needed tag+bracket-attribute
    // compounds, so `.class` tokens were never matched at all (silently matching every node, the
    // classic "no selector text left to check" shim bug). Real class-list matching, added here
    // rather than in the shim's caller, since it is a gap in the shim's own contract.
    const classRe = /\.([-\w]+)/g
    while ((m = classRe.exec(rest))) {
      const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)
      if (!classes.includes(m[1])) return false
    }
    return true
  }
  const allNodes = []
  function descendants(node) {
    const out = []
    for (const c of node.children) { out.push(c); out.push(...descendants(c)) }
    return out
  }
  function queryAll(scopeNode, sel) {
    const parts = sel.trim().split(/\s+/)
    const pool = scopeNode === null ? allNodes : descendants(scopeNode)
    let matched = pool.filter((n) => matchesCompound(n, parts[0]))
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      const next = []
      for (const n of pool) {
        if (!matchesCompound(n, part)) continue
        let anc = n.parentNode
        let ok = false
        while (anc) { if (matched.includes(anc)) { ok = true; break } anc = anc.parentNode }
        if (ok) next.push(n)
      }
      matched = next
    }
    return matched
  }
  function makeNode(tagName, attrs) {
    const node = {
      tagName: tagName.toUpperCase(), attrs, children: [], parentNode: null, value: '', _handlers: {},
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
      setAttribute(k, v) { this.attrs[k] = String(v) },
      removeAttribute(k) { delete this.attrs[k] },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
      addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn) },
      closest(sel) { let n = this; while (n) { if (matchesCompound(n, sel.trim())) return n; n = n.parentNode } return null },
      querySelector(sel) { return queryAll(this, sel)[0] || null },
      querySelectorAll(sel) { return queryAll(this, sel) },
      click() { for (const h of (this._handlers.click || [])) h({ target: this, preventDefault() {} }) },
      submit() { for (const h of (this._handlers.submit || [])) h({ target: this, preventDefault() {} }) },
      // AC-20260911-06-24: walk.browser.js's mark handler calls whyEl.focus() on first press —
      // no-op here, the shim has no real focus concept to assert against.
      focus() {},
    }
    Object.defineProperty(node, 'hidden', {
      get() { return this.hasAttribute('hidden') },
      set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden') },
    })
    Object.defineProperty(node, 'src', {
      get() { return this.getAttribute('src') },
      set(v) { this.setAttribute('src', v) },
    })
    return node
  }
  const root = makeNode('#root', {})
  const stack = [root]
  const tagRe = /<(\/)?([a-zA-Z][\w-]*)((?:[^<>])*?)(\/)?>/g
  const VOID = new Set(['input', 'br', 'img', 'link', 'meta', 'hr'])
  let m
  while ((m = tagRe.exec(html))) {
    const closing = !!m[1]
    const tagName = m[2]
    const selfClose = !!m[4] || VOID.has(tagName.toLowerCase())
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) { if (stack[i].tagName === tagName.toUpperCase()) { stack.length = i; break } }
      continue
    }
    const node = makeNode(tagName, parseAttrs(m[3]))
    node.parentNode = stack[stack.length - 1]
    stack[stack.length - 1].children.push(node)
    allNodes.push(node)
    if (!selfClose) stack.push(node)
  }
  return {
    querySelector(sel) { return queryAll(null, sel)[0] || null },
    querySelectorAll(sel) { return queryAll(null, sel) },
  }
}

// A thin wrapper over runWalkBrowserRouted (below): an empty routeStub defaults every route to
// {ok:true}, the exact sandbox this needs, so the two functions share one sandbox-construction
// block instead of each carrying their own.
function runWalkBrowser(html, stateStub) {
  return runWalkBrowserRouted(html, stateStub, {})
}

// ---------------------------------------------------------------------------
// specs/20260911/01-the-page-waits-for-the-server.md D1 (STRINGS flattens, stringsFor and the
// `lang` param are deleted), D2 (design-atlas.js stops reading/passing lang — this file only
// pins that the builders ignore it even if a caller still passes one), D3 (the [data-wk="msg"]
// slot) and D4 (walk.browser.js acts only on the server's answer). Unbuilt: every test below is
// red against the pre-image walk-page.js/walk.browser.js. AC-20260911-01-1, -2, -3, -4, -5, -6,
// -8, -10.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// D4 harness: like runWalkBrowser above, but lets each POST route resolve per-call rather than
// always {ok:true} — needed to exercise D4's non-ok/rejected-fetch paths. A5: the existing vm
// sandbox's stub/microtask discipline is reused; only the per-route response is new.
// ---------------------------------------------------------------------------
function runWalkBrowserRouted(html, stateStub, routeStub) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
  const document = parseFlatDom(html)
  const posts = []
  const messageHandlers = []
  const sandbox = {
    document,
    window: {
      prompt: () => { throw new Error('D3: window.prompt must never be called — the client route never asks for an author name') },
      addEventListener(type, fn) { if (type === 'message') messageHandlers.push(fn) },
    },
    location: { pathname: '/client/walk/onboarding.html', origin: 'http://localhost:5173' },
    fetch(url, init) {
      if (String(url).includes('/client/__walk/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(stateStub) })
      }
      posts.push({ url: String(url), init })
      const key = Object.keys(routeStub || {}).find((k) => String(url).includes(k))
      const resp = key ? routeStub[key] : { ok: true }
      if (resp === 'reject') return Promise.reject(new Error('network down'))
      return Promise.resolve(Object.assign({ json: () => Promise.resolve({}) }, resp))
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  const fireMessage = async (data) => {
    for (const h of messageHandlers) h({ data })
    await flush()
  }
  return { document, posts, fireMessage }
}

async function flush(n = 6) { for (let i = 0; i < n; i++) await Promise.resolve() }

// Shared setup for the AC-4/5/6/8 harness tests below — one onboarding-shaped seed builder, one
// open-question-notes/ledger builder, and one buildWalkPage+runWalkBrowserRouted+initial-flush
// combinator, replacing what were near-identical copy-pasted blocks across those four tests
// (dup-windows repair round: the copy-paste, not any single one of these tests, was the finding).
function onboardingSeed(screens) {
  return { product: 'Hearwell', journeys: [{ name: 'onboarding', title: 'Onboarding', screens }] }
}
function openQuestions(n, screen = 'signin') {
  const notes = []
  const ledger = []
  for (let i = 1; i <= n; i++) {
    notes.push(question('N00' + i, screen, 'W' + i))
    ledger.push(ledgerRow('W' + i))
  }
  return { notes, ledger }
}
async function walkThroughRouted({ screens, notes = [], ledger = [], reached = [], routes = {} }) {
  const seed = onboardingSeed(screens)
  const html = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: { journeys: {} }, prefix: '' })
  const harness = runWalkBrowserRouted(html, { reached, misses: [], confirmedAt: null, sentence: null }, routes)
  await flush()
  return harness
}

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D1/D4/D5/D6 — journeyState-driven index/walk-page
// rendering (D4/D5) and the client's own return-leg controls (D6). Unbuilt against the
// pre-image: buildClientIndex renders no composer/request list at all, buildWalkPage renders no
// request cards at all, and walk.browser.js's index-page handlers do not exist (the script
// no-ops on a page with no `[data-journey]` root). Every test below is red until D4/D5/D6 land.
// AC-20260911-06-6, -7, -8, -9.
// ---------------------------------------------------------------------------

// A client-origin, non-question, non-walk note (kind absent) — the shape D4/D5's request lists
// and D6's controls all act on. Distinct from question()'s session-authored, kind:"question" shape
// already defined above.
function clientNote(overrides) {
  return Object.assign({
    id: 'N000', scope: 'mock', screen: null, state: null, text: 'a client note', by: 'client',
    at: NOW, status: 'open', addressed: null, reply: null, resolvedBy: null, resolvedAt: null,
    origin: 'client',
  }, overrides)
}

// Same vm-shim discipline as runWalkBrowserRouted, over the CLIENT INDEX page instead of a walk
// page — the index carries no `[data-journey]` root and never fetches `/client/__walk/state`, so
// this is a thinner sandbox than runWalkBrowserRouted's, not a copy of its walk-only wiring.
function runIndexBrowser(html, routeStub) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
  const document = parseFlatDom(html)
  const posts = []
  const sandbox = {
    document,
    window: { addEventListener() {} },
    location: { pathname: '/client/index.html', origin: 'http://localhost:5173' },
    fetch(url, init) {
      posts.push({ url: String(url), init })
      const key = Object.keys(routeStub || {}).find((k) => String(url).includes(k))
      const resp = key ? routeStub[key] : { ok: true }
      if (resp === 'reject') return Promise.reject(new Error('network down'))
      return Promise.resolve(Object.assign({ json: () => Promise.resolve({}) }, resp))
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  return { document, posts }
}

// D23 decides the fork D20 left open: Send is the composer's real `<form>` submit, never also a
// button click handler (one click must post exactly once in a real browser). Under this flat-DOM
// shim a button click does not itself dispatch a `submit` event on its form (there is no real
// layout/DOM-spec engine here), so the single real path is exercised by submitting the form node
// directly — the same node walk.browser.js's own `on(askForm, 'submit', submitAsk)` listens on.
function clickSend(askRoot) {
  const form = askRoot.querySelector('form') || askRoot
  form.submit()
}

test('AC-20260911-06-6: buildClientIndex renders a journey\'s derived state, the "something missing?" composer, and every client request with its own status line and controls, newest first, session-origin excluded', () => {
  const seed = { product: 'Hearwell', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'invite', states: [] }] }] }
  const notes = [
    clientNote({
      id: 'N006', scope: 'project', text: 'An old request', status: 'resolved', resolution: 'accepted',
      at: '2026-09-01T00:00:00.000Z',
    }),
    clientNote({
      id: 'N003', scope: 'mock', screen: 'invite', text: 'Says Submit, not Send', status: 'open',
      at: '2026-09-05T00:00:00.000Z',
    }),
    clientNote({
      id: 'N005', scope: 'project', text: 'No password reset screen', status: 'addressed',
      addressed: { at: '2026-09-10T00:00:00.000Z', change: 'Added the reset screen', ledgerRow: null, journey: 'onboarding' },
      at: '2026-09-10T00:00:00.000Z',
    }),
    Object.assign(clientNote({ id: 'N009', scope: 'project', text: 'a session note', status: 'open' }), { origin: 'session' }),
  ]
  const html = buildClientIndex({ seed, notes, ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })

  assert.match(html, /data-state="changes-requested"/,
    'AC-6: a journey with an open client mock-scope note must carry data-state="changes-requested" — journeyState-driven rendering is unbuilt: got\n' + html)
  assert.match(html, /Changes requested \(1\)/,
    'AC-6: the row must render the count-bearing state text "Changes requested (1)": got\n' + html)

  // D20 relocation (2026-09-11 redesign): the composer's data-cl="ask" moved from a bare <form>
  // onto a collapsed <details> wrapper (AC-20) — the textarea/chip assertions below are the same
  // AC-6 coverage, just captured off the new wrapper tag, never weakened.
  const askMatch = /<details[^>]*data-cl="ask"[\s\S]*?<\/details>/.exec(html)
  assert.ok(askMatch, 'AC-6: buildClientIndex must render <details data-cl="ask"> (the "Something missing?" composer): got\n' + html)
  assert.match(askMatch[0], /<textarea/, 'AC-6: the composer must carry a textarea: got\n' + askMatch[0])
  const chips = [...askMatch[0].matchAll(/data-cl="reason"[^>]*data-value="([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepStrictEqual(chips, ['missing-screen', 'other'],
    'AC-6: the composer must carry exactly the two reason chips missing-screen/other: got ' + JSON.stringify(chips))

  const sectionMatch = /<section[^>]*data-cl="requests"[\s\S]*?<\/section>/.exec(html)
  assert.ok(sectionMatch, 'AC-6: buildClientIndex must render <section data-cl="requests">: got\n' + html)
  const articles = [...sectionMatch[0].matchAll(/<article[^>]*data-cl="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  assert.strictEqual(articles.length, 3,
    'AC-6: exactly three requests must render (N005, N003, N006) — the session-origin N009 must never appear: got ' + articles.length + ' in\n' + sectionMatch[0])

  assert.match(articles[0], /data-id="N005"/, 'AC-6: the newest request (N005) must render first: got\n' + articles[0])
  assert.match(articles[0], /data-status="addressed"/, 'AC-6: N005 must carry data-status="addressed": got\n' + articles[0])
  assert.match(articles[0], /Done: Added the reset screen/, 'AC-6: an addressed request must read "Done: <change>": got\n' + articles[0])
  assert.match(articles[0], /href="\/client\/walk\/onboarding\.html"/, 'AC-6: an addressed request resolving to a journey must link to it: got\n' + articles[0])
  assert.match(articles[0], /data-cl="accept"/, 'AC-6: an addressed request must carry the accept control: got\n' + articles[0])
  assert.match(articles[0], /data-cl="reopen"/, 'AC-6: an addressed request must carry the reopen control: got\n' + articles[0])
  assert.match(articles[0], /data-cl="reopen-text"/, 'AC-6: an addressed request must carry the reopen textarea: got\n' + articles[0])

  assert.match(articles[1], /data-id="N003"/, 'AC-6: the second-newest request (N003) must render second: got\n' + articles[1])
  assert.match(articles[1], /We'll look at this/, 'AC-6: an open request must read "We\'ll look at this": got\n' + articles[1])
  assert.doesNotMatch(articles[1], /data-cl="accept"/, 'AC-6: an open request must carry no accept control: got\n' + articles[1])

  assert.match(articles[2], /data-id="N006"/, 'AC-6: the oldest request (N006) must render last: got\n' + articles[2])
  assert.match(articles[2], /Closed — thank you/, 'AC-6: a resolved/accepted request must read "Closed — thank you": got\n' + articles[2])

  assert.match(html, /data-wk="msg"[^>]*data-saved="Saved\. We'll fix this and let you know here\."/,
    'AC-6: the shared msg slot must carry data-saved="Saved. We\'ll fix this and let you know here.": got\n' + html)
})

test('AC-20260911-06-7: buildWalkPage renders one request card per client note on the journey, and the approve lead/disabled state and read-only confirmed render all follow the derived journey state', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const addressedNote = clientNote({
    id: 'N003', scope: 'mock', screen: 'invite', text: 'Says Submit', status: 'addressed',
    addressed: { at: NOW, change: 'Button now says Send', ledgerRow: null },
  })
  const openNote = clientNote({ id: 'N003', scope: 'mock', screen: 'invite', text: 'Says Submit', status: 'open' })
  const resolvedNote = clientNote({ id: 'N003', scope: 'mock', screen: 'invite', text: 'Says Submit', status: 'resolved' })
  const confirmedWalk = { journeys: { onboarding: { reached: [], misses: [], confirmedAt: NOW, sentence: 'Looks right', waived: null } } }

  const htmlA = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const reqMatch = /<article[^>]*data-wk="request"[\s\S]*?<\/article>/.exec(htmlA)
  assert.ok(reqMatch, 'AC-7: buildWalkPage must render [data-wk="request"] for a client note on this journey — D5 is unbuilt: got\n' + htmlA)
  assert.match(reqMatch[0], /data-id="N003"/, 'AC-7: the request card must carry data-id="N003": got\n' + reqMatch[0])
  assert.match(reqMatch[0], /data-label="invite"/, 'AC-7: the request card must carry data-label="invite": got\n' + reqMatch[0])
  assert.match(reqMatch[0], /data-status="addressed"/, 'AC-7: the request card must carry data-status="addressed": got\n' + reqMatch[0])
  assert.match(reqMatch[0], /Fixed: Button now says Send/, 'AC-7: an addressed request card must read "Fixed: <change>": got\n' + reqMatch[0])
  assert.match(reqMatch[0], /data-wk="accept"/, 'AC-7: an addressed request card must carry the accept control: got\n' + reqMatch[0])
  assert.match(reqMatch[0], /data-wk="reopen"/, 'AC-7: an addressed request card must carry the reopen control: got\n' + reqMatch[0])
  assert.match(htmlA, /We fixed what you asked\. Check the screens marked Fixed, then confirm\./,
    'AC-7: the "fixed" approve lead must read exactly this sentence: got\n' + htmlA)
  assert.match(htmlA, /data-wk="confirm"[^>]*disabled/,
    'AC-7: confirm must stay disabled while the journey is "fixed": got\n' + htmlA)

  const htmlB = buildWalkPage({ seed, journey: 'onboarding', notes: [openNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  assert.match(htmlB, /You asked for changes\. We'll fix them and let you know\./,
    'AC-7: the "changes-requested" approve lead must read exactly this sentence: got\n' + htmlB)

  const htmlC = buildWalkPage({ seed, journey: 'onboarding', notes: [resolvedNote], ledger: [], walk: confirmedWalk, prefix: '' })
  assert.match(htmlC, /You confirmed this journey\./,
    'AC-7: a confirmed journey with no open/addressed request (state "ok") must render the read-only confirmed section: got\n' + htmlC)

  const htmlD = buildWalkPage({ seed, journey: 'onboarding', notes: [openNote], ledger: [], walk: confirmedWalk, prefix: '' })
  assert.doesNotMatch(htmlD, /You confirmed this journey\./,
    'AC-7: confirmedAt set but an OPEN request outranks it (state "changes-requested") — the confirmed render must not show: got\n' + htmlD)
})

test('AC-20260911-06-8: under the vm shim, the client index\'s ask form posts a project-scope request through the server and only inserts a new request article on ok:true', async () => {
  const seed = { product: 'Hearwell', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'invite', states: [] }] }] }
  const html = buildClientIndex({ seed, notes: [], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })

  const { document, posts } = runIndexBrowser(html, {
    '/client/__notes/add': { ok: true, json: () => Promise.resolve({ id: 'N007' }) },
  })
  const askForm = document.querySelector('[data-cl="ask"]')
  assert.ok(askForm, 'AC-8: buildClientIndex must render [data-cl="ask"] (D20: a <details>, not a <form>): got\n' + html)
  const textarea = askForm.querySelector('textarea')
  const chip = document.querySelector('[data-cl="reason"][data-value="missing-screen"]')
  assert.ok(chip, 'AC-8: the missing-screen reason chip must render: got\n' + html)
  textarea.value = 'No reset screen'
  chip.click()
  clickSend(askForm)
  await flush()

  const postCall = posts.find((p) => p.url.includes('/client/__notes/add'))
  assert.ok(postCall, 'AC-8: submitting the ask form must POST /client/__notes/add — walk.browser.js has no index-page handler yet: got posts=' + JSON.stringify(posts))
  assert.deepStrictEqual(JSON.parse(postCall.init.body), { scope: 'project', reason: 'missing-screen', text: 'No reset screen', by: 'client' },
    'AC-8: the posted body must carry the selected reason chip and the typed text: got ' + postCall.init.body)
  assert.strictEqual(textarea.value, '', 'AC-8: an ok:true save must clear the textarea: got "' + textarea.value + '"')
  const msgEl = document.querySelector('[data-wk="msg"]')
  assert.strictEqual(msgEl.hidden, false, 'AC-8: an ok:true save must unhide the msg slot: got hidden=' + msgEl.hidden)
  assert.strictEqual(msgEl.textContent, msgEl.getAttribute('data-saved'),
    'AC-8: an ok:true save must show the data-saved text: got "' + msgEl.textContent + '"')
  const requestArticles = document.querySelectorAll('[data-cl="requests"] [data-cl="request"]')
  assert.strictEqual(requestArticles.length, 1, 'AC-8: an ok:true save must insert exactly one new request article: got ' + requestArticles.length)
  assert.strictEqual(requestArticles[0].getAttribute('data-id'), 'N007', 'AC-8: the inserted article must carry the server\'s new id: got ' + requestArticles[0].getAttribute('data-id'))
  assert.strictEqual(requestArticles[0].getAttribute('data-status'), 'open', 'AC-8: the inserted article must be status "open": got ' + requestArticles[0].getAttribute('data-status'))

  // AC-8 fold-in (review 2026-09-11): activation must produce a COMPLETE open request row — the
  // client's own text, the "We'll look at this" status line, and a working "Never mind" control —
  // never an article carrying only stamped attributes over an otherwise-empty body (the blank
  // amber stripe the client actually saw).
  const insertedTextEl = requestArticles[0].querySelector('.wk-req-text')
  assert.ok(insertedTextEl, 'AC-8 (fold-in): the activated article must carry a .wk-req-text element: got ' + JSON.stringify(requestArticles[0].attrs))
  assert.strictEqual(insertedTextEl.textContent, 'No reset screen',
    'AC-8 (fold-in): the activated template must carry the client\'s own typed text, not an empty article: got "' + insertedTextEl.textContent + '"')
  const insertedStatusEl = requestArticles[0].querySelector('.wk-req-status')
  assert.strictEqual(insertedStatusEl.textContent, "We'll look at this",
    'AC-8 (fold-in): a freshly-activated open request must read "We\'ll look at this", not an empty status line: got "' + insertedStatusEl.textContent + '"')
  const insertedWithdraw = requestArticles[0].querySelector('[data-cl="withdraw"]')
  assert.ok(insertedWithdraw, 'AC-8 (fold-in): the activated row must carry a [data-cl="withdraw"] control, not an inert stamped article: got ' + JSON.stringify(requestArticles[0].attrs))
  insertedWithdraw.click()
  await flush()
  const withdrawPost = posts.find((p) => p.url.includes('/client/__notes/resolve'))
  assert.ok(withdrawPost, 'AC-8 (fold-in): the freshly-activated withdraw control must actually POST /client/__notes/resolve — a control stamped on but never wired would leave the client stuck: got posts=' + JSON.stringify(posts))
  assert.strictEqual(requestArticles[0].getAttribute('data-status'), 'resolved',
    'AC-8 (fold-in): withdrawing the freshly-activated request must set it resolved like any other card: got ' + requestArticles[0].getAttribute('data-status'))

  const { document: doc2, posts: posts2 } = runIndexBrowser(html, {
    '/client/__notes/add': { ok: false, json: () => Promise.resolve({}) },
  })
  const askForm2 = doc2.querySelector('[data-cl="ask"]')
  const textarea2 = askForm2.querySelector('textarea')
  textarea2.value = 'No reset screen'
  clickSend(askForm2)
  await flush()
  assert.strictEqual(textarea2.value, 'No reset screen', 'AC-8: an ok:false save must keep the typed text: got "' + textarea2.value + '"')
  assert.strictEqual(doc2.querySelectorAll('[data-cl="request"]').length, 0, 'AC-8: an ok:false save must insert nothing: got ' + doc2.querySelectorAll('[data-cl="request"]').length)
  const msgEl2 = doc2.querySelector('[data-wk="msg"]')
  assert.strictEqual(msgEl2.textContent, msgEl2.getAttribute('data-failed'),
    'AC-8: an ok:false save must show the data-failed text: got "' + msgEl2.textContent + '" (posts=' + JSON.stringify(posts2) + ')')
})

test('AC-20260911-06-9: under the vm shim on the walk page, accept/reopen post their own routes, update the request card in place, and recompute confirm\'s disabled state', async () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const addressedNote = clientNote({
    id: 'N003', scope: 'mock', screen: 'invite', text: 'Says Submit', status: 'addressed',
    addressed: { at: NOW, change: 'Button now says Send', ledgerRow: null },
  })

  const htmlAccept = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const acceptHarness = runWalkBrowserRouted(htmlAccept, { reached: ['invite'], misses: [], confirmedAt: null, sentence: null },
    { '/client/__notes/resolve': { ok: true } })
  await flush()
  const acceptArticle = acceptHarness.document.querySelector('[data-wk="request"][data-id="N003"]')
  assert.ok(acceptArticle, 'AC-9: buildWalkPage must render [data-wk="request"] for the addressed note — D5 is unbuilt: got\n' + htmlAccept)
  const acceptBtn = acceptArticle.querySelector('[data-wk="accept"]')
  assert.ok(acceptBtn, 'AC-9: the request card must carry [data-wk="accept"]: got\n' + acceptArticle.attrs)
  acceptBtn.click()
  await flush()
  const acceptPost = acceptHarness.posts.find((p) => p.url.includes('/client/__notes/resolve'))
  assert.ok(acceptPost, 'AC-9: clicking accept must POST /client/__notes/resolve: got posts=' + JSON.stringify(acceptHarness.posts))
  assert.deepStrictEqual(JSON.parse(acceptPost.init.body), { id: 'N003', by: 'client' },
    'AC-9: the accept POST body must carry {id, by:"client"}: got ' + acceptPost.init.body)
  assert.strictEqual(acceptArticle.getAttribute('data-status'), 'resolved',
    'AC-9: accepting must set data-status="resolved" on ok:true: got ' + acceptArticle.getAttribute('data-status'))
  const confirmAfterAccept = acceptHarness.document.querySelector('[data-wk="confirm"]')
  assert.strictEqual(confirmAfterAccept.hasAttribute('disabled'), false,
    'AC-9: confirm must lose its disabled attribute once no request is open/addressed and every other count is zero: got disabled=' + confirmAfterAccept.hasAttribute('disabled'))

  const htmlReopen = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const reopenHarness = runWalkBrowserRouted(htmlReopen, { reached: ['invite'], misses: [], confirmedAt: null, sentence: null },
    { '/client/__notes/reopen': { ok: true } })
  await flush()
  const reopenArticle = reopenHarness.document.querySelector('[data-wk="request"][data-id="N003"]')
  assert.ok(reopenArticle, 'AC-9: buildWalkPage must render [data-wk="request"] for the reopen case too: got\n' + htmlReopen)
  const reopenBtn = reopenArticle.querySelector('[data-wk="reopen"]')
  const reopenTextEl = reopenArticle.querySelector('[data-wk="reopen-text"]')
  assert.ok(reopenBtn && reopenTextEl, 'AC-9: the request card must carry [data-wk="reopen"] and [data-wk="reopen-text"]: got\n' + reopenArticle.attrs)
  reopenBtn.click()
  await flush()
  // AC-23: the reopen control unhides its own reopen-text box on the very first press, even one
  // that finds it still empty and posts nothing.
  assert.strictEqual(reopenTextEl.hidden, false,
    'AC-23: clicking [data-wk="reopen"] must unhide its own [data-wk="reopen-text"] box: got hidden=' + reopenTextEl.hidden)
  assert.strictEqual(reopenHarness.posts.find((p) => p.url.includes('/client/__notes/reopen')), undefined,
    'AC-9: reopen with an empty textarea must post nothing: got posts=' + JSON.stringify(reopenHarness.posts))
  const msgAfterEmpty = reopenHarness.document.querySelector('[data-wk="msg"]')
  assert.strictEqual(msgAfterEmpty.textContent, msgAfterEmpty.getAttribute('data-why'),
    'AC-9: an empty reopen must show the data-why text: got "' + msgAfterEmpty.textContent + '"')

  reopenTextEl.value = 'Still wrong'
  reopenBtn.click()
  await flush()
  const reopenPost = reopenHarness.posts.find((p) => p.url.includes('/client/__notes/reopen'))
  assert.ok(reopenPost, 'AC-9: reopen with text must POST /client/__notes/reopen: got posts=' + JSON.stringify(reopenHarness.posts))
  assert.deepStrictEqual(JSON.parse(reopenPost.init.body), { id: 'N003', text: 'Still wrong', by: 'client' },
    'AC-9: the reopen POST body must carry {id, text, by:"client"}: got ' + reopenPost.init.body)
  assert.strictEqual(reopenArticle.getAttribute('data-status'), 'open',
    'AC-9: reopening must set data-status="open" on ok:true: got ' + reopenArticle.getAttribute('data-status'))
  const confirmAfterReopen = reopenHarness.document.querySelector('[data-wk="confirm"]')
  assert.strictEqual(confirmAfterReopen.hasAttribute('disabled'), true,
    'AC-9: confirm must stay (or become) disabled once the reopened request is "open" again: got disabled=' + confirmAfterReopen.hasAttribute('disabled'))

  // AC-9 fold-in (review 2026-09-11): reopening an addressed request must reset its visible
  // status line and stop offering "Looks good" — today it is left reading "Done: …" and still
  // offers accept.
  const reopenStatusEl = reopenArticle.querySelector('.wk-req-status')
  assert.strictEqual(reopenStatusEl.textContent, "We'll look at this",
    'AC-9 (fold-in): reopening an addressed request must reset its status line to "We\'ll look at this": got "' + reopenStatusEl.textContent + '"')
  const reopenAcceptBtn = reopenArticle.querySelector('[data-wk="accept"]')
  assert.ok(!reopenAcceptBtn || reopenAcceptBtn.hidden === true,
    'AC-9 (fold-in): once reopened, the request must no longer offer "Looks good" — the accept control must be removed or hidden, not still clickable: got ' + JSON.stringify(reopenArticle.attrs))
})

test('AC-20260911-06-9 (fold-in): under the vm shim, the client index\'s own accept/reopen controls post their own routes and, on reopen, reset the status line and drop the accept control', async () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const addressedNote = clientNote({
    id: 'N040', scope: 'mock', screen: 'invite', text: 'Wrong copy', status: 'addressed',
    addressed: { at: NOW, change: 'Fixed the copy', ledgerRow: null },
  })
  const html = buildClientIndex({ seed, notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })
  const { document, posts } = runIndexBrowser(html, { '/client/__notes/resolve': { ok: true } })
  const article = document.querySelector('[data-cl="request"][data-id="N040"]')
  assert.ok(article, 'AC-9 (fold-in) setup: buildClientIndex must render the addressed request as an article: got\n' + html)

  const acceptBtn = article.querySelector('[data-cl="accept"]')
  assert.ok(acceptBtn, 'AC-9 (fold-in) setup: the addressed article must carry [data-cl="accept"]: got ' + JSON.stringify(article.attrs))
  const reopenBtn = article.querySelector('[data-cl="reopen"]')
  const reopenTextEl = article.querySelector('[data-cl="reopen-text"]')
  assert.strictEqual(reopenTextEl.hidden, true, 'AC-9 (fold-in) setup: the reopen textarea must start hidden: got hidden=' + reopenTextEl.hidden)

  reopenTextEl.value = 'Still not right'
  reopenBtn.click()
  await flush()
  assert.strictEqual(reopenTextEl.hidden, false,
    'AC-23/AC-9 (fold-in): clicking [data-cl="reopen"] must unhide [data-cl="reopen-text"]: got hidden=' + reopenTextEl.hidden)
  const reopenPost = posts.find((p) => p.url.includes('/client/__notes/reopen'))
  assert.ok(reopenPost, 'AC-9 (fold-in): clicking the index\'s own reopen control must POST /client/__notes/reopen: got posts=' + JSON.stringify(posts))
  assert.deepStrictEqual(JSON.parse(reopenPost.init.body), { id: 'N040', text: 'Still not right', by: 'client' },
    'AC-9 (fold-in): the reopen POST body must carry {id, text, by:"client"}: got ' + reopenPost.init.body)
  assert.strictEqual(article.getAttribute('data-status'), 'open',
    'AC-9 (fold-in): reopening must set data-status="open": got ' + article.getAttribute('data-status'))
  const statusEl = article.querySelector('.wk-req-status')
  assert.strictEqual(statusEl.textContent, "We'll look at this",
    'AC-9 (fold-in, review 2026-09-11): reopening an addressed request on the index must reset its status line to "We\'ll look at this" — today it is left reading "Done: …": got "' + statusEl.textContent + '"')
  assert.ok(!acceptBtn || acceptBtn.hidden === true,
    'AC-9 (fold-in): once reopened, the index request must no longer offer "Looks good" — the accept control must be removed or hidden: got ' + JSON.stringify(article.attrs))
})

test('AC-20260911-06-8 (fold-in): under the vm shim, the walk page\'s own note form activates its spare template into a complete open request row, including a working withdraw control', async () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: { journeys: {} }, prefix: '' })
  const harness = runWalkBrowserRouted(html, { reached: ['invite'], misses: [], confirmedAt: null, sentence: null },
    { '/client/__notes/add': { ok: true, json: () => Promise.resolve({ id: 'N050' }) } })
  await flush()
  const noteForm = harness.document.querySelector('[data-wk="note"]')
  assert.ok(noteForm, 'AC-8 (fold-in) setup: buildWalkPage must render [data-wk="note"]: got\n' + html)
  const textarea = noteForm.querySelector('textarea')
  textarea.value = 'The button label is wrong here'
  noteForm.submit()
  await flush()

  const postCall = harness.posts.find((p) => p.url.includes('/client/__notes/add'))
  assert.ok(postCall, 'AC-8 (fold-in): submitting the walk page\'s own note form must POST /client/__notes/add — D6 promises this on the walk page too, not only the index: got posts=' + JSON.stringify(harness.posts))

  const article = harness.document.querySelector('[data-wk="request"][data-id="N050"]')
  assert.ok(article, 'AC-8 (fold-in): the walk page must activate its spare template into a real [data-wk="request"] article — a template only ever stamped with attributes and never wired is the "may not be wiring the new row at all" defect')
  assert.strictEqual(article.getAttribute('data-label'), 'invite',
    'AC-8 (fold-in): the activated row must carry the current screen\'s label: got ' + article.getAttribute('data-label'))
  assert.strictEqual(article.getAttribute('data-status'), 'open',
    'AC-8 (fold-in): a freshly-added request must be status "open": got ' + article.getAttribute('data-status'))
  const textEl = article.querySelector('.wk-req-text')
  assert.strictEqual(textEl.textContent, 'The button label is wrong here',
    'AC-8 (fold-in): the activated row must carry the client\'s own typed text, not an empty article: got "' + textEl.textContent + '"')
  const statusEl = article.querySelector('.wk-req-status')
  assert.strictEqual(statusEl.textContent, "We'll look at this",
    'AC-8 (fold-in): a freshly-activated open request must read "We\'ll look at this": got "' + statusEl.textContent + '"')
  const withdrawBtn = article.querySelector('[data-wk="withdraw"]')
  assert.ok(withdrawBtn, 'AC-8 (fold-in): the activated row must carry a working [data-wk="withdraw"] control: got ' + JSON.stringify(article.attrs))
  withdrawBtn.click()
  await flush()
  const withdrawPost = harness.posts.find((p) => p.url.includes('/client/__notes/resolve'))
  assert.ok(withdrawPost, 'AC-8 (fold-in): clicking the freshly-activated withdraw control must actually POST /client/__notes/resolve — a stamped-but-unwired control leaves the client stuck: got posts=' + JSON.stringify(harness.posts))
  assert.strictEqual(article.getAttribute('data-status'), 'resolved',
    'AC-8 (fold-in): withdrawing the freshly-activated request must set it resolved like any other card: got ' + article.getAttribute('data-status'))
})

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D23 (the design seat's findings against the rendered
// pages, 2026-09-11). AC-20260911-06-23 named this file as its oracle but no test here ever
// mentioned it — `grep -rn "AC-20260911-06-23" tests/` found nothing and the whole design round
// (the shattered card, the raw slug caption, the reading order, the state text, the home link,
// the state switcher, the reopen/accept wording) was unpinned. Every clause below.
// ---------------------------------------------------------------------------

test('AC-20260911-06-23: buildClientIndex never nests the "+n more" tile inside another anchor, humanises a session-live slot\'s caption while keeping its raw data-label, orders each slot\'s thumbnail before its caption, and renders a confirmed journey\'s state as "Confirmed"', () => {
  const screensOf = (n) => Array.from({ length: n }, (_, i) => ({ label: 's' + (i + 1), states: [] }))
  const journeys = [
    { name: 'j8', title: 'Eight screener', screens: screensOf(8) },
    { name: 'j-live', title: 'Live journey', screens: [{ label: 'session-live', states: [] }] },
    { name: 'j-ok', title: 'OK journey', screens: [{ label: 'done', states: [] }] },
  ]
  const seed = { product: 'Hearwell', journeys }
  const walk = { journeys: { 'j-ok': { reached: [], misses: [], confirmedAt: NOW, sentence: 'Looks right', waived: null } } }
  const html = buildClientIndex({ seed, notes: [], ledger: [], walk, prefix: '', ready: new Set(journeys.map((j) => j.name)) })
  const cards = journeyCards(html)

  const eightCard = cards.find((c) => c.includes('Eight screener'))
  assert.ok(eightCard, 'AC-23 setup: the 8-screen journey must render a card: got\n' + html)
  const cardDom = parseFlatDom(eightCard)
  const moreEl = cardDom.querySelector('[data-cl="more"]')
  assert.ok(moreEl, 'AC-23 setup: an 8-screen card must render a [data-cl="more"] tile: got\n' + eightCard)
  let anc = moreEl.parentNode
  let outerAnchor = null
  while (anc) { if (anc.tagName === 'A') { outerAnchor = anc; break } anc = anc.parentNode }
  assert.strictEqual(outerAnchor, null,
    'AC-23: no <a> may be an ancestor of [data-cl="more"] other than itself — an <a> wrapping the whole card nests the more tile\'s own anchor inside it, which shatters the card in every browser: got an ancestor <a> in\n' + eightCard)
  assert.strictEqual(moreEl.tagName, 'A', 'AC-23 setup: the more tile itself must be an <a>: got ' + moreEl.tagName)
  assert.match(moreEl.getAttribute('href') || '', /\/client\/walk\/j8\.html$/,
    'AC-23 (fold-in, review FIX 1): the "+n more" tile must carry an href to the journey\'s own walk page — it was previously an inert <a> with no href: got href="' + moreEl.getAttribute('href') + '"')
  assert.ok(moreEl.getAttribute('aria-label'),
    'AC-23 (fold-in, review FIX 1): the "+n more" tile must carry an aria-label naming the hidden screens: got ' + JSON.stringify(moreEl.attrs))

  const liveCard = cards.find((c) => c.includes('Live journey'))
  assert.ok(liveCard, 'AC-23 setup: the session-live journey must render a card: got\n' + html)
  const slotMatch = /<li[^>]*data-cl="slot"[^>]*data-label="session-live"[^>]*>[\s\S]*?<\/li>/.exec(liveCard)
  assert.ok(slotMatch, 'AC-23: the session-live slot must keep data-cl="slot" data-label="session-live" raw: got\n' + liveCard)
  assert.match(slotMatch[0], /Session live/,
    'AC-23: the session-live slot\'s caption must humanise the raw label to "Session live": got\n' + slotMatch[0])
  const thumbIdx = slotMatch[0].indexOf('data-cl="thumb"')
  const capIdx = slotMatch[0].indexOf('wk-thumb-cap')
  assert.ok(thumbIdx !== -1 && capIdx !== -1 && thumbIdx < capIdx,
    'AC-23: each slot\'s thumbnail must precede its caption in document order — the column-reverse workaround is deleted: got thumb@' + thumbIdx + ' cap@' + capIdx + ' in\n' + slotMatch[0])

  const okCard = cards.find((c) => c.includes('OK journey'))
  assert.match(okCard, /data-cl="state"[^>]*>Confirmed</,
    'AC-23: a confirmed ("ok") journey\'s state must read exactly "Confirmed": got\n' + okCard)
})

test('AC-20260911-06-23: buildWalkPage carries the "← All journeys · <Journey>" home link', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: { journeys: {} }, prefix: '' })
  assert.ok(html.includes('←') && html.includes('All journeys') && html.includes('<strong>Onboarding</strong>'),
    'AC-23: the player must carry the home link "← All journeys · Onboarding": got\n' + html)
})

test('AC-20260911-06-23: under the vm shim, the walk page\'s reopen control unhides its own reopen-text box, an accept sets the status line to "Closed — thank you", and the state switcher\'s first tab reads "Normal" with aria-selected on the current state', async () => {
  const seed = onboardingSeed([{ label: 'invite', states: ['error'] }])
  const addressedNote = clientNote({
    id: 'N060', scope: 'mock', screen: 'invite', text: 'Wrong copy', status: 'addressed',
    addressed: { at: NOW, change: 'Fixed the copy', ledgerRow: null },
  })
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const harness = runWalkBrowserRouted(html, { reached: ['invite'], misses: [], confirmedAt: null, sentence: null },
    { '/client/__notes/resolve': { ok: true } })
  await flush()

  const statesEl = harness.document.querySelector('[data-wk="states"]')
  assert.ok(statesEl, 'AC-23 setup: buildWalkPage must render [data-wk="states"]: got\n' + html)
  assert.match(statesEl.innerHTML || '', /^<button[^>]*data-state-opt=""[^>]*aria-selected="true"[^>]*>Normal</,
    'AC-23: the state switcher\'s first tab must read "Normal" (not the internal "happy" key) with aria-selected="true" on the current (default) state: got "' + statesEl.innerHTML + '"')

  const article = harness.document.querySelector('[data-wk="request"][data-id="N060"]')
  assert.ok(article, 'AC-23 setup: buildWalkPage must render the addressed request card: got\n' + html)
  const reopenBtn = article.querySelector('[data-wk="reopen"]')
  const reopenTextEl = article.querySelector('[data-wk="reopen-text"]')
  assert.strictEqual(reopenTextEl.hidden, true, 'AC-23 setup: the reopen textarea must start hidden: got hidden=' + reopenTextEl.hidden)
  reopenBtn.click()
  await flush()
  assert.strictEqual(reopenTextEl.hidden, false,
    'AC-23: clicking [data-wk="reopen"] must unhide its own [data-wk="reopen-text"] box: got hidden=' + reopenTextEl.hidden)

  const acceptBtn = article.querySelector('[data-wk="accept"]')
  acceptBtn.click()
  await flush()
  const statusEl = article.querySelector('.wk-req-status')
  assert.strictEqual(statusEl.textContent, 'Closed — thank you',
    'AC-23: an accept must set the request card\'s status line to "Closed — thank you": got "' + statusEl.textContent + '"')
})

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D16/D17 (amended/new, JJ's ruling and Fable's finding,
// both 2026-09-11). D16: an open client request gains a "Never mind" withdraw control on both
// surfaces. D17: the walk page's accept control byte-matches the index's own "Looks good", and
// every request article additionally names its location. AC-20260911-06-16, AC-20260911-06-17.
// ---------------------------------------------------------------------------

test('AC-20260911-06-16: buildClientIndex and buildWalkPage render a "Never mind" withdraw control on an open client request only, never on an addressed or resolved one', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const openNote = clientNote({ id: 'N010', scope: 'mock', screen: 'invite', text: 'Wrong color', status: 'open' })
  const addressedNote = clientNote({
    id: 'N011', scope: 'mock', screen: 'invite', text: 'Wrong color', status: 'addressed',
    addressed: { at: NOW, change: 'Fixed the color', ledgerRow: null },
  })
  const resolvedNote = clientNote({
    id: 'N012', scope: 'mock', screen: 'invite', text: 'Wrong color', status: 'resolved', resolution: 'withdrawn',
  })

  const indexHtml = buildClientIndex({
    seed, notes: [openNote, addressedNote, resolvedNote], ledger: [], walk: { journeys: {} }, prefix: '',
    ready: new Set(['onboarding']),
  })
  const indexArticles = [...indexHtml.matchAll(/<article[^>]*data-cl="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const indexOpen = indexArticles.find((a) => a.includes('data-id="N010"'))
  const indexAddressed = indexArticles.find((a) => a.includes('data-id="N011"'))
  const indexResolved = indexArticles.find((a) => a.includes('data-id="N012"'))
  assert.ok(indexOpen, 'AC-16 setup: the open note must render as a request article: got\n' + indexHtml)
  assert.match(indexOpen, /<button[^>]*data-cl="withdraw">Never mind<\/button>/,
    'AC-16: an open request on the index must render [data-cl="withdraw"] reading exactly "Never mind": got\n' + indexOpen)
  assert.doesNotMatch(indexAddressed, /data-cl="withdraw"/,
    'AC-16: an addressed request on the index must render no withdraw control — it already has accept/reopen: got\n' + indexAddressed)
  assert.doesNotMatch(indexResolved, /data-cl="withdraw"/,
    'AC-16: a resolved request on the index must render no withdraw control — there is nothing left to take back: got\n' + indexResolved)

  const walkOpenHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [openNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const walkOpenArticle = /<article[^>]*data-wk="request"[\s\S]*?<\/article>/.exec(walkOpenHtml)
  assert.ok(walkOpenArticle, 'AC-16: buildWalkPage must render a request card for the open note: got\n' + walkOpenHtml)
  assert.match(walkOpenArticle[0], /<button[^>]*data-wk="withdraw">Never mind<\/button>/,
    'AC-16: the walk page\'s open request card must render [data-wk="withdraw"] reading exactly "Never mind": got\n' + walkOpenArticle[0])

  const walkAddressedHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const walkAddressedArticle = /<article[^>]*data-wk="request"[\s\S]*?<\/article>/.exec(walkAddressedHtml)
  assert.doesNotMatch(walkAddressedArticle[0], /data-wk="withdraw"/,
    'AC-16: the walk page\'s addressed request card must render no withdraw control: got\n' + walkAddressedArticle[0])
})

test('AC-20260911-06-16: under the vm shim, clicking the walk page\'s withdraw control posts the resolve-with-reason route and, on ok:true, sets the card resolved with status text "Closed"', async () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const openNote = clientNote({ id: 'N010', scope: 'mock', screen: 'invite', text: 'Wrong color', status: 'open' })
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [openNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  const harness = runWalkBrowserRouted(html, { reached: ['invite'], misses: [], confirmedAt: null, sentence: null },
    { '/client/__notes/resolve': { ok: true } })
  await flush()
  const article = harness.document.querySelector('[data-wk="request"][data-id="N010"]')
  assert.ok(article, 'AC-16 setup: buildWalkPage must render the open request card: got\n' + html)
  const withdrawBtn = article.querySelector('[data-wk="withdraw"]')
  assert.ok(withdrawBtn, 'AC-16: the open request card must carry [data-wk="withdraw"]: got ' + JSON.stringify(article.attrs))
  withdrawBtn.click()
  await flush()

  const post = harness.posts.find((p) => p.url.includes('/client/__notes/resolve'))
  assert.ok(post, 'AC-16: clicking withdraw must POST /client/__notes/resolve: got posts=' + JSON.stringify(harness.posts))
  assert.deepStrictEqual(JSON.parse(post.init.body), { id: 'N010', by: 'client', reason: 'not-needed' },
    'AC-16: the withdraw POST body must carry {id, by:"client", reason:"not-needed"}: got ' + post.init.body)
  assert.strictEqual(article.getAttribute('data-status'), 'resolved',
    'AC-16: withdrawing must set data-status="resolved" on ok:true: got ' + article.getAttribute('data-status'))
  const statusEl = article.querySelector('.wk-req-status')
  assert.ok(statusEl, 'AC-16 setup: the request card must carry a .wk-req-status line: got ' + JSON.stringify(article.attrs))
  assert.strictEqual(statusEl.textContent, 'Closed',
    'AC-16: withdrawing must set the card\'s status line text to "Closed": got "' + statusEl.textContent + '"')
})

test('AC-20260911-06-17: buildWalkPage\'s accept control reads exactly "Looks good" and never "Looks good now", and buildClientIndex names each request\'s location — "on <screen>" for a mock-scope request, "across the whole product" for a project-scope one', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const addressedNote = clientNote({
    id: 'N020', scope: 'mock', screen: 'invite', text: 'Wrong copy', status: 'addressed',
    addressed: { at: NOW, change: 'Fixed the copy', ledgerRow: null },
  })
  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [addressedNote], ledger: [], walk: { journeys: {} }, prefix: '' })
  assert.match(walkHtml, /data-wk="accept">Looks good<\/button>/,
    'AC-17: the walk page\'s accept control must read exactly "Looks good": got\n' + walkHtml)
  assert.doesNotMatch(walkHtml, /Looks good now/,
    'AC-17: "Looks good now" is retired — the walk page must byte-match the index\'s own wording: got\n' + walkHtml)

  const mockNote = clientNote({ id: 'N021', scope: 'mock', screen: 'invite', text: 'Wrong copy', status: 'open' })
  const projectNote = clientNote({ id: 'N022', scope: 'project', screen: null, text: 'No password reset screen', status: 'open' })
  const indexHtml = buildClientIndex({
    seed, notes: [mockNote, projectNote], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']),
  })
  const articles = [...indexHtml.matchAll(/<article[^>]*data-cl="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const mockArticle = articles.find((a) => a.includes('data-id="N021"'))
  const projectArticle = articles.find((a) => a.includes('data-id="N022"'))
  assert.ok(mockArticle && projectArticle, 'AC-17 setup: both requests must render as articles: got\n' + indexHtml)
  assert.match(mockArticle, /<span class="wk-req-where">on invite<\/span>/,
    'AC-17: a mock-scope request on invite must name its location as "on invite": got\n' + mockArticle)
  assert.match(projectArticle, /<span class="wk-req-where">across the whole product<\/span>/,
    'AC-17: a project-scope request must name its location as "across the whole product": got\n' + projectArticle)
})

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D18-D22 (JJ's owner-approved replacement design; D18:
// design/client-mocks/index.html and walk.html are the binding reference — where these ACs and
// the mock disagree, the mock is the design). D19: the index journey row becomes a bounded card
// with a fixed four-slot thumbnail rail, one title/desc/state text column and one go action. D20:
// the composer collapses into a closed <details>, the request log moves below the cards and hides
// resolved items behind a toggle, showing a "waiting" count. D21: the 200px spine is replaced by a
// step indicator in the bar and a caption; the separate approve section is deleted, replaced by a
// confirm control and sign-off block inside the stage on the last screen only. D22: the retired
// wk-spine/wk-approve register and the bare-count [data-wk="left"] overwrite carry zero live
// mentions. Unbuilt against the pre-image (still the pre-D18-22 row/spine/approve shapes): every
// test below is red until the sibling build round lands. AC-20260911-06-18, -19, -20, -21, -22.
// ---------------------------------------------------------------------------

// Journey cards render as flat siblings, never nested inside one another, so one card's own
// markup is simply the slice of html from its own opening tag (found by walking back to the
// nearest "<" before its data-cl="journey" attribute, since D19 does not pin the card's tag name)
// to the next card's opening tag — or, for the last card, to the first non-card marker that
// follows the list (the composer or the request log, in either order).
function journeyCards(html) {
  const attrPositions = [...html.matchAll(/data-cl="journey"/g)].map((m) => m.index)
  const tagStarts = attrPositions.map((p) => html.lastIndexOf('<', p))
  const afterMatch = /<[^>]*data-cl="(?:ask|requests)"/.exec(html)
  const fallbackEnd = afterMatch ? afterMatch.index : html.length
  return tagStarts.map((start, i) => html.slice(start, i + 1 < tagStarts.length ? tagStarts[i + 1] : fallbackEnd))
}

// A resolved-vs-visible check needs the ARTICLE's own opening tag only — an addressed request's
// nested reopen textarea legitimately carries its own `hidden` attribute (D17's mock: the "why"
// box stays hidden until "Still not right" is clicked), so scanning the whole article body for
// the word "hidden" would false-positive on that unrelated child.
function openTagOf(el) {
  const m = /^<[a-zA-Z][\w-]*[^>]*>/.exec(el)
  return m ? m[0] : el
}

test('AC-20260911-06-18: buildClientIndex renders each ready journey as one card with a fixed four-slot thumbnail rail — filling only as many thumbs as it has screens, up to three plus a "+n more" tile — and exactly one title/desc/state/go element', () => {
  const screensOf = (n) => Array.from({ length: n }, (_, i) => ({ label: 's' + (i + 1), states: [] }))
  const journeys = [1, 3, 4, 8].map((n) => ({ name: 'j' + n, title: 'Journey ' + n, screens: screensOf(n) }))
  const seed = { product: 'Hearwell', journeys }
  const html = buildClientIndex({ seed, notes: [], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(journeys.map((j) => j.name)) })
  const cards = journeyCards(html)
  assert.strictEqual(cards.length, 4, 'AC-18 setup: all four journeys must render as ready cards — D19 is unbuilt: got ' + cards.length + ' in\n' + html)

  const expected = {
    j1: { thumbs: 1, more: 0 },
    j3: { thumbs: 3, more: 0 },
    j4: { thumbs: 4, more: 0 },
    j8: { thumbs: 3, more: 1, moreText: '+5 more' },
  }
  for (const j of journeys) {
    const card = cards.find((c) => c.includes(j.title))
    assert.ok(card, 'AC-18: a card for "' + j.title + '" must render: got\n' + html)
    const slotCount = (card.match(/data-cl="slot"/g) || []).length
    assert.strictEqual(slotCount, 4, 'AC-18: every card must carry exactly four [data-cl="slot"] elements — got ' + slotCount + ' for ' + j.name + ':\n' + card)
    const thumbCount = (card.match(/data-cl="thumb"/g) || []).length
    const moreCount = (card.match(/data-cl="more"/g) || []).length
    const exp = expected[j.name]
    assert.strictEqual(thumbCount, exp.thumbs,
      'AC-18: ' + j.name + ' (' + j.screens.length + ' screens) must render ' + exp.thumbs + ' [data-cl="thumb"] slot(s): got ' + thumbCount + ':\n' + card)
    assert.strictEqual(moreCount, exp.more,
      'AC-18: ' + j.name + ' must render ' + exp.more + ' [data-cl="more"] tile(s): got ' + moreCount + ':\n' + card)
    if (exp.moreText) {
      assert.ok(card.includes(exp.moreText),
        'AC-18: the 8-screen card\'s more tile must read "+5 more" (8 screens, 3 shown as thumbs): got\n' + card)
    }
    const goCount = (card.match(/data-cl="go"/g) || []).length
    assert.strictEqual(goCount, 1, 'AC-18: every card must carry exactly one [data-cl="go"] action: got ' + goCount + ' for ' + j.name + ':\n' + card)
    for (const attr of ['title', 'desc', 'state']) {
      const c = (card.match(new RegExp('data-cl="' + attr + '"', 'g')) || []).length
      assert.strictEqual(c, 1, 'AC-18: every card must carry exactly one [data-cl="' + attr + '"] element: got ' + c + ' for ' + j.name + ':\n' + card)
    }
  }
})

test('AC-20260911-06-19: buildClientIndex sets each card\'s go action and data-primary by derived state, flags a screen\'s open/addressed request as a dot, marks the last-reached screen current, renders a confirmed journey\'s own sentence, and totals "<n> of <total> confirmed"', () => {
  const AT = '2026-09-12T00:00:00.000Z'
  const journeys = [
    { name: 'j-unseen', title: 'Unseen journey', screens: [{ label: 'un1', states: [] }] },
    { name: 'j-walking', title: 'Walking journey', screens: [{ label: 'wa1', states: [] }, { label: 'wa2', states: [] }] },
    { name: 'j-fixed', title: 'Fixed journey', screens: [{ label: 'fx', states: [] }] },
    { name: 'j-changes', title: 'Changes journey', screens: [{ label: 'cr', states: [] }] },
    { name: 'j-ok', title: 'OK journey', screens: [{ label: 'oks', states: [] }] },
    { name: 'j-flags', title: 'Flags journey', screens: [{ label: 'alpha', states: [] }, { label: 'beta', states: [] }, { label: 'gamma', states: [] }] },
  ]
  const seed = { product: 'Hearwell', journeys }
  const notes = [
    clientNote({ id: 'F1', scope: 'mock', screen: 'fx', text: 'x', status: 'addressed', addressed: { at: AT, change: 'Fixed it', ledgerRow: null } }),
    clientNote({ id: 'C1', scope: 'mock', screen: 'cr', text: 'y', status: 'open' }),
    clientNote({ id: 'B1', scope: 'mock', screen: 'beta', text: 'still wrong', status: 'open' }),
    clientNote({ id: 'G1', scope: 'mock', screen: 'gamma', text: 'was wrong', status: 'addressed', addressed: { at: AT, change: 'done', ledgerRow: null } }),
  ]
  const walk = {
    journeys: {
      'j-walking': { reached: ['wa1'], misses: [], confirmedAt: null, sentence: null },
      'j-ok': { reached: [], misses: [], confirmedAt: AT, sentence: 'Looks right', waived: null },
      'j-flags': { reached: ['alpha', 'beta'], misses: [], confirmedAt: null, sentence: null },
    },
  }
  const html = buildClientIndex({ seed, notes, ledger: [], walk, prefix: '', ready: new Set(journeys.map((j) => j.name)) })
  const cards = journeyCards(html)

  const goExpect = {
    'Unseen journey': { go: 'Start', primary: true },
    'Walking journey': { go: 'Continue', primary: true },
    'Fixed journey': { go: 'Check the fix', primary: true },
    'Changes journey': { go: 'Open again', primary: false },
    'OK journey': { go: 'Walk it again', primary: false },
  }
  for (const [title, exp] of Object.entries(goExpect)) {
    const card = cards.find((c) => c.includes(title))
    assert.ok(card, 'AC-19 setup: a card for "' + title + '" must render: got\n' + html)
    assert.match(card, new RegExp('data-cl="go"[^>]*>' + exp.go + '<'),
      'AC-19: "' + title + '"\'s [data-cl="go"] must read "' + exp.go + '": got\n' + card)
    if (exp.primary) {
      assert.match(card, /data-primary="true"/, 'AC-19: "' + title + '" (the client\'s turn) must carry data-primary="true": got\n' + card)
    } else {
      assert.doesNotMatch(card, /data-primary="true"/, 'AC-19: "' + title + '" must not carry data-primary="true": got\n' + card)
    }
  }

  const okCard = cards.find((c) => c.includes('OK journey'))
  assert.match(okCard, /data-cl="said"[^>]*>Looks right</, 'AC-19: a confirmed journey\'s card must render its own sentence in [data-cl="said"]: got\n' + okCard)

  const flagsCard = cards.find((c) => c.includes('Flags journey'))
  const windowAround = (text, needle, radius = 200) => {
    const i = text.indexOf(needle)
    return i === -1 ? '' : text.slice(Math.max(0, i - radius), i + needle.length + radius)
  }
  const alphaWindow = windowAround(flagsCard, 'alpha')
  const betaWindow = windowAround(flagsCard, 'beta')
  const gammaWindow = windowAround(flagsCard, 'gamma')
  assert.doesNotMatch(alphaWindow, /data-dot="(warn|ok)"/, 'AC-19: a screen with no client request must carry no data-dot: got\n' + alphaWindow)
  assert.match(betaWindow, /data-dot="warn"/, 'AC-19: the screen carrying an open request must carry data-dot="warn": got\n' + betaWindow)
  assert.match(betaWindow, /data-current="true"/, 'AC-19: the last-reached screen must carry data-current="true": got\n' + betaWindow)
  assert.match(gammaWindow, /data-dot="ok"/, 'AC-19: the screen carrying an addressed request must carry data-dot="ok": got\n' + gammaWindow)

  assert.match(html, /1 of 6 confirmed/, 'AC-19: the header must total "<n> of <total> confirmed" (one of six journeys is ok): got\n' + html)
})

test('AC-20260911-06-20: buildClientIndex collapses the composer into a closed <details>, places the request log after the journey cards showing only open/addressed with a waiting count and a closed-items toggle, and buildWalkPage never renders a resolved request card', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const openNote = clientNote({ id: 'O1', scope: 'mock', screen: 'invite', text: 'open one', status: 'open' })
  const addressedNote = clientNote({
    id: 'A1', scope: 'mock', screen: 'invite', text: 'addressed one', status: 'addressed',
    addressed: { at: NOW, change: 'fixed', ledgerRow: null },
  })
  const resolvedNote1 = clientNote({ id: 'R1', scope: 'mock', screen: 'invite', text: 'closed one', status: 'resolved', resolution: 'accepted' })
  const resolvedNote2 = clientNote({ id: 'R2', scope: 'project', text: 'closed two', status: 'resolved' })
  const notes = [openNote, addressedNote, resolvedNote1, resolvedNote2]

  const html = buildClientIndex({ seed, notes, ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })

  const detailsMatch = /<details[^>]*data-cl="ask"[^>]*>/.exec(html)
  assert.ok(detailsMatch, 'AC-20: the composer must render as <details data-cl="ask">: got\n' + html)
  assert.doesNotMatch(detailsMatch[0], /\bopen\b/, 'AC-20: the composer <details> must be closed by default (no bare "open" attribute): got ' + detailsMatch[0])

  const journeyEnd = html.lastIndexOf('data-cl="journey"')
  const requestsStart = html.indexOf('data-cl="requests"')
  assert.ok(journeyEnd !== -1 && requestsStart !== -1 && requestsStart > journeyEnd,
    'AC-20: [data-cl="requests"] must sit after the last journey card in document order: got journeyEnd=' + journeyEnd + ' requestsStart=' + requestsStart)

  assert.match(html, /2 waiting/, 'AC-20: the requests heading must carry "2 waiting" (one open, one addressed): got\n' + html)

  const showClosedMatch = /<[a-zA-Z][\w-]*[^>]*data-cl="show-closed"[^>]*>([\s\S]*?)<\/[a-zA-Z][\w-]*>/.exec(html)
  assert.ok(showClosedMatch, 'AC-20: a [data-cl="show-closed"] toggle must render: got\n' + html)
  assert.match(showClosedMatch[1], /Show 2 closed/, 'AC-20: the toggle must read "Show 2 closed": got "' + showClosedMatch[1] + '"')

  const articles = [...html.matchAll(/<article[^>]*data-cl="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const resolvedArticles = articles.filter((a) => a.includes('data-status="resolved"'))
  assert.strictEqual(resolvedArticles.length, 2, 'AC-20 setup: both resolved notes must still render (hidden, not deleted): got ' + resolvedArticles.length)
  for (const a of resolvedArticles) {
    assert.match(openTagOf(a), /\bhidden\b/, 'AC-20: a resolved request article must render hidden behind the closed toggle: got\n' + openTagOf(a))
  }
  const openArticle = articles.find((a) => a.includes('data-id="O1"'))
  const addressedArticle = articles.find((a) => a.includes('data-id="A1"'))
  assert.doesNotMatch(openTagOf(openArticle), /\bhidden\b/, 'AC-20: an open request must render visible (not hidden): got\n' + openTagOf(openArticle))
  assert.doesNotMatch(openTagOf(addressedArticle), /\bhidden\b/, 'AC-20: an addressed request must render visible (not hidden): got\n' + openTagOf(addressedArticle))

  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger: [], walk: { journeys: {} }, prefix: '' })
  const walkArticles = [...walkHtml.matchAll(/<article[^>]*data-wk="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const walkResolved = walkArticles.filter((a) => a.includes('data-status="resolved"'))
  assert.strictEqual(walkResolved.length, 0,
    'AC-20: buildWalkPage must render no [data-wk="request"] whose data-status is "resolved": got ' + walkResolved.length + ' in\n' + walkHtml)
  assert.strictEqual(walkArticles.length, 2,
    'AC-20: buildWalkPage must render exactly the open and addressed cards, never the resolved ones: got ' + walkArticles.length)
})

test('AC-20260911-06-21: buildWalkPage renders a step indicator and caption for the current mid-journey screen with Next and no confirm, and the sign-off block with "Confirm this journey" inside the stage — with no Next — on the last screen', () => {
  const seed = onboardingSeed([
    { label: 'Sign in', states: [] }, { label: 'Invite', states: [] },
    { label: 'Consent', states: [] }, { label: 'First session', states: [] },
  ])
  const midWalk = { journeys: { onboarding: { reached: ['Sign in', 'Invite'], misses: [], confirmedAt: null, sentence: null } } }
  const htmlMid = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: midWalk, prefix: '' })

  assert.match(htmlMid, /data-wk="steps"/, 'AC-21: the bar must carry [data-wk="steps"] — D21 is unbuilt: got\n' + htmlMid)
  const steps = [...htmlMid.matchAll(/<[a-zA-Z][\w-]*[^>]*data-wk="step"[^>]*>/g)].map((m) => m[0])
  assert.strictEqual(steps.length, 4, 'AC-21: [data-wk="steps"] must render one [data-wk="step"] per screen: got ' + steps.length + ' in\n' + htmlMid)
  assert.match(steps[0], /data-reached="true"/, 'AC-21: a reached screen\'s step must carry data-reached="true": got\n' + steps[0])
  assert.match(steps[1], /data-reached="true"/, 'AC-21: the current (reached) screen\'s step must carry data-reached="true": got\n' + steps[1])
  assert.match(steps[1], /data-current="true"/, 'AC-21: the step for the current screen (Invite, last reached) must carry data-current="true": got\n' + steps[1])
  assert.match(steps[2], /data-reached="false"/, 'AC-21: an unreached screen\'s step must carry data-reached="false": got\n' + steps[2])
  assert.doesNotMatch(steps[2], /data-current="true"/, 'AC-21: an unreached step must not carry data-current="true": got\n' + steps[2])

  const capIdx = htmlMid.indexOf('data-wk="caption"')
  assert.ok(capIdx !== -1, 'AC-21: the stage must carry [data-wk="caption"]: got\n' + htmlMid)
  const capWindow = htmlMid.slice(capIdx, capIdx + 300)
  assert.match(capWindow, /Invite/, 'AC-21: the caption must name the current screen "Invite": got "' + capWindow + '"')
  assert.match(capWindow, /2 of 4/, 'AC-21: the caption must read "2 of 4" (Invite is the second of four screens): got "' + capWindow + '"')

  const statesBlocks = [...htmlMid.matchAll(/data-wk="states"/g)]
  assert.strictEqual(statesBlocks.length, 1, 'AC-21: exactly one set of state controls must render (the duplicate bare row is deleted): got ' + statesBlocks.length)

  assert.match(htmlMid, /<[a-zA-Z][\w-]*[^>]*data-wk="next"[^>]*>Next<\/[a-zA-Z][\w-]*>/,
    'AC-21: mid-journey must render [data-wk="next"] reading "Next": got\n' + htmlMid)
  assert.doesNotMatch(htmlMid, /data-wk="confirm"/, 'AC-21: mid-journey must render no [data-wk="confirm"]: got\n' + htmlMid)

  const lastWalk = { journeys: { onboarding: { reached: ['Sign in', 'Invite', 'Consent', 'First session'], misses: [], confirmedAt: null, sentence: null } } }
  const htmlLast = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: lastWalk, prefix: '' })
  assert.match(htmlLast, /<[a-zA-Z][\w-]*[^>]*data-wk="confirm"[^>]*>Confirm this journey<\/[a-zA-Z][\w-]*>/,
    'AC-21: the last screen must render [data-wk="confirm"] reading "Confirm this journey" in the bar: got\n' + htmlLast)
  assert.doesNotMatch(htmlLast, /data-wk="next"/, 'AC-21: the last screen must render no [data-wk="next"]: got\n' + htmlLast)

  const stageIdx = htmlLast.indexOf('data-wk="stage"')
  const sentenceIdx = htmlLast.indexOf('data-wk="sentence"')
  const requestsIdx = htmlLast.indexOf('data-wk="requests"')
  assert.ok(stageIdx !== -1, 'AC-21: [data-wk="stage"] must render: got\n' + htmlLast)
  assert.ok(sentenceIdx !== -1, 'AC-21: the sign-off block\'s [data-wk="sentence"] must render: got\n' + htmlLast)
  assert.ok(sentenceIdx > stageIdx,
    'AC-21: [data-wk="sentence"] must render after [data-wk="stage"] opens — the sign-off block sits inside the stage: got stage@' + stageIdx + ' sentence@' + sentenceIdx)
  if (requestsIdx !== -1) {
    assert.ok(sentenceIdx < requestsIdx,
      'AC-21: [data-wk="sentence"] must render before the side panel\'s [data-wk="requests"] — still inside the stage, not the panel: got sentence@' + sentenceIdx + ' requests@' + requestsIdx)
  }

  // AC-7's disabled rule must CONTINUE TO gate confirm on the last screen too — an open request
  // outranks the walk's own last-screen position.
  const openNote = clientNote({ id: 'X1', scope: 'mock', screen: 'Invite', text: 'still wrong', status: 'open' })
  const htmlLastBlocked = buildWalkPage({ seed, journey: 'onboarding', notes: [openNote], ledger: [], walk: lastWalk, prefix: '' })
  assert.match(htmlLastBlocked, /data-wk="confirm"[^>]*disabled/,
    'AC-21: confirm must stay disabled on the last screen while a request is open (AC-7\'s rule continues to apply): got\n' + htmlLastBlocked)
})

test('AC-20260911-06-22: the retired wk-spine/wk-approve register and the bare-count [data-wk="left"] overwrite carry zero live mentions in the walk player\'s own script/style files', () => {
  const files = [
    'spec/scripts/lib/walk-page.js',
    'spec/scripts/lib/walk.browser.js',
    'spec/templates/mocks/viewer.css',
  ]
  const literals = ['wk-spine', 'wk-approve', 'leftEl.textContent = String(leftCount)']
  for (const rel of files) {
    const src = read(rel)
    for (const lit of literals) {
      assert.ok(!src.includes(lit),
        'AC-22: `grep -n "wk-spine\\|wk-approve\\|leftEl.textContent = String(leftCount)" ' + rel +
        '` must print nothing — the spine, the approve section and the bare-count overwrite are deleted, not orphaned: found "' + lit + '" in ' + rel)
    }
  }
})

test('AC-20260911-06-22: under the vm shim, [data-wk="left"] renders the sentence "Nothing left to check" once the last mark is answered, never overwritten by a bare digit', async () => {
  const { notes, ledger } = openQuestions(1)
  const { document } = await walkThroughRouted({ screens: [{ label: 'signin', states: [] }], notes, ledger })
  const mark = document.querySelector('[data-wk="mark"][data-label="signin"]')
  assert.ok(mark, 'AC-22 setup: one mark must render on signin: got no [data-wk="mark"][data-label="signin"]')
  mark.querySelector('[data-wk="yes"]').click()
  await flush()
  const leftEl = document.querySelector('[data-wk="left"]')
  assert.strictEqual(leftEl.getAttribute('data-count'), '0', 'AC-22 setup: the open count must reach zero: got ' + leftEl.getAttribute('data-count'))
  assert.strictEqual(leftEl.textContent, 'Nothing left to check',
    'AC-22: [data-wk="left"] must render the sentence "Nothing left to check" once nothing is left — never the bare-count overwrite: got "' + leftEl.textContent + '"')
})

// ---------------------------------------------------------------------------
// AC-20260911-01-8
// ---------------------------------------------------------------------------
test('AC-20260911-01-8: a mark\'s answer request resolving ok:true CONTINUES TO hide that mark, decrement [data-wk="left"], and remove disabled from [data-wk="confirm"] once the count reaches zero', async () => {
  const { notes, ledger } = openQuestions(2)
  const { document } = await walkThroughRouted({ screens: [{ label: 'signin', states: [] }], notes, ledger })

  const marks = document.querySelectorAll('[data-wk="mark"][data-label="signin"]')
  assert.strictEqual(marks.length, 2, 'test setup requires two marks on signin')
  for (const m of marks) {
    const yesBtn = m.querySelector('[data-wk="yes"]')
    yesBtn.click()
    await flush()
    assert.strictEqual(m.hidden, true, 'AC-8: an ok:true answer must CONTINUE TO hide the answered mark: got hidden=' + m.hidden)
  }
  const leftEl = document.querySelector('[data-wk="left"]')
  assert.strictEqual(leftEl.getAttribute('data-count'), '0', 'AC-8: [data-wk="left"] must CONTINUE TO decrement to "0": got ' + leftEl.getAttribute('data-count'))
  const confirmBtn = document.querySelector('[data-wk="confirm"]')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), false,
    'AC-8: [data-wk="confirm"] must CONTINUE TO lose its disabled attribute once the count reaches zero: got disabled=' + confirmBtn.hasAttribute('disabled'))
})

// ---------------------------------------------------------------------------
// AC-20260911-01-10
// ---------------------------------------------------------------------------
test('AC-20260911-01-10: a question note carrying answer.verdict: "waived" CONTINUES TO be excluded from the open count buildClientIndex and buildWalkPage render', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }] }],
  }
  const notes = [
    question('N001', 'signin', 'W1', { status: 'resolved', answer: { verdict: 'waived', text: '', by: 'session', at: NOW } }),
  ]
  const ledger = [ledgerRow('W1')]

  // D15 repair: buildClientIndex now renders only journeys in `ready` — onboarding's screen has
  // no on-disk mock in this pure-builder test, so it must be named ready explicitly, or D15
  // filters the row out before this test's own AC-10 assertion ever sees data-guesses.
  const indexHtml = buildClientIndex({ seed, notes, ledger, walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })
  assert.match(indexHtml, /data-guesses="0"/,
    'AC-10: buildClientIndex must exclude a waived question from the open count: got\n' + indexHtml)

  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: { journeys: {} }, prefix: '' })
  assert.match(walkHtml, /data-wk="left"\s+data-count="0"/,
    'AC-10: buildWalkPage must exclude a waived question from [data-wk="left"]\'s open count: got\n' + walkHtml)
  const marks = [...walkHtml.matchAll(/<article[^>]*data-wk="mark"[\s\S]*?<\/article>/g)]
  assert.strictEqual(marks.length, 0,
    'AC-10: buildWalkPage must render no mark for a waived question: got ' + marks.length + ' in\n' + walkHtml)
})

// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D24 — a box the client must type into is never revealed
// by focus alone. The mark's why textarea was the request reopen box's identical defect, its
// last instance: a `:focus-within` CSS rule hid `[data-wk="why"]` and dropped it the moment focus
// left, taking the client's typing with it. The fix makes the script the single owner of
// visibility, exactly as D23 fixed the reopen box. AC-20260911-06-24.
// ---------------------------------------------------------------------------

test('AC-20260911-06-24: buildWalkPage renders a mark\'s why textarea hidden, viewer.css owns none of that visibility, and a first "That\'s not right" press only unhides/focuses the box while a second press with text posts', async () => {
  const { notes, ledger } = openQuestions(1)
  const seed = onboardingSeed([{ label: 'signin', states: [] }])
  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: { journeys: {} }, prefix: '' })
  const whyMatch = walkHtml.match(/<textarea[^>]*data-wk="why"[^>]*>/)
  assert.ok(whyMatch, 'AC-24 setup: buildWalkPage must render a [data-wk="why"] textarea: got\n' + walkHtml)
  assert.match(whyMatch[0], /\bhidden\b/,
    'AC-24: buildWalkPage must render the mark\'s [data-wk="why"] with the hidden attribute: got ' + whyMatch[0])

  const cssRel = 'spec/templates/mocks/viewer.css'
  const css = read(cssRel)
  assert.ok(!/focus-within/.test(css),
    'AC-24: `grep -n "focus-within" spec/templates/mocks/viewer.css` must print nothing — the ' +
    'script is the single owner of the why box\'s visibility, not a CSS focus rule: found "focus-within" in ' + cssRel)

  const harness = await walkThroughRouted({ screens: [{ label: 'signin', states: [] }], notes, ledger })
  const mark = harness.document.querySelector('[data-wk="mark"][data-label="signin"]')
  assert.ok(mark, 'AC-24 setup: one mark must render on signin: got no [data-wk="mark"][data-label="signin"]')
  const whyEl = mark.querySelector('[data-wk="why"]')
  const noBtn = mark.querySelector('[data-wk="no"]')
  assert.strictEqual(whyEl.hidden, true, 'AC-24 setup: the why box must start hidden: got hidden=' + whyEl.hidden)

  noBtn.click()
  await flush()
  assert.strictEqual(whyEl.hidden, false,
    'AC-24: a first "That\'s not right" press must unhide the why box: got hidden=' + whyEl.hidden)
  assert.strictEqual(harness.posts.find((p) => p.url.includes('/client/__notes/answer')), undefined,
    'AC-24: a first press that only reveals the why box must post nothing: got posts=' + JSON.stringify(harness.posts))

  whyEl.value = 'Not how it works'
  noBtn.click()
  await flush()
  const answerPost = harness.posts.find((p) => p.url.includes('/client/__notes/answer'))
  assert.ok(answerPost, 'AC-24: a second press with text must POST /client/__notes/answer: got posts=' + JSON.stringify(harness.posts))
  assert.deepStrictEqual(JSON.parse(answerPost.init.body), { id: 'N001', verdict: 'no', text: 'Not how it works', by: 'client' },
    'AC-24: the answer POST body must carry the typed text: got ' + answerPost.init.body)
})
