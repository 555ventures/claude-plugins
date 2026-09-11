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

  const input = { seed, notes, ledger, walk, prefix: '' }
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

  const html = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: openWalk, prefix: '' })

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
  const confirmedHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: confirmedWalk, prefix: '' })
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
  const navHtml = buildWalkPage({ seed, journey: 'onboarding', notes, ledger, walk: navWalk, prefix: '' })
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
  const unlockHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: unlockWalk, prefix: '' })
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

// ---------------------------------------------------------------------------
// specs/20260911/01-the-page-waits-for-the-server.md D1 (STRINGS flattens, stringsFor and the
// `lang` param are deleted), D2 (design-atlas.js stops reading/passing lang — this file only
// pins that the builders ignore it even if a caller still passes one), D3 (the [data-wk="msg"]
// slot) and D4 (walk.browser.js acts only on the server's answer). Unbuilt: every test below is
// red against the pre-image walk-page.js/walk.browser.js. AC-20260911-01-1, -2, -3, -4, -5, -6,
// -8, -10.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AC-20260911-01-1
// ---------------------------------------------------------------------------
test('AC-20260911-01-1: lib/walk-page.js exports a STRINGS object with no "ja" key and no "en" key, holding the English strings at its top level, and exports no stringsFor', () => {
  assert.strictEqual(walkPageLib.stringsFor, undefined,
    'AC-1: walk-page.js must export no stringsFor — the two-language lookup this spec deletes: got ' + typeof walkPageLib.stringsFor)
  const { STRINGS } = walkPageLib
  assert.ok(STRINGS && typeof STRINGS === 'object', 'AC-1: STRINGS must be exported as an object: got ' + typeof STRINGS)
  assert.strictEqual(STRINGS.ja, undefined,
    'AC-1: STRINGS must carry no "ja" sub-table now that the chrome is English-only: got ' + JSON.stringify(STRINGS.ja))
  assert.strictEqual(STRINGS.en, undefined,
    'AC-1: STRINGS must carry no "en" sub-table — the former STRINGS.en strings flatten to the top level: got ' + JSON.stringify(STRINGS.en))
  assert.strictEqual(STRINGS.confirm, 'Confirm this journey',
    'AC-1: STRINGS.confirm must hold the flattened English string at the top level: got ' + JSON.stringify(STRINGS.confirm))
})

// ---------------------------------------------------------------------------
// AC-20260911-01-2
// ---------------------------------------------------------------------------
test('AC-20260911-01-2: buildClientIndex and buildWalkPage render no character in the Hiragana/Katakana or CJK ranges and open <html lang="en"> even when the caller passes lang: "ja"', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }] }],
  }
  const jpRange = /[぀-ヿ一-龯]/
  const indexHtml = buildClientIndex({ seed, notes: [], ledger: [], walk: { journeys: {} }, prefix: '', lang: 'ja' })
  assert.ok(!jpRange.test(indexHtml),
    'AC-2: buildClientIndex must emit no Japanese character even when the caller passes lang: "ja" — the fork is retired, not merely defaulted: got\n' + indexHtml)
  assert.match(indexHtml, /^<!doctype html>\n<html lang="en">/,
    'AC-2: buildClientIndex must open <html lang="en">: got\n' + indexHtml.slice(0, 80))

  const walkHtml = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: { journeys: {} }, prefix: '', lang: 'ja' })
  assert.ok(!jpRange.test(walkHtml),
    'AC-2: buildWalkPage must emit no Japanese character even when the caller passes lang: "ja": got\n' + walkHtml)
  assert.match(walkHtml, /^<!doctype html>\n<html lang="en">/,
    'AC-2: buildWalkPage must open <html lang="en">: got\n' + walkHtml.slice(0, 80))
})

