// review.browser.js — served verbatim as GET /__review/review.js by design-atlas.js's `serve`,
// loaded by the journey review page lib/review-page.js builds (never injected into a mock).
// specs/20260906/04-journey-review-page.md D4 (inspector behaviour, keyboard map, fold), D5
// (the approve control mirrors the on-disk gate), D3 (artboard state tabs + frame fit), A6.
//
// Talks only to /__notes/* and /__picks/* under the page's own base (the path before
// `/review/<j>.html` — '' or a `/p/<name>` mount), through the spec 03 endpoints unchanged:
// POST /__notes/answer {id, verdict, text?, by} and POST /__notes/add {scope, screen, state,
// reason, text, by}. The approve/change buttons are handled by the stop block's own picks
// script (lib/stop-block.js), never here — this file only keeps the approve button's disabled
// state in step with what is still open.
//
// Written against the jsdom-free `vm` shim discipline the spec's Rationale states: only
// `[data-rv="…"]` selectors (with `[data-id]`/`[data-label]` qualifiers), dataset, attributes,
// hidden, textContent, classList, addEventListener, closest, focus, fetch, localStorage —
// never innerHTML parsing, getBoundingClientRect, MutationObserver, or a prompt at load (the
// reviewer's name is read from localStorage under the notes layer's own `nl-author` key and
// asked, once, only on the first write).
//
// This is a browser script, not a Node module — no `require`, no `module.exports`.
'use strict'
;(function () {
  var m = location.pathname.match(/^(.*)\/review\/[^/]+$/)
  var base = m ? m[1] : ''
  var q = function (sel) { return document.querySelector(sel) }
  var qa = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)) }
  var TEXT_TAGS = { TEXTAREA: 1, INPUT: 1, SELECT: 1 }

  var filter = 'open'
  var screenFilter = null
  var folded = false
  var initial = q('[data-rv="row"][data-selected]')
  var selectedId = initial ? initial.getAttribute('data-id') : null
  var scopeLabel = null
  var reason = 'other'

  // ---- identity ------------------------------------------------------------------------------
  function author() {
    var a = null
    try { a = localStorage.getItem('nl-author') } catch (e) { a = null }
    if (a) return a
    var name = ''
    try { name = (window.prompt('Your name (shown on your answers)') || '').trim() } catch (e) { name = '' }
    name = name || 'anonymous'
    try { localStorage.setItem('nl-author', name) } catch (e) { /* in-memory only this session */ }
    return name
  }
  function post(pathname, body) {
    return fetch(base + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r && r.ok ? r : Promise.reject(r) })
  }

  // ---- rows ----------------------------------------------------------------------------------
  function rows() { return qa('[data-rv="row"]') }
  function isOpenRow(row) { return row.getAttribute('data-status') === 'open' }
  function openRows() { return rows().filter(isOpenRow) }
  function rowById(id) { return q('[data-rv="row"][data-id="' + id + '"]') }
  function setHidden(el, hidden) { if (!el) return; el.hidden = !!hidden; if (hidden) el.setAttribute('hidden', ''); else el.removeAttribute('hidden') }
  function setText(el, text) { if (el) el.textContent = text }
  function plural(n, one, many) { return n === 1 ? one : many }

  // D15: with a screen-label screenFilter, a row shows when its data-label matches OR it carries
  // no data-label at all (a whole-project row) — the band's own sentence, "On screen <name> plus
  // the whole project". `__project` (the rail's Whole-project link) is unchanged: it narrows to
  // project rows alone.
  function applyFilter() {
    var anyOpen = false
    rows().forEach(function (row) {
      var open = isOpenRow(row)
      if (open) anyOpen = true
      var show = filter === 'all' || (filter === 'open' && open) || (filter === 'answered' && !open)
      if (show && screenFilter) {
        show = screenFilter === '__project'
          ? !row.getAttribute('data-label')
          : (row.getAttribute('data-label') === screenFilter || !row.getAttribute('data-label'))
      }
      setHidden(row, !show)
    })
    qa('[data-rv="filter"]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-filter') === filter ? 'true' : 'false') })
    var chip = q('[data-rv="screenfilter"]')
    if (chip) setText(chip, screenFilter && screenFilter !== '__project' ? screenFilter : (focusedLabel() || ''))
    setHidden(q('[data-rv="empty"]'), !(filter === 'open' && !anyOpen))
  }

  // D9: switches a board's state tab (the same mechanics the tab click handler below drives) —
  // shared so select() can bring a box's own state forward without duplicating the tab/frame
  // toggling. No-op when the board is already showing that state.
  function switchTab(label, state) {
    if (!label || !state) return
    var board = q('[data-rv="board"][data-label="' + label + '"]')
    if (!board) return
    var tabs = qa('[data-rv="board"][data-label="' + label + '"] [data-rv="tab"]')
    var current = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true' })[0]
    if (current && current.getAttribute('data-state') === state) return
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-state') === state ? 'true' : 'false') })
    board.querySelectorAll('[data-rv="frame"]').forEach(function (f) {
      var show = f.getAttribute('data-state') === state
      setHidden(f, !show)
      if (show) { f.setAttribute('loading', 'eager'); fit(f) }
    })
  }

  // specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D6: locate the
  // `[data-rv="frame"]` whose `.contentWindow` is the given frame window — the reverse lookup
  // `__rvCardOpen`/`__rvCardClose` need to find a board from the frame that called them (same-
  // origin only; a cross-origin frame's `contentWindow` still compares by reference, never throws).
  function frameElFor(win) {
    var frames = qa('[data-rv="frame"]')
    for (var i = 0; i < frames.length; i++) { if (frames[i].contentWindow === win) return frames[i] }
    return null
  }

  // D7: flip-then-shift, restated here for the host-placed card (the unframed layer implements
  // the identical rule for its own overlay-mounted card — one rule, two placements, since this
  // repo ships no shared browser-script module system). `boxRect` is the box's already-scaled
  // on-screen rectangle (viewport pixels); the card is placed in PAGE pixels (scroll added) since
  // `.nl-card` is `position:absolute` with no positioned ancestor between it and the page. D7
  // carries no escape clause for "neither flank has room": clamping the flipped side back into
  // the viewport (the retired right-edge clamp, under a new name) would put the card ON TOP of
  // its own box, which D7 forbids outright. When neither side fits, this falls back to the OTHER
  // axis instead — below the box, else above — shifted horizontally to stay in the viewport.
  function placeHostCard(card, boxRect) {
    var gap = 12
    var scrollX = window.pageXOffset || 0
    var scrollY = window.pageYOffset || 0
    var vw = window.innerWidth, vh = window.innerHeight
    var cw = card.offsetWidth || 328
    var ch = card.offsetHeight || 200
    var right = boxRect.right + gap
    var left = boxRect.left - gap - cw
    var x, y
    if (right + cw <= vw || left >= 0) {
      x = right + cw <= vw ? right : left
      y = boxRect.top
      if (y + ch > vh) y = Math.max(0, vh - ch)
      if (y < 0) y = 0
    } else {
      var below = boxRect.bottom + gap
      var above = boxRect.top - gap - ch
      y = below + ch <= vh ? below : (above >= 0 ? above : Math.max(0, vh - ch))
      x = boxRect.left
      if (x + cw > vw) x = Math.max(0, vw - cw)
      if (x < 0) x = 0
    }
    card.style.left = (x + scrollX) + 'px'
    card.style.top = (y + scrollY) + 'px'
  }

  // D6: the frame hands up a card element it built in THIS document (`window.parent.document`)
  // plus its own frame-local, pre-scale box — the host is the only side that knows the board's
  // scale (fit()'s own `--rv-scale`), so it alone converts. One card at a time per board: opening
  // a new one in the same board's host replaces whatever was there.
  window.__rvCardOpen = function (cardEl, box, frameWin) {
    var frame = frameElFor(frameWin)
    var board = frame && frame.closest ? frame.closest('[data-rv="board"]') : null
    var host = board && board.querySelector('[data-rv="cardhost"]')
    if (!host) return
    host.innerHTML = ''
    host.appendChild(cardEl)
    var ir = frame.getBoundingClientRect()
    var scale = frame.offsetWidth ? ir.width / frame.offsetWidth : 1
    var bx = box || { x: 0, y: 0, w: 0, h: 0 }
    var boxRect = {
      left: ir.left + (bx.x || 0) * scale,
      top: ir.top + (bx.y || 0) * scale,
      right: ir.left + ((bx.x || 0) + (bx.w || 0)) * scale,
      bottom: ir.top + ((bx.y || 0) + (bx.h || 0)) * scale,
    }
    placeHostCard(cardEl, boxRect)
  }
  window.__rvCardClose = function (frameWin) {
    var frame = frameElFor(frameWin)
    var board = frame && frame.closest ? frame.closest('[data-rv="board"]') : null
    var host = board && board.querySelector('[data-rv="cardhost"]')
    if (host) host.innerHTML = ''
  }

  // D8: row → box is a direct same-origin call, no postMessage. Selecting a row focuses its
  // board, switches that board's state tab to the row's own data-state (D9) if it differs, then
  // calls __nlSelect(id, {reveal}) on the board's now-visible frame — retried exactly once on the
  // frame's own `load` event if it has not finished loading yet. `select` is the one writer of
  // selection (D8); `reveal` (scroll + pulse) fires only when the caller says the selection did
  // not originate at that box (a rail-row click, keyboard move — never a box click itself).
  function select(id, reveal) {
    selectedId = id
    var label = null
    var state = null
    rows().forEach(function (row) {
      var on = row.getAttribute('data-id') === id
      if (on) { row.setAttribute('data-selected', ''); label = row.getAttribute('data-label'); state = row.getAttribute('data-state') } else row.removeAttribute('data-selected')
    })
    if (label) {
      focusBoard(label)
      if (state) switchTab(label, state)
    } else {
      qa('[data-rv="frame"]').concat(qa('[data-rv="board"]')).forEach(function (el) { el.removeAttribute('data-focus') })
    }
    var row = id ? rowById(id) : null
    if (row && row.focus) row.focus()
    if (reveal && label) {
      var board = q('[data-rv="board"][data-label="' + label + '"]')
      if (board && board.scrollIntoView) board.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    if (label && id) {
      var frame = q('[data-rv="board"][data-label="' + label + '"] [data-rv="frame"]:not([hidden])')
      if (frame) {
        var tried = false
        var callFocus = function () {
          try {
            if (frame.contentWindow && frame.contentWindow.__nlSelect) { frame.contentWindow.__nlSelect(id, { reveal: !!reveal }); tried = true }
          } catch (e) { /* cross-origin or the frame document is not ready yet */ }
        }
        callFocus()
        // If the frame has not loaded yet, retry exactly once on its own `load` event.
        if (!tried) on(frame, 'load', callFocus)
      }
    }
  }

  function move(delta) {
    var list = filter === 'all' ? rows().filter(function (r) { return !r.hidden }) : (filter === 'answered' ? rows().filter(function (r) { return !isOpenRow(r) }) : openRows())
    if (!list.length) return
    var ix = -1
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-id') === selectedId) ix = i
    var next = ix === -1 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, ix + delta))
    select(list[next].getAttribute('data-id'), true)
  }

  // ---- counts (rail, badges, progress, approve) ----------------------------------------------
  function recount() {
    var all = rows()
    var openTotal = 0
    // D2: openScoped (rows carrying a data-label — this journey's own screens) gates the approve
    // button; openTotal (every open row, mock + project) stays what the header total and the
    // rail counts already were. openProjectCount is openTotal's project-scope share, for the
    // rv-projwait line's own recount (D3).
    var openScoped = 0, openProjectCount = 0
    var questions = 0, answered = 0, openNotes = 0
    var openByLabel = {}
    all.forEach(function (row) {
      var open = isOpenRow(row)
      var kind = row.getAttribute('data-kind')
      var label = row.getAttribute('data-label')
      if (open) { openTotal++; if (label) openScoped++; else openProjectCount++ }
      if (kind === 'question') { questions++; if (!open) answered++ } else if (open) openNotes++
      var bucket = label || '__project'
      if (open) openByLabel[bucket] = (openByLabel[bucket] || 0) + 1
    })
    qa('[data-rv="count"]').forEach(function (c) {
      var n = openByLabel[c.getAttribute('data-screen')] || 0
      setText(c, String(n)); if (n) c.removeAttribute('data-zero'); else c.setAttribute('data-zero', '')
    })
    qa('[data-rv="badge"]').forEach(function (b) {
      var n = openByLabel[b.getAttribute('data-label')] || 0
      setText(b, String(n)); if (n) b.removeAttribute('data-zero'); else b.setAttribute('data-zero', '')
    })
    setText(q('[data-rv="open-count"]'), String(openTotal))
    setText(q('[data-rv="strip-count"]'), String(openTotal))
    var progress = q('[data-rv="progress"]')
    if (progress) {
      progress.setAttribute('data-answered', String(answered)); progress.setAttribute('data-total', String(questions))
      setText(q('[data-rv="progress-text"]'), answered + ' of ' + questions + ' answered' +
        (openNotes ? ' · ' + openNotes + ' ' + plural(openNotes, 'note', 'notes') + ' for the session' : ''))
      var fill = q('[data-rv="fill"]')
      if (fill && fill.style) fill.style.width = (questions ? Math.round(answered / questions * 100) : 100) + '%'
    }
    var approve = q('[data-rv="approve"]')
    if (approve) {
      if (openScoped) {
        approve.setAttribute('disabled', '')
        approve.setAttribute('title', openScoped + ' open ' + plural(openScoped, 'item blocks', 'items block') + ' approval')
      } else { approve.removeAttribute('disabled'); approve.removeAttribute('title') }
    }
    // D3: shown only while this journey is otherwise clean and a project item is still open. The
    // server emits the element (hidden) whenever a project item is open, so resolving the last
    // scoped note in-page reveals it without a reload (setHidden/setText are both null-safe).
    var projwait = q('[data-rv="projwait"]')
    if (projwait) {
      var showProjwait = !openScoped && openProjectCount > 0
      setHidden(projwait, !showProjwait)
      if (showProjwait) {
        setText(projwait, openProjectCount + ' whole-product ' + plural(openProjectCount, 'note', 'notes') +
          ' still ' + plural(openProjectCount, 'blocks', 'block') + ' sign-off')
      }
    }
  }

  // ---- answering ------------------------------------------------------------------------------
  function markAnswered(row, verdict, text) {
    row.setAttribute('data-status', 'answered')
    setHidden(row.querySelector('[data-rv="actions"]'), true)
    setHidden(row.querySelector('[data-rv="correct"]'), true)
    var done = row.querySelector('[data-rv="answered"]')
    if (done) { setText(done, verdict === 'no' ? 'You corrected: ' + text : 'You confirmed'); setHidden(done, false) }
    row.setAttribute('data-verdict', verdict)
  }
  function answer(id, verdict, text) {
    var row = rowById(id)
    if (!row || row.getAttribute('data-kind') !== 'question' || !isOpenRow(row)) return Promise.resolve()
    var body = { id: id, verdict: verdict, by: author() }
    if (verdict === 'no') body.text = text
    // Optimistic: the row leaves the Open filter at once; a refusal (409/404, server gone) puts it
    // back exactly as it was — the store, not the page, is the truth on the next GET.
    markAnswered(row, verdict, text)
    var nextOpen = openRows()
    applyFilter(); recount()
    if (nextOpen.length) {
      var after = null
      for (var i = 0; i < nextOpen.length; i++) if (nextOpen[i].getAttribute('data-id') > id && !after) after = nextOpen[i]
      select((after || nextOpen[0]).getAttribute('data-id'))
    } else select(null)
    return post('/__notes/answer', body).catch(function () {
      row.setAttribute('data-status', 'open'); row.removeAttribute('data-verdict')
      setHidden(row.querySelector('[data-rv="actions"]'), false)
      var done = row.querySelector('[data-rv="answered"]'); if (done) { setText(done, ''); setHidden(done, true) }
      applyFilter(); recount(); select(id, true)
    })
  }
  function openCorrection(id) {
    var row = rowById(id)
    if (!row || !isOpenRow(row)) return
    select(id, true)
    var box = row.querySelector('[data-rv="correct"]')
    setHidden(box, false)
    var ta = row.querySelector('[data-rv="correction"]')
    if (ta && ta.focus) ta.focus()
  }
  function saveCorrection(id) {
    var row = rowById(id)
    var ta = row && row.querySelector('[data-rv="correction"]')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return
    answer(id, 'no', text)
  }

  // ---- fold -----------------------------------------------------------------------------------
  function setFolded(v) {
    folded = !!v
    setHidden(q('[data-rv="inspector"]'), folded)
    setHidden(q('[data-rv="strip"]'), !folded)
    if (document.body && document.body.classList) document.body.classList.toggle('rv-folded', folded)
  }

  // ---- composer -------------------------------------------------------------------------------
  // D10: a note always files against the focused screen — renderComposer emits no scope toggle
  // control at all (verified: zero occurrences), so this only ever remembers which screen the
  // composer is currently pinned to.
  function setScopeLabel(label) {
    if (label) scopeLabel = label
  }
  function focusedLabel() {
    var f = q('[data-rv="board"][data-focus]')
    return f ? f.getAttribute('data-label') : null
  }
  function activeStateOf(label) {
    var tabs = qa('[data-rv="board"][data-label="' + label + '"] [data-rv="tab"]')
    for (var i = 0; i < tabs.length; i++) if (tabs[i].getAttribute('aria-selected') === 'true') return tabs[i].getAttribute('data-state')
    return 'happy'
  }
  // Survives exactly one reload, keyed to this journey's own URL so another page cannot claim it.
  var PLACE_KEY = 'rv-place'
  function rememberPlace() {
    var label = focusedLabel()
    if (!label) return
    try { localStorage.setItem(PLACE_KEY, JSON.stringify({ p: location.pathname, label: label })) } catch (e) { /* private mode */ }
  }
  function restorePlace() {
    var raw = null
    try { raw = localStorage.getItem(PLACE_KEY); localStorage.removeItem(PLACE_KEY) } catch (e) { return }
    if (!raw) return
    var v = null
    try { v = JSON.parse(raw) } catch (e) { return }
    if (!v || v.p !== location.pathname || !v.label) return
    var go = function () {
      var b = q('[data-rv="board"][data-label="' + v.label + '"]')
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'start' })
    }
    go()
    // Frames finish loading and re-fit after this, which moves everything below them, so the
    // position is taken again once the page has settled.
    if (window.addEventListener) window.addEventListener('load', go)
  }

  function send() {
    var ta = q('[data-rv="text"]')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return Promise.resolve()
    var label = scopeLabel || focusedLabel()
    var body = label
      ? { scope: 'mock', screen: label, state: (function (s) { return s === 'happy' ? null : s })(activeStateOf(label)), reason: reason, text: text, by: author() }
      : { scope: 'project', screen: null, state: null, reason: reason, text: text, by: author() }
    return post('/__notes/add', body).then(function () {
      if (ta) ta.value = ''
      // The new row exists on disk; the next GET renders it. Reload so the rail, badges, and the
      // approve gate all derive from the store rather than a client-side guess — carrying the
      // reviewer's place across it.
      rememberPlace()
      try { if (location.reload) location.reload() } catch (e) { /* vm harness */ }
    }).catch(function () { /* the composer keeps the text — the store refused or the server is gone */ })
  }

  // ---- frames (D3 scale + A6 floor) ------------------------------------------------------------
  // A board shows the WHOLE screen. A phone mock is usually a fixed device-height app shell whose
  // content region scrolls inside itself, so measuring documentElement.scrollHeight returns the
  // device height forever and the board renders a window with a nested scrollbar in it — the one
  // thing a review surface must never do, because what is below the fold is exactly what nobody
  // reviews. Every inner scroll container is therefore released to its natural height before the
  // measurement, and so is any element pinned to the viewport height. Same-origin only (the
  // served mock), idempotent, and scoped to this page: the atlas thumbnails and the mock itself
  // are untouched.
  function unclip(frame) {
    var d
    try { d = frame.contentDocument } catch (e) { return }
    if (!d || !d.documentElement || d.__rvUnclipped) return
    d.__rvUnclipped = 1
    var vh = parseInt(frame.getAttribute('data-vh') || frame.getAttribute('height'), 10) || 800
    var free = function (el, alsoHeight) {
      el.style.setProperty('overflow', 'visible', 'important')
      el.style.setProperty('max-height', 'none', 'important')
      if (alsoHeight) {
        el.style.setProperty('height', 'auto', 'important')
        el.style.setProperty('min-height', '0', 'important')
        el.style.setProperty('flex', 'none', 'important')
      }
    }
    free(d.documentElement, true)
    if (d.body) free(d.body, true)
    var all
    try { all = d.querySelectorAll('*') } catch (e) { return }
    for (var i = 0; i < all.length; i++) {
      var el = all[i], cs
      try { cs = d.defaultView.getComputedStyle(el) } catch (e) { continue }
      if (!cs) continue
      var scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll' ||
        cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      // A shell pinned to the device height keeps its children from growing even once the
      // scroller inside it is released, so it is freed on the same rule.
      var pinned = Math.abs(parseFloat(cs.height) - vh) < 2
      if (scrolls || pinned) free(el, true)
    }
  }

  function fit(frame) {
    var shot = frame.parentNode
    if (!shot || !shot.style || !frame.style || frame.hidden) return
    var w = parseInt(frame.getAttribute('width'), 10) || 1280
    var vh = parseInt(frame.getAttribute('data-vh') || frame.getAttribute('height'), 10) || 800
    if (!frame.getAttribute('data-vh')) frame.setAttribute('data-vh', String(vh))
    var h = vh
    unclip(frame)
    try {
      var d = frame.contentDocument
      var sh = d && d.documentElement ? d.documentElement.scrollHeight : 0
      if (d && d.body && d.body.scrollHeight > sh) sh = d.body.scrollHeight
      if (sh > h) h = sh
    } catch (e) { /* not loaded yet, or cross-origin */ }
    frame.setAttribute('height', String(h))
    var col = shot.clientWidth || 0
    var s = col ? Math.min(1, col / w) : 1
    shot.style.setProperty('--rv-scale', String(s))
    shot.style.setProperty('--rv-h', String(h))
    // transform-origin is the frame's top-left, so a plain left margin centres the scaled box.
    var slack = col - (w * s)
    frame.style.marginLeft = (slack > 1 ? Math.round(slack / 2) : 0) + 'px'
  }
  function fitAll() { qa('[data-rv="frame"]').forEach(function (f) { if (!f.hidden) fit(f) }) }

  // ---- keyboard -------------------------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    var t = e.target
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
    if (TEXT_TAGS[tag]) {
      // Enter inside a correction box saves it; every other key belongs to the textarea.
      if (e.key === 'Enter' && !e.shiftKey && t.getAttribute && t.getAttribute('data-rv') === 'correction') {
        var row = t.closest ? t.closest('[data-rv="row"]') : null
        if (row) { if (e.preventDefault) e.preventDefault(); saveCorrection(row.getAttribute('data-id')) }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && t.getAttribute && t.getAttribute('data-rv') === 'text') {
        if (e.preventDefault) e.preventDefault(); send()
      }
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case 'j': case 'J': case 'ArrowDown': if (e.preventDefault) e.preventDefault(); move(1); break
      case 'k': case 'K': case 'ArrowUp': if (e.preventDefault) e.preventDefault(); move(-1); break
      case 'y': case 'Y': if (selectedId) answer(selectedId, 'yes'); break
      case 'n': case 'N': if (selectedId) openCorrection(selectedId); break
      // disposed s2 (2026-09-13): mark mode's own Escape exit takes priority over the existing
      // deselect-on-Escape — clearing the row selection AND the board's data-focus underneath an
      // active mark would have stranded `[data-rv="mark-area"]`'s next click with no focused
      // board to re-enter mark mode on.
      case 'Escape': if (markingFrame) { setMarkArea(false) } else { select(null) } break
      case '\\': setFolded(!folded); break
      default: break
    }
  })

  // ---- wiring ---------------------------------------------------------------------------------
  function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn) }
  rows().forEach(function (row) {
    var id = row.getAttribute('data-id')
    on(row.querySelector('[data-rv="yes"]'), 'click', function () { answer(id, 'yes') })
    on(row.querySelector('[data-rv="no"]'), 'click', function () { openCorrection(id) })
    on(row.querySelector('[data-rv="later"]'), 'click', function () { select(id, true); move(1) })
    on(row.querySelector('[data-rv="save"]'), 'click', function () { saveCorrection(id) })
    on(row, 'click', function (e) {
      var t = e && e.target
      var tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
      if (tag === 'BUTTON' || TEXT_TAGS[tag]) return
      select(id, true)
    })
  })
  qa('[data-rv="filter"]').forEach(function (b) { on(b, 'click', function () { filter = b.getAttribute('data-filter'); applyFilter() }) })
  // The rail's Whole project row lists the items that belong to no screen — the ones a per-screen
  // list can never show.
  qa('[data-rv="screen"][data-screen="__project"]').forEach(function (a) {
    on(a, 'click', function (e) {
      if (e && e.preventDefault) e.preventDefault()
      setFolded(false); screenFilter = '__project'; applyFilter()
      var shown = rows().filter(function (r) { return !r.hidden })[0]
      if (shown) select(shown.getAttribute('data-id'))
    })
  })
  on(q('[data-rv="keyhint"]'), 'click', function () {
    var keys = q('[data-rv="keys"]')
    var btn = q('[data-rv="keyhint"]')
    if (!keys || !btn) return
    var show = keys.hidden
    setHidden(keys, !show)
    btn.setAttribute('aria-expanded', show ? 'true' : 'false')
  })
  on(q('[data-rv="fold"]'), 'click', function () { setFolded(true) })
  on(q('[data-rv="strip"]'), 'click', function () { setFolded(false) })
  function closeNote(btn, pathname) {
    on(btn, 'click', function () {
      var row = btn.closest ? btn.closest('[data-rv="row"]') : null
      if (!row) return
      post(pathname, { id: row.getAttribute('data-id'), by: author() }).then(function () {
        rememberPlace()
        try { if (location.reload) location.reload() } catch (e) { /* vm harness */ }
      }).catch(function () { /* the store refused or the server is gone — the row is unchanged */ })
    })
  }
  qa('[data-rv="accept"]').forEach(function (b) { closeNote(b, '/__notes/resolve') })
  qa('[data-rv="reopen"]').forEach(function (b) { closeNote(b, '/__notes/reopen') })

  qa('[data-rv="addnote"]').forEach(function (b) {
    on(b, 'click', function () {
      setFolded(false)
      var label = b.getAttribute('data-label')
      qa('[data-rv="frame"]').concat(qa('[data-rv="board"]')).forEach(function (el) {
        if (el.getAttribute('data-label') === label) el.setAttribute('data-focus', ''); else el.removeAttribute('data-focus')
      })
      setScopeLabel(label)
      var ta = q('[data-rv="text"]')
      if (ta && ta.focus) ta.focus()
    })
  })
  qa('[data-rv="tab"]').forEach(function (tab) {
    on(tab, 'click', function () {
      var board = tab.closest ? tab.closest('[data-rv="board"]') : null
      if (!board) return
      switchTab(board.getAttribute('data-label'), tab.getAttribute('data-state'))
    })
  })

  // D10: the per-board hide-marks eye — flips data-pins/aria-pressed and calls __nlPins on EVERY
  // frame of that board (not only the visible one), so a hidden state's frame does not resurface
  // its marks unhidden when its tab is later selected. Not persisted.
  qa('[data-rv="pins"]').forEach(function (btn) {
    on(btn, 'click', function () {
      var board = btn.closest ? btn.closest('[data-rv="board"]') : null
      if (!board) return
      var next = board.getAttribute('data-pins') === 'off'
      board.setAttribute('data-pins', next ? 'on' : 'off')
      btn.setAttribute('aria-pressed', next ? 'true' : 'false')
      board.querySelectorAll('[data-rv="frame"]').forEach(function (f) {
        try { if (f.contentWindow && f.contentWindow.__nlPins) f.contentWindow.__nlPins(next) } catch (e) { /* not loaded yet */ }
      })
    })
  })

  // D11: the composer's ghost action puts the focused board's visible frame into mark mode — the
  // drag, the draft and the note itself stay entirely inside that frame's own layer.
  //
  // specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D11, disposed s2 (2026-09-13):
  // marksOnly hides the framed mock's own bar entirely, so its "Marking · Esc to stop" text is
  // invisible in every board frame — the review page itself must carry the only signal AND the
  // only path back. `markingFrame` tracks which frame (if any) is currently in mark mode so the
  // button reads as pressed and the same click, or Escape on this page, turns it back off.
  var markingBtn = q('[data-rv="mark-area"]')
  var markingFrame = null
  function setMarkArea(on) {
    if (!on && !markingFrame) return
    if (on) {
      var label = focusedLabel()
      if (!label) return
      var frame = q('[data-rv="board"][data-label="' + label + '"] [data-rv="frame"]:not([hidden])')
      if (!frame) return
      if (markingFrame && markingFrame !== frame) {
        try { if (markingFrame.contentWindow && markingFrame.contentWindow.__nlMark) markingFrame.contentWindow.__nlMark(false) } catch (e) { /* not loaded yet */ }
      }
      markingFrame = frame
      try { if (frame.contentWindow && frame.contentWindow.__nlMark) frame.contentWindow.__nlMark(true) } catch (e) { /* not loaded yet */ }
    } else {
      try { if (markingFrame.contentWindow && markingFrame.contentWindow.__nlMark) markingFrame.contentWindow.__nlMark(false) } catch (e) { /* not loaded yet */ }
      markingFrame = null
    }
    if (markingBtn) markingBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
  }
  on(markingBtn, 'click', function () { setMarkArea(!markingFrame) })
  // PATH BACK: Escape is wired into the existing keydown switch above (it runs first in source
  // order, so `markingFrame` and `setMarkArea` are already defined by the time any key fires) —
  // the framed mock's own Escape handler (notes-layer.browser.js) only ever sees a key dispatched
  // inside ITS document, so the review page needs its own exit rather than relying on that one.

  // D15: "All screens" clears the narrowing so every screen's rows show; scrolling to a board
  // re-applies it (focusBoard/the IntersectionObserver below).
  on(q('[data-rv="allscreens"]'), 'click', function () { screenFilter = null; applyFilter() })
  qa('[data-rv="chip"]').forEach(function (c) {
    on(c, 'click', function () {
      reason = c.getAttribute('data-value')
      qa('[data-rv="chip"]').forEach(function (x) {
        var onChip = x === c
        x.setAttribute('aria-pressed', onChip ? 'true' : 'false')
        if (x.classList) x.classList.toggle('rv-chip-on', onChip)
      })
    })
  })
  on(q('[data-rv="send"]'), 'click', function (e) { if (e && e.preventDefault) e.preventDefault(); send() })
  on(q('[data-rv="composer"]'), 'submit', function (e) { if (e && e.preventDefault) e.preventDefault(); send() })
  on(q('[data-rv="jump"]'), 'change', function (e) {
    var id = e && e.target ? e.target.value : null
    var el = id && document.getElementById ? document.getElementById(id) : null
    if (el && el.scrollIntoView) el.scrollIntoView()
  })
  qa('[data-rv="frame"]').forEach(function (f) {
    on(f, 'load', function () { fit(f); setTimeout(function () { fit(f) }, 250) })
  })
  if (window.addEventListener) {
    var rz
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(fitAll, 150) })
  }

  // ---- the focused board follows the eye ---------------------------------------------------
  // The composer's "This screen" scope names whichever board carries data-focus, and until now
  // that attribute moved ONLY when a rail entry or an inspector row was clicked. Scrolling down
  // to the third screen therefore left the scope pointing at the first, and a note typed there
  // was filed against a screen the reviewer was not looking at — silently, with the wrong name
  // sitting in plain sight beside the toggle. The board with the most of itself on screen now
  // takes the focus. Feature-detected: the vm shim this file is written against (see the header)
  // has no IntersectionObserver, and the observer is the only way to do this without the
  // getBoundingClientRect that discipline forbids.
  function focusBoard(label) {
    if (!label || label === focusedLabel()) return
    qa('[data-rv="frame"]').concat(qa('[data-rv="board"]')).forEach(function (el) {
      if (el.getAttribute('data-label') === label) el.setAttribute('data-focus', '')
      else el.removeAttribute('data-focus')
    })
    setScopeLabel(label)
    screenFilter = label
    applyFilter()
  }
  if (typeof IntersectionObserver === 'function') {
    var seen = {}
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var el = entries[i].target
        var lb = el.getAttribute('data-label')
        if (lb) seen[lb] = entries[i].intersectionRatio
      }
      var best = null, bestRatio = 0
      for (var k in seen) {
        if (Object.prototype.hasOwnProperty.call(seen, k) && seen[k] > bestRatio) { bestRatio = seen[k]; best = k }
      }
      if (best && bestRatio > 0) focusBoard(best)
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] })
    qa('[data-rv="board"]').forEach(function (el) { io.observe(el) })
  }

  // D8: box → row. The framed layer calls this directly (same-origin, no postMessage) on a box
  // click; a no-op on an id that has no row on this page. `select(id)` (reveal omitted, so
  // falsy) is what keeps this a SELECT-without-REVEAL — the box the reviewer just clicked is
  // already under the cursor, so nothing scrolls or pulses back down through `__nlSelect`.
  window.__rvPick = function (id) {
    var row = rowById(id)
    if (!row) return
    if (row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    select(id)
  }

  screenFilter = focusedLabel()
  applyFilter()
  recount()
  setScopeLabel(focusedLabel())
  if (selectedId && rowById(selectedId)) select(selectedId)
  fitAll()
  // The look stop's URL ends in #stop-<id>, whose target lives inside the sticky bar: the browser's
  // fragment jump would scroll the bar down and clip the first artboard's caption. Undo it at load
  // (and again after the load event, which is when the jump lands in some engines).
  if (location.hash && /^#stop-/.test(location.hash) && typeof scrollTo === 'function') {
    scrollTo(0, 0)
    if (window.addEventListener) window.addEventListener('load', function () { scrollTo(0, 0) })
  } else {
    restorePlace()
  }
})()
