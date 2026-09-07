// notes-layer.browser.js — served verbatim as GET /__notes/notes.js by design-atlas.js's
// `serve`, injected before </body> on every served mock page unless the request carries
// ?clean. specs/20260902/10-page-notes-review-loop.md D3; specs/20260905/01-picks-on-the-atlas-page.md D5.
//
// specs/20260906/03-questions-on-the-wireframe.md D5: a note carrying kind:"question" renders as
// a distinct row (id badge, "I assumed <claim>", "I rejected: <rejected>" when present) with
// three controls — Yes/No(+text)/Later — that POST /__notes/answer; an answered question renders
// "You confirmed"/"You corrected: <text>" and no controls. The composer on both scopes gains a
// reason chip row; the mock-page composer alone gains a "Whole project" scope toggle. New
// question-specific chrome carries `nl-q`-prefixed classes so spec/templates/mocks/viewer.css (a
// parallel doctrine change, never touched here) can style it — this file adds no new local CSS
// rule for them.
//
// Anchor = the served page's data-screen-label + the active state (the last-clicked
// data-state-btn, else the first declared, else "default"), or the project scope — never an
// element. Talks only to the /__notes/* endpoints design-atlas.js's serve exposes; every visual
// reads var(--v-*) off /__notes/viewer.css, linked inside this layer's own shadow roots — never
// into the served document — so no rule of it reaches the mock's cascade. No literal color here.
// D5: the endpoint base (and the viewer.css link) is derived from location.pathname by the same
// rule the atlas's own decide script uses (a leading `/p/<name>` mount, else ''), and the page
// declares exactly ONE scope via <meta name="notes-scope"> — `project` (the atlas index) or
// `mock` (a served screen); meta absent falls back to `mock` when a [data-screen-label] root
// exists, else `project`. Declared scope always wins over that fallback (A6: the atlas index
// itself carries [data-screen-label] on every state-frame wrapper, so inferring scope from that
// attribute alone would misread it as a mock page).
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

  var __base = (location.pathname.match(/^\/p\/[^/]+/) || [''])[0]

  // Chrome isolation: every piece of this layer lives in a shadow root — the viewer stylesheet
  // is linked INSIDE each root (its tokens are declared on `:host,:root`, so they resolve
  // there), never into the served document's <head>: viewer.css carries `body{background;color}`
  // and `*{box-sizing}` chrome-page rules that would otherwise cascade over the mock's own (later
  // sheet, equal specificity) and repaint the mock in the light palette whatever its theme. The
  // one document-level rule this layer adds targets only its own `.nl-host` elements. Invariant
  // (tests/mocks/notes-layer-isolation.test.js): a served mock computes the same styles with and
  // without this layer attached.
  var hostStyle = document.createElement('style')
  // D5: while the lightbox is open, the served page's own bar/panel are hidden — the framed
  // mock's own bar (inside the lightbox iframe, a different document) is the only one visible.
  hostStyle.textContent = 'body.lb-open .nl-host{display:none}'
  document.head.appendChild(hostStyle)

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

  // One shadow host per chrome piece (the fixed bar; the in-flow strip or project panel). The
  // host element is a plain block in the mock's flow; everything painted lives behind the
  // shadow boundary with its own copy of the viewer link + the rules above.
  function mount(element) {
    var host = document.createElement('div')
    host.className = 'nl-host'
    var root = host.attachShadow({ mode: 'open' })
    var link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = __base + '/__notes/viewer.css'
    root.appendChild(link)
    root.appendChild(Object.assign(document.createElement('style'), { textContent: css }))
    root.appendChild(element)
    return host
  }

  var rootEl = document.querySelector('[data-screen-label]')
  var screen = rootEl ? rootEl.getAttribute('data-screen-label') : null

  // D5: one declared scope per page — the server stamps <meta name="notes-scope"> on every page
  // it serves; absent meta falls back to mock (a screen root exists) or project (it does not).
  // The declared value always wins, so the atlas index's own [data-screen-label] frame wrappers
  // (A6) never make the layer misclassify it as a mock page.
  var metaEl = document.querySelector('meta[name="notes-scope"]')
  var declaredScope = metaEl ? metaEl.content : null
  var scope = declaredScope === 'project' ? 'project' : declaredScope === 'mock' ? 'mock' : (rootEl ? 'mock' : 'project')

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
    return fetch(__base + '/__notes/' + p, opts).then(function (r) { return r.json() })
  }

  var bar = document.createElement('div'); bar.className = 'nl-bar'
  document.body.appendChild(mount(bar))

  // D5: exactly one panel exists per page, matching the declared scope — a project page never
  // gets an nl-strip (mock notes belong on the screen), a mock page never gets an nl-proj (project
  // notes belong on the atlas).
  var proj = null
  var strip = null
  if (scope === 'project') {
    proj = document.createElement('div'); proj.className = 'nl-proj'
    var projAnchor = rootEl || document.body
    projAnchor.insertAdjacentElement('afterend', mount(proj))
  } else {
    strip = document.createElement('div'); strip.className = 'nl-strip'
    var stripAnchor = rootEl || document.body
    stripAnchor.insertAdjacentElement('afterend', mount(strip))
  }

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

  // D5: the reason chip row shared by both scopes' composers — "Other" is the default until a
  // different chip is clicked.
  var REASONS = [
    { label: 'Missing screen', value: 'missing-screen' },
    { label: 'Wrong direction', value: 'wrong-direction' },
    { label: 'Wrong words', value: 'wrong-words' },
    { label: 'Other', value: 'other' },
  ]

  // `allowProjectToggle` (mock composer only) adds a "This screen | Whole project" scope toggle;
  // `onSave(text, reason, sendAsProject)` is called only when the textarea is non-empty.
  function buildComposer(container, placeholder, allowProjectToggle, onSave) {
    var box = document.createElement('div')
    var reason = 'other'
    var sendAsProject = false

    var chipsRow = document.createElement('div'); chipsRow.className = 'nl-q-chips'
    REASONS.forEach(function (r) {
      var chip = document.createElement('button')
      chip.className = 'nl-btn nl-q-chip' + (r.value === 'other' ? ' active' : '')
      chip.textContent = r.label
      chip.onclick = function () { reason = r.value }
      chipsRow.appendChild(chip)
    })
    box.appendChild(chipsRow)

    if (allowProjectToggle) {
      var toggleRow = document.createElement('div'); toggleRow.className = 'nl-q-scope'
      var thisScreen = document.createElement('button')
      thisScreen.className = 'nl-btn nl-q-scope-btn active'; thisScreen.textContent = 'This screen'
      var wholeProject = document.createElement('button')
      wholeProject.className = 'nl-btn nl-q-scope-btn'; wholeProject.textContent = 'Whole project'
      thisScreen.onclick = function () { sendAsProject = false; thisScreen.className = 'nl-btn nl-q-scope-btn active'; wholeProject.className = 'nl-btn nl-q-scope-btn' }
      wholeProject.onclick = function () { sendAsProject = true; wholeProject.className = 'nl-btn nl-q-scope-btn active'; thisScreen.className = 'nl-btn nl-q-scope-btn' }
      toggleRow.appendChild(thisScreen); toggleRow.appendChild(wholeProject)
      box.appendChild(toggleRow)
    }

    var ta = document.createElement('textarea'); ta.placeholder = placeholder
    var row = document.createElement('div'); row.className = 'nl-row'
    var cancel = document.createElement('button'); cancel.className = 'nl-btn'; cancel.textContent = 'Cancel'
    var save = document.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save'
    cancel.onclick = render
    save.onclick = function () { if (ta.value.trim()) onSave(ta.value.trim(), reason, sendAsProject) }
    row.appendChild(cancel); row.appendChild(save)
    box.appendChild(ta); box.appendChild(row)
    container.appendChild(box)
    if (ta.focus) ta.focus()
  }
  function composeProject() {
    buildComposer(proj, 'Direction-level: what is wrong with the whole set, or where should it go?', false, function (text, reason) {
      api('add', { scope: 'project', screen: null, state: null, text: text, by: author, reason: reason }).then(refresh)
    })
  }
  function composeMock() {
    buildComposer(strip, 'What is wrong with "' + activeState + '", or what should change?', true, function (text, reason, sendAsProject) {
      if (sendAsProject) {
        api('add', { scope: 'project', screen: null, state: null, text: text, by: author, reason: reason }).then(refresh)
      } else {
        api('add', { scope: 'mock', screen: screen, state: activeState, text: text, by: author, reason: reason }).then(refresh)
      }
    })
  }

  // D5: a question row — id badge, "I assumed <claim>", "I rejected: <rejected>" when present,
  // and three controls (Yes/No+text/Later) while open; "You confirmed"/"You corrected: <text>"
  // and no controls once answered.
  function questionRow(n) {
    var d = document.createElement('div')
    d.className = 'n nl-q' + (n.status === 'resolved' ? ' done' : '')
    var idBadge = document.createElement('b'); idBadge.textContent = n.ledgerId || n.id
    var body = document.createElement('span'); body.className = 't nl-q-body'
    var assumed = document.createElement('div'); assumed.textContent = 'I assumed ' + (n.claim != null ? n.claim : n.text)
    body.appendChild(assumed)
    if (n.rejected) {
      var rejected = document.createElement('small'); rejected.textContent = 'I rejected: ' + n.rejected
      body.appendChild(rejected)
    }
    d.appendChild(idBadge); d.appendChild(body)

    if (n.status === 'resolved') {
      var verdict = document.createElement('small'); verdict.className = 'nl-q-verdict'
      verdict.textContent = n.answer && n.answer.verdict === 'no' ? 'You corrected: ' + n.answer.text : 'You confirmed'
      body.appendChild(verdict)
      return d
    }

    var controls = document.createElement('div'); controls.className = 'nl-row nl-q-controls'
    var yesBtn = document.createElement('button'); yesBtn.className = 'nl-btn'; yesBtn.textContent = "Yes, that's right"
    yesBtn.onclick = function () { api('answer', { id: n.id, verdict: 'yes', by: author }).then(refresh) }
    var noBtn = document.createElement('button'); noBtn.className = 'nl-btn'; noBtn.textContent = "No, it's…"
    noBtn.onclick = function () {
      var box = document.createElement('div'); box.className = 'nl-q-correct'
      var ta = document.createElement('textarea'); ta.placeholder = 'What is actually true?'
      var save = document.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save'
      save.onclick = function () {
        if (!ta.value.trim()) return
        api('answer', { id: n.id, verdict: 'no', text: ta.value.trim(), by: author }).then(refresh)
      }
      box.appendChild(ta); box.appendChild(save)
      d.appendChild(box)
      if (ta.focus) ta.focus()
    }
    var laterBtn = document.createElement('button'); laterBtn.className = 'nl-btn'; laterBtn.textContent = 'Later'
    laterBtn.onclick = function () { /* nothing written — the question stays open */ }
    controls.appendChild(yesBtn); controls.appendChild(noBtn); controls.appendChild(laterBtn)
    d.appendChild(controls)
    return d
  }

  function render() {
    var openMock = mockNotes.filter(function (n) { return n.status !== 'resolved' }).length
    var openProj = projectNotes.filter(function (n) { return n.status !== 'resolved' }).length

    bar.innerHTML = ''
    var badge = document.createElement('span')
    badge.textContent = (scope === 'project' ? openProj : openMock) + ' open'
    bar.appendChild(badge)
    if (scope === 'project') {
      var addProjBtn = document.createElement('button'); addProjBtn.className = 'nl-btn primary'
      addProjBtn.textContent = '+ Project note'; addProjBtn.onclick = composeProject
      bar.appendChild(addProjBtn)
    } else {
      var addMockBtn = document.createElement('button'); addMockBtn.className = 'nl-btn primary'
      addMockBtn.textContent = '+ Note on this state'; addMockBtn.onclick = composeMock
      bar.appendChild(addMockBtn)
    }
    var showBtn = document.createElement('button'); showBtn.className = 'nl-btn'
    showBtn.textContent = showResolved ? 'Hide resolved' : 'Show resolved'
    showBtn.onclick = function () { showResolved = !showResolved; render() }
    var authorBtn = document.createElement('button'); authorBtn.className = 'nl-btn'; authorBtn.textContent = author
    authorBtn.onclick = function () {
      var name = (window.prompt('Your name (shown on your notes)', author) || '').trim()
      if (name) { author = name; try { localStorage.setItem('nl-author', author) } catch (e) { /* in-memory only */ } }
      render()
    }
    bar.appendChild(showBtn); bar.appendChild(authorBtn)

    if (proj) {
      proj.innerHTML = ''
      var projHead = document.createElement('h4'); projHead.textContent = 'Project notes (' + openProj + ' open)'
      proj.appendChild(projHead)
      // D5: an answered question stays visible (its own row already reads as settled — "You
      // confirmed"/"You corrected") — only a plain resolved note hides behind "Show resolved".
      projectNotes.filter(function (n) { return n.kind === 'question' || showResolved || n.status !== 'resolved' })
        .forEach(function (n) { proj.appendChild(n.kind === 'question' ? questionRow(n) : noteRow(n)) })
      var projAdd = document.createElement('button'); projAdd.className = 'nl-btn'; projAdd.textContent = '+ Note'
      projAdd.onclick = composeProject
      proj.appendChild(projAdd)
    }

    if (strip) {
      strip.innerHTML = ''
      var stripHead = document.createElement('h4'); stripHead.textContent = 'Notes — ' + activeState
      strip.appendChild(stripHead)
      mockNotes.filter(function (n) { return n.state === activeState && (n.kind === 'question' || showResolved || n.status !== 'resolved') })
        .forEach(function (n) { strip.appendChild(n.kind === 'question' ? questionRow(n) : noteRow(n)) })
      var stripAdd = document.createElement('button'); stripAdd.className = 'nl-btn'; stripAdd.textContent = '+ Note on this state'
      stripAdd.onclick = composeMock
      strip.appendChild(stripAdd)
    }
  }

  // D5: a page fetches only the list its declared scope owns — a mock page never fetches the
  // project-wide list (screen=*), a project page never fetches a per-screen list.
  function refresh() {
    if (scope === 'project') {
      return fetch(__base + '/__notes/list?screen=*').then(function (r) { return r.json() }).then(function (list) {
        projectNotes = list || []
        render()
      })
    }
    return fetch(__base + '/__notes/list?screen=' + encodeURIComponent(screen || '')).then(function (r) { return r.json() }).then(function (list) {
      mockNotes = list || []
      render()
    })
  }
  refresh()
})()
