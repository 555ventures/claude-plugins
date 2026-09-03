// notes-layer.browser.js — served verbatim as GET /__notes/notes.js by design-atlas.js's
// `serve`, injected before </body> on every served mock page unless the request carries
// ?clean. specs/20260902/10-page-notes-review-loop.md D3.
//
// Anchor = the served page's data-screen-label + the active state (the last-clicked
// data-state-btn, else the first declared, else "default"), or the project scope — never an
// element. Talks only to the /__notes/* endpoints design-atlas.js's serve exposes; every visual
// reads var(--v-*) off /__notes/viewer.css (linked here once) — no literal color in this file.
//
// Does NOT: resolve a note (only POST /__notes/resolve does that — this file's own Resolve
// button is its one caller; address/reply are driver-only and unreachable from here), touch mock
// markup, or run at all when ?clean is present (screenshot capture stays clean).
//
// This is a browser script, not a Node module — no `require`, no `module.exports`, evaluated by
// the page it is injected into.
'use strict'
;(function () {
  if (new URLSearchParams(location.search).has('clean')) return

  var link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/__notes/viewer.css'
  document.head.appendChild(link)

  var css =
    '.nl-bar,.nl-strip,.nl-proj{font:14px/1.45 var(--v-font);color:var(--v-fg)}' +
    '.nl-bar{position:fixed;top:12px;right:12px;z-index:9999;display:flex;gap:8px;align-items:center;' +
    'background:var(--v-bg);border:1px solid var(--v-border);border-radius:var(--v-radius);' +
    'padding:6px 10px;box-shadow:var(--v-shadow)}' +
    '.nl-btn{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:var(--v-radius);' +
    'border:1px solid var(--v-border);background:var(--v-bg);color:var(--v-fg);cursor:pointer;' +
    'font:500 12px/1 var(--v-font)}' +
    '.nl-btn.primary{background:var(--v-primary);color:var(--v-primary-fg);border-color:var(--v-primary)}' +
    '.nl-strip,.nl-proj{margin:8px 0;border:1px solid var(--v-border);border-radius:var(--v-radius);' +
    'background:var(--v-bg);padding:8px 10px}' +
    '.nl-strip h4,.nl-proj h4{margin:0 0 6px;font-size:13px;font-weight:600;color:var(--v-fg)}' +
    '.nl-strip .n,.nl-proj .n{border-top:1px solid var(--v-border);padding:6px 0;display:flex;' +
    'align-items:flex-start;gap:8px}' +
    '.nl-strip .n:first-of-type,.nl-proj .n:first-of-type{border-top:0}' +
    '.nl-strip .n.done,.nl-proj .n.done{color:var(--v-muted);text-decoration:line-through}' +
    '.nl-strip .n b,.nl-proj .n b{font-size:11px;font-weight:600;color:var(--v-muted);' +
    'border:1px solid var(--v-border);border-radius:999px;padding:1px 6px;flex:none}' +
    '.nl-strip .n .t,.nl-proj .n .t{flex:1}' +
    '.nl-strip .n small,.nl-proj .n small{display:block;color:var(--v-muted);font-size:12px}' +
    '.nl-strip textarea,.nl-proj textarea{width:100%;box-sizing:border-box;min-height:64px;' +
    'font:14px/1.45 var(--v-font);color:var(--v-fg);border:1px solid var(--v-border);' +
    'border-radius:var(--v-radius);padding:6px 8px;margin:6px 0;resize:vertical}' +
    '.nl-row{display:flex;gap:6px;justify-content:flex-end}'
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))

  var rootEl = document.querySelector('[data-screen-label]')
  var screen = rootEl ? rootEl.getAttribute('data-screen-label') : null
  var stateButtons = Array.prototype.slice.call(document.querySelectorAll('[data-state-btn]'))
  var activeState = stateButtons.length ? stateButtons[0].getAttribute('data-state-btn') : 'default'
  stateButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeState = btn.getAttribute('data-state-btn') || activeState
      render()
    })
  })

  // Author identity: asked once per browser, kept in localStorage under nl-author; falls back
  // to an in-memory ask (never a hard-coded name) if localStorage is unavailable — A3.
  var author = null
  function getAuthor() {
    var stored = null
    try { stored = localStorage.getItem('nl-author') } catch (e) { stored = null }
    if (stored) return stored
    var name = (window.prompt('Your name (shown on your notes)') || '').trim() || 'anonymous'
    try { localStorage.setItem('nl-author', name) } catch (e) { /* in-memory only this session */ }
    return name
  }
  author = getAuthor()

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] })
  }
  function api(p, body) {
    var opts = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined
    return fetch('/__notes/' + p, opts).then(function (r) { return r.json() })
  }

  var bar = document.createElement('div'); bar.className = 'nl-bar'
  var proj = document.createElement('div'); proj.className = 'nl-proj'
  var strip = document.createElement('div'); strip.className = 'nl-strip'
  document.body.appendChild(bar)
  var anchor = rootEl || document.body
  anchor.insertAdjacentElement('afterend', proj)
  proj.insertAdjacentElement('afterend', strip)

  var showResolved = false
  var mockNotes = []
  var projectNotes = []

  function noteRow(n) {
    var d = document.createElement('div')
    d.className = 'n' + (n.status === 'resolved' ? ' done' : '')
    var idBadge = document.createElement('b'); idBadge.textContent = n.id
    var t = document.createElement('span'); t.className = 't'
    t.innerHTML = esc(n.text) + '<small>' + esc(n.by) + (n.status === 'resolved' ? ' · resolved by ' + esc(n.resolvedBy) : '') + '</small>'
    d.appendChild(idBadge); d.appendChild(t)
    if (n.status !== 'resolved') {
      var resolveBtn = document.createElement('button')
      resolveBtn.className = 'nl-btn'; resolveBtn.textContent = 'Resolve'
      resolveBtn.onclick = function () { api('resolve', { id: n.id, by: author }).then(refresh) }
      d.appendChild(resolveBtn)
    }
    return d
  }

  function compose(container, placeholder, onSave) {
    var box = document.createElement('div')
    var ta = document.createElement('textarea'); ta.placeholder = placeholder
    var row = document.createElement('div'); row.className = 'nl-row'
    var cancel = document.createElement('button'); cancel.className = 'nl-btn'; cancel.textContent = 'Cancel'
    var save = document.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save'
    cancel.onclick = render
    save.onclick = function () { if (ta.value.trim()) onSave(ta.value.trim()) }
    row.appendChild(cancel); row.appendChild(save)
    box.appendChild(ta); box.appendChild(row)
    container.appendChild(box)
    ta.focus()
  }
  function composeProject() {
    compose(proj, 'Direction-level: what is wrong with the whole set, or where should it go?', function (text) {
      api('add', { scope: 'project', screen: null, state: null, text: text, by: author }).then(refresh)
    })
  }
  function composeMock() {
    compose(strip, 'What is wrong with "' + activeState + '", or what should change?', function (text) {
      api('add', { scope: 'mock', screen: screen, state: activeState, text: text, by: author }).then(refresh)
    })
  }

  function render() {
    var openMock = mockNotes.filter(function (n) { return n.status !== 'resolved' }).length
    var openProj = projectNotes.filter(function (n) { return n.status !== 'resolved' }).length

    bar.innerHTML = ''
    var badge = document.createElement('span'); badge.textContent = (openMock + openProj) + ' open'
    var addProjBtn = document.createElement('button'); addProjBtn.className = 'nl-btn primary'
    addProjBtn.textContent = '+ Project note'; addProjBtn.onclick = composeProject
    var showBtn = document.createElement('button'); showBtn.className = 'nl-btn'
    showBtn.textContent = showResolved ? 'Hide resolved' : 'Show resolved'
    showBtn.onclick = function () { showResolved = !showResolved; render() }
    var authorBtn = document.createElement('button'); authorBtn.className = 'nl-btn'; authorBtn.textContent = author
    authorBtn.onclick = function () {
      var name = (window.prompt('Your name (shown on your notes)', author) || '').trim()
      if (name) { author = name; try { localStorage.setItem('nl-author', author) } catch (e) { /* in-memory only */ } }
      render()
    }
    bar.appendChild(badge); bar.appendChild(addProjBtn); bar.appendChild(showBtn); bar.appendChild(authorBtn)

    proj.innerHTML = ''
    var projHead = document.createElement('h4'); projHead.textContent = 'Project notes (' + openProj + ' open)'
    proj.appendChild(projHead)
    projectNotes.filter(function (n) { return showResolved || n.status !== 'resolved' }).forEach(function (n) { proj.appendChild(noteRow(n)) })
    var projAdd = document.createElement('button'); projAdd.className = 'nl-btn'; projAdd.textContent = '+ Note'
    projAdd.onclick = composeProject
    proj.appendChild(projAdd)

    strip.innerHTML = ''
    var stripHead = document.createElement('h4'); stripHead.textContent = 'Notes — ' + activeState
    strip.appendChild(stripHead)
    mockNotes.filter(function (n) { return n.state === activeState && (showResolved || n.status !== 'resolved') })
      .forEach(function (n) { strip.appendChild(noteRow(n)) })
    var stripAdd = document.createElement('button'); stripAdd.className = 'nl-btn'; stripAdd.textContent = '+ Note on this state'
    stripAdd.onclick = composeMock
    strip.appendChild(stripAdd)
  }

  function refresh() {
    return Promise.all([
      fetch('/__notes/list?screen=' + encodeURIComponent(screen || '')).then(function (r) { return r.json() }),
      fetch('/__notes/list?screen=*').then(function (r) { return r.json() }),
    ]).then(function (results) {
      mockNotes = results[0] || []
      projectNotes = results[1] || []
      render()
    })
  }
  refresh()
})()
