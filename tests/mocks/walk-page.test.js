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
// AC-20260910-03-1
// ---------------------------------------------------------------------------
test('AC-20260910-03-1: buildClientIndex renders exactly one [data-cl="journey"] anchor per seed journey in seed order, carrying href/data-guesses (the open-question count on that journey\'s screens)/data-confirmed (from walk.json), the notes-route meta, no data-rv="board", and byte-identical output across two calls over the same input', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [
      { name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }, { label: 'invite', states: [] }] },
      { name: 'billing', title: 'Billing', screens: [{ label: 'plan', states: [] }] },
    ],
  }
  const notes = [
    question('N001', 'signin', 'W1'),
    question('N002', 'signin', 'W2'),
    question('N003', 'invite', 'W3'),
  ]
  const ledger = [ledgerRow('W1'), ledgerRow('W2'), ledgerRow('W3')]
  const walk = { journeys: { billing: { reached: ['plan'], misses: [], confirmedAt: NOW, sentence: '設定完了', waived: null } } }

  const input = { seed, notes, ledger, walk, prefix: '', lang: 'en' }
  const html1 = buildClientIndex(input)
  const html2 = buildClientIndex(input)
  assert.strictEqual(html1, html2,
    'AC-1: buildClientIndex must be byte-deterministic across two calls over the same input — a client-facing page that reflows on every request cannot be trusted as evidence')

  const anchorCount = (html1.match(/data-cl="journey"/g) || []).length
  assert.strictEqual(anchorCount, 2,
    'AC-1: exactly one [data-cl="journey"] anchor must render per seed journey (2 declared): got ' + anchorCount + ' in\n' + html1)

  assert.match(html1, /href="\/client\/walk\/onboarding\.html" data-guesses="3" data-confirmed="false"/,
    'AC-1: onboarding\'s anchor must carry href="/client/walk/onboarding.html" data-guesses="3" (its 3 open questions) data-confirmed="false" (absent from walk.json): got\n' + html1)
  assert.match(html1, /href="\/client\/walk\/billing\.html" data-guesses="0" data-confirmed="true"/,
    'AC-1: billing\'s anchor must carry href="/client/walk/billing.html" data-guesses="0" (no open questions) data-confirmed="true" (walk.json confirms it): got\n' + html1)

  const onboardingIdx = html1.indexOf('walk/onboarding.html')
  const billingIdx = html1.indexOf('walk/billing.html')
  assert.ok(onboardingIdx !== -1 && billingIdx !== -1 && onboardingIdx < billingIdx,
    'AC-1: the two anchors must render in seed order (onboarding before billing): got onboarding at ' + onboardingIdx + ', billing at ' + billingIdx)

  assert.ok(html1.includes('<meta name="notes-route" content="client">'),
    'AC-1: every client page must carry <meta name="notes-route" content="client">: got\n' + html1)
  assert.ok(!html1.includes('data-rv="board"'),
    'AC-1: the client index is not the session\'s review page — it must never carry a data-rv="board" artboard: got\n' + html1)
})

