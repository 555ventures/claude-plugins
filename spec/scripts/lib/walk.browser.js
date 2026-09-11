// walk.browser.js — served verbatim as GET /__walk/player.js by design-atlas.js, loaded by
// every page lib/walk-page.js builds (never injected into a mock itself — walk-mode.browser.js's
// own postMessage reporter, injected into the mock under `?walk`, is the other half of this
// pair; this script only listens for its messages).
// specs/20260910/03-client-journey-player.md D3 (this script's own behavior — the frame src, the
// mark visibility, the walk-to-unlock check, the four POST routes it drives), D1 (the markup
// contract it reads: [data-journey]/[data-prefix]/[data-theme] on the page's own root element,
// [data-wk="…"] hooks on frame/rail/thumb/pos/back/next/states/mark/yes/no/why/left/note/
// approve/sentence/confirm/msg); specs/20260911/01-the-page-waits-for-the-server.md D4 (every
// save acts only on the server's answer, never before it — see the Behavior table).
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
// D4: local state follows the server's answer, it never precedes it. A mark's "no" with an empty
// [data-wk="why"] posts nothing at all and shows the slot's own data-why text. Every other save
// posts, and only on `ok === true` performs its local effect (a mark hides and decrements
// [data-wk="left"]; the note textarea clears; a "to" message's from/to enter reachedSoFar and the
// unlock check re-runs); on a non-ok response or a rejected fetch the local effect does NOT
// happen and the slot shows its own data-failed text. The frame still moves on a "to" message
// either way — navigating the prototype is local, per spec 03 D3.
//
// Deliberately does NOT read or write anything beyond those five HTTP calls — no localStorage,
// no author identity of any kind (D3: the client route never asks who is answering; every POST
// is stamped by:'client' here, never a window.prompt), and never decides approval itself — a
// confirm POST is only ever sent with whatever the client typed; the 400/409 the server may
// answer is narrated only through the [data-wk="msg"] slot, never parsed for its error text.
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
  var msgEl = q('[data-wk="msg"]')
  var exclSection = q('[data-wk="exclusions"]')
  var exclOpen = exclSection ? (parseInt(exclSection.getAttribute('data-exclusions-open'), 10) || 0) : 0
  var lastLabel = thumbs.length ? thumbs[thumbs.length - 1].getAttribute('data-label') : null

  // D4: the one slot every save reports through — never narrates the server's own error text,
  // only its own two canned sentences, keyed by the attribute the builder already carried.
  function showMsg(key) {
    if (!msgEl) return
    msgEl.textContent = msgEl.getAttribute('data-' + key) || ''
    msgEl.hidden = false
  }

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

  // D5: [data-wk="confirm"] stays disabled while any listed exclusion is still open, the same
  // "disabled until zero" gate the marks count already applies — both counts feed one button.
  function updateLeft() {
    if (leftEl) { leftEl.setAttribute('data-count', String(leftCount)); leftEl.textContent = String(leftCount) }
    if (confirmBtn) {
      if (leftCount > 0 || exclOpen > 0) confirmBtn.setAttribute('disabled', '')
      else confirmBtn.removeAttribute('disabled')
    }
  }

  // D3/D5: approve and the exclusions section both become visible only once `reachedSoFar` (the
  // server's own record, plus every "to" seen this session) carries the journey's last declared
  // label — never re-hidden once shown, since nothing here ever removes a label from
  // `reachedSoFar`.
  function checkUnlock() {
    if (lastLabel && reachedSoFar.indexOf(lastLabel) !== -1) {
      if (approveEl) approveEl.hidden = false
      if (exclSection) exclSection.hidden = false
    }
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
  // D4: local state follows the server's answer, never precedes it — a "no" with an empty reason
  // posts nothing at all; every other answer posts and only an ok response hides the mark.
  qa('[data-wk="mark"]').forEach(function (m) {
    var id = m.getAttribute('data-id')
    function answer(verdict) {
      var whyEl = m.querySelector('[data-wk="why"]')
      var text = whyEl ? String(whyEl.value || '').trim() : ''
      if (verdict === 'no' && !text) { showMsg('why'); return }
      post('/client/__notes/answer', { id: id, verdict: verdict, text: text, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        if (!answered[id]) { answered[id] = true; leftCount = Math.max(0, leftCount - 1); updateLeft() }
        m.hidden = true
        checkUnlock()
      }).catch(function () { showMsg('failed') })
    }
    on(m.querySelector('[data-wk="yes"]'), 'click', function () { answer('yes') })
    on(m.querySelector('[data-wk="no"]'), 'click', function () { answer('no') })
  })

  // ---- exclusions: one agree posts /client/__walk/exclusion, lowers the open count on ok -----
  qa('[data-wk="exclusion"]').forEach(function (art) {
    var id = art.getAttribute('data-id')
    var btn = art.querySelector('[data-wk="agree"]')
    on(btn, 'click', function () {
      post('/client/__walk/exclusion', { id: id }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        if (btn && btn.parentNode) btn.setAttribute('disabled', '')
        exclOpen = Math.max(0, exclOpen - 1)
        if (exclSection) exclSection.setAttribute('data-exclusions-open', String(exclOpen))
        updateLeft()
      }).catch(function () { showMsg('failed') })
    })
  })

  // ---- the free note, current screen/state, by:'client' --------------------------------------
  on(q('[data-wk="note"]'), 'submit', function (e) {
    if (e && e.preventDefault) e.preventDefault()
    var ta = q('[data-wk="note"] textarea')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return
    post('/client/__notes/add', { scope: 'mock', screen: currentLabel, state: currentState, text: text, by: 'client' }).then(function (r) {
      if (!r.ok) { showMsg('failed'); return }
      if (ta) ta.value = ''
    }).catch(function () { showMsg('failed') })
  })

  // ---- confirm: the terminal sentence -----------------------------------------------------------
  on(confirmBtn, 'click', function () {
    var ta = q('[data-wk="sentence"]')
    var sentence = ta ? String(ta.value || '').trim() : ''
    if (!sentence) return
    post('/client/__walk/confirm', { journey: journey, sentence: sentence }).then(function (r) {
      if (!r.ok) showMsg('failed')
    }).catch(function () { showMsg('failed') })
  })

  // ---- the embedded mock's own reporter (walk-mode.browser.js) -------------------------------
  // The frame still moves on a "to" message regardless of the save — navigation stays local, per
  // spec 03 D3 — but reachedSoFar (and therefore the unlock check) only advances on an ok save.
  if (window && window.addEventListener) {
    window.addEventListener('message', function (e) {
      var data = e && e.data
      if (!data || !data.walk) return
      if (data.walk === 'to') {
        post('/client/__walk/event', { journey: journey, walk: 'to', from: data.from, to: data.to }).then(function (r) {
          if (!r.ok) { showMsg('failed'); return }
          if (reachedSoFar.indexOf(data.from) === -1) reachedSoFar.push(data.from)
          if (reachedSoFar.indexOf(data.to) === -1) reachedSoFar.push(data.to)
          checkUnlock()
        }).catch(function () { showMsg('failed') })
        goTo(data.to)
      } else if (data.walk === 'miss') {
        post('/client/__walk/event', { journey: journey, walk: 'miss', from: data.from, target: data.target }).then(function (r) {
          if (!r.ok) showMsg('failed')
        }).catch(function () { showMsg('failed') })
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
