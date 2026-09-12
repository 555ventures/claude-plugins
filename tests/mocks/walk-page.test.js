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


// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D23 (the design seat's findings against the rendered
// pages, 2026-09-11). AC-20260911-06-23 named this file as its oracle but no test here ever
// mentioned it — `grep -rn "AC-20260911-06-23" tests/` found nothing and the whole design round
// (the shattered card, the raw slug caption, the reading order, the state text, the home link,
// the state switcher, the reopen/accept wording) was unpinned. Every clause below.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D16/D17 (amended/new, JJ's ruling and Fable's finding,
// both 2026-09-11). D16: an open client request gains a "Never mind" withdraw control on both
// surfaces. D17: the walk page's accept control byte-matches the index's own "Looks good", and
// every request article additionally names its location. AC-20260911-06-16, AC-20260911-06-17.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// specs/20260911/06-the-client-loop.md D16 (amended)/AC-20260911-06-25 (JJ's ruling, 2026-09-11):
// a successful reopen must leave the row in the SAME shape the server renders for an open
// request — the accept/reopen pair and the "See <journey>" link hidden, the why textarea hidden
// AND cleared (its text is already sent), and the withdraw control revealed — on both surfaces.
// ---------------------------------------------------------------------------


test('AC-20260911-06-26: buildClientIndex and buildWalkPage render an open note\'s thread as "We\'ll look at this again" plus a [class~="wk-req-again"] "You said: …" line, and render plain "We\'ll look at this" with no such element when the note carries no thread', () => {
  const seed = onboardingSeed([{ label: 'invite', states: [] }])
  const openNoThread = clientNote({ id: 'N060', scope: 'mock', screen: 'invite', text: 'Wrong color', status: 'open' })
  const openWithThread = clientNote({
    id: 'N061', scope: 'mock', screen: 'invite', text: 'Wrong copy', status: 'open',
    addressed: null,
    thread: [
      { at: '2026-09-10T10:00:00.000Z', text: 'Please fix the color', by: 'client', addressed: { at: NOW, change: 'Changed the color', ledgerRow: null } },
      { at: '2026-09-11T10:00:00.000Z', text: 'Still says Submit', by: 'client', addressed: { at: NOW, change: 'Renamed the button', ledgerRow: null } },
    ],
  })

  const indexHtml = buildClientIndex({
    seed, notes: [openNoThread, openWithThread], ledger: [], walk: { journeys: {} }, prefix: '', ready: new Set(['onboarding']),
  })
  const indexArticles = [...indexHtml.matchAll(/<article[^>]*data-cl="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const indexNoThread = indexArticles.find((a) => a.includes('data-id="N060"'))
  const indexWithThread = indexArticles.find((a) => a.includes('data-id="N061"'))
  assert.ok(indexNoThread && indexWithThread, 'AC-26 setup: both open notes must render as request articles: got\n' + indexHtml)
  assert.match(indexNoThread, /<p class="wk-req-status">We'll look at this<\/p>/,
    'AC-26: a threadless open note must read plain "We\'ll look at this": got\n' + indexNoThread)
  assert.match(indexNoThread, /<p class="wk-req-again" hidden><\/p>/,
    'AC-26: a threadless open note must render [class~="wk-req-again"] hidden and empty, never omitted: got\n' + indexNoThread)
  assert.match(indexWithThread, /<p class="wk-req-status">We'll look at this again<\/p>/,
    'AC-26: an open note whose thread carries a client reopen must read "We\'ll look at this again": got\n' + indexWithThread)
  assert.match(indexWithThread, /<p class="wk-req-again">You said: Still says Submit<\/p>/,
    'AC-26: the again line must read "You said: <the LATEST thread entry\'s text>", not the first: got\n' + indexWithThread)
  assert.doesNotMatch(indexWithThread, /Done:/,
    'AC-26: the superseded "Done: …" line must not render once the note is open again: got\n' + indexWithThread)

  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [openNoThread, openWithThread], ledger: [], walk: { journeys: {} }, prefix: '' })
  const walkArticles = [...walkHtml.matchAll(/<article[^>]*data-wk="request"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const walkNoThread = walkArticles.find((a) => a.includes('data-id="N060"'))
  const walkWithThread = walkArticles.find((a) => a.includes('data-id="N061"'))
  assert.ok(walkNoThread && walkWithThread, 'AC-26 setup: buildWalkPage must render both request cards: got\n' + walkHtml)
  assert.match(walkNoThread, /<p class="wk-req-status">We'll look at this<\/p>/,
    'AC-26: the walk page\'s threadless open card must read plain "We\'ll look at this": got\n' + walkNoThread)
  assert.match(walkWithThread, /<p class="wk-req-status">We'll look at this again<\/p>/,
    'AC-26: the walk page\'s open card with a thread must read "We\'ll look at this again": got\n' + walkWithThread)
  assert.match(walkWithThread, /<p class="wk-req-again">You said: Still says Submit<\/p>/,
    'AC-26: the walk page\'s again line must match the index\'s own — byte-identical rendering: got\n' + walkWithThread)
  assert.doesNotMatch(walkWithThread, /Fixed:/,
    'AC-26: the walk page\'s superseded "Fixed: …" line must not render once the note is open again: got\n' + walkWithThread)
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


// ---------------------------------------------------------------------------
// specs/20260912/01-the-card-explains-itself.md D1/D2/D3/D4/D6 — the exclusions card gains a
// heading, a lead, per-row provenance and a state sentence, and viewer.css gains the rules that
// style them. Unbuilt against the pre-image: renderExclusion emits no heading, no lead, no
// provenance line and no state sentence, and viewer.css carries none of the six new `.wk-excl*`
// rules. AC-20260912-01-1, -2, -3, -4, -5, -6, -10.
// ---------------------------------------------------------------------------

function exclusionsSection(html) {
  const m = /<section[^>]*data-wk="exclusions"[^>]*>([\s\S]*?)<\/section>/.exec(html)
  return m ? m[1] : null
}
function exclusionArticles(html) {
  return [...html.matchAll(/<article[^>]*data-wk="exclusion"[\s\S]*?<\/article>/g)].map((m) => m[0])
}
function oneScreenSeed(labels) {
  return {
    product: 'Hearwell',
    journeys: [{ name: 'onboarding', title: 'Onboarding', screens: labels.map((label) => ({ label, states: [] })) }],
  }
}
function exclRow(id, extra) {
  return ledgerRow(id, Object.assign({ kind: 'exclusion', claim: 'a claim', note: 'non-goal: a claim', status: 'open', rejected: null }, extra))
}

