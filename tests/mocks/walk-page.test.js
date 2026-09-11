'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { SPEC } = require('../helpers')

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
// specs/20260911/04-the-client-loop.md D1/D4/D5/D6 — journeyState-driven index/walk-page
// rendering (D4/D5) and the client's own return-leg controls (D6). Unbuilt against the
// pre-image: buildClientIndex renders no composer/request list at all, buildWalkPage renders no
// request cards at all, and walk.browser.js's index-page handlers do not exist (the script
// no-ops on a page with no `[data-journey]` root). Every test below is red until D4/D5/D6 land.
// AC-20260911-04-6, -7, -8, -9.
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

test('AC-20260911-04-6: buildClientIndex renders a journey\'s derived state, the "something missing?" composer, and every client request with its own status line and controls, newest first, session-origin excluded', () => {
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

  const formMatch = /<form[^>]*data-cl="ask"[\s\S]*?<\/form>/.exec(html)
  assert.ok(formMatch, 'AC-6: buildClientIndex must render <form data-cl="ask"> (the "Something missing?" composer): got\n' + html)
  assert.match(formMatch[0], /<textarea/, 'AC-6: the ask form must carry a textarea: got\n' + formMatch[0])
  const chips = [...formMatch[0].matchAll(/data-cl="reason"[^>]*data-value="([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepStrictEqual(chips, ['missing-screen', 'other'],
    'AC-6: the ask form must carry exactly the two reason chips missing-screen/other: got ' + JSON.stringify(chips))

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

test('AC-20260911-04-7: buildWalkPage renders one request card per client note on the journey, and the approve lead/disabled state and read-only confirmed render all follow the derived journey state', () => {
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

test('AC-20260911-04-8: under the vm shim, the client index\'s ask form posts a project-scope request through the server and only inserts a new request article on ok:true', async () => {
  const seed = { product: 'Hearwell', journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'invite', states: [] }] }] }
  const html = buildClientIndex({ seed, notes: [], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']) })

  const { document, posts } = runIndexBrowser(html, {
    '/client/__notes/add': { ok: true, json: () => Promise.resolve({ id: 'N007' }) },
  })
  const askForm = document.querySelector('[data-cl="ask"]')
  assert.ok(askForm, 'AC-8: buildClientIndex must render <form data-cl="ask">: got\n' + html)
  const textarea = askForm.querySelector('textarea')
  const chip = document.querySelector('[data-cl="reason"][data-value="missing-screen"]')
  assert.ok(chip, 'AC-8: the missing-screen reason chip must render: got\n' + html)
  textarea.value = 'No reset screen'
  chip.click()
  askForm.submit()
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

  const { document: doc2, posts: posts2 } = runIndexBrowser(html, {
    '/client/__notes/add': { ok: false, json: () => Promise.resolve({}) },
  })
  const askForm2 = doc2.querySelector('[data-cl="ask"]')
  const textarea2 = askForm2.querySelector('textarea')
  textarea2.value = 'No reset screen'
  askForm2.submit()
  await flush()
  assert.strictEqual(textarea2.value, 'No reset screen', 'AC-8: an ok:false save must keep the typed text: got "' + textarea2.value + '"')
  assert.strictEqual(doc2.querySelectorAll('[data-cl="request"]').length, 0, 'AC-8: an ok:false save must insert nothing: got ' + doc2.querySelectorAll('[data-cl="request"]').length)
  const msgEl2 = doc2.querySelector('[data-wk="msg"]')
  assert.strictEqual(msgEl2.textContent, msgEl2.getAttribute('data-failed'),
    'AC-8: an ok:false save must show the data-failed text: got "' + msgEl2.textContent + '" (posts=' + JSON.stringify(posts2) + ')')
})

test('AC-20260911-04-9: under the vm shim on the walk page, accept/reopen post their own routes, update the request card in place, and recompute confirm\'s disabled state', async () => {
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

  const indexHtml = buildClientIndex({ seed, notes, ledger, walk: { journeys: {} }, prefix: '' })
  assert.match(indexHtml, /data-guesses="0"/,
    'AC-10: buildClientIndex must exclude a waived question from the open count: got\n' + indexHtml)

  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: { journeys: {} }, prefix: '' })
  assert.match(walkHtml, /data-wk="left"\s+data-count="0"/,
    'AC-10: buildWalkPage must exclude a waived question from [data-wk="left"]\'s open count: got\n' + walkHtml)
  const marks = [...walkHtml.matchAll(/<article[^>]*data-wk="mark"[\s\S]*?<\/article>/g)]
  assert.strictEqual(marks.length, 0,
    'AC-10: buildWalkPage must render no mark for a waived question: got ' + marks.length + ' in\n' + walkHtml)
})