// ---------------------------------------------------------------------------
// AC-20260911-01-3
// ---------------------------------------------------------------------------
test('AC-20260911-01-3: buildWalkPage renders exactly one [data-wk="msg"] element, hidden, with empty text content and both data-why and data-failed non-empty', () => {
  const seed = {
    product: 'Hearwell',
    journeys: [{ name: 'onboarding', title: 'Onboarding', screens: [{ label: 'signin', states: [] }] }],
  }
  const html = buildWalkPage({ seed, journey: 'onboarding', notes: [], ledger: [], walk: { journeys: {} }, prefix: '' })
  const msgs = [...html.matchAll(/<p[^>]*data-wk="msg"[^>]*>([\s\S]*?)<\/p>/g)]
  assert.strictEqual(msgs.length, 1,
    'AC-3: exactly one [data-wk="msg"] element must render: got ' + msgs.length + ' in\n' + html)
  const inner = msgs[0][1]
  const tag = msgs[0][0]
  assert.match(tag, /\bhidden\b/, 'AC-3: the msg slot must render hidden at build time: got ' + tag)
  assert.strictEqual(inner, '', 'AC-3: the msg slot must render with empty text content at build time: got ' + JSON.stringify(inner))
  const why = /data-why="([^"]*)"/.exec(tag)
  const failed = /data-failed="([^"]*)"/.exec(tag)
  assert.ok(why && why[1], 'AC-3: the msg slot must carry a non-empty data-why attribute: got ' + tag)
  assert.ok(failed && failed[1], 'AC-3: the msg slot must carry a non-empty data-failed attribute: got ' + tag)
})

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
// AC-20260911-01-4
// ---------------------------------------------------------------------------
test('AC-20260911-01-4: pressing a mark\'s no control while its own [data-wk="why"] holds only whitespace issues no request at all, leaves the mark visible, leaves [data-wk="left"] unchanged, leaves [data-wk="confirm"] disabled, and shows the slot\'s own data-why value', async () => {
  const { notes, ledger } = openQuestions(1)
  const { document, posts } = await walkThroughRouted({ screens: [{ label: 'signin', states: [] }], notes, ledger })

  const mark = document.querySelector('[data-wk="mark"][data-label="signin"]')
  assert.ok(mark, 'test setup requires a mark to render on signin')
  const whyEl = mark.querySelector('[data-wk="why"]')
  assert.ok(whyEl, 'test setup requires the mark to carry a [data-wk="why"] control')
  whyEl.value = '   '
  const noBtn = mark.querySelector('[data-wk="no"]')
  assert.ok(noBtn, 'test setup requires the mark to carry a [data-wk="no"] control')
  noBtn.click()
  await flush()

  assert.strictEqual(posts.length, 0,
    'AC-4: pressing no with a whitespace-only reason must issue no request at all: got ' + JSON.stringify(posts.map((p) => p.url)))
  assert.strictEqual(mark.hidden, false, 'AC-4: the mark must stay visible: got hidden=' + mark.hidden)
  const leftEl = document.querySelector('[data-wk="left"]')
  assert.strictEqual(leftEl.getAttribute('data-count'), '1', 'AC-4: [data-wk="left"]\'s data-count must stay unchanged: got ' + leftEl.getAttribute('data-count'))
  const confirmBtn = document.querySelector('[data-wk="confirm"]')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), true, 'AC-4: [data-wk="confirm"] must stay disabled: got disabled=' + confirmBtn.hasAttribute('disabled'))
  const msgEl = document.querySelector('[data-wk="msg"]')
  assert.ok(msgEl, 'AC-4: the page must carry a [data-wk="msg"] slot for the rejection to show in')
  assert.strictEqual(msgEl.hidden, false, 'AC-4: the msg slot must unhide to show the rejection: got hidden=' + msgEl.hidden)
  assert.strictEqual(msgEl.textContent, msgEl.getAttribute('data-why'),
    'AC-4: the msg slot\'s text must be set to its own data-why value: got ' + JSON.stringify(msgEl.textContent))
})

