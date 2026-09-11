// walk.browser.js — served verbatim as GET /__walk/player.js by design-atlas.js, loaded by
// every page lib/walk-page.js builds (never injected into a mock itself — walk-mode.browser.js's
// own postMessage reporter, injected into the mock under `?walk`, is the other half of this
// pair; this script only listens for its messages).
// specs/20260910/03-client-journey-player.md D3 (this script's own behavior — the frame src, the
// mark visibility, the walk-to-unlock check, the four POST routes it drives), D1 (the markup
// contract it reads: [data-journey]/[data-prefix]/[data-theme] on the page's own root element,
// [data-wk="…"] hooks on frame/rail/thumb/pos/back/next/states/mark/yes/no/why/left/note/
// approve/sentence/confirm).
//
// On load: fetches <prefix>/client/__walk/state?journey=<j> (the server's own walk record — the
// one source of truth for what survives a reload) and derives the current screen from the last
// reached label, or the journey's first declared screen on a cold record. The rail, back/next,
// arrow keys and the states switcher all move locally with no POST; only a `{walk:'to'|'miss'}`
// postMessage relayed from the embedded mock ever posts /client/__walk/event, a mark's yes/no or
// the note form ever posts /client/__notes/*, and confirm ever posts /client/__walk/confirm.
// Walk-to-unlock (whether [data-wk="approve"] may show) is tracked from the fetched record plus
// every "to" message seen since, so a walk that reaches the last screen in one session unlocks
// approve without forcing a reload — never the other way around (nothing here ever shrinks the
// server's own reached list).
//
// Deliberately does NOT read or write anything beyond those five HTTP calls — no localStorage,
// no author identity of any kind (D3: the client route never asks who is answering; every POST
// is stamped by:'client' here, never a window.prompt), and never decides approval itself — a
// confirm POST is only ever sent with whatever the client typed; the 400/409 the server may
// answer is not narrated here.
//
// Written against the same jsdom-free `vm` shim discipline lib/review.browser.js and lib/walk-
// mode.browser.js use: querySelector/querySelectorAll/closest/getAttribute/setAttribute/
// removeAttribute/hasAttribute/hidden/addEventListener/fetch. The one generated markup this
// script writes — the states switcher's buttons — is built from the thumb's own already-escaped
// data-states list (never from untrusted input) and wired through a single delegated click
// listener rather than per-button handlers; never innerHTML on anything the server did not
// already render as safe, static text, and never getBoundingClientRect.
//
// This is a browser script, not a Node module — no `require`, no `module.exports`.
'use strict'
;(function () {
  var root = document.querySelector('[data-journey]')
  if (!root) return
  var journey = root.getAttribute('data-journey')
  var prefix = root.getAttribute('data-prefix') || ''
  var theme = root.getAttribute('data-theme')

  function q(sel) { return document.querySelector(sel) }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }
  function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn) }
  function post(pathname, body) {
    return fetch(prefix + pathname, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
  }

  var frame = q('[data-wk="frame"]')
  var thumbs = qa('[data-wk="thumb"]')
  var statesEl = q('[data-wk="states"]')
  var posEl = q('[data-wk="pos"]')
  var leftEl = q('[data-wk="left"]')
  var approveEl = q('[data-wk="approve"]')
  var confirmBtn = q('[data-wk="confirm"]')
  var lastLabel = thumbs.length ? thumbs[thumbs.length - 1].getAttribute('data-label') : null

  var currentLabel = thumbs.length ? thumbs[0].getAttribute('data-label') : null
  var currentState = null
  var reachedSoFar = []
  var answered = {}
  var leftCount = qa('[data-wk="mark"]').length

  function thumbFor(label) {
    for (var i = 0; i < thumbs.length; i++) if (thumbs[i].getAttribute('data-label') === label) return thumbs[i]
    return null
  }

  function renderStates(label) {
    if (!statesEl) return
    var thumb = thumbFor(label)
    var list = thumb ? String(thumb.getAttribute('data-states') || '').split(',').filter(Boolean) : []
    if (!list.length) { statesEl.innerHTML = ''; return }
    var html = '<button type="button" data-state-opt="">happy</button>'
    for (var i = 0; i < list.length; i++) html += '<button type="button" data-state-opt="' + list[i] + '">' + list[i] + '</button>'
    statesEl.innerHTML = html
  }

  function renderMarks(label) {
    qa('[data-wk="mark"]').forEach(function (m) {
      var id = m.getAttribute('data-id')
      m.hidden = answered[id] === true || m.getAttribute('data-label') !== label
    })
  }

  function renderPos() {
    if (!posEl) return
    var ix = -1
    for (var i = 0; i < thumbs.length; i++) if (thumbs[i].getAttribute('data-label') === currentLabel) ix = i
    posEl.textContent = thumbs.length ? (ix + 1) + ' / ' + thumbs.length : ''
  }

  function updateLeft() {
    if (leftEl) { leftEl.setAttribute('data-count', String(leftCount)); leftEl.textContent = String(leftCount) }
    if (confirmBtn) {
      if (leftCount > 0) confirmBtn.setAttribute('disabled', '')
      else confirmBtn.removeAttribute('disabled')
    }
  }

  // D3: approve becomes visible only once `reachedSoFar` (the server's own record, plus every
  // "to" seen this session) carries the journey's last declared label — never re-hidden once
  // shown, since nothing here ever removes a label from `reachedSoFar`.
  function checkUnlock() {
    if (approveEl && lastLabel && reachedSoFar.indexOf(lastLabel) !== -1) approveEl.hidden = false
  }

  function render() {
    if (!currentLabel) return
    if (frame) {
      var src = prefix + '/mocks/' + currentLabel + '.html?clean&walk'
      if (theme) src += '&theme=' + encodeURIComponent(theme)
      if (currentState) src += '&state=' + encodeURIComponent(currentState)
      frame.src = src
    }
    renderMarks(currentLabel)
    renderStates(currentLabel)
    renderPos()
  }

  function goTo(label, state) {
    if (!thumbFor(label)) return
    currentLabel = label
    currentState = state || null
    render()
  }

  function step(delta) {
    var ix = -1
    for (var i = 0; i < thumbs.length; i++) if (thumbs[i].getAttribute('data-label') === currentLabel) ix = i
    var next = thumbs[Math.min(thumbs.length - 1, Math.max(0, ix + delta))]
    if (next) goTo(next.getAttribute('data-label'))
  }

  // ---- wiring: the rail, back/next, arrow keys and the states switcher all move with no POST --
  on(q('[data-wk="rail"]'), 'click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-wk="thumb"]') : null
    if (t) goTo(t.getAttribute('data-label'))
  })
  on(q('[data-wk="back"]'), 'click', function () { step(-1) })
  on(q('[data-wk="next"]'), 'click', function () { step(1) })
  on(statesEl, 'click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-state-opt]') : null
    if (!b) return
    goTo(currentLabel, b.getAttribute('data-state-opt') || null)
  })
  on(document, 'keydown', function (e) {
    var t = e.target
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
    if (tag === 'TEXTAREA' || tag === 'INPUT') return
    if (e.key === 'ArrowLeft') step(-1)
    else if (e.key === 'ArrowRight') step(1)
  })

  // ---- marks: yes/no post the answer, by:'client', no author prompt --------------------------
  qa('[data-wk="mark"]').forEach(function (m) {
    var id = m.getAttribute('data-id')
    function answer(verdict) {
      var whyEl = m.querySelector('[data-wk="why"]')
      var text = whyEl ? String(whyEl.value || '').trim() : ''
      post('/client/__notes/answer', { id: id, verdict: verdict, text: text, by: 'client' })
      if (!answered[id]) { answered[id] = true; leftCount = Math.max(0, leftCount - 1); updateLeft() }
      m.hidden = true
      checkUnlock()
    }
    on(m.querySelector('[data-wk="yes"]'), 'click', function () { answer('yes') })
    on(m.querySelector('[data-wk="no"]'), 'click', function () { answer('no') })
  })

  // ---- the free note, current screen/state, by:'client' --------------------------------------
  on(q('[data-wk="note"]'), 'submit', function (e) {
    if (e && e.preventDefault) e.preventDefault()
    var ta = q('[data-wk="note"] textarea')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return
    post('/client/__notes/add', { scope: 'mock', screen: currentLabel, state: currentState, text: text, by: 'client' })
    if (ta) ta.value = ''
  })

  // ---- confirm: the terminal sentence -----------------------------------------------------------
  on(confirmBtn, 'click', function () {
    var ta = q('[data-wk="sentence"]')
    var sentence = ta ? String(ta.value || '').trim() : ''
    if (!sentence) return
    post('/client/__walk/confirm', { journey: journey, sentence: sentence })
  })

  // ---- the embedded mock's own reporter (walk-mode.browser.js) -------------------------------
  if (window && window.addEventListener) {
    window.addEventListener('message', function (e) {
      var data = e && e.data
      if (!data || !data.walk) return
      if (data.walk === 'to') {
        post('/client/__walk/event', { journey: journey, walk: 'to', from: data.from, to: data.to })
        if (reachedSoFar.indexOf(data.from) === -1) reachedSoFar.push(data.from)
        if (reachedSoFar.indexOf(data.to) === -1) reachedSoFar.push(data.to)
        goTo(data.to)
        checkUnlock()
      } else if (data.walk === 'miss') {
        post('/client/__walk/event', { journey: journey, walk: 'miss', from: data.from, target: data.target })
      }
    })
  }

  // ---- load: the server's own record decides the current screen and the unlock ---------------
  function apply(state) {
    var reached = (state && state.reached) || []
    reachedSoFar = reached.slice()
    if (reached.length) currentLabel = reached[reached.length - 1]
    updateLeft()
    checkUnlock()
    render()
  }
  fetch(prefix + '/client/__walk/state?journey=' + encodeURIComponent(journey)).then(function (r) {
    return r.json().then(apply)
  }).catch(function () { render() })
})()
