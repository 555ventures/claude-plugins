// walk.browser.js — served verbatim as GET /__walk/player.js by design-atlas.js, loaded by
// every page lib/walk-page.js builds (never injected into a mock itself — walk-mode.browser.js's
// own postMessage reporter, injected into the mock under `?walk`, is the other half of this
// pair; this script only listens for its messages).
// specs/20260910/03-client-journey-player.md D3 (this script's own behavior — the frame src, the
// mark visibility, the walk-to-unlock check, the four POST routes it drives), D1 (the markup
// contract it reads); specs/20260911/01-the-page-waits-for-the-server.md D4 (every save acts
// only on the server's answer, never before it — see the Behavior table); specs/20260911/04-the-
// client-loop.md D6/D16/D17 (the return-leg controls) and D21 (the step indicator replacing the
// old screen spine, the caption text, and the one nav button that reads Next or Confirm).
// specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D4 ("Change answer" — an exclusion
// row's own reversal, posting `verdict:'reconsider'`), D6 ("Put it back" — the shared
// wireRequestCard putback arm plus the exclusion row's own inline one, both posting
// /client/__notes/reopen with no text), D7 (the confirm handler's in-place swap to the sign-off
// block's confirmed shape, dropping the bar's confirm control).
//
// On load: fetches <prefix>/client/__walk/state?journey=<j> (the server's own walk record — the
// one source of truth for what survives a reload) and derives the current screen from the last
// reached label, or the journey's first declared screen on a cold record. The step rail,
// back/next, arrow keys and the states switcher all move locally with no POST; only a
// `{walk:'to'|'miss'}` postMessage relayed from the embedded mock ever posts
// /client/__walk/event, a mark's yes/no or the note form ever posts /client/__notes/*, and
// confirm ever posts /client/__walk/confirm. Walk-to-unlock (whether the sign-off block may
// show) is tracked from the fetched record plus every "to" message seen since, so a walk that
// reaches the last screen in one session unlocks it without forcing a reload — never the other
// way around (nothing here ever shrinks the server's own reached list).
//
// D4: local state follows the server's answer, it never precedes it. A mark's "no" with an empty
// [data-wk="why"] posts nothing at all and shows the slot's own data-why text. Every other save
// posts, and only on `ok === true` performs its local effect (a mark hides and decrements
// [data-wk="left"]; the note textarea clears; a "to" message's from/to enter reachedSoFar and the
// unlock check re-runs); on a non-ok response or a rejected fetch the local effect does NOT
// happen and the slot shows its own data-failed text. The frame still moves on a "to" message
// either way — navigating the prototype is local, per spec 03 D3.
//
// specs/20260911/06-the-client-loop.md D6: this same script also drives the CLIENT INDEX page
// (no `[data-journey]` root at all) — the "something missing?" composer (`[data-cl="ask"]`, now
// nested inside a `<details>` per D20) and the accept/reopen pair on both the index's
// `[data-cl="request"]` cards and the walk page's own `[data-wk="request"]` cards.
// `wireRequestCard` is the one shared implementation, parameterized on the attribute name ("cl"
// or "wk") the two pages render their hooks under. A brand-new request (the ask form's own save)
// is never fabricated as a fresh DOM node — every page ships one hidden, unattached template
// article (`[data-cl-template]` / `[data-wk-template]`); a successful save ACTIVATES it (adds the
// real `data-cl="request"`/`data-wk="request"` attribute, stamps id/status/label) rather than
// inserting new markup.
//
// D21: the walk page's bar carries one nav button (`[data-wk-role="nav"]`) whose `data-wk`
// attribute this script flips between `next` and `confirm` as the current screen changes — it is
// never two separate elements, so `[data-wk="confirm"]`/`[data-wk="next"]` are mutually
// exclusive at any moment, matching the AC's "SHALL NOT render" wording literally.
//
// D23: the ask form's Send is wired ONLY to the form's own `submit` event — never also a click
// handler on the button — so one click posts exactly once in a real browser. A reopen click
// unhides its own `[data-cl="reopen-text"]`/`[data-wk="reopen-text"]` before checking its value.
// An accept's status line reads "Closed — thank you". The states switcher's first tab reads
// "Normal" (not the internal "happy" key) and carries `aria-selected` on the current state.
//
// Deliberately does NOT read or write anything beyond its own HTTP calls — no localStorage,
// no author identity of any kind (D3: the client route never asks who is answering; every POST
// is stamped by:'client' here, never a window.prompt), and never decides approval itself — a
// confirm POST is only ever sent with whatever the client typed; the 400/409 the server may
// answer is narrated only through the [data-wk="msg"] slot, never parsed for its error text.
//
// Written against the same jsdom-free `vm` shim discipline lib/review.browser.js and lib/walk-
// mode.browser.js use: querySelector/querySelectorAll/closest/getAttribute/setAttribute/
// removeAttribute/hasAttribute/hidden/addEventListener/fetch. The one generated markup this
// script writes — the states switcher's buttons — is built from the step's own already-escaped
// data-states list (never from untrusted input) and wired through a single delegated click
// listener rather than per-button handlers; never innerHTML on anything the server did not
// already render as safe, static text, and never getBoundingClientRect.
//
// This is a browser script, not a Node module — no `require`, no `module.exports`.
'use strict'
;(function () {
  function q(sel) { return document.querySelector(sel) }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }
  function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn) }

  var prefixEl = q('[data-prefix]')
  var prefix = prefixEl ? (prefixEl.getAttribute('data-prefix') || '') : ''

  function post(pathname, body) {
    return fetch(prefix + pathname, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
  }

  // D3/D4: the one slot every save (index or walk) reports through — never narrates the server's
  // own error text, only its own canned sentences, keyed by the attribute the builder already
  // carried.
  var msgEl = q('[data-wk="msg"]')
  function showMsg(key) {
    if (!msgEl) return
    msgEl.textContent = msgEl.getAttribute('data-' + key) || ''
    msgEl.hidden = false
  }

  // D6: accept/reopen — shared by the index's `[data-cl="request"]` cards and the walk page's own
  // `[data-wk="request"]` cards. `onChange` (walk page only) recomputes the nav button's disabled
  // state after either action.
  function wireRequestCard(attr, art, onChange) {
    var id = art.getAttribute('data-id')
    var acceptBtn = art.querySelector('[data-' + attr + '="accept"]')
    var reopenBtn = art.querySelector('[data-' + attr + '="reopen"]')
    var reopenText = art.querySelector('[data-' + attr + '="reopen-text"]')
    // D16: an open request's own take-back — posts the existing withdrawn resolution and sets
    // the visible status line to "Closed", the same word a session-side resolve without an
    // "accepted" resolution renders on a full page reload.
    var withdrawBtn = art.querySelector('[data-' + attr + '="withdraw"]')
    // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D6: "Put it back" — the
    // inverse of the withdraw button above, rendered only on an already-withdrawn (resolved)
    // article. Posts the SAME route the accept/reopen/withdraw handlers already use
    // (POST /client/__notes/reopen), with NO text (the "no text required" arm D5 adds server-
    // side) — this is a return-leg, not a new request. On ok the article's own status flips to
    // "open" and the button that just fired hides (a reload after this renders the article's full
    // open shape from scratch, same as any other reopen).
    var putbackBtn = art.querySelector('[data-' + attr + '="putback"]')
    on(putbackBtn, 'click', function () {
      post('/client/__notes/reopen', { id: id, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.setAttribute('data-status', 'open')
        art.removeAttribute('data-resolution')
        var statusEl = art.querySelector('.wk-req-status')
        if (statusEl) statusEl.textContent = "We'll look at this"
        putbackBtn.hidden = true
        showMsg('putback-saved')
        if (onChange) onChange()
      }).catch(function () { showMsg('failed') })
    })
    on(acceptBtn, 'click', function () {
      post('/client/__notes/resolve', { id: id, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.setAttribute('data-status', 'resolved')
        // D23: an accept's own status line reads "Closed — thank you" (byte-identical to the
        // resolved/accepted render a full reload would produce), not just the data-status flip.
        var acceptStatusEl = art.querySelector('.wk-req-status')
        if (acceptStatusEl) acceptStatusEl.textContent = 'Closed — thank you'
        if (onChange) onChange()
      }).catch(function () { showMsg('failed') })
    })
    on(reopenBtn, 'click', function () {
      // D23: "Still not right" / "That's not right" reveals its own why box first — a click that
      // finds it still empty shows the "please say what's wrong" message rather than posting.
      if (reopenText) reopenText.hidden = false
      var text = reopenText ? String(reopenText.value || '').trim() : ''
      if (!text) { showMsg('why'); return }
      post('/client/__notes/reopen', { id: id, text: text, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.setAttribute('data-status', 'open')
        // D16 (amended)/AC-20260911-06-25: a reopened request ends up in the SAME shape the
        // server renders for an open request — its status line and addressed-only controls (the
        // link, accept, reopen) hide, the why box hides AND clears (its text is already sent, so
        // keeping it invites a duplicate), and the withdraw control (rendered hidden on every
        // addressed article — see lib/walk-page.js) is revealed. A reload must change nothing the
        // client can see. AC-20260911-06-26: the row also remembers this round — its status line
        // reads "again" and its own [class~="wk-req-again"] placeholder (server-rendered hidden/
        // empty on every article, never fabricated here) is activated with the text just sent, so
        // a reload paints byte-identically (lib/walk-page.js's `latestReopenText` reads it back
        // off the note's own `thread`).
        var reopenStatusEl = art.querySelector('.wk-req-status')
        if (reopenStatusEl) reopenStatusEl.textContent = "We'll look at this again"
        var againEl = art.querySelector('.wk-req-again')
        if (againEl) { againEl.textContent = 'You said: ' + text; againEl.hidden = false }
        var link = art.querySelector('.wk-req-link')
        if (link) link.hidden = true
        if (acceptBtn) acceptBtn.hidden = true
        if (reopenBtn) reopenBtn.hidden = true
        if (reopenText) { reopenText.hidden = true; reopenText.value = '' }
        if (withdrawBtn) withdrawBtn.hidden = false
        // AC-20260911-06-25: the reopen answers in the msg slot exactly as the ask form does.
        showMsg('saved')
        if (onChange) onChange()
      }).catch(function () { showMsg('failed') })
    })
    on(withdrawBtn, 'click', function () {
      post('/client/__notes/resolve', { id: id, by: 'client', reason: 'not-needed' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.setAttribute('data-status', 'resolved')
        var statusEl = art.querySelector('.wk-req-status')
        if (statusEl) statusEl.textContent = 'Closed'
        if (onChange) onChange()
      }).catch(function () { showMsg('failed') })
    })
  }

  // ---- the client index: the "something missing?" composer + its own request cards -----------
  var askRoot = q('[data-cl="ask"]')
  if (askRoot) {
    var askForm = askRoot.querySelector('form') || askRoot
    var reasonChips = qa('[data-cl="reason"]')
    var selectedReason = 'other'
    reasonChips.forEach(function (chip) {
      on(chip, 'click', function () {
        selectedReason = chip.getAttribute('data-value') || 'other'
        reasonChips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false') })
      })
    })
    function submitAsk(e) {
      if (e && e.preventDefault) e.preventDefault()
      var ta = askForm.querySelector('textarea')
      var text = ta ? String(ta.value || '').trim() : ''
      if (!text) { showMsg('why'); return }
      post('/client/__notes/add', { scope: 'project', reason: selectedReason, text: text, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        return r.json().then(function (j) {
          if (ta) ta.value = ''
          showMsg('saved')
          var tmpl = q('[data-cl="requests"] [data-cl-template]')
          if (tmpl && j && j.id) {
            // FIX 2 (review): the template ships the open-request markup (where/status/withdraw)
            // already rendered — only the id and the client's own text are the template's own
            // content, filled in here rather than fabricated later from nothing.
            // FIX 3 (review): the test shim (and, more to the point, this script's own textContent
            // discipline elsewhere — see the accept/reopen handlers above) never trusts a static
            // string baked into the server's markup; the activated row's own status line is set
            // here explicitly, byte-identical to the template's own reqWatching text.
            var textEl = tmpl.querySelector('.wk-req-text')
            if (textEl) textEl.textContent = text
            var statusEl = tmpl.querySelector('.wk-req-status')
            if (statusEl) statusEl.textContent = "We'll look at this"
            tmpl.setAttribute('data-cl', 'request')
            tmpl.setAttribute('data-id', j.id)
            tmpl.setAttribute('data-status', 'open')
            tmpl.removeAttribute('data-cl-template')
            tmpl.hidden = false
            wireRequestCard('cl', tmpl, null)
          }
        })
      }).catch(function () { showMsg('failed') })
    }
    // D23: Send is the form's own submit — never also a click handler on the button — so one
    // click in a real browser posts exactly once (a `<button type="submit">` inside a `<form>`
    // fires the form's `submit` event on click without any extra wiring here).
    on(askForm, 'submit', submitAsk)
    qa('[data-cl="request"]').forEach(function (art) { wireRequestCard('cl', art, null) })
    // D20: the collapsed request log's "Show N closed" toggle — reveals/hides every
    // `[data-closed]` article, flipping its own label between "Show N closed" and "Hide closed".
    var showClosedBtn = q('[data-cl="show-closed"]')
    if (showClosedBtn) {
      var showClosedLabel = showClosedBtn.textContent
      on(showClosedBtn, 'click', function () {
        var willOpen = showClosedBtn.getAttribute('aria-expanded') !== 'true'
        showClosedBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
        showClosedBtn.textContent = willOpen ? 'Hide closed' : showClosedLabel
        qa('[data-closed]').forEach(function (el) { el.hidden = !willOpen })
      })
    }
    return
  }

  // ---- the walk page -------------------------------------------------------------------------
  var root = q('[data-journey]')
  if (!root) return
  var journey = root.getAttribute('data-journey')
  var theme = root.getAttribute('data-theme')

  var frame = q('[data-wk="frame"]')
  var steps = qa('[data-wk="step"]')
  var statesEl = q('[data-wk="states"]')
  var captionEl = q('[data-wk="caption"]')
  var leftEl = q('[data-wk="left"]')
  var signoffEl = q('[data-wk="signoff"]')
  var navBtn = q('[data-wk-role="nav"]')
  var exclSection = q('[data-wk="exclusions"]')
  var lastLabel = steps.length ? steps[steps.length - 1].getAttribute('data-label') : null

  var currentLabel = steps.length ? steps[0].getAttribute('data-label') : null
  var currentState = null
  var reachedSoFar = []
  var answered = {}
  var leftCount = qa('[data-wk="mark"]').length
  // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D7: set the moment a confirm
  // succeeds — `updateNav()` (below) checks this FIRST so a later `apply()` (the initial
  // `/client/__walk/state` fetch can resolve after the confirm click's own, shorter promise
  // chain — both are in flight from page load) never re-adds `[data-wk="confirm"]` over the
  // just-confirmed bar. Without this flag the confirm handler's own attribute removal is a race
  // it can lose.
  var confirmedLocally = false

  function stepFor(label) {
    for (var i = 0; i < steps.length; i++) if (steps[i].getAttribute('data-label') === label) return steps[i]
    return null
  }

  // D23: the switcher's first tab reads "Normal" (not the internal "happy" state key), and the
  // current state carries `aria-selected="true"` — every other tab `aria-selected="false"`.
  function renderStates(label) {
    if (!statesEl) return
    var st = stepFor(label)
    var list = st ? String(st.getAttribute('data-states') || '').split(',').filter(Boolean) : []
    if (!list.length) { statesEl.innerHTML = ''; return }
    var html = '<button type="button" data-state-opt="" aria-selected="' + (currentState ? 'false' : 'true') + '">Normal</button>'
    for (var i = 0; i < list.length; i++) {
      var selected = currentState === list[i]
      html += '<button type="button" data-state-opt="' + list[i] + '" aria-selected="' + (selected ? 'true' : 'false') + '">' + list[i] + '</button>'
    }
    statesEl.innerHTML = html
  }

  function renderMarks(label) {
    qa('[data-wk="mark"]').forEach(function (m) {
      var id = m.getAttribute('data-id')
      m.hidden = answered[id] === true || m.getAttribute('data-label') !== label
    })
  }

  // D21: the caption reads "<Screen label> · <i> of <n>", 1-indexed.
  function updateCaption() {
    if (!captionEl) return
    var ix = -1
    for (var i = 0; i < steps.length; i++) if (steps[i].getAttribute('data-label') === currentLabel) ix = i
    captionEl.textContent = currentLabel + ' · ' + (ix + 1) + ' of ' + steps.length
  }

  // D21: the step indicator's own reached/current attributes — reached only ever grows.
  function updateSteps() {
    steps.forEach(function (st) {
      var l = st.getAttribute('data-label')
      st.setAttribute('data-current', l === currentLabel ? 'true' : 'false')
      if (reachedSoFar.indexOf(l) !== -1) st.setAttribute('data-reached', 'true')
    })
  }

  // D21: the bar's one nav button — `next` on every screen but the journey's last declared one,
  // `confirm` there. Text is read off the button's own data-next-label/data-confirm-label
  // attributes (the builder's already-escaped strings), never hardcoded here.
  function updateNav() {
    if (!navBtn) return
    // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D7: once confirmed locally,
    // stay confirmed — a later `apply()` (the page-load state fetch, still in flight when the
    // confirm click's own shorter promise chain finishes first) must never re-add the confirm
    // control over an already-confirmed bar.
    if (confirmedLocally) { navBtn.removeAttribute('data-wk'); navBtn.hidden = true; return }
    var isLast = lastLabel && currentLabel === lastLabel
    if (isLast) {
      navBtn.setAttribute('data-wk', 'confirm')
      navBtn.textContent = navBtn.getAttribute('data-confirm-label') || navBtn.textContent
    } else {
      navBtn.setAttribute('data-wk', 'next')
      navBtn.textContent = navBtn.getAttribute('data-next-label') || navBtn.textContent
    }
    refreshNavDisabled()
  }

  // specs/20260911/05-approval-is-bookkeeping.md D3: the nav button no longer waits on
  // exclusions — the closing screen asks, it does not block. It stays disabled while any listed
  // mark is still open, or any `[data-wk="request"]` on the journey is `open`/`addressed` —
  // recomputed after every accept/reopen/answer. Meaningless (and never applied) while the
  // button is in its `next` role.
  function refreshNavDisabled() {
    if (!navBtn) return
    if (navBtn.getAttribute('data-wk') !== 'confirm') { navBtn.removeAttribute('disabled'); return }
    var blocked = qa('[data-wk="request"]').some(function (a) {
      var st = a.getAttribute('data-status')
      return st === 'open' || st === 'addressed'
    })
    if (leftCount > 0 || blocked) navBtn.setAttribute('disabled', '')
    else navBtn.removeAttribute('disabled')
  }

  // D21/AC-22: the label is always a sentence read off the slot's own data-none/data-one/
  // data-many attributes — never a bare count overwrite.
  function leftText(n) {
    if (!leftEl) return ''
    if (n === 0) return leftEl.getAttribute('data-none') || ''
    if (n === 1) return leftEl.getAttribute('data-one') || ''
    return (leftEl.getAttribute('data-many') || '').replace('{n}', String(n))
  }

  function updateLeft() {
    if (leftEl) { leftEl.setAttribute('data-count', String(leftCount)); leftEl.textContent = leftText(leftCount) }
    refreshNavDisabled()
  }

  // D6: a request card is visible only when its data-label is the current screen.
  function renderRequests(label) {
    qa('[data-wk="request"]').forEach(function (art) {
      art.hidden = art.getAttribute('data-label') !== label
    })
  }

  // D3/D5: the sign-off block and the exclusions section both become visible only once
  // `reachedSoFar` (the server's own record, plus every "to" seen this session) carries the
  // journey's last declared label — never re-hidden once shown, since nothing here ever removes
  // a label from `reachedSoFar`.
  function checkUnlock() {
    if (lastLabel && reachedSoFar.indexOf(lastLabel) !== -1) {
      if (signoffEl) signoffEl.hidden = false
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
    renderRequests(currentLabel)
    renderStates(currentLabel)
    updateSteps()
    updateCaption()
    updateNav()
  }

  function goTo(label, state) {
    if (!stepFor(label)) return
    currentLabel = label
    currentState = state || null
    render()
  }

  function step(delta) {
    var ix = -1
    for (var i = 0; i < steps.length; i++) if (steps[i].getAttribute('data-label') === currentLabel) ix = i
    var next = steps[Math.min(steps.length - 1, Math.max(0, ix + delta))]
    if (next) goTo(next.getAttribute('data-label'))
  }

  // ---- wiring: the step indicator, back/nav, arrow keys and the states switcher all move with
  // no POST -------------------------------------------------------------------------------------
  on(q('[data-wk="steps"]'), 'click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-wk="step"]') : null
    if (t) goTo(t.getAttribute('data-label'))
  })
  on(q('[data-wk="back"]'), 'click', function () { step(-1) })
  on(navBtn, 'click', function () {
    if (navBtn.getAttribute('data-wk') === 'confirm') {
      var ta = q('[data-wk="sentence"]')
      var sentence = ta ? String(ta.value || '').trim() : ''
      if (!sentence) return
      post('/client/__walk/confirm', { journey: journey, sentence: sentence }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D7: the second click no
        // longer looks like nothing happened — the sign-off block swaps to its confirmed shape IN
        // PLACE (no reload) and the bar drops the confirm control, leaving Back. The confirmed
        // lead/sentence are activated from the block's own hidden attribute/element (see
        // lib/walk-page.js's renderSignoff) rather than fabricated here.
        if (signoffEl) {
          var leadEl = signoffEl.querySelector('.wk-lead')
          if (leadEl) leadEl.textContent = signoffEl.getAttribute('data-confirmed-lead') || leadEl.textContent
          var confirmedSentenceEl = signoffEl.querySelector('[data-wk="confirmed-sentence"]')
          if (confirmedSentenceEl) { confirmedSentenceEl.textContent = sentence; confirmedSentenceEl.hidden = false }
        }
        if (ta) { ta.removeAttribute('data-wk'); ta.hidden = true }
        confirmedLocally = true
        navBtn.removeAttribute('data-wk')
        navBtn.hidden = true
        showMsg('confirm-saved')
      }).catch(function () { showMsg('failed') })
    } else {
      step(1)
    }
  })
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
      // D24: "That's not right" reveals its own why box first — a click that finds it still
      // hidden unhides and focuses it rather than posting, the same shape as D23's reopen box.
      if (verdict === 'no' && whyEl && whyEl.hidden) { whyEl.hidden = false; whyEl.focus(); return }
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

  // ---- exclusions: agree or needed posts a verdict; an ok answer activates the row's own -------
  // ---- hidden state line instead of disabling the buttons ---------------------------------------
  // specs/20260911/05-approval-is-bookkeeping.md D3: an agree-only control cannot record
  // disagreement — "No — we need this" posts {id, verdict:'needed'}.
  // specs/20260912/01-the-card-explains-itself.md D5: the buttons are no longer disabled on ok —
  // the server-rendered `data-verdict` + CSS is what hides `.wk-verdicts` now, matching the
  // reload render exactly. The row's own `.wk-excl-state` (shipped hidden and empty by D4/D8) is
  // filled from the section's own `data-said-agree`/`data-said-needed` attribute and unhidden —
  // activation, never fabrication, the same discipline `wk-req-again` already uses — and the
  // save is confirmed through the shared msg slot's own `data-excl-saved` text.
  qa('[data-wk="exclusion"]').forEach(function (art) {
    var id = art.getAttribute('data-id')
    var agreeBtn = art.querySelector('[data-wk="agree"]')
    var neededBtn = art.querySelector('[data-wk="needed"]')
    var stateEl = art.querySelector('.wk-excl-state')
    // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D4 (render-check fix, JJ
    // 2026-09-12): "Change answer" now lives INSIDE `.wk-excl-state`'s own `<p>`, so the sentence
    // is written into a dedicated child span (`.wk-excl-state-text`) — never the paragraph's own
    // `textContent`, which would erase the embedded button on every answer.
    var stateTextEl = art.querySelector('.wk-excl-state-text')
    var verdictsEl = art.querySelector('.wk-verdicts')
    var reconsiderBtn = art.querySelector('[data-wk="reconsider"]')
    function answer(verdict) {
      post('/client/__walk/exclusion', { id: id, verdict: verdict }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.setAttribute('data-verdict', verdict)
        if (stateTextEl && exclSection) stateTextEl.textContent = exclSection.getAttribute('data-said-' + verdict) || ''
        if (stateEl) stateEl.hidden = false
        // D4: the row's own reconsider control is shipped hidden while open (there was nothing
        // yet to change) — a fresh agree/needed answer reveals it immediately, no reload needed,
        // matching the shape a reload of an already-answered row already carries.
        if (reconsiderBtn) reconsiderBtn.hidden = false
        showMsg('excl-saved')
      }).catch(function () { showMsg('failed') })
    }
    on(agreeBtn, 'click', function () { answer('agree') })
    on(neededBtn, 'click', function () { answer('needed') })
    // specs/20260912/02-an-answer-is-the-clients-until-sign-off.md D4: "Change answer" — posts
    // {id, verdict:'reconsider'} and, on ok, returns the row to its open shape IN PLACE: clears
    // data-verdict (so the row no longer reads its old state sentence), re-hides the state
    // sentence, and reveals the two verdict buttons again — the exact inverse of `answer()`
    // above. The receipt is the SAME `data-excl-saved` text `answer()` already shows (D4's own
    // sentence promises unlimited change before sign-off, which is the same promise the first
    // save's receipt makes).
    on(reconsiderBtn, 'click', function () {
      post('/client/__walk/exclusion', { id: id, verdict: 'reconsider' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        art.removeAttribute('data-verdict')
        if (stateEl) stateEl.hidden = true
        if (verdictsEl) verdictsEl.hidden = false
        showMsg('excl-saved')
      }).catch(function () { showMsg('failed') })
    })
    // D6: the exclusion row's own "Put it back" — reopens the WITHDRAWN NOTE this row was
    // derived from (`data-note-id`, never the row's own `data-id`), through the same
    // /client/__notes/reopen route the request cards' own putback uses. The row itself is not
    // rewritten here at all — the next materialize (the walk page's own GET) is what retires it,
    // per D5's Rationale ("nothing new is written to the ledger").
    var putbackBtn = art.querySelector('[data-wk="putback"]')
    on(putbackBtn, 'click', function () {
      var noteId = putbackBtn.getAttribute('data-note-id')
      post('/client/__notes/reopen', { id: noteId, by: 'client' }).then(function (r) {
        if (!r.ok) { showMsg('failed'); return }
        putbackBtn.hidden = true
        showMsg('putback-saved')
      }).catch(function () { showMsg('failed') })
    })
  })

  // ---- request cards: accept/reopen, shared with the index's own cards ------------------------
  qa('[data-wk="request"]').forEach(function (art) { wireRequestCard('wk', art, refreshNavDisabled) })

  // ---- the free note, current screen/state, by:'client' --------------------------------------
  // D6: the note form's own ok additionally shows data-saved and activates the journey's spare
  // template article for the current screen (same activation-not-fabrication discipline as the
  // index's ask form, above).
  on(q('[data-wk="note"]'), 'submit', function (e) {
    if (e && e.preventDefault) e.preventDefault()
    var ta = q('[data-wk="note"] textarea')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return
    post('/client/__notes/add', { scope: 'mock', screen: currentLabel, state: currentState, text: text, by: 'client' }).then(function (r) {
      if (!r.ok) { showMsg('failed'); return }
      return r.json().then(function (j) {
        if (ta) ta.value = ''
        showMsg('saved')
        var tmpl = q('[data-wk="requests"] [data-wk-template]')
        if (tmpl && j && j.id) {
          // FIX 2 (review): the template ships the open-request markup (status/withdraw) already
          // rendered — only the id, label and the client's own text are filled in here.
          // FIX 3 (review): status line set explicitly, same reasoning as the index's own
          // activation above.
          var textEl = tmpl.querySelector('.wk-req-text')
          if (textEl) textEl.textContent = text
          var statusEl = tmpl.querySelector('.wk-req-status')
          if (statusEl) statusEl.textContent = "We'll look at this"
          tmpl.setAttribute('data-wk', 'request')
          tmpl.setAttribute('data-id', j.id)
          tmpl.setAttribute('data-label', currentLabel)
          tmpl.setAttribute('data-status', 'open')
          tmpl.removeAttribute('data-wk-template')
          tmpl.hidden = false
          wireRequestCard('wk', tmpl, refreshNavDisabled)
          refreshNavDisabled()
        }
      })
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
