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