// ---------------------------------------------------------------------------
// AC-20260910-03-2
// ---------------------------------------------------------------------------
test('AC-20260910-03-2: buildWalkPage renders a src-less frame, one thumb per screen in seed order carrying the mock\'s declared states, one mark per open question on the current screen with its yes/no/why controls, the journey-wide open-question count, a hidden approve section holding confirm, and no author input; over a confirmed journey it renders the sentence read-only with no confirm control', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [{
      name: 'onboarding', title: 'Onboarding',
      screens: [{ label: 'signin', states: ['empty', 'error'] }, { label: 'invite', states: [] }, { label: 'consent', states: [] }, { label: 'session-live', states: [] }],
    }],
  }
  const notes = [
    question('N001', 'signin', 'W1'),
    question('N002', 'signin', 'W2'),
    question('N003', 'signin', 'W3', { status: 'resolved', answer: { verdict: 'yes', text: '', by: 'client', at: NOW } }),
  ]
  const ledger = [ledgerRow('W1'), ledgerRow('W2'), ledgerRow('W3')]
  const openWalk = { journeys: { onboarding: { reached: [], misses: [], confirmedAt: null, sentence: null, waived: null } } }

  const html = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: openWalk, prefix: '', lang: 'en' })

  const frameTag = (html.match(/<iframe[^>]*data-wk="frame"[^>]*>/) || [])[0]
  assert.ok(frameTag, 'AC-2: the page must carry one <iframe data-wk="frame">: got none in\n' + html)
  assert.ok(!/\bsrc\s*=/.test(frameTag),
    'AC-2: the frame must carry no src attribute — the browser script sets it, not the builder: got ' + frameTag)

  const thumbs = [...html.matchAll(/<button[^>]*data-wk="thumb"[^>]*>/g)].map((m) => m[0])
  assert.strictEqual(thumbs.length, 4, 'AC-2: one [data-wk="thumb"] must render per screen (4 declared): got ' + thumbs.length + ' in\n' + html)
  assert.match(thumbs[0], /data-label="signin"/, 'AC-2: the first thumb must be signin (seed order): got ' + thumbs[0])
  assert.match(thumbs[0], /data-states="empty,error"/, 'AC-2: signin\'s thumb must carry its declared states as data-states="empty,error": got ' + thumbs[0])
  assert.match(thumbs[3], /data-label="session-live"/, 'AC-2: the last thumb must be session-live (seed order): got ' + thumbs[3])

  const marks = [...html.matchAll(/<article[^>]*data-wk="mark"[\s\S]*?<\/article>/g)].map((m) => m[0])
  const signinMarks = marks.filter((m) => /data-label="signin"/.test(m))
  assert.strictEqual(signinMarks.length, 2,
    'AC-2: exactly one [data-wk="mark"] must render per OPEN question anchored to signin (2 open, 1 resolved must not render): got ' + signinMarks.length + ' in\n' + html)
  for (const m of signinMarks) {
    assert.match(m, /data-wk="yes"/, 'AC-2: each mark must carry a [data-wk="yes"] control: got ' + m)
    assert.match(m, /data-wk="no"/, 'AC-2: each mark must carry a [data-wk="no"] control: got ' + m)
    assert.match(m, /data-wk="why"/, 'AC-2: each mark must carry a [data-wk="why"] free-text reason control: got ' + m)
  }

  assert.match(html, /data-wk="left"\s+data-count="2"/,
    'AC-2: [data-wk="left"] must carry data-count="2" — the journey\'s total open-question count (2 open on signin, 0 elsewhere): got\n' + html)

  const approveTag = (html.match(/<section[^>]*data-wk="approve"[^>]*>/) || [])[0]
  assert.ok(approveTag, 'AC-2: the page must carry one <section data-wk="approve">: got none in\n' + html)
  assert.ok(/hidden/.test(approveTag), 'AC-2: the approve section must render hidden until the journey is walked to its end: got ' + approveTag)
  assert.ok(html.includes('data-wk="confirm"'), 'AC-2: the approve section must carry a [data-wk="confirm"] control while unconfirmed: got\n' + html)

  assert.ok(!/author/i.test(html), 'AC-2/D3: the client route never prompts for an author name — the literal "author" must not occur anywhere on the page: got\n' + html)

  const sentence = '招待を送って、同意をもらって、セッションを始めた'
  const confirmedWalk = { journeys: { onboarding: { reached: ['signin', 'invite', 'consent', 'session-live'], misses: [], confirmedAt: NOW, sentence, waived: null } } }
  const confirmedHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: confirmedWalk, prefix: '', lang: 'en' })
  const approveIdx = confirmedHtml.indexOf('data-wk="approve"')
  const approveEndIdx = confirmedHtml.indexOf('</section>', approveIdx)
  const approveBlock = confirmedHtml.slice(approveIdx, approveEndIdx)
  assert.ok(approveBlock.includes(sentence),
    'AC-2: once confirmedAt is set, the approve section must render the recorded sentence read-only: got\n' + approveBlock)
  assert.ok(!approveBlock.includes('data-wk="confirm"'),
    'AC-2: a confirmed journey must render no [data-wk="confirm"] control — there is nothing left to confirm: got\n' + approveBlock)
})

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