// ---------------------------------------------------------------------------
// AC-20260911-01-5
// ---------------------------------------------------------------------------
test('AC-20260911-01-5: a mark\'s answer request resolving ok:false leaves the mark visible, leaves [data-wk="left"] unchanged, leaves [data-wk="confirm"] disabled, and shows the slot\'s own data-failed value', async () => {
  const { notes, ledger } = openQuestions(2)
  const { document, posts } = await walkThroughRouted({
    screens: [{ label: 'signin', states: [] }], notes, ledger,
    routes: { '/client/__notes/answer': { ok: false } },
  })

  const leftElBefore = document.querySelector('[data-wk="left"]')
  assert.strictEqual(leftElBefore.getAttribute('data-count'), '2', 'test setup requires two open marks (data-count="2")')

  const marks = document.querySelectorAll('[data-wk="mark"][data-label="signin"]')
  const mark0 = marks[0]
  const yesBtn = mark0.querySelector('[data-wk="yes"]')
  assert.ok(yesBtn, 'test setup requires the mark to carry a [data-wk="yes"] control')
  yesBtn.click()
  await flush()

  assert.ok(posts.some((p) => p.url.includes('/client/__notes/answer')),
    'AC-5: clicking yes must still POST /client/__notes/answer even though the answer will fail: got ' + JSON.stringify(posts.map((p) => p.url)))
  assert.strictEqual(mark0.hidden, false, 'AC-5: on a non-ok answer the mark must stay visible: got hidden=' + mark0.hidden)
  const leftEl = document.querySelector('[data-wk="left"]')
  assert.strictEqual(leftEl.getAttribute('data-count'), '2',
    'AC-5: on a non-ok answer [data-wk="left"]\'s data-count must stay unchanged (data-count="2" -> "2"): got ' + leftEl.getAttribute('data-count'))
  const confirmBtn = document.querySelector('[data-wk="confirm"]')
  assert.strictEqual(confirmBtn.hasAttribute('disabled'), true, 'AC-5: [data-wk="confirm"] must stay disabled: got disabled=' + confirmBtn.hasAttribute('disabled'))
  const msgEl = document.querySelector('[data-wk="msg"]')
  assert.ok(msgEl, 'AC-5: the page must carry a [data-wk="msg"] slot for the failure to show in')
  assert.strictEqual(msgEl.textContent, msgEl.getAttribute('data-failed'),
    'AC-5: the msg slot\'s text must be set to its own data-failed value on a non-ok answer: got ' + JSON.stringify(msgEl.textContent))
})

// ---------------------------------------------------------------------------
// AC-20260911-01-6
// ---------------------------------------------------------------------------
test('AC-20260911-01-6: the free-note request and a walk-event "to" request resolving ok:false both show the slot\'s data-failed value; the note textarea keeps its text, and approve stays hidden even when the failed "to" message named the journey\'s last label', async () => {
  const screens = [{ label: 'signin', states: [] }, { label: 'invite', states: [] }]

  // ---- leg 1: the free note --------------------------------------------------------------
  const { document: doc1, posts: posts1 } = await walkThroughRouted({
    screens, reached: ['signin'], routes: { '/client/__notes/add': { ok: false } },
  })
  const noteForm = doc1.querySelector('[data-wk="note"]')
  const textarea = noteForm.querySelector('textarea')
  assert.ok(textarea, 'test setup requires the note form to carry a textarea')
  textarea.value = 'a real note'
  noteForm.submit()
  await flush()
  assert.ok(posts1.some((p) => p.url.includes('/client/__notes/add')),
    'AC-6: submitting the note form must still POST /client/__notes/add even though it will fail: got ' + JSON.stringify(posts1.map((p) => p.url)))
  assert.strictEqual(textarea.value, 'a real note',
    'AC-6: on a non-ok note save the textarea must keep its text, not clear: got ' + JSON.stringify(textarea.value))
  const msg1 = doc1.querySelector('[data-wk="msg"]')
  assert.ok(msg1, 'AC-6: the page must carry a [data-wk="msg"] slot for the note failure to show in')
  assert.strictEqual(msg1.textContent, msg1.getAttribute('data-failed'),
    'AC-6: a failed note save must show the slot\'s own data-failed value: got ' + JSON.stringify(msg1.textContent))

  // ---- leg 2: a "to" event landing on the journey's last label, refused server-side -----
  const { document: doc2, posts: posts2, fireMessage } = await walkThroughRouted({
    screens, reached: ['signin'], routes: { '/client/__walk/event': { ok: false } },
  })
  await fireMessage({ walk: 'to', from: 'signin', to: 'invite' })
  assert.ok(posts2.some((p) => p.url.includes('/client/__walk/event')),
    'AC-6: a "to" message must still POST /client/__walk/event even though it will fail: got ' + JSON.stringify(posts2.map((p) => p.url)))
  const approveEl = doc2.querySelector('[data-wk="approve"]')
  assert.ok(approveEl, 'test setup requires an approve section to render')
  assert.strictEqual(approveEl.hidden, true,
    'AC-6: a failed "to" event naming the journey\'s last label must leave approve hidden — reachedSoFar must stay untouched on a refusal: got hidden=' + approveEl.hidden)
  const msg2 = doc2.querySelector('[data-wk="msg"]')
  assert.ok(msg2, 'AC-6: the page must carry a [data-wk="msg"] slot for the event failure to show in')
  assert.strictEqual(msg2.textContent, msg2.getAttribute('data-failed'),
    'AC-6: a failed "to" event must show the slot\'s own data-failed value: got ' + JSON.stringify(msg2.textContent))
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
