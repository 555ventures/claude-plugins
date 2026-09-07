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
  var folded = false
  var initial = q('[data-rv="row"][data-selected]')
  var selectedId = initial ? initial.getAttribute('data-id') : null
  var scopeMode = 'project'
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

  function applyFilter() {
    var anyOpen = false
    rows().forEach(function (row) {
      var open = isOpenRow(row)
      if (open) anyOpen = true
      var show = filter === 'all' || (filter === 'open' && open) || (filter === 'answered' && !open)
      setHidden(row, !show)
    })
    qa('[data-rv="filter"]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-filter') === filter ? 'true' : 'false') })
    setHidden(q('[data-rv="empty"]'), !(filter === 'open' && !anyOpen))
  }

  function select(id) {
    selectedId = id
    var label = null
    rows().forEach(function (row) {
      var on = row.getAttribute('data-id') === id
      if (on) { row.setAttribute('data-selected', ''); label = row.getAttribute('data-label') } else row.removeAttribute('data-selected')
    })
    qa('[data-rv="frame"]').concat(qa('[data-rv="board"]')).forEach(function (el) {
      if (label && el.getAttribute('data-label') === label) el.setAttribute('data-focus', '')
      else el.removeAttribute('data-focus')
    })
    var row = id ? rowById(id) : null
    if (row && row.focus) row.focus()
  }

  function move(delta) {
    var list = filter === 'all' ? rows().filter(function (r) { return !r.hidden }) : (filter === 'answered' ? rows().filter(function (r) { return !isOpenRow(r) }) : openRows())
    if (!list.length) return
    var ix = -1
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute('data-id') === selectedId) ix = i
    var next = ix === -1 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, ix + delta))
    select(list[next].getAttribute('data-id'))
  }

  // ---- counts (rail, badges, progress, approve) ----------------------------------------------
  function recount() {
    var all = rows()
    var openTotal = 0
    var questions = 0, answered = 0, openNotes = 0
    var openByLabel = {}
    all.forEach(function (row) {
      var open = isOpenRow(row)
      var kind = row.getAttribute('data-kind')
      var label = row.getAttribute('data-label')
      if (open) openTotal++
      if (kind === 'question') { questions++; if (!open) answered++ } else if (open) openNotes++
      if (open && label) openByLabel[label] = (openByLabel[label] || 0) + 1
    })
    qa('[data-rv="count"]').forEach(function (c) {
      var n = openByLabel[c.getAttribute('data-screen')] || 0
      setText(c, String(n)); if (n) c.removeAttribute('data-zero'); else c.setAttribute('data-zero', '')
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
      if (openTotal) {
        approve.setAttribute('disabled', '')
        approve.setAttribute('title', openTotal + ' open ' + plural(openTotal, 'item blocks', 'items block') + ' approval')
      } else { approve.removeAttribute('disabled'); approve.removeAttribute('title') }
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
      applyFilter(); recount(); select(id)
    })
  }
  function openCorrection(id) {
    var row = rowById(id)
    if (!row || !isOpenRow(row)) return
    select(id)
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
  function setScope(mode, label) {
    scopeMode = mode
    if (label) scopeLabel = label
    qa('[data-rv="scope"]').forEach(function (b) {
      var on = b.getAttribute('data-value') === mode
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
      if (b.classList) b.classList.toggle('rv-scope-on', on)
    })
    setText(q('[data-rv="scope-label"]'), mode === 'screen' && scopeLabel ? scopeLabel : '')
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
  function send() {
    var ta = q('[data-rv="text"]')
    var text = ta ? String(ta.value || '').trim() : ''
    if (!text) return Promise.resolve()
    var label = scopeMode === 'screen' ? (scopeLabel || focusedLabel()) : null
    var body = label
      ? { scope: 'mock', screen: label, state: (function (s) { return s === 'happy' ? null : s })(activeStateOf(label)), reason: reason, text: text, by: author() }
      : { scope: 'project', screen: null, state: null, reason: reason, text: text, by: author() }
    return post('/__notes/add', body).then(function () {
      if (ta) ta.value = ''
      // The new row exists on disk; the next GET renders it. Reload so the rail, badges, and the
      // approve gate all derive from the store rather than a client-side guess.
      try { if (location.reload) location.reload() } catch (e) { /* vm harness */ }
    }).catch(function () { /* the composer keeps the text — the store refused or the server is gone */ })
  }

  // ---- frames (D3 scale + A6 floor) ------------------------------------------------------------
  function fit(frame) {
    var shot = frame.parentNode
    if (!shot || !shot.style || !frame.style || frame.hidden) return
    var w = parseInt(frame.getAttribute('width'), 10) || 1280
    var vh = parseInt(frame.getAttribute('data-vh') || frame.getAttribute('height'), 10) || 800
    if (!frame.getAttribute('data-vh')) frame.setAttribute('data-vh', String(vh))
    var h = vh
    try {
      var d = frame.contentDocument
      var sh = d && d.documentElement ? d.documentElement.scrollHeight : 0
      if (sh > h) h = sh
    } catch (e) { /* not loaded yet, or cross-origin */ }
    frame.setAttribute('height', String(h))
    var col = shot.clientWidth || 0
    var s = col ? Math.min(1, col / w) : 1
    shot.style.setProperty('--rv-scale', String(s))
    shot.style.setProperty('--rv-h', String(h))
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
      case 'Escape': select(null); break
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
    on(row.querySelector('[data-rv="later"]'), 'click', function () { select(id); move(1) })
    on(row.querySelector('[data-rv="save"]'), 'click', function () { saveCorrection(id) })
    on(row, 'click', function (e) {
      var t = e && e.target
      var tag = t && t.tagName ? String(t.tagName).toUpperCase() : ''
      if (tag === 'BUTTON' || TEXT_TAGS[tag]) return
      select(id)
    })
  })
  qa('[data-rv="filter"]').forEach(function (b) { on(b, 'click', function () { filter = b.getAttribute('data-filter'); applyFilter() }) })
  on(q('[data-rv="fold"]'), 'click', function () { setFolded(true) })
  on(q('[data-rv="strip"]'), 'click', function () { setFolded(false) })
  qa('[data-rv="badge"]').forEach(function (b) {
    on(b, 'click', function () {
      setFolded(false)
      var label = b.getAttribute('data-label')
      var first = openRows().filter(function (r) { return r.getAttribute('data-label') === label })[0]
      if (first) select(first.getAttribute('data-id'))
      else {
        var any = rows().filter(function (r) { return r.getAttribute('data-label') === label })[0]
        if (any) { filter = 'all'; applyFilter(); select(any.getAttribute('data-id')) }
      }
    })
  })
  qa('[data-rv="addnote"]').forEach(function (b) {
    on(b, 'click', function () {
      setFolded(false)
      var label = b.getAttribute('data-label')
      qa('[data-rv="frame"]').concat(qa('[data-rv="board"]')).forEach(function (el) {
        if (el.getAttribute('data-label') === label) el.setAttribute('data-focus', ''); else el.removeAttribute('data-focus')
      })
      setScope('screen', label)
      var ta = q('[data-rv="text"]')
      if (ta && ta.focus) ta.focus()
    })
  })
  qa('[data-rv="tab"]').forEach(function (tab) {
    on(tab, 'click', function () {
      var board = tab.closest ? tab.closest('[data-rv="board"]') : null
      if (!board) return
      qa('[data-rv="board"][data-label="' + board.getAttribute('data-label') + '"] [data-rv="tab"]').forEach(function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false')
      })
      var state = tab.getAttribute('data-state')
      board.querySelectorAll('[data-rv="frame"]').forEach(function (f) {
        var show = f.getAttribute('data-state') === state
        setHidden(f, !show)
        if (show) { f.setAttribute('loading', 'eager'); fit(f) }
      })
    })
  })
  qa('[data-rv="scope"]').forEach(function (b) { on(b, 'click', function () { setScope(b.getAttribute('data-value'), b.getAttribute('data-value') === 'screen' ? (scopeLabel || focusedLabel()) : null) }) })
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

  applyFilter()
  recount()
  if (selectedId && rowById(selectedId)) select(selectedId)
  fitAll()
})()