function runWalkBrowser(html, stateStub) {
  const src = fs.readFileSync(path.join(SPEC, 'scripts/lib/walk.browser.js'), 'utf8')
  const document = parseFlatDom(html)
  const posts = []
  const messageHandlers = []
  const sandbox = {
    document,
    window: {
      prompt: () => { throw new Error('AC-3: window.prompt must never be called — the client route never asks for an author name') },
      addEventListener(type, fn) { if (type === 'message') messageHandlers.push(fn) },
    },
    location: { pathname: '/client/walk/onboarding.html', origin: 'http://localhost:5173' },
    fetch(url, init) {
      if (String(url).includes('/client/__walk/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(stateStub) })
      }
      posts.push({ url: String(url), init })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  const fireMessage = async (data) => {
    for (const h of messageHandlers) h({ data })
    await Promise.resolve(); await Promise.resolve()
  }
  return { document, posts, fireMessage }
}

// ---------------------------------------------------------------------------
// AC-20260910-03-3
// ---------------------------------------------------------------------------
test('AC-20260910-03-3: walk.browser.js under vm derives the current screen from the fetched state\'s last reached label, shows only that screen\'s marks, moves the frame and posts /client/__walk/event on a "to" message, posts (without moving) on a "miss" message, unhides approve and enables confirm once reached carries the journey\'s last label with zero open guesses, and posts /client/__notes/answer as by:"client" from a mark\'s yes control with no author prompt', async () => {
  const seed = {
    product: 'Hearwell',
    journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }, { label: 'invite', states: [] }, { label: 'consent', states: [] }] }],
  }

  // ---- marks/navigation leg: one open question on invite, reached not yet at the last label ----
  const notes = [question('N001', 'invite', 'W1')]
  const ledger = [ledgerRow('W1')]
  const navWalk = { journeys: { onboarding: { reached: [], misses: [], confirmedAt: null, sentence: null, waived: null } } }
  const navHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: navWalk, prefix: '', lang: 'en' })
  const { document: navDoc, posts: navPosts, fireMessage: fireNav } = runWalkBrowser(navHtml, { reached: ['signin', 'invite'], misses: [], confirmedAt: null, sentence: null })
  await Promise.resolve(); await Promise.resolve()

  const frame = navDoc.querySelector('[data-wk="frame"]')
  assert.ok(frame && frame.src && frame.src.includes('/mocks/invite.html?clean&walk'),
    'AC-3: with reached ending in "invite", the frame src must be set to /mocks/invite.html?clean&walk (the last-reached screen): got ' + (frame && frame.src))

  const inviteMark = navDoc.querySelector('[data-wk="mark"][data-label="invite"]')
  assert.ok(inviteMark && !inviteMark.hidden, 'AC-3: the current screen\'s (invite) mark must be shown: got hidden=' + (inviteMark && inviteMark.hidden))
  const approveEl = navDoc.querySelector('[data-wk="approve"]')
  assert.ok(approveEl && approveEl.hidden, 'AC-3: approve must stay hidden while reached does not yet carry the journey\'s last label (consent): got hidden=' + (approveEl && approveEl.hidden))

  await fireNav({ walk: 'to', from: 'invite', to: 'consent' })
  const toPost = navPosts.find((p) => p.url.includes('/client/__walk/event'))
  assert.ok(toPost, 'AC-3: a "to" message must POST /client/__walk/event: got ' + JSON.stringify(navPosts.map((p) => p.url)))
  assert.deepStrictEqual(JSON.parse(toPost.init.body), { journey: 'onboarding', walk: 'to', from: 'invite', to: 'consent' },
    'AC-3: the posted event body must carry the message verbatim: got ' + toPost.init.body)
  assert.ok(frame.src.includes('/mocks/consent.html?clean&walk'),
    'AC-3: a "to" message must move the frame to the target screen: got ' + frame.src)

  const srcAfterTo = frame.src
  const postsAfterTo = navPosts.length
  await fireNav({ walk: 'miss', from: 'consent', target: 'button#help Need help?' })
  assert.strictEqual(navPosts.length, postsAfterTo + 1, 'AC-3: a "miss" message must still POST the event: got ' + (navPosts.length - postsAfterTo) + ' new post(s)')
  assert.strictEqual(frame.src, srcAfterTo, 'AC-3: a "miss" message must leave the frame src unchanged: got ' + frame.src + ' (was ' + srcAfterTo + ')')

  const yesBtn = inviteMark.querySelector('[data-wk="yes"]')
  assert.ok(yesBtn, 'test setup requires the invite mark to carry a [data-wk="yes"] control')
  yesBtn.click()
  await Promise.resolve(); await Promise.resolve()
  const answerPost = navPosts.find((p) => p.url.includes('/client/__notes/answer'))
  assert.ok(answerPost, 'AC-3: clicking a mark\'s [data-wk="yes"] must POST /client/__notes/answer: got ' + JSON.stringify(navPosts.map((p) => p.url)))
  const answerBody = JSON.parse(answerPost.init.body)
  assert.strictEqual(answerBody.id, 'N001', 'AC-3: the answer POST must carry the mark\'s note id: got ' + answerPost.init.body)
  assert.strictEqual(answerBody.verdict, 'yes', 'AC-3: a click on [data-wk="yes"] must post verdict "yes": got ' + answerPost.init.body)
  assert.strictEqual(answerBody.by, 'client', 'AC-3: every client-route answer must be stamped by:"client" — no author prompt is ever called: got ' + answerPost.init.body)

  // ---- unlock leg: zero open guesses, reached already carries the journey's last label ----
  const unlockWalk = { journeys: { onboarding: { reached: ['signin', 'invite', 'consent'], misses: [], confirmedAt: null, sentence: null, waived: null } } }
  const unlockHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: unlockWalk, prefix: '', lang: 'en' })
  const { document: unlockDoc } = runWalkBrowser(unlockHtml, unlockWalk.journeys.onboarding)
  await Promise.resolve(); await Promise.resolve()
  const approveEl2 = unlockDoc.querySelector('[data-wk="approve"]')
  assert.ok(approveEl2 && !approveEl2.hidden,
    'AC-3: once reached carries the journey\'s last label (consent), approve must unhide: got hidden=' + (approveEl2 && approveEl2.hidden))
  const confirmBtn = unlockDoc.querySelector('[data-wk="confirm"]')
  assert.ok(confirmBtn, 'test setup requires a [data-wk="confirm"] control on an unconfirmed journey')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), false,
    'AC-3: with [data-wk="left"] at zero, [data-wk="confirm"] must be enabled (no "disabled" attribute): got disabled=' + confirmBtn.hasAttribute('disabled'))
})
