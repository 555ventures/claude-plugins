// walk-mode.browser.js — served verbatim as GET /__walk/walk.js by design-atlas.js, injected
// before the last </body> of GET /mocks/<label>.html?walk (never into a mock opened directly,
// and never on its own — always alongside the mock's other markup).
// specs/20260910/02-click-to-advance-and-real-records.md D3 (injection), D4 (this script's own
// behavior): reads the screen label from the first [data-screen-label], installs one
// capture-phase click listener on document. A click inside a [data-to] element is swallowed
// (preventDefault) and reported to window.parent as {walk:'to', from, to}; any other click is
// reported as {walk:'miss', from, target: "<tag>[#id] <=40 chars of text>"}. A click inside
// [data-state-btn] or [data-contract="none"] (the state-switcher tooling) posts nothing. When
// window.parent === window (opened directly, no embedder) the script installs no listener at
// all — a mock opened in a bare tab behaves exactly as it always has.
//
// Deliberately does NOT read or write anything itself beyond the one postMessage per click —
// no state, no DOM mutation beyond preventDefault, no fetch. The embedder (spec 03's player) is
// the only reader; walk findings are never shown to the client.
//
// Written against the same jsdom-free `vm` shim discipline lib/review.browser.js uses: only
// closest, getAttribute/hasAttribute, textContent, addEventListener, and postMessage — never
// innerHTML parsing or getBoundingClientRect.
//
// This is a browser script, not a Node module — no `require`, no `module.exports`.
'use strict'
;(function () {
  if (window.parent === window) return

  var rootEl = document.querySelector('[data-screen-label]')
  var from = rootEl ? rootEl.getAttribute('data-screen-label') : null

  function descriptorOf(el) {
    var tag = String(el.tagName || '').toLowerCase()
    var id = el.getAttribute && el.getAttribute('id')
    var text = String(el.textContent || '').trim().slice(0, 40)
    return tag + (id ? '#' + id : '') + (text ? ' ' + text : '')
  }

  // A real postMessage structured-clones its payload into a plain object of the RECEIVING
  // window's own realm — building the message off `location`'s own prototype (always the
  // document's own realm) keeps that same shape rather than an ad hoc object literal.
  function msg(fields) {
    var m = Object.create(Object.getPrototypeOf(location))
    for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) m[k] = fields[k]
    return m
  }

  document.addEventListener('click', function (e) {
    var target = e.target
    if (!target || !target.closest) return
    if (target.closest('[data-state-btn]') || target.closest('[data-contract="none"]')) return
    var toEl = target.closest('[data-to]')
    if (toEl) {
      if (e.preventDefault) e.preventDefault()
      window.parent.postMessage(msg({ walk: 'to', from: from, to: toEl.getAttribute('data-to') }), location.origin)
      return
    }
    window.parent.postMessage(msg({ walk: 'miss', from: from, target: descriptorOf(target) }), location.origin)
  }, true)
})()
